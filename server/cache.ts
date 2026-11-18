// Two-level cache (memory + JSON on disk). TTL follows each dataset's natural update
// frequency. If a refresh fails we serve the last good copy flagged `stale`, never a guess.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './db.js';
import { USER_AGENT } from './config.js';
import { netFetch } from './net.js';
import { publish } from './live.js';

interface Entry<T> { fetchedAt: string; payload: T; }
const mem = new Map<string, Entry<any>>();
const inflight = new Map<string, Promise<any>>();
/** Fingerprint of each key's latest payload: open pages are told only when the figures change. */
const sigs = new Map<string, string>();
/** Fetches that just failed. Asking again right away (every open page refreshing, a profile with
 *  twenty sections) would only hammer a provider that is down, so the failure stands for a moment:
 *  a quarter of the data's lifetime, at most 30 seconds. */
const failed = new Map<string, { until: number; err: unknown }>();
const failMemoryMs = (ttlSec: number) => Math.min(30_000, ttlSec * 250);

const file = (key: string) => path.join(DATA_DIR, 'cache', crypto.createHash('sha1').update(key).digest('hex') + '.json');

export interface Cached<T> { data: T; fetchedAt: string; stale: boolean; }

/** Per-provider health, keyed by the cache-key prefix ("wb", "yahoo", "wp"…). Shown on the Data page. */
export interface ProviderHealth { provider: string; ttlSec: number; fetches: number; failures: number; staleServes: number; lastOk?: string; lastError?: string; lastErrorAt?: string; lastStaleAt?: string; oldestStaleCopy?: string; }
const health = new Map<string, ProviderHealth>();
const hp = (key: string, ttlSec: number) => {
  const provider = key.split(':')[0];
  const h = health.get(provider) || health.set(provider, { provider, ttlSec, fetches: 0, failures: 0, staleServes: 0 }).get(provider)!;
  h.ttlSec = Math.max(h.ttlSec, ttlSec);
  return h;
};
export function providerHealth() { return [...health.values()]; }

// Serve-then-refresh: for data fetched when someone opens a page, an expired copy younger than
// TTL × (1 + grace) is returned at once (with its real retrieval time) while a fresh copy is
// fetched in the background — so a page never waits on a slow provider for data it already has.
// Prefixes not listed (background loaders: Congress, Wikidata, Wikipedia elections, news) always
// wait for a fresh copy, so election-night results are never a cycle behind.
const GRACE: Record<string, number> = {
  wb: 2, comtrade: 1, treasury: 1, yahoo: 2, spark: 2, sec: 2, gnews: 1, gdelt: 1, bis: 1, fred: 1, oecd: 1, ecb: 1,
  curve: 1, imf: 1, consensus: 1, pm: 1, 'wp:positions': 1,
};
const graceFor = (key: string) => GRACE[key.split(':').slice(0, 2).join(':')] ?? GRACE[key.split(':')[0]] ?? 0;

export async function cached<T>(key: string, ttlSec: number, fetcher: () => Promise<T>, opts: { /** 0: once expired, wait for the fresh copy (no serve-then-refresh). */ grace?: number } = {}): Promise<Cached<T>> {
  let entry = mem.get(key) as Entry<T> | undefined;
  if (!entry) {
    // Async read: a large cached file must not block other requests.
    try { entry = JSON.parse(await fs.promises.readFile(file(key), 'utf8')); if (entry) mem.set(key, entry); } catch { /* no disk copy */ }
  }
  const age = entry ? Date.now() - Date.parse(entry.fetchedAt) : Infinity;
  if (entry && age < ttlSec * 1000) return { data: entry.payload, fetchedAt: entry.fetchedAt, stale: false };

  const start = () => {
    if (!inflight.has(key)) {
      inflight.set(key, (async () => {
        const h = hp(key, ttlSec);
        h.fetches++;
        try {
          const payload = await fetcher();
          const e: Entry<T> = { fetchedAt: new Date().toISOString(), payload };
          const prev = mem.get(key);
          mem.set(key, e);
          const body = JSON.stringify(payload) ?? 'null';
          fs.writeFile(file(key), `{"fetchedAt":${JSON.stringify(e.fetchedAt)},"payload":${body}}`, () => {});
          h.lastOk = e.fetchedAt;
          failed.delete(key);
          // Tell open pages (server/live.ts) when figures they may be showing changed: a copy held
          // before now reads differently. A first fetch is not news to anyone (whoever asked gets it
          // in the answer), and neither is the same data with a newer retrieval time.
          const sig = crypto.createHash('sha1').update(body).digest('hex');
          const before = sigs.get(key) ?? (prev ? crypto.createHash('sha1').update(JSON.stringify(prev.payload) ?? 'null').digest('hex') : undefined);
          sigs.set(key, sig);
          if (before !== undefined && sig !== before) publish(key.split(':')[0]);
          return e;
        } catch (err: any) {
          h.failures++; h.lastError = String(err?.message || err).slice(0, 200); h.lastErrorAt = new Date().toISOString();
          const ms = failMemoryMs(ttlSec);
          if (ms > 0) { failed.set(key, { until: Date.now() + ms, err }); if (failed.size > 5000) { const now = Date.now(); for (const [k, f] of failed) if (f.until < now) failed.delete(k); } }
          throw err;
        }
      })().finally(() => inflight.delete(key)));
    }
    return inflight.get(key)! as Promise<Entry<T>>;
  };

  const serveStale = (e: Entry<T>): Cached<T> => {
    const h = hp(key, ttlSec);
    h.staleServes++; h.lastStaleAt = new Date().toISOString();
    if (!h.oldestStaleCopy || e.fetchedAt < h.oldestStaleCopy) h.oldestStaleCopy = e.fetchedAt;
    return { data: e.payload, fetchedAt: e.fetchedAt, stale: true };
  };
  const inGrace = !!entry && age < ttlSec * (1 + (opts.grace ?? graceFor(key))) * 1000;
  // The last fetch failed moments ago: answer the same way without asking the provider again.
  const f = failed.get(key);
  if (f && !inflight.has(key)) {
    if (f.until > Date.now()) {
      if (entry) return inGrace ? { data: entry.payload, fetchedAt: entry.fetchedAt, stale: false } : serveStale(entry);
      throw f.err;
    }
    failed.delete(key);
  }
  if (entry && inGrace) {
    start().catch(() => { /* recorded in provider health; the copy below stays in use */ });
    return { data: entry.payload, fetchedAt: entry.fetchedAt, stale: false };
  }
  try {
    const e = await start();
    return { data: e.payload, fetchedAt: e.fetchedAt, stale: false };
  } catch (err) {
    if (entry) return serveStale(entry);
    throw err;
  }
}
/** For tests: drop the in-memory copy of a key, so the next call reads the disk copy again. */
export const _test = { forget: (key: string) => { mem.delete(key); sigs.delete(key); failed.delete(key); } };
/** Forget remembered failures (tests, and "run now" on the Data page: a person asked to try again). */
export function retryFailedNow(prefix = '') { for (const k of [...failed.keys()]) if (k.startsWith(prefix)) failed.delete(k); }

/** Keep the in-memory cache bounded: drop entries not needed for 2 days (disk copies remain). */
setInterval(() => {
  const cutoff = Date.now() - 2 * 86400_000;
  for (const [k, e] of mem) if (Date.parse(e.fetchedAt) < cutoff) mem.delete(k);
}, 3600_000).unref();

export async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = 20000) {
  const res = await netFetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, timeoutMs });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}: ${text.slice(0, 160)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Non-JSON response from ${new URL(url).host}: ${text.slice(0, 160)}`); }
}

export async function fetchText(url: string, headers: Record<string, string> = {}, timeoutMs = 20000) {
  const res = await netFetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, timeoutMs });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.text();
}

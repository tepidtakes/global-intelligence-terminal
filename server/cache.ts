// Two-level cache (memory + JSON on disk). TTL follows each dataset's natural update
// frequency. If a refresh fails we serve the last good copy flagged `stale`, never a guess.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './db.js';
import { USER_AGENT } from './config.js';

interface Entry<T> { fetchedAt: string; payload: T; }
const mem = new Map<string, Entry<any>>();
const inflight = new Map<string, Promise<any>>();

const file = (key: string) => path.join(DATA_DIR, 'cache', crypto.createHash('sha1').update(key).digest('hex') + '.json');

export interface Cached<T> { data: T; fetchedAt: string; stale: boolean; }

export async function cached<T>(key: string, ttlSec: number, fetcher: () => Promise<T>): Promise<Cached<T>> {
  let entry = mem.get(key) as Entry<T> | undefined;
  if (!entry) {
    try { entry = JSON.parse(fs.readFileSync(file(key), 'utf8')); if (entry) mem.set(key, entry); } catch { /* no disk copy */ }
  }
  const fresh = entry && Date.now() - Date.parse(entry.fetchedAt) < ttlSec * 1000;
  if (entry && fresh) return { data: entry.payload, fetchedAt: entry.fetchedAt, stale: false };

  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      const payload = await fetcher();
      const e: Entry<T> = { fetchedAt: new Date().toISOString(), payload };
      mem.set(key, e);
      fs.writeFile(file(key), JSON.stringify(e), () => {});
      return e;
    })().finally(() => inflight.delete(key)));
  }
  try {
    const e = await inflight.get(key)!;
    return { data: e.payload, fetchedAt: e.fetchedAt, stale: false };
  } catch (err) {
    if (entry) return { data: entry.payload, fetchedAt: entry.fetchedAt, stale: true };
    throw err;
  }
}

export async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = 20000) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}: ${text.slice(0, 160)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Non-JSON response from ${new URL(url).host}: ${text.slice(0, 160)}`); }
}

export async function fetchText(url: string, headers: Record<string, string> = {}, timeoutMs = 20000) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.text();
}

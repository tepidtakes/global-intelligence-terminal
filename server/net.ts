// One gate for every outbound request, per host, shared by every module that calls that host:
//   • at most N requests in flight and a minimum gap between request starts (polite to rate-limited
//     services such as Wikidata, UN Comtrade and the SEC, however many loaders run at once);
//   • retries for 429/502/503/504 and dropped connections, honouring Retry-After, else exponential
//     backoff with jitter. A Retry-After longer than `maxRetryAfterMs` is not waited out inside the
//     request: the caller gets the answer and the host is skipped until then. Timeouts, refused
//     connections and unknown host names are not retried;
//   • a circuit breaker: after `failThreshold` consecutive failures the host is skipped (requests fail
//     at once) for a cool-down that doubles up to `maxCoolDownMs`; then a single trial request
//     decides whether it is back. Answers such as 400 or 404 are not outages and never trip it.
// Failures carry a readable reason ("api.worldbank.org: host name not found") instead of "fetch failed".

export interface HostPolicy { concurrency: number; minGapMs: number; retries: number; failThreshold: number; coolDownMs: number; maxCoolDownMs: number; maxRetryAfterMs: number; }
const DEFAULT: HostPolicy = { concurrency: 6, minGapMs: 0, retries: 2, failThreshold: 5, coolDownMs: 60_000, maxCoolDownMs: 15 * 60_000, maxRetryAfterMs: 60_000 };
const POLICIES: Record<string, Partial<HostPolicy>> = {
  'query.wikidata.org': { concurrency: 1, minGapMs: 400 },
  'comtradeapi.un.org': { concurrency: 1, minGapMs: 1200 },
  'www.sec.gov': { concurrency: 4, minGapMs: 110 }, 'data.sec.gov': { concurrency: 4, minGapMs: 110 },
  'en.wikipedia.org': { concurrency: 4, minGapMs: 50 },
  'news.google.com': { concurrency: 2, minGapMs: 300 },
  'api.census.gov': { concurrency: 2 }, 'www.federalregister.gov': { concurrency: 2 },
  'api.worldbank.org': { concurrency: 4 }, 'www.imf.org': { concurrency: 3 },
  'query1.finance.yahoo.com': { concurrency: 4 }, 'query2.finance.yahoo.com': { concurrency: 4 },
};

interface Gate {
  host: string; policy: HostPolicy; active: number; queue: (() => void)[]; lastStart: number;
  failures: number; openUntil: number; openReason?: string; coolDown: number; trial: boolean;
  stats: { requests: number; ok: number; failed: number; retries: number; fastFails: number; totalMs: number; lastError?: string; lastErrorAt?: string; lastOkAt?: string };
}
const gates = new Map<string, Gate>();
const policyFor = (host: string): HostPolicy => ({ ...DEFAULT, ...(POLICIES[host] || {}) });
function gate(host: string) {
  let g = gates.get(host);
  if (!g) { const policy = policyFor(host); g = { host, policy, active: 0, queue: [], lastStart: 0, failures: 0, openUntil: 0, coolDown: policy.coolDownMs, trial: false, stats: { requests: 0, ok: 0, failed: 0, retries: 0, fastFails: 0, totalMs: 0 } }; gates.set(host, g); }
  return g;
}
/** Change a host's policy (configuration and tests). */
export function setHostPolicy(host: string, p: Partial<HostPolicy>) { POLICIES[host] = { ...(POLICIES[host] || {}), ...p }; const g = gates.get(host); if (g) { g.policy = policyFor(host); g.coolDown = g.policy.coolDownMs; } }
export function resetHosts() { gates.clear(); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function acquire(g: Gate) {
  // A released slot is handed straight to the next waiter, so the limit is never exceeded.
  if (g.active < g.policy.concurrency) g.active++;
  else await new Promise<void>((r) => g.queue.push(r));
  const now = Date.now(); const startAt = Math.max(now, g.lastStart + g.policy.minGapMs);
  g.lastStart = startAt;
  if (startAt > now) await sleep(startAt - now);
}
function release(g: Gate) { const next = g.queue.shift(); if (next) next(); else g.active--; }

export class NetError extends Error {
  constructor(message: string, readonly kind: 'circuit' | 'timeout' | 'network' | 'http', readonly status?: number) { super(message); this.name = 'NetError'; }
}
/** Lets a request through, or fails it at once while the host is skipped. True when this request is
 *  the single trial after a cool-down. */
function admit(g: Gate): boolean {
  if (!g.openUntil) return false;
  const now = Date.now();
  if (now < g.openUntil) {
    g.stats.fastFails++;
    throw new NetError(`${g.host} ${g.openReason || 'is not responding'} — skipped until ${new Date(g.openUntil).toISOString().slice(11, 19)} UTC`, 'circuit');
  }
  if (g.trial) { g.stats.fastFails++; throw new NetError(`${g.host} ${g.openReason || 'is not responding'} — being tested again, try shortly`, 'circuit'); }
  g.trial = true; // half-open: this request decides
  return true;
}
const fmtWait = (ms: number) => (ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms)} ms`);
function noteError(g: Gate, reason: string) { g.stats.failed++; g.stats.lastError = reason.slice(0, 200); g.stats.lastErrorAt = new Date().toISOString(); }
function succeeded(g: Gate) { g.failures = 0; g.openUntil = 0; g.openReason = undefined; g.trial = false; g.coolDown = g.policy.coolDownMs; g.stats.ok++; g.stats.lastOkAt = new Date().toISOString(); }
function failed(g: Gate, reason: string) {
  g.failures++; noteError(g, reason);
  const open = (ms: number) => { g.openUntil = Date.now() + ms; g.openReason = `is not responding (${g.failures} failure${g.failures === 1 ? '' : 's'} in a row; last: ${reason})`; };
  if (g.trial) { g.trial = false; g.coolDown = Math.min(g.coolDown * 2, g.policy.maxCoolDownMs); open(g.coolDown); }
  else if (g.failures >= g.policy.failThreshold) open(g.coolDown);
}
/** The host asked us to come back later than a request waits: skip it until then. Not an outage. */
function deferred(g: Gate, status: number, ms: number) {
  noteError(g, `${status} — asked to wait ${fmtWait(ms)}`);
  g.trial = false; g.openUntil = Math.max(g.openUntil, Date.now() + Math.min(ms, g.policy.maxCoolDownMs));
  g.openReason = `asked us to wait (${status === 429 ? 'rate limit' : status})`;
}
/** Retry-After as milliseconds (seconds or an HTTP date). */
export function retryAfterMs(h: string | null | undefined) {
  if (!h) return undefined;
  if (/^\d+(\.\d+)?$/.test(h.trim())) return Number(h) * 1000;
  const t = Date.parse(h); return Number.isFinite(t) ? Math.max(0, t - Date.now()) : undefined;
}
const RETRY_STATUS = new Set([429, 502, 503, 504]);
/** A readable reason, and whether the error is worth retrying (dropped connections) or will not fix
 *  itself in seconds (refused connections, unknown names, timeouts). */
function describe(err: any, timeoutMs: number): { reason: string; retry: boolean; timeout: boolean } {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return { reason: `timed out after ${fmtWait(timeoutMs)}`, retry: false, timeout: true };
  const code = err?.cause?.code || err?.code || '';
  const text: Record<string, string> = { ENOTFOUND: 'host name not found', EAI_AGAIN: 'DNS lookup failed', ECONNREFUSED: 'connection refused', ECONNRESET: 'connection reset', ETIMEDOUT: 'connection timed out', UND_ERR_SOCKET: 'connection dropped', UND_ERR_CONNECT_TIMEOUT: 'connection timed out', CERT_HAS_EXPIRED: 'TLS certificate expired' };
  return { reason: text[code] || code || err?.cause?.message || err?.message || 'network error', retry: ['ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'EPIPE'].includes(code), timeout: false };
}

/** fetch() through the host's gate. Returns the response for any HTTP status (callers decide what a 404 means). */
export async function netFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const host = new URL(url).host; const g = gate(host);
  const { timeoutMs = 20000, ...rest } = init;
  let trial = false; // the trial request keeps its standing across its own retries
  for (let attempt = 0; ; attempt++) {
    if (!trial) trial = admit(g);
    await acquire(g);
    // The breaker may have opened while this request waited for a slot: check again before sending.
    if (!trial && g.openUntil) { try { trial = admit(g); } catch (e) { release(g); throw e; } }
    const t0 = Date.now(); let res: Response | undefined; let err: any;
    try { res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) }); } catch (e) { err = e; } finally { release(g); }
    g.stats.requests++; g.stats.totalMs += Date.now() - t0;
    if (res && !RETRY_STATUS.has(res.status)) {
      if (res.status >= 500) failed(g, `${res.status} ${res.statusText}`.trim()); else succeeded(g);
      return res;
    }
    const d = err ? describe(err, timeoutMs) : { reason: `${res!.status} ${res!.statusText}`.trim(), retry: true, timeout: false };
    const asked = res ? retryAfterMs(res.headers.get('retry-after')) : undefined;
    if (res && asked != null && asked > g.policy.maxRetryAfterMs) { deferred(g, res.status, asked); return res; }
    if (!d.retry || attempt >= g.policy.retries) {
      failed(g, d.reason);
      if (res) return res; // a 429/503 after retries: the caller sees the status
      throw new NetError(`${host}: ${d.reason}`, d.timeout ? 'timeout' : 'network');
    }
    g.stats.retries++;
    await res?.body?.cancel().catch(() => undefined); // free the connection before waiting
    await sleep(asked ?? 400 * 2 ** attempt + Math.random() * 300);
  }
}

/** Every host contacted so far: state, load and errors (Data page). Skipped hosts first. */
export function hostHealth() {
  const now = Date.now();
  return [...gates.values()].map((g) => {
    const open = !!g.openUntil && now < g.openUntil;
    return {
      host: g.host, state: open ? 'open' : g.openUntil ? 'trial' : g.failures ? 'degraded' : 'ok', reason: g.openUntil ? g.openReason : undefined,
      active: g.active, queued: g.queue.length, requests: g.stats.requests, ok: g.stats.ok, failed: g.stats.failed, retries: g.stats.retries, fastFails: g.stats.fastFails,
      consecutiveFailures: g.failures, avgMs: g.stats.requests ? Math.round(g.stats.totalMs / g.stats.requests) : null,
      lastError: g.stats.lastError, lastErrorAt: g.stats.lastErrorAt, lastOkAt: g.stats.lastOkAt,
      openUntil: open ? new Date(g.openUntil).toISOString() : undefined, policy: { concurrency: g.policy.concurrency, minGapMs: g.policy.minGapMs },
    };
  }).sort((a, b) => Number(b.state === 'open') - Number(a.state === 'open') || b.requests - a.requests);
}

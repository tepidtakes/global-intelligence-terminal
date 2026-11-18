// One gate for every outbound request, per host, shared by every module that calls that host:
//   • at most N requests in flight and a minimum gap between request starts (polite to rate-limited
//     services such as Wikidata, UN Comtrade and the SEC, however many loaders run at once). A
//     request is in flight until its whole answer has been read, not just the headers;
//   • retries for 429/502/503/504 and dropped connections, honouring Retry-After (at least a quarter
//     of a second), else exponential backoff with jitter. A Retry-After longer than half the
//     request's own time limit, or than `maxRetryAfterMs`, is not waited out inside the request: the
//     caller gets the answer and the host is skipped until then. Timeouts, refused connections and
//     unknown host names are not retried;
//   • a circuit breaker: after `failThreshold` consecutive failures the host is skipped (requests fail
//     at once, including those already waiting for a slot) for a cool-down that doubles up to
//     `maxCoolDownMs`; then a single trial request decides whether it is back. Requests sent before
//     the host was skipped do not change that decision when they finish. Answers such as 400 or 404
//     are not outages and never trip it.
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
  /** Raised each time the host starts being skipped. A request remembers the number it was sent
   *  under; if it has changed when the answer arrives, the answer is about an earlier state. */
  gen: number;
  stats: { requests: number; ok: number; failed: number; retries: number; fastFails: number; totalMs: number; lastError?: string; lastErrorAt?: string; lastOkAt?: string };
}
const gates = new Map<string, Gate>();
const policyFor = (host: string): HostPolicy => ({ ...DEFAULT, ...(POLICIES[host] || {}) });
function gate(host: string) {
  let g = gates.get(host);
  if (!g) { const policy = policyFor(host); g = { host, policy, active: 0, queue: [], lastStart: 0, failures: 0, openUntil: 0, coolDown: policy.coolDownMs, trial: false, gen: 0, stats: { requests: 0, ok: 0, failed: 0, retries: 0, fastFails: 0, totalMs: 0 } }; gates.set(host, g); }
  return g;
}
/** Change a host's policy (configuration and tests). */
export function setHostPolicy(host: string, p: Partial<HostPolicy>) { POLICIES[host] = { ...(POLICIES[host] || {}), ...p }; const g = gates.get(host); if (g) { g.policy = policyFor(host); g.coolDown = g.policy.coolDownMs; } }
export function resetHosts() { gates.clear(); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Waits for a slot and for the host's minimum gap. `check` throws when the host is being skipped:
 *  it runs as soon as the slot is obtained, before a start time is reserved, so when the breaker
 *  opens everything in the queue fails at once instead of one request per gap. */
async function acquire(g: Gate, check: () => void) {
  // A released slot is handed straight to the next waiter, so the limit is never exceeded.
  if (g.active < g.policy.concurrency) g.active++;
  else await new Promise<void>((r) => g.queue.push(r));
  try {
    check();
    const now = Date.now(); const startAt = Math.max(now, g.lastStart + g.policy.minGapMs);
    g.lastStart = startAt;
    if (startAt > now) { await sleep(startAt - now); check(); } // it may have opened during the gap
  } catch (e) { release(g); throw e; }
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
// `current` is false for a request sent before the host was last skipped (see Gate.gen). Its result
// is counted in the statistics but says nothing about the host now: a late success must not cut a
// skip short, and a late failure must not lengthen one or be mistaken for the trial's.
function succeeded(g: Gate, current: boolean) {
  g.stats.ok++; g.stats.lastOkAt = new Date().toISOString();
  if (current) { g.failures = 0; g.openUntil = 0; g.openReason = undefined; g.trial = false; g.coolDown = g.policy.coolDownMs; }
}
function failed(g: Gate, reason: string, isTrial: boolean, current: boolean) {
  noteError(g, reason);
  if (!current) return;
  g.failures++;
  const open = (ms: number) => { g.gen++; g.openUntil = Date.now() + ms; g.openReason = `is not responding (${g.failures} failure${g.failures === 1 ? '' : 's'} in a row; last: ${reason})`; };
  if (isTrial) { g.trial = false; g.coolDown = Math.min(g.coolDown * 2, g.policy.maxCoolDownMs); open(g.coolDown); }
  else if (g.failures >= g.policy.failThreshold) open(g.coolDown);
}
/** The host asked us to come back later than a request waits: skip it until then. Not an outage.
 *  This holds whenever the request was sent, and takes the standing of any trial that is out. */
function deferred(g: Gate, status: number, ms: number) {
  noteError(g, `${status} — asked to wait ${fmtWait(ms)}`);
  g.gen++; g.trial = false; g.openUntil = Math.max(g.openUntil, Date.now() + Math.min(ms, g.policy.maxCoolDownMs));
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

const NO_BODY = new Set([101, 103, 204, 205, 304]); // statuses a Response may not carry a body for
/** fetch() through the host's gate. Returns the response for any HTTP status (callers decide what a
 *  404 means). The body has already been read (every caller reads all of it anyway): the host's slot
 *  and `timeoutMs` cover the whole answer, and a body that stalls or breaks off is a failure of the
 *  host like any other. The response handed back reads like the original: text(), json(),
 *  arrayBuffer(), ok, status, headers, url. */
export async function netFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const host = new URL(url).host; const g = gate(host);
  const { timeoutMs = 20000, ...rest } = init;
  let trial = false; // the trial request keeps its standing across its own retries…
  let gen = g.gen;
  // Fails at once while the host is skipped; otherwise notes the state this request is sent under.
  const check = () => {
    if (trial && gen !== g.gen) trial = false; // …unless the host has since asked everyone to wait
    if (!trial) trial = admit(g);
    gen = g.gen;
  };
  for (let attempt = 0; ; attempt++) {
    check();
    // The breaker may open while this request waits for a slot or for the gap: acquire checks again.
    await acquire(g, check);
    const t0 = Date.now(); let res: Response | undefined; let err: any;
    try {
      const r = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
      const body = NO_BODY.has(r.status) ? null : await r.arrayBuffer(); // the same signal stops a stalled body
      res = new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
      Object.defineProperty(res, 'url', { value: r.url }); // a copy has no address of its own
    } catch (e) { err = e; res = undefined; } finally { release(g); }
    g.stats.requests++; g.stats.totalMs += Date.now() - t0;
    const current = gen === g.gen;
    if (res && !RETRY_STATUS.has(res.status)) {
      if (res.status >= 500) failed(g, `${res.status} ${res.statusText}`.trim(), trial, current); else succeeded(g, current);
      return res;
    }
    const d = err ? describe(err, timeoutMs) : { reason: `${res!.status} ${res!.statusText}`.trim(), retry: true, timeout: false };
    const asked = res ? retryAfterMs(res.headers.get('retry-after')) : undefined;
    // A wait the caller's own time limit would not cover is not slept here: the caller gets the
    // answer now (and can fall back on a copy it holds) and the host is left alone until then.
    if (res && asked != null && asked > Math.min(g.policy.maxRetryAfterMs, timeoutMs / 2)) { deferred(g, res.status, asked); return res; }
    if (!d.retry || attempt >= g.policy.retries) {
      failed(g, d.reason, trial, current);
      if (res) return res; // a 429/503 after retries: the caller sees the status
      throw new NetError(`${host}: ${d.reason}`, d.timeout ? 'timeout' : 'network');
    }
    g.stats.retries++;
    // "Retry-After: 0" still gets a short pause: the host has just said it is busy.
    await sleep(asked != null ? Math.max(asked, 250) : 400 * 2 ** attempt + Math.random() * 300);
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

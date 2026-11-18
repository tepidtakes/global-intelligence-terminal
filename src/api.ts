import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export class ApiError extends Error { constructor(public status: number, message: string, public data?: any) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: any; raw?: BodyInit; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method || (opts.body || opts.raw ? 'POST' : 'GET'),
    headers: opts.raw ? opts.headers : { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, data?.error || res.statusText, data);
  return data as T;
}

// Small in-memory cache so moving between profiles and the map is instant. Each entry keeps the raw
// response: a refresh that brings back identical data keeps the same object, so nothing re-renders.
// `t` is when the answer arrived (its age, for the TTL); `asked` is when it was requested, on the
// page's steady clock (an answer requested before the server announced a change may predate it).
interface Entry { t: number; asked: number; data: any; raw: string; /** The answer drew on the signed-in account. */ own: boolean; }
const cache = new Map<string, Entry>();
const steady = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// Requests already on the way: components asking for the same path share one request
// (a profile renders dozens of source links that all need /sources).
const pending = new Map<string, Promise<{ data: any; raw: string; asked: number; own: boolean }>>();
async function fetchRaw(path: string) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
  const raw = await res.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!res.ok) throw new ApiError(res.status, data?.error || res.statusText, data);
  return { data, raw, own: res.headers.get('X-Account-Data') === '1' };
}
function getOnce(path: string) {
  let p = pending.get(path);
  if (!p) { const asked = steady(); p = fetchRaw(path).then((r) => ({ ...r, asked })).finally(() => pending.delete(path)); pending.set(path, p); }
  return p;
}
const listeners = new Set<(path: string) => void>();
/** Keep the client cache bounded during long sessions (oldest entries go first). */
function trim() { if (cache.size > 400) for (const k of [...cache.keys()].slice(0, cache.size - 300)) cache.delete(k); }
export function invalidate(prefix: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const k of [...failedAt.keys()]) if (k.startsWith(prefix)) failedAt.delete(k);
  for (const l of listeners) l(prefix);
}

// ───────────── Live: what is on screen stays current ─────────────
// Every mounted useApi view is registered here. When the server says data changed (see "The live
// connection" below) the views on screen fetch again; each view also refreshes once its data is
// older than its TTL (at most every 30 s) while the tab is visible. Refreshes keep the current data
// on screen and are silent: no loading state, and a refresh that fails for a passing reason (the
// server restarting, a provider down) leaves the last good data.
interface Mounted { path: string; ttl: number; live: boolean; refresh: () => void; }
const mounted = new Set<Mounted>();
/** Views whose last request failed: they are asked again after a minute, then less and less often. */
const failedAt = new Map<string, { at: number; n: number }>();
const retryWait = (every: number, n: number) => Math.min(60_000 * 2 ** Math.min(n - 1, 6), Math.max(every, 300_000));
const MIN_REFRESH_MS = 30_000;
/** A TTL this long marks reference data (the source list, the feed registry): it is refreshed when it
 *  gets that old, not every time the server reports a change. */
export const REFERENCE_TTL_MS = 6 * 3600_000;
const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
/** When this page last heard that data changed on the server (steady clock). Answers requested
 *  before it are due a refresh, whether they are on screen now or opened later from the cache. */
let changedAt = 0;
/** The same for the signed-in account's private data (a note saved in another window, say): only
 *  answers that drew on the account are due then, not every view on screen. */
let ownChangedAt = 0;
const PRIVATE_SOURCES = new Set(['account', 'notes']);
const behindOf = (c: Entry) => c.asked < changedAt || (c.own && c.asked < ownChangedAt);
const current = (c: Entry, ttl: number, live: boolean) => Date.now() - c.t < ttl && (!live || ttl >= REFERENCE_TTL_MS || !behindOf(c));

/** Fetch the views on screen again: those requested before the last server event (onlyStale false),
 *  or those that have outlived their TTL as well (onlyStale true, the periodic check). */
export function refreshOnScreen(onlyStale = false) {
  const now = Date.now();
  for (const m of mounted) {
    if (!m.live || pending.has(m.path)) continue; // a request on the way is checked when it lands
    const c = cache.get(m.path);
    const reference = m.ttl >= REFERENCE_TTL_MS;
    const behind = !reference && (!c || behindOf(c));
    if (onlyStale) {
      if (c && !behind && now - c.t < Math.max(m.ttl, MIN_REFRESH_MS)) continue;
      const f = failedAt.get(m.path);
      if (f && now - f.at < retryWait(Math.max(m.ttl, MIN_REFRESH_MS), f.n)) continue;
    } else if (!behind) continue;
    m.refresh();
  }
}
// A burst of server events (a start-up, a busy market hour) makes one round of requests every five
// seconds at most, not one per event.
const ROUND_GAP_MS = 5000;
let roundTimer: ReturnType<typeof setTimeout> | undefined; let lastRound = 0;
function scheduleRound() {
  if (roundTimer || !isVisible()) return; // a hidden tab catches up when it is shown again
  roundTimer = setTimeout(() => { roundTimer = undefined; lastRound = Date.now(); if (isVisible()) refreshOnScreen(false); }, Math.max(300, lastRound + ROUND_GAP_MS - Date.now()));
}
/** Data changed on the server. An event that names only private sources concerns the views that
 *  show the account's data; anything else (or an unknown change, after being away) concerns all. */
function dataChanged(sources?: string[]) {
  if (sources?.length && sources.every((s) => PRIVATE_SOURCES.has(s))) ownChangedAt = steady(); else changedAt = steady();
  scheduleRound();
}

// ───────────── The live connection ─────────────
// The server pushes "data changed" events over Server-Sent Events (/api/live). A browser allows a
// site only six connections, so one window per browser holds the stream (whoever has the Web Lock)
// and repeats what it hears to the others over a BroadcastChannel; when it is hidden or closed,
// another visible window takes over. Where that is not possible (no Web Locks: an old browser, or
// plain http from another machine) or the server refuses another stream, the page asks
// /api/live/state every few seconds instead. Hidden tabs do neither and catch up when shown.
export type LiveState = 'connecting' | 'live' | 'paused' | 'offline';
let liveStatus: { state: LiveState; lastAt?: string; sources?: string[] } = { state: 'connecting' };
const statusSubs = new Set<() => void>();
let slowTimer: ReturnType<typeof setTimeout> | undefined;
function setLive(s: Partial<typeof liveStatus>) {
  // Still trying after ten seconds reads "Offline"; it stays so until a connection succeeds.
  if (s.state === 'connecting' && liveStatus.state === 'offline') s = { ...s, state: 'offline' };
  if (s.state && s.state !== liveStatus.state) {
    clearTimeout(slowTimer);
    if (s.state === 'connecting') slowTimer = setTimeout(() => setLive({ state: 'offline' }), 10_000);
    if (leader) channel?.postMessage({ t: 'state', state: s.state });
  }
  liveStatus = { ...liveStatus, ...s };
  for (const f of statusSubs) f();
}
/** Whether this page is receiving updates (for the indicator in the top bar). */
export function useLiveStatus() {
  return useSyncExternalStore((f) => { statusSubs.add(f); return () => { statusSubs.delete(f); }; }, () => liveStatus, () => liveStatus);
}

type Msg = { t: 'hello' | 'update' | 'state' | 'who' | 'session'; seq?: number; startedAt?: string; at?: string; sources?: string[]; state?: LiveState };
const canShare = typeof navigator !== 'undefined' && !!navigator.locks && typeof BroadcastChannel !== 'undefined';
const POLL_MS = 5000;
let channel: BroadcastChannel | null = null;
let leader = false; // this window holds the browser's stream
let release: (() => void) | null = null;
let waiting: AbortController | null = null; // a request for the lock, pending or granted
let es: EventSource | null = null;
let seq = -1, serverStart = ''; // the server event this page is caught up to
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let greetTimer: ReturnType<typeof setTimeout> | undefined;

/** The server's event number, from a greeting or a poll. True when this page missed something:
 *  events while it was away, or a restarted server. */
function heard(h: { seq?: number; startedAt?: string }) {
  if (!h.startedAt || typeof h.seq !== 'number') return false;
  const missed = serverStart !== '' && (h.startedAt !== serverStart || h.seq !== seq);
  serverStart = h.startedAt; seq = h.seq;
  return missed;
}
/** A greeting arrived: everything on screen is refreshed if something was missed, else only what is old. */
function greeted(h: { seq?: number; startedAt?: string }) {
  clearTimeout(greetTimer);
  if (heard(h)) dataChanged(); else if (isVisible()) refreshOnScreen(true);
}
// The server pings every 25 s. A stream that stays open but says nothing for a minute (a frozen
// server, a network that swallows packets) is not live: it is closed and opened again, and the
// indicator follows.
const SILENCE_MS = 60_000;
let silenceTimer: ReturnType<typeof setTimeout> | undefined;
function heardStream() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => { if (!es) return; es.close(); es = null; setLive({ state: 'connecting' }); openStream(); }, SILENCE_MS);
}
function openStream() {
  if (es || !isVisible() || typeof EventSource === 'undefined') return;
  setLive({ state: 'connecting' });
  const src = new EventSource('/api/live');
  es = src;
  src.addEventListener('hello', (e) => {
    const h = JSON.parse((e as MessageEvent).data);
    stopPolling(); setLive({ state: 'live' }); heardStream();
    if (leader) channel?.postMessage({ t: 'hello', seq: h.seq, startedAt: h.startedAt });
    greeted(h);
  });
  src.addEventListener('update', (e) => {
    const ev = JSON.parse((e as MessageEvent).data);
    seq = ev.seq; heardStream();
    setLive({ state: 'live', lastAt: ev.at, sources: ev.sources });
    if (leader) channel?.postMessage({ t: 'update', seq: ev.seq, at: ev.at, sources: ev.sources });
    dataChanged(ev.sources);
  });
  src.addEventListener('ping', heardStream);
  src.onerror = () => {
    if (src.readyState !== EventSource.CLOSED) { setLive({ state: 'connecting' }); return; } // the browser reconnects by itself
    // Refused (too many streams) or answered with an error: the browser gives up. Ask for the
    // event number instead and try the stream again in a minute — one timer, however often this runs.
    if (es === src) es = null;
    startPolling();
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (isVisible() && (leader || !canShare)) openStream(); }, 60_000);
  };
}
function startPolling() {
  if (pollTimer) return;
  const ask = async () => {
    if (!isVisible()) return;
    try {
      const r = await fetch('/api/live/state', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const h = await r.json();
      if (!pollTimer) return; // stopped meanwhile
      const first = serverStart === '';
      const missed = heard(h);
      setLive(missed ? { state: 'live', lastAt: new Date().toISOString(), sources: undefined } : { state: 'live' });
      if (leader && (missed || first)) channel?.postMessage({ t: 'hello', seq: h.seq, startedAt: h.startedAt });
      if (missed || first) clearTimeout(greetTimer);
      if (missed) dataChanged(); else if (first) refreshOnScreen(true);
    } catch { if (pollTimer) setLive({ state: 'offline' }); }
  };
  if (liveStatus.state !== 'live') setLive({ state: 'connecting' });
  pollTimer = setInterval(ask, POLL_MS);
  void ask();
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined; } }

function connect() {
  if (!isVisible()) return;
  if (!canShare || typeof EventSource === 'undefined') { startPolling(); return; }
  if (leader) { if (!pollTimer) openStream(); return; }
  if (waiting) return;
  if (liveStatus.state === 'paused') setLive({ state: 'connecting' });
  const mine = new AbortController();
  waiting = mine;
  navigator.locks.request('git-live-stream', { signal: mine.signal }, () => new Promise<void>((resolve) => {
    if (waiting !== mine || !isVisible()) { resolve(); return; }
    leader = true;
    release = () => { leader = false; release = null; resolve(); };
    openStream();
  })).catch(() => undefined).finally(() => { if (waiting === mine) waiting = null; });
  channel?.postMessage({ t: 'who' }); // if another window holds the stream, it says where things stand
}
function disconnect() {
  es?.close(); es = null;
  stopPolling(); clearTimeout(silenceTimer); clearTimeout(retryTimer); clearTimeout(greetTimer); clearTimeout(roundTimer); roundTimer = undefined;
  const w = waiting; waiting = null;
  release?.(); // another visible window takes the stream over
  w?.abort(); // and this one does not queue for it while hidden
  setLive({ state: 'paused' });
}
/** Visible again, or back online: reconnect and bring the screen up to date in one round. */
function resume() {
  connect();
  clearTimeout(greetTimer);
  greetTimer = setTimeout(() => refreshOnScreen(true), 1500); // no greeting in time: refresh what is old
}
function onMessage(m: Msg) {
  if (m.t === 'session') { if (leader) reopenStream(); for (const f of sessionSubs) f(); return; }
  if (m.t === 'who') { if (leader) channel?.postMessage({ t: 'state', state: liveStatus.state, seq, startedAt: serverStart, at: liveStatus.lastAt, sources: liveStatus.sources }); return; }
  if (leader || !isVisible()) return; // a hidden window catches up when it is shown
  if (m.t === 'update') {
    if (typeof m.seq === 'number') seq = m.seq;
    setLive({ state: 'live', lastAt: m.at, sources: m.sources });
    dataChanged(m.sources);
  } else if (m.t === 'hello' || m.t === 'state') {
    setLive({ state: m.state || 'live', ...(m.at ? { lastAt: m.at, sources: m.sources } : {}) });
    if (m.startedAt) greeted(m);
  }
}
function reopenStream() { if (es) { es.close(); es = null; openStream(); } }

// The signed-in account changed (sign-in or sign-out, here or in another window of this browser).
const sessionSubs = new Set<() => void>();
/** Run `fn` when the session may have changed elsewhere: another window signed in or out, or the
 *  server answered "not signed in" for something this page was showing. */
export function onSessionChange(fn: () => void) { sessionSubs.add(fn); return () => { sessionSubs.delete(fn); }; }
/** This window signed in or out: the stream is reopened as the new account (private updates are sent
 *  per account) and the browser's other windows are told to check who is signed in. */
export function sessionChanged() {
  if (leader || !canShare) reopenStream();
  channel?.postMessage({ t: 'session' });
}
let sessionCheckAt = 0;
function sessionMayHaveEnded() {
  if (Date.now() - sessionCheckAt < 30_000) return;
  sessionCheckAt = Date.now();
  for (const f of sessionSubs) f();
}

let started = false;
/** Start live updates (once, from the app shell). */
export function startLive() {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (canShare) { channel = new BroadcastChannel('git-live'); channel.onmessage = (e) => onMessage(e.data as Msg); }
  if (!isVisible()) setLive({ state: 'paused' });
  else slowTimer = setTimeout(() => setLive({ state: 'offline' }), 10_000); // "Connecting…" for ten seconds at most
  connect();
  document.addEventListener('visibilitychange', () => { if (isVisible()) resume(); else disconnect(); });
  window.addEventListener('online', resume);
  setInterval(() => { if (isVisible()) refreshOnScreen(true); }, 15_000);
}

/** Data for a view. `ttlMs` is how old it may get; `live: false` opts out of automatic refreshes. */
export function useApi<T = any>(path: string | null, ttlMs = 60_000, opts: { live?: boolean } = {}) {
  const live = opts.live !== false;
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>(() => {
    const c = path ? cache.get(path) : undefined;
    return { data: c?.data, loading: !!path && !c };
  });
  const [tick, setTick] = useState(0);
  const pathRef = useRef(path);
  pathRef.current = path;
  const me = useRef<Mounted | null>(null);
  const shownFor = useRef<string | null>(null); // the path the current state belongs to
  const loud = useRef(false); // reload() was called: show that something is happening

  useEffect(() => {
    const l = (prefix: string) => { if (pathRef.current?.startsWith(prefix)) setTick((x) => x + 1); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  useEffect(() => {
    if (!path) return;
    const m: Mounted = { path, ttl: ttlMs, live, refresh: () => setTick((x) => x + 1) };
    mounted.add(m); me.current = m;
    return () => { mounted.delete(m); if (me.current === m) me.current = null; };
  }, [path, ttlMs, live]);

  useEffect(() => {
    if (!path) { shownFor.current = null; setState({ loading: false }); return; }
    const retry = shownFor.current === path && !loud.current; // the same view, fetched again by itself
    shownFor.current = path; loud.current = false;
    const c = cache.get(path);
    // What the terminal already has for this path goes on screen at once, also when it is due a
    // refresh (the refresh below is then silent). Without this a hook whose path changed would keep
    // showing the previous path's data.
    if (c) setState((s) => (s.data === c.data && !s.loading && !s.error ? s : { data: c.data, loading: false }));
    if (c && current(c, ttlMs, live)) return;
    let alive = true;
    // A view that is showing an error keeps it while it is tried again by itself (no flash of a
    // loading state every minute); a new path, or a reload someone asked for, shows it is loading.
    if (!c) setState((s) => (retry && s.error ? s : { data: s.data && pathRef.current === path ? s.data : undefined, loading: true }));
    getOnce(path).then(({ data, raw, asked, own }) => {
      const prev = cache.get(path);
      const keep = prev && prev.raw === raw ? prev.data : data; // identical answer: same object
      cache.set(path, { t: Date.now(), asked, data: keep, raw, own }); trim(); failedAt.delete(path);
      // Another view of the same path with a longer TTL would otherwise keep the older copy.
      if (prev && prev.data !== keep) for (const m of mounted) if (m.path === path && m !== me.current) m.refresh();
      if (!alive) return;
      setState((s) => (s.data === keep && !s.loading && !s.error ? s : { data: keep, loading: false }));
      // Requested before the server announced a change (a slow request, or one the last round
      // skipped because it was on the way): the answer may predate it, so another round is due.
      if (live && ttlMs < REFERENCE_TTL_MS && (asked < changedAt || (own && asked < ownChangedAt))) scheduleRound();
    }).catch((error) => {
      // "Not signed in", "not allowed" and "no longer exists" are answers, not hiccups: what was on
      // screen is taken down. Anything else (server restarting, provider down) keeps the last good data.
      const answer = error instanceof ApiError && [401, 403, 404, 410].includes(error.status);
      if (answer) cache.delete(path);
      failedAt.set(path, { at: Date.now(), n: (failedAt.get(path)?.n || 0) + 1 });
      if (answer && error.status === 401 && c) sessionMayHaveEnded();
      if (!alive) return;
      if (c && !answer) setState((s) => (s.loading ? { ...s, loading: false } : s));
      else setState({ error, loading: false, data: undefined });
    });
    return () => { alive = false; };
  }, [path, tick, ttlMs, live]);

  const reload = useCallback(() => { if (path) { cache.delete(path); failedAt.delete(path); loud.current = true; setTick((x) => x + 1); } }, [path]);
  return { ...state, reload };
}

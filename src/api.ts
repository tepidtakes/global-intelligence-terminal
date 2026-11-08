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
interface Entry { t: number; data: any; raw: string; }
const cache = new Map<string, Entry>();
// Requests already on the way: components asking for the same path share one request
// (a profile renders dozens of source links that all need /sources).
const pending = new Map<string, Promise<{ data: any; raw: string }>>();
async function fetchRaw(path: string) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
  const raw = await res.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!res.ok) throw new ApiError(res.status, data?.error || res.statusText, data);
  return { data, raw };
}
function getOnce(path: string) {
  let p = pending.get(path);
  if (!p) { p = fetchRaw(path).finally(() => pending.delete(path)); pending.set(path, p); }
  return p;
}
const listeners = new Set<(path: string) => void>();
/** Keep the client cache bounded during long sessions (oldest entries go first). */
function trim() { if (cache.size > 400) for (const k of [...cache.keys()].slice(0, cache.size - 300)) cache.delete(k); }
export function invalidate(prefix: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const l of listeners) l(prefix);
}

// ───────────── Live: what is on screen stays current ─────────────
// Every mounted useApi view is registered here. When the server says its data changed (Server-Sent
// Events from /api/live) the views on screen fetch again; each view also refreshes once its data is
// older than its TTL (at most every 30 s) while the tab is visible. Refreshes keep the current data
// on screen and are silent: no loading state, and a failed refresh leaves the last good data.
interface Mounted { path: string; ttl: number; live: boolean; refresh: () => void; }
const mounted = new Set<Mounted>();
const failedAt = new Map<string, number>();
const MIN_REFRESH_MS = 30_000;
/** Views with a TTL this long show reference data (catalogs, source lists): no refresh on every event. */
const STATIC_TTL_MS = 6 * 3600_000;
const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** Fetch the views on screen again: after a server event (all), or only those older than their TTL. */
export function refreshOnScreen(onlyStale = false) {
  const now = Date.now(); const marked = new Set<string>();
  for (const m of mounted) {
    if (!m.live || (!onlyStale && m.ttl >= STATIC_TTL_MS)) continue;
    const c = cache.get(m.path);
    const every = Math.max(m.ttl, MIN_REFRESH_MS);
    if (onlyStale && (c ? now - c.t < every : now - (failedAt.get(m.path) || 0) < Math.max(every, 60_000))) continue;
    if (c && !marked.has(m.path)) { c.t = 0; marked.add(m.path); } // stale: re-fetched below, shown meanwhile
    m.refresh();
  }
}

export type LiveState = 'connecting' | 'live' | 'paused' | 'offline';
let liveStatus: { state: LiveState; lastAt?: string; sources?: string[] } = { state: 'connecting' };
const statusSubs = new Set<() => void>();
function setLive(s: Partial<typeof liveStatus>) { liveStatus = { ...liveStatus, ...s }; for (const f of statusSubs) f(); }
/** Whether this page is receiving updates (for the indicator in the top bar). */
export function useLiveStatus() {
  return useSyncExternalStore((f) => { statusSubs.add(f); return () => { statusSubs.delete(f); }; }, () => liveStatus, () => liveStatus);
}

let es: EventSource | null = null;
let seq = 0, serverStart = '';
let soonTimer: ReturnType<typeof setTimeout> | undefined;
const soon = () => { clearTimeout(soonTimer); soonTimer = setTimeout(() => refreshOnScreen(false), 300); };
function connect() {
  if (es || typeof EventSource === 'undefined' || !isVisible()) return;
  setLive({ state: 'connecting' });
  const src = new EventSource(`/api/live${seq ? `?since=${seq}` : ''}`);
  es = src;
  src.addEventListener('hello', (e) => {
    const h = JSON.parse((e as MessageEvent).data);
    // Back after being away, or the server restarted: catch up on what changed meanwhile.
    if (serverStart && (h.startedAt !== serverStart || h.seq !== seq)) soon();
    serverStart = h.startedAt; seq = h.seq;
    setLive({ state: 'live' });
  });
  src.addEventListener('update', (e) => {
    const ev = JSON.parse((e as MessageEvent).data);
    seq = ev.seq;
    setLive({ state: 'live', lastAt: ev.at, sources: ev.sources });
    soon();
  });
  src.onerror = () => {
    if (src.readyState === EventSource.CLOSED) { if (es === src) es = null; setLive({ state: 'offline' }); setTimeout(connect, 10_000); }
    else setLive({ state: 'connecting' }); // the browser reconnects by itself
  };
}
function disconnect() { es?.close(); es = null; setLive({ state: 'paused' }); }
let started = false;
/** Start live updates (once, from the app shell). Hidden tabs disconnect, so a browser never holds
 *  more than one stream per visible tab. */
export function startLive() {
  if (started || typeof window === 'undefined') return;
  started = true;
  connect();
  document.addEventListener('visibilitychange', () => { if (isVisible()) { connect(); refreshOnScreen(true); } else disconnect(); });
  window.addEventListener('online', () => { connect(); refreshOnScreen(true); });
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

  useEffect(() => {
    const l = (prefix: string) => { if (pathRef.current?.startsWith(prefix)) setTick((x) => x + 1); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  useEffect(() => {
    if (!path) return;
    const m: Mounted = { path, ttl: ttlMs, live, refresh: () => setTick((x) => x + 1) };
    mounted.add(m);
    return () => { mounted.delete(m); };
  }, [path, ttlMs, live]);

  useEffect(() => {
    if (!path) { setState({ loading: false }); return; }
    const c = cache.get(path);
    if (c && Date.now() - c.t < ttlMs) { setState((s) => (s.data === c.data && !s.loading && !s.error ? s : { data: c.data, loading: false })); return; }
    let alive = true;
    const shown = c !== undefined; // a refresh of data already on screen is silent
    if (!shown) setState((s) => ({ data: s.data && pathRef.current === path ? s.data : undefined, loading: true }));
    getOnce(path).then(({ data, raw }) => {
      const prev = cache.get(path);
      const keep = prev && prev.raw === raw ? prev.data : data; // identical answer: same object
      cache.set(path, { t: Date.now(), data: keep, raw }); trim(); failedAt.delete(path);
      if (alive) setState((s) => (s.data === keep && !s.loading && !s.error ? s : { data: keep, loading: false }));
    }).catch((error) => {
      failedAt.set(path, Date.now());
      if (!alive) return;
      if (shown) setState((s) => (s.loading ? { ...s, loading: false } : s)); // keep what is on screen
      else setState({ error, loading: false, data: undefined });
    });
    return () => { alive = false; };
  }, [path, tick, ttlMs]);

  const reload = useCallback(() => { if (path) { cache.delete(path); setTick((x) => x + 1); } }, [path]);
  return { ...state, reload };
}

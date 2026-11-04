import { useCallback, useEffect, useRef, useState } from 'react';

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

// Small in-memory cache so moving between profiles and the map is instant.
const cache = new Map<string, { t: number; data: any }>();
// Requests already on the way: components asking for the same path share one request
// (a profile renders dozens of source links that all need /sources).
const pending = new Map<string, Promise<any>>();
function getOnce<T>(path: string): Promise<T> {
  let p = pending.get(path);
  if (!p) { p = api<T>(path).finally(() => pending.delete(path)); pending.set(path, p); }
  return p;
}
const listeners = new Set<(path: string) => void>();
/** Keep the client cache bounded during long sessions (oldest entries go first). */
function trim() { if (cache.size > 400) for (const k of [...cache.keys()].slice(0, cache.size - 300)) cache.delete(k); }
export function invalidate(prefix: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const l of listeners) l(prefix);
}

export function useApi<T = any>(path: string | null, ttlMs = 60_000) {
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
    if (!path) { setState({ loading: false }); return; }
    const c = cache.get(path);
    if (c && Date.now() - c.t < ttlMs) { setState({ data: c.data, loading: false }); return; }
    let alive = true;
    setState((s) => ({ data: c?.data ?? (s.data && pathRef.current === path ? s.data : undefined), loading: true }));
    getOnce<T>(path).then((data) => { cache.set(path, { t: Date.now(), data }); trim(); if (alive) setState({ data, loading: false }); })
      .catch((error) => { if (alive) setState({ error, loading: false, data: c?.data }); });
    return () => { alive = false; };
  }, [path, tick, ttlMs]);

  const reload = useCallback(() => { if (path) { cache.delete(path); setTick((x) => x + 1); } }, [path]);
  return { ...state, reload };
}

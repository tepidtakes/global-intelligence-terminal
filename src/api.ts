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
const listeners = new Set<(path: string) => void>();
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
    api<T>(path).then((data) => { cache.set(path, { t: Date.now(), data }); if (alive) setState({ data, loading: false }); })
      .catch((error) => { if (alive) setState({ error, loading: false, data: c?.data }); });
    return () => { alive = false; };
  }, [path, tick, ttlMs]);

  const reload = useCallback(() => { if (path) { cache.delete(path); setTick((x) => x + 1); } }, [path]);
  return { ...state, reload };
}

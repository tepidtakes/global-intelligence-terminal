import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, invalidate } from './api';

// ───────── storage helpers (per-viewer conveniences only) ─────────
export function load<T>(key: string, d: T): T { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : d; } catch { return d; } }
export function save(key: string, v: any) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }

// ───────── Auth ─────────
interface User { id: string; email: string; }
const AuthCtx = createContext<{ user: User | null | undefined; refresh: () => Promise<void>; logout: () => Promise<void> }>({ user: undefined, refresh: async () => {}, logout: async () => {} });
export const useAuth = () => useContext(AuthCtx);

// ───────── Map config (survives navigation, persisted per viewer) ─────────
export interface MapConfig {
  fill: string;
  igos: string[];
  igoYear: string | null;
  overlayIgo: string | null;
  year: string | null;
  classify: 'quantile' | 'equal' | 'log';
  showCities: boolean;
  showAdmin: boolean;
}
export const DEFAULT_MAP: MapConfig = { fill: 'wb:NY.GDP.PCAP.CD', igos: ['igo:nato'], igoYear: null, overlayIgo: null, year: null, classify: 'quantile', showCities: true, showAdmin: true };
export interface MapView { center: [number, number]; zoom: number; }

interface AppState {
  map: MapConfig; setMap: (p: Partial<MapConfig>) => void;
  selected: string | null; select: (id: string | null, opts?: { fly?: boolean }) => void;
  flyRequest: { id: string; n: number } | null;
  viewRef: React.MutableRefObject<MapView>;
  compare: string[]; toggleCompare: (id: string) => void; clearCompare: () => void;
  theme: 'system' | 'light' | 'dark'; setTheme: (t: 'system' | 'light' | 'dark') => void;
  toast: (msg: string) => void;
}
const AppCtx = createContext<AppState>(null as any);
export const useApp = () => useContext(AppCtx);

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const refresh = useCallback(async () => { try { setUser(await api('/auth/me')); } catch { setUser(null); } }, []);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); invalidate(''); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const [map, setMapState] = useState<MapConfig>(() => ({ ...DEFAULT_MAP, ...load('git.map', {}) }));
  const setMap = useCallback((p: Partial<MapConfig>) => setMapState((m) => { const n = { ...m, ...p }; save('git.map', n); return n; }), []);
  const [selected, setSelected] = useState<string | null>(() => load('git.selected', null));
  const [flyRequest, setFly] = useState<{ id: string; n: number } | null>(null);
  const select = useCallback((id: string | null, opts: { fly?: boolean } = {}) => {
    setSelected(id); save('git.selected', id);
    if (id && opts.fly) setFly((f) => ({ id, n: (f?.n || 0) + 1 }));
  }, []);
  const viewRef = useRef<MapView>(load('git.view', { center: [10, 25], zoom: 1.6 }));
  const [compare, setCompare] = useState<string[]>(() => load('git.compare', []));
  const toggleCompare = useCallback((id: string) => setCompare((c) => { const n = c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-6); save('git.compare', n); return n; }), []);
  const clearCompare = useCallback(() => { setCompare([]); save('git.compare', []); }, []);

  const [theme, setThemeState] = useState<'system' | 'light' | 'dark'>(() => load('git.theme', 'system'));
  const setTheme = useCallback((t: 'system' | 'light' | 'dark') => {
    setThemeState(t); save('git.theme', t);
    if (user) api('/prefs', { method: 'PUT', body: { theme: t } }).catch(() => {});
  }, [user]);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', theme);
    window.dispatchEvent(new Event('git-theme'));
  }, [theme]);
  // Pull persisted preferences once signed in.
  useEffect(() => {
    if (!user) return;
    api('/prefs').then((p) => { if (p?.theme && p.theme !== theme) { setThemeState(p.theme); save('git.theme', p.theme); } if (p?.map) setMap(p.map); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const [toastMsg, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const toast = useCallback((m: string) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2600); }, []);

  const value = useMemo(() => ({ map, setMap, selected, select, flyRequest, viewRef, compare, toggleCompare, clearCompare, theme, setTheme, toast }),
    [map, setMap, selected, select, flyRequest, compare, toggleCompare, clearCompare, theme, setTheme, toast]);
  return (
    <AuthCtx.Provider value={{ user, refresh, logout }}>
      <AppCtx.Provider value={value}>
        {children}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </AppCtx.Provider>
    </AuthCtx.Provider>
  );
}

/** Resolve whether dark mode is currently active (for map/chart colors). */
export function useIsDark() {
  const get = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  };
  const [dark, setDark] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(get());
    mq.addEventListener('change', on); window.addEventListener('git-theme', on);
    return () => { mq.removeEventListener('change', on); window.removeEventListener('git-theme', on); };
  }, []);
  return dark;
}

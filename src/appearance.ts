// Appearance beyond the theme: how dense the screens are, and which colours mean "rose" and "fell".
// Kept in this browser, and with the account when signed in (preferences key "appearance"), like the
// theme. Applied as attributes on <html> (data-density, data-moves) that src/styles.css reads.
import { useSyncExternalStore } from 'react';
import { api } from './api';

// Own storage helpers: src/state.tsx imports this module, so importing it back would make a cycle.
const load = <T>(key: string, d: T): T => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };

export type Density = 'comfortable' | 'compact';
export type Moves = 'green-red' | 'blue-orange' | 'red-green';
export interface Appearance { density: Density; moves: Moves; }

export const DENSITIES: { id: Density; label: string; about: string }[] = [
  { id: 'comfortable', label: 'Comfortable', about: 'Room around everything: easiest to read.' },
  { id: 'compact', label: 'Compact', about: 'Tighter tables and cards: about a quarter more rows on screen.' },
];
export const MOVES: { id: Moves; label: string; about: string }[] = [
  { id: 'green-red', label: 'Green up, red down', about: 'The usual convention in most markets.' },
  { id: 'blue-orange', label: 'Blue up, orange down', about: 'Easy to tell apart with red–green colour blindness.' },
  { id: 'red-green', label: 'Red up, green down', about: 'The convention in China, Japan, Korea and Taiwan.' },
];
const KEY = 'git.appearance';
const DEFAULT: Appearance = { density: 'comfortable', moves: 'green-red' };

function clean(x: any): Appearance {
  return { density: DENSITIES.some((d) => d.id === x?.density) ? x.density : DEFAULT.density, moves: MOVES.some((m) => m.id === x?.moves) ? x.moves : DEFAULT.moves };
}
let current = clean(load(KEY, DEFAULT));
const subs = new Set<() => void>();

function apply(a: Appearance) {
  const el = document.documentElement;
  el.setAttribute('data-density', a.density);
  el.setAttribute('data-moves', a.moves);
}
/** At start-up (src/main.tsx): what this browser had last. */
export function applyAppearance() { apply(current); }

/** Change it here; `signedIn` also keeps it with the account. */
export function setAppearance(p: Partial<Appearance>, signedIn = false) {
  const next = clean({ ...current, ...p });
  if (next.density === current.density && next.moves === current.moves) return;
  current = next; save(KEY, next); apply(next); subs.forEach((f) => f());
  if (signedIn) api('/prefs', { method: 'PUT', body: { appearance: next } }).catch(() => { /* kept in this browser */ });
}
/** What the account has (after signing in): it wins over this browser's. */
export function adoptAppearance(x: unknown) { if (x && typeof x === 'object') setAppearance(clean(x)); }

export const useAppearance = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current, () => current);

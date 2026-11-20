// The workspace (function BOARD): up to four panes side by side, each running its own function.
// This file holds the model, where workspaces are kept, and the messages that pass between the
// workspace page (src/pages/BoardPage.tsx) and its panes (src/components/PaneShell.tsx).
//
// A pane is this same app in an iframe named git-pane-1 … git-pane-4 (see src/pane.ts). The page and
// its panes talk with window.postMessage, parent to frame and frame to parent, and each side checks
// who is speaking. Nothing is broadcast, so two workspace tabs never hear each other.
import { commandUrl, fnAppliesTo, fnAt, fnByCode, type CmdEntity, type FnDef } from '../shared/functions';
import type { EntityType } from '../shared/types';
import { api } from './api';
import { load, save, type LoadedEntity } from './state';

// ───────────── Model ─────────────
/** Panes with the same letter follow the same entity. '' is not linked. */
export type Group = '' | 'A' | 'B' | 'C';
export const GROUPS: Group[] = ['', 'A', 'B', 'C'];
/** Each letter has its own colour, taken from the chart series colours. The letter is always shown too. */
export const groupColor = (g: Group) => (g ? `var(--s${GROUPS.indexOf(g)})` : undefined);

/** A layout is its panes on a 2 × 2 grid: [column, row, columns wide, rows tall]. The picker's
 *  icons and the frames on screen are both drawn from these. */
export interface Layout { id: string; label: string; cells: [number, number, number, number][]; /** Share of the width the left column starts with. */ col?: number; }
export const LAYOUTS: Layout[] = [
  { id: 'one', label: 'One pane', cells: [[0, 0, 2, 2]] },
  { id: 'two', label: 'Two panes side by side', cells: [[0, 0, 1, 2], [1, 0, 1, 2]] },
  { id: 'three', label: 'One large pane and two stacked', cells: [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1]], col: 0.6 },
  { id: 'four', label: 'Four panes, two by two', cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
];
export const MAX_PANES = Math.max(...LAYOUTS.map((l) => l.cells.length));
export const layoutOf = (id: string) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
const layoutFor = (panes: number) => LAYOUTS.find((l) => l.cells.length === panes) || LAYOUTS[LAYOUTS.length - 1];

export interface Pane { url: string; group: Group; }
export interface Workspace {
  name: string; layout: string;
  /** Always MAX_PANES long: panes beyond the layout keep their place for when the layout grows again. */
  panes: Pane[];
  /** Where the dividers were dragged to: share of the width for the left column, of the height for the top row. */
  split?: [number, number];
}
export const paneName = (no: number) => `git-pane-${no}`;

/** The address of a function, from the registry. */
export function fnUrl(code: string, entities: CmdEntity[] = [], tail: string[] = []): string {
  const fn = fnByCode(code); const r = fn && commandUrl(fn, entities, tail);
  return r && 'url' in r ? r.url : '/';
}
const BOARD_PAGE = fnByCode('BOARD')?.page || '/board';
/** What a new pane shows: the list of functions, to pick one. */
export const EMPTY_PANE = fnUrl('HELP');

/** A pane only ever shows a page of this app, and never the workspace itself. Returns the address
 *  as path + query + hash, or null when it is anything else. */
export function safePaneUrl(u: unknown): string | null {
  if (typeof u !== 'string' || !u.startsWith('/') || u.length > 2000) return null;
  try {
    const x = new URL(u, location.origin);
    // "//host/…" would be read as another site wherever the address is used again.
    if (x.origin !== location.origin || x.pathname === BOARD_PAGE || x.pathname.startsWith('//')) return null;
    return x.pathname + x.search + x.hash;
  } catch { return null; }
}

/** Whatever was read from storage or from the account, made into a workspace (or null if it is not one). */
export function cleanWorkspace(x: any): Workspace | null {
  if (!x || typeof x !== 'object' || !Array.isArray(x.panes)) return null;
  const panes: Pane[] = [];
  for (let i = 0; i < MAX_PANES; i++) {
    const p = x.panes[i];
    panes.push({ url: safePaneUrl(p?.url) || EMPTY_PANE, group: GROUPS.includes(p?.group) ? p.group : '' });
  }
  const frac = (v: any) => (typeof v === 'number' && v >= MIN_SPLIT && v <= 1 - MIN_SPLIT ? v : undefined);
  const col = frac(x.split?.[0]), row = frac(x.split?.[1]);
  return { name: String(x.name || '').trim().slice(0, 60), layout: layoutOf(String(x.layout)).id, panes, ...(col || row ? { split: [col ?? 0.5, row ?? 0.5] as [number, number] } : {}) };
}
export const MIN_SPLIT = 0.2;
export const paneCount = (w: Workspace) => layoutOf(w.layout).cells.length;
export function emptyWorkspace(): Workspace { return { name: '', layout: LAYOUTS[0].id, panes: Array.from({ length: MAX_PANES }, () => ({ url: EMPTY_PANE, group: '' as Group })) }; }

// ───────────── Starter workspaces ─────────────
// Built from function codes, so they follow the registry. `entity` runs each function on a country.
const STARTERS: { name: string; codes: string[]; group: Group; entity?: boolean }[] = [
  { name: 'Macro desk', codes: ['CAL', 'RATES', 'FX', 'TOP'], group: '' },
  { name: 'Country desk', codes: ['DES', 'ECON', 'NEWS', 'MAP'], group: 'A', entity: true },
  { name: 'Markets', codes: ['EQ', 'CMD', 'FXM', 'TOP'], group: '' },
];
/** Used by "Country desk" when no country has been opened yet in this window. */
const FALLBACK_COUNTRY: CmdEntity = { id: 'country:USA', type: 'country', iso3: 'USA' };
/** The starter workspaces. `country` is the one loaded in this window, if any. */
export function starters(country?: CmdEntity | null): Workspace[] {
  return STARTERS.map((s) => cleanWorkspace({
    name: s.name, layout: layoutFor(s.codes.length).id,
    panes: s.codes.map((c) => ({ url: fnUrl(c, s.entity ? [country || FALLBACK_COUNTRY] : []), group: s.group })),
  })!);
}

// ───────────── Where workspaces are kept ─────────────
// The workspace on screen: this browser (it is restored on the next visit). Saved workspaces: the
// account's preferences under "boards" when signed in, this browser otherwise. The server merges
// what is sent into the stored preferences, so sending only "boards" leaves the other keys alone.
const CURRENT_KEY = 'git.board', SAVED_KEY = 'git.boards', MAX_SAVED = 40;
export const readCurrent = (): Workspace | null => cleanWorkspace(load<any>(CURRENT_KEY, null));
export const writeCurrent = (w: Workspace) => save(CURRENT_KEY, w);
const cleanList = (raw: any): Workspace[] => (Array.isArray(raw) ? raw.map(cleanWorkspace).filter((w): w is Workspace => !!w && !!w.name).slice(0, MAX_SAVED) : []);
export async function readSaved(signedIn: boolean): Promise<Workspace[]> {
  return cleanList(signedIn ? (await api('/prefs'))?.boards : load<any>(SAVED_KEY, []));
}
export async function writeSaved(signedIn: boolean, list: Workspace[]): Promise<void> {
  if (signedIn) await api('/prefs', { method: 'PUT', body: { boards: list.slice(0, MAX_SAVED) } });
  else save(SAVED_KEY, list.slice(0, MAX_SAVED));
}
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** The list with `w` added, replacing a workspace of the same name. */
export const withSaved = (list: Workspace[], w: Workspace) => [...list.filter((x) => !same(x.name, w.name)), w].sort((a, b) => a.name.localeCompare(b.name));
export const withoutSaved = (list: Workspace[], name: string) => list.filter((x) => !same(x.name, name));
export const savedNamed = (list: Workspace[], name: string) => list.find((x) => same(x.name, name));
/** A workspace by the start of its name, whatever the case: an exact name first, saved before starters. */
export function findWorkspace(words: string, saved: Workspace[], starter: Workspace[]): Workspace | undefined {
  const q = words.trim().toLowerCase(); if (!q) return undefined;
  const all = [...saved, ...starter];
  return all.find((w) => w.name.toLowerCase() === q) || all.find((w) => w.name.toLowerCase().startsWith(q));
}

// ───────────── Messages ─────────────
/** Pane → workspace page. */
export type PaneMsg =
  | { t: 'hello'; pane: number }                          // the pane is up: tell it its link group and whether it is the active one
  | { t: 'loaded'; pane: number; entity: LoadedEntity; follow?: boolean; initial?: boolean } // the pane's loaded entity changed (`follow`: because its link group moved; `initial`: what the pane had before it appeared, not something just done in it)
  | { t: 'location'; pane: number; url: string }          // the pane moved to another address
  | { t: 'focus'; pane: number }                          // the pane was clicked or took the keyboard
  | { t: 'key'; pane: number; key: string }               // a workspace key was pressed inside the pane
  | { t: 'group'; pane: number; group: Group };           // the pane's link chip was clicked
/** Workspace page → pane. */
export type BoardMsg =
  | { t: 'entity'; entity: LoadedEntity }                 // another pane of the same link group loaded this entity
  | { t: 'focus' }                                        // put the cursor in the pane's command line
  | { t: 'state'; group: Group; active: boolean; panes: number };
const TAG = 'git-board';

export function toParent(msg: PaneMsg) { if (window.parent !== window) window.parent.postMessage({ ...msg, app: TAG }, location.origin); }
export function toPane(frame: HTMLIFrameElement | null | undefined, msg: BoardMsg) { frame?.contentWindow?.postMessage({ ...msg, app: TAG }, location.origin); }
/** In the workspace page: hear its own panes, and only them. `index` is the frame that spoke (0-based). */
export function onPaneMessage(frames: () => (HTMLIFrameElement | null | undefined)[], fn: (msg: PaneMsg, index: number) => void) {
  const h = (e: MessageEvent) => {
    if (e.origin !== location.origin || e.data?.app !== TAG) return;
    const i = frames().findIndex((f) => !!f && f.contentWindow === e.source);
    if (i >= 0) fn(e.data as PaneMsg, i);
  };
  window.addEventListener('message', h);
  return () => window.removeEventListener('message', h);
}
/** In a pane: hear the workspace page around it, and only it. */
export function onBoardMessage(fn: (msg: BoardMsg) => void) {
  const h = (e: MessageEvent) => { if (e.origin === location.origin && e.source === window.parent && e.data?.app === TAG) fn(e.data as BoardMsg); };
  window.addEventListener('message', h);
  return () => window.removeEventListener('message', h);
}

// ───────────── Keys ─────────────
/** The workspace keys are defined with the others in src/keys.ts (so the key page lists them). */
export { workspaceKey } from './keys';
/** The pane a workspace key leads to (0-based), or -1 when the layout has no such pane. */
export function keyTarget(key: string, active: number, panes: number): number {
  if (key === 'next') return (active + 1) % panes;
  if (key === 'prev') return (active - 1 + panes) % panes;
  const n = Number(key) - 1;
  return n >= 0 && n < panes ? n : -1;
}

// ───────────── Following a link group ─────────────
/** The function an address shows, for a pane's header and the pane switcher. */
export function fnOfUrl(url: string): FnDef | undefined {
  try { return fnAt(new URL(url, location.origin))?.fn; } catch { return undefined; }
}
/** Where a pane goes when its link group moves to another entity: its current function, run for
 *  that entity. Null when it should stay where it is (the function does not act on this kind of
 *  entity, or the pane already shows it). Parameters typed earlier (WEB 2) are kept. */
export function followUrl(loc: { pathname: string; search: string; hash: string }, entity: LoadedEntity): string | null {
  const at = fnAt(loc);
  if (!at || at.entityId === entity.id || !fnAppliesTo(at.fn, entity)) return null;
  const r = commandUrl(at.fn, [entity as CmdEntity]);
  if ('error' in r) return null;
  const cur = new URLSearchParams(loc.search);
  const keep = (at.fn.params || []).filter((p) => cur.get(p.query));
  if (!keep.length) return r.url;
  const u = new URL(r.url, location.origin);
  for (const p of keep) if (!u.searchParams.has(p.query)) u.searchParams.set(p.query, cur.get(p.query)!);
  return u.pathname + u.search + u.hash;
}

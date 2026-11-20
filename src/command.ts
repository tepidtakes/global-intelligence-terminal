// Running a command typed into the command line (or clicked anywhere a function is offered):
// parse it against the registry, resolve its entities on the server, build the address, go there.
// Also keeps the command history (for Up/Down and LAST) and the message the status line shows.
import { useCallback, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { useApp, type LoadedEntity } from './state';
import { FUNCTIONS, commandUrl, fnAppliesTo, fnByCode, parseCommand, readParams, type CmdEntity, type FnDef } from '../shared/functions';

export interface Resolved extends LoadedEntity { score: number; exact: boolean; sure: boolean; alternatives?: { id: string; type: string; name: string; flag?: string; parentName?: string }[]; }
export interface CommandResult { ok: boolean; message: string; /** Where the command went, when it went anywhere. */ url?: string; }
export interface CommandCtx {
  navigate: (url: string) => void;
  loaded: LoadedEntity | null;
  load: (e: LoadedEntity | null) => void;
  /** Injected in checks; the app asks the server. */
  resolve?: (words: string, max: number) => Promise<Resolved[]>;
}

// ───────── History (last 50, per browser) ─────────
const HISTORY_KEY = 'git.cmd.history';
const HISTORY_MAX = 50;
export function commandHistory(): string[] { try { const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } }
function remember(text: string) {
  const h = commandHistory().filter((x) => x.toUpperCase() !== text.toUpperCase());
  h.push(text);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-HISTORY_MAX))); } catch { /* private mode: history lasts until the page closes */ }
}

// ───────── The last result, for the status line ─────────
export interface CommandStatus extends CommandResult { text: string; at: number; }
let status: CommandStatus | null = null;
const subs = new Set<() => void>();
export function setCommandStatus(s: CommandResult & { text?: string }) { status = { text: '', ...s, at: Date.now() }; subs.forEach((f) => f()); }
export const useCommandStatus = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => status, () => null);

// ───────── Helpers ─────────
const resolveOnServer = async (words: string, max: number): Promise<Resolved[]> => (await api<{ entities: Resolved[] }>(`/resolve?q=${encodeURIComponent(words)}&max=${max}`)).entities;
export const asLoaded = (e: { id: string; type: string; name: string; flag?: string; iso3?: string }): LoadedEntity => ({ id: e.id, type: e.type, name: e.name, flag: e.flag, iso3: e.iso3 });
const cmd = (e: LoadedEntity): CmdEntity => ({ id: e.id, type: e.type as CmdEntity['type'], name: e.name, iso3: e.iso3 });

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Function codes close to a word that is not one: same start, or one or two letters off. */
export function nearCodes(word: string, n = 3): string[] {
  const w = word.toUpperCase();
  return FUNCTIONS.map((f) => ({ c: f.code, s: f.code.startsWith(w) || w.startsWith(f.code) ? 0.5 : distance(w, f.code) }))
    .filter((x) => x.s <= (w.length <= 3 ? 1 : 2)).sort((a, b) => a.s - b.s).slice(0, n).map((x) => x.c);
}
/** Functions matching words by code, title or description: the Functions group of the command line and of the search page. Best first. */
export function matchFunctions(text: string, limit = 8): FnDef[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const scored: { f: FnDef; s: number }[] = [];
  for (const f of FUNCTIONS) {
    const codes = [f.code, ...(f.aliases || [])].map((c) => c.toLowerCase());
    const title = f.title.toLowerCase();
    const s = codes.includes(q) ? 100 : codes.some((c) => c.startsWith(q)) ? 80 - (f.code.length - q.length) : title.startsWith(q) ? 60 : q.length >= 3 && new RegExp(`\\b${q.replace(/[^a-z0-9 ]/g, '\\$&')}`).test(title) ? 50 : q.length >= 4 && f.about.toLowerCase().includes(q) ? 30 : 0;
    if (s) scored.push({ f, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.f);
}
/** An alternative named so it can be told apart from one of the same name: "Georgia (United States)". */
const altName = (a: { name: string; type: string; parentName?: string }, e: { name: string }) => (a.name === e.name ? `${a.name} (${a.parentName || a.type})` : a.name);
const took = (words: string, e: Resolved) => (e.exact ? '' : ` · took “${words}” to mean ${e.name}${e.alternatives?.length ? ` (also: ${e.alternatives.slice(0, 3).map((a) => altName(a, e)).join(', ')})` : ''}`);
const findUrl = (q: string) => `/find?q=${encodeURIComponent(q)}`;

/** Run what was typed. Always ends somewhere useful: the function's screen, an entity's profile,
 *  or the search page; the result says what happened in a line. */
export async function runCommand(text: string, ctx: CommandCtx): Promise<CommandResult> {
  const typed = text.trim().replace(/\s+/g, ' ');
  if (!typed) return { ok: false, message: '' };
  const resolve = ctx.resolve || resolveOnServer;
  let url: string | undefined;
  const go = (to: string) => { url = to; ctx.navigate(to); };
  const done = (t: string, r: CommandResult): CommandResult => finish(t, { ...r, url });
  const parsed = parseCommand(typed);
  const fn = parsed.fn;
  // A code typed first, with words after it, may really be the start of a name ("News Corp",
  // "Des Moines County"): a phrase that names one entity exactly opens that entity.
  if (fn && !parsed.head && parsed.tail.length && !fn.special) {
    let whole: Resolved[] = [];
    try { whole = await resolve(typed, 1); } catch { /* offline: run it as a command */ }
    const e = whole[0];
    if (e?.exact) {
      ctx.load(asLoaded(e)); go(`/entity/${encodeURIComponent(e.id)}`);
      return done(typed, { ok: true, message: `${e.name} loaded` });
    }
  }

  if (fn?.special === 'last') {
    const before = commandHistory().filter((c) => parseCommand(c).fn?.special !== 'last').pop();
    if (!before) return done(typed, { ok: false, message: 'LAST: no earlier command to run again' });
    const r = await runCommand(before, ctx);
    return { ...r, message: r.ok ? `Again: ${before} · ${r.message}` : r.message };
  }
  if (!fn) {
    // Not a command: an entity opens its profile, anything else goes to the search page.
    let found: Resolved[] = [];
    try { found = await resolve(typed, 1); } catch { /* offline: the search page says so */ }
    const e = found[0];
    if (e && (e.exact || e.sure)) {
      ctx.load(asLoaded(e)); go(`/entity/${encodeURIComponent(e.id)}`);
      return done(typed, { ok: true, message: `${e.name} loaded${took(typed, e)}` });
    }
    const words = typed.split(' ');
    const last = words[words.length - 1];
    const near = /^[a-z]{2,6}$/i.test(last) ? nearCodes(last) : [];
    go(findUrl(typed));
    return done(typed, { ok: false, message: words.length === 1 && near.length ? `Unknown code ${typed.toUpperCase()}; did you mean ${near.join(', ')}? Showing everything that matches` : `No function or single entity is called “${typed}”${near.length ? ` (did you mean ${near.join(', ')} at the end?)` : ''}: showing everything that matches` });
  }
  if (fn.special === 'find') {
    const q = parsed.tail.join(' ') || parsed.head;
    go(q ? findUrl(q) : '/find');
    return done(typed, { ok: true, message: q ? `FIND · everything matching “${q}”` : 'FIND · type what to look for' });
  }

  // Which entities the command names: the words before the code, or the words after it when the
  // function takes an entity and they are not its parameters ("NEWS china", "CAL germany").
  let entities: Resolved[] = []; let tail = parsed.tail; let words = parsed.head; let note = '';
  if (!words && fn.on && tail.length && !fn.params?.some((p) => !p.values)) {
    const left = fn.params ? readParams(fn, tail).rest : tail;
    if (left.length) { words = left.join(' '); tail = tail.filter((w) => !left.includes(w)); }
  }
  if (words) {
    if (!fn.on) { go(findUrl(typed)); return done(typed, { ok: false, message: `${fn.code} (${fn.title}) takes no entity: showing everything that matches “${typed}”` }); }
    try { entities = await resolve(words, fn.entity?.second ? 2 : 1); } catch (err: any) { return done(typed, { ok: false, message: `Could not look up “${words}”: ${err?.message || 'the server did not answer'}` }); }
    if (!entities.length) {
      go(findUrl(words));
      return done(typed, { ok: false, message: `${fn.code}: nothing is called “${words}”. Showing everything that comes close` });
    }
    // Several things can share the words (Georgia the country and the state, "new"): take the one the function can act on.
    entities = entities.map((e) => {
      const alt = fnAppliesTo(fn, e) ? undefined : e.alternatives?.find((a) => fnAppliesTo(fn, a));
      return alt ? { ...alt, iso3: alt.type === 'country' ? alt.id.split(':')[1] : undefined, score: e.score, exact: false, sure: false, alternatives: [e, ...(e.alternatives || []).filter((a) => a.id !== alt.id)] } : e;
    });
    note = entities.filter((e) => !e.exact).map((e) => took(words, e)).join('');
  } else if (fn.on && ctx.loaded && (fnAppliesTo(fn, ctx.loaded) || fn.need !== 'optional')) {
    // A code typed alone acts on the loaded entity. Where the function also works without one and
    // the loaded entity is the wrong kind for it, it opens its general screen instead.
    entities = [{ ...ctx.loaded, score: 0, exact: true, sure: true }];
  }
  const out = commandUrl(fn, entities.map(cmd), tail);
  if ('error' in out) return done(typed, { ok: false, message: out.error });
  if (entities[0]) ctx.load(asLoaded(entities[0]));
  go(out.url);
  const names = entities.filter((e, i) => i === 0 || fn.entity?.second).map((e) => e.name).join(' and ');
  return done(typed, { ok: true, message: `${fn.code} ${fn.title}${names ? ` · ${names}` : ''}${note}` });
}
function finish(typed: string, r: CommandResult): CommandResult {
  if (parseCommand(typed).fn?.special !== 'last') remember(typed);
  setCommandStatus({ ...r, text: typed });
  return r;
}

/** runCommand wired to this window: its router, and its loaded entity. `known` names entities the
 *  caller already knows for some of the words (a row picked in a list), so they are not looked up
 *  again by name, where another entity of the same name could win. */
export function useRunCommand() {
  const navigate = useNavigate();
  const { loaded, load } = useApp();
  return useCallback((text: string, known?: Record<string, Resolved>) => runCommand(text, {
    navigate: (url) => navigate(url), loaded, load,
    resolve: known ? (words, max) => { const k = known[words.trim().toLowerCase()]; return k ? Promise.resolve([k]) : resolveOnServer(words, max); } : undefined,
  }).catch((err) => {
    const r: CommandResult = { ok: false, message: `Could not run “${text}”: ${err?.message || err}` };
    setCommandStatus({ ...r, text }); return r;
  }), [navigate, loaded, load]);
}

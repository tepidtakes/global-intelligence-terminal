// The command line: one input that runs functions ("DEU BUDG", "USA CHN TRADE", "TOP") and searches
// entities and notes. What a function code means comes from the registry (shared/functions.ts);
// running a command is src/command.ts; the keys are in src/keys.ts.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TYPE_ICON, fmtDate } from '../format';
import { ENTITY_TYPE_LABEL } from '../../shared/types';
import type { NoteHit, SearchHit } from '../../shared/types';
import { FUNCTIONS, fnApplies, functionsFor, parseCommand, readParams, type FnDef } from '../../shared/functions';
import { useApp } from '../state';
import { KEYS, isTyping, nothingFocused } from '../keys';
import { asLoaded, commandHistory, matchFunctions, useRunCommand, type Resolved } from '../command';
import { PositionBadge, useSearch } from './common';

export interface CommandLineProps { /** Slim version for a workspace pane header. */ compact?: boolean; }

const MAPPABLE = new Set(['country', 'state', 'county', 'city', 'region', 'igo']);
export const PLACEHOLDER = 'DEU BUDG · USA CHN TRADE · TOP · HELP';

type Row =
  | { kind: 'fn'; fn: FnDef; /** The command this row runs. */ run: string; /** Typed as a code: Enter runs it without moving. */ strong: boolean; forName?: string }
  | { kind: 'entity'; e: SearchHit }
  | { kind: 'note'; n: NoteHit }
  | { kind: 'find'; q: string };

function Snippet({ s }: { s: string }) {
  // Server marks matches with \u0001…\u0002; render them as <mark> without injecting HTML.
  const parts = s.split(/(\u0001[^\u0002]*\u0002)/);
  return <>{parts.map((p, i) => p.startsWith('\u0001') ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>)}</>;
}
/** What to type for an entity: its country code, the alias that matched, or its name. */
const tokenFor = (e: SearchHit) => (e.type === 'country' ? e.id.split(':')[1] : e.matched && e.matched.length <= 8 ? e.matched.toUpperCase() : e.name);
const startsLike = (e: SearchHit, q: string) => { const l = q.toLowerCase(); return !!l && (e.name.toLowerCase().startsWith(l) || (e.matched || '').toLowerCase().startsWith(l) || e.id.split(':')[1].toLowerCase() === l); };
const isLike = (e: SearchHit, q: string) => { const l = q.toLowerCase(); return e.name.toLowerCase() === l || (e.matched || '').toLowerCase() === l || e.id.split(':')[1].toLowerCase() === l; };
const codeStarts = (f: FnDef, w: string) => [f.code, ...(f.aliases || [])].some((c) => c.startsWith(w.toUpperCase()));

// Only one command line per window answers the window-wide keys (the first one on the page).
let keyOwner: symbol | null = null;

export function CommandLine({ compact }: CommandLineProps) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const histAt = useRef<number | null>(null);
  // Entities written into the line by Tab, by the words that stand for them: Enter runs the command on
  // those very entities, not on whatever else has the same name.
  const tabbed = useRef<Record<string, Resolved>>({});
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const nav = useNavigate();
  const { select, loaded, load } = useApp();
  const run = useRunCommand();

  const text = q.trim().replace(/\s+/g, ' ');
  const words = text ? text.split(' ') : [];
  const parsed = useMemo(() => parseCommand(text), [text]);
  // Which of the words name an entity: those before the code, those after it when the function takes
  // an entity there, or all of them when there is no code.
  const fn = parsed.fn;
  const last = words[words.length - 1] || '';
  const lead = words.slice(0, -1).join(' ');
  let entityWords = text;
  if (fn) {
    entityWords = parsed.head;
    if (!entityWords && fn.special === 'find') entityWords = parsed.tail.join(' ');
    else if (!entityWords && fn.on && !fn.params?.some((p) => !p.values)) entityWords = (fn.params ? readParams(fn, parsed.tail).rest : parsed.tail).join(' ');
  }
  // "DEU BU": the last word may be the start of a code, so the words before it are searched as well.
  const partialCode = !fn && words.length > 1 && FUNCTIONS.some((f) => codeStarts(f, last));
  const whole = useSearch(entityWords, undefined, compact ? 6 : 10);
  const leading = useSearch(partialCode ? lead : '', undefined, 5);
  const usingLead = partialCode && !whole.entities.length && leading.entities.length > 0;
  const entities = usingLead ? leading.entities : whole.entities;
  const entityText = usingLead ? lead : entityWords;
  const notes = whole.notes;
  const loading = whole.loading || (partialCode && leading.loading);

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (!text) return out;
    const seen = new Set<string>();
    const add = (f: FnDef, runText: string, strong: boolean, forName?: string) => { if (seen.has(f.code) || seen.size >= 8) return; seen.add(f.code); out.push({ kind: 'fn', fn: f, run: runText, strong, forName }); };
    // With an entity loaded, the functions that act on it come first among equals.
    const forLoaded = (list: FnDef[]) => (loaded ? [...list.filter((f) => fnApplies(f, loaded.type as any)), ...list.filter((f) => !fnApplies(f, loaded.type as any))] : list);
    if (fn) {
      add(fn, text, true);
      if (words.length === 1) for (const f of forLoaded(matchFunctions(text))) add(f, f.code, false);
    } else if (words.length === 1) {
      const m = matchFunctions(text);
      for (const f of [...forLoaded(m.filter((x) => codeStarts(x, text))), ...forLoaded(m.filter((x) => !codeStarts(x, text)))]) add(f, f.code, codeStarts(f, text));
    } else if (partialCode) {
      for (const f of FUNCTIONS) if (codeStarts(f, last)) add(f, `${lead} ${f.code}`, false);
    }
    // An entity typed out ("DEU", "saudi arabia"): the functions that act on it, ready to complete.
    const subject = !fn && !partialCode && entities[0] && isLike(entities[0], entityText) ? entities[0] : undefined;
    if (subject) for (const f of functionsFor(subject.type)) add(f, `${text} ${f.code}`, false, subject.name);
    for (const e of entities) out.push({ kind: 'entity', e });
    for (const n of notes) out.push({ kind: 'note', n });
    if (fn?.special !== 'find') out.push({ kind: 'find', q: text });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, entities, notes, loaded?.type]);

  // What Enter does when nothing was picked: an exact code runs; an entity whose name starts like
  // the words opens; otherwise the words are searched.
  const firstEntity = rows.findIndex((r) => r.kind === 'entity');
  const first = rows[0];
  const preset = !rows.length ? -1 : first.kind === 'fn' && first.strong ? 0
    : firstEntity >= 0 && startsLike((rows[firstEntity] as any).e, entityText) ? firstEntity : rows.length - 1;
  const on = picked !== null && picked < rows.length ? picked : preset;

  useEffect(() => { setPicked(null); setError(''); }, [q]);
  useEffect(() => { if (open && on >= 0) document.getElementById(`${listId}-${on}`)?.scrollIntoView({ block: 'nearest' }); }, [on, open, listId]);

  // Window-wide keys: go to the command line, or start typing into it when nothing has the keyboard.
  useEffect(() => {
    const me = Symbol('command line');
    if (!keyOwner) keyOwner = me;
    const focus = () => { input.current?.focus(); setOpen(true); };
    const k = (e: KeyboardEvent) => {
      if (keyOwner !== me || e.defaultPrevented) return;
      if (KEYS.focus.is(e)) {
        if (e.key === '/' && isTyping(e.target)) return;
        e.preventDefault(); focus(); input.current?.select();
      } else if (KEYS.typeAhead.is(e) && nothingFocused() && !document.querySelector('.modal')) {
        // Not prevented: the browser types this letter into the field that now has the keyboard.
        focus();
      }
    };
    window.addEventListener('keydown', k);
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => { window.removeEventListener('keydown', k); document.removeEventListener('mousedown', h); if (keyOwner === me) keyOwner = null; };
  }, []);

  const leave = () => { setOpen(false); input.current?.blur(); };
  const finished = () => { setQ(''); histAt.current = null; tabbed.current = {}; leave(); };
  const submit = async (command: string) => {
    setBusy(true);
    const known = Object.fromEntries(Object.entries(tabbed.current).filter(([w]) => command.toLowerCase().includes(w)));
    const r = await run(command, Object.keys(known).length ? known : undefined);
    setBusy(false);
    // Went somewhere: the line is free for the next command. Otherwise the words stay, to be corrected.
    if (r.url) finished(); else { setError(r.message); setOpen(true); }
  };
  const go = (i: number, onMap = false) => {
    const row = rows[i];
    // Nothing picked, or the list is still filling: run the words as typed.
    if (!row || (row.kind === 'find' && picked === null)) { if (text) void submit(text); return; }
    if (row.kind === 'fn') return void submit(row.run);
    finished();
    if (row.kind === 'find') return nav(`/find?q=${encodeURIComponent(row.q)}`);
    if (row.kind === 'note') return nav(`/research/${row.n.id}`);
    load(asLoaded({ ...row.e, iso3: row.e.type === 'country' ? row.e.id.split(':')[1] : undefined }));
    if (onMap && MAPPABLE.has(row.e.type)) { select(row.e.id, { fly: true }); nav('/'); }
    else nav(`/entity/${encodeURIComponent(row.e.id)}`);
  };
  /** Tab: the highlighted row, written into the line, ready for a code or parameters. */
  const complete = (row: Row | undefined) => {
    if (!row || row.kind === 'note' || row.kind === 'find') return false;
    if (row.kind === 'fn') setQ(`${row.run} `);
    else {
      const t = tokenFor(row.e);
      tabbed.current[t.toLowerCase()] = { ...asLoaded({ ...row.e, iso3: row.e.type === 'country' ? row.e.id.split(':')[1] : undefined }), score: row.e.score, exact: true, sure: true };
      setQ(fn ? (parsed.head ? `${t} ${fn.code} ${parsed.tail.join(' ')}`.trimEnd() + ' ' : `${fn.code} ${t} `) : usingLead ? `${t} ${last}` : `${t} `);
    }
    return true;
  };
  const recall = (step: number) => {
    const h = commandHistory();
    if (!h.length) return;
    const at = histAt.current === null ? (step < 0 ? h.length - 1 : null) : histAt.current + step;
    if (at === null || at >= h.length) { histAt.current = null; setQ(''); return; }
    histAt.current = Math.max(0, at); setQ(h[histAt.current]); setOpen(false);
  };
  // Up and Down walk the history while the line is empty or still shows a recalled command.
  const inHistory = () => !q || (histAt.current !== null && commandHistory()[histAt.current] === q);

  let group = '';
  const head = (name: string) => (group !== name ? ((group = name), <div className="grp" role="presentation">{name}</div>) : null);
  const showList = open && !!text;
  return (
    <div className={`search cmd${compact ? ' compact' : ''}`} ref={box}>
      {loaded && (
        <button type="button" className="cmdChip" onClick={() => { load(null); input.current?.focus(); }}
          title={`Loaded: ${loaded.name}. A function code typed alone acts on it. Click to clear.`} aria-label={`Loaded entity: ${loaded.name}. Click to clear.`}>
          <span aria-hidden>{loaded.flag || TYPE_ICON[loaded.type]}</span>{!compact && <span className="nm">{loaded.name}</span>}<span className="x" aria-hidden>✕</span>
        </button>
      )}
      <div className="cmdField">
        <span className="icon" aria-hidden>›</span>
        <input ref={input} value={q} placeholder={compact ? 'Code or name' : PLACEHOLDER} aria-label="Command line: a function code, an entity, or words to search"
          title="Type an entity and a function code (DEU BUDG), a code alone (TOP), or anything to search. HELP lists every function."
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={showList && on >= 0 ? `${listId}-${on}` : undefined}
          aria-busy={busy} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          onChange={(e) => { histAt.current = null; setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (KEYS.down.is(e)) { e.preventDefault(); if (inHistory()) recall(1); else { setOpen(true); setPicked(Math.min(on + 1, rows.length - 1)); } }
            else if (KEYS.up.is(e)) { e.preventDefault(); if (inHistory()) recall(-1); else setPicked(Math.max(on - 1, 0)); }
            else if (KEYS.run.is(e) || KEYS.onMap.is(e)) { e.preventDefault(); go(showList ? on : -1, e.shiftKey); }
            else if (KEYS.complete.is(e)) { if (showList && complete(rows[on])) e.preventDefault(); }
            else if (KEYS.leave.is(e)) { e.preventDefault(); leave(); }
          }} />
        {!q && !compact && <span className="kbd" aria-hidden>Ctrl K</span>}
      </div>
      {showList && (
        <div className="results" id={listId} role="listbox" aria-label="Functions, entities and notes that match">
          {error && <div className="cmdError" role="alert">{error}</div>}
          {rows.map((row, i) => {
            const props = { id: `${listId}-${i}`, role: 'option' as const, 'aria-selected': i === on, className: `result${i === on ? ' on' : ''}${row.kind === 'fn' ? ' fnRow' : ''}`, onMouseEnter: () => setPicked(i) };
            if (row.kind === 'fn') {
              return <div key={`f${row.fn.code}`}>{head('Functions')}
                <div {...props} onMouseDown={(ev) => { ev.preventDefault(); go(i); }}>
                  <span className="fnCode">{row.fn.code}</span>
                  <div className="sub one"><span className="nm">{row.fn.title}</span>{row.fn.on && row.fn.need !== 'optional' && !row.forName && <span title="Needs an entity"> *</span>}{row.forName ? ` for ${row.forName}` : ''} — {row.fn.about}</div>
                  <span className="tiny muted run">{row.run.toUpperCase() === row.fn.code ? '' : row.run}</span>
                </div></div>;
            }
            if (row.kind === 'note') {
              return <div key={row.n.id}>{head('Your notes')}
                <div {...props} onMouseDown={(ev) => { ev.preventDefault(); go(i); }}>
                  <span aria-hidden>{TYPE_ICON.note}</span>
                  <div style={{ minWidth: 0 }}><div className="nm">{row.n.title}</div><div className="sub"><Snippet s={row.n.snippet} /></div></div>
                  <span className="tiny muted">{fmtDate(row.n.updatedAt)}</span>
                </div></div>;
            }
            if (row.kind === 'find') {
              return <div key="find" className="findRow">
                <div {...props} onMouseDown={(ev) => { ev.preventDefault(); setPicked(i); finished(); nav(`/find?q=${encodeURIComponent(row.q)}`); }}>
                  <span aria-hidden>⌕</span>
                  <div style={{ minWidth: 0 }}><div className="nm">Search everything for “{row.q}”</div>{!entities.length && !notes.length && !fn && <div className="sub">{loading ? 'Searching…' : 'No entity or note matches yet. Try another spelling, an abbreviation (KSA, NATO) or a ticker.'}</div>}</div>
                  <span />
                </div></div>;
            }
            const e = row.e;
            return <div key={e.id}>{head('Entities')}
              <div {...props} onMouseDown={(ev) => { ev.preventDefault(); go(i, ev.shiftKey); }}>
                <span aria-hidden>{e.flag || TYPE_ICON[e.type]}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{e.name}{e.matched && <span className="tiny muted"> · matched “{e.matched}”</span>}</div>
                  <div className="sub">{ENTITY_TYPE_LABEL[e.type]}{e.parentName ? ` · ${e.parentName}` : ''}{e.summary ? ` — ${e.summary}` : ''}</div>
                </div>
                {e.position ? <PositionBadge p={e.position} /> : <span className="badge">{ENTITY_TYPE_LABEL[e.type]}</span>}
              </div></div>;
          })}
          <div className="foot"><span><span className="kbd">↑↓</span> move</span><span><span className="kbd">Enter</span> run or open</span><span><span className="kbd">Tab</span> complete</span><span><span className="kbd">Shift Enter</span> show on map</span><span><span className="kbd">Esc</span> back to the page</span></div>
        </div>
      )}
    </div>
  );
}

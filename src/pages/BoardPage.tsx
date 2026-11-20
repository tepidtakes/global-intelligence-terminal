// The workspace (function BOARD): one to four panes side by side, each a frame of this same app
// running its own function. This page draws the frames, marks the active one, and holds the toolbar
// (layout, link groups, saved workspaces). Each pane draws its own header (src/components/PaneShell.tsx).
// The model, the storage and the messages are in src/board.ts.
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CmdEntity } from '../../shared/functions';
import {
  GROUPS, LAYOUTS, MIN_SPLIT, cleanWorkspace, findWorkspace, fnOfUrl, groupColor, keyTarget, layoutOf, onPaneMessage, paneCount, paneName,
  readCurrent, readSaved, safePaneUrl, savedNamed, starters, toPane, withSaved, withoutSaved, workspaceKey, writeCurrent, writeSaved,
  type Group, type Layout, type Workspace,
} from '../board';
import { IS_PANE } from '../pane';
import { useApp, useAuth, type LoadedEntity } from '../state';

const NARROW = '(max-width: 899px)';
const GAP = 6; // px between panes; the dividers sit in it (matches .boardGrid in board.css)

export function BoardPage() {
  // BOARD typed inside a pane would put a workspace inside a workspace.
  if (IS_PANE) return <div className="page"><div className="card"><div className="bd stack"><h2>This pane is already part of a workspace</h2><p className="small muted">The workspace is the page around this pane. To change its layout or open another one, use the bar above the panes.</p><div><a className="btn sm" href="/board" target="_top">Show the workspace alone</a></div></div></div></div>;
  return <Board />;
}

/** One pane. The address is only used when the frame is created: after that the pane moves by
 *  itself and reports where it is, and writing the address again would reload it. */
const PaneFrame = memo(forwardRef<HTMLIFrameElement, { no: number; src: string; title: string }>(function PaneFrame({ no, src, title }, ref) {
  const [first] = useState(src);
  return <iframe ref={ref} name={paneName(no)} src={first} title={title} loading="lazy" />;
}));

function LayoutIcon({ layout }: { layout: Layout }) {
  return <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden>{layout.cells.map(([x, y, w, h], i) => <rect key={i} x={1 + x * 9.5} y={1 + y * 7.5} width={w * 9.5 - 1.5} height={h * 7.5 - 1.5} rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />)}</svg>;
}

function Board() {
  const { user } = useAuth();
  const { loaded, selected, toast } = useApp();
  const [sp, setSp] = useSearchParams();
  const open = sp.get('open');

  // "Country desk" opens on the country loaded in this window, or else the one selected on the map.
  const country = useMemo<CmdEntity | null>(() => {
    if (loaded?.type === 'country') return loaded as CmdEntity;
    return selected?.startsWith('country:') ? { id: selected, type: 'country' } : null;
  }, [loaded, selected]);
  const starter = useMemo(() => starters(country), [country]);

  const [ws, setWs] = useState<Workspace>(() => readCurrent() || starter[0]);
  const [gen, setGen] = useState(0); // goes up when a workspace is opened: every frame starts again
  const [active, setActive] = useState(0);
  const [saved, setSaved] = useState<Workspace[] | null>(null);
  const count = paneCount(ws);
  const layout = layoutOf(ws.layout);

  const frames = useRef<(HTMLIFrameElement | null)[]>([]);
  const wsRef = useRef(ws); wsRef.current = ws;
  const activeRef = useRef(active); activeRef.current = active;
  const groupEntity = useRef<Partial<Record<Group, LoadedEntity>>>({});
  const paneEntity = useRef<(LoadedEntity | undefined)[]>([]);
  const wantFocus = useRef(-1);

  // ── Saved workspaces ──
  const signedIn = !!user;
  useEffect(() => {
    if (user === undefined) return; // not known yet
    let stale = false;
    readSaved(signedIn).then((l) => { if (!stale) setSaved(l); }).catch(() => { if (!stale) setSaved([]); });
    return () => { stale = true; };
  }, [user === undefined, signedIn, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const store = useCallback(async (list: Workspace[], done: string) => {
    try { await writeSaved(signedIn, list); setSaved(list); toast(done); }
    catch { toast('Could not save: the terminal’s server did not answer'); }
  }, [signedIn, toast]);

  const openWorkspace = useCallback((w: Workspace) => {
    // Each pane remembers its loaded entity for the session (src/state.tsx keeps it under the frame's
    // name). A newly opened workspace starts clean, so a pane cannot drag its link group to an old entity.
    try { for (let i = 1; i <= w.panes.length; i++) sessionStorage.removeItem(`git.loaded.${paneName(i)}`); } catch { /* private mode */ }
    groupEntity.current = {}; paneEntity.current = []; shown.current = new Set();
    setWs(w); setActive(0); setGen((g) => g + 1);
  }, []);
  // /board?open=name (the command "BOARD name"): open it once the saved list is known, then drop the
  // parameter so a reload brings back the workspace as it was left.
  useEffect(() => {
    if (open === null || saved === null) return;
    const w = findWorkspace(open, saved, starter);
    if (w) openWorkspace(w); else if (open.trim()) toast(`No workspace starts with “${open.trim()}”`);
    setSp((p) => { const n = new URLSearchParams(p); n.delete('open'); return n; }, { replace: true });
  }, [open, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  // The workspace on screen is kept as it changes: nothing to save by hand to get it back.
  useEffect(() => { writeCurrent(ws); }, [ws]);

  // ── Narrow screens: one pane at a time ──
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => { const mq = window.matchMedia(NARROW); const on = () => setNarrow(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  // A pane gets its frame the first time it is shown, and keeps it after.
  const shown = useRef(new Set<number>());
  for (let i = 0; i < count; i++) if (!narrow || i === active) shown.current.add(i);
  for (const i of [...shown.current]) if (i >= count) shown.current.delete(i);
  useEffect(() => { if (active >= count) setActive(count - 1); }, [active, count]);

  // ── Panes: what they report, and what they are told ──
  const tell = useCallback((i: number) => {
    const w = wsRef.current;
    toPane(frames.current[i], { t: 'state', group: w.panes[i].group, active: i === activeRef.current, panes: paneCount(w) });
  }, []);
  const members = (g: Group, except: number) => wsRef.current.panes.map((p, i) => (p.group === g && i !== except && i < paneCount(wsRef.current) ? i : -1)).filter((i) => i >= 0);
  const focusPane = useCallback((i: number) => {
    setActive(i);
    const f = frames.current[i];
    if (!f) { wantFocus.current = i; return; } // not created yet (narrow screen): it takes the cursor when it says hello
    f.focus(); toPane(f, { t: 'focus' });
  }, []);
  const setGroup = useCallback((i: number, g: Group) => {
    if (!GROUPS.includes(g)) return;
    wsRef.current = { ...wsRef.current, panes: wsRef.current.panes.map((p, k) => (k === i ? { ...p, group: g } : p)) };
    setWs(wsRef.current);
    if (!g) return;
    // Joining a group: take the group's entity. A group with nobody in it starts from this pane's.
    const others = members(g, i); const mine = paneEntity.current[i]; const theirs = groupEntity.current[g];
    if (!others.length) groupEntity.current[g] = mine;
    else if (theirs) { if (theirs.id !== mine?.id) toPane(frames.current[i], { t: 'entity', entity: theirs }); }
    else if (mine) { groupEntity.current[g] = mine; for (const k of others) toPane(frames.current[k], { t: 'entity', entity: mine }); }
  }, []);
  const onKey = useCallback((key: string) => {
    const to = keyTarget(key, activeRef.current, paneCount(wsRef.current));
    if (to >= 0) focusPane(to);
  }, [focusPane]);

  useEffect(() => onPaneMessage(() => frames.current, (m, i) => {
    const w = wsRef.current;
    if (m.t === 'hello') {
      tell(i);
      const e = groupEntity.current[w.panes[i].group];
      if (e) toPane(frames.current[i], { t: 'entity', entity: e });
      if (wantFocus.current === i) { wantFocus.current = -1; frames.current[i]?.focus(); toPane(frames.current[i], { t: 'focus' }); }
    } else if (m.t === 'loaded' && m.entity?.id) {
      paneEntity.current[i] = m.entity;
      const g = w.panes[i].group; const cur = groupEntity.current[g];
      // A pane that only followed its group does not move the group. If the group has moved on in
      // the meantime (two panes changed at once), the pane is brought to where the group is now.
      if (m.follow) { if (g && cur && cur.id !== m.entity.id) toPane(frames.current[i], { t: 'entity', entity: cur }); }
      else if (g && cur?.id !== m.entity.id) {
        groupEntity.current[g] = m.entity;
        for (const k of members(g, i)) toPane(frames.current[k], { t: 'entity', entity: m.entity });
      }
    } else if (m.t === 'location') {
      const url = safePaneUrl(m.url);
      if (url && url !== w.panes[i].url) setWs((x) => ({ ...x, panes: x.panes.map((p, k) => (k === i ? { ...p, url } : p)) }));
    } else if (m.t === 'focus') setActive(i);
    else if (m.t === 'key') onKey(String(m.key));
    else if (m.t === 'group') setGroup(i, m.group);
  }), [tell, onKey, setGroup]);
  // Every pane is told its link group and whether it is the active one, whenever either changes.
  const groups = ws.panes.map((p) => p.group).join(',');
  useEffect(() => { for (let i = 0; i < count; i++) tell(i); }, [groups, active, count, gen, tell]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const key = workspaceKey(e); if (!key) return; e.preventDefault(); onKey(key); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onKey]);

  // ── Toolbar actions ──
  const setLayout = (id: string) => setWs((w) => ({ ...w, layout: id }));
  const [naming, setNaming] = useState<string | null>(null); // the name being typed for "Save as", or null
  const base = saved ? savedNamed(saved, ws.name) : undefined;
  const edited = !!base && JSON.stringify(base) !== JSON.stringify(ws);
  const saveAs = (name: string) => {
    const w = cleanWorkspace({ ...ws, name });
    if (!w?.name || !saved) return;
    setWs(w); setNaming(null);
    void store(withSaved(saved, w), `Saved “${w.name}”${signedIn ? '' : ' in this browser'}`);
  };
  const saveNow = () => { if (base) saveAs(base.name); else setNaming(ws.name); };
  const remove = () => {
    if (!base || !saved || !confirm(`Delete the saved workspace “${base.name}”? The panes on screen stay as they are.`)) return;
    void store(withoutSaved(saved, base.name), `Deleted “${base.name}”`);
  };
  const pick = (v: string) => {
    const [kind, n] = [v.slice(0, 1), Number(v.slice(1))];
    const w = kind === 's' ? saved?.[n] : starter[n];
    if (w) openWorkspace(w);
  };
  // A starter with the same name as a saved workspace is hidden: the saved one opens under that name.
  const starterShown = starter.map((w, i) => ({ w, i })).filter(({ w }) => !saved || !savedNamed(saved, w.name));

  // ── Dividers ──
  const grid = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const hasCols = layout.cells.some((c) => c[2] === 1), hasRows = layout.cells.some((c) => c[3] === 1);
  const col = hasCols ? ws.split?.[0] ?? layout.col ?? 0.5 : 1, row = hasRows ? ws.split?.[1] ?? 0.5 : 1;
  const clamp = (v: number) => Math.round(Math.min(1 - MIN_SPLIT, Math.max(MIN_SPLIT, v)) * 1000) / 1000;
  const setSplit = (axis: 0 | 1, v: number) => setWs((w) => { const s: [number, number] = [w.split?.[0] ?? layoutOf(w.layout).col ?? 0.5, w.split?.[1] ?? 0.5]; s[axis] = clamp(v); return { ...w, split: s }; });
  const divider = (axis: 0 | 1) => {
    const value = axis === 0 ? col : row;
    const move = (e: React.PointerEvent) => {
      if (!dragging || !grid.current) return;
      const r = grid.current.getBoundingClientRect();
      setSplit(axis, axis === 0 ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height);
    };
    const key = (e: React.KeyboardEvent) => {
      const step = (axis === 0 ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[e.key as 'ArrowLeft'];
      if (step) { e.preventDefault(); setSplit(axis, value + step * 0.02); }
    };
    // The row divider only spans the columns that are split in two.
    const fromCol = axis === 1 && hasCols && !layout.cells.some((c) => c[3] === 1 && c[0] === 0);
    const at = `calc((100% - ${GAP}px) * ${value})`;
    return (
      <div key={axis} className={`boardSplit ${axis === 0 ? 'v' : 'h'}`} role="separator" tabIndex={0} aria-orientation={axis === 0 ? 'vertical' : 'horizontal'}
        aria-label={axis === 0 ? 'Divider between the left and right panes: drag, or use the left and right arrow keys' : 'Divider between the upper and lower panes: drag, or use the up and down arrow keys'}
        aria-valuenow={Math.round(value * 100)} aria-valuemin={MIN_SPLIT * 100} aria-valuemax={100 - MIN_SPLIT * 100}
        style={axis === 0 ? { left: at } : { top: at, left: fromCol ? `calc((100% - ${GAP}px) * ${col} + ${GAP}px)` : 0 }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); }} onPointerMove={move}
        onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onKeyDown={key}
        onDoubleClick={() => setWs((w) => { const { split, ...rest } = w; return rest; })} title="Drag to resize. Double-click to reset." />
    );
  };

  const fns = ws.panes.map((p) => fnOfUrl(p.url));
  const paneTitle = (i: number) => `Pane ${i + 1}${fns[i] ? `: ${fns[i]!.code} ${fns[i]!.title}` : ''}`;
  const where = signedIn ? 'Saved workspaces are kept with your account.' : 'Saved workspaces are kept in this browser. Sign in to keep them with your account.';
  return (
    <div className="board">
      <div className="boardBar" role="toolbar" aria-label="Workspace">
        <span className="boardName" title={where}><b>{ws.name || 'Workspace'}</b>{edited && <span className="tiny muted"> · changed since saved</span>}</span>
        <div className="seg" role="radiogroup" aria-label="Layout">
          {LAYOUTS.map((l) => <button key={l.id} type="button" role="radio" aria-checked={l.id === layout.id} className={l.id === layout.id ? 'on' : ''} title={l.label} aria-label={l.label} onClick={() => setLayout(l.id)}><LayoutIcon layout={l} /></button>)}
        </div>
        <select className="input boardOpen" aria-label="Open a workspace" value="" onChange={(e) => pick(e.target.value)}>
          <option value="" disabled>Open…</option>
          {saved && saved.length > 0 && <optgroup label="Saved">{saved.map((w, i) => <option key={w.name} value={`s${i}`}>{w.name}</option>)}</optgroup>}
          <optgroup label="Starters">{starterShown.map(({ w, i }) => <option key={w.name} value={`t${i}`}>{w.name}</option>)}</optgroup>
        </select>
        {naming === null ? (
          <>
            <button type="button" className="btn sm" onClick={saveNow} disabled={!saved} title={base ? `Save the panes on screen as “${base.name}”. ${where}` : `Save the panes on screen under a name. ${where}`}>Save</button>
            <button type="button" className="btn sm" onClick={() => setNaming(base ? `${ws.name} copy` : ws.name)} disabled={!saved} title="Save the panes on screen under a new name">Save as…</button>
            {base && <button type="button" className="btn ghost sm danger" onClick={remove}>Delete</button>}
          </>
        ) : (
          <form className="row boardSave" onSubmit={(e) => { e.preventDefault(); saveAs(naming); }} onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null); }}>
            <input className="input" autoFocus maxLength={60} aria-label="Name for this workspace" placeholder="Name for this workspace" value={naming} onChange={(e) => setNaming(e.target.value)} />
            <button type="submit" className="btn primary sm" disabled={!naming.trim()}>{savedNamed(saved || [], naming) ? 'Replace' : 'Save'}</button>
            <button type="button" className="btn ghost sm" onClick={() => setNaming(null)}>Cancel</button>
          </form>
        )}
        <span className="spacer" />
        <span className="boardPane">
          <span className="small muted">Pane {active + 1} link</span>
          <span className="seg" role="radiogroup" aria-label={`Link group of pane ${active + 1}`}>
            {GROUPS.map((g) => <button key={g} type="button" role="radio" aria-checked={ws.panes[active]?.group === g} className={`boardGroup${ws.panes[active]?.group === g ? ' on' : ''}`} style={{ ['--g' as any]: groupColor(g) }} onClick={() => setGroup(active, g)} title={g ? `Group ${g}: panes with the same letter follow the same entity` : 'Not linked'}>{g || 'None'}</button>)}
          </span>
          <a className="btn sm" href={ws.panes[active]?.url} target="_blank" rel="noopener" title={`Open what pane ${active + 1} shows in a window of its own`}>Open in window</a>
        </span>
        <span className="tiny muted boardKeys" title="Ctrl or Alt with 1–4 goes to a pane. F6 goes to the next pane, Shift+F6 to the one before."><span className="kbd">Alt</span>+<span className="kbd">1</span>…<span className="kbd">{count}</span> <span className="kbd">F6</span></span>
      </div>
      {narrow && count > 1 && (
        <div className="boardTabs" role="tablist" aria-label="Panes">
          {ws.panes.slice(0, count).map((p, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === active} className={i === active ? 'on' : ''} onClick={() => setActive(i)}>
              <span className="n">{i + 1}</span> {fns[i]?.code || '—'}{p.group && <span className="g" style={{ ['--g' as any]: groupColor(p.group) }} title={`Link group ${p.group}`}>{p.group}</span>}
            </button>
          ))}
        </div>
      )}
      {open !== null ? <div className="boardGrid" aria-busy="true"><div className="boardWait muted">Opening…</div></div> : (
        <div ref={grid} className={`boardGrid${dragging ? ' dragging' : ''}${narrow ? ' narrow' : ''}`}
          style={narrow ? undefined : { gridTemplateColumns: hasCols ? `minmax(0, ${col}fr) minmax(0, ${1 - col}fr)` : 'minmax(0, 1fr)', gridTemplateRows: hasRows ? `minmax(0, ${row}fr) minmax(0, ${1 - row}fr)` : 'minmax(0, 1fr)' }}>
          {layout.cells.map(([x, y, w, h], i) => (
            <div key={`${gen}-${i}`} className={`boardCell${i === active ? ' active' : ''}`} hidden={narrow && i !== active}
              style={narrow ? undefined : { gridColumn: `${x + 1} / span ${hasCols ? w : 1}`, gridRow: `${y + 1} / span ${hasRows ? h : 1}` }}>
              {shown.current.has(i) && <PaneFrame ref={(el) => { frames.current[i] = el; }} no={i + 1} src={ws.panes[i].url} title={paneTitle(i)} />}
            </div>
          ))}
          {!narrow && hasCols && divider(0)}
          {!narrow && hasRows && divider(1)}
        </div>
      )}
    </div>
  );
}

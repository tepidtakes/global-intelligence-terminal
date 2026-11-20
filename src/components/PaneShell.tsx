// The frame around a page inside a workspace pane (see src/board.ts and src/pages/BoardPage.tsx).
// Where a full window has the top bar, a pane has one slim row: its number, its link group, the
// function on screen, its own command line, back and forward, the live indicator, and a way out to
// the full window. The pane keeps the workspace page informed (where it is, what entity is loaded,
// that it was clicked) and does what the workspace page asks (follow the link group, take the cursor).
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { fnAt } from '../../shared/functions';
import { api } from '../api';
import { GROUPS, followUrl, groupColor, onBoardMessage, toParent, workspaceKey, type Group } from '../board';
import { PANE_NO } from '../pane';
import { useApp } from '../state';
import { CommandLine } from './CommandLine';
import { ErrorBoundary } from './ErrorBoundary';
import { LiveBadge } from './LiveBadge';

const MAX_HISTORY = 50;

export function PaneShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const { loaded, load } = useApp();
  const url = loc.pathname + loc.search + loc.hash;
  const at = useMemo(() => fnAt(loc), [url]); // eslint-disable-line react-hooks/exhaustive-deps
  const [st, setSt] = useState<{ group: Group; active: boolean; panes: number }>({ group: '', active: false, panes: 1 });
  const bar = useRef<HTMLElement>(null);
  // The latest values, for the listeners below (they are set up once).
  const now = useRef({ loc, loaded, load, navigate });
  now.current = { loc, loaded, load, navigate };

  // ── Talking with the workspace page ──
  useEffect(() => {
    const off = onBoardMessage((m) => {
      if (m.t === 'state') setSt({ group: m.group, active: m.active, panes: m.panes });
      else if (m.t === 'focus') { window.focus(); const input = bar.current?.querySelector<HTMLInputElement>('.paneCmd input'); input?.focus(); input?.select(); }
      else if (m.t === 'entity') {
        // The link group moved to another entity: run this pane's function for it. A function that
        // does not act on this kind of entity stays on screen, and a code typed next acts on the new entity.
        const next = followUrl(now.current.loc, m.entity);
        told.current = m.entity.id;
        now.current.load(m.entity);
        if (next) now.current.navigate(next);
      }
    });
    toParent({ t: 'hello', pane: PANE_NO });
    return off;
  }, []);
  useEffect(() => { toParent({ t: 'location', pane: PANE_NO, url }); }, [url]);
  useEffect(() => {
    const focus = () => toParent({ t: 'focus', pane: PANE_NO });
    const key = (e: KeyboardEvent) => { const k = workspaceKey(e); if (!k) return; e.preventDefault(); e.stopPropagation(); toParent({ t: 'key', pane: PANE_NO, key: k }); };
    window.addEventListener('focus', focus);
    window.addEventListener('pointerdown', focus, true);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('focus', focus); window.removeEventListener('pointerdown', focus, true); window.removeEventListener('keydown', key, true); };
  }, []);

  // ── The loaded entity ──
  // An address that names an entity loads it, whichever way the pane got there (a command, a link,
  // a saved workspace). Done once per address, so anything else that loads an entity is not undone.
  const urlEntity = at?.entityId;
  const [settled, setSettled] = useState<string | undefined>(undefined);
  const starting = useRef(true);
  useEffect(() => {
    // A pane that comes back after a reload keeps the entity it had (a pane can show a function that
    // did not follow its link group: its address then names an older entity than the one loaded).
    const resumed = starting.current && !!now.current.loaded; starting.current = false;
    if (!urlEntity) return;
    if (resumed || now.current.loaded?.id === urlEntity) { setSettled(urlEntity); return; }
    let stale = false;
    api(`/entity/${encodeURIComponent(urlEntity)}`)
      .then((r) => { const e = r?.entity; if (!stale && e?.id) now.current.load({ id: e.id, type: e.type, name: e.name, flag: e.flag, iso3: e.iso3 }); })
      .catch(() => { /* unknown entity, or offline: the page itself says so */ })
      .finally(() => { if (!stale) setSettled(urlEntity); });
    return () => { stale = true; };
  }, [urlEntity]);
  // Tell the workspace page, but not while the address still names an entity that is being looked up
  // (what was loaded before would be out of date, and would drag the link group back).
  // `follow` marks an entity the workspace page itself sent here: it must not move the group again.
  const pending = !!urlEntity && settled !== urlEntity;
  const told = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!loaded || pending) return;
    const follow = told.current === loaded.id;
    if (!follow) told.current = undefined;
    toParent({ t: 'loaded', pane: PANE_NO, entity: loaded, ...(follow ? { follow } : {}) });
  }, [loaded, pending]);

  // ── Back and forward, for this pane alone ──
  // The browser keeps one history for the whole tab, so its "back" may move a different pane. The
  // pane remembers where it has been itself.
  const hist = useRef({ list: [url], i: 0 });
  const [, redraw] = useState(0);
  useEffect(() => {
    const h = hist.current;
    if (h.list[h.i] === url) return;
    if (navType === 'REPLACE') h.list[h.i] = url;
    else if (navType === 'POP' && h.list[h.i - 1] === url) h.i--;
    else if (navType === 'POP' && h.list[h.i + 1] === url) h.i++;
    else { h.list = [...h.list.slice(Math.max(0, h.i + 1 - MAX_HISTORY), h.i + 1), url]; h.i = h.list.length - 1; }
    redraw((n) => n + 1);
  }, [url, navType]);
  const go = useCallback((step: number) => {
    const h = hist.current; const to = h.list[h.i + step];
    if (to === undefined) return;
    h.i += step; navigate(to); redraw((n) => n + 1);
  }, [navigate]);

  const nextGroup = GROUPS[(GROUPS.indexOf(st.group) + 1) % GROUPS.length];
  const linkTitle = `${st.group ? `Link group ${st.group}: this pane follows the entity loaded in the other ${st.group} panes, and they follow this one.` : 'Not linked to other panes.'} Click for ${nextGroup ? `group ${nextGroup}` : 'no link'}.`;
  return (
    <div className={`paneApp${st.active ? ' active' : ''}`}>
      <header className="paneBar" ref={bar}>
        <span className="paneNo" title={st.active ? `Pane ${PANE_NO} (the active pane)` : `Pane ${PANE_NO}`} aria-label={`Pane ${PANE_NO}${st.active ? ', active' : ''}`} aria-current={st.active || undefined}>{PANE_NO}</span>
        <button type="button" className={`paneLink${st.group ? ' on' : ''}`} style={{ ['--g' as any]: groupColor(st.group) }} onClick={() => toParent({ t: 'group', pane: PANE_NO, group: nextGroup })} title={linkTitle} aria-label={linkTitle}>
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden><path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a3 3 0 014.3 4.3L11.3 8.8M9 11.500l-1.2 1.2a3 3 0 01-4.3-4.3L4.700 7.200" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span>{st.group || '–'}</span>
        </button>
        <span className="paneFn" title={at ? `${at.fn.code}: ${at.fn.about}` : undefined}>
          {at ? <><b>{at.fn.code}</b> <span className="ttl">{at.fn.title}</span></> : <span className="ttl">No function</span>}
          {loaded && <span className="ent"> · {loaded.flag ? `${loaded.flag} ` : ''}{loaded.name}</span>}
        </span>
        <div className="paneCmd"><CommandLine compact /></div>
        <button type="button" className="btn ghost sm" onClick={() => go(-1)} disabled={hist.current.i <= 0} title="Back in this pane" aria-label="Back in this pane">‹</button>
        <button type="button" className="btn ghost sm" onClick={() => go(1)} disabled={hist.current.i >= hist.current.list.length - 1} title="Forward in this pane" aria-label="Forward in this pane">›</button>
        <LiveBadge />
        <a className="btn ghost sm" href={url} target="_top" title="Open this pane in the full window" aria-label="Open this pane in the full window">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden><path d="M9.500 2.500h4v4M13.500 2.500l-5 5M6.500 2.500h-4v11h11v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </header>
      <main className="main"><ErrorBoundary resetKey={loc.pathname} label="this page"><Suspense fallback={<div className="page" aria-busy="true"><div className="skeleton" style={{ height: 28, width: '40%' }} /><div className="skeleton" style={{ height: 14, width: '70%' }} /><div className="skeleton" style={{ height: 220 }} /></div>}><Outlet /></Suspense></ErrorBoundary></main>
    </div>
  );
}

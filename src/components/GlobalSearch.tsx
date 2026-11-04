import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TYPE_ICON, fmtDate } from '../format';
import { ENTITY_TYPE_LABEL } from '../../shared/types';
import { useApp } from '../state';
import { PositionBadge, useSearch } from './common';

const MAPPABLE = new Set(['country', 'state', 'county', 'city', 'region', 'igo']);

function Snippet({ s }: { s: string }) {
  // Server marks matches with \u0001…\u0002; render them as <mark> without injecting HTML.
  const parts = s.split(/(\u0001[^\u0002]*\u0002)/);
  return <>{parts.map((p, i) => p.startsWith('\u0001') ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>)}</>;
}

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const { select } = useApp();
  const { entities, notes, loading } = useSearch(q, undefined, 12);
  const items = [...entities.map((e) => ({ kind: 'entity' as const, e })), ...notes.map((n) => ({ kind: 'note' as const, n }))];

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); input.current?.focus(); input.current?.select(); setOpen(true); }
    };
    window.addEventListener('keydown', k);
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => { window.removeEventListener('keydown', k); document.removeEventListener('mousedown', h); };
  }, []);
  useEffect(() => setOn(0), [q]);

  const go = (i: number, onMap = false) => {
    const it = items[i]; if (!it) return;
    setOpen(false); input.current?.blur();
    if (it.kind === 'note') return nav(`/research/${it.n.id}`);
    if (onMap && MAPPABLE.has(it.e.type)) { select(it.e.id, { fly: true }); nav('/'); }
    else nav(`/entity/${encodeURIComponent(it.e.id)}`);
  };

  let lastType = '';
  return (
    <div className="search" ref={box}>
      <span className="icon" aria-hidden>⌕</span>
      <input ref={input} value={q} placeholder="Search countries, leaders, companies, commodities, notes…" aria-label="Global search"
        role="combobox" aria-expanded={open} aria-controls="search-results"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOn((i) => Math.min(i + 1, items.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setOn((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); go(on, e.shiftKey); }
          else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
        }} />
      {!q && <span className="kbd" aria-hidden>Ctrl K</span>}
      {open && q.trim() && (
        <div className="results" id="search-results" role="listbox">
          {!items.length && <div className="empty">{loading ? 'Searching…' : `No matches for “${q}”. Try a different spelling, an abbreviation (e.g. KSA, NATO) or a ticker.`}</div>}
          {items.map((it, i) => {
            if (it.kind === 'note') {
              const head = lastType !== 'note' ? <div className="grp">Your notes</div> : null; lastType = 'note';
              return <div key={it.n.id}>{head}
                <div className={`result${i === on ? ' on' : ''}`} role="option" aria-selected={i === on} onMouseEnter={() => setOn(i)} onMouseDown={(ev) => { ev.preventDefault(); go(i); }}>
                  <span aria-hidden>{TYPE_ICON.note}</span>
                  <div style={{ minWidth: 0 }}><div className="nm">{it.n.title}</div><div className="sub"><Snippet s={it.n.snippet} /></div></div>
                  <span className="tiny muted">{fmtDate(it.n.updatedAt)}</span>
                </div></div>;
            }
            const e = it.e;
            const head = lastType !== 'entities' ? <div className="grp">Entities</div> : null; lastType = 'entities';
            return <div key={e.id}>{head}
              <div className={`result${i === on ? ' on' : ''}`} role="option" aria-selected={i === on} onMouseEnter={() => setOn(i)} onMouseDown={(ev) => { ev.preventDefault(); go(i, ev.shiftKey); }}>
                <span aria-hidden>{e.flag || TYPE_ICON[e.type]}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{e.name}{e.matched && <span className="tiny muted"> · matched “{e.matched}”</span>}</div>
                  <div className="sub">{ENTITY_TYPE_LABEL[e.type]}{e.parentName ? ` · ${e.parentName}` : ''}{e.summary ? ` — ${e.summary}` : ''}</div>
                </div>
                {e.position ? <PositionBadge p={e.position} /> : <span className="badge">{ENTITY_TYPE_LABEL[e.type]}</span>}
              </div></div>;
          })}
          <div className="foot"><span><span className="kbd">↑↓</span> move</span><span><span className="kbd">Enter</span> open profile</span><span><span className="kbd">Shift Enter</span> show on map</span></div>
        </div>
      )}
    </div>
  );
}

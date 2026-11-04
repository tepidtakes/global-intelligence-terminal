import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { TYPE_ICON, money, fmtDate } from '../format';
import type { EntityStub, PositionSummary, SearchHit, Source, DataQuality, NoteHit } from '../../shared/types';
import { ENTITY_TYPE_LABEL } from '../../shared/types';

export function EntityChip({ e, onRemove, title }: { e: Pick<EntityStub, 'id' | 'type' | 'name' | 'flag'>; onRemove?: () => void; title?: string }) {
  return (
    <Link className="chip" to={`/entity/${encodeURIComponent(e.id)}`} title={title || `${ENTITY_TYPE_LABEL[e.type] || e.type}: ${e.name}`}>
      <span className="ico" aria-hidden>{e.flag || TYPE_ICON[e.type]}</span>{e.name}
      {onRemove && <span className="x" role="button" aria-label={`Remove ${e.name}`} onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onRemove(); }}>×</span>}
    </Link>
  );
}

const Q_HELP: Record<DataQuality, string> = {
  live: 'Live data', delayed: 'Delayed market data (typically 15+ minutes)', official: 'Official statistic from the cited publisher',
  estimate: 'Estimate', historical: 'Historical value', curated: 'Curated from the cited official source; verified as of the date shown', manual: 'Entered manually by you',
  community: 'Community-maintained open data (Wikidata / Wikipedia), loaded live — usually current, but verify before relying on it',
  forecast: 'Forecast or projection by the named institution — not an outcome',
  reported: 'Reported by trusted news outlets (named in the note) but not yet in an official or structured record — verify before relying on it',
};
export function Quality({ q }: { q: DataQuality }) {
  return <span className={`q ${q}`} title={Q_HELP[q]}>{q}</span>;
}

let sourcesCache: Record<string, Source> | null = null;
export function useSources() {
  const { data } = useApi<Source[]>('/sources', 3600_000);
  if (data && !sourcesCache) sourcesCache = Object.fromEntries(data.map((s) => [s.id, s]));
  return sourcesCache || {};
}
export function SourceRef({ id, prefix = 'Source: ' }: { id?: string; prefix?: string }) {
  const src = useSources();
  if (!id) return null;
  const s = src[id];
  if (!s) return <span className="tiny muted">{prefix}{id}</span>;
  return <span className="tiny muted">{prefix}{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.publisher ? `${s.publisher} — ` : ''}{s.name}</a> : <>{s.publisher ? `${s.publisher} — ` : ''}{s.name}</>}{s.license ? ` · ${s.license}` : ''}</span>;
}

export function Card({ title, id, actions, children, className }: { title?: React.ReactNode; id?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className || ''}`} id={id}>
      {title && <div className="hd"><h2>{title}</h2><div className="spacer" />{actions}</div>}
      <div className="bd">{children}</div>
    </section>
  );
}

export function PositionBadge({ p, currency = 'USD' }: { p: PositionSummary; currency?: string }) {
  return (
    <span className={`badge ${p.side}`} title={`Your ${p.status} ${p.side} position — first entry ${fmtDate(p.firstEntryDate)}`}>
      {p.side.toUpperCase()} @ {money(p.avgEntry, currency)}{p.status === 'closed' ? ' · closed' : ''}
    </span>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modalBg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="hd"><h2>{title}</h2><div className="spacer" /><button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="bd">{children}</div>
        {footer && <div className="ft">{footer}</div>}
      </div>
    </div>
  );
}

export function useDebounced<T>(v: T, ms = 160) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function useSearch(q: string, types?: string[], limit = 12) {
  const dq = useDebounced(q.trim());
  const [res, setRes] = useState<{ entities: SearchHit[]; notes: NoteHit[] }>({ entities: [], notes: [] });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!dq) { setRes({ entities: [], notes: [] }); return; }
    let alive = true; setLoading(true);
    api(`/search?q=${encodeURIComponent(dq)}&limit=${limit}${types ? `&types=${types.join(',')}` : ''}`).then((r) => { if (alive) { setRes(r); setLoading(false); } }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [dq, types?.join(','), limit]);
  return { ...res, loading: loading || q.trim() !== dq };
}

/** Today's date in the viewer's own time zone, as YYYY-MM-DD. */
export const localToday = () => new Date().toLocaleDateString('en-CA');

/** Search-as-you-type picker for linking entities to notes, catalysts and watchlists. */
export function EntityPicker({ onPick, types, placeholder = 'Search countries, people, companies…', autoFocus, exclude = [] }: { onPick: (e: SearchHit) => void; types?: string[]; placeholder?: string; autoFocus?: boolean; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const [on, setOn] = useState(0);
  const [open, setOpen] = useState(false);
  const { entities } = useSearch(q, types, 8);
  const list = entities.filter((e) => !exclude.includes(e.id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setOn(0); }, [q]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const pick = (e: SearchHit) => { onPick(e); setQ(''); setOpen(false); };
  return (
    <div className="search" ref={ref} style={{ margin: 0, flex: 'none', width: '100%' }}>
      <span className="icon" aria-hidden>⌕</span>
      <input value={q} autoFocus={autoFocus} placeholder={placeholder} aria-label={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOn((i) => Math.min(i + 1, list.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setOn((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && list[on]) { e.preventDefault(); pick(list[on]); }
          if (e.key === 'Escape') setOpen(false);
        }} />
      {open && q && list.length > 0 && (
        <div className="results" role="listbox">
          {list.map((e, i) => (
            <div key={e.id} className={`result${i === on ? ' on' : ''}`} role="option" aria-selected={i === on} onMouseEnter={() => setOn(i)} onMouseDown={(ev) => { ev.preventDefault(); pick(e); }}>
              <span aria-hidden>{e.flag || TYPE_ICON[e.type]}</span>
              <div style={{ minWidth: 0 }}><div className="nm">{e.name}</div><div className="sub">{ENTITY_TYPE_LABEL[e.type]}{e.parentName ? ` · ${e.parentName}` : ''}</div></div>
              <span />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Loading({ lines = 3 }: { lines?: number }) {
  return <div className="stack" aria-busy="true">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 15}%` }} />)}</div>;
}

export function Unavailable({ children }: { children: React.ReactNode }) {
  return <div className="empty" role="note">{children}</div>;
}

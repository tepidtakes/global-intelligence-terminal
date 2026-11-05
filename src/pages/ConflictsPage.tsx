import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import { useApp } from '../state';
import { Card, Loading, SourceRef, Unavailable } from '../components/common';
import { ConflictBadge, SidesLine } from './profile/LiveSections';
import { ago, fmtDate } from '../format';

const ORDER = ['major-war', 'minor-war', 'conflict', 'skirmish'];
const TITLES: Record<string, string> = {
  'major-war': 'Major wars — 10,000+ deaths in the current or previous year',
  'minor-war': 'Minor wars — 1,000–9,999 deaths',
  conflict: 'Conflicts — 100–999 deaths',
  skirmish: 'Skirmishes & clashes — fewer than 100 deaths',
};

const began = (c: any) => (c.startDate?.length === 10 ? fmtDate(c.startDate) : c.startDate || c.startYear || '—');
const matches = (c: any, q: string) => !q || `${c.name} ${(c.sides || []).flatMap((s: any) => s.participants.map((p: any) => p.name)).join(' ')} ${(c.locations || []).map((l: any) => l.name).join(' ')}`.toLowerCase().includes(q.toLowerCase());

export function ConflictsPage() {
  const { data, loading, error } = useApi<any>('/conflicts', 300_000);
  const { setMap, select } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const toMap = (fill: string) => { setMap({ fill }); select(null); nav('/'); };
  if (loading && !data) return <div className="page"><Loading lines={10} /></div>;
  if (error) return <div className="page"><Unavailable>Conflict list unavailable ({error.message}).</Unavailable></div>;
  const list: any[] = data.conflicts || [];
  const interstate: any[] = (data.interstate || []).filter((c: any) => matches(c, q));
  const sidesLoading = !data.sidesStatus;
  return (
    <div className="page wide">
      <div className="row wrap" style={{ alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <h1>Wars & conflicts</h1>
        <div className="spacer" />
        <input className="input" style={{ maxWidth: 260 }} placeholder="Filter — e.g. Iran, Sudan, Hezbollah" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter conflicts" />
        <button className="btn sm" onClick={() => toMap('conflicts')}>◎ Where fighting is</button>
        <button className="btn sm" onClick={() => toMap('conflicts:parties')}>◎ Who is fighting</button>
      </div>
      <p className="small muted" style={{ maxWidth: 880, marginTop: 0 }}>
        {list.length} conflicts from Wikipedia’s continuously edited list (deaths cite ACLED, UCDP and others), plus the wars inside them —
        each with its sides as given in its own Wikipedia article. {data.status?.ok ? `List loaded ${ago(data.status.at)}.` : ''} {sidesLoading ? 'Sides are still loading (about a minute after start-up)…' : data.sidesStatus?.ok ? `Sides loaded ${ago(data.sidesStatus.at)}.` : `Sides could not be loaded: ${data.sidesStatus?.detail}`}
      </p>

      {interstate.length > 0 && (
        <Card title={`Wars between states (${interstate.length})`} actions={<span className="tiny muted">At least two sides include a state fighting directly</span>}>
          <div className="warGrid">
            {interstate.map((c) => (
              <div key={c.id} className="warCard">
                <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
                  <Link to={`/entity/${encodeURIComponent(c.id)}`} className="warName">{c.name}</Link>
                  <div className="spacer" />
                  {c.intensity && <ConflictBadge intensity={c.intensity} label={c.intensityLabel} />}
                </div>
                <div className="small" style={{ margin: '4px 0' }}><SidesLine sides={c.sides} /></div>
                <div className="row tiny muted" style={{ gap: 8 }}>
                  <span>Began {began(c)}</span>
                  {c.kind === 'theatre' && c.parentId && <span>· part of a wider conflict</span>}
                  <div className="spacer" />
                  <button className="btn ghost sm" onClick={() => toMap(`war:${c.id}`)}>Sides on map ↗</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!list.length && <Unavailable>The conflict list is still loading or could not be fetched. Try again in a moment.</Unavailable>}
      {ORDER.map((k) => {
        const rows = list.filter((c) => c.intensity === k && (matches(c, q) || c.theatres.some((t: any) => matches(t, q))));
        if (!rows.length) return null;
        return (
          <Card key={k} title={<span><ConflictBadge intensity={k} label={String(rows.length)} /> {TITLES[k]}</span>}>
            {rows.map((c) => <ConflictRow key={c.id} c={c} q={q} onMap={toMap} />)}
          </Card>
        );
      })}
      <SourceRef id="wikipedia-conflicts" />
    </div>
  );
}

function ConflictRow({ c, q, onMap }: { c: any; q: string; onMap: (fill: string) => void }) {
  const theatres = c.theatres.filter((t: any) => matches(t, q) || matches(c, q));
  const [open, setOpen] = useState(false);
  const shown = open || q ? theatres : theatres.filter((t: any) => !t.longRunning).slice(0, 3);
  return (
    <div className="conflictRow">
      <div className="row wrap" style={{ alignItems: 'baseline', gap: 8 }}>
        <Link to={`/entity/${encodeURIComponent(c.id)}`}><strong>{c.name}</strong></Link>
        <span className="tiny muted">since {c.startYear || '—'}</span>
        <div className="spacer" />
        <span className="small num">{c.yearly.map((y: any) => <span key={y.year} style={{ marginLeft: 10 }}>{y.year}: <strong>{y.deaths.toLocaleString()}</strong></span>)}</span>
      </div>
      <div className="tiny muted">Fighting in: {c.locations.map((l: any, i: number) => <span key={l.id}>{i ? ', ' : ''}<Link to={`/entity/${encodeURIComponent(l.id)}`}>{l.flag} {l.name}</Link></span>)}</div>
      {c.sides?.length >= 2 && !c.longRunning && <div className="small" style={{ marginTop: 3 }}><SidesLine sides={c.sides} /></div>}
      {shown.length > 0 && (
        <div className="theatres">
          {shown.map((t: any) => (
            <div key={t.id} className="theatre">
              <Link to={`/entity/${encodeURIComponent(t.id)}`}>{t.name}</Link>
              <span className="tiny muted"> · {began(t)}{t.longRunning ? ' · long-running' : ''}</span>
              {t.sides?.length >= 2 && <div className="small"><SidesLine sides={t.sides} max={3} /></div>}
              <button className="btn ghost sm theatreMap" onClick={() => onMap(`war:${t.id}`)} aria-label={`Show sides of ${t.name} on the map`}>map</button>
            </div>
          ))}
        </div>
      )}
      {!q && theatres.length > shown.length && <button className="btn ghost sm" onClick={() => setOpen(true)}>Show {theatres.length - shown.length} more wars & conflicts inside this one</button>}
      {!q && open && theatres.length > 3 && <button className="btn ghost sm" onClick={() => setOpen(false)}>Show fewer</button>}
    </div>
  );
}

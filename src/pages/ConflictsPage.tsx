import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import { useApp } from '../state';
import { Card, Loading, SourceRef, Unavailable } from '../components/common';
import { ConflictBadge } from './profile/LiveSections';
import { ago } from '../format';

const ORDER = ['major-war', 'minor-war', 'conflict', 'skirmish'];
const TITLES: Record<string, string> = {
  'major-war': 'Major wars — 10,000+ deaths in the current or previous year',
  'minor-war': 'Minor wars — 1,000–9,999 deaths',
  conflict: 'Conflicts — 100–999 deaths',
  skirmish: 'Skirmishes & clashes — fewer than 100 deaths',
};

export function ConflictsPage() {
  const { data, loading, error } = useApi<any>('/conflicts', 600_000);
  const { setMap, select } = useApp();
  const nav = useNavigate();
  if (loading && !data) return <div className="page"><Loading lines={10} /></div>;
  if (error) return <div className="page"><Unavailable>Conflict list unavailable ({error.message}).</Unavailable></div>;
  const list: any[] = data.conflicts || [];
  return (
    <div className="page wide">
      <div className="row wrap" style={{ alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h1>Active wars & conflicts</h1>
        <button className="btn primary sm" onClick={() => { setMap({ fill: 'conflicts' }); select(null); nav('/'); }}>◎ Show on map</button>
      </div>
      <p className="small muted" style={{ maxWidth: 820 }}>{list.length} ongoing armed conflicts, grouped by deaths in the current or previous year, as tabulated in Wikipedia’s continuously edited list (which cites ACLED, UCDP and other sources). Death counts are estimates; the current year is year-to-date. {data.status?.ok ? `Loaded ${ago(data.status.at)}.` : data.status ? `Last refresh failed: ${data.status.detail}` : 'Loading…'}</p>
      {!list.length && <Unavailable>The conflict list is still loading or could not be fetched. Try again in a moment.</Unavailable>}
      {ORDER.map((k) => {
        const rows = list.filter((c) => c.intensity === k);
        if (!rows.length) return null;
        return (
          <Card key={k} title={<span><ConflictBadge intensity={k} label={String(rows.length)} /> {TITLES[k]}</span>}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead><tr><th>Conflict</th><th>Since</th><th>Where fighting takes place</th><th className="r">Deaths by year</th></tr></thead>
                <tbody>{rows.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/entity/${encodeURIComponent(c.id)}`}><strong>{c.name}</strong></Link>{c.url && <div className="tiny"><a href={c.url} target="_blank" rel="noreferrer">Wikipedia ↗</a></div>}</td>
                    <td className="tab">{c.startYear || '—'}</td>
                    <td className="small">{c.locations.map((l: any, i: number) => <span key={l.id}>{i ? ', ' : ''}<Link to={`/entity/${encodeURIComponent(l.id)}`}>{l.flag} {l.name}</Link></span>)}</td>
                    <td className="r num small">{c.yearly.length ? c.yearly.map((y: any) => <div key={y.year}>{y.year}: <strong>{y.deaths.toLocaleString()}</strong></div>) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        );
      })}
      <SourceRef id="wikipedia-conflicts" />
    </div>
  );
}

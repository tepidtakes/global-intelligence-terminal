import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import { useApp } from '../state';
import { Card, Loading, SourceRef, Unavailable, useDebounced } from '../components/common';
import { ProbBar } from './profile/ElectionSection';
import { ago, fmtDate } from '../format';

const pctFmt = (p: number) => (p >= 0.995 ? '>99%' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);
const SCOPES = [['all', 'All'], ['national', 'National'], ['local', 'State & city']];

export function ElectionsPage() {
  const [when, setWhen] = useState<'upcoming' | 'recent'>('upcoming');
  const [scope, setScope] = useState('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const { data, loading, error } = useApi<any>(`/elections?when=${when}&scope=${scope}${dq.trim() ? `&q=${encodeURIComponent(dq.trim())}` : ''}`, 300_000);
  const { setMap, select } = useApp();
  const nav = useNavigate();
  const rows: any[] = data?.rows || [];
  const ms = data?.marketStatus || {};
  return (
    <div className="page wide">
      <div className="row wrap" style={{ alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h1>Elections</h1>
        <button className="btn primary sm" onClick={() => { setMap({ fill: 'elections' }); select(null); nav('/'); }}>◎ Show on map</button>
      </div>
      <p className="small muted" style={{ maxWidth: 900, marginTop: 0 }}>
        National elections from Wikipedia’s electoral calendars, plus US governor, Senate and big-city mayoral races and mayoral elections in major world cities. Results and candidates are read from each election’s Wikipedia article (every 30 minutes around polling day) and checked against trusted news. Market odds combine Polymarket and Kalshi prices — traders’ bets, not polls.
        {data?.details && <> Articles last read {ago(data.details.at)}.</>}
      </p>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="When">{[['upcoming', 'Upcoming'], ['recent', 'Recent results']].map(([k, l]) => <button key={k} className={when === k ? 'on' : ''} onClick={() => setWhen(k as any)}>{l}</button>)}</div>
        <div className="seg" role="group" aria-label="Level">{SCOPES.map(([k, l]) => <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{l}</button>)}</div>
        <input type="search" placeholder="Country, state, city…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter elections" />
        <span className="tiny muted">{Object.entries<any>(ms).map(([k, v]) => `${k === 'polymarket' ? 'Polymarket' : 'Kalshi'}: ${v.ok ? `${v.count} markets` : 'unavailable'}`).join(' · ')}</span>
      </div>
      <Card title={`${when === 'upcoming' ? 'Upcoming' : 'Recent'} elections${data ? ` (${rows.length})` : ''}`}>
        {loading && !data ? <Loading lines={8} /> : error ? <Unavailable>{error.message}</Unavailable> : !rows.length ? <Unavailable>No elections match. The calendars load in the background a minute after start-up.</Unavailable> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead><tr><th>Date</th><th>Election</th><th>Where</th>{when === 'upcoming' ? <th>Market favourite</th> : <th>Result</th>}<th className="r">Candidates</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td className="tab small">{fmtDate(r.date)}{r.endDate && r.endDate !== r.date ? <div className="tiny muted">to {fmtDate(r.endDate)}</div> : null}</td>
                  <td><Link to={`/entity/${encodeURIComponent(r.id)}`}><strong>{r.name}</strong></Link>{r.office && <div className="tiny muted">{r.office}</div>}{r.scope !== 'national' && <span className="badge" style={{ marginTop: 2 }}>{r.scope === 'state' ? 'state' : 'city'}</span>}</td>
                  <td className="small">{r.place && <Link to={`/entity/${encodeURIComponent(r.place.id)}`}>{r.place.flag || r.country?.flag} {r.place.name}</Link>}{r.place && r.country && r.place.id !== r.country.id && <div className="tiny muted">{r.country.name}</div>}</td>
                  {when === 'upcoming' ? (
                    <td className="small">{r.favourite ? <><strong>{r.favourite.name}</strong> <span className="num">{pctFmt(r.favourite.probability)}</span><ProbBar p={r.favourite.probability} /><div className="tiny muted">{r.favourite.platforms} platform{r.favourite.platforms > 1 ? 's' : ''} · {r.markets} market{r.markets > 1 ? 's' : ''}</div></> : <span className="muted tiny">No matching market</span>}</td>
                  ) : (
                    <td className="small">
                      {r.winner ? <><strong>{r.winner.name}</strong>{r.winner.party ? <span className="muted"> · {r.winner.party}</span> : null}</> : r.leading ? <>Leading: {r.leading.name}{r.leading.pct != null ? ` (${r.leading.pct}%)` : ''} <span className="tiny muted">not final</span></> : <span className="muted">{r.hasArticle ? 'Not yet recorded' : 'No article linked'}</span>}
                      {r.newsCheck && <div className={`tiny ${r.newsCheck.agrees === false ? 'issue warning' : 'muted'}`}>{r.newsCheck.agrees === true ? '✓ matches trusted news' : r.newsCheck.agrees === false ? `⚠ news reports ${r.newsCheck.news}` : `News reports ${r.newsCheck.news}`}</div>}
                    </td>
                  )}
                  <td className="r num small">{r.contenders || <span className="muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <SourceRef id="wikipedia-elections" /> <SourceRef id="wikipedia-election-results" prefix="· " /> <SourceRef id="polymarket" prefix="· " /> <SourceRef id="kalshi" prefix="· " />
    </div>
  );
}

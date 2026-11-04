// Election profile: result (or count in progress), candidates with party ideology and policy
// positions, and prediction-market odds — each block labelled with where it comes from.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../api';
import { Card, Loading, Quality, SourceRef, Unavailable } from '../../components/common';
import { ago, compact, fmtDate } from '../../format';

const pctFmt = (p?: number) => (p == null ? '—' : p >= 0.995 ? '>99%' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);
const STATUS_LABEL: Record<string, string> = { completed: 'Result declared', counting: 'Counting / results not final', scheduled: 'Upcoming' };

export function ProbBar({ p }: { p: number }) {
  return <span className="probBar" aria-hidden><span style={{ width: `${Math.max(2, Math.min(100, p * 100))}%` }} /></span>;
}

export function ElectionSection({ id }: { id: string }) {
  const { data, loading, error } = useApi<any>(`/elections/${encodeURIComponent(id)}`, 300_000);
  if (loading && !data) return <Card title="Election" id="election"><Loading lines={6} /></Card>;
  if (error) return <Card title="Election" id="election"><Unavailable>{error.message}</Unavailable></Card>;
  const d = data.details || {};
  const cands: any[] = d.candidates || [];
  const status = d.status || (data.status === 'scheduled' ? 'scheduled' : undefined);
  const anyResult = cands.some((c) => c.pct != null || c.votes != null || c.seats != null);
  const anyMarket = cands.some((c) => c.market);
  return (
    <>
      <Card title="Result" id="election" actions={d.url && <a className="tiny" href={d.url} target="_blank" rel="noreferrer">Wikipedia article ↗</a>}>
        <div className="row wrap" style={{ gap: 8, marginBottom: 6 }}>
          <span className="badge accent">{STATUS_LABEL[status] || String(data.status || '').replace(/-/g, ' ')}</span>
          {data.date && <span className="small">{fmtDate(data.date)}{data.endDate && data.endDate !== data.date ? ` – ${fmtDate(data.endDate)}` : ''}</span>}
          {data.place && <Link className="small" to={`/entity/${encodeURIComponent(data.place.id)}`}>{data.place.flag} {data.place.name}</Link>}
          {data.office && <span className="small muted">· {data.office}</span>}
        </div>
        {d.unavailable ? <div className="small muted">{d.reason}</div> : (
          <>
            {data.winner ? (
              <div className="resultBox">
                <div className="tiny muted">{d.legislative ? 'Head of government after the election' : 'Winner'} <Quality q="community" /></div>
                <div className="big">{data.winner.name}{data.winner.party ? <span className="muted"> · {data.winner.party}</span> : null}</div>
              </div>
            ) : status === 'counting' && data.leading ? (
              <div className="resultBox"><div className="tiny muted">Leading so far (not final)</div><div className="big">{data.leading.name}{data.leading.pct != null ? ` — ${data.leading.pct}%` : ''}{data.leading.seats != null ? ` — ${data.leading.seats} seats` : ''}</div></div>
            ) : status === 'counting' ? <div className="small muted">Polls have closed; no result has been recorded in the election article yet. Official results come from the electoral authority.</div> : null}
            {data.newsCheck && (
              <div className={`tiny ${data.newsCheck.agrees === false ? 'issue warning' : ''}`} style={{ marginTop: 6 }}>
                {data.newsCheck.agrees === true ? '✓ ' : data.newsCheck.agrees === false ? '⚠ ' : ''}Trusted news ({(data.newsCheck.publishers || []).slice(0, 3).join(', ')}) reports {data.newsCheck.news} as the winner
                {data.newsCheck.agrees === true ? ' — matches the election article.' : data.newsCheck.agrees === false ? ' — this differs from the election article; check the official result.' : '.'}
              </div>
            )}
            {d.turnout != null && <div className="tiny muted" style={{ marginTop: 4 }}>Turnout {d.turnout}%{d.majority ? ` · ${d.majority} seats needed for a majority` : ''}</div>}
            {d.lead && <p className="small" style={{ marginTop: 10, marginBottom: 0 }}>{d.lead} <a href={d.url} target="_blank" rel="noreferrer">More ↗</a></p>}
            <div className="tiny muted" style={{ marginTop: 6 }}>
              From the election’s Wikipedia article{d.revTimestamp ? ` (edited ${ago(d.revTimestamp)})` : ''}, re-read every 30 minutes around polling day{d.fetchedAt ? ` · retrieved ${ago(d.fetchedAt)}` : ''}. Wikipedia is community-edited; the national electoral authority publishes the official result.
              {d.pollsUrl && <> · <a href={d.pollsUrl} target="_blank" rel="noreferrer">Opinion polls ↗</a></>}
            </div>
          </>
        )}
      </Card>

      {cands.length > 0 && (
        <Card title={`Candidates & policies (${cands.length})`} id="candidates">
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead><tr><th>{d.legislative ? 'Party / leader' : 'Candidate'}</th>{anyResult && <th className="r">Result</th>}{anyMarket && <th className="r" title="Market-implied chance of winning, combined across prediction markets">Markets</th>}<th>Party stance (ideology · position)</th></tr></thead>
              <tbody>{cands.map((c, i) => <CandidateRow key={i} c={c} anyResult={anyResult} anyMarket={anyMarket} legislative={d.legislative} />)}</tbody>
            </table>
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>Ideology and position are as stated in each party’s Wikipedia infobox; policy summaries come from the candidate’s “Political positions” article or section. Both are community-edited — follow the links for sources. <SourceRef id="wikipedia-election-results" prefix="" /></div>
        </Card>
      )}

      <MarketsCard data={data} />
    </>
  );
}

function CandidateRow({ c, anyResult, anyMarket }: { c: any; anyResult: boolean; anyMarket: boolean; legislative?: boolean }) {
  const [open, setOpen] = useState(false);
  const cols = 2 + (anyResult ? 1 : 0) + (anyMarket ? 1 : 0);
  return (
    <>
      <tr>
        <td>
          {c.person ? <Link to={`/entity/${encodeURIComponent(c.person.id)}`}><strong>{c.name}</strong></Link> : c.url ? <a href={c.url} target="_blank" rel="noreferrer"><strong>{c.name || c.party}</strong></a> : <strong>{c.name || c.party}</strong>}
          {c.party && c.name && <div className="tiny">{c.partyId ? <Link to={`/entity/${encodeURIComponent(c.partyId)}`}>{c.party}</Link> : c.partyUrl ? <a href={c.partyUrl} target="_blank" rel="noreferrer">{c.party}</a> : c.party}</div>}
          {c.runningMate && <div className="tiny muted">Running mate: {c.runningMate}</div>}
        </td>
        {anyResult && <td className="r num small">{c.pct != null && <div><strong>{c.pct}%</strong></div>}{c.votes != null && <div className="muted">{compact(c.votes)} votes</div>}{c.seats != null && <div>{c.seats} seats{c.seatsBefore != null ? <span className="muted"> ({c.seats - c.seatsBefore >= 0 ? '+' : ''}{c.seats - c.seatsBefore})</span> : ''}</div>}{c.electoralVotes != null && <div className="muted">{c.electoralVotes} EV</div>}{c.firstRoundPct != null && <div className="tiny muted">1st round {c.firstRoundPct}%</div>}</td>}
        {anyMarket && <td className="r num small">{c.market ? <><strong>{pctFmt(c.market.probability)}</strong><ProbBar p={c.market.probability} /><div className="tiny muted">{c.market.prices.length} market{c.market.prices.length > 1 ? 's' : ''}</div></> : <span className="muted">—</span>}</td>}
        <td className="small">
          {c.ideology?.length ? <div className="chips" style={{ gap: 4 }}>{c.ideology.map((x: string) => <span key={x} className="miniChip">{x}</span>)}</div> : null}
          {c.position && <div className="tiny muted" style={{ marginTop: 2 }}>{c.position}</div>}
          {!c.ideology?.length && !c.position && <span className="muted tiny">No party infobox data</span>}
          {c.positions && <button className="linkish tiny" style={{ marginTop: 2 }} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide policies' : 'Policy positions ▾'}</button>}
        </td>
      </tr>
      {open && c.positions && (
        <tr><td colSpan={cols} className="small" style={{ background: 'var(--surface-2)' }}>
          <div className="tiny muted">{c.positions.kind === 'article' ? 'From “Political positions of …” on Wikipedia' : `From the “${c.positions.heading}” section of ${c.name}’s Wikipedia article`}</div>
          <div style={{ marginTop: 2 }}>{c.positions.text} <a href={c.positions.url} target="_blank" rel="noreferrer">Read in full ↗</a></div>
        </td></tr>
      )}
    </>
  );
}

function MarketsCard({ data }: { data: any }) {
  const markets: any[] = data.markets || [];
  const st = data.marketStatus || {};
  const down = Object.entries<any>(st).filter(([, v]) => !v.ok).map(([k]) => data.platforms?.[k]?.name || k);
  return (
    <Card title="Prediction markets" id="markets" actions={<span className="tiny muted">market-implied odds · <Quality q="forecast" /></span>}>
      <div className="tiny muted" style={{ marginBottom: 6 }}>Prices on real-money prediction markets, read as the chance traders put on each outcome. They are bets, not polls or forecasts by this terminal, and thin markets move easily.</div>
      {!markets.length ? <div className="small muted">{data.status === 'completed' ? 'Markets on this election have closed.' : 'No open prediction market clearly matches this election.'}{down.length ? ` (${down.join(' and ')} could not be reached.)` : ''}</div> : (
        <div className="stack">
          {markets.map((m) => (
            <div key={m.platform + m.id} className="marketBox">
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="badge">{data.platforms?.[m.platform]?.name || m.platform}</span>
                <a href={m.url} target="_blank" rel="noreferrer noopener" className="small"><strong>{m.title}</strong></a>
                {m.thin && <span className="badge" title="Under $25,000 traded — prices can move on small bets">thin market</span>}
              </div>
              <div className="stack" style={{ gap: 3, marginTop: 6 }}>
                {m.outcomes.slice(0, 6).map((o: any) => <div key={o.name} className="row small" style={{ gap: 8 }}><span style={{ minWidth: 160 }}>{o.name}</span><ProbBar p={o.probability} /><span className="num"><strong>{pctFmt(o.probability)}</strong></span></div>)}
                {m.outcomes.length > 6 && <div className="tiny muted">+{m.outcomes.length - 6} more outcomes</div>}
              </div>
              <div className="tiny muted" style={{ marginTop: 4 }}>{m.volume ? `$${compact(m.volume)} traded` : ''}{m.closes ? ` · closes ${fmtDate(m.closes)}` : ''} · {data.platforms?.[m.platform]?.note}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 6 }}><SourceRef id="polymarket" /> <SourceRef id="kalshi" prefix="· " /></div>
    </Card>
  );
}

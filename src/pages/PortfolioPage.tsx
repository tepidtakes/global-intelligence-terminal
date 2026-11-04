import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import { useApp, useAuth } from '../state';
import { Card, EntityChip, Loading } from '../components/common';
import { perf } from '../components/entityBits';
import { money, pct, fmtDate } from '../format';
import type { Quote } from '../../shared/types';

function Row({ p }: { p: any }) {
  const q = useApi<Quote>(`/quote/${encodeURIComponent(p.entityId)}?range=1mo`, 300_000);
  const s = p.summary; const cur = q.data?.currency || p.currency;
  const pf = q.data && p.status === 'open' ? perf(s, q.data.price) : null;
  return (
    <tr>
      <td><Link to={`/entity/${encodeURIComponent(p.entityId)}#position`}><strong>{p.entity?.name || p.entityId}</strong></Link>{p.thesis && <div className="tiny muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.thesis}</div>}</td>
      <td><span className={`badge ${p.side}`}>{p.side.toUpperCase()}</span></td>
      <td>{p.status}</td>
      <td>{p.portfolio || <span className="muted">—</span>}</td>
      <td className="tab">{fmtDate(s.firstEntryDate)}</td>
      <td className="r">{money(s.avgEntry, cur)}</td>
      <td className="r">{s.quantity ?? '—'}</td>
      <td className="r">{q.data ? money(q.data.price, cur) : q.error ? <span className="muted">n/a</span> : '…'}</td>
      <td className={`r ${pf ? (pf.r >= 0 ? 'good' : 'bad') : ''}`}>{pf ? pct(pf.r) : '—'}</td>
      <td className="r">{pf?.pnl != null ? money(pf.pnl, cur) : '—'}</td>
    </tr>
  );
}

export function PortfolioPage() {
  const { user } = useAuth();
  const { setMap } = useApp();
  const nav = useNavigate();
  const { data, loading } = useApi<any[]>(user ? '/positions' : null, 10_000);
  const [status, setStatus] = useState<'open' | 'closed' | 'all'>('open');
  const [portfolio, setPortfolio] = useState('');
  const portfolios = [...new Set((data || []).map((p) => p.portfolio).filter(Boolean))];
  const list = (data || []).filter((p) => (status === 'all' || p.status === status) && (!portfolio || p.portfolio === portfolio));
  const byCountry = useMemo(() => {
    const m = new Map<string, { c: any; n: number; names: string[] }>();
    for (const p of list.filter((x) => x.status === 'open' && x.hqCountry)) { const k = p.hqCountry.id; const cur = m.get(k) || { c: p.hqCountry, n: 0, names: [] }; cur.n++; cur.names.push(p.entity?.name); m.set(k, cur); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [list]);

  if (user === null) return <div className="page"><Card title="Portfolio"><p><Link to="/login">Sign in</Link> to track long and short positions privately.</p></Card></div>;
  return (
    <div className="page">
      <div className="row wrap"><h1>Portfolio</h1><div className="spacer" />
        <button className="btn sm" onClick={() => { setMap({ fill: 'exposure' }); nav('/'); }}>◎ Map my exposure</button></div>
      <div className="row wrap">
        <div className="seg">{(['open', 'closed', 'all'] as const).map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s}</button>)}</div>
        {portfolios.length > 0 && <select className="input" style={{ width: 200 }} value={portfolio} onChange={(e) => setPortfolio(e.target.value)}><option value="">All portfolios</option>{portfolios.map((p) => <option key={p}>{p}</option>)}</select>}
        <span className="small muted">Returns are price returns on delayed quotes; open a position for total return including dividends.</span>
      </div>
      <Card>
        {loading && !data ? <Loading /> : !list.length ? <div className="empty">No {status !== 'all' ? status : ''} positions. Record one from any public company’s profile (“My position”).</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead><tr><th>Security</th><th>Side</th><th>Status</th><th>Portfolio</th><th>First entry</th><th className="r">Avg entry</th><th className="r">Qty</th><th className="r">Last</th><th className="r">Price return</th><th className="r">Unrealized P/L</th></tr></thead>
              <tbody>{list.map((p) => <Row key={p.id} p={p} />)}</tbody>
            </table>
          </div>
        )}
      </Card>
      {byCountry.length > 0 && (
        <Card title="Geographic exposure (by headquarters)">
          <table className="data"><tbody>{byCountry.map((r) => <tr key={r.c.id}><td style={{ width: 220 }}><EntityChip e={r.c} /></td><td className="r" style={{ width: 60 }}>{r.n}</td><td className="small muted">{r.names.join(', ')}</td></tr>)}</tbody></table>
          <div className="tiny muted" style={{ marginTop: 6 }}>Counts open positions by issuer headquarters. Operating exposure (countries where holdings operate) is shown on the map layer.</div>
        </Card>
      )}
    </div>
  );
}

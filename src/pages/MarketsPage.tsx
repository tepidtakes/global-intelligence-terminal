import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import { useApp } from '../state';
import { Card, Loading, SourceRef, Unavailable, Quality } from '../components/common';
import { Sparkline, LineChart } from '../components/Charts';
import { Chg, CurveChart } from './profile/LiveSections';
import { fmtDate, ago } from '../format';
import { Tick } from '../components/Tick';

type Tab = 'commodities' | 'indices' | 'fx' | 'matrix' | 'rates';
const TABS: [Tab, string][] = [['commodities', 'Commodities'], ['indices', 'Share indices'], ['fx', 'Currencies'], ['matrix', 'Cross table'], ['rates', 'Rates & yield curves']];
type SortKey = 'name' | 'd1' | 'm1' | 'ytd' | 'y1';

export function MarketsPage() {
  const [sp, setSp] = useSearchParams();
  const tab: Tab = TABS.some(([k]) => k === sp.get('tab')) ? (sp.get('tab') as Tab) : 'commodities';
  return (
    <div className="page wide">
      <div className="row wrap" style={{ alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
        <h1>Markets</h1>
        <span className="small muted">Delayed quotes and official rate data — every number shows its source and time.</span>
      </div>
      <div className="seg" role="tablist" style={{ marginBottom: 14 }}>
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setSp({ tab: k })}>{l}</button>
        ))}
      </div>
      {tab === 'commodities' && <Commodities />}
      {tab === 'indices' && <Indices />}
      {tab === 'fx' && <Currencies />}
      {tab === 'matrix' && <CrossTable />}
      {tab === 'rates' && <Rates />}
    </div>
  );
}

function useSort(initial: SortKey = 'name') {
  const [key, setKey] = useState<SortKey>(initial);
  const [desc, setDesc] = useState(false);
  const th = (k: SortKey, label: string, cls = 'r') => (
    <th className={`${cls} sortable`} onClick={() => { if (k === key) setDesc(!desc); else { setKey(k); setDesc(k !== 'name'); } }} aria-sort={key === k ? (desc ? 'descending' : 'ascending') : 'none'}>
      {label}{key === k ? (desc ? ' ▾' : ' ▴') : ''}
    </th>
  );
  const sort = <T extends { name: string; change?: any }>(rows: T[]) => [...rows].sort((a, b) => {
    if (key === 'name') return desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
    const av = a.change?.[key], bv = b.change?.[key];
    if (av == null) return 1; if (bv == null) return -1;
    return desc ? bv - av : av - bv;
  });
  return { th, sort };
}

function Commodities() {
  const { data, loading, error } = useApi<any>('/markets/commodities', 300_000);
  const { th, sort } = useSort();
  const nav = useNavigate();
  const groups = useMemo(() => [...new Set<string>((data?.rows || []).map((r: any) => r.group))], [data]);
  if (loading && !data) return <Loading lines={10} />;
  if (error) return <Unavailable>Commodity quotes unavailable ({error.message}). No prices are shown rather than stale guesses.</Unavailable>;
  return (
    <>
      <div className="row wrap small muted" style={{ gap: 10, marginBottom: 8 }}><Quality q="delayed" /> {data.note} <SourceRef id={data.sourceId} /> · retrieved {ago(data.fetchedAt)}{data.stale ? ' · cached copy (provider unreachable)' : ''}</div>
      {groups.map((g) => (
        <Card key={g} title={g}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data hover">
              <thead><tr>{th('name', 'Market', '')}<th className="r">Price</th><th>Unit</th>{th('d1', '1 day')}{th('m1', '1 month')}{th('ytd', 'YTD')}{th('y1', '1 year')}<th data-export="skip">1 year</th><th className="r">As of</th></tr></thead>
              <tbody>{sort(data.rows.filter((r: any) => r.group === g)).map((r: any) => (
                <tr key={r.id} onClick={() => nav(`/entity/${encodeURIComponent(r.id)}`)} style={{ cursor: 'pointer' }}>
                  <td><Link to={`/entity/${encodeURIComponent(r.id)}`} onClick={(e) => e.stopPropagation()}><strong>{r.name}</strong></Link><div className="tiny muted">{r.contract || r.benchmark || r.symbol}</div></td>
                  {r.unavailable ? <td colSpan={8} className="muted small">Quote unavailable</td> : <>
                    <td className="r num"><strong><Tick value={r.price} format={(v) => v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 3 : 2 })} /></strong></td>
                    <td className="small muted">{r.unit}</td>
                    <td className="r"><Chg v={r.change.d1} digits={2} /></td><td className="r"><Chg v={r.change.m1} /></td><td className="r"><Chg v={r.change.ytd} /></td><td className="r"><Chg v={r.change.y1} /></td>
                    <td data-export="skip"><Sparkline values={r.history.map((p: any) => p.c)} color={(r.change.y1 ?? 0) >= 0 ? 'var(--up)' : 'var(--down)'} /></td>
                    <td className="r tiny muted">{fmtDate(r.time, true)}{r.staleQuote ? <div className="chgDown" title="No trade in the last 10 days — changes are not shown">no recent trades</div> : r.thinlyTraded && <div title="Few trades in the last year — the last price can be old">thinly traded</div>}</td>
                  </>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      ))}
      <div className="tiny muted">Colours and the sign show the direction of the price move (the colours can be changed in Settings). For a commodity, whether a rise is good news depends on whether you produce or consume it. Commodities without an openly licensed price (lithium, cobalt, nickel, rare earths) are on their profiles with producer rankings and live trade data instead.</div>
    </>
  );
}

function Currencies() {
  const { data, loading, error } = useApi<any>('/markets/fx', 300_000);
  const { th, sort } = useSort('name');
  const [q, setQ] = useState('');
  const regions = useMemo(() => {
    const order = ['Major currencies', 'Europe', 'Asia', 'Americas', 'Africa', 'Oceania', 'Other'];
    return [...new Set<string>((data?.rows || []).map((r: any) => r.region))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [data]);
  if (loading && !data) return <Loading lines={10} />;
  if (error) return <Unavailable>Currency quotes unavailable ({error.message}).</Unavailable>;
  const match = (r: any) => !q || `${r.code} ${r.name} ${r.country?.name}`.toLowerCase().includes(q.toLowerCase());
  return (
    <>
      <div className="row wrap" style={{ gap: 10, marginBottom: 8 }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Filter — e.g. yen, BRL, Turkey" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter currencies" />
        <span className="small muted"><Quality q="delayed" /> {data.note} <SourceRef id={data.sourceId} /> · retrieved {ago(data.fetchedAt)}</span>
      </div>
      <FxMapButton />
      {regions.map((g) => {
        const rows = sort(data.rows.filter((r: any) => r.region === g && match(r)));
        if (!rows.length) return null;
        return (
          <Card key={g} title={g}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead><tr>{th('name', 'Currency', '')}<th className="r">Per US$</th>{th('d1', '1 day')}{th('m1', '1 month')}{th('ytd', 'YTD')}{th('y1', '1 year')}<th data-export="skip">Value vs US$, 1 year</th></tr></thead>
                <tbody>{rows.map((r: any) => (
                  <tr key={r.code}>
                    <td><strong>{r.code}</strong> <span className="small">{r.name}</span>{r.staleQuote && <span className="tiny chgDown" title={`Last quote ${r.time?.slice(0, 10)}`}> · no recent trades</span>}<div className="tiny muted"><Link to={`/entity/${encodeURIComponent(r.country.id)}#currency`}>{r.country.flag} {r.country.name}</Link>{r.countries > 1 ? ` + ${r.countries - 1} more` : ''}</div></td>
                    {r.unavailable ? <td colSpan={6} className="muted small">No quote available</td> : <>
                      <td className="r num"><Tick value={r.perUsd} format={(v) => v.toLocaleString(undefined, { maximumSignificantDigits: 6 })} /></td>
                      <td className="r"><Chg v={r.change.d1} digits={2} /></td><td className="r"><Chg v={r.change.m1} /></td><td className="r"><Chg v={r.change.ytd} /></td><td className="r"><Chg v={r.change.y1} /></td>
                      <td data-export="skip"><Sparkline values={r.history.map((p: any) => p.c)} color={(r.change.y1 ?? 0) >= 0 ? 'var(--up)' : 'var(--down)'} /></td>
                    </>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        );
      })}
      <div className="tiny muted">Changes are the currency’s value against the US dollar: + strengthened, − weakened. Pegged currencies (e.g. the Saudi riyal or Hong Kong dollar) barely move by design.</div>
    </>
  );
}
// ───────── World share indices (EQ) ─────────
function Indices() {
  const { data, loading, error } = useApi<any>('/markets/indices', 300_000);
  const { th, sort } = useSort('name');
  if (loading && !data) return <Loading lines={10} />;
  if (error) return <Unavailable>Share-index quotes unavailable ({error.message}). No levels are shown rather than stale guesses.</Unavailable>;
  const rows = (data.rows as any[]).map((r) => ({ ...r, name: r.country.name }));
  return (
    <>
      <div className="row wrap small muted" style={{ gap: 10, marginBottom: 8 }}><Quality q="delayed" /> {data.note} Chosen from {data.chosenBy}. <SourceRef id={data.sourceId} /> · retrieved {ago(data.fetchedAt)}{data.stale ? ' · cached copy (provider unreachable)' : ''}</div>
      {(data.regions as string[]).map((g) => (
        <Card key={g} title={g}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data hover">
              <thead><tr>{th('name', 'Economy', '')}<th>Index</th><th className="r">Level</th>{th('d1', '1 day')}{th('m1', '1 month')}{th('ytd', 'YTD')}{th('y1', '1 year')}<th data-export="skip">1 year</th><th className="r">As of</th></tr></thead>
              <tbody>{sort(rows.filter((r) => r.region === g)).map((r) => (
                <tr key={r.iso3}>
                  <td><Link to={`/entity/${encodeURIComponent(r.country.id)}`}><span aria-hidden>{r.country.flag}</span> <strong>{r.country.name}</strong></Link>{r.gdpRank && <div className="tiny muted" title="Rank by GDP, from the economy weights">#{r.gdpRank} by GDP</div>}</td>
                  <td>{r.index}<div className="tiny muted">{r.symbol}</div></td>
                  {r.unavailable ? <td colSpan={7} className="muted small">No quote for {r.symbol}</td> : <>
                    <td className="r num"><strong><Tick value={r.last} format={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })} /></strong></td>
                    <td className="r"><Chg v={r.change.d1} digits={2} /></td><td className="r"><Chg v={r.change.m1} /></td><td className="r"><Chg v={r.change.ytd} /></td><td className="r"><Chg v={r.change.y1} /></td>
                    <td data-export="skip"><Sparkline values={r.history.map((p: any) => p.c)} color={(r.change.y1 ?? 0) >= 0 ? 'var(--up)' : 'var(--down)'} /></td>
                    <td className="r tiny muted">{fmtDate(r.time, true)}{r.staleQuote && <div title="No trade in the last 10 days — changes are not shown">no recent trades</div>}</td>
                  </>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      ))}
      {(data.missing.length > 0 || data.noIndex.length > 0) && (
        <div className="tiny muted">
          {data.missing.length > 0 && <div>No quote came back for: {data.missing.join(', ')}. The symbol may have changed at the provider.</div>}
          {data.noIndex.length > 0 && <div>Large economies without an index on this board yet: {data.noIndex.join(', ')}.</div>}
        </div>
      )}
    </>
  );
}

// ───────── Currency cross table (FXM) ─────────
function CrossTable() {
  const { data, loading, error } = useApi<any>('/markets/fx/matrix', 300_000);
  if (loading && !data) return <Loading lines={10} />;
  if (error) return <Unavailable>Currency quotes unavailable ({error.message}).</Unavailable>;
  const cur = data.currencies as any[];
  return (
    <>
      <div className="row wrap small muted" style={{ gap: 10, marginBottom: 8 }}><Quality q="delayed" /> {data.note} Currencies: {data.chosenBy}. <SourceRef id={data.sourceId} /> · retrieved {ago(data.fetchedAt)}{data.stale ? ' · cached copy (provider unreachable)' : ''}</div>
      <Card title="One unit of the row’s currency buys">
        <div style={{ overflowX: 'auto' }}>
          <table className="data matrix">
            <thead><tr><th scope="col"><span className="srOnly">Currency</span></th>{cur.map((c) => <th key={c.code} scope="col" className="r" title={c.name}>{c.code}</th>)}</tr></thead>
            <tbody>{cur.map((row, i) => (
              <tr key={row.code}>
                <th scope="row" title={`${row.name}${row.country ? ` · ${row.country.name}` : ''}${row.staleQuote ? ' · no recent trades' : ''}`}>
                  {row.country ? <Link to={`/entity/${encodeURIComponent(row.country.id)}#currency`}><span aria-hidden>{row.country.flag}</span> {row.code}</Link> : row.code}
                </th>
                {(data.cells[i] as any[]).map((cell, j) => {
                  if (!cell) return <td key={j} className="diag" aria-label="same currency" />;
                  const d = cell.d1 as number | undefined;
                  const dir = d == null || Math.abs(d) < 0.005 ? '' : d > 0 ? 'up' : 'down';
                  return (
                    <td key={j} className={`r mx ${dir}`} style={dir ? { ['--mx' as any]: Math.min(1, Math.abs(d!) / 2).toFixed(2) } : undefined}
                      title={`1 ${row.code} = ${cell.v.toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${cur[j].code}${d != null ? `; ${d > 0 ? '+' : ''}${d.toFixed(2)}% today (${row.code} ${d >= 0 ? 'gained' : 'lost'} against ${cur[j].code})` : ''}`}>
                      <Tick value={cell.v} format={(v) => v.toLocaleString(undefined, { minimumSignificantDigits: 4, maximumSignificantDigits: 5 })} />
                      <div className="mxd" data-export="skip">{d == null ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(2)}%`}</div>
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <div className="tiny muted">Read across: the row’s currency in units of each column’s. The small figure is today’s change, signed (+ the row’s currency gained against the column’s); the tint deepens with the size of the move. Hover a cell for the full rate.</div>
    </>
  );
}

function FxMapButton() {
  const { setMap } = useApp();
  const nav = useNavigate();
  return <div style={{ marginBottom: 10 }}><button className="btn primary sm" onClick={() => { setMap({ fill: 'fx:y1' }); nav('/'); }}>◎ See currency moves on the map</button></div>;
}

function Rates() {
  const { data, loading, error } = useApi<any>('/rates/overview', 600_000);
  const fed = useApi<any>('/forecast/USA', 3600_000);
  const { setMap } = useApp();
  const nav = useNavigate();
  const [curveKey, setCurveKey] = useState('USA');
  if (loading && !data) return <Loading lines={10} />;
  if (error) return <Unavailable>Rates unavailable ({error.message}).</Unavailable>;
  const curves = data.curves.filter((c: any) => !c.unavailable);
  const sel = curves.find((c: any) => c.key === curveKey) || curves[0];
  const tenors = ['3 Mo', '2 Yr', '5 Yr', '10 Yr', '30 Yr'];
  const val = (c: any, label: string) => c.latest.points.find((p: any) => p.label === label)?.value;
  const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
  const policy = [...data.policy].sort((a: any, b: any) => b.value - a.value);
  const ten = [...data.tenYear].sort((a: any, b: any) => Number(a.stale) - Number(b.stale) || b.value - a.value);
  return (
    <>
      <Card title="Government yield curves — latest">
        {curves.length ? (
          <>
            <LineChart ariaLabel="Yield curves compared" height={240} xTicks={8} yFormat={(v) => `${v.toFixed(2)}%`}
              series={curves.map((c: any, i: number) => ({ label: `${c.label} (${c.latest.date})`, color: COLORS[i], points: c.latest.points.map((p: any) => ({ x: Math.log(p.years * 12), y: p.value, xLabel: p.label })) }))} />
            <table className="data" style={{ marginTop: 10 }}>
              <thead><tr><th>Curve</th>{tenors.map((t) => <th key={t} className="r">{t}</th>)}<th className="r">10y − 2y</th><th>Source</th></tr></thead>
              <tbody>{data.curves.map((c: any) => (
                <tr key={c.key}><td><strong>{c.label}</strong>{!c.unavailable && <div className="tiny muted">{c.latest.date}</div>}</td>
                  {c.unavailable ? <td colSpan={7} className="small muted">Unavailable: {c.reason}</td> : <>
                    {tenors.map((t) => <td key={t} className="r num">{val(c, t) != null ? val(c, t).toFixed(2) : <span className="muted">—</span>}</td>)}
                    <td className="r num">{val(c, '10 Yr') != null && val(c, '2 Yr') != null ? <span className={val(c, '10 Yr') - val(c, '2 Yr') < 0 ? 'chgDown' : ''}>{((val(c, '10 Yr') - val(c, '2 Yr')) * 100).toFixed(0)} bp</span> : '—'}</td>
                    <td><SourceRef id={c.sourceId} prefix="" /></td>
                  </>}
                </tr>
              ))}</tbody>
            </table>
            <div className="tiny muted">The UK row shows Bank of England nominal par yields at 5, 10 and 20 years; the euro row is the ECB curve for AAA-rated euro-area government bonds. A negative 10y − 2y spread (red) means the curve is inverted.</div>
          </>
        ) : <Unavailable>No curves could be loaded right now.</Unavailable>}
      </Card>
      {sel && (
        <Card title={`${sel.label} — today vs 1 month and 1 year ago`} actions={<div className="seg">{curves.map((c: any) => <button key={c.key} className={sel.key === c.key ? 'on' : ''} onClick={() => setCurveKey(c.key)}>{c.label.replace(' (AAA)', '')}</button>)}</div>}>
          <CurveChart curve={sel} />
          <div style={{ marginTop: 4 }}><SourceRef id={sel.sourceId} /> {sel.note && <span className="tiny muted">· {sel.note}</span>}</div>
        </Card>
      )}
      <div className="grid2" style={{ gap: 14, alignItems: 'start' }}>
        <Card title={`Central-bank policy rates (${policy.length})`} actions={<button className="btn sm" onClick={() => { setMap({ fill: 'policy-rate' }); nav('/'); }}>Map ↗</button>}>
          {data.policyError ? <Unavailable>{data.policyError}</Unavailable> : (
            <table className="data"><thead><tr><th>Country</th><th>Central bank</th><th className="r">Rate</th><th className="r">As of</th></tr></thead>
              <tbody>{dedupeEuro(policy).map((r: any) => <tr key={r.entity.id}><td><Link to={`/entity/${encodeURIComponent(r.entity.id)}#yields`}>{r.entity.flag} {r.label || r.entity.name}</Link></td><td className="small muted">{r.bank}</td><td className="r num"><strong>{r.value.toFixed(2)}%</strong></td><td className="r tiny muted">{fmtDate(r.date)}</td></tr>)}</tbody></table>
          )}
          <SourceRef id="bis-policy" />
        </Card>
        <Card title={`10-year government bond yields (${ten.length})`} actions={<button className="btn sm" onClick={() => { setMap({ fill: 'bond10y' }); nav('/'); }}>Map ↗</button>}>
          {data.tenYearError ? <Unavailable>{data.tenYearError}</Unavailable> : (
            <table className="data"><thead><tr><th>Country</th><th className="r">Yield</th><th className="r">As of</th></tr></thead>
              <tbody>{ten.map((r: any) => <tr key={r.entity.id} style={r.stale ? { opacity: 0.55 } : undefined}><td><Link to={`/entity/${encodeURIComponent(r.entity.id)}#yields`}>{r.entity.flag} {r.entity.name}</Link></td>
                <td className="r num"><strong>{r.value.toFixed(2)}%</strong></td>
                <td className="r tiny muted" title={r.basis}>{r.frequency === 'daily' ? `${fmtDate(r.date)} close` : `${r.date} avg.`}{r.stale ? ' · stale' : ''}</td></tr>)}</tbody></table>
          )}
          <div className="tiny muted">Daily closes for the US, Canada, Japan and the UK (from the curves above); monthly averages elsewhere. Rows marked stale have no newer data and are left off the map.</div>
          <SourceRef id="oecd-mei" /> <SourceRef id="ecb-irs" prefix="· " />
        </Card>
      </div>
      {fed.data?.fed && (
        <Card title="US rates outlook — Fed projections vs market pricing">
          <FedSummary fed={fed.data.fed} />
        </Card>
      )}
    </>
  );
}
/** Euro-area members share one ECB rate; show it once. */
function dedupeEuro(rows: any[]) {
  const out: any[] = []; let euro = false;
  for (const r of rows) {
    if (r.area === 'XM') { if (euro) continue; euro = true; out.push({ ...r, label: 'Euro area (21 members)', entity: { ...r.entity, id: 'igo:eu', flag: '🇪🇺' } }); continue; }
    out.push(r);
  }
  return out;
}
function FedSummary({ fed }: { fed: any }) {
  const cur = fed.policy?.value; const last = fed.futures?.at(-1);
  const sepRate = fed.sep.find((s: any) => s.id === 'FEDTARMD');
  return (
    <div className="grid2" style={{ gap: 18 }}>
      <div>
        <div className="small muted">Current target-range midpoint</div>
        <div className="px num">{cur != null ? `${cur.toFixed(3)}%` : '—'}</div>
        {last && cur != null && <div className="small">Futures imply <strong className="num">{last.impliedRate.toFixed(2)}%</strong> by {last.month} — {Math.abs((last.impliedRate - cur) * 100).toFixed(0)} bp of {last.impliedRate < cur ? 'cuts' : 'hikes'} priced in.</div>}
        <SourceRef id="cme-fedfunds" />
      </div>
      <div>
        <div className="small muted">FOMC median projection for the fed funds rate</div>
        <div className="row wrap" style={{ gap: 12 }}>{sepRate?.values.map((v: any) => <span key={v.year}><span className="muted small">{v.year}</span> <strong className="num">{v.value.toFixed(2)}%</strong></span>)}{sepRate?.longerRun != null && <span><span className="muted small">Longer run</span> <strong className="num">{sepRate.longerRun.toFixed(2)}%</strong></span>}</div>
        <SourceRef id="fed-sep" />
        <div className="tiny muted"><Link to="/entity/country:USA#outlook">Full table on the United States profile →</Link></div>
      </div>
    </div>
  );
}

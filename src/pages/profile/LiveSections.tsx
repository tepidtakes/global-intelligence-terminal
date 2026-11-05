// Profile sections backed by live market, rates, forecast, conflict and consensus data.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../../api';
import { useApp } from '../../state';
import { Card, Loading, SourceRef, Unavailable, Quality } from '../../components/common';
import { LineChart, BarList } from '../../components/Charts';
import { compact, fmtUnit, money, fmtDate, ago } from '../../format';
import { PRODUCTS } from '../../../shared/products';
import type { Entity } from '../../../shared/types';

/** A percentage change, green when it is good news and red when it is bad. */
export function Chg({ v, digits = 1, invert = false, suffix = '%' }: { v?: number | null; digits?: number; invert?: boolean; suffix?: string }) {
  if (v == null || !Number.isFinite(v)) return <span className="muted">—</span>;
  const good = invert ? v < 0 : v > 0;
  return <span className={`num ${Math.abs(v) < 10 ** -digits / 2 ? '' : good ? 'chgUp' : 'chgDown'}`}>{v > 0 ? '+' : ''}{v.toFixed(digits)}{suffix}</span>;
}

// ───────── Currency ─────────
export function CurrencySection({ e }: { e: Entity }) {
  const cur = (e.attrs?.currencies || [])[0] as { code: string; name: string } | undefined;
  const [range, setRange] = useState('1y');
  const { data, loading, error } = useApi<any>(cur && cur.code !== 'USD' ? `/markets/fx/${cur.code}?range=${range}` : null, 600_000);
  if (!cur) return null;
  if (cur.code === 'USD') return <Card title="Currency" id="currency"><div className="small">{e.name} uses the <strong>US dollar</strong>{e.iso3 !== 'USA' ? ' (dollarized or pegged by law)' : ''}. See the <Link to="/markets">Markets page</Link> for the dollar against other currencies.</div></Card>;
  return (
    <Card title={`Currency — ${cur.name} (${cur.code})`} id="currency" actions={<div className="seg">{['1mo', '1y', '5y'].map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r.toUpperCase()}</button>)}</div>}>
      {loading && !data ? <Loading /> : error ? <Unavailable>Exchange rate unavailable ({error.message}).</Unavailable> : data?.unavailable ? <Unavailable>{data.reason}</Unavailable> : data && (
        <>
          <div className="row wrap" style={{ gap: 18, alignItems: 'baseline' }}>
            <span><span className="px num">{data.perUsd.toLocaleString(undefined, { maximumSignificantDigits: 6 })}</span> <span className="muted">{cur.code} per US$</span></span>
            <span className="small muted">= {data.usdPer.toLocaleString(undefined, { maximumSignificantDigits: 4 })} US$ per {cur.code}</span>
            <Quality q="delayed" />
          </div>
          <div className="row wrap small" style={{ gap: 16, margin: '8px 0' }}>
            <span className="muted">Against the dollar:</span>
            <span>1 day <Chg v={data.change.d1} digits={2} /></span><span>1 month <Chg v={data.change.m1} /></span><span>Year to date <Chg v={data.change.ytd} /></span><span>1 year <Chg v={data.change.y1} /></span>
          </div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>Green = {cur.code} strengthened against the dollar; red = weakened. The chart shows {cur.code} per US$, so a rising line means a weaker {cur.code}.</div>
          {data.history.length > 1 && <LineChart ariaLabel={`${cur.code} per US dollar`} height={180} series={[{ label: `${cur.code} per US$`, color: 'var(--s1)', points: data.history.map((p: any) => ({ x: Date.parse(p.t), y: p.perUsd, xLabel: range === '1mo' ? p.t.slice(5) : p.t.slice(0, 7) })) }]} yFormat={(v) => v.toLocaleString(undefined, { maximumSignificantDigits: 4 })} />}
          <div className="row" style={{ marginTop: 6 }}><SourceRef id="yahoo-finance" /><span className="tiny muted">· as of {fmtDate(data.time, true)}{data.stale ? ' · cached copy' : ''}</span></div>
        </>
      )}
    </Card>
  );
}

// ───────── Interest rates & yield curve ─────────
export function CurveChart({ curve, height = 200 }: { curve: any; height?: number }) {
  const series = [['Latest', curve.latest, 'var(--s1)', false], ['1 month earlier', curve.monthAgo, 'var(--s2)', true], ['1 year earlier', curve.yearAgo, 'var(--s3)', true]]
    .filter(([, d]) => d).map(([label, d, color, dashed]: any) => ({ label: `${label} (${d.date})`, color, dashed, points: d.points.map((p: any) => ({ x: Math.log(p.years * 12), y: p.value, xLabel: p.label })) }));
  return <LineChart ariaLabel={curve.name} height={height} xTicks={8} yFormat={(v) => `${v.toFixed(2)}%`} series={series} />;
}
function spreads(points: { label: string; years: number; value: number }[]) {
  const at = (y: number) => points.find((p) => Math.abs(p.years - y) < 0.01)?.value;
  const s210 = at(10) != null && at(2) != null ? at(10)! - at(2)! : undefined;
  const short = points[0]; const s10s = at(10) != null && short && short.years < 1 ? at(10)! - short.value : undefined;
  return { s210, s10s, shortLabel: short?.label };
}

export function RatesSection({ iso3 }: { iso3: string }) {
  const { data, loading, error } = useApi<any>(`/rates/${iso3}`, 600_000);
  if (loading && !data) return <Card title="Interest rates & bond yields" id="yields"><Loading lines={4} /></Card>;
  if (error) return <Card title="Interest rates & bond yields" id="yields"><Unavailable>Rates unavailable ({error.message}).</Unavailable></Card>;
  if (!data || (!data.policy && !data.curve && !data.tenYear)) return <Card title="Interest rates & bond yields" id="yields"><Unavailable>No openly published policy-rate or government-bond series is connected for this country. The BIS covers about 40 central banks and the OECD publishes 10-year yields mainly for its members.</Unavailable></Card>;
  const c = data.curve; const sp = c ? spreads(c.latest.points) : null;
  return (
    <Card title="Interest rates & bond yields" id="yields">
      <div className="grid2" style={{ gap: 18, alignItems: 'start' }}>
        <div>
          <div className="lbl small muted">Central-bank policy rate</div>
          {data.policy ? <>
            <div className="px num">{data.policy.value.toFixed(2)}%</div>
            <div className="small muted">{data.policy.bank}{data.euroArea ? ' (euro area)' : ''} · as of {fmtDate(data.policy.date)}</div>
            {data.policyHistory?.points?.length > 2 && <LineChart ariaLabel="Policy rate history" height={140} series={[{ label: 'Policy rate', color: 'var(--s5)', points: data.policyHistory.points.map((p: any) => ({ x: Date.parse(p.t + '-01'), y: p.v, xLabel: p.t })) }]} yFormat={(v) => `${v.toFixed(1)}%`} baseline={0} />}
            <SourceRef id="bis-policy" />
          </> : <div className="small muted">Not reported to the BIS.</div>}
        </div>
        <div>
          <div className="lbl small muted">10-year government bond yield (monthly)</div>
          {data.tenYear ? <>
            <div className="px num">{data.tenYear.points.at(-1).v.toFixed(2)}%</div>
            <div className="small muted">{data.tenYear.points.at(-1).t.slice(0, 7)} average</div>
            <LineChart ariaLabel="10-year yield history" height={140} series={[{ label: '10-year yield', color: 'var(--s1)', points: data.tenYear.points.map((p: any) => ({ x: Date.parse(p.t), y: p.v, xLabel: p.t.slice(0, 7) })) }]} yFormat={(v) => `${v.toFixed(1)}%`} baseline={0} />
            <SourceRef id="oecd-mei" />
          </> : <div className="small muted">Not published by the OECD for this country.</div>}
        </div>
      </div>
      {c && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Yield curve — {c.name}</h3>
          <CurveChart curve={c} />
          <div className="row wrap small" style={{ marginTop: 6, gap: 14 }}>
            {sp?.s210 != null && <span>10y – 2y spread: <strong className={`num ${sp.s210 < 0 ? 'chgDown' : ''}`}>{(sp.s210 * 100).toFixed(0)} bp</strong></span>}
            {sp?.s10s != null && <span>10y – {sp.shortLabel} spread: <strong className={`num ${sp.s10s < 0 ? 'chgDown' : ''}`}>{(sp.s10s * 100).toFixed(0)} bp</strong></span>}
            {sp?.s210 != null && <span className="muted">{sp.s210 < 0 ? 'Inverted (often read as a recession warning)' : 'Upward-sloping'} between 2 and 10 years</span>}
          </div>
          <div style={{ marginTop: 6 }}><SourceRef id={c.sourceId} /> <span className="tiny muted">· {c.note ? `${c.note} · ` : ''}horizontal axis is log-scaled maturity · retrieved {ago(c.fetchedAt)}</span></div>
        </div>
      )}
    </Card>
  );
}

// ───────── Outlook: IMF projections (+ Fed for the US) ─────────
const GOOD_DIR: Record<string, 'high' | 'low' | 'target'> = { NGDP_RPCH: 'high', PCPIPCH: 'target', LUR: 'low', GGXWDG_NGDP: 'low', GGXCNL_NGDP: 'high', BCA_NGDPD: 'high' };
export function OutlookSection({ iso3 }: { iso3: string }) {
  const { data, loading, error } = useApi<any>(`/forecast/${iso3}`, 3600_000);
  return (
    <Card title="Outlook & forecasts" id="outlook">
      {loading && !data ? <Loading lines={5} /> : error ? <Unavailable>Forecasts unavailable ({error.message}).</Unavailable> : (
        <>
          {data?.imf?.rows?.length ? (
            <>
              <div className="row wrap" style={{ marginBottom: 6, gap: 8 }}><strong>IMF World Economic Outlook</strong><Quality q="forecast" /><span className="tiny muted">{data.imf.edition?.source || ''}</span></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data">
                  <thead><tr><th>Indicator</th>{data.imf.years.map((y: string) => <th key={y} className="r">{y}{+y >= +data.imf.currentYear ? <span className="tiny muted"> proj.</span> : +y === +data.imf.currentYear - 1 ? <span className="tiny muted"> est.</span> : ''}</th>)}<th className="r">Change vs {data.imf.currentYear - 1}</th></tr></thead>
                  <tbody>{data.imf.rows.map((r: any) => {
                    const prev = r.values[String(+data.imf.currentYear - 1)], next = r.values[String(+data.imf.currentYear + 1)];
                    const d = prev != null && next != null ? next - prev : undefined;
                    const dir = GOOD_DIR[r.code];
                    return (
                      <tr key={r.code}><td>{r.label} <span className="tiny muted">{r.unit}</span></td>
                        {data.imf.years.map((y: string) => <td key={y} className="r num" style={+y >= +data.imf.currentYear ? { background: 'var(--accent-wash)' } : undefined}>{r.values[y] != null ? (r.unit === 'USD bn' ? `$${compact(r.values[y] * 1e9)}` : r.unit === 'USD' ? `$${compact(r.values[y])}` : r.values[y].toFixed(1)) : <span className="muted">—</span>}</td>)}
                        <td className="r">{d == null || !dir ? <span className="muted">—</span> : dir === 'target' ? <Chg v={d} suffix=" pt" invert={prev > 2} /> : <Chg v={d} suffix={r.unit.startsWith('%') ? ' pt' : ''} invert={dir === 'low'} />}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <div className="tiny muted" style={{ marginTop: 4 }}>Shaded columns are IMF projections, not outcomes. Change column: green = improving (faster growth, lower unemployment/debt, inflation moving toward ~2%), red = worsening. IMF projections are the Fund’s own forecasts — not a market consensus.</div>
              <SourceRef id="imf-weo" />
            </>
          ) : <Unavailable>{data?.imfError ? `IMF data unavailable (${data.imfError}).` : 'The IMF does not publish projections for this economy.'}</Unavailable>}
          {data?.fed && <FedOutlook fed={data.fed} />}
        </>
      )}
    </Card>
  );
}

function FedOutlook({ fed }: { fed: any }) {
  const cur = fed.policy?.value;
  return (
    <div style={{ marginTop: 18 }}>
      <div className="row wrap" style={{ gap: 8, marginBottom: 6 }}><strong>US monetary policy — what the Fed and markets expect</strong></div>
      <div className="grid2" style={{ gap: 18, alignItems: 'start' }}>
        <div>
          <div className="small" style={{ marginBottom: 4 }}>FOMC participants’ median projections <Quality q="forecast" /></div>
          <table className="data">
            <thead><tr><th>Median projection</th>{[...new Set(fed.sep.flatMap((s: any) => s.values.map((v: any) => v.year)))].sort().map((y: any) => <th key={y} className="r">{y}</th>)}<th className="r">Longer run</th></tr></thead>
            <tbody>{fed.sep.filter((s: any) => s.values.length).map((s: any) => {
              const years = [...new Set(fed.sep.flatMap((x: any) => x.values.map((v: any) => v.year)))].sort() as string[];
              return <tr key={s.id}><td>{s.label}</td>{years.map((y) => { const v = s.values.find((p: any) => p.year === y); return <td key={y} className="r num">{v ? v.value.toFixed(1) : '—'}</td>; })}<td className="r num">{s.longerRun != null ? s.longerRun.toFixed(1) : '—'}</td></tr>;
            })}</tbody>
          </table>
          <SourceRef id="fed-sep" />
        </div>
        <div>
          <div className="small" style={{ marginBottom: 4 }}>Market-implied fed funds rate (futures) <Quality q="delayed" /></div>
          {fed.futures?.length ? <>
            <LineChart ariaLabel="Fed funds futures implied path" height={150} series={[{ label: 'Implied average rate', color: 'var(--s1)', points: fed.futures.map((f: any) => ({ x: Date.parse(f.month + '-01'), y: f.impliedRate, xLabel: f.month })) }, ...(cur != null ? [{ label: `Current target midpoint (${cur.toFixed(3)}%)`, color: 'var(--s5)', dashed: true, points: fed.futures.map((f: any) => ({ x: Date.parse(f.month + '-01'), y: cur, xLabel: f.month })) }] : [])]} yFormat={(v) => `${v.toFixed(2)}%`} />
            {cur != null && (() => { const last = fed.futures.at(-1); const d = (last.impliedRate - cur) * 100; return <div className="small" style={{ marginTop: 4 }}>Futures price in <strong className="num">{Math.abs(d).toFixed(0)} bp</strong> of {d < 0 ? 'cuts' : 'hikes'} by {last.month} (≈ {Math.abs(d / 25).toFixed(1)} quarter-point moves).</div>; })()}
            <div className="tiny muted">Implied rate = 100 − futures price (average effective rate expected in that month).</div>
            <SourceRef id="cme-fedfunds" />
          </> : <Unavailable>Futures quotes unavailable{fed.futuresError ? ` (${fed.futuresError})` : ''}.</Unavailable>}
        </div>
      </div>
    </div>
  );
}

// ───────── Armed conflicts ─────────
const SEV: Record<string, string> = { 'major-war': 'sevMajor', 'minor-war': 'sevMinor', conflict: 'sevConflict', skirmish: 'sevSkirmish' };
export function ConflictBadge({ intensity, label }: { intensity: string; label: string }) { return <span className={`badge sev ${SEV[intensity] || ''}`}>{label}</span>; }

export interface SideP { id: string; name: string; type: string; flag?: string; role: 'main' | 'support' | 'other'; roleLabel?: string; depth: number; former: boolean; note?: string }
export interface Side { letter: string; index: number; participants: SideP[] }
const SIDE_CLASS = ['sideA', 'sideB', 'sideC', 'sideD'];

/** Compact one-line sides: flags + names of each side's current main fighters. */
export function SidesLine({ sides, max = 3 }: { sides: Side[]; max?: number }) {
  if (!sides || sides.length < 2) return null;
  return (
    <span className="sidesLine">
      {sides.slice(0, 3).map((s, i) => {
        const main = s.participants.filter((p) => p.role === 'main' && !p.former && p.depth === 1);
        const list = main.length ? main : s.participants.slice(0, 1);
        return (
          <span key={s.letter} className="sl">
            {i > 0 && <span className="vs">vs</span>}
            <span className={`sideChip ${SIDE_CLASS[s.index - 1] || ''}`}>
              {list.slice(0, max).map((p, j) => <span key={p.id}>{j > 0 ? ', ' : ''}{p.flag ? `${p.flag} ` : ''}{p.name}</span>)}
              {list.length > max && <span className="muted"> +{list.length - max}</span>}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Full sides: one column per side, allies nested under their coalition, supporters and former members labelled. */
export function SidesView({ sides, longRunning }: { sides: Side[]; longRunning?: boolean }) {
  const [all, setAll] = useState(false);
  if (!sides || sides.length < 2) return <div className="small muted">Wikipedia does not list the sides of this conflict in a form the terminal can read.</div>;
  const LIMIT = 12;
  const long = sides.some((s) => s.participants.length > LIMIT);
  return (
    <div>
      {longRunning && <div className="tiny muted" style={{ marginBottom: 6 }}>Long-running conflict: the sides below cover its whole history, so some states and groups listed may no longer exist or fight.</div>}
      <div className="sidesGrid" style={{ gridTemplateColumns: sides.slice(0, 4).map(() => 'minmax(0, 1fr)').join(' auto ') }}>
        {sides.slice(0, 4).flatMap((s, i) => [
          i > 0 ? <div key={`vs${i}`} className="vsCol">vs</div> : null,
          <div key={s.letter} className={`sideCol ${SIDE_CLASS[s.index - 1] || ''}`}>
            <div className="sideHead">Side {s.letter}</div>
            {(all ? s.participants : s.participants.slice(0, LIMIT)).map((p, j) => {
              const prev = j > 0 ? s.participants[j - 1] : undefined;
              const heading = p.role !== 'main' && (!prev || prev.role !== p.role || prev.roleLabel !== p.roleLabel);
              return (
                <div key={`${p.id}-${j}`}>
                  {heading && <div className="sideSub">{p.role === 'support' ? 'Supported by' : p.roleLabel}</div>}
                  <div className={`sideP${p.former ? ' former' : ''}`} style={{ paddingLeft: (p.depth - 1) * 14 }}>
                    {p.depth > 1 && <span className="muted">└ </span>}
                    <Link to={`/entity/${encodeURIComponent(p.id)}`}>{p.flag ? `${p.flag} ` : p.type === 'group' ? '✪ ' : ''}{p.name}</Link>
                    {p.former && <span className="lbadge" style={{ marginLeft: 4 }}>former</span>}
                    {p.note && !p.former && <span className="tiny muted"> ({p.note})</span>}
                  </div>
                </div>
              );
            })}
            {!all && s.participants.length > LIMIT && <div className="tiny muted">+{s.participants.length - LIMIT} more</div>}
          </div>,
        ])}
      </div>
      {long && <button className="btn ghost sm" onClick={() => setAll(!all)} style={{ marginTop: 4 }}>{all ? 'Show fewer' : 'Show every participant'}</button>}
    </div>
  );
}

export function ConflictsSection({ id, name }: { id: string; name: string }) {
  const { data } = useApi<any[]>(`/conflicts/for/${encodeURIComponent(id)}`, 600_000);
  const { setMap, select } = useApp();
  const nav = useNavigate();
  if (!data?.length) return null;
  const fighting = data.filter((c) => c.involvement && !c.involvement.former);
  return (
    <Card title={`Wars & armed conflicts — ${name}`} id="conflicts" actions={<div className="row"><button className="btn sm" onClick={() => { setMap({ fill: 'conflicts:parties' }); select(id, { fly: true }); nav('/'); }}>Who is fighting ↗</button><button className="btn sm" onClick={() => { setMap({ fill: 'conflicts' }); select(id, { fly: true }); nav('/'); }}>Where ↗</button></div>}>
      {fighting.length > 0 && <div className="small" style={{ marginBottom: 8 }}><strong>{name}</strong> is a listed party to {fighting.length} ongoing war{fighting.length > 1 ? 's' : ''} or conflict{fighting.length > 1 ? 's' : ''}.</div>}
      <table className="data">
        <thead><tr><th>War / conflict</th><th>{name}’s involvement</th><th>Intensity</th><th className="r">Deaths (latest years)</th></tr></thead>
        <tbody>{data.map((c) => {
          const inv = c.involvement;
          return (
            <tr key={c.id}>
              <td><Link to={`/entity/${encodeURIComponent(c.id)}`}><strong>{c.name}</strong></Link>
                {c.sides?.length >= 2 && <div className="tiny" style={{ marginTop: 2 }}><SidesLine sides={c.sides} max={2} /></div>}</td>
              <td className="small">
                {inv ? <>
                  {inv.former ? <span className="lbadge">former</span> : inv.role === 'main' ? <span className="badge" style={{ fontWeight: 600 }}>Fighting · side {inv.side}</span> : <span className="badge">{inv.roleLabel || 'Supporting'} · side {inv.side}</span>}
                  {inv.allies?.length > 0 && <div className="tiny muted">with {inv.allies.join(', ')}</div>}
                  {inv.opponents?.length > 0 && <div className="tiny muted">against {inv.opponents.join('; ')}</div>}
                </> : null}
                {c.onTerritory && <div className="tiny">{inv ? 'Also fought on its territory' : 'Fought on its territory'}</div>}
              </td>
              <td>{c.intensity && <ConflictBadge intensity={c.intensity} label={c.kind === 'theatre' ? `${c.intensityLabel} (wider conflict)` : c.intensityLabel} />}</td>
              <td className="r num small">{c.yearly.map((y: any) => `${y.year}: ${y.deaths.toLocaleString()}`).join(' · ') || <span className="muted">see wider conflict</span>}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="tiny muted" style={{ marginTop: 6 }}>Sides as listed in each war’s Wikipedia infobox; deaths as tabulated in Wikipedia’s List of ongoing armed conflicts (citing ACLED, UCDP and others). The current year is year-to-date.</div>
      <SourceRef id="wikipedia-conflicts" />
    </Card>
  );
}

// ───────── Analyst consensus ─────────
const PERIOD: Record<string, string> = { '0q': 'Current quarter', '+1q': 'Next quarter', '0y': 'Current fiscal year', '+1y': 'Next fiscal year' };
export function ConsensusSection({ id }: { id: string }) {
  const { data, loading } = useApi<any>(`/consensus/${encodeURIComponent(id)}`, 3600_000);
  return (
    <Card title="Analyst consensus" id="consensus" actions={<Quality q="estimate" />}>
      {loading && !data ? <Loading lines={4} /> : !data || data.unavailable ? <Unavailable>{data?.reason || 'No analyst coverage found.'}</Unavailable> : (
        <>
          <div className="grid2" style={{ gap: 18, alignItems: 'start' }}>
            <div>
              <div className="lbl small muted">Price target ({data.analysts ?? '—'} analysts)</div>
              {data.target ? <>
                <div className="row" style={{ alignItems: 'baseline', gap: 10 }}><span className="px num">{money(data.target.mean, data.currency)}</span>
                  {data.currentPrice && <Chg v={(data.target.mean / data.currentPrice - 1) * 100} />}<span className="tiny muted">vs current {money(data.currentPrice, data.currency)}</span></div>
                <TargetRange t={data.target} price={data.currentPrice} currency={data.currency} />
              </> : <div className="small muted">No price targets published.</div>}
            </div>
            <div>
              <div className="lbl small muted">Recommendations</div>
              {data.ratings ? <RatingBar r={data.ratings} /> : <div className="small muted">—</div>}
              {data.recommendation && <div className="small" style={{ marginTop: 4 }}>Consensus: <strong>{data.recommendation.key.replace(/_/g, ' ')}</strong>{data.recommendation.mean ? <span className="muted"> (mean {data.recommendation.mean.toFixed(2)} on a 1 = strong buy … 5 = strong sell scale)</span> : null}</div>}
            </div>
          </div>
          {data.estimates?.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table className="data">
                <thead><tr><th>Period</th><th className="r">EPS estimate</th><th className="r">Range</th><th className="r">vs year ago</th><th className="r">Revenue estimate</th><th className="r">vs year ago</th><th className="r">EPS revisions (30 d)</th></tr></thead>
                <tbody>{data.estimates.map((e: any) => (
                  <tr key={e.period}>
                    <td>{PERIOD[e.period] || e.period}<div className="tiny muted">ends {fmtDate(e.endDate)} · {e.eps.analysts ?? '—'} analysts</div></td>
                    <td className="r num">{e.eps.avg != null ? e.eps.avg.toFixed(2) : '—'} <span className="tiny muted">{e.currency || ''}</span></td>
                    <td className="r num tiny">{e.eps.low != null ? `${e.eps.low.toFixed(2)} – ${e.eps.high.toFixed(2)}` : '—'}</td>
                    <td className="r"><Chg v={e.eps.growth != null ? e.eps.growth * 100 : null} /></td>
                    <td className="r num">{e.revenue.avg != null ? compact(e.revenue.avg) : '—'}</td>
                    <td className="r"><Chg v={e.revenue.growth != null ? e.revenue.growth * 100 : null} /></td>
                    <td className="r small">{e.revisions.up30 != null || e.revisions.down30 != null ? <><span className="chgUp">▲{e.revisions.up30 ?? 0}</span> <span className="chgDown">▼{e.revisions.down30 ?? 0}</span></> : '—'}
                      {e.epsTrend.current != null && e.epsTrend.d90 != null && <div className="tiny"><Chg v={(e.epsTrend.current / e.epsTrend.d90 - 1) * 100} /> <span className="muted">vs 90 d ago</span></div>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="tiny muted" style={{ marginTop: 6 }}>Averages of estimates from contributing brokers — opinions, not facts. Green = rising estimates / upside; red = falling estimates / downside. Revenue in the reporting currency{data.reportingCurrency ? ` (${data.reportingCurrency})` : ''}.</div>
          <div className="row"><SourceRef id="yahoo-consensus" /><span className="tiny muted">· retrieved {ago(data.fetchedAt)}</span></div>
        </>
      )}
    </Card>
  );
}
function RatingBar({ r }: { r: any }) {
  const parts = [['Strong buy', r.strongBuy, '#0e7a5a'], ['Buy', r.buy, '#5fb48c'], ['Hold', r.hold, '#b9b5a6'], ['Sell', r.sell, '#f0956f'], ['Strong sell', r.strongSell, '#8f1d14']] as [string, number, string][];
  const total = parts.reduce((s, p) => s + (p[1] || 0), 0) || 1;
  return (
    <div>
      <div className="ratingBar" role="img" aria-label={parts.map(([l, n]) => `${l} ${n}`).join(', ')}>{parts.filter(([, n]) => n).map(([l, n, c]) => <span key={l} style={{ width: `${(n / total) * 100}%`, background: c }} title={`${l}: ${n}`} />)}</div>
      <div className="row wrap tiny" style={{ gap: 10, marginTop: 4 }}>{parts.map(([l, n, c]) => <span key={l}><span className="sw" style={{ background: c }} />{l} {n ?? 0}</span>)}</div>
    </div>
  );
}
function TargetRange({ t, price, currency }: { t: any; price?: number; currency: string }) {
  if (t.low == null || t.high == null || t.high <= t.low) return null;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - t.low) / (t.high - t.low)) * 100))}%`;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="targetRange"><span className="mean" style={{ left: pos(t.mean) }} title={`Mean ${money(t.mean, currency)}`} />{price != null && <span className="price" style={{ left: pos(price) }} title={`Current ${money(price, currency)}`} />}</div>
      <div className="row tiny muted" style={{ justifyContent: 'space-between' }}><span>Low {money(t.low, currency)}</span><span>▲ current · ▮ mean</span><span>High {money(t.high, currency)}</span></div>
    </div>
  );
}

// ───────── Who exports / imports this commodity ─────────
export function ProductTradeSection({ e }: { e: Entity }) {
  const product = PRODUCTS.find((p) => p.commodity === e.id);
  const [flow, setFlow] = useState<'X' | 'M'>('X');
  const { data, loading, error } = useApi<any>(product ? `/trade/product/${product.hs}?flow=${flow}` : null, 3600_000);
  const { setMap } = useApp();
  const nav = useNavigate();
  if (!product) return null;
  return (
    <Card title={`Who ${flow === 'X' ? 'exports' : 'imports'} ${product.label.toLowerCase()}`} id="traders" actions={<div className="row"><div className="seg"><button className={flow === 'X' ? 'on' : ''} onClick={() => setFlow('X')}>Exporters</button><button className={flow === 'M' ? 'on' : ''} onClick={() => setFlow('M')}>Importers</button></div>
      <button className="btn sm" onClick={() => { setMap({ fill: `trade:${flow}:${product.hs}` }); nav('/'); }}>Map ↗</button></div>}>
      {loading && !data ? <Loading lines={6} /> : error ? <Unavailable>UN Comtrade unavailable ({error.message}). Large requests are rate-limited — try again shortly.</Unavailable> : !data?.year ? <Unavailable>No recent reports for HS {product.hs}.</Unavailable> : (
        <>
          <div className="small" style={{ marginBottom: 6 }}>World {flow === 'X' ? 'exports' : 'imports'} reported for {data.year}: <strong className="num">${compact(data.total)}</strong> <span className="muted">· {data.reporters} reporting countries · HS {product.hs}</span></div>
          <BarList format={(v) => `$${compact(v)}`} rows={data.rows.slice(0, 15).map((r: any) => ({ key: r.ccn3, value: r.value, sub: `${((r.value / data.total) * 100).toFixed(1)}%`,
            label: r.entity ? <Link to={`/entity/${encodeURIComponent(r.entity.id)}`}>{r.entity.flag} {r.entity.name}</Link> : <span className="muted">{r.areaName || `Code ${r.ccn3}`}</span> }))} />
          <div className="tiny muted" style={{ marginTop: 6 }}>Values as declared by each reporting country; countries that have not yet reported {data.year} are missing (not zero). Shares are of the reported total.</div>
          <SourceRef id="un-comtrade" />
        </>
      )}
    </Card>
  );
}

export { fmtUnit };

// Government budget on country profiles (and the EU): fiscal year, IMF general-government revenue,
// spending, balances and debt, spending by function (Eurostat, EU/EFTA), central-government figures
// (World Bank), and live US federal figures (Treasury).
import { useApi } from '../../api';
import { Card, Loading, SourceRef, Unavailable } from '../../components/common';
import { BarList } from '../../components/Charts';
import { fmtDate, ago } from '../../format';

const tn = (v?: number) => (v == null ? '—' : `$${(v / 1e12).toFixed(2)} trn`);
const bnM = (millions?: number | null) => (millions == null ? '—' : Math.abs(millions) >= 1e6 ? `$${(millions / 1e6).toFixed(2)} trn` : `$${Math.round(millions / 1e3).toLocaleString()} bn`);
const bn = (v?: number) => (v == null ? '—' : `$${Math.round(v / 1e9).toLocaleString()} bn`);
const pctGdp = (v?: number) => (v == null ? '—' : `${v.toFixed(1)}%`);
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function BudgetSection({ id, name, isEU }: { id: string; name: string; isEU?: boolean }) {
  const { data, loading, error } = useApi<any>(`/budget/place/${encodeURIComponent(id)}`, 3600_000);
  if (loading && !data) return <Card title="Government budget" id="budget"><Loading lines={5} /></Card>;
  if (error) return <Card title="Government budget" id="budget"><Unavailable>Budget data unavailable: {error.message}</Unavailable></Card>;
  if (!data) return null;
  const fy = data.fiscalYear;
  const nothing = !data.imf?.rows?.length && !data.wb?.indicators?.length && !data.cofog?.items?.length && !data.us;
  return (
    <Card title="Government budget" id="budget" actions={fy && <span className="tiny muted" title={fy.note}>Fiscal year {fy.runs} · now {fy.current}</span>}>
      {data.us && <UsFederal us={data.us} />}
      {data.imf?.rows?.length > 0 && <ImfTable imf={data.imf} />}
      {data.cofog?.items?.length > 0 && <Cofog c={data.cofog} isEU={isEU} />}
      {data.wb?.indicators?.length > 0 && <Central wb={data.wb} isEU={isEU} />}
      {nothing && <Unavailable>{[data.imfError, data.wbError, data.cofogError].filter(Boolean)[0] || `No budget figures are published for ${name} in the connected sources.`}</Unavailable>}
    </Card>
  );
}

function UsFederal({ us }: { us: any }) {
  const d = us.debt, m = us.mts, i = us.interest, r = us.rates;
  const def = m?.deficit;
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 6 }}>Federal budget, live</h3>
      <div className="kpis" style={{ margin: '4px 0 8px' }}>
        {d?.latest && <div className="kpi" title="Total public debt outstanding"><div className="tiny muted">Federal debt, {fmtDate(d.latest.date)}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{tn(d.latest.total)}</div>
          <div className="tiny muted">{d.yearAgo ? `${d.latest.total >= d.yearAgo.total ? '+' : ''}${tn(d.latest.total - d.yearAgo.total)} in a year · ` : ''}held by the public {tn(d.latest.public)}</div></div>}
        {def && <div className="kpi" title="Receipts minus outlays, Monthly Treasury Statement"><div className="tiny muted">{def.fy} {def.fytd < 0 ? 'deficit' : 'surplus'}{def.months < 12 ? ` to date (${def.months} mo.)` : ''}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{bnM(Math.abs(def.fytd))}</div>
          <div className="tiny muted">{def.months < 12 ? (def.prevFytd ? `same months a year earlier: ${bnM(Math.abs(def.prevFytd))}` : '') : `${def.lastFy}: ${bnM(Math.abs(def.lastFyTotal ?? def.prevFytd))}${m.receipts?.fytd ? ` · receipts ${bnM(m.receipts.fytd)}, outlays ${bnM(m.outlays?.fytd)}` : ''}`}</div></div>}
        {def?.lastFyTotal != null && def.months < 12 && <div className="kpi"><div className="tiny muted">{def.lastFy} {def.lastFyTotal < 0 ? 'deficit' : 'surplus'}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{bnM(Math.abs(def.lastFyTotal))}</div>
          <div className="tiny muted">{m.receipts?.lastFyTotal ? `receipts ${bnM(m.receipts.lastFyTotal)} · outlays ${bnM(m.outlays?.lastFyTotal)}` : ''}</div></div>}
        {i && <div className="kpi" title="Interest expense on Treasury securities held by the public"><div className="tiny muted">Interest on the debt, FY to {fmtDate(i.date)}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{bn(i.fytdPublic)}</div>
          <div className="tiny muted">{i.yearAgoFytdPublic ? `${bn(i.yearAgoFytdPublic)} a year earlier` : 'debt held by the public'}</div></div>}
        {r?.marketable != null && <div className="kpi"><div className="tiny muted">Average rate on marketable debt</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{r.marketable.toFixed(2)}%</div><div className="tiny muted">bills {r.bills?.toFixed(2) ?? '—'}% · notes {r.notes?.toFixed(2) ?? '—'}% · {fmtDate(r.date)}</div></div>}
      </div>
      {m?.series?.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead><tr><th>Month</th><th className="num">Receipts</th><th className="num">Outlays</th><th className="num">Surplus / deficit</th></tr></thead>
            <tbody>{m.series.slice(-6).reverse().map((p: any) => (
              <tr key={p.t}><td>{monthName(p.t.slice(0, 7))}</td><td className="num">{bnM(m.receiptsByMonth?.[p.t])}</td><td className="num">{bnM(m.outlaysByMonth?.[p.t])}</td><td className={`num ${p.v < 0 ? 'bad' : 'good'}`}>{p.v < 0 ? '−' : '+'}{bnM(Math.abs(p.v))}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(us.debtError || us.mtsError) && <div className="tiny" style={{ color: 'var(--warn)' }}>{us.debtError ? `Debt to the Penny unavailable: ${us.debtError}. ` : ''}{us.mtsError ? `Monthly Treasury Statement unavailable: ${us.mtsError}.` : ''}</div>}
      <div className="tiny muted" style={{ marginTop: 4 }}><SourceRef id="us-treasury-fiscal" /> · Monthly Treasury Statement via <SourceRef id="fred" prefix="" />{d?.fetchedAt ? ` · retrieved ${ago(d.fetchedAt)}` : ''}</div>
    </div>
  );
}

function ImfTable({ imf }: { imf: any }) {
  const y = new Date().getFullYear();
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 6 }}>All levels of government, % of GDP</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead><tr><th></th>{imf.years.map((yr: string) => <th key={yr} className="num">{yr}{Number(yr) >= y ? <span className="tiny muted"> proj.</span> : Number(yr) === y - 1 ? <span className="tiny muted"> est.</span> : ''}</th>)}</tr></thead>
          <tbody>{imf.rows.map((r: any) => (
            <tr key={r.key}><td className="small">{r.label}</td>{imf.years.map((yr: string) => {
              const v = r.values[yr]; const signed = r.key === 'balance' || r.key === 'primary';
              return <td key={yr} className={`num${signed && v != null ? (v < 0 ? ' bad' : ' good') : ''}`}>{v == null ? '—' : `${signed && v > 0 ? '+' : ''}${v.toFixed(1)}`}</td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>
      <div className="tiny muted" style={{ marginTop: 4 }}>{imf.source}. Balances: + surplus, − deficit. The current year and later are IMF projections, not outcomes. <SourceRef id="imf-weo" prefix="" /></div>
    </div>
  );
}

function Cofog({ c, isEU }: { c: any; isEU?: boolean }) {
  const total = c.items.find((x: any) => x.code === 'TOTAL');
  const rows = c.items.filter((x: any) => x.code !== 'TOTAL' && x.code !== 'GF0107').sort((a: any, b: any) => b.value - a.value);
  const interest = c.items.find((x: any) => x.code === 'GF0107');
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 6 }}>What {isEU ? 'EU governments' : 'the government'} spend{isEU ? '' : 's'} on, {c.year} (% of GDP)</h3>
      {total && <div className="small" style={{ marginBottom: 6 }}>Total spending: <strong className="num">{pctGdp(total.value)}</strong> of GDP{interest ? ` · of which interest on public debt ${pctGdp(interest.value)}` : ''}.</div>}
      <BarList format={(v) => `${v.toFixed(1)}%`} rows={rows.map((x: any) => ({ key: x.code, label: x.label, value: x.value }))} />
      <div className="tiny muted" style={{ marginTop: 4 }}>{isEU ? 'All 27 member states’ governments combined (not the EU’s own budget, which is about 1% of EU gross national income). ' : ''}General government (central, regional, local and social security), classified by function (COFOG). <SourceRef id="eurostat-cofog" prefix="" />{c.fetchedAt ? ` · retrieved ${ago(c.fetchedAt)}` : ''}</div>
    </div>
  );
}

function Central({ wb, isEU }: { wb: any; isEU?: boolean }) {
  return (
    <div>
      <h3 style={{ marginBottom: 6 }}>{isEU ? 'EU aggregate' : 'Central government'} and spending priorities</h3>
      <div className="kpis" style={{ margin: '4px 0 6px' }}>{wb.indicators.map((i: any) => (
        <div className="kpi" key={i.code} title={i.label}><div className="tiny muted">{i.label.replace(/ \(.*\)$/, '').replace(/^Central government /, '')}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{i.latest.value.toFixed(1)}%</div><div className="tiny muted">{i.unit === '% of revenue' ? 'of revenue' : 'of GDP'} · {i.latest.period}</div></div>
      ))}</div>
      <div className="tiny muted">Revenue, tax, expense and interest cover the central government only (IMF Government Finance Statistics); defence is SIPRI’s estimate; health and education are all levels of government. Annual, often a year or two behind. <SourceRef id="world-bank-wdi" prefix="" /></div>
    </div>
  );
}

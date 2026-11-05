// Reserves & stocks on country profiles (and the EU): foreign-exchange and gold reserves, crude-oil
// stocks (JODI; US SPR from the EIA), how strategic oil reserves are held, gas storage (AGSI+) and
// grain stocks (USDA). Commodity profiles list the largest holders.
import { Link } from 'react-router-dom';
import { useApi } from '../../api';
import { Card, Loading, SourceRef, Unavailable } from '../../components/common';
import { BarList, Sparkline } from '../../components/Charts';
import { compact, fmtDate, ago } from '../../format';

const mb = (kbbl?: number) => (kbbl == null ? '—' : `${(kbbl / 1000).toFixed(1)} m bbl`);
const kt = (v?: number) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} m t` : `${Math.round(v).toLocaleString()} kt`);
const monthLabel = (ym: string) => new Date(`${ym.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function ReservesSection({ id, name, isEU }: { id: string; name: string; isEU?: boolean }) {
  const { data, loading, error } = useApi<any>(`/reserves/place/${encodeURIComponent(id)}`, 3600_000);
  if (loading && !data) return <Card title="Reserves & stocks" id="reserves"><Loading lines={5} /></Card>;
  if (error) return <Card title="Reserves & stocks" id="reserves"><Unavailable>Reserves data unavailable: {error.message}</Unavailable></Card>;
  if (!data) return null;
  const fx = (data.fx?.indicators || []) as any[];
  const total = fx.find((i) => i.code === 'FI.RES.TOTL.CD'), exGold = fx.find((i) => i.code === 'FI.RES.XGLD.CD'), months = fx.find((i) => i.code === 'FI.RES.TOTL.MO');
  const gold = total && exGold && total.latest.period === exGold.latest.period ? total.latest.value - exGold.latest.value : undefined;
  const grains = Object.entries<any>(data.grains || {});
  return (
    <Card title="Reserves & stocks" id="reserves" actions={<Link className="btn sm" to="/?fill=reserves:oil-days">Reserves map</Link>}>
      {(total || months) && (
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ marginBottom: 6 }}>Foreign-exchange and gold reserves</h3>
          <div className="kpis" style={{ margin: '4px 0 6px' }}>
            {total && <div className="kpi"><div className="tiny muted">Total reserves, {total.latest.period}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">${compact(total.latest.value)}</div><div className="tiny muted">including gold</div></div>}
            {gold != null && gold > 0 && <div className="kpi" title="Total reserves minus reserves excluding gold"><div className="tiny muted">of which gold</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">${compact(gold)}</div><div className="tiny muted">{((gold / total.latest.value) * 100).toFixed(0)}% of reserves, at market value</div></div>}
            {months && <div className="kpi"><div className="tiny muted">Import cover, {months.latest.period}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{months.latest.value.toFixed(1)} months</div><div className="tiny muted">of goods & services imports</div></div>}
          </div>
          <div className="tiny muted">IMF International Financial Statistics via the World Bank; annual. <SourceRef id="world-bank-wdi" prefix="" /></div>
        </div>
      )}
      {!isEU && <OilBlock data={data} name={name} />}
      {data.gas && (
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ marginBottom: 6 }}>Natural-gas storage</h3>
          <div className="small"><strong className="num">{data.gas.full?.toFixed(1)}% full</strong> on {fmtDate(data.gas.day)} — {data.gas.twh?.toFixed(1)} of {data.gas.capacity?.toFixed(1)} TWh{data.gas.trend != null ? ` (${data.gas.trend > 0 ? 'injecting' : 'withdrawing'}, ${data.gas.trend > 0 ? '+' : ''}${data.gas.trend.toFixed(2)} pts a day)` : ''}.</div>
          <div className="tiny muted"><SourceRef id="gie-agsi" /> · retrieved {ago(data.gas.fetchedAt)}</div>
        </div>
      )}
      {grains.length > 0 ? (
        <div>
          <h3 style={{ marginBottom: 6 }}>Grain stocks</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead><tr><th>Grain</th><th className="num">Ending stocks</th><th className="num">Share of a year’s use</th><th className="num">Share of world stocks</th><th className="num">Year before</th></tr></thead>
              <tbody>{grains.map(([k, g]) => (
                <tr key={k}><td><Link to={`/entity/${encodeURIComponent(`commodity:${k}`)}`}>{g.label}</Link> <span className="tiny muted">{g.year} proj.</span></td><td className="num">{kt(g.stocks)}</td><td className="num">{g.ratio != null ? `${g.ratio}%` : '—'}</td>
                  <td className="num">{g.worldShare != null ? `${g.worldShare}% (no. ${g.rank})` : '—'}</td><td className="num">{g.prevStocks != null ? kt(g.prevStocks) : '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>Ending stocks for the current marketing year — USDA’s projection, revised monthly with the WASDE report. <SourceRef id="usda-psd" prefix="" />{data.grainsAt ? ` · retrieved ${ago(data.grainsAt)}` : ''}</div>
        </div>
      ) : data.grainError ? <div className="tiny muted">Grain stocks: {data.grainError}.</div> : null}
    </Card>
  );
}

function OilBlock({ data, name }: { data: any; name: string }) {
  const o = data.oil, us = data.us;
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 6 }}>Oil</h3>
      {(us || o) && (
        <div className="kpis" style={{ margin: '4px 0 6px' }}>
          {us && <div className="kpi" title="Strategic Petroleum Reserve, end of week"><div className="tiny muted">Strategic Petroleum Reserve, {fmtDate(us.week)}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{mb(us.spr)}</div>
            <div className="tiny muted">{us.sprYearAgo ? `${us.spr >= us.sprYearAgo ? '+' : ''}${((us.spr - us.sprYearAgo) / 1000).toFixed(1)} m in a year · ` : ''}{((us.spr / 714000) * 100).toFixed(0)}% of ~714 m design capacity</div>{us.history?.length > 4 && <Sparkline values={us.history.map((p: any) => p.v)} />}</div>}
          {us?.commercial && <div className="kpi"><div className="tiny muted">Commercial crude stocks (excl. SPR)</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{mb(us.commercial)}</div><div className="tiny muted">EIA weekly, via {us.via}</div></div>}
          {o && <div className="kpi" title="Closing crude-oil stocks reported to JODI"><div className="tiny muted">Crude stocks, {monthLabel(o.latest.month)}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{mb(o.latest.stocks)}</div>
            <div className="tiny muted">{o.yearAgo?.stocks ? `${mb(o.yearAgo.stocks)} a year earlier` : 'as reported to JODI'}</div>{o.history?.length > 4 && <Sparkline values={o.history.map((p: any) => p.stocks)} />}</div>}
          {o?.latest.days != null && <div className="kpi" title="Crude stocks ÷ refinery intake"><div className="tiny muted">Days of refinery intake</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{o.latest.days} days</div><div className="tiny muted">refineries ran {Math.round(o.latest.refinery).toLocaleString()} kb/d</div></div>}
          {o?.latest.production != null && <div className="kpi"><div className="tiny muted">Crude production</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{Math.round(o.latest.production).toLocaleString()} kb/d</div><div className="tiny muted">{monthLabel(o.latest.month)}</div></div>}
        </div>
      )}
      {!o && !us && <div className="small muted" style={{ marginBottom: 6 }}>{data.oilError ? `Oil stocks: ${data.oilError}.` : `${name} does not report crude-oil stocks to JODI.`}</div>}
      {data.usError && !us && <div className="tiny" style={{ color: 'var(--warn)' }}>US weekly stocks unavailable: {data.usError}</div>}
      {data.programme?.length > 0 && <ul className="small" style={{ margin: '6px 0', paddingLeft: 18 }}>{data.programme.map((p: any, i: number) => <li key={i}>{p.text} <a href={p.url} target="_blank" rel="noreferrer">source ↗</a></li>)}</ul>}
      <div className="tiny muted">{o ? <><SourceRef id="jodi-oil" prefix="" /> · retrieved {ago(o.fetchedAt)} · </> : null}{us ? <><SourceRef id="eia-spr" prefix="" /> · </> : null}<SourceRef id="oil-stock-programmes" prefix="" /></div>
    </div>
  );
}

/** Commodity profiles (crude oil, wheat, corn, rice): the largest holders of stocks. */
export function CommodityStocksSection({ id }: { id: string }) {
  const { data, loading } = useApi<any>(`/reserves/commodity/${encodeURIComponent(id)}`, 3600_000);
  if (loading && !data) return null;
  if (!data?.rows?.length) return null;
  return (
    <Card title="Who holds the stocks" id="stocks">
      {data.kind === 'grain' && <div className="small" style={{ marginBottom: 6 }}>World ending stocks {data.year}: <strong className="num">{kt(data.world.stocks)}</strong> — {data.world.use ? `${((data.world.stocks / data.world.use) * 100).toFixed(1)}% of a year’s use` : ''}.</div>}
      <BarList format={(v) => (data.kind === 'oil' ? mb(v) : kt(v))} rows={data.rows.map((r: any) => ({
        key: r.id, value: r.value, sub: data.kind === 'oil' ? (r.days != null ? `${r.days} days · ${monthLabel(r.period)}` : monthLabel(r.period)) : `${r.share}% of world${r.ratio != null ? ` · ${r.ratio}% of use` : ''}`,
        label: <Link to={`/entity/${encodeURIComponent(r.id)}`}>{r.flag} {r.name}</Link>,
      }))} />
      <div className="tiny muted" style={{ marginTop: 4 }}>{data.note} <SourceRef id={data.sourceId} prefix="" /> · retrieved {ago(data.fetchedAt)}</div>
    </Card>
  );
}

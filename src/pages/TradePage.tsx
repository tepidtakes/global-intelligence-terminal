// Bilateral trade explorer: one country's partners, or one pair A ↔ B — trade as each side reports it
// (the mirror check), six-year trend, what they trade, US tariffs and sanctions between them.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import { useApp } from '../state';
import { Card, EntityChip, EntityPicker, Loading, SourceRef, Unavailable } from '../components/common';
import { BarList, LineChart } from '../components/Charts';
import { ago } from '../format';

const usd = (v?: number | null) => (v == null ? '—' : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)} bn` : `$${(v / 1e6).toFixed(0)} m`);
const signedUsd = (v: number) => `${v >= 0 ? '+' : '−'}${usd(Math.abs(v))}`;

export function TradePage() {
  const [sp, setSp] = useSearchParams();
  const a = (sp.get('a') || '').toUpperCase(), b = (sp.get('b') || '').toUpperCase();
  const set = (na: string, nb: string) => setSp(Object.fromEntries(Object.entries({ a: na, b: nb }).filter(([, v]) => v)), { replace: false });
  const A = useApi<any>(a ? `/entity/${encodeURIComponent(`country:${a}`)}` : null, 3600_000);
  const B = useApi<any>(b ? `/entity/${encodeURIComponent(`country:${b}`)}` : null, 3600_000);
  const pick = (which: 'a' | 'b') => (e: any) => { const iso = e.id.slice(8); if (which === 'a') set(iso, b === iso ? '' : b); else set(a, iso === a ? '' : iso); };
  return (
    <div className="page">
      <h1>Trade explorer</h1>
      <p className="small muted" style={{ marginTop: 0 }}>Goods trade between two countries as each of them reports it to UN Comtrade — with the products, the trend, US tariffs and sanctions in between. Pick one country to see all its partners.</p>
      <div className="row wrap" style={{ gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ minWidth: 240 }}>{a && A.data?.entity ? <EntityChip e={A.data.entity} onRemove={() => set('', b)} /> : <EntityPicker types={['country']} onPick={pick('a')} placeholder="Country (e.g. United States)…" />}</div>
        <button className="btn sm" disabled={!a || !b} onClick={() => set(b, a)} title="Swap the two countries">⇄</button>
        <div style={{ minWidth: 240 }}>{b && B.data?.entity ? <EntityChip e={B.data.entity} onRemove={() => set(a, '')} /> : <EntityPicker types={['country']} onPick={pick('b')} placeholder={a ? 'Partner (e.g. China)…' : 'Partner…'} exclude={a ? [`country:${a}`] : []} />}</div>
      </div>
      {!a && !b && <QuickPairs onPick={set} />}
      {a && !b && <Partners iso3={a} name={A.data?.entity?.name || a} onPick={(p) => set(a, p)} />}
      {a && b && <Pair a={a} b={b} />}
    </div>
  );
}

function QuickPairs({ onPick }: { onPick: (a: string, b: string) => void }) {
  const pairs: [string, string, string][] = [['USA', 'CHN', 'United States ↔ China'], ['USA', 'MEX', 'United States ↔ Mexico'], ['USA', 'CAN', 'United States ↔ Canada'], ['DEU', 'CHN', 'Germany ↔ China'], ['JPN', 'CHN', 'Japan ↔ China'], ['IND', 'RUS', 'India ↔ Russia'], ['GBR', 'USA', 'United Kingdom ↔ United States'], ['AUS', 'CHN', 'Australia ↔ China']];
  return <Card title="Start with a pair"><div className="chips">{pairs.map(([x, y, l]) => <button key={l} className="chip" style={{ cursor: 'pointer' }} onClick={() => onPick(x, y)}>{l}</button>)}</div></Card>;
}

function Partners({ iso3, name, onPick }: { iso3: string; name: string; onPick: (iso3: string) => void }) {
  const { data, loading, error } = useApi<any>(`/trade/partners/${iso3}`, 3600_000);
  const { setMap } = useApp();
  const [all, setAll] = useState(false);
  if (loading && !data) return <Card title={`${name}’s trade partners`}><Loading lines={8} /><div className="tiny muted">First load can take ~10 s (UN Comtrade rate limits); it is cached for a week after.</div></Card>;
  if (error) return <Card title={`${name}’s trade partners`}><Unavailable>UN Comtrade unavailable: {error.message}</Unavailable></Card>;
  const rows = (data.partners as any[]).filter((p) => p.exports + p.imports > 0);
  return (
    <Card title={`${name}’s trade partners, ${data.year}`} actions={<Link className="btn sm" to="/" onClick={() => setMap({ fill: `tradewith:${iso3}:total` })}>Map partners</Link>}>
      <div className="small" style={{ marginBottom: 8 }}>Total goods exports <strong className="num">{usd(data.world.exports)}</strong> · imports <strong className="num">{usd(data.world.imports)}</strong> · balance <strong className="num">{signedUsd(data.world.exports - data.world.imports)}</strong></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead><tr><th>Partner</th><th className="num">Exports to</th><th className="num">Imports from</th><th className="num">Balance</th><th className="num">Share of trade</th><th></th></tr></thead>
          <tbody>{rows.slice(0, all ? 250 : 25).map((p) => (
            <tr key={p.ccn3}><td>{p.entity ? <Link to={`/entity/${encodeURIComponent(p.entity.id)}`}>{p.entity.flag} {p.entity.name}</Link> : <span className="muted">{p.areaName || `Area ${p.ccn3}`}</span>}</td>
              <td className="num">{usd(p.exports)}</td><td className="num">{usd(p.imports)}</td><td className={`num ${p.exports - p.imports >= 0 ? 'good' : 'bad'}`}>{signedUsd(p.exports - p.imports)}</td><td className="num">{p.share != null ? `${p.share.toFixed(1)}%` : '—'}</td>
              <td>{p.iso3 && <button className="linkish small" onClick={() => onPick(p.iso3)}>compare both sides →</button>}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {rows.length > 25 && <button className="linkish small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
      <div className="tiny muted" style={{ marginTop: 6 }}>As reported by {name}. “n.e.s.” areas are flows the reporter did not attribute to a country. <SourceRef id="un-comtrade" prefix="" /> · retrieved {ago(data.fetchedAt)}</div>
    </Card>
  );
}

function Pair({ a, b }: { a: string; b: string }) {
  const { data, loading, error } = useApi<any>(`/trade/pair?a=${a}&b=${b}`, 3600_000);
  const pa = useApi<any>(`/trade/partners/${a}`, 3600_000), pb = useApi<any>(`/trade/partners/${b}`, 3600_000);
  if (loading && !data) return <Card><Loading lines={10} /><div className="tiny muted">First load of a pair takes ~10 s (UN Comtrade rate limits); it is cached for a week after.</div></Card>;
  if (error) return <Card><Unavailable>{error.message}</Unavailable></Card>;
  const A = data.a, B = data.b;
  const latest = [...data.series].reverse().find((s: any) => s.aExports != null || s.aImports != null) || [...data.series].reverse().find((s: any) => s.bExports != null || s.bImports != null);
  const fromA = latest?.aExports != null || latest?.aImports != null;
  const x = fromA ? latest.aExports : latest.bImports, m = fromA ? latest.aImports : latest.bExports;
  const rankIn = (p: any, iso: string) => { const list = (p.data?.partners || []).filter((r: any) => r.iso3); const i = list.findIndex((r: any) => r.iso3 === iso); return i >= 0 ? { rank: i + 1, share: list[i].share } : null; };
  const bInA = rankIn(pa, b), aInB = rankIn(pb, a);
  const series = [
    { label: `${A.name} → ${B.name} (${A.name}’s report)`, color: 'var(--s1)', key: 'aExports' }, { label: `${A.name} → ${B.name} (${B.name}’s report)`, color: 'var(--s1)', key: 'bImports', dashed: true },
    { label: `${B.name} → ${A.name} (${A.name}’s report)`, color: 'var(--s2)', key: 'aImports' }, { label: `${B.name} → ${A.name} (${B.name}’s report)`, color: 'var(--s2)', key: 'bExports', dashed: true },
  ].map((s) => ({ label: s.label, color: s.color, dashed: s.dashed, points: data.series.filter((p: any) => p[s.key] != null).map((p: any) => ({ x: Number(p.year), y: p[s.key] / 1e9, xLabel: p.year })) })).filter((s) => s.points.length);
  return (
    <div className="stack">
      <Card title={`${A.flag || ''} ${A.name} ↔ ${B.flag || ''} ${B.name}, ${latest?.year || ''}`} actions={<span className="row" style={{ gap: 6 }}><Link className="btn sm" to={`/entity/${encodeURIComponent(A.id)}#trade`}>{A.name}</Link><Link className="btn sm" to={`/entity/${encodeURIComponent(B.id)}#trade`}>{B.name}</Link></span>}>
        <div className="kpis" style={{ margin: '4px 0 8px' }}>
          <div className="kpi"><div className="tiny muted">{A.name} exports to {B.name}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{usd(x)}</div></div>
          <div className="kpi"><div className="tiny muted">{A.name} imports from {B.name}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{usd(m)}</div></div>
          {x != null && m != null && <div className="kpi"><div className="tiny muted">{A.name}’s balance</div><div style={{ fontSize: 18, fontWeight: 600 }} className={`num ${x - m >= 0 ? 'good' : 'bad'}`}>{signedUsd(x - m)}</div></div>}
          {bInA && <div className="kpi"><div className="tiny muted">{B.name} in {A.name}’s trade</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">no. {bInA.rank}</div><div className="tiny muted">{bInA.share?.toFixed(1)}% of {A.name}’s goods trade</div></div>}
          {aInB && <div className="kpi"><div className="tiny muted">{A.name} in {B.name}’s trade</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">no. {aInB.rank}</div><div className="tiny muted">{aInB.share?.toFixed(1)}% of {B.name}’s goods trade</div></div>}
        </div>
        {!fromA && <div className="tiny" style={{ color: 'var(--warn)' }}>{A.name} has not reported this year yet: figures are {B.name}’s report (its imports from and exports to {A.name}).</div>}
        {series.length > 0 && <LineChart series={series} height={220} yFormat={(v) => `$${v.toFixed(0)} bn`} ariaLabel={`Trade between ${A.name} and ${B.name}, as each reports it`} />}
        <div className="tiny muted">Solid lines: {A.name}’s report; dashed: {B.name}’s report of the same flows. <SourceRef id="un-comtrade" prefix="" /> · retrieved {ago(data.fetchedAt)}</div>
      </Card>
      {data.mirror && <Mirror m={data.mirror} A={A} B={B} />}
      <Card title={`What they trade, ${data.products.year || ''}`}>
        <div className="grid2" style={{ gap: 20, alignItems: 'start' }}>
          <div><h3 style={{ marginBottom: 6 }}>{A.name} sells to {B.name}</h3>{data.products.exports.length ? <BarList format={usd} rows={data.products.exports.slice(0, 10).map((c: any) => ({ key: c.code, value: c.value, label: <span title={`HS ${c.code}`}>{c.name}</span> }))} /> : <div className="small muted">No product detail reported.</div>}</div>
          <div><h3 style={{ marginBottom: 6 }}>{A.name} buys from {B.name}</h3>{data.products.imports.length ? <BarList format={usd} rows={data.products.imports.slice(0, 10).map((c: any) => ({ key: c.code, value: c.value, label: <span title={`HS ${c.code}`}>{c.name}</span> }))} /> : <div className="small muted">No product detail reported.</div>}</div>
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>By HS chapter, as reported by {data.products.reporter === a ? A.name : B.name}. <SourceRef id="un-comtrade" prefix="" /></div>
      </Card>
      <Card title="Tariffs and sanctions between them">
        {data.usTariff ? (
          <div className="small" style={{ marginBottom: 10 }}>US tariff actually charged on goods from {data.usTariff.on === b ? B.name : A.name}: <strong className="num">{data.usTariff.rate?.toFixed(1)}%</strong> in {data.usTariff.month}{data.usTariff.yearAgo != null ? ` (${data.usTariff.yearAgo.toFixed(1)}% a year earlier)` : ''} — {usd(data.usTariff.duties)} of duties on {usd(data.usTariff.imports)} of imports. <SourceRef id="census-trade" prefix="" /></div>
        ) : <div className="small muted" style={{ marginBottom: 10 }}>Bilateral tariff rates between these two are not in the open data connected here; each country’s average applied tariff is on its profile (Sanctions & tariffs).</div>}
        {data.sanctions.length ? data.sanctions.map((s: any, i: number) => (
          <div key={i} className="small" style={{ marginBottom: 4 }}>⛔ <strong>{s.authority}</strong> on {s.target === a ? A.name : B.name}: {s.programmes.length ? s.programmes.map((p: any) => `${p.program} (${p.count} entries)`).join(', ') : 'no country-wide programme'}{s.listings ? ` · ${s.listings.toLocaleString()} listed people and companies connected` : ''}</div>
        )) : <div className="small muted">Neither country runs a sanctions programme aimed at the other on the US, EU, UK or UN lists.</div>}
        {data.shared?.length > 0 && <div className="small" style={{ marginTop: 8 }}>Both members of: <span className="chips" style={{ display: 'inline-flex' }}>{data.shared.map((g: any) => <EntityChip key={g.id} e={g} />)}</span></div>}
      </Card>
    </div>
  );
}

function Mirror({ m, A, B }: { m: any; A: any; B: any }) {
  const row = (label: string, exp: number | null, imp: number | null, gap: number | null, exporter: string, importer: string) => (
    <tr><td className="small">{label}</td><td className="num">{usd(exp)}</td><td className="num">{usd(imp)}</td><td className="num">{gap == null ? '—' : `${gap > 0 ? '+' : ''}${gap.toFixed(1)}%`}</td>
      <td className="tiny muted">{gap == null ? '' : Math.abs(gap) <= 15 ? 'consistent (imports include freight and insurance)' : gap > 0 ? `${importer} records more than ${exporter} ships — re-exports via third countries or origin rules` : `${importer} records less than ${exporter} ships — goods routed onward, timing or confidentiality`}</td></tr>
  );
  return (
    <Card title={`Mirror check, ${m.year}: does each side report the same trade?`}>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead><tr><th>Flow</th><th className="num">Exporter reports</th><th className="num">Importer reports</th><th className="num">Gap</th><th></th></tr></thead>
          <tbody>
            {row(`${A.name} → ${B.name}`, m.aExports, m.bImports, m.gapAtoB, A.name, B.name)}
            {row(`${B.name} → ${A.name}`, m.bExports, m.aImports, m.gapBtoA, B.name, A.name)}
          </tbody>
        </table>
      </div>
      <div className="tiny muted" style={{ marginTop: 4 }}>Importers value goods with freight and insurance (CIF), exporters without (FOB), so imports usually read a few percent higher. Larger gaps are normal for goods routed through hubs (Hong Kong, the Netherlands, Singapore) or recorded by origin rather than shipment.</div>
    </Card>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, invalidate, useApi } from '../../api';
import { useApp, useAuth } from '../../state';
import { Card, EntityChip, Loading, SourceRef, Unavailable, Quality, localToday } from '../../components/common';
import { LineChart, Sparkline, BarList } from '../../components/Charts';
import { perf } from '../../components/entityBits';
import { compact, fmtUnit, money, pct, fmtDate, ago, TYPE_ICON } from '../../format';
import type { Entity, Indicator, Quote, RelView } from '../../../shared/types';

const HS_TO_COMMODITY: Record<string, string> = { '27': 'commodity:crude-oil', '71': 'commodity:gold', '74': 'commodity:copper', '26': 'commodity:iron-ore', '10': 'commodity:wheat', '12': 'commodity:soybeans', '09': 'commodity:coffee', '18': 'commodity:cocoa', '17': 'commodity:sugar', '85': 'commodity:semiconductors', '87': 'commodity:automobiles' };

const relsBy = (rels: RelView[], type: string, dir: 'out' | 'in') => rels.filter((r) => r.rel.type === type && r.direction === dir);

// ───────── Government & politics ─────────
const isLegislator = (role?: string) => /^(U\.S\. (Senator|Representative)|Delegate to the U\.S\. House|Resident Commissioner)/.test(role || '');
const SRC_TAG: Record<string, string> = { 'wikidata-leaders': 'Wikidata', 'wikidata-mayors': 'Wikidata', congress: 'Congress' };

export function GovernmentSection({ e, rels, events, partyOf = {}, mayors = [] }: { e: Entity; rels: RelView[]; events: any[]; partyOf?: Record<string, any>; mayors?: any[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const current = (r: RelView) => !r.rel.validTo || r.rel.validTo > today;
  const hos = relsBy(rels, 'head_of_state', 'in').filter(current), hog = relsBy(rels, 'head_of_government', 'in').filter(current);
  const leaders = relsBy(rels, 'leads', 'in').filter(current), officials = relsBy(rels, 'holds_office', 'in').filter(current);
  const former = [...relsBy(rels, 'head_of_state', 'in'), ...relsBy(rels, 'head_of_government', 'in')].filter((r) => !current(r));
  const parties = relsBy(rels, 'party_in', 'in'), governing = new Set(relsBy(rels, 'governing_party', 'in').map((r) => r.other.id));
  const igos = relsBy(rels, 'member_of', 'out');
  const ratings: any[] = e.attrs?.ratings || [];
  const elections = events.filter((x) => x.category === 'election');
  const notes: string[] = e.attrs?.leaderNotes || [];
  const exec = [...hos.map((r) => ({ r, role: r.rel.role || 'Head of state' })), ...hog.filter((r) => !hos.some((h) => h.other.id === r.other.id)).map((r) => ({ r, role: r.rel.role || 'Head of government' })), ...leaders.map((r) => ({ r, role: r.rel.role || 'Leader' })),
    ...officials.filter((r) => !isLegislator(r.rel.role)).map((r) => ({ r, role: r.rel.role || 'Official' }))];
  const seat = (r: RelView) => /Senator/.test(r.rel.role || '') ? 0 : Number(/-(\d+)$/.exec(r.rel.role || '')?.[1] || 1);
  const legislators = officials.filter((r) => isLegislator(r.rel.role)).sort((a, b) => seat(a) - seat(b) || a.other.name.localeCompare(b.other.name));
  const [showAll, setShowAll] = useState(false);
  const [allMayors, setAllMayors] = useState(false);
  if (!exec.length && !legislators.length && !parties.length && !igos.length && !mayors.length && !elections.length) return null;
  const party = (id: string) => partyOf[id] ? <Link to={`/entity/${encodeURIComponent(partyOf[id].id)}`}>{partyOf[id].name}</Link> : <span className="muted">—</span>;
  const tag = (r: RelView) => r.rel.origin && SRC_TAG[r.rel.origin] ? <span className="lbadge" title={r.rel.origin === 'congress' ? 'Loaded live from the congress-legislators dataset' : 'Loaded live from Wikidata (community-maintained) — verify'} style={{ marginLeft: 6 }}>{SRC_TAG[r.rel.origin]}</span> : null;
  return (
    <Card title="Government & politics" id="government">
      {notes.length > 0 && <div className="banner" role="note" style={{ marginBottom: 10, display: 'block' }}>{notes.map((n) => <div key={n} className="small">⚠ {n}</div>)}</div>}
      {exec.length > 0 && (
        <table className="data" style={{ marginBottom: 12 }}>
          <thead><tr><th>Role</th><th>Person</th><th>Since</th><th>Party</th></tr></thead>
          <tbody>{exec.map(({ r, role }) => (
            <tr key={r.rel.id + role}><td>{role}{hog.some((h) => h.other.id === r.other.id) && hos.some((h) => h.other.id === r.other.id) ? <span className="tiny muted"> (head of state & government)</span> : null}</td>
              <td><Link to={`/entity/${encodeURIComponent(r.other.id)}`}><strong>{r.other.name}</strong></Link>{tag(r)}</td><td className="tab">{fmtDate(r.rel.validFrom)}</td><td>{party(r.other.id)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {former.length > 0 && <div className="tiny muted" style={{ marginTop: -6, marginBottom: 10 }}>Recently replaced: {former.map((r) => `${r.other.name} (${r.rel.role || r.label}, until ${fmtDate(r.rel.validTo)})`).join('; ')}.</div>}
      {legislators.length > 0 && (
        <div className="relGroup">
          <div className="lbl">Congressional delegation ({legislators.filter((r) => /Senator/.test(r.rel.role || '')).length} senators · {legislators.filter((r) => !/Senator/.test(r.rel.role || '')).length} House members) {tag(legislators[0])}</div>
          <table className="data">
            <tbody>{(showAll ? legislators : legislators.slice(0, 12)).map((r) => (
              <tr key={r.rel.id}><td>{r.rel.role}</td><td><Link to={`/entity/${encodeURIComponent(r.other.id)}`}><strong>{r.other.name}</strong></Link></td><td>{party(r.other.id)}</td><td className="tab small muted">since {fmtDate(r.rel.validFrom)}</td></tr>
            ))}</tbody>
          </table>
          {legislators.length > 12 && <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${legislators.length}`}</button>}
        </div>
      )}
      {parties.length > 0 && (
        <div className="relGroup"><div className="lbl">Political parties {governing.size > 0 && <span className="muted">— ● governing</span>}</div>
          <div className="chips">{parties.map((r) => <EntityChip key={r.rel.id} e={{ ...r.other, name: (governing.has(r.other.id) ? '● ' : '') + r.other.name }} />)}</div></div>
      )}
      {igos.length > 0 && <div className="relGroup"><div className="lbl">International memberships ({igos.length})</div><div className="chips">{igos.map((r) => <EntityChip key={r.rel.id} e={r.other} title={r.rel.validFrom ? `Member since ${r.rel.validFrom}${r.rel.validTo ? ` until ${r.rel.validTo}` : ''}` : undefined} />)}</div></div>}
      {mayors.length > 0 && (
        <div className="relGroup">
          <div className="lbl">{e.type === 'country' ? 'City leaders' : 'Mayors'} ({mayors.length})</div>
          <table className="data"><tbody>{(allMayors ? mayors : mayors.slice(0, 10)).map((m: any) => (
            <tr key={m.city.id + m.person.id}>
              <td><Link to={`/entity/${encodeURIComponent(m.city.id)}`}>{m.city.name}</Link>{m.capital && <span className="tiny muted"> · capital</span>}{m.population ? <div className="tiny muted">{(m.population / 1e6 >= 1 ? `${(m.population / 1e6).toFixed(1)}M` : `${Math.round(m.population / 1e3)}k`)} people</div> : null}</td>
              <td className="small muted">{m.role}</td>
              <td><Link to={`/entity/${encodeURIComponent(m.person.id)}`}><strong>{m.person.name}</strong></Link>{m.origin === 'wikidata-mayors' && <span className="lbadge" style={{ marginLeft: 6 }} title="Loaded live from Wikidata (community-maintained) — verify">Wikidata</span>}</td>
              <td className="small">{m.party ? <Link to={`/entity/${encodeURIComponent(m.party.id)}`}>{m.party.name}</Link> : <span className="muted">—</span>}</td>
              <td className="tab small muted">{m.since ? `since ${fmtDate(m.since)}` : ''}</td>
            </tr>
          ))}</tbody></table>
          {mayors.length > 10 && <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => setAllMayors(!allMayors)}>{allMayors ? 'Show fewer' : `Show all ${mayors.length}`}</button>}
        </div>
      )}
      {elections.length > 0 && <div className="relGroup"><div className="lbl">Elections <Link className="tiny" to="/elections">all elections ›</Link></div>{elections.map((x) => <div key={x.id} className="small" style={{ marginBottom: 2 }}><span className="badge">{fmtDate(x.date)}</span> {x.scope && x.scope !== 'national' && <span className="badge">{x.scope}</span>} <Link to={`/entity/${encodeURIComponent(x.id)}`}>{x.name}</Link> <span className="muted">· {x.winner ? <>won by <strong style={{ color: 'var(--text)' }}>{x.winner}</strong></> : String(x.status).replace(/-/g, ' ')}</span></div>)}</div>}
      {ratings.length > 0 && (
        <div className="relGroup"><div className="lbl">Sovereign credit ratings (long-term, foreign currency)</div>
          <div className="row wrap">{ratings.map((r) => <span key={r.agency} className="badge" title={`As of ${r.asOf}`}>{r.agency}: <strong style={{ color: 'var(--text)' }}>{r.rating}</strong> <span className="muted">({r.asOf})</span></span>)}</div>
          <div className="tiny muted" style={{ marginTop: 4 }}>Curated from agency rating actions; ratings and outlooks change — verify with the agency before relying on them.</div></div>
      )}
    </Card>
  );
}
function PartyOf({ id }: { id: string }) {
  const { data } = useApi<any>(`/entity/${encodeURIComponent(id)}`, 600_000);
  const p = data?.relationships?.find((r: RelView) => r.rel.type === 'belongs_to_party' && r.direction === 'out');
  return p ? <Link to={`/entity/${encodeURIComponent(p.other.id)}`}>{p.other.name}</Link> : <span className="muted">—</span>;
}

// ───────── Macroeconomics ─────────
export function MacroSection({ iso3 }: { iso3: string }) {
  const { data, loading, error } = useApi<{ indicators: Indicator[]; meta: any; fetchedAt: string; stale: boolean; error?: string }>(`/macro/${iso3}`, 600_000);
  const [sel, setSel] = useState('NY.GDP.MKTP.KD.ZG');
  const ind = data?.indicators.find((i) => i.code === sel);
  return (
    <Card title="Macroeconomics" id="macro" actions={data?.meta && <span className="badge accent" title="World Bank classification">{data.meta.incomeLevel}</span>}>
      {loading && !data ? <Loading lines={5} /> : error || data?.error ? <Unavailable>World Bank data unavailable right now ({error?.message || data?.error}). Nothing is shown rather than guessing.</Unavailable> : (
        <>
          <table className="data">
            <thead><tr><th>Indicator</th><th className="r">Latest</th><th>Period</th><th>Trend since 2000</th></tr></thead>
            <tbody>
              {data!.indicators.map((i) => (
                <tr key={i.code} onClick={() => i.series.length > 1 && setSel(i.code)} style={{ cursor: i.series.length > 1 ? 'pointer' : 'default', background: i.code === sel ? 'var(--accent-wash)' : undefined }}>
                  <td>{i.label}</td><td className="r">{i.latest ? fmtUnit(i.latest.value, i.unit) : <span className="muted">no data</span>}</td>
                  <td className="tab muted">{i.latest?.period || '—'}</td><td><Sparkline values={i.series.map((p) => p.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {ind && ind.series.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 6 }}>{ind.label}</h3>
              <LineChart ariaLabel={`${ind.label} over time`} series={[{ label: ind.label, color: 'var(--s1)', points: ind.series.map((p) => ({ x: +p.period, y: p.value, xLabel: p.period })) }]}
                yFormat={(v) => fmtUnit(v, ind.unit)} baseline={ind.unit.includes('%') ? 0 : undefined} />
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}><SourceRef id="world-bank-wdi" /><span className="tiny muted">· Annual data; values are the latest year each country has reported · retrieved {ago(data!.fetchedAt)}{data!.stale ? ' (cached — provider unreachable)' : ''}</span></div>
        </>
      )}
    </Card>
  );
}

export function YieldCurveSection({ iso3 }: { iso3: string }) {
  const { data, loading } = useApi<any>(`/yield-curve/${iso3}`, 600_000);
  return (
    <Card title="Sovereign yield curve" id="yields">
      {loading && !data ? <Loading /> : data?.unavailable ? <Unavailable>{data.reason}</Unavailable> : data?.error ? <Unavailable>{data.error}</Unavailable> : data && (
        <>
          <LineChart ariaLabel="US Treasury par yield curve" height={200} xTicks={8} yFormat={(v) => `${v.toFixed(2)}%`}
            series={[['Latest', data.latest, 'var(--s1)', false], ['1 month earlier', data.monthAgo, 'var(--s2)', true], ['1 year earlier', data.yearAgo, 'var(--s3)', true]].filter(([, d]) => d).map(([label, d, color, dashed]: any) => ({
              label: `${label} (${d.date})`, color, dashed, points: d.points.map((p: any) => ({ x: Math.log(p.years * 12), y: p.value, xLabel: p.label })),
            }))} />
          <div className="row wrap small" style={{ marginTop: 6, gap: 14 }}>
            {(() => { const g = (k: string) => data.latest.points.find((p: any) => p.label === k)?.value; const s = g('10 Yr') - g('2 Yr'), s3 = g('10 Yr') - g('3 Mo'); return <><span>10y–2y spread: <strong className="num">{(s * 100).toFixed(0)} bp</strong></span><span>10y–3m spread: <strong className="num">{(s3 * 100).toFixed(0)} bp</strong></span><span className="muted">{s < 0 ? 'Inverted' : 'Upward-sloping'} at the 2y–10y segment</span></>; })()}
          </div>
          <div style={{ marginTop: 6 }}><SourceRef id="us-treasury" /> <span className="tiny muted">· Par yields, daily close · horizontal axis is log-scaled maturity</span></div>
        </>
      )}
    </Card>
  );
}

// ───────── Trade ─────────
export function TradeSection({ iso3, rels }: { iso3: string; rels: RelView[] }) {
  const [flow, setFlow] = useState<'X' | 'M' | 'P'>('X');
  const { data, loading, error } = useApi<any>(flow === 'P' ? null : `/trade/${iso3}?flow=${flow}`, 3600_000);
  const curatedExports = relsBy(rels, 'exports', 'out'), curatedImports = relsBy(rels, 'imports', 'out'), produces = relsBy(rels, 'produces', 'out');
  return (
    <Card title="International trade" id="trade" actions={<div className="seg"><button className={flow === 'X' ? 'on' : ''} onClick={() => setFlow('X')}>Exports</button><button className={flow === 'M' ? 'on' : ''} onClick={() => setFlow('M')}>Imports</button><button className={flow === 'P' ? 'on' : ''} onClick={() => setFlow('P')}>Partners</button></div>}>
      {(curatedExports.length > 0 || produces.length > 0 || curatedImports.length > 0) && (
        <div style={{ marginBottom: 12 }}>
          {produces.length > 0 && <div className="relGroup"><div className="lbl">Major production</div><div className="chips">{produces.map((r) => <EntityChip key={r.rel.id} e={r.other} title={r.rel.note} />)}</div></div>}
          {curatedExports.length > 0 && <div className="relGroup"><div className="lbl">Key export commodities</div><div className="chips">{curatedExports.map((r) => <EntityChip key={r.rel.id} e={r.other} title={r.rel.note} />)}</div></div>}
          {curatedImports.length > 0 && <div className="relGroup"><div className="lbl">Key import commodities</div><div className="chips">{curatedImports.map((r) => <EntityChip key={r.rel.id} e={r.other} title={r.rel.note} />)}</div></div>}
        </div>
      )}
      {flow === 'P' ? <TradePartners iso3={iso3} /> : loading && !data ? <Loading lines={6} /> : error ? <Unavailable>UN Comtrade unavailable: {error.message}</Unavailable> : !data?.year ? <Unavailable>No recent annual trade data reported to UN Comtrade.</Unavailable> : (
        <div className="grid2" style={{ gap: 20, alignItems: 'start' }}>
          <div>
            <h3 style={{ marginBottom: 6 }}>{flow === 'X' ? 'Exports' : 'Imports'} by product, {data.year}</h3>
            <div className="small" style={{ marginBottom: 6 }}>Total goods {flow === 'X' ? 'exports' : 'imports'}: <strong className="num">${compact(data.total)}</strong></div>
            <BarList format={(v) => `$${compact(v)}`} rows={data.chapters.slice(0, 10).map((c: any) => ({
              key: c.code, value: c.value, sub: `${((c.value / data.total) * 100).toFixed(1)}%`,
              label: HS_TO_COMMODITY[c.code] ? <Link to={`/entity/${encodeURIComponent(HS_TO_COMMODITY[c.code])}`} title={`HS ${c.code}`}>{c.name} →</Link> : <span title={`HS ${c.code}`}>{c.name}</span>,
            }))} />
          </div>
          <div>
            <h3 style={{ marginBottom: 6 }}>Top partners, {data.year}</h3>
            <BarList format={(v) => `$${compact(v)}`} rows={data.partners.slice(0, 10).map((p: any) => ({
              key: p.ccn3, value: p.value, sub: `${((p.value / data.total) * 100).toFixed(1)}%`,
              label: p.entity ? <Link to={`/entity/${encodeURIComponent(p.entity.id)}`}>{p.entity.flag} {p.entity.name}</Link> : <span className="muted">{p.areaName || `Code ${p.ccn3}`}</span>,
            }))} />
            {data.partners.some((p: any) => p.areaName) && <div className="tiny muted" style={{ marginTop: 4 }}>“n.e.s.” = not elsewhere specified: the reporter did not disclose the partner country for these flows.</div>}
          </div>
        </div>
      )}
      {flow !== 'P' && data?.year && <div style={{ marginTop: 8 }}><SourceRef id="un-comtrade" /> <span className="tiny muted">· Goods trade by HS chapter as reported by {iso3}, current US$ · retrieved {ago(data.fetchedAt)}</span></div>}
    </Card>
  );
}

/** Every partner: exports, imports, balance, share — with links to the pair explorer and the map. */
function TradePartners({ iso3 }: { iso3: string }) {
  const { data, loading, error } = useApi<any>(`/trade/partners/${iso3}`, 3600_000);
  const { setMap } = useApp();
  if (loading && !data) return <Loading lines={6} />;
  if (error) return <Unavailable>UN Comtrade unavailable: {error.message}</Unavailable>;
  const fmt = (v: number) => `$${compact(v)}`;
  const rows = (data.partners as any[]).filter((p) => p.entity).slice(0, 12);
  return (
    <div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        <Link className="btn sm" to="/" onClick={() => setMap({ fill: `tradewith:${iso3}:total` })}>Map all partners</Link>
        <Link className="btn sm" to="/" onClick={() => setMap({ fill: `tradewith:${iso3}:balance` })}>Map trade balances</Link>
        <Link className="btn sm" to={`/trade?a=${iso3}`}>Trade explorer →</Link>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead><tr><th>Partner, {data.year}</th><th className="num">Exports</th><th className="num">Imports</th><th className="num">Balance</th><th className="num">Share</th><th></th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.ccn3}><td><Link to={`/entity/${encodeURIComponent(p.entity.id)}`}>{p.entity.flag} {p.entity.name}</Link></td><td className="num">{fmt(p.exports)}</td><td className="num">{fmt(p.imports)}</td>
              <td className={`num ${p.exports >= p.imports ? 'good' : 'bad'}`}>{p.exports >= p.imports ? '+' : '−'}{fmt(Math.abs(p.exports - p.imports))}</td><td className="num">{p.share?.toFixed(1)}%</td>
              <td><Link className="small" to={`/trade?a=${iso3}&b=${p.iso3}`} title="Both sides’ reports, products, tariffs and sanctions">⇄ pair</Link></td></tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ marginTop: 8 }}><SourceRef id="un-comtrade" /> <span className="tiny muted">· as reported by {iso3} · retrieved {ago(data.fetchedAt)}</span></div>
    </div>
  );
}

// ───────── Companies located in a place ─────────
export function CompaniesSection({ companies, operating }: { companies: any[]; operating: RelView[] }) {
  if (!companies.length && !operating.length) return null;
  return (
    <Card title="Industry & corporate landscape" id="companies">
      {companies.length > 0 && (
        <table className="data" style={{ marginBottom: 10 }}>
          <thead><tr><th>Headquartered here</th><th>Industry</th><th>Listing</th></tr></thead>
          <tbody>{companies.map((c) => (
            <tr key={c.id}><td><Link to={`/entity/${encodeURIComponent(c.id)}`}><strong>{c.name}</strong></Link> <span className="tiny muted">{c.parentName}</span></td>
              <td>{c.industries.map((i: any) => i.name).join(', ')}</td><td>{c.attrs.public ? c.attrs.exchange : <span className="badge">Private</span>}</td></tr>
          ))}</tbody>
        </table>
      )}
      {operating.length > 0 && <div className="relGroup"><div className="lbl">Foreign & domestic companies with major operations here</div><div className="chips">{operating.map((r) => <EntityChip key={r.rel.id} e={r.other} />)}</div></div>}
      <div className="tiny muted">Market-cap and revenue rankings need a licensed fundamentals feed for non-US filers; US filers show SEC data on their profiles.</div>
    </Card>
  );
}

// ───────── Organization members ─────────
export function MembersSection({ id }: { id: string }) {
  const [year, setYear] = useState<string>('');
  const { data, loading } = useApi<any[]>(`/igo/${encodeURIComponent(id)}/members${year ? `?year=${year}` : ''}`, 600_000);
  const { setMap, select } = useApp();
  const nav = useNavigate();
  const active = (data || []).filter((m) => m.active), former = (data || []).filter((m) => !m.active && !m.joinedLater), later = (data || []).filter((m) => m.joinedLater);
  return (
    <Card title={`Members${data ? ` (${active.length}${year ? ` in ${year}` : ''})` : ''}`} id="members" actions={
      <div className="row"><input className="input" style={{ width: 110 }} type="number" min={1945} max={2026} placeholder="As of year" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Membership as of year" />
        <button className="btn primary sm" onClick={() => { setMap({ fill: 'igo', igos: [id], igoYear: year || null }); select(id); nav('/'); }}>Highlight on map</button></div>}>
      {loading && !data ? <Loading /> : !data?.length ? <Unavailable>Member-by-member list not yet loaded for this organization.</Unavailable> : (
        <>
          <table className="data">
            <thead><tr><th>Member</th><th>Joined</th><th></th></tr></thead>
            <tbody>{active.map((m) => (
              <tr key={m.id}><td><Link to={`/entity/${encodeURIComponent(m.id)}`}>{m.flag} {m.name}</Link></td><td className="tab">{m.from || '—'}</td>
                <td className="r"><button className="btn ghost sm" onClick={() => { select(m.id, { fly: true }); setMap({ fill: 'igo', igos: [id] }); nav('/'); }}>Map ↗</button></td></tr>
            ))}</tbody>
          </table>
          {former.length > 0 && <div className="relGroup" style={{ marginTop: 10 }}><div className="lbl">Former members</div><div className="chips">{former.map((m) => <EntityChip key={m.id} e={{ id: m.id, type: 'country', name: `${m.name} (${m.from}–${m.to})`, flag: m.flag }} />)}</div></div>}
          {later.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>Joined after {year}: {later.map((m) => m.name).join(', ')}</div>}
        </>
      )}
    </Card>
  );
}

// ───────── Market data (companies & commodities) ─────────
export function QuoteSection({ id, label = 'Market data' }: { id: string; label?: string }) {
  const [range, setRange] = useState('1y');
  const { data, error, loading } = useApi<Quote & { fetchedAt: string; stale: boolean }>(`/quote/${encodeURIComponent(id)}?range=${range}`, 300_000);
  return (
    <Card title={label} id="market" actions={<div className="seg">{['1mo', '6mo', '1y', '5y', 'max'].map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r.toUpperCase()}</button>)}</div>}>
      {loading && !data ? <Loading lines={4} /> : error && !data ? <Unavailable>Quote unavailable ({error.message}). No price is shown rather than an estimate.</Unavailable> : data && (
        <div className="quote">
          <div className="row wrap" style={{ alignItems: 'baseline', gap: 12 }}>
            <span className="px">{money(data.price, data.currency)}</span>
            {data.changePct != null && <span className={`num ${data.changePct >= 0 ? 'good' : 'bad'}`} style={{ fontWeight: 600 }}>{data.change != null ? `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)} ` : ''}({pct(data.changePct)})</span>}
            <Quality q={data.quality} />
          </div>
          <div className="small muted">{data.symbol} · {data.exchange} · {data.currency} · as of {fmtDate(data.marketTime, true)}{data.stale ? ' · cached copy (provider unreachable)' : ''}</div>
          <div className="row wrap small" style={{ margin: '8px 0', gap: 16 }}>
            <span>Day range <strong className="num">{money(data.dayLow, data.currency)} – {money(data.dayHigh, data.currency)}</strong></span>
            <span>52-week range <strong className="num">{money(data.fiftyTwoWeekLow, data.currency)} – {money(data.fiftyTwoWeekHigh, data.currency)}</strong></span>
          </div>
          {data.history && data.history.length > 1 && (
            <LineChart ariaLabel={`${data.symbol} price history`} series={[{ label: data.symbol, color: 'var(--s1)', points: data.history.map((p) => ({ x: Date.parse(p.t), y: p.c, xLabel: range === '1mo' || range === '6mo' ? p.t.slice(5) : p.t.slice(0, 7) })) }]} yFormat={(v) => money(v, data.currency, v >= 1000 ? 0 : 2)} />
          )}
          <SourceRef id={data.sourceId} />
        </div>
      )}
    </Card>
  );
}

export function FundamentalsSection({ id }: { id: string }) {
  const { data, loading, error } = useApi<any>(`/fundamentals/${encodeURIComponent(id)}`, 3600_000);
  const rows = ['revenue', 'operatingIncome', 'netIncome', 'operatingCashFlow', 'capex', 'dna', 'cash', 'debt', 'equity'];
  return (
    <Card title="Financial statements" id="financials">
      {loading && !data ? <Loading lines={6} /> : error ? <Unavailable>SEC EDGAR unavailable: {error.message}</Unavailable> : data?.unavailable ? <Unavailable>{data.reason}</Unavailable> : data && (() => {
        const years = [...new Set(rows.flatMap((k) => data.metrics[k]?.values.map((v: any) => v.end) || []))].sort().slice(-5);
        const unit = data.metrics.revenue?.unit || 'USD';
        const d = data.derived || {};
        return (
          <>
            <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 12 }}>
              {[['Market cap', d.marketCap], ['Enterprise value', d.enterpriseValue], ['P/E (trailing FY)', d.peTrailingFY], ['EV / sales', d.evToSales], ['Operating margin', d.operatingMargin], ['Net margin', d.netMargin], ['EBITDA', d.ebitda], ['Free cash flow', d.freeCashFlow]].map(([k, v]: any) => (
                <div className="stat" key={k} title={v?.note}><div className="k">{k}</div><div className="v">{v ? (v.unit === 'USD' || v.unit === unit ? `${unit === 'USD' ? '$' : unit + ' '}${compact(v.value)}` : fmtUnit(v.value, v.unit)) : '—'}</div><div className="m">{v ? (v.period || 'derived') : 'not available'}</div></div>
              ))}
            </div>
            <table className="data">
              <thead><tr><th>{unit}, fiscal year ending</th>{years.map((y) => <th key={y} className="r">{y}</th>)}</tr></thead>
              <tbody>{rows.filter((k) => data.metrics[k]).map((k) => (
                <tr key={k}><td title={data.metrics[k].concept}>{data.metrics[k].label}</td>{years.map((y) => { const v = data.metrics[k].values.find((x: any) => x.end === y); return <td key={y} className="r">{v ? compact(v.value) : '—'}</td>; })}</tr>
              ))}</tbody>
            </table>
            <div style={{ marginTop: 6 }}><SourceRef id="sec-edgar" /> <span className="tiny muted">· {data.entityName} (CIK {data.cik}) annual filings (10-K / 20-F) · derived metrics are labelled and computed from filed values and the delayed quote · retrieved {ago(data.fetchedAt)}</span></div>
          </>
        );
      })()}
    </Card>
  );
}

// ───────── Position tracker ─────────
export function PositionSection({ e, positions, onChange }: { e: Entity; positions: any[]; onChange: () => void }) {
  const { user } = useAuth();
  const { toast } = useApp();
  const quote = useApi<Quote>(e.attrs?.quoteSymbol ? `/quote/${encodeURIComponent(e.id)}?range=1mo` : null, 300_000);
  const [form, setForm] = useState<any>(null);
  const [err, setErr] = useState('');
  const cur = quote.data?.currency || e.attrs?.currency || 'USD';
  if (!e.attrs?.quoteSymbol) return null;
  const start = () => setForm({ side: 'long', price: quote.data ? quote.data.price.toFixed(2) : '', date: localToday(), quantity: '', portfolio: '', thesis: '' });
  const submit = async () => {
    setErr('');
    try {
      await api('/positions', { body: { entityId: e.id, side: form.side, portfolio: form.portfolio, thesis: form.thesis, transactions: [{ kind: 'open', date: form.date, price: Number(form.price), quantity: form.quantity || null }] } });
      setForm(null); invalidate('/search'); invalidate('/preview'); invalidate('/positions'); onChange(); toast('Position recorded');
    } catch (x: any) { setErr(x.message); }
  };
  return (
    <Card title={<>My position <span className="badge private">Private</span></>} id="position" actions={user && !form && <button className="btn sm" onClick={start}>＋ Record position</button>}>
      {!user ? <div className="small"><Link to="/login">Sign in</Link> to record long/short positions and investment theses for {e.name}.</div> : (
        <div className="stack">
          {positions.length === 0 && !form && <div className="small muted">No position recorded. Positions are private to your account and never shared.</div>}
          {positions.map((p) => <PositionDetail key={p.id} p={p} e={e} quote={quote.data} currency={cur} onChange={onChange} />)}
          {form && (
            <div className="posBox stack">
              <div className="grid2">
                <label className="field">Direction<div className="seg"><button className={form.side === 'long' ? 'on' : ''} onClick={() => setForm({ ...form, side: 'long' })}>LONG</button><button className={form.side === 'short' ? 'on' : ''} onClick={() => setForm({ ...form, side: 'short' })}>SHORT</button></div></label>
                <label className="field">Entry price ({cur})<input className="input" type="number" step="0.01" min="0" value={form.price} onChange={(x) => setForm({ ...form, price: x.target.value })} /></label>
                <label className="field">Entry date<input className="input" type="date" value={form.date} onChange={(x) => setForm({ ...form, date: x.target.value })} /></label>
                <label className="field">Quantity (optional)<input className="input" type="number" min="0" step="any" value={form.quantity} onChange={(x) => setForm({ ...form, quantity: x.target.value })} /></label>
                <label className="field">Portfolio (optional)<input className="input" value={form.portfolio} placeholder="e.g. Core, Energy sleeve" onChange={(x) => setForm({ ...form, portfolio: x.target.value })} /></label>
              </div>
              <label className="field">Investment thesis<textarea className="input" value={form.thesis} placeholder="Why you hold it, what would change your mind…" onChange={(x) => setForm({ ...form, thesis: x.target.value })} /></label>
              {err && <div className="err small">{err}</div>}
              <div className="row"><button className="btn primary sm" onClick={submit}>Save position</button><button className="btn sm" onClick={() => setForm(null)}>Cancel</button>
                {quote.data && <span className="tiny muted">Price prefilled from the delayed quote ({fmtDate(quote.data.marketTime, true)}); edit freely.</span>}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PositionDetail({ p, e, quote, currency, onChange }: { p: any; e: Entity; quote?: Quote; currency: string; onChange: () => void }) {
  const s = p.summary;
  const divs = useApi<any>(quote && s.firstEntryDate ? `/dividends/${encodeURIComponent(e.id)}?since=${s.firstEntryDate}` : null, 3600_000);
  const [tx, setTx] = useState<any>(null);
  const [thesis, setThesis] = useState<string | null>(null);
  const pf = quote && p.status === 'open' ? perf(s, quote.price) : null;
  const divPerShare = divs.data ? divs.data.dividends.reduce((a: number, d: any) => a + d.amount, 0) : null;
  const total = pf && divPerShare != null ? (s.side === 'long' ? ((quote!.price + divPerShare) / s.avgEntry - 1) * 100 : ((s.avgEntry - quote!.price - divPerShare) / s.avgEntry) * 100) : null;
  const refresh = () => { invalidate('/search'); invalidate('/preview'); invalidate('/positions'); onChange(); };
  return (
    <div className={`posBox ${p.side}`}>
      <div className="row wrap">
        <span className={`badge ${p.side}`}>{p.side.toUpperCase()}</span>
        <strong>Avg entry {money(s.avgEntry, currency)}</strong>
        <span className="small muted">since {fmtDate(s.firstEntryDate)}{s.quantity != null ? ` · ${s.quantity} shares` : ''}{p.portfolio ? ` · ${p.portfolio}` : ''}</span>
        <span className="badge">{p.status}</span>
      </div>
      {pf ? (
        <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', margin: '10px 0' }}>
          <div className="stat"><div className="k">Last price ({fmtDate(quote!.marketTime)})</div><div className="v">{money(quote!.price, currency)}</div><div className="m">delayed</div></div>
          <div className="stat"><div className="k">Price return</div><div className={`v ${pf.r >= 0 ? 'good' : 'bad'}`}>{pct(pf.r)}</div><div className="m">{pf.pnl != null ? `${money(pf.pnl, currency)} unrealized` : 'add quantity for P/L'}</div></div>
          <div className="stat" title="Price change plus cash dividends per share paid since first entry, not reinvested. Short positions owe dividends."><div className="k">Total return</div><div className={`v ${total != null && total >= 0 ? 'good' : 'bad'}`}>{total != null ? pct(total) : '—'}</div><div className="m">{divPerShare != null ? `incl. ${money(divPerShare, currency)}/sh dividends` : divs.loading ? 'loading dividends…' : 'dividends unavailable'}</div></div>
        </div>
      ) : p.status === 'open' ? <div className="small muted" style={{ margin: '8px 0' }}>Quote unavailable — performance not calculated.</div> : null}
      {thesis == null ? (
        p.thesis ? <div className="small" style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}><span className="muted">Thesis: </span>{p.thesis}</div> : null
      ) : (
        <div className="stack" style={{ margin: '6px 0' }}><textarea className="input" value={thesis} onChange={(x) => setThesis(x.target.value)} /><div className="row"><button className="btn sm primary" onClick={async () => { await api(`/positions/${p.id}`, { method: 'PUT', body: { thesis } }); setThesis(null); refresh(); }}>Save thesis</button><button className="btn sm" onClick={() => setThesis(null)}>Cancel</button></div></div>
      )}
      <table className="data" style={{ marginTop: 6 }}>
        <thead><tr><th>Date</th><th>Type</th><th className="r">Price</th><th className="r">Qty</th><th></th></tr></thead>
        <tbody>{p.transactions.map((t: any) => (
          <tr key={t.id}><td className="tab">{t.date}</td><td>{t.kind}</td><td className="r">{money(t.price, currency)}</td><td className="r">{t.quantity ?? '—'}</td>
            <td className="r"><button className="btn ghost sm" aria-label="Delete transaction" onClick={async () => { if (confirm('Delete this transaction?')) { await api(`/transactions/${t.id}`, { method: 'DELETE' }); refresh(); } }}>✕</button></td></tr>
        ))}</tbody>
      </table>
      {tx ? (
        <div className="row wrap" style={{ marginTop: 8 }}>
          <select className="input" style={{ width: 100 }} value={tx.kind} onChange={(x) => setTx({ ...tx, kind: x.target.value })}><option value="add">Add</option><option value="reduce">Reduce</option><option value="close">Close</option></select>
          <input className="input" style={{ width: 140 }} type="date" value={tx.date} onChange={(x) => setTx({ ...tx, date: x.target.value })} />
          <input className="input" style={{ width: 110 }} type="number" step="0.01" placeholder="Price" value={tx.price} onChange={(x) => setTx({ ...tx, price: x.target.value })} />
          <input className="input" style={{ width: 90 }} type="number" step="any" placeholder="Qty" value={tx.quantity} onChange={(x) => setTx({ ...tx, quantity: x.target.value })} />
          <button className="btn sm primary" onClick={async () => { try { await api(`/positions/${p.id}/transactions`, { body: { ...tx, price: Number(tx.price), quantity: tx.quantity || null } }); setTx(null); refresh(); } catch (x: any) { alert(x.message); } }}>Add</button>
          <button className="btn sm" onClick={() => setTx(null)}>Cancel</button>
        </div>
      ) : (
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => setTx({ kind: 'add', date: localToday(), price: quote?.price.toFixed(2) || '', quantity: '' })}>＋ Transaction</button>
          <button className="btn sm" onClick={() => setThesis(p.thesis || '')}>Edit thesis</button>
          <button className="btn sm" onClick={async () => { await api(`/positions/${p.id}`, { method: 'PUT', body: { status: p.status === 'open' ? 'closed' : 'open' } }); refresh(); }}>{p.status === 'open' ? 'Mark closed' : 'Reopen'}</button>
          <button className="btn sm danger" onClick={async () => { if (confirm('Delete this position and its transactions?')) { await api(`/positions/${p.id}`, { method: 'DELETE' }); refresh(); } }}>Delete</button>
        </div>
      )}
    </div>
  );
}

// ───────── Commodities ─────────
export function ProducersSection({ e, rels }: { e: Entity; rels: RelView[] }) {
  const { setMap } = useApp();
  const nav = useNavigate();
  const groups: [string, RelView[]][] = [
    ['Major producing countries', relsBy(rels, 'produces', 'in').filter((r) => r.other.type === 'country')],
    ['Leading sub-national producers (ranked within their country)', relsBy(rels, 'produces', 'in').filter((r) => r.other.type === 'state')],
    ['Leading exporters', relsBy(rels, 'exports', 'in')],
    ['Leading importers / consumers', [...relsBy(rels, 'imports', 'in'), ...relsBy(rels, 'consumes', 'in')]],
  ];
  const companies = [...relsBy(rels, 'produces', 'in').filter((r) => r.other.type === 'company'), ...relsBy(rels, 'uses', 'in')];
  if (!groups.some(([, l]) => l.length) && !companies.length) return null;
  return (
    <Card title="Supply, demand & market participants" id="producers" actions={groups[0][1].length > 0 && <button className="btn sm" onClick={() => { setMap({ fill: `commodity:${e.id.split(':')[1]}` }); nav('/'); }}>Show on map</button>}>
      {groups.filter(([, l]) => l.length).map(([label, list]) => (
        <div key={label} className="relGroup">
          <div className="lbl">{label}</div>
          <table className="data"><tbody>{list.sort((a, b) => (a.rel.rank ?? 99) - (b.rel.rank ?? 99)).map((r) => (
            <tr key={r.rel.id}><td style={{ width: 40 }} className="tab">{r.rel.rank ? `#${r.rel.rank}` : ''}</td><td><Link to={`/entity/${encodeURIComponent(r.other.id)}`}>{r.other.flag || TYPE_ICON[r.other.type]} {r.other.name}</Link></td><td className="small muted">{r.rel.note}</td><td className="r"><SourceRef id={r.rel.sourceId} prefix="" /></td></tr>
          ))}</tbody></table>
        </div>
      ))}
      {companies.length > 0 && <div className="relGroup"><div className="lbl">Related public & private companies</div><div className="chips">{companies.map((r) => <EntityChip key={r.rel.id} e={r.other} title={r.rel.role || (r.rel.type === 'produces' ? 'Producer' : 'User / trader')} />)}</div></div>}
      <div className="tiny muted">Ranks appear only where the cited source ranks producers; unranked entries are major participants. Volumes need a licensed time-series feed (Phase II).</div>
    </Card>
  );
}

export function RankingSection({ codes }: { codes: string[] }) {
  return <>{codes.map((c) => <Ranking key={c} code={c} />)}</>;
}
function Ranking({ code }: { code: string }) {
  const { data, loading, error } = useApi<any>(`/rankings/${code}?limit=10`, 3600_000);
  return (
    <Card title={data ? `Top countries — ${data.label}` : 'Ranking'}>
      {loading && !data ? <Loading /> : error ? <Unavailable>{error.message}</Unavailable> : data && (
        <>
          <BarList format={(v) => fmtUnit(v, data.unit)} rows={data.rows.map((r: any) => ({ key: r.entity.id, value: r.value, sub: r.period, label: <Link to={`/entity/${encodeURIComponent(r.entity.id)}`}>{r.entity.flag} {r.entity.name}</Link> }))} />
          <SourceRef id="world-bank-wdi" /> <span className="tiny muted">· latest year available per country</span>
        </>
      )}
    </Card>
  );
}

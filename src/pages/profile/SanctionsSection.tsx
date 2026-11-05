// Sanctions & tariffs on profiles:
//   • countries — sanctions against them (US, EU, UK, UN lists), US tariffs actually charged on their
//     goods, US tariff actions naming them, and the tariffs they apply themselves (World Bank);
//   • the EU, the UN, the US and the UK — also the sanctions regimes they run;
//   • people and companies — a "same name as a listing" notice, never presented as a confirmed match.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../api';
import { Card, Loading, SourceRef, Unavailable } from '../../components/common';
import { compact, fmtDate, ago } from '../../format';

const LIST_LABEL: Record<string, string> = { US: 'United States (OFAC)', EU: 'European Union', UK: 'United Kingdom', UN: 'UN Security Council' };
const TYPE_LABEL: Record<string, string> = { individual: 'people', entity: 'companies & organisations', vessel: 'ships', aircraft: 'aircraft', other: 'other' };
const TYPE_ONE: Record<string, string> = { individual: 'person', entity: 'company or organisation', vessel: 'ship', aircraft: 'aircraft', other: 'other' };
const typeCount = (k: string, n: number) => `${n.toLocaleString()} ${n === 1 ? TYPE_ONE[k] || k : TYPE_LABEL[k] || k}`;
const usd = (v: number) => `US$${compact(v)}`;
const pp = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} pts`;

/** Shown for countries and for the EU, UN, US and UK (which impose sanctions). */
export function SanctionsTariffsSection({ id, name, type }: { id: string; name: string; type: string }) {
  const s = useApi<any>(`/sanctions/place/${encodeURIComponent(id)}`, 600_000);
  const t = useApi<any>(type === 'country' || id === 'igo:eu' ? `/tariffs/place/${encodeURIComponent(id)}` : null, 600_000);
  if (type === 'igo' && !s.data?.imposes && !t.data?.us) return null;
  const mapLink = (fill: string) => `/?fill=${encodeURIComponent(fill)}`;
  return (
    <Card title="Sanctions & tariffs" id="sanctions" actions={<span className="row" style={{ gap: 6 }}><Link className="btn sm" to={mapLink('sanctions:ALL')}>Sanctions map</Link><Link className="btn sm" to={mapLink('tariffs:us-effective')}>US tariff map</Link></span>}>
      {type === 'country' && <SanctionsAgainst data={s.data} loading={s.loading} error={s.error} name={name} />}
      {s.data?.imposes && <RegimesImposed imp={s.data.imposes} name={name} lists={s.data.lists} />}
      {(type === 'country' || id === 'igo:eu') && <Tariffs data={t.data} loading={t.loading} error={t.error} name={name} isUS={id === 'country:USA'} isEU={id === 'igo:eu'} />}
    </Card>
  );
}

function ListStatus({ lists }: { lists: any[] }) {
  const failed = (lists || []).filter((l) => l.error);
  return (
    <div className="tiny muted" style={{ marginTop: 6 }}>
      {(lists || []).map((l, i) => <span key={l.id}>{i ? ' · ' : ''}<a href={l.search} target="_blank" rel="noreferrer">{LIST_LABEL[l.id]} ↗</a>{l.fetchedAt ? ` (${l.count?.toLocaleString()} entries, ${ago(l.fetchedAt)})` : ''}</span>)}
      {failed.length > 0 && <span style={{ color: 'var(--warn)' }}> · Not loaded: {failed.map((l) => LIST_LABEL[l.id]).join(', ')}</span>}
    </div>
  );
}

function SanctionsAgainst({ data, loading, error, name }: { data: any; loading: boolean; error: any; name: string }) {
  const [all, setAll] = useState(false);
  if (loading && !data) return <Loading lines={4} />;
  if (error) return <Unavailable>Sanctions lists unavailable: {error.message}</Unavailable>;
  if (!data?.status) return <Unavailable>The sanctions lists are still loading — this section fills in within a minute of the terminal starting.</Unavailable>;
  const tg = data.target;
  if (!tg) return <><div className="small">No one on the US, EU, UK or UN consolidated lists is connected to {name} by nationality, citizenship or address, and no programme is named after it.</div><ListStatus lists={data.lists} /></>;
  const programmes = tg.programmes.filter((p: any) => p.targeted);
  const other = tg.programmes.filter((p: any) => !p.targeted);
  const total = Object.values<number>(tg.listings).reduce((a, b) => a + b, 0);
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 6 }}>Sanctions against {name}</h3>
      <div className="kpis" style={{ margin: '4px 0 10px' }}>
        {(['US', 'EU', 'UK', 'UN'] as const).map((l) => (
          <div className="kpi" key={l}><div className="tiny muted">{LIST_LABEL[l]}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{tg.listings[l].toLocaleString()}</div>
            <div className="tiny muted">{programmes.filter((p: any) => p.list === l).length ? `country programme: ${programmes.filter((p: any) => p.list === l).map((p: any) => p.program).slice(0, 2).join(', ')}` : 'listings connected'}</div></div>
        ))}
      </div>
      <div className="small" style={{ marginBottom: 6 }}>
        {total.toLocaleString()} listing{total === 1 ? '' : 's'}: {Object.entries<number>(tg.byType || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => typeCount(k, v)).join(', ')}.
        {programmes.length ? ` ${programmes.length} programme${programmes.length > 1 ? 's are' : ' is'} aimed at ${name} as a whole.` : ' No programme is named after the country: these are individual designations (terrorism, cyber, human rights, narcotics…).'}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead><tr><th>List</th><th>Programme</th><th className="num">Entries</th><th>Scope</th></tr></thead>
          <tbody>{[...programmes, ...other].slice(0, all ? 40 : 8).map((p: any) => (
            <tr key={`${p.list}:${p.program}`}><td className="small">{LIST_LABEL[p.list]}</td><td className="small"><strong>{p.program}</strong></td><td className="num">{p.count.toLocaleString()}</td>
              <td className="tiny">{p.targeted ? <span className="badge" style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }}>country programme</span> : <span className="muted">individual listings</span>}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {tg.programmes.length > 8 && <button className="linkish small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${Math.min(40, tg.programmes.length)} programmes`}</button>}
      {tg.recent?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="lbl small muted" style={{ marginBottom: 4 }}>Designated in the last 120 days</div>
          <div className="stack" style={{ gap: 3 }}>{tg.recent.slice(0, 8).map((r: any, i: number) => <div key={i} className="small"><span className="tiny muted num">{fmtDate(r.date)}</span> · {LIST_LABEL[r.list]} · <strong>{r.name}</strong> <span className="tiny muted">({TYPE_LABEL[r.type] || r.type}{r.program ? `, ${r.program}` : ''})</span></div>)}</div>
        </div>
      )}
      <div className="tiny muted" style={{ marginTop: 8 }}>A listing is connected to {name} by nationality, citizenship or address (a ship’s flag does not count), or because its programme is named after the country. Names alone are not proof of identity — check the official search before acting on any entry.</div>
      <ListStatus lists={data.lists} />
    </div>
  );
}

function RegimesImposed({ imp, name, lists }: { imp: any; name: string; lists: any[] }) {
  const [all, setAll] = useState(false);
  if (!imp.regimes?.length) return <div className="small muted" style={{ marginBottom: 12 }}>{imp.name} could not be loaded yet.</div>;
  const total = imp.regimes.reduce((a: number, r: any) => a + r.count, 0);
  const st = lists?.find((l: any) => l.id === imp.list);
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 6 }}>Sanctions {name} imposes</h3>
      <div className="small" style={{ marginBottom: 6 }}>{imp.regimes.length} programmes, {total.toLocaleString()} programme entries on the {imp.name}{st?.fetchedAt ? ` (retrieved ${ago(st.fetchedAt)})` : ''}.</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead><tr><th>Programme</th><th>Aimed at</th><th className="num">Entries</th><th>Latest listing</th></tr></thead>
          <tbody>{imp.regimes.slice(0, all ? 80 : 10).map((r: any) => (
            <tr key={r.program}><td className="small"><strong>{r.program}</strong></td>
              <td className="small">{r.target ? <Link to={`/entity/${encodeURIComponent(r.target.id)}`}>{r.target.flag} {r.target.name}</Link> : <span className="muted">thematic (terrorism, cyber, human rights…)</span>}</td>
              <td className="num">{r.count.toLocaleString()}</td><td className="tiny muted">{r.latest ? fmtDate(r.latest) : '—'}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {imp.regimes.length > 10 && <button className="linkish small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${imp.regimes.length}`}</button>}
      <div className="tiny" style={{ marginTop: 4 }}><SourceRef id={imp.sourceId} /> · <a href={imp.search} target="_blank" rel="noreferrer">Official search ↗</a></div>
    </div>
  );
}

function Tariffs({ data, loading, error, name, isUS, isEU }: { data: any; loading: boolean; error: any; name: string; isUS: boolean; isEU: boolean }) {
  if (loading && !data) return <Loading lines={4} />;
  if (error) return <Unavailable>Tariff data unavailable: {error.message}</Unavailable>;
  if (!data) return null;
  const us = data.us;
  const wb = (data.wb?.indicators || []) as any[];
  return (
    <div>
      <h3 style={{ marginBottom: 6 }}>{isUS ? 'US tariffs on imports' : `US tariffs on goods from ${isEU ? 'the EU' : name}`}</h3>
      {us ? (
        <>
          <div className="kpis" style={{ margin: '4px 0 8px' }}>
            <div className="kpi" title="Calculated duties ÷ value of imports for consumption"><div className="tiny muted">Effective rate, {us.label}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{us.row.rate != null ? `${us.row.rate.toFixed(1)}%` : '—'}</div><div className="tiny muted">{usd(us.row.duties)} duties on {usd(us.row.imports)}</div></div>
            {us.previous?.row.rate != null && us.row.rate != null && <div className="kpi"><div className="tiny muted">vs {us.previous.label}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{pp(us.row.rate - us.previous.row.rate)}</div><div className="tiny muted">{us.previous.row.rate.toFixed(1)}% the month before</div></div>}
            {us.yearAgo?.row.rate != null && us.row.rate != null && <div className="kpi"><div className="tiny muted">vs {us.yearAgo.label}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{pp(us.row.rate - us.yearAgo.row.rate)}</div><div className="tiny muted">{us.yearAgo.row.rate.toFixed(1)}% a year earlier</div></div>}
            {us.row.rateYtd != null && <div className="kpi"><div className="tiny muted">Year to date</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{us.row.rateYtd.toFixed(1)}%</div><div className="tiny muted">{usd(us.row.dutiesYtd)} on {usd(us.row.importsYtd)}</div></div>}
          </div>
          {!isUS && us.rank && <div className="small" style={{ marginBottom: 6 }}>{isEU ? 'The EU' : name} is the United States’ no. {us.rank} source of imports of {us.partners} countries this month{us.all?.rate != null ? `; the average effective rate on all US imports was ${us.all.rate.toFixed(1)}%` : ''}.</div>}
          {isUS && us.top?.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 8 }}>
              <table className="data">
                <thead><tr><th>Largest sources of imports, {us.label}</th><th className="num">Imports</th><th className="num">Duties</th><th className="num">Effective rate</th></tr></thead>
                <tbody>{us.top.map((r: any) => <tr key={r.code}><td><Link to={`/entity/${encodeURIComponent(r.placeId)}`}>{r.flag} {r.name}</Link></td><td className="num">{usd(r.imports)}</td><td className="num">{usd(r.duties)}</td><td className="num">{r.rate != null ? `${r.rate.toFixed(1)}%` : '—'}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="tiny muted">The average rate importers actually declared, after exemptions and trade-agreement preferences — usually well below headline rates. Refunds and court rulings after entry are not reflected. <SourceRef id="census-trade" prefix="" /> · retrieved {ago(us.fetchedAt)}</div>
        </>
      ) : <Unavailable>{data.usError || 'No US Census import figures for this partner.'}</Unavailable>}
      {(data.actions?.length > 0 || data.global?.length > 0 || data.remedies?.count > 0) && (
        <div style={{ marginTop: 12 }}>
          <div className="lbl small muted" style={{ marginBottom: 4 }}>{isUS ? 'US tariff actions in the last 12 months' : `US tariff actions naming ${isEU ? 'the EU' : name} (12 months)`}</div>
          {data.actions?.length > 0 ? <div className="stack" style={{ gap: 4 }}>{data.actions.slice(0, 8).map((a: any) => <ActionRow key={a.id} a={a} />)}</div> : <div className="small muted">None naming {isEU ? 'the EU' : name} specifically.</div>}
          {data.global?.length > 0 && <><div className="lbl small muted" style={{ margin: '8px 0 4px' }}>Recent actions covering all countries</div><div className="stack" style={{ gap: 4 }}>{data.global.slice(0, 3).map((a: any) => <ActionRow key={a.id} a={a} />)}</div></>}
          {data.remedies?.count > 0 && <div className="tiny muted" style={{ marginTop: 6 }}>Plus {data.remedies.count} anti-dumping / countervailing-duty notice{data.remedies.count > 1 ? 's' : ''} (product-specific trade remedies){data.remedies.latest?.[0] ? `, latest: “${data.remedies.latest[0].title.slice(0, 120)}”` : ''}.</div>}
          <div className="tiny muted" style={{ marginTop: 4 }}><SourceRef id="federal-register" />{data.actionsAt ? ` · retrieved ${ago(data.actionsAt)}` : ''}</div>
        </div>
      )}
      {data.actionsError && !data.actions?.length && <div className="tiny" style={{ color: 'var(--warn)', marginTop: 6 }}>Federal Register unavailable: {data.actionsError}</div>}
      {wb.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="lbl small muted" style={{ marginBottom: 4 }}>Tariffs {isEU ? 'the EU' : name} applies to its own imports</div>
          <div className="kpis" style={{ margin: '4px 0 6px' }}>{wb.map((i) => <div className="kpi" key={i.code}><div className="tiny muted">{i.label.replace(/^Tariff rate, /, '').replace(', all products (%)', '')}</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{i.latest.value.toFixed(1)}%</div><div className="tiny muted">{i.latest.period}</div></div>)}</div>
          <div className="tiny muted">Average across all products and partners (World Bank, from UNCTAD TRAINS / WTO data) — published with a lag of a year or more, so recent tariff changes are not yet included. <SourceRef id="world-bank-wdi" prefix="" /></div>
        </div>
      )}
    </div>
  );
}

function ActionRow({ a }: { a: any }) {
  return (
    <div className="small">
      <span className="tiny muted num">{fmtDate(a.date)}</span> · <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a>
      <span className="tiny muted"> · {a.subtype || a.type}{a.agencies?.length ? ` · ${a.agencies[0]}` : ''}{a.effective ? ` · effective ${fmtDate(a.effective)}` : ''}</span>
    </div>
  );
}

/** People and companies: same name as an entry on a sanctions list. */
export function SanctionsMatchNotice({ id }: { id: string }) {
  const { data } = useApi<any>(`/sanctions/entity/${encodeURIComponent(id)}`, 600_000);
  const m: any[] = data?.matches || [];
  if (!m.length) return null;
  return (
    <div className="banner" role="note" style={{ marginTop: 8 }}>
      <span>⛔ <strong>Same name as {m.length} sanctions listing{m.length > 1 ? 's' : ''}:</strong>{' '}
        {m.slice(0, 4).map((x, i) => <span key={i}>{i ? '; ' : ''}{LIST_LABEL[x.list]} — “{x.name}” ({x.programs.slice(0, 2).join(', ')}{x.listedOn ? `, listed ${fmtDate(x.listedOn)}` : ''}) <a href={x.search} target="_blank" rel="noreferrer">check ↗</a></span>)}.
        <span className="tiny muted"> Matched on name only (first and last name, or company name without its legal form): confirm identity on the official search.</span></span>
    </div>
  );
}

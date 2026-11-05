// The knowledge web on profiles: every connection grouped and ranked by what the link carries,
// with its sources (✓ when two sources agree, ⚠ when they disagree), and an explorer for any
// indicator in the World Bank and IMF catalogs.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { useApp } from '../state';
import { Card, Loading, SourceRef, useDebounced, useSources } from './common';
import { LineChart } from './Charts';
import { compact, fmtUnit, TYPE_ICON } from '../format';

const money = (v: number) => `$${compact(v)}`;
const yr = (d?: string) => (d ? d.slice(0, 4) : '');
/** Short text for what a link carries. */
function detailOf(type: string, it: any): string {
  if (type === 'trades_with') return `${it.value != null ? money(it.value) : ''}${it.data?.share != null ? ` · ${it.data.share}%` : ''}${it.period ? ` · ${it.period}` : ''}`;
  if (type === 'mentioned_with') return `${it.value} ${it.value === 1 ? 'story' : 'stories'}`;
  if (type === 'sanctions') return `${(it.data?.programmes || []).map((p: any) => p.program).slice(0, 2).join(', ')}${it.value ? ` · ${it.value} listed` : ''}`;
  if (type === 'member_of') return it.current ? (it.since ? `since ${yr(it.since)}` : '') : `${it.since ? `${yr(it.since)}–` : 'until '}${yr(it.until)}`;
  if (it.role && !/^(Chief executive officer|Chair|Governor|Secretary-General|Director),/.test(it.role)) return it.role;
  if (it.role) return it.role.split(',')[0];
  if (it.value != null) return fmtUnit(it.value, it.unit);
  return it.since ? `since ${yr(it.since)}` : '';
}
function tradeTitle(it: any) {
  const o = it.data?.own, m = it.data?.mirror;
  return [o && `As this country reports (${o.year}): exports ${money(o.exports)}, imports ${money(o.imports)}`, m && `As the partner reports (${m.year}): exports to it ${money(m.imports)}, imports from it ${money(m.exports)}`].filter(Boolean).join('\n');
}

export function ConnectionsCard({ id, name }: { id: string; name: string }) {
  const { data, loading, error } = useApi<any>(`/web/${encodeURIComponent(id)}?limit=100`, 120_000);
  const sources = useSources();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const srcName = (s: string) => sources[s]?.name?.split(' — ')[0] || s;
  return (
    <Card title="Connections" id="relationships" actions={<span className="row" style={{ gap: 6 }}>
      <Link className="btn sm" to={`/web?focus=${encodeURIComponent(id)}`} title="Interactive network of everything connected to this">❖ Network</Link>
      <Link className="btn sm" to={`/?fill=${encodeURIComponent(`web:${id}`)}`} title="Shade the world map by how each country is connected to this">Map connections</Link></span>}>
      {loading && !data ? <Loading lines={4} /> : error ? <div className="small muted">{error.message}</div> : !data?.groups?.length ? <div className="small muted">No connections recorded yet.</div> : (
        <>
          <div className="tiny muted" style={{ marginBottom: 8 }}>{data.total.toLocaleString()} connections. Ranked by what each link carries (trade value, stories in common, listings) — ✓ two sources agree, ⚠ sources disagree.</div>
          {data.groups.map((g: any) => {
            const shown = open[g.key] ? g.items : g.items.slice(0, 12);
            return (
              <div className="relGroup" key={g.key}>
                <div className="lbl">{g.label} <span className="muted">({g.total})</span></div>
                <div className="webItems">
                  {shown.map((it: any) => {
                    const detail = detailOf(g.type, it);
                    const title = [g.type === 'trades_with' ? tradeTitle(it) : '', g.type === 'mentioned_with' && it.data?.last ? `Latest: ${it.data.last.title}` : '', `Source${it.sources.length > 1 ? 's' : ''}: ${it.sources.map(srcName).join('; ')}`, ...(it.disputes || []).map((d: any) => `⚠ ${d.detail}`)].filter(Boolean).join('\n');
                    return (
                      <Link key={it.other.id} to={`/entity/${encodeURIComponent(it.other.id)}`} className={`webItem${it.current ? '' : ' former'}`} title={title}>
                        <span aria-hidden>{it.other.flag || TYPE_ICON[it.other.type]}</span>
                        <span className="nm">{it.other.name}</span>
                        {detail && <span className="dt">{detail}</span>}
                        {it.sources.length > 1 && <span className="ok" aria-label={`${it.sources.length} sources agree`}>✓{it.sources.length}</span>}
                        {it.disputes?.length > 0 && <span className="warnMark" aria-label="Sources disagree">⚠</span>}
                      </Link>
                    );
                  })}
                  {g.items.length > 12 && <button className="linkish tiny" onClick={() => setOpen({ ...open, [g.key]: !open[g.key] })}>{open[g.key] ? 'fewer' : `+${(g.total > g.items.length ? g.total : g.items.length) - 12} more`}</button>}
                </div>
              </div>
            );
          })}
          <div className="tiny muted">Built from the hand-checked records and live sources (Wikidata, UN Comtrade, the sanctions lists, trusted news); hover a connection for its sources. {name}’s links update as each source refreshes — see the <Link to="/data#web">Data page</Link>.</div>
        </>
      )}
    </Card>
  );
}

/** Any World Bank or IMF series for a country: search, chart, and put it on the map. */
export function IndicatorExplorer({ iso3, name }: { iso3: string; name: string }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<any>(null);
  const dq = useDebounced(q.trim(), 250);
  const hits = useApi<any[]>(dq.length >= 3 ? `/catalog/metrics?q=${encodeURIComponent(dq)}&limit=10` : null, 600_000);
  const series = useApi<any>(pick ? `/indicator/${iso3}/${encodeURIComponent(pick.id)}` : null, 3600_000);
  const { setMap } = useApp();
  const pts = (series.data?.series || []) as { period: string; value: number }[];
  const last = pts.at(-1);
  return (
    <Card title="Explore any indicator" id="indicators">
      <div className="small muted" style={{ marginBottom: 6 }}>Search ~1,700 World Bank and IMF series — health, education, energy, environment, finance, trade… — for {name}.</div>
      <input className="input" placeholder="e.g. life expectancy, CO2 emissions, internet users, military spending" value={q} onChange={(e) => { setQ(e.target.value); }} aria-label="Search indicators" />
      {dq.length >= 3 && !pick && (
        <div className="stack" style={{ gap: 2, marginTop: 6 }}>
          {hits.loading && !hits.data ? <span className="tiny muted">Searching…</span> : (hits.data || []).length ? (hits.data || []).map((m) => (
            <button key={m.id} className="linkish small" style={{ textAlign: 'left' }} onClick={() => setPick(m)}>{m.label} <span className="tiny muted">· {m.provider === 'imf' ? 'IMF' : 'World Bank'}</span></button>
          )) : <span className="tiny muted">Nothing in the catalog matches “{dq}”.</span>}
        </div>
      )}
      {pick && (
        <div style={{ marginTop: 10 }}>
          <div className="row wrap" style={{ gap: 8, alignItems: 'baseline' }}>
            <strong className="small">{series.data?.label || pick.label}</strong>
            {last && <span className="num">{fmtUnit(last.value, series.data?.unit)} <span className="tiny muted">({last.period})</span></span>}
            <span className="spacer" />
            <Link className="btn sm" to="/" onClick={() => setMap({ fill: pick.provider === 'imf' ? `imf:${pick.code}:${new Date().getFullYear()}` : pick.id, year: null })}>Map all countries</Link>
            <button className="btn ghost sm" onClick={() => setPick(null)}>Back</button>
          </div>
          {series.loading && !series.data ? <Loading lines={3} /> : series.error ? <div className="small muted">{series.error.message}</div> : pts.length < 2 ? <div className="small muted">{pts.length ? `Only one value reported (${last!.period}).` : `No values reported for ${name}.`}</div> : (
            <LineChart series={[{ label: series.data.label, color: 'var(--s1)', points: pts.map((p) => ({ x: Number(p.period.slice(0, 4)) + (p.period.length > 4 ? 0.5 : 0), y: p.value, xLabel: p.period })) }]} height={200} yFormat={(v) => fmtUnit(v, series.data.unit)} ariaLabel={`${series.data.label}, ${name}`} />
          )}
          {series.data?.description && <div className="tiny muted" style={{ marginTop: 4 }}>{series.data.description.slice(0, 400)}{series.data.description.length > 400 ? '…' : ''}</div>}
          {series.data && <div className="tiny" style={{ marginTop: 2 }}><SourceRef id={series.data.sourceId} /></div>}
        </div>
      )}
    </Card>
  );
}

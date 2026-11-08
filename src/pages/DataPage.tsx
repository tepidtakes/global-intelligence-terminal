import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { Card, Loading, Quality, Unavailable } from '../components/common';
import { TierBadge } from '../components/newsBits';
import { ago, fmtDate } from '../format';
import { ENTITY_TYPE_LABEL, type DataQuality, type EntityType } from '../../shared/types';

const fmtTtl = (s: number) => s >= 86400 ? `${Math.round(s / 86400)} d` : s >= 3600 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 60)} min`;
const STATE_HELP: Record<string, string> = { ok: 'Last fetch worked', stale: 'Source failing — serving the last good copy (marked “cached” where shown)', failing: 'Source failing and no earlier copy to fall back on' };

export function DataPage() {
  const { data, loading, error, reload } = useApi<any>('/provenance/status', 60_000);
  const q = useApi<any>('/quality/report?limit=300', 60_000);
  if (loading && !data) return <div className="page"><Loading lines={10} /></div>;
  if (error) return <div className="page"><Unavailable>{error.message}</Unavailable></div>;
  const c = data.coverage; const news = data.news;
  const live = Object.entries<any>(data.live || {});
  const providers: any[] = data.providers || [];
  const feedsOk = news.feeds.filter((f: any) => f.ok).length;
  const sev = q.data?.summary?.bySeverity || { error: 0, warning: 0, info: 0 };
  return (
    <div className="page wide">
      <div className="row wrap" style={{ alignItems: 'baseline', gap: 12 }}>
        <h1>Data sources & health</h1>
        <button className="btn sm" onClick={() => { reload(); q.reload(); }}>↻ Refresh</button>
        <span className="tiny muted">Checked {ago(data.generatedAt)}</span>
      </div>
      <p className="small muted" style={{ maxWidth: 880 }}>Where every number comes from, whether each source is working right now, and what the consistency audit found. When a source fails the terminal shows its last good copy, marked as cached — never a guess. See also <a href="https://github.com/tepidtakes/global-intelligence-terminal/blob/main/DATA_SOURCES.md" target="_blank" rel="noreferrer">DATA_SOURCES.md</a>.</p>

      <div className="kpis">
        <div className="kpi"><div className="k">Entities</div><div className="v">{c.entities.toLocaleString()}</div><div className="m">{c.relationships.toLocaleString()} relationships</div></div>
        <div className="kpi"><div className="k">Sourced facts</div><div className="v">{c.facts.toLocaleString()}</div><div className="m">from {c.sources} cited sources</div></div>
        <div className="kpi"><div className="k">Live facts with retrieval time</div><div className="v">{c.withRetrieved.toLocaleString()}</div><div className="m">Congress, Wikidata, Wikipedia</div></div>
        <div className="kpi"><div className="k">Curated facts</div><div className="v">{c.curatedFacts.toLocaleString()}</div><div className="m">verified {c.oldestCurated || '—'}</div></div>
        <div className="kpi"><div className="k">News feeds working</div><div className="v">{feedsOk}/{news.feeds.length}</div><div className="m">{news.stories.toLocaleString()} stories · {news.articles.toLocaleString()} headlines</div></div>
        <div className="kpi"><div className="k">Consistency audit</div><div className="v"><span className={sev.error ? 'bad' : 'good'}>{sev.error}</span> / <span style={{ color: sev.warning ? 'var(--warn)' : undefined }}>{sev.warning}</span></div><div className="m">errors / warnings · {sev.info} notes</div></div>
      </div>

      <div className="twoCol">
        <div>
          <Card title="Live data providers" id="providers">
            {!providers.length ? <div className="small muted">No provider has been called yet in this session — open a profile or map layer.</div> : (
              <div style={{ overflowX: 'auto' }}><table className="data">
                <thead><tr><th>Provider</th><th>Status</th><th>Last success</th><th className="r">Refresh</th><th className="r">Fetches</th><th>Last error</th></tr></thead>
                <tbody>{providers.map((p) => (
                  <tr key={p.provider}>
                    <td><strong>{p.label}</strong></td>
                    <td title={STATE_HELP[p.state]}><span className={`health ${p.state}`} />{p.state}{p.staleServes ? <span className="tiny muted"> · {p.staleServes} cached serve{p.staleServes > 1 ? 's' : ''}</span> : null}</td>
                    <td className="small">{p.lastOk ? ago(p.lastOk) : '—'}</td>
                    <td className="r small">{fmtTtl(p.ttlSec)}</td>
                    <td className="r small num">{p.fetches}{p.failures ? <span className="bad"> ({p.failures} failed)</span> : null}</td>
                    <td className="tiny muted" style={{ maxWidth: 260 }}>{p.lastError && p.state !== 'ok' ? `${p.lastError} (${ago(p.lastErrorAt)})` : ''}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            <div className="tiny muted" style={{ marginTop: 6 }}>Providers appear once used. “Refresh” is how long a copy is kept before it is fetched again.</div>
          </Card>

          <Card title="Background loaders" id="live">
            {!live.length ? <div className="small muted">Starting…</div> : (
              <table className="data"><thead><tr><th>Loader</th><th>Status</th><th>Data downloaded</th><th>Result</th></tr></thead>
                <tbody>{live.map(([k, v]) => (
                  <tr key={k}>
                    <td><strong>{k}</strong></td>
                    <td><span className={`health ${!v.ok ? 'failing' : v.stale ? 'stale' : 'ok'}`} />{!v.ok ? 'failed' : v.stale ? 'stale copy' : 'ok'}</td>
                    <td className="small">{v.fetchedAt ? ago(v.fetchedAt) : '—'}</td>
                    <td className="small">{v.detail}</td>
                  </tr>
                ))}</tbody></table>
            )}
            <div className="tiny muted" style={{ marginTop: 6 }}>Run at start-up and every 12 hours. “Stale copy” means the source failed and the previous download is in use.</div>
          </Card>

          <WebCard web={data.web} />
          <NetworkCard hosts={data.net} stream={data.stream} />
          <AgreementCard />
          <WatchLoaders data={data} />

          <Card title={`Trusted news feeds (${feedsOk}/${news.feeds.length} working)`} id="feeds">
            <div style={{ overflowX: 'auto' }}><table className="data">
              <thead><tr><th>Feed</th><th>Topic</th><th>Status</th><th className="r">Items</th><th>Last success</th></tr></thead>
              <tbody>{news.feeds.map((f: any) => (
                <tr key={f.id}>
                  <td><a href={f.url} target="_blank" rel="noreferrer">{f.name}</a>{f.kind === 'search' && <span className="tiny muted"> · headline search</span>}</td>
                  <td className="small">{f.topic}</td>
                  <td className="small" title={f.lastError}><span className={`health ${f.ok ? 'ok' : f.ok === false ? 'failing' : ''}`} />{f.ok ? 'ok' : f.ok === false ? <span className="tiny">{f.lastError}</span> : 'not yet run'}</td>
                  <td className="r num small">{f.items ?? '—'}{f.added ? <span className="tiny muted"> (+{f.added})</span> : null}</td>
                  <td className="small">{f.lastOk ? ago(f.lastOk) : '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="tiny muted" style={{ marginTop: 6 }}>Refreshed every {news.refreshMinutes} minutes; headlines are kept {news.keepDays} days. {news.tagged.toLocaleString()} headlines are linked to at least one profile. {news.signals.corroborated} corroborated signals, {news.signals.differsFromRecord} not yet in the record. <Link to="/news">Open the newsroom ›</Link></div>
          </Card>

          <AuditCard q={q} />
        </div>
        <div>
          <Card title="Facts by quality">
            <div className="stack" style={{ gap: 4 }}>
              {Object.entries<number>(c.byQuality).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="row small" style={{ gap: 6 }}><Quality q={k as DataQuality} /><span className="spacer" /><span className="num">{v.toLocaleString()}</span></div>)}
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>Hover a label for its meaning. Live numbers (prices, statistics) are fetched per view and not counted here.</div>
          </Card>
          <Card title="Coverage by entity type">
            <table className="data"><thead><tr><th>Type</th><th className="r">Entities</th><th className="r">Curated</th><th className="r">Facts</th></tr></thead>
              <tbody>{Object.entries<any>(c.byType).sort((a, b) => b[1].entities - a[1].entities).map(([t, v]) => (
                <tr key={t}><td>{ENTITY_TYPE_LABEL[t as EntityType] || t}</td><td className="r num">{v.entities.toLocaleString()}</td><td className="r num">{v.curated || '—'}</td><td className="r num">{v.facts.toLocaleString()}</td></tr>
              ))}</tbody></table>
          </Card>
          <PublishersCard />
        </div>
      </div>
    </div>
  );
}

function AuditCard({ q }: { q: ReturnType<typeof useApi<any>> }) {
  const [cat, setCat] = useState('');
  const d = q.data;
  if (!d) return <Card title="Consistency audit"><Loading /></Card>;
  const cats = Object.entries<any>(d.summary.byCategory);
  const list = (d.issues as any[]).filter((i) => !cat || i.category === cat);
  return (
    <Card title="Consistency audit" id="audit" actions={<span className="tiny muted">{d.total} finding{d.total === 1 ? '' : 's'}</span>}>
      <div className="tiny muted" style={{ marginBottom: 6 }}>Checks every profile for values without a known source, unknown quality labels, broken links, terms that end before they start, conflicting values, duplicate people, events past their date, competing officeholders and trusted news that contradicts a record. It reports; it never changes data.</div>
      {!cats.length ? <div className="small good">✓ No issues found.</div> : (
        <>
          <div className="chips" style={{ marginBottom: 8 }}>
            <button className={`btn sm${!cat ? ' primary' : ''}`} onClick={() => setCat('')}>All</button>
            {cats.map(([k, v]) => <button key={k} className={`btn sm${cat === k ? ' primary' : ''}`} onClick={() => setCat(k)} title={v.label}><span className={`issue ${v.severity}`}>●</span> {v.label} ({v.count})</button>)}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {list.slice(0, 150).map((i: any, n: number) => (
              <div key={n} className={`small issue ${i.severity}`}>
                {i.entityId && <Link to={`/entity/${encodeURIComponent(i.entityId)}`}>{i.entityName || i.entityId}</Link>}{i.entityId ? ': ' : ''}<span style={{ color: 'var(--text)' }}>{i.message}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="tiny muted" style={{ marginTop: 6 }}>Run the same audit offline with <code>npm run check:data</code>. Generated {fmtDate(d.generatedAt, true)}.</div>
    </Card>
  );
}

function PublishersCard() {
  const { data } = useApi<any>('/news-sources', 3600_000);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const pubs: any[] = data.publishers;
  return (
    <Card title="Publisher list" id="publishers" actions={<button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : `Show all ${pubs.length}`}</button>}>
      <div className="tiny muted">How each outlet is labelled. Unknown outlets show as “unrated”; government domains (.gov, .gov.uk, .gouv.fr…) count as official.</div>
      {open && <div className="stack" style={{ gap: 3, marginTop: 6 }}>{pubs.map((p) => <div key={p.id} className="tiny"><TierBadge tier={p.tier} /> {p.name} <span className="muted">· {p.domains.join(', ')}{p.note ? ` · ${p.note}` : ''}</span></div>)}</div>}
    </Card>
  );
}

/** Status of the calendar, sanctions, tariff and reserves loaders. */
function WatchLoaders({ data }: { data: any }) {
  const row = (name: string, ok: boolean | null, when: string | undefined, detail: React.ReactNode, href?: string) => (
    <tr key={name}><td><strong>{href ? <Link to={href}>{name}</Link> : name}</strong></td><td><span className={`health ${ok === null ? '' : ok ? 'ok' : 'failing'}`} />{ok === null ? 'not yet run' : ok ? 'ok' : 'failed'}</td><td className="small">{when ? ago(when) : '—'}</td><td className="small">{detail}</td></tr>
  );
  const cal = data.calendar, san = data.sanctions, tar = data.tariffs, res = data.reserves;
  const lists = san ? Object.entries<any>(san.lists) : [];
  return (
    <Card title="Calendars, sanctions, tariffs & reserves" id="watch">
      <div style={{ overflowX: 'auto' }}><table className="data"><thead><tr><th>Loader</th><th>Status</th><th>Updated</th><th>Result</th></tr></thead>
        <tbody>
          {row('Economic & IGO calendar', cal ? !cal.errors.some((e: string) => /could not be loaded|failed/i.test(e)) : null, cal?.at, cal ? <>{Object.entries<number>(cal.counts).map(([k, v]) => `${v} ${k}`).join(' · ')}{cal.errors.length ? <div className="tiny" style={{ color: 'var(--warn)' }}>{cal.errors.join('; ')}</div> : null}</> : '—', '/calendar')}
          {lists.map(([id, l]) => row(`Sanctions — ${id}`, !l.error, l.fetchedAt, l.error ? <span className="tiny">{l.error}</span> : `${l.count.toLocaleString()} listings${l.stale ? ' (stale copy)' : ''}`, '/?fill=sanctions:' + id))}
          {!san && row('Sanctions lists', null, undefined, 'loads about 15 seconds after start-up')}
          {row('US tariff actions (Federal Register)', tar?.actions ? !tar.actions.error : null, tar?.actions?.fetchedAt, tar?.actions ? (tar.actions.error ? <span className="tiny">{tar.actions.error}</span> : `${tar.actions.tariff} tariff action${tar.actions.tariff === 1 ? '' : 's'}, ${tar.actions.count - tar.actions.tariff} trade-remedy notice${tar.actions.count - tar.actions.tariff === 1 ? '' : 's'} (12 months)`) : '—', '/?fill=tariffs:us-actions')}
          {row('US duties by country (Census)', tar ? !!tar.duties : null, tar?.duties?.fetchedAt, tar?.duties ? `${tar.duties.month}: ${tar.duties.partners} countries` : tar?.dutiesError ? <span className="tiny">{tar.dutiesError}</span> : '—', '/?fill=tariffs:us-effective')}
          {row('Crude-oil stocks (JODI)', res ? !!res.oil : null, res?.oil?.fetchedAt, res?.oil ? `${res.oil.countries} countries reporting stocks` : res?.oilError ? <span className="tiny">{res.oilError}</span> : '—', '/?fill=reserves:oil-days')}
          {row('Grain stocks (USDA PSD)', res ? !!res.grains : null, res?.grains?.fetchedAt, res?.grains ? Object.entries<string>(res.grains.years).map(([k, y]) => `${k} ${y}`).join(' · ') : res?.grainError ? <span className="tiny">{res.grainError}</span> : '—', '/?fill=reserves:grain-wheat')}
        </tbody></table></div>
      <div className="tiny muted" style={{ marginTop: 6 }}>Sanctions and tariffs refresh every 6 hours, reserves every 12, the calendar every 6 (results every 15 minutes). Optional free keys add sources: FRED_API_KEY (official US release dates), EIA_API_KEY (weekly SPR), AGSI_API_KEY (European gas storage), CENSUS_API_KEY (higher Census rate limit).</div>
    </Card>
  );
}

const TYPE_NAMES: Record<string, string> = { country: 'Countries', igo: 'Organizations', institution: 'Institutions', company: 'Companies', person: 'People', party: 'Parties', city: 'Cities', state: 'States', county: 'Counties', region: 'Regions', commodity: 'Commodities', industry: 'Industries', event: 'Events' };
/** The knowledge web: every connector, what it adds, and how big and well-sourced the web is. */
function WebCard({ web }: { web: any }) {
  if (!web) return null;
  const st = web.stats;
  const topTypes = Object.entries<number>(st.byType).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return (
    <Card title="The knowledge web" id="web">
      <div className="kpis" style={{ margin: '0 0 10px' }}>
        <div className="kpi"><div className="tiny muted">Entities</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{st.entities.toLocaleString()}</div><div className="tiny muted">{Object.entries<number>(st.byEntityType).filter(([t]) => t !== 'county').sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => `${n.toLocaleString()} ${(TYPE_NAMES[t] || t).toLowerCase()}`).join(' · ')}</div></div>
        <div className="kpi"><div className="tiny muted">Links</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{st.links.toLocaleString()}</div><div className="tiny muted">{Object.keys(st.bySource).length} sources</div></div>
        <div className="kpi" title="Links that two independent sources report"><div className="tiny muted">Confirmed by a 2nd source</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{st.corroborated.toLocaleString()}</div><div className="tiny muted">✓ shown on profiles</div></div>
        <div className="kpi" title="Links where sources disagree — listed in the audit below"><div className="tiny muted">Sources disagree</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{st.disputed.toLocaleString()}</div><div className="tiny muted">⚠ see the audit</div></div>
        {web.catalog && <div className="kpi"><div className="tiny muted">Indicators searchable</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{web.catalog.metrics.toLocaleString()}</div><div className="tiny muted">{web.catalog.wb.toLocaleString()} World Bank · {web.catalog.imf} IMF</div></div>}
      </div>
      <div style={{ overflowX: 'auto' }}><table className="data"><thead><tr><th>Connector</th><th>Status</th><th>Updated</th><th>Adds to the web</th></tr></thead>
        <tbody>{web.connectors.map((c: any) => (
          <tr key={c.id}><td><strong>{c.label}</strong><div className="tiny muted">every {c.everyHours >= 24 ? `${Math.round(c.everyHours / 24)} day${c.everyHours >= 48 ? 's' : ''}` : c.everyHours >= 1 ? `${c.everyHours} h` : `${Math.round(c.everyHours * 60)} min`}</div></td>
            <td className="small"><span className={`health ${!c.status ? '' : c.status.ok ? (c.status.stale ? 'stale' : 'ok') : 'failing'}`} />{c.running ? 'running…' : !c.status ? 'not yet run' : c.status.ok ? (c.status.stale ? 'stale copy' : 'ok') : 'failed'}</td>
            <td className="small">{c.status?.fetchedAt ? ago(c.status.fetchedAt) : c.status?.at ? ago(c.status.at) : '—'}</td>
            <td className="small">{c.provides}<div className="tiny" style={{ color: c.status && !c.status.ok ? 'var(--warn)' : 'var(--muted)' }}>{c.status?.detail}</div></td></tr>
        ))}</tbody></table></div>
      <div className="tiny muted" style={{ marginTop: 6 }}>Largest kinds of link: {topTypes.map(([t, n]) => `${t.replace(/_/g, ' ')} ${n.toLocaleString()}`).join(' · ')}.{web.weights ? ` Economy weights: ${web.weights.source}, ${web.weights.year}.` : ''}</div>
    </Card>
  );
}

// ───────────────────────── Network: one gate per host (server/net.ts) ─────────────────────────
const NET_STATE: Record<string, [string, string]> = { ok: ['ok', 'ok'], degraded: ['stale', 'recent failures'], open: ['failing', 'skipped'], trial: ['stale', 'due a retest'] };
function NetworkCard({ hosts, stream }: { hosts?: any[]; stream?: any }) {
  const [all, setAll] = useState(false);
  if (!hosts?.length) return null;
  const skipped = hosts.filter((h) => h.state === 'open');
  const requests = hosts.reduce((s, h) => s + h.requests, 0), retries = hosts.reduce((s, h) => s + h.retries, 0);
  const shown = all ? hosts : hosts.slice(0, 12);
  return (
    <Card title="Network" id="network">
      <div className="small muted" style={{ marginBottom: 8 }}>Every request to a data source passes one gate per host: a limit on parallel requests and a pause between them for rate-limited services, retries that honour the host’s Retry-After, and a breaker that skips a host that keeps failing, then tests it again.</div>
      <div className="kpis" style={{ margin: '0 0 10px' }}>
        <div className="kpi"><div className="tiny muted">Hosts contacted</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{hosts.length}</div><div className="tiny muted">{requests.toLocaleString()} requests</div></div>
        <div className="kpi"><div className="tiny muted">Retried</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{retries.toLocaleString()}</div><div className="tiny muted">rate limits, dropped connections</div></div>
        {stream && <div className="kpi" title="Open pages receive these over Server-Sent Events and refresh what they show"><div className="tiny muted">Live updates sent</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{stream.seq.toLocaleString()}</div><div className="tiny muted">{stream.lastAt ? `last ${ago(stream.lastAt)}` : 'none yet'} · {stream.clients} open page{stream.clients === 1 ? '' : 's'}</div></div>}
        <div className="kpi"><div className="tiny muted">Skipped now</div><div style={{ fontSize: 18, fontWeight: 600, color: skipped.length ? 'var(--warn)' : undefined }} className="num">{skipped.length}</div><div className="tiny muted">{skipped.length ? skipped.slice(0, 2).map((h) => h.host).join(', ') : 'every host is answering'}</div></div>
      </div>
      <div style={{ overflowX: 'auto' }}><table className="data"><thead><tr><th>Host</th><th>State</th><th className="num">Requests</th><th className="num">Average</th><th className="num">Retries</th><th>Last error</th></tr></thead>
        <tbody>{shown.map((h) => { const [cls, label] = NET_STATE[h.state] || ['', h.state]; return (
          <tr key={h.host}>
            <td><strong>{h.host}</strong><div className="tiny muted">{h.policy.concurrency} at a time{h.policy.minGapMs ? `, ${h.policy.minGapMs} ms apart` : ''}{h.active || h.queued ? ` · ${h.active} running, ${h.queued} waiting` : ''}</div></td>
            <td className="small"><span className={`health ${cls}`} />{label}{h.openUntil ? <div className="tiny muted" title={h.reason}>until {new Date(h.openUntil).toLocaleTimeString()}{h.fastFails ? ` · ${h.fastFails} skipped` : ''}</div> : null}</td>
            <td className="num">{h.requests.toLocaleString()}{h.failed ? <div className="tiny muted">{h.failed} failed</div> : null}</td>
            <td className="num">{h.avgMs != null ? `${h.avgMs.toLocaleString()} ms` : '—'}</td>
            <td className="num">{h.retries || '—'}</td>
            <td className="small">{h.lastError ? <>{h.lastError}<div className="tiny muted">{ago(h.lastErrorAt)}</div></> : <span className="muted">—</span>}</td>
          </tr>); })}</tbody></table></div>
      {hosts.length > 12 && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${hosts.length} hosts`}</button>}
    </Card>
  );
}

// ───────────────────────── Cross-source checks: World Bank vs IMF (server/agreement.ts) ─────────────────────────
function AgreementCard() {
  const { data, error } = useApi<any>('/quality/agreement', 300_000);
  if (error) return <Card title="Cross-source checks" id="agreement"><Unavailable>Cross-source checks unavailable: {error.message}</Unavailable></Card>;
  if (!data) return null;
  if (!data.ready) return <Card title="Cross-source checks" id="agreement"><div className="small muted">World Bank and IMF figures are compared a few minutes after the terminal starts.</div></Card>;
  const t = data.totals; const share = (n: number) => (t.compared ? `${Math.round((n / t.compared) * 100)}%` : '—');
  const figures = (n: number) => `${n.toLocaleString()} figure${n === 1 ? '' : 's'}`;
  return (
    <Card title="Cross-source checks" id="agreement">
      <div className="small muted" style={{ marginBottom: 8 }}>The World Bank and the IMF publish the same headline figures for nearly every country. Comparing them for the same year catches unit slips, stale or revised numbers and definition gaps. Within the tolerance they agree; up to three times it they differ (usually revisions or methods); beyond that they conflict.</div>
      <div className="kpis" style={{ margin: '0 0 10px' }}>
        <div className="kpi"><div className="tiny muted">Figures compared</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{t.compared.toLocaleString()}</div><div className="tiny muted">{t.countries} countries · {ago(data.at)}</div></div>
        <div className="kpi"><div className="tiny muted">Agree</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{share(t.agree)}</div><div className="tiny muted">{figures(t.agree)}</div></div>
        <div className="kpi"><div className="tiny muted">Differ</div><div style={{ fontSize: 18, fontWeight: 600 }} className="num">{share(t.differ)}</div><div className="tiny muted">{figures(t.differ)}</div></div>
        <div className="kpi"><div className="tiny muted">Conflict</div><div style={{ fontSize: 18, fontWeight: 600, color: t.conflict ? 'var(--warn)' : undefined }} className="num">{t.conflict.toLocaleString()}</div><div className="tiny muted">listed in the audit</div></div>
      </div>
      <div style={{ overflowX: 'auto' }}><table className="data"><thead><tr><th>Figure</th><th>Tolerance</th><th className="num">Compared</th><th className="num">Agree</th><th className="num">Differ</th><th className="num">Conflict</th></tr></thead>
        <tbody>{data.pairs.map((p: any) => (
          <tr key={p.key}><td><strong>{p.label}</strong>{p.note && <div className="tiny muted">{p.note}</div>}{p.error && <div className="tiny" style={{ color: 'var(--warn)' }}>{p.error}</div>}</td>
            <td className="small">{p.tolerance}</td><td className="num">{p.compared}</td><td className="num">{p.agree}</td><td className="num">{p.differ}</td><td className="num">{p.conflict}</td></tr>
        ))}</tbody></table></div>
      {data.conflicts.length > 0 && <>
        <h3 style={{ margin: '12px 0 6px' }}>Largest conflicts{data.conflictCount > 15 ? ` (15 of ${data.conflictCount})` : ''}</h3>
        <div style={{ overflowX: 'auto' }}><table className="data"><thead><tr><th>Country</th><th>Figure</th><th className="num">World Bank</th><th className="num">IMF</th><th>Gap</th></tr></thead>
          <tbody>{data.conflicts.slice(0, 15).map((c: any) => (
            <tr key={`${c.iso3}:${c.key}`}><td><Link to={`/entity/${encodeURIComponent(c.id)}`}>{c.country}</Link></td><td className="small">{c.label}, {c.year}</td><td className="num">{c.wbText}</td><td className="num">{c.imfText}</td>
              <td className="small"><span className={`health ${c.severity === 'warning' ? 'failing' : 'stale'}`} />{c.gapText}<div className="tiny muted">tolerance {c.allowedText}</div></td></tr>
          ))}</tbody></table></div>
      </>}
    </Card>
  );
}

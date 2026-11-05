import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import { useApp } from '../state';
import { Card, Loading, SourceRef, Unavailable, useDebounced } from '../components/common';
import { NewsRow, SignalItem, TierBadge, type NewsItemView, type SignalView } from '../components/newsBits';
import { ago } from '../format';

const TOPICS = [['all', 'All'], ['world', 'World'], ['business', 'Business'], ['official', 'Official']];
const WINDOWS = [['24', '24 h'], ['72', '3 days'], ['168', '7 days']];
const TYPES = [['', 'Everything'], ['country', 'Countries'], ['company', 'Companies'], ['person', 'People'], ['commodity', 'Commodities'], ['igo', 'Organizations']];

export function NewsPage() {
  const [topic, setTopic] = useState('all');
  const [hours, setHours] = useState('72');
  const [type, setType] = useState('');
  const [trusted, setTrusted] = useState(true);
  const [corroborated, setCorroborated] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [params, setParams] = useSearchParams();
  const entity = params.get('entity') || '';
  const ent = useApi<any>(entity ? `/entity/${encodeURIComponent(entity)}` : null, 600_000);
  const qs = new URLSearchParams({ topic, hours: entity && hours === '72' ? '336' : hours, trusted: trusted ? '1' : '0', min: corroborated ? '2' : '0', ...(type ? { type } : {}), ...(entity ? { entity } : {}), ...(dq.trim() ? { q: dq.trim() } : {}) });
  const { data, loading, error } = useApi<{ stories: NewsItemView[]; status: any }>(`/news/latest?${qs}`, 120_000);
  const sig = useApi<{ signals: SignalView[] }>('/news/signals', 300_000);
  const st = data?.status;
  const feedsOk = st?.feeds?.filter((f: any) => f.ok).length ?? 0;

  return (
    <div className="page wide">
      <div className="row wrap" style={{ alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h1>Newsroom</h1>
        <span className="small muted">{st?.lastRun ? <>Updated {ago(st.lastRun.at)} · {feedsOk}/{st.feeds.length} feeds working · {st.stories.toLocaleString()} stories from {st.articles.toLocaleString()} headlines over {st.keepDays} days</> : 'Loading feeds…'}</span>
        <Link className="small" to="/data#feeds">Feed status ›</Link>
      </div>
      <p className="small muted" style={{ maxWidth: 880, marginTop: 0 }}>
        Headlines from wire services, public broadcasters, major papers and official sources, refreshed every {st?.refreshMinutes || 30} minutes. The same story from several outlets is shown once, with every outlet that carried it — “✓ 3 trusted outlets” means three independent outlets reported it. Names in headlines are linked to their profiles. Links open the publisher; nothing is republished.
      </p>
      <div className="twoCol">
        <div>
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Topic">{TOPICS.map(([k, l]) => <button key={k} className={topic === k ? 'on' : ''} onClick={() => setTopic(k)}>{l}</button>)}</div>
            <div className="seg" role="group" aria-label="Time window">{WINDOWS.map(([k, l]) => <button key={k} className={hours === k ? 'on' : ''} onClick={() => setHours(k)}>{l}</button>)}</div>
            <div className="seg" role="group" aria-label="Mentions">{TYPES.map(([k, l]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{l}</button>)}</div>
            <label className="small"><input type="checkbox" checked={trusted} onChange={(e) => setTrusted(e.target.checked)} /> Trusted outlets only</label>
            <label className="small"><input type="checkbox" checked={corroborated} onChange={(e) => setCorroborated(e.target.checked)} /> Corroborated (2+ outlets)</label>
            <input type="search" placeholder="Filter headlines…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter headlines" />
            {entity && <span className="chip">Mentioning {ent.data?.entity?.name || entity} <span className="x" role="button" aria-label="Clear entity filter" onClick={() => setParams({})}>×</span></span>}
          </div>
          <Card title={`Stories${data ? ` (${data.stories.length})` : ''}`}>
            {loading && !data ? <Loading lines={8} /> : error ? <Unavailable>{error.message}</Unavailable> : !st?.lastRun ? <Unavailable>Feeds are loading for the first time — this takes under a minute.</Unavailable>
              : !data!.stories.length ? <Unavailable>{feedsOk ? 'No stories match these filters.' : 'No feed could be reached on the last refresh. The terminal keeps trying every 30 minutes; see Feed status for the errors.'}</Unavailable>
              : <div>{data!.stories.map((a) => <NewsRow key={a.id} a={a} showTags showSummary />)}</div>}
          </Card>
          <SourceRef id="trusted-news" />
        </div>
        <div>
          <SignalsCard signals={sig.data?.signals} loading={sig.loading} />
          <CoverageCard />
          <TierLegend byTier={st?.byTier} />
        </div>
      </div>
    </div>
  );
}

function SignalsCard({ signals, loading }: { signals?: SignalView[]; loading: boolean }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => (signals || []).filter((s) => all || s.strength !== 'single-source'), [signals, all]);
  return (
    <Card title="Leadership & election signals" actions={<label className="tiny"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> include single-source</label>}>
      <div className="tiny muted" style={{ marginBottom: 6 }}>Appointments, departures and election results stated in trusted headlines, checked against the terminal’s records. Corroborated signals add a “reported” fact to the profile and flag the record they contradict — they never overwrite it.</div>
      {loading && !signals ? <Loading /> : !list.length ? <div className="small muted">No {all ? '' : 'corroborated '}signals in the last 120 days.</div> :
        <div className="stack">{list.slice(0, 30).map((s) => <div key={s.key}><Link className="tiny" to={`/entity/${encodeURIComponent(s.entityId)}`}>{s.entityName} ›</Link><SignalItem s={s} /></div>)}</div>}
    </Card>
  );
}

function CoverageCard() {
  const { data } = useApi<any>('/map/layer/news', 300_000);
  const { setMap, select } = useApp();
  const nav = useNavigate();
  const nav2 = useApi<any[]>('/geo/nav', 3600_000);
  const names = useMemo(() => { const m: Record<string, { name: string; flag?: string }> = {}; for (const r of nav2.data || []) for (const c of r.countries) if (c.iso3) m[c.iso3] = c; return m; }, [nav2.data]);
  const rows = Object.entries<any>(data?.values || {}).sort((a, b) => b[1].value - a[1].value).slice(0, 12);
  return (
    <Card title="Most covered countries (48 h)" actions={<button className="btn sm" onClick={() => { setMap({ fill: 'news' }); select(null); nav('/'); }}>◎ Map</button>}>
      {!rows.length ? <div className="small muted">No coverage counted yet.</div> : (
        <table className="data"><tbody>{rows.map(([iso, v]) => (
          <tr key={iso}><td><Link to={`/entity/country:${iso}`}>{names[iso]?.flag} {names[iso]?.name || iso}</Link></td><td className="r num">{v.value} {v.value === 1 ? 'story' : 'stories'}</td></tr>
        ))}</tbody></table>
      )}
      <div className="tiny muted" style={{ marginTop: 6 }}>Distinct stories whose headline names the country. Coverage, not importance.</div>
    </Card>
  );
}

function TierLegend({ byTier }: { byTier?: Record<string, number> }) {
  const tiers = ['official', 'wire', 'broadcaster', 'major', 'specialist', 'state-media', 'unrated'] as const;
  return (
    <Card title="Outlet tiers">
      <div className="stack" style={{ gap: 4 }}>
        {tiers.map((t) => <div key={t} className="tiny"><TierBadge tier={t} /> {byTier?.[t] ? <span className="muted">· {byTier[t].toLocaleString()} headlines</span> : null}</div>)}
      </div>
      <div className="tiny muted" style={{ marginTop: 6 }}>Tiers describe the kind of outlet (primary source, wire service, public broadcaster, paper of record…), not its politics. Hover a badge for the definition. <Link to="/data#publishers">Full publisher list ›</Link></div>
    </Card>
  );
}

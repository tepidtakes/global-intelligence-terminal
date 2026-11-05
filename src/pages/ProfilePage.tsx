import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { api, useApi } from '../api';
import { useApp, useAuth } from '../state';
import { Card, EntityChip, Loading, Modal, Quality, SourceRef, Unavailable, localToday } from '../components/common';
import { RelGroups, WatchButton, NewNoteButton } from '../components/entityBits';
import { GovernmentSection, MacroSection, TradeSection, CompaniesSection, MembersSection, QuoteSection, FundamentalsSection, PositionSection, ProducersSection, RankingSection } from './profile/Sections';
import { ElectionSection } from './profile/ElectionSection';
import { CalendarSection } from './EconCalendar';
import { CurrencySection, RatesSection, OutlookSection, ConflictsSection, ConsensusSection, ProductTradeSection, ConflictBadge } from './profile/LiveSections';
import { PRODUCTS } from '../../shared/products';
import { NewsRow, ProvenanceCard, SignalItem, bannerSignals, type NewsItemView, type SignalView } from '../components/newsBits';
import { AlertButton, RecentChanges } from '../components/alertBits';
import { SanctionsTariffsSection, SanctionsMatchNotice } from './profile/SanctionsSection';
import { BudgetSection } from './profile/BudgetSection';
import { ReservesSection, CommodityStocksSection } from './profile/ReservesSection';
import { isTrusted } from '../../shared/newsSources';
import { TYPE_ICON, fmtUnit, fmtDate, ago } from '../format';
import { ENTITY_TYPE_LABEL } from '../../shared/types';
import type { Entity, RelView, Source, Fact } from '../../shared/types';

// Organisations that run sanctions lists (their profiles list the regimes they impose).
const SANCTIONING_IGOS = new Set(['igo:eu', 'igo:un']);
// Commodities with country stock data (JODI oil, USDA grain).
const STOCKED = new Set(['commodity:crude-oil', 'commodity:wheat', 'commodity:corn', 'commodity:rice']);
const MAPPABLE = new Set(['country', 'state', 'county', 'city', 'region', 'igo', 'company', 'person', 'party', 'event']);

export function ProfilePage() {
  const id = decodeURIComponent(useParams().id!);
  const { data, error, loading, reload } = useApi<any>(`/entity/${encodeURIComponent(id)}`, 30_000);
  const { select } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [report, setReport] = useState(false);

  useEffect(() => { if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 300); }, [loc.hash, data?.entity?.id]);
  useEffect(() => { if (data?.entity) document.title = `${data.entity.name} — Global Intelligence Terminal`; return () => { document.title = 'Global Intelligence Terminal'; }; }, [data?.entity?.name]);

  if (error && !data) return <div className="page"><Unavailable>{error.status === 404 ? 'This entity does not exist in the database.' : error.message}</Unavailable></div>;
  if (!data || data.entity.id !== id) return <div className="page"><Loading lines={8} /></div>;

  const e: Entity = data.entity;
  const rels: RelView[] = data.relationships;
  const t = e.type;
  const showOnMap = () => { select(e.id, { fly: true }); nav('/'); };
  const sections: [string, string][] = [['overview', 'Overview']];
  if (t === 'country' || t === 'state' || t === 'city') sections.push(['government', 'Government']);
  if (t === 'country') sections.push(['macro', 'Macro'], ['outlook', 'Outlook'], ['yields', 'Rates'], ['currency', 'Currency'], ['budget', 'Budget'], ['reserves', 'Reserves'], ['trade', 'Trade'], ['sanctions', 'Sanctions & tariffs']);
  if (t === 'company' || (t === 'commodity' && e.attrs?.quoteSymbol)) sections.push(['market', 'Market data']);
  if (t === 'commodity' && PRODUCTS.some((p) => p.commodity === e.id)) sections.push(['traders', 'Exporters']);
  if (t === 'company') sections.push(['financials', 'Financials'], ...(e.attrs?.public ? [['consensus', 'Consensus'] as [string, string]] : []), ['position', 'My position']);
  if (t === 'country' || t === 'igo') sections.splice(1, 0, ['calendar', 'Calendar']);
  if (t === 'igo') sections.push(['members', 'Members']);
  if (SANCTIONING_IGOS.has(e.id)) sections.push(['sanctions', 'Sanctions']);
  if (e.id === 'igo:eu') sections.push(['budget', 'Budgets'], ['reserves', 'Reserves']);
  if (STOCKED.has(e.id)) sections.push(['stocks', 'Stocks']);
  const isElection = t === 'event' && e.attrs?.category === 'election';
  if (isElection) sections.push(['election', 'Result'], ['candidates', 'Candidates'], ['markets', 'Markets']);
  sections.push(['relationships', 'Relationships'], ['events', 'Events'], ['news', 'News'], ['notes', 'Research'], ['sources', 'Sources']);

  const operating = rels.filter((r) => r.rel.type === 'operates_in' && r.direction === 'in');

  return (
    <div className="profile">
      <div className="phead">
        {e.flag ? <div className="flag" aria-hidden>{e.flag}</div> : <div className="typeIcon" aria-hidden>{TYPE_ICON[t]}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row wrap small muted">
            <span className="badge accent">{ENTITY_TYPE_LABEL[t]}</span>
            {data.parents.map((p: any) => <span key={p.id}>› <Link to={`/entity/${encodeURIComponent(p.id)}`}>{p.name}</Link></span>)}
            {e.depth === 'baseline' && <span className="badge" title="Geography and live statistics only; no curated political or corporate detail yet">Baseline profile</span>}
          </div>
          <h1 style={{ marginTop: 4 }}>{e.name}</h1>
          {e.aliases && e.aliases.length > 0 && <div className="small muted">Also: {e.aliases.filter((a) => a.length > 1).slice(0, 6).join(' · ')}</div>}
          {e.summary && <p className="sum">{e.summary}</p>}
          {e.attrs?.staleNote && <div className="banner" role="note" style={{ marginTop: 8 }}>⚠ {e.attrs.staleNote}</div>}
          {e.attrs?.newsNote && <div className="banner" role="note" style={{ marginTop: 8 }}><span>⚠ <strong>Trusted news:</strong> {e.attrs.newsNote}</span></div>}
          {bannerSignals(e.attrs?.newsSignals, e.id).length > 0 && (
            <div className="stack" style={{ marginTop: 8, gap: 6 }}>{bannerSignals(e.attrs?.newsSignals, e.id).slice(0, 3).map((s: SignalView) => <SignalItem key={s.key} s={s} />)}</div>
          )}
          {(t === 'person' || t === 'company') && <SanctionsMatchNotice id={e.id} />}
          {e.type === 'event' && e.attrs?.url && <div className="small" style={{ marginTop: 6 }}><a href={e.attrs.url} target="_blank" rel="noreferrer">Read the full, regularly updated article on Wikipedia ↗</a></div>}
          <div className="row wrap" style={{ marginTop: 10 }}>
            {MAPPABLE.has(t) && <button className="btn sm" onClick={showOnMap}>◎ Show on map</button>}
            <NewNoteButton entityIds={[e.id]} label="＋ New note" />
            <WatchButton id={e.id} />
            <AlertButton entityId={e.id} name={e.name} type={t} />
            {t === 'country' && <CompareButton id={e.id} />}
            <Link className="btn sm" to={`/compare?a=${encodeURIComponent(e.id)}`}>⇄ Find connections</Link>
            <button className="btn ghost sm" onClick={() => setReport(true)}>⚑ Report an inconsistency</button>
          </div>
        </div>
      </div>
      <nav className="toc" aria-label="Profile sections">{sections.map(([k, l]) => <a key={k} href={`#${k}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(k)?.scrollIntoView({ behavior: 'smooth' }); }}>{l}</a>)}</nav>

      <div className="colMain">
        <FactsCard e={e} />
        {(t === 'country' || t === 'state' || t === 'city') && <GovernmentSection e={e} rels={rels} events={data.events} partyOf={data.partyOf} mayors={data.mayors} />}
        {isElection && <ElectionSection id={e.id} />}
        {(t === 'country' || t === 'state') && <ConflictsSection id={e.id} name={e.name} />}
        {(t === 'country' || t === 'igo') && <CalendarSection placeId={e.id} name={e.name} />}
        {t === 'country' && e.iso3 && <MacroSection iso3={e.iso3} />}
        {t === 'country' && e.iso3 && <OutlookSection iso3={e.iso3} />}
        {t === 'country' && e.iso3 && <RatesSection iso3={e.iso3} />}
        {t === 'country' && <CurrencySection e={e} />}
        {(t === 'country' || e.id === 'igo:eu') && <BudgetSection id={e.id} name={e.name} isEU={e.id === 'igo:eu'} />}
        {(t === 'country' || e.id === 'igo:eu') && <ReservesSection id={e.id} name={e.name} isEU={e.id === 'igo:eu'} />}
        {t === 'country' && e.iso3 && <TradeSection iso3={e.iso3} rels={rels} />}
        {(t === 'country' || SANCTIONING_IGOS.has(e.id)) && <SanctionsTariffsSection id={e.id} name={e.name} type={t} />}
        {(t === 'country' || t === 'state' || t === 'city' || t === 'region') && <CompaniesSection companies={data.companies || []} operating={operating} />}
        {(t === 'state' || t === 'country' || t === 'region') && <ChildrenCard e={e} children={data.children} counts={data.childCounts} />}
        {t === 'igo' && <MembersSection id={e.id} />}
        {t === 'igo' && e.attrs?.membershipNote && <div className="small muted">{e.attrs.membershipNote}</div>}
        {(t === 'company' || (t === 'commodity' && e.attrs?.quoteSymbol)) && <QuoteSection id={e.id} label={t === 'commodity' ? `Price — ${e.attrs?.unit}` : 'Market data'} />}
        {t === 'commodity' && !e.attrs?.quoteSymbol && e.attrs?.kind !== 'service' && e.attrs?.kind !== 'product' && <Card title="Price" id="market"><Unavailable>No openly licensed price feed is connected for {e.name}. Benchmarks for this market are proprietary; connect a licensed provider to show prices.</Unavailable></Card>}
        {t === 'company' && <FundamentalsSection id={e.id} />}
        {t === 'company' && e.attrs?.public && <ConsensusSection id={e.id} />}
        {t === 'company' && <PositionSection e={e} positions={data.user?.positions || []} onChange={reload} />}
        {t === 'company' && !e.attrs?.public && <Card title="Private company" id="private"><div className="small">Private companies do not publish audited statements to a public regulator. Ownership and corporate developments are shown above; valuation and revenue appear only when the company or a regulator discloses them.</div></Card>}
        {(t === 'commodity') && <ProducersSection e={e} rels={rels} />}
        {t === 'commodity' && <ProductTradeSection e={e} />}
        {STOCKED.has(e.id) && <CommodityStocksSection id={e.id} />}
        {t === 'commodity' && data.children.length > 0 && <Card title="Benchmarks & sub-markets"><div className="chips">{data.children.map((c: any) => <EntityChip key={c.id} e={c} />)}</div></Card>}
        {t === 'commodity' && e.attrs?.wbRankings && <RankingSection codes={e.attrs.wbRankings} />}
        {t === 'person' && <RolesCard rels={rels} />}
        {t === 'party' && <PartyMembersCard rels={rels} />}
        {t === 'event' && <EventCard e={e} rels={rels} />}
        <Card title="Relationships" id="relationships" actions={<span className="tiny muted">{rels.length} links · click any to navigate</span>}>
          {rels.length ? <RelGroups rels={rels} maxPer={40} /> : <div className="small muted">No relationships recorded yet.</div>}
        </Card>
        {e.timeline && e.timeline.length > 0 && <TimelineCard items={e.timeline} />}
        <EventsCard events={data.events} catalysts={data.user?.catalysts || []} entityId={e.id} />
        <NewsCard id={e.id} />
        <SourcesCard sources={data.sources} />
      </div>
      <div className="colSide">
        <NotesCard entityId={e.id} name={e.name} />
        <RecentChanges entityId={e.id} name={e.name} type={t} />
        <ProvenanceCard p={data.provenance} />
        {t === 'company' && <CompanyFacts e={e} />}
      </div>
      {report && <ReportModal entityId={e.id} name={e.name} onClose={() => setReport(false)} />}
    </div>
  );
}

function CompareButton({ id }: { id: string }) {
  const { compare, toggleCompare } = useApp();
  return <button className="btn sm" onClick={() => toggleCompare(id)} aria-pressed={compare.includes(id)}>{compare.includes(id) ? '✓ In comparison' : '⇄ Add to comparison'}</button>;
}

function FactValue({ f }: { f: Fact }) {
  if (typeof f.value === 'number') return <>{f.value.toLocaleString()}{f.unit ? ` ${f.unit}` : ''}</>;
  // ISO dates ("2025-01-20", "2025-01-20 – 2025-01-22") read the same way everywhere.
  if (/^\d{4}-\d{2}-\d{2}( – \d{4}-\d{2}-\d{2})?$/.test(f.value)) return <>{f.value.split(' – ').map((d) => fmtDate(d)).join(' – ')}</>;
  if (/^https?:\/\//.test(f.value)) return <a href={f.value} target="_blank" rel="noreferrer">{f.value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>;
  return <>{f.value}</>;
}
const factMeta = (f: Fact) => [
  f.period && `Period: ${f.period}`,
  f.asOf && (f.quality === 'curated' ? `Verified ${f.asOf}` : f.quality === 'reported' ? `First reported ${fmtDate(f.asOf)}` : `As of ${f.asOf}`),
  f.retrievedAt && `Retrieved ${ago(f.retrievedAt)}`,
].filter(Boolean).join(' · ');
function FactsCard({ e }: { e: Entity }) {
  const facts = e.facts || [];
  return (
    <Card title="Overview" id="overview">
      {facts.length === 0 ? <div className="small muted">No structured facts yet.</div> : (
        <div className="facts">
          {facts.map((f) => (
            <div className="fact" key={f.label}>
              <div className="k">{f.label} <Quality q={f.quality} /></div>
              <div className="v"><FactValue f={f} /></div>
              <div className="m">{factMeta(f)}{f.note ? `${factMeta(f) ? ' · ' : ''}${f.note}` : ''}</div>
              <SourceRef id={f.sourceId} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CompanyFacts({ e }: { e: Entity }) {
  return (
    <Card title="Company links">
      <div className="stack small">
        {e.attrs?.website && <a href={e.attrs.website} target="_blank" rel="noreferrer">Website ↗</a>}
        {e.attrs?.ir && <a href={e.attrs.ir} target="_blank" rel="noreferrer">Investor relations — filings, presentations, earnings calendar ↗</a>}
        {e.attrs?.secTicker && <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${e.attrs.secTicker}&type=10-K`} target="_blank" rel="noreferrer">SEC filings (EDGAR) ↗</a>}
        <div className="tiny muted">Equity research reports are not bundled. Attach reports you are licensed to use to a note (Research → attachments).</div>
      </div>
    </Card>
  );
}

function ChildrenCard({ e, children, counts }: { e: Entity; children: any[]; counts: Record<string, number> }) {
  const [showCounties, setShowCounties] = useState(false);
  const { select } = useApp();
  const nav = useNavigate();
  const cities = children.filter((c) => c.type === 'city'), states = children.filter((c) => c.type === 'state'), counties = children.filter((c) => c.type === 'county'), countries = children.filter((c) => c.type === 'country');
  if (!cities.length && !states.length && !counties.length && !countries.length) return null;
  return (
    <Card title="Places within" id="places">
      {states.length > 0 && <div className="relGroup"><div className="lbl">States & territories ({states.length})</div><div className="chips">{states.sort((a, b) => a.name.localeCompare(b.name)).map((s) => <EntityChip key={s.id} e={s} />)}</div></div>}
      {countries.length > 0 && <div className="relGroup"><div className="lbl">Countries & territories ({countries.length})</div><div className="chips">{countries.sort((a, b) => a.name.localeCompare(b.name)).map((s) => <EntityChip key={s.id} e={s} />)}</div></div>}
      {cities.length > 0 && (
        <div className="relGroup"><div className="lbl">Important cities ({cities.length})</div>
          <table className="data"><tbody>{cities.sort((a, b) => (a.attrs?.tier || 3) - (b.attrs?.tier || 3)).map((c) => (
            <tr key={c.id}><td><Link to={`/entity/${encodeURIComponent(c.id)}`}><strong>{c.name}</strong></Link>{c.attrs?.capital && <span className="badge" style={{ marginLeft: 6 }}>Capital</span>}</td><td className="small muted">{c.summary}</td>
              <td className="r"><button className="btn ghost sm" onClick={() => { select(c.id, { fly: true }); nav('/'); }}>Map ↗</button></td></tr>
          ))}</tbody></table></div>
      )}
      {counts.county > 0 && (
        <div className="relGroup"><div className="lbl">Counties ({counts.county}) <button className="btn ghost sm" onClick={() => setShowCounties(!showCounties)}>{showCounties ? 'Hide' : 'Show all'}</button></div>
          {showCounties && <div className="chips">{counties.sort((a, b) => a.name.localeCompare(b.name)).map((c) => <EntityChip key={c.id} e={c} />)}</div>}</div>
      )}
      {e.type === 'country' && e.iso3 !== 'USA' && <div className="tiny muted">Sub-national divisions are currently loaded for the United States only; other countries show their capital and key economic centers.</div>}
    </Card>
  );
}

function RolesCard({ rels }: { rels: RelView[] }) {
  const roles = rels.filter((r) => r.direction === 'out' && ['head_of_state', 'head_of_government', 'holds_office', 'leads'].includes(r.rel.type));
  const party = rels.filter((r) => r.direction === 'out' && r.rel.type === 'belongs_to_party');
  return (
    <Card title="Positions & affiliations" id="roles">
      {roles.length > 0 && (
        <table className="data" style={{ marginBottom: 10 }}>
          <thead><tr><th>Position</th><th>Of</th><th>From</th><th>To</th></tr></thead>
          <tbody>{roles.map((r) => <tr key={r.rel.id}><td>{r.rel.role || r.label}</td><td><Link to={`/entity/${encodeURIComponent(r.other.id)}`}>{r.other.flag || TYPE_ICON[r.other.type]} {r.other.name}</Link></td><td className="tab">{fmtDate(r.rel.validFrom)}</td><td className="tab">{r.rel.validTo ? fmtDate(r.rel.validTo) : 'present'}</td></tr>)}</tbody>
        </table>
      )}
      {party.length > 0 ? <div className="relGroup"><div className="lbl">Political party</div><div className="chips">{party.map((r) => <EntityChip key={r.rel.id} e={r.other} />)}</div></div> : <div className="small muted">No party affiliation recorded.</div>}
    </Card>
  );
}

function PartyMembersCard({ rels }: { rels: RelView[] }) {
  const leaders = rels.filter((r) => r.direction === 'in' && r.rel.type === 'leads');
  const members = rels.filter((r) => r.direction === 'in' && r.rel.type === 'belongs_to_party');
  const gov = rels.filter((r) => r.direction === 'out' && r.rel.type === 'governing_party');
  return (
    <Card title="Leadership & affiliated politicians" id="members">
      {gov.length > 0 && <div className="small" style={{ marginBottom: 8 }}><span className="badge accent">In government</span> {gov.map((g) => g.other.name).join(', ')}{gov[0].rel.role ? ` — ${gov[0].rel.role}` : ''}</div>}
      {leaders.length > 0 && <div className="relGroup"><div className="lbl">Leadership</div><div className="chips">{leaders.map((r) => <EntityChip key={r.rel.id} e={r.other} title={r.rel.role} />)}</div></div>}
      <div className="relGroup"><div className="lbl">Affiliated politicians in the database ({members.length})</div>
        {members.length ? <table className="data"><tbody>{members.map((r) => <tr key={r.rel.id}><td><Link to={`/entity/${encodeURIComponent(r.other.id)}`}><strong>{r.other.name}</strong></Link></td><td className="small muted">{r.other.summary}</td></tr>)}</tbody></table> : <div className="small muted">None recorded yet.</div>}
      </div>
    </Card>
  );
}

function EventCard({ e, rels }: { e: Entity; rels: RelView[] }) {
  const affected = rels.filter((r) => r.rel.type === 'affects' && r.direction === 'out');
  return (
    <Card title="Event details" id="event">
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <span className="badge accent">{e.attrs?.category}</span><span className="badge">{String(e.attrs?.status).replace(/-/g, ' ')}</span>
        {e.attrs?.category === 'conflict' && e.attrs?.intensity && <ConflictBadge intensity={e.attrs.intensity} label={String(e.attrs.intensity).replace(/-/g, ' ')} />}
        <span className="small">{e.attrs?.category === 'conflict' ? `Began ${e.attrs?.startYear || '—'}` : <>{fmtDate(e.attrs?.date)}{e.attrs?.endDate ? ` – ${fmtDate(e.attrs.endDate)}` : ''}</>}</span>
      </div>
      {e.attrs?.category === 'conflict' && (e.attrs?.subConflicts || []).length > 0 && <div className="relGroup"><div className="lbl">Theatres and sub-conflicts</div><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{e.attrs!.subConflicts.map((s: string) => <li key={s}>{s}</li>)}</ul></div>}
      <div className="relGroup"><div className="lbl">{e.attrs?.category === 'conflict' ? 'Where fighting takes place' : 'Affected entities'}</div><div className="chips">{affected.map((r) => <EntityChip key={r.rel.id} e={r.other} />)}</div></div>
      <div className="note-banner small" style={{ marginTop: 8 }}>This card shows objective event information only. Track your own expectations and scenarios in the <Link to={`/calendar?track=${encodeURIComponent(e.id)}`}>Catalyst Tracker</Link>.</div>
    </Card>
  );
}

function TimelineCard({ items }: { items: { date: string; title: string; detail?: string; sourceId?: string }[] }) {
  const sorted = items.slice().sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card title="Timeline" id="timeline">
      <ul className="timeline">{sorted.map((t, i) => <li key={i}><div className="d">{fmtDate(t.date)}</div><div>{t.title}</div>{t.detail && <div className="small muted">{t.detail}</div>}{t.sourceId && <SourceRef id={t.sourceId} />}</li>)}</ul>
    </Card>
  );
}

function EventsCard({ events, catalysts, entityId }: { events: any[]; catalysts: any[]; entityId: string }) {
  const today = localToday();
  const upcoming = events.filter((x) => String(x.endDate || x.date) >= today), past = events.filter((x) => String(x.endDate || x.date) < today);
  return (
    <Card title="Events & catalysts" id="events" actions={<Link className="btn sm" to={`/calendar?entity=${encodeURIComponent(entityId)}`}>Open calendar</Link>}>
      {!events.length && !catalysts.length && <div className="small muted">No scheduled events linked yet.</div>}
      {upcoming.length > 0 && <div className="relGroup"><div className="lbl">Upcoming (objective)</div>{upcoming.map((x) => <EventRow key={x.id} x={x} />)}</div>}
      {past.length > 0 && <div className="relGroup"><div className="lbl">Past</div>{past.map((x) => <EventRow key={x.id} x={x} />)}</div>}
      {catalysts.length > 0 && (
        <div className="note-banner" style={{ marginTop: 8 }}>
          <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Your catalyst forecasts <span className="badge private">Private · your hypothesis</span></div>
          {catalysts.map((c) => <div key={c.id} className="small"><Link to={`/calendar?catalyst=${c.id}`}>{c.title}</Link> <span className="muted">· {c.eventDate ? fmtDate(c.eventDate) : 'no date'} · {c.status}</span>{c.expectedOutcome && <div className="muted">Expected: {c.expectedOutcome}</div>}</div>)}
        </div>
      )}
    </Card>
  );
}
function EventRow({ x }: { x: any }) {
  return <div className="small" style={{ marginBottom: 4 }}><span className="badge">{fmtDate(x.date)}</span> <span className="badge">{x.category}</span> <Link to={`/entity/${encodeURIComponent(x.id)}`}>{x.name}</Link> <span className="muted">· {String(x.status).replace(/-/g, ' ')}</span></div>;
}

function NewsCard({ id }: { id: string }) {
  const [topic, setTopic] = useState('all');
  const [trustedOnly, setTrustedOnly] = useState(true);
  const [on, setOn] = useState(false);
  const { data, loading, error } = useApi<any>(on ? `/news/${encodeURIComponent(id)}?topic=${topic}` : null, 1800_000);
  useEffect(() => { const t = setTimeout(() => setOn(true), 400); return () => clearTimeout(t); }, [id]);
  const all: NewsItemView[] = data?.articles || [];
  const trusted = all.filter((a) => isTrusted(a.tier));
  // Fall back to everything when trusted outlets have nothing, and say so.
  const shown = trustedOnly && trusted.length ? trusted : all;
  const hidden = all.length - shown.length;
  return (
    <Card title="Recent news" id="news" actions={<>
      <label className="tiny" style={{ marginRight: 8 }} title="Wire services, public broadcasters, major papers, specialist outlets and official sources"><input type="checkbox" checked={trustedOnly} onChange={(e) => setTrustedOnly(e.target.checked)} /> Trusted outlets</label>
      <div className="seg">{['all', 'politics', 'economy', 'markets', 'geopolitics'].map((t) => <button key={t} className={topic === t ? 'on' : ''} onClick={() => setTopic(t)}>{t}</button>)}</div>
    </>}>
      {(loading || !on) && !data ? <Loading /> : error ? <Unavailable>{error.message}</Unavailable> : data?.unavailable ? <Unavailable>{data.reason}</Unavailable> : !all.length ? <Unavailable>No headlines in the last three weeks for “{data?.query}”{topic !== 'all' ? ` on ${topic}` : ''}.</Unavailable> : (
        <>
          {trustedOnly && !trusted.length && <div className="tiny muted" style={{ marginBottom: 4 }}>No trusted outlet has covered this recently — showing other outlets. Check these against the original source.</div>}
          <div>{shown.slice(0, 12).map((a) => <NewsRow key={a.id} a={a} />)}</div>
          <div style={{ marginTop: 8 }} className="tiny muted">
            {data.feedCount > 0 && <>{data.feedCount} {data.feedCount === 1 ? 'story' : 'stories'} from the terminal’s trusted feeds, plus </>}headline search for “{data.query}”{data.sourceId && <> via <SourceRef id={data.sourceId} prefix="" /></>}
            {hidden > 0 && <> · {hidden} from unrated outlets hidden (<button className="linkish" onClick={() => setTrustedOnly(false)}>show</button>)</>}
            {data.searchError && <> · {data.searchError}</>} · links open the original publisher · retrieved {ago(data.fetchedAt)}
          </div>
          <div className="tiny" style={{ marginTop: 2 }}><Link to={`/news?entity=${encodeURIComponent(id)}`}>Newsroom ›</Link></div>
        </>
      )}
    </Card>
  );
}

function NotesCard({ entityId, name }: { entityId: string; name: string }) {
  const { user } = useAuth();
  const { data, loading } = useApi<any[]>(user ? `/notes?entity=${encodeURIComponent(entityId)}` : null, 10_000);
  return (
    <Card title={<>Research notes <span className="badge private">Private</span></>} id="notes" actions={user && <NewNoteButton entityIds={[entityId]} />}>
      {!user ? <div className="small"><Link to="/login">Sign in</Link> to attach private notes, theses and documents to {name}.</div> :
        loading && !data ? <Loading /> : !data?.length ? <div className="small muted">No notes linked to {name} yet. Notes linked to several entities appear on each of their profiles.</div> :
        data.map((n) => (
          <Link key={n.id} to={`/research/${n.id}`} className="noteItem">
            <div className="t">{n.pinned ? '📌 ' : ''}{n.title || 'Untitled note'}</div>
            <div className="x">{n.bodyText?.slice(0, 180) || 'Empty note'}</div>
            <div className="tiny muted">{n.category ? `${n.category} · ` : ''}Updated {ago(n.updatedAt)}{n.entityIds.length > 1 ? ` · linked to ${n.entityIds.length} entities` : ''}{n.attachments?.length ? ` · 📎 ${n.attachments.length}` : ''}</div>
          </Link>
        ))}
    </Card>
  );
}

function SourcesCard({ sources }: { sources: Source[] }) {
  return (
    <Card title="Sources" id="sources">
      <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
        {sources.map((s) => <li key={s.id}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.publisher ? `${s.publisher} — ` : ''}{s.name}</a> : `${s.publisher ? `${s.publisher} — ` : ''}${s.name}`}{s.license && <span className="muted"> · {s.license}</span>}</li>)}
      </ul>
      <div className="tiny muted" style={{ marginTop: 6 }}>Live statistics, quotes, filings and news list their own source and retrieval time in each section above.</div>
    </Card>
  );
}

function ReportModal({ entityId, name, onClose }: { entityId: string; name: string; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useApp();
  const [field, setField] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  return (
    <Modal title={`Report an inconsistency — ${name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!user || !msg.trim()} onClick={async () => { try { await api('/reports', { body: { entityId, field, message: msg } }); toast('Thanks — report saved for review'); onClose(); } catch (x: any) { setErr(x.message); } }}>Submit</button></>}>
      {!user && <div className="small err">Sign in to submit corrections.</div>}
      <label className="field">Which field or section?<input className="input" value={field} onChange={(e) => setField(e.target.value)} placeholder="e.g. Head of government" /></label>
      <label className="field">What is wrong, and what is the correct value + source?<textarea className="input" value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} /></label>
      {err && <div className="err small">{err}</div>}
    </Modal>
  );
}

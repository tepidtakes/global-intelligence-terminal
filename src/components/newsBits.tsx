// Shared pieces for trusted news and provenance: outlet tier badges, headline rows, news
// signals and the per-profile "Data quality" card.
import { Link } from 'react-router-dom';
import { TIER_INFO, type PublisherTier } from '../../shared/newsSources';
import { Quality } from './common';
import { ago, fmtDate, TYPE_ICON } from '../format';
import type { DataQuality } from '../../shared/types';

export function TierBadge({ tier }: { tier: PublisherTier }) {
  const t = TIER_INFO[tier] || TIER_INFO.unrated;
  return <span className={`tier ${tier}`} title={t.help}>{t.label}</span>;
}

export interface NewsItemView {
  id: string; title: string; url: string; summary?: string; publisher: string; domain?: string; tier: PublisherTier; date: string; origin: 'feed' | 'search';
  corroboration: number; alsoReportedBy: { name: string; tier: PublisherTier; url: string }[]; mention?: 'title' | 'summary';
  tags?: { id: string; name: string; type: string; flag?: string }[]; lastUpdate?: string;
}

/** One headline: outlet + tier, date, how many independent trusted outlets carried the story. */
export function NewsRow({ a, showTags, showSummary }: { a: NewsItemView; showTags?: boolean; showSummary?: boolean }) {
  const others = a.alsoReportedBy || [];
  return (
    <div className="newsRow">
      <a href={a.url} target="_blank" rel="noreferrer noopener" className="t">{a.title}</a>
      {showSummary && a.summary && <div className="small muted sum">{a.summary}</div>}
      <div className="tiny muted meta">
        <span className="pub">{a.publisher}</span> <TierBadge tier={a.tier} /> · {fmtDate(a.date)}{a.date?.length > 10 ? ` (${ago(a.date)})` : ''}
        {a.corroboration >= 2 && <> · <span className="corr" title={`Carried by ${a.corroboration} independent trusted outlets`}>✓ {a.corroboration} trusted outlets</span></>}
        {others.length > 0 && <> · also: {others.slice(0, 4).map((o, i) => <span key={o.name}>{i ? ', ' : ''}<a href={o.url} target="_blank" rel="noreferrer noopener">{o.name}</a></span>)}{others.length > 4 ? ` +${others.length - 4}` : ''}</>}
        {a.mention === 'summary' && <> · <span title="Named in the article summary, not the headline">mentioned</span></>}
      </div>
      {showTags && a.tags && a.tags.length > 0 && (
        <div className="tagRow">{a.tags.map((t) => <Link key={t.id} className="miniChip" to={`/entity/${encodeURIComponent(t.id)}`}><span aria-hidden>{t.flag || TYPE_ICON[t.type]}</span>{t.name}</Link>)}</div>
      )}
    </div>
  );
}

export interface SignalView {
  key: string; kind: 'appointment' | 'departure' | 'election-win'; entityId: string; entityName: string; person: string; roleLabel?: string;
  status?: 'consistent' | 'differs-from-record' | 'not-in-record' | 'outcome-reported'; strength: 'single-source' | 'corroborated' | 'official';
  publishers: string[]; firstSeen: string; lastSeen: string; summary?: string; recordHolders?: string[];
  evidence: { title: string; url: string; publisher: string; tier: PublisherTier; date: string }[];
}
const STRENGTH: Record<SignalView['strength'], { label: string; help: string }> = {
  official: { label: 'official source', help: 'Stated by an official source (government, regulator, central bank or international organisation).' },
  corroborated: { label: 'corroborated', help: 'Reported independently by two or more trusted outlets.' },
  'single-source': { label: 'single source', help: 'Only one trusted outlet so far. Shown for awareness; it does not flag any record.' },
};
const STATUS: Record<NonNullable<SignalView['status']>, string> = {
  consistent: 'matches the record', 'differs-from-record': 'not yet in the record', 'not-in-record': 'no record to compare', 'outcome-reported': 'result reported',
};

export function SignalItem({ s, compact }: { s: SignalView; compact?: boolean }) {
  return (
    <div className={`signal ${s.strength} ${s.status || ''}`}>
      <div className="small"><strong>{s.kind === 'election-win' ? 'Election result' : s.kind === 'departure' ? 'Departure' : 'Appointment'}{s.roleLabel ? ` · ${s.roleLabel}` : ''}:</strong> {s.summary || `${s.person} — ${s.entityName}`}</div>
      <div className="tiny muted">
        <span className={`sigStrength ${s.strength}`} title={STRENGTH[s.strength].help}>{STRENGTH[s.strength].label}</span>
        {s.status && <> · {STATUS[s.status]}{s.status === 'differs-from-record' && s.recordHolders?.length ? ` (record: ${s.recordHolders.join(', ')})` : ''}</>}
        {!compact && <> · first seen {fmtDate(s.firstSeen)}</>}
      </div>
      {!compact && <div className="tiny" style={{ marginTop: 2 }}>{s.evidence.slice(0, 4).map((ev, i) => <span key={ev.url}>{i ? ' · ' : ''}<a href={ev.url} target="_blank" rel="noreferrer noopener" title={ev.title}>{ev.publisher}</a></span>)}</div>}
    </div>
  );
}

/** Signals worth a banner: corroborated or official, and saying something the record does not. */
export const bannerSignals = (list: SignalView[] = [], entityId: string) =>
  list.filter((s) => s.strength !== 'single-source' && (s.status === 'differs-from-record' || s.status === 'outcome-reported') && (s.entityId === entityId || s.kind === 'election-win'));

const Q_ORDER: DataQuality[] = ['official', 'curated', 'community', 'delayed', 'forecast', 'estimate', 'reported', 'manual', 'live', 'historical'];
const SEV_ICON: Record<string, string> = { error: '✗', warning: '⚠', info: 'ℹ' };

export function ProvenanceCard({ p }: { p: any }) {
  if (!p) return null;
  const total = p.facts || 0;
  return (
    <section className="card" id="provenance">
      <div className="hd"><h2>Data quality</h2><div className="spacer" /><Link className="tiny" to="/data">All sources ›</Link></div>
      <div className="bd">
        {total ? (
          <>
            <div className="qbar" aria-label="Facts by quality">{Q_ORDER.filter((q) => p.byQuality[q]).map((q) => <span key={q} className={`seg ${q}`} style={{ flex: p.byQuality[q] }} title={`${p.byQuality[q]} ${q}`} />)}</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>{Q_ORDER.filter((q) => p.byQuality[q]).map((q) => <span key={q} className="tiny"><Quality q={q} /> {p.byQuality[q]}</span>)}</div>
          </>
        ) : <div className="small muted">No structured facts on this profile yet.</div>}
        <div className="tiny muted" style={{ marginTop: 6 }}>
          {p.depth === 'curated' ? 'Curated profile' : 'Baseline profile (geography + live data)'}
          {p.oldestVerified && <> · curated facts verified {p.oldestVerified}</>}
          {p.newestRetrieved && <> · live facts retrieved {ago(p.newestRetrieved)}</>}
        </div>
        {p.issues?.length > 0 && (
          <div className="stack" style={{ marginTop: 8, gap: 4 }}>
            {p.issues.slice(0, 6).map((i: any, n: number) => <div key={n} className={`tiny issue ${i.severity}`}><span aria-hidden>{SEV_ICON[i.severity]}</span> {i.message}</div>)}
          </div>
        )}
        {!p.issues?.length && <div className="tiny good" style={{ marginTop: 6 }}>✓ No consistency issues found</div>}
      </div>
    </section>
  );
}

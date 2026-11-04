// Consistency and provenance audit over the whole entity graph. Runs on demand (Data page,
// /api/quality/*, npm run check:data) and never changes data: it reports what to check.
//
// Errors   — a broken promise of the app: a value without a known source, an unknown quality
//            label, a relationship that ends before it starts, a link to a missing entity.
// Warnings — two records disagree: conflicting values for one fact, duplicate people, an
//            election in the past still "scheduled", trusted news contradicting a record.
// Info     — worth knowing: Wikidata ambiguity, terms closed automatically, ageing curated facts.
import { entities, sources, allRels, danglingRels, normName, getEntity } from './graph.js';
import { DATA_QUALITIES, type DataQuality, type Entity } from '../shared/types.js';

export type Severity = 'error' | 'warning' | 'info';
export interface Issue { severity: Severity; category: string; message: string; entityId?: string; entityName?: string; relatedIds?: string[]; }

export const CATEGORY_LABEL: Record<string, string> = {
  'unknown-source': 'Cites a source that is not in the source list',
  'missing-source': 'Value without a source',
  'invalid-quality': 'Unknown data-quality label',
  'dangling-relationship': 'Relationship to a missing entity',
  'reversed-term': 'Term ends before it starts',
  'fact-conflict': 'Same fact, different values',
  'duplicate-person': 'Same person recorded twice',
  'election-status': 'Past election still marked scheduled',
  'multiple-holders': 'More than one current officeholder',
  'news-contradicts-record': 'Trusted news contradicts the record',
  'term-closed-by-live-data': 'Curated term closed by newer live data',
  'stale-curated': 'Curated facts older than 6 months',
  'leader-ambiguity': 'Live source lists competing officeholders',
  'election-result-conflict': 'Election result differs between sources',
  'result-missing': 'Election held, result not recorded',
};

// Offices legitimately held by more than one person at once.
const SHARED_OFFICE = new Set(['country:AND', 'country:SMR', 'country:BIH', 'country:CHE', 'country:SWZ', 'country:VAT']);
const QUALITIES = new Set<DataQuality>(DATA_QUALITIES);
const monthsAgo = (d: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(d); if (!m) return 0;
  const now = new Date();
  return (now.getUTCFullYear() - Number(m[1])) * 12 + (now.getUTCMonth() + 1 - Number(m[2]));
};
const today = () => new Date().toISOString().slice(0, 10);

let memo: { at: number; issues: Issue[] } | null = null;

export function audit(force = false): Issue[] {
  if (!force && memo && Date.now() - memo.at < 60_000) return memo.issues;
  const issues: Issue[] = [];
  const push = (i: Issue) => { if (i.entityId && !i.entityName) i.entityName = getEntity(i.entityId)?.name; issues.push(i); };

  for (const e of entities.values()) {
    // Facts: source, quality, conflicting duplicates.
    const byLabel = new Map<string, Set<string>>();
    for (const f of e.facts || []) {
      if (!f.sourceId) push({ severity: 'error', category: 'missing-source', entityId: e.id, message: `“${f.label}” has no source.` });
      else if (!sources.has(f.sourceId)) push({ severity: 'error', category: 'unknown-source', entityId: e.id, message: `“${f.label}” cites unknown source “${f.sourceId}”.` });
      if (!QUALITIES.has(f.quality)) push({ severity: 'error', category: 'invalid-quality', entityId: e.id, message: `“${f.label}” has quality “${f.quality}”.` });
      if (f.quality === 'reported') continue; // reported facts sit beside the record on purpose
      const set = byLabel.get(f.label) || byLabel.set(f.label, new Set()).get(f.label)!;
      set.add(String(f.value));
    }
    for (const [label, vals] of byLabel) if (vals.size > 1) push({ severity: 'warning', category: 'fact-conflict', entityId: e.id, message: `“${label}” has ${vals.size} different values: ${[...vals].slice(0, 3).join(' | ')}.` });
    for (const s of e.sources || []) if (!sources.has(s)) push({ severity: 'error', category: 'unknown-source', entityId: e.id, message: `Profile cites unknown source “${s}”.` });
    for (const t of e.timeline || []) if (t.sourceId && !sources.has(t.sourceId)) push({ severity: 'error', category: 'unknown-source', entityId: e.id, message: `Timeline item “${t.title}” cites unknown source “${t.sourceId}”.` });

    // Elections whose date has passed but which still say "scheduled".
    if (e.type === 'event' && e.attrs?.category === 'election' && e.attrs?.status === 'scheduled' && String(e.attrs?.endDate || e.attrs?.date || '9999') < today())
      push({ severity: 'warning', category: 'election-status', entityId: e.id, message: `Held on ${e.attrs.endDate || e.attrs.date} but still marked “scheduled”.` });

    // Election results: the article's winner vs trusted-news reports; results missing long after the vote.
    if (e.type === 'event' && e.attrs?.category === 'election') {
      const w = e.attrs?.election?.winner?.name; const news = e.attrs?.reportedOutcome?.winner;
      const sn = (n: string) => normName(n).split(' ').filter((x) => x.length > 2).at(-1);
      if (w && news && sn(w) !== sn(news)) push({ severity: 'warning', category: 'election-result-conflict', entityId: e.id, message: `The election article names ${w} as the winner; trusted outlets (${(e.attrs.reportedOutcome.publishers || []).slice(0, 3).join(', ')}) report ${news}.` });
      const end = String(e.attrs?.endDate || e.attrs?.date || '');
      if (/^\d{4}-\d{2}-\d{2}/.test(end) && end < new Date(Date.now() - 21 * 86400_000).toISOString().slice(0, 10) && !w && /outcome-not-recorded|results-pending/.test(e.attrs?.status || ''))
        push({ severity: 'info', category: 'result-missing', entityId: e.id, message: `Held ${end}; no result recorded yet${e.attrs?.election ? ' (the Wikipedia article has no winner filled in)' : ' (no Wikipedia article linked)'}.` });
    }

    // Live-source ambiguity notes (Wikidata lists two current holders, etc.).
    for (const n of e.attrs?.leaderNotes || []) if (/more than one current/i.test(n)) push({ severity: 'info', category: 'leader-ambiguity', entityId: e.id, message: n });

    // Trusted news reporting something the record does not show.
    for (const s of e.attrs?.newsSignals || []) if (s.entityId === e.id && s.status === 'differs-from-record' && s.strength !== 'single-source')
      push({ severity: 'warning', category: 'news-contradicts-record', entityId: e.id, relatedIds: s.relatedIds, message: s.summary });
  }

  // Relationships.
  for (const r of danglingRels) push({ severity: 'error', category: 'dangling-relationship', entityId: entities.has(r.from) ? r.from : undefined, message: `${r.from} —${r.type}→ ${r.to}: ${entities.has(r.from) ? r.to : r.from} does not exist.` });
  const holders = new Map<string, Set<string>>();
  for (const r of allRels()) {
    if (r.sourceId && !sources.has(r.sourceId)) push({ severity: 'error', category: 'unknown-source', entityId: r.from, message: `Relationship ${r.type} → ${getEntity(r.to)?.name || r.to} cites unknown source “${r.sourceId}”.` });
    if (r.validFrom && r.validTo && r.validTo < r.validFrom) push({ severity: 'error', category: 'reversed-term', entityId: r.from, relatedIds: [r.to], message: `${r.type} → ${getEntity(r.to)?.name}: ends ${r.validTo}, before it starts (${r.validFrom}).` });
    if (!r.origin && r.validTo && /^Term end inferred from Wikidata/.test(r.note || '')) push({ severity: 'info', category: 'term-closed-by-live-data', entityId: r.from, relatedIds: [r.to], message: r.note! });
    if ((r.type === 'head_of_state' || r.type === 'head_of_government') && !r.validTo && !SHARED_OFFICE.has(r.to)) {
      const k = `${r.to}|${r.type}`;
      (holders.get(k) || holders.set(k, new Set()).get(k)!).add(r.from);
    }
  }
  for (const [k, set] of holders) if (set.size > 1) {
    const [placeId, type] = k.split('|');
    push({ severity: 'warning', category: 'multiple-holders', entityId: placeId, relatedIds: [...set], message: `${set.size} current ${type.replace(/_/g, ' ')} records: ${[...set].map((id) => getEntity(id)?.name || id).join(', ')}.` });
  }

  // The same person entered twice (e.g. curated and live with different ids).
  const people = new Map<string, Entity[]>();
  for (const e of entities.values()) if (e.type === 'person') { const k = normName(e.name); (people.get(k) || people.set(k, []).get(k)!).push(e); }
  for (const [, list] of people) if (list.length > 1) {
    // Different people can share a name; only flag when they also share a country or an organisation.
    const linked = new Set<string>(); let shared = false;
    for (const p of list) for (const r of allRelsOf(p.id)) { if (linked.has(r)) shared = true; linked.add(r); }
    if (shared) push({ severity: 'warning', category: 'duplicate-person', entityId: list[0].id, relatedIds: list.slice(1).map((p) => p.id), message: `“${list[0].name}” appears ${list.length} times (${list.map((p) => p.id).join(', ')}).` });
  }

  // Ageing curated facts: one summary line per entity with any.
  for (const e of entities.values()) {
    const old = (e.facts || []).filter((f) => f.quality === 'curated' && f.asOf && monthsAgo(f.asOf) >= 6);
    if (old.length) push({ severity: 'info', category: 'stale-curated', entityId: e.id, message: `${old.length} curated fact${old.length > 1 ? 's' : ''} last verified ${old[0].asOf} (${monthsAgo(old[0].asOf!)} months ago).` });
  }

  memo = { at: Date.now(), issues };
  return issues;
}

function allRelsOf(id: string) {
  const out: string[] = [];
  for (const r of allRels()) { if (r.from === id) out.push(r.to); else if (r.to === id) out.push(r.from); }
  return out;
}

/** Counts that describe how much of the graph is sourced, and how. */
export function coverage() {
  const byQuality: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byType: Record<string, { entities: number; curated: number; withFacts: number; facts: number }> = {};
  let facts = 0, withRetrieved = 0, curatedFacts = 0, oldestCurated = '';
  for (const e of entities.values()) {
    const t = byType[e.type] ||= { entities: 0, curated: 0, withFacts: 0, facts: 0 };
    t.entities++; if (e.depth === 'curated') t.curated++;
    if (e.facts?.length) t.withFacts++;
    for (const f of e.facts || []) {
      facts++; t.facts++;
      byQuality[f.quality] = (byQuality[f.quality] || 0) + 1;
      bySource[f.sourceId] = (bySource[f.sourceId] || 0) + 1;
      if (f.retrievedAt) withRetrieved++;
      if (f.quality === 'curated') { curatedFacts++; if (f.asOf && (!oldestCurated || f.asOf < oldestCurated)) oldestCurated = f.asOf; }
    }
  }
  return { entities: entities.size, relationships: allRels().length, sources: sources.size, facts, withRetrieved, curatedFacts, oldestCurated, byQuality, bySource, byType };
}

/** Provenance summary for one profile: how its facts are sourced and what is open about it. */
export function entityProvenance(id: string) {
  const e = getEntity(id); if (!e) return null;
  const byQuality: Record<string, number> = {};
  let oldestVerified = '', newestRetrieved = '';
  for (const f of e.facts || []) {
    byQuality[f.quality] = (byQuality[f.quality] || 0) + 1;
    if (f.asOf && f.quality === 'curated' && (!oldestVerified || f.asOf < oldestVerified)) oldestVerified = f.asOf;
    if (f.retrievedAt && f.retrievedAt > newestRetrieved) newestRetrieved = f.retrievedAt;
  }
  const issues = audit().filter((i) => i.entityId === id || i.relatedIds?.includes(id));
  return { depth: e.depth, facts: (e.facts || []).length, byQuality, oldestVerified: oldestVerified || undefined, newestRetrieved: newestRetrieved || undefined, issues, signals: e.attrs?.newsSignals || [] };
}

export function summarize(issues: Issue[]) {
  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  const byCategory: Record<string, { severity: Severity; count: number; label: string }> = {};
  for (const i of issues) {
    bySeverity[i.severity]++;
    const c = byCategory[i.category] ||= { severity: i.severity, count: 0, label: CATEGORY_LABEL[i.category] || i.category };
    c.count++;
  }
  return { bySeverity, byCategory };
}

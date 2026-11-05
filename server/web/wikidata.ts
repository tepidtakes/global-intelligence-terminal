// Wikidata is the backbone of the knowledge web: who belongs to what, who runs what, where things
// are. Each loader below asks Wikidata for one slice of the world, parses it (pure functions, tested
// on sample files), and merges it into the graph — matching existing records by Wikidata id first,
// then by name — so hand-checked records gain links and are cross-checked, never duplicated.
//   • countries: Wikidata ids, names in eleven languages, currency, form of government
//   • organizations: every organization countries are members of, with join and leave dates, seat,
//     and current leader — discovered from the data, not listed by hand
//   • central banks and their governors
//   • capitals and cities of a million people or more
//   • listed companies: tickers (→ live quotes), executives, parent companies, industries, head office
import { cached } from '../cache.js';
import { USER_AGENT } from '../config.js';
import { netFetch } from '../net.js';
import { getEntity, upsertEntity, setLiveRels, entityByQid, byIso3, normName, listByType, relsOfType, addCountryNames, countryOf } from '../graph.js';
import type { Entity, Fact, Relationship } from '../../shared/types.js';
import { emitNew, type Change } from '../changes.js';
import { registerConnector } from './connectors.js';

type NewRel = Omit<Relationship, 'id' | 'origin'>;
const WDQS = 'https://query.wikidata.org/sparql';

// The shared network gate (server/net.ts) runs one query at a time, 400 ms apart — the public
// endpoint limits parallel and heavy use — retries rate-limited answers and skips the endpoint
// while it is down.
export async function sparql(query: string, timeoutMs = 120000): Promise<any[]> {
  const res = await netFetch(WDQS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT }, body: new URLSearchParams({ query }).toString(), timeoutMs });
  if (!res.ok) throw new Error(`${res.status} from Wikidata${res.status === 429 ? ' (rate limited)' : ''}`);
  const j: any = await res.json();
  return (j?.results?.bindings || []) as any[];
}
async function batched<T>(ids: string[], size: number, q: (values: string) => string) {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += size) rows.push(...(await sparql(q(ids.slice(i, i + size).map((x) => `wd:${x}`).join(' ')))));
  return rows as T[];
}

const val = (b: any, k: string): string | undefined => b?.[k]?.value;
export const qidOf = (uri?: string) => (uri ? uri.slice(uri.lastIndexOf('/') + 1) : undefined);
const num = (s?: string) => (s != null && s !== '' && Number.isFinite(Number(s)) ? Number(s) : undefined);
/** Wikidata dates are full timestamps; a 1 January date is usually year precision, so it is shown as a year. */
export const wdDate = (s?: string) => { if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return undefined; const d = s.slice(0, 10); return d.endsWith('-01-01') ? d.slice(0, 4) : d; };
const point = (s?: string): [number, number] | undefined => { const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(s || ''); return m ? [Number(m[1]), Number(m[2])] : undefined; };
const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const wdUrl = (qid: string) => `https://www.wikidata.org/wiki/${qid}`;
const fact = (label: string, value: string | number, sourceId: string, retrievedAt: string, o: Partial<Fact> = {}): Fact => ({ label, value, sourceId, quality: 'community', retrievedAt, ...o });
/** Merge fields into an existing record without replacing what hand-checked data says. */
function enrich(id: string, attrs: Record<string, any>, extra: Partial<Entity> = {}) {
  const e = getEntity(id); if (!e) return;
  upsertEntity({ id, type: e.type, name: e.name, depth: e.depth, ...extra, attrs } as Entity);
}

// ───────────────────────── Countries ─────────────────────────
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ar', 'ja'];
export function parseCountryNames(rows: any[]) {
  const by = new Map<string, { qid: string; sitelinks: number; names: Set<string> }>();
  for (const r of rows) {
    const iso3 = val(r, 'iso3'); const qid = qidOf(val(r, 'c')); const sl = num(val(r, 'sl')) || 0; if (!iso3 || !qid) continue;
    const cur = by.get(iso3);
    if (cur && cur.qid !== qid && cur.sitelinks >= sl) continue; // several items share a code: keep the best known
    if (!cur || cur.qid !== qid) by.set(iso3, { qid, sitelinks: sl, names: new Set() });
    const name = val(r, 'name'); if (name) by.get(iso3)!.names.add(name);
  }
  return Object.fromEntries([...by].map(([k, v]) => [k, { qid: v.qid, sitelinks: v.sitelinks, names: [...v.names] }]));
}
/** Form of government (labels) → the four groups the map shows. */
export function govGroupOf(forms: string[]) {
  const t = forms.join(' | ').toLowerCase();
  if (/absolute monarchy/.test(t)) return 'monarchy';
  if (/one-party|single-party|communist state|socialist state|marxist/.test(t)) return 'one-party';
  if (/presidential/.test(t) && !/parliamentary republic/.test(t)) return 'presidential';
  if (/parliament|constitutional monarchy|westminster/.test(t)) return 'parliamentary';
  return undefined;
}
export function parseCountryDetails(rows: any[]) {
  const out: Record<string, { currencies: string[]; forms: string[] }> = {};
  for (const r of rows) {
    const iso3 = val(r, 'iso3'); if (!iso3) continue;
    const o = out[iso3] ||= { currencies: [], forms: [] };
    const cur = val(r, 'currencyCode'); if (cur && !o.currencies.includes(cur)) o.currencies.push(cur);
    const form = val(r, 'govLabel'); if (form && !o.forms.includes(form)) o.forms.push(form);
  }
  return out;
}
async function countriesData() {
  return cached('wd:countries:v1', 7 * 86400, async () => {
    const names = parseCountryNames(await sparql(`SELECT ?c ?iso3 ?sl ?name WHERE { ?c wdt:P298 ?iso3 ; wikibase:sitelinks ?sl . { ?c rdfs:label ?name } UNION { ?c skos:altLabel ?name } FILTER(LANG(?name) IN (${LANGS.map((l) => `"${l}"`).join(',')})) }`));
    const details = parseCountryDetails(await sparql(`SELECT ?iso3 ?currencyCode ?govLabel WHERE { ?c wdt:P298 ?iso3 . OPTIONAL { ?c p:P38 ?cs . ?cs ps:P38 ?cur . FILTER NOT EXISTS { ?cs pq:P582 [] } ?cur wdt:P498 ?currencyCode } OPTIONAL { ?c wdt:P122 ?gov . ?gov rdfs:label ?govLabel FILTER(LANG(?govLabel)="en") } }`));
    return { names, details };
  });
}
export function applyCountries(d: { names: Record<string, { qid: string; sitelinks: number; names: string[] }>; details: Record<string, { currencies: string[]; forms: string[] }> }, retrievedAt: string) {
  let n = 0, names = 0;
  for (const iso3 of new Set([...Object.keys(d.names), ...Object.keys(d.details)])) {
    const id = byIso3.get(iso3); const e = id && getEntity(id); if (!e) continue;
    const v = d.names[iso3] || { qid: e.attrs?.wikidata, sitelinks: e.attrs?.sitelinks, names: [] };
    const known = new Set([e.name, ...(e.aliases || [])].map(normName));
    const alt = v.names.filter((x) => !known.has(normName(x))).slice(0, 80);
    names += addCountryNames(e.id, v.names);
    const det = d.details[iso3];
    const forms = det?.forms || [];
    enrich(e.id, { ...(e.attrs?.wikidata || !v.qid ? {} : { wikidata: v.qid }), ...(v.sitelinks ? { sitelinks: v.sitelinks } : {}), ...(alt.length ? { altNames: alt } : {}), ...(det?.currencies.length ? { currencyCodesWd: det.currencies } : {}), ...(forms.length ? { govFormsWd: forms, govGroupWd: govGroupOf(forms) } : {}) },
      forms.length && !(e.facts || []).some((f) => f.label === 'Form of government') ? { facts: [fact('Form of government', forms.join(', '), 'wikidata', retrievedAt, { note: 'As recorded on Wikidata (community-maintained).' })] } : {});
    n++;
  }
  return { countries: n, names };
}
registerConnector({
  id: 'wikidata-countries', label: 'Wikidata — countries', sourceIds: ['wikidata'], everyHours: 72, delaySec: 12,
  provides: 'Wikidata ids for every country, names in eleven languages (for search and for reading other sources), current currency and form of government',
  run: async () => { const r = await countriesData(); const a = applyCountries(r.data, r.fetchedAt); return { detail: `${a.countries} countries, ${a.names} extra names`, fetchedAt: r.fetchedAt, stale: r.stale, counts: a }; },
});

// ───────────────────────── Organizations and memberships ─────────────────────────
export interface Membership { iso3: string; org: string; start?: string; end?: string; }
export function parseMemberships(rows: any[]): Membership[] {
  return rows.map((r) => ({ iso3: val(r, 'iso3')!, org: qidOf(val(r, 'org'))!, start: wdDate(val(r, 'start')), end: wdDate(val(r, 'end')) })).filter((m) => m.iso3 && m.org && /^Q\d+$/.test(m.org));
}
/** Organizations with at least `min` member countries (current or former) are the ones worth showing. */
export function orgsWithMembers(memberships: Membership[], min = 3) {
  const counts = new Map<string, Set<string>>();
  for (const m of memberships) (counts.get(m.org) || counts.set(m.org, new Set()).get(m.org)!).add(m.iso3);
  return [...counts].filter(([, s]) => s.size >= min).map(([q]) => q);
}
export interface OrgInfo { qid: string; label?: string; desc?: string; short?: string; inception?: string; hq?: string; hqLabel?: string; website?: string; sitelinks: number; aliases: string[]; }
export function parseOrgDetails(rows: any[]): OrgInfo[] {
  return rows.map((r) => ({ qid: qidOf(val(r, 'org'))!, label: val(r, 'label'), desc: val(r, 'desc'), short: val(r, 'short'), inception: wdDate(val(r, 'inception')), hq: qidOf(val(r, 'hq')), hqLabel: val(r, 'hqLabel'),
    website: val(r, 'website'), sitelinks: num(val(r, 'sl')) || 0, aliases: (val(r, 'aliases') || '').split('|').filter(Boolean) })).filter((o) => o.qid && o.label && !/^Q\d+$/.test(o.label));
}
export interface Holder { of: string; person: string; name: string; role: string; start?: string; }
export function parseHolders(rows: any[], keyVar: string): Holder[] {
  return rows.map((r) => ({ of: qidOf(val(r, keyVar))!, person: qidOf(val(r, 'person'))!, name: val(r, 'name')!, role: val(r, 'role') || 'Leader', start: wdDate(val(r, 'start')) })).filter((h) => h.of && h.person && h.name);
}
async function organizationsData() {
  return cached('wd:organizations:v1', 3 * 86400, async () => {
    const memberships = parseMemberships(await sparql(`SELECT ?iso3 ?org ?start ?end WHERE { ?c wdt:P298 ?iso3 ; p:P463 ?st . ?st ps:P463 ?org ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } }`));
    const orgIds = orgsWithMembers(memberships);
    const orgs = parseOrgDetails(await batched(orgIds, 120, (values) => `SELECT ?org (SAMPLE(?l) AS ?label) (SAMPLE(?d) AS ?desc) (SAMPLE(?sh) AS ?short) (SAMPLE(?inc) AS ?inception) (SAMPLE(?h) AS ?hq) (SAMPLE(?hl) AS ?hqLabel) (SAMPLE(?web) AS ?website) (SAMPLE(?s) AS ?sl) (GROUP_CONCAT(DISTINCT ?a; separator="|") AS ?aliases) WHERE { VALUES ?org { ${values} } OPTIONAL { ?org rdfs:label ?l FILTER(LANG(?l)="en") } OPTIONAL { ?org schema:description ?d FILTER(LANG(?d)="en") } OPTIONAL { ?org wdt:P1813 ?sh FILTER(LANG(?sh)="en") } OPTIONAL { ?org wdt:P571 ?inc } OPTIONAL { ?org wdt:P159 ?h . OPTIONAL { ?h rdfs:label ?hl FILTER(LANG(?hl)="en") } } OPTIONAL { ?org wdt:P856 ?web } OPTIONAL { ?org wikibase:sitelinks ?s } OPTIONAL { ?org skos:altLabel ?a FILTER(LANG(?a)="en") } } GROUP BY ?org`));
    const leaders = parseHolders(await batched(orgs.map((o) => o.qid), 150, (values) => `SELECT ?org ?person ?name ?role ?start WHERE { VALUES ?org { ${values} } { ?org p:P3975 ?st . ?st ps:P3975 ?person . BIND("Secretary-General" AS ?role) } UNION { ?org p:P1037 ?st . ?st ps:P1037 ?person . BIND("Director" AS ?role) } UNION { ?org p:P488 ?st . ?st ps:P488 ?person . BIND("Chair" AS ?role) } FILTER NOT EXISTS { ?st pq:P582 [] } OPTIONAL { ?st pq:P580 ?start } ?person wdt:P31 wd:Q5 ; rdfs:label ?name FILTER(LANG(?name)="en") }`), 'org');
    return { memberships: memberships.filter((m) => orgIds.includes(m.org)), orgs, leaders };
  });
}
/** Existing organization record with the same name (hand-checked IGOs gain the Wikidata id). */
function matchOrg(o: OrgInfo) {
  const byQ = entityByQid(o.qid); if (byQ) return byQ;
  const keys = new Set([o.label, o.short, ...o.aliases].filter(Boolean).map((x) => normName(x!)));
  for (const e of listByType('igo')) if (!e.attrs?.wikidata && [e.name, ...(e.aliases || [])].some((n) => keys.has(normName(n)))) return e.id;
  return undefined;
}
/** A person from Wikidata: an existing record with the same Wikidata id or name, else a new one. */
function personFor(h: { person: string; name: string }, summary: string, retrievedAt: string) {
  const byQ = entityByQid(h.person); if (byQ) return byQ;
  const sameName = listByType('person').find((p) => [p.name, ...(p.aliases || [])].some((n) => normName(n) === normName(h.name)));
  if (sameName) { enrich(sameName.id, { wikidata: h.person }); return sameName.id; }
  const id = `person:wd-${h.person.toLowerCase()}`;
  upsertEntity({ id, type: 'person', name: h.name, depth: 'baseline', summary, facts: [fact('Wikidata', wdUrl(h.person), 'wikidata', retrievedAt)], attrs: { wikidata: h.person, origin: 'wikidata' }, sources: ['wikidata'] } as Entity);
  return id;
}
export function applyOrganizations(d: { memberships: Membership[]; orgs: OrgInfo[]; leaders: Holder[] }, retrievedAt: string) {
  const idOf = new Map<string, string>(); let created = 0;
  const memberCount = new Map<string, number>();
  for (const m of d.memberships) if (!m.end) memberCount.set(m.org, (memberCount.get(m.org) || 0) + 1);
  for (const o of d.orgs) {
    const existing = matchOrg(o);
    const id = existing || `igo:wd-${o.qid.toLowerCase()}`;
    const members = memberCount.get(o.qid) || 0;
    const facts = [o.inception && fact('Founded', o.inception, 'wikidata-orgs', retrievedAt), fact('Member countries', members, 'wikidata-orgs', retrievedAt, { note: 'Countries Wikidata lists as current members.' }),
      o.hqLabel && fact('Headquarters', o.hqLabel, 'wikidata-orgs', retrievedAt), o.website && fact('Website', o.website, 'wikidata-orgs', retrievedAt)].filter(Boolean) as Fact[];
    const attrs = { wikidata: o.qid, sitelinks: o.sitelinks, wdMembers: members, ...(o.inception ? { founded: o.inception.slice(0, 4) } : {}), ...(o.website ? { website: o.website } : {}), origin: existing ? getEntity(existing)?.attrs?.origin : 'wikidata' };
    if (existing) enrich(existing, attrs, getEntity(existing)?.depth === 'curated' ? {} : { facts });
    else {
      upsertEntity({ id, type: 'igo', name: o.label!, depth: 'baseline', aliases: [...new Set([o.short, ...o.aliases].filter((x): x is string => !!x && x !== o.label))].slice(0, 12),
        summary: `${cap(o.desc) || 'International organization'}${members ? ` with ${members} member countries` : ''}${o.inception ? `, founded ${o.inception.slice(0, 4)}` : ''}.`, facts, attrs, sources: ['wikidata-orgs'] } as Entity);
      created++;
    }
    idOf.set(o.qid, id);
  }
  const rels: NewRel[] = [];
  for (const m of d.memberships) {
    const org = idOf.get(m.org); const c = byIso3.get(m.iso3); if (!org || !c) continue;
    rels.push({ from: c, to: org, type: 'member_of', validFrom: m.start, validTo: m.end, sourceId: 'wikidata-orgs', retrievedAt });
  }
  const added = setLiveRels('wikidata-memberships', rels);
  // Joins and departures become changes in the alert feed (the first load is the baseline).
  const items: Change[] = [];
  for (const m of d.memberships) {
    const org = idOf.get(m.org); const c = byIso3.get(m.iso3); if (!org || !c) continue;
    const sl = d.orgs.find((o) => o.qid === m.org)?.sitelinks || 0;
    const base = { entityIds: [c, org], sourceId: 'wikidata-orgs', quality: 'community' as const, importance: sl >= 100 ? 6 : 4, url: wdUrl(m.org) };
    if (m.end) items.push({ ...base, key: `left:${m.iso3}:${m.org}:${m.end}`, kind: 'igo', title: `${getEntity(c)?.name} left ${getEntity(org)?.name} (${m.end}, per Wikidata)`, at: `${m.end.length === 4 ? `${m.end}-01-01` : m.end}T00:00:00Z` });
    else items.push({ ...base, key: `joined:${m.iso3}:${m.org}`, kind: 'igo', title: `${getEntity(c)?.name} is a member of ${getEntity(org)?.name}${m.start ? ` (since ${m.start})` : ''} — newly recorded on Wikidata`, at: new Date().toISOString() });
  }
  emitNew('wikidata-memberships', items, 60000);
  const hqRels: NewRel[] = [];
  for (const o of d.orgs) { const city = entityByQid(o.hq); const org = idOf.get(o.qid); if (city && org) hqRels.push({ from: org, to: city, type: 'headquartered_in', sourceId: 'wikidata-orgs' }); }
  setLiveRels('wikidata-org-seats', hqRels);
  const leadRels: NewRel[] = [];
  for (const h of d.leaders) {
    const org = idOf.get(h.of); if (!org) continue;
    const pid = personFor(h, `${h.role} of ${getEntity(org)?.name} (from Wikidata).`, retrievedAt);
    leadRels.push({ from: pid, to: org, type: 'leads', role: `${h.role}, ${getEntity(org)?.name}`, validFrom: h.start, sourceId: 'wikidata-orgs' });
  }
  setLiveRels('wikidata-org-leaders', leadRels);
  return { organizations: d.orgs.length, created, memberships: rels.length, newLinks: added, leaders: leadRels.length };
}
registerConnector({
  id: 'wikidata-organizations', label: 'Wikidata — organizations & memberships', sourceIds: ['wikidata-orgs'], everyHours: 48, delaySec: 40,
  provides: 'Every international organization with three or more member countries, who belongs (with join and leave dates), where it sits and who leads it — checked against the hand-entered member lists',
  run: async () => { const r = await organizationsData(); const a = applyOrganizations(r.data, r.fetchedAt); return { detail: `${a.organizations} organizations (${a.created} new), ${a.memberships} memberships, ${a.leaders} leaders`, fetchedAt: r.fetchedAt, stale: r.stale, counts: a }; },
});

// ───────────────────────── Central banks ─────────────────────────
export interface BankInfo { qid: string; label: string; iso3?: string; jurIso?: string; jurLabel?: string; sitelinks: number; website?: string; inception?: string; desc?: string; }
export function parseBanks(rows: any[]): BankInfo[] {
  const by = new Map<string, BankInfo>();
  for (const r of rows) {
    const qid = qidOf(val(r, 'bank')); const label = val(r, 'label'); if (!qid || !label) continue;
    const b = by.get(qid) || by.set(qid, { qid, label, sitelinks: num(val(r, 'sl')) || 0 }).get(qid)!;
    b.iso3 ||= val(r, 'iso3'); b.jurIso ||= val(r, 'jurIso'); b.jurLabel ||= val(r, 'jurLabel'); b.website ||= val(r, 'website'); b.inception ||= wdDate(val(r, 'inception')); b.desc ||= val(r, 'desc');
  }
  return [...by.values()];
}
/** Where a central bank's policy applies: its jurisdiction if that is a country, the EU for the euro area, else its country. */
export function bankPlace(b: BankInfo) {
  if (b.jurIso && byIso3.has(b.jurIso)) return byIso3.get(b.jurIso)!;
  if (b.jurLabel && /euro ?(zone|area)|european union/i.test(b.jurLabel)) return 'igo:eu';
  return b.iso3 ? byIso3.get(b.iso3) : undefined;
}
async function banksData() {
  return cached('wd:central-banks:v1', 3 * 86400, async () => {
    const banks = parseBanks(await sparql(`SELECT ?bank ?label ?iso3 ?jurIso ?jurLabel ?sl ?website ?inception ?desc WHERE { ?bank wdt:P31 wd:Q66344 ; wikibase:sitelinks ?sl . FILTER NOT EXISTS { ?bank wdt:P576 [] } ?bank rdfs:label ?label FILTER(LANG(?label)="en") OPTIONAL { ?bank wdt:P17 ?c . ?c wdt:P298 ?iso3 } OPTIONAL { ?bank wdt:P1001 ?jur . OPTIONAL { ?jur wdt:P298 ?jurIso } OPTIONAL { ?jur rdfs:label ?jurLabel FILTER(LANG(?jurLabel)="en") } } OPTIONAL { ?bank wdt:P856 ?website } OPTIONAL { ?bank wdt:P571 ?inception } OPTIONAL { ?bank schema:description ?desc FILTER(LANG(?desc)="en") } }`));
    const heads = parseHolders(await batched(banks.map((b) => b.qid), 150, (values) => `SELECT ?bank ?person ?name ?role ?start WHERE { VALUES ?bank { ${values} } { ?bank p:P488 ?st . ?st ps:P488 ?person . BIND("Governor" AS ?role) } UNION { ?bank p:P1037 ?st . ?st ps:P1037 ?person . BIND("Governor" AS ?role) } FILTER NOT EXISTS { ?st pq:P582 [] } OPTIONAL { ?st pq:P580 ?start } ?person wdt:P31 wd:Q5 ; rdfs:label ?name FILTER(LANG(?name)="en") }`), 'bank');
    return { banks, heads };
  });
}
export function applyBanks(d: { banks: BankInfo[]; heads: Holder[] }, retrievedAt: string) {
  // One central bank per country or currency area: the best-known (e.g. the Federal Reserve System, not its regional banks).
  const best = new Map<string, BankInfo>();
  for (const b of d.banks) { const place = bankPlace(b); if (!place) continue; const cur = best.get(place); if (!cur || b.sitelinks > cur.sitelinks) best.set(place, b); }
  const rels: NewRel[] = []; const idOf = new Map<string, string>();
  for (const [place, b] of best) {
    const id = entityByQid(b.qid) || `institution:wd-${b.qid.toLowerCase()}`;
    upsertEntity({ id, type: 'institution', name: b.label, depth: getEntity(id)?.depth || 'baseline', summary: `${cap(b.desc) || 'Central bank'} — central bank of ${getEntity(place)?.name}${place === 'igo:eu' ? ' (euro area)' : ''}.`,
      facts: [b.inception && fact('Founded', b.inception, 'wikidata-institutions', retrievedAt), b.website && fact('Website', b.website, 'wikidata-institutions', retrievedAt)].filter(Boolean) as Fact[],
      attrs: { wikidata: b.qid, sitelinks: b.sitelinks, kind: 'central bank', website: b.website, origin: 'wikidata' }, sources: ['wikidata-institutions'] } as Entity);
    rels.push({ from: id, to: place, type: 'central_bank_of', sourceId: 'wikidata-institutions', retrievedAt });
    idOf.set(b.qid, id);
  }
  setLiveRels('wikidata-central-banks', rels);
  const leadRels: NewRel[] = [];
  for (const h of d.heads) {
    const bank = idOf.get(h.of); if (!bank) continue;
    const pid = personFor(h, `${h.role} of ${getEntity(bank)?.name} (from Wikidata).`, retrievedAt);
    leadRels.push({ from: pid, to: bank, type: 'leads', role: `${h.role}, ${getEntity(bank)?.name}`, validFrom: h.start, sourceId: 'wikidata-institutions' });
  }
  setLiveRels('wikidata-central-bank-heads', leadRels);
  emitNew('central-bank-heads', d.heads.filter((h) => idOf.has(h.of)).map((h): Change => ({ key: `governor:${h.of}:${h.person}`, kind: 'leader', entityIds: [idOf.get(h.of)!, entityByQid(h.person) || ''].filter(Boolean),
    title: `${getEntity(idOf.get(h.of)!)?.name}: ${h.name} is ${h.role.toLowerCase()}${h.start ? ` (since ${h.start})` : ''}`, sourceId: 'wikidata-institutions', quality: 'community', importance: 6, at: new Date().toISOString(), url: wdUrl(h.person) })));
  return { banks: best.size, heads: leadRels.length };
}
/** The central bank of a country or currency area, if loaded. */
export function centralBankOf(placeId: string) { return relsOfType(placeId, 'central_bank_of', 'in')[0]?.from; }
registerConnector({
  id: 'wikidata-central-banks', label: 'Wikidata — central banks', sourceIds: ['wikidata-institutions'], everyHours: 72, delaySec: 55,
  provides: 'The central bank of every country (the ECB for the euro area) and its current governor',
  run: async () => { const r = await banksData(); const a = applyBanks(r.data, r.fetchedAt); return { detail: `${a.banks} central banks, ${a.heads} governors`, fetchedAt: r.fetchedAt, stale: r.stale, counts: a }; },
});

// ───────────────────────── Capitals and big cities ─────────────────────────
export interface CityInfo { qid: string; label: string; iso3: string; pop?: number; coord?: [number, number]; capitalOf: string[]; sitelinks: number; }
export function parseCities(rows: any[]): CityInfo[] {
  const by = new Map<string, CityInfo>();
  for (const r of rows) {
    const qid = qidOf(val(r, 'city')); const label = val(r, 'label'); const iso3 = val(r, 'iso3'); if (!qid || !label || !iso3) continue;
    const c = by.get(qid) || by.set(qid, { qid, label, iso3, capitalOf: [], sitelinks: num(val(r, 'sl')) || 0 }).get(qid)!;
    const pop = num(val(r, 'pop')); if (pop && (!c.pop || pop > c.pop)) c.pop = pop;
    c.coord ||= point(val(r, 'coord'));
    const capOf = val(r, 'capitalOf'); if (capOf && !c.capitalOf.includes(capOf)) c.capitalOf.push(capOf);
  }
  return [...by.values()].filter((c) => c.coord);
}
async function citiesData() {
  return cached('wd:cities:v1', 7 * 86400, async () => parseCities([
    ...(await sparql(`SELECT ?city ?label ?iso3 ?pop ?coord ?capitalOf ?sl WHERE { ?country wdt:P298 ?capitalOf ; wdt:P36 ?city . ?city wdt:P625 ?coord ; wikibase:sitelinks ?sl . BIND(?capitalOf AS ?iso3) OPTIONAL { ?city wdt:P1082 ?pop } ?city rdfs:label ?label FILTER(LANG(?label)="en") }`)),
    ...(await sparql(`SELECT ?city ?label ?iso3 ?pop ?coord ?sl WHERE { hint:Query hint:optimizer "None" . ?city wdt:P1082 ?pop . FILTER(?pop >= 1000000) ?city wdt:P625 ?coord ; wdt:P17 ?country ; wikibase:sitelinks ?sl . ?country wdt:P298 ?iso3 . FILTER NOT EXISTS { ?city wdt:P298 [] } ?city wdt:P31/wdt:P279* wd:Q486972 . ?city rdfs:label ?label FILTER(LANG(?label)="en") }`)),
  ]));
}
const tierFor = (c: CityInfo) => (c.pop && c.pop >= 10e6 ? 1 : c.capitalOf.length || (c.pop && c.pop >= 3e6) ? 2 : 3);
export function applyCities(cities: CityInfo[], retrievedAt: string) {
  let created = 0, matched = 0; const rels: NewRel[] = [];
  // Existing cities by country and name (US cities sit under their state, so the country is looked up).
  const byName = new Map<string, string>();
  for (const e of listByType('city')) { const c = countryOf(e.id); for (const n of [e.name, ...(e.aliases || [])]) byName.set(`${c}|${normName(n)}`, e.id); }
  for (const c of cities) {
    const country = byIso3.get(c.iso3); if (!country) continue;
    const existing = entityByQid(c.qid) || byName.get(`${country}|${normName(c.label)}`);
    const attrs = { wikidata: c.qid, sitelinks: c.sitelinks, ...(c.pop ? { population: c.pop } : {}), ...(c.capitalOf.length ? { capital: true } : {}) };
    if (existing) { const e = getEntity(existing)!; enrich(existing, { ...attrs, tier: e.attrs?.tier ?? tierFor(c) }, e.coords ? {} : { coords: c.coord }); matched++; }
    else {
      upsertEntity({ id: `city:wd-${c.qid.toLowerCase()}`, type: 'city', name: c.label, depth: 'baseline', parentId: country, coords: c.coord,
        summary: `${c.capitalOf.length ? `Capital of ${c.capitalOf.map((i) => getEntity(byIso3.get(i) || '')?.name).filter(Boolean).join(' and ')}` : `City in ${getEntity(country)?.name}`}${c.pop ? `; population ${c.pop.toLocaleString('en-US')} (Wikidata)` : ''}.`,
        facts: c.pop ? [fact('Population', c.pop, 'wikidata-cities', retrievedAt)] : [], attrs: { ...attrs, tier: tierFor(c), origin: 'wikidata' }, sources: ['wikidata-cities'] } as Entity);
      created++;
    }
    const id = existing || `city:wd-${c.qid.toLowerCase()}`;
    rels.push({ from: id, to: country, type: 'located_in', sourceId: 'wikidata-cities' });
    for (const iso of c.capitalOf) { const cc = byIso3.get(iso); if (cc) rels.push({ from: id, to: cc, type: 'capital_of', sourceId: 'wikidata-cities' }); }
  }
  setLiveRels('wikidata-cities', rels);
  return { cities: cities.length, created, matched };
}
registerConnector({
  id: 'wikidata-cities', label: 'Wikidata — capitals & big cities', sourceIds: ['wikidata-cities'], everyHours: 168, delaySec: 25,
  provides: 'Every national capital and every city of a million people or more, with population and location, added to the map',
  run: async () => { const r = await citiesData(); const a = applyCities(r.data, r.fetchedAt); return { detail: `${a.cities} cities (${a.created} new, ${a.matched} matched)`, fetchedAt: r.fetchedAt, stale: r.stale, counts: a }; },
});

// ───────────────────────── Listed companies ─────────────────────────
// Yahoo Finance symbol suffix for each exchange, by ISO 10383 market identifier code (Yahoo's own convention).
const YAHOO_SUFFIX: Record<string, string> = {
  XNYS: '', XNAS: '', ARCX: '', BATS: '', XASE: '', XLON: '.L', XTKS: '.T', XHKG: '.HK', XPAR: '.PA', XAMS: '.AS', XBRU: '.BR', XLIS: '.LS', XETR: '.DE', XFRA: '.F', XSWX: '.SW', XVTX: '.SW',
  XTSE: '.TO', XASX: '.AX', XKRX: '.KS', XKOS: '.KQ', XNSE: '.NS', XBOM: '.BO', XSHG: '.SS', XSHE: '.SZ', XTAI: '.TW', XMIL: '.MI', XMAD: '.MC', XSTO: '.ST', XOSL: '.OL', XCSE: '.CO',
  XHEL: '.HE', BVMF: '.SA', XJSE: '.JO', XSAU: '.SR', XSES: '.SI', XKLS: '.KL', XBKK: '.BK', XIDX: '.JK', XMEX: '.MX', XDUB: '.IR', XWBO: '.VI', XIST: '.IS', XTAE: '.TA', XBUE: '.BA',
  XSGO: '.SN', XWAR: '.WA', XPRA: '.PR', XBUD: '.BD', XATH: '.AT', XNZE: '.NZ', MISX: '.ME', XICE: '.IC', XPHS: '.PS', XCAI: '.CA', DSMD: '.QA', XADS: '.AD', XDFM: '.AE',
};
export function yahooSymbol(ticker: string, mic?: string) {
  if (!mic || !(mic in YAHOO_SUFFIX)) return undefined;
  const t = ticker.trim().replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(t)) return undefined;
  if (mic === 'XHKG') return `${t.replace(/^0+/, '').padStart(4, '0')}.HK`;
  return `${YAHOO_SUFFIX[mic] === '' ? t.replace(/\./g, '-') : t}${YAHOO_SUFFIX[mic]}`;
}
export interface Listing { ticker: string; mic?: string; exchange?: string; }
export interface CompanyInfo { qid: string; label: string; iso3?: string; sitelinks: number; listings: Listing[]; desc?: string; founded?: string; website?: string; employees?: number; hq?: string; hqLabel?: string; hqIso?: string; industries: { qid: string; label: string }[]; parent?: string; ceo?: { qid: string; name: string }; chair?: { qid: string; name: string }; }
export function parseCompanies(rows: any[]): CompanyInfo[] {
  const by = new Map<string, CompanyInfo>();
  for (const r of rows) {
    const qid = qidOf(val(r, 'co')); const label = val(r, 'label'); if (!qid || !label) continue;
    const c = by.get(qid) || by.set(qid, { qid, label, sitelinks: num(val(r, 'sl')) || 0, listings: [], industries: [] }).get(qid)!;
    c.iso3 ||= val(r, 'iso3');
    const ticker = val(r, 'ticker'); const mic = val(r, 'mic');
    if (ticker && !c.listings.some((l) => l.ticker === ticker && l.mic === mic)) c.listings.push({ ticker, mic, exchange: val(r, 'exLabel') });
  }
  return [...by.values()];
}
export function parseCompanyDetails(rows: any[], into: Map<string, CompanyInfo>) {
  for (const r of rows) {
    const c = into.get(qidOf(val(r, 'co')) || ''); if (!c) continue;
    c.desc ||= val(r, 'desc'); c.founded ||= wdDate(val(r, 'founded')); c.website ||= val(r, 'website');
    const emp = num(val(r, 'employees')); if (emp && (!c.employees || emp > c.employees)) c.employees = emp;
    c.hq ||= qidOf(val(r, 'hq')); c.hqLabel ||= val(r, 'hqLabel'); c.hqIso ||= val(r, 'hqIso');
    const ind = qidOf(val(r, 'industry')); const indL = val(r, 'industryLabel'); if (ind && indL && !c.industries.some((i) => i.qid === ind)) c.industries.push({ qid: ind, label: indL });
    c.parent ||= qidOf(val(r, 'parent'));
    const ceo = qidOf(val(r, 'ceo')); if (ceo && val(r, 'ceoLabel')) c.ceo ||= { qid: ceo, name: val(r, 'ceoLabel')! };
    const chair = qidOf(val(r, 'chair')); if (chair && val(r, 'chairLabel')) c.chair ||= { qid: chair, name: val(r, 'chairLabel')! };
  }
}
const MIN_SITELINKS = Math.max(5, Number(process.env.WIKIDATA_COMPANY_MIN_SITELINKS) || 25);
async function companiesData() {
  return cached(`wd:companies:${MIN_SITELINKS}:v1`, 3 * 86400, async () => {
    const companies = parseCompanies(await sparql(`SELECT ?co ?label ?ticker ?mic ?exLabel ?iso3 ?sl WHERE { ?co p:P414 ?st . ?st ps:P414 ?ex ; pq:P249 ?ticker . FILTER NOT EXISTS { ?st pq:P582 [] } ?co wikibase:sitelinks ?sl . FILTER(?sl >= ${MIN_SITELINKS}) FILTER NOT EXISTS { ?co wdt:P576 [] } OPTIONAL { ?ex wdt:P2283 ?mic } OPTIONAL { ?ex rdfs:label ?exLabel FILTER(LANG(?exLabel)="en") } OPTIONAL { ?co wdt:P17 ?c . ?c wdt:P298 ?iso3 } ?co rdfs:label ?label FILTER(LANG(?label)="en") }`));
    const map = new Map(companies.map((c) => [c.qid, c]));
    parseCompanyDetails(await batched([...map.keys()], 80, (values) => `SELECT ?co ?desc ?founded ?website ?employees ?hq ?hqLabel ?hqIso ?industry ?industryLabel ?parent ?ceo ?ceoLabel ?chair ?chairLabel WHERE { VALUES ?co { ${values} } OPTIONAL { ?co schema:description ?desc FILTER(LANG(?desc)="en") } OPTIONAL { ?co wdt:P571 ?founded } OPTIONAL { ?co wdt:P856 ?website } OPTIONAL { ?co wdt:P1128 ?employees } OPTIONAL { ?co wdt:P159 ?hq . OPTIONAL { ?hq rdfs:label ?hqLabel FILTER(LANG(?hqLabel)="en") } OPTIONAL { ?hq wdt:P17 ?hqc . ?hqc wdt:P298 ?hqIso } } OPTIONAL { ?co wdt:P452 ?industry . ?industry rdfs:label ?industryLabel FILTER(LANG(?industryLabel)="en") } OPTIONAL { ?co wdt:P749 ?parent } OPTIONAL { ?co p:P169 ?cs . ?cs ps:P169 ?ceo . FILTER NOT EXISTS { ?cs pq:P582 [] } ?ceo rdfs:label ?ceoLabel FILTER(LANG(?ceoLabel)="en") } OPTIONAL { ?co p:P488 ?chs . ?chs ps:P488 ?chair . FILTER NOT EXISTS { ?chs pq:P582 [] } ?chair rdfs:label ?chairLabel FILTER(LANG(?chairLabel)="en") } }`), map);
    return [...map.values()];
  });
}
const LEGAL = /\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|ag|se|sa|nv|spa|s\.?p\.?a|ab|asa|oyj|holdings?|group|n\.?v\.?|s\.?a\.?|k\.?k\.?|co\.?,? ltd)\b\.?/gi;
export const companyKey = (name: string) => normName(name.replace(LEGAL, ' '));
/** Primary listing: one on an exchange in the company's own country, else the first with a known symbol. */
export function primaryListing(c: CompanyInfo) {
  const withSym = c.listings.map((l) => ({ ...l, symbol: yahooSymbol(l.ticker, l.mic) })).filter((l) => l.symbol);
  const homeSuffix = (iso3?: string) => withSym.find((l) => iso3 && l.mic && MIC_COUNTRY[l.mic] === iso3);
  return homeSuffix(c.iso3) || withSym.find((l) => YAHOO_SUFFIX[l.mic!] === '') || withSym[0];
}
const MIC_COUNTRY: Record<string, string> = { XNYS: 'USA', XNAS: 'USA', ARCX: 'USA', BATS: 'USA', XASE: 'USA', XLON: 'GBR', XTKS: 'JPN', XHKG: 'HKG', XPAR: 'FRA', XAMS: 'NLD', XBRU: 'BEL', XLIS: 'PRT', XETR: 'DEU', XFRA: 'DEU', XSWX: 'CHE', XVTX: 'CHE', XTSE: 'CAN', XASX: 'AUS', XKRX: 'KOR', XKOS: 'KOR', XNSE: 'IND', XBOM: 'IND', XSHG: 'CHN', XSHE: 'CHN', XTAI: 'TWN', XMIL: 'ITA', XMAD: 'ESP', XSTO: 'SWE', XOSL: 'NOR', XCSE: 'DNK', XHEL: 'FIN', BVMF: 'BRA', XJSE: 'ZAF', XSAU: 'SAU', XSES: 'SGP', XKLS: 'MYS', XBKK: 'THA', XIDX: 'IDN', XMEX: 'MEX', XDUB: 'IRL', XWBO: 'AUT', XIST: 'TUR', XTAE: 'ISR', XBUE: 'ARG', XSGO: 'CHL', XWAR: 'POL', XPRA: 'CZE', XBUD: 'HUN', XATH: 'GRC', XNZE: 'NZL', MISX: 'RUS', XICE: 'ISL', XPHS: 'PHL', XCAI: 'EGY', DSMD: 'QAT', XADS: 'ARE', XDFM: 'ARE' };
export function applyCompanies(list: CompanyInfo[], retrievedAt: string) {
  const curated = listByType('company');
  const bySymbol = new Map<string, string>(); const byKey = new Map<string, string>();
  for (const e of curated) {
    for (const s of [e.attrs?.quoteSymbol, e.attrs?.secTicker].filter(Boolean)) bySymbol.set(String(s).toUpperCase(), e.id);
    for (const n of [e.name, ...(e.aliases || [])]) { const k = companyKey(n); if (k.length > 2) byKey.set(k, e.id); }
  }
  // Industries used by three or more companies become nodes (matched to hand-entered industries by name).
  const indCount = new Map<string, { label: string; n: number }>();
  for (const c of list) for (const i of c.industries) { const x = indCount.get(i.qid) || indCount.set(i.qid, { label: i.label, n: 0 }).get(i.qid)!; x.n++; }
  const industryId = new Map<string, string>();
  for (const [qid, { label, n }] of indCount) {
    if (n < 3) continue;
    const match = entityByQid(qid) || listByType('industry').find((e) => [e.name, ...(e.aliases || [])].some((x) => normName(x) === normName(label)))?.id;
    const id = match || `industry:wd-${qid.toLowerCase()}`;
    if (match) enrich(match, { wikidata: qid });
    else upsertEntity({ id, type: 'industry', name: cap(label)!, depth: 'baseline', summary: `Industry (from Wikidata), with ${n} listed companies loaded.`, attrs: { wikidata: qid, origin: 'wikidata' }, sources: ['wikidata-companies'] } as Entity);
    industryId.set(qid, id);
  }
  const rels: NewRel[] = []; const idOf = new Map<string, string>(); let created = 0, matched = 0;
  const notes: string[] = [];
  for (const c of list) {
    const pl = primaryListing(c);
    const existing = entityByQid(c.qid) || (pl?.symbol && bySymbol.get(pl.symbol.toUpperCase())) || c.listings.map((l) => bySymbol.get(l.ticker.toUpperCase())).find(Boolean) || byKey.get(companyKey(c.label));
    const country = (c.iso3 && byIso3.get(c.iso3)) || (c.hqIso && byIso3.get(c.hqIso)) || undefined;
    const listings = c.listings.map((l) => `${l.ticker}${l.exchange ? ` (${l.exchange})` : ''}`);
    const facts = [c.founded && fact('Founded', c.founded, 'wikidata-companies', retrievedAt), c.employees && fact('Employees', c.employees, 'wikidata-companies', retrievedAt), c.hqLabel && fact('Headquarters', c.hqLabel, 'wikidata-companies', retrievedAt),
      listings.length && fact('Listed as', listings.slice(0, 4).join(', '), 'wikidata-companies', retrievedAt), c.website && fact('Website', c.website, 'wikidata-companies', retrievedAt)].filter(Boolean) as Fact[];
    let id: string;
    if (existing) {
      id = existing; matched++;
      const e = getEntity(existing)!;
      enrich(existing, { wikidata: c.qid, sitelinks: c.sitelinks, ...(!e.attrs?.quoteSymbol && pl?.symbol ? { quoteSymbol: pl.symbol, public: true } : {}) }, e.depth === 'curated' ? {} : { facts });
    } else {
      id = `company:wd-${c.qid.toLowerCase()}`; created++;
      upsertEntity({ id, type: 'company', name: c.label, depth: 'baseline', summary: `${cap(c.desc) || 'Listed company'}${country ? ` (${getEntity(country)?.name})` : ''}.`, facts,
        attrs: { wikidata: c.qid, sitelinks: c.sitelinks, public: !!pl?.symbol, quoteSymbol: pl?.symbol, exchange: pl?.exchange, tickers: listings, hqCountry: country, employees: c.employees, website: c.website, founded: c.founded?.slice(0, 4), origin: 'wikidata',
          ...(pl && pl.mic && YAHOO_SUFFIX[pl.mic] === '' ? { secTicker: pl.ticker.toUpperCase() } : {}) },
        aliases: [...new Set(c.listings.map((l) => l.ticker))].slice(0, 4), sources: ['wikidata-companies'] } as Entity);
    }
    idOf.set(c.qid, id);
    const hqCity = entityByQid(c.hq);
    if (hqCity) rels.push({ from: id, to: hqCity, type: 'headquartered_in', sourceId: 'wikidata-companies' });
    else if (country) rels.push({ from: id, to: country, type: 'headquartered_in', sourceId: 'wikidata-companies' });
    for (const i of c.industries) { const ind = industryId.get(i.qid); if (ind) rels.push({ from: id, to: ind, type: 'in_industry', sourceId: 'wikidata-companies' }); }
  }
  // Parents, and executives (a hand-checked company's leader is compared, not replaced).
  const execRels: NewRel[] = [];
  for (const c of list) {
    const id = idOf.get(c.qid)!;
    const parent = c.parent && (idOf.get(c.parent) || entityByQid(c.parent));
    if (parent && parent !== id) rels.push({ from: id, to: parent, type: 'subsidiary_of', sourceId: 'wikidata-companies' });
    const e = getEntity(id)!;
    for (const [who, role] of [[c.ceo, 'Chief executive officer'], [c.chair, 'Chair']] as const) {
      if (!who) continue;
      const curatedLead = relsOfType(id, 'leads', 'in').filter((r) => !r.origin && (role === 'Chair' ? /chair/i.test(r.role || '') : /chief executive|ceo/i.test(r.role || '')) && !r.validTo);
      if (curatedLead.length && e.depth === 'curated') {
        if (!curatedLead.some((r) => [getEntity(r.from)?.name, ...(getEntity(r.from)?.aliases || [])].some((n) => n && normName(n) === normName(who.name)))) notes.push(`${e.name}: Wikidata lists ${who.name} as ${role.toLowerCase()}; the hand-checked record lists ${curatedLead.map((r) => getEntity(r.from)?.name).join(', ')}.`);
        continue;
      }
      const pid = personFor({ person: who.qid, name: who.name }, `${role} of ${e.name} (from Wikidata).`, retrievedAt);
      execRels.push({ from: pid, to: id, type: 'leads', role: `${role}, ${e.name}`, sourceId: 'wikidata-companies' });
    }
  }
  setLiveRels('wikidata-companies', rels);
  setLiveRels('wikidata-executives', execRels);
  emitNew('company-ceos', list.filter((c) => c.ceo && idOf.has(c.qid)).map((c): Change => ({ key: `ceo:${c.qid}:${c.ceo!.qid}`, kind: 'leader', entityIds: [idOf.get(c.qid)!, entityByQid(c.ceo!.qid) || ''].filter(Boolean),
    title: `${getEntity(idOf.get(c.qid)!)?.name}: ${c.ceo!.name} is chief executive (per Wikidata)`, sourceId: 'wikidata-companies', quality: 'community', importance: c.sitelinks >= 60 ? 6 : 4, at: new Date().toISOString(), url: wdUrl(c.qid) })), 60000);
  for (const n of notes) { const name = n.split(':')[0]; const e = listByType('company').find((x) => x.name === name); if (e) enrich(e.id, { leaderNotes: [n] }); }
  return { companies: list.length, created, matched, industries: industryId.size, executives: execRels.length, disagreements: notes.length };
}
registerConnector({
  id: 'wikidata-companies', label: 'Wikidata — listed companies', sourceIds: ['wikidata-companies'], everyHours: 72, delaySec: 75,
  provides: `Listed companies known in ${MIN_SITELINKS}+ Wikipedia languages: stock tickers (→ live quotes), head office, industry, parent company, chief executive and chair — hand-checked companies are compared, not overwritten`,
  run: async () => { const r = await companiesData(); const a = applyCompanies(r.data, r.fetchedAt); return { detail: `${a.companies} companies (${a.created} new, ${a.matched} matched), ${a.industries} industries, ${a.executives} executives${a.disagreements ? `, ${a.disagreements} leader disagreements` : ''}`, fetchedAt: r.fetchedAt, stale: r.stale, counts: a }; },
});


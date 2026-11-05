// The public knowledge graph: baseline geography for every country, US state and US
// county, overlaid with the curated dataset. Bidirectional relationship index + search.
import { createRequire } from 'node:module';
import * as topojson from 'topojson-client';
import type { Entity, EntityStub, RelType, Relationship, RelView, SearchHit, Source } from '../shared/types.js';
import { REL_LABELS } from '../shared/types.js';
import { CURATED_ENTITIES, CURATED_RELS, SOURCES, US_STATES } from './data/curated.js';

const require = createRequire(import.meta.url);
const worldCountries: any[] = require('world-countries');
const usAtlas: any = require('us-atlas/counties-10m.json');

export const entities = new Map<string, Entity>();
export const sources = new Map<string, Source>(SOURCES.map((s) => [s.id, s]));
const relsOut = new Map<string, Relationship[]>();
const relsIn = new Map<string, Relationship[]>();
const childrenOf = new Map<string, string[]>();
export const byIso3 = new Map<string, string>();
export const byCcn3 = new Map<string, string>();

let relSeq = 0;
function addRel(r: Omit<Relationship, 'id'>) {
  const rel: Relationship = { ...r, id: `r${++relSeq}` };
  (relsOut.get(rel.from) || relsOut.set(rel.from, []).get(rel.from)!).push(rel);
  (relsIn.get(rel.to) || relsIn.set(rel.to, []).get(rel.to)!).push(rel);
}

// Indexes kept in step with `entities`: ids by type, and (lazily) person names.
const byType = new Map<string, Set<string>>();
let personIndex: Map<string, string> | null = null;
function put(e: Entity) {
  const prev = entities.get(e.id);
  if (!prev || prev.type !== e.type) {
    if (prev) byType.get(prev.type)?.delete(e.id);
    (byType.get(e.type) || byType.set(e.type, new Set()).get(e.type)!).add(e.id);
  }
  if (e.type === 'person' || prev?.type === 'person') personIndex = null;
  if (prev) {
    // Curated data overrides baseline; facts and aliases are merged.
    entities.set(e.id, {
      ...prev, ...e,
      aliases: [...new Set([...(prev.aliases || []), ...(e.aliases || [])])],
      facts: [...(e.facts || []), ...(prev.facts || []).filter((f) => !(e.facts || []).some((g) => g.label === f.label))],
      attrs: { ...(prev.attrs || {}), ...(e.attrs || {}) },
      timeline: [...(prev.timeline || []), ...(e.timeline || [])],
      depth: e.depth || prev.depth,
    });
  } else entities.set(e.id, e);
}

function bboxOf(geom: any): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c: any) => {
    if (typeof c[0] === 'number') { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); }
    else c.forEach(walk);
  };
  walk(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

// ───────────── Baseline: regions & countries (world-countries, ODbL) ─────────────
const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Antarctic'];
const REGION_CENTER: Record<string, [number, number]> = { Africa: [20, 5], Americas: [-80, 15], Asia: [95, 35], Europe: [15, 52], Oceania: [140, -20], Antarctic: [0, -80] };
for (const r of REGIONS) {
  put({ id: `region:${r.toLowerCase()}`, type: 'region', name: r === 'Antarctic' ? 'Antarctica' : r, depth: 'baseline', coords: REGION_CENTER[r], summary: `Continental region (UN geoscheme grouping as used by the mledoze/countries dataset).`, sources: ['world-countries'] });
}

for (const c of worldCountries) {
  const id = `country:${c.cca3}`;
  byIso3.set(c.cca3, id);
  if (c.ccn3) byCcn3.set(c.ccn3, id);
  const currencies = Object.entries(c.currencies || {}).map(([code, v]: any) => `${v.name} (${code})`).join(', ');
  const languages = Object.values(c.languages || {}).join(', ');
  put({
    id, type: 'country', name: c.name.common, depth: 'baseline',
    aliases: [c.name.official, c.cca2, c.cca3, ...(c.altSpellings || [])].filter((a: string) => a && a !== c.name.common),
    iso3: c.cca3, iso2: c.cca2, ccn3: c.ccn3, flag: c.flag,
    coords: [c.latlng[1], c.latlng[0]],
    parentId: `region:${String(c.region).toLowerCase()}`,
    facts: [
      c.capital?.length ? { label: 'Capital', value: c.capital.join(', '), sourceId: 'world-countries', quality: 'official' } : null,
      { label: 'Area', value: c.area, unit: 'km²', sourceId: 'world-countries', quality: 'official' },
      languages ? { label: 'Languages', value: languages, sourceId: 'world-countries', quality: 'official' } : null,
      currencies ? { label: 'Currency', value: currencies, sourceId: 'world-countries', quality: 'official' } : null,
      { label: 'Subregion', value: c.subregion || c.region, sourceId: 'world-countries', quality: 'official' },
      { label: 'Status', value: c.independent ? (c.unMember ? 'Sovereign state, UN member' : 'Sovereign state (not a UN member)') : `Territory / non-sovereign (${c.status})`, sourceId: 'world-countries', quality: 'official' },
    ].filter(Boolean) as any,
    attrs: { region: c.region, subregion: c.subregion, borders: c.borders || [], landlocked: c.landlocked, unMember: c.unMember, independent: c.independent, timezones: c.timezones,
      currencies: Object.entries(c.currencies || {}).map(([code, v]: any) => ({ code, name: v.name, symbol: v.symbol })) },
    sources: ['world-countries'],
  });
}

// ───────────── Baseline: US states & counties (Census via us-atlas) ─────────────
const stateGeoms: any[] = (topojson.feature(usAtlas, usAtlas.objects.states) as any).features;
const fipsToState = new Map<string, string>();
for (const f of stateGeoms) {
  const meta = US_STATES[f.id];
  if (!meta) continue;
  const id = `state:US-${meta.postal}`;
  fipsToState.set(f.id, id);
  const bbox = bboxOf(f.geometry);
  put({
    id, type: 'state', name: f.properties.name, depth: 'baseline', parentId: 'country:USA', fips: f.id,
    aliases: [meta.postal, `${f.properties.name} state`],
    coords: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    facts: [
      meta.capital ? { label: 'Capital', value: meta.capital, sourceId: 'us-census', quality: 'official' } : null,
      { label: 'FIPS code', value: f.id, sourceId: 'us-census', quality: 'official' },
    ].filter(Boolean) as any,
    attrs: { bbox, postal: meta.postal },
    sources: ['us-atlas'],
  });
}
const countyGeoms: any[] = (topojson.feature(usAtlas, usAtlas.objects.counties) as any).features;
for (const f of countyGeoms) {
  const stateId = fipsToState.get(String(f.id).slice(0, 2));
  if (!stateId) continue;
  const st = String(f.id).slice(0, 2);
  const raw = f.properties.name as string;
  const suffix = st === '22' ? ' Parish' : st === '02' || /city$/i.test(raw) ? '' : ' County';
  const bbox = bboxOf(f.geometry);
  put({
    id: `county:${f.id}`, type: 'county', name: `${raw}${suffix}`, depth: 'baseline', parentId: stateId, fips: f.id,
    coords: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], attrs: { bbox }, sources: ['us-atlas'],
    facts: [{ label: 'FIPS code', value: f.id, sourceId: 'us-census', quality: 'official' }],
  });
}

// ───────────── Curated overlay ─────────────
for (const e of CURATED_ENTITIES) put({ depth: 'curated', ...e } as Entity);

// Parent/children index
for (const e of entities.values()) {
  if (e.parentId) (childrenOf.get(e.parentId) || childrenOf.set(e.parentId, []).get(e.parentId)!).push(e.id);
}

// Baseline relationships
for (const e of entities.values()) {
  if (e.type === 'country') {
    if (e.parentId) addRel({ from: e.id, to: e.parentId, type: 'in_region', sourceId: 'world-countries' });
    for (const b of e.attrs?.borders || []) if (e.id < `country:${b}`) addRel({ from: e.id, to: `country:${b}`, type: 'borders', sourceId: 'world-countries' });
    if (e.attrs?.unMember) addRel({ from: e.id, to: 'igo:un', type: 'member_of', sourceId: 'un' });
  }
  if ((e.type === 'state' || e.type === 'city') && e.parentId) addRel({ from: e.id, to: e.parentId, type: 'located_in', sourceId: e.type === 'state' ? 'us-census' : 'natural-earth' });
}
/** Curated relationships whose endpoints do not exist (reported by the consistency audit). */
export const danglingRels: Omit<Relationship, 'id'>[] = [];
for (const r of CURATED_RELS) {
  if (!entities.has(r.from) || !entities.has(r.to)) { danglingRels.push(r); continue; }
  addRel(r);
}

// ───────────── Accessors ─────────────
export function getEntity(id: string) { return entities.get(id); }

export function stub(id: string): EntityStub | undefined {
  const e = entities.get(id);
  if (!e) return undefined;
  const parent = e.parentId ? entities.get(e.parentId) : undefined;
  return { id: e.id, type: e.type, name: e.name, flag: e.flag, summary: e.summary?.slice(0, 220), parentName: parent?.name };
}

export function children(id: string) { return (childrenOf.get(id) || []).map((c) => entities.get(c)!).filter(Boolean); }

export function relationshipsFor(id: string): RelView[] {
  const out: RelView[] = [];
  for (const rel of relsOut.get(id) || []) {
    const other = stub(rel.to);
    if (other) out.push({ rel, direction: 'out', label: REL_LABELS[rel.type].fwd, other });
  }
  for (const rel of relsIn.get(id) || []) {
    const other = stub(rel.from);
    if (other) out.push({ rel, direction: 'in', label: REL_LABELS[rel.type].inv, other });
  }
  return out;
}

export function relsOfType(id: string, type: RelType, direction: 'out' | 'in') {
  return (direction === 'out' ? relsOut.get(id) : relsIn.get(id))?.filter((r) => r.type === type) || [];
}

export function allRels(type?: RelType) {
  const out: Relationship[] = [];
  for (const list of relsOut.values()) for (const r of list) if (!type || r.type === type) out.push(r);
  return out;
}

/** Shortest relationship paths between two entities (breadth-first, max depth 3). */
export function connectionPath(a: string, b: string, maxDepth = 3): RelView[][] {
  const results: RelView[][] = [];
  const queue: { id: string; path: RelView[] }[] = [{ id: a, path: [] }];
  const seenDepth = new Map<string, number>([[a, 0]]);
  while (queue.length && results.length < 5) {
    const { id, path } = queue.shift()!;
    if (path.length >= maxDepth) continue;
    for (const rv of relationshipsFor(id)) {
      if (rv.rel.type === 'in_region' || (rv.rel.type === 'member_of' && rv.rel.to === 'igo:un')) continue; // too generic
      const next = rv.other.id;
      const p = [...path, rv];
      if (next === b) { results.push(p); continue; }
      const d = seenDepth.get(next);
      if (d !== undefined && d <= p.length) continue;
      seenDepth.set(next, p.length);
      queue.push({ id: next, path: p });
    }
  }
  return results;
}

// ───────────── Search ─────────────
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9&.+ ]+/g, ' ').replace(/\s+/g, ' ').trim();

interface IndexRow { id: string; terms: string[]; words: string[]; boost: number; }
const index: IndexRow[] = [];
const indexPos = new Map<string, number>();
const TYPE_BOOST: Record<string, number> = { country: 12, igo: 12, company: 10, commodity: 10, person: 9, party: 8, city: 7, state: 6, event: 6, industry: 5, region: 4, county: -6 };
function indexEntity(e: Entity) {
  const terms = [e.name, ...(e.aliases || [])].map(norm).filter(Boolean);
  const words = [...new Set(terms.flatMap((t) => t.split(' ')))];
  const boost = (TYPE_BOOST[e.type] || 0) + (e.depth === 'curated' ? 10 : 0) + (e.type === 'country' && !e.attrs?.independent ? -6 : 0)
    + (e.type === 'event' && e.attrs?.status === 'ongoing' ? 4 : 0);
  const row = { id: e.id, terms, words, boost };
  const at = indexPos.get(e.id);
  if (at === undefined) { indexPos.set(e.id, index.length); index.push(row); } else index[at] = row;
}
for (const e of entities.values()) indexEntity(e);

// ───────────── Live additions (Congress, Wikidata leaders, conflicts, elections) ─────────────
// Live loaders run after boot and on a timer. Their relationships carry an `origin` tag so a
// refresh replaces the previous batch instead of piling up duplicates.
export function upsertEntity(e: Entity) {
  const had = entities.get(e.id);
  put(e);
  const cur = entities.get(e.id)!;
  if (cur.parentId && (!had || had.parentId !== cur.parentId)) {
    const list = childrenOf.get(cur.parentId) || childrenOf.set(cur.parentId, []).get(cur.parentId)!;
    if (!list.includes(cur.id)) list.push(cur.id);
  }
  indexEntity(cur);
  return cur;
}

export function setLiveRels(origin: string, rels: Omit<Relationship, 'id' | 'origin'>[]) {
  for (const map of [relsOut, relsIn]) for (const [k, list] of map) {
    const keep = list.filter((r) => r.origin !== origin);
    if (keep.length !== list.length) map.set(k, keep);
  }
  let added = 0;
  for (const r of rels) {
    if (!entities.has(r.from) || !entities.has(r.to)) continue;
    addRel({ ...r, origin }); added++;
  }
  return added;
}

const countryNames = new Map<string, string>();
for (const e of entities.values()) if (e.type === 'country') for (const n of [e.name, ...(e.aliases || [])]) { const k = norm(n); if (k.length > 2 && !countryNames.has(k)) countryNames.set(k, e.id); }
for (const [n, iso] of Object.entries({
  'palestine': 'PSE', 'state of palestine': 'PSE', 'gaza strip': 'PSE', 'west bank': 'PSE', 'democratic republic of the congo': 'COD', 'dr congo': 'COD', 'republic of the congo': 'COG',
  'congo': 'COG', 'ivory coast': 'CIV', 'cote d ivoire': 'CIV', 'the gambia': 'GMB', 'gambia': 'GMB', 'turkey': 'TUR', 'turkiye': 'TUR', 'czech republic': 'CZE', 'east timor': 'TLS',
  'timor leste': 'TLS', 'eswatini': 'SWZ', 'swaziland': 'SWZ', 'micronesia': 'FSM', 'kosovo': 'UNK', 'western sahara': 'ESH', 'cape verde': 'CPV', 'cabo verde': 'CPV', 'north korea': 'PRK',
  'south korea': 'KOR', 'russia': 'RUS', 'syria': 'SYR', 'iran': 'IRN', 'laos': 'LAO', 'vietnam': 'VNM', 'bolivia': 'BOL', 'venezuela': 'VEN', 'tanzania': 'TZA', 'moldova': 'MDA',
  'brunei': 'BRN', 'vatican city': 'VAT', 'the bahamas': 'BHS', 'bahamas': 'BHS', 'the netherlands': 'NLD', 'netherlands': 'NLD', 'united states': 'USA', 'united kingdom': 'GBR',
  'federated states of micronesia': 'FSM', 'sao tome and principe': 'STP', 'north macedonia': 'MKD', 'myanmar': 'MMR', 'burma': 'MMR', 'taiwan': 'TWN', 'hong kong': 'HKG', 'macau': 'MAC',
  'philippines': 'PHL', 'the philippines': 'PHL', 'uae': 'ARE', 'united arab emirates': 'ARE', 'somaliland': 'SOM', 'artsakh': 'AZE', 'sahrawi arab democratic republic': 'ESH', 'sahrawi republic': 'ESH',
} as Record<string, string>)) countryNames.set(n, `country:${iso}`);
/** Resolve a country name as written in prose (Wikipedia tables, news) to its entity id. */
export function countryIdByName(name: string) {
  const k = norm(name.replace(/^the\s+/i, ''));
  return countryNames.get(k) || countryNames.get(norm(name));
}

/** Person names → id, rebuilt only after a person is added or changed (was rebuilt on every
 *  lookup, which made the live loaders quadratic: ~4 s of blocked event loop per refresh). */
const personNames = () => {
  if (personIndex) return personIndex;
  const m = new Map<string, string>();
  // Curated people first, so they win over live records with the same name.
  const ids = [...(byType.get('person') || [])].sort((a, b) => Number(entities.get(b)!.depth === 'curated') - Number(entities.get(a)!.depth === 'curated'));
  for (const id of ids) { const e = entities.get(id)!; for (const n of [e.name, ...(e.aliases || [])]) { const k = norm(n); if (k.split(' ').length > 1 && !m.has(k)) m.set(k, e.id); } }
  return (personIndex = m);
};
/** Find an existing person entity by any of several name spellings (curated people win over live ones). */
export function findPerson(names: string[]) {
  const m = personNames();
  for (const n of names) { const id = m.get(norm(n)); if (id) return id; }
  return undefined;
}
export { norm as normName };

function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  const prev2 = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v); rowMin = Math.min(rowMin, v);
    }
    for (let j = 0; j <= b.length; j++) { prev2[j] = prev[j]; prev[j] = cur[j]; }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

function tokenScore(tok: string, row: IndexRow): number {
  let best = 0;
  for (const w of row.words) {
    if (w === tok) return 30;
    if (w.startsWith(tok)) best = Math.max(best, 22 - Math.min(8, w.length - tok.length));
    else if (tok.length >= 4) {
      const max = tok.length >= 7 ? 2 : 1;
      const d = editDistance(tok, w.slice(0, Math.max(tok.length, Math.min(w.length, tok.length + 1))), max);
      if (d <= max) best = Math.max(best, 14 - d * 4);
    }
  }
  return best;
}

export function search(q: string, opts: { types?: string[]; limit?: number } = {}): SearchHit[] {
  const nq = norm(q);
  if (!nq) return [];
  const toks = nq.split(' ');
  const hits: SearchHit[] = [];
  for (const row of index) {
    const e = entities.get(row.id)!;
    if (opts.types?.length && !opts.types.includes(e.type)) continue;
    let score = 0; let matched: string | undefined;
    for (const [i, t] of row.terms.entries()) {
      let s = 0;
      if (t === nq) s = 100; else if (t.startsWith(nq)) s = 80 - Math.min(20, t.length - nq.length); else if (nq.length >= 3 && t.includes(nq)) s = 45;
      if (s > score) { score = s; matched = i === 0 ? undefined : t; }
    }
    if (score === 0) {
      let sum = 0;
      for (const tok of toks) { const s = tokenScore(tok, row); if (!s) { sum = 0; break; } sum += s; }
      // Reward names the query covers fully ("pensylvania" → Pennsylvania beats a long event title).
      const nameWords = row.terms[0].split(' ').length;
      score = sum ? Math.min(70, sum / toks.length + 10 + 20 * Math.min(1, toks.length / nameWords)) : 0;
    }
    if (score > 0) {
      const s = stub(e.id)!;
      hits.push({ ...s, score: score + row.boost, matched: matched && matched !== norm(e.name) ? (e.aliases || []).find((a) => norm(a) === matched) : undefined });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, opts.limit || 20);
}

export function listByType(type: string) {
  return [...(byType.get(type) || [])].map((id) => entities.get(id)!);
}

console.log(`[graph] ${entities.size} entities, ${relSeq} relationships, ${sources.size} sources${danglingRels.length ? `, ${danglingRels.length} dangling curated relationships skipped (see /api/quality/report)` : ''}`);

// ───────────── Geography of any entity ─────────────
export const GEO_TYPES = new Set(['country', 'state', 'county', 'city', 'region']);
/** Where on the map a non-geographic entity "lives" (company HQ, leader's country, event's place…). */
export function geoAnchor(id: string, depth = 0): string | null {
  const e = entities.get(id);
  if (!e || depth > 4) return null;
  if (GEO_TYPES.has(e.type)) return e.id;
  const order: [RelType, 'out' | 'in'][] = [['headquartered_in', 'out'], ['head_of_government', 'out'], ['head_of_state', 'out'], ['holds_office', 'out'], ['leads', 'out'], ['party_in', 'out'], ['affects', 'out'], ['candidate_in', 'out']];
  for (const [t, d] of order) {
    for (const r of relsOfType(id, t, d)) {
      const target = entities.get(d === 'out' ? r.to : r.from);
      if (target && GEO_TYPES.has(target.type)) return target.id;
      if (target && (target.type === 'party' || target.type === 'company' || target.type === 'event') && (t === 'leads' || t === 'candidate_in')) { const a = geoAnchor(target.id, depth + 1); if (a) return a; }
    }
  }
  if (e.attrs?.hq) return e.attrs.hq;
  if (e.parentId?.startsWith('country:')) return e.parentId;
  return null;
}
/** The entity's place and every place containing it (city → state → country → region). */
export function geoChain(id: string): string[] {
  const out: string[] = [];
  let cur = geoAnchor(id) ? entities.get(geoAnchor(id)!) : undefined;
  while (cur && out.length < 6) { out.push(cur.id); cur = cur.parentId ? entities.get(cur.parentId) : undefined; }
  return out;
}
/** The country an entity belongs to, if any. */
export function countryOf(id: string): string | undefined {
  return geoChain(id).find((x) => x.startsWith('country:'));
}
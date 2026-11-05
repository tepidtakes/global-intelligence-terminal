// Reading the web: every connection of an entity, grouped and ranked by what the link carries
// (trade value, stories in common, listings…), with its sources; the neighborhood network for the
// web view; and the map layer "where in the world is this connected".
import { relationshipsFor, getEntity, stub, countryOf, entities, allRels, onGraphChange } from '../graph.js';
import { REL_LABELS, type EntityStub, type RelType, type RelView } from '../../shared/types.js';
import { gdpShare } from './weights.js';

const ORDER: RelType[] = ['head_of_state', 'head_of_government', 'leads', 'holds_office', 'central_bank_of', 'member_of', 'capital_of', 'headquartered_in', 'located_in', 'subsidiary_of', 'shareholder_of',
  'in_industry', 'belongs_to_party', 'party_in', 'governing_party', 'candidate_in', 'fights_in', 'trades_with', 'sanctions', 'mentioned_with', 'borders', 'produces', 'exports', 'imports', 'operates_in', 'supplies', 'uses',
  'consumes', 'competitor_of', 'trade_partner', 'affects', 'in_region'];
const SYMMETRIC = new Set<RelType>(['borders', 'mentioned_with', 'trades_with', 'competitor_of']);
const today = () => new Date().toISOString().slice(0, 10);

export interface WebItem {
  other: EntityStub; role?: string; since?: string; until?: string; current: boolean;
  value?: number; unit?: string; period?: string; data?: Record<string, any>;
  sources: string[]; disputes?: { sourceId: string; detail: string }[]; live: boolean; retrievedAt?: string;
}
export interface WebGroup { key: string; type: RelType; direction: 'out' | 'in' | 'both'; label: string; total: number; items: WebItem[]; }

const itemOf = (rv: RelView): WebItem => ({
  other: rv.other, role: rv.rel.role, since: rv.rel.validFrom, until: rv.rel.validTo, current: !rv.rel.validTo || rv.rel.validTo.slice(0, 10) > today(),
  value: rv.rel.value, unit: rv.rel.unit, period: rv.rel.period, data: rv.rel.data, sources: [rv.rel.sourceId, ...(rv.rel.alsoIn || [])].filter((x): x is string => !!x),
  disputes: rv.rel.disputes, live: !!rv.rel.origin, retrievedAt: rv.rel.retrievedAt,
});
/** Trade links from both sides' reports, merged into one entry per partner. */
function mergeTrade(list: RelView[]): WebItem[] {
  const by = new Map<string, WebItem>();
  for (const rv of list) {
    const d = rv.rel.data || {};
    // Out: the focus reports its exports to / imports from the partner. In: the partner reports its
    // exports to / imports from the focus, i.e. the focus's imports / exports as the partner sees them.
    const report = rv.direction === 'out' ? { exports: d.exports, imports: d.imports, year: rv.rel.period } : { exports: d.imports, imports: d.exports, year: rv.rel.period };
    const cur = by.get(rv.other.id) || by.set(rv.other.id, { ...itemOf(rv), data: {}, sources: [] }).get(rv.other.id)!;
    cur.data![rv.direction === 'out' ? 'own' : 'mirror'] = report;
    for (const s of itemOf(rv).sources) if (!cur.sources.includes(s)) cur.sources.push(s);
    if (rv.direction === 'out' || cur.value == null) { cur.value = rv.rel.value; cur.period = rv.rel.period; cur.unit = rv.rel.unit; }
    if (rv.direction === 'out' && d.share != null) cur.data!.share = d.share;
  }
  return [...by.values()];
}
// Current links first, then by what the link carries (trade value, stories…), then by the weight of
// the other side (share of world GDP, else notability), then the most recent.
const rank = (a: WebItem, b: WebItem) => Number(b.current) - Number(a.current) || (b.value ?? -1) - (a.value ?? -1) || nodeWeight(b.other.id) - nodeWeight(a.other.id) || (b.since || '').localeCompare(a.since || '') || a.other.name.localeCompare(b.other.name);

export function connectionsFor(id: string, o: { limitPer?: number } = {}) {
  const focus = stub(id); if (!focus) return null;
  const rvs = relationshipsFor(id);
  const buckets = new Map<string, { type: RelType; direction: 'out' | 'in' | 'both'; list: RelView[] }>();
  for (const rv of rvs) {
    const dir = SYMMETRIC.has(rv.rel.type) ? 'both' : rv.direction;
    const key = `${rv.rel.type}:${dir}`;
    (buckets.get(key) || buckets.set(key, { type: rv.rel.type, direction: dir, list: [] }).get(key)!).list.push(rv);
  }
  const groups: WebGroup[] = [];
  for (const [key, b] of buckets) {
    let items = b.type === 'trades_with' ? mergeTrade(b.list) : b.list.map(itemOf);
    // One entry per other entity (the current, strongest link wins).
    const best = new Map<string, WebItem>();
    for (const it of items.sort(rank)) if (!best.has(it.other.id)) best.set(it.other.id, it); else { const k = best.get(it.other.id)!; for (const s of it.sources) if (!k.sources.includes(s)) k.sources.push(s); }
    items = [...best.values()].sort(rank);
    const label = b.type === 'trades_with' ? 'Trade partners' : b.direction === 'in' ? REL_LABELS[b.type].inv : REL_LABELS[b.type].fwd;
    groups.push({ key, type: b.type, direction: b.direction, label, total: items.length, items: items.slice(0, o.limitPer || 40) });
  }
  groups.sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99) || a.label.localeCompare(b.label));
  return { focus, groups, total: groups.reduce((s, g) => s + g.total, 0) };
}

// ───────────────────────── Neighborhood network (web view) ─────────────────────────
export interface WebNode extends EntityStub { focus?: boolean; weight: number; }
export interface WebLink { source: string; target: string; type: RelType; label: string; value?: number; current: boolean; }
// Weights are summed over members for organizations: cached until the graph changes.
const weightCache = new Map<string, number>();
onGraphChange(() => weightCache.clear());
/** How big to draw a node: share of world GDP for economies and organizations, else notability. */
export function nodeWeight(id: string) {
  const hit = weightCache.get(id); if (hit != null) return hit;
  const w = computeWeight(id); weightCache.set(id, w); return w;
}
function computeWeight(id: string) {
  const share = id.startsWith('country:') || id.startsWith('igo:') ? gdpShare(id) : undefined;
  if (share != null) return Math.max(1, Math.min(10, 2 + Math.log2(share + 1) * 1.6));
  // Everything else by notability, on a smaller scale than economies (a city should not outweigh a country).
  const e = getEntity(id); const sl = Number(e?.attrs?.sitelinks) || (e?.depth === 'curated' ? 40 : 0);
  return Math.max(1, Math.min(4, 1 + Math.log2(sl + 1) * 0.5));
}
const NOISY = new Set<RelType>(['in_region', 'located_in', 'borders']);
export function neighborhood(id: string, o: { perGroup?: number; max?: number; types?: string[]; depth?: number } = {}) {
  const c = connectionsFor(id, { limitPer: o.perGroup || 8 }); if (!c) return null;
  const max = Math.min(150, o.max || 70);
  const nodes = new Map<string, WebNode>([[id, { ...c.focus, focus: true, weight: nodeWeight(id) }]]);
  const links: WebLink[] = [];
  const addLink = (l: WebLink) => { if (!links.some((x) => x.type === l.type && ((x.source === l.source && x.target === l.target) || (x.source === l.target && x.target === l.source)))) links.push(l); };
  for (const g of c.groups) {
    if (o.types?.length && !o.types.includes(g.type)) continue;
    for (const it of g.items.slice(0, o.perGroup || 8)) {
      if (!nodes.has(it.other.id)) { if (nodes.size >= max) break; nodes.set(it.other.id, { ...it.other, weight: nodeWeight(it.other.id) }); }
      addLink({ source: id, target: it.other.id, type: g.type, label: g.label, value: it.value, current: it.current });
    }
  }
  // Second ring: each neighbor's strongest links, when asked for.
  if ((o.depth || 1) > 1) for (const n of [...nodes.keys()].filter((x) => x !== id)) {
    const cn = connectionsFor(n, { limitPer: 3 }); if (!cn) continue;
    for (const g of cn.groups) {
      if (NOISY.has(g.type) || (o.types?.length && !o.types.includes(g.type))) continue;
      for (const it of g.items.slice(0, 2)) {
        if (!nodes.has(it.other.id)) { if (nodes.size >= max) break; nodes.set(it.other.id, { ...it.other, weight: nodeWeight(it.other.id) }); }
        addLink({ source: n, target: it.other.id, type: g.type, label: g.label, value: it.value, current: it.current });
      }
    }
  }
  // Links among the nodes already shown: this is what makes it a web rather than a star.
  for (const n of nodes.keys()) for (const rv of relationshipsFor(n)) {
    const other = rv.other.id;
    if (other === n || !nodes.has(other) || NOISY.has(rv.rel.type) || (o.types?.length && !o.types.includes(rv.rel.type))) continue;
    if (rv.rel.validTo && rv.rel.validTo.slice(0, 10) <= today()) continue;
    addLink({ source: rv.direction === 'out' ? n : other, target: rv.direction === 'out' ? other : n, type: rv.rel.type, label: rv.label, value: rv.rel.value, current: true });
  }
  return { focus: c.focus, nodes: [...nodes.values()], links, types: [...new Set(links.map((l) => l.type))] };
}

// ───────────────────────── Map: where an entity is connected ─────────────────────────
export function webLayer(id: string) {
  const c = connectionsFor(id, { limitPer: 400 }); if (!c) return null;
  const values: Record<string, string> = {}; const detail: Record<string, string[]> = {};
  const cats: { key: string; label: string }[] = [];
  const isoOf = (otherId: string) => { const cid = otherId.startsWith('country:') ? otherId : countryOf(otherId); return cid ? getEntity(cid)?.iso3 : undefined; };
  const self = isoOf(id);
  if (self) { values[self] = 'self'; detail[self] = [getEntity(id)?.type === 'country' ? 'The country itself' : `Where ${c.focus.name} is based`]; cats.push({ key: 'self', label: getEntity(id)?.type === 'country' ? c.focus.name : `${c.focus.name} (home)` }); }
  for (const g of c.groups) {
    if (g.type === 'in_region' || g.type === 'located_in') continue;
    let used = false;
    for (const it of g.items) {
      if (!it.current) continue;
      const iso = isoOf(it.other.id); if (!iso) continue;
      if (!values[iso]) { values[iso] = g.key; used = true; }
      const desc = `${g.label}: ${it.other.type === 'country' ? '' : `${it.other.name} `}${it.value != null && it.unit === 'USD' ? `US$${(it.value / 1e9).toFixed(1)} bn` : it.value != null ? `${it.value} ${it.unit || ''}` : ''}`.trim();
      (detail[iso] ||= []).push(desc);
    }
    if (used) cats.push({ key: g.key, label: g.label });
  }
  return { label: `Connections of ${c.focus.name}`, categories: cats.slice(0, 12), values, detail: Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, [...new Set(v)].slice(0, 6).join(' · ')])) };
}

/** Totals for the Data page: how big the web is, by link type and by source. */
export function webStats() {
  const byType: Record<string, number> = {}; const bySource: Record<string, number> = {}; let links = 0, corroborated = 0, disputed = 0;
  for (const r of allRels()) {
    links++; byType[r.type] = (byType[r.type] || 0) + 1; const s = r.sourceId || 'unknown'; bySource[s] = (bySource[s] || 0) + 1;
    if (r.alsoIn?.length) corroborated++; if (r.disputes?.length) disputed++;
  }
  const byEntityType: Record<string, number> = {}; for (const e of entities.values()) byEntityType[e.type] = (byEntityType[e.type] || 0) + 1;
  return { entities: entities.size, byEntityType, links, byType, bySource, corroborated, disputed };
}

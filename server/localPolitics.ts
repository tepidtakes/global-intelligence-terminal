// Local politics from Wikidata (CC0), refreshed with the other background loaders:
// mayors (or the city's head of government — "Governor of Tokyo", "Mayor of Paris") of every
// national capital, every US city over 250,000 people and every curated city. Cities the
// terminal does not know yet are added with coordinates and population, so they appear on
// the map. Curated mayors are reconciled the same way as national leaders: a successor who
// took office after the June 2026 check closes the curated term; any other disagreement is
// shown as a "verify" note.
import { cached, fetchJson } from './cache.js';
import { entities, getEntity, upsertEntity, setLiveRels, findPerson, relsOfType, normName } from './graph.js';
import { findParty } from './augment.js';
import { AS_OF } from './data/curated.js';
import { USER_AGENT } from './config.js';
import type { Entity, Fact, Relationship } from '../shared/types.js';

type NewRel = Omit<Relationship, 'id' | 'origin'>;
const SRC = 'wikidata-local';
const VERIFIED_THROUGH = `${AS_OF}-30`;
const qid = (uri: string) => uri.split('/').pop()!;

async function sparql(q: string): Promise<any[]> {
  const j = await fetchJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT }, 90000);
  return j?.results?.bindings || [];
}

const HOLDER = `?city p:P6 ?st . ?st ps:P6 ?person ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?st pq:P582 ?end }
  OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?city wdt:P625 ?coord } OPTIONAL { ?city wdt:P1082 ?pop } OPTIONAL { ?city wdt:P1313 ?office }
  OPTIONAL { ?city wdt:P131/wdt:P131? ?adm . ?adm wdt:P31 wd:Q35657 ; wdt:P300 ?stateCode }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }`;

export interface MayorRow { city: string; cityLabel: string; iso: string; coord?: [number, number]; pop?: number; person: string; personLabel: string; start?: string; office?: string; stateCode?: string; capital: boolean; }
export function mayorRows(bindings: any[], capital: boolean): MayorRow[] {
  return bindings.filter((b) => b.city && b.person && b.iso).map((b) => {
    const pt = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value || '');
    return {
      city: qid(b.city.value), cityLabel: b.cityLabel?.value, iso: b.iso.value, coord: pt ? [Number(pt[1]), Number(pt[2])] as [number, number] : undefined,
      pop: b.pop ? Number(b.pop.value) : undefined, person: qid(b.person.value), personLabel: b.personLabel?.value, start: b.start?.value?.slice(0, 10),
      office: b.officeLabel?.value, stateCode: b.stateCode?.value, capital: capital || b.isCapital?.value === 'true',
    };
  }).filter((r) => r.cityLabel && r.personLabel && !/^Q\d+$/.test(r.personLabel));
}

async function wikidataMayors() {
  return cached('wd:mayors:v1', 24 * 3600, async () => {
    const capitals = mayorRows(await sparql(`SELECT ?city ?cityLabel ?iso ?coord ?pop ?person ?personLabel ?start ?officeLabel ?stateCode WHERE { ?country wdt:P36 ?city ; wdt:P298 ?iso . ${HOLDER} }`), true);
    const us = mayorRows(await sparql(`SELECT ?city ?cityLabel ?iso ?coord ?pop ?person ?personLabel ?start ?officeLabel ?stateCode WHERE { ?city wdt:P31 wd:Q1093829 ; wdt:P1082 ?p0 . FILTER(?p0 >= 250000) BIND("USA" AS ?iso) ${HOLDER} }`), false);
    // Curated cities by English name and country.
    const curated = [...entities.values()].filter((e) => e.type === 'city' && e.depth === 'curated');
    const values = curated.map((c) => { let p = c.parentId ? getEntity(c.parentId) : undefined; while (p && p.type !== 'country') p = p.parentId ? getEntity(p.parentId) : undefined; return p?.iso3 ? `("${c.name.replace(/"/g, '')}"@en "${p.iso3}")` : ''; }).filter(Boolean).join(' ');
    const named = values ? mayorRows(await sparql(`SELECT ?city ?cityLabel ?iso ?coord ?pop ?person ?personLabel ?start ?officeLabel ?stateCode WHERE { VALUES (?name ?iso) { ${values} } ?city rdfs:label ?name ; wdt:P17 ?c ; wdt:P1082 ?p1 . ?c wdt:P298 ?iso . FILTER(?p1 > 50000) ${HOLDER} }`), false) : [];
    const people = [...new Set([...capitals, ...us, ...named].map((r) => r.person))];
    const parties: Record<string, string[]> = {};
    for (let i = 0; i < people.length; i += 150) {
      const vals = people.slice(i, i + 150).map((q) => `wd:${q}`).join(' ');
      for (const r of await sparql(`SELECT ?person ?pname WHERE { VALUES ?person { ${vals} } ?person p:P102 ?pst . ?pst ps:P102 ?party . FILTER NOT EXISTS { ?pst pq:P582 [] } ?party rdfs:label ?pname . FILTER(LANG(?pname)="en") }`))
        (parties[qid(r.person.value)] ||= []).push(r.pname.value);
    }
    return { rows: [...capitals, ...us, ...named], parties };
  });
}

/** One row per city: the most recent open-ended holder wins; others are kept for a "verify" note. */
export function bestPerCity(rows: MayorRow[]) {
  const by = new Map<string, MayorRow[]>();
  for (const r of rows) { const l = by.get(r.city) || by.set(r.city, []).get(r.city)!; if (!l.some((x) => x.person === r.person)) l.push(r); else { const x = l.find((y) => y.person === r.person)!; x.pop = Math.max(x.pop || 0, r.pop || 0) || undefined; x.capital ||= r.capital; x.stateCode ||= r.stateCode; x.office ||= r.office; } }
  return [...by.values()].map((l) => { const s = [...l].sort((a, b) => (b.start || '').localeCompare(a.start || '')); return { best: s[0], others: s.slice(1) }; });
}

const fmt = (d?: string) => d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

export async function loadMayors() {
  const r = await wikidataMayors();
  const retrievedAt = r.fetchedAt;
  const fct = (label: string, value: string | number, o: Partial<Fact> = {}): Fact => ({ label, value, sourceId: SRC, quality: 'community', retrievedAt, ...o });
  // Known cities by name + country.
  const cityKey = (name: string, iso: string) => `${normName(name)}|${iso}`;
  const known = new Map<string, string>();
  for (const e of entities.values()) if (e.type === 'city') {
    let p = e.parentId ? getEntity(e.parentId) : undefined; while (p && p.type !== 'country') p = p.parentId ? getEntity(p.parentId) : undefined;
    if (p?.iso3) for (const n of [e.name, ...(e.aliases || [])]) known.set(cityKey(n, p.iso3), e.id);
    if (e.attrs?.wikidata) known.set(`q|${e.attrs.wikidata}`, e.id);
  }
  const rels: NewRel[] = []; const partyRels: NewRel[] = [];
  let added = 0, cities = 0, matched = 0, closed = 0;
  for (const { best: m, others } of bestPerCity(r.data.rows)) {
    const country = getEntity(`country:${m.iso}`); if (!country) continue;
    let cityId = known.get(`q|${m.city}`) || known.get(cityKey(m.cityLabel, m.iso)) || known.get(cityKey(m.cityLabel.replace(/,.*$/, ''), m.iso));
    const parentId = m.stateCode && getEntity(`state:${m.stateCode}`) ? `state:${m.stateCode}` : country.id;
    if (!cityId) {
      cityId = `city:wd-${m.city.toLowerCase()}`;
      upsertEntity({
        id: cityId, type: 'city', name: m.cityLabel, depth: 'baseline', parentId, coords: m.coord,
        summary: `${m.capital ? `Capital of ${country.name}` : `City in ${getEntity(parentId)?.name || country.name}`}. Added from Wikidata with its current ${m.office ? m.office.replace(/ of .*$/, '').toLowerCase() : 'mayor'}.`,
        facts: [...(m.pop ? [fct('Population', m.pop, { unit: 'people' })] : [])],
        attrs: { wikidata: m.city, population: m.pop, capital: m.capital || undefined, mayorSource: 'wikidata', origin: 'wikidata' }, sources: [SRC],
      } as Entity);
      rels.push({ from: cityId, to: parentId, type: 'located_in', sourceId: SRC });
      cities++;
    } else {
      const c = getEntity(cityId)!; c.attrs = { ...(c.attrs || {}), wikidata: m.city, mayorSource: 'wikidata', ...(m.pop && !c.attrs?.population ? { population: m.pop } : {}) };
    }
    if (m.capital) rels.push({ from: cityId, to: country.id, type: 'capital_of', sourceId: SRC });
    const role = m.office || `Mayor of ${m.cityLabel}`;
    const city = getEntity(cityId)!;
    const notes: string[] = [];
    if (others.length) notes.push(`Wikidata lists more than one current ${role.replace(/ of .*$/, '').toLowerCase()} without an end date: ${[m, ...others].map((x) => `${x.personLabel}${x.start ? ` (since ${x.start})` : ''}`).join('; ')}. Showing the most recent — verify.`);
    // Reconcile with curated mayors.
    const curated = relsOfType(cityId, 'leads', 'in').filter((x) => !x.origin && !x.validTo && /mayor|governor|head/i.test(x.role || ''));
    const same = (pid: string) => { const p = getEntity(pid); return !!p && [p.name, ...(p.aliases || [])].some((n) => normName(n) === normName(m.personLabel)); };
    if (curated.some((c) => same(c.from))) { matched++; if (notes.length) city.attrs = { ...city.attrs, leaderNotes: notes }; continue; }
    if (curated.length && (!m.start || m.start <= VERIFIED_THROUGH)) {
      notes.push(`Wikidata lists ${m.personLabel}${m.start ? ` (since ${m.start})` : ''} as ${role}; the curated record (June 2026) lists ${curated.map((c) => getEntity(c.from)?.name).join(', ')}. Verify with the city’s official site.`);
      city.attrs = { ...city.attrs, leaderNotes: notes };
      continue;
    }
    for (const c of curated) {
      c.validTo = m.start; c.note = `Term end inferred from Wikidata, which records ${m.personLabel} taking office on ${m.start} — after this entry was verified (June 2026).`;
      const p = getEntity(c.from); if (p) p.attrs = { ...(p.attrs || {}), staleNote: `Wikidata records ${m.personLabel} as ${role} since ${fmt(m.start)}. This profile was last verified in June 2026.` };
      closed++;
    }
    city.attrs = { ...city.attrs, leaderNotes: notes.length ? notes : city.attrs?.leaderNotes };
    let pid = findPerson([m.personLabel]);
    if (!pid) {
      pid = `person:wd-${m.person.toLowerCase()}`;
      const party = r.data.parties[m.person]?.[0];
      upsertEntity({
        id: pid, type: 'person', name: m.personLabel, depth: 'baseline', summary: `${role}${m.start ? ` since ${fmt(m.start).replace(/^\d+ /, '')}` : ''}.`,
        facts: [fct('Current role', role), ...(m.start ? [fct('In office since', m.start)] : []), ...(party ? [fct('Party', party)] : [])],
        attrs: { wikidata: m.person, nationality: country.name, origin: 'wikidata' }, sources: [SRC],
      } as Entity);
      const partyId = party ? findParty(party, country.id) : undefined;
      if (partyId) partyRels.push({ from: pid, to: partyId, type: 'belongs_to_party', sourceId: SRC });
    }
    rels.push({ from: pid, to: cityId, type: 'leads', role, validFrom: m.start, sourceId: SRC });
    added++;
  }
  setLiveRels('wikidata-mayors', rels);
  setLiveRels('wikidata-mayor-parties', partyRels);
  return { detail: `${added} mayors (${cities} cities added to the map), ${matched} matched curated records, ${closed} curated terms closed`, fetchedAt: r.fetchedAt, stale: r.stale };
}

/** Current mayors of cities inside a place (state → its cities; country → its capital and cities). */
export function mayorsWithin(placeId: string) {
  const out: { city: Entity; person: Entity; role?: string; since?: string; origin?: string }[] = [];
  for (const e of entities.values()) {
    if (e.type !== 'city') continue;
    let p = e.parentId ? getEntity(e.parentId) : undefined; let inside = e.parentId === placeId;
    while (!inside && p) { inside = p.parentId === placeId; p = p.parentId ? getEntity(p.parentId) : undefined; }
    if (!inside) continue;
    for (const r of relsOfType(e.id, 'leads', 'in')) {
      if (r.validTo) continue;
      const person = getEntity(r.from); if (person) out.push({ city: e, person, role: r.role, since: r.validFrom, origin: r.origin });
    }
  }
  return out.sort((a, b) => Number(b.city.attrs?.capital || 0) - Number(a.city.attrs?.capital || 0) || (b.city.attrs?.population || 0) - (a.city.attrs?.population || 0));
}

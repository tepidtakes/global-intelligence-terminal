// Live additions to the entity graph, loaded after boot and refreshed every 12 hours:
//   • every current member of the US Congress (unitedstates/congress-legislators, public domain)
//   • heads of state and government of every country and US governors (Wikidata, CC0)
//   • ongoing armed conflicts and national elections (Wikipedia lists, CC BY-SA)
// Curated records (verified June 2026) are compared with the live ones: when Wikidata
// records a successor who took office after that date, the curated term is closed and the
// person's profile is flagged; any other disagreement is shown as a note, not resolved silently.
import { cached, fetchJson } from './cache.js';
import { entities, getEntity, upsertEntity, setLiveRels, findPerson, relsOfType, normName } from './graph.js';
import { AS_OF } from './data/curated.js';
import { conflicts, electionCalendar, INTENSITY } from './worldEvents.js';
import type { Entity, Fact, Relationship } from '../shared/types.js';
import { USER_AGENT } from './config.js';

type NewRel = Omit<Relationship, 'id' | 'origin'>;
export const liveStatus: Record<string, { ok: boolean; at: string; detail: string }> = {};
const VERIFIED_THROUGH = `${AS_OF}-30`;
const today = () => new Date().toISOString().slice(0, 10);
const fct = (label: string, value: string | number, sourceId: string, quality: Fact['quality'], o: Partial<Fact> = {}): Fact => ({ label, value, sourceId, quality, ...o });
const lcRole = (r: string) => (/^(Head|Governor)/.test(r) ? r.charAt(0).toLowerCase() + r.slice(1) : r.replace(/^prime minister/, 'Prime Minister').replace(/^president/, 'President'));
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtDay = (d?: string) => d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

// ───────────────────────── US Congress ─────────────────────────
const TERRITORIES = new Set(['DC', 'PR', 'GU', 'VI', 'AS', 'MP']);

async function loadCongress() {
  const r = await cached('congress:current', 24 * 3600, () => fetchJson('https://unitedstates.github.io/congress-legislators/legislators-current.json', {}, 60000));
  const rels: NewRel[] = []; let n = 0;
  for (const p of r.data as any[]) {
    const term = p.terms?.at(-1); if (!term) continue;
    const stateId = `state:US-${term.state}`; const st = getEntity(stateId); if (!st) continue;
    let since = term.start;
    for (let i = p.terms.length - 2; i >= 0 && p.terms[i].type === term.type && p.terms[i].state === term.state; i--) since = p.terms[i].start;
    const role = term.type === 'sen' ? `U.S. Senator from ${st.name}`
      : term.state === 'PR' ? 'Resident Commissioner of Puerto Rico'
      : TERRITORIES.has(term.state) ? `Delegate to the U.S. House from ${st.name}`
      : term.district === 0 ? `U.S. Representative for ${st.name} (at-large)` : `U.S. Representative, ${term.state}-${term.district}`;
    const official = p.name.official_full || `${p.name.first} ${p.name.last}`;
    const names = [official, `${p.name.first} ${p.name.last}`, p.name.nickname ? `${p.name.nickname} ${p.name.last}` : ''].filter(Boolean);
    const found = findPerson(names);
    const curated = found && getEntity(found)?.depth === 'curated' ? found : undefined;
    const id = curated || `person:us-${String(p.id.bioguide).toLowerCase()}`;
    const party = term.party as string;
    if (!curated) {
      upsertEntity({
        id, type: 'person', name: official, depth: 'baseline', aliases: [...new Set(names)].filter((x) => x !== official),
        summary: `${role} (${party}) since ${fmtDay(since).replace(/^\d+ /, '')}.`,
        facts: [fct('Current role', role, 'congress-legislators', 'official'), fct('Party', party, 'congress-legislators', 'official'), fct('In this office since', since, 'congress-legislators', 'official'),
          ...(p.bio?.birthday ? [fct('Born', p.bio.birthday, 'congress-legislators', 'official')] : []), ...(term.url ? [fct('Official website', term.url, 'congress-legislators', 'official')] : [])],
        attrs: { nationality: 'United States', born: p.bio?.birthday, bioguide: p.id.bioguide, website: term.url, chamber: term.type === 'sen' ? 'Senate' : 'House', district: term.district, origin: 'congress-legislators' },
        sources: ['congress-legislators'],
      } as Entity);
      if (party === 'Democrat') rels.push({ from: id, to: 'party:us-democratic', type: 'belongs_to_party', sourceId: 'congress-legislators' });
      if (party === 'Republican') rels.push({ from: id, to: 'party:us-republican', type: 'belongs_to_party', sourceId: 'congress-legislators' });
    } else if (relsOfType(id, 'holds_office', 'out').some((x) => !x.origin && x.to === stateId)) { n++; continue; }
    rels.push({ from: id, to: stateId, type: 'holds_office', role, validFrom: since, sourceId: 'congress-legislators', rank: term.type === 'sen' ? 1 : 2 + (term.district || 0) });
    n++;
  }
  setLiveRels('congress', rels);
  return `${n} members of Congress`;
}

// ───────────────────────── Wikidata: leaders and US governors ─────────────────────────
const qid = (uri: string) => uri.split('/').pop()!;
async function sparql(q: string): Promise<any[]> {
  const j = await fetchJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT }, 90000);
  return j?.results?.bindings || [];
}
interface Holder { key: string; qid: string; name: string; desc?: string; start?: string; preferred: boolean; }
const holderRows = (rows: any[], keyVar: string): Holder[] => rows.map((r) => ({ key: r[keyVar].value, qid: qid(r.person.value), name: r.name.value, desc: r.desc?.value, start: r.start?.value?.slice(0, 10), preferred: /PreferredRank/.test(r.rank?.value || '') }));

async function wikidataLeaders() {
  return cached('wd:leaders:v1', 24 * 3600, async () => {
    const holders = (prop: string) => sparql(`SELECT ?iso ?person ?name ?desc ?start ?rank WHERE { ?country wdt:P298 ?iso ; p:${prop} ?st . ?st ps:${prop} ?person ; wikibase:rank ?rank . FILTER NOT EXISTS { ?st pq:P582 ?end } FILTER(?rank != wikibase:DeprecatedRank) OPTIONAL { ?st pq:P580 ?start } ?person rdfs:label ?name . FILTER(LANG(?name) = "en") OPTIONAL { ?person schema:description ?desc . FILTER(LANG(?desc) = "en") } }`);
    const hos = holderRows(await holders('P35'), 'iso');
    const hog = holderRows(await holders('P6'), 'iso');
    const governors = holderRows(await sparql(`SELECT ?code ?person ?name ?desc ?start ?rank WHERE { ?state wdt:P31 wd:Q35657; wdt:P300 ?code; p:P6 ?st . ?st ps:P6 ?person ; wikibase:rank ?rank . FILTER NOT EXISTS { ?st pq:P582 [] } FILTER(?rank != wikibase:DeprecatedRank) OPTIONAL { ?st pq:P580 ?start } ?person rdfs:label ?name . FILTER(LANG(?name)="en") OPTIONAL { ?person schema:description ?desc . FILTER(LANG(?desc) = "en") } }`), 'code');
    const offices: Record<string, { hos?: string; hog?: string }> = {};
    for (const r of await sparql(`SELECT ?iso ?hosName ?hogName WHERE { ?c wdt:P298 ?iso . OPTIONAL { ?c wdt:P1906 ?ho . ?ho rdfs:label ?hosName . FILTER(LANG(?hosName)="en") } OPTIONAL { ?c wdt:P1313 ?hg . ?hg rdfs:label ?hogName . FILTER(LANG(?hogName)="en") } }`)) {
      const o = offices[r.iso.value] ||= {};
      o.hos ||= r.hosName?.value; o.hog ||= r.hogName?.value;
    }
    const ids = [...new Set([...hos, ...hog, ...governors].map((h) => h.qid))];
    const parties: Record<string, { qid: string; name: string }[]> = {}; const aliases: Record<string, string[]> = {};
    for (let i = 0; i < ids.length; i += 150) {
      const values = ids.slice(i, i + 150).map((q) => `wd:${q}`).join(' ');
      for (const r of await sparql(`SELECT ?person ?party ?pname WHERE { VALUES ?person { ${values} } ?person p:P102 ?pst . ?pst ps:P102 ?party . FILTER NOT EXISTS { ?pst pq:P582 [] } ?party rdfs:label ?pname . FILTER(LANG(?pname)="en") }`))
        (parties[qid(r.person.value)] ||= []).push({ qid: qid(r.party.value), name: r.pname.value });
      for (const r of await sparql(`SELECT ?person ?alt WHERE { VALUES ?person { ${values} } ?person skos:altLabel ?alt . FILTER(LANG(?alt)="en") }`))
        (aliases[qid(r.person.value)] ||= []).push(r.alt.value);
    }
    return { hos, hog, governors, offices, parties, aliases };
  });
}

/** The likeliest current holder(s): latest start date wins; preferred rank breaks ties.
 *  Other candidates without an end date are returned so the UI can say "verify". */
function current(rows: Holder[]) {
  const by = new Map<string, Holder[]>();
  for (const r of rows) { const l = by.get(r.key) || by.set(r.key, []).get(r.key)!; if (!l.some((x) => x.qid === r.qid)) l.push(r); }
  const out = new Map<string, { best: Holder; others: Holder[] }>();
  for (const [k, l] of by) {
    const sorted = [...l].sort((a, b) => (b.start || '').localeCompare(a.start || '') || Number(b.preferred) - Number(a.preferred));
    out.set(k, { best: sorted[0], others: sorted.slice(1) });
  }
  return out;
}

async function loadLeaders() {
  const r = await wikidataLeaders();
  const d = r.data;
  const rels: NewRel[] = []; const partyRels: NewRel[] = [];
  const notes: Record<string, string[]> = {};
  let added = 0, superseded = 0, matched = 0;

  const personFor = (h: Holder, countryId: string, role: string) => {
    const existing = findPerson([h.name, ...(d.aliases[h.qid] || [])]);
    if (existing) { const e = getEntity(existing)!; e.attrs = { ...(e.attrs || {}), wikidata: h.qid }; return existing; }
    const id = `person:wd-${h.qid.toLowerCase()}`;
    const country = getEntity(countryId);
    upsertEntity({
      id, type: 'person', name: h.name, depth: 'baseline', aliases: (d.aliases[h.qid] || []).filter((a) => a.length > 3).slice(0, 6),
      summary: h.desc ? `${h.desc.charAt(0).toUpperCase()}${h.desc.slice(1)}.` : `${role}.`,
      facts: [fct('Current role', role, 'wikidata', 'community'), ...(h.start ? [fct('In office since', h.start, 'wikidata', 'community')] : [])],
      attrs: { wikidata: h.qid, nationality: country?.type === 'country' ? country.name : 'United States', origin: 'wikidata' }, sources: ['wikidata'],
    } as Entity);
    // Party: reuse a party already in the graph for that country, else add it.
    const p = d.parties[h.qid]?.[0];
    const homeCountry = country?.type === 'country' ? countryId : 'country:USA';
    if (p) {
      const pid = findParty(p.name, homeCountry) || `party:wd-${p.qid.toLowerCase()}`;
      if (!getEntity(pid)) {
        upsertEntity({ id: pid, type: 'party', name: p.name, depth: 'baseline', parentId: homeCountry, summary: `Political party (${getEntity(homeCountry)?.name}), added from Wikidata as the party of ${h.name}.`, facts: [], attrs: { wikidata: p.qid, origin: 'wikidata' }, sources: ['wikidata'] } as Entity);
        partyRels.push({ from: pid, to: homeCountry, type: 'party_in', sourceId: 'wikidata' });
      }
      partyRels.push({ from: id, to: pid, type: 'belongs_to_party', sourceId: 'wikidata' });
    }
    return id;
  };

  const reconcile = (placeId: string, type: 'head_of_state' | 'head_of_government' | 'leads', h: { best: Holder; others: Holder[] }, role: string, isCurated: (rel: Relationship) => boolean) => {
    const place = getEntity(placeId); if (!place) return;
    const curated = relsOfType(placeId, type, 'in').filter((x) => !x.origin && !x.validTo && isCurated(x));
    const w = h.best;
    const sameAs = (pid: string) => { const p = getEntity(pid); if (!p) return false; const names = new Set([p.name, ...(p.aliases || [])].map(normName)); return [w.name, ...(d.aliases[w.qid] || [])].some((n) => names.has(normName(n))); };
    if (h.others.length) (notes[placeId] ||= []).push(`Wikidata lists more than one current ${lcRole(role)} without an end date: ${[w, ...h.others].map((x) => `${x.name}${x.start ? ` (since ${x.start})` : ''}`).join('; ')}. Showing the most recent — verify.`);
    if (curated.some((c) => sameAs(c.from))) { matched++; for (const c of curated) if (sameAs(c.from)) { const p = getEntity(c.from)!; p.attrs = { ...(p.attrs || {}), wikidata: w.qid }; } return; }
    if (curated.length && (!w.start || w.start <= VERIFIED_THROUGH)) {
      (notes[placeId] ||= []).push(`Wikidata lists ${w.name}${w.start ? ` (since ${w.start})` : ''} as ${role}; the curated record (June 2026) lists ${curated.map((c) => getEntity(c.from)?.name).join(', ')}. Verify with an official source.`);
      return;
    }
    for (const c of curated) {
      c.validTo = w.start; c.note = `Term end inferred from Wikidata, which records ${w.name} taking office on ${w.start} — after this entry was verified (June 2026).`;
      const p = getEntity(c.from);
      if (p) p.attrs = { ...(p.attrs || {}), staleNote: `Wikidata records ${w.name} as ${role} since ${fmtDay(w.start)}. This profile was last verified in June 2026, so roles and facts below may be out of date.` };
      superseded++;
    }
    // A new head of government usually means a new cabinet: flag curated ministers too.
    const closedEarlier = relsOfType(placeId, type, 'in').some((x) => !x.origin && /^Term end inferred from Wikidata/.test(x.note || ''));
    if ((curated.length || closedEarlier) && type === 'head_of_government') {
      const ministers = relsOfType(placeId, 'holds_office', 'in').filter((x) => !x.origin && !x.validTo);
      for (const m of ministers) {
        const p = getEntity(m.from);
        if (p) p.attrs = { ...(p.attrs || {}), staleNote: `${place.name} has had a new ${lcRole(role)} (${w.name}) since ${fmtDay(w.start)}. This person’s role (“${m.role}”) was last verified in June 2026 and may have changed.` };
      }
      if (ministers.length) (notes[placeId] ||= []).push(`The ${lcRole(role)} changed on ${fmtDay(w.start)} (per Wikidata). Other officeholders below were verified in June 2026 and may since have been replaced: ${ministers.map((m) => `${getEntity(m.from)?.name} (${m.role})`).join(', ')}.`);
    }
    const pid = personFor(w, placeId, role);
    rels.push({ from: pid, to: placeId, type, role, validFrom: w.start, sourceId: 'wikidata' });
    added++;
  };

  const hos = current(d.hos), hog = current(d.hog), gov = current(d.governors);
  for (const [iso, h] of hos) reconcile(`country:${iso}`, 'head_of_state', h, d.offices[iso]?.hos || 'Head of state', () => true);
  for (const [iso, h] of hog) reconcile(`country:${iso}`, 'head_of_government', h, d.offices[iso]?.hog || 'Head of government', () => true);
  for (const [code, h] of gov) {
    const st = getEntity(`state:${code}`); if (!st) continue;
    reconcile(st.id, 'leads', h, `Governor of ${st.name}`, (x) => /governor/i.test(x.role || ''));
  }
  for (const e of entities.values()) if ((e.type === 'country' || e.type === 'state') && (e.attrs?.leaderNotes || notes[e.id])) e.attrs = { ...(e.attrs || {}), leaderNotes: notes[e.id] || [] };
  setLiveRels('wikidata-leaders', rels);
  setLiveRels('wikidata-parties', partyRels);
  return `${added} leaders added from Wikidata, ${matched} matched curated records, ${superseded} curated terms closed`;
}

function findParty(name: string, countryId: string) {
  const want = normName(name.replace(/\s*\(.*\)$/, ''));
  for (const r of relsOfType(countryId, 'party_in', 'in')) {
    const p = getEntity(r.from); if (!p) continue;
    if ([p.name, p.name.replace(/\s*\(.*\)$/, ''), ...(p.aliases || [])].some((n) => normName(n) === want)) return p.id;
  }
  return undefined;
}

// ───────────────────────── Conflicts ─────────────────────────
async function loadConflicts() {
  const r = await conflicts();
  const rels: NewRel[] = []; const seen = new Set<string>();
  for (const c of r.data.rows) {
    const id = `event:conflict-${c.slug}`;
    if (seen.has(id)) continue; seen.add(id);
    const def = INTENSITY[c.intensity];
    const latest = c.yearly.at(-1);
    const url = c.article ? `https://en.wikipedia.org/wiki/${encodeURIComponent(c.article.replace(/ /g, '_'))}` : r.data.url;
    upsertEntity({
      id, type: 'event', name: c.name, depth: 'baseline', aliases: c.article && c.article !== c.name ? [c.article] : [],
      summary: `${def.label} — ${def.deaths} — according to Wikipedia’s List of ongoing armed conflicts${c.start ? `; began ${c.start}` : ''}. Fighting located in ${c.locations.map((l) => l.name).join(', ')}.${c.subConflicts.length ? ` Includes: ${c.subConflicts.slice(0, 6).join('; ')}.` : ''}`,
      facts: [
        fct('Intensity', `${def.label} (${def.deaths})`, 'wikipedia-conflicts', 'community'),
        ...(c.start ? [fct('Began', c.start, 'wikipedia-conflicts', 'community')] : []),
        ...c.yearly.map((y) => fct(`Combat-related deaths, ${y.year}`, y.deaths, 'wikipedia-conflicts', 'estimate', { period: y.year, note: 'As tabulated on Wikipedia from ACLED/UCDP and other cited sources; the current year is year-to-date.' })),
        ...(c.cumulative ? [fct('Cumulative deaths', c.cumulative, 'wikipedia-conflicts', 'estimate')] : []),
        fct('Locations', c.locations.map((l) => l.name).join(', '), 'wikipedia-conflicts', 'community'),
      ],
      attrs: { category: 'conflict', status: 'ongoing', intensity: c.intensity, date: c.start, startYear: c.start, url, latestDeaths: latest, yearly: c.yearly, subConflicts: c.subConflicts, continent: c.continent, origin: 'wikipedia' },
      sources: ['wikipedia-conflicts'],
    } as Entity);
    for (const l of c.locations) if (l.id) rels.push({ from: id, to: l.id, type: 'affects', role: 'Location of fighting', sourceId: 'wikipedia-conflicts' });
  }
  for (const e of entities.values()) if (e.id.startsWith('event:conflict-') && e.attrs?.status === 'ongoing' && !seen.has(e.id)) e.attrs = { ...e.attrs, status: 'no longer listed' };
  setLiveRels('wp-conflicts', rels);
  return `${seen.size} conflicts`;
}

// ───────────────────────── Elections ─────────────────────────
async function loadElections() {
  const y = new Date().getFullYear();
  const cals = await Promise.allSettled([electionCalendar(y), electionCalendar(y + 1)]);
  const rows = cals.flatMap((c) => (c.status === 'fulfilled' ? c.value.data.rows : []));
  if (!rows.length) throw new Error((cals[0] as PromiseRejectedResult).reason?.message || 'No election calendar');
  const curatedElections = [...entities.values()].filter((e) => e.type === 'event' && e.attrs?.category === 'election' && e.attrs?.origin !== 'wikipedia');
  const rels: NewRel[] = []; let n = 0;
  for (const row of rows) {
    if (!row.countryId) continue;
    const near = (d: string) => Math.abs(Date.parse(d) - Date.parse(row.date)) <= 5 * 86400_000;
    if (curatedElections.some((e) => near(String(e.attrs?.date)) && relsOfType(e.id, 'affects', 'out').some((x) => x.to === row.countryId))) continue;
    const iso = row.countryId.split(':')[1];
    const id = `event:el-${row.date}-${iso.toLowerCase()}-${slugify(row.office).slice(0, 40)}`;
    const country = getEntity(row.countryId)!;
    const name = row.article && /^\d{4} /.test(row.article) ? row.article : `${row.year} ${country.name} election — ${row.office}`;
    const end = row.endDate || row.date;
    const status = end < today() ? 'outcome-not-recorded' : 'scheduled';
    const url = row.article ? `https://en.wikipedia.org/wiki/${encodeURIComponent(row.article.replace(/ /g, '_'))}` : `https://en.wikipedia.org/wiki/${row.year}_national_electoral_calendar`;
    upsertEntity({
      id, type: 'event', name, depth: 'baseline',
      summary: `${row.office} — ${country.name}, ${fmtDay(row.date)}${row.endDate ? ` to ${fmtDay(row.endDate)}` : ''}. From Wikipedia’s ${row.year} national electoral calendar; dates can move, and results are not recorded here — see the linked article.`,
      facts: [fct('Date', row.endDate ? `${row.date} – ${row.endDate}` : row.date, 'wikipedia-elections', 'community'), fct('Category', 'election', 'wikipedia-elections', 'community'), fct('Office / body', row.office, 'wikipedia-elections', 'community'), fct('Status', status.replace(/-/g, ' '), 'wikipedia-elections', 'community'), fct('Location', country.name, 'wikipedia-elections', 'community')],
      attrs: { date: row.date, endDate: row.endDate, category: 'election', status, office: row.office, url, origin: 'wikipedia' }, sources: ['wikipedia-elections'],
    } as Entity);
    rels.push({ from: id, to: row.countryId, type: 'affects', sourceId: 'wikipedia-elections' });
    n++;
  }
  setLiveRels('wp-elections', rels);
  return `${n} national elections (${y}–${y + 1})`;
}

// ───────────────────────── Orchestration ─────────────────────────
let running: Promise<void> | null = null;
export function refreshLiveData() {
  if (running) return running;
  running = (async () => {
    const steps: [string, () => Promise<string>][] = [['congress', loadCongress], ['leaders', loadLeaders], ['conflicts', loadConflicts], ['elections', loadElections]];
    for (const [name, fn] of steps) {
      try { liveStatus[name] = { ok: true, at: new Date().toISOString(), detail: await fn() }; }
      catch (e: any) { liveStatus[name] = { ok: false, at: new Date().toISOString(), detail: e.message }; console.warn(`[live] ${name} failed: ${e.message}`); }
    }
    console.log(`[live] ${Object.entries(liveStatus).map(([k, v]) => `${k}: ${v.ok ? v.detail : 'FAILED'}`).join(' · ')}`);
  })().finally(() => { running = null; });
  return running;
}
export function startLiveData() {
  setTimeout(() => { void refreshLiveData(); }, 300);
  setInterval(() => { void refreshLiveData(); }, 12 * 3600_000).unref();
}

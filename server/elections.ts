// Election details from Wikipedia (CC BY-SA), kept current:
//   • results, status and turnout from each election article's infobox — refreshed every
//     30 minutes for elections within days of polling day, every 12 hours otherwise;
//   • candidates (linked to person and party profiles);
//   • local races: US governor, US Senate and big-city mayoral elections, plus mayoral
//     elections in curated world cities;
//   • candidate policies on request: each party's stated ideology and position, and the
//     candidate's "Political positions" article or section.
// Everything is labelled community (Wikipedia) and cross-checked with trusted-news reports.
import crypto from 'node:crypto';
import { cached, fetchJson } from './cache.js';
import { entities, getEntity, upsertEntity, setLiveRels, relsOfType, findPerson, stub } from './graph.js';
import { findParty, liveStatus } from './augment.js';
import { parseElectionInfobox, electionOutcome, parsePartyInfobox, sentences, type ElectionInfo, type Contender } from './electionParse.js';
import { plain } from './worldEvents.js';
import { USER_AGENT } from './config.js';
import type { Entity, Fact, Relationship } from '../shared/types.js';

const WP = 'https://en.wikipedia.org/w/api.php';
const WP_UA = { 'User-Agent': USER_AGENT };
const SRC = 'wikipedia-election-results';
const today = () => new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const wikiUrl = (t: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

// ───────────────────────── Wikipedia batch API ─────────────────────────
export interface WikiPage { requested: string; title: string; content?: string; extract?: string; revTimestamp?: string; missing?: boolean; }

/** Resolve requested titles through the API's "normalized" and "redirects" lists. */
export function mapPages(requested: string[], q: any, field: 'content' | 'extract'): WikiPage[] {
  const norm = new Map<string, string>((q?.normalized || []).map((n: any) => [n.from, n.to]));
  const redir = new Map<string, string>((q?.redirects || []).map((n: any) => [n.from, n.to]));
  const pages = new Map<string, any>((q?.pages || []).map((p: any) => [p.title, p]));
  return requested.map((r) => {
    let t = norm.get(r) || r; t = redir.get(t) || t;
    const p = pages.get(t);
    if (!p || p.missing || p.invalid) return { requested: r, title: t, missing: true };
    return field === 'content'
      ? { requested: r, title: p.title, content: p.revisions?.[0]?.slots?.main?.content ?? p.revisions?.[0]?.content, revTimestamp: p.revisions?.[0]?.timestamp }
      : { requested: r, title: p.title, extract: p.extract };
  });
}

async function wikiBatch(titles: string[], field: 'content' | 'extract', ttlSec: number) {
  const out: WikiPage[] = []; let fetchedAt = new Date().toISOString(); let stale = false;
  const size = field === 'content' ? 50 : 20;
  for (let i = 0; i < titles.length; i += size) {
    const chunk = titles.slice(i, i + size);
    const r = await cached(`wpb:${field}:${hash(chunk.join('|'))}`, ttlSec, async () => {
      const params = field === 'content'
        ? 'prop=revisions&rvprop=content|timestamp&rvslots=main'
        : 'prop=extracts&exintro=1&explaintext=1&exlimit=20';
      const j = await fetchJson(`${WP}?action=query&${params}&format=json&formatversion=2&redirects=1&titles=${encodeURIComponent(chunk.join('|'))}`, WP_UA, 40000);
      if (j?.error) throw new Error(j.error.info || 'Wikipedia API error');
      return mapPages(chunk, j?.query, field);
    });
    out.push(...r.data);
    if (r.fetchedAt < fetchedAt) fetchedAt = r.fetchedAt; stale ||= r.stale;
  }
  return { pages: out, fetchedAt, stale };
}

// ───────────────────────── Which article describes an election ─────────────────────────
const CURATED_ARTICLES: Record<string, string> = {
  'event:us-midterms-2026': '2026 United States House of Representatives elections',
  'event:pa-governor-2026': '2026 Pennsylvania gubernatorial election',
  'event:brazil-election-2026': '2026 Brazilian general election',
};
export function articleOf(e: Entity): string | undefined {
  if (e.attrs?.article) return e.attrs.article;
  if (CURATED_ARTICLES[e.id]) return CURATED_ARTICLES[e.id];
  const u: string | undefined = e.attrs?.url;
  if (u && /en\.wikipedia\.org\/wiki\//.test(u)) {
    const t = decodeURIComponent(u.split('/wiki/')[1]).replace(/_/g, ' ');
    if (!/electoral calendar|List of /i.test(t)) return t;
  }
  return undefined;
}
const isElection = (e: Entity) => e.type === 'event' && e.attrs?.category === 'election';
const placeOf = (e: Entity) => relsOfType(e.id, 'affects', 'out').map((r) => getEntity(r.to)).find((x) => x && ['country', 'state', 'city'].includes(x.type));
const countryOf = (id?: string): string | undefined => {
  let cur = id ? getEntity(id) : undefined;
  while (cur && cur.type !== 'country') cur = cur.parentId ? getEntity(cur.parentId) : undefined;
  return cur?.id;
};

// ───────────────────────── Applying an infobox to an election ─────────────────────────
type NewRel = Omit<Relationship, 'id' | 'origin'>;
const candidateRels = new Map<string, NewRel[]>(); // per election id, combined into one live batch

function personFor(c: Contender, e: Entity, countryId?: string): string | undefined {
  if (!c.name) return undefined;
  const linkName = c.link?.replace(/\s*\(.*\)$/, '');
  const found = findPerson([c.name, ...(linkName ? [linkName] : [])]);
  if (found) return found;
  if (!c.link) return undefined; // no article: listed on the election only
  const id = `person:wp-${slugify(c.link).slice(0, 60)}`;
  if (!getEntity(id)) {
    upsertEntity({
      id, type: 'person', name: linkName || c.name, depth: 'baseline', aliases: c.name !== linkName ? [c.name] : [],
      summary: `Candidate in the ${e.name}${c.party ? ` (${c.party})` : ''}. Added from the election’s Wikipedia article.`,
      facts: [{ label: 'Candidate in', value: e.name, sourceId: SRC, quality: 'community' }, ...(c.party ? [{ label: 'Party', value: c.party, sourceId: SRC, quality: 'community' } as Fact] : [])],
      attrs: { origin: 'wikipedia', wikipedia: c.link, nationality: countryOf(countryId) ? getEntity(countryOf(countryId)!)?.name : undefined }, sources: [SRC],
    } as Entity);
  }
  return id;
}

export function applyElectionInfo(e: Entity, article: string, info: ElectionInfo, meta: { fetchedAt: string; revTimestamp?: string; stale?: boolean }, knownPlace?: Entity) {
  const out = electionOutcome(info);
  const place = knownPlace || placeOf(e);
  const countryId = countryOf(place?.id);
  const prevStatus = e.attrs?.status;
  const status = out.status === 'completed' ? 'completed' : out.status === 'counting' ? 'results-pending' : prevStatus === 'outcome-not-recorded' ? 'scheduled' : (prevStatus || 'scheduled');
  const contenders = out.ranked.slice(0, 10).map((c) => ({ ...c, personId: personFor(c, e, place?.id), partyId: c.party && countryId ? findParty(c.party, countryId) || (c.partyLink ? findParty(c.partyLink, countryId) : undefined) : undefined }));
  e.attrs = {
    ...(e.attrs || {}), status, article, url: wikiUrl(article),
    election: {
      article, url: wikiUrl(article), title: info.title, legislative: info.legislative, dates: info.dates, turnout: info.turnout, majority: info.majority,
      pollsUrl: info.pollsArticle && !info.pollsArticle.startsWith('#') ? wikiUrl(info.pollsArticle) : info.pollsArticle ? `${wikiUrl(article)}${info.pollsArticle}` : undefined,
      before: info.before, winner: out.winner, status: out.status, contenders, fetchedAt: meta.fetchedAt, revTimestamp: meta.revTimestamp, stale: meta.stale,
    },
  };
  if (!e.attrs.date && info.dates[0]) e.attrs.date = info.dates[0];
  if (!e.attrs.endDate && info.dates.length > 1) e.attrs.endDate = info.dates.at(-1);
  const facts = (e.facts || []).filter((f) => f.sourceId !== SRC);
  const fct = (label: string, value: string | number, o: Partial<Fact> = {}): Fact => ({ label, value, sourceId: SRC, quality: 'community', retrievedAt: meta.fetchedAt, ...o });
  if (out.winner) {
    const lead = out.leader;
    facts.unshift(fct(info.legislative ? 'Result — largest party / head of government' : 'Winner', `${out.winner.name}${out.winner.party ? ` (${out.winner.party})` : ''}`,
      { note: lead && (lead.pct != null || lead.seats != null) ? `Top result: ${lead.name || lead.party}${lead.pct != null ? ` ${lead.pct}%` : ''}${lead.seats != null ? `, ${lead.seats} seats` : ''}. Per the Wikipedia article (revision ${meta.revTimestamp?.slice(0, 16).replace('T', ' ') || 'latest'} UTC); official results come from the electoral authority.` : undefined }));
  } else if (out.status === 'counting') facts.unshift(fct('Result', 'Counting or results not final', { note: out.leader ? `Leading so far per Wikipedia: ${out.leader.name || out.leader.party}${out.leader.pct != null ? ` (${out.leader.pct}%)` : ''}.` : undefined }));
  if (info.turnout != null) facts.push(fct('Turnout', `${info.turnout}%`));
  if (contenders.length && out.status === 'scheduled') facts.push(fct('Main candidates', contenders.slice(0, 6).map((c) => `${c.name || c.party}${c.party && c.name ? ` (${c.party})` : ''}`).join('; ')));
  e.facts = facts.map((f) => (f.label === 'Status' ? { ...f, value: status.replace(/-/g, ' '), note: `From the election article’s infobox, retrieved ${meta.fetchedAt.slice(0, 16).replace('T', ' ')} UTC.` } : f));
  candidateRels.set(e.id, contenders.filter((c) => c.personId).map((c) => ({ from: c.personId!, to: e.id, type: 'candidate_in', role: c.party, sourceId: SRC })));
  return out;
}

function flushCandidateRels() { setLiveRels('election-candidates', [...candidateRels.values()].flat()); }

// ───────────────────────── Refresh loop ─────────────────────────
let lastDetails: { at: string; hot: number; cold: number; updated: number } | null = null;
export async function refreshElectionDetails() {
  const hotFrom = dayOffset(-10), hotTo = dayOffset(2);
  const from = dayOffset(-150), to = dayOffset(430);
  const items = [...entities.values()].filter(isElection).map((e) => ({ e, article: articleOf(e), date: String(e.attrs?.endDate || e.attrs?.date || '') }))
    .filter((x) => x.article && x.date >= from && x.date <= to);
  const hot = items.filter((x) => x.date >= hotFrom && x.date <= hotTo), cold = items.filter((x) => !hot.includes(x));
  let updated = 0;
  for (const [list, ttl] of [[hot, 1800], [cold, 12 * 3600]] as const) {
    if (!list.length) continue;
    const r = await wikiBatch([...new Set(list.map((x) => x.article!))], 'content', ttl);
    const byReq = new Map(r.pages.map((p) => [p.requested, p]));
    for (const x of list) {
      const p = byReq.get(x.article!);
      if (!p?.content) continue;
      const info = parseElectionInfobox(p.content);
      if (!info) continue;
      applyElectionInfo(x.e, p.title, info, { fetchedAt: r.fetchedAt, revTimestamp: p.revTimestamp, stale: r.stale });
      updated++;
    }
  }
  flushCandidateRels();
  lastDetails = { at: new Date().toISOString(), hot: hot.length, cold: cold.length, updated };
  return `${updated} election articles read (${hot.length} near polling day, refreshed every 30 min)`;
}

// ───────────────────────── Local elections ─────────────────────────
const MAYOR_TITLE: Record<string, string> = { 'Washington, D.C.': 'Washington, D.C.,' };
export function localElectionTitles(years: number[], states: string[], cities: { name: string; us: boolean }[]) {
  const out: { title: string; scope: 'state' | 'city'; office: string; place: string }[] = [];
  for (const y of years) {
    for (const st of states) {
      out.push({ title: `${y} ${st} gubernatorial election`, scope: 'state', office: 'Governor', place: st });
      out.push({ title: `${y} United States Senate election in ${st}`, scope: 'state', office: 'U.S. Senate', place: st });
      out.push({ title: `${y} United States Senate special election in ${st}`, scope: 'state', office: 'U.S. Senate (special)', place: st });
    }
    for (const c of cities) {
      out.push({ title: `${y} ${MAYOR_TITLE[c.name] || c.name} mayoral election`, scope: 'city', office: 'Mayor', place: c.name });
      if (!c.us) out.push({ title: `${y} ${c.name} municipal election`, scope: 'city', office: 'Municipal council & mayor', place: c.name });
    }
  }
  return out;
}

export async function loadLocalElections() {
  const y = new Date().getFullYear();
  const states = [...entities.values()].filter((e) => e.type === 'state' && e.parentId === 'country:USA' && !/Puerto Rico|Guam|Virgin|Samoa|Mariana|District of Columbia/.test(e.name));
  // Curated cities everywhere, plus US cities with a mayor on Wikidata (≥ 250,000 people).
  const cities = [...entities.values()].filter((e) => e.type === 'city' && (e.depth === 'curated' || (e.attrs?.mayorSource && (e.parentId?.startsWith('state:US-') || e.parentId === 'country:USA'))));
  const usCity = (c: Entity) => c.parentId?.startsWith('state:US-') || c.parentId === 'country:USA';
  const wanted = localElectionTitles([y - 1, y, y + 1], states.map((s) => s.name), cities.map((c) => ({ name: c.name, us: usCity(c) })));
  // Elections already described elsewhere (national calendar, curated) are not duplicated as local ones.
  const known = new Set([...entities.values()].filter((e) => isElection(e) && e.attrs?.origin !== 'wikipedia-local').map((e) => articleOf(e)).filter(Boolean));
  const r = await wikiBatch(wanted.map((w) => w.title), 'content', 12 * 3600);
  const from = dayOffset(-150), to = dayOffset(430);
  const rels: NewRel[] = []; let n = 0;
  const seen = new Set<string>();
  for (const [i, p] of r.pages.entries()) {
    const w = wanted[i];
    if (!p.content || seen.has(p.title) || known.has(p.title)) continue;
    const info = parseElectionInfobox(p.content); if (!info?.dates.length) continue;
    const date = info.dates[0], end = info.dates.at(-1)!;
    if (end < from || date > to) continue;
    seen.add(p.title);
    const place = w.scope === 'state' ? states.find((s) => s.name === w.place) : cities.find((c) => c.name === w.place);
    if (!place) continue;
    const id = `event:local-${slugify(p.title).slice(0, 80)}`;
    const held = end < today();
    const e = upsertEntity({
      id, type: 'event', name: p.title, depth: 'baseline',
      summary: `${w.office} election — ${place.name}, ${date}${end !== date ? ` to ${end}` : ''}. Candidates and results from the Wikipedia article; official results come from the election authority.`,
      facts: [{ label: 'Date', value: end !== date ? `${date} – ${end}` : date, sourceId: SRC, quality: 'community' }, { label: 'Office', value: w.office, sourceId: SRC, quality: 'community' }, { label: 'Status', value: held ? 'outcome not recorded' : 'scheduled', sourceId: SRC, quality: 'community' }],
      attrs: { category: 'election', scope: w.scope === 'state' ? 'state' : 'city', office: w.office, date, endDate: end !== date ? end : undefined, status: held ? 'outcome-not-recorded' : 'scheduled', article: p.title, url: wikiUrl(p.title), origin: 'wikipedia-local' },
      sources: [SRC],
    } as Entity);
    rels.push({ from: id, to: place.id, type: 'affects', sourceId: SRC });
    if (w.scope === 'city' && place.parentId?.startsWith('state:')) rels.push({ from: id, to: place.parentId, type: 'affects', sourceId: SRC });
    applyElectionInfo(e, p.title, info, { fetchedAt: r.fetchedAt, revTimestamp: p.revTimestamp, stale: r.stale }, place);
    n++;
  }
  setLiveRels('wp-local-elections', rels);
  flushCandidateRels();
  return { detail: `${n} state and city elections (${y - 1}–${y + 1}) from ${wanted.length} possible article titles`, fetchedAt: r.fetchedAt, stale: r.stale };
}

// ───────────────────────── Candidate policies (on request) ─────────────────────────
const POSITION_SECTION = /^(political positions|political views|positions|platform|policies|policy positions|political stances|campaign positions|views)$/i;

async function positionsSection(title: string) {
  return cached(`wp:positions:${title}`, 7 * 86400, async () => {
    const sec = await fetchJson(`${WP}?action=parse&page=${encodeURIComponent(title)}&prop=sections&format=json&formatversion=2&redirects=1`, WP_UA, 20000);
    const s = (sec?.parse?.sections || []).find((x: any) => POSITION_SECTION.test(plain(x.line || '')));
    if (!s) return null;
    const body = await fetchJson(`${WP}?action=parse&page=${encodeURIComponent(title)}&section=${s.index}&prop=wikitext&format=json&formatversion=2&redirects=1`, WP_UA, 20000);
    const text = plain(String(body?.parse?.wikitext || '').replace(/^=+[^=\n]+=+\s*$/gm, ' ').replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, ''));
    return text ? { text: sentences(text, 700)!, url: `${wikiUrl(title)}#${encodeURIComponent(String(s.anchor || s.line).replace(/ /g, '_'))}`, heading: plain(s.line) } : null;
  });
}

export async function electionCandidates(id: string) {
  const e = getEntity(id);
  if (!e || !isElection(e)) return null;
  const el = e.attrs?.election;
  const article = articleOf(e);
  if (!el && !article) return { id, unavailable: true, reason: 'No Wikipedia article is linked to this election yet, so candidates and results are not available.' };
  const contenders: any[] = (el?.contenders || []).slice(0, 8);
  const partyTitles = [...new Set(contenders.map((c) => c.partyLink).filter(Boolean))] as string[];
  const posTitles = contenders.filter((c) => c.link).map((c) => `Political positions of ${c.link.replace(/\s*\(.*\)$/, '')}`);
  const [lead, parties, positions] = await Promise.all([
    article ? wikiBatch([article], 'extract', 24 * 3600).catch(() => null) : null,
    partyTitles.length ? wikiBatch(partyTitles, 'content', 7 * 86400).catch(() => null) : null,
    posTitles.length ? wikiBatch(posTitles, 'extract', 7 * 86400).catch(() => null) : null,
  ]);
  const partyInfo = new Map((parties?.pages || []).filter((p) => p.content).map((p) => [p.requested, { ...parsePartyInfobox(p.content!), title: p.title }]));
  const posByReq = new Map((positions?.pages || []).filter((p) => p.extract).map((p) => [p.requested, p]));
  let sectionCalls = 0;
  const rows = [];
  for (const c of contenders) {
    const pi = c.partyLink ? partyInfo.get(c.partyLink) : undefined;
    const pos = c.link ? posByReq.get(`Political positions of ${c.link.replace(/\s*\(.*\)$/, '')}`) : undefined;
    let positionsText: { text: string; url: string; kind: 'article' | 'section'; heading?: string } | undefined;
    if (pos?.extract) positionsText = { text: sentences(pos.extract, 700)!, url: wikiUrl(pos.title), kind: 'article' };
    else if (c.link && sectionCalls < 6) {
      sectionCalls++;
      try { const s = (await positionsSection(c.link)).data; if (s) positionsText = { ...s, kind: 'section' }; } catch { /* optional */ }
    }
    rows.push({
      name: c.name, party: c.party, partyId: c.partyId, partyUrl: pi?.title ? wikiUrl(pi.title) : c.partyLink ? wikiUrl(c.partyLink) : undefined,
      personId: c.personId, person: c.personId ? stub(c.personId) : null, url: c.link ? wikiUrl(c.link) : undefined, runningMate: c.runningMate,
      ideology: pi?.ideology || [], position: pi?.position, international: pi?.international, positions: positionsText,
      votes: c.votes, pct: c.pct, seats: c.seats, seatsBefore: c.seatsBefore, electoralVotes: c.electoralVotes, firstRoundPct: c.firstRoundPct,
    });
  }
  return {
    id, article, url: article ? wikiUrl(article) : undefined, lead: sentences(lead?.pages[0]?.extract, 900), status: el?.status, winner: el?.winner, legislative: el?.legislative,
    before: el?.before, turnout: el?.turnout, majority: el?.majority, pollsUrl: el?.pollsUrl, revTimestamp: el?.revTimestamp, fetchedAt: el?.fetchedAt,
    candidates: rows, sourceId: SRC,
  };
}

export function electionDetailsStatus() { return lastDetails; }

export function startElectionDetails() {
  const run = async () => {
    try { liveStatus['election-results'] = { ok: true, at: new Date().toISOString(), detail: await refreshElectionDetails(), sourceId: SRC }; }
    catch (e: any) { liveStatus['election-results'] = { ok: false, at: new Date().toISOString(), detail: e.message, sourceId: SRC }; }
  };
  setInterval(() => { void run(); }, 30 * 60_000).unref();
  return run;
}

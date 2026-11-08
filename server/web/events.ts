// Meetings, summits and conferences of the organizations in the knowledge web, from Wikidata: any
// upcoming event that one of them organizes, that belongs to a series one of them organizes, or
// that is part of one of them. Nothing here names an organization or a summit: the list follows the
// web (server/web/wikidata.ts). The economic calendar merges these with its hand-checked IGO dates,
// which win where both describe the same meeting.
import { cached } from '../cache.js';
import { entityByQid, listByType } from '../graph.js';
import { registerConnector } from './connectors.js';
import { sparql, qidOf, wdDate } from './wikidata.js';

export interface OrgEvent { qid: string; title: string; start: string; end?: string; placeIds: string[]; location?: string; url: string; }

export function eventsQuery(orgQids: string[], from: string, to: string) {
  return `SELECT ?ev ?evLabel ?start ?end ?org ?country ?locLabel WHERE {
  VALUES ?org { ${orgQids.map((q) => `wd:${q}`).join(' ')} }
  { ?ev wdt:P664 ?org . } UNION { ?ev wdt:P179 ?series . ?series wdt:P664 ?org . } UNION { ?ev wdt:P179 ?series . ?series wdt:P361 ?org . } UNION { ?ev wdt:P361 ?org . }
  { ?ev wdt:P580 ?start . } UNION { ?ev wdt:P585 ?start . }
  FILTER(?start >= "${from}T00:00:00Z"^^xsd:dateTime && ?start <= "${to}T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?ev wdt:P582 ?end . }
  OPTIONAL { ?ev wdt:P17 ?country . }
  OPTIONAL { ?ev wdt:P276 ?loc . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

/** One event per Wikidata item, with the organizations and host country that are in the web. Events
 *  with only a year (Wikidata stores those as 1 January), without an English name, or not tied to an
 *  organization in the web are left out. */
export function parseOrgEvents(rows: any[], placeOf: (qid: string) => string | undefined): OrgEvent[] {
  const by = new Map<string, OrgEvent>();
  for (const b of rows) {
    const qid = qidOf(b.ev?.value); const title = String(b.evLabel?.value || '');
    if (!qid || !title || /^Q\d+$/.test(title)) continue;
    const start = wdDate(b.start?.value); if (!start || start.length !== 10) continue;
    const end = wdDate(b.end?.value);
    const ev = by.get(qid) || by.set(qid, { qid, title, start, placeIds: [], url: `https://www.wikidata.org/wiki/${qid}` }).get(qid)!;
    if (start < ev.start) ev.start = start;
    if (end && end.length === 10 && end > ev.start && (!ev.end || end > ev.end)) ev.end = end;
    for (const q of [qidOf(b.org?.value), qidOf(b.country?.value)]) { const id = q ? placeOf(q) : undefined; if (id && !ev.placeIds.includes(id)) ev.placeIds.push(id); }
    const loc = b.locLabel?.value; if (loc && !/^Q\d+$/.test(loc)) ev.location ||= loc;
  }
  return [...by.values()].filter((e) => e.placeIds.some((p) => p.startsWith('igo:'))).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

let events: OrgEvent[] = [];
/** Upcoming meetings found in Wikidata (empty until the connector has run). */
export const liveOrgEvents = () => events;
export function setOrgEventsForTest(e: OrgEvent[]) { events = e; }

registerConnector({
  id: 'wikidata-events', label: 'Wikidata — meetings and summits', sourceIds: ['wikidata'], everyHours: 24, delaySec: 75,
  provides: 'Upcoming summits, conferences and meetings of the organizations in the web, for the economic calendar',
  run: async () => {
    const orgs = [...new Set(listByType('igo').map((e) => e.attrs?.wikidata).filter((q): q is string => typeof q === 'string' && /^Q\d+$/.test(q)))];
    if (!orgs.length) throw new Error('No organizations with Wikidata ids in the web yet');
    const from = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 400 * 86400_000).toISOString().slice(0, 10);
    const r = await cached(`wd:org-events:v1:${from}`, 24 * 3600, async () => {
      const rows: any[] = [];
      for (let i = 0; i < orgs.length; i += 120) rows.push(...(await sparql(eventsQuery(orgs.slice(i, i + 120), from, to))));
      return rows;
    });
    events = parseOrgEvents(r.data, (q) => entityByQid(q));
    const orgCount = new Set(events.flatMap((e) => e.placeIds.filter((p) => p.startsWith('igo:')))).size;
    return { detail: `${events.length} upcoming meetings of ${orgCount} organizations`, fetchedAt: r.fetchedAt, stale: r.stale };
  },
});

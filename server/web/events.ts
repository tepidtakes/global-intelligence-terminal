// Meetings, summits and conferences of the organizations in the knowledge web, from Wikidata: any
// upcoming event that one of them organizes, that belongs to a series one of them organizes, or
// that is part of one of them. Nothing here names an organization or a summit: the list follows the
// web (server/web/wikidata.ts). The economic calendar merges these with its hand-checked IGO dates,
// which win where both describe the same meeting.
import crypto from 'node:crypto';
import { cached } from '../cache.js';
import { entityByQid, listByType } from '../graph.js';
import { registerConnector, runConnector, onConnectorRun } from './connectors.js';
import { sparql, qidOf } from './wikidata.js';

export interface OrgEvent { qid: string; title: string; start: string; end?: string; placeIds: string[]; location?: string; url: string; }

// Dates are asked for with their precision: Wikidata stores "March 2027" as 1 March and "2027" as
// 1 January, and only a date known to the day belongs on a calendar.
export function eventsQuery(orgQids: string[], from: string, to: string) {
  return `SELECT ?ev ?evLabel ?start ?startPrec ?end ?endPrec ?org ?country ?locLabel WHERE {
  VALUES ?org { ${orgQids.map((q) => `wd:${q}`).join(' ')} }
  { ?ev wdt:P664 ?org . } UNION { ?ev wdt:P179 ?series . ?series wdt:P664 ?org . } UNION { ?ev wdt:P179 ?series . ?series wdt:P361 ?org . } UNION { ?ev wdt:P361 ?org . }
  { ?ev p:P580 ?st . ?st a wikibase:BestRank ; psv:P580 ?sv . } UNION { ?ev p:P585 ?st . ?st a wikibase:BestRank ; psv:P585 ?sv . }
  ?sv wikibase:timeValue ?start ; wikibase:timePrecision ?startPrec .
  FILTER(?start >= "${from}T00:00:00Z"^^xsd:dateTime && ?start <= "${to}T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?ev p:P582 ?est . ?est a wikibase:BestRank ; psv:P582 ?endv . ?endv wikibase:timeValue ?end ; wikibase:timePrecision ?endPrec . }
  OPTIONAL { ?ev wdt:P17 ?country . }
  OPTIONAL { ?ev wdt:P276 ?loc . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

const DAY_PRECISION = 11; // Wikidata: 9 = year, 10 = month, 11 = day
const exactDay = (value: unknown, precision: unknown) => (Number(precision) >= DAY_PRECISION && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined);
/** One event per Wikidata item, with the organizations and host country that are in the web. Events
 *  whose start is known only to the month or year, without an English name, or not tied to an
 *  organization in the web are left out; an end date known only to the month is ignored. */
export function parseOrgEvents(rows: any[], placeOf: (qid: string) => string | undefined): OrgEvent[] {
  const by = new Map<string, OrgEvent>();
  for (const b of rows) {
    const qid = qidOf(b.ev?.value); const title = String(b.evLabel?.value || '');
    if (!qid || !title || /^Q\d+$/.test(title)) continue;
    const start = exactDay(b.start?.value, b.startPrec?.value); if (!start) continue;
    const end = exactDay(b.end?.value, b.endPrec?.value);
    const ev = by.get(qid) || by.set(qid, { qid, title, start, placeIds: [], url: `https://www.wikidata.org/wiki/${qid}` }).get(qid)!;
    if (start < ev.start) ev.start = start;
    if (end && end > ev.start && (!ev.end || end > ev.end)) ev.end = end;
    for (const q of [qidOf(b.org?.value), qidOf(b.country?.value)]) { const id = q ? placeOf(q) : undefined; if (id && !ev.placeIds.includes(id)) ev.placeIds.push(id); }
    const loc = b.locLabel?.value; if (loc && !/^Q\d+$/.test(loc)) ev.location ||= loc;
  }
  return [...by.values()].filter((e) => e.placeIds.some((p) => p.startsWith('igo:'))).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

let events: OrgEvent[] = [];
/** Upcoming meetings found in Wikidata (empty until the connector has run). */
export const liveOrgEvents = () => events;
export function setOrgEventsForTest(e: OrgEvent[]) { events = e; }

// The organizations get their Wikidata ids from the organizations connector, so this one runs right
// after each of its successful runs (and daily); the delayed first run is only a fallback.
registerConnector({
  id: 'wikidata-events', label: 'Wikidata — meetings and summits', sourceIds: ['wikidata'], everyHours: 24, delaySec: 300,
  provides: 'Upcoming summits, conferences and meetings of the organizations in the web, for the economic calendar',
  run: async () => {
    const orgs = [...new Set(listByType('igo').map((e) => e.attrs?.wikidata).filter((q): q is string => typeof q === 'string' && /^Q\d+$/.test(q)))].sort();
    if (!orgs.length) throw new Error('Waiting for the organizations connector: no organization in the web has a Wikidata id yet');
    // One cached answer per set of organizations, re-asked daily (the dates in the query move with
    // it), so yesterday's answer stands in when Wikidata cannot be reached. The window starts where
    // the calendar's look-back does: a meeting stays listed while it is under way and afterwards.
    const r = await cached(`wd:org-events:v3:${crypto.createHash('sha1').update(orgs.join(' ')).digest('hex').slice(0, 12)}`, 24 * 3600, async () => {
      const from = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10), to = new Date(Date.now() + 400 * 86400_000).toISOString().slice(0, 10);
      const rows: any[] = [];
      for (let i = 0; i < orgs.length; i += 120) rows.push(...(await sparql(eventsQuery(orgs.slice(i, i + 120), from, to))));
      return rows;
    });
    events = parseOrgEvents(r.data, (q) => entityByQid(q));
    const orgCount = new Set(events.flatMap((e) => e.placeIds.filter((p) => p.startsWith('igo:')))).size;
    return { detail: `${events.length} upcoming meetings of ${orgCount} organizations`, fetchedAt: r.fetchedAt, stale: r.stale };
  },
});
onConnectorRun((id, ok, changed) => { if (id === 'wikidata-organizations' && ok && changed) void runConnector('wikidata-events').catch(() => undefined); });

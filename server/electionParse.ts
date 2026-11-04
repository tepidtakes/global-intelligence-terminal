// Pure parsers for election data on Wikipedia (CC BY-SA): the {{Infobox election}} template
// (candidates, parties, votes, seats, before/after officeholders), {{Infobox political party}}
// (ideology, position) and wiki dates. No I/O — checked offline by npm run check:parsers.
import { plain, firstLink } from './worldEvents.js';

/** Inner text of the first {{<name> …}} template, with nested templates and links kept intact. */
export function extractTemplate(text: string, name: RegExp): string | undefined {
  const re = new RegExp(`\\{\\{\\s*${name.source}`, 'i');
  const m = re.exec(text); if (!m) return undefined;
  let depth = 0;
  for (let i = m.index; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; continue; }
    if (text[i] === '}' && text[i + 1] === '}') { depth--; i++; if (depth === 0) return text.slice(m.index + 2, i - 1); }
  }
  return undefined;
}

/** Template parameters split on top-level "|" (pipes inside [[links]] and {{templates}} are kept). */
export function templateParams(inner: string): Record<string, string> {
  const parts: string[] = []; let cur = ''; let curly = 0, square = 0;
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === '{{') { curly++; cur += two; i++; continue; }
    if (two === '}}') { curly--; cur += two; i++; continue; }
    if (two === '[[') { square++; cur += two; i++; continue; }
    if (two === ']]') { square--; cur += two; i++; continue; }
    if (inner[i] === '|' && curly === 0 && square === 0) { parts.push(cur); cur = ''; continue; }
    cur += inner[i];
  }
  parts.push(cur);
  const out: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    if (/^[\w\s-]+$/.test(k)) out[k] = p.slice(eq + 1).trim();
  }
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n: number | string) => String(n).padStart(2, '0');
/** All ISO dates written in a wiki value: {{Start date|2026|11|3}}, "3 November 2026", "November 3, 2026". */
export function wikiDates(v: string): string[] {
  const out: string[] = [];
  for (const m of v.matchAll(/\{\{\s*(?:start date|end date|election date|date)[^|}]*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/gi)) out.push(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  const text = plain(v.replace(/\{\{\s*(?:start date|end date)[^}]*\}\}/gi, ''));
  for (const m of text.matchAll(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g)) { const mi = MONTHS.indexOf(m[2].toLowerCase()); if (mi >= 0) out.push(`${m[3]}-${pad(mi + 1)}-${pad(m[1])}`); }
  for (const m of text.matchAll(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/g)) { const mi = MONTHS.indexOf(m[1].toLowerCase()); if (mi >= 0) out.push(`${m[3]}-${pad(mi + 1)}-${pad(m[2])}`); }
  return [...new Set(out)].sort();
}

const num = (v?: string) => {
  if (!v) return undefined;
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(plain(v).replace(/[−–]/g, '-'));
  if (!m) return undefined;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const linkLabel = (v?: string) => (v ? plain(v).replace(/\s*\(.*?\)\s*$/, '').trim() || undefined : undefined);

export interface Contender {
  name?: string; link?: string; party?: string; partyLink?: string; alliance?: string; runningMate?: string;
  votes?: number; pct?: number; seats?: number; seatsBefore?: number; electoralVotes?: number; firstRoundPct?: number;
}
export interface ElectionInfo {
  title?: string; type?: string; ongoing?: boolean; dates: string[]; turnout?: number; majority?: number; pollsArticle?: string;
  before?: { name?: string; link?: string; party?: string }; after?: { name?: string; link?: string; party?: string };
  contenders: Contender[]; legislative: boolean;
}

/** Parse {{Infobox election}} from an article's wikitext. */
export function parseElectionInfobox(wikitext: string): ElectionInfo | undefined {
  const inner = extractTemplate(wikitext, /Infobox (?:election|legislative election)/);
  if (!inner) return undefined;
  const p = templateParams(inner);
  const contenders: Contender[] = [];
  for (let n = 1; n <= 12; n++) {
    const nameRaw = p[`candidate${n}`] || p[`leader${n}`] || p[`nominee${n}`];
    const partyRaw = p[`party${n}`] || p[`alliance${n}`];
    if (!nameRaw && !partyRaw) continue;
    // Two-round systems often put rounds in 1dataN / 2dataN with headings.
    const rounds = [1, 2, 3].map((r) => p[`${r}data${n}`]).filter(Boolean);
    const pctRound = rounds.map((r) => { const m = /(\d+(?:\.\d+)?)\s*%/.exec(plain(r!)); return m ? Number(m[1]) : undefined; }).filter((x) => x != null) as number[];
    contenders.push({
      name: nameRaw ? linkLabel(nameRaw) : undefined, link: nameRaw ? firstLink(nameRaw) : undefined,
      party: partyRaw ? linkLabel(partyRaw) : undefined, partyLink: partyRaw ? firstLink(partyRaw) || (/\[\[|\{\{/.test(partyRaw) ? undefined : plain(partyRaw) || undefined) : undefined,
      alliance: p[`alliance${n}`] && p[`party${n}`] ? linkLabel(p[`alliance${n}`]) : undefined,
      runningMate: p[`running_mate${n}`] ? linkLabel(p[`running_mate${n}`]) : undefined,
      votes: num(p[`popular_vote${n}`]), pct: num(p[`percentage${n}`]) ?? pctRound.at(-1),
      seats: num(p[`seats_after${n}`] ?? p[`seats${n}`]), seatsBefore: num(p[`seats_before${n}`]),
      electoralVotes: num(p[`electoral_vote${n}`]), firstRoundPct: pctRound.length > 1 ? pctRound[0] : undefined,
    });
  }
  const person = (k: string, pk: string) => p[k] ? { name: linkLabel(p[k]), link: firstLink(p[k]), party: p[pk] ? linkLabel(p[pk]) : undefined } : undefined;
  const type = (p.type || '').toLowerCase();
  const legislative = /parliament|legislat|house|assembly|general|senate|council|congress/.test(type) || (!contenders.some((c) => c.votes != null && c.electoralVotes != null) && contenders.some((c) => c.seats != null || c.seatsBefore != null));
  const polls = p.opinion_polls ? firstLink(p.opinion_polls) : undefined;
  return {
    title: p.title ? plain(p.title) : undefined, type: type || undefined,
    ongoing: p.ongoing ? /^y/i.test(plain(p.ongoing)) : undefined,
    dates: wikiDates(p.election_date || p.date || ''), turnout: num(p.turnout), majority: num(p.majority_seats),
    pollsArticle: polls, before: person('before_election', 'before_party'), after: person('after_election', 'after_party'),
    contenders, legislative,
  };
}

/** Result reading of an infobox: who won, and whether counting is finished. */
export function electionOutcome(info: ElectionInfo, today = new Date().toISOString().slice(0, 10)) {
  const end = info.dates.at(-1);
  const held = !!end && end <= today;
  const ranked = [...info.contenders].sort((a, b) => (info.legislative ? (b.seats ?? -1) - (a.seats ?? -1) : 0) || (b.electoralVotes ?? -1) - (a.electoralVotes ?? -1) || (b.votes ?? -1) - (a.votes ?? -1) || (b.pct ?? -1) - (a.pct ?? -1));
  const hasResults = info.contenders.some((c) => c.votes != null || c.pct != null || (info.legislative && c.seats != null && held));
  const leader = hasResults ? ranked[0] : undefined;
  // The "after" officeholder is the article's stated outcome; when absent, the top result.
  const placeholder = /^(tbd|tba|to be (determined|announced)|vacant|—|-)?$/i;
  const winner = held && info.after?.name && !placeholder.test(info.after.name.trim()) ? info.after : undefined;
  const status: 'scheduled' | 'counting' | 'completed' = !held ? 'scheduled' : info.ongoing && !winner ? 'counting' : hasResults || winner ? 'completed' : 'counting';
  return { held, status, winner, leader, ranked: hasResults ? ranked : info.contenders };
}

/** {{Infobox political party}}: ideology list and left–right position, as written in the article. */
export function parsePartyInfobox(wikitext: string) {
  const inner = extractTemplate(wikitext, /Infobox (?:political party|political organization|U\.S\. political party|Political party)/);
  if (!inner) return undefined;
  const p = templateParams(inner);
  const list = (v?: string) => {
    if (!v) return [];
    const cleaned = v.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/\{\{(?:efn|refn|sfn|nbsp)[^{}]*\}\}/gi, '');
    const links = [...cleaned.matchAll(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g)].map((m) => m[1].trim());
    const items = links.length ? links : plain(cleaned).split(/,|·|\n/).map((x) => x.trim());
    return [...new Set(items.filter((x) => x && x.length < 60 && !/^\d+$/.test(x)))].slice(0, 6);
  };
  return { ideology: list(p.ideology), position: plain((p.position || '').replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<br\s*\/?>/gi, '; ')).replace(/\s*;\s*$/, '') || undefined, international: p.international ? linkLabel(p.international) : undefined, europarl: p.europarl ? linkLabel(p.europarl) : undefined };
}

/** First sentences of a plain-text extract, cut at a sentence boundary. */
export function sentences(text: string | undefined, max = 520) {
  if (!text) return undefined;
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max); const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('." '));
  return (end > 120 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`);
}

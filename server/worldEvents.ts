// Armed conflicts and national elections, parsed from two continuously maintained
// Wikipedia lists (CC BY-SA 4.0): "List of ongoing armed conflicts" (which itself cites
// ACLED and UCDP for casualty figures) and "<year> national electoral calendar".
// Parsing is defensive: a row we cannot read is skipped, never guessed at.
import { cached, fetchJson } from './cache.js';
import { countryIdByName, getEntity } from './graph.js';
import { USER_AGENT } from './config.js';
import { createHash } from 'node:crypto';

const WP_UA = { 'User-Agent': USER_AGENT };

// Wikipedia limits how fast one client may call its API (HTTP 429 when exceeded). All calls
// go through one queue: one request at a time, a short gap between them, and a back-off
// (honouring Retry-After) when Wikipedia asks us to slow down.
let wpChain: Promise<unknown> = Promise.resolve();
let wpNext = 0;
const WP_GAP_MS = 750;
function wpJson(url: string): Promise<any> {
  const job = wpChain.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = wpNext - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      wpNext = Date.now() + WP_GAP_MS;
      try { return await fetchJson(url, WP_UA, 60000); }
      catch (e: any) {
        // Retry when asked to slow down (429), on server errors (5xx) and on dropped connections.
        const retryable = /^(429|5\d\d)\b/.test(e.message) || /fetch failed|timeout|aborted|ECONNRESET|socket/i.test(e.message);
        if (!retryable || attempt >= 4) throw e;
        wpNext = Date.now() + 5000 * (attempt + 1);
      }
    }
  });
  wpChain = job.catch(() => {});
  return job;
}

async function wikitext(page: string) {
  const json = await wpJson(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext|revid&format=json&formatversion=2&redirects=1`);
  if (!json?.parse?.wikitext) throw new Error(json?.error?.info || `Wikipedia page "${page}" unavailable`);
  return { text: json.parse.wikitext as string, revid: json.parse.revid as number, title: json.parse.title as string };
}

const fmtInt = (s: string) => { const n = Number(String(s).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n.toLocaleString('en-US') : s; };

/** Wikitext → plain text (links to their labels, templates and refs removed). */
export function plain(s: string) {
  return s
    .replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{nts\|([^}|]+)[^}]*\}\}/gi, (_, n) => fmtInt(n))
    .replace(/\{\{(?:flag|flagcountry|flagu)\|([^}|]+)[^}]*\}\}/gi, '$1')
    .replace(/\{\{(?:nowrap|small)\|([^{}]*)\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '').replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
const firstLink = (s: string) => /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/.exec(s)?.[1]?.trim();

// ───────────────────────── Conflicts ─────────────────────────
export type Intensity = 'major-war' | 'minor-war' | 'conflict' | 'skirmish';
export const INTENSITY: Record<Intensity, { label: string; table: string; rank: number; deaths: string }> = {
  'major-war': { label: 'Major war', table: 'conflicts10000', rank: 4, deaths: '10,000+ deaths in the current or previous year' },
  'minor-war': { label: 'Minor war', table: 'conflicts1000', rank: 3, deaths: '1,000–9,999 deaths in the current or previous year' },
  'conflict': { label: 'Conflict', table: 'conflicts100', rank: 2, deaths: '100–999 deaths in the current or previous year' },
  'skirmish': { label: 'Skirmishes & clashes', table: 'conflicts1', rank: 1, deaths: 'fewer than 100 deaths in the current and previous year' },
};

export interface ConflictRow {
  slug: string; name: string; article?: string; intensity: Intensity; start?: string; continent?: string;
  locations: { name: string; id?: string; disputed: boolean }[]; subConflicts: string[];
  /** Every article linked in the row's tree of sub-conflicts, nearest first; each is checked for its own infobox. */
  theatreLinks: { article: string; label: string; depth: number }[];
  cumulative?: string; yearly: { year: string; deaths: number }[];
}

function cellsOf(row: string) {
  const cells: string[] = [];
  for (const line of row.split('\n')) {
    if (/^\|[-}+]/.test(line) || line.startsWith('!')) continue;
    if (line.startsWith('|')) for (const part of line.slice(1).split('||')) cells.push(part);
    else if (cells.length) cells[cells.length - 1] += '\n' + line;
  }
  // Drop cell attributes such as `style="text-align:center;" |`.
  return cells.map((c) => c.replace(/^\s*(?:[a-z-]+\s*=\s*(?:"[^"]*"|[^\s|]+)\s*)+\|(?!\|)/i, '').trim());
}

export function parseConflicts(text: string): ConflictRow[] {
  const out: ConflictRow[] = [];
  for (const [intensity, def] of Object.entries(INTENSITY) as [Intensity, typeof INTENSITY[Intensity]][]) {
    const start = text.indexOf(`id="${def.table}"`);
    if (start < 0) continue;
    const end = text.indexOf('\n|}', start);
    const table = text.slice(start, end < 0 ? undefined : end);
    const header = [...table.matchAll(/^!\s*(?:[^|\n]*\|)?\s*([^\n]+)$/gm)].map((m) => plain(m[1]));
    const years = header.map((h) => /(\d{4}) fatalities/i.exec(h)?.[1]).filter(Boolean) as string[];
    for (const row of table.split(/\n\|-[^\n]*/).slice(1)) {
      const cells = cellsOf(row);
      if (cells.length < 4) continue;
      const locIdx = cells.findIndex((c) => /\{\{flag/i.test(c));
      if (locIdx < 1) continue;
      const conflictCell = cells.slice(0, locIdx).find((c) => /\[\[/.test(c) && plain(c).length > 12) || cells[1];
      const startCell = cells.slice(0, locIdx).find((c) => /^\s*\d{4}/.test(plain(c)));
      const continentCell = cells[locIdx - 1] !== conflictCell ? cells[locIdx - 1] : undefined;
      const bullets = conflictCell.split('\n').filter((l) => /^\*/.test(l.trim()));
      const top = bullets[0] ?? conflictCell;
      const name = plain(top.replace(/^\*+/, ''));
      if (!name) continue;
      const locations = [...cells[locIdx].matchAll(/(''\s*)?\{\{flag[a-z]*\|([^}|]+)[^}]*\}\}/gi)].map((m) => {
        const n = m[2].trim(); const id = countryIdByName(n);
        return { name: n, id, disputed: !!m[1] };
      });
      const after = cells.slice(locIdx + 1);
      const num = (c?: string) => { if (!c) return undefined; const m = /\{\{nts\|([\d,]+)/.exec(c) || /^\s*([\d,]{1,9})/.exec(plain(c)); const n = m ? Number(m[1].replace(/,/g, '')) : NaN; return Number.isFinite(n) ? n : undefined; };
      const yearly = years.map((y, i) => ({ year: y, deaths: num(after[1 + i]) })).filter((x) => x.deaths != null) as { year: string; deaths: number }[];
      const article = firstLink(top);
      const theatreLinks: ConflictRow['theatreLinks'] = []; const seenLinks = new Set<string>();
      for (const b of bullets) {
        const depth = (/^\*+/.exec(b.trim())?.[0].length || 1);
        for (const m of b.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)) {
          const target = m[1].trim(); if (/^(File|Image|Category):/i.test(target) || seenLinks.has(target)) continue;
          seenLinks.add(target); theatreLinks.push({ article: target, label: (m[2] || target).trim(), depth });
        }
      }
      out.push({
        slug: (article || name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80),
        name: name.replace(/\s*\(\s*\)\s*$/, ''), article, intensity, start: startCell ? plain(startCell).slice(0, 4) : undefined,
        continent: continentCell ? plain(continentCell) : undefined, locations,
        subConflicts: bullets.filter((b) => /^\*\*[^*]/.test(b.trim()) || /^\*\*\*[^*]/.test(b.trim())).map((b) => plain(b.replace(/^\*+/, ''))).filter(Boolean).slice(0, 12),
        theatreLinks, cumulative: after[0] ? plain(after[0]) || undefined : undefined, yearly,
      });
    }
  }
  return out;
}

export async function conflicts() {
  return cached('wp:conflicts:v2', 12 * 3600, async () => {
    const page = await wikitext('List of ongoing armed conflicts');
    const rows = parseConflicts(page.text);
    if (rows.length < 10) throw new Error('Conflict list could not be parsed');
    return { rows, revid: page.revid, url: 'https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts', sourceId: 'wikipedia-conflicts' };
  });
}

// ───────────────────────── War sides (belligerents) ─────────────────────────
// Each war article's "Infobox military conflict" lists the sides as combatant1, combatant2,
// combatant3 (plus 1a/1b… sub-rows). The box is written inline, invoked as a module
// ({{#invoke:Infobox military conflict|main}}) or kept in its own template
// ({{2026 Iran war infobox}}); all three are handled.

export interface Participant {
  name: string; link?: string; flag?: string; iso3?: string;
  depth: number;                       // 1 = listed directly; 2+ = member of the entry above it
  role: 'main' | 'support' | 'other';  // 'other' = a labelled group such as "Attacked by Israel"
  roleLabel?: string; former: boolean; note?: string;
}
export interface WarInfo {
  title: string; name: string; partOf: string[]; start?: string; status: string; ongoing: boolean;
  sides: { index: number; participants: Participant[] }[]; places: string[]; url: string;
}

/** The {{…}} template starting at `start`, braces balanced. */
function balanced(text: string, start: number) {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; }
    else if (text[i] === '}' && text[i + 1] === '}') { depth--; i++; if (depth === 0) return text.slice(start, i + 1); }
  }
  return text.slice(start);
}
/** Remove every {{name…}} template (with nested braces) whose name matches. */
function dropTemplates(text: string, name: RegExp) {
  let out = text;
  for (let guard = 0; guard < 500; guard++) {
    const m = new RegExp(`\\{\\{\\s*(?:${name.source})`, 'i').exec(out);
    if (!m) break;
    const t = balanced(out, m.index);
    out = out.slice(0, m.index) + out.slice(m.index + t.length);
  }
  return out;
}
const NOISE = /efn|refn|sfn|#tag:\s*ref|citation needed|cn\b|better source|assassinated|KIA|POW|executed|dagger|ref label|note label|nowrap begin|nowrap end/;

export function findInfobox(text: string) {
  const m = /\{\{\s*(?:#invoke:\s*)?Infobox military conflict/i.exec(text);
  return m ? balanced(text, m.index) : null;
}
/** Name of a separate "<something> infobox" template the article transcludes, if any. */
export function infoboxTemplateName(text: string) {
  const m = /\{\{\s*([^{}|#:\n]*?\binfobox)\s*[|}]/i.exec(text);
  return m && !/^infobox military conflict$/i.test(m[1].trim()) ? m[1].trim() : null;
}

/** Split template content at its own top-level `|` (ignoring | inside nested {{…}} and [[…]]). */
function splitTop(inner: string) {
  const parts: string[] = []; let cur = ''; let braces = 0, brackets = 0;
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === '{{') { braces++; cur += two; i++; continue; }
    if (two === '}}') { braces--; cur += two; i++; continue; }
    if (two === '[[') { brackets++; cur += two; i++; continue; }
    if (two === ']]') { brackets--; cur += two; i++; continue; }
    if (inner[i] === '|' && braces === 0 && brackets === 0) { parts.push(cur); cur = ''; continue; }
    cur += inner[i];
  }
  parts.push(cur);
  return parts;
}

/** Split the box into its |key = value parameters (only at the box's own nesting level). */
export function infoboxParams(box: string) {
  const parts = splitTop(box.replace(/^\{\{/, '').replace(/\}\}$/, ''));
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) { const eq = p.indexOf('='); if (eq > 0) params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim(); }
  return params;
}

const cleanField = (v: string) => dropTemplates(v.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ''), NOISE);

// Country-code templates in infoboxes use Olympic (IOC) codes where they differ from ISO.
const IOC_TO_ISO: Record<string, string> = {
  NIG: 'NER', GER: 'DEU', NED: 'NLD', SUI: 'CHE', POR: 'PRT', RSA: 'ZAF', KSA: 'SAU', UAE: 'ARE', IRI: 'IRN', ALG: 'DZA', ANG: 'AGO', BAN: 'BGD',
  CHA: 'TCD', CRO: 'HRV', DEN: 'DNK', GRE: 'GRC', INA: 'IDN', KUW: 'KWT', LIB: 'LBN', MAS: 'MYS', PHI: 'PHL', VIE: 'VNM', MYA: 'MMR', SUD: 'SDN',
  LBA: 'LBY', BUR: 'BFA', CGO: 'COG', COD: 'COD', ZAM: 'ZMB', ZIM: 'ZWE', TAN: 'TZA', OMA: 'OMN', BRN: 'BHR', BHR: 'BHR', GUI: 'GIN', MTN: 'MRT', TOG: 'TGO',
  SRI: 'LKA', NEP: 'NPL', HAI: 'HTI', URU: 'URY', PAR: 'PRY', CHI: 'CHL', CRC: 'CRI', ESA: 'SLV', HON: 'HND', GUA: 'GTM', NCA: 'NIC', TPE: 'TWN',
};
/** Inline wiki markup inside a name: {{nbh}} → hyphen, dashes, quotes; other templates dropped. */
const tidyName = (s: string) => s.replace(/\{\{\s*(?:nbh|nb hyphen)\s*\}\}/gi, '-').replace(/\{\{\s*(?:ndash|snd|spaced ndash)\s*\}\}/gi, '–')
  .replace(/\{\{\s*'\s*\}\}/g, "'").replace(/\{\{[^{}]*\}\}/g, '').replace(/'''?/g, '').replace(/\s+/g, ' ').trim();

/** One list entry → a participant name (flag template, country code, or the first link). */
function entryName(item: string): Omit<Participant, 'depth' | 'role' | 'roleLabel' | 'former'> | null {
  const link = /\[\[(?!File:|Image:)([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/i.exec(item);
  const invoke = /\{\{\s*#invoke:\s*flag\s*\|([^{}]*)\}\}/i.exec(item);
  const flagT = /\{\{\s*(?:flag|flagcountry|flagu|flag country)\s*\|([^{}|]+)[^{}]*\}\}/i.exec(item);
  const flagicon = /\{\{\s*flag ?icon\s*\|([^{}|]+)[^{}]*\}\}/i.exec(item);
  const code = /\{\{\s*([A-Z]{3})\s*\}\}/.exec(item);
  const note = /\(([^()]*\b(?:from|until|since|before|after|\d{4})\b[^()]*)\)/i.exec(plain(item))?.[1] || /\(([A-Za-z.–\- ]{2,30})\)\s*$/.exec(plain(item))?.[1];
  let name: string | undefined, flag: string | undefined, linkTarget: string | undefined, iso3: string | undefined;
  if (invoke) { const args = invoke[1].split('|').map((a) => a.trim()).filter((a) => a && !a.includes('=')); flag = args.at(-1); }
  if (flagT) flag = flagT[1].trim();
  if (!flag && flagicon && !link) flag = flagicon[1].trim();
  if (code) iso3 = IOC_TO_ISO[code[1]] || code[1];
  if (link) { linkTarget = link[1].trim(); name = tidyName(link[2] || link[1]); }
  // A flag template names the participant itself; a flag icon only decorates the linked name.
  if (flag && (!link || invoke || flagT)) { name = flag; linkTarget = flag; }
  if (iso3 && !link && !flag) name = getEntity(`country:${iso3}`)?.name || iso3;
  if (!name) { const p = plain(item).replace(/\([^)]*\)/g, '').trim(); if (p.length >= 2 && p.length <= 60 && !/^\d/.test(p)) name = p; }
  if (!name) return null;
  return { name: name.replace(/\s+/g, ' '), link: linkTarget, flag, iso3, note: note?.trim() };
}

/** Replace list templates ({{ubl|a|b}}, {{plainlist|…}}, {{tree list}}…) with one item per line. */
function expandLists(text: string) {
  let t = text.replace(/\{\{\s*(?:tree ?list\/end|end ?plain ?list|end ?flat ?list)\s*\}\}/gi, '\n');
  for (let guard = 0; guard < 200; guard++) {
    const m = /\{\{\s*(?:#invoke:\s*)?(?:ubl|unbulleted list|bulleted list|blist|indented plain ?list|plain ?list|flat ?list|tree ?list|collaps[ai]ble list|hlist|list)\b/i.exec(t);
    if (!m) break;
    const full = balanced(t, m.index);
    const isModule = /^\{\{\s*#invoke/i.test(full);
    const items = splitTop(full.slice(2, -2)).slice(isModule ? 2 : 1).filter((p) => !/^\s*(title|class|style|framestyle|liststyle|titlestyle|indent|expand|bullets)\s*=/i.test(p));
    t = `${t.slice(0, m.index)}\n${items.join('\n')}\n${t.slice(m.index + full.length)}`;
  }
  return t;
}

/** "2006–2009", "(2013–2023)", "2003–11": a year range that ended before this year. "2009–present" has not. */
function endedRange(text: string) {
  const only = /\b((?:19|20)\d\d) only\b/i.exec(text);
  if (only) return Number(only[1]) < new Date().getFullYear();
  const m = /\b((?:19|20)\d\d)\s*[–-]\s*((?:19|20)?\d\d)\b(?!\s*[–-])/.exec(text);
  if (!m || /present/i.test(text.slice(m.index, m.index + m[0].length + 10))) return false;
  const end = m[2].length === 2 ? Number(m[1].slice(0, 2) + m[2]) : Number(m[2]);
  return end >= Number(m[1]) && end < new Date().getFullYear();
}

export function parseSide(raw: string): Participant[] {
  const t = expandLists(cleanField(raw).replace(/<hr\s*\/?>/gi, '\n').replace(/<br\s*\/?>/gi, '\n'));
  const out: Participant[] = []; let role: Participant['role'] = 'main'; let roleLabel: string | undefined;
  let period: { note: string; ended: boolean } | undefined; // set by year-range headings such as "2013–2023:"
  for (const raw of t.split('\n')) {
    const line = raw.trim();
    if (!line || /^\}\}$/.test(line)) continue;
    // A sub-heading ("'''Supported by:'''", "Military support:", "Attacked by Israel:") sets the
    // role of the entries below it; it is never a participant itself.
    const text = plain(line.replace(/^\*+\s*/, ''));
    const boldOnly = /^'''[^']+'''\s*:?\s*$/.test(line.replace(/^\*+\s*/, '')) && !/\[\[|\{\{/.test(line);
    // "Military support", "Diplomatic support", "…other support" are headings even without a colon.
    const supportHeading = /^(?:\.{2,}\s*)?(?:(?:military|diplomatic|financial|logistical|political|humanitarian|material|intelligence|air|naval|other|limited|non-combat)\s+(?:(?:and|&)\s+\w+\s+)?)?support(?:ed by)?(?:\s*\([^)]*\))?\s*:?$/i.test(text);
    if ((/:\s*$/.test(text) && text.length <= 60) || boldOnly || supportHeading) {
      const h = text.replace(/:\s*$/, '').trim();
      // A period heading ("2013–2023", "(2023–present)", "Since 2022") dates the entries below it.
      if (/^\(?\s*(?:since |from |until )?(?:19|20)\d\d\s*(?:[–-]\s*(?:(?:19|20)?\d\d|present)?)?\s*\)?$/i.test(h)) {
        period = { note: h.replace(/[()]/g, ''), ended: endedRange(h) || /^until /i.test(h) };
        role = 'main'; roleLabel = undefined;
        continue;
      }
      if (/support|backed|assist|aid(ed)? by|allies/i.test(h)) { role = 'support'; roleLabel = undefined; }
      else { role = 'other'; roleLabel = h; }
      continue;
    }
    const depth = /^\*+/.exec(line)?.[0].length || 1;
    const e = entryName(line.replace(/^\*+\s*/, ''));
    if (!e || !/[A-Za-z]{2}/.test(e.name) || /^(commanders?|strength|casualties|belligerents|see below|none)$/i.test(e.name)) continue;
    const former = /\b(until|formerly|former|withdrew|left in|dissolved|defected)\b/i.test(`${e.note || ''} ${plain(line)}`) || endedRange(`${e.note || ''} ${plain(line)}`);
    out.push({ ...e, depth, role, roleLabel, former: former || !!period?.ended, note: e.note || period?.note });
    if (out.length >= 40) break;
  }
  return out;
}

export function parseWarInfo(title: string, box: string): WarInfo {
  const p = infoboxParams(box);
  const sides = new Map<number, Participant[]>();
  for (const [k, v] of Object.entries(p)) {
    const m = /^combatant(\d)([a-z]?)$/.exec(k); if (!m || !v.trim()) continue;
    const idx = Number(m[1]); const list = sides.get(idx) || sides.set(idx, []).get(idx)!;
    for (const part of parseSide(v)) if (!list.some((x) => x.name === part.name)) list.push(part);
  }
  // Status is often "Ongoing" followed by a list of related crises: keep them apart.
  const statusParts = expandLists(cleanField(p.status || p.result || '').replace(/<br\s*\/?>/gi, '\n')).split('\n').map((s) => plain(s.replace(/^\*+\s*/, ''))).filter((s) => s && s.length > 1);
  const status = statusParts.length > 1 ? `${statusParts[0]} — related: ${statusParts.slice(1, 6).join('; ')}` : statusParts[0] || '';
  const date = cleanField(p.date || '');
  const datePlain = plain(expandLists(date));
  const ongoing = /ongoing/i.test(status) || /present|ongoing/i.test(datePlain);
  const sd = /\{\{\s*start date[^|]*\|(\d{4})(?:\|(\d{1,2}))?(?:\|(\d{1,2}))?/i.exec(date);
  const dm = /\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/.exec(datePlain)
    || /\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\b/.exec(datePlain);
  const MONTH = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const fromDm = dm ? (/^\d/.test(dm[1]) ? `${dm[3]}-${String(MONTH.indexOf(dm[2].toLowerCase()) + 1).padStart(2, '0')}-${dm[1].padStart(2, '0')}` : `${dm[3]}-${String(MONTH.indexOf(dm[1].toLowerCase()) + 1).padStart(2, '0')}-${dm[2].padStart(2, '0')}`) : undefined;
  const start = sd ? [sd[1], sd[2]?.padStart(2, '0'), sd[3]?.padStart(2, '0')].filter(Boolean).join('-') : fromDm || /\b(1[89]\d\d|20\d\d)\b/.exec(datePlain)?.[1];
  const places = [...cleanField(p.place || '').matchAll(/\{\{\s*(?:#invoke:\s*flag\s*\|\|?|flag(?:country|u)?\s*\|)([^{}|]+)/gi)].map((m) => m[1].trim())
    .concat([...(p.place || '').matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()));
  return {
    title, name: plain(cleanField(p.conflict || '')) || title, partOf: [...(p.partof || '').matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()),
    start, status: status.length > 500 ? `${status.slice(0, 500).replace(/\s+\S*$/, '')}…` : status, ongoing, places: [...new Set(places)],
    sides: [...sides.entries()].sort((a, b) => a[0] - b[0]).map(([index, participants]) => ({ index, participants })).filter((s) => s.participants.length),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
  };
}

/** Current wikitext of many pages, 20 per request (Wikipedia counts requests, not pages).
 *  Returns requested title → { final title after redirects, text }. */
async function pagesContent(titles: string[], errors: string[] = []) {
  const out = new Map<string, { title: string; text: string }>();
  for (let i = 0; i < titles.length; i += 20) {
    const chunk = titles.slice(i, i + 20);
    let cont = '';
    for (let page = 0; page < 10; page++) {
      let json: any;
      try { json = await wpJson(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&redirects=1&titles=${encodeURIComponent(chunk.join('|'))}${cont}`); }
      catch (e: any) { errors.push(`${chunk.length} articles skipped: ${e.message}`.slice(0, 200)); break; } // skip this batch, keep the rest
      const alias = new Map<string, string>();
      for (const n of [...(json?.query?.normalized || []), ...(json?.query?.redirects || [])]) alias.set(n.from, n.to);
      const final = (t: string) => { let x = t; for (let k = 0; k < 4 && alias.has(x); k++) x = alias.get(x)!; return x; };
      const byTitle = new Map<string, string>();
      for (const p of json?.query?.pages || []) { const c = p.revisions?.[0]?.slots?.main?.content; if (c) byTitle.set(p.title, c); }
      for (const t of chunk) { const f = final(t); const c = byTitle.get(f); if (c && !out.has(t)) out.set(t, { title: f, text: c }); }
      if (!json?.continue) break;
      cont = Object.entries(json.continue).map(([k, v]) => `&${k}=${encodeURIComponent(String(v))}`).join('');
    }
  }
  return out;
}
const leadOf = (text: string) => { const i = text.search(/\n==[^=]/); return i < 0 ? text : text.slice(0, i); };

/** Sides, status and dates of many wars from their Wikipedia infoboxes. Cached as one batch
 *  for 24 hours; articles without a conflict infobox are simply absent (never guessed). */
export async function warInfos(articles: string[]) {
  const titles = [...new Set(articles)].sort();
  const key = `wp:wars:v11:${createHash('sha1').update(titles.join('|')).digest('hex')}`;
  const r = await cached(key, 24 * 3600, async () => {
    const errors: string[] = [];
    const pages = await pagesContent(titles, errors);
    // Nothing at all came back: fail, so the last good copy (if any) is used instead of an empty one.
    if (!pages.size) throw new Error(errors[0] || 'Wikipedia returned no pages');
    const infos: Record<string, WarInfo> = {};
    const viaTemplate = new Map<string, string>();
    for (const [a, p] of pages) {
      const lead = leadOf(p.text);
      const box = findInfobox(lead);
      if (box) infos[a] = parseWarInfo(p.title, box);
      else { const tpl = infoboxTemplateName(lead); if (tpl) viaTemplate.set(a, `Template:${tpl}`); }
    }
    if (viaTemplate.size) {
      const tpls = await pagesContent([...new Set(viaTemplate.values())]);
      for (const [a, tpl] of viaTemplate) { const t = tpls.get(tpl); const box = t && findInfobox(t.text); if (box) infos[a] = parseWarInfo(pages.get(a)!.title, box); }
    }
    return { infos, notFound: titles.filter((t) => !pages.has(t)), errors };
  });
  return { infos: new Map(Object.entries(r.data.infos)), failed: r.data.notFound.length, errors: (r.data.errors || []).concat(r.data.notFound.slice(0, 3).map((t) => `${t}: not loaded`)), stale: r.stale };
}

/** One war (used by checks). */
export async function warInfo(article: string) { return (await warInfos([article])).infos.get(article) || null; }

// ───────────────────────── National elections ─────────────────────────
export interface ElectionRow { date: string; endDate?: string; country: string; countryId?: string; office: string; article?: string; nonSovereign: boolean; year: string; }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parseElectionCalendar(text: string, year: string): ElectionRow[] {
  const out: ElectionRow[] = [];
  let month = -1; let pendingDate: { d1: string; d2?: string; m: number } | null = null;
  const parseEntry = (body: string, d: { d1: string; d2?: string; m: number }) => {
    const nonSovereign = /^\s*''/.test(body);
    const links = [...body.matchAll(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)].map((m) => ({ target: m[1].trim(), label: (m[2] ?? m[1]).trim() }));
    if (!links.length) return;
    const countryLink = links[0];
    const countryName = countryLink.label.replace(/[,;:]+$/, '').trim() || countryLink.target.replace(/^(Elections|Politics) (in|of) (the )?/i, '');
    const officeLink = links[1];
    const office = plain(body.slice(body.indexOf(']]') + 2)).replace(/^[,\s]+/, '').replace(/[''\s]+$/, '');
    const mm = String(d.m + 1).padStart(2, '0');
    out.push({
      date: `${year}-${mm}-${d.d1.padStart(2, '0')}`, endDate: d.d2 ? `${year}-${mm}-${d.d2.padStart(2, '0')}` : undefined,
      country: countryName, countryId: countryIdByName(countryName) || countryIdByName(countryLink.target.replace(/^(Elections|Politics) (in|of) /i, '')),
      office: office || 'Election', article: officeLink?.target, nonSovereign, year,
    });
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const h = /^==\s*([A-Za-z]+)\s*==$/.exec(line);
    if (h) { month = MONTHS.indexOf(h[1]); pendingDate = null; continue; }
    if (/^==/.test(line)) { month = -1; continue; }
    if (month < 0) continue;
    const top = /^\*(?!\*)\s*(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?\s+([A-Z][a-z]+)\s*:?\s*(.*)$/.exec(line);
    if (top) {
      const m = MONTHS.indexOf(top[3]); if (m < 0) continue;
      const d = { d1: top[1], d2: top[2], m };
      if (top[4] && /\[\[/.test(top[4])) { parseEntry(top[4], d); pendingDate = d; } else pendingDate = d;
      continue;
    }
    const sub = /^\*\*(?!\*)\s*(.*)$/.exec(line);
    if (sub && pendingDate) parseEntry(sub[1], pendingDate);
  }
  return out;
}

export async function electionCalendar(year: number) {
  return cached(`wp:elections:${year}`, 12 * 3600, async () => {
    const page = await wikitext(`${year} national electoral calendar`);
    return { rows: parseElectionCalendar(page.text, String(year)), revid: page.revid, url: `https://en.wikipedia.org/wiki/${year}_national_electoral_calendar`, sourceId: 'wikipedia-elections' };
  });
}

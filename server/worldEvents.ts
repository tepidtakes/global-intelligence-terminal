// Armed conflicts and national elections, parsed from two continuously maintained
// Wikipedia lists (CC BY-SA 4.0): "List of ongoing armed conflicts" (which itself cites
// ACLED and UCDP for casualty figures) and "<year> national electoral calendar".
// Parsing is defensive: a row we cannot read is skipped, never guessed at.
import { cached, fetchJson } from './cache.js';
import { countryIdByName } from './graph.js';
import { USER_AGENT } from './config.js';

const WP_UA = { 'User-Agent': USER_AGENT };

async function wikitext(page: string) {
  const json = await fetchJson(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext|revid&format=json&formatversion=2&redirects=1`, WP_UA, 30000);
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
export const firstLink = (s: string) => /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/.exec(s)?.[1]?.trim();

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
      out.push({
        slug: (article || name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80),
        name: name.replace(/\s*\(\s*\)\s*$/, ''), article, intensity, start: startCell ? plain(startCell).slice(0, 4) : undefined,
        continent: continentCell ? plain(continentCell) : undefined, locations,
        subConflicts: bullets.filter((b) => /^\*\*[^*]/.test(b.trim()) || /^\*\*\*[^*]/.test(b.trim())).map((b) => plain(b.replace(/^\*+/, ''))).filter(Boolean).slice(0, 12),
        cumulative: after[0] ? plain(after[0]) || undefined : undefined, yearly,
      });
    }
  }
  return out;
}

export async function conflicts() {
  return cached('wp:conflicts', 12 * 3600, async () => {
    const page = await wikitext('List of ongoing armed conflicts');
    const rows = parseConflicts(page.text);
    if (rows.length < 10) throw new Error('Conflict list could not be parsed');
    return { rows, revid: page.revid, url: 'https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts', sourceId: 'wikipedia-conflicts' };
  });
}

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

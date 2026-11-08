// Central-bank decision days read from each bank's own schedule page (Federal Reserve, ECB, Bank of
// England) instead of only a hand-entered list. A reading is used only when it agrees with the
// checked dates in econCalendar.ts (every checked date it covers is on the page) and every date is
// a weekday, so a redesigned page makes the calendar fall back to the checked list; it can never
// put a wrong date on it. Dates the page adds beyond the checked list (next year's meetings) are
// what this saves typing in by hand. Banks without a reader keep their checked list.
import { cached, fetchText } from './cache.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const monthOf = (s: string) => MONTHS.indexOf(s.toLowerCase().slice(0, 3));
const pad = (n: number) => String(n).padStart(2, '0');
function ymd(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m && t.getUTCDate() === d ? `${y}-${pad(m + 1)}-${pad(d)}` : undefined;
}
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** The visible text of an HTML page: one line per block element, entities decoded. */
export function pageText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h[1-6]|\/dt|\/dd|\/dl|\/table|\/section|\/article|\/header|\/footer)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&ndash;|&#8211;|&#x2013;/gi, '–').replace(/&mdash;|&#8212;/gi, '—').replace(/&amp;/gi, '&').replace(/&#39;|&rsquo;/gi, '’')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
/** Federal Reserve: "2027 FOMC Meetings", then a month ("January", "Apr/May") and days ("26-27",
 *  "16-17*" for meetings with projections, "30-1" across months). The decision is the last day.
 *  Minutes release dates ("Released November 18, 2026") and notation votes are not meetings. */
export function parseFomc(html: string): string[] {
  const text = pageText(html);
  const heads = [...text.matchAll(/\b(20\d\d) FOMC Meetings\b/g)];
  const out = new Set<string>();
  heads.forEach((h, i) => {
    const year = Number(h[1]);
    const sec = text.slice(h.index! + h[0].length, heads[i + 1]?.index ?? text.length);
    const re = new RegExp(`\\b${MON}(?:\\s*/\\s*${MON})?\\s+(\\d{1,2})(?:\\s*[-–]\\s*(\\d{1,2}))?\\*?(?!\\s*,\\s*\\d{4})(?![\\d/])`, 'g');
    for (const m of sec.matchAll(re)) {
      const before = sec.slice(Math.max(0, m.index! - 14), m.index!);
      const after = sec.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
      if (/released/i.test(before) || /^\s*\(?\s*(notation vote|unscheduled|cancel)/i.test(after)) continue;
      const m1 = monthOf(m[1]), m2 = m[2] ? monthOf(m[2]) : m1;
      const d1 = Number(m[3]), d2 = m[4] ? Number(m[4]) : d1;
      let endMonth = m2, endYear = year;
      if (!m[2] && d2 < d1) endMonth = m1 + 1; // "30-1" without a second month name
      if (endMonth > 11) { endMonth = 0; endYear++; }
      if (m2 < m1) endYear++;
      const date = ymd(endYear, endMonth, d2);
      if (date) out.add(date);
    }
  });
  return [...out].sort();
}

/** ECB: "dd/mm/yyyy" followed by what happens that day. The decision is the monetary policy meeting
 *  day with the press conference ("Day 2"); non-monetary policy meetings are not decisions. */
export function parseEcb(html: string): string[] {
  const text = pageText(html);
  const ms = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/g)];
  const out = new Set<string>();
  ms.forEach((m, i) => {
    const desc = text.slice(m.index! + m[0].length, ms[i + 1]?.index ?? text.length).slice(0, 300);
    if (!/monetary policy meeting/i.test(desc) || /non-monetary/i.test(desc) || !/press conference|day 2/i.test(desc)) return;
    const date = ymd(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (date) out.add(date);
  });
  return [...out].sort();
}

/** Bank of England: announcement days written "Thursday 4 February" under a year heading. The
 *  weekday must match the date, which also tells which year a row belongs to; "last updated" and
 *  "published" dates are not meetings. */
export function parseBoe(html: string): string[] {
  const text = pageText(html);
  const out = new Set<string>();
  const re = /\b(Monday|Tuesday|Wednesday|Thursday|Friday)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(20\d\d))?\b/g;
  for (const m of text.matchAll(re)) {
    if (/(updated|published|modified|posted)\W*(on\W*)?$/i.test(text.slice(Math.max(0, m.index! - 30), m.index!))) continue;
    const day = Number(m[2]), month = monthOf(m[3]), wd = WEEKDAYS.indexOf(m[1].toLowerCase());
    // The year: written out, else the last year mentioned before the row, or the one either side of
    // it (a weekday falls on a given date in at most one of three consecutive years).
    const prior = Number([...text.slice(0, m.index!).matchAll(/\b(20\d\d)\b/g)].at(-1)?.[1] || new Date().getUTCFullYear());
    const years = m[4] ? [Number(m[4])] : [prior, prior + 1, prior - 1];
    for (const y of years) { const d = ymd(y, month, day); if (d && weekday(d) === wd) { out.add(d); break; } }
  }
  return [...out].sort();
}

const PARSERS: Record<string, (html: string) => string[]> = { USA: parseFomc, XM: parseEcb, GBR: parseBoe };
export const hasSchedulePage = (area: string) => !!PARSERS[area];

/** Read a bank's schedule page (once a day). */
export function readSchedulePage(area: string, url: string) {
  const parse = PARSERS[area];
  if (!parse) throw new Error(`No reader for ${area}`);
  return cached(`econ:bank-page:${area}`, 24 * 3600, async () => parse(await fetchText(url, { Accept: 'text/html' }, 30000)));
}

/** Whether dates read from a page can be trusted: enough of them, weekdays only, no more than 16 a
 *  year, and every checked date in the span they cover is among them. */
export function acceptSchedule(read: string[], checked: string[]): { ok: true; dates: string[] } | { ok: false; reason: string } {
  const dates = [...new Set(read)].sort();
  if (dates.length < 3) return { ok: false, reason: `only ${dates.length} meeting date${dates.length === 1 ? '' : 's'} found on the page` };
  const weekend = dates.find((d) => weekday(d) === 0 || weekday(d) === 6);
  if (weekend) return { ok: false, reason: `the page reading gave a weekend date (${weekend})` };
  const perYear = new Map<string, number>(); for (const d of dates) perYear.set(d.slice(0, 4), (perYear.get(d.slice(0, 4)) || 0) + 1);
  const crowded = [...perYear].find(([, n]) => n > 16);
  if (crowded) return { ok: false, reason: `${crowded[1]} dates in ${crowded[0]} — more meetings than any bank holds` };
  const lo = dates[0], hi = dates.at(-1)!;
  const missing = checked.filter((d) => d >= lo && d <= hi && !dates.includes(d));
  if (missing.length) return { ok: false, reason: `the page does not list ${missing.slice(0, 3).join(', ')}, which the checked schedule has` };
  return { ok: true, dates };
}

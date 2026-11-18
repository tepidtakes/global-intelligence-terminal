// Central-bank decision days read from each bank's own schedule page (Federal Reserve, ECB, Bank of
// England) instead of only a hand-entered list. A page is free text read by a parser, so a reading
// is used only when it looks like a meeting schedule (acceptSchedule: weekdays, meetings at least
// three weeks apart, no more than eight a year, nothing years away) and agrees with the checked
// dates in econCalendar.ts wherever the two overlap. A reading that fails is not used at all, and
// the calendar says why; one that moved a checked meeting marks that meeting "to verify". Dates the
// page adds beyond the checked list are what this saves typing in by hand: the calendar labels them
// as read from the bank's page, and as unconfirmed once no checked date is left to compare with.
// Banks without a reader keep their checked list.
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
const dayNo = (date: string) => Math.round(Date.parse(`${date}T12:00:00Z`) / 86400_000);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The visible text of an HTML page: one line per block element, entities decoded. Comments,
 *  scripts and styles are not text. */
export function pageText(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h[1-6]|\/dt|\/dd|\/dl|\/table|\/section|\/article|\/header|\/footer)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&ndash;|&#8211;|&#x2013;/gi, '–').replace(/&mdash;|&#8212;/gi, '—').replace(/&amp;/gi, '&').replace(/&#39;|&rsquo;/gi, '’')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}
// A month name or its usual abbreviation, and nothing else: "Market 12" or "Decision 3" is not a date.
const MON = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const MONTH_CELL = new RegExp(`^${MON}(?:\\s*/\\s*${MON})?$`);
const DAYS_CELL = /^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\*?$/;
const MONTH_AND_DAYS = new RegExp(`^${MON}(?:\\s*/\\s*${MON})?\\s+(\\d{1,2})(?:\\s*[-–]\\s*(\\d{1,2}))?\\*?$`);
/** Federal Reserve: a panel per year headed "2027 FOMC Meetings", each meeting a row with a month
 *  cell ("January", "Apr/May") and a days cell ("26-27", "16-17*" for meetings with projections,
 *  "30-1" across months). The decision is the last day. A cell counts only when the month, or the
 *  days, are all it holds: "22 (notation vote)", "3 (unscheduled)", "16 - conference call",
 *  "Released November 18, 2026" and any sentence that happens to contain a date are not meetings. */
export function parseFomc(html: string): string[] {
  const text = pageText(html);
  const heads = [...text.matchAll(/\b(20\d\d) FOMC Meetings\b/g)];
  const out = new Set<string>();
  heads.forEach((h, i) => {
    const year = Number(h[1]);
    const lines = text.slice(h.index! + h[0].length, heads[i + 1]?.index ?? text.length).split('\n');
    lines.forEach((line, n) => {
      let m1: string | undefined, m2: string | undefined, d1: string | undefined, d2: string | undefined;
      const both = MONTH_AND_DAYS.exec(line), month = both ? null : MONTH_CELL.exec(line), days = month ? DAYS_CELL.exec(lines[n + 1] || '') : null;
      if (both) [, m1, m2, d1, d2] = both;
      else if (month && days) { [, m1, m2] = month; [, d1, d2] = days; }
      if (!m1 || !d1) return;
      const a = monthOf(m1), b = m2 ? monthOf(m2) : a;
      const first = Number(d1), last = d2 ? Number(d2) : first;
      let endMonth = b, endYear = year;
      if (!m2 && last < first) endMonth = a + 1; // "30-1" without a second month name
      if (endMonth > 11) { endMonth = 0; endYear++; }
      if (b < a) endYear++;
      const date = ymd(endYear, endMonth, last);
      if (date) out.add(date);
    });
  });
  return [...out].sort();
}

/** ECB: a list of dates ("dd/mm/yyyy", or written out: "5 February 2026"), each followed by what
 *  happens that day. The decision is the monetary policy meeting day with the press conference
 *  ("Day 2"); first days and non-monetary policy meetings are not decisions. A date counts only
 *  where it starts a line (its list entry): one inside a sentence is about something else. */
export function parseEcb(html: string): string[] {
  const text = pageText(html);
  const ms = [...text.matchAll(/^[ \t•*·–-]*(?:(\d{1,2})\/(\d{1,2})\/(20\d\d)|(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d\d))(?=\s*(?:$|[:,–—-]))/gm)];
  const out = new Set<string>();
  ms.forEach((m, i) => {
    const desc = text.slice(m.index! + m[0].length, ms[i + 1]?.index ?? text.length).slice(0, 300);
    if (!/monetary policy meeting/i.test(desc) || /non-monetary/i.test(desc) || /\bday\s*1\b/i.test(desc) || !/press conference|\bday\s*2\b/i.test(desc)) return;
    const date = m[3] ? ymd(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : ymd(Number(m[6]), monthOf(m[5]), Number(m[4]));
    if (date) out.add(date);
  });
  return [...out].sort();
}

/** Bank of England: announcement days in a table, written "Thursday 4 February" under a year
 *  heading. The weekday must match the date, which also tells the year: among last year, this year
 *  and the next two, a date falls on a given weekday only once. Only a date that starts its line
 *  (its table cell) counts: "closed on Friday 25 December", "rescheduled from Thursday 16
 *  September" and "last updated Friday 2 October" are sentences about other things. */
export function parseBoe(html: string, now = Date.now()): string[] {
  const text = pageText(html);
  const out = new Set<string>();
  const thisYear = new Date(now).getUTCFullYear();
  const re = /^[ \t•*·–-]*(Monday|Tuesday|Wednesday|Thursday|Friday)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(20\d\d))?\b/gm;
  for (const m of text.matchAll(re)) {
    const day = Number(m[2]), month = monthOf(m[3]), wd = WEEKDAYS.indexOf(m[1].toLowerCase());
    for (const y of m[4] ? [Number(m[4])] : [thisYear - 1, thisYear, thisYear + 1, thisYear + 2]) { const d = ymd(y, month, day); if (d && weekday(d) === wd) { out.add(d); break; } }
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

/** How far back the calendar looks (days): older page dates are history, not schedule. */
export const SCHEDULE_PAST_DAYS = 45;
const MIN_GAP_DAYS = 21; // scheduled meetings of these banks are five weeks or more apart
const MAX_PER_YEAR = 8; // each of them schedules eight a year
const HORIZON_DAYS = 800; // nobody publishes a schedule further ahead than about two years
const MOVED_DAYS = 10; // a page date this close to a checked date it lacks is that meeting, moved

export type ScheduleVerdict =
  | { ok: true; dates: string[]; /** Checked dates the page confirms: with none, nothing vouches for the reading. */ confirmed: number;
      /** The page has `page` where the checked list has `checked`: one of the two is out of date. `dates` leaves the page's out. */ moved?: { checked: string; page: string } }
  | { ok: false; reason: string };

/** Whether dates read from a page can be used. They must look like a meeting schedule: at least
 *  three dates, weekdays only, at most eight in a year and, from 45 days ago on, at least three
 *  weeks apart and none more than about two years away. And they must agree with the checked list:
 *  no checked date missing from inside the span the page covers. One page date sitting next to a
 *  checked date the page lacks is a moved meeting: the rest of the reading is used, that pair is
 *  handed back for the calendar to flag; two such pairs and the reading is not trusted at all. */
export function acceptSchedule(read: string[], checked: string[], now = Date.now()): ScheduleVerdict {
  const all = [...new Set(read)].sort();
  if (all.length < 3) return { ok: false, reason: `only ${all.length} meeting date${all.length === 1 ? '' : 's'} found on the page` };
  const weekend = all.find((d) => weekday(d) === 0 || weekday(d) === 6);
  if (weekend) return { ok: false, reason: `the page reading gave a weekend date (${weekend})` };
  const perYear = new Map<string, number>(); for (const d of all) perYear.set(d.slice(0, 4), (perYear.get(d.slice(0, 4)) || 0) + 1);
  const crowded = [...perYear].find(([, n]) => n > MAX_PER_YEAR);
  if (crowded) return { ok: false, reason: `${crowded[1]} dates in ${crowded[0]}, more than the ${MAX_PER_YEAR} meetings a year these banks schedule` };
  const from = isoDay(now - SCHEDULE_PAST_DAYS * 86400_000), horizon = isoDay(now + HORIZON_DAYS * 86400_000);
  const dates = all.filter((d) => d >= from);
  if (!dates.length) return { ok: false, reason: `the page lists no meeting from ${from} on` };
  const far = dates.find((d) => d > horizon);
  if (far) return { ok: false, reason: `the page reading gave a date more than two years away (${far})` };
  for (let i = 1; i < dates.length; i++) if (dayNo(dates[i]) - dayNo(dates[i - 1]) < MIN_GAP_DAYS) return { ok: false, reason: `${dates[i - 1]} and ${dates[i]} are less than three weeks apart, which no meeting schedule is` };
  const lo = dates[0], hi = dates.at(-1)!;
  let confirmed = 0, moved: { checked: string; page: string } | undefined;
  for (const c of checked.filter((c) => c >= from)) {
    if (dates.includes(c)) { confirmed++; continue; }
    const near = dates.find((d) => Math.abs(dayNo(d) - dayNo(c)) <= MOVED_DAYS && !checked.includes(d));
    if (near && moved) return { ok: false, reason: `the page lists ${moved.page} where the checked schedule has ${moved.checked}, and ${near} where it has ${c}` };
    if (near) { moved = { checked: c, page: near }; continue; }
    if (c >= lo && c <= hi) return { ok: false, reason: `the page does not list ${c}, which the checked schedule has` };
  }
  return { ok: true, dates: moved ? dates.filter((d) => d !== moved!.page) : dates, confirmed, moved };
}

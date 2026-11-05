// Economic & IGO calendar: data releases, central-bank decisions, summits, assemblies and votes,
// budget days and elections — global, and per country / organisation — each graded 1–10 for
// importance (with the reasons shown), and with the actual result posted after a release.
//
// Where the dates come from (each event says which):
//   official-live     an official machine-readable calendar fetched live (BLS iCalendar; FRED's
//                     release calendar when a free FRED_API_KEY is set)
//   official-curated  an official published schedule, entered by hand and verified against more
//                     than one source (central banks' meeting schedules, parliaments, summits)
//   official-rule     a published fixed rule ("the 20th of each month")
//   usual-timing      the agency's usual timing ("usually the third Tuesday") — shown with ≈ and
//                     never presented as a confirmed date
//   to-verify         a single-source date; shown, flagged for checking
// Results: US data from FRED (BLS/BEA/Census/Fed series), euro-area inflation from Eurostat, every
// central-bank decision from the BIS policy-rate data. Consensus forecasts are licensed data and
// are not shown.
import { cached, fetchText, fetchJson } from './cache.js';
import { getEntity, listByType, relsOfType, stub } from './graph.js';
import { policyRates, policyRateHistory, fredSeries, EURO_AREA } from './markets.js';
import { recordChange, emitNew, kvGet, kvSet, type Change } from './changes.js';
import { USER_AGENT } from './config.js';

export type CalKind = 'release' | 'central-bank' | 'igo' | 'budget' | 'election' | 'event';
export type DateBasis = 'official-live' | 'official-curated' | 'official-rule' | 'usual-timing' | 'to-verify';
export interface CalResult { headline: string; actual?: number; previous?: number; unit?: string; period?: string; sourceId: string; retrievedAt: string; url?: string; }
export interface CalEvent {
  id: string; kind: CalKind; title: string; placeIds: string[]; start: string; end?: string; allDay: boolean; timeLabel?: string;
  basis: DateBasis; basisNote?: string; sourceId: string; url?: string;
  importance: number; importanceWhy: string[]; status: 'scheduled' | 'released' | 'result-pending' | 'held';
  result?: CalResult; note?: string; entityId?: string; indicator?: string;
}

// ───────────────────────── Time zones (no library) ─────────────────────────
function tzOffsetMs(utcMs: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - utcMs;
}
/** Local wall-clock time in a zone → UTC ISO string (handles daylight saving). */
export function zonedToUtc(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number); const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - tzOffsetMs(guess, tz);
  return new Date(guess).toISOString();
}
const TZ_ALIAS: Record<string, string> = { 'US-Eastern': 'America/New_York', 'US/Eastern': 'America/New_York', 'Eastern Standard Time': 'America/New_York', EST5EDT: 'America/New_York' };

// ───────────────────────── iCalendar ─────────────────────────
export interface IcsEvent { uid?: string; summary: string; start: string; allDay: boolean; description?: string; }
/** Minimal RFC 5545 reader: unfolds lines, reads DTSTART with TZID / VALUE=DATE / UTC forms. */
export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out: IcsEvent[] = []; let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.SUMMARY && cur.DTSTART) {
        const { params, value } = cur.DTSTART;
        const tzid = /TZID=([^;:]+)/.exec(params)?.[1];
        let start: string; let allDay = false;
        const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
        if (!m) { cur = null; continue; }
        const date = `${m[1]}-${m[2]}-${m[3]}`;
        if (!m[4]) { start = date; allDay = true; }
        else if (m[7]) start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString();
        else start = zonedToUtc(date, `${m[4]}:${m[5]}`, TZ_ALIAS[tzid || ''] || (tzid && tzid.includes('/') ? tzid : 'America/New_York'));
        out.push({ uid: cur.UID?.value, summary: unescapeIcs(cur.SUMMARY.value), start, allDay, description: cur.DESCRIPTION ? unescapeIcs(cur.DESCRIPTION.value) : undefined });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const head = line.slice(0, i); const value = line.slice(i + 1);
    const [name, ...params] = head.split(';');
    cur[name.toUpperCase()] = { params: params.join(';'), value };
  }
  return out;
}
const unescapeIcs = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

// ───────────────────────── Importance ─────────────────────────
// Importance = what kind of event it is (base) + how much the economy or body matters to markets
// worldwide (weight) + context, rounded and kept within 1–10. Every event lists its reasons.
const WEIGHT: Record<string, [number, string]> = {
  'country:USA': [3, 'United States: largest economy, issuer of the dollar'], 'igo:eu': [2, 'Euro area / EU'], 'country:CHN': [2, 'China: second-largest economy'],
  'country:JPN': [1, 'Japan'], 'country:GBR': [1, 'United Kingdom'], 'country:DEU': [1, 'Germany: largest euro-area economy'], 'country:IND': [1, 'India'],
  'country:CAN': [0.5, 'Canada'], 'country:FRA': [0.5, 'France'], 'country:ITA': [0.5, 'Italy'], 'country:BRA': [0.5, 'Brazil'], 'country:AUS': [0.5, 'Australia'], 'country:KOR': [0.5, 'South Korea'], 'country:MEX': [0.5, 'Mexico'],
  'igo:g20': [2, 'G20: the largest economies'], 'igo:g7': [2, 'G7'], 'igo:opec-plus': [1.5, 'OPEC+: oil supply'], 'igo:opec': [1, 'OPEC'], 'igo:un': [1, 'United Nations'], 'igo:nato': [1, 'NATO'], 'igo:imf': [1, 'IMF'], 'igo:asean': [0.5, 'ASEAN'], 'igo:brics': [1, 'BRICS'], 'igo:wto': [0.5, 'WTO'],
};
export function grade(base: number, baseWhy: string, placeIds: string[], extra: [number, string][] = []) {
  const w = placeIds.map((p) => WEIGHT[p]).filter(Boolean).sort((a, b) => b[0] - a[0])[0];
  const why = [`${baseWhy}: ${base}`];
  let v = base;
  if (w) { v += w[0]; why.push(`${w[1]}: +${w[0]}`); }
  for (const [d, r] of extra) { v += d; why.push(`${r}: ${d > 0 ? '+' : ''}${d}`); }
  const importance = Math.max(1, Math.min(10, Math.round(v)));
  return { importance, importanceWhy: why };
}

// ───────────────────────── US releases (BLS iCalendar, FRED release calendar) ─────────────────────────
type Transform = 'yoy' | 'mom' | 'diff' | 'level' | 'qoq';
/** `lag`: how many months back the release's reference period is (1 = last month; trade and JOLTS are 2). */
interface SeriesSpec { fred: string; transform: Transform; unit: string; label: string; quarterly?: boolean; lag?: number; }
interface ReleaseDef { re: RegExp; indicator: string; title: string; base: number; time: string; series?: SeriesSpec[]; }
export const US_RELEASES: ReleaseDef[] = [
  { re: /^Consumer Price Index\b/i, indicator: 'us-cpi', title: 'US consumer prices (CPI)', base: 6, time: '08:30', series: [{ fred: 'CPIAUCSL', transform: 'yoy', unit: '% y/y', label: 'CPI' }, { fred: 'CPILFESL', transform: 'yoy', unit: '% y/y', label: 'core CPI' }] },
  { re: /^Employment Situation/i, indicator: 'us-jobs', title: 'US jobs report (payrolls, unemployment)', base: 6, time: '08:30', series: [{ fred: 'PAYEMS', transform: 'diff', unit: 'k jobs', label: 'payrolls' }, { fred: 'UNRATE', transform: 'level', unit: '%', label: 'unemployment' }] },
  { re: /^Gross Domestic Product\b/i, indicator: 'us-gdp', title: 'US GDP', base: 5, time: '08:30', series: [{ fred: 'A191RL1Q225SBEA', transform: 'level', unit: '% q/q annualised', label: 'real GDP', quarterly: true }] },
  { re: /^Personal Income and Outlays/i, indicator: 'us-pce', title: 'US PCE inflation, income and spending', base: 5, time: '08:30', series: [{ fred: 'PCEPI', transform: 'yoy', unit: '% y/y', label: 'PCE prices' }, { fred: 'PCEPILFE', transform: 'yoy', unit: '% y/y', label: 'core PCE' }] },
  { re: /Retail (Trade|Sales)|Advance Monthly Sales for Retail/i, indicator: 'us-retail', title: 'US retail sales', base: 4, time: '08:30', series: [{ fred: 'RSAFS', transform: 'mom', unit: '% m/m', label: 'retail sales' }] },
  { re: /^Producer Price Index/i, indicator: 'us-ppi', title: 'US producer prices (PPI)', base: 3, time: '08:30', series: [{ fred: 'PPIFIS', transform: 'yoy', unit: '% y/y', label: 'PPI final demand' }] },
  { re: /^Job Openings and Labor Turnover/i, indicator: 'us-jolts', title: 'US job openings (JOLTS)', base: 3, time: '10:00', series: [{ fred: 'JTSJOL', transform: 'level', unit: 'k openings', label: 'job openings', lag: 2 }] },
  { re: /^Industrial Production and Capacity Utilization/i, indicator: 'us-ip', title: 'US industrial production', base: 3, time: '09:15', series: [{ fred: 'INDPRO', transform: 'mom', unit: '% m/m', label: 'industrial production' }] },
  { re: /International Trade in Goods and Services/i, indicator: 'us-trade', title: 'US trade balance', base: 3, time: '08:30', series: [{ fred: 'BOPGSTB', transform: 'level', unit: '$ m', label: 'goods & services balance', lag: 2 }] },
  { re: /^Employment Cost Index/i, indicator: 'us-eci', title: 'US employment cost index', base: 3, time: '08:30', series: [{ fred: 'ECIALLCIV', transform: 'qoq', unit: '% q/q', label: 'ECI', quarterly: true }] },
  { re: /^New Residential Construction/i, indicator: 'us-housing', title: 'US housing starts', base: 2, time: '08:30', series: [{ fred: 'HOUST', transform: 'level', unit: 'k (annual rate)', label: 'housing starts' }] },
  { re: /Durable Goods|Manufacturers.? Shipments, Inventories,? and Orders/i, indicator: 'us-durables', title: 'US durable goods orders', base: 2, time: '08:30', series: [{ fred: 'DGORDER', transform: 'mom', unit: '% m/m', label: 'durable goods orders' }] },
  { re: /^(Surveys of Consumers|University of Michigan)/i, indicator: 'us-sentiment', title: 'US consumer sentiment (University of Michigan)', base: 2, time: '10:00', series: [{ fred: 'UMCSENT', transform: 'level', unit: 'index', label: 'sentiment', lag: 0 }] },
  { re: /^Productivity and Costs/i, indicator: 'us-productivity', title: 'US productivity and unit labour costs', base: 2, time: '08:30' },
  { re: /^(U\.S\. )?Import and Export Price/i, indicator: 'us-importprices', title: 'US import and export prices', base: 2, time: '08:30' },
  { re: /^Real Earnings/i, indicator: 'us-earnings', title: 'US real earnings', base: 1, time: '08:30' },
];
const releaseFor = (name: string) => US_RELEASES.find((r) => r.re.test(name.trim()));

export function usReleasesFromIcs(events: IcsEvent[]): CalEvent[] {
  const out: CalEvent[] = [];
  for (const e of events) {
    const def = releaseFor(e.summary); if (!def) continue;
    const g = grade(def.base, def.title.replace(/^US /, ''), ['country:USA']);
    out.push({ id: `rel:${def.indicator}:${e.start.slice(0, 10)}`, kind: 'release', title: def.title, placeIds: ['country:USA'], start: e.start, allDay: e.allDay, timeLabel: e.allDay ? undefined : `${def.time} ET`,
      basis: 'official-live', basisNote: 'Bureau of Labor Statistics release calendar', sourceId: 'bls-schedule', url: 'https://www.bls.gov/schedule/', indicator: def.indicator, status: 'scheduled', ...g });
  }
  return out;
}
export function usReleasesFromFred(json: any): CalEvent[] {
  const out: CalEvent[] = [];
  for (const r of json?.release_dates || []) {
    const def = releaseFor(String(r.release_name || '')); if (!def || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    const g = grade(def.base, def.title.replace(/^US /, ''), ['country:USA']);
    out.push({ id: `rel:${def.indicator}:${r.date}`, kind: 'release', title: def.title, placeIds: ['country:USA'], start: zonedToUtc(r.date, def.time, 'America/New_York'), allDay: false, timeLabel: `${def.time} ET`,
      basis: 'official-live', basisNote: `FRED release calendar (${r.release_name})`, sourceId: 'fred-releases', url: `https://fred.stlouisfed.org/releases/calendar`, indicator: def.indicator, status: 'scheduled', ...g });
  }
  return out;
}

async function blsCalendar() {
  return cached('econ:bls-ics', 12 * 3600, async () => usReleasesFromIcs(parseIcs(await fetchText('https://www.bls.gov/schedule/news_release/bls.ics', { 'User-Agent': USER_AGENT, Accept: 'text/calendar' }, 30000))));
}
async function fredCalendar() {
  const key = (process.env.FRED_API_KEY || '').trim();
  if (!key) return null;
  return cached('econ:fred-releases', 12 * 3600, async () => {
    const from = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10), to = new Date(Date.now() + 120 * 86400_000).toISOString().slice(0, 10);
    return usReleasesFromFred(await fetchJson(`https://api.stlouisfed.org/fred/releases/dates?api_key=${encodeURIComponent(key)}&file_type=json&realtime_start=${from}&realtime_end=${to}&include_release_dates_with_no_data=true&sort_order=asc&limit=1000`, {}, 30000));
  });
}

// ───────────────────────── Central banks (official schedules, verified) ─────────────────────────
interface BankSchedule { placeIds: string[]; bank: string; tz: string; time: string; timeLabel: string; dates: string[]; url: string; sourceId: string; note?: string; area: string; }
// Decision days only (the last day of multi-day meetings). Re-check every year: the audit warns
// when a schedule runs out within 90 days.
export const BANK_SCHEDULES: BankSchedule[] = [
  { area: 'USA', placeIds: ['country:USA'], bank: 'Federal Reserve (FOMC)', tz: 'America/New_York', time: '14:00', timeLabel: '14:00 ET', sourceId: 'fed-fomc', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    dates: ['2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08'], note: 'The Fed calls 2027 dates tentative until confirmed at the preceding meeting.' },
  { area: 'XM', placeIds: ['igo:eu'], bank: 'European Central Bank', tz: 'Europe/Berlin', time: '14:15', timeLabel: '14:15 CET', sourceId: 'ecb-calendar', url: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html',
    dates: ['2026-12-17', '2027-04-29', '2027-10-28'], note: 'Only dates confirmed by more than one source are listed; see the ECB calendar for the rest of 2027.' },
  { area: 'GBR', placeIds: ['country:GBR'], bank: 'Bank of England (MPC)', tz: 'Europe/London', time: '12:00', timeLabel: '12:00 UK', sourceId: 'boe-mpc', url: 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates',
    dates: ['2026-11-05', '2026-12-17', '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-17', '2027-07-29', '2027-09-16', '2027-11-04', '2027-12-16'] },
  { area: 'JPN', placeIds: ['country:JPN'], bank: 'Bank of Japan', tz: 'Asia/Tokyo', time: '12:00', timeLabel: 'around midday JST', sourceId: 'boj-mpm', url: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm',
    dates: ['2026-12-18', '2027-07-22'], note: 'The BoJ meets eight times in 2027 (Jan, Mar, Apr, Jun, Jul, Sep, Oct, Dec); only confirmed dates are listed.' },
  { area: 'CAN', placeIds: ['country:CAN'], bank: 'Bank of Canada', tz: 'America/Toronto', time: '09:45', timeLabel: '09:45 ET', sourceId: 'boc-schedule', url: 'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/',
    dates: ['2026-12-09', '2027-01-27', '2027-03-03', '2027-04-28', '2027-06-02', '2027-07-21', '2027-09-08', '2027-10-27', '2027-12-08'] },
];
function bankEvents(): CalEvent[] {
  const out: CalEvent[] = [];
  for (const b of BANK_SCHEDULES) for (const d of b.dates) {
    const g = grade(6, 'Policy-rate decision', b.placeIds);
    out.push({ id: `cb:${b.area}:${d}`, kind: 'central-bank', title: `${b.bank} rate decision`, placeIds: b.placeIds, start: zonedToUtc(d, b.time, b.tz), allDay: false, timeLabel: b.timeLabel,
      basis: 'official-curated', basisNote: 'Published meeting schedule (entered by hand, checked against several sources)', sourceId: b.sourceId, url: b.url, note: b.note, status: 'scheduled', indicator: `cb:${b.area}`, ...g });
  }
  return out;
}

// ───────────────────────── Usual timing (labelled, never presented as confirmed) ─────────────────────────
type Rule = { kind: 'day'; day: number; shift?: 'next-workday' } | { kind: 'nth-weekday'; weekday: number; n: number } | { kind: 'last-weekday'; weekday: number } | { kind: 'workday-of-month'; n: number; next?: boolean }
  | { kind: 'weekday-on-or-after'; weekday: number; day: number } // e.g. the first Wednesday on or after the 10th
  | { kind: 'bls-jobs' }; // third Friday after the week containing the 12th of the previous month
interface UsualDef { id: string; placeIds: string[]; title: string; base: number; rule: Rule; tz: string; time: string; window: string; basis: 'usual-timing' | 'official-rule'; sourceId: string; url: string; kind?: CalKind; result?: 'ea-hicp' | 'bis'; area?: string;
  /** Months (0–11) the release happens in; all when omitted. */ months?: number[];
  /** Only used when the live US calendars (BLS, FRED) could not be loaded. */ fallback?: 'us'; }
export const USUAL: UsualDef[] = [
  { id: 'ea-hicp-flash', placeIds: ['igo:eu'], title: 'Euro area flash inflation (HICP)', base: 6, rule: { kind: 'workday-of-month', n: 1, next: true }, tz: 'Europe/Luxembourg', time: '11:00', window: 'usually the last working day of the month or one of the first working days of the next', basis: 'usual-timing', sourceId: 'eurostat', url: 'https://ec.europa.eu/eurostat/news/release-calendar', result: 'ea-hicp' },
  { id: 'de-cpi-flash', placeIds: ['country:DEU'], title: 'Germany flash inflation', base: 4, rule: { kind: 'workday-of-month', n: -1 }, tz: 'Europe/Berlin', time: '14:00', window: 'usually one of the last working days of the month', basis: 'usual-timing', sourceId: 'destatis', url: 'https://www.destatis.de/EN/Press/Calendar/_node.html' },
  { id: 'uk-cpi', placeIds: ['country:GBR'], title: 'UK consumer prices (CPI)', base: 5, rule: { kind: 'nth-weekday', weekday: 3, n: 3 }, tz: 'Europe/London', time: '07:00', window: 'usually a Wednesday in the middle of the month', basis: 'usual-timing', sourceId: 'ons', url: 'https://www.ons.gov.uk/releasecalendar' },
  { id: 'jp-cpi', placeIds: ['country:JPN'], title: 'Japan national consumer prices', base: 4, rule: { kind: 'nth-weekday', weekday: 5, n: 3 }, tz: 'Asia/Tokyo', time: '08:30', window: 'usually the third or fourth Friday of the month', basis: 'usual-timing', sourceId: 'stat-japan', url: 'https://www.stat.go.jp/english/data/cpi/' },
  { id: 'cn-cpi', placeIds: ['country:CHN'], title: 'China consumer and producer prices', base: 4, rule: { kind: 'day', day: 9, shift: 'next-workday' }, tz: 'Asia/Shanghai', time: '09:30', window: 'usually around the 9th–10th', basis: 'usual-timing', sourceId: 'nbs-china', url: 'https://www.stats.gov.cn/english/' },
  { id: 'cn-activity', placeIds: ['country:CHN'], title: 'China industrial output, retail sales and investment', base: 4, rule: { kind: 'day', day: 15, shift: 'next-workday' }, tz: 'Asia/Shanghai', time: '10:00', window: 'usually around the 15th–17th', basis: 'usual-timing', sourceId: 'nbs-china', url: 'https://www.stats.gov.cn/english/' },
  { id: 'cn-lpr', placeIds: ['country:CHN'], title: 'China loan prime rate (LPR) fixing', base: 4, rule: { kind: 'day', day: 20, shift: 'next-workday' }, tz: 'Asia/Shanghai', time: '09:00', window: 'the 20th of each month, moved if it falls on a holiday (PBoC rule)', basis: 'official-rule', sourceId: 'pboc', url: 'http://www.pbc.gov.cn/en/3688006/index.html', kind: 'central-bank', result: 'bis', area: 'CHN' },
  { id: 'ca-cpi', placeIds: ['country:CAN'], title: 'Canada consumer prices (CPI)', base: 4, rule: { kind: 'nth-weekday', weekday: 2, n: 3 }, tz: 'America/Toronto', time: '08:30', window: 'usually the third Tuesday of the month', basis: 'usual-timing', sourceId: 'statcan', url: 'https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm' },
  { id: 'in-cpi', placeIds: ['country:IND'], title: 'India consumer prices (CPI)', base: 4, rule: { kind: 'day', day: 12 }, tz: 'Asia/Kolkata', time: '16:00', window: 'the 12th of each month (MoSPI practice)', basis: 'usual-timing', sourceId: 'mospi', url: 'https://www.mospi.gov.in/' },
  // US fallbacks: shown only when neither the BLS nor the FRED calendar could be loaded. The id
  // matches the live release, so results are still posted from FRED.
  { id: 'us-jobs', fallback: 'us', placeIds: ['country:USA'], title: 'US jobs report (payrolls, unemployment)', base: 6, rule: { kind: 'bls-jobs' }, tz: 'America/New_York', time: '08:30', window: 'usually the first Friday of the month (the third Friday after the survey week)', basis: 'usual-timing', sourceId: 'bls-schedule', url: 'https://www.bls.gov/schedule/' },
  { id: 'us-cpi', fallback: 'us', placeIds: ['country:USA'], title: 'US consumer prices (CPI)', base: 6, rule: { kind: 'weekday-on-or-after', weekday: 3, day: 10 }, tz: 'America/New_York', time: '08:30', window: 'usually a Tuesday–Thursday between the 10th and 15th', basis: 'usual-timing', sourceId: 'bls-schedule', url: 'https://www.bls.gov/schedule/' },
  { id: 'us-gdp', fallback: 'us', placeIds: ['country:USA'], title: 'US GDP (advance estimate)', base: 5, rule: { kind: 'last-weekday', weekday: 4 }, months: [0, 3, 6, 9], tz: 'America/New_York', time: '08:30', window: 'usually the last Thursday of the month after a quarter ends', basis: 'usual-timing', sourceId: 'bea-schedule', url: 'https://www.bea.gov/news/schedule' },
  { id: 'us-pce', fallback: 'us', placeIds: ['country:USA'], title: 'US PCE inflation, income and spending', base: 5, rule: { kind: 'last-weekday', weekday: 5 }, tz: 'America/New_York', time: '08:30', window: 'usually the last Friday of the month or close to it', basis: 'usual-timing', sourceId: 'bea-schedule', url: 'https://www.bea.gov/news/schedule' },
  { id: 'us-retail', fallback: 'us', placeIds: ['country:USA'], title: 'US retail sales', base: 4, rule: { kind: 'day', day: 15, shift: 'next-workday' }, tz: 'America/New_York', time: '08:30', window: 'usually around the 15th', basis: 'usual-timing', sourceId: 'census-schedule', url: 'https://www.census.gov/economic-indicators/calendar-listview.html' },
];
const isWorkday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function ruleDate(rule: Rule, year: number, month: number): string | undefined {
  const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (rule.kind === 'day') {
    if (rule.day > dim) return undefined;
    const d = new Date(Date.UTC(year, month, rule.day));
    if (rule.shift === 'next-workday') while (!isWorkday(d)) d.setUTCDate(d.getUTCDate() + 1);
    return iso(d);
  }
  if (rule.kind === 'nth-weekday') {
    const first = new Date(Date.UTC(year, month, 1)); const off = (rule.weekday - first.getUTCDay() + 7) % 7;
    const day = 1 + off + (rule.n - 1) * 7; return day <= dim ? iso(new Date(Date.UTC(year, month, day))) : undefined;
  }
  if (rule.kind === 'weekday-on-or-after') {
    const d = new Date(Date.UTC(year, month, rule.day)); while (d.getUTCDay() !== rule.weekday) d.setUTCDate(d.getUTCDate() + 1);
    return iso(d);
  }
  if (rule.kind === 'bls-jobs') {
    const ref = new Date(Date.UTC(year, month - 1, 12)); // the survey week contains the 12th of last month
    const saturday = 12 + (6 - ref.getUTCDay());
    const d = new Date(Date.UTC(year, month - 1, saturday + 20)); // third Friday after that week
    // Holidays: 1 January moves a week later; 3–4 July moves to the Thursday before.
    if (d.getUTCMonth() === 0 && d.getUTCDate() === 1) d.setUTCDate(8);
    else if (d.getUTCMonth() === 6 && (d.getUTCDate() === 3 || d.getUTCDate() === 4)) d.setUTCDate(d.getUTCDate() - 1);
    return iso(d);
  }
  if (rule.kind === 'last-weekday') {
    const last = new Date(Date.UTC(year, month, dim)); const off = (last.getUTCDay() - rule.weekday + 7) % 7;
    return iso(new Date(Date.UTC(year, month, dim - off)));
  }
  // n-th working day (negative = from the end); `next` = of the following month.
  const [y, m] = rule.next ? [month === 11 ? year + 1 : year, (month + 1) % 12] : [year, month];
  const days: string[] = []; const n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  for (let d = 1; d <= n; d++) { const dt = new Date(Date.UTC(y, m, d)); if (isWorkday(dt)) days.push(iso(dt)); }
  return rule.n > 0 ? days[rule.n - 1] : days[days.length + rule.n];
}
/** `live`: indicators the live calendars already cover — their usual-timing fallbacks are left out. */
function usualEvents(from: Date, to: Date, live: Set<string> = new Set(['*'])): CalEvent[] {
  const out: CalEvent[] = [];
  const months = Math.ceil((to.getTime() - from.getTime()) / (30 * 86400_000)) + 1;
  for (const u of USUAL) {
    if (u.fallback === 'us' && (live.has('*') || live.has(u.id))) continue;
    for (let k = -1; k <= months; k++) {
      const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + k, 1));
      if (u.months && !u.months.includes(base.getUTCMonth())) continue;
      const d = ruleDate(u.rule, base.getUTCFullYear(), base.getUTCMonth()); if (!d) continue;
      const t = Date.parse(`${d}T12:00:00Z`); if (t < from.getTime() - 86400_000 || t > to.getTime()) continue;
      const g = grade(u.base, u.kind === 'central-bank' ? 'Policy-rate fixing' : u.title.replace(/^(Euro area|Germany|UK|US|Japan|China|Canada|India) /, ''), u.placeIds);
      out.push({ id: `usual:${u.id}:${d}`, kind: u.kind || 'release', title: u.basis === 'usual-timing' ? `≈ ${u.title}` : u.title, placeIds: u.placeIds, start: zonedToUtc(d, u.time, u.tz), allDay: false,
        timeLabel: u.basis === 'usual-timing' ? `date not confirmed (${u.window})` : u.window, basis: u.basis, basisNote: u.fallback ? `${u.window}. Shown because the live US release calendar could not be loaded.` : u.window, sourceId: u.sourceId, url: u.url, indicator: u.id, status: 'scheduled', ...g });
    }
  }
  return out;
}

// ───────────────────────── IGO meetings, votes and summits (official, verified) ─────────────────────────
interface IgoDef { id: string; title: string; placeIds: string[]; start: string; end?: string; base: number; baseWhy: string; url: string; basis: DateBasis; note?: string; votes?: boolean; }
export const IGO_EVENTS: IgoDef[] = [
  { id: 'cop31-2026', title: 'COP31 UN Climate Change Conference — Antalya, Türkiye', placeIds: ['igo:un', 'country:TUR'], start: '2026-11-09', end: '2026-11-20', base: 4, baseWhy: 'UN climate conference', url: 'https://en.wikipedia.org/wiki/2026_United_Nations_Climate_Change_Conference', basis: 'official-curated', note: 'Leaders’ segment 11–12 November.' },
  { id: 'cop31-leaders-2026', title: 'COP31 leaders’ segment', placeIds: ['igo:un', 'country:TUR'], start: '2026-11-11', end: '2026-11-12', base: 5, baseWhy: 'Heads of state at a UN summit', url: 'https://en.wikipedia.org/wiki/2026_United_Nations_Climate_Change_Conference', basis: 'official-curated' },
  { id: 'ep-plenary-2026-11-bxl', title: 'European Parliament plenary — Brussels mini-session (votes)', placeIds: ['igo:eu'], start: '2026-11-11', end: '2026-11-12', base: 3, baseWhy: 'Parliament voting session', url: 'https://www.europarl.europa.eu/plenary/en/home.html', basis: 'official-curated', votes: true },
  { id: 'asean-49', title: '49th ASEAN Summit and Related Summits — Pasay City (Manila)', placeIds: ['igo:asean', 'country:PHL'], start: '2026-11-16', end: '2026-11-18', base: 4, baseWhy: 'Regional leaders’ summit', url: 'https://asean.org/', basis: 'official-curated' },
  { id: 'apec-2026', title: 'APEC Economic Leaders’ Meeting — Shenzhen', placeIds: ['country:CHN'], start: '2026-11-18', end: '2026-11-19', base: 5, baseWhy: 'Asia-Pacific leaders’ summit (US and China present)', url: 'https://www.sz.gov.cn/en_szgov/news/infocus/APEC2026/', basis: 'official-curated' },
  { id: 'ep-plenary-2026-11-sxb', title: 'European Parliament plenary — Strasbourg (votes)', placeIds: ['igo:eu'], start: '2026-11-23', end: '2026-11-26', base: 4, baseWhy: 'Parliament voting session (incl. annual EU budget)', url: 'https://www.europarl.europa.eu/plenary/en/home.html', basis: 'official-curated', votes: true },
  { id: 'opec-plus-2026-11', title: 'OPEC and non-OPEC Ministerial Meeting (OPEC+) — output policy', placeIds: ['igo:opec-plus', 'igo:opec'], start: '2026-11-29', base: 6, baseWhy: 'Oil-output decision', url: 'https://www.opec.org/', basis: 'to-verify', note: 'Date set at the 7 June 2026 meeting (reported by TASS); confirm on opec.org.' },
  { id: 'ep-plenary-2026-12-sxb', title: 'European Parliament plenary — Strasbourg (votes)', placeIds: ['igo:eu'], start: '2026-12-14', end: '2026-12-17', base: 4, baseWhy: 'Parliament voting session', url: 'https://www.europarl.europa.eu/plenary/en/home.html', basis: 'official-curated', votes: true },
  { id: 'euco-2026-12', title: 'European Council summit (EU heads of government)', placeIds: ['igo:eu'], start: '2026-12-16', end: '2026-12-17', base: 5, baseWhy: 'EU leaders’ summit (decisions by consensus)', url: 'https://www.consilium.europa.eu/en/meetings/calendar/', basis: 'to-verify', note: 'June 2026 planning gives 16–17 December; an earlier plan said 17–18 — confirm on the Council calendar.' },
];
function igoEvents(): CalEvent[] {
  return IGO_EVENTS.map((d) => ({ id: `igo:${d.id}`, kind: 'igo' as const, title: d.title, placeIds: d.placeIds, start: d.start, end: d.end, allDay: true, basis: d.basis, basisNote: d.basis === 'to-verify' ? 'Single source — verify' : 'Published schedule (checked against several sources)',
    sourceId: 'igo-calendars', url: d.url, note: d.note, status: 'scheduled' as const, ...grade(d.base, d.baseWhy, d.placeIds) }));
}

// ───────────────────────── Budget days (statutory / standing practice) ─────────────────────────
function budgetEvents(from: Date, to: Date): CalEvent[] {
  const out: CalEvent[] = [];
  for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear() + 1; y++) {
    const usDay = ruleDate({ kind: 'nth-weekday', weekday: 1, n: 1 }, y, 1)!; // first Monday of February
    out.push({ id: `budget:USA:${y}`, kind: 'budget', title: `US President’s budget request for FY${y + 1} (statutory deadline)`, placeIds: ['country:USA'], start: usDay, allDay: true, basis: 'official-rule', basisNote: 'Due by the first Monday in February (31 U.S.C. § 1105); often submitted late.', sourceId: 'us-budget-law', url: 'https://www.law.cornell.edu/uscode/text/31/1105', status: 'scheduled', ...grade(4, 'National budget', ['country:USA']) });
    out.push({ id: `budget:IND:${y}`, kind: 'budget', title: `India Union Budget ${y}–${String(y + 1).slice(2)}`, placeIds: ['country:IND'], start: `${y}-02-01`, allDay: true, basis: 'usual-timing', basisNote: 'Presented on 1 February since 2017.', sourceId: 'india-budget', url: 'https://www.indiabudget.gov.in/', status: 'scheduled', ...grade(4, 'National budget', ['country:IND']) });
  }
  return out.filter((e) => e.start >= iso(from) && e.start <= iso(to));
}

// ───────────────────────── Graph events: elections, summits, curated events ─────────────────────────
function graphEvents(from: Date, to: Date): CalEvent[] {
  const out: CalEvent[] = [];
  for (const e of listByType('event')) {
    const cat = e.attrs?.category; const d = String(e.attrs?.date || '');
    if (!/^\d{4}-\d{2}-\d{2}/.test(d) || cat === 'conflict' || cat === 'central-bank') continue;
    const end = String(e.attrs?.endDate || d);
    if (end < iso(from) || d > iso(to)) continue;
    const places = relsOfType(e.id, 'affects', 'out').map((r) => r.to).filter((id) => /^(country|state|city|igo):/.test(id));
    const local = (e.attrs?.scope || 'national') !== 'national';
    const kind: CalKind = cat === 'election' ? 'election' : cat === 'summit' ? 'igo' : 'event';
    const base = cat === 'election' ? (local ? 2 : 5) : cat === 'summit' ? 5 : 3;
    const g = grade(base, cat === 'election' ? (local ? 'State or city election' : 'National election') : cat === 'summit' ? 'Leaders’ summit' : 'Scheduled event', local ? [] : places);
    const el = e.attrs?.election;
    out.push({ id: `ev:${e.id}`, kind, title: e.name, placeIds: places.length ? places : [e.id], start: d, end: end !== d ? end : undefined, allDay: true, entityId: e.id,
      basis: e.depth === 'curated' ? 'official-curated' : 'official-live', basisNote: e.depth === 'curated' ? 'Curated event (cited source)' : 'Wikipedia electoral calendar / election article',
      sourceId: e.sources?.[0] || 'wikipedia-elections', url: e.attrs?.url, status: el?.status === 'completed' ? 'released' : d < iso(new Date()) ? 'result-pending' : 'scheduled',
      result: el?.winner?.name ? { headline: `Won by ${el.winner.name}${el.winner.party ? ` (${el.winner.party})` : ''}`, sourceId: 'wikipedia-election-results', retrievedAt: el.fetchedAt || '', url: el.url } : undefined, ...g });
  }
  return out;
}

// ───────────────────────── Results ─────────────────────────
function transform(points: { t: string; v: number }[], t: Transform, i: number): number | undefined {
  const p = points[i]; if (!p) return undefined;
  const prevN = (n: number) => points[i - n]?.v;
  switch (t) {
    case 'level': return p.v;
    case 'diff': return prevN(1) == null ? undefined : p.v - prevN(1)!;
    case 'mom': return prevN(1) ? (p.v / prevN(1)! - 1) * 100 : undefined;
    case 'qoq': return prevN(1) ? (p.v / prevN(1)! - 1) * 100 : undefined;
    case 'yoy': return prevN(12) ? (p.v / prevN(12)! - 1) * 100 : undefined;
  }
}
export const fmtResult = (v: number, unit: string) => unit === '%' ? `${v.toFixed(1)}%`
  : unit.startsWith('%') ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%${unit.slice(1)}`
  : `${unit === 'k jobs' && v > 0 ? '+' : ''}${Math.round(v).toLocaleString('en-US')} ${unit}`;
/** The reference period a release covers: `lag` months back (or the previous quarter for quarterly data). */
export function expectedPeriod(releaseDate: string, quarterly = false, lag = 1) {
  const d = new Date(`${releaseDate.slice(0, 10)}T00:00:00Z`);
  if (quarterly) { const q = Math.floor(d.getUTCMonth() / 3); const y = q === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(); const pq = q === 0 ? 3 : q - 1; return `${y}-${String(pq * 3 + 1).padStart(2, '0')}`; }
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - lag, 1)); return m.toISOString().slice(0, 7);
}
export function seriesResult(points: { t: string; v: number }[], spec: SeriesSpec, releaseDate: string) {
  if (points.length < 2) return undefined;
  const want = expectedPeriod(releaseDate, spec.quarterly, spec.lag ?? 1);
  const i = points.length - 1;
  // The newest observation must be for the period this release covers (or later), else it is not out yet.
  if (points[i].t.slice(0, 7) < want) return undefined;
  const actual = transform(points, spec.transform, i), previous = transform(points, spec.transform, i - 1);
  if (actual == null) return undefined;
  return { label: spec.label, actual, previous, unit: spec.unit, period: points[i].t.slice(0, 7) };
}

async function usResult(ev: CalEvent): Promise<CalResult | undefined> {
  const def = US_RELEASES.find((r) => r.indicator === ev.indicator); if (!def?.series) return undefined;
  const parts: string[] = []; let first: ReturnType<typeof seriesResult> | undefined; let at = '';
  for (const spec of def.series) {
    const r = await fredSeries(spec.fred, new Date(Date.now() - 800 * 86400_000).toISOString().slice(0, 10));
    const res = seriesResult(r.data, spec, ev.start);
    if (!res) return undefined; // not published yet
    first ||= res; at = r.fetchedAt;
    parts.push(`${res.label} ${fmtResult(res.actual, res.unit)}${res.previous != null ? ` (prev. ${fmtResult(res.previous, res.unit)})` : ''}`);
  }
  return first && { headline: `${parts.join(' · ')} — ${first.period}`, actual: first.actual, previous: first.previous, unit: first.unit, period: first.period, sourceId: 'fred', retrievedAt: at, url: `https://fred.stlouisfed.org/series/${def.series[0].fred}` };
}

export function parseJsonStatSeries(j: any): { t: string; v: number }[] {
  const idx = j?.dimension?.time?.category?.index || {};
  const vals = j?.value || {};
  return Object.entries<number>(idx).map(([t, i]) => ({ t, v: Array.isArray(vals) ? vals[i] : vals[String(i)] })).filter((p) => typeof p.v === 'number').sort((a, b) => a.t.localeCompare(b.t)) as { t: string; v: number }[];
}
async function eaHicpResult(ev: CalEvent): Promise<CalResult | undefined> {
  const r = await cached('econ:ea-hicp', 3 * 3600, async () => parseJsonStatSeries(await fetchJson('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?format=JSON&geo=EA&coicop=CP00&lastTimePeriod=4', {}, 30000)));
  const pts = r.data; const last = pts.at(-1); if (!last) return undefined;
  if (last.t.slice(0, 7) < expectedPeriod(ev.start)) return undefined;
  return { headline: `Inflation ${last.v.toFixed(1)}% y/y${pts.at(-2) ? ` (prev. ${pts.at(-2)!.v.toFixed(1)}%)` : ''} — ${last.t}`, actual: last.v, previous: pts.at(-2)?.v, unit: '% y/y', period: last.t, sourceId: 'eurostat', retrievedAt: r.fetchedAt, url: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_manr/default/table' };
}
/** Decision from BIS policy-rate data: the rate in force after the meeting vs the one before. */
async function bankResult(area: string, decisionDate: string): Promise<CalResult | undefined> {
  const rates = await policyRates();
  const now = rates.data[area === 'XM' ? 'DEU' : area];
  if (!now || now.date < decisionDate) return undefined; // BIS has not published data for the decision day yet
  const hist = kvGet<{ date: string; value: number }[]>(`rates:hist:${area}`, []);
  let before = [...hist].reverse().find((h) => h.date < decisionDate)?.value;
  if (before == null) {
    const iso3 = area === 'XM' ? 'DEU' : area;
    try { const h = await policyRateHistory(iso3); const prevMonth = expectedPeriod(decisionDate); before = h?.data?.points.filter((p: any) => p.t <= prevMonth).at(-1)?.v; } catch { /* unknown */ }
  }
  const bp = before == null ? undefined : Math.round((now.value - before) * 100);
  const headline = bp == null ? `Policy rate ${now.value.toFixed(2)}% after the meeting` : bp === 0 ? `Held at ${now.value.toFixed(2)}%` : `${bp > 0 ? 'Raised' : 'Cut'} ${Math.abs(bp)} bp to ${now.value.toFixed(2)}%`;
  return { headline, actual: now.value, previous: before, unit: '%', period: now.date, sourceId: 'bis-policy', retrievedAt: rates.fetchedAt };
}

// ───────────────────────── Build & refresh ─────────────────────────
let calendar: CalEvent[] = [];
let lastBuild: { at: string; errors: string[]; counts: Record<string, number> } | null = null;
const resultsStore = () => kvGet<Record<string, CalResult>>('econ:results', {});

export async function buildCalendar() {
  const from = new Date(Date.now() - 45 * 86400_000), to = new Date(Date.now() + 120 * 86400_000);
  const errors: string[] = [];
  const [bls, fred] = await Promise.allSettled([blsCalendar(), fredCalendar()]);
  const live: CalEvent[] = [];
  if (bls.status === 'fulfilled') live.push(...bls.value.data); else errors.push(`BLS calendar: ${bls.reason?.message || bls.reason}`);
  if (fred.status === 'fulfilled' && fred.value) live.push(...fred.value.data); else if (fred.status === 'rejected') errors.push(`FRED calendar: ${fred.reason?.message || fred.reason}`);
  // A US release missing from the live calendars (BLS covers only its own releases; GDP, PCE and retail
  // sales need FRED) is shown at its usual timing instead, labelled as such.
  const liveIds = new Set(live.map((e) => e.indicator || ''));
  const fallback = USUAL.filter((u) => u.fallback === 'us' && !liveIds.has(u.id));
  if (fallback.length) errors.push(`${fallback.map((u) => u.title.replace(/^US /, '').replace(/ \(.*\)$/, '')).join(', ')}: shown at usual timing (≈) — ${bls.status === 'rejected' ? 'the BLS calendar could not be loaded' : 'not in the BLS calendar'}${process.env.FRED_API_KEY ? '' : '; set FRED_API_KEY for official dates'}`);
  const all = new Map<string, CalEvent>();
  for (const e of [...live, ...bankEvents(), ...usualEvents(from, to, liveIds), ...igoEvents(), ...budgetEvents(from, to)]) {
    if (e.start.slice(0, 10) < iso(from) || e.start.slice(0, 10) > iso(to)) continue;
    if (!all.has(e.id)) all.set(e.id, e); // first source wins (live calendars come first)
  }
  const stored = resultsStore();
  calendar = [...all.values()].map((e) => (stored[e.id] ? { ...e, result: e.result || stored[e.id], status: 'released' as const } : e)).sort((a, b) => a.start.localeCompare(b.start));
  const counts: Record<string, number> = {}; for (const e of calendar) counts[e.kind] = (counts[e.kind] || 0) + 1;
  lastBuild = { at: new Date().toISOString(), errors, counts };
  await updateResults();
  emitUpcoming();
  return lastBuild;
}

/** Fetch results for events that have happened (up to 10 days back) and record them as changes. */
export async function updateResults() {
  const nowMs = Date.now(); const stored = resultsStore(); let changed = false;
  for (const e of calendar) {
    const t = Date.parse(e.start.length === 10 ? `${e.start}T23:59:00Z` : e.start);
    if (t > nowMs - 10 * 60_000 || t < nowMs - 10 * 86400_000 || stored[e.id] || e.kind === 'igo' || e.kind === 'election' || e.kind === 'event' || e.kind === 'budget') continue;
    let res: CalResult | undefined;
    try {
      if (e.kind === 'central-bank') res = await bankResult(e.id.startsWith('cb:') ? e.id.split(':')[1] : USUAL.find((u) => e.id.startsWith(`usual:${u.id}:`))?.area || '', e.start.slice(0, 10));
      else if (e.indicator?.startsWith('us-')) res = await usResult(e);
      else if (e.indicator === 'ea-hicp-flash') res = await eaHicpResult(e);
    } catch { /* provider down: try again next round */ }
    if (!res) { if (t < nowMs) e.status = 'result-pending'; continue; }
    stored[e.id] = res; e.result = res; e.status = 'released'; changed = true;
    recordChange({ key: `econ:${e.id}`, kind: 'econ', entityIds: e.placeIds, title: `${e.title.replace(/^≈ /, '')}: ${res.headline}`, detail: `Importance ${e.importance}/10 · ${e.importanceWhy.join(' · ')}`,
      url: res.url || e.url, sourceId: res.sourceId, quality: 'official', importance: e.importance, at: e.start });
  }
  if (changed) kvSet('econ:results', Object.fromEntries(Object.entries(stored).filter(([k]) => calendar.some((e) => e.id === k)).slice(-2000)));
}

/** Reminders: events of importance ≥ 6 starting within the next 24 hours. */
function emitUpcoming() {
  const nowMs = Date.now();
  emitNew('econ-upcoming', calendar.filter((e) => e.importance >= 6 && e.basis !== 'usual-timing').filter((e) => { const t = Date.parse(e.start); return t > nowMs && t < nowMs + 24 * 3600_000; })
    .map((e): Change => ({ key: `upcoming:${e.id}`, kind: e.kind === 'igo' ? 'igo' : 'econ-upcoming', entityIds: e.placeIds, title: `Within 24 h: ${e.title}${e.timeLabel ? ` (${e.timeLabel})` : ''}`, detail: e.importanceWhy.join(' · '),
      url: e.url, sourceId: e.sourceId, quality: 'official', importance: Math.max(1, e.importance - 1), at: e.start })));
}

/** Events for a place: a euro-area member also sees ECB decisions and euro-area releases. */
export function calendarFor(o: { from?: string; to?: string; place?: string; minImportance?: number; kinds?: string[] } = {}) {
  const places = new Set<string>();
  if (o.place) { places.add(o.place); const iso3 = o.place.startsWith('country:') ? o.place.slice(8) : ''; if (EURO_AREA.includes(iso3)) places.add('igo:eu'); }
  // Elections and curated events come from the live graph at query time (results update every 30 min).
  const fromD = new Date(Date.now() - 45 * 86400_000), toD = new Date(Date.now() + 120 * 86400_000);
  const graph = graphEvents(fromD, toD).filter((g) => !calendar.some((c) => c.id === g.id));
  return [...calendar, ...graph].sort((a, b) => a.start.localeCompare(b.start)).filter((e) => (!o.from || (e.end || e.start).slice(0, 10) >= o.from) && (!o.to || e.start.slice(0, 10) <= o.to) && e.importance >= (o.minImportance || 1)
    && (!o.kinds?.length || o.kinds.includes(e.kind)) && (!places.size || e.placeIds.some((p) => places.has(p))));
}
/** Places with events (for the per-country / per-organisation picker). */
export function calendarPlaces() {
  const n = new Map<string, number>();
  for (const e of calendarFor()) for (const p of e.placeIds) if (/^(country|igo):/.test(p)) n.set(p, (n.get(p) || 0) + 1);
  return [...n].map(([id, count]) => ({ ...stub(id)!, count, weight: WEIGHT[id]?.[0] || 0 })).filter((x) => x.id).sort((a, b) => b.weight - a.weight || b.count - a.count);
}
export function calendarStatus() { return lastBuild; }
/** Hand-entered schedules that run out soon (checked by the data audit). */
export function scheduleWarnings(days = 90) {
  const horizon = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
  const out: { message: string; entityId?: string }[] = [];
  for (const b of BANK_SCHEDULES) {
    const last = [...b.dates].sort().at(-1) || '';
    if (last < horizon) out.push({ entityId: b.placeIds[0], message: `${b.bank}: the hand-entered meeting schedule ends ${last || '(no dates)'} — add the next dates from ${b.url}` });
  }
  return out;
}
/** Every source id the calendar can cite (the audit checks each one is in the source list). */
export function calendarSourceIds() {
  const from = new Date(Date.now() - 45 * 86400_000), to = new Date(Date.now() + 400 * 86400_000);
  return [...new Set([...bankEvents(), ...usualEvents(from, to, new Set()), ...igoEvents(), ...budgetEvents(from, to)].map((e) => e.sourceId).concat(['bls-schedule', 'fred-releases', 'fred', 'eurostat', 'bis-policy']))];
}

export function startCalendar() {
  setTimeout(() => { void buildCalendar().catch((e) => console.warn('[calendar]', e.message)); }, 8000).unref();
  setInterval(() => { void buildCalendar().catch(() => {}); }, 6 * 3600_000).unref();
  // Results: every 15 minutes (a release's figures appear in the sources within minutes to hours).
  setInterval(() => { void updateResults().then(emitUpcoming).catch(() => {}); }, 15 * 60_000).unref();
}

export const _test = { bankEvents, usualEvents, igoEvents, budgetEvents };

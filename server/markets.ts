// Markets, rates and forecasts. Every adapter returns its source id and retrieval time;
// anything a provider does not report is left out (never filled with 0 or a guess).
//   FX & commodity futures ... Yahoo Finance spark endpoint (delayed)
//   Policy rates ............. BIS central bank policy rates (official)
//   Yield curves ............. US Treasury, Bank of Canada, Japan MOF, Bank of England, ECB
//   10-year yields ........... one resolver for map, Markets page and profiles: daily official
//                              closes (US Treasury, Bank of Canada, Japan MOF, Bank of England par
//                              yields) > ECB monthly convergence yields (EU) > OECD monthly via FRED
//   Forecasts ................ IMF World Economic Outlook (DataMapper); FOMC Summary of
//                              Economic Projections (via FRED); fed funds futures (CBOT, delayed)
//   Analyst consensus ........ Yahoo Finance quoteSummary (broker estimates, delayed)
import { cached, fetchJson, fetchText } from './cache.js';
import { entities, getEntity } from './graph.js';
import { usTreasuryCurve, minorUnitFactor } from './providers.js';

const BROWSER_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
/** Run fn over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number, from = new Date()) => isoDate(new Date(from.getTime() - n * 86400_000));

/** Minimal RFC 4180 CSV parser (quoted fields may contain commas, quotes and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

// ───────────────────────── Yahoo spark (many symbols per call, delayed) ─────────────────────────
export interface SparkSeries { symbol: string; price: number; currency?: string; name?: string; time: string; points: { t: string; c: number }[]; }

async function sparkChunk(symbols: string[], range: string, interval: string) {
  return cached(`spark:${range}:${interval}:${symbols.join(',')}`, 900, async () => {
    const json = await fetchJson(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=${range}&interval=${interval}`, BROWSER_UA);
    const out: Record<string, SparkSeries> = {};
    for (const res of json?.spark?.result || []) {
      const resp = res.response?.[0]; const m = resp?.meta;
      if (!m || m.regularMarketPrice == null) continue;
      const closes: (number | null)[] = resp.indicators?.quote?.[0]?.close || [];
      const points = ((resp.timestamp || []) as number[]).map((t, i) => ({ t: isoDate(new Date(t * 1000)), c: closes[i] as number })).filter((p) => p.c != null);
      out[res.symbol] = { symbol: res.symbol, price: m.regularMarketPrice, currency: m.currency, name: m.longName || m.shortName, time: new Date(m.regularMarketTime * 1000).toISOString(), points };
    }
    return out;
  });
}

export async function spark(symbols: string[], range = '1y', interval = '1d') {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  const settled = await Promise.allSettled(chunks.map((c) => sparkChunk(c, range, interval)));
  const data: Record<string, SparkSeries> = {}; let fetchedAt = new Date().toISOString(); let stale = false; let failed = 0;
  for (const s of settled) {
    if (s.status !== 'fulfilled') { failed++; continue; }
    Object.assign(data, s.value.data);
    if (s.value.fetchedAt < fetchedAt) fetchedAt = s.value.fetchedAt;
    stale ||= s.value.stale;
  }
  if (failed === chunks.length && chunks.length) throw new Error((settled[0] as PromiseRejectedResult).reason?.message || 'Quote provider unavailable');
  return { data, fetchedAt, stale, partial: failed > 0 };
}

/** Value of a daily series on or before a date. */
function valueOn(points: { t: string; c: number }[], date: string) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].t <= date) return points[i].c;
  return undefined;
}
/** Percent changes over standard windows. `invert` for quotes expressed per US dollar
 *  (a currency strengthens when it takes fewer units to buy a dollar). */
export function windowChanges(s: SparkSeries, invert = false) {
  const p = s.points; if (p.length < 2) return {};
  const last = p[p.length - 1];
  const chg = (base?: number) => base == null || base === 0 ? undefined : invert ? (base / s.price - 1) * 100 : (s.price / base - 1) * 100;
  const year = last.t.slice(0, 4);
  return {
    d1: chg(p[p.length - 2]?.c),
    w1: chg(valueOn(p, daysAgo(7, new Date(last.t)))),
    m1: chg(valueOn(p, daysAgo(30, new Date(last.t)))),
    ytd: chg(valueOn(p, `${Number(year) - 1}-12-31`)),
    y1: p[0].t <= daysAgo(360, new Date(last.t)) ? chg(valueOn(p, daysAgo(365, new Date(last.t))) ?? p[0].c) : undefined,
  };
}
/** No trade for 10+ days: the price is shown with its date, but changes built from it would mislead. */
export const isStale = (s: SparkSeries) => Date.now() - Date.parse(s.time) > 10 * 86400_000;
const thin = (points: { t: string; c: number }[], n = 60) => points.length <= n ? points : points.filter((_, i) => i % Math.ceil(points.length / n) === 0 || i === points.length - 1);

// ───────────────────────── Currencies ─────────────────────────
// Region buckets for the FX board; everything else falls into "Other".
const FX_MAJORS = ['EUR', 'JPY', 'GBP', 'CNY', 'CHF', 'CAD', 'AUD', 'NZD', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK'];

/** Currency code → countries using it (independent countries first), from the country dataset. */
export function currencyUsers() {
  const m = new Map<string, { code: string; name: string; countries: { id: string; iso3: string; name: string; flag?: string; independent: boolean }[] }>();
  for (const e of entities.values()) {
    if (e.type !== 'country') continue;
    for (const c of (e.attrs?.currencies || []) as { code: string; name: string }[]) {
      const row = m.get(c.code) || m.set(c.code, { code: c.code, name: c.name, countries: [] }).get(c.code)!;
      row.countries.push({ id: e.id, iso3: e.iso3!, name: e.name, flag: e.flag, independent: !!e.attrs?.independent });
    }
  }
  for (const r of m.values()) r.countries.sort((a, b) => Number(b.independent) - Number(a.independent) || a.name.localeCompare(b.name));
  return m;
}

export async function fxBoard() {
  const users = currencyUsers();
  const codes = [...users.keys()].filter((c) => c !== 'USD' && users.get(c)!.countries.some((x) => x.independent)).sort();
  const r = await spark(codes.map((c) => `${c}=X`), '1y', '1d');
  const rows = codes.map((code) => {
    const s = r.data[`${code}=X`];
    const u = users.get(code)!;
    const main = u.countries[0];
    const region = FX_MAJORS.includes(code) ? 'Major currencies' : (getEntity(main.id)?.attrs?.region as string) || 'Other';
    if (!s) return { code, name: u.name, region, countries: u.countries.length, country: main, unavailable: true };
    const staleQuote = isStale(s);
    return { code, name: u.name, region, countries: u.countries.length, country: main, perUsd: s.price, time: s.time, staleQuote, change: staleQuote ? {} : windowChanges(s, true), history: thin(s.points, 40).map((p) => ({ t: p.t, c: 1 / p.c })) };
  });
  return { rows, fetchedAt: r.fetchedAt, stale: r.stale, sourceId: 'yahoo-finance', note: 'Change = the currency’s move against the US dollar (positive = strengthened). Delayed quotes.' };
}

/** One currency against the dollar, for the country profile. */
export async function fxFor(code: string, range = '1y') {
  if (!/^[A-Z]{3}$/.test(code) || code === 'USD') return null;
  const interval = range === '5y' ? '1wk' : range === 'max' ? '1mo' : '1d';
  const r = await spark([`${code}=X`], range, interval);
  const s = r.data[`${code}=X`];
  if (!s) return null;
  return { code, perUsd: s.price, usdPer: 1 / s.price, time: s.time, change: windowChanges(s, true), history: s.points.map((p) => ({ t: p.t, perUsd: p.c })), fetchedAt: r.fetchedAt, stale: r.stale, sourceId: 'yahoo-finance' };
}

// ───────────────────────── Commodity futures board ─────────────────────────
export async function commodityBoard() {
  const list = [...entities.values()].filter((e) => e.type === 'commodity' && e.attrs?.quoteSymbol);
  const syms = [...new Set(list.map((e) => e.attrs!.quoteSymbol as string))];
  const r = await spark(syms, '1y', '1d');
  // A parent whose quote is really one of its benchmarks (crude oil = Brent) is listed once, as the benchmark.
  const dup = (e: typeof list[number]) => list.some((c) => c.parentId === e.id && c.attrs?.quoteSymbol === e.attrs?.quoteSymbol);
  const rows = list.filter((e) => !dup(e)).map((e) => {
    const s = r.data[e.attrs!.quoteSymbol];
    const base = { id: e.id, name: e.name, group: e.attrs?.group || 'Other', unit: e.attrs?.unit, symbol: e.attrs!.quoteSymbol, benchmark: e.attrs?.benchmark, parentId: e.parentId };
    if (!s) return { ...base, unavailable: true };
    // No trade for 10+ days: show the last price with its date, but no "changes" built from stale prices.
    const staleQuote = Date.now() - Date.parse(s.time) > 10 * 86400_000;
    return { ...base, price: s.price, currency: s.currency, contract: s.name, time: s.time, change: staleQuote ? {} : windowChanges(s), history: thin(s.points), thinlyTraded: s.points.length < 60, staleQuote };
  });
  return { rows, fetchedAt: r.fetchedAt, stale: r.stale, sourceId: 'yahoo-finance', note: 'Front-month futures; 1-month and 1-year changes span contract rolls. Delayed quotes.' };
}

// ───────────────────────── Central-bank policy rates (BIS) ─────────────────────────
export const EURO_AREA = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'PRT', 'SVK', 'SVN', 'ESP'];
const iso2to3 = () => { const m: Record<string, string> = {}; for (const e of entities.values()) if (e.type === 'country' && e.iso2) m[e.iso2] = e.iso3!; return m; };

export async function policyRates() {
  return cached('bis:policy:latest', 6 * 3600, async () => {
    const rows = parseCsv(await fetchText('https://stats.bis.org/api/v1/data/WS_CBPOL/D./all?lastNObservations=1&format=csv', {}, 30000));
    const h = rows[0]; const col = (n: string) => h.indexOf(n);
    const map = iso2to3();
    const out: Record<string, { value: number; date: string; bank: string; area: string; stale: boolean }> = {};
    const staleBefore = daysAgo(120);
    for (const r of rows.slice(1)) {
      const area = r[col('REF_AREA')]; const v = parseFloat(r[col('OBS_VALUE')]);
      if (!Number.isFinite(v)) continue;
      // A bank that stopped reporting keeps its last value forever; flag it rather than show it as current.
      const date = r[col('TIME_PERIOD')];
      const rec = { value: v, date, bank: r[col('SOURCE_REF')], area, stale: date < staleBefore };
      if (area === 'XM') for (const iso of EURO_AREA) out[iso] = rec;
      else if (map[area]) out[map[area]] = rec;
    }
    return out;
  });
}

export async function policyRateHistory(iso3: string) {
  const e = getEntity(`country:${iso3}`);
  const area = EURO_AREA.includes(iso3) ? 'XM' : e?.iso2;
  if (!area) return null;
  return cached(`bis:policy:hist:${area}`, 12 * 3600, async () => {
    const rows = parseCsv(await fetchText(`https://stats.bis.org/api/v1/data/WS_CBPOL/M.${area}/all?startPeriod=${new Date().getFullYear() - 10}-01&format=csv`, {}, 30000));
    if (rows.length < 2) return null;
    const h = rows[0];
    const pts = rows.slice(1).map((r) => ({ t: r[h.indexOf('TIME_PERIOD')], v: parseFloat(r[h.indexOf('OBS_VALUE')]) })).filter((p) => Number.isFinite(p.v)).sort((a, b) => a.t.localeCompare(b.t));
    return { area, bank: rows[1][h.indexOf('SOURCE_REF')], points: pts };
  });
}

// ───────────────────────── 10-year government bond yields (OECD via FRED) ─────────────────────────
const OECD_10Y = ['AU', 'AT', 'BE', 'CA', 'CL', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IL', 'IT', 'JP', 'KR', 'LV', 'LT', 'LU', 'MX', 'NL', 'NZ', 'NO', 'PL', 'PT', 'SK', 'SI', 'ES', 'SE', 'CH', 'GB', 'US', 'ZA', 'CR', 'CO', 'TR', 'IN', 'BR', 'CN', 'ID'];

async function fredSeries(id: string, since = '2015-01-01') {
  return cached(`fred:${id}:${since}`, 24 * 3600, async () => {
    const rows = parseCsv(await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${since}`, {}, 20000));
    return rows.slice(1).map((r) => ({ t: r[0], v: parseFloat(r[1]) })).filter((p) => Number.isFinite(p.v));
  });
}

/** Latest OECD monthly 10-year yield per country (no age cut-off here: staleness is flagged by the resolver). */
async function oecdTenYear() {
  return cached('oecd:10y:latest', 24 * 3600, async () => {
    const map = iso2to3();
    const out: Record<string, { value: number; period: string }> = {};
    // Up to 8 requests at a time (was 8 sequential batches of 6).
    await mapLimit(OECD_10Y, 8, async (c) => {
      try {
        const last = (await fredSeries(`IRLTLT01${c}M156N`, daysAgo(400))).data.at(-1);
        if (last && map[c]) out[map[c]] = { value: last.v, period: last.t.slice(0, 7) };
      } catch { /* that country has no series */ }
    });
    if (!Object.keys(out).length) throw new Error('FRED unreachable');
    return out;
  });
}

// ECB "long-term interest rate for convergence purposes": 10-year benchmark yields for every EU
// member (euro and non-euro), monthly. Fills gaps the OECD leaves (Bulgaria, Croatia, Cyprus, Malta, Romania).
const ECB_IRS = 'https://data-api.ecb.europa.eu/service/data/IRS/M.{AREA}.L.L40.CI.0000..N.Z';
export function parseEcbIrs(csv: string) {
  const rows = parseCsv(csv); const h = rows[0] || [];
  const ai = h.indexOf('REF_AREA'), ti = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
  return rows.slice(1).map((r) => ({ area: r[ai] === 'GR' || r[ai] === 'EL' ? 'GR' : r[ai], t: r[ti], v: parseFloat(r[vi]) })).filter((p) => p.area && /^\d{4}-\d{2}$/.test(p.t) && Number.isFinite(p.v));
}
async function ecbTenYear() {
  return cached('ecb:irs:latest', 24 * 3600, async () => {
    const map = iso2to3();
    const out: Record<string, { value: number; period: string }> = {};
    for (const p of parseEcbIrs(await fetchText(`${ECB_IRS.replace('{AREA}', '')}?lastNObservations=1&format=csvdata`, {}, 30000))) {
      const iso = map[p.area]; if (iso && (!out[iso] || p.t > out[iso].period)) out[iso] = { value: p.v, period: p.t };
    }
    if (!Object.keys(out).length) throw new Error('ECB long-term rates unavailable');
    return out;
  });
}

export interface TenYear { value: number; date: string; frequency: 'daily' | 'monthly'; sourceId: string; basis: string; stale: boolean; }
const DAILY_10Y: Record<string, string> = { USA: 'US Treasury 10-year par yield, daily close', CAN: 'Government of Canada 10-year benchmark, daily', JPN: 'JGB 10-year, daily (Japan MOF)', GBR: 'UK gilt 10-year nominal par yield, daily (Bank of England)' };
const monthsBack = (n: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };

/** Best available 10-year government yield for every country — the single source of truth for the
 *  map layer, the Markets page and country profiles, so they never disagree. Daily official closes
 *  beat monthly averages; a monthly value more than 4 months old, or a daily one more than 14 days
 *  old, is returned with stale = true (shown with its date, left off the map). */
export async function tenYearBoard() {
  const [oecd, ecb, ...curves] = await Promise.allSettled([oecdTenYear(), ecbTenYear(), ...Object.keys(DAILY_10Y).map((iso) => yieldCurve(iso))]);
  const data: Record<string, TenYear> = {};
  const errors: string[] = []; let fetchedAt = new Date().toISOString(); let stale = false;
  const monthlyCut = monthsBack(4), dailyCut = daysAgo(14);
  const note = (r: PromiseSettledResult<any>, label: string) => {
    if (r.status === 'rejected') { errors.push(`${label}: ${r.reason?.message || r.reason}`); return null; }
    if (r.value?.fetchedAt && r.value.fetchedAt < fetchedAt) fetchedAt = r.value.fetchedAt;
    stale ||= !!r.value?.stale;
    return r.value;
  };
  const o = note(oecd, 'OECD');
  for (const [iso, v] of Object.entries<any>(o?.data || {})) data[iso] = { value: v.value, date: v.period, frequency: 'monthly', sourceId: 'oecd-mei', basis: 'Monthly average (OECD)', stale: v.period < monthlyCut };
  const e = note(ecb, 'ECB');
  for (const [iso, v] of Object.entries<any>(e?.data || {})) if (!data[iso] || v.period >= data[iso].date) data[iso] = { value: v.value, date: v.period, frequency: 'monthly', sourceId: 'ecb-irs', basis: 'Monthly average, EU convergence benchmark (ECB)', stale: v.period < monthlyCut };
  Object.keys(DAILY_10Y).forEach((iso, i) => {
    const c = note(curves[i], iso);
    const ten = c?.latest?.points.find((p: CurvePoint) => p.years === 10);
    if (ten) data[iso] = { value: ten.value, date: c.latest.date, frequency: 'daily', sourceId: c.sourceId, basis: DAILY_10Y[iso], stale: c.latest.date < dailyCut };
  });
  if (!Object.keys(data).length) throw new Error(errors.join(' · ') || 'No 10-year yield source reachable');
  return { data, fetchedAt, stale, errors };
}

const EU_NON_EURO = ['CZE', 'HUN', 'POL', 'ROU', 'SWE', 'DNK'];
/** The same answer tenYearBoard gives for one country, fetching only that country's sources —
 *  a profile no longer waits for ~45 series it does not show. Same priority and staleness rules. */
export async function tenYearFor(iso3: string): Promise<TenYear | null> {
  const monthlyCut = monthsBack(4);
  if (DAILY_10Y[iso3]) {
    try {
      const c = await yieldCurve(iso3);
      const ten = c?.latest.points.find((p) => p.years === 10);
      if (c && ten) return { value: ten.value, date: c.latest.date, frequency: 'daily', sourceId: c.sourceId, basis: DAILY_10Y[iso3], stale: c.latest.date < daysAgo(14) };
    } catch { /* fall through to monthly */ }
  }
  if (EURO_AREA.includes(iso3) || EU_NON_EURO.includes(iso3)) {
    try { const v = (await ecbTenYear()).data[iso3]; if (v) return { value: v.value, date: v.period, frequency: 'monthly', sourceId: 'ecb-irs', basis: 'Monthly average, EU convergence benchmark (ECB)', stale: v.period < monthlyCut }; } catch { /* fall through */ }
  }
  const iso2 = getEntity(`country:${iso3}`)?.iso2;
  if (!iso2 || !OECD_10Y.includes(iso2)) return null;
  try {
    const last = (await fredSeries(`IRLTLT01${iso2}M156N`, daysAgo(400))).data.at(-1);
    return last ? { value: last.v, date: last.t.slice(0, 7), frequency: 'monthly', sourceId: 'oecd-mei', basis: 'Monthly average (OECD)', stale: last.t.slice(0, 7) < monthlyCut } : null;
  } catch { return null; }
}

/** Monthly 10-year history for a profile chart (ECB for EU members, else OECD). */
export async function tenYearHistory(iso3: string) {
  const iso2 = getEntity(`country:${iso3}`)?.iso2;
  if (!iso2) return null;
  const eu = getEntity(`country:${iso3}`) && (EURO_AREA.includes(iso3) || EU_NON_EURO.includes(iso3));
  if (eu) {
    try {
      const r = await cached(`ecb:irs:${iso2}`, 24 * 3600, async () => parseEcbIrs(await fetchText(`${ECB_IRS.replace('{AREA}', iso2 === 'GR' ? 'GR' : iso2)}?startPeriod=${new Date().getFullYear() - 10}-01&format=csvdata`, {}, 30000)).map((p) => ({ t: `${p.t}-01`, v: p.v })));
      if (r.data.length) return { points: r.data.sort((a, b) => a.t.localeCompare(b.t)), fetchedAt: r.fetchedAt, sourceId: 'ecb-irs' };
    } catch { /* fall back to OECD */ }
  }
  if (!OECD_10Y.includes(iso2)) return null;
  try { const r = await fredSeries(`IRLTLT01${iso2}M156N`); return r.data.length ? { points: r.data, fetchedAt: r.fetchedAt, sourceId: 'oecd-mei' } : null; } catch { return null; }
}

// ───────────────────────── Yield curves ─────────────────────────
export interface CurvePoint { label: string; years: number; value: number; }
export interface Curve { date: string; points: CurvePoint[]; }
export interface CurveResult { name: string; latest: Curve; monthAgo?: Curve; yearAgo?: Curve; sourceId: string; note?: string; fetchedAt?: string; stale?: boolean; }

function withComparisons(rows: Curve[], name: string, sourceId: string, note?: string): CurveResult {
  const sorted = rows.filter((r) => r.points.length >= 2).sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) throw new Error('No curve data');
  const latest = sorted[0];
  const find = (days: number) => sorted.find((r) => r.date <= daysAgo(days, new Date(latest.date)));
  return { name, latest, monthAgo: find(30), yearAgo: find(365), sourceId, note };
}

async function canadaCurve() {
  return cached('curve:CAN', 6 * 3600, async () => {
    const start = daysAgo(380);
    const [bonds, bills] = await Promise.all([
      fetchJson(`https://www.bankofcanada.ca/valet/observations/group/bond_yields_benchmark/json?start_date=${start}`),
      fetchJson(`https://www.bankofcanada.ca/valet/observations/group/tbill_all/json?start_date=${start}`).catch(() => null),
    ]);
    const tenor: Record<string, [string, number]> = { 'BD.CDN.2YR.DQ.YLD': ['2 Yr', 2], 'BD.CDN.3YR.DQ.YLD': ['3 Yr', 3], 'BD.CDN.5YR.DQ.YLD': ['5 Yr', 5], 'BD.CDN.7YR.DQ.YLD': ['7 Yr', 7], 'BD.CDN.10YR.DQ.YLD': ['10 Yr', 10], 'BD.CDN.LONG.DQ.YLD': ['Long', 30] };
    const billTenor: Record<string, [string, number]> = {};
    for (const [id, d] of Object.entries<any>(bills?.seriesDetail || {})) {
      const m = /^(\d+) (month|year)/i.exec(d.label || '');
      if (m && !(m[1] === '1' && m[2] === 'month')) billTenor[id] = [`${m[1]} ${m[2] === 'year' ? 'Yr' : 'Mo'}`, m[2] === 'year' ? +m[1] : +m[1] / 12];
    }
    const byDate = new Map<string, CurvePoint[]>();
    const take = (obs: any[], map: Record<string, [string, number]>) => {
      for (const o of obs || []) for (const [id, [label, years]] of Object.entries(map)) {
        const v = parseFloat(o[id]?.v); if (!Number.isFinite(v)) continue;
        (byDate.get(o.d) || byDate.set(o.d, []).get(o.d)!).push({ label, years, value: v });
      }
    };
    take(bills?.observations, billTenor); take(bonds.observations, tenor);
    const rows = [...byDate].map(([date, points]) => ({ date, points: points.sort((a, b) => a.years - b.years) })).filter((r) => r.points.some((p) => p.years >= 10));
    return withComparisons(rows, 'Government of Canada benchmark bond & T-bill yields', 'bank-of-canada', '“Long” is the Bank of Canada long-term benchmark (≈30 years).');
  });
}

async function japanCurve() {
  return cached('curve:JPN', 6 * 3600, async () => {
    const parse = (csv: string) => {
      const rows = parseCsv(csv); const hi = rows.findIndex((r) => r[0] === 'Date'); if (hi < 0) return [];
      const h = rows[hi];
      return rows.slice(hi + 1).map((r) => {
        const [y, m, d] = r[0].split('/');
        const points = h.slice(1).map((lab, i) => ({ label: lab.replace('Y', ' Yr'), years: parseInt(lab), value: parseFloat(r[i + 1]) })).filter((p) => Number.isFinite(p.value));
        return { date: `${y}-${m?.padStart(2, '0')}-${d?.padStart(2, '0')}`, points };
      }).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
    };
    const cur = parse(await fetchText('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv', {}, 25000));
    let hist: Curve[] = [];
    try { hist = parse(await fetchText('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv', {}, 40000)).filter((r) => r.date >= daysAgo(400)); } catch { /* history optional */ }
    return withComparisons([...hist, ...cur], 'Japanese Government Bond yields', 'mof-japan');
  });
}

// Par yields are what gilts are quoted on (comparable with US Treasury par yields); the fitted
// zero-coupon curve is only used if the par series are missing.
const BOE_PAR: [string, string, number][] = [['IUDSNPY', '5 Yr', 5], ['IUDMNPY', '10 Yr', 10], ['IUDLNPY', '20 Yr', 20]];
const BOE_ZERO: [string, string, number][] = [['IUDSNZC', '5 Yr', 5], ['IUDMNZC', '10 Yr', 10], ['IUDLNZC', '20 Yr', 20]];
export function parseBoeCurve(csv: string) {
  const rows = parseCsv(csv);
  if (rows[0]?.[0] !== 'DATE') throw new Error('Bank of England data unavailable');
  const h = rows[0].map((x) => x.trim());
  const build = (set: [string, string, number][]) => rows.slice(1).map((r) => ({
    date: isoDate(new Date(`${r[0]} UTC`)),
    points: set.map(([code, label, years]) => ({ label, years, value: parseFloat(r[h.indexOf(code)]) })).filter((p) => Number.isFinite(p.value)),
  })).filter((c) => c.points.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(c.date));
  const par = build(BOE_PAR);
  return par.length ? { rows: par, kind: 'par' as const } : { rows: build(BOE_ZERO), kind: 'zero' as const };
}
async function ukCurve() {
  return cached('curve:GBR:v2', 6 * 3600, async () => {
    const from = new Date(Date.now() - 380 * 86400_000);
    const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}/${d.getUTCFullYear()}`;
    const codes = [...BOE_PAR, ...BOE_ZERO].map(([c]) => c).join(',');
    const csv = await fetchText(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${fmt(from)}&Dateto=now&SeriesCodes=${codes}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`, BROWSER_UA, 25000);
    const { rows, kind } = parseBoeCurve(csv);
    return withComparisons(rows, kind === 'par' ? 'UK gilt nominal par yields' : 'UK gilt nominal zero-coupon yields', 'bank-of-england',
      kind === 'par' ? 'Nominal par yields at 5, 10 and 20 years (Bank of England yield-curve estimates) — comparable with quoted gilt yields.' : 'Fitted zero-coupon yields at 5, 10 and 20 years (par yields were unavailable).');
  });
}

async function euroCurve() {
  return cached('curve:EUR', 6 * 3600, async () => {
    const mats: [string, string, number][] = [['3M', '3 Mo', 0.25], ['6M', '6 Mo', 0.5], ['1Y', '1 Yr', 1], ['2Y', '2 Yr', 2], ['3Y', '3 Yr', 3], ['5Y', '5 Yr', 5], ['7Y', '7 Yr', 7], ['10Y', '10 Yr', 10], ['15Y', '15 Yr', 15], ['20Y', '20 Yr', 20], ['30Y', '30 Yr', 30]];
    const key = mats.map(([m]) => `SR_${m}`).join('+');
    const rows = parseCsv(await fetchText(`https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.${key}?startPeriod=${daysAgo(380)}&format=csvdata`, {}, 40000));
    const h = rows[0]; const ki = h.indexOf('KEY'), ti = h.indexOf('TIME_PERIOD'), vi = h.indexOf('OBS_VALUE');
    const byDate = new Map<string, CurvePoint[]>();
    for (const r of rows.slice(1)) {
      const m = mats.find(([c]) => r[ki].endsWith(`SR_${c}`)); const v = parseFloat(r[vi]);
      if (!m || !Number.isFinite(v)) continue;
      (byDate.get(r[ti]) || byDate.set(r[ti], []).get(r[ti])!).push({ label: m[1], years: m[2], value: v });
    }
    return withComparisons([...byDate].map(([date, points]) => ({ date, points: points.sort((a, b) => a.years - b.years) })), 'Euro area AAA-rated government bond yield curve', 'ecb-yield-curve',
      'ECB spot-rate curve fitted to AAA-rated euro area central-government bonds — a euro-wide benchmark, not this country’s own bonds. Country 10-year yields are shown separately where the OECD publishes them.');
  });
}

export function curveAvailable(iso3: string) { return ['USA', 'CAN', 'JPN', 'GBR'].includes(iso3) || EURO_AREA.includes(iso3) || iso3 === 'EUR'; }

export async function yieldCurve(iso3: string): Promise<(CurveResult & { fetchedAt: string; stale: boolean }) | null> {
  if (iso3 === 'USA') {
    const r = await usTreasuryCurve();
    return { name: 'US Treasury par yield curve', ...r.data, fetchedAt: r.fetchedAt, stale: r.stale, note: 'Par yields, daily close.' } as any;
  }
  const fn = iso3 === 'CAN' ? canadaCurve : iso3 === 'JPN' ? japanCurve : iso3 === 'GBR' ? ukCurve : EURO_AREA.includes(iso3) || iso3 === 'EUR' ? euroCurve : null;
  if (!fn) return null;
  const r = await fn();
  return { ...r.data, fetchedAt: r.fetchedAt, stale: r.stale };
}

// ───────────────────────── IMF World Economic Outlook (DataMapper) ─────────────────────────
export const IMF_INDICATORS: Record<string, { label: string; unit: string; short: string }> = {
  NGDP_RPCH: { label: 'Real GDP growth', unit: '%', short: 'Growth' },
  PCPIPCH: { label: 'Inflation, average consumer prices', unit: '%', short: 'Inflation' },
  LUR: { label: 'Unemployment rate', unit: '%', short: 'Unemployment' },
  GGXWDG_NGDP: { label: 'General government gross debt', unit: '% of GDP', short: 'General govt debt' },
  GGXCNL_NGDP: { label: 'General government net lending/borrowing', unit: '% of GDP', short: 'General govt balance' },
  BCA_NGDPD: { label: 'Current account balance', unit: '% of GDP', short: 'Current account' },
  NGDPD: { label: 'GDP, current prices', unit: 'USD bn', short: 'GDP' },
  NGDPDPC: { label: 'GDP per capita, current prices', unit: 'USD', short: 'GDP / capita' },
};
const IMF_ISO: Record<string, string> = { UVK: 'UNK', WBG: 'PSE' };

export async function imfIndicator(code: string) {
  if (!IMF_INDICATORS[code]) throw new Error('Unknown IMF indicator');
  return cached(`imf:${code}`, 24 * 3600, async () => {
    const json = await fetchJson(`https://www.imf.org/external/datamapper/api/v1/${code}`, {}, 40000);
    const vals = json?.values?.[code] || {};
    const out: Record<string, Record<string, number>> = {};
    for (const [iso, years] of Object.entries<any>(vals)) {
      const id = IMF_ISO[iso] || iso;
      if (!getEntity(`country:${id}`)) continue; // skip regional aggregates
      out[id] = Object.fromEntries(Object.entries<any>(years).filter(([, v]) => typeof v === 'number'));
    }
    return out;
  });
}

export async function imfEdition() {
  return cached('imf:meta', 7 * 86400, async () => {
    const json = await fetchJson('https://www.imf.org/external/datamapper/api/v1/indicators', {}, 30000);
    const ind = json?.indicators?.NGDP_RPCH || {};
    return { dataset: ind.dataset as string | undefined, source: ind.source as string | undefined };
  }).then((r) => r.data).catch(() => ({ dataset: undefined, source: undefined }));
}

export async function imfCountry(iso3: string) {
  const year = new Date().getFullYear();
  const years = [year - 2, year - 1, year, year + 1, year + 2].map(String);
  const settled = await Promise.allSettled(Object.keys(IMF_INDICATORS).map((c) => imfIndicator(c)));
  const rows = Object.keys(IMF_INDICATORS).map((code, i) => {
    const s = settled[i];
    const v = s.status === 'fulfilled' ? s.value.data[iso3] : undefined;
    return { code, ...IMF_INDICATORS[code], values: Object.fromEntries(years.map((y) => [y, v?.[y]]).filter(([, x]) => x != null)) };
  }).filter((r) => Object.keys(r.values).length);
  const ok = settled.find((s) => s.status === 'fulfilled') as PromiseFulfilledResult<any> | undefined;
  return { years, currentYear: String(year), rows, edition: await imfEdition(), fetchedAt: ok?.value.fetchedAt, sourceId: 'imf-weo' };
}

// ───────────────────────── US monetary-policy expectations ─────────────────────────
const SEP: [string, string, string][] = [
  ['FEDTARMD', 'Federal funds rate (end of year)', '%'], ['GDPC1MD', 'Real GDP growth (Q4/Q4)', '%'], ['UNRATEMD', 'Unemployment rate (Q4)', '%'],
  ['PCECTPIMD', 'PCE inflation (Q4/Q4)', '%'], ['JCXFEMD', 'Core PCE inflation (Q4/Q4)', '%'],
];
const MONTH_CODES = 'FGHJKMNQUVXZ';

export async function fedOutlook() {
  const sep = await Promise.all(SEP.map(async ([id, label, unit]) => {
    try {
      const r = await fredSeries(id, '2020-01-01');
      const lr = id === 'FEDTARMD' || id === 'GDPC1MD' || id === 'UNRATEMD' || id === 'PCECTPIMD' ? await fredSeries(`${id}LR`, '2020-01-01').catch(() => null) : null;
      return { id, label, unit, values: r.data.filter((p) => p.t >= `${new Date().getFullYear()}`).map((p) => ({ year: p.t.slice(0, 4), value: p.v })), longerRun: lr?.data.at(-1)?.v, fetchedAt: r.fetchedAt };
    } catch { return { id, label, unit, values: [], unavailable: true }; }
  }));
  // Fed funds futures: price = 100 − expected average effective rate for the contract month.
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
  const syms = months.map((d) => `ZQ${MONTH_CODES[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}.CBT`);
  let futures: any[] = []; let futuresAt: string | undefined; let futuresError: string | undefined;
  try {
    const r = await spark(syms, '5d', '1d');
    futuresAt = r.fetchedAt;
    futures = months.map((d, i) => { const s = r.data[syms[i]]; return s ? { month: isoDate(d).slice(0, 7), symbol: syms[i], price: s.price, impliedRate: +(100 - s.price).toFixed(3), time: s.time } : null; }).filter(Boolean);
  } catch (e: any) { futuresError = e.message; }
  let policy: any = null;
  try { policy = (await policyRates()).data.USA || null; } catch { /* optional */ }
  return { sep, sepSourceId: 'fed-sep', futures, futuresAt, futuresError, futuresSourceId: 'cme-fedfunds', policy };
}

// ───────────────────────── Analyst consensus (Yahoo quoteSummary) ─────────────────────────
let crumb: { cookie: string; crumb: string; at: number } | null = null;
async function yahooSession(force = false) {
  if (crumb && !force && Date.now() - crumb.at < 6 * 3600_000) return crumb;
  const r1 = await fetch('https://fc.yahoo.com', { headers: BROWSER_UA, redirect: 'manual', signal: AbortSignal.timeout(15000) }).catch(() => null);
  const cookie = (r1?.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { ...BROWSER_UA, cookie }, signal: AbortSignal.timeout(15000) });
  const c = (await r2.text()).trim();
  if (!r2.ok || !c || c.length > 40 || /</.test(c)) throw new Error('Could not open a Yahoo Finance session');
  crumb = { cookie, crumb: c, at: Date.now() };
  return crumb;
}
const raw = (x: any) => (x && typeof x === 'object' ? x.raw : x) ?? undefined;

export async function analystConsensus(symbol: string) {
  return cached(`consensus:${symbol}`, 6 * 3600, async () => {
    let json: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = await yahooSession(attempt > 0);
      const res = await fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,earningsTrend,recommendationTrend,price&crumb=${encodeURIComponent(s.crumb)}`, { headers: { ...BROWSER_UA, cookie: s.cookie }, signal: AbortSignal.timeout(20000) });
      json = await res.json().catch(() => null);
      if (res.status !== 401) break;
    }
    const r = json?.quoteSummary?.result?.[0];
    if (!r) throw new Error(json?.quoteSummary?.error?.description || 'No analyst data');
    const fd = r.financialData || {};
    const estimates = (r.earningsTrend?.trend || []).filter((t: any) => ['0q', '+1q', '0y', '+1y'].includes(t.period)).map((t: any) => ({
      period: t.period, endDate: t.endDate,
      eps: { avg: raw(t.earningsEstimate?.avg), low: raw(t.earningsEstimate?.low), high: raw(t.earningsEstimate?.high), yearAgo: raw(t.earningsEstimate?.yearAgoEps), analysts: raw(t.earningsEstimate?.numberOfAnalysts), growth: raw(t.earningsEstimate?.growth) },
      revenue: { avg: raw(t.revenueEstimate?.avg), low: raw(t.revenueEstimate?.low), high: raw(t.revenueEstimate?.high), yearAgo: raw(t.revenueEstimate?.yearAgoRevenue), analysts: raw(t.revenueEstimate?.numberOfAnalysts), growth: raw(t.revenueEstimate?.growth) },
      epsTrend: { current: raw(t.epsTrend?.current), d30: raw(t.epsTrend?.['30daysAgo']), d90: raw(t.epsTrend?.['90daysAgo']) },
      revisions: { up30: raw(t.epsRevisions?.upLast30days), down30: raw(t.epsRevisions?.downLast30days) },
      currency: t.earningsEstimate?.earningsCurrency,
    }));
    const trend = (r.recommendationTrend?.trend || []).find((t: any) => t.period === '0m');
    const has = (v: any) => v != null && v !== 0;
    // Price targets are in the quote currency, which can be a minor unit (pence on the LSE).
    const { factor, currency: quoteCurrency } = minorUnitFactor(r.price?.currency);
    const px = (v: any) => (raw(v) == null ? undefined : raw(v) * factor);
    return {
      symbol, currency: quoteCurrency || fd.financialCurrency, reportingCurrency: fd.financialCurrency, currentPrice: px(fd.currentPrice),
      target: has(raw(fd.targetMeanPrice)) ? { mean: px(fd.targetMeanPrice), median: px(fd.targetMedianPrice), high: px(fd.targetHighPrice), low: px(fd.targetLowPrice) } : null,
      analysts: raw(fd.numberOfAnalystOpinions),
      recommendation: fd.recommendationKey && fd.recommendationKey !== 'none' ? { key: fd.recommendationKey as string, mean: raw(fd.recommendationMean) } : null,
      ratings: trend ? { strongBuy: trend.strongBuy, buy: trend.buy, hold: trend.hold, sell: trend.sell, strongSell: trend.strongSell } : null,
      estimates: estimates.filter((e: any) => e.eps.avg != null || e.revenue.avg != null),
      sourceId: 'yahoo-consensus',
    };
  });
}

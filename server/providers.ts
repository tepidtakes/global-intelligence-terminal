// External data adapters. Each returns provenance (source id, period, retrieval time)
// alongside the values so the UI can always say where a number came from.
import { cached, fetchJson, fetchText } from './cache.js';
import type { Indicator, Quote, SeriesPoint } from '../shared/types.js';
import { USER_AGENT } from './config.js';

// ───────────────────────── World Bank WDI ─────────────────────────
export const WB_INDICATORS: Record<string, { label: string; unit: string; short: string }> = {
  'SP.POP.TOTL': { label: 'Population', unit: 'people', short: 'Population' },
  'NY.GDP.MKTP.CD': { label: 'GDP (nominal, current US$)', unit: 'USD', short: 'GDP' },
  'NY.GDP.MKTP.PP.CD': { label: 'GDP, PPP (current international $)', unit: 'intl $', short: 'GDP (PPP)' },
  'NY.GDP.PCAP.CD': { label: 'GDP per capita (current US$)', unit: 'USD', short: 'GDP / capita' },
  'NY.GDP.PCAP.PP.CD': { label: 'GDP per capita, PPP (current intl $)', unit: 'intl $', short: 'GDP / capita (PPP)' },
  'NY.GDP.MKTP.KD.ZG': { label: 'Real GDP growth (annual %)', unit: '%', short: 'Real growth' },
  'FP.CPI.TOTL.ZG': { label: 'Inflation, consumer prices (annual %)', unit: '%', short: 'Inflation' },
  'SL.UEM.TOTL.ZS': { label: 'Unemployment (% of labor force, ILO modeled)', unit: '%', short: 'Unemployment' },
  'GC.DOD.TOTL.GD.ZS': { label: 'Central government debt (% of GDP)', unit: '% of GDP', short: 'Central govt debt' },
  'GC.NLD.TOTL.GD.ZS': { label: 'Central government net lending (+) / borrowing (–) (% of GDP)', unit: '% of GDP', short: 'Central govt balance' },
  'BN.CAB.XOKA.GD.ZS': { label: 'Current account balance (% of GDP)', unit: '% of GDP', short: 'Current account' },
  'NE.EXP.GNFS.CD': { label: 'Exports of goods & services (current US$)', unit: 'USD', short: 'Exports' },
  'NE.IMP.GNFS.CD': { label: 'Imports of goods & services (current US$)', unit: 'USD', short: 'Imports' },
  'NE.EXP.GNFS.ZS': { label: 'Exports of goods & services (% of GDP)', unit: '% of GDP', short: 'Exports / GDP' },
  'BX.KLT.DINV.WD.GD.ZS': { label: 'Foreign direct investment, net inflows (% of GDP)', unit: '% of GDP', short: 'FDI inflows' },
  'TX.VAL.FUEL.ZS.UN': { label: 'Fuel exports (% of merchandise exports)', unit: '%', short: 'Fuel exports share' },
  'CM.MKT.LCAP.GD.ZS': { label: 'Market cap. of listed domestic companies (% of GDP)', unit: '% of GDP', short: 'Stock mkt cap / GDP' },
  'FR.INR.LEND': { label: 'Lending interest rate (%)', unit: '%', short: 'Lending rate' },
  'PA.NUS.FCRF': { label: 'Official exchange rate (LCU per US$, period avg.)', unit: 'LCU per USD', short: 'FX rate' },
  'ST.INT.ARVL': { label: 'International tourism, number of arrivals', unit: 'arrivals', short: 'Tourist arrivals' },
  'ST.INT.RCPT.CD': { label: 'International tourism receipts (current US$)', unit: 'USD', short: 'Tourism receipts' },
  // Tariffs each country applies (TRAINS via WITS, compiled by the World Bank)
  'TM.TAX.MRCH.WM.AR.ZS': { label: 'Tariff rate, applied, weighted mean, all products (%)', unit: '%', short: 'Applied tariff (trade-weighted)' },
  'TM.TAX.MRCH.SM.AR.ZS': { label: 'Tariff rate, applied, simple mean, all products (%)', unit: '%', short: 'Applied tariff (simple mean)' },
  'TM.TAX.MRCH.WM.FN.ZS': { label: 'Tariff rate, most favoured nation, weighted mean, all products (%)', unit: '%', short: 'MFN tariff (trade-weighted)' },
  // Reserves (IMF International Financial Statistics, via the World Bank)
  'FI.RES.TOTL.CD': { label: 'Total reserves, including gold (current US$)', unit: 'USD', short: 'Reserves incl. gold' },
  'FI.RES.XGLD.CD': { label: 'Total reserves, excluding gold (current US$)', unit: 'USD', short: 'Reserves excl. gold' },
  'FI.RES.TOTL.MO': { label: 'Total reserves in months of imports', unit: 'months', short: 'Reserves (months of imports)' },
  // Central-government budgets (IMF Government Finance Statistics, via the World Bank)
  'GC.REV.XGRT.GD.ZS': { label: 'Central government revenue, excluding grants (% of GDP)', unit: '% of GDP', short: 'Revenue' },
  'GC.TAX.TOTL.GD.ZS': { label: 'Tax revenue (% of GDP)', unit: '% of GDP', short: 'Tax revenue' },
  'GC.XPN.TOTL.GD.ZS': { label: 'Central government expense (% of GDP)', unit: '% of GDP', short: 'Expense' },
  'GC.XPN.INTP.RV.ZS': { label: 'Interest payments (% of revenue)', unit: '% of revenue', short: 'Interest / revenue' },
  'MS.MIL.XPND.GD.ZS': { label: 'Military expenditure (% of GDP, SIPRI)', unit: '% of GDP', short: 'Military spending' },
  'SE.XPD.TOTL.GD.ZS': { label: 'Government expenditure on education (% of GDP)', unit: '% of GDP', short: 'Education spending' },
  'SH.XPD.GHED.GD.ZS': { label: 'Government health expenditure (% of GDP)', unit: '% of GDP', short: 'Health spending' },
};
export const TARIFF_INDICATORS = ['TM.TAX.MRCH.WM.AR.ZS', 'TM.TAX.MRCH.SM.AR.ZS', 'TM.TAX.MRCH.WM.FN.ZS'];
export const RESERVE_INDICATORS = ['FI.RES.TOTL.CD', 'FI.RES.XGLD.CD', 'FI.RES.TOTL.MO'];
export const BUDGET_INDICATORS = ['GC.REV.XGRT.GD.ZS', 'GC.TAX.TOTL.GD.ZS', 'GC.XPN.TOTL.GD.ZS', 'GC.XPN.INTP.RV.ZS', 'MS.MIL.XPND.GD.ZS', 'SE.XPD.TOTL.GD.ZS', 'SH.XPD.GHED.GD.ZS'];

export const PROFILE_INDICATORS = [
  'SP.POP.TOTL', 'NY.GDP.MKTP.CD', 'NY.GDP.MKTP.PP.CD', 'NY.GDP.PCAP.CD', 'NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG',
  'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'GC.NLD.TOTL.GD.ZS', 'BN.CAB.XOKA.GD.ZS', 'NE.EXP.GNFS.CD', 'NE.IMP.GNFS.CD',
  'BX.KLT.DINV.WD.GD.ZS', 'TX.VAL.FUEL.ZS.UN', 'CM.MKT.LCAP.GD.ZS', 'FR.INR.LEND', 'PA.NUS.FCRF', 'ST.INT.ARVL', 'ST.INT.RCPT.CD',
];

const WB = 'https://api.worldbank.org/v2';

/** One indicator for every country (map layers). year undefined = most recent non-empty value per country. */
/** Unit of a World Bank indicator from its name: "GDP (current US$)" → USD, "(% of GDP)" → % of GDP. */
export function unitFromName(name: string) {
  const u = /\(([^()]*)\)\s*$/.exec(name)?.[1] || '';
  if (/US\$/.test(u)) return 'USD';
  if (/^% of /.test(u)) return u;
  if (/%/.test(u)) return '%';
  if (/^(per |years?$|days?$|months?$|kg|metric tons|hectares|km|tonnes)/i.test(u)) return u;
  return u || '';
}
const WB_CODE = /^[A-Za-z0-9._]{3,48}$/;
/** Label and unit for any World Bank indicator: the hand-labelled ones, else from the data's own name. */
export function wbMeta(code: string, name?: string) {
  if (WB_INDICATORS[code]) return WB_INDICATORS[code];
  const label = name || code;
  return { label, unit: unitFromName(label), short: label.replace(/\s*\([^)]*\)\s*$/, '') };
}

export async function wbIndicatorAll(code: string, year?: string) {
  if (!WB_CODE.test(code)) throw new Error('Unknown indicator');
  const q = year ? `date=${encodeURIComponent(year)}` : 'mrnev=1';
  return cached(`wb:all:${code}:${year || 'latest'}`, 86400, async () => {
    const json = await fetchJson(`${WB}/country/all/indicator/${code}?format=json&per_page=1000&${q}`);
    const rows: any[] = json?.[1] || [];
    const values: Record<string, { value: number; period: string }> = {};
    for (const r of rows) {
      if (r.value == null || !r.countryiso3code) continue;
      values[r.countryiso3code] = { value: r.value, period: r.date };
    }
    if (!rows.length && !WB_INDICATORS[code]) throw new Error(`The World Bank has no data for indicator ${code}`);
    return { code, ...wbMeta(code, rows[0]?.indicator?.value), values, lastUpdated: json?.[0]?.lastupdated as string | undefined };
  });
}

/** Time series for one country across many indicators (profile Macro section). */
export async function wbCountrySeries(iso3: string, codes = PROFILE_INDICATORS) {
  return cached(`wb:country:${iso3}:${codes.join(',')}`, 86400, async () => {
    const out: Indicator[] = [];
    // The multi-indicator endpoint is limited to 60 characters of codes per call in practice; batch,
    // and fetch the batches in parallel (they were sequential: four round trips per profile).
    const batches: string[][] = [];
    for (let i = 0; i < codes.length; i += 6) batches.push(codes.slice(i, i + 6));
    const jsons = await Promise.all(batches.map((batch) => fetchJson(`${WB}/country/${iso3}/indicator/${batch.join(';')}?source=2&format=json&per_page=2000&date=2000:2030`)));
    for (const [bi, batch] of batches.entries()) {
      const rows: any[] = jsons[bi]?.[1] || [];
      for (const code of batch) {
        const series: SeriesPoint[] = rows
          .filter((r) => r.indicator?.id === code && r.value != null)
          .map((r) => ({ period: r.date, value: r.value }))
          .sort((a, b) => a.period.localeCompare(b.period));
        const meta = wbMeta(code, rows.find((r) => r.indicator?.id === code)?.indicator?.value);
        out.push({ code, label: meta.label, unit: meta.unit, series, latest: series[series.length - 1], sourceId: 'world-bank-wdi' });
      }
    }
    return out;
  });
}

/** Country metadata: income group, region, lending type. */
export async function wbCountryMeta() {
  return cached('wb:countrymeta', 7 * 86400, async () => {
    const json = await fetchJson(`${WB}/country?format=json&per_page=400`);
    const meta: Record<string, { incomeLevel: string; region: string; lendingType: string; capital: string; name?: string }> = {};
    for (const c of json?.[1] || []) {
      if (c.region?.value === 'Aggregates') continue;
      meta[c.id] = { incomeLevel: c.incomeLevel?.value, region: c.region?.value?.trim(), lendingType: c.lendingType?.value, capital: c.capitalCity, name: c.name };
    }
    return meta;
  });
}

// ───────────────────────── UN Comtrade (public preview) ─────────────────────────
export const HS_CHAPTERS: Record<string, string> = {
  '01': 'Live animals', '02': 'Meat', '03': 'Fish & seafood', '04': 'Dairy, eggs, honey', '05': 'Other animal products',
  '06': 'Live plants & flowers', '07': 'Vegetables', '08': 'Fruit & nuts', '09': 'Coffee, tea & spices', '10': 'Cereals',
  '11': 'Milling products', '12': 'Oil seeds & oleaginous fruits', '13': 'Lac, gums & resins', '14': 'Vegetable plaiting materials',
  '15': 'Animal & vegetable fats & oils', '16': 'Meat & fish preparations', '17': 'Sugars & confectionery', '18': 'Cocoa',
  '19': 'Cereal & flour preparations', '20': 'Vegetable & fruit preparations', '21': 'Misc. edible preparations', '22': 'Beverages & spirits',
  '23': 'Food residues & animal feed', '24': 'Tobacco', '25': 'Salt, sulphur, stone & cement', '26': 'Ores, slag & ash',
  '27': 'Mineral fuels, oils & gas', '28': 'Inorganic chemicals', '29': 'Organic chemicals', '30': 'Pharmaceutical products',
  '31': 'Fertilizers', '32': 'Tanning/dyeing extracts & paints', '33': 'Essential oils & cosmetics', '34': 'Soaps & waxes',
  '35': 'Albuminoids & glues', '36': 'Explosives', '37': 'Photographic goods', '38': 'Misc. chemical products', '39': 'Plastics',
  '40': 'Rubber', '41': 'Raw hides & leather', '42': 'Leather goods', '43': 'Furskins', '44': 'Wood', '45': 'Cork', '46': 'Straw manufactures',
  '47': 'Wood pulp', '48': 'Paper & paperboard', '49': 'Printed matter', '50': 'Silk', '51': 'Wool', '52': 'Cotton',
  '53': 'Other vegetable textile fibres', '54': 'Man-made filaments', '55': 'Man-made staple fibres', '56': 'Wadding & felt', '57': 'Carpets',
  '58': 'Special woven fabrics', '59': 'Coated textile fabrics', '60': 'Knitted fabrics', '61': 'Apparel (knitted)', '62': 'Apparel (not knitted)',
  '63': 'Other made-up textiles', '64': 'Footwear', '65': 'Headgear', '66': 'Umbrellas', '67': 'Feathers & artificial flowers',
  '68': 'Stone & plaster articles', '69': 'Ceramics', '70': 'Glass', '71': 'Precious stones & metals (incl. gold)', '72': 'Iron & steel',
  '73': 'Iron & steel articles', '74': 'Copper', '75': 'Nickel', '76': 'Aluminium', '78': 'Lead', '79': 'Zinc', '80': 'Tin',
  '81': 'Other base metals', '82': 'Tools & cutlery', '83': 'Misc. base-metal articles', '84': 'Machinery & mechanical appliances',
  '85': 'Electrical machinery & electronics', '86': 'Railway equipment', '87': 'Vehicles (not railway)', '88': 'Aircraft & spacecraft',
  '89': 'Ships & boats', '90': 'Optical, medical & precision instruments', '91': 'Clocks & watches', '92': 'Musical instruments',
  '93': 'Arms & ammunition', '94': 'Furniture & lighting', '95': 'Toys & sports goods', '96': 'Misc. manufactured articles',
  '97': 'Art & antiques', '99': 'Commodities not specified',
};

// Comtrade uses a few reporter codes that differ from ISO 3166 numeric.
const ISO_TO_COMTRADE: Record<string, string> = { '840': '842', '250': '251', '356': '699', '756': '757', '578': '579' };
const COMTRADE_TO_ISO: Record<string, string> = Object.fromEntries(Object.entries(ISO_TO_COMTRADE).map(([a, b]) => [b, a]));
/** UN Comtrade uses its own codes for a few countries (US 842, France 251, India 699, Switzerland 757, Norway 579). */
export const toComtrade = (ccn3: string) => ISO_TO_COMTRADE[ccn3] || String(Number(ccn3));
export const fromComtrade = (code: string | number) => (COMTRADE_TO_ISO[String(code)] || String(code)).padStart(3, '0');

export const COMTRADE_AREAS: Record<string, string> = {
  '490': 'Other Asia, n.e.s.', '568': 'Other Europe, n.e.s.', '577': 'Other Africa, n.e.s.', '637': 'North & Central America, n.e.s.',
  '473': 'Latin America (LAIA), n.e.s.', '899': 'Areas, n.e.s.', '838': 'Free zones', '839': 'Special categories', '527': 'Oceania, n.e.s.', '097': 'EU, n.e.s.',
};

// The public preview API allows roughly one request per second; back off on 429.
let ctNext = 0;
export async function ctFetch(url: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = ctNext - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    ctNext = Date.now() + 1500;
    try { return await fetchJson(url, {}, 30000); }
    catch (e: any) { if (!/^429/.test(e.message) || attempt === 3) throw e; await new Promise((r) => setTimeout(r, 2500)); }
  }
}

async function comtradeTry(path: (year: number) => string) {
  const thisYear = new Date().getFullYear();
  for (const year of [thisYear - 1, thisYear - 2, thisYear - 3]) {
    const json = await ctFetch(`https://comtradeapi.un.org/public/v1/preview/C/A/HS?${path(year)}`);
    const rows: any[] = json?.data || [];
    if (rows.length) return { year: String(year), rows };
  }
  return { year: undefined, rows: [] as any[] };
}

/** Exports or imports by HS chapter + by partner, for one reporter. */
export async function comtradeProfile(ccn3: string, flow: 'X' | 'M') {
  const code = ISO_TO_COMTRADE[ccn3] || String(Number(ccn3));
  return cached(`comtrade:${code}:${flow}`, 7 * 86400, async () => {
    const byChapter = await comtradeTry((y) => `reporterCode=${code}&period=${y}&partnerCode=0&cmdCode=AG2&flowCode=${flow}`);
    const chapters = byChapter.rows
      .filter((r) => r.cmdCode && r.cmdCode !== 'TOTAL' && (r.primaryValue ?? 0) > 0)
      .map((r) => ({ code: String(r.cmdCode).padStart(2, '0'), name: HS_CHAPTERS[String(r.cmdCode).padStart(2, '0')] || `HS ${r.cmdCode}`, value: r.primaryValue as number }))
      .sort((a, b) => b.value - a.value);
    const total = chapters.reduce((s, c) => s + c.value, 0);
    let partners: { ccn3: string; value: number }[] = [];
    if (byChapter.year) {
      const json = await ctFetch(`https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${code}&period=${byChapter.year}&cmdCode=TOTAL&flowCode=${flow}`);
      partners = (json?.data || [])
        .filter((r: any) => r.partnerCode && r.partnerCode !== 0 && (r.primaryValue ?? 0) > 0)
        .map((r: any) => { const p = String(r.partnerCode); return { ccn3: (COMTRADE_TO_ISO[p] || p).padStart(3, '0'), value: r.primaryValue }; })
        .sort((a: any, b: any) => b.value - a.value)
        .slice(0, 12);
    }
    return { flow, year: byChapter.year, total, chapters: chapters.slice(0, 15), partners, sourceId: 'un-comtrade' };
  });
}

/** Every reporter's exports or imports of one product (HS code) to/from the world. Picks the
 *  most recent year that most countries have reported (recent years fill in slowly). */
export async function comtradeProduct(hs: string, flow: 'X' | 'M') {
  if (!/^\d{2}(\d{2}){0,2}$/.test(hs)) throw new Error('Bad HS code');
  return cached(`comtrade:product:${hs}:${flow}`, 7 * 86400, async () => {
    const thisYear = new Date().getFullYear();
    const tries: { year: number; rows: any[] }[] = [];
    for (const year of [thisYear - 1, thisYear - 2, thisYear - 3]) {
      const json = await ctFetch(`https://comtradeapi.un.org/public/v1/preview/C/A/HS?period=${year}&cmdCode=${hs}&flowCode=${flow}&partnerCode=0`);
      const rows = ((json?.data || []) as any[]).filter((r) => r.partnerCode === 0 && (r.primaryValue ?? 0) > 0 && r.reporterCode !== 97 && r.reporterCode !== 0);
      tries.push({ year, rows });
      // Accept the newest year once coverage is broad; otherwise keep looking back.
      if (rows.length >= 90) break;
    }
    const best = tries.reduce((a, b) => (b.rows.length > a.rows.length * 1.25 ? b : a), tries[0]);
    const byIso: Record<string, number> = {};
    for (const r of best.rows) {
      const ccn3 = (COMTRADE_TO_ISO[String(r.reporterCode)] || String(r.reporterCode)).padStart(3, '0');
      byIso[ccn3] = (byIso[ccn3] || 0) + r.primaryValue;
    }
    return { hs, flow, year: best.rows.length ? String(best.year) : undefined, reporters: best.rows.length, byCcn3: byIso, sourceId: 'un-comtrade' };
  });
}

// ───────────────────────── US Treasury par yield curve ─────────────────────────
const TENORS: [string, number][] = [['1 Mo', 1 / 12], ['2 Mo', 2 / 12], ['3 Mo', 0.25], ['4 Mo', 1 / 3], ['6 Mo', 0.5], ['1 Yr', 1], ['2 Yr', 2], ['3 Yr', 3], ['5 Yr', 5], ['7 Yr', 7], ['10 Yr', 10], ['20 Yr', 20], ['30 Yr', 30]];

function parseTreasuryCsv(csv: string) {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const [m, d, y] = cells[0].split('/');
    const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const points = TENORS.map(([label, years]) => {
      const idx = header.indexOf(label);
      const v = idx >= 0 ? parseFloat(cells[idx]) : NaN;
      return { label, years, value: Number.isFinite(v) ? v : null };
    }).filter((p) => p.value != null) as { label: string; years: number; value: number }[];
    return { date, points };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export async function usTreasuryCurve() {
  return cached('treasury:curve', 6 * 3600, async () => {
    const year = new Date().getFullYear();
    const url = (y: number) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
    const cur = parseTreasuryCsv(await fetchText(url(year)));
    const prevYear = parseTreasuryCsv(await fetchText(url(year - 1)));
    const latest = cur[0];
    const target = new Date(Date.parse(latest.date) - 365 * 86400_000).toISOString().slice(0, 10);
    const yearAgo = prevYear.concat(cur).find((r) => r.date <= target);
    const monthTarget = new Date(Date.parse(latest.date) - 30 * 86400_000).toISOString().slice(0, 10);
    const monthAgo = cur.concat(prevYear).find((r) => r.date <= monthTarget);
    return { latest, previous: cur[1] || prevYear[0], monthAgo, yearAgo, sourceId: 'us-treasury' };
  });
}

// ───────────────────────── Market quotes (Yahoo chart endpoint, delayed) ─────────────────────────
const RANGES: Record<string, string> = { '1mo': '1d', '6mo': '1d', '1y': '1d', '5y': '1wk', 'max': '1mo' };

// London, Johannesburg and Tel Aviv quote shares in minor units (pence, cents, agorot).
// Convert to the main unit so prices are never shown 100× too high.
const MINOR_UNITS: Record<string, string> = { GBp: 'GBP', GBX: 'GBP', ZAc: 'ZAR', ZAC: 'ZAR', ILA: 'ILS' };
export function minorUnitFactor(currency?: string) { return currency && MINOR_UNITS[currency] ? { factor: 0.01, currency: MINOR_UNITS[currency] } : { factor: 1, currency }; }
const minorBySuffix = (symbol: string) => /\.(L|JO|TA)$/.test(symbol) ? 0.01 : 1;

export async function getQuote(symbol: string, range = '1y'): Promise<Quote & { fetchedAt: string; stale: boolean }> {
  const interval = RANGES[range] || '1d';
  const r = await cached(`yahoo:${symbol}:${range}`, 300, async () => {
    const json = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { 'User-Agent': 'Mozilla/5.0' });
    const res = json?.chart?.result?.[0];
    if (!res?.meta?.regularMarketPrice) throw new Error(json?.chart?.error?.description || 'No quote');
    const m = res.meta;
    const { factor, currency } = minorUnitFactor(m.currency);
    const k = (v: number | undefined) => (v == null ? v : v * factor);
    const closes: (number | null)[] = res.indicators?.quote?.[0]?.close || [];
    const history = (res.timestamp || []).map((t: number, i: number) => ({ t: new Date(t * 1000).toISOString().slice(0, 10), c: closes[i] == null ? null : closes[i]! * factor }))
      .filter((p: any) => p.c != null);
    const prev = m.chartPreviousClose ?? m.previousClose;
    const q: Quote = {
      symbol, price: m.regularMarketPrice * factor, currency: currency || m.currency, exchange: m.fullExchangeName || m.exchangeName,
      previousClose: k(prev),
      marketTime: new Date(m.regularMarketTime * 1000).toISOString(),
      quality: 'delayed', sourceId: 'yahoo-finance',
      dayHigh: k(m.regularMarketDayHigh), dayLow: k(m.regularMarketDayLow),
      fiftyTwoWeekHigh: k(m.fiftyTwoWeekHigh), fiftyTwoWeekLow: k(m.fiftyTwoWeekLow),
      history,
    };
    // Day change from the last two daily closes when available.
    if (history.length >= 2 && interval === '1d') {
      const p = history[history.length - 2].c;
      q.change = q.price - p; q.changePct = (q.price / p - 1) * 100; q.previousClose = p;
    } else if (m.regularMarketChangePercent != null) {
      q.changePct = m.regularMarketChangePercent;
    }
    return q;
  });
  return { ...r.data, fetchedAt: r.fetchedAt, stale: r.stale };
}

/** Cash dividends per share paid since a date (for total-return calculation). */
export async function getDividends(symbol: string, since: string) {
  const p1 = Math.floor(Date.parse(since) / 1000);
  const r = await cached(`yahoo:div:${symbol}:${since}`, 86400, async () => {
    const json = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${Math.floor(Date.now() / 1000)}&interval=1mo&events=div`, { 'User-Agent': 'Mozilla/5.0' });
    const divs = json?.chart?.result?.[0]?.events?.dividends || {};
    return Object.values(divs).map((d: any) => ({ date: new Date(d.date * 1000).toISOString().slice(0, 10), amount: (d.amount as number) * minorBySuffix(symbol) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  });
  return r.data;
}

// ───────────────────────── SEC EDGAR fundamentals ─────────────────────────
const SEC_HEADERS = { 'User-Agent': USER_AGENT };

async function secCik(ticker: string) {
  const r = await cached('sec:tickers', 7 * 86400, async () => {
    const json = await fetchJson('https://www.sec.gov/files/company_tickers.json', SEC_HEADERS);
    const map: Record<string, number> = {};
    for (const v of Object.values<any>(json)) map[String(v.ticker).toUpperCase()] = v.cik_str;
    return map;
  });
  return r.data[ticker.toUpperCase()];
}

const CONCEPTS: { key: string; label: string; names: string[]; kind: 'flow' | 'stock' }[] = [
  { key: 'revenue', label: 'Revenue', kind: 'flow', names: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'Revenue', 'RevenueFromContractsWithCustomers'] },
  { key: 'operatingIncome', label: 'Operating income', kind: 'flow', names: ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'] },
  { key: 'netIncome', label: 'Net income (to parent)', kind: 'flow', names: ['NetIncomeLoss', 'ProfitLossAttributableToOwnersOfParent'] },
  { key: 'operatingCashFlow', label: 'Operating cash flow', kind: 'flow', names: ['NetCashProvidedByUsedInOperatingActivities', 'CashFlowsFromUsedInOperatingActivities'] },
  { key: 'capex', label: 'Capital expenditure', kind: 'flow', names: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'] },
  { key: 'dna', label: 'Depreciation & amortization', kind: 'flow', names: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'DepreciationAndAmortisationExpense'] },
  { key: 'cash', label: 'Cash & equivalents', kind: 'stock', names: ['CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalents'] },
  { key: 'debt', label: 'Long-term debt', kind: 'stock', names: ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongtermBorrowings', 'NoncurrentPortionOfNoncurrentBorrowings'] },
  { key: 'equity', label: "Shareholders' equity", kind: 'stock', names: ['StockholdersEquity', 'EquityAttributableToOwnersOfParent'] },
];

export async function secFundamentals(ticker: string) {
  const cik = await secCik(ticker);
  if (!cik) return null;
  const r = await cached(`sec:facts:${cik}`, 86400, async () => {
    const cik10 = String(cik).padStart(10, '0');
    const json = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`, SEC_HEADERS, 40000);
    const facts = json.facts || {};
    const annualForms = new Set(['10-K', '20-F', '40-F', '10-K/A', '20-F/A']);
    const metrics: Record<string, { label: string; unit: string; concept: string; values: { fy: string; end: string; value: number; form: string; filed: string }[] }> = {};
    for (const c of CONCEPTS) {
      let best: any = null;
      for (const tax of ['us-gaap', 'ifrs-full']) {
        for (const name of c.names) {
          const node = facts[tax]?.[name];
          if (!node) continue;
          const unit = Object.keys(node.units)[0];
          const rows = (node.units[unit] as any[]).filter((x) => annualForms.has(x.form) && (c.kind === 'stock' || (x.start && (Date.parse(x.end) - Date.parse(x.start)) / 86400_000 > 330)));
          if (!rows.length) continue;
          const byEnd = new Map<string, any>();
          for (const x of rows) { const prev = byEnd.get(x.end); if (!prev || x.filed > prev.filed) byEnd.set(x.end, x); }
          const values = [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end)).slice(-6)
            .map((x) => ({ fy: x.end.slice(0, 4), end: x.end, value: x.val, form: x.form, filed: x.filed }));
          if (!best || values[values.length - 1].end > best.values[best.values.length - 1].end) best = { label: c.label, unit, concept: `${tax}:${name}`, values };
        }
      }
      if (best) metrics[c.key] = best;
    }
    const sharesNode = facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares as any[] | undefined;
    const sharesLatest = sharesNode?.sort((a, b) => a.end.localeCompare(b.end)).at(-1);
    return {
      cik: String(cik), entityName: json.entityName as string, metrics,
      sharesOutstanding: sharesLatest ? { value: sharesLatest.val as number, asOf: sharesLatest.end as string, form: sharesLatest.form as string } : null,
      sourceId: 'sec-edgar',
    };
  });
  return { ...r.data, fetchedAt: r.fetchedAt, stale: r.stale };
}

// ───────────────────────── GDELT news (throttled) ─────────────────────────
let gdeltChain: Promise<unknown> = Promise.resolve();
let gdeltNext = 0;
const NEWS_TOPICS: Record<string, string> = {
  all: '',
  economy: '(economy OR inflation OR GDP OR "central bank" OR budget OR tariff)',
  politics: '(election OR parliament OR minister OR president OR government OR party)',
  markets: '(stocks OR shares OR bonds OR earnings OR investors OR prices)',
  geopolitics: '(sanctions OR military OR diplomacy OR summit OR treaty OR conflict)',
};

const decodeXml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

export interface NewsArticle { title: string; url: string; domain: string; date: string; publisher?: string; }

/** Headlines: Google News RSS (personal feed-reader use) first, GDELT as a fallback. */
export async function getNews(query: string, topic = 'all'): Promise<{ data: NewsArticle[]; fetchedAt: string; stale: boolean; sourceId: string }> {
  const extra = NEWS_TOPICS[topic] ?? '';
  try {
    const q = `"${query.replace(/"/g, '')}" ${extra} when:21d`.trim();
    const r = await cached(`gnews:${q}`, 3600, async () => {
      const xml = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
      return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map(([, item]) => {
        const get = (tag: string) => decodeXml(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] || '');
        const publisher = get('source');
        const srcUrl = item.match(/<source url="([^"]+)"/)?.[1] || '';
        let title = get('title');
        if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
        const pub = get('pubDate');
        return { title, url: get('link'), publisher, domain: srcUrl ? new URL(srcUrl).hostname.replace(/^www\./, '') : publisher, date: pub ? new Date(pub).toISOString().slice(0, 10) : '' };
      });
    });
    if (r.data.length) return { ...r, sourceId: 'google-news' };
  } catch { /* fall through to GDELT */ }
  const r = await getGdelt(query, extra);
  return { ...r, sourceId: 'gdelt' };
}

async function getGdelt(query: string, extra: string) {
  const q = `"${query.replace(/"/g, '')}" ${extra} sourcelang:english`.trim();
  return cached(`gdelt:${q}`, 2 * 3600, () => {
    const job = gdeltChain.then(async () => {
      const wait = gdeltNext - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      gdeltNext = Date.now() + 6000;
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=15&sort=datedesc&timespan=21d`;
      const json = await fetchJson(url, {}, 25000);
      return ((json?.articles || []) as any[]).map((a): NewsArticle => ({
        title: a.title as string, url: a.url as string, domain: a.domain as string,
        date: `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}`,
      }));
    });
    gdeltChain = job.catch(() => {});
    return job;
  });
}

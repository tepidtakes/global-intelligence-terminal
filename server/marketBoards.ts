// Two market boards built on data the terminal already loads (functions EQ and FXM):
//   • World share indices: the main share index of each large economy, grouped by region.
//   • Currency cross table: the currencies of the largest economies against each other.
// Which economies: the largest by GDP, from the economy weights computed from IMF / World Bank data
// (server/web/weights.ts), not a typed list of countries. Quotes: Yahoo Finance, delayed.
import { getEntity } from './graph.js';
import { fxBoard, isStale, spark, thin, windowChanges } from './markets.js';
import { gdpRanking } from './web/weights.js';

/** Country → its main share index, as Yahoo Finance names it. This is the one typed table here:
 *  no free machine-readable source maps a country to its benchmark index. A symbol that returns
 *  nothing is listed in the board's `missing`, so a wrong or retired one shows instead of hiding. */
export const SHARE_INDICES: Record<string, { symbol: string; name: string }> = {
  USA: { symbol: '^GSPC', name: 'S&P 500' }, CHN: { symbol: '000001.SS', name: 'SSE Composite' }, JPN: { symbol: '^N225', name: 'Nikkei 225' },
  DEU: { symbol: '^GDAXI', name: 'DAX' }, IND: { symbol: '^BSESN', name: 'BSE Sensex' }, GBR: { symbol: '^FTSE', name: 'FTSE 100' },
  FRA: { symbol: '^FCHI', name: 'CAC 40' }, ITA: { symbol: 'FTSEMIB.MI', name: 'FTSE MIB' }, CAN: { symbol: '^GSPTSE', name: 'S&P/TSX Composite' },
  BRA: { symbol: '^BVSP', name: 'Ibovespa' }, KOR: { symbol: '^KS11', name: 'KOSPI' }, AUS: { symbol: '^AXJO', name: 'S&P/ASX 200' },
  ESP: { symbol: '^IBEX', name: 'IBEX 35' }, MEX: { symbol: '^MXX', name: 'S&P/BMV IPC' }, IDN: { symbol: '^JKSE', name: 'IDX Composite' },
  NLD: { symbol: '^AEX', name: 'AEX' }, TUR: { symbol: 'XU100.IS', name: 'BIST 100' }, SAU: { symbol: '^TASI.SR', name: 'Tadawul All Share' },
  CHE: { symbol: '^SSMI', name: 'SMI' }, TWN: { symbol: '^TWII', name: 'TAIEX' }, BEL: { symbol: '^BFX', name: 'BEL 20' },
  SWE: { symbol: '^OMX', name: 'OMX Stockholm 30' }, ARG: { symbol: '^MERV', name: 'S&P Merval' }, AUT: { symbol: '^ATX', name: 'ATX' },
  SGP: { symbol: '^STI', name: 'Straits Times Index' }, ISR: { symbol: '^TA125.TA', name: 'TA-125' }, HKG: { symbol: '^HSI', name: 'Hang Seng' },
  THA: { symbol: '^SET.BK', name: 'SET Index' }, MYS: { symbol: '^KLSE', name: 'FTSE Bursa Malaysia KLCI' }, NZL: { symbol: '^NZ50', name: 'S&P/NZX 50' },
  IRL: { symbol: '^ISEQ', name: 'ISEQ All-Share' }, DNK: { symbol: '^OMXC25', name: 'OMX Copenhagen 25' }, FIN: { symbol: '^OMXH25', name: 'OMX Helsinki 25' },
  NOR: { symbol: 'OSEBX.OL', name: 'Oslo Børs Benchmark' }, EGY: { symbol: '^CASE30', name: 'EGX 30' }, CHL: { symbol: '^IPSA', name: 'S&P IPSA' },
  PHL: { symbol: 'PSEI.PS', name: 'PSEi' },
};
/** How many of the largest economies the index board looks at. */
export const INDEX_ECONOMIES = 45;
/** How many currencies the cross table holds (the US dollar included): a square that fits a screen. */
export const MATRIX_CURRENCIES = 12;

export const BOARD_REGIONS = ['Americas', 'Europe', 'Asia-Pacific', 'Middle East & Africa', 'Other'] as const;
/** The board's region for a country, from the country dataset's region and subregion. */
export function boardRegion(iso3: string): (typeof BOARD_REGIONS)[number] {
  const a = getEntity(`country:${iso3}`)?.attrs || {};
  if (a.region === 'Americas') return 'Americas';
  if (a.region === 'Europe') return 'Europe';
  if (a.region === 'Africa' || a.subregion === 'Western Asia') return 'Middle East & Africa';
  if (a.region === 'Asia' || a.region === 'Oceania') return 'Asia-Pacific';
  return 'Other';
}
const countryStub = (iso3: string) => { const c = getEntity(`country:${iso3}`); return { id: `country:${iso3}`, name: c?.name || iso3, flag: c?.flag }; };

// ───────────────────────── World share indices ─────────────────────────
export async function indexBoard() {
  const ranked = (await gdpRanking()).slice(0, INDEX_ECONOMIES);
  // Without the ranking (IMF and World Bank both unreachable) every economy in the table is shown, in table order.
  const order = ranked.length ? ranked.map((r) => r.iso3) : Object.keys(SHARE_INDICES);
  const picked = order.filter((iso3) => SHARE_INDICES[iso3]);
  const r = await spark(picked.map((iso3) => SHARE_INDICES[iso3].symbol), '1y', '1d');
  const missing: string[] = [];
  const rows = picked.map((iso3) => {
    const ix = SHARE_INDICES[iso3]; const s = r.data[ix.symbol];
    const rank = ranked.findIndex((x) => x.iso3 === iso3);
    const base = { iso3, country: countryStub(iso3), index: ix.name, symbol: ix.symbol, region: boardRegion(iso3), gdpRank: rank >= 0 ? rank + 1 : undefined };
    if (!s) { missing.push(`${ix.symbol} (${ix.name}, ${base.country.name})`); return { ...base, unavailable: true as const }; }
    const staleQuote = isStale(s);
    return { ...base, last: s.price, currency: s.currency, time: s.time, staleQuote, change: staleQuote ? {} : windowChanges(s), history: thin(s.points, 40) };
  });
  return {
    rows, regions: BOARD_REGIONS.filter((g) => rows.some((x) => x.region === g)), missing,
    /** Large economies the board has no index for: candidates for the table above. */
    noIndex: ranked.filter((x) => !SHARE_INDICES[x.iso3]).slice(0, 12).map((x) => countryStub(x.iso3).name),
    chosenBy: ranked.length ? `the ${INDEX_ECONOMIES} largest economies by GDP` : 'every economy in the index table (the GDP ranking is not available yet)',
    fetchedAt: r.fetchedAt, stale: r.stale, sourceId: 'yahoo-finance',
    note: 'Index levels in local currency; 1-day change is against the previous close. Delayed quotes.',
  };
}

// ───────────────────────── Currency cross table ─────────────────────────
export interface MatrixCell { v: number; d1?: number; }
/** The cross table from rates per US dollar: cell [row][col] = units of the column currency for one
 *  unit of the row currency; d1 = its change over the day in percent (positive = the row currency
 *  strengthened against the column currency). `prev` holds yesterday's rates where known. */
export function crossTable(codes: string[], perUsd: Record<string, number>, prev: Record<string, number | undefined>): (MatrixCell | null)[][] {
  return codes.map((row) => codes.map((col) => {
    if (row === col) return null;
    const v = perUsd[col] / perUsd[row];
    const p = prev[col] != null && prev[row] != null ? prev[col]! / prev[row]! : undefined;
    return { v, ...(p ? { d1: (v / p - 1) * 100 } : {}) };
  }));
}

export async function fxMatrix() {
  // The per-dollar rates the currency board already loads: no further requests.
  const [board, ranked] = await Promise.all([fxBoard(), gdpRanking()]);
  const quoted = new Map<string, any>(board.rows.filter((r: any) => !r.unavailable && r.perUsd > 0).map((r: any) => [r.code, r]));
  const codes = ['USD'];
  /** The economy each currency was chosen for: its flag and link on the row (the rupee is India's,
   *  not the first user of the currency in alphabetical order). */
  const chosenFor: Record<string, string> = { USD: 'USA' };
  const order = ranked.length ? ranked.map((r) => r.iso3) : board.rows.filter((r: any) => r.region === 'Major currencies').map((r: any) => r.country?.iso3);
  for (const iso3 of order) {
    if (codes.length >= MATRIX_CURRENCIES) break;
    const code = (getEntity(`country:${iso3}`)?.attrs?.currencies as { code: string }[] | undefined)?.[0]?.code;
    if (code && !codes.includes(code) && quoted.has(code)) { codes.push(code); chosenFor[code] = iso3; }
  }
  const perUsd: Record<string, number> = { USD: 1 }; const prev: Record<string, number | undefined> = { USD: 1 };
  for (const c of codes.slice(1)) {
    const r = quoted.get(c);
    perUsd[c] = r.perUsd;
    // The board's 1-day change is the currency's move against the dollar: yesterday's rate follows from it.
    prev[c] = !r.staleQuote && typeof r.change?.d1 === 'number' ? r.perUsd * (1 + r.change.d1 / 100) : undefined;
  }
  const currencies = codes.map((c) => {
    if (c === 'USD') return { code: c, name: 'US dollar', country: countryStub('USA') };
    const r = quoted.get(c);
    return { code: c, name: r.name, country: countryStub(chosenFor[c]), time: r.time, staleQuote: !!r.staleQuote };
  });
  return {
    currencies, cells: crossTable(codes, perUsd, prev),
    chosenBy: ranked.length ? 'the currencies of the largest economies by GDP' : 'the major currencies (the GDP ranking is not available yet)',
    fetchedAt: board.fetchedAt, stale: board.stale, sourceId: board.sourceId,
    note: 'Each cell: how many units of the column’s currency one unit of the row’s currency buys. The change is over one day: positive means the row’s currency gained against the column’s. Computed from rates against the US dollar; delayed quotes.',
  };
}

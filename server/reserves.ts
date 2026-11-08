// Reserves and stocks:
//   • crude-oil stocks by country — JODI-Oil World Database (monthly, as reported by each government):
//     closing stocks, refinery intake and production → stocks in days of refinery runs;
//   • US Strategic Petroleum Reserve and commercial crude stocks — EIA weekly (EIA_API_KEY, free);
//   • grain stocks — USDA PSD: wheat, corn and rice ending stocks and stocks-to-use, by country;
//   • natural-gas storage in Europe — GIE AGSI+ (AGSI_API_KEY, free), % full;
//   • foreign-exchange and gold reserves — World Bank (IMF IFS), in providers.ts;
//   • how each major country holds strategic oil reserves — hand-entered from official pages.
import { publish } from './live.js';
import { netFetch } from './net.js';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { cached, fetchJson } from './cache.js';
import { getEntity, membersByName } from './graph.js';
import { fredSeries } from './markets.js';
import { countryIso } from './sanctions.js';
import { USER_AGENT } from './config.js';
import { wbCountrySeries, RESERVE_INDICATORS } from './providers.js';

// ───────────────────────── Zip files, read as a stream of lines ─────────────────────────
/** Lines of the first entry matching `match` in a zip archive (deflate or stored; no zip64). */
export async function zipLines(buf: Buffer, onLine: (line: string) => void, match = /\.csv$/i) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('damaged zip directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!match.test(name)) continue;
    if (method !== 0 && method !== 8) throw new Error(`unsupported zip compression (${method})`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    const stream = method === 0 ? Readable.from([data]) : Readable.from([data]).pipe(zlib.createInflateRaw());
    const dec = new StringDecoder('utf8'); let rest = '';
    for await (const chunk of stream) {
      const lines = (rest + dec.write(chunk as Buffer)).split('\n'); rest = lines.pop()!;
      for (const l of lines) onLine(l.endsWith('\r') ? l.slice(0, -1) : l);
    }
    rest += dec.end(); if (rest) onLine(rest);
    return name;
  }
  throw new Error('no matching file in the zip archive');
}
/** One CSV line (quoted fields allowed). */
export function csvCells(line: string) {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cell); cell = ''; } else cell += ch;
  }
  out.push(cell); return out;
}
async function fetchBuffer(url: string, timeoutMs = 120000) {
  const res = await netFetch(url, { headers: { 'User-Agent': USER_AGENT }, timeoutMs });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return Buffer.from(await res.arrayBuffer());
}

// ───────────────────────── JODI-Oil: crude stocks, refinery intake, production ─────────────────────────
export interface OilRow { iso3: string; month: string; stocks?: number; refinery?: number; production?: number; days?: number; assessment?: string; }
/** JODI primary CSV (REF_AREA, TIME_PERIOD, ENERGY_PRODUCT, FLOW_BREAKDOWN, UNIT_MEASURE, OBS_VALUE, ASSESSMENT_CODE). */
export function jodiCollector(sinceMonth: string) {
  let idx: Record<string, number> | null = null;
  const acc = new Map<string, Map<string, OilRow & { product?: string }>>();
  return {
    line(l: string) {
      if (!idx) { const h = csvCells(l).map((c) => c.replace(/^﻿/, '').trim().toUpperCase()); idx = Object.fromEntries(h.map((c, i) => [c, i])); return; }
      if (!/CLOSTLV|REFINOBS|INDPROD/.test(l)) return; // most lines are other flows: skip without splitting
      const c = csvCells(l); const g = (k: string) => (c[idx![k]] ?? '').trim();
      const month = g('TIME_PERIOD'); if (month < sinceMonth) return;
      const product = g('ENERGY_PRODUCT'), flow = g('FLOW_BREAKDOWN'), unit = g('UNIT_MEASURE'), v = Number(g('OBS_VALUE'));
      if (!(product === 'CRUDEOIL' || product === 'TOTCRUDE') || !Number.isFinite(v) || g('OBS_VALUE') === '') return;
      if (!((flow === 'CLOSTLV' && unit === 'KBBL') || ((flow === 'REFINOBS' || flow === 'INDPROD') && unit === 'KBD'))) return;
      const iso3 = countryIso(g('REF_AREA'), true); if (!iso3) return;
      const byMonth = acc.get(iso3) || acc.set(iso3, new Map()).get(iso3)!;
      const row = byMonth.get(month) || byMonth.set(month, { iso3, month }).get(month)!;
      // Total crude (crude + NGL + other) is preferred when a country reports both.
      const better = !row.product || product === 'TOTCRUDE' || row.product === product;
      if (flow === 'CLOSTLV' && (row.stocks == null || better)) { row.stocks = v; row.assessment = g('ASSESSMENT_CODE'); }
      if (flow === 'REFINOBS' && (row.refinery == null || better)) row.refinery = v;
      if (flow === 'INDPROD' && (row.production == null || better)) row.production = v;
      if (product === 'TOTCRUDE') row.product = product; else row.product ||= product;
    },
    /** Latest month with reported stocks per country (and a year earlier, when reported). */
    result() {
      const out: Record<string, { latest: OilRow; yearAgo?: OilRow; history: { month: string; stocks: number }[] }> = {};
      for (const [iso3, byMonth] of acc) {
        const months = [...byMonth.values()].filter((r) => r.stocks != null && r.stocks > 0).sort((a, b) => a.month.localeCompare(b.month));
        const latest = months.at(-1); if (!latest) continue;
        const clean = ({ product: _p, ...r }: OilRow & { product?: string }): OilRow => ({ ...r, days: r.stocks != null && r.refinery ? Math.round(r.stocks / r.refinery) : undefined });
        const ya = `${Number(latest.month.slice(0, 4)) - 1}${latest.month.slice(4)}`;
        out[iso3] = { latest: clean(latest), yearAgo: byMonth.get(ya)?.stocks != null ? clean(byMonth.get(ya)!) : undefined, history: months.slice(-24).map((r) => ({ month: r.month, stocks: r.stocks! })) };
      }
      return out;
    },
  };
}
async function jodiOil() {
  return cached('reserves:jodi:v1', 7 * 86400, async () => {
    const buf = await fetchBuffer('https://www.jodidata.org/_resources/files/downloads/oil-data/world_primary_csv.zip', 180000);
    const since = new Date(Date.now() - 30 * 31 * 86400_000).toISOString().slice(0, 7);
    const col = jodiCollector(since); await zipLines(buf, (l) => col.line(l));
    const out = col.result(); if (Object.keys(out).length < 10) throw new Error('JODI file had no recent crude-oil stocks');
    return out;
  });
}

// ───────────────────────── USDA PSD: grain stocks ─────────────────────────
export const GRAINS: Record<string, { usda: string; label: string; commodity: string }> = {
  wheat: { usda: 'Wheat', label: 'Wheat', commodity: 'commodity:wheat' },
  corn: { usda: 'Corn', label: 'Corn (maize)', commodity: 'commodity:corn' },
  rice: { usda: 'Rice, Milled', label: 'Rice (milled)', commodity: 'commodity:rice' },
};
export interface GrainRow { place: string; year: string; stocks: number; use?: number; production?: number; ratio?: number; }
/** USDA PSD CSV (Commodity_Description, Country_Name, Market_Year, Attribute_Description, Value…), recent market years. */
export function psdCollector(minYear: number) {
  let idx: Record<string, number> | null = null;
  const acc = new Map<string, GrainRow & { grain: string }>();
  const want = new Map(Object.entries(GRAINS).map(([k, v]) => [v.usda, k]));
  return {
    line(l: string) {
      if (!idx) { idx = Object.fromEntries(csvCells(l).map((c, i) => [c.replace(/^﻿/, '').trim(), i])); return; }
      if (!/Ending Stocks|Domestic Consumption|Production/.test(l)) return;
      const c = csvCells(l); const g = (k: string) => (c[idx![k]] ?? '').trim();
      const grain = want.get(g('Commodity_Description')); if (!grain) return;
      const year = g('Market_Year'); if (Number(year) < minYear) return;
      const attr = g('Attribute_Description'); const v = Number(g('Value')); if (!Number.isFinite(v)) return;
      const name = g('Country_Name');
      const place = /^European Union/i.test(name) ? 'igo:eu' : (() => { const i = countryIso(name); return i ? `country:${i}` : ''; })();
      if (!place) return;
      const k = `${grain}|${place}|${year}`;
      const row = acc.get(k) || acc.set(k, { grain, place, year, stocks: 0 }).get(k)!;
      if (attr === 'Ending Stocks') row.stocks = v; else if (attr === 'Domestic Consumption') row.use = v; else if (attr === 'Production') row.production = v;
    },
    /** Per grain: the latest market year (USDA's current projection) and the one before, by place, plus world totals. */
    result() {
      const out: Record<string, { year: string; prevYear?: string; rows: GrainRow[]; prev: Record<string, number>; world: { stocks: number; use: number } }> = {};
      for (const grain of Object.keys(GRAINS)) {
        const all = [...acc.values()].filter((r) => r.grain === grain);
        const years = [...new Set(all.map((r) => r.year))].sort(); const year = years.at(-1); if (!year) continue;
        const rows = all.filter((r) => r.year === year && (r.stocks > 0 || (r.use || 0) > 0)).map(({ grain: _g, ...r }) => ({ ...r, ratio: r.use ? +(r.stocks / r.use * 100).toFixed(1) : undefined })).sort((a, b) => b.stocks - a.stocks);
        const prevYear = years.at(-2);
        out[grain] = { year, prevYear, rows, prev: Object.fromEntries(all.filter((r) => r.year === prevYear).map((r) => [r.place, r.stocks])),
          world: { stocks: rows.reduce((a, r) => a + r.stocks, 0), use: rows.reduce((a, r) => a + (r.use || 0), 0) } };
      }
      return out;
    },
  };
}
async function usdaGrains() {
  return cached('reserves:usda-psd:v1', 7 * 86400, async () => {
    const buf = await fetchBuffer('https://apps.fas.usda.gov/psdonline/downloads/psd_grains_pulses_csv.zip', 180000);
    const col = psdCollector(new Date().getUTCFullYear() - 2); await zipLines(buf, (l) => col.line(l));
    const out = col.result(); if (!out.wheat?.rows.length) throw new Error('USDA file had no recent grain stocks');
    return out;
  });
}

// ───────────────────────── US: Strategic Petroleum Reserve (EIA weekly) ─────────────────────────
export function parseEiaStocks(json: any) {
  const rows = (json?.response?.data || []).map((r: any) => ({ period: String(r.period), series: String(r.series || ''), value: Number(r.value) })).filter((r: any) => Number.isFinite(r.value));
  const series = (id: string) => rows.filter((r: any) => r.series === id).sort((a: any, b: any) => a.period.localeCompare(b.period)).map((r: any) => ({ t: r.period, v: r.value }));
  return { spr: series('WCSSTUS1'), commercial: series('WCESTUS1') };
}
async function usOilStocks() {
  const key = (process.env.EIA_API_KEY || '').trim();
  const pack = (spr: { t: string; v: number }[], commercial: { t: string; v: number }[], via: string, fetchedAt: string) => {
    const last = spr.at(-1); if (!last) throw new Error('no SPR data');
    const ya = spr.filter((p) => p.t <= new Date(Date.parse(last.t) - 364 * 86400_000).toISOString().slice(0, 10)).at(-1);
    return { week: last.t, spr: last.v, sprYearAgo: ya?.v, commercial: commercial.at(-1)?.v, history: spr.slice(-60), via, fetchedAt };
  };
  if (key) {
    const r = await cached('reserves:eia-spr:v1', 12 * 3600, async () => parseEiaStocks(await fetchJson(`https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key=${encodeURIComponent(key)}&frequency=weekly&data[0]=value&facets[series][]=WCSSTUS1&facets[series][]=WCESTUS1&sort[0][column]=period&sort[0][direction]=desc&length=200`, {}, 30000)));
    return pack(r.data.spr, r.data.commercial, 'EIA API', r.fetchedAt);
  }
  // Without a key: the same weekly series as republished by FRED.
  const since = new Date(Date.now() - 500 * 86400_000).toISOString().slice(0, 10);
  const [spr, com] = await Promise.all([fredSeries('WCSSTUS1', since), fredSeries('WCESTUS1', since).catch(() => null)]);
  return pack(spr.data, com?.data || [], 'FRED', spr.fetchedAt);
}

// ───────────────────────── Europe: gas storage (GIE AGSI+) ─────────────────────────
const AGSI_COUNTRIES = ['AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'FR', 'DE', 'HU', 'IT', 'LV', 'NL', 'PL', 'PT', 'RO', 'SK', 'ES', 'SE', 'GB', 'UA'];
export function parseAgsi(json: any) {
  const d = (json?.data || [])[0]; if (!d) return null;
  const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : undefined; };
  return { day: String(d.gasDayStart), full: n(d.full), twh: n(d.gasInStorage), capacity: n(d.workingGasVolume), trend: n(d.trend) };
}
async function gasStorage(iso2: string) {
  const key = (process.env.AGSI_API_KEY || '').trim(); if (!key || !AGSI_COUNTRIES.includes(iso2)) return null;
  const r = await cached(`reserves:agsi:${iso2}:v1`, 6 * 3600, async () => parseAgsi(await fetchJson(`https://agsi.gie.eu/api?country=${iso2.toLowerCase()}&size=1`, { 'x-key': key }, 20000)));
  return r.data ? { ...r.data, fetchedAt: r.fetchedAt } : null;
}

// ───────────────────────── Strategic oil reserves: how each country holds them ─────────────────────────
const IEA_MEMBERS = ['AUS', 'AUT', 'BEL', 'CAN', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'JPN', 'KOR', 'LTU', 'LUX', 'MEX', 'NLD', 'NZL', 'NOR', 'POL', 'PRT', 'SVK', 'ESP', 'SWE', 'CHE', 'TUR', 'GBR', 'USA'];
const EU = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'];
const PROGRAMMES: Record<string, { text: string; url: string }> = {
  USA: { text: 'The Strategic Petroleum Reserve, owned by the federal government, stores crude oil in salt caverns at four sites in Texas and Louisiana (Bryan Mound, Big Hill, West Hackberry, Bayou Choctaw), with a design capacity of about 714 million barrels.', url: 'https://www.energy.gov/ceser/strategic-petroleum-reserve' },
  JPN: { text: 'Government stocks managed by JOGMEC at national stockpiling bases, plus stocks oil companies must hold under the Oil Stockpiling Act; the government publishes the combined days of supply each month.', url: 'https://www.jogmec.go.jp/english/stockpiling/' },
  IND: { text: 'Indian Strategic Petroleum Reserves Ltd holds crude in underground rock caverns at Visakhapatnam, Mangaluru and Padur, with a capacity of 5.33 million tonnes.', url: 'https://www.isprlindia.com/' },
  CHN: { text: 'China holds government strategic reserves and requires commercial stocks, but does not regularly publish the volumes (it also does not report crude stocks to JODI).', url: 'https://www.jodidata.org/oil/' },
  KOR: { text: 'Government stocks are held by the Korea National Oil Corporation (KNOC) at its stockpiling bases, alongside mandatory private stocks.', url: 'https://www.iea.org/countries/korea' },
  DEU: { text: 'Emergency stocks are held by the Erdölbevorratungsverband (EBV), a public-law stockholding agency, to meet Germany’s EU and IEA obligations.', url: 'https://www.ebv-oil.org/' },
  FRA: { text: 'Strategic stocks are held largely by SAGESS on behalf of oil companies, under the supervision of CPSSP, to meet France’s EU and IEA obligations.', url: 'https://www.iea.org/countries/france' },
  GBR: { text: 'The UK holds no government-owned stocks: companies that supply oil products are obliged to hold stocks to meet the IEA obligation.', url: 'https://www.iea.org/countries/united-kingdom' },
};
export function oilProgramme(iso3: string) {
  const notes: { text: string; url: string }[] = [];
  if (PROGRAMMES[iso3]) notes.push(PROGRAMMES[iso3]);
  if (membersByName('European Union', EU).includes(iso3)) notes.push({ text: 'As an EU member it must keep emergency stocks of at least 90 days of net imports or 61 days of inland consumption, whichever is larger (Directive 2009/119/EC).', url: 'https://eur-lex.europa.eu/eli/dir/2009/119/oj' });
  if (membersByName('International Energy Agency', IEA_MEMBERS).includes(iso3)) notes.push({ text: 'As an IEA member it must hold oil stocks equal to at least 90 days of net imports while it is a net importer, and join collective releases in a supply emergency.', url: 'https://www.iea.org/about/oil-security-and-emergency-response' });
  return notes;
}

// ───────────────────────── State, readers ─────────────────────────
let oil: { data: Awaited<ReturnType<typeof jodiOil>>['data']; fetchedAt: string; stale: boolean } | null = null; let oilError: string | undefined;
let grains: { data: Awaited<ReturnType<typeof usdaGrains>>['data']; fetchedAt: string; stale: boolean } | null = null; let grainError: string | undefined;
export async function refreshReserves() {
  const [o, g] = await Promise.allSettled([jodiOil(), usdaGrains()]);
  if (o.status === 'fulfilled') { oil = o.value; oilError = undefined; } else oilError = String((o.reason as any)?.message || o.reason);
  if (g.status === 'fulfilled') { grains = g.value; grainError = undefined; } else grainError = String((g.reason as any)?.message || g.reason);
  return reservesStatus();
}
export function reservesStatus() {
  return { oil: oil ? { countries: Object.keys(oil.data).length, fetchedAt: oil.fetchedAt, stale: oil.stale } : null, oilError, grains: grains ? { years: Object.fromEntries(Object.entries(grains.data).map(([k, v]) => [k, v.year])), fetchedAt: grains.fetchedAt } : null, grainError };
}
/** Everything a country (or the EU) profile shows. */
export async function reservesFor(placeId: string) {
  const e = getEntity(placeId); if (!e) return null;
  const iso3 = e.type === 'country' ? e.iso3 : undefined;
  const [us, gas, fx] = await Promise.allSettled([iso3 === 'USA' ? usOilStocks() : Promise.resolve(null), e.iso2 ? gasStorage(e.iso2.toUpperCase()) : Promise.resolve(null),
    iso3 || placeId === 'igo:eu' ? wbCountrySeries(iso3 || 'EUU', RESERVE_INDICATORS) : Promise.resolve(null)]);
  const grainRows = Object.fromEntries(Object.entries(grains?.data || {}).map(([k, v]) => {
    const row = v.rows.find((r) => r.place === placeId); if (!row) return [k, null];
    return [k, { ...row, label: GRAINS[k].label, prevYear: v.prevYear, prevStocks: v.prev[placeId], worldShare: v.world.stocks ? +(row.stocks / v.world.stocks * 100).toFixed(1) : undefined, rank: v.rows.indexOf(row) + 1 }];
  }).filter(([, v]) => v));
  return {
    oil: iso3 && oil?.data[iso3] ? { ...oil.data[iso3], fetchedAt: oil.fetchedAt } : null, oilError: !oil ? oilError || 'JODI oil data is still loading' : undefined,
    us: us.status === 'fulfilled' ? us.value : null, usError: us.status === 'rejected' ? `${(us.reason as any)?.message || us.reason}${process.env.EIA_API_KEY ? '' : ' — set EIA_API_KEY (free) for weekly SPR levels'}` : undefined,
    gas: gas.status === 'fulfilled' ? gas.value : null, gasKey: !!process.env.AGSI_API_KEY,
    grains: grainRows, grainsAt: grains?.fetchedAt, grainError: !grains ? grainError || 'USDA grain data is still loading' : undefined,
    programme: iso3 ? oilProgramme(iso3) : [],
    fx: fx.status === 'fulfilled' && fx.value ? { indicators: fx.value.data.filter((i) => i.latest), fetchedAt: fx.value.fetchedAt } : null, fxError: fx.status === 'rejected' ? String((fx.reason as any)?.message || fx.reason) : undefined,
  };
}
/** Commodity profiles: who holds the largest stocks. */
export function stocksForCommodity(commodityId: string) {
  if (commodityId === 'commodity:crude-oil' && oil) {
    const rows = Object.entries(oil.data).map(([iso3, v]) => ({ id: `country:${iso3}`, name: getEntity(`country:${iso3}`)?.name || iso3, flag: getEntity(`country:${iso3}`)?.flag, value: v.latest.stocks!, days: v.latest.days, period: v.latest.month })).sort((a, b) => b.value - a.value).slice(0, 15);
    return { kind: 'oil', unit: 'thousand barrels', rows, fetchedAt: oil.fetchedAt, sourceId: 'jodi-oil', note: 'Crude-oil stocks as reported to JODI by each government (latest month each). China and some other large holders do not report stocks.' };
  }
  const grain = Object.entries(GRAINS).find(([, g]) => g.commodity === commodityId)?.[0];
  if (grain && grains?.data[grain]) {
    const v = grains.data[grain];
    return { kind: 'grain', unit: 'thousand tonnes', year: v.year, world: v.world, rows: v.rows.slice(0, 15).map((r) => ({ id: r.place, name: getEntity(r.place)?.name || r.place, flag: getEntity(r.place)?.flag, value: r.stocks, ratio: r.ratio, share: v.world.stocks ? +(r.stocks / v.world.stocks * 100).toFixed(1) : undefined })),
      fetchedAt: grains.fetchedAt, sourceId: 'usda-psd', note: `Ending stocks for the ${v.year} marketing year — USDA’s current projection, revised each month with the WASDE report.` };
  }
  return null;
}
/** Map layers. */
export function reservesLayer(which: string) {
  const values: Record<string, { value: number; period: string }> = {}; const detail: Record<string, string> = {};
  if (which === 'oil-days' || which === 'oil-stocks') {
    if (!oil) return { values, detail, error: oilError || 'JODI oil data is still loading' };
    for (const [iso3, v] of Object.entries(oil.data)) {
      const l = v.latest;
      if (which === 'oil-days' && l.days == null) continue;
      values[iso3] = { value: which === 'oil-days' ? l.days! : l.stocks! / 1000, period: l.month };
      detail[iso3] = `${(l.stocks! / 1000).toFixed(1)} million barrels of crude in ${l.month}${l.days != null ? ` — ${l.days} days of refinery intake (${Math.round(l.refinery!)} kb/d)` : ''}${v.yearAgo?.stocks ? `; ${(v.yearAgo.stocks / 1000).toFixed(1)} m a year earlier` : ''}`;
    }
    return { values, detail, fetchedAt: oil.fetchedAt, stale: oil.stale };
  }
  const grain = which.replace(/^grain-/, '');
  if (GRAINS[grain]) {
    const v = grains?.data[grain]; if (!v) return { values, detail, error: grainError || 'USDA grain data is still loading' };
    for (const r of v.rows) {
      if (!r.place.startsWith('country:') || r.ratio == null) continue;
      values[r.place.slice(8)] = { value: r.ratio, period: `${v.year} (proj.)` };
      detail[r.place.slice(8)] = `${Math.round(r.stocks).toLocaleString('en-US')} thousand tonnes ending stocks = ${r.ratio}% of a year’s use${r.production ? `; production ${Math.round(r.production).toLocaleString('en-US')} kt` : ''}`;
    }
    return { values, detail, fetchedAt: grains!.fetchedAt, stale: grains!.stale, year: v.year };
  }
  return { values, detail, error: 'Unknown layer' };
}

/** Map: European gas storage, % full (needs AGSI_API_KEY). */
export async function gasLayer() {
  if (!process.env.AGSI_API_KEY) return { values: {}, detail: {}, error: 'Gas storage needs a free AGSI+ API key: register at agsi.gie.eu and set AGSI_API_KEY.' };
  const values: Record<string, { value: number; period: string }> = {}; const detail: Record<string, string> = {}; let fetchedAt: string | undefined;
  for (const iso2 of AGSI_COUNTRIES) {
    try {
      const g = await gasStorage(iso2); const iso3 = countryIso(iso2, true); if (!g?.full || !iso3) continue;
      values[iso3] = { value: g.full, period: g.day }; fetchedAt ||= g.fetchedAt;
      detail[iso3] = `${g.full.toFixed(1)}% full on ${g.day}: ${g.twh?.toFixed(1)} of ${g.capacity?.toFixed(1)} TWh${g.trend != null ? ` (${g.trend > 0 ? '+' : ''}${g.trend.toFixed(2)} pts a day)` : ''}`;
    } catch { /* skip a country that fails */ }
  }
  return { values, detail, fetchedAt };
}

export function startReserves() {
  setTimeout(() => { void refreshReserves().catch(() => {}); }, 45000).unref();
  setInterval(() => { void refreshReserves().then(() => publish('reserves')).catch(() => {}); }, 12 * 3600_000).unref();
}
export const _test = { setOil: (d: any) => { oil = d ? { data: d, fetchedAt: new Date().toISOString(), stale: false } : null; }, setGrains: (d: any) => { grains = d ? { data: d, fetchedAt: new Date().toISOString(), stale: false } : null; } };

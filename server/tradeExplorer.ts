// Bilateral trade explorer (UN Comtrade, annual goods trade):
//   • every partner of one country — exports, imports, balance, share of its trade (map layer, profiles);
//   • one pair A ↔ B — six years of trade as reported by each side (the "mirror" check: A's exports to B
//     against B's imports from A), what they trade by HS chapter, plus tariffs and sanctions between them.
import { cached } from './cache.js';
import { getEntity, byCcn3, relsOfType, stub, membersOf } from './graph.js';
import { ctFetch, toComtrade, fromComtrade, HS_CHAPTERS, COMTRADE_AREAS } from './providers.js';
import { sanctionsFor, LISTS, type ListId } from './sanctions.js';
import { tariffsFor } from './tariffs.js';
import { EURO_AREA } from './markets.js';

const CT = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
// EU members from the membership links (Wikidata and the hand-checked list); a fixed list only if neither is loaded.
const euMembers = () => { const m = membersOf('igo:eu').map((x) => x.slice(8)); return new Set(m.length >= 20 ? m : [...EURO_AREA, 'CZE', 'DNK', 'HUN', 'POL', 'ROU', 'SWE']); };

export interface Partner { ccn3: string; exports: number; imports: number; }
/** Rows for one reporter, all partners, flows X and M (re-exports and re-imports are left out). */
export function parsePartners(rows: any[]) {
  const map = new Map<string, Partner>(); let worldX = 0, worldM = 0;
  for (const r of rows) {
    const flow = r.flowCode; const v = Number(r.primaryValue) || 0; if (flow !== 'X' && flow !== 'M') continue;
    if (r.partner2Code != null && Number(r.partner2Code) !== 0) continue; // only direct partner totals
    if (Number(r.partnerCode) === 0) { if (flow === 'X') worldX += v; else worldM += v; continue; }
    const ccn3 = fromComtrade(r.partnerCode);
    const p = map.get(ccn3) || map.set(ccn3, { ccn3, exports: 0, imports: 0 }).get(ccn3)!;
    if (flow === 'X') p.exports += v; else p.imports += v;
  }
  const partners = [...map.values()].sort((a, b) => b.exports + b.imports - (a.exports + a.imports));
  // When the reporter gave no world total, the partners' sum stands in for it.
  if (!worldX) worldX = partners.reduce((s, p) => s + p.exports, 0);
  if (!worldM) worldM = partners.reduce((s, p) => s + p.imports, 0);
  return { partners, world: { exports: worldX, imports: worldM } };
}
export async function tradePartners(iso3: string) {
  const e = getEntity(`country:${iso3}`); if (!e?.ccn3) throw new Error('No trade reporter code for this country');
  const code = toComtrade(e.ccn3);
  return cached(`comtrade:partners:${code}:v1`, 7 * 86400, async () => {
    const thisYear = new Date().getFullYear();
    for (const year of [thisYear - 1, thisYear - 2, thisYear - 3]) {
      const json = await ctFetch(`${CT}?reporterCode=${code}&period=${year}&cmdCode=TOTAL&flowCode=X,M`);
      const rows: any[] = json?.data || [];
      if (rows.filter((r) => Number(r.partnerCode) !== 0).length < 10) continue; // this year not reported yet
      return { year: String(year), ...parsePartners(rows) };
    }
    throw new Error('No recent trade data reported to UN Comtrade');
  });
}
const partnerView = (p: Partner) => {
  const id = byCcn3.get(p.ccn3);
  return { ...p, entity: id ? stub(id) || null : null, iso3: id ? getEntity(id)?.iso3 : undefined, areaName: COMTRADE_AREAS[p.ccn3] };
};
export async function partnersView(iso3: string) {
  const r = await tradePartners(iso3);
  const total = r.data.world.exports + r.data.world.imports;
  return { year: r.data.year, world: r.data.world, partners: r.data.partners.map((p) => ({ ...partnerView(p), share: total ? +(((p.exports + p.imports) / total) * 100).toFixed(2) : undefined })), fetchedAt: r.fetchedAt, stale: r.stale, sourceId: 'un-comtrade' };
}
/** Map layer: one country's trade with every partner. */
export async function tradeWithLayer(iso3: string, metric: 'total' | 'exports' | 'imports' | 'balance' | 'share') {
  const v = await partnersView(iso3);
  const values: Record<string, { value: number; period: string }> = {}; const detail: Record<string, string> = {};
  const bn = (x: number) => (x >= 1e9 ? `US$${(x / 1e9).toFixed(1)} bn` : `US$${(x / 1e6).toFixed(0)} m`);
  for (const p of v.partners) {
    if (!p.iso3 || p.iso3 === iso3) continue;
    const value = metric === 'total' ? p.exports + p.imports : metric === 'exports' ? p.exports : metric === 'imports' ? p.imports : metric === 'balance' ? p.exports - p.imports : p.share ?? 0;
    values[p.iso3] = { value, period: v.year };
    detail[p.iso3] = `Exports ${bn(p.exports)} · imports ${bn(p.imports)} · balance ${p.exports >= p.imports ? '+' : '−'}${bn(Math.abs(p.exports - p.imports))} · ${p.share}% of trade`;
  }
  return { values, detail, year: v.year, fetchedAt: v.fetchedAt, stale: v.stale, unreported: v.partners.filter((p) => !p.iso3).reduce((s, p) => s + p.exports + p.imports, 0) };
}

// ───────────────────────── One pair ─────────────────────────
export function pairSeries(aRows: any[], bRows: any[], years: string[]) {
  const pick = (rows: any[], year: string, flow: string) => { const xs = rows.filter((r) => String(r.period ?? r.refYear) === year && r.flowCode === flow && (r.partner2Code == null || Number(r.partner2Code) === 0)); return xs.length ? xs.reduce((s, r) => s + (Number(r.primaryValue) || 0), 0) : null; };
  return years.map((y) => ({ year: y, aExports: pick(aRows, y, 'X'), aImports: pick(aRows, y, 'M'), bImports: pick(bRows, y, 'M'), bExports: pick(bRows, y, 'X') }));
}
export function chapters(rows: any[], flow: 'X' | 'M') {
  return rows.filter((r) => r.flowCode === flow && r.cmdCode && r.cmdCode !== 'TOTAL' && (Number(r.primaryValue) || 0) > 0 && (r.partner2Code == null || Number(r.partner2Code) === 0))
    .map((r) => { const code = String(r.cmdCode).padStart(2, '0'); return { code, name: HS_CHAPTERS[code] || `HS ${code}`, value: Number(r.primaryValue) }; })
    .sort((a, b) => b.value - a.value);
}
/** Which sanctions list a country runs (EU members share the EU's). */
const listOf = (iso3: string): ListId | undefined => (iso3 === 'USA' ? 'US' : iso3 === 'GBR' ? 'UK' : euMembers().has(iso3) ? 'EU' : undefined);
function sanctionsBetween(a: string, b: string) {
  const out: { by: string; target: string; list: ListId; authority: string; programmes: { program: string; count: number }[]; listings: number }[] = [];
  for (const [imposer, target] of [[a, b], [b, a]]) {
    const cs = sanctionsFor(target); if (!cs) continue;
    for (const list of [listOf(imposer), 'UN' as ListId].filter(Boolean) as ListId[]) {
      const progs = cs.programmes.filter((p) => p.list === list && p.targeted);
      if (progs.length || (list !== 'UN' && cs.listings[list] > 0)) out.push({ by: list === 'UN' ? 'UN' : imposer, target, list, authority: LISTS[list].authority, programmes: progs.map((p) => ({ program: p.program, count: p.count })), listings: cs.listings[list] });
    }
  }
  // The UN list applies to both: keep one entry per (list, target).
  const seen = new Set<string>(); return out.filter((x) => { const k = `${x.list}:${x.target}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
export async function tradePair(a: string, b: string) {
  const A = getEntity(`country:${a}`), B = getEntity(`country:${b}`);
  if (!A?.ccn3 || !B?.ccn3) throw new Error('Both sides must be countries that report to UN Comtrade');
  const ca = toComtrade(A.ccn3), cb = toComtrade(B.ccn3);
  const y = new Date().getFullYear(); const years = [y - 6, y - 5, y - 4, y - 3, y - 2, y - 1].map(String);
  const r = await cached(`comtrade:pair:${ca}:${cb}:v1`, 7 * 86400, async () => {
    const aRows = (await ctFetch(`${CT}?reporterCode=${ca}&partnerCode=${cb}&period=${years.join(',')}&cmdCode=TOTAL&flowCode=X,M`))?.data || [];
    const bRows = (await ctFetch(`${CT}?reporterCode=${cb}&partnerCode=${ca}&period=${years.join(',')}&cmdCode=TOTAL&flowCode=X,M`))?.data || [];
    const series = pairSeries(aRows, bRows, years);
    const latestA = [...series].reverse().find((s) => s.aExports != null || s.aImports != null)?.year;
    const latestB = [...series].reverse().find((s) => s.bExports != null || s.bImports != null)?.year;
    // Products: from A's report; if A has not reported, from B's report with the flows swapped.
    let products: { year?: string; reporter: string; exports: ReturnType<typeof chapters>; imports: ReturnType<typeof chapters> } = { reporter: a, exports: [], imports: [] };
    if (latestA) { const rows = (await ctFetch(`${CT}?reporterCode=${ca}&partnerCode=${cb}&period=${latestA}&cmdCode=AG2&flowCode=X,M`))?.data || []; products = { year: latestA, reporter: a, exports: chapters(rows, 'X'), imports: chapters(rows, 'M') }; }
    else if (latestB) { const rows = (await ctFetch(`${CT}?reporterCode=${cb}&partnerCode=${ca}&period=${latestB}&cmdCode=AG2&flowCode=X,M`))?.data || []; products = { year: latestB, reporter: b, exports: chapters(rows, 'M'), imports: chapters(rows, 'X') }; }
    if (!latestA && !latestB) throw new Error('Neither country has reported trade with the other to UN Comtrade in the last six years');
    return { series, latestA, latestB, products };
  });
  const d = r.data;
  // Mirror check on the latest year both sides reported.
  const both = [...d.series].reverse().find((s) => s.aExports != null && s.bImports != null);
  const gap = (x: number | null, m: number | null) => (x && m != null ? +(((m - x) / x) * 100).toFixed(1) : null);
  const mirror = both ? { year: both.year, aExports: both.aExports, bImports: both.bImports, gapAtoB: gap(both.aExports, both.bImports), bExports: both.bExports, aImports: both.aImports, gapBtoA: gap(both.bExports, both.aImports) } : null;
  const tariff = a === 'USA' || b === 'USA' ? tariffsFor(`country:${a === 'USA' ? b : a}`).us : null;
  const shared = relsOfType(A.id, 'member_of', 'out').filter((x) => !x.validTo && relsOfType(B.id, 'member_of', 'out').some((y) => y.to === x.to && !y.validTo)).map((x) => stub(x.to)).filter(Boolean);
  return { a: stub(A.id), b: stub(B.id), ...d, products: { ...d.products, exports: d.products.exports.slice(0, 12), imports: d.products.imports.slice(0, 12) }, mirror,
    usTariff: tariff ? { month: tariff.label, rate: tariff.row.rate, yearAgo: tariff.yearAgo?.row.rate ?? null, imports: tariff.row.imports, duties: tariff.row.duties, on: a === 'USA' ? b : a } : null,
    sanctions: sanctionsBetween(a, b), shared, fetchedAt: r.fetchedAt, stale: r.stale, sourceId: 'un-comtrade' };
}

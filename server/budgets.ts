// Government budgets:
//   • every country — general-government balance and debt (IMF WEO), and where the IMF Fiscal Monitor
//     publishes them, revenue, spending and the primary balance (net interest = primary − overall);
//     central-government revenue, tax, expense and interest (World Bank / IMF GFS); defence (SIPRI),
//     health and education spending;
//   • EU and EFTA members, and the EU as a whole — spending by function (Eurostat COFOG, gov_10a_exp);
//   • United States, live — debt to the penny, interest on the debt and its average rate (Treasury
//     Fiscal Data), and monthly receipts, outlays and deficit (Monthly Treasury Statement, via FRED).
import { cached, fetchJson } from './cache.js';
import { getEntity } from './graph.js';
import { fredSeries } from './markets.js';
import { recordChange, kvGet, kvSet } from './changes.js';
import { wbCountrySeries, BUDGET_INDICATORS } from './providers.js';

// ───────────────────────── Fiscal years (stable, published by each government) ─────────────────────────
// Start month (1–12) of the fiscal year; omitted = calendar year.
const FY_START: Record<string, { month: number; note?: string }> = {
  USA: { month: 10 }, GBR: { month: 4 }, JPN: { month: 4 }, IND: { month: 4 }, CAN: { month: 4 }, HKG: { month: 4 }, SGP: { month: 4 }, NZL: { month: 7 }, AUS: { month: 7 },
  EGY: { month: 7 }, PAK: { month: 7 }, BGD: { month: 7 }, KEN: { month: 7 }, UGA: { month: 7 }, TZA: { month: 7 }, ZAF: { month: 4 }, IRN: { month: 3, note: 'Iranian calendar year, from about 21 March' },
  THA: { month: 10 }, NPL: { month: 7, note: 'Nepali calendar year, from mid-July' }, ETH: { month: 7, note: 'Ethiopian calendar year, from 8 July' },
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fiscalYear(iso3: string, today = new Date()) {
  const fy = FY_START[iso3] || { month: 1 };
  const m = today.getUTCMonth() + 1, y = today.getUTCFullYear();
  const startYear = m >= fy.month ? y : y - 1;
  const end = new Date(Date.UTC(startYear + 1, fy.month - 1, 0)); // day before the next fiscal year starts
  const endYear = end.getUTCFullYear();
  // Naming: the US and Thailand use the year it ends in (US FY2027 = Oct 2026–Sep 2027), Japan the
  // year it starts in (FY2026 = Apr 2026–Mar 2027); most others write both years ("2026–27").
  const label = fy.month === 1 ? String(startYear) : iso3 === 'USA' || iso3 === 'THA' ? `FY${endYear}` : iso3 === 'JPN' ? `FY${startYear}` : `${startYear}–${String(endYear).slice(2)}`;
  return { startMonth: fy.month, runs: fy.month === 1 ? 'January–December' : `${MONTHS[fy.month - 1]}–${MONTHS[(fy.month + 10) % 12]}`, current: label, start: `${startYear}-${String(fy.month).padStart(2, '0')}-01`, end: end.toISOString().slice(0, 10), note: fy.note };
}

// ───────────────────────── IMF (WEO + Fiscal Monitor) ─────────────────────────
const IMF = 'https://www.imf.org/external/datamapper/api/v1';
const IMF_ISO: Record<string, string> = { UVK: 'UNK', WBG: 'PSE' };
async function imfAny(code: string) {
  return cached(`imf:${code}`, 24 * 3600, async () => {
    const json = await fetchJson(`${IMF}/${encodeURIComponent(code)}`, {}, 40000);
    const out: Record<string, Record<string, number>> = {};
    for (const [iso, years] of Object.entries<any>(json?.values?.[code] || {})) { const id = IMF_ISO[iso] || iso; out[id] = Object.fromEntries(Object.entries<any>(years).filter(([, v]) => typeof v === 'number')); }
    return out;
  });
}
/** Fiscal Monitor indicator codes, found by label in the DataMapper catalogue (codes have changed between editions). */
export function pickFiscalCodes(indicators: Record<string, any>) {
  const fm = Object.entries(indicators).filter(([, v]) => /\bFM\b|Fiscal Monitor/i.test(`${v?.dataset || ''} ${v?.source || ''}`) && /GDP/i.test(`${v?.unit || ''} ${v?.label || ''}`));
  const pick = (re: RegExp, not?: RegExp) => fm.find(([, v]) => re.test(v.label || '') && !(not && not.test(v.label || '')))?.[0];
  return {
    revenue: pick(/^(general )?government revenue|^revenue\b/i, /tax|grant|cyclical/i),
    expenditure: pick(/^(general )?government (total )?expenditure|^(total )?expenditure\b/i, /primary|interest|cyclical/i),
    primary: pick(/primary (net lending|balance)/i, /cyclical/i),
  };
}
async function fiscalCodes() {
  return cached('imf:fm-codes:v1', 7 * 86400, async () => pickFiscalCodes((await fetchJson(`${IMF}/indicators`, {}, 30000))?.indicators || {}));
}
export interface ImfBudget { years: string[]; rows: { key: string; label: string; code: string; values: Record<string, number> }[]; source: string; }
export async function imfBudget(iso3: string): Promise<ImfBudget> {
  const y = new Date().getUTCFullYear(); const years = [y - 3, y - 2, y - 1, y, y + 1].map(String);
  const fm = await fiscalCodes().then((r) => r.data).catch(() => ({} as Record<string, string | undefined>));
  const defs: [string, string, string | undefined][] = [['revenue', 'Revenue', fm.revenue], ['expenditure', 'Spending', fm.expenditure], ['balance', 'Overall balance', 'GGXCNL_NGDP'], ['primary', 'Primary balance (before interest)', fm.primary], ['debt', 'Gross debt', 'GGXWDG_NGDP']];
  const got = await Promise.all(defs.map(async ([key, label, code]) => {
    if (!code) return null;
    try { const r = await imfAny(code); const v = r.data[iso3]; return v ? { key, label, code, values: Object.fromEntries(years.filter((yr) => v[yr] != null).map((yr) => [yr, v[yr]])) } : null; } catch { return null; }
  }));
  const rows = got.filter((r): r is NonNullable<typeof r> => !!r && Object.keys(r.values).length > 0);
  const bal = rows.find((r) => r.key === 'balance'), prim = rows.find((r) => r.key === 'primary');
  if (bal && prim) rows.splice(rows.indexOf(prim) + 1, 0, { key: 'interest', label: 'Net interest paid (primary − overall balance)', code: 'derived', values: Object.fromEntries(years.filter((yr) => bal.values[yr] != null && prim.values[yr] != null).map((yr) => [yr, +(prim.values[yr] - bal.values[yr]).toFixed(2)])) });
  return { years, rows, source: 'IMF World Economic Outlook and Fiscal Monitor (general government, % of GDP)' };
}

// ───────────────────────── Eurostat COFOG ─────────────────────────
export const COFOG: Record<string, string> = {
  GF01: 'General public services', GF0107: 'of which public debt interest', GF02: 'Defence', GF03: 'Public order and safety', GF04: 'Economic affairs', GF05: 'Environmental protection',
  GF06: 'Housing and community amenities', GF07: 'Health', GF08: 'Recreation, culture and religion', GF09: 'Education', GF10: 'Social protection', TOTAL: 'Total spending',
};
const EUROSTAT_GEO: Record<string, string> = { GRC: 'EL', 'igo:eu': 'EU27_2020' };
export const COFOG_COUNTRIES = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'NOR', 'ISL', 'CHE'];
/** JSON-stat 2.0 → one row per value with every dimension's code. */
export function jsonStatRows(j: any): { dims: Record<string, string>; value: number }[] {
  const ids: string[] = j?.id || []; const sizes: number[] = j?.size || [];
  if (!ids.length || ids.length !== sizes.length) return [];
  const codes = ids.map((id) => { const idx = j.dimension?.[id]?.category?.index || {}; const arr: string[] = []; for (const [c, i] of Object.entries<number>(Array.isArray(idx) ? Object.fromEntries(idx.map((c: string, i: number) => [c, i])) : idx)) arr[i] = c; return arr; });
  const out: { dims: Record<string, string>; value: number }[] = [];
  const entries: [number, any][] = Array.isArray(j.value) ? j.value.map((v: any, i: number) => [i, v]) : Object.entries(j.value || {}).map(([k, v]) => [Number(k), v]);
  for (const [flat, v] of entries) {
    if (typeof v !== 'number') continue;
    let rest = flat; const dims: Record<string, string> = {};
    for (let d = ids.length - 1; d >= 0; d--) { dims[ids[d]] = codes[d][rest % sizes[d]]; rest = Math.floor(rest / sizes[d]); }
    out.push({ dims, value: v });
  }
  return out;
}
export async function cofogFor(placeId: string) {
  const iso3 = placeId.startsWith('country:') ? placeId.slice(8) : '';
  if (placeId !== 'igo:eu' && !COFOG_COUNTRIES.includes(iso3)) return null;
  const geo = EUROSTAT_GEO[placeId] || EUROSTAT_GEO[iso3] || getEntity(placeId)?.iso2;
  if (!geo) return null;
  const r = await cached(`eurostat:cofog:${geo}:v1`, 7 * 86400, async () => {
    const j = await fetchJson(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp?format=JSON&lang=EN&geo=${geo}&unit=PC_GDP&sector=S13&na_item=TE&lastTimePeriod=1`, {}, 40000);
    const rows = jsonStatRows(j).filter((r) => COFOG[r.dims.cofog99]);
    const year = rows[0]?.dims.time;
    return { year, items: Object.keys(COFOG).map((code) => ({ code, label: COFOG[code], value: rows.find((r) => r.dims.cofog99 === code)?.value })).filter((x) => x.value != null) as { code: string; label: string; value: number }[] };
  });
  return { ...r.data, fetchedAt: r.fetchedAt, stale: r.stale, sourceId: 'eurostat-cofog' };
}

// ───────────────────────── United States (live) ─────────────────────────
const FD = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
export function parseDebtToPenny(json: any) {
  const rows = (json?.data || []).map((r: any) => ({ date: String(r.record_date), total: num(r.tot_pub_debt_out_amt), public: num(r.debt_held_public_amt), intragov: num(r.intragov_hold_amt) }))
    .filter((r: any) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.total).sort((a: any, b: any) => b.date.localeCompare(a.date));
  const latest = rows[0]; if (!latest) return null;
  const target = new Date(Date.parse(latest.date) - 365 * 86400_000).toISOString().slice(0, 10);
  const yearAgo = rows.find((r: any) => r.date <= target);
  return { latest, yearAgo: yearAgo || null };
}
/** Interest expense: rows per category for each month; totals for the latest month (fiscal year to date). */
export function parseInterestExpense(json: any) {
  const rows = (json?.data || []).map((r: any) => ({ date: String(r.record_date), cat: String(r.expense_catg_desc || ''), month: num(r.month_expense_amt) || 0, fytd: num(r.fytd_expense_amt) || 0 }));
  const latest = rows.map((r: any) => r.date).sort().at(-1); if (!latest) return null;
  const at = (d: string, re?: RegExp) => rows.filter((r: any) => r.date === d && (!re || re.test(r.cat)));
  const sum = (list: any[], k: 'month' | 'fytd') => list.reduce((a, r) => a + r[k], 0);
  const pub = /public/i;
  const yaDate = rows.map((r: any) => r.date).filter((d: string) => d.slice(5, 7) === latest.slice(5, 7) && d < latest).sort().at(-1);
  return { date: latest, fytdPublic: sum(at(latest, pub), 'fytd'), fytdTotal: sum(at(latest), 'fytd'), monthPublic: sum(at(latest, pub), 'month'), yearAgoFytdPublic: yaDate ? sum(at(yaDate, pub), 'fytd') : undefined, yearAgoDate: yaDate };
}
export function parseAvgRates(json: any) {
  const rows = (json?.data || []).map((r: any) => ({ date: String(r.record_date), type: String(r.security_type_desc || ''), desc: String(r.security_desc || ''), rate: num(r.avg_interest_rate_amt) }));
  const latest = rows.map((r: any) => r.date).sort().at(-1); if (!latest) return null;
  const pick = (re: RegExp) => rows.find((r: any) => r.date === latest && re.test(r.desc))?.rate;
  return { date: latest, marketable: pick(/^Total Marketable$/i), bills: pick(/^Treasury Bills$/i), notes: pick(/^Treasury Notes$/i), bonds: pick(/^Treasury Bonds$/i), all: pick(/^Total Interest-bearing Debt$/i) };
}
/** Monthly Treasury Statement (FRED, US$ millions): fiscal-year-to-date and last full fiscal year. */
export function fiscalTotals(points: { t: string; v: number }[]) {
  if (!points.length) return null;
  const last = points.at(-1)!; const m = Number(last.t.slice(5, 7)), y = Number(last.t.slice(0, 4));
  const fyStartYear = m >= 10 ? y : y - 1; // FY starts in October
  const inFy = (p: { t: string }, sy: number) => p.t >= `${sy}-10-01` && p.t < `${sy + 1}-10-01`;
  const sum = (sy: number) => points.filter((p) => inFy(p, sy)).reduce((a, p) => a + p.v, 0);
  const months = points.filter((p) => inFy(p, fyStartYear)).length;
  const prevSame = points.filter((p) => inFy(p, fyStartYear - 1)).slice(0, months).reduce((a, p) => a + p.v, 0);
  const lastFull = points.filter((p) => inFy(p, fyStartYear - 1)).length === 12 ? sum(fyStartYear - 1) : undefined;
  return { latestMonth: last.t.slice(0, 7), latest: last.v, fy: `FY${fyStartYear + 1}`, fytd: sum(fyStartYear), months, prevFytd: prevSame, lastFy: `FY${fyStartYear}`, lastFyTotal: lastFull };
}
export async function usFiscal() {
  const since = new Date(Date.now() - 800 * 86400_000).toISOString().slice(0, 10);
  const [debt, interest, rates, deficit, receipts, outlays] = await Promise.allSettled([
    cached('budget:us-debt:v1', 6 * 3600, async () => parseDebtToPenny(await fetchJson(`${FD}/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=300&fields=record_date,tot_pub_debt_out_amt,debt_held_public_amt,intragov_hold_amt`, {}, 30000))),
    cached('budget:us-interest:v1', 24 * 3600, async () => parseInterestExpense(await fetchJson(`${FD}/v2/accounting/od/interest_expense?sort=-record_date&page[size]=1000&filter=record_date:gte:${new Date(Date.now() - 420 * 86400_000).toISOString().slice(0, 10)}`, {}, 30000))),
    cached('budget:us-avg-rates:v1', 24 * 3600, async () => parseAvgRates(await fetchJson(`${FD}/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=60`, {}, 30000))),
    fredSeries('MTSDS133FMS', since), fredSeries('MTSR133FMS', since), fredSeries('MTSO133FMS', since),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
  const err = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? String((r.reason as any)?.message || r.reason) : undefined);
  const d = ok(debt), i = ok(interest), a = ok(rates), def = ok(deficit), rec = ok(receipts), out = ok(outlays);
  const result = {
    debt: d?.data ? { ...d.data, fetchedAt: d.fetchedAt, stale: d.stale } : null, debtError: err(debt),
    interest: i?.data ? { ...i.data, fetchedAt: i.fetchedAt } : null, rates: a?.data ? { ...a.data, fetchedAt: a.fetchedAt } : null,
    mts: def?.data?.length ? { deficit: fiscalTotals(def.data), receipts: rec ? fiscalTotals(rec.data) : null, outlays: out ? fiscalTotals(out.data) : null, fetchedAt: def.fetchedAt, series: def.data.slice(-25),
      receiptsByMonth: Object.fromEntries((rec?.data || []).slice(-25).map((p) => [p.t, p.v])), outlaysByMonth: Object.fromEntries((out?.data || []).slice(-25).map((p) => [p.t, p.v])) } : null, mtsError: err(deficit),
  };
  // Alert when gross federal debt crosses another whole trillion dollars.
  if (result.debt?.latest?.total) {
    const tn = Math.floor(result.debt.latest.total / 1e12); const prev = kvGet<number | null>('budget:us-debt-tn', null);
    if (prev !== null && tn > prev) recordChange({ key: `budget:us-debt:${tn}`, kind: 'data', entityIds: ['country:USA'], title: `US federal debt passed $${tn} trillion (Debt to the Penny, ${result.debt.latest.date})`,
      detail: `Debt held by the public $${(result.debt.latest.public! / 1e12).toFixed(2)} trn; intragovernmental $${(result.debt.latest.intragov! / 1e12).toFixed(2)} trn`, url: 'https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/', sourceId: 'us-treasury-fiscal', quality: 'official', importance: 5, at: `${result.debt.latest.date}T20:00:00Z` });
    if (prev === null || tn > prev) kvSet('budget:us-debt-tn', tn);
  }
  return result;
}

/** Everything the profile's budget section shows. */
export async function budgetFor(placeId: string) {
  const e = getEntity(placeId); if (!e) return null;
  const iso3 = e.type === 'country' ? e.iso3 : undefined;
  const [imf, wb, cofog, us] = await Promise.allSettled([
    iso3 ? imfBudget(iso3) : Promise.resolve(null),
    iso3 || placeId === 'igo:eu' ? wbCountrySeries(iso3 || 'EUU', BUDGET_INDICATORS) : Promise.resolve(null),
    cofogFor(placeId),
    iso3 === 'USA' ? usFiscal() : Promise.resolve(null),
  ]);
  const val = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
  const wbv = val(wb) as any;
  return {
    fiscalYear: iso3 ? fiscalYear(iso3) : null,
    imf: val(imf), imfError: imf.status === 'rejected' ? String((imf.reason as any)?.message) : undefined,
    wb: wbv ? { indicators: wbv.data.filter((i: any) => i.latest), fetchedAt: wbv.fetchedAt, stale: wbv.stale } : null, wbError: wb.status === 'rejected' ? String((wb.reason as any)?.message) : undefined,
    cofog: val(cofog), cofogError: cofog.status === 'rejected' ? String((cofog.reason as any)?.message) : undefined,
    us: val(us),
  };
}

export function startBudgets() {
  // US debt: daily figure, checked every 6 hours (also records the "passed $N trillion" change).
  setTimeout(() => { void usFiscal().catch(() => {}); }, 30000).unref();
  setInterval(() => { void usFiscal().catch(() => {}); }, 6 * 3600_000).unref();
}

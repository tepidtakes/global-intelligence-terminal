// US tariffs from official, open sources:
//   • Tariff actions — Federal Register API: presidential proclamations and executive orders, USTR
//     (Section 301), Commerce (Section 232) and CBP notices. Anti-dumping and countervailing-duty
//     notices are counted separately as trade remedies (there are hundreds a year).
//   • Duties actually charged on imports from each country — US Census Bureau international trade
//     API: calculated duty ÷ imports for consumption, for the latest month, year to date, the month
//     before and the same month a year earlier.
// Every country's own applied tariff rates come from the World Bank (providers.ts, TM.TAX.*).
import { publish } from './live.js';
import { cached, fetchJson } from './cache.js';
import { getEntity } from './graph.js';
import { recordChange, kvGet, kvSet } from './changes.js';
import { getTagger } from './newsroom.js';
import { countryIso } from './sanctions.js';
import { USER_AGENT } from './config.js';

// ───────────────────────── Federal Register ─────────────────────────
export interface TariffAction { id: string; title: string; date: string; url: string; type: string; subtype?: string; agencies: string[]; kind: 'tariff' | 'trade-remedy'; countries: string[]; places: string[]; abstract?: string; effective?: string; }
const FR_AGENCIES = ['trade-representative-office-of-united-states', 'international-trade-administration', 'u-s-customs-and-border-protection', 'executive-office-of-the-president', 'commerce-department'];
const REMEDY = /anti-?dumping|countervailing|less than fair value|sunset review|scope ruling|circumvention inquiry|administrative review/i;
const TARIFF_WORDS = /tariff|dut(y|ies)|section 232|section 301|section 201|reciprocal|harmonized tariff|import(s|ation)? of|trade agreement|retaliat|quota/i;

export function parseFederalRegister(json: any): TariffAction[] {
  const tagger = getTagger();
  return (json?.results || []).map((d: any): TariffAction => {
    const title = String(d.title || ''); const abstract = d.abstract ? String(d.abstract) : '';
    const places = [...new Set(tagger.tag(title, abstract).map((t) => t.id).filter((id) => id.startsWith('country:') || id.startsWith('igo:')))].filter((id) => id !== 'country:USA');
    return {
      id: String(d.document_number), title, date: String(d.publication_date || ''), url: String(d.html_url || ''), type: String(d.type || ''), subtype: d.subtype ? String(d.subtype) : undefined,
      agencies: (d.agencies || []).map((a: any) => a.name || a.raw_name).filter(Boolean), kind: REMEDY.test(`${title}. ${abstract}`) ? 'trade-remedy' : 'tariff',
      countries: places.filter((p) => p.startsWith('country:')).map((p) => p.slice(8)), places, abstract: abstract ? abstract.slice(0, 400) : undefined, effective: d.effective_on || undefined,
    };
  }).filter((a: TariffAction) => a.title && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && (a.kind === 'trade-remedy' || TARIFF_WORDS.test(`${a.title} ${a.abstract || ''}`)));
}
async function federalRegister() {
  return cached('tariffs:federal-register:v2', 6 * 3600, async () => {
    const since = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
    const fields = ['title', 'abstract', 'publication_date', 'html_url', 'document_number', 'type', 'subtype', 'agencies', 'effective_on'].map((f) => `fields[]=${f}`).join('&');
    const base = `https://www.federalregister.gov/api/v1/documents.json?per_page=100&order=newest&conditions[publication_date][gte]=${since}&${FR_AGENCIES.map((a) => `conditions[agencies][]=${a}`).join('&')}&${fields}`;
    const out: TariffAction[] = [];
    for (const term of ['tariff', 'duties', '"Section 232"', '"Section 301"']) {
      for (let page = 1; page <= 3; page++) {
        const j = await fetchJson(`${base}&conditions[term]=${encodeURIComponent(term)}&page=${page}`, { 'User-Agent': USER_AGENT }, 30000);
        out.push(...parseFederalRegister(j));
        if (!j?.next_page_url) break;
      }
    }
    const seen = new Set<string>();
    return out.filter((a) => !seen.has(a.id) && seen.add(a.id)).sort((a, b) => b.date.localeCompare(a.date));
  });
}
const actionImportance = (a: TariffAction) => (/Presidential/i.test(a.type) || /Proclamation|Executive Order/i.test(`${a.subtype || ''} ${a.title}`) ? 8 : /Section 301|Section 232|reciprocal/i.test(a.title) ? 7 : 6);

// ───────────────────────── Census: duties charged by country of origin ─────────────────────────
export interface DutyRow { code: string; name: string; placeId?: string; imports: number; duties: number; rate: number | null; importsYtd?: number; dutiesYtd?: number; rateYtd?: number | null; }
/** Census JSON: a header row, then one row per country or country group (values are strings). */
export function parseCensusImports(json: any): DutyRow[] {
  if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[0])) return [];
  const h = json[0].map((x: any) => String(x)); const ix = (k: string) => h.indexOf(k);
  const ci = ix('CTY_CODE'), ni = ix('CTY_NAME'), vm = ix('CON_VAL_MO'), dm = ix('CAL_DUT_MO'), vy = ix('CON_VAL_YR'), dy = ix('CAL_DUT_YR');
  if (ci < 0 || ni < 0 || vm < 0 || dm < 0) return [];
  const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const pct = (d?: number, v?: number) => (v && v > 0 && d != null ? (d / v) * 100 : null);
  const out: DutyRow[] = [];
  for (const r of json.slice(1)) {
    const code = String(r[ci] ?? '').trim(); const name = String(r[ni] ?? '').trim(); if (!code || !name) continue;
    let placeId: string | undefined;
    if (code === '-' || /^TOTAL FOR ALL COUNTRIES/i.test(name)) placeId = 'world';
    else if (code === '0003' || /^EUROPEAN UNION$/i.test(name)) placeId = 'igo:eu';
    else if (/^[1-9]\d{3}$/.test(code)) { const iso = countryIso(name); if (iso) placeId = `country:${iso}`; } // groups start with 0 or end in XXX
    const imports = num(r[vm]), duties = num(r[dm]);
    const importsYtd = vy >= 0 ? num(r[vy]) : undefined, dutiesYtd = dy >= 0 ? num(r[dy]) : undefined;
    out.push({ code, name, placeId, imports, duties, rate: pct(duties, imports), importsYtd, dutiesYtd, rateYtd: pct(dutiesYtd, importsYtd) });
  }
  return out;
}
const ym = (d: Date) => d.toISOString().slice(0, 7);
const monthsBack = (n: number, from = new Date()) => ym(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - n, 15)));
async function censusMonth(month: string, recent: boolean) {
  const key = (process.env.CENSUS_API_KEY || '').trim();
  return cached(`tariffs:census:${month}:v1`, recent ? 12 * 3600 : 30 * 86400, async () => {
    const j = await fetchJson(`https://api.census.gov/data/timeseries/intltrade/imports/hs?get=CTY_CODE,CTY_NAME,CON_VAL_MO,CAL_DUT_MO,CON_VAL_YR,CAL_DUT_YR&time=${month}${key ? `&key=${encodeURIComponent(key)}` : ''}`, { 'User-Agent': USER_AGENT }, 60000);
    const rows = parseCensusImports(j);
    if (!rows.some((r) => r.placeId === 'world' || r.placeId?.startsWith('country:'))) throw new Error(`no Census data for ${month} yet`);
    return rows;
  });
}
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

interface DutyState { month: string; rows: DutyRow[]; previous?: { month: string; rows: DutyRow[] }; yearAgo?: { month: string; rows: DutyRow[] }; fetchedAt: string; stale: boolean; }
let duties: DutyState | null = null;
let actions: { at: string; list: TariffAction[]; fetchedAt?: string; error?: string } | null = null;
let dutyError: string | undefined;

async function refreshDuties() {
  // Monthly figures come out about five weeks after the month ends: try the newest months first.
  let latest: { month: string; rows: DutyRow[]; fetchedAt: string; stale: boolean } | undefined; let lastErr = '';
  for (let k = 1; k <= 4 && !latest; k++) {
    const m = monthsBack(k);
    try { const r = await censusMonth(m, k <= 2); latest = { month: m, rows: r.data, fetchedAt: r.fetchedAt, stale: r.stale }; } catch (e: any) { lastErr = e.message; }
  }
  if (!latest) { dutyError = lastErr || 'Census trade API unavailable'; return; }
  const prevM = monthsBack(1, new Date(`${latest.month}-15T12:00:00Z`)); const yaM = `${Number(latest.month.slice(0, 4)) - 1}${latest.month.slice(4)}`;
  const [prev, ya] = await Promise.allSettled([censusMonth(prevM, false), censusMonth(yaM, false)]);
  duties = { month: latest.month, rows: latest.rows, fetchedAt: latest.fetchedAt, stale: latest.stale,
    previous: prev.status === 'fulfilled' ? { month: prevM, rows: prev.value.data } : undefined, yearAgo: ya.status === 'fulfilled' ? { month: yaM, rows: ya.value.data } : undefined };
  dutyError = undefined;
  // A big partner's effective rate moving by 5+ points from one month to the next is an alert.
  // The first month the terminal sees is the baseline (no alerts), like every other change producer.
  const seen = kvGet<string | null>('tariffs:census:alerted', null);
  if (seen !== duties.month) {
    if (seen !== null && duties.previous) for (const r of duties.rows) {
      if (!r.placeId || r.placeId === 'world' || r.rate == null || r.imports < 5e8) continue;
      const p = duties.previous.rows.find((x) => x.code === r.code); if (p?.rate == null) continue;
      const d = r.rate - p.rate; if (Math.abs(d) < 5) continue;
      const name = r.placeId.startsWith('igo:') ? 'the European Union' : getEntity(r.placeId)?.name || r.name;
      recordChange({ key: `tariff:census:${r.code}:${duties.month}`, kind: 'tariff', entityIds: [r.placeId, 'country:USA'],
        title: `US effective tariff on imports from ${name} ${d > 0 ? 'rose' : 'fell'} to ${r.rate.toFixed(1)}% in ${monthLabel(duties.month)} (from ${p.rate.toFixed(1)}% in ${monthLabel(duties.previous.month)})`,
        detail: `Duties charged ÷ imports for consumption: US$${(r.duties / 1e9).toFixed(2)} bn on US$${(r.imports / 1e9).toFixed(1)} bn`, url: 'https://www.census.gov/foreign-trade/data/index.html',
        sourceId: 'census-trade', quality: 'official', importance: Math.abs(d) >= 10 ? 7 : 6, at: new Date().toISOString() });
    }
    kvSet('tariffs:census:alerted', duties.month);
  }
}

async function refreshActions() {
  try {
    const r = await federalRegister();
    actions = { at: new Date().toISOString(), list: r.data, fetchedAt: r.fetchedAt };
    const seen = kvGet<string[] | null>('tariffs:seen', null); const seenSet = new Set(seen || []);
    const fresh = seen ? r.data.filter((a) => !seenSet.has(a.id) && a.kind === 'tariff') : []; // first run = baseline
    for (const a of fresh) recordChange({ key: `tariff:${a.id}`, kind: 'tariff', entityIds: ['country:USA', ...a.places], title: a.title.slice(0, 280), detail: `${a.subtype || a.type} · ${a.agencies.slice(0, 2).join(', ')}`,
      url: a.url, sourceId: 'federal-register', quality: 'official', importance: actionImportance(a), at: `${a.date}T12:00:00Z` });
    kvSet('tariffs:seen', r.data.map((a) => a.id).slice(0, 5000));
  } catch (e: any) { actions = { at: new Date().toISOString(), list: actions?.list || [], error: e.message }; }
}
export async function refreshTariffs() { await Promise.allSettled([refreshActions(), refreshDuties()]); return tariffsStatus(); }

// ───────────────────────── Readers ─────────────────────────
const rowFor = (rows: DutyRow[] | undefined, placeId: string) => rows?.find((r) => r.placeId === placeId);
/** Everything the profile shows for a country or organisation (EU). */
export function tariffsFor(placeId: string) {
  const list = actions?.list || [];
  const isUS = placeId === 'country:USA';
  const named = isUS ? list.filter((a) => a.kind === 'tariff') : list.filter((a) => a.places.includes(placeId));
  const key = isUS ? 'world' : placeId;
  const row = rowFor(duties?.rows, key);
  const ranked = (duties?.rows || []).filter((r) => r.placeId?.startsWith('country:')).sort((a, b) => b.imports - a.imports);
  return {
    us: duties && row ? {
      month: duties.month, label: monthLabel(duties.month), row, previous: duties.previous && rowFor(duties.previous.rows, key) ? { month: duties.previous.month, label: monthLabel(duties.previous.month), row: rowFor(duties.previous.rows, key)! } : null,
      yearAgo: duties.yearAgo && rowFor(duties.yearAgo.rows, key) ? { month: duties.yearAgo.month, label: monthLabel(duties.yearAgo.month), row: rowFor(duties.yearAgo.rows, key)! } : null,
      all: rowFor(duties.rows, 'world') || null, rank: isUS ? null : ranked.findIndex((r) => r.placeId === placeId) + 1 || null, partners: ranked.length, fetchedAt: duties.fetchedAt, stale: duties.stale,
      top: isUS ? ranked.slice(0, 12).map((r) => ({ ...r, name: getEntity(r.placeId!)?.name || r.name, flag: getEntity(r.placeId!)?.flag })) : undefined,
    } : null,
    usError: !duties ? dutyError || (actions ? 'US Census trade figures are still loading' : undefined) : undefined,
    actions: named.filter((a) => a.kind === 'tariff').slice(0, 15),
    global: isUS ? [] : list.filter((a) => a.kind === 'tariff' && !a.places.length).slice(0, 6),
    remedies: { count: named.filter((a) => a.kind === 'trade-remedy').length + (isUS ? list.filter((a) => a.kind === 'trade-remedy').length : 0), latest: (isUS ? list : named).filter((a) => a.kind === 'trade-remedy').slice(0, 4) },
    actionsError: actions?.error, actionsAt: actions?.fetchedAt,
  };
}
/** Map layers: US effective tariff by country of origin (and its change), and US actions naming each country. */
export function tariffLayer(which: 'us-effective' | 'us-change' | 'us-actions') {
  const values: Record<string, { value: number; period: string }> = {}; const detail: Record<string, string> = {};
  if (which === 'us-actions') {
    const counts = new Map<string, TariffAction[]>();
    for (const a of actions?.list || []) if (a.kind === 'tariff') for (const c of a.countries) (counts.get(c) || counts.set(c, []).get(c)!).push(a);
    for (const [iso, list] of counts) { values[iso] = { value: list.length, period: '12 months' }; detail[iso] = list.slice(0, 3).map((a) => `${a.date}: ${a.title}`).join(' · ').slice(0, 400); }
    return { values, detail, fetchedAt: actions?.fetchedAt, error: actions?.error };
  }
  if (!duties) return { values, detail, error: dutyError || 'US Census trade figures are still loading' };
  for (const r of duties.rows) {
    if (!r.placeId?.startsWith('country:') || r.rate == null || r.imports < 1e6) continue;
    const iso = r.placeId.slice(8);
    const ya = duties.yearAgo?.rows.find((x) => x.code === r.code);
    const bn = (v: number) => (v >= 1e9 ? `US$${(v / 1e9).toFixed(1)} bn` : `US$${(v / 1e6).toFixed(0)} m`);
    if (which === 'us-effective') values[iso] = { value: r.rate, period: monthLabel(duties.month) };
    else if (ya?.rate != null && ya.imports >= 1e6) values[iso] = { value: r.rate - ya.rate, period: `${monthLabel(duties.yearAgo!.month)} → ${monthLabel(duties.month)}` };
    detail[iso] = `${r.rate.toFixed(1)}% in ${monthLabel(duties.month)}: ${bn(r.duties)} duties on ${bn(r.imports)} of imports${ya?.rate != null ? `; ${ya.rate.toFixed(1)}% a year earlier` : ''}${r.rateYtd != null ? `; ${r.rateYtd.toFixed(1)}% year to date` : ''}`;
  }
  return { values, detail, fetchedAt: duties.fetchedAt, stale: duties.stale, month: monthLabel(duties.month) };
}
export function tariffsStatus() {
  return { actions: actions ? { at: actions.at, count: actions.list.length, tariff: actions.list.filter((a) => a.kind === 'tariff').length, error: actions.error, fetchedAt: actions.fetchedAt } : null,
    duties: duties ? { month: duties.month, partners: duties.rows.filter((r) => r.placeId?.startsWith('country:')).length, fetchedAt: duties.fetchedAt, stale: duties.stale } : null, dutiesError: dutyError };
}

export function startTariffs() {
  setTimeout(() => { void refreshTariffs(); }, 20000).unref();
  setInterval(() => { void refreshTariffs().then(() => publish('tariffs')); }, 6 * 3600_000).unref();
}

export const _test = { setDuties: (d: DutyState | null) => { duties = d; }, setActions: (list: TariffAction[]) => { actions = { at: new Date().toISOString(), list }; }, monthsBack };

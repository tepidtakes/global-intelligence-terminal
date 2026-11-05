// Cross-source agreement: the World Bank and the IMF both publish GDP, real growth, inflation,
// unemployment, the current account and population for nearly every country. Comparing the two for
// the same country and year catches unit slips, stale or revised figures and definition gaps without
// anyone checking by hand. Small gaps are normal (vintages, methods). Gaps beyond three times the
// tolerance are conflicts: they go to the consistency audit, the change feed, the Data page and the
// country's profile.
import { wbIndicatorAll } from './providers.js';
import { imfIndicator } from './markets.js';
import { byIso3, getEntity } from './graph.js';
import { registerConnector } from './web/connectors.js';
import { registerAuditCheck, type Issue } from './consistency.js';
import { emitNew, type Change } from './changes.js';

export interface Pair { key: string; label: string; wb: string; imf: string; unit: 'US$ bn' | '%' | '% of GDP' | 'million'; scale: number; kind: 'level' | 'rate'; tol: number; severity: 'warning' | 'info'; note?: string; }
/** The same statistic in both catalogs. `scale` turns the World Bank figure into the IMF's unit;
 *  `tol` is a percentage for levels and percentage points for rates. */
export const PAIRS: Pair[] = [
  { key: 'gdp', label: 'GDP', wb: 'NY.GDP.MKTP.CD', imf: 'NGDPD', unit: 'US$ bn', scale: 1e9, kind: 'level', tol: 3, severity: 'warning', note: 'Current US$; where a country has more than one exchange rate the two may convert at different ones' },
  { key: 'growth', label: 'Real GDP growth', wb: 'NY.GDP.MKTP.KD.ZG', imf: 'NGDP_RPCH', unit: '%', scale: 1, kind: 'rate', tol: 0.5, severity: 'warning' },
  { key: 'inflation', label: 'Inflation', wb: 'FP.CPI.TOTL.ZG', imf: 'PCPIPCH', unit: '%', scale: 1, kind: 'rate', tol: 0.5, severity: 'warning', note: 'Consumer prices, annual average' },
  { key: 'unemployment', label: 'Unemployment', wb: 'SL.UEM.TOTL.ZS', imf: 'LUR', unit: '%', scale: 1, kind: 'rate', tol: 1, severity: 'info', note: 'The World Bank uses ILO modelled estimates, the IMF national definitions' },
  { key: 'current-account', label: 'Current account', wb: 'BN.CAB.XOKA.GD.ZS', imf: 'BCA_NGDPD', unit: '% of GDP', scale: 1, kind: 'rate', tol: 1, severity: 'warning' },
  { key: 'population', label: 'Population', wb: 'SP.POP.TOTL', imf: 'LP', unit: 'million', scale: 1e6, kind: 'level', tol: 2, severity: 'warning' },
];

export type Verdict = 'agree' | 'differ' | 'conflict';
/** Compare a World Bank figure (in its own unit) with the IMF figure for the same year. Levels by
 *  percentage difference (of the mean of the two); rates by percentage points, allowing 5% of the
 *  figure when that is more (very high inflation). Within the tolerance they agree, within three
 *  times it they differ, beyond that they conflict. */
export function compareFigures(p: Pair, wbRaw: number, imf: number) {
  const wb = wbRaw / p.scale;
  const gap = p.kind === 'level' ? (Math.abs(wb - imf) / Math.max((Math.abs(wb) + Math.abs(imf)) / 2, 1e-12)) * 100 : Math.abs(wb - imf);
  const allowed = p.kind === 'level' ? p.tol : Math.max(p.tol, 0.05 * Math.max(Math.abs(wb), Math.abs(imf)));
  const ratio = gap / allowed;
  return { wb, imf, gap, allowed, ratio, verdict: (ratio <= 1 ? 'agree' : ratio <= 3 ? 'differ' : 'conflict') as Verdict };
}
const dp = (v: number) => (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 1 : 2);
export function fmtFigure(p: Pair, v: number) {
  if (p.unit === 'US$ bn') return Math.abs(v) >= 1000 ? `US$${(v / 1000).toFixed(2)} tn` : `US$${v.toFixed(dp(v))} bn`;
  if (p.unit === 'million') return `${v.toFixed(dp(v))} million`;
  return `${v.toFixed(1)}%${p.unit === '% of GDP' ? ' of GDP' : ''}`;
}
const gapText = (p: Pair, gap: number) => (p.kind === 'level' ? `${gap.toFixed(1)}% apart` : `${gap.toFixed(1)} point${gap.toFixed(1) === '1.0' ? '' : 's'} apart`);
const tolText = (p: Pair, allowed: number) => (p.kind === 'level' ? `${p.tol}%` : allowed > p.tol + 1e-9 ? `${allowed.toFixed(1)} points (5% of the figure)` : `${p.tol} point${p.tol === 1 ? '' : 's'}`);
const pairTol = (p: Pair) => (p.kind === 'level' ? `${p.tol}%` : `${p.tol} point${p.tol === 1 ? '' : 's'}, or 5% of the figure if more`);
const lower = (s: string) => (s === s.toUpperCase() ? s : s[0].toLowerCase() + s.slice(1));

export interface Check { key: string; label: string; unit: string; year: string; wb: number; imf: number; wbText: string; imfText: string; gap: number; gapText: string; allowedText: string; ratio: number; verdict: Verdict; severity: 'warning' | 'info'; note?: string; }
export interface Skip { key: string; label: string; reason: string; }
interface PairStat { key: string; label: string; unit: string; tolerance: string; note?: string; compared: number; agree: number; differ: number; conflict: number; skipped: number; wbAt?: string; imfAt?: string; error?: string; }
interface State { at: string; byIso3: Map<string, { checks: Check[]; skipped: Skip[] }>; pairs: PairStat[]; }
let state: State | null = null;

export async function refreshAgreement(): Promise<State> {
  const thisYear = new Date().getUTCFullYear();
  const byIso = new Map<string, { checks: Check[]; skipped: Skip[] }>();
  const slot = (iso: string) => byIso.get(iso) || byIso.set(iso, { checks: [], skipped: [] }).get(iso)!;
  const pairs = await Promise.all(PAIRS.map(async (p): Promise<PairStat> => {
    const st: PairStat = { key: p.key, label: p.label, unit: p.unit, tolerance: pairTol(p), note: p.note, compared: 0, agree: 0, differ: 0, conflict: 0, skipped: 0 };
    const [wb, imf] = await Promise.allSettled([wbIndicatorAll(p.wb), imfIndicator(p.imf)]);
    if (wb.status === 'rejected' || imf.status === 'rejected') {
      st.error = [wb.status === 'rejected' ? `World Bank: ${wb.reason?.message || wb.reason}` : '', imf.status === 'rejected' ? `IMF: ${imf.reason?.message || imf.reason}` : ''].filter(Boolean).join('; ');
      return st;
    }
    st.wbAt = wb.value.fetchedAt; st.imfAt = imf.value.fetchedAt;
    const imfData: Record<string, Record<string, number>> = imf.value.data || {};
    for (const [iso, v] of Object.entries(wb.value.data.values || {})) {
      if (!byIso3.has(iso) || typeof v?.value !== 'number') continue; // aggregates such as WLD are not countries
      const year = String(v.period).slice(0, 4), y = Number(year);
      const skip = (reason: string) => { st.skipped++; slot(iso).skipped.push({ key: p.key, label: p.label, reason }); };
      const series = imfData[iso];
      if (!series || !Object.keys(series).length) { skip('the IMF does not publish it for this country'); continue; }
      if (y >= thisYear) { skip(`the World Bank’s latest figure is for ${year}, which the IMF still projects`); continue; }
      if (y < thisYear - 6) { skip(`the World Bank’s latest figure is from ${year}, too old to compare`); continue; }
      const imfV = series[year];
      if (typeof imfV !== 'number') { skip(`the IMF has no figure for ${year}`); continue; }
      const c = compareFigures(p, v.value, imfV);
      st.compared++; st[c.verdict]++;
      slot(iso).checks.push({ key: p.key, label: p.label, unit: p.unit, year, wb: c.wb, imf: c.imf, wbText: fmtFigure(p, c.wb), imfText: fmtFigure(p, c.imf), gap: c.gap, gapText: gapText(p, c.gap), allowedText: tolText(p, c.allowed), ratio: c.ratio, verdict: c.verdict, severity: p.severity, note: p.note });
    }
    return st;
  }));
  if (pairs.every((s) => s.error)) throw new Error(pairs[0].error || 'No figures to compare');
  const order = new Map(PAIRS.map((p, i) => [p.key, i]));
  const byPair = (a: { key: string }, b: { key: string }) => order.get(a.key)! - order.get(b.key)!;
  for (const r of byIso.values()) { r.checks.sort(byPair); r.skipped.sort(byPair); }
  state = { at: new Date().toISOString(), byIso3: byIso, pairs };
  // A new conflict is a (low-importance) change, once per country, figure and year.
  emitNew('agreement', conflictsOf(state).filter((c) => c.severity === 'warning').map((c): Change => ({
    key: `agreement:${c.iso3}:${c.key}:${c.year}`, kind: 'data', entityIds: [c.id], title: `${c.country}: the World Bank and the IMF disagree on ${lower(c.label)} for ${c.year}`,
    detail: `World Bank ${c.wbText}, IMF ${c.imfText} — ${c.gapText}`, sourceId: 'terminal-audit', quality: 'estimate', importance: 2, at: state!.at,
  })));
  return state;
}

function conflictsOf(s: State) {
  const out: (Check & { iso3: string; id: string; country: string })[] = [];
  for (const [iso, r] of s.byIso3) for (const c of r.checks) if (c.verdict === 'conflict') out.push({ ...c, iso3: iso, id: `country:${iso}`, country: getEntity(`country:${iso}`)?.name || iso });
  // Real disagreements first (unemployment definitions differ by design), worst first.
  return out.sort((a, b) => Number(b.severity === 'warning') - Number(a.severity === 'warning') || b.ratio - a.ratio);
}
function totals(s: State) {
  const t = { compared: 0, agree: 0, differ: 0, conflict: 0, countries: 0 };
  for (const p of s.pairs) { t.compared += p.compared; t.agree += p.agree; t.differ += p.differ; t.conflict += p.conflict; }
  for (const r of s.byIso3.values()) if (r.checks.length) t.countries++;
  return t;
}
/** One country's cross-checked figures (profile card). */
export function agreementFor(iso3: string) {
  if (!state) return null;
  const r = state.byIso3.get(iso3.toUpperCase());
  return { ready: true, at: state.at, checks: r?.checks || [], skipped: r?.skipped || [] };
}
/** Totals, per-figure counts and the largest conflicts (Data page). */
export function agreementSummary(limit = 60) {
  if (!state) return null;
  const all = conflictsOf(state);
  return { ready: true, at: state.at, totals: totals(state), pairs: state.pairs, conflicts: all.slice(0, limit), conflictCount: all.length };
}
export function agreementStatus() { return state ? { at: state.at, ...totals(state) } : null; }

registerAuditCheck((): Issue[] => (state ? conflictsOf(state).map((c) => ({
  severity: c.severity, category: 'source-figures-conflict', entityId: c.id,
  message: `${c.label}, ${c.year}: World Bank ${c.wbText}, IMF ${c.imfText} — ${c.gapText} (tolerance ${c.allowedText}).${c.note ? ` ${c.note}.` : ''}`,
})) : []));

registerConnector({
  id: 'cross-source-checks', label: 'Cross-source checks (World Bank vs IMF)', sourceIds: ['world-bank-wdi', 'imf-weo'], everyHours: 24, delaySec: 200,
  provides: 'Compares GDP, growth, inflation, unemployment, the current account and population as the World Bank and the IMF report them, country by country — conflicts go to the audit',
  run: async () => {
    const s = await refreshAgreement(); const t = totals(s); const missing = s.pairs.filter((p) => p.error).map((p) => p.label);
    return { detail: `${t.compared.toLocaleString()} figures in ${t.countries} countries: ${t.agree.toLocaleString()} agree, ${t.differ} differ, ${t.conflict} conflict${missing.length ? ` · not loaded: ${missing.join(', ')}` : ''}`, fetchedAt: s.pairs.map((p) => p.wbAt).filter((x): x is string => !!x).sort()[0] ?? s.at };
  },
});

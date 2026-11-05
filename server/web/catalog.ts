// Indicator catalog: every series the connected statistics providers publish, searchable, so any of
// them can be a map layer or a profile chart — instead of a fixed list chosen in code.
//   • World Bank World Development Indicators (~1,500 series: economy, people, environment, …)
//   • IMF DataMapper (World Economic Outlook, Fiscal Monitor and other datasets)
import { cached, fetchJson } from '../cache.js';
import { WB_INDICATORS, unitFromName } from '../providers.js';
import { IMF_INDICATORS } from '../markets.js';
import { normName } from '../graph.js';
import { registerConnector } from './connectors.js';

export interface Metric { id: string; provider: 'wb' | 'imf'; code: string; label: string; unit?: string; description?: string; source?: string; topics: string[]; dataset?: string; }

export function parseWbCatalog(json: any): Metric[] {
  return ((json?.[1] || []) as any[]).filter((r) => r?.id && r?.name).map((r) => ({
    id: `wb:${r.id}`, provider: 'wb' as const, code: String(r.id), label: String(r.name).trim(), unit: r.unit || unitFromName(String(r.name)), description: r.sourceNote ? String(r.sourceNote).slice(0, 600) : undefined,
    source: r.sourceOrganization ? String(r.sourceOrganization).slice(0, 200) : 'World Bank', topics: (r.topics || []).map((t: any) => String(t?.value || '').trim()).filter(Boolean),
  }));
}
export function parseImfCatalog(json: any): Metric[] {
  return Object.entries<any>(json?.indicators || {}).filter(([code, v]) => code && v?.label).map(([code, v]) => ({
    id: `imf:${code}`, provider: 'imf' as const, code, label: String(v.label).trim(), unit: v.unit ? String(v.unit) : undefined, description: v.description ? String(v.description).slice(0, 600) : undefined,
    source: v.source ? String(v.source) : 'IMF', topics: v.dataset ? [String(v.dataset)] : [], dataset: v.dataset ? String(v.dataset) : undefined,
  }));
}
async function wbCatalog() {
  return cached('catalog:wb:v1', 7 * 86400, async () => {
    let json: any;
    try { json = await fetchJson('https://api.worldbank.org/v2/indicator?format=json&per_page=20000&source=2', {}, 60000); } catch { json = null; }
    if (!json?.[1]?.length) json = await fetchJson('https://api.worldbank.org/v2/source/2/indicator?format=json&per_page=20000', {}, 60000);
    const list = parseWbCatalog(json); if (list.length < 100) throw new Error('World Bank catalog came back nearly empty');
    return list;
  });
}
async function imfCatalog() {
  return cached('catalog:imf:v1', 7 * 86400, async () => {
    const list = parseImfCatalog(await fetchJson('https://www.imf.org/external/datamapper/api/v1/indicators', {}, 40000));
    if (list.length < 10) throw new Error('IMF catalog came back nearly empty');
    return list;
  });
}
// The hand-labelled series are always present, even before (or without) the catalogs.
const BUILT_IN: Metric[] = [
  ...Object.entries(WB_INDICATORS).map(([code, m]) => ({ id: `wb:${code}`, provider: 'wb' as const, code, label: m.label, unit: m.unit, source: 'World Bank', topics: ['Featured'] })),
  ...Object.entries(IMF_INDICATORS).map(([code, m]) => ({ id: `imf:${code}`, provider: 'imf' as const, code, label: m.label, unit: m.unit, source: 'IMF World Economic Outlook', topics: ['Featured'] })),
];
let all: Metric[] = BUILT_IN; let byId = new Map(all.map((m) => [m.id, m])); let loadedAt: string | undefined;
let words: { m: Metric; text: string }[] = [];
function index(list: Metric[]) {
  const seen = new Map<string, Metric>();
  for (const m of [...list, ...BUILT_IN]) { const prev = seen.get(m.id); seen.set(m.id, prev ? { ...m, ...prev, topics: [...new Set([...prev.topics, ...m.topics])] } : m); }
  all = [...seen.values()]; byId = seen;
  words = all.map((m) => ({ m, text: ` ${normName(`${m.label} ${m.code} ${m.topics.join(' ')} ${m.dataset || ''}`)} ` }));
}
index([]);
export async function loadCatalog() {
  const [wb, imf] = await Promise.allSettled([wbCatalog(), imfCatalog()]);
  const list = [...(wb.status === 'fulfilled' ? wb.value.data : []), ...(imf.status === 'fulfilled' ? imf.value.data : [])];
  index(list); loadedAt = new Date().toISOString();
  return { wb: wb.status === 'fulfilled' ? wb.value.data.length : 0, imf: imf.status === 'fulfilled' ? imf.value.data.length : 0, errors: [wb, imf].filter((r) => r.status === 'rejected').map((r: any) => String(r.reason?.message || r.reason)) };
}
/** Search by words in the name, code or topic; featured series and shorter names first. */
export function searchMetrics(q: string, o: { provider?: 'wb' | 'imf'; limit?: number } = {}) {
  const toks = normName(q).split(' ').filter(Boolean);
  if (!toks.length) return [];
  const out: { m: Metric; score: number }[] = [];
  for (const w of words) {
    if (o.provider && w.m.provider !== o.provider) continue;
    let score = 0; let ok = true;
    for (const t of toks) { const i = w.text.indexOf(` ${t}`); if (i < 0) { ok = false; break; } score += w.text.indexOf(` ${t} `) >= 0 ? 3 : 2; }
    if (!ok) continue;
    if (normName(w.m.code) === normName(q)) score += 50;
    if (w.m.topics.includes('Featured')) score += 4;
    score -= w.m.label.length / 60;
    out.push({ m: w.m, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, o.limit || 30).map((x) => x.m);
}
export const metricMeta = (id: string) => byId.get(id);
export function catalogStatus() { return { metrics: all.length, wb: all.filter((m) => m.provider === 'wb').length, imf: all.filter((m) => m.provider === 'imf').length, loadedAt }; }

registerConnector({
  id: 'indicator-catalog', label: 'Indicator catalog (World Bank, IMF)', sourceIds: ['world-bank-wdi', 'imf-weo'], everyHours: 72, delaySec: 15,
  provides: 'Every series the World Bank (World Development Indicators) and the IMF (DataMapper) publish, searchable as map layers and profile charts',
  run: async () => {
    const r = await loadCatalog();
    if (!r.wb && !r.imf) throw new Error(`Catalogs unavailable: ${r.errors.join('; ')}`);
    return { detail: `${r.wb.toLocaleString('en-US')} World Bank and ${r.imf} IMF series${r.errors.length ? ` (${r.errors.length} failed)` : ''}`, fetchedAt: loadedAt, counts: { wb: r.wb, imf: r.imf } };
  },
});

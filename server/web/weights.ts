// How much an economy or organization matters, computed from data instead of a hand-set table:
// its share of world GDP (IMF World Economic Outlook, current US$; World Bank as a fallback), and for
// an organization the combined share of its current member countries (from the knowledge web).
// Used to grade the calendar's importance and to size nodes in the web view.
import { imfIndicator } from '../markets.js';
import { wbIndicatorAll } from '../providers.js';
import { getEntity, byIso3, membersOf, graphChanged } from '../graph.js';
import { registerConnector } from './connectors.js';

interface Shares { year: string; source: string; byIso3: Record<string, number>; at: string; }
let shares: Shares | null = null;

/** GDP shares (% of the world total) for one year from a { iso3: { year: value } } table. */
export function sharesFrom(table: Record<string, Record<string, number>>, year: string) {
  const vals = Object.entries(table).filter(([iso]) => byIso3.has(iso)).map(([iso, ys]) => [iso, ys[year]] as const).filter(([, v]) => typeof v === 'number' && v > 0);
  const total = vals.reduce((s, [, v]) => s + v, 0);
  return total ? Object.fromEntries(vals.map(([iso, v]) => [iso, (v / total) * 100])) : {};
}
export async function refreshWeights(): Promise<Shares> {
  const y = new Date().getUTCFullYear();
  try {
    const r = await imfIndicator('NGDPD');
    for (const year of [String(y), String(y - 1)]) {
      const s = sharesFrom(r.data, year);
      if (Object.keys(s).length > 100) return (shares = { year, source: 'IMF World Economic Outlook', byIso3: s, at: r.fetchedAt });
    }
  } catch { /* fall back to the World Bank */ }
  // World Bank "latest available" values mix years; shares use each country's latest figure.
  const wb = await wbIndicatorAll('NY.GDP.MKTP.CD');
  const table = Object.fromEntries(Object.entries(wb.data.values).map(([iso, v]) => [iso, { latest: v.value }]));
  const year = Object.values(wb.data.values).map((v) => v.period).sort().at(-1) || String(y - 2);
  return (shares = { year, source: 'World Bank WDI (latest year per country)', byIso3: sharesFrom(table, 'latest'), at: wb.fetchedAt });
}
export function setSharesForTest(s: Shares | null) { shares = s; graphChanged(); }

/** Share of world GDP for a country, or the combined share of an organization's current members. */
export function gdpShare(placeId: string): number | undefined {
  if (!shares) return undefined;
  if (placeId.startsWith('country:')) return shares.byIso3[placeId.slice(8)];
  const members = membersOf(placeId);
  if (!members.length) return undefined;
  return members.reduce((s, id) => s + (shares!.byIso3[id.slice(8)] || 0), 0);
}
/** Importance points for the calendar: 0 for an economy under 0.5% of world GDP, rising with the
 *  logarithm of its share, at most 3 (2.5 for organizations, which are forums rather than economies). */
export function economyWeight(placeId: string): [number, string] | undefined {
  const share = gdpShare(placeId); if (share == null || !shares) return undefined;
  const isOrg = !placeId.startsWith('country:');
  const w = Math.max(0, Math.min(isOrg ? 2.5 : 3, Math.round(Math.log2(Math.max(share, 0.01) / 0.5) * 0.55 * 2) / 2));
  const name = getEntity(placeId)?.name || placeId;
  return [w, `${name}: ${share >= 10 ? share.toFixed(0) : share.toFixed(1)}% of world GDP${isOrg ? ' (members combined)' : ''} (${shares.source.split(' ')[0]}, ${shares.year})`];
}
/** Countries by GDP, largest first (for choosing whose trade to load). */
export async function gdpRanking() {
  const s = shares || (await refreshWeights().catch(() => null));
  if (!s) return [];
  return Object.entries(s.byIso3).sort((a, b) => b[1] - a[1]).map(([iso3, share]) => ({ iso3, share }));
}
export function weightsStatus() { return shares ? { year: shares.year, source: shares.source, countries: Object.keys(shares.byIso3).length, at: shares.at } : null; }

registerConnector({
  id: 'economy-weights', label: 'Economy weights (share of world GDP)', sourceIds: ['imf-weo', 'world-bank-wdi'], everyHours: 24, delaySec: 10,
  provides: 'Each country’s share of world GDP, and each organization’s members combined — used to grade calendar importance and size the web',
  run: async () => { const s = await refreshWeights(); return { detail: `${Object.keys(s.byIso3).length} economies, ${s.year} (${s.source})`, fetchedAt: s.at }; },
});

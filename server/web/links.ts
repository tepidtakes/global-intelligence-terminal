// Links computed from live data, so the web carries current figures, not just structure:
//   • trade: each of the world's largest economies (chosen by GDP, not by hand) → its partners,
//     sized by goods trade as it reports it (UN Comtrade)
//   • sanctions: imposer (US, EU, UK, UN) → country, for programmes aimed at that country
//   • news: entities named together in trusted headlines over the last 7 days
//   • names: the World Bank's spellings of country names, for reading other sources
import { setLiveRels, byIso3, getEntity, addCountryNames, byCcn3 } from '../graph.js';
import type { Relationship } from '../../shared/types.js';
import { registerConnector, runConnector } from './connectors.js';
import { tradePartners } from '../tradeExplorer.js';
import { sanctionsFor, sanctionsStatus, LISTS, LIST_IDS } from '../sanctions.js';
import { latestStories } from '../newsroom.js';
import { wbCountryMeta } from '../providers.js';
import { gdpRanking } from './weights.js';

type NewRel = Omit<Relationship, 'id' | 'origin'>;

// ───────────────────────── Trade ─────────────────────────
const TRADE_REPORTERS = Math.max(5, Number(process.env.TRADE_WEB_COUNTRIES) || 40);
const TRADE_PARTNERS = 30;
export function tradeLinks(reporterIso3: string, data: { year?: string; partners: { ccn3: string; exports: number; imports: number }[]; world: { exports: number; imports: number } }): NewRel[] {
  const from = byIso3.get(reporterIso3); if (!from || !data.year) return [];
  const total = data.world.exports + data.world.imports;
  return data.partners.map((p) => ({ p, to: byCcn3.get(p.ccn3) })).filter((x) => x.to && x.to !== from).slice(0, TRADE_PARTNERS).map(({ p, to }) => ({
    from, to: to!, type: 'trades_with' as const, value: p.exports + p.imports, unit: 'USD', period: data.year,
    data: { exports: p.exports, imports: p.imports, share: total ? +(((p.exports + p.imports) / total) * 100).toFixed(2) : undefined, reporter: reporterIso3 }, sourceId: 'un-comtrade',
  }));
}
registerConnector({
  id: 'trade-web', label: 'Trade web (UN Comtrade)', sourceIds: ['un-comtrade'], everyHours: 7 * 24, delaySec: 150,
  provides: `Goods trade between each of the ${TRADE_REPORTERS} largest economies (by IMF GDP) and its ${TRADE_PARTNERS} biggest partners, as each reports it`,
  run: async () => {
    const ranked = (await gdpRanking()).slice(0, TRADE_REPORTERS);
    if (!ranked.length) throw new Error('GDP ranking not available yet (IMF and World Bank both unreachable)');
    const rels: NewRel[] = []; const failed: string[] = []; let fetchedAt: string | undefined;
    for (const { iso3 } of ranked) {
      try { const r = await tradePartners(iso3); rels.push(...tradeLinks(iso3, r.data)); fetchedAt ||= r.fetchedAt; } catch { failed.push(iso3); }
    }
    if (!rels.length) throw new Error(`UN Comtrade unavailable for all ${ranked.length} reporters`);
    const n = setLiveRels('trade-web', rels);
    return { detail: `${ranked.length - failed.length} reporters, ${n} trade links${failed.length ? ` (${failed.length} not loaded: ${failed.slice(0, 6).join(', ')})` : ''}`, fetchedAt, counts: { links: n, reporters: ranked.length - failed.length } };
  },
});

// ───────────────────────── Sanctions ─────────────────────────
export function sanctionLinks(): NewRel[] {
  const out: NewRel[] = [];
  for (const [iso3, id] of byIso3) {
    const cs = sanctionsFor(iso3); if (!cs) continue;
    for (const list of LIST_IDS) {
      const programmes = cs.programmes.filter((p) => p.list === list && p.targeted);
      if (!programmes.length) continue;
      out.push({ from: LISTS[list].imposer, to: id, type: 'sanctions', value: cs.listings[list], unit: 'listings', role: `${LISTS[list].short}: ${programmes.map((p) => p.program).slice(0, 4).join(', ')}`,
        data: { list, programmes: programmes.map((p) => ({ program: p.program, count: p.count })) }, sourceId: LISTS[list].sourceId });
    }
  }
  return out;
}
registerConnector({
  id: 'sanctions-web', label: 'Sanctions web', sourceIds: LIST_IDS.map((l) => LISTS[l].sourceId), everyHours: 6, delaySec: 240,
  provides: 'A link from the US, the EU, the UK and the UN to every country they run a sanctions programme against, sized by listings',
  run: async () => {
    const st = sanctionsStatus(); if (!st) throw new Error('Sanctions lists not loaded yet');
    const n = setLiveRels('sanctions-web', sanctionLinks());
    return { detail: `${n} sanctions links`, fetchedAt: st.at, counts: { links: n } };
  },
});
/** Rebuild the sanctions links as soon as new lists are loaded. */
export const refreshSanctionsWeb = () => runConnector('sanctions-web').catch(() => undefined);

// ───────────────────────── News co-mentions ─────────────────────────
const NEWS_DAYS = 7;
export function newsLinks(stories: { title: string; url: string; date: string; tags?: { id: string }[] }[], minStories = 2, perEntity = 15): NewRel[] {
  const pairs = new Map<string, { a: string; b: string; n: number; last?: { title: string; url: string; at: string } }>();
  for (const s of stories) {
    const ids = [...new Set((s.tags || []).map((t) => t.id))].filter((id) => getEntity(id)).slice(0, 8).sort();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const k = `${ids[i]}|${ids[j]}`;
      const p = pairs.get(k) || pairs.set(k, { a: ids[i], b: ids[j], n: 0 }).get(k)!;
      p.n++; if (!p.last || s.date > p.last.at) p.last = { title: s.title, url: s.url, at: s.date };
    }
  }
  // Keep each entity's strongest co-mentions only, so busy entities do not drown the web.
  const kept = [...pairs.values()].filter((p) => p.n >= minStories).sort((x, y) => y.n - x.n);
  const per = new Map<string, number>(); const out: NewRel[] = [];
  for (const p of kept) {
    if ((per.get(p.a) || 0) >= perEntity || (per.get(p.b) || 0) >= perEntity) continue;
    per.set(p.a, (per.get(p.a) || 0) + 1); per.set(p.b, (per.get(p.b) || 0) + 1);
    out.push({ from: p.a, to: p.b, type: 'mentioned_with', value: p.n, unit: 'stories', period: `${NEWS_DAYS} days`, data: { last: p.last }, sourceId: 'trusted-news' });
  }
  return out;
}
registerConnector({
  id: 'news-web', label: 'News web (trusted outlets)', sourceIds: ['trusted-news'], everyHours: 0.5, delaySec: 180,
  provides: `Links between entities named together in two or more trusted stories in the last ${NEWS_DAYS} days — updated every 30 minutes`,
  run: async () => {
    const stories = latestStories({ hours: NEWS_DAYS * 24, trustedOnly: true, limit: 5000 });
    const n = setLiveRels('news-web', newsLinks(stories));
    return { detail: `${n} links from ${stories.length} stories`, fetchedAt: new Date().toISOString(), counts: { links: n, stories: stories.length } };
  },
});

// ───────────────────────── World Bank country names ─────────────────────────
registerConnector({
  id: 'worldbank-names', label: 'World Bank country names', sourceIds: ['world-bank-class'], everyHours: 7 * 24, delaySec: 6,
  provides: 'The World Bank’s spelling of every country name (e.g. “Korea, Rep.”), so data from other sources is matched to the right country',
  run: async () => {
    const r = await wbCountryMeta(); let n = 0;
    for (const [iso3, m] of Object.entries(r.data)) { const id = byIso3.get(iso3); if (id && m.name) n += addCountryNames(id, [m.name]); }
    return { detail: `${Object.keys(r.data).length} countries, ${n} new names`, fetchedAt: r.fetchedAt, stale: r.stale };
  },
});

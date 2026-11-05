// Prediction markets for elections: Polymarket (Gamma API) and Kalshi (CFTC-regulated exchange),
// both public, no key. A contract's price is what traders pay for "this candidate wins": read
// it as the market-implied probability, not as a poll or a forecast by this terminal.
// Markets are matched to election profiles by place (country / US state / city), office,
// timing and candidate names; anything that does not match clearly is left out.
import { cached, fetchJson } from './cache.js';
import { getEntity, relsOfType, normName } from './graph.js';
import { getTagger } from './newsroom.js';
import type { Entity } from '../shared/types.js';

export interface MarketOutcome { name: string; probability: number; volume?: number; }
export interface PredictionMarket {
  platform: 'polymarket' | 'kalshi'; id: string; title: string; subtitle?: string; url: string;
  closes?: string; volume?: number; liquidity?: number; outcomes: MarketOutcome[]; updatedAt?: string;
}
export const PLATFORM: Record<PredictionMarket['platform'], { name: string; sourceId: string; note: string }> = {
  polymarket: { name: 'Polymarket', sourceId: 'polymarket', note: 'Crypto-settled prediction market; prices in US$ per $1 payout.' },
  kalshi: { name: 'Kalshi', sourceId: 'kalshi', note: 'CFTC-regulated US exchange; prices in cents per $1 payout.' },
};

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' };
const f = (v: any) => (v == null || v === '' ? undefined : Number(v));
const jsonArr = (v: any): any[] => { if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return []; } };
/** Mid-price when the spread is tight, else the last trade. */
const priceOf = (bid?: number, ask?: number, last?: number) => (bid != null && ask != null && bid > 0 && ask > 0 && ask - bid <= 0.1 ? (bid + ask) / 2 : last);

// ───────────────────────── Normalisation ─────────────────────────
export function normalizePolymarket(events: any[]): PredictionMarket[] {
  const out: PredictionMarket[] = [];
  for (const ev of events || []) {
    if (ev.closed || ev.archived) continue;
    const outcomes: MarketOutcome[] = [];
    for (const m of ev.markets || []) {
      if (m.closed || m.active === false) continue;
      const names = jsonArr(m.outcomes).map(String); const prices = jsonArr(m.outcomePrices).map(Number);
      if (names.length === 2 && /^yes$/i.test(names[0])) {
        const p = priceOf(f(m.bestBid), f(m.bestAsk), prices[0] ?? f(m.lastTradePrice));
        if (p != null && Number.isFinite(p)) outcomes.push({ name: String(m.groupItemTitle || m.question || ev.title).trim(), probability: p, volume: f(m.volumeNum ?? m.volume) });
      } else names.forEach((n, i) => { if (Number.isFinite(prices[i])) outcomes.push({ name: n, probability: prices[i], volume: f(m.volumeNum ?? m.volume) }); });
    }
    if (!outcomes.length) continue;
    out.push({ platform: 'polymarket', id: String(ev.id), title: String(ev.title || ''), url: `https://polymarket.com/event/${ev.slug}`, closes: ev.endDate, volume: f(ev.volume), liquidity: f(ev.liquidity), updatedAt: ev.updatedAt, outcomes: outcomes.sort((a, b) => b.probability - a.probability) });
  }
  return out;
}

export function normalizeKalshi(events: any[]): PredictionMarket[] {
  const out: PredictionMarket[] = [];
  for (const ev of events || []) {
    if (ev.category && !/election|politic/i.test(ev.category)) continue;
    const outcomes: MarketOutcome[] = []; let volume = 0; let closes: string | undefined;
    for (const m of ev.markets || []) {
      if (m.status && !/active|open|initialized/i.test(m.status)) continue;
      const cents = (k: string) => (m[`${k}_dollars`] != null ? Number(m[`${k}_dollars`]) : f(m[k]) != null ? f(m[k])! / 100 : undefined);
      const p = priceOf(cents('yes_bid'), cents('yes_ask'), cents('last_price'));
      if (p == null || !Number.isFinite(p)) continue;
      outcomes.push({ name: String(m.yes_sub_title || m.subtitle || m.title || '').trim(), probability: p, volume: f(m.volume) });
      volume += f(m.volume) || 0;
      if (m.close_time && (!closes || m.close_time > closes)) closes = m.close_time;
    }
    if (!outcomes.length) continue;
    out.push({ platform: 'kalshi', id: String(ev.event_ticker), title: String(ev.title || ''), subtitle: ev.sub_title || undefined, url: `https://kalshi.com/markets/${String(ev.series_ticker || ev.event_ticker).toLowerCase()}`, closes, volume, outcomes: outcomes.sort((a, b) => b.probability - a.probability) });
  }
  return out;
}

// ───────────────────────── Fetching ─────────────────────────
async function polymarket() {
  return cached('pm:polymarket:elections', 900, async () => {
    const all: any[] = [];
    for (const tag of ['elections', 'world-elections', 'us-elections']) {
      for (let offset = 0; offset < 600; offset += 200) {
        const page = await fetchJson(`https://gamma-api.polymarket.com/events?closed=false&active=true&tag_slug=${tag}&limit=200&offset=${offset}&order=volume&ascending=false`, BROWSER, 30000).catch((e) => { if (tag === 'elections' && offset === 0) throw e; return []; });
        if (!Array.isArray(page) || !page.length) break;
        all.push(...page);
        if (page.length < 200) break;
      }
    }
    const seen = new Set<string>();
    return normalizePolymarket(all.filter((e) => !seen.has(String(e.id)) && seen.add(String(e.id))));
  });
}
async function kalshi() {
  return cached('pm:kalshi:elections', 900, async () => {
    const all: any[] = []; let cursor = '';
    for (let page = 0; page < 8; page++) {
      const j = await fetchJson(`https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, BROWSER, 30000);
      all.push(...(j?.events || []));
      cursor = j?.cursor || ''; if (!cursor) break;
    }
    return normalizeKalshi(all);
  });
}

export async function allMarkets() {
  const [p, k] = await Promise.allSettled([polymarket(), kalshi()]);
  const markets: PredictionMarket[] = []; const status: Record<string, { ok: boolean; count?: number; fetchedAt?: string; stale?: boolean; error?: string }> = {};
  for (const [name, r] of [['polymarket', p], ['kalshi', k]] as const) {
    if (r.status === 'fulfilled') { markets.push(...r.value.data); status[name] = { ok: true, count: r.value.data.length, fetchedAt: r.value.fetchedAt, stale: r.value.stale }; }
    else status[name] = { ok: false, error: String(r.reason?.message || r.reason).slice(0, 160) };
  }
  return { markets, status };
}

// ───────────────────────── Matching markets to elections ─────────────────────────
const OFFICE: [string, RegExp][] = [
  ['president', /\bpresiden(t|cy|tial)\b/i],
  ['legislature', /\b(parliament(ary)?|general election|legislative|lower house|house of (representatives|commons)|\bhouse\b|assembly|bundestag|diet|duma|knesset|congress|midterms?|seats|majority|prime minister|premier|chancellor)\b/i],
  ['senate', /\bsenate\b/i],
  ['governor', /\b(governor|gubernatorial)\b/i],
  ['mayor', /\b(mayor(al)?|municipal)\b/i],
];
export const officeClasses = (text: string) => new Set(OFFICE.filter(([, re]) => re.test(text)).map(([k]) => k));
const ELECTION_WORDS = /\b(elect(ion|ed)?|win(ner|s)?|vote|race|nominee|primary|runoff|seats|majority|control|next (president|prime minister|chancellor|governor|mayor)|become)\b/i;
const surname = (n?: string) => (n ? normName(n.replace(/\s*\(.*\)$/, '')).split(' ').filter((w) => w.length > 2).at(-1) : undefined);

export interface Contender { name?: string; party?: string; personId?: string; }
const tagMemo = new Map<string, { text: string; tags: string[] }>();
function tagsFor(key: string, text: string) {
  const hit = tagMemo.get(key);
  if (hit && hit.text === text) return hit.tags;
  const tags = getTagger().tag(text).map((t) => t.id);
  if (tagMemo.size > 20000) tagMemo.clear();
  tagMemo.set(key, { text, tags });
  return tags;
}
export const clearMarketTags = () => tagMemo.clear();
/** Score one market against one election; undefined = not about this election. */
export function scoreMarket(m: PredictionMarket, e: { place?: Entity; officeText: string; date: string; endDate?: string; contenders: Contender[] }) {
  const text = `${m.title} ${m.subtitle || ''}`;
  if (!ELECTION_WORDS.test(text) && !m.outcomes.some((o) => e.contenders.some((c) => surname(c.name) && normName(o.name).includes(surname(c.name)!)))) return undefined;
  const place = e.place; if (!place) return undefined;
  const tags = tagsFor(m.platform + m.id, text);
  let placeOk = false;
  if (place.type === 'city') placeOk = new RegExp(`\\b${place.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/,.*$/, '')}\\b`, 'i').test(text);
  else placeOk = tags.includes(place.id);
  // US-wide contests ("Which party wins the House?") rarely name the country.
  if (!placeOk && place.id === 'country:USA' && /\b(house|senate|congress|midterms?|electoral college)\b/i.test(text) && !tags.some((t) => t.startsWith('state:') || (t.startsWith('country:') && t !== 'country:USA'))) placeOk = true;
  if (!placeOk) return undefined;
  // A national election should not pick up a state race in the same country, and vice versa.
  if (place.type === 'country' && tags.some((t) => t.startsWith('state:')) && place.id === 'country:USA') return undefined;
  const mo = officeClasses(text), eo = officeClasses(e.officeText);
  if (mo.size && eo.size && ![...mo].some((k) => eo.has(k))) return undefined;
  const end = e.endDate || e.date;
  const year = end.slice(0, 4);
  const closesOk = !m.closes || (m.closes.slice(0, 10) >= new Date(Date.parse(end) - 15 * 86400_000).toISOString().slice(0, 10) && m.closes.slice(0, 10) <= new Date(Date.parse(end) + 200 * 86400_000).toISOString().slice(0, 10));
  const yearInTitle = new RegExp(`\\b${year}\\b`).test(text);
  const otherYear = /\b(20\d\d)\b/.exec(text)?.[1];
  if (otherYear && otherYear !== year) return undefined;
  if (!closesOk && !yearInTitle) return undefined;
  const nameHits = m.outcomes.filter((o) => contenderFor(o.name, e.contenders) >= 0).length;
  return 2 + (mo.size && eo.size ? 2 : 0) + (yearInTitle ? 1 : 0) + Math.min(3, nameHits);
}

/** Which contender an outcome refers to (by surname, or by party for party-level markets). */
export function contenderFor(outcome: string, contenders: Contender[]) {
  const o = normName(outcome);
  // "Democratic" ↔ "Democratic Party", "Republicans" ↔ "Republican Party".
  const core = (p: string) => normName(p).replace(/\b(the|party|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const oc = core(outcome).replace(/s$/, '');
  return contenders.findIndex((c) => (surname(c.name) && new RegExp(`\\b${surname(c.name)}\\b`).test(o)) || (!!c.party && oc.length >= 3 && (core(c.party) === oc || core(c.party).startsWith(oc) || oc.startsWith(core(c.party)))));
}

export function electionMatchInput(e: Entity) {
  const place = relsOfType(e.id, 'affects', 'out').map((r) => getEntity(r.to)).filter(Boolean)
    .sort((a, b) => ({ city: 0, state: 1, country: 2 } as any)[a!.type] - ({ city: 0, state: 1, country: 2 } as any)[b!.type])[0];
  return {
    place: place || undefined, officeText: `${e.attrs?.office || ''} ${e.name} ${e.attrs?.election?.title || ''}`, date: String(e.attrs?.date || ''), endDate: e.attrs?.endDate,
    contenders: (e.attrs?.election?.contenders || []) as Contender[],
  };
}

/** Markets for one election, with a per-candidate summary across platforms. */
export function marketsForElection(e: Entity, markets: PredictionMarket[]) {
  const input = electionMatchInput(e);
  if (!input.date) return { markets: [], candidates: [] };
  const matched = markets.map((m) => ({ m, score: scoreMarket(m, input) })).filter((x) => x.score != null).sort((a, b) => b.score! - a.score! || (b.m.volume || 0) - (a.m.volume || 0)).slice(0, 8);
  // Per-candidate: each platform's best-matching market price; combined = volume-weighted mean.
  const per = new Map<string, { name: string; personId?: string; party?: string; prices: { platform: string; probability: number; volume?: number; url: string; market: string }[] }>();
  for (const { m } of matched) {
    const seenPlatform = new Set<string>();
    for (const o of m.outcomes) {
      const i = contenderFor(o.name, input.contenders);
      const key = i >= 0 ? `c${i}` : `o:${normName(o.name)}`;
      const c = i >= 0 ? input.contenders[i] : undefined;
      const row = per.get(key) || per.set(key, { name: c?.name || c?.party || o.name, personId: c?.personId, party: c?.party, prices: [] }).get(key)!;
      if (row.prices.some((p) => p.platform === m.platform) || seenPlatform.has(`${m.platform}|${key}`)) continue;
      seenPlatform.add(`${m.platform}|${key}`);
      row.prices.push({ platform: m.platform, probability: o.probability, volume: o.volume ?? m.volume, url: m.url, market: m.title });
    }
  }
  const candidates = [...per.values()].map((r) => {
    const w = r.prices.map((p) => Math.max(1, p.volume || 1));
    const combined = r.prices.reduce((s, p, i) => s + p.probability * w[i], 0) / w.reduce((a, b) => a + b, 0);
    return { ...r, combined, platforms: r.prices.length };
  }).filter((r) => r.combined >= 0.005).sort((a, b) => b.combined - a.combined).slice(0, 12);
  return { markets: matched.map(({ m, score }) => ({ ...m, score, thin: (m.volume || 0) < 25_000 })), candidates };
}

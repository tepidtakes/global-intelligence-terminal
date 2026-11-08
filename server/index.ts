import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { sessionMiddleware, register, login, logout, type AuthedRequest } from './auth.js';
import {
  entities, sources, getEntity, stub, children, relationshipsFor, relsOfType, allRels, search, listByType, byCcn3, byIso3, connectionPath, geoAnchor, GEO_TYPES,
} from './graph.js';
import { priv, searchNotes, openPositionMap, noteCountsFor, recentNotesFor, catalystsFor, positionsFor } from './private.js';
import { registerObsidianRoutes } from './obsidian.js';
import {
  WB_INDICATORS, COMTRADE_AREAS, wbIndicatorAll, wbCountrySeries, wbCountryMeta, comtradeProfile, comtradeProduct, getQuote, getDividends, secFundamentals, getNews, TARIFF_INDICATORS,
} from './providers.js';
import {
  fxBoard, fxFor, commodityBoard, policyRates, policyRateHistory, tenYearBoard, tenYearFor, tenYearHistory, yieldCurve, curveAvailable, imfIndicator, imfCountry, imfEdition, IMF_INDICATORS,
  fedOutlook, analystConsensus, spark, windowChanges, currencyUsers, EURO_AREA, isStale,
} from './markets.js';
import { startLiveData, liveStatus, onLiveRefresh } from './augment.js';
import { startNews, retagAll, newsFor, latestStories, allSignals, newsStatus, countryAttention, FEEDS } from './newsroom.js';
import { audit, summarize, coverage, entityProvenance, CATEGORY_LABEL } from './consistency.js';
import { providerHealth } from './cache.js';
import { electionCandidates, startElectionDetails, electionDetailsStatus } from './elections.js';
import { allMarkets, marketsForElection, PLATFORM, clearMarketTags } from './predictionMarkets.js';
import { mayorsWithin } from './localPolitics.js';
import { registerAlertRoutes, alertsByPlace } from './alerts.js';
import { startMarketWatch } from './marketWatch.js';
import { startCalendar, calendarFor, calendarPlaces, calendarStatus } from './econCalendar.js';
import { changesFor, recentChanges, emitNew, onChange, CHANGE_KINDS, type Change } from './changes.js';
import { startSanctions, sanctionsFor, listingsFor, regimesOf, sanctionsLayer, sanctionsStatus, sanctionsMeta, LIST_OF_IMPOSER, LISTS, LIST_IDS, type ListId } from './sanctions.js';
import { startTariffs, tariffsFor, tariffLayer, tariffsStatus } from './tariffs.js';
import { startBudgets, budgetFor } from './budgets.js';
import { partnersView, tradePair, tradeWithLayer } from './tradeExplorer.js';
// The knowledge web: connectors register themselves when their modules load.
import { startConnectors, connectorsStatus, runConnector, connectorIds, onConnectorRun } from './web/connectors.js';
import './web/wikidata.js';
import './web/links.js';
import { weightsStatus } from './web/weights.js';
import { searchMetrics, metricMeta, catalogStatus } from './web/catalog.js';
import { connectionsFor, neighborhood, webLayer, webStats } from './web/connections.js';
import { startReserves, reservesFor, stocksForCommodity, reservesLayer, gasLayer, reservesStatus, GRAINS } from './reserves.js';
import { hostHealth } from './net.js';
import { publish, liveStream, streamStatus } from './live.js';
import { agreementFor, agreementSummary, agreementStatus } from './agreement.js';
import crypto from 'node:crypto';
import { normName, onGraphChange } from './graph.js';
import { canonicalUrl, titleKey, sameStory } from './newsParse.js';
import { publisherForDomain, publisherForName, tierForDomain, isTrusted, TIER_INFO, PUBLISHERS } from '../shared/newsSources.js';
import { INTENSITY } from './worldEvents.js';
import { PRODUCTS, productByHs } from '../shared/products.js';
import { HOST, PORT } from './config.js';
import type { Entity } from '../shared/types.js';

const QUOTE_RANGES = new Set(['1mo', '6mo', '1y', '5y', 'max']);
const pickRange = (r: unknown) => (QUOTE_RANGES.has(String(r)) ? String(r) : '1y');

const app = express();
app.disable('x-powered-by');
// gzip API responses and static files (a country profile is ~90 KB of JSON, ~12 KB gzipped).
// Uploaded attachments are already compressed formats or user files: leave them as they are.
app.use(compression({ threshold: 1024, filter: (req, res) => !req.path.startsWith('/api/attachments') && compression.filter(req, res) }));
app.use(express.json({ limit: '4mb' }));
app.use(sessionMiddleware);

const api = express.Router();
const wrap = (fn: (req: AuthedRequest, res: express.Response) => Promise<any>) => (req: AuthedRequest, res: express.Response) =>
  fn(req, res).catch((e) => { console.error('[api]', req.path, e.message); res.status(502).json({ error: e.message || 'Upstream error' }); });
const today = () => new Date().toISOString().slice(0, 10);

// ───────────── Auth ─────────────
api.post('/auth/register', register);
api.post('/auth/login', login);
api.post('/auth/logout', logout);
api.get('/auth/me', (req: AuthedRequest, res) => res.json(req.userId ? { id: req.userId, email: req.userEmail } : null));

// ───────────── Entities ─────────────
function sourcesUsed(e: Entity, rels: ReturnType<typeof relationshipsFor>) {
  const ids = new Set<string>([...(e.sources || []), ...(e.facts || []).map((f) => f.sourceId), ...(e.timeline || []).map((t) => t.sourceId!).filter(Boolean), ...rels.map((r) => r.rel.sourceId!).filter(Boolean)]);
  for (const r of e.attrs?.ratings || []) ids.add(r.sourceId);
  return [...ids].map((id) => sources.get(id)).filter(Boolean);
}

function upcomingEventsFor(id: string) {
  return relsOfType(id, 'affects', 'in').map((r) => getEntity(r.from)!).filter((e) => e?.type === 'event' && e.attrs?.category !== 'conflict')
    .map((e) => ({ ...stub(e.id)!, date: e.attrs?.date, endDate: e.attrs?.endDate, category: e.attrs?.category, status: e.attrs?.status, scope: e.attrs?.scope, winner: e.attrs?.election?.winner?.name }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

api.get('/entity/:id', (req: AuthedRequest, res) => {
  const e = getEntity(req.params.id);
  if (!e) return res.status(404).json({ error: 'Entity not found' });
  const rels = relationshipsFor(e.id);
  let kids = children(e.id);
  const childCounts: Record<string, number> = {};
  for (const k of kids) childCounts[k.type] = (childCounts[k.type] || 0) + 1;
  // Counties are numerous; only list them for state profiles.
  if (e.type !== 'state') kids = kids.filter((k) => k.type !== 'county');
  const parentChain = [];
  let p = e.parentId ? getEntity(e.parentId) : undefined;
  while (p) { parentChain.unshift(stub(p.id)); p = p.parentId ? getEntity(p.parentId) : undefined; }
  const user = req.userId ? {
    noteCount: noteCountsFor(req.userId, e.id),
    positions: positionsFor(req.userId, e.id),
    catalysts: catalystsFor(req.userId, e.id),
  } : null;
  // Companies headquartered anywhere inside this place (city → state → country).
  let companies: any[] = [];
  if (GEO_TYPES.has(e.type)) {
    companies = listByType('company').filter((c) => relsOfType(c.id, 'headquartered_in', 'out').some((r) => {
      let cur = getEntity(r.to);
      while (cur) { if (cur.id === e.id) return true; cur = cur.parentId ? getEntity(cur.parentId) : undefined; }
      return false;
    })).sort((a, b) => Number(b.depth === 'curated') - Number(a.depth === 'curated') || (Number(b.attrs?.sitelinks) || 0) - (Number(a.attrs?.sitelinks) || 0))
      .slice(0, 60).map((c) => ({ ...stub(c.id), attrs: { public: c.attrs?.public, exchange: c.attrs?.exchange, quoteSymbol: c.attrs?.quoteSymbol, origin: c.attrs?.origin }, industries: relsOfType(c.id, 'in_industry', 'out').map((r) => stub(r.to)) }));
  }
  // Party of each person linked here (for government tables), resolved server-side.
  const partyOf: Record<string, any> = {};
  for (const r of rels) if (r.other.type === 'person' && !partyOf[r.other.id]) {
    const p = relsOfType(r.other.id, 'belongs_to_party', 'out')[0];
    if (p) partyOf[r.other.id] = stub(p.to);
  }
  res.json({
    entity: e, relationships: rels, parents: parentChain, companies, partyOf,
    children: kids.slice(0, 400).map((k) => ({ ...stub(k.id)!, attrs: k.type === 'city' ? k.attrs : undefined })), childCounts,
    events: upcomingEventsFor(e.id), sources: sourcesUsed(e, rels), user, provenance: entityProvenance(e.id),
    mayors: e.type === 'country' || e.type === 'state' ? mayorsWithin(e.id).slice(0, 40).map((m) => ({ city: stub(m.city.id), person: stub(m.person.id), role: m.role, since: m.since, origin: m.origin, party: partyOf[m.person.id] || (relsOfType(m.person.id, 'belongs_to_party', 'out')[0] ? stub(relsOfType(m.person.id, 'belongs_to_party', 'out')[0].to) : null), population: m.city.attrs?.population, capital: m.nationalCapital })) : undefined,
  });
});

const PREVIEW_CODES =['SP.POP.TOTL', 'NY.GDP.MKTP.CD', 'NY.GDP.PCAP.CD', 'NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS'];
api.get('/preview/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.id);
  if (!e) return res.status(404).json({ error: 'Entity not found' });
  const rels = relationshipsFor(e.id).filter((r) => !(r.rel.type === 'member_of' && r.rel.to === 'igo:un' && e.type === 'country') && r.rel.type !== 'in_region');
  let stats: any[] = [];
  if (e.type === 'country' && e.iso3) {
    const results = await Promise.allSettled(PREVIEW_CODES.map((c) => wbIndicatorAll(c)));
    stats = results.map((r, i) => {
      if (r.status !== 'fulfilled') return { code: PREVIEW_CODES[i], label: WB_INDICATORS[PREVIEW_CODES[i]].short, unit: WB_INDICATORS[PREVIEW_CODES[i]].unit, unavailable: true };
      const v = r.value.data.values[e.iso3!];
      return { code: PREVIEW_CODES[i], label: WB_INDICATORS[PREVIEW_CODES[i]].short, unit: WB_INDICATORS[PREVIEW_CODES[i]].unit, value: v?.value, period: v?.period, sourceId: 'world-bank-wdi' };
    });
  }
  const user = req.userId ? { notes: recentNotesFor(req.userId, e.id), noteCount: noteCountsFor(req.userId, e.id), position: openPositionMap(req.userId).get(e.id) || null } : null;
  const anchorId = geoAnchor(e.id);
  const anchor = anchorId ? { id: anchorId, coords: getEntity(anchorId)?.coords } : null;
  const parents = [];
  let p = e.parentId ? getEntity(e.parentId) : undefined;
  while (p) { parents.unshift(stub(p.id)); p = p.parentId ? getEntity(p.parentId) : undefined; }
  res.json({ entity: { ...stub(e.id), depth: e.depth, coords: e.coords, attrs: e.attrs, iso3: e.iso3, facts: (e.facts || []).slice(0, 6), parentId: e.parentId }, anchor, parents, stats, relationships: rels.slice(0, 400), events: upcomingEventsFor(e.id).filter((x) => String(x.endDate || x.date) >= today()).slice(0, 4), user });
}));

api.get('/entities', (req, res) => {
  const type = String(req.query.type || '');
  let list = listByType(type);
  // ?top=N: the best-known N (hand-checked first, then by Wikipedia language editions) — the web
  // holds hundreds of organizations and thousands of companies.
  const top = Number(req.query.top) || 0;
  if (top > 0) list = [...list].sort((a, b) => Number(b.depth === 'curated') - Number(a.depth === 'curated') || (Number(b.attrs?.sitelinks) || 0) - (Number(a.attrs?.sitelinks) || 0)).slice(0, top);
  res.json(list.map((e) => ({ ...stub(e.id)!, attrs: type === 'event' || type === 'city' || type === 'company' || type === 'commodity' ? e.attrs : undefined, coords: e.coords })).sort((a, b) => a.name.localeCompare(b.name)));
});

// Names for a few ids at once (pickers showing selections).
api.get('/stubs', (req, res) => res.json(String(req.query.ids || '').split(',').filter(Boolean).slice(0, 50).map((id) => stub(id)).filter(Boolean)));

api.get('/geo/nav', (_req, res) => {
  const regions = listByType('region').map((r) => ({ id: r.id, name: r.name,
    countries: children(r.id).filter((c) => c.type === 'country').map((c) => ({ id: c.id, name: c.name, flag: c.flag, iso3: c.iso3, ccn3: c.ccn3, depth: c.depth, independent: c.attrs?.independent })).sort((a, b) => a.name.localeCompare(b.name)) }));
  res.json(regions.filter((r) => r.countries.length));
});

api.get('/search', (req: AuthedRequest, res) => {
  const q = String(req.query.q || '').slice(0, 120);
  const types = req.query.types ? String(req.query.types).split(',') : undefined;
  const hits = search(q, { types, limit: Math.min(50, Number(req.query.limit) || 20) });
  if (req.userId) {
    const pos = openPositionMap(req.userId);
    for (const h of hits) { const p = pos.get(h.id); if (p) h.position = p; }
  }
  const notes = req.userId && (!types || types.includes('note')) ? searchNotes(req.userId, q, 6) : [];
  res.json({ entities: hits, notes });
});

api.get('/connections', (req, res) => {
  const a = String(req.query.a), b = String(req.query.b);
  if (!getEntity(a) || !getEntity(b)) return res.status(404).json({ error: 'Unknown entity' });
  res.json(connectionPath(a, b));
});

api.get('/sources', (_req, res) => res.json([...sources.values()]));

api.get('/events', (req, res) => {
  const from = String(req.query.from || '0000'), to = String(req.query.to || '9999');
  const cat = req.query.category ? String(req.query.category) : undefined;
  const evs = listByType('event').filter((e) => e.attrs?.category !== 'conflict' && String(e.attrs?.endDate || e.attrs?.date) >= from && String(e.attrs?.date) <= to && (!cat || e.attrs?.category === cat))
    .map((e) => ({ ...stub(e.id)!, summary: e.summary, ...e.attrs, affects: relsOfType(e.id, 'affects', 'out').map((r) => stub(r.to)) }))
    .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
  res.json(evs);
});

api.get('/igo/:id/members', (req, res) => {
  const year = req.query.year ? String(req.query.year) : undefined;
  const ms = relsOfType(req.params.id, 'member_of', 'in').map((r) => {
    const c = getEntity(r.from)!;
    const active = (!year || !r.validFrom || r.validFrom.slice(0, 4) <= year) && (!r.validTo || (year ? r.validTo.slice(0, 4) > year : false));
    return { id: c.id, name: c.name, flag: c.flag, iso3: c.iso3, from: r.validFrom, to: r.validTo, active, joinedLater: !!(year && r.validFrom && r.validFrom.slice(0, 4) > year) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  res.json(ms);
});

// ───────────── Map layers ─────────────
const THREE_WORLDS = {
  first: ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'BEL', 'NLD', 'LUX', 'DNK', 'NOR', 'ISL', 'PRT', 'ESP', 'GRC', 'TUR', 'AUT', 'CHE', 'SWE', 'FIN', 'IRL', 'JPN', 'KOR', 'TWN', 'AUS', 'NZL', 'ISR'],
  second: ['RUS', 'UKR', 'BLR', 'MDA', 'EST', 'LVA', 'LTU', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK', 'POL', 'CZE', 'SVK', 'HUN', 'ROU', 'BGR', 'ALB', 'CHN', 'MNG', 'PRK', 'VNM', 'LAO', 'CUB'],
};
const DIVERGING = new Set(['NY.GDP.MKTP.KD.ZG', 'BN.CAB.XOKA.GD.ZS', 'GC.NLD.TOTL.GD.ZS']);
const SANCTION_TIERS = [{ key: 'programme', label: 'Country-wide sanctions programme' }, { key: 'many', label: '25 or more people or entities listed' }, { key: 'some', label: '1–24 people or entities listed' }];

api.get('/map/layer/:layer', wrap(async (req, res) => {
  const layer = req.params.layer;
  const year = req.query.year ? String(req.query.year) : undefined;
  const countryIso = (id: string) => getEntity(id)?.iso3;

  if (layer.startsWith('wb:')) {
    const code = layer.slice(3);
    const r = await wbIndicatorAll(code, year);
    const values: Record<string, { value: number; period: string }> = {}; const detail: Record<string, string> = {};
    // "Latest available" mixes reporting years; a value more than 6 years old is not shown as current.
    const oldest = String(new Date().getFullYear() - 6);
    let dropped = 0;
    for (const [iso, v] of Object.entries(r.data.values)) {
      if (!byIso3.has(iso)) continue;
      if (!year && v.period < oldest) { detail[iso] = `Latest reported value is from ${v.period} — too old to compare`; dropped++; continue; }
      values[iso] = v;
    }
    const years = Object.values(values).map((v) => v.period).sort();
    return res.json({ kind: 'numeric', label: r.data.label, unit: r.data.unit, scale: DIVERGING.has(code) ? 'diverging' : 'sequential', values, detail, sourceIds: ['world-bank-wdi'], lastUpdated: r.data.lastUpdated, fetchedAt: r.fetchedAt, stale: r.stale,
      note: year ? undefined : `Most recent year each country reported (${years[0] || '—'}–${years.at(-1) || '—'}).${dropped ? ` ${dropped} countries whose latest figure is older than ${oldest} are left blank.` : ''}${code.startsWith('GC.') ? ' Central government only — for general government (all levels) use the IMF layers.' : ''}` });
  }
  if (layer === 'income') {
    const r = await wbCountryMeta();
    const order = ['High income', 'Upper middle income', 'Lower middle income', 'Low income'];
    const values: Record<string, string> = {};
    for (const [iso, m] of Object.entries(r.data)) if (order.includes(m.incomeLevel) && byIso3.has(iso)) values[iso] = m.incomeLevel;
    return res.json({ kind: 'ordinal', label: 'World Bank income group', categories: order.map((k) => ({ key: k, label: k })), values, sourceIds: ['world-bank-class'], note: 'Classification by GNI per capita (Atlas method), updated each 1 July.', fetchedAt: r.fetchedAt, stale: r.stale });
  }
  if (layer === 'govtype') {
    const groups = [{ key: 'presidential', label: 'Presidential / semi-presidential republic' }, { key: 'parliamentary', label: 'Parliamentary system (republic or monarchy)' }, { key: 'monarchy', label: 'Executive monarchy' }, { key: 'one-party', label: 'One-party state' }];
    const values: Record<string, string> = {}; const detail: Record<string, string> = {};
    let fromWd = 0;
    for (const e of listByType('country')) {
      if (!e.iso3) continue;
      if (e.attrs?.govGroup) { values[e.iso3] = e.attrs.govGroup; detail[e.iso3] = e.attrs.govType; }
      else if (e.attrs?.govGroupWd) { values[e.iso3] = e.attrs.govGroupWd; detail[e.iso3] = `${(e.attrs.govFormsWd || []).join(', ')} (Wikidata — verify)`; fromWd++; }
    }
    return res.json({ kind: 'categorical', label: 'Government type', categories: groups, values, detail, sourceIds: fromWd ? ['world-countries', 'wikidata'] : ['world-countries'],
      note: `${Object.keys(values).length - fromWd} countries hand-checked${fromWd ? `, ${fromWd} from Wikidata’s “form of government” (community-maintained)` : ''}; others show as not classified.` });
  }
  if (layer === 'igo') {
    const igos = String(req.query.igos || 'igo:nato').split(',').filter((i) => getEntity(i)).slice(0, 3);
    const counts = new Map<string, string[]>(); const former = new Set<string>();
    for (const igo of igos) for (const r of relsOfType(igo, 'member_of', 'in')) {
      const iso = countryIso(r.from); if (!iso) continue;
      const fromOk = !year || !r.validFrom || r.validFrom.slice(0, 4) <= year;
      const stillIn = !r.validTo || (year ? r.validTo.slice(0, 4) > year : false);
      if (fromOk && stillIn) counts.set(iso, [...(counts.get(iso) || []), igo]);
      else if (fromOk && !stillIn) former.add(iso);
    }
    const values: Record<string, string> = {};
    for (const [iso, list] of counts) values[iso] = list.length > 1 ? 'multi' : list[0];
    if (igos.length === 1) for (const iso of former) if (!values[iso]) values[iso] = 'former';
    const categories = [...igos.map((i) => ({ key: i, label: igos.length > 1 ? `${getEntity(i)!.name} only` : `${getEntity(i)!.name} member` })), ...(igos.length > 1 ? [{ key: 'multi', label: 'Member of 2+ selected' }] : [{ key: 'former', label: 'Former member' }])];
    return res.json({ kind: 'categorical', label: igos.map((i) => getEntity(i)!.name).join(' · ') + ' membership' + (year ? ` (${year})` : ''), categories, values, sourceIds: igos.flatMap((i) => getEntity(i)!.sources || []), igos });
  }
  if (layer === 'three-worlds') {
    const values: Record<string, string> = {};
    for (const e of listByType('country')) if (e.iso3 && e.attrs?.independent) values[e.iso3] = THREE_WORLDS.first.includes(e.iso3) ? 'first' : THREE_WORLDS.second.includes(e.iso3) ? 'second' : 'third';
    return res.json({ kind: 'categorical', label: 'Cold War “Three Worlds” (c. 1950–1991)', categories: [{ key: 'first', label: 'First World — US/Western bloc' }, { key: 'second', label: 'Second World — Soviet/communist bloc' }, { key: 'third', label: 'Third World — non-aligned & others' }], values, sourceIds: ['world-countries'],
      note: 'Historical, political (not economic) classification drawn on present-day borders: e.g. Germany shows as First World though East Germany was Second World; Yugoslavia’s successors show as Third World (non-aligned). Use World Bank income groups for development level today.' });
  }
  if (layer === 'elections') {
    const t = today(); const horizon = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10); const recent = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    const values: Record<string, string> = {}; const detail: Record<string, string> = {};
    for (const e of listByType('event').filter((x) => x.attrs?.category === 'election')) {
      const d = String(e.attrs?.endDate || e.attrs?.date);
      const key = d >= t && String(e.attrs?.date) <= horizon ? 'upcoming' : d >= recent && d < t ? 'recent' : null;
      if (!key) continue;
      const w = e.attrs?.election?.winner?.name;
      for (const r of relsOfType(e.id, 'affects', 'out')) { const iso = getEntity(r.to)?.type === 'country' ? countryIso(r.to) : undefined; if (iso) { values[iso] = key; detail[iso] = `${e.name} (${e.attrs?.date})${key === 'recent' ? (w ? ` — won by ${w}` : ' — result not yet recorded') : ''}`; } }
    }
    // Nearest upcoming election wins the label; "soon" = within 90 days.
    const soon = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
    const best: Record<string, string> = {};
    for (const e of listByType('event').filter((x) => x.attrs?.category === 'election')) {
      const d = String(e.attrs?.endDate || e.attrs?.date);
      if (!(d >= t && String(e.attrs?.date) <= horizon)) continue;
      for (const r of relsOfType(e.id, 'affects', 'out')) {
        const iso = getEntity(r.to)?.type === 'country' ? countryIso(r.to) : undefined; if (!iso) continue;
        if (!best[iso] || String(e.attrs?.date) < best[iso]) { best[iso] = String(e.attrs?.date); values[iso] = String(e.attrs?.date) <= soon ? 'soon' : 'upcoming'; detail[iso] = `${e.name} (${e.attrs?.date})`; }
      }
    }
    return res.json({ kind: 'categorical', label: 'National elections', categories: [{ key: 'soon', label: 'Election within 90 days' }, { key: 'upcoming', label: 'Election in 3–12 months' }, { key: 'recent', label: 'Election in the last 60 days' }], values, detail,
      sourceIds: ['wikipedia-elections', 'congress'], note: 'From Wikipedia’s national electoral calendars (this year and next) plus curated events. Dates can move.' });
  }
  if (layer === 'news') {
    const counts = countryAttention(48);
    const values: Record<string, { value: number; period: string }> = {};
    for (const [id, n] of counts) { const iso = countryIso(id); if (iso) values[iso] = { value: n, period: 'last 48 h' }; }
    const st = newsStatus();
    if (!st.lastRun) return res.status(503).json({ error: 'Trusted news feeds are still loading — try again in a minute.' });
    return res.json({ kind: 'numeric', label: 'In the news — stories naming each country (48 h)', unit: 'stories', scale: 'sequential', values, sourceIds: ['trusted-news'], fetchedAt: st.lastRun.at,
      note: `Distinct stories (duplicates across outlets counted once) whose headline names the country, from ${st.feeds.filter((f) => f.ok).length} trusted feeds. Measures coverage, not importance.` });
  }
  if (layer === 'conflicts') {
    const values: Record<string, string> = {}; const detail: Record<string, string> = {}; const rank: Record<string, number> = {};
    for (const e of listByType('event').filter((x) => x.attrs?.category === 'conflict' && x.attrs?.status === 'ongoing')) {
      const k = e.attrs!.intensity as keyof typeof INTENSITY;
      for (const r of relsOfType(e.id, 'affects', 'out')) {
        const iso = countryIso(r.to); if (!iso) continue;
        const names = detail[iso] ? detail[iso].split(' · ') : [];
        if (names.length < 4) detail[iso] = [...names, e.name].join(' · ');
        if (!rank[iso] || INTENSITY[k].rank > rank[iso]) { rank[iso] = INTENSITY[k].rank; values[iso] = k; }
      }
    }
    if (!Object.keys(values).length) return res.status(503).json({ error: liveStatus.conflicts?.ok === false ? `Conflict list unavailable: ${liveStatus.conflicts.detail}` : 'Conflict list is still loading — try again in a moment.' });
    return res.json({ kind: 'ordinal', label: 'Armed conflicts — most intense conflict on each country’s territory', categories: (Object.keys(INTENSITY) as (keyof typeof INTENSITY)[]).map((k) => ({ key: k, label: `${INTENSITY[k].label} (${INTENSITY[k].deaths.replace(' in the current or previous year', '').replace(' in the current and previous year', '')})` })),
      values, detail, sourceIds: ['wikipedia-conflicts'], note: 'Deaths per year, as tabulated in Wikipedia’s List of ongoing armed conflicts (citing ACLED, UCDP and others). Shading marks where fighting takes place, not which states are parties.', fetchedAt: liveStatus.conflicts?.at });
  }
  if (layer.startsWith('fx:')) {
    const win = layer.slice(3) as 'm1' | 'ytd' | 'y1' | 'y5';
    if (!['m1', 'ytd', 'y1', 'y5'].includes(win)) return res.status(404).json({ error: 'Unknown window' });
    const users = currencyUsers();
    const codes = [...users.keys()].filter((c) => c !== 'USD');
    const r = win === 'y5' ? await spark(codes.map((c) => `${c}=X`), '5y', '1wk') : await spark(codes.map((c) => `${c}=X`), '1y', '1d');
    const values: Record<string, { value: number; period: string }> = {}; const detail: Record<string, string> = {};
    for (const e of listByType('country')) {
      const code = e.attrs?.currencies?.[0]?.code; if (!code || !e.iso3) continue;
      if (code === 'USD') { detail[e.iso3] = 'Uses the US dollar'; continue; }
      const s = r.data[`${code}=X`]; if (!s) continue;
      if (isStale(s)) { detail[e.iso3] = `${code}: no recent trades (last ${s.time.slice(0, 10)})`; continue; }
      const ch = win === 'y5' ? (s.points[0] ? (s.points[0].c / s.price - 1) * 100 : undefined) : (windowChanges(s, true) as any)[win];
      if (ch == null || !Number.isFinite(ch)) continue;
      values[e.iso3] = { value: ch, period: `${code} · to ${s.time.slice(0, 10)}` };
      detail[e.iso3] = `${code}: ${s.price.toLocaleString('en-US', { maximumSignificantDigits: 5 })} per US$`;
    }
    const label = { m1: '1 month', ytd: 'year to date', y1: '1 year', y5: '5 years' }[win];
    return res.json({ kind: 'numeric', label: `Currency vs US dollar — change over ${label}`, unit: '%', scale: 'diverging', values, detail, sourceIds: ['yahoo-finance'], fetchedAt: r.fetchedAt, stale: r.stale,
      note: 'Positive = the local currency strengthened against the dollar. Countries using the US dollar are not shaded. Delayed quotes.' });
  }
  if (layer === 'policy-rate') {
    const r = await policyRates();
    const values: Record<string, { value: number; period: string }> = {}; const detail: Record<string, string> = {};
    for (const [iso, v] of Object.entries(r.data)) {
      if (v.stale) { detail[iso] = `${v.bank}: last reported ${v.date} — too old to show as current`; continue; }
      values[iso] = { value: v.value, period: v.date }; detail[iso] = v.bank;
    }
    return res.json({ kind: 'numeric', label: 'Central-bank policy rate', unit: '%', values, detail, sourceIds: ['bis-policy'], fetchedAt: r.fetchedAt, stale: r.stale, note: 'Euro-area members share the ECB deposit facility rate. About 40 central banks report to the BIS; others show no data. Rates last reported more than 120 days ago are left off.' });
  }
  if (layer === 'bond10y') {
    const r = await tenYearBoard();
    const values: Record<string, { value: number; period: string }> = {}; const detail: Record<string, string> = {};
    for (const [iso, v] of Object.entries(r.data)) {
      if (v.stale) { detail[iso] = `Last value ${v.value.toFixed(2)}% (${v.date}) — too old to show as current`; continue; }
      values[iso] = { value: v.value, period: v.frequency === 'daily' ? `${v.date} close` : `${v.date} avg.` }; detail[iso] = v.basis;
    }
    return res.json({ kind: 'numeric', label: '10-year government bond yield', unit: '%', values, detail, sourceIds: [...new Set(Object.values(r.data).map((v) => v.sourceId))], fetchedAt: r.fetchedAt, stale: r.stale,
      note: 'Daily closes for the US, Canada, Japan and the UK; monthly averages elsewhere (ECB for EU members, OECD for others). The same figures appear on the Markets page and country profiles. Higher = costlier government borrowing.' });
  }
  if (layer.startsWith('imf:')) {
    const [, code, yr] = layer.split(':');
    const meta = metricMeta(`imf:${code}`);
    const def = IMF_INDICATORS[code] || (meta ? { label: meta.label, unit: meta.unit || '', short: meta.label } : /^[A-Za-z0-9_]{2,40}$/.test(code) ? { label: code, unit: '', short: code } : null);
    if (!def) return res.status(404).json({ error: 'Unknown IMF indicator' });
    const year = yr || String(new Date().getFullYear());
    const r = await imfIndicator(code);
    const values: Record<string, { value: number; period: string }> = {};
    for (const [iso, ys] of Object.entries(r.data)) if (ys[year] != null) values[iso] = { value: ys[year], period: year };
    const ed = await imfEdition();
    const proj = Number(year) >= new Date().getFullYear();
    return res.json({ kind: 'numeric', label: `${def.label}, ${year} (IMF ${proj ? 'projection' : 'estimate'})`, unit: def.unit, scale: ['NGDP_RPCH', 'GGXCNL_NGDP', 'BCA_NGDPD'].includes(code) ? 'diverging' : 'sequential', values, sourceIds: ['imf-weo'], fetchedAt: r.fetchedAt, stale: r.stale,
      note: `${ed.source || 'IMF World Economic Outlook'}${proj ? ' — a forecast, not an outcome.' : ''}` });
  }
  if (layer.startsWith('trade:')) {
    const [, flow, hs] = layer.split(':');
    if (flow !== 'X' && flow !== 'M') return res.status(404).json({ error: 'Unknown flow' });
    const r = await comtradeProduct(hs, flow);
    const p = productByHs(hs);
    const values: Record<string, { value: number; period: string }> = {};
    for (const [ccn3, v] of Object.entries(r.data.byCcn3)) { const iso = byCcn3.get(ccn3) && getEntity(byCcn3.get(ccn3)!)?.iso3; if (iso) values[iso] = { value: v, period: r.data.year! }; }
    return res.json({ kind: 'numeric', label: `${flow === 'X' ? 'Exports' : 'Imports'} of ${p?.label || `HS ${hs}`} (US$)`, unit: 'USD', values, sourceIds: ['un-comtrade'], fetchedAt: r.fetchedAt, stale: r.stale,
      note: `As reported by each country to UN Comtrade for ${r.data.year || 'the latest year'} (${r.data.reporters} reporters). Countries that have not reported show no data — not zero.` });
  }
  if (layer.startsWith('commodity:')) {
    const c = getEntity(layer);
    if (!c) return res.status(404).json({ error: 'Unknown commodity' });
    const values: Record<string, string> = {}; const detail: Record<string, string> = {};
    for (const r of relsOfType(c.id, 'exports', 'in')) { const iso = countryIso(r.from); if (iso) { values[iso] = 'exporter'; detail[iso] = r.note || ''; } }
    for (const r of relsOfType(c.id, 'produces', 'in')) { const iso = countryIso(r.from); if (iso) { values[iso] = r.rank && r.rank <= 3 ? 'top' : 'producer'; detail[iso] = r.note || ''; } }
    return res.json({ kind: 'categorical', label: `${c.name}: producers & exporters`, categories: [{ key: 'top', label: 'Top-3 producer' }, { key: 'producer', label: 'Other major producer' }, { key: 'exporter', label: 'Major exporter (not a top producer)' }], values, detail, sourceIds: [...new Set(relsOfType(c.id, 'produces', 'in').map((r) => r.sourceId!))] });
  }
  if (layer.startsWith('sanctions:')) {
    const list = layer.slice(10) as ListId | 'ALL';
    if (list !== 'ALL' && !LIST_IDS.includes(list)) return res.status(404).json({ error: 'Unknown sanctions list' });
    const st = sanctionsStatus();
    if (!st) return res.status(503).json({ error: 'The sanctions lists are still loading — try again in a minute.' });
    const failed = LIST_IDS.filter((l) => st.lists[l]?.error);
    if (list !== 'ALL' && failed.includes(list)) return res.status(503).json({ error: `${LISTS[list].name} could not be loaded: ${st.lists[list].error}` });
    if (list === 'ALL' && failed.length === LIST_IDS.length) return res.status(503).json({ error: `No sanctions list could be loaded (${st.lists.US?.error || 'network error'}).` });
    const { values, detail } = sanctionsLayer(list);
    const used = list === 'ALL' ? LIST_IDS.filter((l) => !failed.includes(l)) : [list];
    return res.json({ kind: 'ordinal', label: list === 'ALL' ? 'Sanctions — US, EU, UK and UN lists' : `Sanctions — ${LISTS[list].name}`, categories: SANCTION_TIERS, values, detail, sourceIds: used.map((l) => LISTS[l].sourceId),
      fetchedAt: used.map((l) => st.lists[l]?.fetchedAt).filter(Boolean).sort()[0], stale: used.some((l) => st.lists[l]?.stale),
      note: `Darkest: a programme named after the country (e.g. Russia, Iran, North Korea). Lighter: people, companies and ships on the list${list === 'ALL' ? 's' : ''} whose nationality, citizenship or address is in the country — a connection, not a measure of trade restrictions.${failed.length && list === 'ALL' ? ` Not loaded: ${failed.map((l) => LISTS[l].short).join(', ')}.` : ''}` });
  }
  if (layer.startsWith('tariffs:')) {
    const which = layer.slice(8) as 'us-effective' | 'us-change' | 'us-actions';
    if (!['us-effective', 'us-change', 'us-actions'].includes(which)) return res.status(404).json({ error: 'Unknown tariff layer' });
    const t = tariffLayer(which);
    if (!Object.keys(t.values).length) return res.status(503).json({ error: t.error ? `US tariff data unavailable: ${t.error}` : 'US tariff data is still loading — try again in a minute.' });
    if (which === 'us-actions') return res.json({ kind: 'numeric', label: 'US tariff actions naming each country (12 months)', unit: 'actions', scale: 'sequential', values: t.values, detail: t.detail, sourceIds: ['federal-register'], fetchedAt: t.fetchedAt,
      note: 'Presidential proclamations and executive orders, USTR (Section 301), Commerce (Section 232) and CBP notices in the Federal Register whose title or summary names the country. Actions covering all countries are not counted; anti-dumping and countervailing-duty notices are left out.' });
    return res.json({ kind: 'numeric', label: which === 'us-effective' ? `US tariff actually charged on imports, by country of origin (${'month' in t ? t.month : ''})` : 'US tariff on imports — change from a year earlier', unit: which === 'us-effective' ? '%' : 'pts',
      scale: which === 'us-change' ? 'diverging' : 'sequential', values: t.values, detail: t.detail, sourceIds: ['census-trade'], fetchedAt: t.fetchedAt, stale: 'stale' in t ? t.stale : false,
      note: 'Calculated duties ÷ value of imports for consumption, from the US Census Bureau’s monthly trade data. This is the average rate importers actually declared, after exemptions and trade agreements — usually well below headline rates. Refunds and later court rulings are not reflected.' });
  }
  if (layer.startsWith('web:')) {
    const id = layer.slice(4); const w = webLayer(id);
    if (!w) return res.status(404).json({ error: 'Not found' });
    if (Object.keys(w.values).length < 1) return res.status(503).json({ error: `No connections of ${getEntity(id)?.name || id} that can be placed on the map yet.` });
    return res.json({ kind: 'categorical', label: w.label, categories: w.categories, values: w.values, detail: w.detail, sourceIds: [], focus: id,
      note: 'Each country is shaded by its strongest kind of connection (the first in the legend); hover for all of them. Companies, people and cities are placed in their country.' });
  }
  if (layer.startsWith('tradewith:')) {
    const [, iso3, metric = 'total'] = layer.split(':');
    if (!byIso3.has(iso3) || !['total', 'exports', 'imports', 'balance', 'share'].includes(metric)) return res.status(404).json({ error: 'Unknown trade layer' });
    const t = await tradeWithLayer(iso3, metric as any);
    const name = getEntity(`country:${iso3}`)!.name;
    const label = { total: `Trade with ${name} (exports + imports)`, exports: `${name}’s exports to each country`, imports: `${name}’s imports from each country`, balance: `${name}’s trade balance with each country`, share: `Share of ${name}’s trade` }[metric as 'total'];
    return res.json({ kind: 'numeric', label: `${label}, ${t.year}`, unit: metric === 'share' ? '%' : 'USD', scale: metric === 'balance' ? 'diverging' : 'sequential', values: t.values, detail: t.detail, sourceIds: ['un-comtrade'], fetchedAt: t.fetchedAt, stale: t.stale, focus: `country:${iso3}`,
      note: `Goods trade as reported by ${name} to UN Comtrade for ${t.year}.${metric === 'balance' ? ' Green = surplus with that country, red = deficit.' : ''}${t.unreported > 0 ? ` US$${(t.unreported / 1e9).toFixed(1)} bn is recorded against unspecified areas and is not on the map.` : ''} The partner’s own report can differ — compare both sides on the trade page.` });
  }
  if (layer.startsWith('reserves:')) {
    const which = layer.slice(9);
    if (which === 'gas') {
      const g = await gasLayer();
      if (!Object.keys(g.values).length) return res.status(503).json({ error: g.error || 'Gas storage data unavailable' });
      return res.json({ kind: 'numeric', label: 'Natural-gas storage — % full', unit: '%', scale: 'sequential', values: g.values, detail: g.detail, sourceIds: ['gie-agsi'], fetchedAt: g.fetchedAt, note: 'Working gas in storage as a share of capacity, latest gas day, as reported to Gas Infrastructure Europe. Countries without storage sites show no data.' });
    }
    const r = reservesLayer(which);
    if (!Object.keys(r.values).length) return res.status(503).json({ error: r.error || 'Reserves data unavailable' });
    if (which.startsWith('oil')) return res.json({ kind: 'numeric', label: which === 'oil-days' ? 'Crude-oil stocks — days of refinery intake' : 'Crude-oil stocks (million barrels)', unit: which === 'oil-days' ? 'days' : 'm bbl', scale: 'sequential', values: r.values, detail: r.detail, sourceIds: ['jodi-oil'], fetchedAt: r.fetchedAt, stale: r.stale,
      note: 'Closing crude-oil stocks as reported by each government to JODI (latest month each). Days = stocks ÷ refinery intake. China and several other large holders do not report stocks; strategic and commercial stocks are not separated.' });
    const g = GRAINS[which.replace(/^grain-/, '')];
    return res.json({ kind: 'numeric', label: `${g.label} stocks — ending stocks as % of a year’s use (${'year' in r ? r.year : ''})`, unit: '%', scale: 'sequential', values: r.values, detail: r.detail, sourceIds: ['usda-psd'], fetchedAt: r.fetchedAt, stale: r.stale,
      note: 'USDA’s current projection for the marketing year (revised monthly with the WASDE report). Higher = a larger buffer relative to a year’s consumption; big exporters often run lower ratios than importers.' });
  }
  if (layer === 'alerts') {
    if (!req.userId) return res.status(401).json({ error: 'Sign in to see your alerts on the map' });
    const values: Record<string, { value: number; period: string }> = {}; const detail: Record<string, string> = {};
    for (const [placeId, v] of alertsByPlace(req.userId)) {
      const iso = placeId.startsWith('country:') ? countryIso(placeId) : undefined; if (!iso) continue;
      values[iso] = { value: v.n, period: 'unread' }; detail[iso] = `${v.n} unread · top importance ${v.max}/10 · ${v.titles.join(' · ')}`.slice(0, 400);
    }
    return res.json({ kind: 'numeric', label: 'My unread alerts by country', unit: 'alerts', scale: 'sequential', values, detail, sourceIds: [],
      note: 'Unread alerts from your alert rules, placed by where each change happened (a company’s headquarters, a leader’s country, an election’s place). Open Alerts to read them.' });
  }
  if (layer === 'exposure') {
    if (!req.userId) return res.status(401).json({ error: 'Sign in to see your exposure' });
    const values: Record<string, string> = {}; const detail: Record<string, string[]> = {};
    for (const p of positionsFor(req.userId).filter((p) => p.status === 'open')) {
      const e = getEntity(p.entityId); if (!e) continue;
      for (const r of relsOfType(e.id, 'operates_in', 'out')) { const iso = countryIso(r.to); if (iso) { values[iso] ||= 'ops'; (detail[iso] ||= []).push(e.name); } }
      const hq = e.attrs?.hqCountry && countryIso(e.attrs.hqCountry);
      if (hq) { values[hq] = 'hq'; (detail[hq] ||= []).push(`${e.name} (HQ)`); }
    }
    return res.json({ kind: 'categorical', label: 'My open positions — geographic exposure', categories: [{ key: 'hq', label: 'Headquarters of a holding' }, { key: 'ops', label: 'Operations of a holding' }], values, detail: Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, [...new Set(v)].join(', ')])), sourceIds: ['company-ir'] });
  }
  res.status(404).json({ error: 'Unknown layer' });
}));

// ───────────── Providers ─────────────
api.get('/macro/:iso3', wrap(async (req, res) => {
  const iso3 = req.params.iso3.toUpperCase();
  if (!byIso3.has(iso3)) return res.status(404).json({ error: 'Unknown country' });
  const [series, meta] = await Promise.allSettled([wbCountrySeries(iso3), wbCountryMeta()]);
  res.json({
    indicators: series.status === 'fulfilled' ? series.value.data : [], fetchedAt: series.status === 'fulfilled' ? series.value.fetchedAt : null,
    stale: series.status === 'fulfilled' ? series.value.stale : false, error: series.status === 'rejected' ? String(series.reason?.message || series.reason) : undefined,
    meta: meta.status === 'fulfilled' ? meta.value.data[iso3] || null : null,
  });
}));

// Bilateral trade: every partner of a country, and one pair A ↔ B (registered before /trade/:iso3).
api.get('/trade/products', (_req, res) => res.json(PRODUCTS));
api.get('/trade/partners/:iso3', wrap(async (req, res) => {
  const iso3 = req.params.iso3.toUpperCase();
  if (!byIso3.has(iso3)) return res.status(404).json({ error: 'Unknown country' });
  res.json(await partnersView(iso3));
}));
api.get('/trade/pair', wrap(async (req, res) => {
  const a = String(req.query.a || '').toUpperCase(), b = String(req.query.b || '').toUpperCase();
  if (!byIso3.has(a) || !byIso3.has(b) || a === b) return res.status(400).json({ error: 'Pick two different countries' });
  res.json(await tradePair(a, b));
}));
api.get('/trade/:iso3', wrap(async (req, res) => {
  const e = getEntity(`country:${req.params.iso3.toUpperCase()}`);
  if (!e?.ccn3) return res.status(404).json({ error: 'No trade reporter code for this entity' });
  const flow = req.query.flow === 'M' ? 'M' : 'X';
  const r = await comtradeProfile(e.ccn3, flow);
  res.json({ ...r.data, partners: r.data.partners.map((p) => ({ ...p, entity: stub(byCcn3.get(p.ccn3) || '') || null, areaName: COMTRADE_AREAS[p.ccn3] })), fetchedAt: r.fetchedAt, stale: r.stale });
}));

api.get('/yield-curve/:iso3', wrap(async (req, res) => {
  const iso3 = req.params.iso3.toUpperCase();
  if (!curveAvailable(iso3)) return res.json({ unavailable: true, reason: 'No openly licensed daily government yield curve is connected for this country. Daily curves are loaded for the US, Canada, Japan, the UK and the euro area; other sovereign curves need a licensed market-data feed.' });
  res.json(await yieldCurve(iso3));
}));

// ───────────── Markets, rates, forecasts ─────────────
api.get('/markets/fx', wrap(async (_req, res) => res.json(await fxBoard())));
api.get('/markets/fx/:code', wrap(async (req, res) => {
  const r = await fxFor(req.params.code.toUpperCase(), pickRange(req.query.range));
  if (!r) return res.json({ unavailable: true, reason: 'No quote for this currency against the US dollar.' });
  res.json(r);
}));
api.get('/markets/commodities', wrap(async (_req, res) => res.json(await commodityBoard())));

api.get('/rates/overview', wrap(async (_req, res) => {
  const [pol, ten, ...curves] = await Promise.allSettled([policyRates(), tenYearBoard(), ...['USA', 'EUR', 'GBR', 'JPN', 'CAN'].map((c) => yieldCurve(c))]);
  const names: Record<string, string> = { USA: 'United States', EUR: 'Euro area (AAA)', GBR: 'United Kingdom', JPN: 'Japan', CAN: 'Canada' };
  res.json({
    policy: pol.status === 'fulfilled' ? Object.entries(pol.value.data).map(([iso, v]) => ({ entity: stub(`country:${iso}`), ...v })).filter((x) => x.entity) : [], policyError: pol.status === 'rejected' ? String(pol.reason?.message) : undefined,
    tenYear: ten.status === 'fulfilled' ? Object.entries(ten.value.data).map(([iso, v]) => ({ entity: stub(`country:${iso}`), ...v })).filter((x) => x.entity) : [], tenYearError: ten.status === 'rejected' ? String(ten.reason?.message) : undefined,
    curves: ['USA', 'EUR', 'GBR', 'JPN', 'CAN'].map((k, i) => { const c = curves[i]; return c.status === 'fulfilled' && c.value ? { key: k, label: names[k], ...c.value } : { key: k, label: names[k], unavailable: true, reason: c.status === 'rejected' ? String(c.reason?.message) : 'Unavailable' }; }),
  });
}));

api.get('/rates/:iso3', wrap(async (req, res) => {
  const iso3 = req.params.iso3.toUpperCase();
  if (!byIso3.has(iso3)) return res.status(404).json({ error: 'Unknown country' });
  const [pol, hist, curve, ten, board] = await Promise.allSettled([policyRates(), policyRateHistory(iso3), curveAvailable(iso3) ? yieldCurve(iso3) : Promise.resolve(null), tenYearHistory(iso3), tenYearFor(iso3)]);
  const v = (p: PromiseSettledResult<any>) => (p.status === 'fulfilled' ? p.value : null);
  // Headline 10-year: same rules as the map and Markets page, fetching only this country's sources.
  const tenLatest = v(board) || null;
  res.json({
    policy: v(pol)?.data?.[iso3] || null, policyHistory: v(hist)?.data || null, curve: v(curve), tenYear: v(ten), tenLatest,
    errors: [pol, hist, curve, ten, board].filter((p) => p.status === 'rejected').map((p: any) => String(p.reason?.message)),
    euroArea: EURO_AREA.includes(iso3),
  });
}));

api.get('/forecast/:iso3', wrap(async (req, res) => {
  const iso3 = req.params.iso3.toUpperCase();
  if (!byIso3.has(iso3)) return res.status(404).json({ error: 'Unknown country' });
  const [imf, fed] = await Promise.allSettled([imfCountry(iso3), iso3 === 'USA' ? fedOutlook() : Promise.resolve(null)]);
  res.json({ imf: imf.status === 'fulfilled' ? imf.value : null, imfError: imf.status === 'rejected' ? String(imf.reason?.message) : undefined, fed: fed.status === 'fulfilled' ? fed.value : null });
}));

api.get('/consensus/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.id);
  const sym = e?.type === 'company' ? e.attrs?.quoteSymbol : undefined;
  if (!sym) return res.json({ unavailable: true, reason: e?.attrs?.public === false ? 'Private company — analysts do not publish consensus estimates.' : 'No listed security for this entity.' });
  try { const r = await analystConsensus(sym); res.json({ ...r.data, fetchedAt: r.fetchedAt, stale: r.stale }); }
  catch (err: any) { res.json({ unavailable: true, reason: `Analyst estimates unavailable right now (${err.message}). Nothing is shown rather than a guess.` }); }
}));

api.get('/trade/product/:hs', wrap(async (req, res) => {
  const flow = req.query.flow === 'M' ? 'M' : 'X';
  const r = await comtradeProduct(req.params.hs, flow);
  const rows = Object.entries(r.data.byCcn3).map(([ccn3, value]) => ({ entity: stub(byCcn3.get(ccn3) || ''), ccn3, areaName: COMTRADE_AREAS[ccn3], value })).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, x) => s + x.value, 0);
  res.json({ hs: r.data.hs, product: productByHs(r.data.hs) || null, flow, year: r.data.year, reporters: r.data.reporters, total, rows: rows.slice(0, 25), fetchedAt: r.fetchedAt, stale: r.stale, sourceId: 'un-comtrade' });
}));

const conflictView = (e: Entity) => ({ ...stub(e.id)!, intensity: e.attrs?.intensity, intensityLabel: INTENSITY[e.attrs?.intensity as keyof typeof INTENSITY]?.label, startYear: e.attrs?.startYear, url: e.attrs?.url, yearly: e.attrs?.yearly || [], status: e.attrs?.status,
  locations: relsOfType(e.id, 'affects', 'out').map((r) => stub(r.to)).filter(Boolean) });
api.get('/conflicts', (_req, res) => {
  const list = listByType('event').filter((e) => e.attrs?.category === 'conflict' && e.attrs?.status === 'ongoing').map(conflictView)
    .sort((a: any, b: any) => (INTENSITY[b.intensity as keyof typeof INTENSITY]?.rank || 0) - (INTENSITY[a.intensity as keyof typeof INTENSITY]?.rank || 0) || (b.yearly.at(-1)?.deaths || 0) - (a.yearly.at(-1)?.deaths || 0));
  res.json({ conflicts: list, status: liveStatus.conflicts || null, sourceId: 'wikipedia-conflicts' });
});
api.get('/conflicts/for/:id', (req, res) => {
  res.json(relsOfType(req.params.id, 'affects', 'in').map((r) => getEntity(r.from)!).filter((e) => e?.attrs?.category === 'conflict' && e.attrs?.status === 'ongoing').map(conflictView));
});
api.get('/live/status', (_req, res) => res.json(liveStatus));
// Economic & IGO calendar: data releases, central banks, summits/assemblies/votes, budgets, elections.
api.get('/calendar/econ', (req, res) => {
  const kinds = req.query.kinds ? String(req.query.kinds).split(',').filter(Boolean) : undefined;
  const events = calendarFor({ from: req.query.from ? String(req.query.from) : undefined, to: req.query.to ? String(req.query.to) : undefined, place: req.query.place ? String(req.query.place) : undefined, minImportance: Number(req.query.min) || 1, kinds })
    .filter((e) => req.query.usual !== '0' || e.basis !== 'usual-timing')
    .map((e) => ({ ...e, places: e.placeIds.map((id) => stub(id)).filter(Boolean) }));
  res.json({ events, status: calendarStatus(), now: new Date().toISOString() });
});
api.get('/calendar/econ/places', (_req, res) => res.json(calendarPlaces()));
// ───────────── The knowledge web ─────────────
// Every connection of an entity, grouped and ranked, with sources; its neighborhood as a network.
api.get('/web/:id', (req, res) => {
  const c = connectionsFor(req.params.id, { limitPer: Math.min(400, Number(req.query.limit) || 40) });
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});
api.get('/web/:id/graph', (req, res) => {
  const g = neighborhood(req.params.id, { depth: Number(req.query.depth) === 2 ? 2 : 1, max: Number(req.query.max) || 70, perGroup: Number(req.query.per) || 8, types: req.query.types ? String(req.query.types).split(',').filter(Boolean) : undefined });
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json(g);
});
// Live updates for open pages (Server-Sent Events, server/live.ts).
api.get('/live', liveStream);
api.get('/web-status', (_req, res) => res.json({ connectors: connectorsStatus(), stats: webStats(), catalog: catalogStatus(), weights: weightsStatus() }));
// Run one connector now (signed-in users; e.g. after allowing a host in the network settings).
api.post('/web-status/run/:id', wrap(async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Sign in to run a connector' });
  if (!connectorIds().includes(req.params.id)) return res.status(404).json({ error: 'Unknown connector' });
  res.json(await runConnector(req.params.id));
}));
// Indicator catalog: any World Bank or IMF series as a map layer or chart.
api.get('/catalog/metrics', (req, res) => res.json(searchMetrics(String(req.query.q || ''), { provider: req.query.provider === 'wb' || req.query.provider === 'imf' ? req.query.provider : undefined, limit: Math.min(60, Number(req.query.limit) || 30) })));
api.get('/catalog/metric/:id', (req, res) => { const m = metricMeta(req.params.id); if (!m) return res.status(404).json({ error: 'Not in the catalog (yet)' }); res.json(m); });
api.get('/indicator/:iso3/:code', wrap(async (req, res) => {
  const iso3 = req.params.iso3.toUpperCase(); const code = req.params.code;
  if (!byIso3.has(iso3) && iso3 !== 'EUU' && iso3 !== 'WLD') return res.status(404).json({ error: 'Unknown country' });
  if (code.startsWith('imf:')) {
    const r = await imfIndicator(code.slice(4)); const m = metricMeta(code);
    const ys = r.data[iso3] || {};
    return res.json({ code, label: m?.label || code.slice(4), unit: m?.unit || '', series: Object.entries(ys).map(([period, value]) => ({ period, value })).sort((a, b) => a.period.localeCompare(b.period)), sourceId: 'imf-weo', fetchedAt: r.fetchedAt, description: m?.description });
  }
  const c = code.replace(/^wb:/, '');
  const r = await wbCountrySeries(iso3, [c]); const ind = r.data[0]; const m = metricMeta(`wb:${c}`);
  res.json({ code: `wb:${c}`, label: ind?.label || m?.label || c, unit: ind?.unit || m?.unit || '', series: ind?.series || [], sourceId: 'world-bank-wdi', fetchedAt: r.fetchedAt, description: m?.description });
}));
// Sanctions against a country (and those a country or organisation imposes), and possible matches for a person or company.
api.get('/sanctions/place/:id', (req, res) => {
  const e = getEntity(req.params.id); if (!e) return res.status(404).json({ error: 'Not found' });
  const cs = e.type === 'country' && e.iso3 ? sanctionsFor(e.iso3) : null;
  const imposes = LIST_OF_IMPOSER[e.id];
  res.json({
    lists: sanctionsMeta(), status: sanctionsStatus(),
    target: cs ? { listings: cs.listings, byType: cs.byType, programmes: cs.programmes.slice(0, 40), recent: cs.recent.slice(0, 25) } : null,
    imposes: imposes ? { list: imposes, name: LISTS[imposes].name, authority: LISTS[imposes].authority, search: LISTS[imposes].search, sourceId: LISTS[imposes].sourceId, regimes: regimesOf(imposes).slice(0, 80) } : null,
  });
});
// Government budget: IMF general government, World Bank central government, Eurostat spending by function, US live figures.
api.get('/budget/place/:id', wrap(async (req, res) => {
  const b = await budgetFor(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  res.json(b);
}));
// Reserves and stocks: oil (JODI, EIA), grain (USDA), gas storage (AGSI+), how strategic oil reserves are held.
api.get('/reserves/place/:id', wrap(async (req, res) => {
  const r = await reservesFor(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
}));
api.get('/reserves/commodity/:id', (req, res) => res.json(stocksForCommodity(req.params.id)));
api.get('/sanctions/entity/:id', (req, res) => res.json({ matches: listingsFor(req.params.id), status: sanctionsStatus() }));
api.get('/tariffs/place/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.id); if (!e) return res.status(404).json({ error: 'Not found' });
  // Each country's own applied tariffs (World Bank); the EU's common external tariff is the EUU aggregate.
  const code = e.type === 'country' ? e.iso3 : e.id === 'igo:eu' ? 'EUU' : undefined;
  let wb: any = null;
  if (code) { try { const r = await wbCountrySeries(code, TARIFF_INDICATORS); wb = { indicators: r.data.filter((i) => i.latest), fetchedAt: r.fetchedAt, stale: r.stale }; } catch (err: any) { wb = { error: err.message }; } }
  res.json({ ...tariffsFor(e.id), wb, status: tariffsStatus() });
}));
// What changed recently for an entity (profiles), or across everything (?entity omitted).
api.get('/changes', (req, res) => {
  const ids = String(req.query.entity || '').split(',').filter((x) => getEntity(x));
  const o = { since: req.query.since ? String(req.query.since) : undefined, limit: Math.min(100, Number(req.query.limit) || 20), minImportance: Number(req.query.min) || 1 };
  const list = ids.length ? changesFor(ids, o) : recentChanges({ ...o, kinds: req.query.kind ? String(req.query.kind).split(',') : undefined });
  res.json({ changes: list.map((c) => ({ ...c, icon: CHANGE_KINDS[c.kind]?.icon, kindLabel: CHANGE_KINDS[c.kind]?.label, entities: c.entityIds.map((id) => stub(id)).filter(Boolean).slice(0, 6) })), kinds: CHANGE_KINDS });
});

// ───────────── Elections: results, candidates, policies, prediction markets ─────────────
const isElectionEv = (e: Entity) => e.type === 'event' && e.attrs?.category === 'election';
const electionPlace = (e: Entity) => relsOfType(e.id, 'affects', 'out').map((r) => getEntity(r.to)).filter((x): x is Entity => !!x && ['city', 'state', 'country'].includes(x.type))
  .sort((a, b) => ['city', 'state', 'country'].indexOf(a.type) - ['city', 'state', 'country'].indexOf(b.type))[0];
const surnameOf = (n?: string) => normName(String(n || '').replace(/\s*\(.*\)$/, '')).split(' ').filter((w) => w.length > 2).at(-1);
/** Does the news-reported winner agree with the result in the election article? */
function newsCheck(e: Entity) {
  const article = e.attrs?.election?.winner?.name; const news = e.attrs?.reportedOutcome;
  if (!news) return null;
  if (!article) return { news: news.winner, publishers: news.publishers, agrees: null };
  return { news: news.winner, publishers: news.publishers, agrees: surnameOf(article) === surnameOf(news.winner) };
}
let marketMemo: { at: number; key: string; rows: Map<string, ReturnType<typeof marketsForElection>> } | null = null;
async function electionMarkets() {
  const r = await allMarkets();
  const key = Object.values(r.status).map((s) => s.fetchedAt || s.error).join('|');
  if (!marketMemo || marketMemo.key !== key || Date.now() - marketMemo.at > 300_000) { if (marketMemo?.key !== key) clearMarketTags(); marketMemo = { at: Date.now(), key, rows: new Map() }; }
  const memo = marketMemo;
  return { status: r.status, forElection: (e: Entity) => { let v = memo.rows.get(e.id); if (!v) { v = marketsForElection(e, r.markets); memo.rows.set(e.id, v); } return v; } };
}
function electionRow(e: Entity, mk?: Awaited<ReturnType<typeof electionMarkets>>) {
  const place = electionPlace(e); const el = e.attrs?.election;
  let c: Entity | undefined = place; while (c && c.type !== 'country') c = c.parentId ? getEntity(c.parentId) : undefined;
  const m = mk?.forElection(e);
  const fav = m?.candidates[0];
  const lead = el?.contenders?.find((x: any) => x.pct != null || x.seats != null);
  return {
    ...stub(e.id)!, date: e.attrs?.date, endDate: e.attrs?.endDate, status: e.attrs?.status, scope: e.attrs?.scope || 'national', office: e.attrs?.office || el?.title,
    place: place ? stub(place.id) : null, country: c ? stub(c.id) : null, winner: el?.winner || null, leading: el?.status === 'counting' && lead ? { name: lead.name || lead.party, pct: lead.pct, seats: lead.seats } : null,
    contenders: (el?.contenders || []).length, hasArticle: !!el, legislative: !!el?.legislative,
    favourite: fav ? { name: fav.name, probability: fav.combined, platforms: fav.platforms } : null, markets: m?.markets.length || 0, newsCheck: newsCheck(e),
  };
}
api.get('/elections', wrap(async (req, res) => {
  const when = String(req.query.when || 'upcoming'); const scope = String(req.query.scope || 'all'); const q = normName(String(req.query.q || ''));
  const t = today(); const ahead = new Date(Date.now() + 400 * 86400_000).toISOString().slice(0, 10); const back = new Date(Date.now() - 150 * 86400_000).toISOString().slice(0, 10);
  let list = listByType('event').filter(isElectionEv).filter((e) => {
    const end = String(e.attrs?.endDate || e.attrs?.date || ''); const start = String(e.attrs?.date || '');
    if (when === 'upcoming' ? !(end >= t && start <= ahead) : when === 'recent' ? !(end < t && end >= back) : !(end >= back && start <= ahead)) return false;
    const sc = e.attrs?.scope || 'national';
    return scope === 'all' || (scope === 'local' ? sc !== 'national' : sc === scope);
  });
  let mk: Awaited<ReturnType<typeof electionMarkets>> | undefined; let marketError: string | undefined;
  try { mk = await electionMarkets(); } catch (e: any) { marketError = e.message; }
  let rows = list.map((e) => electionRow(e, mk));
  if (q) rows = rows.filter((r) => normName(`${r.name} ${r.place?.name || ''} ${r.country?.name || ''}`).includes(q));
  rows.sort((a, b) => (when === 'recent' ? String(b.endDate || b.date).localeCompare(String(a.endDate || a.date)) : String(a.date).localeCompare(String(b.date))));
  res.json({ rows, marketStatus: mk?.status || null, marketError, details: electionDetailsStatus(), sourceIds: ['wikipedia-elections', 'wikipedia-election-results', 'polymarket', 'kalshi'] });
}));
api.get('/elections/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.id);
  if (!e || !isElectionEv(e)) return res.status(404).json({ error: 'Not an election' });
  const [cand, mk] = await Promise.allSettled([electionCandidates(e.id), electionMarkets()]);
  const markets = mk.status === 'fulfilled' ? mk.value.forElection(e) : { markets: [], candidates: [] };
  const c: any = cand.status === 'fulfilled' ? cand.value : { unavailable: true, reason: String((cand as PromiseRejectedResult).reason?.message) };
  // Attach each candidate's market-implied probability.
  for (const row of c?.candidates || []) {
    const hit = markets.candidates.find((m) => (row.personId && m.personId === row.personId) || (surnameOf(row.name) && surnameOf(m.name) === surnameOf(row.name)) || (!row.name && row.party && normName(m.name) === normName(row.party)));
    if (hit) row.market = { probability: hit.combined, prices: hit.prices };
  }
  res.json({ ...electionRow(e, mk.status === 'fulfilled' ? mk.value : undefined), details: c, markets: markets.markets, marketCandidates: markets.candidates, marketStatus: mk.status === 'fulfilled' ? mk.value.status : null,
    platforms: PLATFORM, newsCheck: newsCheck(e) });
}));

// ───────────── Provenance & data quality ─────────────
const PROVIDER_LABELS: Record<string, { label: string; sourceId?: string }> = {
  wb: { label: 'World Bank WDI', sourceId: 'world-bank-wdi' }, comtrade: { label: 'UN Comtrade', sourceId: 'un-comtrade' }, treasury: { label: 'US Treasury yield curve', sourceId: 'us-treasury' },
  yahoo: { label: 'Yahoo Finance quotes', sourceId: 'yahoo-finance' }, spark: { label: 'Yahoo Finance boards (FX, commodities)', sourceId: 'yahoo-finance' }, consensus: { label: 'Yahoo Finance analyst consensus', sourceId: 'yahoo-finance' },
  sec: { label: 'SEC EDGAR', sourceId: 'sec-edgar' }, gnews: { label: 'Google News search', sourceId: 'google-news' }, gdelt: { label: 'GDELT news index', sourceId: 'gdelt' },
  congress: { label: 'Congress legislators', sourceId: 'congress-legislators' }, wd: { label: 'Wikidata (leaders, organizations, companies, cities)', sourceId: 'wikidata' }, catalog: { label: 'Indicator catalogs (World Bank, IMF)', sourceId: 'world-bank-wdi' }, wp: { label: 'Wikipedia conflicts & elections', sourceId: 'wikipedia-conflicts' },
  bis: { label: 'BIS policy rates', sourceId: 'bis-policy' }, fred: { label: 'FRED (OECD yields, FOMC projections)', sourceId: 'oecd-mei' }, oecd: { label: 'OECD 10-year yields', sourceId: 'oecd-mei' },
  curve: { label: 'Government yield curves (ECB, BoE, MOF, BoC)', sourceId: 'ecb-yield-curve' }, imf: { label: 'IMF World Economic Outlook', sourceId: 'imf-weo' },
  sanctions: { label: 'Sanctions lists (OFAC, EU, UK, UN)', sourceId: 'ofac-sdn' }, tariffs: { label: 'US tariffs (Federal Register, Census)', sourceId: 'federal-register' }, econ: { label: 'Release calendars (BLS, FRED)', sourceId: 'bls-schedule' },
  budget: { label: 'US Treasury Fiscal Data', sourceId: 'us-treasury-fiscal' }, reserves: { label: 'Reserves (JODI oil, USDA grain, EIA, AGSI+)', sourceId: 'jodi-oil' }, eurostat: { label: 'Eurostat (spending by function)', sourceId: 'eurostat-cofog' },
};
/** ok = last fetch worked; stale = last fetch failed and an older copy was served; failing = failed with no copy. */
function providerRows() {
  return providerHealth().map((h) => {
    const failingNow = !!h.lastErrorAt && (!h.lastOk || h.lastErrorAt > h.lastOk);
    const state = !failingNow ? 'ok' : h.lastStaleAt && h.lastStaleAt >= h.lastErrorAt! ? 'stale' : 'failing';
    return { ...h, ...(PROVIDER_LABELS[h.provider] || { label: h.provider }), state };
  }).sort((a, b) => a.label.localeCompare(b.label));
}
api.get('/provenance/status', (_req, res) => {
  res.json({ providers: providerRows(), live: liveStatus, news: newsStatus(), calendar: calendarStatus(), sanctions: sanctionsStatus(), tariffs: tariffsStatus(), reserves: reservesStatus(), web: { connectors: connectorsStatus(), stats: webStats(), catalog: catalogStatus(), weights: weightsStatus() }, net: hostHealth(), stream: streamStatus(), agreement: agreementStatus(), coverage: coverage(), generatedAt: new Date().toISOString() });
});
// World Bank vs IMF: the summary (Data page) and one country (profile).
api.get('/quality/agreement', (_req, res) => res.json(agreementSummary() || { ready: false }));
api.get('/quality/agreement/:iso3', (req, res) => {
  const iso = String(req.params.iso3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso)) return res.status(400).json({ error: 'Use a three-letter country code' });
  res.json(agreementFor(iso) || { ready: false });
});
api.get('/net/hosts', (_req, res) => res.json(hostHealth()));
api.get('/quality/report', (req, res) => {
  const issues = audit();
  const sev = String(req.query.severity || ''); const cat = String(req.query.category || '');
  const list = issues.filter((i) => (!sev || i.severity === sev) && (!cat || i.category === cat));
  res.json({ summary: summarize(issues), categories: CATEGORY_LABEL, issues: list.slice(0, Number(req.query.limit) || 500), total: list.length, generatedAt: new Date().toISOString() });
});
api.get('/quality/entity/:id', (req, res) => {
  const p = entityProvenance(req.params.id);
  if (!p) return res.status(404).json({ error: 'Entity not found' });
  res.json(p);
});
api.get('/news-sources', (_req, res) => res.json({ tiers: TIER_INFO, publishers: PUBLISHERS, feeds: FEEDS.map((f) => ({ id: f.id, name: f.name, topic: f.topic, kind: f.kind })) }));

api.get('/quote/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.id);
  const sym = e?.attrs?.quoteSymbol;
  if (!sym) return res.status(404).json({ error: 'No listed security or price feed for this entity' });
  res.json(await getQuote(sym, pickRange(req.query.range)));
}));

api.get('/dividends/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.id);
  const sym = e?.attrs?.quoteSymbol;
  const since = String(req.query.since || '');
  if (!sym || !/^\d{4}-\d{2}-\d{2}$/.test(since)) return res.status(400).json({ error: 'Need a listed security and a since=YYYY-MM-DD date' });
  res.json({ symbol: sym, since, dividends: await getDividends(sym, since), sourceId: 'yahoo-finance' });
}));

api.get('/fundamentals/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.id);
  const t = e?.attrs?.secTicker;
  if (!t) return res.json({ unavailable: true, reason: e?.attrs?.public ? 'This company does not file XBRL financial statements with the SEC. Connect a licensed fundamentals provider for non-US filers.' : 'Private company — no public filings.' });
  const f = await secFundamentals(t);
  if (!f) return res.json({ unavailable: true, reason: `Ticker ${t} not found in SEC EDGAR.` });
  const latest = (k: string) => f.metrics[k]?.values.at(-1);
  const derived: Record<string, any> = {};
  const rev = latest('revenue'), ni = latest('netIncome'), oi = latest('operatingIncome'), ocf = latest('operatingCashFlow'), capex = latest('capex'), dna = latest('dna'), cash = latest('cash'), debt = latest('debt');
  if (rev && ni && rev.end === ni.end) derived.netMargin = { value: ni.value / rev.value * 100, unit: '%', period: `FY ending ${rev.end}` };
  if (rev && oi && rev.end === oi.end) derived.operatingMargin = { value: oi.value / rev.value * 100, unit: '%', period: `FY ending ${rev.end}` };
  if (oi && dna && oi.end === dna.end) derived.ebitda = { value: oi.value + dna.value, unit: f.metrics.operatingIncome.unit, period: `FY ending ${oi.end}`, note: 'Derived: operating income + depreciation & amortization' };
  if (ocf && capex && ocf.end === capex.end) derived.freeCashFlow = { value: ocf.value - capex.value, unit: f.metrics.operatingCashFlow.unit, period: `FY ending ${ocf.end}`, note: 'Derived: operating cash flow − capital expenditure' };
  const usPrimary = e!.attrs?.quoteSymbol === t && e!.attrs?.hqCountry === 'country:USA';
  if (usPrimary && f.sharesOutstanding) {
    try {
      const q = await getQuote(e!.attrs!.quoteSymbol, '1y');
      const mcap = q.price * f.sharesOutstanding.value;
      derived.marketCap = { value: mcap, unit: 'USD', period: `price ${q.marketTime.slice(0, 10)} × shares as of ${f.sharesOutstanding.asOf}`, note: 'Derived: delayed price × shares outstanding (cover page of latest filing)' };
      if (ni && ni.value > 0) derived.peTrailingFY = { value: mcap / ni.value, unit: 'x', period: `on FY ending ${ni.end}`, note: 'Market cap ÷ last fiscal-year net income' };
      if (cash && debt) derived.enterpriseValue = { value: mcap + debt.value - cash.value, unit: 'USD', note: 'Approximate: market cap + long-term debt − cash & equivalents' };
      if (rev) derived.evToSales = derived.enterpriseValue ? { value: derived.enterpriseValue.value / rev.value, unit: 'x', note: 'EV ÷ last fiscal-year revenue' } : undefined;
    } catch { /* price unavailable: leave valuation blank rather than guess */ }
  }
  res.json({ ...f, derived });
}));

api.get('/news/latest', (req, res) => {
  res.json({ stories: latestStories({ topic: String(req.query.topic || 'all'), entityId: req.query.entity ? String(req.query.entity) : undefined, type: req.query.type ? String(req.query.type) : undefined,
    trustedOnly: req.query.trusted !== '0', minCorroboration: Number(req.query.min) || 0, q: req.query.q ? String(req.query.q).slice(0, 100) : undefined, hours: Math.min(336, Number(req.query.hours) || 72), limit: Math.min(300, Number(req.query.limit) || 120) }),
    status: newsStatus(), sourceId: 'trusted-news' });
});
api.get('/news/signals', (_req, res) => res.json({ signals: allSignals(), sourceId: 'trusted-news' }));

api.get('/news/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.id);
  if (!e) return res.status(404).json({ error: 'Unknown entity' });
  let q = e.name.replace(/,?\s+(Inc\.|Incorporated|Corporation|Corp\.|plc|p\.l\.c\.|SE|AG|GmbH|Co\.|Group|N\.V\.)$/i, '').replace(/\s*\(.*\)$/, '');
  if (e.type === 'commodity' && e.attrs?.kind !== 'service') q = e.name.replace(/ \(.*\)/, '');
  if (e.type === 'state') q = `${e.name}`;
  const topic = String(req.query.topic || 'all');
  // 1) Headlines from the trusted feeds that name this entity (already tagged and clustered).
  const feed = topic === 'all' ? newsFor(e.id) : [];
  // 2) A live search, so entities the feeds rarely mention still get coverage. Every result is
  //    labelled with its outlet's tier, and duplicates of feed stories are merged, not repeated.
  let search: any = null; let searchError: string | undefined;
  try { search = await getNews(q, topic); } catch (err: any) { searchError = /limit requests/i.test(err.message) ? 'The GDELT news index is rate-limiting requests right now.' : `Search provider unavailable: ${err.message}`; }
  const items: any[] = [...feed];
  const seenUrl = new Set(feed.map((a) => canonicalUrl(a.url)));
  const keys = feed.map((a) => ({ key: titleKey(a.title), item: a }));
  for (const a of search?.data || []) {
    if (seenUrl.has(canonicalUrl(a.url))) continue;
    const pub = publisherForDomain(a.domain) || publisherForName(a.publisher);
    const tier = pub?.tier || tierForDomain(a.domain);
    const k = titleKey(a.title);
    const dup = keys.find((x) => sameStory(k, x.key));
    if (dup) {
      // Same story from another outlet: count it as corroboration on the existing row.
      const it = dup.item;
      if (!it.alsoReportedBy.some((p: any) => p.name === (pub?.name || a.publisher))) { it.alsoReportedBy.push({ name: pub?.name || a.publisher || a.domain, tier, url: a.url }); if (isTrusted(tier)) it.corroboration++; }
      continue;
    }
    const item = { id: canonicalUrl(a.url), title: a.title, url: a.url, publisher: pub?.name || a.publisher || a.domain, domain: a.domain, tier, date: a.date, origin: 'search' as const, corroboration: isTrusted(tier) ? 1 : 0, alsoReportedBy: [] as any[] };
    items.push(item); keys.push({ key: k, item });
  }
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const byTier: Record<string, number> = {};
  for (const it of items) byTier[it.tier] = (byTier[it.tier] || 0) + 1;
  if (!items.length && searchError) return res.json({ query: q, articles: [], unavailable: true, reason: searchError });
  res.json({ query: q, articles: items.slice(0, 40), byTier, feedCount: feed.length, fetchedAt: search?.fetchedAt || newsStatus().lastRun?.at, stale: !!search?.stale, sourceId: search?.sourceId, sourceIds: [...(feed.length ? ['trusted-news'] : []), ...(search ? [search.sourceId] : [])], searchError });
}));

api.get('/rankings/:code', wrap(async (req, res) => {
  const r = await wbIndicatorAll(req.params.code);
  const rows = Object.entries(r.data.values).filter(([iso]) => byIso3.has(iso)).map(([iso, v]) => ({ entity: stub(byIso3.get(iso)!), ...v }))
    .sort((a, b) => b.value - a.value).slice(0, Number(req.query.limit) || 10);
  res.json({ code: r.data.code, label: r.data.label, unit: r.data.unit, rows, sourceId: 'world-bank-wdi', fetchedAt: r.fetchedAt });
}));

api.get('/stats', (_req, res) => {
  const counts: Record<string, number> = {};
  for (const e of entities.values()) counts[e.type] = (counts[e.type] || 0) + 1;
  res.json({ entities: entities.size, relationships: allRels().length, byType: counts });
});

registerObsidianRoutes(priv);
registerAlertRoutes(priv);
api.use(priv);
app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ───────────── Front end ─────────────
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve('dist');
  // Built files have content hashes in their names: cache them for a year. index.html must
  // always be revalidated so a new build is picked up immediately.
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '365d', index: false }));
  app.use(express.static(dist, { index: false, maxAge: 0 }));
  app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')); });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(PORT, HOST, () => console.log(`Global Intelligence Terminal → http://localhost:${PORT}${HOST === '127.0.0.1' || HOST === 'localhost' ? ' (this computer only)' : ` — listening on ${HOST}: see SECURITY.md`}`));
startLiveData();
startNews();
startElectionDetails();
startMarketWatch();
startCalendar();
startSanctions();
startTariffs();
startBudgets();
startReserves();
startConnectors();
// Warm the caches behind the first screens people open (default map layer, map previews, rates),
// a few seconds after start-up and at low concurrency, so the first visit does not wait on providers.
setTimeout(() => {
  const jobs: (() => Promise<unknown>)[] = [
    ...PREVIEW_CODES.map((c) => () => wbIndicatorAll(c)), () => wbIndicatorAll('NY.GDP.PCAP.CD'), () => wbCountryMeta(), () => policyRates(), () => tenYearBoard(), () => fxBoard(), () => commodityBoard(),
  ];
  let i = 0;
  const worker = async () => { while (i < jobs.length) { const job = jobs[i++]; await job().catch(() => {}); } };
  void Promise.all([worker(), worker(), worker()]).then(() => console.log('[warm] caches ready'));
}, 4000).unref();
// When live leaders/conflicts change, re-tag headlines and re-check news signals against them.
onLiveRefresh(() => retagAll());
// Tell open pages when data changes; modules with their own refresh loops publish too.
onGraphChange(() => publish('graph'));
onConnectorRun((id) => publish(`connector:${id}`));
onLiveRefresh(() => publish('live-data'));
onChange(() => publish('changes'));
// Data discrepancies become (low-importance) changes, so a rule can watch for them. World Bank vs
// IMF conflicts post their own, once per country, figure and year (agreement.ts).
onLiveRefresh(() => {
  const h = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
  emitNew('audit', audit(true).filter((i) => i.severity !== 'info' && i.entityId && i.category !== 'source-figures-conflict').map((i): Change => ({
    key: `audit:${i.category}:${i.entityId}:${h(i.message)}`, kind: 'data', entityIds: [i.entityId!, ...(i.relatedIds || [])], title: `${i.entityName || i.entityId}: ${i.message}`.slice(0, 300),
    detail: CATEGORY_LABEL[i.category] || i.category, sourceId: 'terminal-audit', quality: 'estimate', importance: i.severity === 'error' ? 4 : 3, at: new Date().toISOString(),
  })));
});
void fs;

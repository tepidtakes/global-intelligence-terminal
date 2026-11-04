import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { sessionMiddleware, register, login, logout, type AuthedRequest } from './auth.js';
import {
  entities, sources, getEntity, stub, children, relationshipsFor, relsOfType, allRels, search, listByType, byCcn3, byIso3, connectionPath,
} from './graph.js';
import { priv, searchNotes, openPositionMap, noteCountsFor, recentNotesFor, catalystsFor, positionsFor } from './private.js';
import { registerObsidianRoutes } from './obsidian.js';
import {
  WB_INDICATORS, COMTRADE_AREAS, wbIndicatorAll, wbCountrySeries, wbCountryMeta, comtradeProfile, comtradeProduct, getQuote, getDividends, secFundamentals, getNews,
} from './providers.js';
import {
  fxBoard, fxFor, commodityBoard, policyRates, policyRateHistory, tenYearYields, tenYearHistory, yieldCurve, curveAvailable, imfIndicator, imfCountry, imfEdition, IMF_INDICATORS,
  fedOutlook, analystConsensus, spark, windowChanges, currencyUsers, EURO_AREA, isStale,
} from './markets.js';
import { startLiveData, liveStatus } from './augment.js';
import { INTENSITY } from './worldEvents.js';
import { PRODUCTS, productByHs } from '../shared/products.js';
import { HOST, PORT } from './config.js';
import type { Entity } from '../shared/types.js';

const QUOTE_RANGES = new Set(['1mo', '6mo', '1y', '5y', 'max']);
const pickRange = (r: unknown) => (QUOTE_RANGES.has(String(r)) ? String(r) : '1y');

const app = express();
app.disable('x-powered-by');
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
    .map((e) => ({ ...stub(e.id)!, date: e.attrs?.date, endDate: e.attrs?.endDate, category: e.attrs?.category, status: e.attrs?.status }))
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
    })).map((c) => ({ ...stub(c.id), attrs: { public: c.attrs?.public, exchange: c.attrs?.exchange, quoteSymbol: c.attrs?.quoteSymbol }, industries: relsOfType(c.id, 'in_industry', 'out').map((r) => stub(r.to)) }));
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
    events: upcomingEventsFor(e.id), sources: sourcesUsed(e, rels), user,
  });
});

const GEO_TYPES = new Set(['country', 'state', 'county', 'city', 'region']);
/** Where on the map a non-geographic entity "lives" (company HQ, leader's country, …). */
function geoAnchor(id: string): string | null {
  const e = getEntity(id);
  if (!e) return null;
  if (GEO_TYPES.has(e.type)) return e.id;
  const order: [string, 'out' | 'in'][] = [['headquartered_in', 'out'], ['head_of_government', 'out'], ['head_of_state', 'out'], ['holds_office', 'out'], ['leads', 'out'], ['party_in', 'out'], ['affects', 'out']];
  for (const [t, d] of order) {
    for (const r of relsOfType(id, t as any, d)) {
      const target = getEntity(d === 'out' ? r.to : r.from);
      if (target && GEO_TYPES.has(target.type)) return target.id;
      if (target && (target.type === 'party' || target.type === 'company') && t === 'leads') { const a = geoAnchor(target.id); if (a) return a; }
    }
  }
  if (e.attrs?.hq) return e.attrs.hq;
  return null;
}

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
  res.json(listByType(type).map((e) => ({ ...stub(e.id)!, attrs: type === 'event' || type === 'city' || type === 'company' || type === 'commodity' ? e.attrs : undefined, coords: e.coords })).sort((a, b) => a.name.localeCompare(b.name)));
});

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

api.get('/map/layer/:layer', wrap(async (req, res) => {
  const layer = req.params.layer;
  const year = req.query.year ? String(req.query.year) : undefined;
  const countryIso = (id: string) => getEntity(id)?.iso3;

  if (layer.startsWith('wb:')) {
    const code = layer.slice(3);
    const r = await wbIndicatorAll(code, year);
    const values: Record<string, { value: number; period: string }> = {};
    for (const [iso, v] of Object.entries(r.data.values)) if (byIso3.has(iso)) values[iso] = v;
    return res.json({ kind: 'numeric', label: r.data.label, unit: r.data.unit, scale: DIVERGING.has(code) ? 'diverging' : 'sequential', values, sourceIds: ['world-bank-wdi'], lastUpdated: r.data.lastUpdated, fetchedAt: r.fetchedAt, stale: r.stale });
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
    for (const e of listByType('country')) if (e.attrs?.govGroup && e.iso3) { values[e.iso3] = e.attrs.govGroup; detail[e.iso3] = e.attrs.govType; }
    return res.json({ kind: 'categorical', label: 'Government type', categories: groups, values, detail, sourceIds: ['world-countries'], note: `Curated for ${Object.keys(values).length} countries so far; others show as not yet classified.` });
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
      for (const r of relsOfType(e.id, 'affects', 'out')) { const iso = getEntity(r.to)?.type === 'country' ? countryIso(r.to) : undefined; if (iso) { values[iso] = key; detail[iso] = `${e.name} (${e.attrs?.date})`; } }
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
    for (const [iso, v] of Object.entries(r.data)) { values[iso] = { value: v.value, period: v.date }; detail[iso] = v.bank; }
    return res.json({ kind: 'numeric', label: 'Central-bank policy rate', unit: '%', values, detail, sourceIds: ['bis-policy'], fetchedAt: r.fetchedAt, stale: r.stale, note: 'Euro-area members share the ECB deposit facility rate. About 40 central banks report to the BIS; others show no data.' });
  }
  if (layer === 'bond10y') {
    const r = await tenYearYields();
    return res.json({ kind: 'numeric', label: '10-year government bond yield', unit: '%', values: r.data, sourceIds: ['oecd-mei'], fetchedAt: r.fetchedAt, stale: r.stale, note: 'Monthly averages published by the OECD (mostly OECD members). Higher = costlier government borrowing.' });
  }
  if (layer.startsWith('imf:')) {
    const [, code, yr] = layer.split(':');
    const def = IMF_INDICATORS[code]; if (!def) return res.status(404).json({ error: 'Unknown IMF indicator' });
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
  const [pol, ten, ...curves] = await Promise.allSettled([policyRates(), tenYearYields(), ...['USA', 'EUR', 'GBR', 'JPN', 'CAN'].map((c) => yieldCurve(c))]);
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
  const [pol, hist, curve, ten] = await Promise.allSettled([policyRates(), policyRateHistory(iso3), curveAvailable(iso3) ? yieldCurve(iso3) : Promise.resolve(null), tenYearHistory(iso3)]);
  const v = (p: PromiseSettledResult<any>) => (p.status === 'fulfilled' ? p.value : null);
  res.json({
    policy: v(pol)?.data?.[iso3] || null, policyHistory: v(hist)?.data || null, curve: v(curve), tenYear: v(ten),
    errors: [pol, hist, curve, ten].filter((p) => p.status === 'rejected').map((p: any) => String(p.reason?.message)),
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

api.get('/trade/products', (_req, res) => res.json(PRODUCTS));
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

api.get('/news/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.id);
  if (!e) return res.status(404).json({ error: 'Unknown entity' });
  let q = e.name.replace(/,?\s+(Inc\.|Incorporated|Corporation|Corp\.|plc|p\.l\.c\.|SE|AG|GmbH|Co\.|Group|N\.V\.)$/i, '').replace(/\s*\(.*\)$/, '');
  if (e.type === 'commodity' && e.attrs?.kind !== 'service') q = e.name.replace(/ \(.*\)/, '');
  if (e.type === 'state') q = `${e.name}`;
  try {
    const r = await getNews(q, String(req.query.topic || 'all'));
    res.json({ query: q, articles: r.data, fetchedAt: r.fetchedAt, stale: r.stale, sourceId: r.sourceId });
  } catch (err: any) {
    res.json({ query: q, articles: [], unavailable: true, reason: /limit requests/i.test(err.message) ? 'The GDELT news index is rate-limiting requests right now. Try again in a minute.' : `News provider unavailable: ${err.message}` });
  }
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
api.use(priv);
app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ───────────── Front end ─────────────
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve('dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(PORT, HOST, () => console.log(`Global Intelligence Terminal → http://localhost:${PORT}${HOST === '127.0.0.1' || HOST === 'localhost' ? ' (this computer only)' : ` — listening on ${HOST}: see SECURITY.md`}`));
startLiveData();
void fs;

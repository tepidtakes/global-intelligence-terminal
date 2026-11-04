// Trusted newsroom: pulls headlines from publishers' own RSS feeds (and wire-service
// headlines via Google News site searches) every 30 minutes, de-duplicates them into
// stories, counts how many independent outlets carry each story, and tags every headline
// with the countries, companies, people, organisations and commodities it mentions.
//
// Two things are derived from the store:
//   • per-entity news, ranked by outlet tier and corroboration (profiles, map, newsroom page)
//   • "signals": leadership changes and election results stated in trusted headlines. They are
//     compared with the graph. A signal reported by two or more independent trusted outlets
//     (or by an official source) is shown on the profile as a "reported" fact and flags the
//     record it contradicts. It never deletes or rewrites a curated record.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { DATA_DIR } from './db.js';
import { fetchText } from './cache.js';
import { entities, getEntity, relsOfType, normName, stub } from './graph.js';
import {
  parseFeed, canonicalUrl, stripPublisherSuffix, titleKey, sameStory, Tagger, extractSignals, roleLabel,
  type TermSpec, type Tag, type SignalKind, type RoleClass,
} from './newsParse.js';
import { publisherById, publisherForDomain, publisherForName, tierForDomain, TIER_INFO, isTrusted, cleanDomain, type PublisherTier } from '../shared/newsSources.js';
import type { Entity, Fact } from '../shared/types.js';

const require = createRequire(import.meta.url);
const worldCountries: any[] = require('world-countries');

// ───────────────────────── Feeds ─────────────────────────
export type FeedTopic = 'world' | 'business' | 'official';
export interface FeedDef { id: string; name: string; url: string; topic: FeedTopic; publisherId?: string; kind: 'publisher' | 'search'; }
const gn = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
export const FEEDS: FeedDef[] = [
  // Wire services and paywalled papers publish no open feed: their headlines come via a Google News site search.
  { id: 'reuters-wire', name: 'Reuters (via Google News)', url: gn('site:reuters.com when:1d'), topic: 'world', kind: 'search' },
  { id: 'ap-wire', name: 'Associated Press (via Google News)', url: gn('site:apnews.com when:1d'), topic: 'world', kind: 'search' },
  { id: 'bloomberg-wire', name: 'Bloomberg (via Google News)', url: gn('site:bloomberg.com when:1d'), topic: 'business', kind: 'search' },
  { id: 'ft-wire', name: 'Financial Times (via Google News)', url: gn('site:ft.com when:1d'), topic: 'business', kind: 'search' },
  { id: 'wsj-wire', name: 'Wall Street Journal (via Google News)', url: gn('site:wsj.com when:1d'), topic: 'business', kind: 'search' },
  // Publishers' own feeds
  { id: 'bbc-world', name: 'BBC News — World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', topic: 'world', publisherId: 'bbc', kind: 'publisher' },
  { id: 'bbc-business', name: 'BBC News — Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', topic: 'business', publisherId: 'bbc', kind: 'publisher' },
  { id: 'guardian-world', name: 'The Guardian — World', url: 'https://www.theguardian.com/world/rss', topic: 'world', publisherId: 'guardian', kind: 'publisher' },
  { id: 'guardian-business', name: 'The Guardian — Business', url: 'https://www.theguardian.com/business/rss', topic: 'business', publisherId: 'guardian', kind: 'publisher' },
  { id: 'nyt-world', name: 'The New York Times — World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', topic: 'world', publisherId: 'nyt', kind: 'publisher' },
  { id: 'nyt-business', name: 'The New York Times — Business', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', topic: 'business', publisherId: 'nyt', kind: 'publisher' },
  { id: 'npr-world', name: 'NPR — World', url: 'https://feeds.npr.org/1004/rss.xml', topic: 'world', publisherId: 'npr', kind: 'publisher' },
  { id: 'dw-world', name: 'Deutsche Welle — World', url: 'https://rss.dw.com/rdf/rss-en-world', topic: 'world', publisherId: 'dw', kind: 'publisher' },
  { id: 'dw-business', name: 'Deutsche Welle — Business', url: 'https://rss.dw.com/rdf/rss-en-bus', topic: 'business', publisherId: 'dw', kind: 'publisher' },
  { id: 'france24', name: 'France 24', url: 'https://www.france24.com/en/rss', topic: 'world', publisherId: 'france24', kind: 'publisher' },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', topic: 'world', publisherId: 'aljazeera', kind: 'publisher' },
  { id: 'cnbc-world', name: 'CNBC — World', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html', topic: 'business', publisherId: 'cnbc', kind: 'publisher' },
  { id: 'cnbc-economy', name: 'CNBC — Economy', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', topic: 'business', publisherId: 'cnbc', kind: 'publisher' },
  { id: 'cbc-world', name: 'CBC News — World', url: 'https://www.cbc.ca/webfeed/rss/rss-world', topic: 'world', publisherId: 'cbc', kind: 'publisher' },
  { id: 'abc-au-world', name: 'ABC News (Australia) — Just In', url: 'https://www.abc.net.au/news/feed/51120/rss.xml', topic: 'world', publisherId: 'abc-au', kind: 'publisher' },
  // Official / primary sources
  { id: 'fed-press', name: 'Federal Reserve — press releases', url: 'https://www.federalreserve.gov/feeds/press_all.xml', topic: 'official', publisherId: 'fed', kind: 'publisher' },
  { id: 'ecb-press', name: 'European Central Bank — press', url: 'https://www.ecb.europa.eu/rss/press.html', topic: 'official', publisherId: 'ecb', kind: 'publisher' },
  { id: 'boe-news', name: 'Bank of England — news', url: 'https://www.bankofengland.co.uk/rss/news', topic: 'official', publisherId: 'boe', kind: 'publisher' },
  { id: 'imf-news', name: 'IMF — news', url: 'https://www.imf.org/en/News/RSS?Language=ENG', topic: 'official', publisherId: 'imf', kind: 'publisher' },
  { id: 'un-news', name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', topic: 'official', publisherId: 'un-news', kind: 'publisher' },
  { id: 'sec-press', name: 'SEC — press releases', url: 'https://www.sec.gov/news/pressreleases.rss', topic: 'official', kind: 'publisher' },
  { id: 'wto-news', name: 'WTO — latest news', url: 'https://www.wto.org/library/rss/latest_news_e.xml', topic: 'official', publisherId: 'wto', kind: 'publisher' },
];

const REFRESH_MS = 30 * 60_000;
const KEEP_DAYS = 14;
const MAX_ARTICLES = 6000;
const SIGNAL_KEEP_DAYS = 120;

// ───────────────────────── Store ─────────────────────────
export interface StoredArticle {
  id: string; url: string; title: string; summary?: string;
  publisher: string; publisherId?: string; domain: string; tier: PublisherTier;
  published: string; firstSeen: string; feeds: string[]; topics: FeedTopic[];
  tags: Tag[]; key: string[]; cluster: string;
}
export interface FeedHealth { id: string; name: string; url: string; topic: FeedTopic; kind: FeedDef['kind']; ok?: boolean; lastAttempt?: string; lastOk?: string; lastError?: string; items?: number; added?: number; }
export interface Evidence { articleId: string; title: string; url: string; publisher: string; tier: PublisherTier; date: string; }
export type SignalStatus = 'consistent' | 'differs-from-record' | 'not-in-record' | 'outcome-reported';
export interface NewsSignal {
  key: string; kind: SignalKind; entityId: string; entityName: string; person: string; role?: RoleClass; roleText?: string;
  evidence: Evidence[]; publishers: string[]; strength: 'single-source' | 'corroborated' | 'official';
  firstSeen: string; lastSeen: string; status?: SignalStatus; recordHolders?: string[]; relatedIds?: string[]; summary?: string;
}

const articles = new Map<string, StoredArticle>();
const signals = new Map<string, NewsSignal>();
const health = new Map<string, FeedHealth>(FEEDS.map((f) => [f.id, { id: f.id, name: f.name, url: f.url, topic: f.topic, kind: f.kind }]));
let lastRun: { at: string; ok: number; failed: number; added: number } | null = null;
const STORE = path.join(DATA_DIR, 'news', 'store.json');
// Word → article ids, so clustering only compares headlines that share words.
const wordIndex = new Map<string, Set<string>>();
const indexArticle = (a: StoredArticle) => { for (const w of a.key) (wordIndex.get(w) || wordIndex.set(w, new Set()).get(w)!).add(a.id); };
const rebuildIndex = () => { wordIndex.clear(); for (const a of articles.values()) indexArticle(a); };

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    for (const a of j.articles || []) articles.set(a.id, a);
    for (const s of j.signals || []) signals.set(s.key, s);
    for (const h of j.feeds || []) if (health.has(h.id)) health.set(h.id, { ...health.get(h.id)!, ...h, url: health.get(h.id)!.url, name: health.get(h.id)!.name });
    lastRun = j.lastRun || null;
  } catch { /* first run */ }
  rebuildIndex();
}
function save() {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  const body = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), lastRun, feeds: [...health.values()], articles: [...articles.values()], signals: [...signals.values()] });
  fs.writeFile(STORE + '.tmp', body, (err) => { if (!err) fs.rename(STORE + '.tmp', STORE, () => {}); });
}

// ───────────────────────── Tagger (built from the live graph) ─────────────────────────
const SHORT_OK = new Set(['US', 'USA', 'U.S', 'UK', 'U.K', 'UAE', 'DRC', 'PRC', 'ROK', 'DPRK', 'EU', 'UN', 'U.N', 'G7', 'G20', 'BP', 'GM', 'VW', 'J&J', 'P&G']);
const TICKERISH = /^[A-Z0-9.\-=]{1,6}$|\d|=F$/;
const KEEP_ACRONYM = new Set(['AMD', 'ASML', 'TSMC', 'SAP', 'BMW', 'LVMH', 'HSBC', 'BHP', 'BYD', 'CATL', 'ICBC', 'MUFG', 'ADNOC', 'TCS', 'RTX', 'ADM', 'PNC', 'PPG', 'BNP', 'AWS', 'BAE', 'GOP', 'DNC', 'CDU', 'CSU', 'SPD', 'AfD', 'LDP', 'CCP', 'CPC', 'BJP', 'LPC', 'NATO', 'OTAN', 'OPEC', 'BRICS', 'ASEAN', 'IMF', 'WTO', 'IBRD', 'LNG', 'WTI', 'TTF', 'ULSD', 'RBOB', 'HDFC', 'RBC', 'BofA', 'UAE', 'DPRK', 'DRC', 'PRC', ...SHORT_OK]);
// Company and party names that are also ordinary words need supporting context.
const COMMON_WORDS = new Set(['apple', 'amazon', 'meta', 'shell', 'visa', 'oracle', 'alphabet', 'vale', 'reliance', 'intel', 'ford', 'chase', 'coke', 'novo', 'lilly', 'mercedes', 'leonardo', 'freeport', 'claro', 'zara', 'micron', 'caterpillar', 'deere', 'hershey', 'goldman', 'berkshire', 'roche', 'chevron', 'target', 'conoco', 'reform', 'labour', 'greens', 'conservatives', 'liberals', 'democrats', 'republicans', 'renaissance', 'tories', 'congress']);
const DROP_ALIAS = new Set(['Total', 'Iron', 'Travel', 'Tourism', 'Cars', 'Vehicles', 'Autos', 'Gas', 'Soy', 'Ni', 'Co', 'Li', 'Rio', 'LA', 'DC', 'Washington', 'X', 'INC', 'PT', 'DoC', 'Chips', 'Dairy']);
// Capitals used as shorthand for governments ("Beijing says…").
const METONYMS: Record<string, string> = {
  Washington: 'USA', Beijing: 'CHN', Moscow: 'RUS', Kremlin: 'RUS', Kyiv: 'UKR', Kiev: 'UKR', Tehran: 'IRN', Pyongyang: 'PRK', Seoul: 'KOR', Tokyo: 'JPN', Taipei: 'TWN',
  'New Delhi': 'IND', Islamabad: 'PAK', Kabul: 'AFG', Ankara: 'TUR', Riyadh: 'SAU', Cairo: 'EGY', Caracas: 'VEN', Havana: 'CUB', Brasília: 'BRA', Brasilia: 'BRA', Ottawa: 'CAN',
  Canberra: 'AUS', Damascus: 'SYR', Baghdad: 'IRQ', Beirut: 'LBN', Minsk: 'BLR', Warsaw: 'POL', Budapest: 'HUN', Hanoi: 'VNM', Manila: 'PHL', Jakarta: 'IDN', Bangkok: 'THA',
  Khartoum: 'SDN', 'Addis Ababa': 'ETH', Nairobi: 'KEN', Pretoria: 'ZAF', Abuja: 'NGA', Doha: 'QAT', 'Abu Dhabi': 'ARE', Tbilisi: 'GEO', Yerevan: 'ARM', Baku: 'AZE',
  Kinshasa: 'COD', Goma: 'COD', Brazzaville: 'COG', Berlin: 'DEU', Paris: 'FRA', 'Downing Street': 'GBR', Westminster: 'GBR', Whitehall: 'GBR', 'White House': 'USA', Élysée: 'FRA', Elysee: 'FRA', Zhongnanhai: 'CHN',
};
const EXTRA_TERMS: [string, string][] = [['Northern Ireland', 'country:GBR'], ['Scotland', 'country:GBR'], ['Wales', 'country:GBR'], ['England', 'country:GBR'], ['Gaza', 'country:PSE'], ['West Bank', 'country:PSE'], ['Latin America', 'region:americas'], ['South America', 'region:americas'], ['North America', 'region:americas'], ['Central America', 'region:americas'], ['Washington state', 'state:US-WA'], ['Washington State', 'state:US-WA']];

const stripCompany = (n: string) => {
  let s = n.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/^The\s+/, '').trim();
  for (let i = 0; i < 3; i++) s = s.replace(/,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|plc|PLC|p\.l\.c\.|SE|AG|GmbH|Co\.,?\s*Ltd\.?|Co\.|Ltd\.?|Limited|Group|Holdings?|N\.V\.|S\.A\.B\. de C\.V\.|S\.A\.|S\.p\.A\.|ASA|A\/S|AB|Company|& Co\.)$/, '').trim();
  return s;
};

let tagger: Tagger | null = null;
const homeCache = new Map<string, string | undefined>();
function homeOf(id: string): string | undefined {
  if (homeCache.has(id)) return homeCache.get(id);
  const e = getEntity(id); let h: string | undefined;
  if (!e || e.type === 'country' || e.type === 'region') h = undefined;
  else if (e.type === 'state' || e.type === 'county') h = 'country:USA';
  else if (e.type === 'party' || e.type === 'city') h = e.parentId?.startsWith('country:') ? e.parentId : homeOf(e.parentId || '');
  else if (e.type === 'company') h = e.attrs?.hqCountry;
  else if (e.type === 'person') {
    for (const t of ['head_of_state', 'head_of_government', 'holds_office', 'leads', 'belongs_to_party'] as const) {
      const r = relsOfType(id, t, 'out')[0]; if (!r) continue;
      const to = getEntity(r.to); h = to?.type === 'country' ? to.id : homeOf(r.to); if (h) break;
    }
  }
  homeCache.set(id, h); return h;
}
const TYPE_RANK: Record<string, number> = { country: 5, igo: 4, company: 3, party: 2, state: 1 };
const typeRank = (id: string) => (TYPE_RANK[id.split(':')[0]] || 0) + (id.startsWith('country:') && getEntity(id)?.attrs?.independent ? 1 : 0);
const FIRST_NAMES = new Set(['Chad', 'Jordan', 'Georgia', 'Israel', 'Victoria', 'Austin', 'Charlotte', 'Florence']);
// Family name first (Xi Jinping → "Xi"); elsewhere the last word is the surname.
const FAMILY_FIRST = new Set(['country:CHN', 'country:TWN', 'country:KOR', 'country:PRK', 'country:VNM', 'country:KHM', 'country:SGP']);
const COMMON_SURNAME = new Set(['lee', 'kim', 'park', 'wang', 'li', 'zhang', 'chen', 'liu', 'smith', 'johnson', 'brown', 'jones', 'khan', 'singh', 'ali', 'ahmed', 'hassan', 'nguyen', 'garcia', 'rodriguez', 'martinez', 'lopez', 'gonzalez', 'perez', 'sanchez', 'sánchez', 'silva', 'santos', 'king', 'young', 'white', 'green', 'rice', 'may', 'bush', 'love', 'hope', 'grant', 'banks', 'price', 'little', 'long', 'rich', 'case', 'hill', 'moon', 'rubio']);

export function buildTagger(): Tagger {
  homeCache.clear();
  const specs: TermSpec[] = [];
  const add = (text: string, id: string, via: TermSpec['via'], o: Partial<TermSpec> = {}) => {
    if (!text || text.length < 2) return;
    specs.push({ text, ids: [id], caseSensitive: true, via, firstName: FIRST_NAMES.has(text) || undefined, ...o });
  };
  const aliasOk = (a: string) => !DROP_ALIAS.has(a) && (KEEP_ACRONYM.has(a) || (!TICKERISH.test(a) && a.length >= 3));
  for (const e of entities.values()) {
    switch (e.type) {
      case 'country':
        add(e.name, e.id, 'name');
        for (const a of e.aliases || []) if (aliasOk(a) && (a.length >= 4 || SHORT_OK.has(a))) add(a, e.id, 'alias');
        break;
      case 'region': if (e.name !== 'Americas' && e.name !== 'Antarctica') add(e.name, e.id, 'name'); break;
      case 'state': if (e.name !== 'Washington') add(e.name, e.id, 'name'); break;
      case 'igo': add(e.name, e.id, 'name'); for (const a of e.aliases || []) if (aliasOk(a) || SHORT_OK.has(a)) add(a, e.id, 'alias'); break;
      case 'company': {
        for (const [n, via] of [[stripCompany(e.name), 'name'], ...(e.aliases || []).filter(aliasOk).map((a) => [a, 'alias'])] as [string, TermSpec['via']][]) {
          const single = !/\s/.test(n);
          add(n, e.id, via, { context: single && COMMON_WORDS.has(n.toLowerCase()) ? 'business' : undefined });
        }
        break;
      }
      case 'person':
        for (const n of [e.name, ...(e.aliases || [])]) if (n.trim().split(/\s+/).length >= 2 && !/^\p{Ll}/u.test(n)) add(n, e.id, n === e.name ? 'name' : 'alias');
        break;
      case 'party': {
        for (const [n, via] of [[e.name.replace(/\s*\([^)]*\)/, ''), 'name'], ...(e.aliases || []).filter((a) => aliasOk(a)).map((a) => [a, 'alias'])] as [string, TermSpec['via']][]) {
          const single = !/\s/.test(n);
          add(n, e.id, via, { context: single && (COMMON_WORDS.has(n.toLowerCase()) || !KEEP_ACRONYM.has(n)) ? 'politics' : undefined });
        }
        break;
      }
      case 'commodity': {
        const names = [e.name.replace(/\s*\([^)]*\)/, ''), ...(e.aliases || []).filter((a) => (aliasOk(a) && !/^[A-Z]{2,4}$/.test(a)) || ['LNG', 'WTI', 'TTF'].includes(a))];
        for (const n of names) add(n, e.id, n === names[0] ? 'name' : 'alias', { caseSensitive: /^[A-Z]{2,}$/.test(n), context: 'commodity' });
        break;
      }
    }
  }
  // Sitting heads of state and government are usually named by surname alone ("Trump and Xi meet").
  const surnames = new Map<string, Set<string>>();
  for (const e of entities.values()) {
    if (e.type !== 'country') continue;
    for (const t of ['head_of_state', 'head_of_government'] as const) for (const r of relsOfType(e.id, t, 'in')) {
      if (r.validTo) continue;
      const p = getEntity(r.from); if (!p) continue;
      const words = p.name.replace(/\s*\(.*\)$/, '').replace(/,.*$/, '').trim().split(/\s+/).filter((w) => !/^(Jr\.?|Sr\.?|II|III|bin|al|de|von|van)$/i.test(w));
      if (words.length < 2) continue;
      const sn = FAMILY_FIRST.has(e.id) ? words[0] : words[words.length - 1];
      if ((sn.length < 4 && sn !== 'Xi') || COMMON_SURNAME.has(sn.toLowerCase()) || !/^\p{Lu}/u.test(sn)) continue;
      (surnames.get(sn) || surnames.set(sn, new Set()).get(sn)!).add(p.id);
    }
  }
  for (const [sn, ids] of surnames) if (ids.size === 1) add(sn, [...ids][0], 'surname');
  for (const c of worldCountries) {
    const id = `country:${c.cca3}`; if (!getEntity(id) || !c.independent) continue;
    for (const d of [c.demonyms?.eng?.m, c.demonyms?.eng?.f]) if (d && d.length > 3) add(d, id, 'demonym');
  }
  for (const [n, iso] of Object.entries(METONYMS)) if (getEntity(`country:${iso}`)) add(n, `country:${iso}`, 'capital');
  for (const [n, id] of EXTRA_TERMS) if (getEntity(id)) add(n, id, 'name');
  // "Congo" alone could be either Congo: tagged only when other words settle it.
  add('Congo', 'country:COD', 'alias'); add('Congo', 'country:COG', 'alias');
  return new Tagger(specs, homeOf, typeRank);
}

// ───────────────────────── Ingest ─────────────────────────
const idFor = (url: string) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
const hostOf = (u?: string) => { try { return u ? cleanDomain(new URL(u).hostname) : ''; } catch { return ''; } };

function ingest(feed: FeedDef, xml: string, now: string) {
  const items = parseFeed(xml);
  const cutoff = Date.now() - KEEP_DAYS * 86400_000;
  let added = 0;
  const fixed = feed.publisherId ? publisherById.get(feed.publisherId) : undefined;
  for (const it of items) {
    // Search feeds name the original publisher in <source>; publisher feeds are the publisher.
    const domain = feed.kind === 'search' ? hostOf(it.sourceUrl) || hostOf(it.url) : hostOf(it.url) || fixed?.domains[0] || '';
    const pub = fixed || publisherForDomain(domain) || publisherForName(it.sourceName);
    const publisher = pub?.name || it.sourceName || domain;
    const title = stripPublisherSuffix(it.title, it.sourceName || pub?.name);
    if (title.length < 12) continue;
    const published = it.published && Date.parse(it.published) <= Date.now() + 3600_000 ? it.published : now;
    if (Date.parse(published) < cutoff) continue;
    const url = canonicalUrl(it.url);
    const id = idFor(url);
    const prev = articles.get(id);
    if (prev) { if (!prev.feeds.includes(feed.id)) prev.feeds.push(feed.id); if (!prev.topics.includes(feed.topic)) prev.topics.push(feed.topic); continue; }
    const tier: PublisherTier = pub?.tier || tierForDomain(domain);
    const summary = feed.kind === 'search' ? undefined : it.summary && it.summary !== title ? it.summary.slice(0, 320) : undefined;
    const key = titleKey(title);
    const a: StoredArticle = { id, url: it.url, title, summary, publisher, publisherId: pub?.id, domain, tier, published, firstSeen: now, feeds: [feed.id], topics: [feed.topic], tags: tagger ? tagger.tag(title, summary) : [], key, cluster: id };
    // Same story already stored (another outlet, or a re-worded headline)? Join its cluster.
    const t = Date.parse(published);
    const shared = new Map<string, number>();
    for (const w of key) for (const other of wordIndex.get(w) || []) shared.set(other, (shared.get(other) || 0) + 1);
    let best: StoredArticle | undefined; let bestShared = 2;
    for (const [oid, n] of shared) {
      if (n <= bestShared) continue;
      const b = articles.get(oid);
      if (b && Math.abs(Date.parse(b.published) - t) < 72 * 3600_000 && sameStory(key, b.key)) { best = b; bestShared = n; }
    }
    if (best) a.cluster = best.cluster;
    articles.set(id, a); indexArticle(a); added++;
  }
  return { items: items.length, added };
}

function prune() {
  const cutoff = Date.now() - KEEP_DAYS * 86400_000;
  for (const [id, a] of articles) if (Date.parse(a.published) < cutoff) articles.delete(id);
  if (articles.size > MAX_ARTICLES) {
    const sorted = [...articles.values()].sort((a, b) => b.published.localeCompare(a.published));
    for (const a of sorted.slice(MAX_ARTICLES)) articles.delete(a.id);
  }
  rebuildIndex();
}

let running: Promise<void> | null = null;
export function refreshNews() {
  if (running) return running;
  running = (async () => {
    if (!tagger) tagger = buildTagger();
    const now = new Date().toISOString();
    let ok = 0, failed = 0, added = 0;
    const queue = [...FEEDS];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        const h = health.get(f.id)!; h.lastAttempt = new Date().toISOString();
        try {
          const xml = await fetchText(f.url, { Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' }, 20000);
          const r = ingest(f, xml, now);
          if (!r.items) throw new Error('Feed returned no items');
          Object.assign(h, { ok: true, lastOk: h.lastAttempt, lastError: undefined, items: r.items, added: r.added });
          ok++; added += r.added;
        } catch (e: any) {
          Object.assign(h, { ok: false, lastError: String(e.message || e).slice(0, 200) });
          failed++;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    prune();
    lastRun = { at: now, ok, failed, added };
    reconcileSignals();
    save();
    console.log(`[news] ${ok}/${FEEDS.length} feeds ok, ${added} new headlines, ${articles.size} stored, ${signals.size} signals`);
  })().finally(() => { running = null; });
  return running;
}

/** The current entity tagger (built on first use). Also used to match prediction markets to elections. */
export function getTagger() { return tagger ||= buildTagger(); }

/** Rebuild the tagger after the graph changes (live leaders, conflicts…) and re-tag stored headlines. */
export function retagAll() {
  tagger = buildTagger();
  for (const a of articles.values()) a.tags = tagger.tag(a.title, a.summary);
  reconcileSignals();
}

export function startNews() {
  load();
  setTimeout(() => { void refreshNews(); }, 2000);
  setInterval(() => { void refreshNews(); }, REFRESH_MS).unref();
}

// ───────────────────────── Signals ─────────────────────────
const COMPANY_ROLES = new Set<RoleClass>(['ceo', 'chair']);
const STATE_ROLES = new Set<RoleClass>(['head-of-government', 'head-of-state', 'finance-minister', 'central-bank-governor']);
const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const listNames = (xs: string[]) => xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

function namesOf(id: string) { const e = getEntity(id); return e ? [e.name, ...(e.aliases || [])].map(normName) : []; }
function samePerson(name: string, personId: string) {
  const n = normName(name); const names = namesOf(personId);
  if (names.includes(n)) return true;
  // "Lee Jae-myung" vs "Lee Jae Myung"; "C. C. Wei" vs "C.C. Wei": compare without spaces/punctuation.
  const squash = (s: string) => s.replace(/[^a-z0-9]/g, '');
  return names.some((x) => squash(x) === squash(n));
}

/** Current officeholders for a role, from curated and live (Wikidata) records. */
function holders(entityId: string, role?: RoleClass): string[] {
  const cur = (t: Parameters<typeof relsOfType>[1], re?: RegExp) => relsOfType(entityId, t, 'in').filter((r) => !r.validTo && (!re || re.test(r.role || ''))).map((r) => r.from);
  switch (role) {
    case 'ceo': return cur('leads', /CEO|chief executive/i);
    case 'chair': return cur('leads', /chair/i);
    case 'head-of-government': return cur('head_of_government');
    case 'head-of-state': return cur('head_of_state');
    case 'finance-minister': return cur('holds_office', /financ|treasury|exchequer/i);
    default: return [];
  }
}

function targetFor(a: StoredArticle, kind: SignalKind, role?: RoleClass): string | undefined {
  const inTitle = a.tags.filter((t) => t.in === 'title');
  const ofType = (type: string) => [...new Set(inTitle.filter((t) => t.id.startsWith(`${type}:`)).map((t) => t.id))];
  if (role && COMPANY_ROLES.has(role)) { const c = ofType('company'); return c.length === 1 ? c[0] : undefined; }
  if (kind === 'election-win' || (role && STATE_ROLES.has(role))) {
    const c = ofType('country');
    return c.length === 1 ? c[0] : undefined;
  }
  if (role === 'leader') { const p = ofType('party'); return p.length === 1 ? p[0] : undefined; }
  return undefined;
}

function collectSignals() {
  const fresh = new Map<string, NewsSignal>();
  for (const a of articles.values()) {
    if (!isTrusted(a.tier)) continue;
    for (const s of extractSignals(a.title)) {
      const target = targetFor(a, s.kind, s.role);
      if (!target) continue;
      // The "person" must not be the organisation itself or another tagged entity's name.
      if (namesOf(target).includes(normName(s.person)) || a.tags.some((t) => !t.id.startsWith('person:') && namesOf(t.id).includes(normName(s.person)))) continue;
      const key = `${s.kind}|${target}|${s.role || ''}|${normName(s.person)}`;
      const sig = fresh.get(key) || { key, kind: s.kind, entityId: target, entityName: getEntity(target)?.name || target, person: s.person, role: s.role, roleText: s.roleText, evidence: [], publishers: [], strength: 'single-source', firstSeen: a.published, lastSeen: a.published } as NewsSignal;
      if (!sig.evidence.some((x) => x.articleId === a.id)) sig.evidence.push({ articleId: a.id, title: a.title, url: a.url, publisher: a.publisher, tier: a.tier, date: a.published });
      if (a.published < sig.firstSeen) sig.firstSeen = a.published;
      if (a.published > sig.lastSeen) sig.lastSeen = a.published;
      fresh.set(key, sig);
    }
  }
  // Merge with signals seen in earlier runs (their headlines may have aged out of the store).
  for (const [k, s] of fresh) {
    const old = signals.get(k);
    if (old) { for (const ev of old.evidence) if (!s.evidence.some((x) => x.articleId === ev.articleId)) s.evidence.push(ev); if (old.firstSeen < s.firstSeen) s.firstSeen = old.firstSeen; }
    signals.set(k, s);
  }
  const cutoff = new Date(Date.now() - SIGNAL_KEEP_DAYS * 86400_000).toISOString();
  for (const [k, s] of signals) if (s.lastSeen < cutoff) signals.delete(k);
  for (const s of signals.values()) {
    s.evidence.sort((a, b) => TIER_INFO[a.tier].rank - TIER_INFO[b.tier].rank || a.date.localeCompare(b.date));
    s.publishers = [...new Set(s.evidence.map((e) => e.publisher))];
    s.strength = s.evidence.some((e) => e.tier === 'official') ? 'official' : s.publishers.length >= 2 ? 'corroborated' : 'single-source';
  }
}

// Entities whose attributes/facts we changed last time, so a refresh starts clean.
const touched = new Set<string>();
const NEWS_FACT = (f: Fact) => f.sourceId === 'trusted-news';

export function reconcileSignals() {
  collectSignals();
  for (const id of touched) {
    const e = getEntity(id); if (!e) continue;
    if (e.attrs) { delete e.attrs.newsSignals; delete e.attrs.newsNote; delete e.attrs.reportedOutcome; }
    e.facts = (e.facts || []).filter((f) => !NEWS_FACT(f));
  }
  touched.clear();
  const touch = (e: Entity) => { touched.add(e.id); e.attrs ||= {}; return e; };
  const addFact = (e: Entity, f: Fact) => { touch(e); e.facts = [...(e.facts || []).filter((x) => !(NEWS_FACT(x) && x.label === f.label && x.value === f.value)), f]; };

  for (const s of signals.values()) {
    const target = getEntity(s.entityId); if (!target) continue;
    const who = `${listNames(s.publishers.slice(0, 3))}${s.publishers.length > 3 ? ` and ${s.publishers.length - 3} more` : ''}`;
    const when = fmtDay(s.firstSeen);
    const roleName = s.role ? roleLabel[s.role].toLowerCase() : 'winner';
    const strong = s.strength !== 'single-source';
    s.relatedIds = [];
    if (s.kind === 'appointment' || s.kind === 'departure') {
      const hs = holders(target.id, s.role);
      s.recordHolders = hs.map((h) => getEntity(h)?.name || h);
      const matches = hs.filter((h) => samePerson(s.person, h));
      if (s.kind === 'appointment') s.status = matches.length ? 'consistent' : hs.length ? 'differs-from-record' : 'not-in-record';
      else s.status = matches.length ? 'differs-from-record' : 'not-in-record';
      s.summary = s.kind === 'appointment'
        ? `${who} reported on ${when} that ${s.person} ${s.role === 'head-of-government' || s.role === 'head-of-state' ? 'became' : 'was named'} ${roleName}${s.role && COMPANY_ROLES.has(s.role) ? ` of ${target.name}` : ` of ${target.name}`}.`
        : `${who} reported on ${when} that ${s.person} is leaving as ${roleName} of ${target.name}.`;
      s.summary = s.summary.replace(/\.{2,}/g, '.');
      if (strong && s.status === 'differs-from-record') {
        if (s.kind === 'appointment') {
          addFact(target, { label: `Reported new ${roleName}`, value: s.person, sourceId: 'trusted-news', quality: 'reported', asOf: s.firstSeen.slice(0, 10), note: `Reported by ${who}. Not yet reflected in the curated or Wikidata record (which lists ${listNames(s.recordHolders)}) — verify with an official source.` });
          for (const h of hs) { const p = touch(getEntity(h)!); p.attrs!.newsNote = `${s.summary} The record still lists ${p.name} in this role — verify before relying on it.`; s.relatedIds.push(h); }
        } else {
          for (const h of matches) { const p = touch(getEntity(h)!); p.attrs!.newsNote = `${s.summary} The record still lists ${p.name} in office — verify the current officeholder.`; s.relatedIds.push(h); }
        }
      }
    } else if (s.kind === 'election-win') {
      // Attach to an election in that country held up to 30 days before the first report.
      const t = Date.parse(s.firstSeen);
      const els = relsOfType(target.id, 'affects', 'in').map((r) => getEntity(r.from)!).filter((ev) => ev?.type === 'event' && ev.attrs?.category === 'election' && ev.attrs?.date)
        .filter((ev) => { const d = Date.parse(String(ev.attrs!.endDate || ev.attrs!.date)); return d <= t + 2 * 86400_000 && d >= t - 30 * 86400_000; });
      s.status = 'outcome-reported';
      s.relatedIds = els.map((x) => x.id);
      s.summary = `${who} reported on ${when} that ${s.person} won${els.length ? ` the ${els.map((x) => x.name).join(' / ')}` : ` an election in ${target.name}`}.`;
      if (strong) for (const ev of els) {
        addFact(ev, { label: 'Reported winner', value: s.person, sourceId: 'trusted-news', quality: 'reported', asOf: s.firstSeen.slice(0, 10), note: `Reported by ${who}. Official results are published by the national electoral authority.` });
        touch(ev).attrs!.reportedOutcome = { winner: s.person, publishers: s.publishers, firstSeen: s.firstSeen, strength: s.strength, evidence: s.evidence.slice(0, 4) };
      }
    }
    if (s.summary) s.summary = s.summary.replace(/\.{2,}/g, '.');
    // Every signal (even single-source) is listed on its entity, labelled by strength.
    for (const id of [target.id, ...s.relatedIds]) { const e = touch(getEntity(id)!); (e.attrs!.newsSignals ||= []).push(signalView(s)); }
  }
}

const signalView = (s: NewsSignal) => ({ key: s.key, kind: s.kind, entityId: s.entityId, entityName: s.entityName, person: s.person, role: s.role, roleLabel: s.role ? roleLabel[s.role] : undefined, status: s.status, strength: s.strength, publishers: s.publishers, firstSeen: s.firstSeen, lastSeen: s.lastSeen, summary: s.summary, recordHolders: s.recordHolders, relatedIds: s.relatedIds, evidence: s.evidence.slice(0, 6) });

// ───────────────────────── Queries ─────────────────────────
function clusterInfo() {
  const by = new Map<string, StoredArticle[]>();
  for (const a of articles.values()) (by.get(a.cluster) || by.set(a.cluster, []).get(a.cluster)!).push(a);
  return by;
}
const publishersOf = (list: StoredArticle[]) => [...new Map(list.map((a) => [a.publisherId || a.publisher, { name: a.publisher, tier: a.tier, url: a.url }])).values()]
  .sort((a, b) => TIER_INFO[a.tier].rank - TIER_INFO[b.tier].rank);

export interface NewsItem { id: string; title: string; url: string; summary?: string; publisher: string; domain: string; tier: PublisherTier; date: string; origin: 'feed' | 'search'; corroboration: number; alsoReportedBy: { name: string; tier: PublisherTier; url: string }[]; mention?: 'title' | 'summary'; tags?: { id: string; name: string; type: string; flag?: string }[]; cluster?: string; }

export function toItem(a: StoredArticle, clusters: Map<string, StoredArticle[]>, entityId?: string): NewsItem {
  const pubs = publishersOf(clusters.get(a.cluster) || [a]);
  return {
    id: a.id, title: a.title, url: a.url, summary: a.summary, publisher: a.publisher, domain: a.domain, tier: a.tier, date: a.published, origin: 'feed', cluster: a.cluster,
    corroboration: pubs.filter((p) => isTrusted(p.tier)).length, alsoReportedBy: pubs.filter((p) => p.name !== a.publisher).slice(0, 8),
    mention: entityId ? a.tags.find((t) => t.id === entityId)?.in : undefined,
    tags: a.tags.filter((t) => t.in === 'title' || t.via === 'name').slice(0, 8).map((t) => { const s = stub(t.id); return s && { id: s.id, name: s.name, type: s.type, flag: s.flag }; }).filter(Boolean) as NewsItem['tags'],
  };
}

/** Trusted-feed headlines that mention an entity, newest first, one per story. */
export function newsFor(entityId: string, days = 21): NewsItem[] {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const clusters = clusterInfo();
  const hits = [...articles.values()].filter((a) => a.published >= cutoff && a.tags.some((t) => t.id === entityId));
  const best = new Map<string, StoredArticle>();
  for (const a of hits) {
    const b = best.get(a.cluster);
    if (!b || TIER_INFO[a.tier].rank < TIER_INFO[b.tier].rank || (a.tier === b.tier && a.published < b.published)) best.set(a.cluster, a);
  }
  return [...best.values()].map((a) => toItem(a, clusters, entityId)).sort((a, b) => b.date.localeCompare(a.date));
}

/** Story list for the newsroom page: one row per story, with every outlet that carried it. */
export function latestStories(o: { topic?: string; entityId?: string; type?: string; minCorroboration?: number; trustedOnly?: boolean; q?: string; hours?: number; limit?: number } = {}) {
  const cutoff = new Date(Date.now() - (o.hours || 72) * 3600_000).toISOString();
  const clusters = clusterInfo();
  const q = o.q?.toLowerCase().trim();
  const rows: (NewsItem & { lastUpdate: string })[] = [];
  for (const list of clusters.values()) {
    const inWindow = list.filter((a) => a.published >= cutoff);
    if (!inWindow.length) continue;
    const pool = o.trustedOnly ? inWindow.filter((a) => isTrusted(a.tier)) : inWindow;
    if (!pool.length) continue;
    if (o.topic && o.topic !== 'all' && !pool.some((a) => a.topics.includes(o.topic as FeedTopic))) continue;
    if (o.entityId && !pool.some((a) => a.tags.some((t) => t.id === o.entityId))) continue;
    if (o.type && !pool.some((a) => a.tags.some((t) => t.id.startsWith(`${o.type}:`)))) continue;
    if (q && !pool.some((a) => a.title.toLowerCase().includes(q))) continue;
    const lead = [...pool].sort((a, b) => TIER_INFO[a.tier].rank - TIER_INFO[b.tier].rank || a.published.localeCompare(b.published))[0];
    const item = toItem(lead, clusters);
    if ((o.minCorroboration || 0) > item.corroboration) continue;
    // Union of tags across the story's headlines.
    const tagIds = new Set<string>(); for (const a of list) for (const t of a.tags) if (t.in === 'title') tagIds.add(t.id);
    item.tags = [...tagIds].slice(0, 10).map((id) => { const s = stub(id); return s && { id: s.id, name: s.name, type: s.type, flag: s.flag }; }).filter(Boolean) as NewsItem['tags'];
    rows.push({ ...item, lastUpdate: list.reduce((m, a) => (a.published > m ? a.published : m), lead.published) });
  }
  return rows.sort((a, b) => b.lastUpdate.localeCompare(a.lastUpdate)).slice(0, o.limit || 100);
}

/** Stories per country (title mentions, trusted outlets) — the "In the news" map layer. */
export function countryAttention(hours = 48) {
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  const by = new Map<string, Set<string>>();
  for (const a of articles.values()) {
    if (a.published < cutoff || !isTrusted(a.tier)) continue;
    for (const t of a.tags) if (t.in === 'title' && t.id.startsWith('country:')) (by.get(t.id) || by.set(t.id, new Set()).get(t.id)!).add(a.cluster);
  }
  return new Map([...by].map(([id, s]) => [id, s.size]));
}

export function allSignals() { return [...signals.values()].map(signalView).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)); }

export function newsStatus() {
  const byTier: Record<string, number> = {};
  for (const a of articles.values()) byTier[a.tier] = (byTier[a.tier] || 0) + 1;
  const tagged = [...articles.values()].filter((a) => a.tags.length).length;
  return {
    lastRun, refreshMinutes: REFRESH_MS / 60_000, keepDays: KEEP_DAYS, articles: articles.size, stories: clusterInfo().size, tagged, byTier,
    signals: { total: signals.size, corroborated: [...signals.values()].filter((s) => s.strength !== 'single-source').length, differsFromRecord: [...signals.values()].filter((s) => s.status === 'differs-from-record' && s.strength !== 'single-source').length },
    feeds: [...health.values()],
  };
}

/** For tests: ingest a feed body without the network. */
export const _test = { save, ingest: (feed: FeedDef, xml: string) => { if (!tagger) tagger = buildTagger(); return ingest(feed, xml, new Date().toISOString()); }, articles, signals, reconcileSignals, clear: () => { articles.clear(); signals.clear(); wordIndex.clear(); } };

// The terminal's functions: every screen has a short code, and this registry is the one place that
// says what the codes are. The command line, the menu, the help page, the function bar's "related"
// strip, the workspace panes and the checks are all generated from it. Nothing else lists functions.
//
// Grammar (typed into the command line, case does not matter):
//     [entity] [second entity] CODE [parameters]        DEU BUDG · USA CHN TRADE · AAPL GP · TOP
//     CODE [entity or parameters]                       NEWS china · CAL germany · MAP sanctions
// A code typed alone acts on the entity that is loaded (the last one opened), where it needs one.
import type { EntityType } from './types.js';

export type FnGroup = 'World' | 'Economy' | 'Markets' | 'News' | 'Entity' | 'Research' | 'Workspace';
export interface FnParam { name: string; about: string; /** word typed → query-string value; free text when absent */ values?: Record<string, string>; query: string; }
export interface FnDef {
  code: string; aliases?: string[]; title: string; group: FnGroup;
  /** One or two plain sentences: what the screen shows. */
  about: string;
  examples: string[];
  /** Codes worth offering next from this screen. */
  related: string[];
  /** Entity types the function acts on. Absent: it needs no entity. */
  on?: EntityType[];
  /** With `on`: whether an entity is required ('one'), or the function also works without ('optional'). */
  need?: 'one' | 'optional';
  /** Where it lives without an entity: path and fixed query. */
  page?: string; query?: Record<string, string>;
  /** Where it lives with an entity: a section of the profile (`hash`), or a page that takes the
   *  entity in a query parameter (`param`; `as: 'iso3'` passes the bare country code). `second`
   *  names the parameter for a second entity. */
  entity?: { hash?: string; page?: string; param?: string; as?: 'id' | 'iso3'; second?: string; query?: Record<string, string>;
    /** A different profile section for some types (a commodity's reserves are its "stocks"). */
    hashByType?: Partial<Record<EntityType, string>> };
  params?: FnParam[];
  /** Handled by the command line itself rather than by a route. */
  special?: 'last' | 'find';
}

/** Profile sections that only some entities of a type have. src/pages/ProfilePage.tsx reads the same
 *  lists, so a function never points at a section the profile does not show. */
export const SECTION_ONLY: Record<string, Partial<Record<EntityType, string[]>>> = {
  sanctions: { igo: ['igo:eu', 'igo:un'] },
  budget: { igo: ['igo:eu'] },
  reserves: { igo: ['igo:eu'] },
  stocks: { commodity: ['commodity:crude-oil', 'commodity:wheat', 'commodity:corn', 'commodity:rice'] },
};
const GEO: EntityType[] = ['country', 'state', 'city', 'region', 'igo'];
const ANY: EntityType[] = ['region', 'country', 'state', 'county', 'city', 'igo', 'institution', 'person', 'party', 'company', 'commodity', 'industry', 'event'];

export const FUNCTIONS: FnDef[] = [
  // ───────────── World
  { code: 'MAP', title: 'World map', group: 'World', about: 'The map, coloured by any indicator. With an entity: flies to it and opens its preview.', examples: ['MAP', 'DEU MAP', 'MAP inflation'], related: ['WEB', 'WAR', 'SANC', 'STAT'], on: GEO, need: 'optional', page: '/', entity: { page: '/', param: 'show' },
    params: [{ name: 'layer', about: 'What to colour the map by: a word from the layer list (gdp, inflation, sanctions, conflicts, elections…)', query: 'layer' }] },
  { code: 'WEB', title: 'Connections', group: 'World', about: 'The network around an entity: who leads, owns, trades with, sanctions and is named in the news with whom.', examples: ['WEB', 'NATO WEB', 'AAPL WEB 2'], related: ['DES', 'REL', 'CMP', 'TRADE'], on: ANY, need: 'optional', page: '/web', entity: { page: '/web', param: 'focus' },
    params: [{ name: 'depth', about: '2 also shows the neighbours’ neighbours', values: { '1': '1', '2': '2' }, query: 'depth' }] },
  { code: 'WAR', aliases: ['CONF'], title: 'Armed conflicts', group: 'World', about: 'Ongoing armed conflicts by intensity, with locations and yearly deaths.', examples: ['WAR'], related: ['MAP', 'TOP', 'SANC', 'ELEC'], page: '/conflicts' },
  { code: 'ELEC', title: 'Elections', group: 'World', about: 'Upcoming and recent elections: dates, candidates, results and market odds.', examples: ['ELEC'], related: ['CAL', 'TOP', 'GOV', 'WAR'], page: '/elections' },
  { code: 'SANC', title: 'Sanctions', group: 'World', about: 'Who sanctions whom. With a country or organization: the programmes aimed at it or run by it.', examples: ['SANC', 'IRN SANC', 'EU SANC'], related: ['TRADE', 'WEB', 'WAR', 'MAP'], on: ['country', 'igo'], need: 'optional', page: '/', query: { fill: 'sanctions:ALL' }, entity: { hash: 'sanctions' } },
  { code: 'TRADE', title: 'Trade explorer', group: 'World', about: 'Goods trade as each country reports it: partners, products and the balance. Two countries: their trade with each other.', examples: ['TRADE', 'DEU TRADE', 'USA CHN TRADE'], related: ['SANC', 'ECON', 'WEB', 'CMP'], on: ['country'], need: 'optional', page: '/trade', entity: { page: '/trade', param: 'a', as: 'iso3', second: 'b' } },
  { code: 'CMP', title: 'Compare', group: 'World', about: 'Countries side by side, and how any two entities are connected.', examples: ['CMP', 'FRA CMP'], related: ['STAT', 'WEB', 'TRADE', 'ECON'], on: ANY, need: 'optional', page: '/compare', entity: { page: '/compare', param: 'a' } },

  // ───────────── Economy
  { code: 'CAL', title: 'Calendar', group: 'Economy', about: 'Data releases, central-bank decisions, summits, votes and elections, graded 1–10, with results posted after. With a country or organization: its own calendar.', examples: ['CAL', 'USA CAL', 'CAL ecb'], related: ['ECON', 'RATES', 'ELEC', 'TOP'], on: ['country', 'igo', 'institution'], need: 'optional', page: '/calendar', entity: { page: '/calendar', param: 'place' } },
  { code: 'ECON', title: 'Economy', group: 'Economy', about: 'GDP, growth, inflation, unemployment, debt and the current account, with sources and the World Bank / IMF cross-check.', examples: ['JPN ECON'], related: ['OUT', 'BUDG', 'STAT', 'RATES', 'CAL'], on: ['country'], entity: { hash: 'macro' } },
  { code: 'OUT', title: 'Outlook', group: 'Economy', about: 'IMF projections for the coming years, shown apart from outcomes.', examples: ['BRA OUT'], related: ['ECON', 'CAL', 'RATES', 'BUDG'], on: ['country'], entity: { hash: 'outlook' } },
  { code: 'BUDG', title: 'Government budget', group: 'Economy', about: 'Revenue, spending, the balance and debt.', examples: ['USA BUDG', 'EU BUDG'], related: ['ECON', 'RATES', 'RES', 'GOV'], on: ['country', 'igo'], entity: { hash: 'budget' } },
  { code: 'RES', title: 'Reserves and stocks', group: 'Economy', about: 'Strategic reserves: oil, grains and what the country must hold.', examples: ['JPN RES'], related: ['BUDG', 'TRADE', 'CMD', 'ECON'], on: ['country', 'igo', 'commodity'], entity: { hash: 'reserves', hashByType: { commodity: 'stocks' } } },
  { code: 'STAT', title: 'Any indicator', group: 'Economy', about: 'Search every World Bank and IMF series for a country and chart it.', examples: ['IND STAT', 'KEN STAT'], related: ['ECON', 'CMP', 'MAP', 'OUT'], on: ['country'], entity: { hash: 'indicators' } },
  { code: 'GOV', title: 'Government', group: 'Economy', about: 'Who holds office: head of state and government, ministers, legislature, governing parties.', examples: ['FRA GOV', 'TEXAS GOV'], related: ['ELEC', 'DES', 'NEWS', 'REL'], on: ['country', 'state', 'city'], entity: { hash: 'government' } },
  { code: 'MEM', title: 'Members', group: 'Economy', about: 'An organization’s members, with join dates.', examples: ['NATO MEM', 'OPEC MEM'], related: ['DES', 'WEB', 'CAL', 'SANC'], on: ['igo'], entity: { hash: 'members' } },

  // ───────────── Markets
  { code: 'MKT', title: 'Markets', group: 'Markets', about: 'The market boards: commodities, currencies, rates, share indices and the currency cross table.', examples: ['MKT'], related: ['EQ', 'FX', 'RATES', 'CMD', 'FXM'], page: '/markets' },
  { code: 'EQ', title: 'World share indices', group: 'Markets', about: 'The main share index of each large economy by region: level, change on the day and over a year.', examples: ['EQ'], related: ['FX', 'RATES', 'CMD', 'TOP'], page: '/markets', query: { tab: 'indices' } },
  { code: 'FX', title: 'Currencies', group: 'Markets', about: 'Every currency against the US dollar, with changes over a day, a month and a year. With a country: its currency.', examples: ['FX', 'TUR FX'], related: ['FXM', 'RATES', 'EQ', 'CMD'], on: ['country'], need: 'optional', page: '/markets', query: { tab: 'fx' }, entity: { hash: 'currency' } },
  { code: 'FXM', title: 'Currency cross table', group: 'Markets', about: 'The currencies of the largest economies against each other, in one table.', examples: ['FXM'], related: ['FX', 'RATES', 'EQ'], page: '/markets', query: { tab: 'matrix' } },
  { code: 'RATES', title: 'Rates and yields', group: 'Markets', about: 'Policy rates and government bond yields. With a country: its rates and yield curve.', examples: ['RATES', 'GBR RATES'], related: ['CAL', 'FX', 'BUDG', 'ECON'], on: ['country'], need: 'optional', page: '/markets', query: { tab: 'rates' }, entity: { hash: 'yields' } },
  { code: 'CMD', title: 'Commodities', group: 'Markets', about: 'Energy, metals and crops: price, change, and a year of history.', examples: ['CMD'], related: ['FX', 'EQ', 'RES', 'TRADE'], page: '/markets', query: { tab: 'commodities' } },
  { code: 'GP', title: 'Price chart', group: 'Markets', about: 'The price of a listed company or a commodity, with its history.', examples: ['AAPL GP', 'BRENT GP'], related: ['FUND', 'CONS', 'NEWS', 'DES'], on: ['company', 'commodity'], entity: { hash: 'market' } },
  { code: 'FUND', title: 'Financials', group: 'Markets', about: 'A company’s reported revenue, profit, assets and cash flow, from its filings.', examples: ['MSFT FUND'], related: ['GP', 'CONS', 'DES', 'NEWS'], on: ['company'], entity: { hash: 'financials' } },
  { code: 'CONS', title: 'Analyst estimates', group: 'Markets', about: 'What analysts expect: price targets and recommendations.', examples: ['NVDA CONS'], related: ['GP', 'FUND', 'NEWS'], on: ['company'], entity: { hash: 'consensus' } },

  // ───────────── News
  { code: 'TOP', title: 'Top news', group: 'News', about: 'Headlines from trusted outlets, ranked by how many of them carry the story.', examples: ['TOP'], related: ['NEWS', 'CAL', 'WAR', 'ALRT'], page: '/news' },
  { code: 'NEWS', title: 'News on an entity', group: 'News', about: 'Headlines that name the entity.', examples: ['UKR NEWS', 'NEWS opec'], related: ['TOP', 'DES', 'EV', 'ALRT'], on: ANY, entity: { page: '/news', param: 'entity' } },

  // ───────────── Entity
  { code: 'DES', title: 'Profile', group: 'Entity', about: 'What it is, who runs it, the key figures and where they come from.', examples: ['DEU DES', 'ARAMCO DES'], related: ['NEWS', 'WEB', 'REL', 'EV', 'NOTE'], on: ANY, entity: { hash: '' } },
  { code: 'REL', title: 'Relationships', group: 'Entity', about: 'Every link the terminal holds for the entity, grouped and sourced.', examples: ['EU REL'], related: ['WEB', 'DES', 'MEM', 'CMP'], on: ANY, entity: { hash: 'relationships' } },
  { code: 'EV', title: 'Events', group: 'Entity', about: 'Scheduled events that affect the entity: elections, summits, results.', examples: ['FRA EV'], related: ['CAL', 'NEWS', 'ELEC', 'ALRT'], on: ANY, entity: { hash: 'events' } },
  { code: 'SRC', title: 'Sources', group: 'Entity', about: 'Where every figure on the profile comes from, and how fresh it is.', examples: ['USA SRC'], related: ['DES', 'DATA'], on: ANY, entity: { hash: 'sources' } },

  // ───────────── Research
  { code: 'NOTE', title: 'Notes on an entity', group: 'Research', about: 'Your notes that mention the entity. NOTE NEW starts one about it.', examples: ['CHN NOTE', 'TSMC NOTE NEW'], related: ['NOTES', 'DES', 'WL', 'ALRT'], on: ANY, entity: { page: '/research', param: 'entity' },
    params: [{ name: 'new', about: 'NEW starts a note about the entity', values: { NEW: '1' }, query: 'new' }] },
  { code: 'NOTES', title: 'Research notes', group: 'Research', about: 'All your notes, as a list or a graph.', examples: ['NOTES'], related: ['NOTE', 'WL', 'PORT'], page: '/research' },
  { code: 'WL', title: 'Watchlists', group: 'Research', about: 'Your lists of entities, with prices where they have one.', examples: ['WL'], related: ['PORT', 'ALRT', 'NOTES', 'TOP'], page: '/watchlists' },
  { code: 'PORT', title: 'Portfolio', group: 'Research', about: 'Your positions and how they are doing.', examples: ['PORT'], related: ['WL', 'ALRT', 'MKT'], page: '/portfolio' },
  { code: 'ALRT', title: 'Alerts', group: 'Research', about: 'What changed that you asked to be told about, and the rules behind it. With a country or organization: alerts about it.', examples: ['ALRT', 'RUS ALRT'], related: ['WL', 'CAL', 'TOP', 'NEWS'], on: ['country', 'igo'], need: 'optional', page: '/alerts', entity: { page: '/alerts', param: 'place' } },

  // ───────────── Workspace
  { code: 'BOARD', title: 'Workspace', group: 'Workspace', about: 'Up to four panes side by side, each running its own function. Panes with the same letter follow the same entity.', examples: ['BOARD', 'BOARD macro'], related: ['HELP', 'KEYS', 'MAP'], page: '/board', params: [{ name: 'name', about: 'A saved workspace to open', query: 'open' }] },
  { code: 'HELP', aliases: ['MAIN', 'MENU'], title: 'Functions and help', group: 'Workspace', about: 'Every function, by area, with what it shows and an example. HELP and a code: that function.', examples: ['HELP', 'HELP CAL'], related: ['KEYS', 'BOARD', 'DATA'], page: '/help', params: [{ name: 'code', about: 'A function code', query: 'fn' }] },
  { code: 'KEYS', title: 'Keyboard', group: 'Workspace', about: 'The keys that drive the terminal.', examples: ['KEYS'], related: ['HELP', 'BOARD'], page: '/help', query: { view: 'keys' } },
  { code: 'DATA', title: 'Data sources and health', group: 'Workspace', about: 'Every source, how fresh it is, what failed, and where sources disagree.', examples: ['DATA'], related: ['SRC', 'HELP', 'SET'], page: '/data' },
  { code: 'SET', title: 'Settings', group: 'Workspace', about: 'Appearance, density, colours for rises and falls, subscriptions and Obsidian sync.', examples: ['SET'], related: ['HELP', 'DATA', 'KEYS'], page: '/settings' },
  { code: 'LAST', title: 'Previous function', group: 'Workspace', about: 'Runs the command before this one again.', examples: ['LAST'], related: ['HELP'], special: 'last' },
  { code: 'FIND', title: 'Search everything', group: 'Workspace', about: 'Entities, functions and your notes that match the words.', examples: ['FIND lithium'], related: ['HELP'], page: '/find', special: 'find', params: [{ name: 'words', about: 'What to look for', query: 'q' }] },
];

const BY_CODE = new Map<string, FnDef>();
for (const f of FUNCTIONS) for (const c of [f.code, ...(f.aliases || [])]) {
  if (BY_CODE.has(c)) throw new Error(`Function code ${c} is used twice`);
  BY_CODE.set(c, f);
}
export const fnByCode = (code: string) => BY_CODE.get(code.trim().toUpperCase());
export const FN_GROUPS: FnGroup[] = ['World', 'Economy', 'Markets', 'News', 'Entity', 'Research', 'Workspace'];

export interface CmdEntity { id: string; type: EntityType; name?: string; iso3?: string; }
export interface ParsedCommand {
  fn?: FnDef;
  /** Words before the code: one or two entities, still to be resolved. */
  head: string;
  /** Words after the code: parameters, or (for `CODE entity`) an entity. */
  tail: string[];
}

/** Split what was typed into the words before a function code, the code, and the words after it.
 *  The code is the first word that is one, provided the words before it could be entities (a code
 *  is never the second word of a name: "new map" is a search, "DEU MAP" is a command). Purely
 *  lexical: resolving the entity words needs the knowledge web and happens elsewhere. */
export function parseCommand(text: string): ParsedCommand {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { head: '', tail: [] };
  // A code in first position, or in last position, is unambiguous. In between, prefer the last code
  // so that "USA CHN TRADE" and "AAPL WEB 2" both work.
  // A code in first place is a command only if the function can take the words after it (an entity,
  // free words, or parameters it knows): otherwise "Port Moresby" would run PORT.
  const first = fnByCode(words[0]);
  if (first && (words.length === 1 || takesWords(first, words.slice(1)))) return { fn: first, head: '', tail: words.slice(1) };
  for (let i = words.length - 1; i >= 1; i--) {
    const fn = fnByCode(words[i]);
    if (!fn) continue;
    const tail = words.slice(i + 1);
    // Words after a code must be parameters it knows (or free text it takes); otherwise this word is part of a name.
    if (tail.length && !tail.every((w) => fn.params?.some((p) => !p.values || p.values[w.toUpperCase()] !== undefined))) continue;
    return { fn, head: words.slice(0, i).join(' '), tail };
  }
  return { head: words.join(' '), tail: [] };
}

/** Whether a function can take these words after its code. */
function takesWords(fn: FnDef, tail: string[]) {
  if (fn.on || fn.params?.some((p) => !p.values)) return true;
  return tail.every((w) => fn.params?.some((p) => p.values && p.values[w.toUpperCase()] !== undefined));
}

const enc = encodeURIComponent;
const qs = (q: Record<string, string | undefined>) => { const s = Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${enc(v!)}`).join('&'); return s ? `?${s}` : ''; };
/** Parameters typed after a code, as query-string entries. Words that fit no parameter are returned as `rest`. */
export function readParams(fn: FnDef, tail: string[]) {
  const query: Record<string, string> = {}; const rest: string[] = [];
  for (const w of tail) {
    const p = fn.params?.find((x) => x.values && x.values[w.toUpperCase()] !== undefined && query[x.query] === undefined);
    if (p) query[p.query] = p.values![w.toUpperCase()]; else rest.push(w);
  }
  const free = fn.params?.find((x) => !x.values);
  if (free && rest.length) { query[free.query] = rest.join(' '); rest.length = 0; }
  return { query, rest };
}

/** Whether a function can act on an entity of this type. */
export const fnApplies = (fn: FnDef, type: EntityType) => !!fn.on?.includes(type);
/** The profile section a function opens for an entity of this type (undefined for page functions). */
export const sectionOf = (fn: FnDef, type: EntityType) => (fn.entity && !fn.entity.page ? fn.entity.hashByType?.[type] ?? fn.entity.hash : undefined);
/** Whether a function can act on this particular entity: its type, and, for a profile section that
 *  only some entities have, whether this one has it. */
export function fnAppliesTo(fn: FnDef, e: { id: string; type: string }) {
  if (!fnApplies(fn, e.type as EntityType)) return false;
  const only = SECTION_ONLY[sectionOf(fn, e.type as EntityType) || '']?.[e.type as EntityType];
  return !only || only.includes(e.id);
}
const shortName = (id: string) => { const k = id.split(':')[1] || id; return id.startsWith('igo:') ? k.toUpperCase() : k.replace(/-/g, ' '); };
/** The functions that act on an entity of this type, in registry order. */
export const functionsFor = (type: EntityType) => FUNCTIONS.filter((f) => fnApplies(f, type));

/** The address a command leads to, or why it cannot run. `entities` are already resolved; pass the
 *  loaded entity when none was typed. */
export function commandUrl(fn: FnDef, entities: CmdEntity[], tail: string[] = []): { url: string } | { error: string } {
  const { query } = readParams(fn, tail);
  const [a, b] = entities;
  if (fn.on && a) {
    if (!fnAppliesTo(fn, a)) {
      const can = functionsFor(a.type).filter((f) => fnAppliesTo(f, a)).slice(0, 8).map((f) => f.code).join(' ');
      const only = fnApplies(fn, a.type) ? SECTION_ONLY[sectionOf(fn, a.type) || '']?.[a.type] : undefined;
      return { error: only
        ? `${fn.code} (${fn.title}) is shown only for ${only.map(shortName).join(', ')} among ${a.type === 'igo' ? 'organizations' : `${a.type} profiles`}, not for ${a.name || a.id}. For this one try: ${can}`
        : `${fn.code} (${fn.title}) does not apply to ${a.name || a.id}: it works on ${fn.on.join(', ')}. For this one try: ${can}` };
    }
    const e = fn.entity!;
    const value = (x: CmdEntity) => (e.as === 'iso3' ? x.iso3 || x.id.split(':')[1] : x.id);
    if (e.page) {
      if (fn.code === 'NOTE' && query.new) return { url: `/research/new${qs({ entities: a.id })}` };
      return { url: `${e.page}${qs({ ...(e.query || {}), [e.param!]: value(a), ...(b && e.second && fnApplies(fn, b.type) ? { [e.second]: value(b) } : {}), ...query })}` };
    }
    const hash = sectionOf(fn, a.type);
    return { url: `/entity/${enc(a.id)}${hash ? `#${hash}` : ''}` };
  }
  if (fn.on && fn.need !== 'optional') return { error: `${fn.code} (${fn.title}) needs ${fn.on.length === ANY.length ? 'an entity' : `a ${fn.on.join(' or ')}`}: type its name or code first, for example ${fn.examples[0]}` };
  if (!fn.page) return { error: `${fn.code} has no screen of its own` };
  return { url: `${fn.page}${qs({ ...(fn.query || {}), ...query })}` };
}

/** The function a location shows (for the function bar and for workspace panes), with the entity
 *  it is about when the address names one. The most specific match wins. */
export function fnAt(loc: { pathname: string; search: string; hash: string }): { fn: FnDef; entityId?: string } | undefined {
  const sp = new URLSearchParams(loc.search); const hash = loc.hash.replace(/^#/, '');
  const m = /^\/entity\/([^/]+)$/.exec(loc.pathname);
  if (m) {
    // A malformed address ("/entity/100%") is not an entity: decoding it must not break the page.
    let id: string; try { id = decodeURIComponent(m[1]); } catch { return { fn: fnByCode('DES')! }; }
    const fn = FUNCTIONS.find((f) => f.entity && !f.entity.page && ((f.entity.hash || '') === hash || Object.values(f.entity.hashByType || {}).includes(hash))) || fnByCode('DES')!;
    return { fn, entityId: id };
  }
  let best: { fn: FnDef; entityId?: string; score: number } | undefined;
  for (const f of FUNCTIONS) {
    if (f.entity?.page === loc.pathname && sp.get(f.entity.param!)) {
      const raw = sp.get(f.entity.param!)!;
      const c = { fn: f, entityId: f.entity.as === 'iso3' ? `country:${raw}` : raw, score: 10 };
      if (!best || c.score > best.score) best = c;
    }
    if (f.page === loc.pathname) {
      const want = Object.entries(f.query || {});
      if (!want.every(([k, v]) => sp.get(k) === v)) continue;
      const c = { fn: f, score: 1 + want.length * 2 };
      if (!best || c.score > best.score) best = c;
    }
  }
  return best && { fn: best.fn, entityId: best.entityId };
}

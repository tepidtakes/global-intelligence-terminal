// Offline checks for the knowledge web: links that corroborate or dispute each other, the Wikidata
// backbone (countries, organizations, central banks, cities, companies), data links (trade,
// sanctions, news), computed weights, the indicator catalog, and the connections API.
// Loaders run through their connectors against a seeded cache — no network.
// Run: npm run check:web
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-web-check-'));
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const fx = (dir: string, f: string) => JSON.parse(fs.readFileSync(path.join('scripts/fixtures', dir, f), 'utf8'));
const seed = (key: string, payload: unknown) => {
  const dir = path.join(process.env.TERMINAL_DATA_DIR!, 'cache'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, crypto.createHash('sha1').update(key).digest('hex') + '.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), payload }));
};

const G = await imp('server/graph.ts');
const CON = await imp('server/web/connectors.ts');
const W = await imp('server/web/wikidata.ts');
const L = await imp('server/web/links.ts');
const WT = await imp('server/web/weights.ts');
const CAT = await imp('server/web/catalog.ts');
const CN = await imp('server/web/connections.ts');
const EC = await imp('server/econCalendar.ts');
const S = await imp('server/sanctions.ts');
const CH = await imp('server/changes.ts');

let failures = 0;
const ok = (cond: unknown, label: string, detail?: unknown) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`); if (!cond) failures++; };
const rows = (k: string) => WD[k].results.bindings;
const WD = fx('web', 'wikidata.json');
const rel = (from: string, to: string, type: string) => G.relsOfType(from, type, 'out').filter((r: any) => r.to === to);

// ───────────────────────── Parsers ─────────────────────────
console.log('Wikidata parsers');
const names = W.parseCountryNames(rows('countries'));
ok(names.NLD.qid === 'Q55' && names.NLD.names.includes('Niederlande') && !names.NLD.names.includes('Koninkrijk der Nederlanden'), 'two items share a country code: the better-known one wins', names.NLD);
ok(names.DEU.names.length === 5 && names.DEU.sitelinks === 340, 'names in several languages kept per country');
const det = W.parseCountryDetails(rows('countryDetails'));
ok(det.USA.currencies.join() === 'USD' && det.USA.forms.length === 2 && det.DEU.currencies.join() === 'EUR', 'current currency and forms of government');
const groups: [string[], string | undefined][] = [[['absolute monarchy'], 'monarchy'], [['one-party state', 'socialist state'], 'one-party'], [['federal republic', 'presidential system'], 'presidential'], [['federal parliamentary republic'], 'parliamentary'], [['constitutional monarchy', 'parliamentary system'], 'parliamentary'], [['republic'], undefined]];
ok(groups.every(([f, g]) => W.govGroupOf(f) === g), 'forms of government → the four map groups (unclear forms stay unclassified)', groups.map(([f]) => W.govGroupOf(f)));
const mem = W.parseMemberships(rows('memberships'));
ok(mem.find((m: any) => m.iso3 === 'FIN' && m.org === 'Q7184')?.start === '2023-04-04' && mem.find((m: any) => m.iso3 === 'USA' && m.org === 'Q7184')?.start === '1949', 'membership dates: exact days kept, 1 January dates shown as years');
const orgIds = W.orgsWithMembers(mem);
ok(orgIds.includes('Q41550') && !orgIds.includes('Q999001'), 'organizations need three member countries to be shown', orgIds);
const orgs = W.parseOrgDetails(rows('orgs'));
ok(orgs.find((o: any) => o.qid === 'Q41550')?.short === 'OECD' && orgs.find((o: any) => o.qid === 'Q7184')?.aliases.includes('North Atlantic Treaty Organization'), 'organization names, short names and aliases');
ok(W.yahooSymbol('5', 'XHKG') === '0005.HK' && W.yahooSymbol('BRK.B', 'XNYS') === 'BRK-B' && W.yahooSymbol('7203', 'XTKS') === '7203.T' && W.yahooSymbol('SIE', 'XETR') === 'SIE.DE' && W.yahooSymbol('X', 'ZZZZ') === undefined,
  'quote symbols from exchange codes (Hong Kong padding, US share classes, unknown exchanges skipped)');
const cos = W.parseCompanies(rows('companies'));
const toyota = cos.find((c: any) => c.qid === 'Q53268'); const hsbc = cos.find((c: any) => c.qid === 'Q190464');
ok(toyota.listings.length === 2 && W.primaryListing(toyota).symbol === '7203.T' && W.primaryListing(hsbc).symbol === 'HSBA.L', 'several listings per company; the home exchange is the primary one', [W.primaryListing(toyota), W.primaryListing(hsbc)]);
const cities = W.parseCities([...rows('capitals'), ...rows('bigCities')]);
ok(cities.length === 6 && cities.find((c: any) => c.qid === 'Q1726').pop === 1512491 && cities.find((c: any) => c.qid === 'Q64').capitalOf.join() === 'DEU', 'cities: capitals and big cities merged, largest population kept', cities.length);

// ───────────────────────── Connectors, against the seeded cache ─────────────────────────
console.log('\nWikidata connectors');
const banks = W.parseBanks(rows('banks'));
const coMap = new Map(cos.map((c: any) => [c.qid, c])); W.parseCompanyDetails(rows('companyDetails'), coMap);
seed('wd:countries:v1', { names, details: det });
seed('wd:cities:v1', cities);
seed('wd:organizations:v1', { memberships: mem.filter((m: any) => orgIds.includes(m.org)), orgs, leaders: W.parseHolders(rows('orgLeaders'), 'org') });
seed('wd:central-banks:v1', { banks, heads: W.parseHolders(rows('bankHeads'), 'bank') });
seed('wd:companies:25:v1', [...coMap.values()]);
for (const id of ['wikidata-countries', 'wikidata-cities', 'wikidata-organizations', 'wikidata-central-banks', 'wikidata-companies']) {
  const st = await CON.runConnector(id);
  ok(st?.ok, `${id}: ${st?.detail}`, st);
}
ok(G.countryIdByName('Allemagne') === 'country:DEU' && G.countryIdByName('Vereinigte Staaten') === 'country:USA', 'names in other languages resolve to the country (used by every source reader)');
ok(G.search('Deutschland', { limit: 1 })[0]?.id === 'country:DEU' && G.getEntity('country:DEU').attrs.wikidata === 'Q183', 'search finds countries by their names in other languages; Wikidata id recorded');
ok(G.getEntity('country:SWZ').attrs.govGroupWd === 'monarchy' && (G.getEntity('country:USA').facts || []).some((f: any) => f.label === 'Form of government'), 'form of government added for the map and the profile');

console.log('\nOrganizations, discovered from memberships');
ok(G.getEntity('igo:nato').attrs.wikidata === 'Q7184' && !G.getEntity('igo:wd-q7184'), 'a hand-checked organization is matched by name, not duplicated');
const oecd = G.getEntity('igo:wd-q41550');
ok(oecd && oecd.name === 'Organisation for Economic Co-operation and Development' && oecd.aliases.includes('OECD') && /5 member countries/.test(oecd.summary), 'new organization added from the data (OECD), with members counted', oecd?.summary);
ok(G.membersOf('igo:wd-q41550').length === 5 && G.membersByName('International Energy Agency', []).includes('JPN'), 'member sets come from the graph (e.g. the IEA, used by the reserves notes)');
const usNato = rel('country:USA', 'igo:nato', 'member_of');
ok(usNato.length === 1 && usNato[0].alsoIn?.includes('wikidata-orgs'), 'a membership both sources report is one link with two sources (✓ 2 sources)', usNato);
const gbEu = rel('country:GBR', 'igo:eu', 'member_of');
ok(gbEu.length === 1 && gbEu[0].validTo && gbEu[0].disputes?.some((d: any) => /lists this as current/.test(d.detail)), 'a source that disagrees (UK still in the EU) is recorded as a dispute, not a second link', gbEu);
ok(rel('country:FIN', 'igo:nato', 'member_of').length === 1 && rel('country:FIN', 'igo:nato', 'member_of')[0].alsoIn?.includes('wikidata-orgs'), 'Finland’s 2023 accession: both sources agree');
await CON.runConnector('wikidata-organizations');
ok(rel('country:USA', 'igo:nato', 'member_of')[0].alsoIn.filter((s: string) => s === 'wikidata-orgs').length === 1 && rel('country:GBR', 'igo:eu', 'member_of')[0].disputes.length === 1, 'a refresh replaces its marks instead of piling them up');
ok(G.relsOfType('igo:nato', 'leads', 'in').some((r: any) => G.getEntity(r.from).name === 'Mark Rutte' && (r.origin === 'wikidata-org-leaders' || r.alsoIn?.includes('wikidata-orgs'))), 'organization leaders linked (NATO Secretary-General, confirming the hand-checked record)');
ok(G.relsOfType('igo:wd-q41550', 'headquartered_in', 'out').some((r: any) => r.to === 'city:paris'), 'seat linked to the city record (Paris matched by Wikidata id after the city loader)');
// Later loads: a new member and a departure become alerts (synthetic changes on top of the sample data).
W.applyOrganizations({ memberships: [...mem.filter((m: any) => orgIds.includes(m.org)), { iso3: 'SWE', org: 'Q41550', start: '1961' }, { iso3: 'MEX', org: 'Q826700', start: '2018', end: '2026-06-30' }], orgs, leaders: W.parseHolders(rows('orgLeaders'), 'org') }, new Date().toISOString());
const igoCh = CH.recentChanges({ kinds: ['igo'] });
ok(igoCh.some((c: any) => /Sweden is a member of Organisation for Economic/.test(c.title)) && igoCh.some((c: any) => /Mexico left International Energy Agency \(2026-06-30/.test(c.title)) && igoCh.length === 2, 'membership changes after the first load become alerts (the first load is a silent baseline)', igoCh.map((c: any) => c.title));

console.log('\nCentral banks, cities, companies');
ok(G.relsOfType('country:USA', 'central_bank_of', 'in')[0]?.from === 'institution:wd-q53536', 'one central bank per country: the Federal Reserve System, not a regional Reserve Bank');
ok(G.relsOfType('igo:eu', 'central_bank_of', 'in')[0]?.from === 'institution:wd-q8901' && G.relsOfType('country:DEU', 'central_bank_of', 'in')[0]?.from === 'institution:wd-q153407', 'the ECB serves the euro area (its jurisdiction), the Bundesbank Germany');
ok(G.relsOfType('institution:wd-q8901', 'leads', 'in').some((r: any) => G.getEntity(r.from).name === 'Christine Lagarde') && G.geoAnchor('institution:wd-q53536') === 'country:USA', 'governors linked; a central bank sits in its country on the map');
ok(G.getEntity('city:berlin').attrs.wikidata === 'Q64' && !G.getEntity('city:wd-q64') && G.getEntity('city:wd-q8673')?.attrs.tier === 1, 'cities: Berlin matched, Lagos added (tier 1: over 10 million)');
ok(rel('city:berlin', 'country:DEU', 'capital_of')[0]?.alsoIn?.includes('wikidata-cities'), 'capital confirmed by a second source');
ok(G.getEntity('company:apple').attrs.wikidata === 'Q312' && !G.getEntity('company:wd-q312'), 'Apple matched to the hand-checked company by its ticker');
ok((G.getEntity('company:apple').attrs.leaderNotes || []).some((n: string) => /John Ternus/.test(n) && /Tim Cook/.test(n)) && !G.relsOfType('company:apple', 'leads', 'in').some((r: any) => r.origin), 'a different CEO on Wikidata is flagged for checking, not added beside the hand-checked one');
ok(G.getEntity('company:siemens').attrs.wikidata === 'Q81230' && G.getEntity('company:hsbc').attrs.wikidata === 'Q190464' && G.getEntity('company:siemens').attrs.quoteSymbol === 'SIE.DE', 'hand-checked companies matched by their quote symbols (Siemens, HSBC), their data kept');
const nex = G.getEntity('company:wd-q900100');
ok(nex && nex.attrs.quoteSymbol === 'NEXR.ST' && rel('company:wd-q900100', 'city:berlin', 'headquartered_in').length === 1 && G.relsOfType('company:wd-q900100', 'leads', 'in').some((r: any) => G.getEntity(r.from).name === 'Erika Example'),
  'new company from the data: live quote symbol, head office city (matched by Wikidata id), chief executive', nex?.attrs);
ok(G.relsOfType('company:wd-q900100', 'subsidiary_of', 'out').length === 0, 'a parent company not in the web is left out (never a dangling link)');
const ind = W.applyCompanies(['A', 'B', 'C'].map((x, i) => ({ qid: `Q88800${i}`, label: `Example ${x} Shipping`, sitelinks: 30, listings: [], industries: [{ qid: 'Q888999', label: 'shipping industry' }] })), new Date().toISOString());
ok(ind.industries >= 1 && G.getEntity('industry:wd-q888999')?.name === 'Shipping industry' && G.relsOfType('industry:wd-q888999', 'in_industry', 'in').length === 3, 'an industry used by three or more companies becomes a node');

// ───────────────────────── Weights ─────────────────────────
console.log('\nComputed weights');
WT.setSharesForTest({ year: '2026', source: 'IMF World Economic Outlook', byIso3: { USA: 26, CHN: 17, DEU: 4.3, JPN: 3.7, FRA: 3, GBR: 3.4, ITA: 2.2, CAN: 2.1, LUX: 0.07 }, at: new Date().toISOString() });
const wUS = WT.economyWeight('country:USA'), wDE = WT.economyWeight('country:DEU'), wLU = WT.economyWeight('country:LUX');
ok(wUS[0] === 3 && /26% of world GDP/.test(wUS[1]) && wDE[0] === 1.5 && wLU[0] === 0, 'economy weight grows with the log of the GDP share (US 3, Germany 1.5, Luxembourg 0)', [wUS, wDE, wLU]);
const wNato = WT.economyWeight('igo:nato');
ok(wNato[0] === 2.5 && /members combined/.test(wNato[1]), 'an organization’s weight is its members’ combined share (forums capped at 2.5)', wNato);
ok(EC.grade(6, 'Policy-rate decision', ['country:DEU']).importance === 8 && EC.grade(6, 'x', ['country:DEU']).importanceWhy[1].includes('4.3% of world GDP'), 'the calendar’s importance uses the computed weight and says why');
ok(WT.sharesFrom({ USA: { 2026: 30 }, DEU: { 2026: 10 }, XXX: { 2026: 60 } }, '2026').USA === 75, 'shares are of the countries in the web (aggregates and unknown codes ignored)');

// ───────────────────────── Data links ─────────────────────────
console.log('\nData links: trade, sanctions, news');
// Partner codes as parsePartners returns them (ISO numeric; Comtrade's 842 for the US is already mapped to 840).
const usP = { year: '2024', partners: [{ ccn3: '156', exports: 143.5e9, imports: 438.9e9 }, { ccn3: '484', exports: 334e9, imports: 505.9e9 }, { ccn3: '490', exports: 42e9, imports: 116e9 }], world: { exports: 2.06e12, imports: 3.27e12 } };
const cnP = { year: '2024', partners: [{ ccn3: '840', exports: 524.7e9, imports: 163.6e9 }], world: { exports: 3.58e12, imports: 2.59e12 } };
const tl = [...L.tradeLinks('USA', usP), ...L.tradeLinks('CHN', cnP)];
ok(tl.length === 3 && tl[0].value === 582.4e9 && tl[0].data.share === 10.93 && !tl.some((r: any) => r.to === 'country:TWN'), 'trade links sized by goods trade; unattributed areas (Comtrade 490) not guessed', tl.map((r: any) => [r.from, r.to, r.value]));
G.setLiveRels('trade-web', tl);
const usWeb = CN.connectionsFor('country:USA');
const trade = usWeb.groups.find((g: any) => g.type === 'trades_with');
const chn = trade.items.find((i: any) => i.other.id === 'country:CHN');
ok(trade.label === 'Trade partners' && trade.items[0].other.id === 'country:MEX' && chn.data.own.imports === 438.9e9 && chn.data.mirror.exports === 163.6e9 && chn.data.mirror.imports === 524.7e9,
  'one trade entry per partner, ranked by size, with both countries’ reports side by side', chn);
const stories = [
  { title: 'A', url: 'u1', date: '2026-11-04T10:00:00Z', tags: [{ id: 'country:USA' }, { id: 'country:CHN' }, { id: 'company:apple' }] },
  { title: 'B', url: 'u2', date: '2026-11-05T10:00:00Z', tags: [{ id: 'country:USA' }, { id: 'country:CHN' }] },
  { title: 'C', url: 'u3', date: '2026-11-03T10:00:00Z', tags: [{ id: 'country:USA' }, { id: 'company:apple' }] },
  { title: 'D', url: 'u4', date: '2026-11-03T11:00:00Z', tags: [{ id: 'country:FRA' }, { id: 'country:DEU' }] },
];
const nl = L.newsLinks(stories);
ok(nl.length === 2 && nl.find((r: any) => r.from === 'country:CHN' && r.to === 'country:USA')?.value === 2 && nl.find((r: any) => r.to === 'country:USA' && r.from === 'company:apple')?.data.last.title === 'A', 'news links: entities named together in 2+ stories, with the latest headline; one-off pairs dropped', nl);
const S_FX = (f: string) => fs.readFileSync(path.join('scripts/fixtures/trade', f), 'utf8');
seed('sanctions:US:v2', S.parseOfac(S_FX('ofac-sdn.csv'), S_FX('ofac-add.csv'), S_FX('ofac-alt.csv'))); seed('sanctions:UN:v2', S.parseUn(S_FX('un-consolidated.xml')));
seed('sanctions:EU:v2', S.parseByHeader(S_FX('eu-fsf.csv'), 'EU')); seed('sanctions:UK:v2', S.parseByHeader(S_FX('uk-sanctions.csv'), 'UK'));
await S.refreshSanctions(); await new Promise((r) => setTimeout(r, 50));
const sanc = G.relsOfType('country:USA', 'sanctions', 'out');
ok(sanc.some((r: any) => r.to === 'country:RUS' && r.data.programmes.some((p: any) => p.program === 'RUSSIA-EO14024')) && G.relsOfType('igo:eu', 'sanctions', 'out').some((r: any) => r.to === 'country:RUS'), 'sanctions links from each imposer to the countries its programmes target (rebuilt when the lists load)', sanc.map((r: any) => r.to));

// ───────────────────────── Catalog ─────────────────────────
console.log('\nIndicator catalog');
const CF = fx('web', 'catalogs.json');
const wbList = CAT.parseWbCatalog(CF.wb), imfList = CAT.parseImfCatalog(CF.imf);
ok(wbList.length === 4 && wbList.find((m: any) => m.code === 'SP.DYN.LE00.IN').unit === 'years' && wbList.find((m: any) => m.code === 'EN.ATM.CO2E.PC').topics.includes('Climate Change'), 'World Bank catalog: names, units from the name, topics');
ok(imfList.length === 3 && imfList.every((m: any) => m.label), 'IMF catalog: entries without a name dropped');
seed('catalog:wb:v1', wbList); seed('catalog:imf:v1', imfList);
const catRun = await CON.runConnector('indicator-catalog');
ok(catRun.ok && CAT.searchMetrics('life expectancy')[0]?.id === 'wb:SP.DYN.LE00.IN' && CAT.searchMetrics('primary balance')[0]?.id === 'imf:GGXONLB_G01_GDP_PT' && CAT.searchMetrics('NY.GDP.MKTP.CD')[0]?.id === 'wb:NY.GDP.MKTP.CD',
  'any series searchable by words or code', CAT.searchMetrics('life expectancy').map((m: any) => m.id));
ok(CAT.searchMetrics('gdp').length >= 2 && CAT.metricMeta('wb:SP.POP.TOTL')?.topics.includes('Featured'), 'hand-labelled series stay available (and ranked first) alongside the catalog');

// ───────────────────────── Connections API ─────────────────────────
console.log('\nConnections');
const oecdWeb = CN.connectionsFor('igo:wd-q41550');
const members = oecdWeb.groups.find((g: any) => g.key === 'member_of:in');
ok(members.label === 'Members' && members.total === 6 && members.items.every((i: any) => i.sources.includes('wikidata-orgs')), 'an organization’s members (incl. Sweden, added by the later load above), each with its source', members.total);
const natoMembers = CN.connectionsFor('igo:nato').groups.find((g: any) => g.key === 'member_of:in');
ok(natoMembers.items.find((i: any) => i.other.id === 'country:USA').sources.length === 2, 'two-source memberships show both sources');
const nb = CN.neighborhood('igo:nato', { perGroup: 40 });
ok(nb.nodes.find((n: any) => n.focus).id === 'igo:nato' && nb.nodes.some((n: any) => n.id === 'country:USA') && nb.links.some((l: any) => l.source !== 'igo:nato' && l.target !== 'igo:nato'), 'neighborhood network includes links among the neighbors (a web, not a star)', nb.links.filter((l: any) => l.source !== 'igo:nato' && l.target !== 'igo:nato').slice(0, 3));
ok(nb.nodes.find((n: any) => n.id === 'country:USA').weight > nb.nodes.find((n: any) => n.id === 'country:CAN').weight, 'nodes sized by data (share of world GDP)');
const wl = CN.webLayer('igo:wd-q41550');
ok(wl.values.USA === 'member_of:in' && wl.categories.some((c: any) => c.key === 'member_of:in') && wl.values.FRA === 'self', 'map layer: where an entity is connected (and its home country)', wl);
const st = CN.webStats();
ok(st.links > 2000 && st.corroborated > 0 && st.disputed > 0 && st.byType.trades_with === 3, 'web statistics: links, corroborated and disputed', { links: st.links, corroborated: st.corroborated, disputed: st.disputed });

fs.rmSync(process.env.TERMINAL_DATA_DIR!, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : '\nAll web checks passed');
process.exitCode = failures ? 1 : 0;

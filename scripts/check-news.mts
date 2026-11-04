// Offline checks for the trusted-news pipeline: feed parsing (RSS 2.0, RDF, Atom, Google
// News search), URL/title normalisation, entity tagging against the real graph, story
// clustering, signal extraction and reconciliation with curated records.
// Run: npm run check:news   (no network needed; uses scripts/fixtures/news)
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-news-check-'));
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const P = await imp('server/newsParse.ts');
const G = await imp('server/graph.ts');
const N = await imp('server/newsroom.ts');
const S = await imp('shared/newsSources.ts');

let failures = 0;
const ok = (cond: unknown, label: string, detail?: unknown) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`);
  if (!cond) failures++;
};
const fixture = (f: string) => {
  const now = Date.now();
  return fs.readFileSync(path.join('scripts/fixtures/news', f), 'utf8')
    .replaceAll('{{D1}}', new Date(now - 2 * 3600_000).toUTCString()).replaceAll('{{D2}}', new Date(now - 26 * 3600_000).toUTCString());
};

console.log('Publisher tiers');
ok(S.tierForDomain('www.reuters.com') === 'wire', 'reuters.com → wire');
ok(S.tierForDomain('edition.cnn.com') === 'major', 'subdomain resolves (edition.cnn.com → major)');
ok(S.tierForDomain('www.treasury.gov') === 'official', '.gov domain → official');
ok(S.tierForDomain('www.gov.uk') === 'official', 'gov.uk → official');
ok(S.tierForDomain('tass.com') === 'state-media', 'tass.com → state media');
ok(S.tierForDomain('random-blog.example') === 'unrated', 'unknown domain → unrated');

console.log('\nParsing & normalisation');
const rss = P.parseFeed(fixture('bbc-world.xml'));
ok(rss.length === 5, 'RSS 2.0 items parsed', rss.length);
ok(rss[3].summary?.includes('China’s commerce ministry'), 'numeric entities decoded', rss[3].summary);
const rdf = P.parseFeed(fixture('dw-rdf.xml'));
ok(rdf.length === 2 && rdf[0].published, 'RSS 1.0 / RDF items parsed with dc:date', rdf.length);
const atom = P.parseFeed(fixture('official-atom.xml'));
ok(atom.length === 1 && atom[0].url.startsWith('https://www.federalreserve.gov/'), 'Atom entry parsed with alternate link', atom[0]);
const gn = P.parseFeed(fixture('reuters-search.xml'));
ok(gn[0].sourceUrl === 'https://www.reuters.com' && gn[0].sourceName === 'Reuters', 'Google News <source> captured', gn[0]);
ok(P.stripPublisherSuffix(gn[0].title, 'Reuters') === 'Apple names John Ternus CEO, Cook to become executive chairman', 'publisher suffix stripped');
ok(P.canonicalUrl('http://www.cnbc.com/a/b.html?utm_source=rss&id=3#top') === 'https://cnbc.com/a/b.html?id=3', 'canonical URL drops tracking + fragment', P.canonicalUrl('http://www.cnbc.com/a/b.html?utm_source=rss&id=3#top'));

console.log('\nTagging against the entity graph');
const tagger = N.buildTagger();
const ids = (title: string, summary = '') => tagger.tag(title, summary).map((t: any) => t.id);
ok(ids('Apple names John Ternus as CEO').includes('company:apple'), 'Apple (company) tagged with business context');
ok(!ids('The best apple pie recipes for autumn baking').includes('company:apple'), 'lower-case "apple" not tagged');
ok(!ids('Shell shock: why the market sell-off caught everyone out').includes('company:shell'), '"Shell shock" without business context not tagged', ids('Shell shock: why the market sell-off caught everyone out'));
ok(ids('Shell profit beats forecasts on strong LNG trading').includes('company:shell'), 'Shell tagged when business context present');
ok(ids('Georgia protesters rally in Tbilisi against new media law').includes('country:GEO'), 'Georgia (country) with Tbilisi context', ids('Georgia protesters rally in Tbilisi against new media law'));
ok(ids('Georgia governor signs election bill in Atlanta as US midterms near').includes('state:US-GA'), 'Georgia (US state) with US context', ids('Georgia governor signs election bill in Atlanta as US midterms near'));
const chips = ids('Beijing warns Washington over new chip export controls');
ok(chips.includes('country:CHN') && chips.includes('country:USA'), 'capital metonyms → countries', chips);
ok(ids('Chinese EV maker BYD expands in Europe').includes('country:CHN'), 'demonym → country');
ok(ids('Oil prices climb as OPEC+ signals deeper output cuts').includes('commodity:crude-oil') || ids('Oil prices climb as OPEC+ signals deeper output cuts').some((x: string) => x.startsWith('commodity:')), 'commodity tagged with market context', ids('Oil prices climb as OPEC+ signals deeper output cuts'));
ok(ids('Oil prices climb as OPEC+ signals deeper output cuts').includes('igo:opec-plus'), 'OPEC+ tagged', ids('Oil prices climb as OPEC+ signals deeper output cuts'));
ok(ids('New Mexico wildfire forces evacuations').includes('state:US-NM') && !ids('New Mexico wildfire forces evacuations').includes('country:MEX'), 'longest match: New Mexico ≠ Mexico');
ok(!ids('Chad Smith leads Red Hot Chili Peppers tour').length, 'first name "Chad" is not the country', ids('Chad Smith leads Red Hot Chili Peppers tour'));
ok(ids('Jordan hosts regional summit on Gaza ceasefire').includes('country:JOR'), '"Jordan hosts…" is the country');
ok(ids('Indian rupee hits record low against dollar').includes('country:IND'), 'demonym shared with a territory resolves to the sovereign state');
ok(!ids('Labour market cools as hiring slows in October').length && ids('Labour leadership race tightens as party conference opens').includes('party:uk-labour'), 'party name needs political context');
ok(!ids('Amazon rainforest fires hit record').length && ids('Amazon to cut 14,000 corporate jobs').includes('company:amazon'), 'Amazon: river vs company');
ok(!ids('Congo rebels seize town').length && ids('Congo rebels seize town near Goma').includes('country:COD'), 'ambiguous "Congo" tagged only with disambiguating context');
const tx = ids('Trump and Xi meet in Busan, agree to trade truce');
ok(tx.some((x: string) => x.startsWith('person:')) || !G.relsOfType('country:USA', 'head_of_state', 'in').length, 'sitting leaders matched by surname', tx);

console.log('\nSignal extraction');
const sig = (t: string) => P.extractSignals(t).map((s: any) => `${s.kind}:${s.person}:${s.role || ''}`);
ok(sig('Apple names John Ternus as CEO, succeeding Tim Cook').includes('appointment:John Ternus:ceo'), 'active appointment');
ok(sig('John Ternus Named Apple CEO As Tim Cook Steps Down').join() === 'appointment:John Ternus:ceo,departure:Tim Cook:ceo', 'Title Case appointment + departure', sig('John Ternus Named Apple CEO As Tim Cook Steps Down'));
ok(sig("Apple's John Ternus named chief executive").includes('appointment:John Ternus:ceo'), 'possessive does not join the name');
ok(sig('UK Prime Minister Keir Starmer resigns after leadership challenge').includes('departure:Keir Starmer:head-of-government'), 'role before name');
ok(sig('Lee Jae-myung wins South Korea presidential election').includes('election-win:Lee Jae-myung:'), 'election win');
ok(!sig('Nvidia taps Jane Doe as chief financial officer').length, 'unrecognised role ignored (CFO)');
ok(!sig('Fed holds rates steady as inflation cools').length, 'no false positive on ordinary headline');

console.log('\nIngest, clustering and reconciliation');
// A test election in Bolivia so an election result has something to attach to.
const elDate = new Date(Date.now() - 4 * 86400_000).toISOString().slice(0, 10);
G.upsertEntity({ id: 'event:test-bolivia-runoff', type: 'event', name: 'Test Bolivian presidential runoff', depth: 'baseline', facts: [], attrs: { category: 'election', date: elDate, status: 'outcome-not-recorded' }, sources: ['wikipedia-elections'] });
G.setLiveRels('test', [{ from: 'event:test-bolivia-runoff', to: 'country:BOL', type: 'affects' }]);
const feed = (id: string, kind: 'publisher' | 'search', publisherId?: string) => N.FEEDS.find((f: any) => f.id === id) || { id, name: id, url: '', topic: 'world', kind, publisherId };
N._test.ingest(feed('bbc-world', 'publisher', 'bbc'), fixture('bbc-world.xml'));
N._test.ingest(feed('reuters-wire', 'search'), fixture('reuters-search.xml'));
N._test.ingest(feed('dw-world', 'publisher', 'dw'), fixture('dw-rdf.xml'));
N._test.ingest(feed('cnbc-world', 'publisher', 'cnbc'), fixture('cnbc.xml'));
N._test.ingest(feed('fed-press', 'publisher', 'fed'), fixture('official-atom.xml'));
const arts = [...N._test.articles.values()];
ok(arts.length === 15, 'all headlines stored once', arts.length);
const apple = arts.filter((a: any) => /Ternus/.test(a.title));
ok(apple.length === 3 && new Set(apple.map((a: any) => a.cluster)).size === 1, 'three outlets’ Ternus headlines form one story', apple.map((a: any) => a.cluster));
ok(apple.find((a: any) => a.publisher === 'Reuters')?.tier === 'wire', 'Google News item attributed to Reuters (wire)');
ok(arts.find((a: any) => /federalreserve/.test(a.url))?.tier === 'official', 'Fed press release is official');
N._test.reconcileSignals();
const sigs = [...N._test.signals.values()];
const ternus = sigs.find((s: any) => s.kind === 'appointment' && s.person === 'John Ternus');
ok(ternus?.entityId === 'company:apple', 'Ternus signal targets Apple', ternus?.entityId);
ok(ternus?.strength === 'corroborated' && ternus.publishers.length === 3, 'corroborated by 3 outlets', ternus && { strength: ternus.strength, publishers: ternus.publishers });
ok(ternus?.status === 'differs-from-record', 'differs from curated CEO record', ternus?.status);
const appleE = G.getEntity('company:apple');
ok(appleE.facts.some((f: any) => f.quality === 'reported' && f.value === 'John Ternus' && f.sourceId === 'trusted-news'), 'Apple gets a "reported" fact');
ok(/Ternus/.test(G.getEntity('person:tim-cook').attrs?.newsNote || ''), 'Tim Cook profile flagged with a news note');
ok(G.getEntity('person:tim-cook').attrs?.newsNote && relsCurrent('person:tim-cook'), 'curated CEO relationship is NOT deleted (flag only)');
const sawan = sigs.find((s: any) => s.kind === 'departure' && s.person === 'Wael Sawan');
ok(sawan?.strength === 'single-source' && !G.getEntity('person:wael-sawan').attrs?.newsNote, 'single-source departure listed but not flagged on the profile', sawan && { strength: sawan.strength });
const paz = sigs.find((s: any) => s.kind === 'election-win' && s.person === 'Rodrigo Paz');
ok(paz?.strength === 'corroborated' && paz.relatedIds?.includes('event:test-bolivia-runoff'), 'Bolivia result corroborated (Reuters + DW) and linked to the election', paz && { strength: paz.strength, related: paz.relatedIds });
ok(G.getEntity('event:test-bolivia-runoff').attrs?.reportedOutcome?.winner === 'Rodrigo Paz', 'election gets a reported winner');
ok(!sigs.some((s: any) => s.person === 'Ana Pereira'), 'untagged (fictional) country produces no signal');
N._test.reconcileSignals();
ok(G.getEntity('company:apple').facts.filter((f: any) => f.sourceId === 'trusted-news').length === 1, 'reconciling twice does not duplicate facts');

const news = N.newsFor('company:apple');
ok(news.length === 1 && news[0].corroboration === 3, 'entity news returns one story with corroboration 3', news.map((n: any) => [n.title, n.corroboration]));
ok(news[0].tier === 'wire', 'lead headline is from the highest-tier outlet', news[0]?.tier);

function relsCurrent(id: string) { return G.relsOfType(id, 'leads', 'out').some((r: any) => r.to === 'company:apple' && !r.validTo); }

fs.rmSync(process.env.TERMINAL_DATA_DIR!, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : '\nAll news checks passed');
process.exitCode = failures ? 1 : 0;

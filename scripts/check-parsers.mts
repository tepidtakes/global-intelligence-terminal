// Offline checks for live-data parsers and matchers added for rates, elections, prediction
// markets and local politics. No network: fixtures in scripts/fixtures/{markets,elections}.
// Run: npm run check:parsers
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-parsers-check-'));
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const fx = (dir: string, f: string) => fs.readFileSync(path.join('scripts/fixtures', dir, f), 'utf8');
// Seed the provider cache so loaders run against fixtures instead of the network.
const seed = (key: string, payload: unknown) => {
  const dir = path.join(process.env.TERMINAL_DATA_DIR!, 'cache'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, crypto.createHash('sha1').update(key).digest('hex') + '.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), payload }));
};

const M = await imp('server/markets.ts');
const EP = await imp('server/electionParse.ts');
const E = await imp('server/elections.ts');
const PM = await imp('server/predictionMarkets.ts');
const LP = await imp('server/localPolitics.ts');
const G = await imp('server/graph.ts');

let failures = 0;
const ok = (cond: unknown, label: string, detail?: unknown) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`); if (!cond) failures++; };
const near = (a: number | undefined, b: number, eps = 1e-6) => a != null && Math.abs(a - b) < eps;

console.log('Rates');
const boe = M.parseBoeCurve(fx('markets', 'boe.csv'));
ok(boe.kind === 'par' && boe.rows.length === 2, 'Bank of England: par yields preferred over zero-coupon', boe.kind);
ok(near(boe.rows.at(-1).points.find((p: any) => p.years === 10)?.value, 4.461), '10-year par yield read by series code, not column position');
ok(M.parseBoeCurve('DATE,IUDSNZC,IUDMNZC,IUDLNZC\n03 Nov 2026,3.9,4.54,5.15\n').kind === 'zero', 'falls back to zero-coupon when par series are missing');
const irs = M.parseEcbIrs(fx('markets', 'ecb-irs.csv'));
ok(irs.length === 5 && irs.some((p: any) => p.area === 'BG' && p.v === 3.95), 'ECB convergence yields parsed (incl. Bulgaria, not covered by the OECD)');
ok(irs.find((p: any) => p.area === 'RO')?.t === '2026-09', 'non-euro member (Romania, RON) included with its own period');

console.log('\nElection infoboxes');
const bol = EP.parseElectionInfobox(fx('elections', 'bolivia-2025.wiki'));
const bolOut = EP.electionOutcome(bol, '2026-11-04');
ok(bolOut.status === 'completed' && bolOut.winner?.name === 'Rodrigo Paz', 'completed presidential runoff: winner from after_election', bolOut.winner);
ok(near(bol.contenders[0].pct, 54.96) && near(bol.contenders[0].firstRoundPct, 32.06) && bol.contenders[0].votes === 3251145, 'votes, second-round % and first-round % parsed', bol.contenders[0]);
ok(bol.dates.join() === '2025-08-17,2025-10-19', 'both round dates parsed', bol.dates);
ok(bol.pollsArticle === 'Opinion polling for the 2025 Bolivian general election', 'opinion-polling article linked');
const pa = EP.parseElectionInfobox(fx('elections', 'midterms-upcoming.wiki'));
ok(EP.electionOutcome(pa, '2026-10-01').status === 'scheduled', 'before polling day: scheduled');
ok(EP.electionOutcome(pa, '2026-11-04').status === 'counting' && !EP.electionOutcome(pa, '2026-11-04').winner, 'day after, winner still "TBD": counting, no winner invented');
ok(pa.contenders.map((c: any) => c.name).join() === 'Josh Shapiro,Stacy Garrity' && pa.contenders[0].partyLink === 'Democratic Party (United States)', 'nominees and unlinked party titles read', pa.contenders);
const de = EP.parseElectionInfobox(fx('elections', 'legislative.wiki'));
const deOut = EP.electionOutcome(de, '2026-11-04');
ok(de.legislative && deOut.leader?.seats === 208 && deOut.winner?.name === 'Friedrich Merz', 'parliamentary: seats ranked, head of government from after_election');
const party = EP.parsePartyInfobox(fx('elections', 'party.wiki'));
ok(party.ideology.join() === 'Christian democracy,Conservatism,Economic liberalism' && party.position === 'Centre-right', 'party ideology list and position, refs stripped', party);
ok(EP.wikiDates('November 3, 2026').join() === '2026-11-03' && EP.wikiDates('{{Start date|2027|4|11}}').join() === '2027-04-11', 'wiki date formats');

console.log('\nWikipedia batch responses');
const pages = E.mapPages(['2026_Pennsylvania_gubernatorial_election', '2027 Atlantis mayoral election'], JSON.parse(fx('markets', 'wiki-batch.json')).query, 'content');
ok(pages[0].content?.includes('Infobox election') && pages[0].revTimestamp === '2026-11-04T06:12:00Z', 'requested title followed through normalisation and redirect', pages[0]);
ok(pages[1].missing, 'missing page reported as missing');
const titles = E.localElectionTitles([2026], ['Ohio'], [{ name: 'Washington, D.C.', us: true }, { name: 'Paris', us: false }]).map((t: any) => t.title);
ok(titles.includes('2026 Ohio gubernatorial election') && titles.includes('2026 United States Senate special election in Ohio') && titles.includes('2026 Washington, D.C., mayoral election') && titles.includes('2026 Paris municipal election'), 'local election article titles', titles);

console.log('\nApplying an election article to a profile');
const ev = G.upsertEntity({ id: 'event:test-bolivia-2025', type: 'event', name: '2025 Bolivian general election', depth: 'baseline', facts: [{ label: 'Status', value: 'outcome not recorded', sourceId: 'wikipedia-elections', quality: 'community' }], attrs: { category: 'election', date: '2025-08-17', status: 'outcome-not-recorded' }, sources: ['wikipedia-elections'] });
G.setLiveRels('test-ev', [{ from: ev.id, to: 'country:BOL', type: 'affects' }]);
E.applyElectionInfo(ev, '2025 Bolivian general election', bol, { fetchedAt: new Date().toISOString(), revTimestamp: '2025-10-20T10:00:00Z' });
ok(ev.attrs.status === 'completed' && ev.facts.some((f: any) => f.label === 'Winner' && /Rodrigo Paz/.test(f.value) && f.quality === 'community' && f.retrievedAt), 'status → completed; Winner fact with source and retrieval time', ev.facts);
ok(ev.facts.find((f: any) => f.label === 'Status')?.value === 'completed', 'Status fact kept consistent with the status attribute');
ok(ev.attrs.election.contenders.every((c: any) => c.personId), 'candidates linked to person profiles (created when missing)', ev.attrs.election.contenders.map((c: any) => c.personId));
ok(G.relsOfType(ev.id, 'candidate_in', 'in').length === 0, 'candidate links are batched (written by the loader, not per call)');

console.log('\nPrediction markets');
const poly = PM.normalizePolymarket(JSON.parse(fx('markets', 'polymarket.json')));
const fr = poly.find((m: any) => m.id === '9001');
ok(fr && fr.outcomes.length === 3 && near(fr.outcomes[0].probability, 0.36), 'Polymarket: mid-price of each candidate, closed sub-markets dropped', fr?.outcomes);
ok(poly.find((m: any) => m.id === '9002')?.outcomes.map((o: any) => o.name).join() === 'Democratic,Republican', 'Polymarket multi-outcome market');
const kal = PM.normalizeKalshi(JSON.parse(fx('markets', 'kalshi.json')).events);
ok(kal.length === 1 && near(kal[0].outcomes[0].probability, 0.34) && near(kal[0].outcomes.find((o: any) => o.name === 'Other').probability, 0.12), 'Kalshi: cents → probability, bid/ask mid or last trade; non-election events dropped', kal);
const frEl = G.upsertEntity({ id: 'event:test-fr-2027', type: 'event', name: '2027 French presidential election', depth: 'baseline', facts: [], attrs: { category: 'election', date: '2027-04-11', endDate: '2027-04-25', office: 'President', status: 'scheduled', election: { contenders: [{ name: 'Jordan Bardella', party: 'National Rally' }, { name: 'Édouard Philippe', party: 'Horizons' }, { name: 'Marine Le Pen', party: 'National Rally' }] } }, sources: [] });
G.setLiveRels('test-fr', [{ from: frEl.id, to: 'country:FRA', type: 'affects' }]);
const mk = PM.marketsForElection(frEl, [...poly, ...kal]);
ok(mk.markets.length === 2 && mk.markets.every((m: any) => m.title.includes('2027')), 'matched Polymarket + Kalshi presidential markets, not the 2026 PM market', mk.markets.map((m: any) => m.title));
const bard = mk.candidates.find((c: any) => c.name === 'Jordan Bardella');
ok(bard?.platforms === 2 && bard.combined > 0.34 && bard.combined < 0.36, 'Bardella: two platforms combined (volume-weighted)', bard);
ok(mk.candidates.find((c: any) => c.name === 'Édouard Philippe')?.platforms === 2, '“Edouard” (Kalshi) and “Édouard” (Polymarket) matched to one candidate');
const paEl = G.upsertEntity({ id: 'event:test-pa-gov', type: 'event', name: '2026 Pennsylvania gubernatorial election', depth: 'baseline', facts: [], attrs: { category: 'election', date: '2026-11-03', office: 'Governor', scope: 'state', status: 'results-pending', election: { contenders: [{ name: 'Josh Shapiro', party: 'Democratic Party' }, { name: 'Stacy Garrity', party: 'Republican Party' }] } }, sources: [] });
G.setLiveRels('test-pa', [{ from: paEl.id, to: 'state:US-PA', type: 'affects' }]);
const pmk = PM.marketsForElection(paEl, [...poly, ...kal]);
ok(pmk.markets.length === 1 && pmk.candidates[0]?.name === 'Josh Shapiro' && near(pmk.candidates[0].combined, 0.93), 'state race matched; party outcome mapped to the party’s candidate', pmk.candidates);
ok(!PM.marketsForElection(frEl, poly.filter((m: any) => m.id === '9002')).markets.length, 'a Pennsylvania market never matches a French election');

console.log('\nLocal politics (Wikidata mayors)');
const rows = LP.mayorRows(JSON.parse(fx('markets', 'wd-mayors.json')).results.bindings, false);
ok(rows.length === 4 && rows[0].coord?.[0] === 2.3514 && rows[1].stateCode === 'US-PA', 'rows: coordinates, population, state code');
seed('wd:mayors:v1', { rows, parties: { Q7182474: ['Democratic Party'] } });
const res = await LP.loadMayors();
ok(/^3 mayors .*1 matched curated/.test(res.detail), 'loader: 3 mayors added, 1 matched to the curated record', res.detail);
const philly = G.relsOfType('city:philadelphia', 'leads', 'in');
ok(philly.filter((r: any) => !r.validTo).length === 1 && philly.some((r: any) => r.from === 'person:cherelle-parker' && !r.origin), 'curated Philadelphia mayor matched — no duplicate', philly.map((r: any) => r.from));
const paris = G.relsOfType('city:paris', 'leads', 'in');
ok(paris.some((r: any) => r.origin === 'wikidata-mayors' && /Paris/.test(r.role)), 'Paris mayor added from Wikidata', paris);
const austin = G.getEntity('city:austin') || G.getEntity('city:wd-q16559');
ok(austin && G.relsOfType(austin.id, 'leads', 'in').length === 1, 'Austin mayor linked');
const columbus = G.getEntity('city:wd-q49255');
ok(columbus?.parentId === 'state:US-OH' && columbus.coords, 'new city (Columbus) added under its state, with coordinates', columbus && { parent: columbus.parentId, coords: columbus.coords });
ok(LP.mayorsWithin('state:US-OH').some((m: any) => m.person.name === 'Andrew Ginther'), 'state profile lists mayors of its cities');
ok(LP.mayorsWithin('country:USA').length >= 3, 'country profile lists mayors of its cities');

console.log('\nCache: serve-then-refresh');
const C = await imp('server/cache.ts');
const old = new Date(Date.now() - 90_000).toISOString(); // 90 s old, TTL 60 s
seed('wb:test:swr', 'old copy'); seed('wd:test:strict', 'old copy');
for (const k of ['wb:test:swr', 'wd:test:strict']) {
  const f = path.join(process.env.TERMINAL_DATA_DIR!, 'cache', crypto.createHash('sha1').update(k).digest('hex') + '.json');
  fs.writeFileSync(f, JSON.stringify({ fetchedAt: old, payload: 'old copy' }));
}
let calls = 0;
const slow = () => new Promise<string>((r) => setTimeout(() => { calls++; r('new copy'); }, 150));
let t0 = Date.now(); const swr = await C.cached('wb:test:swr', 60, slow);
ok(swr.data === 'old copy' && swr.fetchedAt === old && Date.now() - t0 < 100, 'page data: expired copy within grace returned at once, with its real retrieval time');
await new Promise((r) => setTimeout(r, 250));
ok(calls === 1 && (await C.cached('wb:test:swr', 60, slow)).data === 'new copy', 'and refreshed in the background');
t0 = Date.now(); const strict = await C.cached('wd:test:strict', 60, slow);
ok(strict.data === 'new copy' && Date.now() - t0 >= 140, 'background-loader data (Wikidata) always waits for a fresh copy');
const failing = await C.cached('wb:test:swr2', 60, async () => { throw new Error('down'); }).catch((e: Error) => e.message);
ok(failing === 'down', 'no copy and provider down: error, never a made-up value');

// Windows keeps the SQLite file locked until exit, so cleanup may fail there; a leftover temp folder is harmless.
try { fs.rmSync(process.env.TERMINAL_DATA_DIR!, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(failures ? `\n${failures} check(s) failed` : '\nAll parser checks passed');
process.exitCode = failures ? 1 : 0;

// Offline checks for alerts, the economic & IGO calendar, sanctions, tariffs, budgets, reserves and
// the trade explorer. No network: fixtures in scripts/fixtures/{calendar,trade}; loaders read a
// seeded provider cache instead of calling the sources.
// Run: npm run check:econ
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-econ-check-'));
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const fx = (dir: string, f: string) => fs.readFileSync(path.join('scripts/fixtures', dir, f), 'utf8');
const seed = (key: string, payload: unknown, fetchedAt = new Date().toISOString()) => {
  const dir = path.join(process.env.TERMINAL_DATA_DIR!, 'cache'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, crypto.createHash('sha1').update(key).digest('hex') + '.json'), JSON.stringify({ fetchedAt, payload }));
};

const G = await imp('server/graph.ts');
const CH = await imp('server/changes.ts');
const AL = await imp('server/alerts.ts');
const EC = await imp('server/econCalendar.ts');
const S = await imp('server/sanctions.ts');
const T = await imp('server/tariffs.ts');
const B = await imp('server/budgets.ts');
const R = await imp('server/reserves.ts');
const TX = await imp('server/tradeExplorer.ts');

let failures = 0;
const ok = (cond: unknown, label: string, detail?: unknown) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`); if (!cond) failures++; };
const near = (a: number | undefined | null, b: number, eps = 0.05) => a != null && Math.abs(a - b) < eps;
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

// ───────────────────────── Calendar ─────────────────────────
console.log('Calendar: time zones and schedules');
ok(EC.zonedToUtc('2026-11-06', '08:30', 'America/New_York') === '2026-11-06T13:30:00.000Z', '08:30 New York in November = 13:30 UTC (standard time)', EC.zonedToUtc('2026-11-06', '08:30', 'America/New_York'));
ok(EC.zonedToUtc('2026-07-02', '08:30', 'America/New_York') === '2026-07-02T12:30:00.000Z', '08:30 New York in July = 12:30 UTC (daylight time)');
ok(EC.zonedToUtc('2026-12-17', '14:15', 'Europe/Berlin') === '2026-12-17T13:15:00.000Z', 'ECB 14:15 CET = 13:15 UTC');
const ics = EC.parseIcs(fx('calendar', 'bls.ics'));
const rel = EC.usReleasesFromIcs(ics);
ok(ics.length === 5, 'iCalendar: five events, including a folded summary line', ics.length);
ok(rel.some((e: any) => e.id === 'rel:us-jobs:2026-12-04' && e.start === '2026-12-04T13:30:00.000Z' && e.importance === 9), 'jobs report from the BLS calendar: 08:30 ET (non-IANA TZID), importance 6 + 3 (United States)', rel.find((e: any) => e.indicator === 'us-jobs'));
ok(rel.some((e: any) => e.id === 'rel:us-cpi:2027-01-13'), 'folded SUMMARY line is unfolded before matching ("Consumer Price Index")');
ok(rel.some((e: any) => e.id === 'rel:us-jolts:2026-12-08' && e.start === '2026-12-08T15:00:00.000Z'), 'UTC timestamps (…Z) kept as they are');
ok(!rel.some((e: any) => /County Employment/.test(e.title)), 'releases the terminal does not grade are left out');
ok(EC.ruleDate({ kind: 'bls-jobs' }, 2026, 10) === '2026-11-06' && EC.ruleDate({ kind: 'bls-jobs' }, 2026, 11) === '2026-12-04', 'jobs-report rule: third Friday after the week containing the 12th (Nov 6, Dec 4 2026)');
ok(EC.ruleDate({ kind: 'bls-jobs' }, 2027, 0) === '2027-01-08', 'jobs-report rule moves off New Year’s Day', EC.ruleDate({ kind: 'bls-jobs' }, 2027, 0));
ok(EC.ruleDate({ kind: 'weekday-on-or-after', weekday: 3, day: 10 }, 2026, 10) === '2026-11-11', 'CPI rule: first Wednesday on or after the 10th');
ok(EC.ruleDate({ kind: 'workday-of-month', n: 1, next: true }, 2026, 10) === '2026-12-01', 'first working day of the next month (euro-area flash HICP)');
ok(EC.ruleDate({ kind: 'day', day: 20, shift: 'next-workday' }, 2026, 11) === '2026-12-21', 'PBoC LPR: the 20th, moved off a weekend (Sun 20 Dec → Mon 21 Dec)');
ok(EC.grade(6, 'x', ['country:USA']).importance === 9 && EC.grade(9, 'x', ['country:USA'], [[2, 'c']]).importance === 10 && EC.grade(0.2, 'x', []).importance === 1, 'importance = base + weight + context, kept within 1–10');
ok(EC.grade(6, 'Policy-rate decision', ['country:GBR']).importanceWhy.length === 2, 'every grade lists its reasons');
const from = new Date('2026-11-01T00:00:00Z'), to = new Date('2027-01-31T00:00:00Z');
const usual = EC._test.usualEvents(from, to, new Set(['us-jobs', 'us-cpi']));
ok(!usual.some((e: any) => e.indicator === 'us-jobs' || e.indicator === 'us-cpi'), 'US fallbacks skipped for releases the live calendar has');
ok(usual.some((e: any) => e.indicator === 'us-pce' && e.basis === 'usual-timing' && e.title.startsWith('≈')) && usual.some((e: any) => e.id === 'usual:us-gdp:2027-01-28'), 'and used (labelled ≈) for GDP and PCE, which BLS does not publish', usual.filter((e: any) => e.indicator === 'us-gdp').map((e: any) => e.id));
ok(!EC._test.usualEvents(from, to).some((e: any) => e.indicator?.startsWith('us-')), 'no US fallbacks at all by default');
ok(EC.scheduleWarnings(30).length === 0 && EC.scheduleWarnings(5000).length === EC.BANK_SCHEDULES.length, 'audit warns when a hand-entered central-bank schedule runs out');
ok(EC.calendarSourceIds().every((id: string) => G.sources.has(id)), 'every source the calendar cites is in the source list', EC.calendarSourceIds().filter((id: string) => !G.sources.has(id)));

console.log('\nCalendar: results');
const cpi = Array.from({ length: 14 }, (_, i) => ({ t: `${2025 + Math.floor((8 + i) / 12)}-${String(((8 + i) % 12) + 1).padStart(2, '0')}-01`, v: 300 + i }));
const r1 = EC.seriesResult(cpi, { fred: 'X', transform: 'yoy', unit: '% y/y', label: 'CPI' }, '2026-11-12');
ok(r1 && r1.period === '2026-10' && near(r1.actual, (313 / 301 - 1) * 100, 0.001), 'y/y from an index: Oct 2026 vs Oct 2025', r1);
ok(EC.seriesResult(cpi, { fred: 'X', transform: 'yoy', unit: '% y/y', label: 'CPI' }, '2026-12-10') === undefined, 'no result before the period’s figure is published');
ok(EC.seriesResult(cpi, { fred: 'X', transform: 'level', unit: 'k', label: 'J', lag: 2 }, '2026-12-08')?.period === '2026-10', 'JOLTS / trade: two months back');
ok(EC.seriesResult([{ t: '2026-04-01', v: 1.1 }, { t: '2026-07-01', v: 2.4 }], { fred: 'G', transform: 'level', unit: '%', label: 'GDP', quarterly: true }, '2026-10-29')?.actual === 2.4, 'quarterly GDP: the previous quarter');
const hicp = EC.parseJsonStatSeries(JSON.parse(fx('calendar', 'eurostat-hicp.json')));
ok(hicp.length === 4 && hicp.at(-1).t === '2026-10' && hicp.at(-1).v === 2.3, 'Eurostat JSON-stat: time index → values');
ok(EC.fmtResult(-12, 'k jobs') === '-12 k jobs' && EC.fmtResult(150, 'k jobs') === '+150 k jobs' && EC.fmtResult(2.345, '% y/y') === '+2.3% y/y', 'result formatting');

// ───────────────────────── Alerts ─────────────────────────
console.log('\nAlerts');
const rule = (id: string, config: any) => ({ id, userId: 'u1', name: id, config, enabled: true, createdAt: '', updatedAt: '' });
const change = (o: any) => ({ key: `k${Math.random()}`, kind: 'tariff', entityIds: ['country:IND'], title: 't', sourceId: 'census-trade', quality: 'official', importance: 7, at: new Date().toISOString(), ...o });
ok(AL.matches(rule('r1', { entities: ['country:IND'] }), change({})), 'a change about a watched entity matches');
ok(!AL.matches(rule('r2', { entities: ['country:IND'] }), change({ importance: 4 })), 'below the rule’s minimum importance (default 5): no alert');
ok(!AL.matches(rule('r3', { entities: ['country:IND'], kinds: ['sanctions'] }), change({})), 'kind filter');
ok(AL.matches(rule('r4', { entities: ['company:x'], pricePct: 4 }), change({ kind: 'market', entityIds: ['company:x'], magnitude: 5 })) && !AL.matches(rule('r5', { entities: ['company:x'], pricePct: 4 }), change({ kind: 'market', entityIds: ['company:x'], magnitude: 3 })),
  'market moves: one alert at the bucket matching the rule’s threshold (4% → the 5% move)');
ok(AL.bucketFor('yield', 12) === 15 && AL.bucketFor('market', 50) === 20, 'thresholds map to producer buckets');
const e1 = CH.emitNew('check-producer', [change({ key: 'a', kind: 'news' })]); const e2 = CH.emitNew('check-producer', [change({ key: 'a', kind: 'news' }), change({ key: 'b', kind: 'news' })]);
ok(e1.baseline && e2.recorded === 1, 'a producer’s first run is a silent baseline; later runs record only new items', [e1, e2]);
ok(AL.checkWebhook('https://hooks.slack.com/services/x') === null && /https/.test(AL.checkWebhook('http://hooks.slack.com/x')) && /not allowed/.test(AL.checkWebhook('https://169.254.169.254/latest')), 'webhooks: https and allow-listed hosts only (no internal addresses)');

// ───────────────────────── Sanctions ─────────────────────────
console.log('\nSanctions: parsers');
const ofac = S.parseOfac(fx('trade', 'ofac-sdn.csv'), fx('trade', 'ofac-add.csv'), fx('trade', 'ofac-alt.csv'));
const by = (list: any[], id: string) => list.find((l) => l.id === id);
ok(ofac.length === 8, 'OFAC: eight entries (end-of-file marker ignored)', ofac.length);
ok(by(ofac, '90001')?.type === 'individual' && by(ofac, '90001').countries.join() === 'RUS' && by(ofac, '90001').aliases[0] === 'PUTIN, Vladimir', 'OFAC individual: nationality from remarks + address, aliases from alt.csv', by(ofac, '90001'));
ok(by(ofac, '90002').programs.join() === 'IRAN,SDGT' && by(ofac, '90002').countries.includes('ARE'), 'several programmes per entry; "Nationality of Registration" and address country', by(ofac, '90002'));
ok(by(ofac, '90003').type === 'vessel' && by(ofac, '90003').countries.length === 0, 'a ship’s flag (Panama) is not a connection to that country');
ok(by(ofac, '90005').countries.sort().join() === 'IRQ,SYR' && by(ofac, '90008').countries.join() === 'PRK', 'remarks: "alt. nationality", "Korea, North"');
const un = S.parseUn(fx('trade', 'un-consolidated.xml'));
ok(un.length === 4 && by(un, 'KPi.901').countries.join() === 'PRK' && by(un, 'KPi.901').programs.join() === 'DPRK', 'UN XML: individuals and entities, nationality, list type', un.map((l: any) => [l.id, l.countries]));
ok(by(un, 'QDi.901').countries.sort().join() === 'IRQ,SYR' && by(un, 'QDi.901').aliases.includes('Abu Testi') && by(un, 'QDi.901').listedOn === '2026-10-20', 'several nationalities and addresses; place of birth (Lebanon) left out');
ok(by(un, 'KPe.901').type === 'entity' && by(un, 'KPe.901').countries.join() === 'PRK' && by(un, 'TAe.901').countries.join() === 'PAK', 'UN entities: address country');
const eu = S.parseByHeader(fx('trade', 'eu-fsf.csv'), 'EU');
ok(eu.length === 5 && by(eu, '13001').name === 'Vladimir Vladimirovich PUTIN' && by(eu, '13001').aliases.length === 1, 'EU FSF CSV (semicolons, BOM): rows grouped by entity, other-language names as aliases', eu.map((l: any) => l.name));
ok(by(eu, '13001').countries.join() === 'RUS' && by(eu, '13003').countries.join() === 'SYR', 'EU: citizenship and address countries; birth country (Lebanon) left out', by(eu, '13003'));
ok(by(eu, '13002').type === 'entity' && by(eu, '13002').listedOn === '2026-10-23' && by(eu, '13005').countries.join() === 'BLR', 'EU: enterprises, listing date, country from its description');
const uk = S.parseByHeader(fx('trade', 'uk-sanctions.csv'), 'UK');
ok(uk.length === 4 && by(uk, 'RUS0001').name === 'Vladimir Vladimirovich PUTIN' && by(uk, 'RUS0001').aliases.includes('Vladimir POUTINE'), 'UK Sanctions List (FCDO): the primary name wins over a "primary name variation" listed first', by(uk, 'RUS0001'));
ok(by(uk, 'GHR0003').countries.sort().join() === 'IRN,IRQ' && by(uk, 'RUS0004').type === 'vessel' && by(uk, 'RUS0004').countries.length === 0, 'UK: "(1) Iran (2) Iraq" split; a ship’s flag ignored', by(uk, 'GHR0003'));
ok(by(uk, 'IRN0002').listedOn === '2026-10-15' && by(uk, 'IRN0002').type === 'entity', 'UK: dd/mm/yyyy designation dates');
const ofsi = S.parseByHeader(fx('trade', 'uk-conlist.csv'), 'UK');
ok(ofsi.length === 2 && by(ofsi, '15001').name === 'EXAMPLE SHIPPING TRADING LLC' && by(ofsi, '15001').aliases.join() === 'EXAMPLE SHIPPING', 'older OFSI consolidated list read the same way (alias row before the primary name)', ofsi);
const targets: [string, string, string | undefined][] = [['US', 'RUSSIA-EO14024', 'RUS'], ['US', 'UKRAINE-EO13662', 'RUS'], ['US', 'SDGT', undefined], ['US', 'DPRK3', 'PRK'], ['US', 'LIBYA3', 'LBY'], ['US', 'VENEZUELA-EO13850', 'VEN'], ['US', 'CAATSA - IRAN', 'IRN'],
  ['UN', 'Al-Qaida', undefined], ['UN', 'Guinea-Bissau', 'GNB'], ['UN', 'Taliban', 'AFG'], ['UK', 'Iran (Nuclear)', 'IRN'], ['UK', 'Global Human Rights', undefined], ['UK', "Democratic People's Republic of Korea", 'PRK'], ['EU', 'UKR', 'RUS'], ['EU', 'BLR', 'BLR'], ['EU', 'TAQA', undefined]];
const wrong = targets.filter(([l, p, t]) => S.programTarget(l, p) !== t).map(([l, p, t]) => `${l} ${p}: ${S.programTarget(l, p)} ≠ ${t}`);
ok(!wrong.length, `programme → target country (${targets.length} cases: country regimes, Ukraine-related → Russia, thematic → none)`, wrong);
const names: [string, string][] = [['KOREA, SOUTH', 'KOR'], ['BURMA', 'MMR'], ['RUSSIAN FEDERATION', 'RUS'], ['United Arab Emirates', 'ARE'], ['ST KITTS AND NEVIS', 'KNA'], ['BAHAMAS, THE', 'BHS'], ['CONGO, DEMOCRATIC REPUBLIC OF THE', 'COD'], ['TURKEY', 'TUR'], ['VIETNAM', 'VNM'], ['CZECH REPUBLIC', 'CZE']];
const badNames = names.filter(([n, iso]) => S.countryIso(n) !== iso).map(([n, iso]) => `${n}: ${S.countryIso(n)} ≠ ${iso}`);
ok(!badNames.length && S.countryIso('RU', true) === 'RUS' && S.countryIso('RU') !== 'RUS', 'country names as the lists and the US Census write them; ISO2 only where a column holds codes', badNames);

console.log('\nSanctions: aggregation, map, profiles');
seed('sanctions:US:v2', ofac); seed('sanctions:UN:v2', un); seed('sanctions:EU:v2', eu); seed('sanctions:UK:v2', uk);
G.upsertEntity({ id: 'person:check-putin', type: 'person', name: 'Vladimir Putin', depth: 'live' });
G.upsertEntity({ id: 'person:check-testov', type: 'person', name: 'Vladimir Testov', depth: 'live' });
G.upsertEntity({ id: 'company:check-shipping', type: 'company', name: 'Example Shipping Trading', depth: 'live' });
await S.refreshSanctions();
const rus = S.sanctionsFor('RUS');
ok(rus && rus.listings.US === 2 && rus.listings.EU === 2 && rus.listings.UK === 2 && rus.listings.UN === 0, 'Russia: listings per list (people, companies and ships, by connection or programme)', rus?.listings);
ok(rus.programmes[0].targeted && rus.programmes.filter((p: any) => p.targeted).map((p: any) => `${p.list}:${p.program}`).sort().join() === 'EU:RUS,EU:UKR,UK:Russia,US:RUSSIA-EO14024', 'country programmes first (incl. the EU’s Ukraine regime, which targets Russia)', rus.programmes);
ok(rus.recent.length === 1 && rus.recent[0].name === 'Example Defence Systems JSC', 'recent designations: dated entries from the last 120 days only — never the baseline load', rus.recent);
ok(S.sanctionsFor('IRN').recent.some((r: any) => r.list === 'UK' && r.date === '2026-10-15') && S.sanctionsFor('SYR').recent.some((r: any) => r.list === 'UN'), 'recent UK and UN designations');
const layer = S.sanctionsLayer('ALL');
ok(layer.values.RUS === 'programme' && layer.values.AFG === 'programme' && layer.values.ARE === 'some' && layer.values.PAK === 'some' && !layer.values.PAN, 'map tiers: programme / connected listings; no tier from a ship’s flag', layer.values);
ok(S.sanctionsLayer('UN').values.PRK === 'programme' && !S.sanctionsLayer('UN').values.RUS, 'per-list map variants');
const euReg = S.regimesOf('EU');
ok(euReg.length === 5 && euReg.find((r: any) => r.program === 'UKR')?.target?.id === 'country:RUS' && euReg.find((r: any) => r.program === 'TAQA')?.target === null, 'regimes an organisation runs, with target countries (EU profile)', euReg);
const pm = S.listingsFor('person:check-putin');
ok(pm.map((m: any) => m.list).sort().join() === 'EU,UK,US', 'profile match: "Vladimir Putin" ↔ "PUTIN, Vladimir Vladimirovich" / "Vladimir Vladimirovich PUTIN" on the US, EU and UK lists', pm);
ok(S.listingsFor('person:check-testov').length === 0, 'no match on a shared surname alone ("Vladimir Testov" ≠ "Ivan Petrovich Testov")');
ok(S.listingsFor('company:check-shipping').map((m: any) => m.list).sort().join() === 'US', 'companies match without legal forms (LLC), and only entity listings (not ships)', S.listingsFor('company:check-shipping'));
// A listing that was not there last time becomes a change (and an alert) for its country.
const seen = CH.kvGet('sanctions:firstSeen', {}); delete seen['UN:KPe.901']; CH.kvSet('sanctions:firstSeen', seen);
await S.refreshSanctions();
const sc = CH.recentChanges({ kinds: ['sanctions'] });
ok(sc.length === 1 && sc[0].entityIds.includes('country:PRK') && sc[0].entityIds.includes('igo:un') && /United Nations Security Council sanctioned 1 person or entity connected to North Korea/.test(sc[0].title), 'new designation → change for the country and the imposing body', sc[0]?.title);
ok(S.SANCTIONS_SOURCE_IDS.every((id: string) => G.sources.has(id)), 'sanctions and tariff sources are in the source list');

// ───────────────────────── Tariffs ─────────────────────────
console.log('\nTariffs');
const fr = T.parseFederalRegister(JSON.parse(fx('trade', 'federal-register.json')));
ok(fr.length === 5 && !fr.some((a: any) => /Information Collection/.test(a.title)), 'Federal Register: tariff documents kept, unrelated CBP notices dropped', fr.map((a: any) => a.title));
const fa = (n: string) => fr.find((a: any) => a.id === n);
ok(fa('2026-20001').kind === 'tariff' && fa('2026-20001').places.length === 0 && fa('2026-20001').subtype === 'Proclamation', 'a proclamation covering all countries has no country (and never tags the US itself)', fa('2026-20001'));
ok(fa('2026-20002').places.includes('country:CHN') && fa('2026-20004').countries.join() === 'BRA' && fa('2026-20005').countries.join() === 'IND', 'countries named in title or summary', fr.map((a: any) => a.places));
ok(fa('2026-20003').kind === 'trade-remedy' && fa('2026-20003').countries.join() === 'VNM', 'anti-dumping reviews counted separately as trade remedies');
const C = JSON.parse(fx('trade', 'census-imports.json'));
const rows = T.parseCensusImports(C.cur);
const row = (code: string) => rows.find((r: any) => r.code === code);
ok(row('-').placeId === 'world' && row('0003').placeId === 'igo:eu' && !row('1XXX').placeId && !row('0014').placeId, 'Census: total, EU, and country groups (no place) told apart');
ok(row('5700').placeId === 'country:CHN' && near(row('5700').rate, 30) && row('5800').placeId === 'country:KOR' && row('5460').placeId === 'country:MMR', 'effective rate = calculated duty ÷ imports for consumption; Census country names', [row('5800'), row('5460')]);
ok(T.parseCensusImports({ error: 'x' }).length === 0 && T.parseCensusImports([['A', 'B']]).length === 0, 'unexpected responses give no rows, never zeros');
const [m1, m2] = [T._test.monthsBack(1), T._test.monthsBack(2)]; const ya = `${Number(m1.slice(0, 4)) - 1}${m1.slice(4)}`;
seed(`tariffs:census:${m1}:v1`, T.parseCensusImports(C.cur)); seed(`tariffs:census:${m2}:v1`, T.parseCensusImports(C.prev)); seed(`tariffs:census:${ya}:v1`, T.parseCensusImports(C.yearAgo));
seed('tariffs:federal-register:v2', fr);
await T.refreshTariffs();
ok(CH.recentChanges({ kinds: ['tariff'] }).length === 0, 'first load is the baseline: no tariff alerts');
const chn = T.tariffsFor('country:CHN');
ok(chn.us && near(chn.us.row.rate, 30) && near(chn.us.yearAgo.row.rate, 13.16) && chn.us.rank === 3 && chn.actions.length === 1, 'China: effective US tariff, a year earlier, rank among partners, actions naming it', { rate: chn.us?.row.rate, ya: chn.us?.yearAgo?.row.rate, rank: chn.us?.rank, actions: chn.actions.length });
const usa = T.tariffsFor('country:USA');
ok(near(usa.us.row.rate, 10) && usa.us.top[0].placeId === 'country:MEX' && usa.actions.length === 4 && usa.remedies.count === 1, 'United States: rate on all imports, largest partners, every action', { rate: usa.us?.row.rate, top: usa.us?.top?.[0]?.placeId, actions: usa.actions.length });
ok(near(T.tariffsFor('igo:eu').us?.row.rate, 12) && T.tariffsFor('country:VNM').remedies.count === 1 && T.tariffsFor('country:IND').global.length === 1, 'EU row; trade remedies; actions covering all countries listed for every partner');
const eff = T.tariffLayer('us-effective'); const chg = T.tariffLayer('us-change'); const act = T.tariffLayer('us-actions');
ok(near(eff.values.CHN?.value, 30) && !eff.values.EUU && !('world' in eff.values) && near(chg.values.CHN?.value, 30 - 13.16), 'map: effective rate and change from a year earlier, by country (no groups)', { chn: eff.values.CHN, chg: chg.values.CHN });
ok(act.values.CHN?.value === 1 && act.values.BRA?.value === 1 && !act.values.VNM, 'map: tariff actions naming each country (trade remedies left out)', act.values);
// Next month: India and Brazil jump by 15–20 points → alerts; and a new Federal Register action → alert.
CH.kvSet('tariffs:census:alerted', '2000-01'); CH.kvSet('tariffs:seen', fr.filter((a: any) => a.id !== '2026-20005').map((a: any) => a.id));
await T.refreshTariffs();
const tc = CH.recentChanges({ kinds: ['tariff'] });
ok(tc.some((c: any) => /India rose to 30.0% .* \(from 15.0%/.test(c.title) && c.importance === 7) && tc.some((c: any) => /Brazil rose to 30.0%/.test(c.title)) && !tc.some((c: any) => /China/.test(c.title) && /effective/.test(c.title)), 'month-on-month jumps of 5+ points for large partners become changes', tc.map((c: any) => c.title));
ok(tc.some((c: any) => c.key === 'tariff:2026-20005' && c.entityIds.includes('country:IND')), 'a new tariff action becomes a change for the countries it names');

// ───────────────────────── Budgets ─────────────────────────
console.log('\nBudgets');
const at = new Date('2026-11-05T12:00:00Z');
const fyUS = B.fiscalYear('USA', at), fyJP = B.fiscalYear('JPN', at), fyGB = B.fiscalYear('GBR', at), fyDE = B.fiscalYear('DEU', at), fyAU = B.fiscalYear('AUS', at);
ok(fyUS.current === 'FY2027' && fyUS.start === '2026-10-01' && fyUS.end === '2027-09-30' && fyUS.runs === 'October–September', 'US fiscal year named after the year it ends (FY2027 = Oct 2026–Sep 2027)', fyUS);
ok(fyJP.current === 'FY2026' && fyJP.end === '2027-03-31' && fyGB.current === '2026–27' && fyAU.current === '2026–27' && fyAU.runs === 'July–June', 'Japan names it after the start year; the UK and Australia write both years');
ok(fyDE.current === '2026' && fyDE.start === '2026-01-01' && fyDE.end === '2026-12-31', 'calendar-year budgets elsewhere', fyDE);
const fx2 = (f: string) => JSON.parse(fx('budget', f));
const debt = B.parseDebtToPenny(fx2('debt-to-penny.json'));
ok(debt.latest.date === '2026-11-03' && near(debt.latest.total, 38324691357802.34, 1) && debt.yearAgo.date === '2025-11-03', 'Debt to the Penny: latest day and the same day a year earlier (string amounts)', debt);
const intr = B.parseInterestExpense(fx2('interest-expense.json'));
ok(intr.date === '2026-09-30' && intr.fytdPublic === 950e9 && intr.fytdTotal === 1150e9 && near(intr.yearAgoFytdPublic, 760e9, 1), 'interest expense: fiscal year to date on debt held by the public, and a year earlier', intr);
const avg = B.parseAvgRates(fx2('avg-interest-rates.json'));
ok(avg.date === '2026-10-31' && avg.marketable === 3.402 && avg.bills === 3.952 && avg.all === 3.355, 'average interest rates: latest month by security', avg);
const mts = Array.from({ length: 24 }, (_, i) => { const d = new Date(Date.UTC(2024, 9 + i, 1)); return { t: d.toISOString().slice(0, 10), v: d.getUTCMonth() === 3 ? 200000 : -180000 }; });
const tot = B.fiscalTotals(mts);
ok(tot.fy === 'FY2026' && tot.months === 12 && tot.fytd === 200000 - 11 * 180000 && tot.lastFy === 'FY2025' && tot.lastFyTotal === 200000 - 11 * 180000, 'Monthly Treasury Statement: fiscal-year totals (October–September)', tot);
const tot2 = B.fiscalTotals(mts.slice(0, 14));
ok(tot2.fy === 'FY2026' && tot2.months === 2 && tot2.prevFytd === -360000 && tot2.lastFyTotal === 200000 - 11 * 180000, 'early in a fiscal year: months so far, compared with the same months a year earlier', tot2);
const cof = B.jsonStatRows(fx2('eurostat-cofog.json'));
ok(cof.length === 5 && cof.find((r: any) => r.dims.cofog99 === 'GF10')?.value === 20.1 && cof.every((r: any) => r.dims.geo === 'DE' && r.dims.time === '2024'), 'Eurostat JSON-stat: flat index → every dimension’s code (missing values skipped)', cof);
const codes = B.pickFiscalCodes(fx2('imf-indicators.json').indicators);
ok(codes.revenue === 'GGR_G01_GDP_PT' && codes.expenditure === 'G_X_G01_GDP_PT' && codes.primary === 'GGXONLB_G01_GDP_PT', 'IMF Fiscal Monitor codes found by label (not the historical or cyclically adjusted series)', codes);
seed('imf:fm-codes:v1', codes);
const yr = new Date().getUTCFullYear(); const ys = (vals: number[]) => Object.fromEntries(vals.map((v, i) => [String(yr - 3 + i), v]));
seed('imf:GGR_G01_GDP_PT', { USA: ys([30.1, 30.4, 30.2, 30.6, 30.8]) }); seed('imf:G_X_G01_GDP_PT', { USA: ys([37.9, 37.8, 37.6, 37.9, 38.0]) });
seed('imf:GGXONLB_G01_GDP_PT', { USA: ys([-4.0, -3.6, -3.3, -3.2, -3.0]) }); seed('imf:GGXCNL_NGDP', { USA: ys([-7.8, -7.4, -7.4, -7.3, -7.2]) }); seed('imf:GGXWDG_NGDP', { USA: ys([118.7, 120.8, 122.3, 124.1, 126.0]) });
const imf = await B.imfBudget('USA');
const intRow = imf.rows.find((r: any) => r.key === 'interest');
ok(imf.rows.map((r: any) => r.key).join() === 'revenue,expenditure,balance,primary,interest,debt' && near(intRow.values[String(yr)], 4.1, 1e-9), 'IMF table: revenue, spending, balances, debt; net interest = primary − overall balance', imf.rows.map((r: any) => r.key));
seed('budget:us-debt:v1', debt); seed('budget:us-interest:v1', intr); seed('budget:us-avg-rates:v1', avg);
const since = new Date(Date.now() - 800 * 86400_000).toISOString().slice(0, 10);
seed(`fred:MTSDS133FMS:${since}`, mts); seed(`fred:MTSR133FMS:${since}`, mts.map((p) => ({ ...p, v: 400000 }))); seed(`fred:MTSO133FMS:${since}`, mts.map((p) => ({ ...p, v: 400000 - p.v })));
CH.kvSet('budget:us-debt-tn', 37);
const usb = await B.budgetFor('country:USA');
ok(usb.us.debt.latest.total > 38e12 && usb.us.mts.deficit.lastFyTotal === 200000 - 11 * 180000 && usb.us.rates.marketable === 3.402 && usb.fiscalYear.current.startsWith('FY'), 'US profile: debt, deficits, interest and fiscal year together', { fy: usb.fiscalYear?.current, mts: usb.us?.mts?.deficit });
ok(CH.recentChanges({ kinds: ['data'] }).some((c: any) => /US federal debt passed \$38 trillion/.test(c.title)), 'crossing another trillion of federal debt becomes a change');
ok(usb.cofog === null && (await B.cofogFor('country:JPN')) === null, 'spending by function only for EU and EFTA members (and the EU)');
seed('eurostat:cofog:DE:v1', { year: '2024', items: Object.keys(B.COFOG).map((c) => ({ code: c, label: B.COFOG[c], value: cof.find((r: any) => r.dims.cofog99 === c)?.value })).filter((x: any) => x.value != null) });
const de = await B.cofogFor('country:DEU');
ok(de.year === '2024' && de.items.find((x: any) => x.code === 'GF10')?.label === 'Social protection' && !de.items.some((x: any) => x.code === 'GF02'), 'Germany: COFOG divisions with labels (Eurostat geo code from ISO2)', de);

// ───────────────────────── Reserves ─────────────────────────
console.log('\nReserves & stocks');
const zbuf = (f: string) => fs.readFileSync(path.join('scripts/fixtures/reserves', f));
const stored: string[] = []; await R.zipLines(zbuf('stored.zip'), (l: string) => stored.push(l));
ok(stored.length === 3 && R.csvCells(stored[2]).join('|') === '3|4,5', 'zip (stored) read line by line; quoted CSV cells', stored);
const jcol = R.jodiCollector('2024-05'); const entry = await R.zipLines(zbuf('jodi-primary.zip'), (l: string) => jcol.line(l));
const oilRes = jcol.result();
ok(entry === 'NewProcedure_Primary_CSV.csv', 'zip (deflate): the CSV entry is picked, not the README', entry);
ok(oilRes.JPN?.latest.month === '2026-08' && oilRes.JPN.latest.stocks === 85000 && oilRes.JPN.latest.days === 34 && oilRes.JPN.yearAgo?.stocks === 90000 && oilRes.JPN.history.length === 3, 'JODI: latest closing stocks (thousand barrels, not tonnes), days of refinery intake, a year earlier', oilRes.JPN);
ok(oilRes.DEU?.latest.stocks === 60000 && oilRes.DEU.latest.days === 33 && oilRes.USA?.latest.production === 13600, 'total crude preferred over crude alone; production kept', oilRes.DEU);
ok(!oilRes.CHN && !oilRes.FRA && !oilRes.SAU, 'countries without reported stocks, old months and empty values left out', Object.keys(oilRes));
const pcol = R.psdCollector(2024); await R.zipLines(zbuf('usda-psd.zip'), (l: string) => pcol.line(l));
const gr = pcol.result();
const chw = gr.wheat.rows.find((r: any) => r.place === 'country:CHN');
ok(gr.wheat.year === '2026' && gr.wheat.prevYear === '2025' && chw.stocks === 130000 && chw.ratio === 86.7 && chw.production === 140000 && gr.wheat.prev['country:CHN'] === 128000, 'USDA PSD: ending stocks, stocks-to-use, production; the year before', chw);
ok(gr.wheat.rows.some((r: any) => r.place === 'igo:eu') && gr.wheat.rows.some((r: any) => r.place === 'country:KOR') && gr.wheat.world.stocks === 187500, 'USDA names ("European Union", "Korea, South"); world totals', gr.wheat.world);
ok(gr.rice.rows.length === 2 && gr.corn.rows[0].place === 'country:CHN' && !Object.keys(gr).includes('barley'), 'rice (milled) and corn; other grains ignored');
const eia = R.parseEiaStocks(JSON.parse(zbuf('eia-stocks.json').toString()));
ok(eia.spr.length === 3 && eia.spr.at(-1).v === 410500 && eia.spr.at(-2).v === 410100 && eia.commercial[0].v === 421000, 'EIA API: SPR and commercial crude series (numbers or strings)', eia);
const ag = R.parseAgsi(JSON.parse(zbuf('agsi-de.json').toString()));
ok(ag.full === 91.3 && near(ag.twh, 229.45, 0.01) && ag.day === '2026-11-03', 'AGSI+: % full, TWh in storage, gas day', ag);
ok(R.oilProgramme('DEU').length === 3 && R.oilProgramme('USA').length === 2 && R.oilProgramme('CHN').length === 1 && R.oilProgramme('BRA').length === 0, 'strategic reserve notes: national programme, EU directive, IEA obligation');
R._test.setOil(oilRes); R._test.setGrains(gr);
const ol = R.reservesLayer('oil-days'); const gl = R.reservesLayer('grain-wheat');
ok(ol.values.JPN?.value === 34 && R.reservesLayer('oil-stocks').values.USA?.value === 820 && gl.values.CHN?.value === 86.7 && !('igo:eu' in gl.values), 'map: oil days or barrels; grain stocks-to-use by country', { ol: ol.values, gl: gl.values });
const ws = R.stocksForCommodity('commodity:wheat');
ok(ws.rows[0].id === 'country:CHN' && ws.rows[0].share === 69.3 && ws.year === '2026' && R.stocksForCommodity('commodity:crude-oil').rows[0].id === 'country:USA', 'commodity profiles: largest holders with world shares', ws.rows.slice(0, 2));
seed(`wb:country:JPN:${['FI.RES.TOTL.CD', 'FI.RES.XGLD.CD', 'FI.RES.TOTL.MO'].join(',')}`, [{ code: 'FI.RES.TOTL.CD', label: 'x', unit: 'USD', series: [], latest: { period: '2024', value: 1.23e12 }, sourceId: 'world-bank-wdi' }]);
const jp = await R.reservesFor('country:JPN');
ok(jp.oil.latest.stocks === 85000 && jp.programme.length === 2 && jp.fx.indicators.length === 1 && !jp.us, 'Japan profile: oil stocks, reserve programme notes, FX reserves');
const since500 = new Date(Date.now() - 500 * 86400_000).toISOString().slice(0, 10);
seed(`fred:WCSSTUS1:${since500}`, eia.spr); seed(`fred:WCESTUS1:${since500}`, eia.commercial);
const us1 = await R.reservesFor('country:USA');
ok(us1.us?.spr === 410500 && us1.us.sprYearAgo === 405000 && us1.us.via === 'FRED', 'United States: weekly SPR without a key (FRED), with the level a year earlier', us1.us);
seed('reserves:eia-spr:v1', eia); process.env.EIA_API_KEY = 'test-key';
ok((await R.reservesFor('country:USA')).us?.via === 'EIA API', 'with EIA_API_KEY the EIA API is used'); delete process.env.EIA_API_KEY;
ok((await R.reservesLayer('grain-sorghum')).error === 'Unknown layer' && (await R.gasLayer()).error?.includes('AGSI_API_KEY'), 'gas storage explains the free key it needs');

// ───────────────────────── Trade explorer ─────────────────────────
console.log('\nTrade explorer');
const CT = JSON.parse(fx('trade', 'comtrade.json'));
const pp = TX.parsePartners(CT.partners.data);
const chnP = pp.partners.find((p: any) => p.ccn3 === '156');
ok(pp.world.exports === 2.06e12 && pp.world.imports === 3.27e12 && chnP.exports === 143.5e9 && chnP.imports === 438.9e9, 'partners: world totals and per-partner flows; re-exports and third-party rows left out', chnP);
ok(pp.partners.some((p: any) => p.ccn3 === '250') && pp.partners[0].ccn3 === '484', 'Comtrade codes mapped back (France 251 → 250); sorted by total trade', pp.partners.map((p: any) => p.ccn3));
seed('comtrade:partners:842:v1', { year: '2024', ...pp });
const pv = await TX.partnersView('USA');
const pvChn = pv.partners.find((p: any) => p.iso3 === 'CHN');
ok(near(pvChn.share, ((143.5e9 + 438.9e9) / 5.33e12) * 100, 0.01) && pv.partners.find((p: any) => p.ccn3 === '490')?.areaName === 'Other Asia, n.e.s.', 'share of the reporter’s trade; unattributed areas named, not mapped to a country', pvChn);
const tw = await TX.tradeWithLayer('USA', 'balance');
ok(near(tw.values.CHN?.value, 143.5e9 - 438.9e9, 1) && !tw.values.USA && tw.unreported === 158e9 && tw.year === '2024', 'map: balance with every partner; the reporter itself and n.e.s. areas left off', { chn: tw.values.CHN, unreported: tw.unreported });
const yNow = new Date().getFullYear(); const pyears = [yNow - 6, yNow - 5, yNow - 4, yNow - 3, yNow - 2, yNow - 1].map(String);
const series = TX.pairSeries(CT.pairA.data, CT.pairB.data, pyears);
const s2023 = series.find((x: any) => x.year === '2023');
ok(s2023.aExports === 147.8e9 && s2023.bImports === 164.2e9 && s2023.bExports === 500.3e9 && series.find((x: any) => x.year === '2024').bImports === null, 'pair: each side’s report by year (a year one side has not reported stays empty, not zero)', s2023);
const ch = TX.chapters(CT.products.data, 'X');
ok(ch.length === 6 && ch[0].code === '12' && /Oil seeds/i.test(ch[0].name) && TX.chapters(CT.products.data, 'M')[0].code === '85', 'products by HS chapter, largest first; TOTAL row ignored', ch.slice(0, 2));
seed(`comtrade:pair:842:156:v1`, { series, latestA: '2024', latestB: '2023', products: { year: '2024', reporter: 'USA', exports: ch, imports: TX.chapters(CT.products.data, 'M') } });
const pair = await TX.tradePair('USA', 'CHN');
ok(pair.mirror.year === '2023' && near(pair.mirror.gapAtoB, 11.1, 0.05) && near(pair.mirror.gapBtoA, -14.7, 0.05), 'mirror check on the latest year both reported: US exports vs China’s imports, and the reverse', pair.mirror);
ok(pair.usTariff && near(pair.usTariff.rate, 30) && pair.usTariff.on === 'CHN', 'US tariff on the partner’s goods (Census) shown for pairs with the US', pair.usTariff);
ok(pair.shared.some((g: any) => g.id === 'igo:g20') && pair.sanctions.length === 0, 'shared memberships (G20); no sanctions programme between them in the fixture lists', pair.shared.map((g: any) => g.id));
seed(`comtrade:pair:842:643:v1`, { series: TX.pairSeries([], [], pyears).map((x: any) => (x.year === pyears[4] ? { ...x, aExports: 1e9, aImports: 3e9 } : x)), latestA: pyears[4], products: { year: pyears[4], reporter: 'USA', exports: [], imports: [] } });
const usRus = await TX.tradePair('USA', 'RUS');
ok(usRus.sanctions.some((x: any) => x.list === 'US' && x.target === 'RUS' && x.programmes.some((p: any) => p.program === 'RUSSIA-EO14024')) && !usRus.mirror, 'sanctions between a pair: US programmes aimed at Russia; no mirror check without both reports', usRus.sanctions);

// Windows keeps the SQLite file locked until exit, so cleanup may fail there; a leftover temp folder is harmless.
try { fs.rmSync(process.env.TERMINAL_DATA_DIR!, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(failures ? `\n${failures} check(s) failed` : '\nAll econ checks passed');
process.exitCode = failures ? 1 : 0;

// Offline checks for the command line: the function registry and its grammar (shared/functions.ts),
// entity resolution against the knowledge web (server/command.ts), running commands end to end
// (src/command.ts, with the server's resolver in place of the network), and the key registry.
// Run: npm run check:terminal
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-terminal-check-'));
// The client keeps the command history in the browser's storage: a stand-in for it.
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);

const F = await imp('shared/functions.ts');
const G = await imp('server/graph.ts');
const C = await imp('server/command.ts');
const R = await imp('src/command.ts');
const K = await imp('src/keys.ts');

let failures = 0;
const ok = (cond: unknown, label: string, detail?: unknown) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`); if (!cond) failures++; };
const ids = (q: string, max = 2) => C.resolveCommandEntities(q, max).entities.map((e: any) => e.id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const loc = (url: string) => { const u = new URL(url, 'http://x'); return { pathname: u.pathname, search: u.search, hash: u.hash }; };

// ───────────────────────── The registry ─────────────────────────
console.log('Function registry');
const codes: string[] = F.FUNCTIONS.flatMap((f: any) => [f.code, ...(f.aliases || [])]);
ok(new Set(codes).size === codes.length, 'every code and alias is used once');
ok(codes.every((c) => /^[A-Z]{2,5}$/.test(c)), 'codes are two to five capital letters', codes.filter((c) => !/^[A-Z]{2,5}$/.test(c)));
const clash = codes.filter((c) => G.byIso3.has(c));
ok(!clash.length, 'no code is also a three-letter country code', clash);
const badRelated = F.FUNCTIONS.flatMap((f: any) => f.related.filter((c: string) => !F.fnByCode(c) || c === f.code).map((c: string) => `${f.code}→${c}`));
ok(!badRelated.length, 'every related code exists and is another function', badRelated);
ok(F.FUNCTIONS.every((f: any) => f.related.length >= 1 && f.related.length <= 9), 'every function offers one to nine related functions (one digit each)');
ok(F.FUNCTIONS.every((f: any) => F.FN_GROUPS.includes(f.group)) && F.FN_GROUPS.every((g: string) => F.FUNCTIONS.some((f: any) => f.group === g)), 'every function is in a listed group, and no group is empty');
ok(F.FUNCTIONS.every((f: any) => f.examples.length && f.examples.every((ex: string) => F.parseCommand(ex).fn === f)), 'every example parses to its own function', F.FUNCTIONS.flatMap((f: any) => f.examples.filter((ex: string) => F.parseCommand(ex).fn !== f)));
ok(F.FUNCTIONS.every((f: any) => f.special === 'last' || f.page || f.entity), 'every function leads somewhere: a page, or a place on an entity');
ok(F.FUNCTIONS.every((f: any) => !f.on === !f.entity), 'a function that acts on entities says where, and only those do', F.FUNCTIONS.filter((f: any) => !f.on !== !f.entity).map((f: any) => f.code));
ok(F.FUNCTIONS.every((f: any) => !f.on || f.need === 'optional' ? true : !f.page), 'a function that needs an entity has no screen without one');
ok(F.fnByCode('conf') === F.fnByCode('WAR') && F.fnByCode(' menu ') === F.fnByCode('HELP') && !F.fnByCode('XYZ'), 'codes are found whatever the case, aliases too');

console.log('Command grammar');
const p = (t: string) => { const r = F.parseCommand(t); return [r.fn?.code || null, r.head, r.tail.join(' ')]; };
ok(same(p('DEU BUDG'), ['BUDG', 'DEU', '']), 'entity then code', p('DEU BUDG'));
ok(same(p('usa chn trade'), ['TRADE', 'usa chn', '']), 'two entities then code, any case', p('usa chn trade'));
ok(same(p('south korea japan TRADE'), ['TRADE', 'south korea japan', '']), 'names of several words before the code');
ok(same(p('AAPL WEB 2'), ['WEB', 'AAPL', '2']), 'a parameter after the code', p('AAPL WEB 2'));
ok(same(p('TSMC NOTE NEW'), ['NOTE', 'TSMC', 'NEW']), 'a word parameter after the code');
ok(same(p('NEWS china'), ['NEWS', '', 'china']), 'code first, entity after');
ok(same(p('MAP inflation'), ['MAP', '', 'inflation']) && same(p('HELP CAL'), ['HELP', '', 'CAL']), 'code first, parameter after (a code as a parameter stays a parameter)');
ok(same(p('TOP'), ['TOP', '', '']) && same(p('  top  '), ['TOP', '', '']), 'a code alone');
ok(same(p('germany'), [null, 'germany', '']) && same(p(''), [null, '', '']), 'no code: all the words are a search');
ok(same(p('trade war china'), ['TRADE', '', 'war china']), 'a code in first place takes the rest as its words', p('trade war china'));
ok(same(p('DEU BUDG extra'), [null, 'DEU BUDG extra', '']), 'a code followed by words it does not take is part of a name', p('DEU BUDG extra'));
ok(same(p('Port Moresby'), [null, 'Port Moresby', '']) && same(p('port of spain'), [null, 'port of spain', '']) && same(p('TOP europe'), [null, 'TOP europe', '']), 'a name that starts with a code is a name when the function takes no words ("Port Moresby" is not PORT)', [p('Port Moresby'), p('TOP europe')]);
ok(same(p('PORT'), ['PORT', '', '']) && same(p('NOTE NEW'), ['NOTE', '', 'NEW']), 'the same codes alone, or with words they take, are still commands');
ok(same(F.readParams(F.fnByCode('WEB'), ['2']), { query: { depth: '2' }, rest: [] }) && same(F.readParams(F.fnByCode('WEB'), ['nato', '2']).rest, ['nato']), 'parameters are read by value; other words are left over');
ok(same(F.readParams(F.fnByCode('MAP'), ['gdp', 'per', 'person']).query, { layer: 'gdp per person' }), 'free words fill the free parameter');

// ───────────────────────── Entity resolution ─────────────────────────
console.log('Entity resolution');
ok(same(ids('DEU'), ['country:DEU']) && same(ids('deu'), ['country:DEU']), 'a three-letter country code, any case');
ok(same(ids('de'), ['country:DEU']) && same(ids('US'), ['country:USA']) && same(ids('jp'), ['country:JPN']), 'a two-letter country code', [ids('de'), ids('US'), ids('jp')]);
ok(same(ids('EU'), ['igo:eu']) && same(ids('NATO'), ['igo:nato']), 'an organization by its short name (EU is not a country code)', [ids('EU'), ids('NATO')]);
ok(same(ids('AAPL'), ['company:apple']) && same(ids('nvda'), ['company:nvidia']) && same(ids('TSMC'), ['company:tsmc']), 'a company by its ticker', [ids('AAPL'), ids('nvda'), ids('TSMC')]);
ok(same(ids('germany'), ['country:DEU']) && same(ids('saudi arabia'), ['country:SAU']) && same(ids('BRENT'), ['commodity:brent']), 'an exact name, of one word or several');
ok(same(ids('USA CHN'), ['country:USA', 'country:CHN']), 'two codes', ids('USA CHN'));
ok(same(ids('south korea japan'), ['country:KOR', 'country:JPN']), 'two names, cut at the right word', ids('south korea japan'));
ok(same(ids('japan south korea'), ['country:JPN', 'country:KOR']) && same(ids('united states china'), ['country:USA', 'country:CHN']), 'two names, either order');
ok(same(ids('apple microsoft'), ['company:apple', 'company:microsoft']), 'two companies');
ok(same(ids('new york'), ['city:new-york']) || same(ids('new york'), ['state:US-NY']), 'a name of two words is one entity, not two', ids('new york'));
ok(same(ids('USA CHN', 1), []) || ids('USA CHN', 1).length <= 1, 'max=1 never returns two');
const georgia = C.resolveCommandEntities('georgia').entities[0];
// Not marked exact: whoever runs it is told what it was taken for, and offered the other.
ok(!georgia?.exact && georgia.sure && georgia.how === 'exact' && georgia.id === 'country:GEO' && georgia.alternatives?.some((a: any) => a.id === 'state:US-GA'), 'a name two entities share: the better known one, said to be a choice, with the other offered', georgia);
const germ = C.resolveCommandEntities('germ').entities[0];
ok(germ?.id === 'country:DEU' && !germ.exact && germ.sure && germ.alternatives?.length >= 1 && germ.alternatives.length <= 5, 'the start of a name: the best strong match, marked as not exact, with up to five alternatives', germ);
const neu = C.resolveCommandEntities('new').entities[0];
ok(neu && !neu.exact && !neu.sure && neu.alternatives?.length === 5, 'an ambiguous word is not a sure match', neu);
const deu = C.resolveCommandEntities('DEU').entities[0];
ok(deu.iso3 === 'DEU' && deu.type === 'country' && deu.name === 'Germany' && deu.flag && deu.exact && deu.sure && typeof deu.score === 'number', 'a match carries id, type, name, flag, country code and score', deu);
ok(C.resolveCommandEntities('AAPL').entities[0].iso3 === undefined, 'only countries carry a country code');
ok(same(ids('zzzqq'), []) && same(ids(''), []) && same(ids('   '), []) && same(ids('zzzqq xxyyq'), []), 'nothing found: an empty list');
ok(same(ids('germany zzzqq'), []) || same(ids('germany zzzqq'), ['country:DEU']) === false, 'words that only half match name nothing', ids('germany zzzqq'));
ok(C.resolveCommandEntities('x'.repeat(500)).q.length <= 120, 'very long input is cut');

// ───────────────────────── Addresses ─────────────────────────
console.log('Addresses');
// Every example in the registry, resolved against the offline web, leads to an address, or says plainly why not.
const resolve = async (words: string, max: number) => C.resolveCommandEntities(words, max).entities;
const ctx = (loaded: any = null) => { const c: any = { went: [] as string[], loaded, resolve }; c.navigate = (u: string) => c.went.push(u); c.load = (e: any) => { c.loaded = e; }; return c; };
const offlineUnknown = new Set<string>();
let exampleProblems: string[] = [];
for (const f of F.FUNCTIONS) for (const ex of f.examples) {
  if (f.special === 'last') continue;
  const c = ctx();
  const r = await R.runCommand(ex, c);
  if (r.ok) {
    const at = F.fnAt(loc(r.url));
    // LAST aside, the address a command leads to shows that same function.
    if (!r.url || (at?.fn !== f && !(f.code === 'NOTE' && r.url.startsWith('/research/new')))) exampleProblems.push(`${ex} → ${r.url} shows ${at?.fn.code}`);
  } else if (/nothing is called/.test(r.message) && c.went[0]?.startsWith('/find?q=')) offlineUnknown.add(ex); // an entity the offline web does not hold (it is loaded from Wikidata)
  else exampleProblems.push(`${ex}: ${r.message}`);
}
ok(!exampleProblems.length, 'every example in the registry runs: it reaches its own function', exampleProblems);
ok(offlineUnknown.size <= 2, `examples whose entity is not in the offline web go to the search page with a plain message (${[...offlineUnknown].join(', ') || 'none'})`, [...offlineUnknown]);
// For each function and type, the first entity it applies to (BUDG is shown for the EU, not for every organization).
const byType: Record<string, any[]> = {};
for (const e of G.entities.values()) (byType[e.type] ||= []).push({ id: e.id, type: e.type, name: e.name, iso3: e.iso3 });
byType.country.unshift({ id: 'country:DEU', type: 'country', name: 'Germany', iso3: 'DEU' });
const sampleFor = (f: any, t: string) => byType[t]?.find((e) => F.fnAppliesTo(f, e));
const roundTrip: string[] = [];
for (const f of F.FUNCTIONS) {
  if (f.page && (!f.on || f.need === 'optional')) {
    const out = F.commandUrl(f, []);
    if (!out.url || F.fnAt(loc(out.url))?.fn !== f) roundTrip.push(`${f.code} alone → ${out.url || out.error}`);
  }
  for (const t of f.on || []) {
    const e = sampleFor(f, t); if (!e) continue;
    const out = F.commandUrl(f, [e]);
    const at = out.url && F.fnAt(loc(out.url));
    if (!at || at.fn !== f || at.entityId !== e.id) roundTrip.push(`${f.code} on ${e.id} → ${out.url || out.error} shows ${at ? `${at.fn.code} ${at.entityId}` : 'nothing'}`);
  }
}
ok(!roundTrip.length, 'fnAt(commandUrl(…)) is the same function, and the same entity, for every function with a page', roundTrip);
const url = (code: string, es: any[] = [], tail: string[] = []) => { const o = F.commandUrl(F.fnByCode(code), es, tail); return o.url || `error: ${o.error}`; };
const DEU = byType.country[0], CHN = { id: 'country:CHN', type: 'country', name: 'China', iso3: 'CHN' }, AAPL = { id: 'company:apple', type: 'company', name: 'Apple Inc.' };
ok(url('BUDG', [DEU]) === '/entity/country%3ADEU#budget', 'a section of a profile', url('BUDG', [DEU]));
ok(url('TRADE', [DEU, CHN]) === '/trade?a=DEU&b=CHN' && url('TRADE', [DEU]) === '/trade?a=DEU' && url('TRADE') === '/trade', 'two entities, one, none', [url('TRADE', [DEU, CHN]), url('TRADE', [DEU]), url('TRADE')]);
ok(url('WEB', [AAPL], ['2']) === '/web?focus=company%3Aapple&depth=2', 'an entity and a parameter', url('WEB', [AAPL], ['2']));
ok(url('HELP', [], ['CAL']) === '/help?fn=CAL' && url('KEYS') === '/help?view=keys' && url('EQ') === '/markets?tab=indices', 'pages with fixed and typed parameters');
ok(/^error: BUDG .*does not apply to Apple Inc\..*try: /.test(url('BUDG', [AAPL])), 'the wrong kind of entity: says so, and what does apply', url('BUDG', [AAPL]));
ok(/^error: ECON .*needs a country.*JPN ECON/.test(url('ECON')), 'no entity where one is needed: says so, with an example', url('ECON'));
ok(F.fnAt(loc('/entity/country%3ADEU'))?.fn.code === 'DES' && F.fnAt(loc('/entity/country%3ADEU#nosuch'))?.fn.code === 'DES' && !F.fnAt(loc('/login')), 'a profile without a known section is the profile; a page outside the registry has no function');

// ───────────────────────── Running commands ─────────────────────────
console.log('Running commands');
store.clear();
let c = ctx();
let r = await R.runCommand('DEU BUDG', c);
ok(r.ok && c.went[0] === '/entity/country%3ADEU#budget' && c.loaded?.id === 'country:DEU' && c.loaded.iso3 === 'DEU' && /BUDG Government budget · Germany/.test(r.message), 'DEU BUDG: Germany’s budget, and Germany is loaded', [c.went, r]);
r = await R.runCommand('trade', c);
ok(r.ok && c.went[1] === '/trade?a=DEU', 'a code alone acts on the loaded entity', c.went);
r = await R.runCommand('USA CHN TRADE', c);
ok(r.ok && c.went[2] === '/trade?a=USA&b=CHN' && c.loaded.id === 'country:USA' && /United States and China/.test(r.message), 'two entities; the first becomes the loaded one', [c.went[2], r.message]);
r = await R.runCommand('TOP', c);
ok(r.ok && c.went[3] === '/news' && c.loaded.id === 'country:USA', 'a function without an entity leaves the loaded entity alone');
r = await R.runCommand('HELP CAL', c);
ok(r.ok && c.went[4] === '/help?fn=CAL', 'HELP and a code');
r = await R.runCommand('LAST', c);
ok(r.ok && c.went[5] === '/help?fn=CAL' && /^Again: HELP CAL/.test(r.message), 'LAST runs the previous command again', [c.went[5], r.message]);
ok(same(R.commandHistory(), ['DEU BUDG', 'trade', 'USA CHN TRADE', 'TOP', 'HELP CAL']), 'history keeps what was run, oldest first, without LAST', R.commandHistory());
r = await R.runCommand('NEWS china', c);
ok(r.ok && c.went[6] === '/news?entity=country%3ACHN' && c.loaded.id === 'country:CHN', 'the entity may follow the code', c.went[6]);
r = await R.runCommand('WEB nato 2', c);
ok(r.ok && c.went[7] === '/web?focus=igo%3Anato&depth=2', 'entity and parameter after the code', c.went[7]);
r = await R.runCommand('MAP inflation', c);
ok(r.ok && c.went[8] === '/?show=igo%3Anato&layer=inflation', 'MAP and words: a map layer, on the loaded entity', c.went[8]);
r = await R.runCommand('MAP gdp per person', ctx());
ok(r.ok && r.url === '/?layer=gdp%20per%20person', 'and on the world when nothing is loaded', r.url);
c = ctx(AAPL);
r = await R.runCommand('BUDG', c);
ok(!r.ok && !c.went.length && /does not apply to Apple Inc\./.test(r.message), 'a code that needs another kind of entity than the loaded one: the registry’s own words, and no move', r);
r = await R.runCommand('TRADE', c);
ok(r.ok && c.went[0] === '/trade', 'a code that also works alone opens its general screen when the loaded entity is the wrong kind', c.went);
r = await R.runCommand('GP', c);
ok(r.ok && c.went[1] === '/entity/company%3Aapple#market', 'and acts on it when it is the right kind');
c = ctx();
r = await R.runCommand('ECON', c);
ok(!r.ok && !c.went.length && /needs a country/.test(r.message), 'nothing loaded and an entity needed: says what to type', r.message);
r = await R.runCommand('germany', c);
ok(r.ok && c.went[0] === '/entity/country%3ADEU' && c.loaded?.id === 'country:DEU', 'a name alone opens the profile and loads the entity');
r = await R.runCommand('germ', c);
ok(r.ok && c.went[1] === '/entity/country%3ADEU' && /took “germ” to mean Germany/.test(r.message), 'a clear partial name too, and the line says what it was taken for', r.message);
r = await R.runCommand('BUGD', c);
ok(!r.ok && c.went[2] === '/find?q=BUGD' && /Unknown code BUGD; did you mean BUDG/.test(r.message), 'a mistyped code: suggestions, and the search page', [c.went[2], r.message]);
r = await R.runCommand('new', c);
ok(!r.ok && c.went[3] === '/find?q=new', 'an ambiguous word goes to the search page', [c.went[3], r.message]);
r = await R.runCommand('zzzqq xxyyq', c);
ok(!r.ok && c.went[4] === '/find?q=zzzqq%20xxyyq' && r.message, 'words that match nothing go to the search page', [c.went[4], r.message]);
r = await R.runCommand('zzzqq BUDG', c);
ok(!r.ok && c.went[5] === '/find?q=zzzqq' && /nothing is called “zzzqq”/.test(r.message), 'a command on an unknown entity: says so, and searches for it', [c.went[5], r.message]);
r = await R.runCommand('georgia GOV', c);
ok(r.ok && c.went[6] === '/entity/country%3AGEO#government', 'a shared name: the better known entity');
r = await R.runCommand('new york GOV', c);
ok(r.ok && /^\/entity\/(city%3Anew-york|state%3AUS-NY)#government$/.test(c.went[7]), 'a name of two words before a code', c.went[7]);
r = await R.runCommand('apple BUDG', c);
ok(!r.ok && c.went.length === 8 && /does not apply to Apple/.test(r.message), 'the wrong kind of entity typed out: the error, no move', r.message);
r = await R.runCommand('FIND lithium', c);
ok(r.ok && c.went[8] === '/find?q=lithium', 'FIND and words');
r = await R.runCommand('   ', c);
ok(!r.ok && !r.message && c.went.length === 9, 'an empty line does nothing');
store.clear();
for (let i = 0; i < 60; i++) await R.runCommand(i % 2 ? 'TOP' : `HELP ${F.FUNCTIONS[i % F.FUNCTIONS.length].code}`, ctx());
ok(R.commandHistory().length <= 50 && R.commandHistory().filter((x: string) => x === 'TOP').length === 1 && R.commandHistory().at(-1) === 'TOP', 'history holds the last 50, each command once, the latest last', R.commandHistory().length);
ok(same(R.nearCodes('BUGD').slice(0, 1), ['BUDG']) && R.nearCodes('NEW').includes('NEWS') && !R.nearCodes('QQQQQ').length, 'suggestions for a mistyped code');
ok(R.matchFunctions('cal')[0].code === 'CAL' && R.matchFunctions('budget')[0].code === 'BUDG' && R.matchFunctions('sanction').some((f: any) => f.code === 'SANC') && !R.matchFunctions('').length, 'functions are found by code, title and description');

// ───────────────────────── Keys ─────────────────────────
console.log('Fixes from the review');
// "EU" must stay the European Union when the United States carries Wikidata's French label "ÉU".
const usa = G.getEntity('country:USA');
G.upsertEntity({ ...usa, attrs: { ...usa.attrs, altNames: [...(usa.attrs?.altNames || []), 'ÉU', 'Vereinigte Staaten'] } });
ok(same(ids('EU', 1), ['igo:eu']), 'a name of the entity itself beats another language’s label of another entity', C.resolveCommandEntities('EU', 1).entities.map((e: any) => [e.id, e.how]));
const vs = C.resolveCommandEntities('Vereinigte Staaten', 1).entities[0];
ok(vs?.id === 'country:USA' && vs.how === 'other' && !vs.exact && vs.sure, 'a match only on another language’s label is used (it is the only one), but not as an exact match', vs && [vs.id, vs.how, vs.exact, vs.sure]);
ok(same(ids('state:US-GA', 1), ['state:US-GA']), 'an entity id names exactly that entity');
const c3 = ctx();
r = await R.runCommand('state:US-GA GOV', c3);
ok(r.ok && c3.went[0] === '/entity/state%3AUS-GA#government', 'so a list row can run a function on the very entity it shows', c3.went);
const c4 = ctx(); c4.resolve = async (words: string, max: number) => (words === 'News Corp' ? [{ id: 'company:news-corp', type: 'company', name: 'News Corp', score: 100, exact: true, sure: true }] : resolve(words, max));
r = await R.runCommand('News Corp', c4);
ok(r.ok && c4.went[0] === '/entity/company%3Anews-corp', 'a code first whose whole phrase names an entity opens the entity ("News Corp")', [c4.went, r.message]);
r = await R.runCommand('NEWS china', c4);
ok(r.ok && c4.went[1] === '/news?entity=country%3ACHN', 'while a code with an entity after it still runs', c4.went);
const OIL = { id: 'commodity:crude-oil', type: 'commodity', name: 'Crude oil' }, NATO = { id: 'igo:nato', type: 'igo', name: 'NATO' }, EUo = { id: 'igo:eu', type: 'igo', name: 'European Union' };
ok(url('RES', [OIL]) === '/entity/commodity%3Acrude-oil#stocks' && F.fnAt(loc('/entity/commodity%3Acrude-oil#stocks'))?.fn.code === 'RES', 'a commodity’s reserves are its stocks section, and the address reads back as RES', url('RES', [OIL]));
ok(/shown only for EU/.test(url('BUDG', [NATO])) && url('BUDG', [EUo]) === '/entity/igo%3Aeu#budget' && /EU, UN/.test(url('SANC', [NATO])), 'a section only some organizations have: the others get a plain answer, not an empty jump', [url('BUDG', [NATO]), url('SANC', [NATO])]);
ok(!F.fnAppliesTo(F.fnByCode('RES'), { id: 'commodity:gold', type: 'commodity' }) && F.fnAppliesTo(F.fnByCode('RES'), OIL), 'and the function bar can tell beforehand');
let threw = false; try { F.fnAt(loc('/entity/100%')); } catch { threw = true; }
ok(!threw && F.fnAt(loc('/entity/100%'))?.fn.code === 'DES', 'a malformed address does not break the page', threw);
ok(K.workspaceKey({ key: '#', code: 'Digit3', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }) === null && K.workspaceKey({ key: '£', code: 'Digit3', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }) === null, 'Option with a digit on a Mac types its character (#, £): not a pane key');
ok(K.workspaceKey({ key: '3', code: 'Digit3', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }) === '3' && K.workspaceKey({ key: '3', code: 'Digit3', altKey: false, ctrlKey: true, metaKey: false, shiftKey: false }) === '3' && K.workspaceKey({ key: 'F6', code: 'F6', altKey: false, ctrlKey: false, metaKey: false, shiftKey: true }) === 'prev', 'Alt+3 on Windows and Linux, Ctrl+3 and Shift+F6 still are');
(globalThis as any).location = new URL('http://localhost:5180/board');
const Bd = await imp('src/board.ts');
ok(['/.//evil.example/x', '/a/..//evil.example/x', '//evil.example', 'https://evil.example/', '/board'].every((u) => Bd.safePaneUrl(u) === null) && Bd.safePaneUrl('/entity/country%3ADEU#budget') === '/entity/country%3ADEU#budget', 'a pane never shows another site, whatever a stored workspace says', ['/.//evil.example/x', '/a/..//evil.example/x'].map((u) => Bd.safePaneUrl(u)));

console.log('Keys');
const ev = (key: string, mods: any = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
const keys = Object.values(K.KEYS) as any[];
ok(keys.every((k) => k.keys.length && k.about && K.KEY_AREAS.includes(k.area) && typeof k.is === 'function'), 'every shortcut has keys to show, a description, an area and a test');
ok(K.KEYS.focus.is(ev('k', { ctrlKey: true })) && K.KEYS.focus.is(ev('k', { metaKey: true })) && K.KEYS.focus.is(ev('/')) && !K.KEYS.focus.is(ev('k')), 'Ctrl K, ⌘ K and / go to the command line; a bare k does not');
ok(K.KEYS.typeAhead.is(ev('d')) && !K.KEYS.typeAhead.is(ev('d', { ctrlKey: true })) && !K.KEYS.typeAhead.is(ev('1')) && !K.KEYS.typeAhead.is(ev('Enter')), 'letters start a command; shortcuts with Ctrl and other keys do not');
ok(K.KEYS.related.is(ev('3')) && !K.KEYS.related.is(ev('0')) && !K.KEYS.related.is(ev('3', { altKey: true })), 'digits 1 to 9 run related functions');
ok(K.KEYS.run.is(ev('Enter')) && !K.KEYS.run.is(ev('Enter', { shiftKey: true })) && K.KEYS.onMap.is(ev('Enter', { shiftKey: true })), 'Enter and Shift Enter are told apart');
const inArea = (a: string) => keys.filter((k) => k.area === a);
const overlap = ['Anywhere', 'In the command line'].flatMap((a) => ['a', '1', '/', 'Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'F1'].filter((key) => inArea(a).filter((k) => k.is(ev(key))).length > 1).map((key) => `${a}: ${key}`));
ok(!overlap.length, 'no key means two things in the same place', overlap);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll terminal checks passed');
process.exit(failures ? 1 : 0);

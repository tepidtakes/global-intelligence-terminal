// Offline checks for the live monitors: the world share-index board and the currency cross table
// (server/marketBoards.ts, functions EQ and FXM) with seeded quotes, and the table export text
// (src/tableExport.ts). Run: npm run check:monitors
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-monitors-check-'));
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const seed = (key: string, payload: unknown) => {
  const dir = path.join(process.env.TERMINAL_DATA_DIR!, 'cache'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, crypto.createHash('sha1').update(key).digest('hex') + '.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), payload }));
};
let failures = 0;
const ok = (cond: unknown, label: string, detail?: unknown) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`); if (!cond) failures++; };
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const B = await imp('server/marketBoards.ts');
const M = await imp('server/markets.ts');
const W = await imp('server/web/weights.ts');

/** A year of daily closes ending at `last`, rising steadily from `first`. */
function series(symbol: string, first: number, last: number, days = 370) {
  const end = Date.now();
  const points = Array.from({ length: days }, (_, i) => ({ t: new Date(end - (days - 1 - i) * 86400_000).toISOString().slice(0, 10), c: first + ((last - first) * i) / (days - 1) }));
  return { symbol, price: last, currency: 'XXX', name: symbol, time: new Date(end).toISOString(), points };
}
/** Seed the quote cache the way spark() asks for it: chunks of 20 symbols. */
function seedSpark(symbols: string[], make: (s: string) => any) {
  for (let i = 0; i < symbols.length; i += 20) {
    const chunk = symbols.slice(i, i + 20); const data: Record<string, any> = {};
    for (const s of chunk) { const v = make(s); if (v) data[s] = v; }
    seed(`spark:1y:1d:${chunk.join(',')}`, data);
  }
}

// ───────────────────────── Share indices ─────────────────────────
console.log('World share indices');
W.setSharesForTest({ year: '2026', source: 'test', at: new Date().toISOString(), byIso3: { USA: 25, CHN: 18, DEU: 4.5, JPN: 4.2, IND: 4, GBR: 3.4, FRA: 3.1, BRA: 2.2, RUS: 2.1, ITA: 2.2, CAN: 2.1, KOR: 1.7, SAU: 1.1, ZAF: 0.4 } });
const ranked = (await W.gdpRanking()).slice(0, B.INDEX_ECONOMIES).map((r: any) => r.iso3);
const picked = ranked.filter((iso3: string) => B.SHARE_INDICES[iso3]);
const dead = B.SHARE_INDICES.KOR.symbol;
seedSpark(picked.map((iso3: string) => B.SHARE_INDICES[iso3].symbol), (s) => (s === dead ? null : series(s, 100, 110)));
const ix = await B.indexBoard();
ok(ix.rows.length === picked.length && ix.rows.map((r: any) => r.iso3).join() === picked.join(), 'the largest economies that have an index, in GDP order', ix.rows.map((r: any) => r.iso3));
ok(ix.rows.find((r: any) => r.iso3 === 'USA')?.region === 'Americas' && ix.rows.find((r: any) => r.iso3 === 'JPN')?.region === 'Asia-Pacific' && ix.rows.find((r: any) => r.iso3 === 'DEU')?.region === 'Europe' && ix.rows.find((r: any) => r.iso3 === 'SAU')?.region === 'Middle East & Africa', 'grouped by region, from the country data', ix.rows.map((r: any) => `${r.iso3}:${r.region}`));
ok(ix.regions.every((g: string) => ix.rows.some((r: any) => r.region === g)) && ix.regions.indexOf('Americas') < ix.regions.indexOf('Europe'), 'only regions with rows, in a fixed order', ix.regions);
const kor = ix.rows.find((r: any) => r.iso3 === 'KOR');
ok(kor?.unavailable && ix.missing.some((m: string) => m.startsWith(dead)), 'a symbol that returned nothing is shown as missing, not hidden', ix.missing);
const usa = ix.rows.find((r: any) => r.iso3 === 'USA');
ok(usa?.last === 110 && usa.gdpRank === 1 && usa.change.y1 > 9.5 && usa.change.y1 < 10 && usa.change.ytd > 0 && usa.change.d1 > 0 && usa.history.length <= 41, 'level, rank, changes and a thinned history', usa);
ok(ix.noIndex.includes('Russia') && ix.noIndex.includes('South Africa'), 'large economies without an index are named, as candidates for the table', ix.noIndex);
ok(Object.values(B.SHARE_INDICES).every((x: any) => x.symbol && x.name) && new Set(Object.values(B.SHARE_INDICES).map((x: any) => x.symbol)).size === Object.keys(B.SHARE_INDICES).length, 'every index has a symbol and a name, and no symbol is used twice');

// ───────────────────────── Currency cross table ─────────────────────────
console.log('Currency cross table');
const codes = ['USD', 'EUR', 'JPY', 'GBP'];
const per = { USD: 1, EUR: 0.9, JPY: 150, GBP: 0.8 };
const prev = { USD: 1, EUR: 0.91, JPY: 150, GBP: undefined };
const t = B.crossTable(codes, per, prev);
ok(t.every((row: any[], i: number) => row[i] === null), 'the diagonal is empty');
ok(near(t[1][2].v, 150 / 0.9) && near(t[0][2].v, 150), 'a cell is units of the column currency for one unit of the row currency', [t[1][2].v, t[0][2].v]);
let inverse = true, triangle = true;
for (let a = 0; a < codes.length; a++) for (let b = 0; b < codes.length; b++) {
  if (a === b) continue;
  inverse &&= near(t[a][b].v * t[b][a].v, 1);
  for (let c = 0; c < codes.length; c++) if (c !== a && c !== b) triangle &&= near(t[a][b].v * t[b][c].v, t[a][c].v);
}
ok(inverse, 'A in B times B in A is one, for every pair');
ok(triangle, 'and going through a third currency gives the same rate');
ok(near(t[1][0].d1, (1 / 0.9 / (1 / 0.91) - 1) * 100) && t[1][0].d1 > 0, 'the day’s change: positive when the row’s currency gained (the euro rose against the dollar)', t[1][0].d1);
ok(t[3][0].d1 === undefined && t[0][3].d1 === undefined && t[1][2].d1 !== undefined, 'no change where yesterday’s rate is unknown');

const users = M.currencyUsers();
const fxCodes = [...users.keys()].filter((c: string) => c !== 'USD' && users.get(c).countries.some((x: any) => x.independent)).sort();
const RATE: Record<string, number> = { EUR: 0.92, CNY: 7.1, JPY: 152, GBP: 0.79, INR: 84, BRL: 5.6, CAD: 1.38, KRW: 1390, SAR: 3.75, RUB: 95, ZAR: 18 };
seedSpark(fxCodes.map((c: string) => `${c}=X`), (s) => { const c = s.slice(0, 3); return RATE[c] ? series(s, RATE[c] * 1.02, RATE[c]) : null; });
const mx = await B.fxMatrix();
const order = mx.currencies.map((c: any) => c.code);
ok(order[0] === 'USD' && order[1] === 'CNY' && order[2] === 'EUR' && order.filter((c: string) => c === 'EUR').length === 1, 'the dollar, then the currencies of the largest economies; the euro once', order);
ok(order.length <= B.MATRIX_CURRENCIES && order.every((c: string) => c === 'USD' || RATE[c]), 'only currencies with a quote, at most the table size', order);
const eu = order.indexOf('EUR'), jp = order.indexOf('JPY');
ok(near(mx.cells[eu][jp].v, 152 / 0.92), 'cells come from the rates against the dollar', mx.cells[eu][jp]);
ok(mx.cells[eu][0].d1 !== undefined && Math.abs(mx.cells[eu][0].d1) < 1, 'and carry the day’s change', mx.cells[eu][0]);

// ───────────────────────── Export ─────────────────────────
console.log('Export of tables');
const X = await imp('src/tableExport.ts');
const rows = [['Market', 'Price', 'Note'], ['Brent', '82.10', 'front month, "ICE"'], ['Gold', '2,410.5', 'line\nbreak'], [' Copper ', '4.1', 'tab\there']];
const csv = X.toCsv(rows, { page: 'http://localhost:5180/markets?tab=commodities', at: '2026-11-20T10:00:00.000Z' });
const lines = csv.split('\r\n');
ok(lines[0] === 'Market,Price,Note' && lines[1] === 'Brent,82.10,"front month, ""ICE"""' && lines[2] === 'Gold,"2,410.5",line break' && lines[3] === 'Copper,4.1,tab here', 'CSV: commas and quotes escaped, line breaks and spaces folded', lines.slice(0, 4));
ok(lines[4] === '' && lines[5] === 'Page,http://localhost:5180/markets?tab=commodities' && lines[6] === 'Exported,2026-11-20T10:00:00.000Z' && csv.endsWith('\r\n'), 'and it says where and when it was taken', lines.slice(4));
const tsv = X.toTsv(rows).split('\n');
ok(tsv.length === 4 && tsv[1] === 'Brent\t82.10\tfront month, "ICE"' && tsv[3] === 'Copper\t4.1\ttab here', 'tab-separated for pasting: one cell per column, no stray tabs', tsv);
ok(X.fileName('Major currencies', new Date('2026-11-20T10:00:00Z')) === 'major-currencies-2026-11-20.csv' && X.fileName('Énergie & métaux', new Date('2026-11-20T10:00:00Z')) === 'energie-metaux-2026-11-20.csv' && X.fileName('', new Date('2026-11-20T10:00:00Z')) === 'table-2026-11-20.csv', 'file names from the table’s heading and the date');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll monitor checks passed');
process.exit(failures ? 1 : 0);

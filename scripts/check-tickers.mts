// Checks that every quote symbol in the curated dataset resolves on the delayed-quote
// provider, and prints the exchange and security name it reports so mismatches stand out.
// Run: npm run check:tickers
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { CURATED_ENTITIES } = await import(pathToFileURL(path.resolve('server/data/curated.ts')).href);
const rows = (CURATED_ENTITIES as any[]).filter((e) => e.attrs?.quoteSymbol).map((e) => ({ id: e.id, name: e.name, symbol: e.attrs.quoteSymbol as string, exchange: e.attrs.exchange as string | undefined, currency: e.attrs.currency as string | undefined }));
const syms = [...new Set(rows.map((r) => r.symbol))];
const meta: Record<string, any> = {};
for (let i = 0; i < syms.length; i += 20) {
  const chunk = syms.slice(i, i + 20);
  const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${chunk.map(encodeURIComponent).join(',')}&range=5d&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j: any = await res.json();
  for (const r of j?.spark?.result || []) meta[r.symbol] = r.response?.[0]?.meta;
}
let bad = 0;
for (const r of rows) {
  const m = meta[r.symbol];
  if (!m?.regularMarketPrice) { bad++; console.log(`MISSING  ${r.symbol.padEnd(12)} ${r.name}`); continue; }
  const cur = m.currency === 'GBp' ? 'GBP' : m.currency === 'ZAc' ? 'ZAR' : m.currency;
  const flag = r.currency && cur && r.currency !== cur && r.id.startsWith('company:') ? ' ← currency differs' : '';
  if (flag) bad++;
  console.log(`ok       ${r.symbol.padEnd(12)} ${String(m.fullExchangeName || m.exchangeName).padEnd(22)} ${String(m.currency).padEnd(4)} ${(m.longName || m.shortName || '').slice(0, 44).padEnd(44)} ← ${r.name}${flag}`);
}
console.log(`\n${rows.length - bad}/${rows.length} symbols resolve`);
process.exitCode = bad ? 1 : 0;

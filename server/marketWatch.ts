// Market producers for the change feed (and so for alerts):
//   • daily price moves of watched companies and commodities (Yahoo, delayed);
//   • currency moves against the dollar for watched countries;
//   • daily 10-year yield moves where an official daily close exists (US, Canada, Japan, UK);
//   • every central-bank policy-rate change reported to the BIS (all ~40 banks, not just watched ones).
// A move is recorded once per threshold it crosses (e.g. 2 %, 3 %, 5 % …); each rule picks the
// threshold it asked for, and views show only the largest version of the same move.
import { publish } from './live.js';
import { getEntity, listByType, geoChain, stub } from './graph.js';
import { getQuote } from './providers.js';
import { fxFor, yieldCurve, policyRates, EURO_AREA, mapLimit, currencyUsers } from './markets.js';
import { recordChange, kvGet, kvSet } from './changes.js';
import { allWatchedEntities, BUCKETS } from './alerts.js';

const DAILY_YIELD = ['USA', 'CAN', 'JPN', 'GBR'];
const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;

export async function checkMarkets() {
  const { entities: watched, places } = allWatchedEntities();
  // Companies and commodities located in watched places count as watched for price moves.
  if (places.size) for (const c of listByType('company')) if (geoChain(c.id).some((p) => places.has(p))) watched.add(c.id);
  const priceIds = [...watched].filter((id) => getEntity(id)?.attrs?.quoteSymbol).slice(0, 80);
  let recorded = 0;
  await mapLimit(priceIds, 4, async (id) => {
    const e = getEntity(id)!; const sym = e.attrs!.quoteSymbol as string;
    try {
      const q = await getQuote(sym, '1mo');
      if (q.changePct == null || q.stale) return;
      const abs = Math.abs(q.changePct); const day = q.marketTime.slice(0, 10); const dir = q.changePct > 0 ? 'up' : 'down';
      for (const b of BUCKETS.market) if (abs >= b && recordChange({
        key: `mkt:${sym}:${day}:${dir}:${b}`, grp: `mkt:${sym}:${day}`, kind: 'market', magnitude: b, entityIds: [id],
        title: `${e.name} ${q.changePct > 0 ? 'rose' : 'fell'} ${fmtPct(q.changePct)} (${day})`, detail: `${sym} closed at ${q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${q.currency}. Delayed quote.`,
        sourceId: 'yahoo-finance', quality: 'delayed', importance: 3 + BUCKETS.market.indexOf(b), at: q.marketTime,
      })) recorded++;
    } catch { /* quote unavailable: try next time */ }
  });
  // Currencies of watched countries.
  const users = currencyUsers();
  const codes = new Set<string>();
  for (const id of watched) { const e = getEntity(id); const code = e?.type === 'country' ? e.attrs?.currencies?.[0]?.code : undefined; if (code && code !== 'USD') codes.add(code); }
  await mapLimit([...codes].slice(0, 40), 4, async (code) => {
    try {
      const f = await fxFor(code, '1y'); const d1 = (f?.change as any)?.d1;
      if (!f || d1 == null) return;
      const day = f.time.slice(0, 10); const abs = Math.abs(d1); const name = users.get(code)?.name || code;
      const countryIds = (users.get(code)?.countries || []).filter((c) => c.independent).map((c) => c.id);
      for (const b of BUCKETS.fx) if (abs >= b && recordChange({
        key: `fx:${code}:${day}:${d1 > 0 ? 'up' : 'down'}:${b}`, grp: `fx:${code}:${day}`, kind: 'fx', magnitude: b, entityIds: countryIds,
        title: `${name} ${d1 > 0 ? 'strengthened' : 'weakened'} ${Math.abs(d1).toFixed(1)}% against the US dollar (${day})`, detail: `${f.perUsd.toLocaleString('en-US', { maximumSignificantDigits: 5 })} ${code} per US$. Delayed quote.`,
        sourceId: 'yahoo-finance', quality: 'delayed', importance: 3 + BUCKETS.fx.indexOf(b), at: f.time,
      })) recorded++;
    } catch { /* next time */ }
  });
  // Daily 10-year yields.
  for (const iso of DAILY_YIELD) {
    if (!watched.has(`country:${iso}`)) continue;
    try {
      const c = await yieldCurve(iso);
      const a = c?.latest.points.find((p) => p.years === 10)?.value, b0 = c?.previous?.points.find((p) => p.years === 10)?.value;
      if (!c || a == null || b0 == null) continue;
      const bp = Math.round((a - b0) * 100); const abs = Math.abs(bp);
      for (const b of BUCKETS.yield) if (abs >= b && recordChange({
        key: `y10:${iso}:${c.latest.date}:${bp > 0 ? 'up' : 'down'}:${b}`, grp: `y10:${iso}:${c.latest.date}`, kind: 'yield', magnitude: b, entityIds: [`country:${iso}`],
        title: `${stub(`country:${iso}`)?.name} 10-year yield ${bp > 0 ? 'up' : 'down'} ${abs} bp to ${a.toFixed(2)}% (${c.latest.date})`, detail: c.name,
        sourceId: c.sourceId, quality: 'official', importance: 4 + BUCKETS.yield.indexOf(b), at: `${c.latest.date}T21:00:00Z`,
      })) recorded++;
    } catch { /* next time */ }
  }
  recorded += await checkPolicyRates();
  return recorded;
}

/** Every policy-rate change reported to the BIS since the last check (first check = baseline). */
export async function checkPolicyRates() {
  let r; try { r = await policyRates(); } catch { return 0; }
  const prev = kvGet<Record<string, { value: number; date: string }> | null>('rates:last', null);
  const snap: Record<string, { value: number; date: string }> = {};
  let recorded = 0; const seenArea = new Set<string>();
  for (const [iso, v] of Object.entries(r.data)) {
    const area = v.area === 'XM' ? 'XM' : iso;
    if (seenArea.has(area)) continue; seenArea.add(area);
    snap[area] = { value: v.value, date: v.date };
    // Keep a short history of rates per area (calendar results compare before and after a meeting).
    const hk = `rates:hist:${area}`; const hist = kvGet<{ date: string; value: number }[]>(hk, []);
    if (!hist.length || hist[hist.length - 1].value !== v.value) kvSet(hk, [...hist, { date: v.date, value: v.value }].slice(-40));
    const p = prev?.[area];
    if (!prev || !p || p.value === v.value || v.date <= p.date) continue;
    const bp = Math.round((v.value - p.value) * 100);
    const entityIds = area === 'XM' ? ['igo:eu', ...EURO_AREA.map((x) => `country:${x}`)] : [`country:${iso}`];
    const big = ['USA', 'XM', 'GBR', 'JPN', 'CHN'].includes(area);
    if (recordChange({
      key: `rate:${area}:${v.date}:${v.value}`, kind: 'rate', entityIds,
      title: `${v.bank} ${bp > 0 ? 'raised' : 'cut'} its policy rate by ${Math.abs(bp)} bp to ${v.value.toFixed(2)}%`, detail: `Previous ${p.value.toFixed(2)}% (as of ${p.date}). Bank for International Settlements policy-rate data.`,
      sourceId: 'bis-policy', quality: 'official', importance: big ? 9 : 7, at: `${v.date}T12:00:00Z`,
    })) recorded++;
  }
  kvSet('rates:last', { ...(prev || {}), ...snap });
  return recorded;
}

export function startMarketWatch() {
  const run = () => { void checkMarkets().catch((e) => console.warn('[markets-watch]', e.message)); };
  setTimeout(run, 60_000).unref();
  setInterval(() => { void Promise.resolve(run()).then(() => publish('markets')); }, 10 * 60_000).unref();
}

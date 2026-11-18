// Reads the real sources and reports what could not be parsed or matched, so drift in a page or an
// API is caught early: the Wikipedia conflict list and election calendars, the central banks'
// schedule pages, Wikidata's meetings of the web's organizations, and the World Bank vs IMF
// cross-checks. Needs internet access. Run: npm run check:live
// (behind a proxy: NODE_USE_ENV_PROXY=1 npm run check:live)
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
process.env.TERMINAL_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'git-live-check-')); // never the real data folder
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const { parseConflicts, parseElectionCalendar, INTENSITY } = await imp('server/worldEvents.ts');
const { fetchJson } = await imp('server/cache.ts');

// Through the terminal's own network gate, so a host that cannot be reached gets a readable reason.
const wt = async (page: string) => (await fetchJson(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1`)).parse.wikitext as string;
let problems = 0;
/** One source at a time: a source that is down is reported and the rest still run. */
async function section(title: string, run: () => Promise<void>) {
  console.log(`\n${title}`);
  try { await run(); } catch (e: any) { problems++; console.log(`  ✗ ${e.message}`); }
}

await section('Wikipedia: ongoing armed conflicts', async () => {
  const conflicts = parseConflicts(await wt('List of ongoing armed conflicts'));
  console.log(`  Conflicts parsed: ${conflicts.length}`);
  for (const k of Object.keys(INTENSITY)) console.log(`    ${k}: ${conflicts.filter((c: any) => c.intensity === k).length}`);
  for (const c of conflicts.slice(0, 6)) console.log(`    • [${c.intensity}] ${c.name} — since ${c.start} — ${c.locations.map((l: any) => l.name).join(', ')} — ${c.yearly.map((y: any) => `${y.year}: ${y.deaths}`).join(', ')}`);
  const unresolved = [...new Set(conflicts.flatMap((c: any) => c.locations.filter((l: any) => !l.id).map((l: any) => l.name)))];
  console.log(`  Locations not matched to a country (${unresolved.length}): ${unresolved.join(', ') || '—'}`);
  if (conflicts.length < 30) { problems++; console.log('  ✗ suspiciously few conflicts'); }
  if (conflicts.some((c: any) => !c.locations.length)) { problems++; console.log('  ✗ conflicts without locations:', conflicts.filter((c: any) => !c.locations.length).map((c: any) => c.name)); }
});

const y = new Date().getFullYear();
for (const year of [y, y + 1]) await section(`Wikipedia: ${year} national electoral calendar`, async () => {
  const rows = parseElectionCalendar(await wt(`${year} national electoral calendar`), String(year));
  const miss = rows.filter((r: any) => !r.countryId);
  console.log(`  ${rows.length} entries, ${miss.length} not matched (${[...new Set(miss.map((r: any) => r.country))].join(', ')})`);
  for (const r of rows.filter((r: any) => r.date >= new Date().toISOString().slice(0, 10)).slice(0, 6)) console.log(`    • ${r.date} ${r.country} — ${r.office}${r.nonSovereign ? ' (non-sovereign)' : ''}`);
  if (!rows.length) { problems++; console.log('  ✗ no entries parsed'); }
});

// ───────────── Central banks: decision days read from each bank's schedule page ─────────────
const B = await imp('server/bankSchedules.ts');
const EC = await imp('server/econCalendar.ts');
console.log('\nCentral-bank schedule pages');
for (const bank of EC.BANK_SCHEDULES as { area: string; bank: string; url: string; dates: string[] }[]) {
  if (!B.hasSchedulePage(bank.area)) { console.log(`  – ${bank.bank}: no page reader; the checked list is used (${bank.dates.length} dates, last ${bank.dates.at(-1)})`); continue; }
  try {
    const read = (await B.readSchedulePage(bank.area, bank.url)).data as string[];
    const verdict = B.acceptSchedule(read, bank.dates);
    const extra = read.filter((d) => !bank.dates.includes(d) && d > (bank.dates.at(-1) || ''));
    if (verdict.ok) console.log(`  ✓ ${bank.bank}: ${read.length} dates on the page (${read[0]} … ${read.at(-1)}), every checked date among them${extra.length ? `; adds ${extra.join(', ')}` : ''}`);
    else { problems++; console.log(`  ✗ ${bank.bank}: page reading not usable — ${verdict.reason}. Read: ${read.join(', ') || '(nothing)'}`); }
  } catch (e: any) { problems++; console.log(`  ✗ ${bank.bank}: ${e.message}`); }
}

// ───────────── Wikidata: organizations, then their upcoming meetings ─────────────
const C = await imp('server/web/connectors.ts');
await imp('server/web/wikidata.ts');
const EV = await imp('server/web/events.ts');
console.log('\nWikidata: organizations and their meetings');
for (const id of ['wikidata-organizations', 'wikidata-events']) {
  const r = await C.runConnector(id);
  console.log(`  ${r?.ok ? '✓' : '✗'} ${id}: ${r?.detail}`);
  if (!r?.ok) problems++;
}
for (const e of (EV.liveOrgEvents() as { start: string; end?: string; title: string; placeIds: string[]; location?: string }[]).slice(0, 12)) console.log(`    • ${e.start}${e.end ? `–${e.end}` : ''} ${e.title}${e.location ? ` — ${e.location}` : ''} [${e.placeIds.join(', ')}]`);

// ───────────── World Bank vs IMF: the same figure from both ─────────────
const AG = await imp('server/agreement.ts');
console.log('\nWorld Bank vs IMF cross-checks');
try {
  await AG.refreshAgreement();
  const st = AG.agreementStatus(), sum = AG.agreementSummary(8);
  console.log(`  ${st ? '✓' : '✗'} ${JSON.stringify(st)}`);
  if (!st) problems++;
  for (const row of (sum?.conflicts || sum?.rows || []).slice(0, 8)) console.log(`    • ${JSON.stringify(row).slice(0, 220)}`);
} catch (e: any) { problems++; console.log(`  ✗ ${e.message}`); }

// ───────────── What the network gate saw ─────────────
const NET = await imp('server/net.ts');
console.log('\nHosts contacted');
for (const h of NET.hostHealth() as { host: string; state: string; requests: number; retries: number; lastError?: string }[]) console.log(`  ${h.state === 'ok' ? '✓' : '✗'} ${h.host}: ${h.requests} requests, ${h.retries} retried${h.lastError ? ` — last error: ${h.lastError}` : ''}`);
console.log(problems ? `\n${problems} problem(s) found` : '\nAll live sources read as expected');
process.exit(problems ? 1 : 0);

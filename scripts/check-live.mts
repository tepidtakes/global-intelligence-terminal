// Parses the live Wikipedia conflict list and election calendars and reports what could
// not be matched to a country, so parser drift is caught early. Run: npm run check:live
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const { parseConflicts, parseElectionCalendar, INTENSITY } = await imp('server/worldEvents.ts');

const wt = async (page: string) => {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1`, { headers: { 'User-Agent': 'GlobalIntelligenceTerminal/0.1 (check script)' } });
  return (await r.json()).parse.wikitext as string;
};
let problems = 0;
const conflicts = parseConflicts(await wt('List of ongoing armed conflicts'));
console.log(`Conflicts parsed: ${conflicts.length}`);
for (const k of Object.keys(INTENSITY)) console.log(`  ${k}: ${conflicts.filter((c: any) => c.intensity === k).length}`);
for (const c of conflicts.slice(0, 6)) console.log(`  • [${c.intensity}] ${c.name} — since ${c.start} — ${c.locations.map((l: any) => l.name).join(', ')} — ${c.yearly.map((y: any) => `${y.year}: ${y.deaths}`).join(', ')}`);
const unresolved = [...new Set(conflicts.flatMap((c: any) => c.locations.filter((l: any) => !l.id).map((l: any) => l.name)))];
console.log(`  Locations not matched to a country (${unresolved.length}): ${unresolved.join(', ') || '—'}`);
if (conflicts.length < 30) { problems++; console.log('  ✗ suspiciously few conflicts'); }
if (conflicts.some((c: any) => !c.locations.length)) { problems++; console.log('  ✗ conflicts without locations:', conflicts.filter((c: any) => !c.locations.length).map((c: any) => c.name)); }

const y = new Date().getFullYear();
for (const year of [y, y + 1]) {
  const rows = parseElectionCalendar(await wt(`${year} national electoral calendar`), String(year));
  const miss = rows.filter((r: any) => !r.countryId);
  console.log(`\nElections ${year}: ${rows.length} entries, ${miss.length} not matched (${[...new Set(miss.map((r: any) => r.country))].join(', ')})`);
  for (const r of rows.filter((r: any) => r.date >= new Date().toISOString().slice(0, 10)).slice(0, 6)) console.log(`  • ${r.date} ${r.country} — ${r.office}${r.nonSovereign ? ' (non-sovereign)' : ''}`);
  if (!rows.length) problems++;
}
process.exitCode = problems ? 1 : 0;

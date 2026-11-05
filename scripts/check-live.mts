// Parses the live Wikipedia conflict list and election calendars and reports what could
// not be matched to a country, so parser drift is caught early. Run: npm run check:live
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const { parseConflicts, parseElectionCalendar, warInfos, INTENSITY } = await imp('server/worldEvents.ts');

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

// War sides: read the infoboxes of the wars inside the major wars (same selection as the app).
const majors = conflicts.filter((c: any) => c.intensity === 'major-war');
const links = [...new Set(majors.flatMap((c: any) => c.theatreLinks.filter((l: any) => l.depth <= 2).map((l: any) => l.article)))] as string[];
const { infos, failed } = await warInfos(links);
const withSides = [...infos.values()].filter((w: any) => w.ongoing && w.sides.length >= 2);
console.log(`\nWar sides: ${links.length} articles inside major wars → ${infos.size} infoboxes, ${withSides.length} ongoing with ≥2 sides${failed ? `, ${failed} not loaded` : ''}`);
const lead = (s: any) => s.participants.filter((p: any) => p.role === 'main' && !p.former && p.depth === 1).slice(0, 3).map((p: any) => p.name).join(', ');
for (const w of withSides.slice(0, 8)) console.log(`  • ${w.name}: ${w.sides.slice(0, 3).map(lead).join('  vs  ')}`);
const junk = withSides.flatMap((w: any) => w.sides.flatMap((s: any) => s.participants)).filter((p: any) => /\{\{|\}\}|\[\[|^\W+$|^(military|diplomatic)? ?support$/i.test(p.name));
if (junk.length) { problems++; console.log(`  ✗ unparsed participant names: ${junk.slice(0, 5).map((p: any) => p.name).join(' | ')}`); }
if (withSides.length < 5) { problems++; console.log('  ✗ suspiciously few wars with sides'); }

const y = new Date().getFullYear();
for (const year of [y, y + 1]) {
  const rows = parseElectionCalendar(await wt(`${year} national electoral calendar`), String(year));
  const miss = rows.filter((r: any) => !r.countryId);
  console.log(`\nElections ${year}: ${rows.length} entries, ${miss.length} not matched (${[...new Set(miss.map((r: any) => r.country))].join(', ')})`);
  for (const r of rows.filter((r: any) => r.date >= new Date().toISOString().slice(0, 10)).slice(0, 6)) console.log(`  • ${r.date} ${r.country} — ${r.office}${r.nonSovereign ? ' (non-sovereign)' : ''}`);
  if (!rows.length) problems++;
}
process.exitCode = problems ? 1 : 0;

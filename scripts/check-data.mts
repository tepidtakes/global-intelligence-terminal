// Consistency audit of the built-in graph (baseline geography + curated dataset), without
// network access. Fails on errors (unknown sources, invalid quality labels, broken links,
// reversed terms); prints warnings and info for review. Run: npm run check:data
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-data-check-'));
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const { audit, summarize, coverage } = await imp('server/consistency.ts');
const { normalizeEventStatus } = await imp('server/augment.ts');
console.log(`Events past their date re-labelled "outcome not recorded": ${normalizeEventStatus()}`);
const { PUBLISHERS } = await imp('shared/newsSources.ts');

const issues = audit(true);
const s = summarize(issues);
const c = coverage();
console.log(`\nGraph: ${c.entities} entities · ${c.relationships} relationships · ${c.sources} sources · ${c.facts} facts`);
console.log(`Facts by quality: ${Object.entries(c.byQuality).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`Oldest curated verification: ${c.oldestCurated || '—'}`);
console.log(`\nIssues: ${s.bySeverity.error} errors · ${s.bySeverity.warning} warnings · ${s.bySeverity.info} info`);
for (const [k, v] of Object.entries(s.byCategory) as [string, any][]) console.log(`  [${v.severity}] ${v.label} (${k}): ${v.count}`);
const show = (sev: string, n: number) => {
  const list = issues.filter((i: any) => i.severity === sev);
  if (!list.length) return;
  console.log(`\n${sev.toUpperCase()}S${list.length > n ? ` (first ${n} of ${list.length})` : ''}`);
  for (const i of list.slice(0, n)) console.log(`  • ${i.entityName ? `${i.entityName}: ` : ''}${i.message}`);
};
show('error', 50); show('warning', 40);

// Publisher registry sanity: no domain listed twice.
const seen = new Map<string, string>(); let dup = 0;
for (const p of PUBLISHERS) for (const d of p.domains) { if (seen.has(d)) { console.log(`  ✗ domain ${d} listed for ${seen.get(d)} and ${p.id}`); dup++; } seen.set(d, p.id); }

// Windows keeps the SQLite file locked until exit, so cleanup may fail there; a leftover temp folder is harmless.
try { fs.rmSync(process.env.TERMINAL_DATA_DIR!, { recursive: true, force: true }); } catch { /* ignore */ }
const failed = s.bySeverity.error + dup;
console.log(failed ? `\n✗ ${failed} error(s)` : '\n✓ No consistency errors');
process.exitCode = failed ? 1 : 0;

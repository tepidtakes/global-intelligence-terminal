// Checks the Obsidian Markdown conversion and Windows-safe naming.
// Run: npm run check:obsidian   (uses a temporary data folder, never your real notes)
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.TERMINAL_DATA_DIR ||= path.join(os.tmpdir(), 'git-obsidian-check');
const { _internal, safeName, normalizeVaultPath } = await import(pathToFileURL(path.resolve('server/obsidian.ts')).href);
const { htmlToMarkdown, markdownToHtml, entityNames } = _internal;
const { entFile } = entityNames();
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { failed++; if (detail !== undefined) console.log('      ', detail); } };

// Entity file names are unique and disambiguated
check('country gets plain name', entFile.get('country:SAU') === 'Saudi Arabia', entFile.get('country:SAU'));
check('Georgia country vs state disambiguated', entFile.get('country:GEO') !== entFile.get('state:US-GA'), [entFile.get('country:GEO'), entFile.get('state:US-GA')]);
check('all entity file names unique (case-insensitive)', new Set([...entFile.values()].map((s: string) => s.toLowerCase())).size === entFile.size);

// HTML → Markdown
const html = '<h2>Thesis</h2><p>Watch <a href="/entity/country%3ASAU">Saudi Arabia</a> and <a href="/research/new?title=Oil%20supply">Oil supply</a> plus <a href="https://example.com">web</a>. snake_case</p>'
  + '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Done thing</p></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Todo</p></div></li></ul>'
  + '<table><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th><th colspan="1" rowspan="1"><p>B</p></th></tr><tr><td colspan="1" rowspan="1"><p>1</p></td><td colspan="1" rowspan="1"><p>2</p></td></tr></tbody></table>'
  + '<ol><li><p>one</p></li><li><p>two</p><ul><li><p>nested</p></li></ul></li></ol><blockquote><p>[!note] callout</p></blockquote>';
const md = htmlToMarkdown(html, { hrefToTarget: (h: string) => h.startsWith('/entity/') ? 'Terminal/Entities/' + entFile.get(decodeURIComponent(h.slice(8))) : h.startsWith('/research/new?title=') ? decodeURIComponent(h.slice(20)) : null });
console.log('\n' + md + '\n');
check('entity mention → [[wikilink|alias]]', md.includes('[[Terminal/Entities/Saudi Arabia|Saudi Arabia]]'));
check('dangling note link → [[Oil supply]]', md.includes('[[Oil supply]]'));
check('web link stays Markdown', md.includes('[web](https://example.com)'));
check('task list → - [x] / - [ ]', md.includes('- [x] Done thing') && md.includes('- [ ] Todo'));
check('table is one line per row', /\| A \| B \|\n\| --- \| --- \|\n\| 1 \| 2 \|/.test(md));
check('lists use "- " and "1. "', md.includes('1. one') && md.includes('- nested'));
check('callout not escaped', md.includes('> [!note] callout'));

// Markdown → HTML
const back = markdownToHtml(md + '\n\n- [ ] new task\n- [x] done\n\n![[chart.png]]\n\n`[[not a link]]`\n\nSee [[Terminal/Entities/Saudi Arabia|KSA]] and [[Terminal/Notes/Other#Heading|other]]',
  (t: string) => t.toLowerCase().endsWith('saudi arabia') ? '/entity/country%3ASAU' : t.toLowerCase().endsWith('notes/other') ? '/research/00000000-0000-0000-0000-000000000000' : null);
console.log('\n' + back + '\n');
check('[[wikilink|alias]] → entity link', back.includes('<a href="/entity/country%3ASAU">KSA</a>'));
check('[[note#heading]] keeps the heading', back.includes('/research/00000000-0000-0000-0000-000000000000#Heading'));
check('unresolved [[link]] → create-on-click link', back.includes('/research/new?title=Oil%20supply'));
check('task list → Tiptap task items', back.includes('data-type="taskList"') && back.includes('data-checked="true"') && back.includes('data-checked="false"'));
check('embeds and code spans left alone', back.includes('![[chart.png]]') && back.includes('<code>[[not a link]]</code>'));
check('table survives', back.includes('<table>') && back.includes('<th>A</th>'));

// Tables exactly as the editor emits them (colgroup + inline widths)
const tiptapTable = '<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Field</p></th><th colspan="1" rowspan="1"><p>Barrels/day</p></th></tr><tr><td colspan="1" rowspan="1"><p>Ghawar</p></td><td colspan="1" rowspan="1"><p>3.8m</p></td></tr></tbody></table>';
const tableMd = htmlToMarkdown(tiptapTable, { hrefToTarget: () => null });
check('editor table → Markdown table (not raw HTML)', tableMd.startsWith('| Field | Barrels/day |') && !tableMd.includes('<'), tableMd);

// Callouts and single line breaks survive a full round trip (Obsidian → app → Obsidian)
const callout = '> [!warning] Risk\n> Demand slowdown in China.\n\nLine one\nLine two';
const calloutBack = htmlToMarkdown(markdownToHtml(callout, () => null), { hrefToTarget: () => null });
check('callout title and body stay on separate lines', calloutBack.includes('> [!warning] Risk\n> Demand slowdown in China.'), calloutBack);
check('single line breaks kept', calloutBack.includes('Line one\nLine two'), calloutBack);

// Windows-safe names
check('reserved device names', safeName('CON') === 'CON_' && safeName('aux.txt') === 'aux.txt_' && safeName('nul') === 'nul_');
check('forbidden characters', safeName('Q3: Oil? <Brent>') === 'Q3 Oil Brent', safeName('Q3: Oil? <Brent>'));
check('no leading/trailing dots or spaces', safeName('  ..dots.. ') === 'dots');
check('slashes removed', safeName('a/b\\c') === 'a b c');
check('link-breaking characters removed', safeName('Note #1 [draft] ^x') === 'Note 1 draft x', safeName('Note #1 [draft] ^x'));
check('length capped', safeName('x'.repeat(200)).length <= 120);
check('empty → Untitled', safeName('') === 'Untitled');

// Paths people paste on Windows
if (process.platform === 'win32') {
  process.env.TESTV = 'C:\\Vaults';
  check('quotes from "Copy as path" stripped', normalizeVaultPath('"C:\\Users\\me\\My Vault"') === 'C:\\Users\\me\\My Vault');
  check('%ENV% expanded', normalizeVaultPath('%TESTV%\\Main') === 'C:\\Vaults\\Main');
  check('forward slashes accepted', normalizeVaultPath('C:/Users/me/Vault') === 'C:\\Users\\me\\Vault');
  check('~ expands to home', normalizeVaultPath('~/Vault') === path.join(os.homedir(), 'Vault'));
  let threw = false; try { normalizeVaultPath('relative\\path'); } catch { threw = true; }
  check('relative path rejected', threw);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);

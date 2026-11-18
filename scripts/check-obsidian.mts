// Checks the Obsidian Markdown conversion, Windows-safe naming, pasted paths and (on Linux) the sync itself.
// Run: npm run check:obsidian   (uses a temporary data folder, never your real notes)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.TERMINAL_DATA_DIR ||= path.join(os.tmpdir(), 'git-obsidian-check');
const { _internal, safeName, normalizeVaultPath, detectVaults } = await import(pathToFileURL(path.resolve('server/obsidian.ts')).href);
const { htmlToMarkdown, markdownToHtml, entityNames, retry, accessError } = _internal;
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

// Paths people paste on Linux and macOS
if (process.platform !== 'win32') {
  check('file:// links from a file manager accepted', normalizeVaultPath('file:///home/me/My%20Vault') === '/home/me/My Vault', normalizeVaultPath('file:///home/me/My%20Vault'));
  // Older GNOME Files versions copy three lines; a one-line field may join them or keep the breaks.
  for (const [how, pasted] of [['three lines', 'x-special/nautilus-clipboard\ncopy\nfile:///home/me/My%20Vault\n'], ['joined into one line', 'x-special/nautilus-clipboardcopyfile:///home/me/My%20Vault'], ['two folders copied', 'copyfile:///home/me/My%20Vaultfile:///home/me/Other']])
    check(`file:// link found inside what GNOME Files copies (${how})`, normalizeVaultPath(pasted) === '/home/me/My Vault', normalizeVaultPath(pasted));
  check('a plain path with spaces is left alone', normalizeVaultPath('/home/me/My Vault') === '/home/me/My Vault');
  check('~ expands to home', normalizeVaultPath('~/Vault') === path.join(os.homedir(), 'Vault'));
  let example = ''; try { normalizeVaultPath('relative/path'); } catch (e: any) { example = e.message; }
  check('relative path rejected, with an example for this system', process.platform === 'darwin' ? /\/Users\/you\//.test(example) : /\/home\/you\//.test(example), example);
}
// Vault detection on Linux: the XDG config folder, a Documents folder named in another language,
// and folder names that differ only in case (Linux file systems are case-sensitive).
if (process.platform === 'linux') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-obsidian-linux-'));
  const home = path.join(tmp, 'home'), cfg = path.join(tmp, 'cfg');
  for (const d of ['Notes', 'notes', path.join('Dokumente', 'Arbeit', '.obsidian')]) fs.mkdirSync(path.join(home, d), { recursive: true });
  fs.mkdirSync(path.join(cfg, 'obsidian'), { recursive: true });
  fs.writeFileSync(path.join(cfg, 'obsidian', 'obsidian.json'), JSON.stringify({ vaults: { a: { path: path.join(home, 'Notes') }, b: { path: path.join(home, 'notes') } } }));
  fs.writeFileSync(path.join(cfg, 'user-dirs.dirs'), 'XDG_DOCUMENTS_DIR="$HOME/Dokumente"\n');
  const saved = { HOME: process.env.HOME, XDG: process.env.XDG_CONFIG_HOME };
  process.env.HOME = home; process.env.XDG_CONFIG_HOME = cfg;
  let found: string[] = [];
  try { found = detectVaults().map((v: any) => v.path); } finally {
    process.env.HOME = saved.HOME;
    if (saved.XDG === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = saved.XDG;
  }
  check('vault list read from $XDG_CONFIG_HOME/obsidian/obsidian.json', found.includes(path.join(home, 'Notes')), found);
  check('two vaults whose names differ only in case are both kept', found.includes(path.join(home, 'notes')) && found.includes(path.join(home, 'Notes')), found);
  check('a vault in a Documents folder named in another language is found (xdg-user-dirs)', found.includes(path.join(home, 'Dokumente', 'Arbeit')), found);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Permission errors: on Windows they are usually a passing lock (worth a retry); elsewhere they are
// permanent and the message must not blame Windows. (Not provoked for real: tests may run as root.)
{
  const denied = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES', path: '/vault/Terminal/Notes/.Plan.md.1-2.tmp' });
  let tries = 0; await retry(async () => { tries++; throw denied; }, 3).catch(() => {});
  check('"access denied" is retried only on Windows', tries === (process.platform === 'win32' ? 3 : 1), tries);
  tries = 0; await retry(async () => { tries++; throw Object.assign(new Error('busy'), { code: 'EBUSY' }); }, 2).catch(() => {});
  check('a busy file is retried everywhere', tries === 2, tries);
  const msg = accessError(denied);
  check('the permission message fits this system', process.platform === 'win32' ? /^Windows denied access/.test(msg) : !/Windows/.test(msg) && msg.includes('/vault/Terminal/Notes (EACCES)') && !msg.includes('.tmp'), msg);
  check('a failed rename names the file it was writing', process.platform === 'win32' || accessError({ code: 'EPERM', path: '/v/.a.md.1-2.tmp', dest: '/v/a.md' }).includes('/v/a.md (EPERM)'));
}

// The sync itself where file names are case-sensitive (Linux): files and vault folders that differ only in
// case are different things and must not be mixed up.
if (process.platform === 'linux') {
  const db = await import(pathToFileURL(path.resolve('server/db.ts')).href);
  const obs = await import(pathToFileURL(path.resolve('server/obsidian.ts')).href);
  const notes = await import(pathToFileURL(path.resolve('server/notes.ts')).href);
  const express = (await import('express')).default;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-obsidian-sync-'));
  const users: string[] = [];
  const mkUser = () => { const u = db.uid(); users.push(u); db.run('INSERT INTO users (id, email, password_hash, created_at) VALUES (?,?,?,?)', u, `${u}@check.test`, 'x', db.now()); return u; };
  const connect = (u: string, v: string) => { fs.mkdirSync(v, { recursive: true }); db.run('INSERT INTO vault_config (user_id, vault_path, folder, auto_sync, entity_pages, app_url) VALUES (?,?,?,0,0,?)', u, v, 'Terminal', 'http://localhost:5180'); return path.join(v, 'Terminal', 'Notes'); };
  const texts = (u: string) => Object.fromEntries(db.all('SELECT title, body_text FROM notes WHERE user_id = ?', u).map((n: any) => [n.title, n.body_text.trim()]));
  try {
    // Two new files written in Obsidian
    let u = mkUser(); let dir = connect(u, path.join(tmp, 'A')); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Plan.md'), 'UPPER plan text\n'); fs.writeFileSync(path.join(dir, 'plan.md'), 'lower plan text\n');
    let r = await obs.syncVault(u, true);
    check('Plan.md and plan.md become two notes', r.ok && r.created === 2 && texts(u).Plan === 'UPPER plan text' && texts(u).plan === 'lower plan text', [r, texts(u)]);
    r = await obs.syncVault(u, true);
    check('…and the next sync changes nothing', r.ok && r.imported + r.created + r.exported + r.detached === 0 && texts(u).Plan === 'UPPER plan text', [r, texts(u)]);
    const stamped = ['Plan.md', 'plan.md'].map((f) => /^terminal_id: (\S+)$/m.exec(fs.readFileSync(path.join(dir, f), 'utf8'))?.[1]);
    check('…and each file carries its own id', !!stamped[0] && !!stamped[1] && stamped[0] !== stamped[1], stamped);

    // A file whose name differs only in case from a synced note's file
    u = mkUser(); dir = connect(u, path.join(tmp, 'B'));
    notes.saveNote(u, db.uid(), { title: 'Budget', bodyHtml: '<p>APP note: the real budget analysis</p>', tags: [], entityIds: [] }, true);
    await obs.syncVault(u, true);
    fs.writeFileSync(path.join(dir, 'budget.md'), 'a different, unrelated scratch file\n');
    r = await obs.syncVault(u, true);
    check('budget.md next to Budget.md is a new note, not a replacement', r.ok && r.created === 1 && r.imported === 0 && texts(u).Budget === 'APP note: the real budget analysis' && texts(u).budget === 'a different, unrelated scratch file', [r, texts(u)]);
    // Names the terminal chooses still avoid case-only twins, so the vault can be shared with Windows or macOS
    notes.saveNote(u, db.uid(), { title: 'BUDGET', bodyHtml: '<p>third</p>', tags: [], entityIds: [] }, true);
    await obs.syncVault(u, true);
    check('a new note titled BUDGET gets a file name that is free on Windows too', fs.existsSync(path.join(dir, 'BUDGET 2.md')) && !fs.existsSync(path.join(dir, 'BUDGET.md')), fs.readdirSync(dir));
    // A case-only rename made in Obsidian is followed through the id in the file
    fs.renameSync(path.join(dir, 'Budget.md'), path.join(dir, 'BudgeT.md'));
    r = await obs.syncVault(u, true);
    check('a case-only rename in Obsidian is followed, not treated as a deletion', r.ok && r.renamed === 1 && r.detached === 0 && r.created === 0 && texts(u).BudgeT === 'APP note: the real budget analysis', [r, texts(u)]);

    // Switching to a vault folder that differs only in case, through the real route
    u = mkUser();
    const app = express(); app.use(express.json()); app.use((req: any, _res: any, next: any) => { req.userId = u; next(); });
    obs.registerObsidianRoutes(app);
    const server = app.listen(0, '127.0.0.1'); await new Promise((ok) => server.once('listening', ok));
    const put = async (vaultPath: string) => (await fetch(`http://127.0.0.1:${(server.address() as any).port}/obsidian`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vaultPath, folder: 'Terminal', autoSync: false, entityPages: false }) })).json();
    const v1 = path.join(tmp, 'D', 'Vault'), v2 = path.join(tmp, 'D', 'vault'); fs.mkdirSync(v1, { recursive: true }); fs.mkdirSync(v2, { recursive: true });
    notes.saveNote(u, db.uid(), { title: 'Thesis', bodyHtml: '<p>text</p>', tags: [], entityIds: [] }, true);
    const first = await put(v1); const second = await put(v2);
    server.close();
    check('switching from …/Vault to …/vault writes the notes to the new vault', first.result?.exported === 1 && second.result?.exported === 1 && second.result?.detached === 0 && fs.existsSync(path.join(v2, 'Terminal', 'Notes', 'Thesis.md')), [first, second]);
  } finally {
    for (const u of users) { for (const t of ['vault_files', 'vault_config', 'notes']) db.run(`DELETE FROM ${t} WHERE user_id = ?`, u); db.run('DELETE FROM users WHERE id = ?', u); }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);

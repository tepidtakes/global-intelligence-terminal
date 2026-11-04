// Obsidian vault sync.
//
// Each note becomes a Markdown file with YAML front matter in <vault>/<folder>/Notes/.
// Entity mentions become [[wikilinks]] to generated pages in <folder>/Entities/, so
// Obsidian's backlinks and graph view work. Edits made in Obsidian (and new files created
// in that folder) flow back into the terminal. Conflicts never lose text: the Obsidian
// version is kept as a separate "(Obsidian copy)" note.
//
// Windows: names avoid reserved device names (CON, NUL, COM1…) and characters Windows or
// Obsidian links can't use; collisions are checked case-insensitively; paths stay under
// 260 characters; writes go through a temp file + rename with retries, because Obsidian,
// OneDrive or antivirus can briefly lock a file.
import express, { type Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import TurndownService from 'turndown';
// @ts-ignore — no type declarations published
import { gfm } from 'turndown-plugin-gfm';
import { Marked } from 'marked';
import YAML from 'yaml';
import { all, get, run, now, uid, DATA_DIR } from './db.js';
import { entities, getEntity } from './graph.js';
import { loadNote, saveNote, noteChangeListeners } from './notes.js';
import type { AuthedRequest } from './auth.js';
import { VAULT_ACCESS } from './config.js';
import { ENTITY_TYPE_LABEL } from '../shared/types.js';

// ───────────── Names and paths ─────────────
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;
/** A file/folder name that is valid on Windows, macOS and Linux and safe inside [[links]]. */
export function safeName(s: string, max = 120) {
  let n = String(s ?? '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*#^[\]]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (n.length > max) n = n.slice(0, max).replace(/[. ]+$/, '');
  if (!n) n = 'Untitled';
  if (RESERVED.test(n.split('.')[0].trim())) n += '_';
  return n;
}
function safeFileName(filename: string) {
  const ext = path.extname(filename).replace(/[^A-Za-z0-9.]/g, '').slice(0, 12);
  return safeName(path.basename(filename, path.extname(filename)), 100) + ext;
}
/** Accepts what people paste on Windows: quotes from "Copy as path", %USERPROFILE%, ~, / or \. */
export function normalizeVaultPath(input: string) {
  let p = String(input || '').trim().replace(/^["']+|["']+$/g, '');
  p = p.replace(/%([^%]+)%/g, (m, v) => process.env[v] ?? process.env[v.toUpperCase()] ?? m);
  if (p === '~' || /^~[\\/]/.test(p)) p = path.join(os.homedir(), p.slice(1));
  if (!p) throw new Error('Enter the folder of your Obsidian vault.');
  if (!path.isAbsolute(p)) throw new Error(process.platform === 'win32' ? 'Use a full path, e.g. C:\\Users\\you\\Documents\\My Vault' : 'Use a full path, e.g. /Users/you/Documents/My Vault');
  return path.resolve(p);
}
function normalizeFolder(input: string) {
  const parts = String(input || 'Terminal').split(/[\\/]+/).map((s) => s.trim()).filter((s) => s && s !== '.' && s !== '..').map((s) => safeName(s, 60));
  return parts.join('/') || 'Terminal';
}
const toPosix = (p: string) => p.split(path.sep).join('/');
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function inside(root: string, target: string) {
  const rel = path.relative(root, target);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
async function retry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e: any) {
      if (i >= tries - 1 || !['EPERM', 'EBUSY', 'EACCES', 'EMFILE'].includes(e.code)) throw e;
      await sleep(50 * 2 ** i);
    }
  }
}
/** Write via temp file + rename so Obsidian never reads a half-written note. */
async function writeFileSafe(file: string, content: string) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}-${Date.now()}.tmp`);
  await fsp.writeFile(tmp, content, 'utf8');
  try { await retry(() => fsp.rename(tmp, file)); } catch (e) { await fsp.rm(tmp, { force: true }); throw e; }
}
async function readText(file: string) {
  return (await retry(() => fsp.readFile(file, 'utf8'))).replace(/^\uFEFF/, '');
}

// ───────────── Entity pages ─────────────
let entFile: Map<string, string> | null = null; // entity id → file base name
let entByName: Map<string, string> | null = null; // lower-case base name → entity id
const shortType = (t: string) => (ENTITY_TYPE_LABEL as any)[t]?.split(' /')[0] || t;
function entityNames() {
  if (entFile && entByName) return { entFile, entByName };
  const count = (keys: string[]) => keys.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map<string, number>());
  const all1 = [...entities.values()];
  const c1 = count(all1.map((e) => safeName(e.name).toLowerCase()));
  const step1 = new Map(all1.map((e) => [e.id, c1.get(safeName(e.name).toLowerCase())! > 1 ? safeName(`${e.name} (${shortType(e.type)})`) : safeName(e.name)]));
  const c2 = count([...step1.values()].map((s) => s.toLowerCase()));
  entFile = new Map(all1.map((e) => {
    const s = step1.get(e.id)!;
    return [e.id, c2.get(s.toLowerCase())! > 1 ? safeName(`${e.name} (${e.id.split(':').slice(1).join(' ')})`) : s];
  }));
  entByName = new Map([...entFile].map(([id, f]) => [f.toLowerCase(), id]));
  return { entFile, entByName };
}

// ───────────── HTML ⇄ Markdown ─────────────
interface LinkCtx { hrefToTarget: (href: string) => string | null }
let linkCtx: LinkCtx = { hrefToTarget: () => null };

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*', hr: '---', br: '' });
td.use(gfm);
// Tiptap wraps every list item in <p>; keep lists tight ("- a\n- b") like Obsidian writes them.
const itemBody = (content: string) => content.replace(/^\n+/, '').replace(/\n+$/, '').replace(/\n{2,}/g, '\n').replace(/\n/g, '\n    ');
td.addRule('listItem', {
  filter: 'li',
  replacement(content, node: any) {
    let prefix = '- ';
    const parent = node.parentNode;
    if (parent?.nodeName === 'OL') {
      const start = parent.getAttribute('start');
      const idx = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${start ? Number(start) + idx : idx + 1}. `;
    }
    return prefix + itemBody(content) + (node.nextSibling ? '\n' : '');
  },
});
td.addRule('taskItem', {
  filter: (node: any) => node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
  replacement(content, node: any) {
    return `- [${node.getAttribute('data-checked') === 'true' ? 'x' : ' '}] ${itemBody(content)}${node.nextSibling ? '\n' : ''}`;
  },
});
td.addRule('wikilink', {
  filter: (node: any) => node.nodeName === 'A' && /^\/(entity|research)\//.test(node.getAttribute('href') || ''),
  replacement(content, node: any) {
    const target = linkCtx.hrefToTarget(node.getAttribute('href'));
    if (!target) return content;
    const label = content.trim().replace(/\|/g, '-').replace(/\]\]/g, '] ]');
    return !label || label === target ? `[[${target}]]` : `[[${target}|${label}]]`;
  },
});

function htmlToMarkdown(html: string, ctx: LinkCtx) {
  linkCtx = ctx;
  // Tiptap adds <colgroup> + inline widths (which stop the GFM table rule from matching)
  // and wraps cell text in <p>; Markdown tables need one line per row.
  const flat = html
    .replace(/<colgroup>[\s\S]*?<\/colgroup>/g, '')
    .replace(/<table[^>]*>/g, '<table>')
    .replace(/<(t[dh])([^>]*)>([\s\S]*?)<\/\1>/g, (_m, tag, _attrs, inner) =>
      `<${tag}>${inner.replace(/<\/p>\s*<p[^>]*>/g, ' ').replace(/<\/?p[^>]*>/g, '').replace(/<br\s*\/?>/g, ' ')}</${tag}>`);
  const md = td.turndown(flat || '')
    .replace(/\\([[\]])/g, '$1') // keep [[links]] and Obsidian callouts readable
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  linkCtx = { hrefToTarget: () => null };
  return md.trim();
}

// Obsidian (default settings) treats a single newline as a line break, so we do too.
const marked = new Marked({ gfm: true, breaks: true });
const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** Apply fn to Markdown outside fenced and inline code. */
function outsideCode(md: string, fn: (s: string) => string) {
  return md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((p, i) => (i % 2 ? p : fn(p))).join('');
}
function markdownToHtml(md: string, resolve: (target: string) => string | null) {
  const pre = outsideCode(md, (s) => s.replace(/(!?)\[\[([^[\]\n|]+?)(?:\|([^[\]\n]+?))?\]\]/g, (m, bang, target: string, alias?: string) => {
    if (bang) return m; // embeds (![[image.png]]) stay as text
    const t = target.trim();
    const [p, anchor] = t.split('#');
    const label = (alias || p.split('/').pop() || t).trim();
    const href = resolve(p.trim());
    const finalHref = href ? href + (anchor && href.startsWith('/research/') ? `#${encodeURIComponent(anchor)}` : '') : `/research/new?title=${encodeURIComponent(t)}`;
    return `<a href="${escHtml(finalHref)}">${escHtml(label)}</a>`;
  }));
  let html = marked.parse(pre, { async: false }) as string;
  // GFM task lists → Tiptap task items
  html = html.replace(/<li>(\s*<p>)?\s*<input (checked="" )?disabled="" type="checkbox">\s?/g, (_m, p, checked) => `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}">${p || ''}`);
  html = html.replace(/<ul>(\s*<li data-type="taskItem")/g, '<ul data-type="taskList">$1');
  return html.replace(/>\n</g, '><').trim();
}

// ───────────── Front matter ─────────────
const OUR_KEYS = ['terminal_id', 'title', 'category', 'tags', 'pinned', 'entities', 'attachments', 'created', 'updated', 'terminal_url'];
function splitFrontMatter(raw: string): { data: Record<string, any>; body: string; ok: boolean } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(raw);
  if (!m) return { data: {}, body: raw, ok: true };
  try { const data = YAML.parse(m[1]); return { data: data && typeof data === 'object' && !Array.isArray(data) ? data : {}, body: raw.slice(m[0].length), ok: true }; }
  catch { return { data: {}, body: raw.slice(m[0].length), ok: false }; }
}
const yamlBlock = (data: Record<string, any>) => `---\n${YAML.stringify(data, { lineWidth: 0 })}---\n`;
const joinFrontMatter = (data: Record<string, any>, body: string) => { const b = body.replace(/^\s*\n/, '').replace(/\s+$/, ''); return yamlBlock(data) + (b ? `\n${b}\n` : ''); };
const asList = (v: any): string[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean);
const wikiTarget = (s: string) => { const m = /^\[\[([^|\]]+)(?:\|[^\]]*)?\]\]$/.exec(s.trim()); return (m ? m[1] : s).trim(); };

// ───────────── Config ─────────────
export interface VaultConfig { userId: string; vaultPath: string; folder: string; autoSync: boolean; entityPages: boolean; appUrl: string; lastSync?: string; lastResult?: SyncResult }
export interface SyncResult { at: string; ok: boolean; exported: number; imported: number; created: number; renamed: number; conflicts: number; trashed: number; detached: number; entityPages: number; messages: string[]; error?: string }

function getConfig(userId: string): VaultConfig | undefined {
  const r = get<any>('SELECT * FROM vault_config WHERE user_id = ?', userId);
  if (!r) return undefined;
  let lastResult; try { lastResult = r.last_result ? JSON.parse(r.last_result) : undefined; } catch { /* ignore */ }
  return { userId, vaultPath: r.vault_path, folder: r.folder, autoSync: !!r.auto_sync, entityPages: !!r.entity_pages, appUrl: r.app_url || 'http://localhost:5180', lastSync: r.last_sync, lastResult };
}
const vaultName = (p: string) => path.basename(p);
const obsidianUri = (absFile: string) => `obsidian://open?path=${encodeURIComponent(absFile)}`;

/** Vaults Obsidian knows about (its own vault list) plus vault-looking folders in Documents / OneDrive. */
export function detectVaults() {
  const home = os.homedir();
  const cfgFiles = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'obsidian', 'obsidian.json')]
    : process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json')]
      : [path.join(home, '.config', 'obsidian', 'obsidian.json'), path.join(home, '.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian', 'obsidian.json'), path.join(home, 'snap', 'obsidian', 'current', '.config', 'obsidian', 'obsidian.json')];
  const found = new Map<string, { name: string; path: string; source: string }>();
  for (const f of cfgFiles) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const v of Object.values<any>(j.vaults || {})) if (v?.path && fs.existsSync(v.path)) found.set(path.resolve(v.path).toLowerCase(), { name: vaultName(v.path), path: path.resolve(v.path), source: 'Obsidian vault list' });
    } catch { /* Obsidian not installed for this account */ }
  }
  const roots = [path.join(home, 'Documents'), home, process.env.OneDrive && path.join(process.env.OneDrive, 'Documents'), process.env.OneDrive].filter(Boolean) as string[];
  for (const r of roots) {
    try {
      for (const d of fs.readdirSync(r, { withFileTypes: true })) {
        if (!d.isDirectory() || d.name.startsWith('.')) continue;
        const p = path.join(r, d.name);
        if (fs.existsSync(path.join(p, '.obsidian')) && !found.has(p.toLowerCase())) found.set(p.toLowerCase(), { name: d.name, path: p, source: 'Found on disk' });
      }
    } catch { /* folder missing */ }
  }
  return [...found.values()];
}

// ───────────── Sync ─────────────
interface FileInfo { rel: string; abs: string; raw: string; hash: string; fm: Record<string, any>; fmOk: boolean; body: string; id?: string; mtime: number }

async function scanMarkdown(root: string, dir: string, out: FileInfo[] = []) {
  let list: fs.Dirent[] = [];
  try { list = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of list) {
    if (d.name.startsWith('.')) continue; // temp files, .trash, .obsidian
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) await scanMarkdown(root, abs, out);
    else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) {
      try {
        const raw = await readText(abs);
        const st = await fsp.stat(abs);
        const { data, body, ok } = splitFrontMatter(raw);
        out.push({ rel: toPosix(path.relative(root, abs)), abs, raw, hash: sha(raw), fm: data, fmOk: ok, body, id: typeof data.terminal_id === 'string' ? data.terminal_id : undefined, mtime: st.mtimeMs });
      } catch { /* unreadable (cloud placeholder offline, permissions): skip this round */ }
    }
  }
  return out;
}

const chains = new Map<string, Promise<SyncResult>>();
/** Serialised per user: a sync requested while one runs starts right after it. */
export function syncVault(userId: string, full = false): Promise<SyncResult> {
  const prev = chains.get(userId) || Promise.resolve(null as any);
  const p = prev.catch(() => null).then(() => doSync(userId, full));
  chains.set(userId, p);
  p.finally(() => { if (chains.get(userId) === p) chains.delete(userId); }).catch(() => {});
  return p;
}

async function doSync(userId: string, full: boolean): Promise<SyncResult> {
  const cfg = getConfig(userId);
  const result: SyncResult = { at: now(), ok: true, exported: 0, imported: 0, created: 0, renamed: 0, conflicts: 0, trashed: 0, detached: 0, entityPages: 0, messages: [] };
  if (!cfg) throw new Error('No Obsidian vault connected.');
  try {
    const root = cfg.vaultPath;
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Vault folder not found: ${root}`);
    const baseRel = cfg.folder;
    const notesRel = `${baseRel}/Notes`;
    const notesDir = path.join(root, ...notesRel.split('/'));
    await fsp.mkdir(notesDir, { recursive: true });
    const absOf = (rel: string) => { const a = path.join(root, ...rel.split('/')); if (!inside(root, a)) throw new Error(`Refusing to write outside the vault: ${rel}`); return a; };

    // 1. What's on disk
    const files = await scanMarkdown(root, notesDir);
    const byRel = new Map(files.map((f) => [f.rel.toLowerCase(), f]));
    const byId = new Map<string, FileInfo>();
    for (const f of files) if (f.id && !byId.has(f.id)) byId.set(f.id, f);

    // 2. What the app has
    const noteRows = new Map(all<any>('SELECT id, title, updated_at FROM notes WHERE user_id = ?', userId).map((n) => [n.id, n]));
    let rows = all<any>('SELECT * FROM vault_files WHERE user_id = ?', userId);
    const rowOf = (id: string) => rows.find((r) => r.note_id === id);
    const setRow = (noteId: string, patch: Record<string, any>) => {
      const cur = rowOf(noteId);
      const next = { user_id: userId, note_id: noteId, rel_path: '', hash: null, note_rev: null, detached: 0, ...(cur || {}), ...patch };
      run('INSERT INTO vault_files (user_id, note_id, rel_path, hash, note_rev, detached) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id, note_id) DO UPDATE SET rel_path = excluded.rel_path, hash = excluded.hash, note_rev = excluded.note_rev, detached = excluded.detached',
        userId, noteId, next.rel_path, next.hash, next.note_rev, next.detached);
      if (cur) Object.assign(cur, next); else rows.push(next);
    };

    // 3. Files renamed or moved inside Obsidian: follow them by terminal_id.
    const movedInObsidian = new Set<string>();
    for (const r of rows) {
      const f = byRel.get(r.rel_path.toLowerCase());
      if (f && (!f.id || f.id === r.note_id)) continue;
      const moved = byId.get(r.note_id);
      if (moved && moved.rel !== r.rel_path) { setRow(r.note_id, { rel_path: moved.rel }); movedInObsidian.add(r.note_id); result.renamed++; }
    }

    // 4. Choose file names for notes not yet in the vault, and rename files whose title changed in the app.
    const taken = new Set<string>([...files.map((f) => f.rel.toLowerCase()), ...rows.map((r) => r.rel_path.toLowerCase())]);
    const pickPath = (title: string, self?: string) => {
      const maxBase = Math.max(20, Math.min(120, 250 - notesDir.length - 10));
      const base = safeName(title || 'Untitled', maxBase);
      for (let i = 1; ; i++) {
        const rel = `${notesRel}/${i === 1 ? base : `${base} ${i}`}.md`;
        if (rel.toLowerCase() === self?.toLowerCase() || !taken.has(rel.toLowerCase())) { taken.add(rel.toLowerCase()); return rel; }
      }
    };
    const fileChangedSince = (r: any) => { const f = byRel.get(r.rel_path.toLowerCase()); return !!f && r.hash != null && f.hash !== r.hash; };
    for (const n of noteRows.values()) {
      const r = rowOf(n.id);
      if (!r) {
        // Reconnecting to a vault that already holds this note: the newer side wins.
        const f = byId.get(n.id);
        if (f && !rows.some((x) => x.rel_path.toLowerCase() === f.rel.toLowerCase())) {
          const fileNewer = f.mtime > Date.parse(n.updated_at);
          setRow(n.id, { rel_path: f.rel, hash: fileNewer ? 'reconnect' : f.hash, note_rev: fileNewer ? n.updated_at : null });
        } else setRow(n.id, { rel_path: pickPath(n.title) });
        continue;
      }
      if (r.detached || r.hash == null) continue;
      const appChanged = !r.note_rev || n.updated_at > r.note_rev;
      const wantBase = safeName(n.title || 'Untitled').toLowerCase();
      const curBase = path.posix.basename(r.rel_path, '.md').toLowerCase();
      if (appChanged && !fileChangedSince(r) && wantBase !== curBase && wantBase !== curBase.replace(/ \d+$/, '') && r.rel_path.startsWith(`${notesRel}/`)) {
        const next = pickPath(n.title, r.rel_path);
        const from = absOf(r.rel_path);
        if (fs.existsSync(from) && next !== r.rel_path) {
          await retry(() => fsp.rename(from, absOf(next)));
          const f = byRel.get(r.rel_path.toLowerCase());
          if (f) { byRel.delete(r.rel_path.toLowerCase()); f.rel = next; f.abs = absOf(next); byRel.set(next.toLowerCase(), f); }
          setRow(n.id, { rel_path: next }); result.renamed++;
        }
      }
    }

    // New files written in Obsidian get ids now, so links between them resolve in this pass.
    // (A copy of a note duplicated inside Obsidian carries the same terminal_id but an untracked path: it becomes its own note.)
    const tracked = new Set(rows.map((r) => r.rel_path.toLowerCase()));
    const newFiles = files.filter((f) => !tracked.has(f.rel.toLowerCase()));
    const newIds = new Map(newFiles.map((f) => [f.rel.toLowerCase(), uid()]));

    // 5. Link maps (both directions)
    const { entFile: ef, entByName: eb } = entityNames();
    const entRel = (id: string) => `${baseRel}/Entities/${ef.get(id)}`;
    const noteByTarget = new Map<string, string>();
    const addTarget = (rel: string, id: string) => {
      const noExt = rel.replace(/\.md$/i, '').toLowerCase();
      noteByTarget.set(noExt, id);
      const b = path.posix.basename(noExt);
      if (!noteByTarget.has(b)) noteByTarget.set(b, id);
    };
    for (const r of rows) addTarget(r.rel_path, r.note_id);
    for (const [rel, id] of newIds) addTarget(rel, id);
    for (const n of noteRows.values()) if (n.title && !noteByTarget.has(n.title.toLowerCase())) noteByTarget.set(n.title.toLowerCase(), n.id);
    const resolve = (target: string): string | null => {
      const t = target.replace(/\.md$/i, '').replace(/\\/g, '/').toLowerCase();
      const n = noteByTarget.get(t) || noteByTarget.get(path.posix.basename(t));
      if (n) return `/research/${n}`;
      const ent = eb.get(path.posix.basename(t)) || (getEntity(target) ? target : undefined);
      return ent ? `/entity/${encodeURIComponent(ent)}` : null;
    };
    const hrefToTarget = (href: string): string | null => {
      const [p, hash] = href.split('#');
      if (p.startsWith('/entity/')) { const id = decodeURIComponent(p.slice(8)); return ef.has(id) ? entRel(id) : null; }
      const m = /^\/research\/new\?title=(.*)$/.exec(p);
      if (m) { try { return decodeURIComponent(m[1]); } catch { return null; } }
      const id = p.slice('/research/'.length);
      const r = rowOf(id);
      return r ? r.rel_path.replace(/\.md$/i, '') + (hash ? `#${decodeURIComponent(hash)}` : '') : null;
    };

    const exportNote = async (noteId: string) => {
      const note = loadNote(userId, noteId); const r = rowOf(noteId);
      if (!note || !r) return;
      const abs = absOf(r.rel_path);
      const existing = byRel.get(r.rel_path.toLowerCase());
      const extra: Record<string, any> = {};
      if (existing) for (const [k, v] of Object.entries(existing.fm)) if (!OUR_KEYS.includes(k)) extra[k] = v;
      const base = path.posix.basename(r.rel_path, '.md');
      const atts = await copyAttachments(noteId);
      const fm: Record<string, any> = {
        terminal_id: note.id,
        // The file name is the title in Obsidian; keep the exact title only when the name had to change.
        ...(note.title && note.title !== base ? { title: note.title } : {}),
        ...(note.category ? { category: note.category } : {}),
        tags: note.tags.map((t) => t.replace(/\s+/g, '-')),
        ...(note.pinned ? { pinned: true } : {}),
        ...(note.entityIds.length ? { entities: note.entityIds.filter((e) => ef.has(e)).map((e) => `[[${entRel(e)}|${getEntity(e)!.name.replace(/[|\]]/g, ' ')}]]`) } : {}),
        ...(atts.length ? { attachments: atts.map((a) => `[[${a}]]`) } : {}),
        created: note.createdAt,
        updated: note.updatedAt,
        terminal_url: `${cfg.appUrl}/research/${note.id}`,
        ...extra,
      };
      const content = joinFrontMatter(fm, htmlToMarkdown(note.bodyHtml, { hrefToTarget }));
      if (existing?.raw !== content) await writeFileSafe(abs, content);
      setRow(noteId, { hash: sha(content), note_rev: note.updatedAt, detached: 0 });
      result.exported++;
    };
    const copyAttachments = async (noteId: string) => {
      const out: string[] = [];
      for (const a of all<any>('SELECT * FROM attachments WHERE note_id = ? AND user_id = ? ORDER BY created_at', noteId, userId)) {
        let name = safeFileName(a.filename);
        let rel = `${baseRel}/Attachments/${name}`;
        let abs = absOf(rel);
        if (fs.existsSync(abs) && fs.statSync(abs).size !== a.size) {
          name = `${path.basename(name, path.extname(name))} (${a.id.slice(0, 8)})${path.extname(name)}`;
          rel = `${baseRel}/Attachments/${name}`; abs = absOf(rel);
        }
        if (!fs.existsSync(abs)) {
          try { await fsp.mkdir(path.dirname(abs), { recursive: true }); await retry(() => fsp.copyFile(path.join(DATA_DIR, 'uploads', a.storage_key), abs)); }
          catch (e: any) { result.messages.push(`Couldn't copy attachment ${a.filename}: ${e.message}`); continue; }
        }
        out.push(rel);
      }
      return out;
    };
    const titleOf = (f: FileInfo) => {
      const base = path.posix.basename(f.rel, '.md');
      const fmTitle = typeof f.fm.title === 'string' ? f.fm.title : '';
      // Renamed in Obsidian → the new file name wins over the stored title.
      return fmTitle && (safeName(fmTitle) === base || safeName(fmTitle) === base.replace(/ \d+$/, '')) ? fmTitle : base;
    };
    const parseFile = (f: FileInfo, current?: ReturnType<typeof loadNote>) => {
      const base = path.posix.basename(f.rel, '.md');
      const title = titleOf(f);
      const bodyHtml = markdownToHtml(f.body, resolve);
      if (!f.fmOk) {
        result.messages.push(`Couldn't read the properties of “${base}” (invalid YAML), so only its text was imported.`);
        return { title, bodyHtml, tags: current?.tags || [], category: current?.category || null, pinned: !!current?.pinned, entityIds: current?.entityIds || [] } as any;
      }
      const entityIds = asList(f.fm.entities).map(wikiTarget).map((t) => { const h = resolve(t); return h?.startsWith('/entity/') ? decodeURIComponent(h.slice(8)) : null; }).filter(Boolean) as string[];
      return {
        title, bodyHtml, tags: asList(f.fm.tags).map((t) => t.replace(/^#/, '')),
        category: typeof f.fm.category === 'string' && f.fm.category.trim() ? f.fm.category.trim() : null,
        pinned: f.fm.pinned === true || f.fm.pinned === 'true', entityIds,
        createdAt: f.fm.created && !isNaN(Date.parse(String(f.fm.created))) ? new Date(String(f.fm.created)).toISOString() : new Date(f.mtime).toISOString(),
      };
    };
    const importInto = (noteId: string, f: FileInfo) => {
      const ts = saveNote(userId, noteId, parseFile(f, loadNote(userId, noteId)), false, { external: true });
      setRow(noteId, { rel_path: f.rel, hash: f.hash, note_rev: ts, detached: 0 });
      result.imported++;
    };
    const importNew = async (f: FileInfo, id: string, opts: { copyOf?: string } = {}) => {
      const parsed = parseFile(f);
      if (opts.copyOf) parsed.title = `${parsed.title} (Obsidian copy ${new Date().toLocaleDateString('en-CA')})`;
      const ts = saveNote(userId, id, parsed, true, { external: true });
      if (opts.copyOf) { setRow(id, { rel_path: pickPath(parsed.title) }); await exportNote(id); }
      else {
        // Stamp the file with its id so renames in Obsidian can be followed. Only the front matter changes.
        const content = f.fmOk ? yamlBlock({ terminal_id: id, ...f.fm, ...(f.fm.terminal_id ? { terminal_id: id } : {}) }) + f.body : f.raw;
        if (content !== f.raw) await writeFileSafe(f.abs, content);
        setRow(id, { rel_path: f.rel, hash: sha(content), note_rev: ts });
      }
      result.created++;
    };

    // 6. Reconcile every tracked note
    for (const r of [...rows]) {
      const note = noteRows.get(r.note_id);
      let f = byRel.get(r.rel_path.toLowerCase());
      if (f && f.id && f.id !== r.note_id) f = undefined;
      if (!note) {
        // Deleted in the app → move the file to Obsidian's trash (recoverable), unless it was edited in Obsidian since.
        if (f && !r.detached) {
          if (f.hash === r.hash) { await moveToTrash(root, f.abs); result.trashed++; }
          else { await importNew(f, uid()); result.messages.push(`“${path.posix.basename(f.rel, '.md')}” was deleted here but edited in Obsidian, so it was kept.`); }
        }
        run('DELETE FROM vault_files WHERE user_id = ? AND note_id = ?', userId, r.note_id);
        rows = rows.filter((x) => x !== r);
        continue;
      }
      if (r.detached) continue;
      if (!f) {
        if (r.hash == null) { await exportNote(r.note_id); continue; }
        // Deleted in Obsidian → keep the note here, stop mirroring it.
        setRow(r.note_id, { detached: 1 }); result.detached++;
        result.messages.push(`“${note.title || 'Untitled note'}” was deleted in Obsidian. It's still in the terminal; use “Send to Obsidian” on the note to restore the file.`);
        continue;
      }
      const fileChanged = r.hash == null ? false : f.hash !== r.hash;
      const appChanged = !r.note_rev || note.updated_at > r.note_rev;
      // Renamed in Obsidian with no other edit: just take the new title.
      if (movedInObsidian.has(r.note_id) && !fileChanged) {
        const t = titleOf(f);
        if (t !== note.title) {
          const cur = loadNote(userId, r.note_id)!;
          const ts = saveNote(userId, r.note_id, { ...cur, title: t }, false, { external: true });
          if (!appChanged) { setRow(r.note_id, { note_rev: ts }); continue; }
        }
      }
      if (fileChanged && appChanged) {
        await importNew(f, uid(), { copyOf: r.note_id });
        await exportNote(r.note_id);
        result.conflicts++;
        result.messages.push(`“${note.title || 'Untitled note'}” changed in both places. The terminal version is in the original file; the Obsidian version was saved as a separate copy.`);
      } else if (fileChanged) importInto(r.note_id, f);
      else if (appChanged) await exportNote(r.note_id);
    }

    // 7. Files created in Obsidian
    for (const f of newFiles) await importNew(f, newIds.get(f.rel.toLowerCase())!);

    // 8. Entity pages for everything your synced notes mention (rewritten only when their text changes)
    const changed = result.exported + result.imported + result.created + result.renamed + result.trashed > 0;
    if (cfg.entityPages && (full || changed)) {
      const linked = all<{ entity_id: string }>('SELECT DISTINCT ne.entity_id FROM note_entities ne JOIN vault_files vf ON vf.note_id = ne.note_id AND vf.user_id = ? AND vf.detached = 0', userId).map((r) => r.entity_id);
      for (const id of linked) {
        const e = getEntity(id); if (!e || !ef.has(id)) continue;
        const parent = e.parentId ? getEntity(e.parentId) : undefined;
        const content = joinFrontMatter(
          { terminal_id: e.id, type: shortType(e.type), ...(parent ? { located_in: parent.name } : {}), terminal_url: `${cfg.appUrl}/entity/${encodeURIComponent(e.id)}`, generated_by: 'Global Intelligence Terminal' },
          `> [!info] Generated by Global Intelligence Terminal\n> Changes to this page are overwritten on the next sync. Write in your notes instead — they link here.\n\n**${shortType(e.type)}**${parent ? ` · ${parent.name}` : ''}\n\n${e.summary || ''}\n\n[Open profile in the terminal](${cfg.appUrl}/entity/${encodeURIComponent(e.id)})\n`);
        const abs = absOf(`${entRel(id)}.md`);
        let cur = ''; try { cur = await readText(abs); } catch { /* new */ }
        if (cur !== content) { await writeFileSafe(abs, content); result.entityPages++; }
      }
    }
  } catch (e: any) {
    result.ok = false; result.error = e.code === 'EACCES' || e.code === 'EPERM' ? `Windows denied access to the vault folder (${e.code}). Close any program locking it, or check the folder's permissions.` : e.message;
  }
  run('UPDATE vault_config SET last_sync = ?, last_result = ? WHERE user_id = ?', result.at, JSON.stringify(result), userId);
  return result;
}

async function moveToTrash(root: string, abs: string) {
  const trash = path.join(root, '.trash');
  await fsp.mkdir(trash, { recursive: true });
  let dest = path.join(trash, path.basename(abs));
  if (fs.existsSync(dest)) dest = path.join(trash, `${path.basename(abs, '.md')} ${Date.now()}.md`);
  await retry(() => fsp.rename(abs, dest));
}

// ───────────── Auto-sync ─────────────
const debounce = new Map<string, NodeJS.Timeout>();
noteChangeListeners.add((userId) => {
  if (VAULT_ACCESS === 'off') return;
  const cfg = get<any>('SELECT auto_sync FROM vault_config WHERE user_id = ?', userId);
  if (!cfg?.auto_sync) return;
  clearTimeout(debounce.get(userId));
  debounce.set(userId, setTimeout(() => { debounce.delete(userId); syncVault(userId).catch((e) => console.error('[obsidian]', e)); }, 1500));
});
// Pick up edits made in Obsidian.
setInterval(() => {
  if (VAULT_ACCESS === 'off') return;
  for (const r of all<any>('SELECT user_id FROM vault_config WHERE auto_sync = 1'))
    if (!chains.has(r.user_id)) syncVault(r.user_id).catch((e) => console.error('[obsidian]', e));
}, 10_000).unref();

// ───────────── Routes ─────────────
/** Vault sync reads and writes the server's disk, so it is only offered when the app runs on your own machine.
 *  A request that passed through a reverse proxy arrives from 127.0.0.1 too, so any proxy header disqualifies it. */
const PROXY_HEADERS = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-forwarded-host', 'cf-connecting-ip'];
const isLocal = (req: express.Request) => {
  if (VAULT_ACCESS === 'off') return false;
  if (VAULT_ACCESS === 'any') return true;
  if (PROXY_HEADERS.some((h) => req.headers[h] != null)) return false;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
};
const publicConfig = (c?: VaultConfig) => c && { vaultPath: c.vaultPath, vaultName: vaultName(c.vaultPath), folder: c.folder, autoSync: c.autoSync, entityPages: c.entityPages, lastSync: c.lastSync, lastResult: c.lastResult,
  vaultExists: fs.existsSync(c.vaultPath), isObsidianVault: fs.existsSync(path.join(c.vaultPath, '.obsidian')),
  folderUri: obsidianUri(path.join(c.vaultPath, ...c.folder.split('/'), 'Notes')) };

export function registerObsidianRoutes(r: Router) {
  r.get('/obsidian', (req: AuthedRequest, res) => {
    const local = isLocal(req);
    res.json({ available: local, platform: process.platform, config: publicConfig(getConfig(req.userId!)) || null, detected: local ? detectVaults() : [] });
  });
  r.put('/obsidian', async (req: AuthedRequest, res) => {
    if (!isLocal(req)) return res.status(403).json({ error: 'Vault sync is only available when the terminal runs on your own computer.' });
    const b = req.body || {};
    let vaultPath: string;
    try { vaultPath = normalizeVaultPath(b.vaultPath); } catch (e: any) { return res.status(400).json({ error: e.message }); }
    if (!fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) return res.status(400).json({ error: `Folder not found: ${vaultPath}` });
    try { fs.accessSync(vaultPath, fs.constants.W_OK); } catch { return res.status(400).json({ error: `The terminal can't write to ${vaultPath}. Check the folder's permissions.` }); }
    const folder = normalizeFolder(b.folder);
    const prev = getConfig(req.userId!);
    const appUrl = `${req.protocol}://${req.get('host')}`;
    if (prev && (prev.vaultPath.toLowerCase() !== vaultPath.toLowerCase() || prev.folder !== folder)) run('DELETE FROM vault_files WHERE user_id = ?', req.userId!);
    run(`INSERT INTO vault_config (user_id, vault_path, folder, auto_sync, entity_pages, app_url) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET vault_path = excluded.vault_path, folder = excluded.folder, auto_sync = excluded.auto_sync, entity_pages = excluded.entity_pages, app_url = excluded.app_url`,
      req.userId!, vaultPath, folder, b.autoSync === false ? 0 : 1, b.entityPages === false ? 0 : 1, appUrl);
    const result = await syncVault(req.userId!, true);
    res.json({ config: publicConfig(getConfig(req.userId!)), result });
  });
  r.delete('/obsidian', (req: AuthedRequest, res) => {
    run('DELETE FROM vault_files WHERE user_id = ?', req.userId!);
    run('DELETE FROM vault_config WHERE user_id = ?', req.userId!);
    res.json({ ok: true });
  });
  r.post('/obsidian/sync', async (req: AuthedRequest, res) => {
    if (!isLocal(req)) return res.status(403).json({ error: 'Vault sync is only available when the terminal runs on your own computer.' });
    if (!getConfig(req.userId!)) return res.status(400).json({ error: 'Connect a vault first (Settings → Obsidian).' });
    res.json(await syncVault(req.userId!, true));
  });
  // Where a note lives in the vault, plus an obsidian:// link that opens it.
  r.get('/obsidian/notes/:id', (req: AuthedRequest, res) => {
    const c = getConfig(req.userId!);
    const row = c && get<any>('SELECT * FROM vault_files WHERE user_id = ? AND note_id = ?', req.userId!, req.params.id);
    if (!c || !row) return res.json({ connected: !!c, synced: false });
    const abs = path.join(c.vaultPath, ...row.rel_path.split('/'));
    res.json({ connected: true, synced: row.hash != null && !row.detached, detached: !!row.detached, relPath: row.rel_path, vaultName: vaultName(c.vaultPath), uri: obsidianUri(abs), exists: fs.existsSync(abs) });
  });
  // Re-send a note (also restores one whose file was deleted in Obsidian).
  r.post('/obsidian/notes/:id/send', async (req: AuthedRequest, res) => {
    if (!isLocal(req)) return res.status(403).json({ error: 'Vault sync is only available when the terminal runs on your own computer.' });
    if (!getConfig(req.userId!)) return res.status(400).json({ error: 'Connect a vault first (Settings → Obsidian).' });
    if (!get('SELECT id FROM notes WHERE id = ? AND user_id = ?', req.params.id, req.userId!)) return res.status(404).json({ error: 'Note not found' });
    run('UPDATE vault_files SET detached = 0, hash = NULL, note_rev = NULL WHERE user_id = ? AND note_id = ?', req.userId!, req.params.id);
    const result = await syncVault(req.userId!, true);
    res.json(result);
  });
  // Single note as an Obsidian-flavoured .md file (works without a connected vault).
  r.get('/notes/:id/markdown', (req: AuthedRequest, res) => {
    const note = loadNote(req.userId!, req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    const { entFile: ef } = entityNames();
    const hrefToTarget = (href: string) => {
      if (href.startsWith('/entity/')) { const id = decodeURIComponent(href.slice(8)); return ef.get(id) || null; }
      const m = /^\/research\/new\?title=(.*)$/.exec(href); if (m) { try { return decodeURIComponent(m[1]); } catch { return null; } }
      const t = get<any>('SELECT title FROM notes WHERE id = ? AND user_id = ?', href.slice(10).split('#')[0], req.userId!);
      return t ? safeName(t.title || 'Untitled') : null;
    };
    const fm = { terminal_id: note.id, ...(note.category ? { category: note.category } : {}), tags: note.tags.map((t) => t.replace(/\s+/g, '-')), ...(note.pinned ? { pinned: true } : {}),
      ...(note.entityIds.length ? { entities: note.entityIds.filter((e) => ef.has(e)).map((e) => `[[${ef.get(e)}]]`) } : {}), created: note.createdAt, updated: note.updatedAt };
    const name = `${safeName(note.title || 'Untitled')}.md`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.type('text/markdown; charset=utf-8').send(joinFrontMatter(fm, htmlToMarkdown(note.bodyHtml, { hrefToTarget })));
  });
}

// Exposed for tests.
export const _internal = { htmlToMarkdown, markdownToHtml, splitFrontMatter, entityNames };

// Note storage shared by the API and the Obsidian vault sync.
// Links inside a note body are plain <a href> elements:
//   /entity/<id>            an entity mention (links the note to that profile)
//   /research/<note id>     a [[wikilink]] to another note
//   /research/new?title=X   a [[wikilink]] to a note that doesn't exist yet (like Obsidian)
import { all, get, run, tx, now } from './db.js';
import { getEntity, stub } from './graph.js';
import type { Note } from '../shared/types.js';

const J = (s: string | null | undefined, d: any = []) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/** Called after a note is created, changed or deleted from inside the app. */
export const noteChangeListeners = new Set<(userId: string, noteId: string) => void>();
const notify = (userId: string, noteId: string) => { for (const l of noteChangeListeners) { try { l(userId, noteId); } catch (e) { console.error(e); } } };

export function stripHtml(html: string) {
  return html.replace(/<(br|\/p|\/h\d|\/li|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
}
export function linkedEntities(html: string) {
  const ids = new Set<string>();
  for (const m of html.matchAll(/href="\/entity\/([^"?#]+)"/g)) ids.add(decodeURIComponent(m[1]));
  return [...ids].filter((id) => getEntity(id));
}
const NOTE_HREF = /href="\/research\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[#?][^"]*)?"/g;
export function linkedNoteIds(html: string) {
  return [...new Set([...html.matchAll(NOTE_HREF)].map((m) => m[1]))];
}

export function findNoteByTitle(userId: string, title: string): string | undefined {
  const t = title.trim();
  if (!t) return undefined;
  return get<{ id: string }>('SELECT id FROM notes WHERE user_id = ? AND title = ? COLLATE NOCASE ORDER BY updated_at DESC LIMIT 1', userId, t)?.id;
}
/** Point links to not-yet-existing notes at the real note once one with that title exists. */
export function resolveTitleLinks(userId: string, html: string) {
  return html.replace(/href="\/research\/new\?title=([^"]*)"/g, (m, enc) => {
    let title = ''; try { title = decodeURIComponent(enc); } catch { return m; }
    const id = findNoteByTitle(userId, title.split('/').pop()!.split('#')[0]);
    return id ? `href="/research/${id}"` : m;
  });
}

export function loadNote(userId: string, id: string): (Note & { extUpdatedAt?: string | null }) | undefined {
  const n = get<any>('SELECT * FROM notes WHERE id = ? AND user_id = ?', id, userId);
  if (!n) return undefined;
  const entityIds = all<{ entity_id: string }>('SELECT entity_id FROM note_entities WHERE note_id = ?', id).map((r) => r.entity_id);
  const attachments = all<any>('SELECT id, filename, mime, size, created_at FROM attachments WHERE note_id = ? ORDER BY created_at', id)
    .map((a) => ({ id: a.id, filename: a.filename, mime: a.mime, size: a.size, createdAt: a.created_at }));
  return { id: n.id, title: n.title, bodyHtml: n.body_html, bodyText: n.body_text, category: n.category, tags: J(n.tags), pinned: !!n.pinned, entityIds, createdAt: n.created_at, updatedAt: n.updated_at, attachments,
    entities: entityIds.map((e) => stub(e)).filter(Boolean), extUpdatedAt: n.ext_updated_at } as any;
}

export interface SaveOpts { external?: boolean; }
/** Insert or update a note. `external` = the change came from the Obsidian vault. Returns updated_at. */
export function saveNote(userId: string, id: string, body: any, isNew: boolean, opts: SaveOpts = {}) {
  const html = resolveTitleLinks(userId, String(body.bodyHtml ?? ''));
  const text = String(body.bodyText ?? stripHtml(html));
  const title = String(body.title ?? '').slice(0, 300);
  const tags: string[] = Array.isArray(body.tags) ? [...new Set<string>(body.tags.map((x: any) => String(x).trim().replace(/^#/, '')).filter(Boolean))].slice(0, 30) : [];
  const entityIds = [...new Set([...(Array.isArray(body.entityIds) ? body.entityIds.map(String) : []), ...linkedEntities(html)])].filter((e) => getEntity(e));
  const noteLinks = linkedNoteIds(html).filter((t) => t !== id);
  const ts = now();
  const ext = opts.external ? ts : null;
  tx(() => {
    if (isNew) run('INSERT INTO notes (id, user_id, title, body_html, body_text, category, tags, pinned, created_at, updated_at, ext_updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, userId, title, html, text, body.category ?? null, JSON.stringify(tags), body.pinned ? 1 : 0, body.createdAt || ts, ts, ext);
    else run('UPDATE notes SET title = ?, body_html = ?, body_text = ?, category = ?, tags = ?, pinned = ?, updated_at = ?, ext_updated_at = COALESCE(?, ext_updated_at) WHERE id = ? AND user_id = ?',
      title, html, text, body.category ?? null, JSON.stringify(tags), body.pinned ? 1 : 0, ts, ext, id, userId);
    run('DELETE FROM note_entities WHERE note_id = ?', id);
    for (const e of entityIds) run('INSERT INTO note_entities (note_id, entity_id) VALUES (?,?)', id, e);
    run('DELETE FROM note_links WHERE note_id = ?', id);
    for (const t of noteLinks) run('INSERT INTO note_links (note_id, target_id) VALUES (?,?)', id, t);
    run('DELETE FROM notes_fts WHERE note_id = ?', id);
    run('INSERT INTO notes_fts (note_id, title, body, tags) VALUES (?,?,?,?)', id, title, text, tags.join(' '));
  });
  // A new title may resolve dangling [[links]] in other notes.
  if (title) relinkDangling(userId, title);
  if (!opts.external) notify(userId, id);
  return ts;
}

function relinkDangling(userId: string, _title: string) {
  const rows = all<any>("SELECT id, body_html FROM notes WHERE user_id = ? AND body_html LIKE '%/research/new?title=%'", userId);
  for (const r of rows) {
    const html = resolveTitleLinks(userId, r.body_html);
    if (html === r.body_html) continue;
    run('UPDATE notes SET body_html = ? WHERE id = ?', html, r.id);
    run('DELETE FROM note_links WHERE note_id = ?', r.id);
    for (const t of linkedNoteIds(html).filter((t) => t !== r.id)) run('INSERT OR IGNORE INTO note_links (note_id, target_id) VALUES (?,?)', r.id, t);
  }
}

export function deleteNoteRow(userId: string, id: string) {
  run('DELETE FROM notes_fts WHERE note_id = ?', id);
  run('DELETE FROM notes WHERE id = ? AND user_id = ?', id, userId);
  notify(userId, id);
}

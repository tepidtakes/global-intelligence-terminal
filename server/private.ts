// Private, per-user records: notes, attachments, positions, catalysts, watchlists,
// saved views, preferences, data-quality reports. Every query is scoped by user_id.
import express, { type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, now, uid, DATA_DIR } from './db.js';
import { requireUser, type AuthedRequest } from './auth.js';
import { getEntity, stub } from './graph.js';
import { loadNote, saveNote, deleteNoteRow, findNoteByTitle } from './notes.js';
import type { Catalyst, NoteHit, Position, PositionSummary, Transaction, Watchlist } from '../shared/types.js';

export const priv = express.Router();
priv.use(requireUser);

const J = (s: string | null | undefined, d: any = []) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const uidOf = (req: AuthedRequest) => req.userId!;

// ───────────────────────── Notes ─────────────────────────

export function searchNotes(userId: string, q: string, limit = 20): NoteHit[] {
  const toks = q.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) || [];
  if (!toks.length) return [];
  const match = toks.map((t) => `"${t}"*`).join(' ');
  const rows = all<any>(`SELECT n.id, n.title, n.updated_at, snippet(notes_fts, 2, char(1), char(2), '…', 14) AS snip
    FROM notes_fts JOIN notes n ON n.id = notes_fts.note_id WHERE notes_fts MATCH ? AND n.user_id = ? ORDER BY rank LIMIT ?`, match, userId, limit);
  return rows.map((r) => ({ id: r.id, title: r.title || 'Untitled note', snippet: r.snip, updatedAt: r.updated_at,
    entityIds: all<{ entity_id: string }>('SELECT entity_id FROM note_entities WHERE note_id = ?', r.id).map((x) => x.entity_id) }));
}

priv.get('/notes', (req: AuthedRequest, res) => {
  const userId = uidOf(req);
  const { entity, q, tag, category, pinned } = req.query as Record<string, string>;
  if (q) return res.json(searchNotes(userId, q, 100).map((h) => ({ ...loadNote(userId, h.id), snippet: h.snippet })));
  let sql = 'SELECT n.id FROM notes n';
  const params: any[] = [];
  const where = ['n.user_id = ?']; params.push(userId);
  if (entity) { sql += ' JOIN note_entities ne ON ne.note_id = n.id'; where.push('ne.entity_id = ?'); params.push(entity); }
  if (category) { where.push('n.category = ?'); params.push(category); }
  if (pinned === '1') where.push('n.pinned = 1');
  sql += ` WHERE ${where.join(' AND ')} ORDER BY n.pinned DESC, n.updated_at DESC`;
  let notes = all<{ id: string }>(sql, ...params).map((r) => loadNote(userId, r.id)!).filter(Boolean);
  if (tag) notes = notes.filter((n) => n.tags.includes(tag));
  res.json(notes);
});
priv.get('/notes/export', (req: AuthedRequest, res) => {
  const userId = uidOf(req);
  const format = String(req.query.format || 'html');
  const notes = all<{ id: string }>('SELECT id FROM notes WHERE user_id = ? ORDER BY updated_at DESC', userId).map((r) => loadNote(userId, r.id)!);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="research-notes-${stamp}.json"`);
    return res.json(notes);
  }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const body = notes.map((n) => `<article><h1>${esc(n.title || 'Untitled note')}</h1><p><small>Created ${n.createdAt} · Updated ${n.updatedAt}${n.tags.length ? ' · Tags: ' + esc(n.tags.join(', ')) : ''}${n.entityIds.length ? ' · Linked: ' + esc(n.entityIds.map((e) => getEntity(e)?.name || e).join(', ')) : ''}</small></p>${n.bodyHtml}</article><hr>`).join('\n');
  res.setHeader('Content-Disposition', `attachment; filename="research-notes-${stamp}.html"`);
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Research notes ${stamp}</title><style>body{font:15px/1.5 system-ui;max-width:760px;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>${body}`);
});
// Titles for [[ autocomplete: prefix matches first.
priv.get('/notes/titles', (req: AuthedRequest, res) => {
  const q = String(req.query.q || '').trim();
  const rows = all<any>(`SELECT id, title, updated_at FROM notes WHERE user_id = ? AND title LIKE ? ESCAPE '\\'
    ORDER BY CASE WHEN title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, updated_at DESC LIMIT 8`,
    uidOf(req), `%${q.replace(/[\\%_]/g, '\\$&')}%`, `${q.replace(/[\\%_]/g, '\\$&')}%`);
  res.json(rows.map((r) => ({ id: r.id, title: r.title || 'Untitled note', updatedAt: r.updated_at })));
});
priv.get('/notes/resolve', (req: AuthedRequest, res) => {
  const id = findNoteByTitle(uidOf(req), String(req.query.title || ''));
  res.json({ id: id || null });
});
// Daily note: one note per local date, created on first open.
priv.post('/notes/daily', (req: AuthedRequest, res) => {
  const date = String(req.body?.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
  let id = findNoteByTitle(uidOf(req), date);
  if (!id) { id = uid(); saveNote(uidOf(req), id, { title: date, category: 'Daily note', tags: ['daily'], bodyHtml: '' }, true); }
  res.json({ id });
});
// Note ↔ note and note ↔ entity graph (Obsidian-style graph view).
priv.get('/notes/graph', (req: AuthedRequest, res) => {
  const userId = uidOf(req);
  const notes = all<any>('SELECT id, title, tags, category, pinned FROM notes WHERE user_id = ?', userId);
  const ids = new Set(notes.map((n) => n.id));
  const nodes: any[] = notes.map((n) => ({ id: n.id, kind: 'note', label: n.title || 'Untitled note', tags: J(n.tags), category: n.category, pinned: !!n.pinned }));
  const links: any[] = [];
  for (const l of all<any>('SELECT l.note_id, l.target_id FROM note_links l JOIN notes n ON n.id = l.note_id WHERE n.user_id = ?', userId))
    if (ids.has(l.target_id)) links.push({ source: l.note_id, target: l.target_id, kind: 'note' });
  const ents = new Map<string, any>();
  for (const r of all<any>('SELECT ne.note_id, ne.entity_id FROM note_entities ne JOIN notes n ON n.id = ne.note_id WHERE n.user_id = ?', userId)) {
    const s = stub(r.entity_id); if (!s) continue;
    if (!ents.has(s.id)) ents.set(s.id, { id: s.id, kind: 'entity', label: s.name, type: s.type });
    links.push({ source: r.note_id, target: s.id, kind: 'entity' });
  }
  res.json({ nodes: [...nodes, ...ents.values()], links });
});
priv.get('/notes/:id', (req: AuthedRequest, res) => {
  const n = loadNote(uidOf(req), req.params.id);
  n ? res.json(n) : res.status(404).json({ error: 'Note not found' });
});
// Outgoing links, backlinks and unlinked mentions (notes that name this note without linking it).
priv.get('/notes/:id/links', (req: AuthedRequest, res) => {
  const userId = uidOf(req);
  const n = get<any>('SELECT id, title FROM notes WHERE id = ? AND user_id = ?', req.params.id, userId);
  if (!n) return res.status(404).json({ error: 'Note not found' });
  const pick = (r: any) => ({ id: r.id, title: r.title || 'Untitled note', updatedAt: r.updated_at });
  const outgoing = all<any>('SELECT n.id, n.title, n.updated_at FROM note_links l JOIN notes n ON n.id = l.target_id WHERE l.note_id = ? AND n.user_id = ?', n.id, userId).map(pick);
  const backlinks = all<any>('SELECT n.id, n.title, n.updated_at, substr(n.body_text, 1, 200) AS excerpt FROM note_links l JOIN notes n ON n.id = l.note_id WHERE l.target_id = ? AND n.user_id = ? ORDER BY n.updated_at DESC', n.id, userId)
    .map((r) => ({ ...pick(r), excerpt: r.excerpt }));
  let unlinked: any[] = [];
  const phrase = String(n.title || '').replace(/"/g, '').trim();
  if (phrase.length >= 3) {
    const skip = new Set([n.id, ...backlinks.map((b) => b.id)]);
    try {
      unlinked = all<any>(`SELECT n.id, n.title, n.updated_at, snippet(notes_fts, 2, char(1), char(2), '…', 12) AS snip FROM notes_fts JOIN notes n ON n.id = notes_fts.note_id
        WHERE notes_fts MATCH ? AND n.user_id = ? LIMIT 20`, `body:"${phrase}"`, userId).filter((r) => !skip.has(r.id)).slice(0, 8).map((r) => ({ ...pick(r), snippet: r.snip }));
    } catch { /* title with FTS syntax characters */ }
  }
  res.json({ outgoing, backlinks, unlinked });
});
priv.post('/notes', (req: AuthedRequest, res) => {
  const id = uid();
  saveNote(uidOf(req), id, req.body || {}, true);
  res.status(201).json(loadNote(uidOf(req), id));
});
priv.put('/notes/:id', (req: AuthedRequest, res) => {
  const cur = get<any>('SELECT id, ext_updated_at FROM notes WHERE id = ? AND user_id = ?', req.params.id, uidOf(req));
  if (!cur) return res.status(404).json({ error: 'Note not found' });
  // The note changed in Obsidian after this editor loaded it: don't overwrite those edits silently.
  const base = req.body?.baseUpdatedAt;
  if (base && cur.ext_updated_at && cur.ext_updated_at > base && !req.body?.force)
    return res.status(409).json({ error: 'This note was changed in Obsidian after you opened it.', note: loadNote(uidOf(req), req.params.id) });
  saveNote(uidOf(req), req.params.id, req.body || {}, false);
  res.json(loadNote(uidOf(req), req.params.id));
});
priv.delete('/notes/:id', (req: AuthedRequest, res) => {
  const userId = uidOf(req);
  for (const a of all<any>('SELECT storage_key FROM attachments WHERE note_id = ? AND user_id = ?', req.params.id, userId)) fs.rm(path.join(DATA_DIR, 'uploads', a.storage_key), () => {});
  deleteNoteRow(userId, req.params.id);
  res.json({ ok: true });
});
priv.get('/tags', (req: AuthedRequest, res) => {
  const counts = new Map<string, number>();
  for (const r of all<any>('SELECT tags FROM notes WHERE user_id = ?', uidOf(req))) for (const t of J(r.tags)) counts.set(t, (counts.get(t) || 0) + 1);
  res.json([...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count));
});

// Attachments: raw body upload (filename in header), stored under data/uploads/<user>/
priv.post('/notes/:id/attachments', express.raw({ type: '*/*', limit: '25mb' }), (req: AuthedRequest, res) => {
  const userId = uidOf(req);
  if (!get('SELECT id FROM notes WHERE id = ? AND user_id = ?', req.params.id, userId)) return res.status(404).json({ error: 'Note not found' });
  const filename = decodeURIComponent(String(req.headers['x-filename'] || 'upload')).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 200);
  const buf = req.body as Buffer;
  if (!buf?.length) return res.status(400).json({ error: 'Empty file' });
  const id = uid();
  const key = path.join(userId, id);
  fs.mkdirSync(path.join(DATA_DIR, 'uploads', userId), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'uploads', key), buf);
  run('INSERT INTO attachments (id, note_id, user_id, filename, mime, size, storage_key, created_at) VALUES (?,?,?,?,?,?,?,?)', id, req.params.id, userId, filename, String(req.headers['content-type'] || 'application/octet-stream'), buf.length, key, now());
  run('UPDATE notes SET updated_at = ? WHERE id = ?', now(), req.params.id);
  res.status(201).json({ id, filename, size: buf.length });
});
priv.get('/attachments/:id', (req: AuthedRequest, res) => {
  const a = get<any>('SELECT * FROM attachments WHERE id = ? AND user_id = ?', req.params.id, uidOf(req));
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', a.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(a.filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(path.join(DATA_DIR, 'uploads', a.storage_key)).pipe(res);
});
priv.delete('/attachments/:id', (req: AuthedRequest, res) => {
  const a = get<any>('SELECT * FROM attachments WHERE id = ? AND user_id = ?', req.params.id, uidOf(req));
  if (a) { fs.rm(path.join(DATA_DIR, 'uploads', a.storage_key), () => {}); run('DELETE FROM attachments WHERE id = ?', a.id); }
  res.json({ ok: true });
});

// ───────────────────────── Positions ─────────────────────────
function loadPosition(userId: string, id: string): Position | undefined {
  const p = get<any>('SELECT * FROM positions WHERE id = ? AND user_id = ?', id, userId);
  if (!p) return undefined;
  const transactions: Transaction[] = all<any>('SELECT * FROM transactions WHERE position_id = ? ORDER BY trade_date, rowid', id)
    .map((t) => ({ id: t.id, kind: t.kind, date: t.trade_date, price: t.price, quantity: t.quantity, fees: t.fees, note: t.note }));
  return { id: p.id, entityId: p.entity_id, side: p.side, status: p.status, portfolio: p.portfolio, thesis: p.thesis, transactions, createdAt: p.created_at, updatedAt: p.updated_at };
}
export function summarize(p: Position): PositionSummary {
  const buys = p.transactions.filter((t) => t.kind === 'open' || t.kind === 'add');
  const sells = p.transactions.filter((t) => t.kind === 'reduce' || t.kind === 'close');
  const withQty = buys.every((t) => t.quantity != null && t.quantity > 0);
  const avgEntry = !buys.length ? 0 : withQty
    ? buys.reduce((s, t) => s + t.price * t.quantity!, 0) / buys.reduce((s, t) => s + t.quantity!, 0)
    : buys.reduce((s, t) => s + t.price, 0) / buys.length;
  const quantity = withQty ? buys.reduce((s, t) => s + t.quantity!, 0) - sells.reduce((s, t) => s + (t.quantity || 0), 0) : null;
  return { id: p.id, side: p.side, status: p.status, avgEntry, firstEntryDate: buys.map((t) => t.date).sort()[0] || p.createdAt.slice(0, 10), quantity };
}
export function positionsFor(userId: string, entityId?: string) {
  const rows = entityId ? all<any>('SELECT id FROM positions WHERE user_id = ? AND entity_id = ? ORDER BY created_at', userId, entityId) : all<any>('SELECT id FROM positions WHERE user_id = ? ORDER BY created_at', userId);
  return rows.map((r) => loadPosition(userId, r.id)!).map((p) => {
    const e = getEntity(p.entityId);
    return { ...p, summary: summarize(p), entity: stub(p.entityId), hqCountry: e?.attrs?.hqCountry ? stub(e.attrs.hqCountry) : null, currency: e?.attrs?.currency || 'USD' };
  });
}
export function openPositionMap(userId: string) {
  const m = new Map<string, PositionSummary>();
  for (const p of positionsFor(userId)) if (p.status === 'open' && !m.has(p.entityId)) m.set(p.entityId, p.summary);
  return m;
}

function validTx(t: any) {
  const kinds = ['open', 'add', 'reduce', 'close'];
  if (!kinds.includes(t.kind)) return 'Transaction type must be open, add, reduce or close.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t.date))) return 'Transaction date must be YYYY-MM-DD.';
  if (!(Number(t.price) > 0)) return 'Price must be a positive number.';
  if (t.quantity != null && t.quantity !== '' && !(Number(t.quantity) > 0)) return 'Quantity must be positive if given.';
  return null;
}
function insertTx(positionId: string, t: any) {
  run('INSERT INTO transactions (id, position_id, kind, trade_date, price, quantity, fees, note) VALUES (?,?,?,?,?,?,?,?)', uid(), positionId, t.kind, t.date, Number(t.price),
    t.quantity == null || t.quantity === '' ? null : Number(t.quantity), t.fees == null || t.fees === '' ? null : Number(t.fees), t.note || null);
}

priv.get('/positions', (req: AuthedRequest, res) => res.json(positionsFor(uidOf(req), req.query.entity as string | undefined)));
priv.post('/positions', (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!getEntity(b.entityId)) return res.status(400).json({ error: 'Unknown security' });
  if (!['long', 'short'].includes(b.side)) return res.status(400).json({ error: 'Side must be long or short.' });
  const txs: any[] = Array.isArray(b.transactions) && b.transactions.length ? b.transactions : [];
  if (!txs.length) return res.status(400).json({ error: 'Add at least one transaction (entry price and date).' });
  for (const t of txs) { const e = validTx(t); if (e) return res.status(400).json({ error: e }); }
  const id = uid(); const ts = now();
  tx(() => {
    run('INSERT INTO positions (id, user_id, entity_id, side, status, portfolio, thesis, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)', id, uidOf(req), b.entityId, b.side, b.status === 'closed' ? 'closed' : 'open', b.portfolio || null, b.thesis || null, ts, ts);
    for (const t of txs) insertTx(id, t);
  });
  const p = loadPosition(uidOf(req), id)!;
  res.status(201).json({ ...p, summary: summarize(p) });
});
priv.put('/positions/:id', (req: AuthedRequest, res) => {
  const p = loadPosition(uidOf(req), req.params.id);
  if (!p) return res.status(404).json({ error: 'Position not found' });
  const b = req.body || {};
  run('UPDATE positions SET side = ?, status = ?, portfolio = ?, thesis = ?, updated_at = ? WHERE id = ?',
    ['long', 'short'].includes(b.side) ? b.side : p.side, ['open', 'closed'].includes(b.status) ? b.status : p.status, b.portfolio ?? p.portfolio, b.thesis ?? p.thesis, now(), p.id);
  const q = loadPosition(uidOf(req), p.id)!;
  res.json({ ...q, summary: summarize(q) });
});
priv.delete('/positions/:id', (req: AuthedRequest, res) => { run('DELETE FROM positions WHERE id = ? AND user_id = ?', req.params.id, uidOf(req)); res.json({ ok: true }); });
priv.post('/positions/:id/transactions', (req: AuthedRequest, res) => {
  const p = loadPosition(uidOf(req), req.params.id);
  if (!p) return res.status(404).json({ error: 'Position not found' });
  const e = validTx(req.body || {}); if (e) return res.status(400).json({ error: e });
  insertTx(p.id, req.body);
  if (req.body.kind === 'close') run("UPDATE positions SET status = 'closed' WHERE id = ?", p.id);
  run('UPDATE positions SET updated_at = ? WHERE id = ?', now(), p.id);
  const q = loadPosition(uidOf(req), p.id)!;
  res.json({ ...q, summary: summarize(q) });
});
priv.delete('/transactions/:id', (req: AuthedRequest, res) => {
  const t = get<any>('SELECT t.id, t.position_id FROM transactions t JOIN positions p ON p.id = t.position_id WHERE t.id = ? AND p.user_id = ?', req.params.id, uidOf(req));
  if (t) run('DELETE FROM transactions WHERE id = ?', t.id);
  res.json({ ok: true });
});

// ───────────────────────── Catalysts ─────────────────────────
const catRow = (c: any): Catalyst => ({ id: c.id, title: c.title, eventEntityId: c.event_entity_id, eventDate: c.event_date, status: c.status, expectedOutcome: c.expected_outcome, scenarios: c.scenarios, implications: c.implications, thesis: c.thesis, postAnalysis: c.post_analysis, entityIds: J(c.entity_ids), createdAt: c.created_at, updatedAt: c.updated_at });
priv.get('/catalysts', (req: AuthedRequest, res) => {
  let rows = all<any>('SELECT * FROM catalysts WHERE user_id = ? ORDER BY event_date IS NULL, event_date', uidOf(req)).map(catRow);
  const ent = req.query.entity as string | undefined;
  if (ent) rows = rows.filter((c) => c.entityIds.includes(ent) || c.eventEntityId === ent);
  res.json(rows);
});
function saveCatalyst(userId: string, id: string, b: any, isNew: boolean) {
  const fields = [String(b.title || 'Untitled catalyst').slice(0, 300), b.eventEntityId || null, b.eventDate || null, ['pending', 'occurred', 'cancelled'].includes(b.status) ? b.status : 'pending',
    b.expectedOutcome || null, b.scenarios || null, b.implications || null, b.thesis || null, b.postAnalysis || null, JSON.stringify((b.entityIds || []).filter((e: string) => getEntity(e)))];
  if (isNew) run('INSERT INTO catalysts (title, event_entity_id, event_date, status, expected_outcome, scenarios, implications, thesis, post_analysis, entity_ids, id, user_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', ...fields, id, userId, now(), now());
  else run('UPDATE catalysts SET title=?, event_entity_id=?, event_date=?, status=?, expected_outcome=?, scenarios=?, implications=?, thesis=?, post_analysis=?, entity_ids=?, updated_at=? WHERE id=? AND user_id=?', ...fields, now(), id, userId);
}
priv.post('/catalysts', (req: AuthedRequest, res) => { const id = uid(); saveCatalyst(uidOf(req), id, req.body || {}, true); res.status(201).json(catRow(get('SELECT * FROM catalysts WHERE id = ?', id))); });
priv.put('/catalysts/:id', (req: AuthedRequest, res) => { saveCatalyst(uidOf(req), req.params.id, req.body || {}, false); const c = get('SELECT * FROM catalysts WHERE id = ? AND user_id = ?', req.params.id, uidOf(req)); c ? res.json(catRow(c)) : res.status(404).json({ error: 'Not found' }); });
priv.delete('/catalysts/:id', (req: AuthedRequest, res) => { run('DELETE FROM catalysts WHERE id = ? AND user_id = ?', req.params.id, uidOf(req)); res.json({ ok: true }); });

// ───────────────────────── Watchlists, saved views, prefs, reports ─────────────────────────
const wlRow = (w: any): Watchlist & { entities: any[] } => {
  const entityIds: string[] = J(w.entity_ids);
  return { id: w.id, name: w.name, entityIds, entities: entityIds.map((id) => stub(id)).filter(Boolean) };
};
priv.get('/watchlists', (req: AuthedRequest, res) => res.json(all('SELECT * FROM watchlists WHERE user_id = ? ORDER BY rowid', uidOf(req)).map(wlRow)));
priv.post('/watchlists', (req: AuthedRequest, res) => { const id = uid(); run('INSERT INTO watchlists (id, user_id, name, entity_ids) VALUES (?,?,?,?)', id, uidOf(req), String(req.body?.name || 'New watchlist').slice(0, 100), JSON.stringify(req.body?.entityIds || [])); res.status(201).json(wlRow(get('SELECT * FROM watchlists WHERE id = ?', id))); });
priv.put('/watchlists/:id', (req: AuthedRequest, res) => {
  const w = get<any>('SELECT * FROM watchlists WHERE id = ? AND user_id = ?', req.params.id, uidOf(req));
  if (!w) return res.status(404).json({ error: 'Not found' });
  const ids = Array.isArray(req.body?.entityIds) ? [...new Set<string>(req.body.entityIds)].filter((e) => getEntity(e)) : J(w.entity_ids);
  run('UPDATE watchlists SET name = ?, entity_ids = ? WHERE id = ?', String(req.body?.name ?? w.name).slice(0, 100), JSON.stringify(ids), w.id);
  res.json(wlRow(get('SELECT * FROM watchlists WHERE id = ?', w.id)));
});
priv.delete('/watchlists/:id', (req: AuthedRequest, res) => { run('DELETE FROM watchlists WHERE id = ? AND user_id = ?', req.params.id, uidOf(req)); res.json({ ok: true }); });

priv.get('/views', (req: AuthedRequest, res) => res.json(all<any>('SELECT * FROM saved_views WHERE user_id = ? ORDER BY rowid', uidOf(req)).map((v) => ({ id: v.id, name: v.name, state: J(v.state, {}) }))));
priv.post('/views', (req: AuthedRequest, res) => { const id = uid(); run('INSERT INTO saved_views (id, user_id, name, state) VALUES (?,?,?,?)', id, uidOf(req), String(req.body?.name || 'Saved view').slice(0, 100), JSON.stringify(req.body?.state || {})); res.status(201).json({ id, name: req.body?.name, state: req.body?.state }); });
priv.delete('/views/:id', (req: AuthedRequest, res) => { run('DELETE FROM saved_views WHERE id = ? AND user_id = ?', req.params.id, uidOf(req)); res.json({ ok: true }); });

priv.get('/prefs', (req: AuthedRequest, res) => res.json(J(get<any>('SELECT data FROM prefs WHERE user_id = ?', uidOf(req))?.data, {})));
priv.put('/prefs', (req: AuthedRequest, res) => {
  const cur = J(get<any>('SELECT data FROM prefs WHERE user_id = ?', uidOf(req))?.data, {});
  const next = { ...cur, ...(req.body || {}) };
  run('INSERT INTO prefs (user_id, data) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data', uidOf(req), JSON.stringify(next));
  res.json(next);
});

priv.post('/reports', (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.entityId || !String(b.message || '').trim()) return res.status(400).json({ error: 'Describe the problem.' });
  run('INSERT INTO data_reports (id, user_id, entity_id, field, message, created_at) VALUES (?,?,?,?,?,?)', uid(), uidOf(req), b.entityId, b.field || null, String(b.message).slice(0, 4000), now());
  res.status(201).json({ ok: true });
});
priv.get('/reports', (req: AuthedRequest, res) => res.json(all('SELECT * FROM data_reports WHERE user_id = ? ORDER BY created_at DESC', uidOf(req))));

export function noteCountsFor(userId: string, entityId: string) {
  return get<{ c: number }>('SELECT COUNT(*) AS c FROM note_entities ne JOIN notes n ON n.id = ne.note_id WHERE ne.entity_id = ? AND n.user_id = ?', entityId, userId)?.c || 0;
}
export function recentNotesFor(userId: string, entityId: string, limit = 3) {
  return all<any>('SELECT n.id, n.title, n.body_text, n.updated_at, n.pinned FROM notes n JOIN note_entities ne ON ne.note_id = n.id WHERE ne.entity_id = ? AND n.user_id = ? ORDER BY n.pinned DESC, n.updated_at DESC LIMIT ?', entityId, userId, limit)
    .map((n) => ({ id: n.id, title: n.title || 'Untitled note', excerpt: String(n.body_text).slice(0, 160), updatedAt: n.updated_at, pinned: !!n.pinned }));
}
export function catalystsFor(userId: string, entityId: string) {
  return all<any>('SELECT * FROM catalysts WHERE user_id = ?', userId).map(catRow).filter((c) => c.entityIds.includes(entityId) || c.eventEntityId === entityId);
}
export type { Response };

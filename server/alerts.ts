// Alerts: each user's rules are matched against the change feed as changes arrive.
//
// A rule watches a set of entities — picked directly, from watchlists, from notes (one note, or
// everything you have written about), from open positions, or by place on the map ("anything in
// Ukraine": every entity whose place lies inside it) — and filters by kind and importance (1–10).
// Market rules carry thresholds (price %, currency %, 10-year yield bp).
// Matching alerts land in the user's inbox (bell in the top bar, browser notifications) and can
// be forwarded to Slack, Discord, ntfy or any JSON endpoint on an allow-listed host.
import express from 'express';
import { db, all, get, run, now, uid } from './db.js';
import { onChange, getChange, changesFor, countChanges, CHANGE_KINDS, type Change, type ChangeKind, type StoredChange } from './changes.js';
import { getEntity, stub, geoChain, countryOf } from './graph.js';
import { positionsFor } from './private.js';
import { loadNote, saveNote, findNoteByTitle } from './notes.js';
import type { AuthedRequest } from './auth.js';

db.exec(`
CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS alert_rules_user_idx ON alert_rules(user_id);
CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, rule_id TEXT, change_key TEXT NOT NULL,
  created_at TEXT NOT NULL, read_at TEXT, UNIQUE(user_id, change_key)
);
CREATE INDEX IF NOT EXISTS alert_events_user_idx ON alert_events(user_id, created_at);
CREATE TABLE IF NOT EXISTS alert_outbox (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, rule_id TEXT NOT NULL, change_key TEXT NOT NULL, created_at TEXT NOT NULL, sent_at TEXT, error TEXT
);
`);

export interface RuleConfig {
  entities?: string[]; watchlists?: string[]; noteIds?: string[]; allNotes?: boolean; positions?: boolean;
  /** Countries / states / cities picked on the map; with `inside`, anything located in them counts. */ places?: string[]; inside?: boolean;
  kinds?: ChangeKind[]; minImportance?: number;
  pricePct?: number | null; fxPct?: number | null; yieldBp?: number | null;
  browser?: boolean; webhook?: { url: string; format: 'slack' | 'discord' | 'ntfy' | 'json' } | null;
}
export interface Rule { id: string; userId: string; name: string; config: RuleConfig; enabled: boolean; createdAt: string; updatedAt: string; }

export const DEFAULTS = { minImportance: 5, pricePct: 5, fxPct: 2, yieldBp: 15 };
// Thresholds at which market producers record a move; a rule's threshold maps to the first one at or above it.
export const BUCKETS: Record<'market' | 'fx' | 'yield', number[]> = { market: [2, 3, 5, 8, 12, 20], fx: [1, 2, 3, 5, 10], yield: [10, 15, 25, 50, 100] };
export const bucketFor = (kind: 'market' | 'fx' | 'yield', threshold: number) => BUCKETS[kind].find((b) => b >= threshold) ?? BUCKETS[kind].at(-1)!;

const J = (s: string | null | undefined, d: any) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const rowToRule = (r: any): Rule => ({ id: r.id, userId: r.user_id, name: r.name, config: J(r.config, {}), enabled: !!r.enabled, createdAt: r.created_at, updatedAt: r.updated_at });

// ───────────────────────── Watched entities ─────────────────────────
let ruleCache: { at: number; rules: Rule[] } | null = null;
const enabledRules = () => {
  if (!ruleCache || Date.now() - ruleCache.at > 30_000) ruleCache = { at: Date.now(), rules: all<any>('SELECT * FROM alert_rules WHERE enabled = 1').map(rowToRule) };
  return ruleCache.rules;
};
const watchCache = new Map<string, { at: number; set: Set<string> }>();
export function invalidateRules() { ruleCache = null; watchCache.clear(); }

/** Every entity a rule watches directly (not counting places). */
export function watchedEntities(rule: Rule): Set<string> {
  const hit = watchCache.get(rule.id);
  if (hit && Date.now() - hit.at < 60_000) return hit.set;
  const c = rule.config; const set = new Set<string>(c.entities || []);
  for (const w of c.watchlists || []) for (const id of J(get<any>('SELECT entity_ids FROM watchlists WHERE id = ? AND user_id = ?', w, rule.userId)?.entity_ids, [])) set.add(id);
  if (c.allNotes) for (const r of all<any>('SELECT DISTINCT ne.entity_id FROM note_entities ne JOIN notes n ON n.id = ne.note_id WHERE n.user_id = ?', rule.userId)) set.add(r.entity_id);
  else if (c.noteIds?.length) for (const r of all<any>(`SELECT DISTINCT ne.entity_id FROM note_entities ne JOIN notes n ON n.id = ne.note_id WHERE n.user_id = ? AND n.id IN (${c.noteIds.map(() => '?').join(',')})`, rule.userId, ...c.noteIds)) set.add(r.entity_id);
  if (c.positions) for (const p of positionsFor(rule.userId)) if (p.status === 'open') set.add(p.entityId);
  for (const p of c.places || []) set.add(p);
  watchCache.set(rule.id, { at: Date.now(), set });
  return set;
}

/** Everything any enabled rule watches, plus companies and commodities inside watched places
 *  (market moves are only checked for these, not for the whole market). */
export function allWatchedEntities() {
  const out = new Set<string>(); const places = new Set<string>();
  for (const r of enabledRules()) { for (const id of watchedEntities(r)) out.add(id); if (r.config.inside) for (const p of r.config.places || []) places.add(p); }
  return { entities: out, places };
}

/** Does this change concern something the rule watches (directly, or by place)? */
function concerns(rule: Rule, c: Change) {
  const watched = watchedEntities(rule);
  if (c.entityIds.some((id) => watched.has(id))) return true;
  if (rule.config.inside && rule.config.places?.length) {
    const places = new Set(rule.config.places);
    return c.entityIds.some((id) => geoChain(id).some((p) => places.has(p)));
  }
  return false;
}

export function matches(rule: Rule, c: Change) {
  const cfg = rule.config;
  if (cfg.kinds?.length && !cfg.kinds.includes(c.kind)) return false;
  // Market moves: the change's magnitude is the threshold bucket it crossed; one alert per rule per move.
  if (c.kind === 'market' || c.kind === 'fx' || c.kind === 'yield') {
    const t = c.kind === 'market' ? cfg.pricePct ?? DEFAULTS.pricePct : c.kind === 'fx' ? cfg.fxPct ?? DEFAULTS.fxPct : cfg.yieldBp ?? DEFAULTS.yieldBp;
    if (t == null || t <= 0 || c.magnitude == null || c.magnitude !== bucketFor(c.kind, t)) return false;
  } else if (c.importance < (cfg.minImportance ?? DEFAULTS.minImportance)) return false;
  return concerns(rule, c);
}

// ───────────────────────── Engine ─────────────────────────
onChange((c) => {
  for (const rule of enabledRules()) {
    let ok = false;
    try { ok = matches(rule, c); } catch (e: any) { console.warn('[alerts] rule failed:', e.message); }
    if (!ok) continue;
    const r = run('INSERT OR IGNORE INTO alert_events (id, user_id, rule_id, change_key, created_at) VALUES (?,?,?,?,?)', uid(), rule.userId, rule.id, c.key, now());
    if (r.changes && rule.config.webhook?.url) run('INSERT INTO alert_outbox (id, user_id, rule_id, change_key, created_at) VALUES (?,?,?,?,?)', uid(), rule.userId, rule.id, c.key, now());
  }
});

// ───────────────────────── Webhooks ─────────────────────────
// Only well-known chat/notification hosts by default, so a signed-in user cannot make the server
// call arbitrary (e.g. internal) addresses. Add hosts with TERMINAL_WEBHOOK_HOSTS=host1,host2.
const WEBHOOK_HOSTS = new Set(['hooks.slack.com', 'discord.com', 'discordapp.com', 'ntfy.sh', ...(process.env.TERMINAL_WEBHOOK_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)]);
export function checkWebhook(url: string) {
  let u: URL;
  try { u = new URL(url); } catch { return 'Not a valid URL.'; }
  if (u.protocol !== 'https:') return 'Webhooks must use https.';
  if (!WEBHOOK_HOSTS.has(u.hostname.toLowerCase())) return `Host ${u.hostname} is not allowed. Allowed: ${[...WEBHOOK_HOSTS].join(', ')} (add more with TERMINAL_WEBHOOK_HOSTS).`;
  return null;
}
const appUrl = () => process.env.TERMINAL_PUBLIC_URL || `http://localhost:${process.env.PORT || 5180}`;
export function webhookBody(format: string, items: StoredChange[], ruleName: string) {
  const line = (c: StoredChange) => `${CHANGE_KINDS[c.kind]?.icon || '•'} [${c.importance}/10] ${c.title}${c.url ? ` — ${c.url}` : ''}`;
  const text = `Global Intelligence Terminal — ${ruleName}\n${items.map(line).join('\n')}\n${appUrl()}/alerts`;
  if (format === 'slack') return { body: JSON.stringify({ text }), type: 'application/json' };
  if (format === 'discord') return { body: JSON.stringify({ content: text.slice(0, 1900) }), type: 'application/json' };
  if (format === 'ntfy') return { body: items.map(line).join('\n'), type: 'text/plain', headers: { Title: `GIT — ${ruleName}`.slice(0, 120) } };
  return { body: JSON.stringify({ rule: ruleName, items: items.map((c) => ({ title: c.title, kind: c.kind, importance: c.importance, url: c.url, at: c.at, entities: c.entityIds })) }), type: 'application/json' };
}
async function flushOutbox() {
  const pending = all<any>('SELECT * FROM alert_outbox WHERE sent_at IS NULL ORDER BY created_at LIMIT 200');
  const byRule = new Map<string, any[]>();
  for (const p of pending) (byRule.get(p.rule_id) || byRule.set(p.rule_id, []).get(p.rule_id)!).push(p);
  for (const [ruleId, rows] of byRule) {
    const rule = get<any>('SELECT * FROM alert_rules WHERE id = ?', ruleId);
    const cfg: RuleConfig = J(rule?.config, {});
    const mark = (err?: string) => { for (const r of rows) run('UPDATE alert_outbox SET sent_at = ?, error = ? WHERE id = ?', now(), err ?? null, r.id); };
    if (!rule || !cfg.webhook?.url) { mark('rule removed'); continue; }
    const bad = checkWebhook(cfg.webhook.url); if (bad) { mark(bad); continue; }
    const items = rows.slice(0, 10).map((r) => getChange(r.change_key)).filter(Boolean) as StoredChange[];
    const { body, type, headers } = webhookBody(cfg.webhook.format, items, rule.name) as any;
    try {
      const res = await fetch(cfg.webhook.url, { method: 'POST', headers: { 'Content-Type': type, ...(headers || {}) }, body, signal: AbortSignal.timeout(10000) });
      mark(res.ok ? undefined : `HTTP ${res.status}`);
    } catch (e: any) { mark(String(e.message || e).slice(0, 200)); }
  }
  run('DELETE FROM alert_outbox WHERE sent_at IS NOT NULL AND sent_at < ?', new Date(Date.now() - 7 * 86400_000).toISOString());
}
setInterval(() => { void flushOutbox().catch(() => {}); }, 30_000).unref();

// ───────────────────────── Views ─────────────────────────
function alertView(r: any) {
  const c = getChange(r.change_key); if (!c) return null;
  const places = [...new Set(c.entityIds.map((id) => countryOf(id)).filter(Boolean) as string[])];
  return {
    id: r.id, ruleId: r.rule_id, createdAt: r.created_at, readAt: r.read_at, change: c, kindLabel: CHANGE_KINDS[c.kind]?.label, icon: CHANGE_KINDS[c.kind]?.icon,
    entities: c.entityIds.map((id) => stub(id)).filter(Boolean).slice(0, 8), places: places.map((p) => stub(p)).filter(Boolean),
  };
}
/** Unread alerts per country (and US state) for the map layer. */
export function alertsByPlace(userId: string) {
  const rows = all<any>('SELECT * FROM alert_events WHERE user_id = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT 500', userId);
  const by = new Map<string, { n: number; max: number; titles: string[] }>();
  for (const r of rows) {
    const c = getChange(r.change_key); if (!c) continue;
    const places = new Set<string>(); for (const id of c.entityIds) for (const p of geoChain(id)) if (p.startsWith('country:') || p.startsWith('state:')) places.add(p);
    for (const p of places) { const v = by.get(p) || by.set(p, { n: 0, max: 0, titles: [] }).get(p)!; v.n++; v.max = Math.max(v.max, c.importance); if (v.titles.length < 3) v.titles.push(c.title); }
  }
  return by;
}

// ───────────────────────── Notes ─────────────────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Append an alert to a note (or today's daily note) as a dated, sourced line with entity links. */
export function appendToNote(userId: string, changeKey: string, target: { noteId?: string; daily?: string }) {
  const c = getChange(changeKey); if (!c) throw new Error('This change is no longer stored.');
  let noteId = target.noteId;
  if (!noteId && target.daily) {
    noteId = findNoteByTitle(userId, target.daily);
    if (!noteId) { noteId = uid(); saveNote(userId, noteId, { title: target.daily, category: 'Daily note', tags: ['daily'], bodyHtml: '' }, true); }
  }
  const n = noteId ? loadNote(userId, noteId) : undefined;
  if (!n) throw new Error('Note not found.');
  const links = c.entityIds.map((id) => getEntity(id)).filter(Boolean).slice(0, 6).map((e) => `<a href="/entity/${encodeURIComponent(e!.id)}">${esc(e!.name)}</a>`).join(', ');
  const when = new Date(c.at).toISOString().slice(0, 16).replace('T', ' ');
  const block = `<p>🔔 <strong>${esc(c.title)}</strong> — ${when} UTC · ${CHANGE_KINDS[c.kind]?.label || c.kind} · importance ${c.importance}/10${c.url ? ` · <a href="${esc(c.url)}">source</a>` : ''}${links ? `<br>${links}` : ''}</p>`;
  saveNote(userId, n.id, { ...n, bodyHtml: `${n.bodyHtml || ''}${block}`, bodyText: undefined, entityIds: [...new Set([...(n.entityIds || []), ...c.entityIds.filter((id) => getEntity(id))])] }, false);
  return n.id;
}

// ───────────────────────── API ─────────────────────────
function sanitizeConfig(b: any): RuleConfig | string {
  const arr = (v: any, max = 500) => (Array.isArray(v) ? [...new Set(v.map(String))].slice(0, max) : undefined);
  const numOrNull = (v: any) => (v === null || v === '' ? null : v === undefined ? undefined : Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : undefined);
  const cfg: RuleConfig = {
    entities: arr(b.entities)?.filter((id) => getEntity(id)), watchlists: arr(b.watchlists, 50), noteIds: arr(b.noteIds, 200), allNotes: !!b.allNotes, positions: !!b.positions,
    places: arr(b.places, 200)?.filter((id) => getEntity(id)), inside: b.inside !== false,
    kinds: arr(b.kinds, 20)?.filter((k) => k in CHANGE_KINDS) as ChangeKind[] | undefined,
    minImportance: b.minImportance == null ? undefined : Math.max(1, Math.min(10, Math.round(Number(b.minImportance)) || DEFAULTS.minImportance)),
    pricePct: numOrNull(b.pricePct), fxPct: numOrNull(b.fxPct), yieldBp: numOrNull(b.yieldBp), browser: b.browser !== false,
    webhook: b.webhook?.url ? { url: String(b.webhook.url).trim(), format: ['slack', 'discord', 'ntfy', 'json'].includes(b.webhook.format) ? b.webhook.format : 'json' } : null,
  };
  if (cfg.webhook) { const bad = checkWebhook(cfg.webhook.url); if (bad) return bad; }
  if (!cfg.entities?.length && !cfg.watchlists?.length && !cfg.noteIds?.length && !cfg.allNotes && !cfg.positions && !cfg.places?.length) return 'Pick at least one thing to watch: entities, a watchlist, notes, positions or a place on the map.';
  return cfg;
}

export function registerAlertRoutes(r: express.Router) {
  const uidOf = (req: AuthedRequest) => req.userId!;
  r.get('/alerts/summary', (req: AuthedRequest, res) => {
    const u = uidOf(req);
    const unread = get<any>('SELECT COUNT(*) AS n FROM alert_events WHERE user_id = ? AND read_at IS NULL', u)?.n || 0;
    const latest = all<any>('SELECT * FROM alert_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 6', u).map(alertView).filter(Boolean);
    const browserRules = all<any>('SELECT id, config FROM alert_rules WHERE user_id = ? AND enabled = 1', u).filter((x) => J(x.config, {}).browser !== false).map((x) => x.id);
    res.json({ unread, latest, browserRules });
  });
  r.get('/alerts', (req: AuthedRequest, res) => {
    const u = uidOf(req); const q = req.query;
    const where = ['user_id = ?']; const params: any[] = [u];
    if (q.unread === '1') where.push('read_at IS NULL');
    if (q.rule) { where.push('rule_id = ?'); params.push(String(q.rule)); }
    if (q.before) { where.push('created_at < ?'); params.push(String(q.before)); }
    let rows = all<any>(`SELECT * FROM alert_events WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`, ...params, Math.min(300, Number(q.limit) || 100)).map(alertView).filter(Boolean) as any[];
    if (q.kind) rows = rows.filter((a) => a.change.kind === q.kind);
    if (q.place) rows = rows.filter((a) => a.change.entityIds.some((id: string) => geoChain(id).includes(String(q.place)) || id === q.place));
    res.json({ alerts: rows, kinds: CHANGE_KINDS });
  });
  r.post('/alerts/read', (req: AuthedRequest, res) => {
    const u = uidOf(req); const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (req.body?.all) run('UPDATE alert_events SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), u);
    else for (const id of ids.slice(0, 500)) run('UPDATE alert_events SET read_at = ? WHERE id = ? AND user_id = ?', now(), id, u);
    res.json({ ok: true });
  });
  r.post('/alerts/:id/to-note', (req: AuthedRequest, res) => {
    const u = uidOf(req);
    const ev = get<any>('SELECT * FROM alert_events WHERE id = ? AND user_id = ?', req.params.id, u);
    const changeKey = ev?.change_key || (req.params.id === 'change' ? String(req.body?.changeKey || '') : '');
    if (!changeKey) return res.status(404).json({ error: 'Alert not found' });
    try { res.json({ noteId: appendToNote(u, changeKey, { noteId: req.body?.noteId, daily: req.body?.daily }) }); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  r.get('/alerts/rules', (req: AuthedRequest, res) => res.json(all<any>('SELECT * FROM alert_rules WHERE user_id = ? ORDER BY created_at', uidOf(req)).map(rowToRule)));
  r.post('/alerts/rules', (req: AuthedRequest, res) => {
    const cfg = sanitizeConfig(req.body?.config || {});
    if (typeof cfg === 'string') return res.status(400).json({ error: cfg });
    const id = uid(); const ts = now();
    run('INSERT INTO alert_rules (id, user_id, name, config, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', id, uidOf(req), String(req.body?.name || 'Alert').slice(0, 120), JSON.stringify(cfg), 1, ts, ts);
    invalidateRules();
    res.status(201).json(rowToRule(get<any>('SELECT * FROM alert_rules WHERE id = ?', id)));
  });
  r.put('/alerts/rules/:id', (req: AuthedRequest, res) => {
    const cur = get<any>('SELECT * FROM alert_rules WHERE id = ? AND user_id = ?', req.params.id, uidOf(req));
    if (!cur) return res.status(404).json({ error: 'Rule not found' });
    const cfg = req.body?.config ? sanitizeConfig(req.body.config) : J(cur.config, {});
    if (typeof cfg === 'string') return res.status(400).json({ error: cfg });
    run('UPDATE alert_rules SET name = ?, config = ?, enabled = ?, updated_at = ? WHERE id = ?', String(req.body?.name ?? cur.name).slice(0, 120), JSON.stringify(cfg), req.body?.enabled === undefined ? cur.enabled : req.body.enabled ? 1 : 0, now(), cur.id);
    invalidateRules();
    res.json(rowToRule(get<any>('SELECT * FROM alert_rules WHERE id = ?', cur.id)));
  });
  r.delete('/alerts/rules/:id', (req: AuthedRequest, res) => {
    run('DELETE FROM alert_rules WHERE id = ? AND user_id = ?', req.params.id, uidOf(req)); invalidateRules(); res.json({ ok: true });
  });
  r.post('/alerts/rules/test-webhook', async (req: AuthedRequest, res) => {
    const url = String(req.body?.url || ''); const bad = checkWebhook(url);
    if (bad) return res.status(400).json({ error: bad });
    const sample: StoredChange = { key: 'test', kind: 'news', entityIds: [], title: 'Test message from the Global Intelligence Terminal', sourceId: 'trusted-news', quality: 'reported', importance: 5, at: now(), createdAt: now() };
    const { body, type, headers } = webhookBody(req.body?.format || 'json', [sample], 'Test') as any;
    try { const r2 = await fetch(url, { method: 'POST', headers: { 'Content-Type': type, ...(headers || {}) }, body, signal: AbortSignal.timeout(10000) }); res.json({ ok: r2.ok, status: r2.status }); }
    catch (e: any) { res.status(502).json({ error: e.message }); }
  });
  // Changes for a note's linked entities since it was last edited (shown on the note page).
  r.get('/notes/:id/changes', (req: AuthedRequest, res) => {
    const n = loadNote(uidOf(req), req.params.id);
    if (!n) return res.status(404).json({ error: 'Note not found' });
    const since = String(req.query.since || n.updatedAt);
    res.json({ since, changes: changesFor(n.entityIds || [], { since, limit: 30, minImportance: Number(req.query.min) || 3 }).map((c) => ({ ...c, entities: c.entityIds.map((id) => stub(id)).filter(Boolean).slice(0, 6), icon: CHANGE_KINDS[c.kind]?.icon })) });
  });
  // "N updates" badges for the research list: changes on each note's entities since it was last edited.
  r.get('/notes-updates', (req: AuthedRequest, res) => {
    const u = uidOf(req); const out: Record<string, number> = {};
    for (const n of all<any>('SELECT id, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 300', u)) {
      const ids = all<any>('SELECT entity_id FROM note_entities WHERE note_id = ?', n.id).map((x) => x.entity_id);
      const k = countChanges(ids, n.updated_at); if (k) out[n.id] = k;
    }
    res.json(out);
  });
}

/** For tests. */
export const _test = { matches, sanitizeConfig, concerns };

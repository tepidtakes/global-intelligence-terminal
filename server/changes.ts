// The change feed: every notable change the live modules detect, stored once with the entities
// it concerns. Alerts (per user), notes ("what changed since you last edited this") and the map
// all read from it. Producers hand over their current items with emitNew(); only items not seen
// before become changes, and a producer's very first run just records what exists (a baseline),
// so starting the terminal never floods the feed with old news.
import { db, all, get, run, now } from './db.js';
import type { DataQuality } from '../shared/types.js';

db.exec(`
CREATE TABLE IF NOT EXISTS change_feed (
  key TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, url TEXT, source_id TEXT, quality TEXT,
  importance INTEGER NOT NULL, magnitude REAL, grp TEXT, at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS change_feed_created_idx ON change_feed(created_at);
CREATE TABLE IF NOT EXISTS change_entities (change_key TEXT NOT NULL, entity_id TEXT NOT NULL, PRIMARY KEY (change_key, entity_id));
CREATE INDEX IF NOT EXISTS change_entities_entity_idx ON change_entities(entity_id);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at TEXT NOT NULL);
`);

export type ChangeKind = 'news' | 'signal' | 'election' | 'leader' | 'conflict' | 'market' | 'fx' | 'yield' | 'rate' | 'econ' | 'econ-upcoming' | 'sanctions' | 'tariff' | 'igo' | 'mayor' | 'data';
export const CHANGE_KINDS: Record<ChangeKind, { label: string; icon: string }> = {
  news: { label: 'Corroborated news', icon: '📰' }, signal: { label: 'Leadership & election signals', icon: '📣' }, election: { label: 'Election results', icon: '🗳' },
  leader: { label: 'New leaders', icon: '🏛' }, conflict: { label: 'Conflict changes', icon: '⚔' }, market: { label: 'Price moves', icon: '📈' },
  fx: { label: 'Currency moves', icon: '💱' }, yield: { label: 'Bond-yield moves', icon: '🏦' }, rate: { label: 'Policy-rate changes', icon: '🏦' },
  econ: { label: 'Economic data released', icon: '📊' }, 'econ-upcoming': { label: 'Economic data due soon', icon: '⏰' }, sanctions: { label: 'Sanctions designations', icon: '⛔' },
  tariff: { label: 'Tariff actions', icon: '🚧' }, igo: { label: 'Summits, assemblies & votes', icon: '🗓' }, mayor: { label: 'New mayors', icon: '🏙' }, data: { label: 'Data discrepancies', icon: '⚠' },
};

export interface Change {
  key: string; kind: ChangeKind; entityIds: string[]; title: string; detail?: string; url?: string; sourceId: string; quality: DataQuality;
  /** 1–10: how much the change matters (alerts filter on it). */ importance: number;
  /** Size of a move (percent or basis points) for market kinds; rules compare it with their thresholds. */ magnitude?: number;
  /** Changes in one group are versions of the same event (a price move crossing 2 %, then 5 %): views show the largest. */ grp?: string;
  at: string;
}
export interface StoredChange extends Change { createdAt: string; }

// ───────────────────────── Small key–value store (producer state) ─────────────────────────
export function kvGet<T>(k: string, fallback: T): T {
  const r = get<any>('SELECT v FROM kv WHERE k = ?', k);
  if (!r) return fallback;
  try { return JSON.parse(r.v) as T; } catch { return fallback; }
}
export function kvSet(k: string, v: unknown) {
  run('INSERT INTO kv (k, v, updated_at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at', k, JSON.stringify(v), now());
}

// ───────────────────────── Recording ─────────────────────────
const listeners: ((c: Change) => void)[] = [];
/** Called for every new change (the alert engine subscribes). */
export function onChange(fn: (c: Change) => void) { listeners.push(fn); }

const clampImp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
/** Store a change once (by key) and notify listeners. Returns false if it was already recorded. */
export function recordChange(c: Change): boolean {
  const ts = now();
  const r = run('INSERT OR IGNORE INTO change_feed (key, kind, title, detail, url, source_id, quality, importance, magnitude, grp, at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    c.key, c.kind, c.title.slice(0, 400), c.detail?.slice(0, 1000) ?? null, c.url ?? null, c.sourceId, c.quality, clampImp(c.importance), c.magnitude ?? null, c.grp ?? null, c.at, ts);
  if (!r.changes) return false;
  for (const id of new Set(c.entityIds)) run('INSERT OR IGNORE INTO change_entities (change_key, entity_id) VALUES (?,?)', c.key, id);
  for (const fn of listeners) { try { fn({ ...c, importance: clampImp(c.importance) }); } catch (e: any) { console.warn('[changes] listener failed:', e.message); } }
  return true;
}

/** Record only items this producer has not seen before. The first run stores a silent baseline. */
export function emitNew(producer: string, items: Change[], keep = 20000) {
  const k = `seen:${producer}`;
  const seen = kvGet<string[] | null>(k, null);
  if (seen === null) { kvSet(k, items.map((i) => i.key).slice(-keep)); return { baseline: true, recorded: 0 }; }
  const set = new Set(seen); let recorded = 0;
  for (const c of items) {
    if (set.has(c.key)) continue;
    set.add(c.key);
    if (recordChange(c)) recorded++;
  }
  kvSet(k, [...set].slice(-keep));
  return { baseline: false, recorded };
}

// ───────────────────────── Reading ─────────────────────────
const rowToChange = (r: any): StoredChange => ({
  key: r.key, kind: r.kind, title: r.title, detail: r.detail ?? undefined, url: r.url ?? undefined, sourceId: r.source_id, quality: r.quality,
  importance: r.importance, magnitude: r.magnitude ?? undefined, grp: r.grp ?? undefined, at: r.at, createdAt: r.created_at,
  entityIds: all<any>('SELECT entity_id FROM change_entities WHERE change_key = ?', r.key).map((x) => x.entity_id),
});
/** Keep only the largest version of grouped changes (e.g. one price move crossing several thresholds). */
function collapseGroups(list: StoredChange[]) {
  const best = new Map<string, StoredChange>();
  const out: StoredChange[] = [];
  for (const c of list) {
    if (!c.grp) { out.push(c); continue; }
    const b = best.get(c.grp);
    if (!b) { best.set(c.grp, c); out.push(c); }
    else if ((c.magnitude ?? 0) > (b.magnitude ?? 0)) { out[out.indexOf(b)] = c; best.set(c.grp, c); }
  }
  return out;
}

export function getChange(key: string) { const r = get<any>('SELECT * FROM change_feed WHERE key = ?', key); return r ? rowToChange(r) : undefined; }

/** Changes concerning any of these entities, newest first. */
export function changesFor(entityIds: string[], o: { since?: string; limit?: number; minImportance?: number } = {}) {
  if (!entityIds.length) return [];
  const ids = [...new Set(entityIds)].slice(0, 900);
  const rows = all<any>(`SELECT DISTINCT f.* FROM change_feed f JOIN change_entities e ON e.change_key = f.key
    WHERE e.entity_id IN (${ids.map(() => '?').join(',')}) AND f.created_at > ? AND f.importance >= ? ORDER BY f.created_at DESC LIMIT ?`,
  ...ids, o.since || '', o.minImportance || 1, (o.limit || 50) * 3);
  return collapseGroups(rows.map(rowToChange)).slice(0, o.limit || 50);
}

export function recentChanges(o: { since?: string; kinds?: string[]; minImportance?: number; limit?: number } = {}) {
  const kinds = o.kinds?.length ? o.kinds : null;
  const rows = all<any>(`SELECT * FROM change_feed WHERE created_at > ? AND importance >= ? ${kinds ? `AND kind IN (${kinds.map(() => '?').join(',')})` : ''} ORDER BY created_at DESC LIMIT ?`,
    o.since || '', o.minImportance || 1, ...(kinds || []), (o.limit || 100) * 3);
  return collapseGroups(rows.map(rowToChange)).slice(0, o.limit || 100);
}

/** How many changes concern each entity set since a time (for "N updates" badges on notes). */
export function countChanges(entityIds: string[], since: string, minImportance = 4) {
  if (!entityIds.length) return 0;
  const ids = [...new Set(entityIds)].slice(0, 900);
  return get<any>(`SELECT COUNT(DISTINCT COALESCE(f.grp, f.key)) AS n FROM change_feed f JOIN change_entities e ON e.change_key = f.key
    WHERE e.entity_id IN (${ids.map(() => '?').join(',')}) AND f.created_at > ? AND f.importance >= ?`, ...ids, since, minImportance)?.n || 0;
}

/** Drop changes older than 120 days (alerts that point at them are dropped too). */
export function pruneChanges(days = 120) {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  run('DELETE FROM change_entities WHERE change_key IN (SELECT key FROM change_feed WHERE created_at < ?)', cutoff);
  run('DELETE FROM change_feed WHERE created_at < ?', cutoff);
}
setInterval(() => { try { pruneChanges(); } catch { /* next time */ } }, 24 * 3600_000).unref();

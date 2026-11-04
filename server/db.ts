// Private, per-user storage. SQLite (built into Node 24) with FTS5 for note search.
// Mirrors the private half of db/postgres-schema.sql.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.TERMINAL_DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'cache'), { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'terminal.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '', body_html TEXT NOT NULL DEFAULT '', body_text TEXT NOT NULL DEFAULT '',
  category TEXT, tags TEXT NOT NULL DEFAULT '[]', pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_user_idx ON notes(user_id, updated_at);
CREATE TABLE IF NOT EXISTS note_entities (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, entity_id TEXT NOT NULL,
  PRIMARY KEY (note_id, entity_id)
);
CREATE INDEX IF NOT EXISTS note_entities_entity_idx ON note_entities(entity_id);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(note_id UNINDEXED, title, body, tags);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, mime TEXT, size INTEGER, storage_key TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL, side TEXT NOT NULL, status TEXT NOT NULL, portfolio TEXT, thesis TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS positions_user_idx ON positions(user_id, entity_id);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, trade_date TEXT NOT NULL, price REAL NOT NULL, quantity REAL, fees REAL, note TEXT
);
CREATE TABLE IF NOT EXISTS catalysts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, event_entity_id TEXT, event_date TEXT, status TEXT NOT NULL DEFAULT 'pending',
  expected_outcome TEXT, scenarios TEXT, implications TEXT, thesis TEXT, post_analysis TEXT,
  entity_ids TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watchlists (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, entity_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS data_reports (
  id TEXT PRIMARY KEY, user_id TEXT, entity_id TEXT NOT NULL, field TEXT, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL
);
-- [[wikilinks]] between notes (target may not exist yet).
CREATE TABLE IF NOT EXISTS note_links (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, target_id TEXT NOT NULL,
  PRIMARY KEY (note_id, target_id)
);
CREATE INDEX IF NOT EXISTS note_links_target_idx ON note_links(target_id);
-- Obsidian vault connection, one per user.
CREATE TABLE IF NOT EXISTS vault_config (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vault_path TEXT NOT NULL, folder TEXT NOT NULL DEFAULT 'Terminal',
  auto_sync INTEGER NOT NULL DEFAULT 1, entity_pages INTEGER NOT NULL DEFAULT 1,
  app_url TEXT, last_sync TEXT, last_result TEXT
);
-- One row per note mirrored into the vault. hash = file content as last written/read;
-- note_rev = the note's updated_at at that moment. Lets us tell which side changed.
CREATE TABLE IF NOT EXISTS vault_files (
  user_id TEXT NOT NULL, note_id TEXT NOT NULL, rel_path TEXT NOT NULL,
  hash TEXT, note_rev TEXT, detached INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, note_id)
);
`);
// Set when a note was last changed from outside the app (Obsidian), so an open editor
// with an older copy can't silently overwrite it.
if (!(db.prepare('PRAGMA table_info(notes)').all() as any[]).some((c) => c.name === 'ext_updated_at')) db.exec('ALTER TABLE notes ADD COLUMN ext_updated_at TEXT');

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export function all<T = any>(sql: string, ...params: any[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function get<T = any>(sql: string, ...params: any[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: any[]) {
  return db.prepare(sql).run(...params);
}
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

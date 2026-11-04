-- Production target schema (PostgreSQL 16 + PostGIS). The MVP runs the same private
-- tables on SQLite (server/db.ts); public entities load from server/data at boot.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ───────────── Public knowledge graph ─────────────
CREATE TABLE sources (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  publisher   text,
  url         text,
  license     text
);

CREATE TABLE entities (
  id          text PRIMARY KEY,                 -- e.g. 'country:SAU'
  type        text NOT NULL,                    -- country|state|county|city|igo|person|party|company|commodity|industry|event|region
  name        text NOT NULL,
  aliases     text[] NOT NULL DEFAULT '{}',
  summary     text,
  parent_id   text REFERENCES entities(id),     -- administrative hierarchy
  iso3 text, iso2 text, ccn3 text, fips text,
  attrs       jsonb NOT NULL DEFAULT '{}',
  depth       text NOT NULL DEFAULT 'baseline', -- curated|baseline
  geom        geometry(MultiPolygon, 4326),     -- boundaries (optional)
  point       geometry(Point, 4326),            -- cities, HQs
  search_tsv  tsvector GENERATED ALWAYS AS (to_tsvector('simple', name || ' ' || array_to_string(aliases, ' '))) STORED,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entities_type_idx   ON entities(type);
CREATE INDEX entities_parent_idx ON entities(parent_id);
CREATE INDEX entities_tsv_idx    ON entities USING gin(search_tsv);
CREATE INDEX entities_trgm_idx   ON entities USING gin(name gin_trgm_ops);
CREATE INDEX entities_geom_idx   ON entities USING gist(geom);

-- Facts: every statistic with provenance; history = many rows per key.
CREATE TABLE facts (
  id          bigserial PRIMARY KEY,
  entity_id   text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  key         text NOT NULL,                    -- 'gdp_current_usd'
  value_num   double precision,
  value_text  text,
  unit        text,
  period      text,                             -- '2025', '2026-Q2'
  observed_at date,
  source_id   text NOT NULL REFERENCES sources(id),
  quality     text NOT NULL,                    -- live|delayed|official|estimate|historical|curated|manual
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  CHECK (value_num IS NOT NULL OR value_text IS NOT NULL)  -- missing data is absent, never 0
);
CREATE INDEX facts_entity_key_idx ON facts(entity_id, key, observed_at DESC);

CREATE TABLE relationships (
  id          bigserial PRIMARY KEY,
  from_id     text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id       text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type        text NOT NULL,                    -- member_of, head_of_government, exports, …
  role        text,
  rank        int,
  valid_from  date,
  valid_to    date,                             -- NULL = current
  source_id   text REFERENCES sources(id),
  note        text
);
CREATE INDEX rel_from_idx ON relationships(from_id, type);
CREATE INDEX rel_to_idx   ON relationships(to_id, type);

CREATE TABLE timeline_items (
  id bigserial PRIMARY KEY,
  entity_id text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  date date NOT NULL, title text NOT NULL, detail text, source_id text REFERENCES sources(id)
);

CREATE TABLE provider_cache (
  key text PRIMARY KEY, payload jsonb NOT NULL, fetched_at timestamptz NOT NULL, ttl_seconds int NOT NULL
);

-- ───────────── Private, per-user records ─────────────
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  password_hash text NOT NULL,                  -- scrypt; or delegate to an IdP
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '', body_html text NOT NULL DEFAULT '', body_text text NOT NULL DEFAULT '',
  category text, tags text[] NOT NULL DEFAULT '{}', pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body_text)) STORED
);
CREATE INDEX notes_user_idx ON notes(user_id, updated_at DESC);
CREATE INDEX notes_tsv_idx ON notes USING gin(tsv);
CREATE TABLE note_entities (
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE, entity_id text NOT NULL,
  PRIMARY KEY (note_id, entity_id)
);
CREATE INDEX note_entities_entity_idx ON note_entities(entity_id);
-- [[wikilinks]] between notes; target may not exist yet
CREATE TABLE note_links (
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE, target_id uuid NOT NULL,
  PRIMARY KEY (note_id, target_id)
);
CREATE INDEX note_links_target_idx ON note_links(target_id);
-- Obsidian vault sync is a local-desktop feature (see server/obsidian.ts); a hosted
-- deployment would instead expose notes through an Obsidian plugin talking to the API.
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id),
  filename text NOT NULL, mime text, size_bytes bigint, storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id text NOT NULL, side text NOT NULL CHECK (side IN ('long','short')),
  status text NOT NULL CHECK (status IN ('open','closed')), portfolio text, thesis text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('open','add','reduce','close')),
  trade_date date NOT NULL, price numeric NOT NULL, quantity numeric, fees numeric DEFAULT 0, note text
);
CREATE TABLE catalysts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL, event_entity_id text, event_date date, status text NOT NULL DEFAULT 'pending',
  expected_outcome text, scenarios text, implications text, thesis text, post_analysis text,
  entity_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, entity_ids text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, state jsonb NOT NULL
);
CREATE TABLE prefs (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data jsonb NOT NULL);
CREATE TABLE data_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id),
  entity_id text NOT NULL, field text, message text NOT NULL, status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

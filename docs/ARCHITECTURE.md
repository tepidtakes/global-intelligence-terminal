# Global Intelligence Terminal — Architecture

Status: Phase I (working MVP). Last revised 2026-11-03.

## 1. Shape of the system

```
Browser (React + MapLibre)                     Node server (Express, one process)
┌──────────────────────────────┐   /api/*     ┌────────────────────────────────────────────┐
│ TopNav + Global search (⌘K)  │ ───────────► │ Entity graph (public, read-only)           │
│ Map page: layers | map | pane│              │   baseline: all countries, US states,      │
│ Entity profile (one template)│              │   US counties  +  curated dataset          │
│ Research workspace (notes)   │              │ Search index (aliases, prefix, fuzzy)      │
│ Portfolio / Watchlists       │              │ Provider adapters + disk cache             │
│ Calendar + Catalyst tracker  │              │   World Bank · UN Comtrade · SEC EDGAR ·   │
│ Settings / Compare           │              │   US Treasury · Yahoo (delayed) · GDELT    │
└──────────────────────────────┘              │ Private store (SQLite, per user)           │
                                              │   users, sessions, notes(+FTS5), links,    │
                                              │   attachments, positions, transactions,    │
                                              │   catalysts, watchlists, views, prefs,     │
                                              │   data-quality reports                     │
                                              └────────────────────────────────────────────┘
```

* **Public data and private data never share a table.** Public entities/relationships are
  versioned with the codebase (`server/data/`) and enriched at runtime by providers.
  Everything a user writes lives in SQLite rows keyed by `user_id`.
* **One process in dev**: Express mounts Vite in middleware mode, so `npm run dev` serves
  both the API and the hot-reloading UI on one port.
* **Why SQLite instead of PostgreSQL/PostGIS for the MVP**: zero install on a desktop,
  built into Node 24 (`node:sqlite`), FTS5 full-text search included. The storage layer is
  a thin module (`server/db.ts`); `db/postgres-schema.sql` is the production target with
  PostGIS geometry and the same tables. Geometry today ships as static TopoJSON
  (`world-atlas`, `us-atlas`), which MapLibre renders client-side.

## 2. Core entity schema

Everything is an **Entity** joined by typed **Relationships**. Profiles, search, the map,
notes and positions all speak entity IDs, so a new entity type needs data, not new plumbing.

```ts
Entity {
  id: "country:SAU" | "state:US-PA" | "county:42101" | "city:philadelphia" | "igo:nato"
      | "person:josh-shapiro" | "party:us-democratic" | "company:aapl"
      | "commodity:crude-oil" | "industry:semiconductors" | "event:us-midterms-2026"
  type, name, aliases[], summary, parentId          // parentId = administrative hierarchy
  iso3/iso2/ccn3/fips, coords [lon,lat], flag        // geographic keys
  facts: Fact[]                                      // every statistic carries provenance
  attrs: {...}                                       // type-specific (ticker, dates, …)
  timeline: TimelineItem[]
  depth: "curated" | "baseline"                      // how much we know
}
Fact { label, value, unit, period, asOf, sourceId, quality }
  quality ∈ live | delayed | official | estimate | historical | curated | manual
Relationship { from, to, type, role?, rank?, validFrom?, validTo?, sourceId, note? }
Source { id, name, publisher, url, license }
```

Relationship types (each has a forward and an inverse label, so every link is navigable
both ways): `member_of`, `head_of_state`, `head_of_government`, `holds_office`, `leads`,
`belongs_to_party`, `party_in`, `governing_party`, `located_in`, `capital_of`,
`headquartered_in`, `operates_in`, `produces`, `exports`, `imports`, `trade_partner`,
`subsidiary_of`, `competitor_of`, `in_industry`, `affects`, `uses`.
`validFrom/validTo` give historical validity (e.g. NATO accession years drive the
"membership as of year" slider). Nothing assumes one country per company or one territory
per faction.

Private records: `notes` (+ `note_entities` many-to-many, `note_links` for note→note
[[wikilinks]], `notes_fts`), `attachments`, `positions` (+ `transactions`), `catalysts`,
`watchlists`, `saved_views`, `prefs`, `data_reports`, `vault_config` + `vault_files`
(Obsidian sync state). See `db/postgres-schema.sql`.

### Notes and Obsidian

Note bodies are stored as HTML (Tiptap). Links are ordinary `<a href>`s:
`/entity/<id>` (mention; links the note to that profile), `/research/<note id>`
(wikilink), `/research/new?title=X` (wikilink to a note that doesn't exist yet — following
it creates the note, and saving a note with that title re-points the link).

`server/obsidian.ts` mirrors notes into `<vault>/<folder>/Notes/*.md`:

* **Format** — YAML properties (`terminal_id`, `tags`, `category`, `pinned`, `entities`,
  `attachments`, `created`, `updated`, `terminal_url`; unknown keys you add are kept) +
  Markdown body via turndown/GFM; links become `[[Terminal/Entities/Saudi Arabia|Saudi
  Arabia]]` / `[[Terminal/Notes/Title|label]]`. Import uses marked (GFM, single newline =
  line break, as Obsidian does); `[[name]]`, `[[path|alias]]`, `[[note#heading]]` resolve
  to notes or entities; checklists, tables and callouts round-trip; embeds (`![[x]]`) and
  code are left alone. `npm run check:obsidian` exercises all of this.
* **Change detection** — `vault_files` keeps, per note, the file path, the hash of the
  file as last written/read and the note's `updated_at` at that moment. Each sync: follow
  files renamed/moved in Obsidian by `terminal_id`; file changed only → import; note
  changed only → export (renaming the file if the title changed); both → keep both (the
  Obsidian version becomes an "(Obsidian copy …)" note); note deleted here → file moved
  to the vault's `.trash`; file deleted in Obsidian → note kept and no longer mirrored
  ("Send to Obsidian" restores it); new files in the folder → new notes, stamped with an
  id (only their properties are touched).
* **When** — 1.5 s after a change in the app, every 10 s for edits in Obsidian, or on
  demand. An open editor polls for imported changes; a save based on a copy older than an
  Obsidian edit gets HTTP 409 and the user chooses which version to keep.
* **Windows** — file names avoid reserved device names and `<>:"/\|?*` (plus `#^[]`,
  which break Obsidian links); collisions are compared case-insensitively; paths stay
  under 260 characters; writes go temp-file → rename with retries on EPERM/EBUSY (Obsidian,
  OneDrive and antivirus briefly lock files); BOMs and CRLF line endings are accepted;
  pasted paths may carry quotes, `%USERPROFILE%` or forward slashes. Vaults are discovered
  from Obsidian's own `%APPDATA%\obsidian\obsidian.json` (macOS/Linux equivalents) and by
  scanning Documents / OneDrive for `.obsidian` folders.
* **Safety** — vault routes only answer requests from the same machine (loopback) unless
  `TERMINAL_ALLOW_VAULT=1`; every write is checked to stay inside the vault folder;
  nothing outside `<folder>` is read or written except moving a deleted note's own file to
  `.trash`.

## 3. Data requirements and provenance

| Data | Provider | Freshness / cache | Quality label |
|---|---|---|---|
| Country basics (names, ISO codes, capital, languages, currency, borders) | `world-countries` (mledoze, ODbL) | static | official |
| Boundaries | Natural Earth via `world-atlas` / US Census via `us-atlas` | static | official |
| Macro indicators (GDP, PPP, growth, inflation, unemployment, debt, trade, FDI…) | World Bank WDI API (CC BY 4.0) | 24 h | official, with observation year |
| Income groups, regions | World Bank country API | 7 d | official |
| Exports/imports by HS chapter | UN Comtrade public preview API | 7 d | official |
| US Treasury yield curve | U.S. Treasury daily par yield curve | 6 h | official |
| Company fundamentals (US filers) | SEC EDGAR XBRL company facts | 24 h | official |
| Equity, futures quotes and price history | Yahoo Finance chart endpoint | 5 min | **delayed** (personal research use; swap for a licensed feed in production) |
| News headlines | GDELT DOC 2.0 API | 2 h, throttled 1 req / 6 s | third-party, links to original |
| Exports/imports of one product by every country (≈50 HS codes, `shared/products.ts`) | UN Comtrade public preview API (all reporters, partner = world) | 7 d | official |
| FX (≈150 currencies vs USD) and ≈45 commodity futures | Yahoo spark endpoint (≤20 symbols/call) | 15 min | **delayed**; quotes >10 days old show price + date only |
| Central-bank policy rates | BIS WS_CBPOL (≈40 banks; ECB applied to euro members) | 6 h | official |
| 10-year government yields (monthly) | OECD MEI via FRED `IRLTLT01xxM156N` | 24 h | official |
| Daily yield curves | US Treasury · ECB AAA curve · Bank of England zero-coupon · Japan MOF · Bank of Canada Valet | 6 h | official |
| Macro projections | IMF WEO via DataMapper | 24 h | forecast |
| US policy expectations | FOMC SEP medians via FRED; fed funds futures (ZQ, 100 − price) | 24 h / 15 min | forecast / delayed |
| Analyst consensus (targets, ratings, EPS & revenue estimates, revisions) | Yahoo quoteSummary (cookie + crumb session) | 6 h | estimate |
| Members of Congress | unitedstates/congress-legislators | 24 h | official |
| Heads of state/government, US governors, their parties | Wikidata SPARQL | 24 h | community |
| Ongoing armed conflicts (intensity, locations, deaths by year) | Wikipedia “List of ongoing armed conflicts” (cites ACLED/UCDP) | 12 h | community / estimate |
| National elections, this year and next | Wikipedia “<year> national electoral calendar” | 12 h | community |
| Leaders, parties, memberships, company/commodity relationships, events | Curated in `server/data/curated.ts`, each item cites an official source | as-of date shown | curated |

**Live graph additions** (`server/augment.ts`, at boot and every 12 h): Congress members,
Wikidata leaders and governors, conflicts and elections are inserted as entities and
relationships tagged with an `origin`, so each refresh replaces its previous batch
(`graph.setLiveRels`). Live people are matched to curated ones by name and Wikidata
aliases. Reconciliation with the curated (June 2026) leaders: same person → link only;
Wikidata successor who took office after June 2026 → the curated term gets an inferred end
date, the person a `staleNote`, other curated ministers of that country a warning;
any other disagreement, or several open-ended holders on Wikidata → a "verify" note on the
country (`attrs.leaderNotes`). Nothing is resolved silently.

**Map color rules** (`src/map/layers.ts`): each layer declares `better` (ranked, green =
better end), `signed` (centred on zero), `target` (bands around ~2% for inflation),
`magnitude` (one themed hue) or `categories`. The green/red scale has unequal lightness on
its two arms so it passes the CVD check (`dataviz` validator: deutan/protan ΔE ≥ 8);
“no data” is a separate gray, distinct from the cream “little change” midpoint.

Rules enforced in code: missing values render as "—  no data" never 0; every number shows
its unit, period and source; quotes show their timestamp; nothing is fabricated — when a
provider is down the UI says so. Users can file a correction from any fact
(`data_reports` table).

## 4. Major UI components

* `TopNav` — global search, Map, Research, Watchlists, Portfolio, Calendar, Settings, theme.
* `GlobalSearch` — ⌘K / Ctrl-K / `/`, keyboard navigable, typed results with preview and
  position badge; searches entities and the user's notes.
* `MarketsPage` (commodities, currencies, rates & yield curves) and `ConflictsPage`.
* Profile sections in `profile/LiveSections.tsx`: currency, rates & curve, IMF/Fed outlook,
  armed conflicts, analyst consensus, top exporters/importers of a commodity.
* `MapPage` = `LayerPanel` (tabs Layers / Places / Saved: active-layer card with options,
  layer search, themed collapsible groups with color previews, map-display options;
  geographic navigator and watchlists; saved views) + `WorldMap` (MapLibre; countries → US
  states → US counties → cities by zoom) + `PreviewPane` (selected entity).
* `EntityProfile` — one template, sections chosen by entity type: Overview, Government &
  Politics, Macroeconomics (+ yield curve), Industry & Companies, Trade, Market data,
  Members, Biography, Relationships, Timeline, Events & catalysts, News, Research notes,
  Sources.
* `NoteEditor` (TipTap rich text: headings, lists, checklists, tables, links, `[[`
  autocomplete for notes and entities, autosave, tags, pin, attachments; sidebar with
  backlinks / outgoing links / unlinked mentions, local graph and Obsidian status),
  `NoteGraph` (force-directed graph of notes and entities; pan, zoom, drag, hover),
  `ResearchPage` (list or graph, daily note, sync status), `PortfolioPage`, `PositionCard`,
  `CalendarPage` + `CatalystEditor`, `ComparePage`, `LineChart`, `YieldCurve`, `BarList`.

## 5. Implementation sequence

Phase I (this build)
1. Shared types + relationship vocabulary.
2. Server: SQLite schema, auth (scrypt + httpOnly session cookie), entity graph loader
   (baseline + curated), search index.
3. Provider adapters with disk cache: World Bank, Comtrade, SEC, Treasury, Yahoo, GDELT.
4. Map with drill-down, choropleth + categorical layers, IGO highlighting, hover/click.
5. Universal profile + preview, relationships, sources.
6. Notes (multi-entity), positions, watchlists, catalysts, calendar.
7. Acceptance journeys 1–6 verified in a browser.

Phase II — more countries' curated politics, admin-1 for more countries, more time
series, sovereign curves beyond the US (licensed), richer filings, watchlist dashboards,
advanced search filters. Phase III — comparison analytics, historical boundaries,
network graph view, supply-chain dependency analysis, portfolio political-risk exposure,
scenario analysis, grounded research assistant.

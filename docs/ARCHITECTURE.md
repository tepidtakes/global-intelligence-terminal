# Global Intelligence Terminal — Architecture

Status: Phase I (working MVP). Last revised 2026-11-05.

## 0. The knowledge web — the core idea

Everything in the terminal is one connected graph: **entities** (countries, organizations,
institutions, companies, people, parties, cities, commodities, events) joined by **links**
(member of, leads, central bank of, headquartered in, owns, trades with, sanctions, in the news
with…). Pages, map layers, alerts and the calendar are views of that graph, not separate
datasets. Three rules keep it current and trustworthy:

1. **As little as possible is written in code.** Structure comes from live sources through
   *connectors*; hand-entered data is a thin, dated overlay that the live data checks.
2. **Every link says where it came from.** A link carries its source, retrieval time, and —
   where it has one — a size (trade value, stories in common, listings) and a period.
3. **Sources are compared, not overwritten.** When a live source reports a link that already
   exists, the link is marked *confirmed by a second source* (✓); when it disagrees (e.g. says
   a membership is still current), the link is marked *disputed* (⚠) and listed in the audit.

```
 connectors (server/web/connectors.ts) ──► graph (server/graph.ts) ──► views
   Wikidata: countries, organizations,       entities + links            profiles: Connections card
     memberships, central banks, cities,      with value/period/data,     /web: network view
     companies, executives                    sources, ✓ / ⚠             map: "where it is connected"
   UN Comtrade: trade web                    identity by Wikidata id      calendar importance
   OFAC/EU/UK/UN: sanctions web              (attrs.wikidata), names in   alerts (change feed)
   Trusted news: co-mentions (30 min)        11 languages for matching    search (notability-ranked)
   World Bank/IMF: catalogs, GDP weights
```

**Identity.** Records from different sources are joined by Wikidata id first, then by
exact name, ticker or country code. Live leaders, mayors, organizations, central banks,
cities and companies all carry `attrs.wikidata`, so a company's chief executive, the city of
its head office and the organization it belongs to are the same nodes everywhere.

**Discovery instead of lists.** Organizations are not listed in code: every organization
that three or more countries belong to (per Wikidata) becomes a node with its members, join
and leave dates, seat and leader. Companies are every listed company known in 25+ Wikipedia
languages (configurable), with tickers mapped to live quotes. Which economies' trade is
loaded is decided by GDP. Indicators come from the providers' own catalogs (~1,700 series).

**Computed weights.** How much an economy matters (calendar importance, node size) is its
share of world GDP (IMF WEO; World Bank as fallback); an organization's is its members'
combined share — replacing a hand-set table.

| Module | What it does |
|---|---|
| `server/graph.ts` | Entities, links (with data, sources, ✓/⚠), Wikidata-id index, member sets, search |
| `server/web/connectors.ts` | Connector registry: schedules, isolation of failures, status for the Data page |
| `server/web/wikidata.ts` | Countries, organizations + memberships, central banks + governors, cities, companies + executives |
| `server/web/links.ts` | Trade web (Comtrade), sanctions web, news co-mentions, World Bank country names |
| `server/web/weights.ts` | GDP shares → economy and organization weights |
| `server/web/catalog.ts` | World Bank and IMF indicator catalogs, search |
| `server/web/connections.ts` | Connections of an entity (grouped, ranked), neighborhood network, map layer, statistics |

**Still entered by hand, and why.** Facts no open source publishes in machine-readable form
(central-bank meeting dates, summit dates, editorial trust tiers for news outlets, which end
of a featured map layer is "better"), vendor conventions (Yahoo Finance symbol suffixes), and
the June 2026 verified overlay in `server/data/curated.ts`. Each is dated, and the audit warns
when live data disagrees with it or a schedule runs out.

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

### Change feed, calendars and economic-security modules

```
 live loaders ──► recordChange / emitNew (server/changes.ts, SQLite change_feed)
 (news, leaders,        │  first run of each producer = silent baseline
  elections, markets,   ▼
  calendar, sanctions,  onChange ──► alert rules (server/alerts.ts) ──► inbox · browser
  tariffs, budgets)                    entities, watchlists, notes,      notifications ·
                                       positions, places (+inside)       webhooks (outbox)
```

| Module | What it does |
|---|---|
| `server/changes.ts` | One feed of "what changed", with importance 1–10, sources and entities; `emitNew` turns snapshots into changes after a silent first run |
| `server/alerts.ts` | Alert rules, matching, inbox, webhook outbox (allow-listed hosts), map counts, "add to note" |
| `server/marketWatch.ts` | Price, FX and 10-year-yield moves past fixed buckets; BIS policy-rate changes |
| `server/econCalendar.ts` | Release, central-bank, IGO, budget and election events; importance grading; results from FRED, Eurostat, BIS; schedule-expiry audit |
| `server/sanctions.ts` | OFAC, UN, EU and UK lists → country aggregates, regimes, name matching, map tiers, new-designation changes |
| `server/tariffs.ts` | Federal Register tariff actions; Census duties by country (effective rate, change); tariff changes |
| `server/budgets.ts` | Fiscal years; IMF general-government table (Fiscal Monitor codes found by label); Eurostat COFOG; US Treasury live figures |
| `server/reserves.ts` | Zip/CSV streaming for JODI oil and USDA grain files; EIA SPR; AGSI+ gas; strategic-reserve notes |
| `server/tradeExplorer.ts` | All partners of a country and one pair from UN Comtrade (both sides' reports), with tariffs, sanctions and shared memberships |

Each module keeps its parsed data in the provider cache, exposes a status for the Data page,
and is covered by `npm run check:econ` on sample files in `scripts/fixtures/`.

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
`subsidiary_of`, `competitor_of`, `in_industry`, `affects`, `uses`, `fights_in` (country or
armed group → war; `role` = "Side A/B/C", `note` = supporting / former / dates).
Entity type `group` = non-state armed group or force (created from war infoboxes).
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
| News headlines (per-entity search) | Google News RSS, GDELT DOC 2.0 fallback | 1–2 h, GDELT throttled 1 req / 6 s | each headline labelled with its outlet's tier |
| Trusted news feeds (newsroom, entity news, signals, "In the news" layer) | 27 feeds: publisher RSS (BBC, Guardian, NYT, NPR, DW, France 24, Al Jazeera, CNBC, CBC, ABC AU), official sources (Fed, ECB, BoE, IMF, UN, SEC, WTO) and wire headlines via Google News site searches (Reuters, AP, Bloomberg, FT, WSJ) | 30 min; kept 14 days in `data/news/store.json` | outlet tier; signals → **reported** |
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

**Wars and sides** (`server/worldEvents.ts`, `loadWarSides` in `server/augment.ts`): each row
of the ongoing-conflicts list keeps every article linked in its tree (`theatreLinks`). Up to
30 per row (shallowest first) are fetched 20-per-request via `action=query&prop=revisions`
through a single rate-limited queue (750 ms gap, back-off on 429/5xx/network errors), and the
"Infobox military conflict" is found inline, as `{{#invoke:Infobox military conflict}}`, or
in a separate `{{<war> infobox}}` template. `combatant1..3` (+ `1a/1b…`) are parsed into
participants: tree-list depth (allies nested under coalitions), role (main / supporting /
labelled group such as "Attacked by Israel"), former (from "until…" or ended year ranges),
notes; flags, `{{#invoke:flag}}`, ISO/IOC country-code templates and links are resolved to
countries, everything else to `group:` entities. The row's own article gives the umbrella's
sides; other linked articles whose infobox is ongoing become `kind: 'theatre'` events with
`parentId` = the row and its intensity. Sides are stored on the event (`attrs.sides`) and as
`fights_in` relationships. Derived views: interstate wars (≥ 2 sides with a state found only on
that side), long-running flag (> 15 years, whole-history article), map layers
`conflicts:parties` and `war:<id>`. The parsed batch is cached 24 h; `npm run check:live`
re-parses the major wars and fails on unparsed markup.

**Live graph additions** (`server/augment.ts`, at boot and every 12 h): Congress members,
Wikidata leaders and governors, conflicts and elections are inserted as entities and
relationships tagged with an `origin`, so each refresh replaces its previous batch
(`graph.setLiveRels`). Live people are matched to curated ones by name and Wikidata
aliases. Reconciliation with the curated (June 2026) leaders: same person → link only;
Wikidata successor who took office after June 2026 → the curated term gets an inferred end
date, the person a `staleNote`, other curated ministers of that country a warning;
any other disagreement, or several open-ended holders on Wikidata → a "verify" note on the
country (`attrs.leaderNotes`). Nothing is resolved silently.

**Trusted newsroom** (`server/newsroom.ts`, pure helpers in `server/newsParse.ts`, outlet
registry in `shared/newsSources.ts`). Every 30 minutes the feeds above are fetched (4 at a
time), parsed (RSS 2.0, Atom, RSS 1.0/RDF), normalised (canonical URL without tracking
parameters, publisher suffix stripped) and stored once per URL. Headlines from different
outlets that share most content words within 72 h join one *story* (cluster); a story's
corroboration is the number of distinct trusted outlets in it. Each headline is tagged with
the entities it names: countries (names, aliases, independent-state demonyms, capitals used
as shorthand such as "Beijing"), US states, IGOs, companies, parties, people (full names;
sitting heads of state/government also by surname), and commodities. Names that are also
ordinary words (Apple, Shell, Labour, gold) need business, political or market context;
names shared by several entities (Georgia, Congo, CPC) are resolved by the other names in
the headline or skipped; longest match wins (New Mexico ≠ Mexico). Outlet tiers: official ·
wire · public broadcaster · major outlet · specialist · state media · unrated — "trusted" =
the first five.

*Signals.* Trusted headlines are scanned for appointments ("Apple names John Ternus as CEO",
"X sworn in as prime minister"), departures ("Shell CEO X to step down") and election wins.
The target is the single company (CEO/chair) or country (head of state/government, finance
minister, elections) named in the headline; otherwise nothing is extracted. Each signal is
compared with current officeholders (curated and Wikidata). When it is corroborated (≥ 2
trusted outlets) or official and differs from the record, the target gets a `reported` fact
(`sourceId: trusted-news`), the current holder gets `attrs.newsNote`, and recent elections in
that country get `attrs.reportedOutcome`. Relationships are never closed or rewritten from
headlines; single-source signals are listed but flag nothing. Signals are kept 120 days.
`npm run check:news` exercises all of this offline against `scripts/fixtures/news`.

**Provenance and consistency** (`server/cache.ts`, `server/consistency.ts`). The cache records
per-provider health (last success, last error, serves of a stale copy), and each background
loader reports when its data was downloaded and whether it ran on a stale copy. Live facts
carry `retrievedAt`. Events past their date stop saying "scheduled" (`normalizeEventStatus`).
The audit checks unknown/missing sources, unknown quality labels, dangling relationships,
reversed terms, conflicting fact values, duplicate people, past events still scheduled,
competing officeholders and news that contradicts a record. It feeds the Data page
(`/api/provenance/status`, `/api/quality/report`), each profile's Data quality card
(`provenance` on `/api/entity/:id`) and `npm run check:data`, which fails on errors.

**Elections** (`server/elections.ts`, parsers in `server/electionParse.ts`). Election events
get a Wikipedia article (calendar link, curated mapping, or discovered local race). Articles
are fetched 50 at a time through the MediaWiki query API (normalisation and redirects
followed) and their `{{Infobox election}}` parsed: numbered `candidateN/leaderN/nomineeN`,
`partyN`, `popular_voteN`, `percentageN`, `seats(_after)N`, round data `kdataN`, dates,
`ongoing`, `before_/after_election`, `opinion_polls`. `electionOutcome` derives status
(scheduled / counting / completed) — the winner only from `after_election`, placeholders
ignored. Results become community facts with `retrievedAt`; candidates become `candidate_in`
relationships (origin `election-candidates`). Elections within −10…+2 days are re-read every
30 min. Local races: titles `<year> <State> gubernatorial election`, `<year> United States
Senate (special) election in <State>`, `<year> <City> mayoral|municipal election`, for the
previous, current and next year. Candidate policies (on request, cached 7 days): party
`{{Infobox political party}}` ideology/position; "Political positions of X" intro via
TextExtracts, else the candidate article's positions section via `action=parse`.

**Prediction markets** (`server/predictionMarkets.ts`). Polymarket Gamma events (tags
elections / world-elections / us-elections) and Kalshi events (category Elections/Politics),
cached 15 min, normalised to outcomes with a probability (bid/ask mid when the spread is
≤ 10¢, else last trade). `scoreMarket` requires the election's place (tagger; city by name;
US-wide House/Senate contests), compatible office class, no conflicting year, and a close
date from 15 days before to 200 days after the vote; outcomes map to contenders by surname
or party core name. Per-candidate probabilities are volume-weighted across platforms.

**Local politics** (`server/localPolitics.ts`). Wikidata P6 (head of government) of capitals
(P36), US cities (Q1093829, population ≥ 250k) and curated cities (label + country), with
P1313 office label, P625 coordinates, P1082 population and US state via P131. New cities are
baseline `city:wd-…` entities under their state/country; `capital_of` links are added. Curated
mayors reconcile like national leaders (`VERIFIED_THROUGH`).

**Rates resolver** (`tenYearBoard` in `server/markets.ts`): daily curve 10-year points (US,
CAN, JPN, GBR par) > ECB IRS monthly > OECD monthly; `stale` by age. Used by the
`bond10y` layer, `/rates/overview` and `/rates/:iso3` (`tenLatest`). The BoE curve now
requests par (`IUD*NPY`) and zero-coupon (`IUD*NZC`) series and reads columns by code.

**Performance.** The front end is split per page (`React.lazy`) with long-lived vendor chunks
(react, maplibre, geo, editor); a profile needs ~100 KB of compressed JS, the map ~580 KB, and
the map and profile chunks are prefetched in idle time after load (not on data-saver/2G). The
server gzips responses (`compression`) and serves hashed assets as immutable for a year
(`index.html` is `no-cache`). `cached()` reads disk copies asynchronously and, for page-driven
provider data (prefix table `GRACE` in `server/cache.ts`), returns an expired copy within a short
grace window at once while refreshing in the background — with its real retrieval time; the
background loaders (Congress, Wikidata, Wikipedia, news) always wait for fresh data. Start-up
warms the default map layer, preview indicators, rates and market boards. The graph keeps a
by-type index and a cached person-name index (the old per-call rebuild made the live loaders
quadratic). `/rates/:iso3` uses `tenYearFor` (that country's sources only). Client `useApi`
shares in-flight requests and keeps a bounded cache; open notes poll a tiny change-stamp
endpoint, and only when an Obsidian vault is connected.

**Screen sizes.** Layout tracks use `minmax(0, 1fr)` so wide content scrolls inside its card
instead of stretching the page. Breakpoints: ≤ 900 px nav in a ☰ menu; ≤ 760 px phone layout
(map full-width, layers as a drawer, selected place as a bottom sheet, single-column facts,
scrollable tabs and tables); ≥ 1700 px and ≥ 2200 px wider pages, side panels and slightly larger
text; coarse pointers get 36 px tap targets.

**Map color rules** (`src/map/layers.ts`): each layer declares `better` (ranked, green =
better end), `signed` (centred on zero), `target` (bands around ~2% for inflation),
`magnitude` (one themed hue) or `categories`. The green/red scale has unequal lightness on
its two arms so it passes the CVD check (`dataviz` validator: deutan/protan ΔE ≥ 8);
“no data” is a separate gray, distinct from the cream “little change” midpoint.

Rules enforced in code: missing values render as "—  no data" never 0; every number shows
its unit, period and source; quotes show their timestamp; nothing is fabricated — when a
provider is down the UI says so. Users can file a correction from any fact
(`data_reports` table).

### Network gate

Every outbound request (`fetchJson`/`fetchText` in `server/cache.ts`, Wikidata SPARQL, the JODI and USDA downloads, the Yahoo session) goes through `netFetch` in `server/net.ts`, which keeps one gate per host:

- **Limits.** At most N requests in flight and a minimum gap between starts, however many loaders run at once: Wikidata 1 at a time, 400 ms apart; UN Comtrade 1, 1.2 s apart; the SEC 4, 110 ms apart; Google News 2, 300 ms apart; otherwise 6 and no gap. A freed slot goes straight to the next waiting request, so the limit is never exceeded.
- **Retries.** 429, 502, 503, 504 and dropped connections are retried twice, honouring `Retry-After`, else with exponential backoff and jitter. A `Retry-After` over a minute is not waited out inside the request: the caller gets the answer and the host is skipped until then. Timeouts, refused connections and unknown host names are not retried.
- **Circuit breaker.** After five failures in a row (5xx, timeouts, network errors; never 4xx) the host is skipped for a minute and requests fail at once, with the reason. Requests already waiting for a slot check again before they are sent. Then one trial request decides: success closes the breaker; failure skips the host for twice as long (up to 15 minutes).
- **Health.** `hostHealth()` (state, load, requests, average latency, retries, skips, last error) is in `/api/provenance/status`, `/api/net/hosts` and the Data page's *Network* card.

### Cross-source agreement

The World Bank and the IMF publish the same headline figures. The `cross-source-checks` connector (`server/agreement.ts`, daily) compares, for every country, the World Bank's latest figure with the IMF's for the same year:

| Figure | World Bank | IMF | Tolerance |
|---|---|---|---|
| GDP, current US$ | NY.GDP.MKTP.CD | NGDPD | 3% |
| Real GDP growth | NY.GDP.MKTP.KD.ZG | NGDP_RPCH | 0.5 points |
| Inflation, consumer prices | FP.CPI.TOTL.ZG | PCPIPCH | 0.5 points |
| Unemployment | SL.UEM.TOTL.ZS | LUR | 1 point |
| Current account, % of GDP | BN.CAB.XOKA.GD.ZS | BCA_NGDPD | 1 point |
| Population | SP.POP.TOTL | LP | 2% |

Levels are compared by their difference as a share of the mean of the two figures; rates by percentage points, or 5% of the figure when that is more (very high inflation). Within the tolerance the figures agree, up to three times it they differ, beyond that they conflict. The current year (IMF projections), figures older than six years and aggregates such as the world are skipped. Conflicts go to the consistency audit (category `source-figures-conflict`; unemployment as information only, since the World Bank uses ILO modelled estimates and the IMF national definitions), to the change feed once per country, figure and year, to the Data page's *Cross-source checks* card and to the *Cross-checked figures* card on country profiles. API: `/api/quality/agreement`, `/api/quality/agreement/:iso3`.

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

# Global Intelligence Terminal

A map-first research terminal for geography, geopolitics, economies, markets, companies,
commodities and people — with private notes, positions and catalyst forecasts linked to
every entity. Phase I (working MVP).

- **[Where the data comes from and how it updates](DATA_SOURCES.md)** — plain-language guide.
- **[Security and hosting](SECURITY.md)** — read before running it anywhere but your own computer.

> **Disclaimer.** This is a research tool, not investment, legal or political advice. Data
> comes from third parties, can be delayed, incomplete or wrong, and some of it is
> community-maintained (Wikipedia, Wikidata). Market data from Yahoo Finance and headlines
> from Google News are for personal, non-commercial use under those services' terms — you
> are responsible for complying with each provider's terms where you run it.

**Licence:** [MIT](LICENSE), covering the source code and the hand-compiled dataset in
`server/data/curated.ts`. It does not cover data fetched at runtime from third parties
(World Bank, IMF, UN Comtrade, Yahoo Finance, Wikipedia, Wikidata and others), which stays
under each provider's own terms — see [DATA_SOURCES.md](DATA_SOURCES.md). Dependencies keep
their own licences.

## Getting started (no coding needed)

The terminal runs on your own computer and opens in your web browser. Setup takes about
five minutes, once.

1. **Install Node.js 24 or newer** from <https://nodejs.org> (the "LTS" download; accept the
   defaults). Close any terminal windows you already had open so they pick it up.
2. **Download this project:** on this page click the green **Code** button → **Download ZIP**,
   then unzip it somewhere easy to find (e.g. your Documents folder). Unzipping can create a
   folder inside a folder — the right one is the folder that contains `package.json` and
   `README.md`.
3. **Open a terminal in that folder:**
   - Windows: open that folder in File Explorer, click the address bar, type `cmd` and press
     Enter. (Use `cmd`, not PowerShell — PowerShell blocks `npm` on a fresh Windows setup
     with a "running scripts is disabled" error.) The window should show the folder's path,
     e.g. `C:\Users\you\Documents\global-intelligence-terminal-main>`.
   - macOS: right-click the folder in Finder → **New Terminal at Folder** (or open Terminal and
     type `cd ` then drag the folder into the window and press Enter).
4. **Install and start it** — type these two lines, pressing Enter after each:

   ```bash
   npm install
   npm run dev
   ```

5. **Open <http://localhost:5180>** in your browser. Keep the terminal window open while you
   use it; close it (or press Ctrl+C) to stop.

**If something goes wrong:** "running scripts is disabled" → you are in PowerShell; use `cmd`
as in step 3 (or type `npm.cmd` instead of `npm`). "Could not read package.json" / "ENOENT" →
the terminal is not in the project folder; redo step 3 from the folder that contains
`package.json`. "'npm' is not recognized" → Node.js is not installed yet, or the terminal was
opened before installing it — close it and open a new one.

Next time, only steps 3, the second line of 4 (`npm run dev`) and 5 are needed. To update,
download the ZIP again and copy your old `data` folder into the new one to keep your notes.

## Run it (developers)

Requires Node 24+ (uses the built-in `node:sqlite`). `npm install` then `npm run dev`, and
open http://localhost:5180. Public data works signed out; create an account (Sign in →
Create account) for notes, positions, watchlists, saved views and catalysts. Accounts and
everything you write stay in `data/` on your computer. (`seed/test-account.example.json`
is a throwaway login used for local testing — not a real credential.)

Production: `npm run build` then `npm start` (serves `dist/` from the same server).

Optional settings (environment variables): `CONTACT_EMAIL` (sent to SEC/Wikipedia/Wikidata,
which ask API users for one), `ALLOW_SIGNUP=0`, `HOST`, `PORT`, `TERMINAL_VAULT`. The
server listens on this computer only unless you change `HOST` — see [SECURITY.md](SECURITY.md).

Checks: `npm run check:obsidian` · `npm run check:tickers` · `npm run check:live` ·
`npm run check:news` (news parsing, tagging and signals, offline) · `npm run check:data`
(consistency audit of the built-in dataset, offline; fails on errors) · `npm run check:parsers`
(rates, election, prediction-market and mayor parsers on fixtures, offline).

## What's in it

- **Map** (MapLibre GL): 241 country shapes → 56 US states/territories (zoom ≥ 3) → 3,231
  US counties (zoom ≥ 5) → curated cities. Hover previews, click to select, breadcrumbs,
  fly-to, returns to your last position.
- **Map sidebar**: tabs for Layers / Places / Saved; a card for the active layer with its
  options; layer search ("inflation", "oil", "war"); nine themed groups (politics,
  conflict, economy, public finances, IMF forecasts, trade, markets & rates, portfolio,
  historical); a color preview on every layer.
- **Colors mean something**: better/worse layers share one scale — green = better, red =
  worse, cream = little change, gray = no data. Size-only layers (population, GDP, trade
  flows) use one themed hue (energy amber, metals steel, farm goods olive…). Conflicts use
  reds by deadliness; elections amber by how soon. The green/red ends differ in lightness
  as well as hue so they stay readable with red–green color blindness (validated).
- **Overlays**: armed conflicts, elections (next 12 months), government type, IGO
  membership by year; GDP per capita, GDP, growth, inflation (distance from ~2%),
  unemployment, income group, population; debt and budget balance; IMF forecasts of
  growth, inflation, unemployment and debt (this year / next); who exports or imports any
  of ~50 products (oil, LNG, chips, wheat, lithium…), commodity producers, current account;
  currency vs the dollar (1M / YTD / 1Y / 5Y), central-bank policy rates, 10-year bond
  yields, lending rates, market depth, FDI; your exposure; Cold War "Three Worlds".
- **One profile template** for 12 entity types (country, state, county, city, region,
  IGO, person, party, company, commodity, industry, event) with facts, relationships
  (bidirectional), timeline, events, news, your notes and sources.
- **Live data with provenance** (each shows source, period and retrieval time; missing
  values show "no data", never 0):
  World Bank WDI (macro, every country) · UN Comtrade (exports/imports by product and
  partner) · US Treasury (par yield curve) · SEC EDGAR (US and 20-F filer financials) ·
  Yahoo Finance chart endpoint (delayed quotes, futures, dividends) · Google News RSS /
  GDELT (headlines linking to publishers).
  Plus: BIS central-bank policy rates · 10-year government yields (one figure everywhere:
  daily closes for the US, Canada, Japan and UK; ECB monthly for EU members; OECD monthly via
  FRED elsewhere; out-of-date values flagged, not shown as current) · daily government
  yield curves for the US (Treasury), euro area (ECB AAA curve), UK (Bank of England),
  Japan (MOF) and Canada (Bank of Canada) · IMF World Economic Outlook projections · FOMC
  median projections and fed-funds-futures-implied rates · analyst consensus (price
  targets, ratings, EPS/revenue estimates and revisions) · FX for ~150 currencies ·
  ~45 commodity futures.
- **Live politics & world events** (refreshed every 12 h, labelled "community" where
  community-maintained): all 539 members of Congress on their state profiles; heads of
  state and government of every country and all US governors (Wikidata); 48 ongoing armed
  conflicts by intensity with yearly deaths (Wikipedia's list, citing ACLED/UCDP); ~100
  national elections this year and next (Wikipedia electoral calendars). When Wikidata
  shows a leader took office after the June 2026 curated check, the old term is closed and
  the profile flagged — e.g. Andy Burnham replacing Keir Starmer as UK Prime Minister
  (July 2026). Other disagreements appear as "verify" notes rather than being resolved silently.
- **Trusted newsroom** (refreshed every 30 min): headlines from wire services (Reuters, AP,
  Bloomberg, FT, WSJ via headline search), public broadcasters (BBC, NPR, DW, France 24, CBC,
  ABC), major papers (NYT, Guardian, CNBC, Al Jazeera) and official sources (Fed, ECB, Bank of
  England, IMF, UN, SEC, WTO). The same story from several outlets is shown once with every
  outlet that carried it ("✓ 3 trusted outlets"); every headline is labelled with its
  outlet's tier (official, wire, public broadcaster, major, specialist, state media, unrated)
  and linked to the countries, companies, people, organisations and commodities it names.
  Profiles show these alongside a live headline search, trusted outlets first. Map layer
  **In the news (48 h)** shades countries by how many separate stories named them.
- **News signals**: appointments, departures and election wins stated in trusted
  headlines are checked against the records. When two or more independent trusted outlets
  (or an official source) report something the record doesn't show — e.g. a new CEO — the
  profile gets a dashed **reported** fact naming the outlets, and the person the record
  still lists gets a warning. Records are flagged, never overwritten; single-source reports
  are listed but flag nothing.
- **Elections page** (`/elections`) and election profiles: upcoming and recent national
  elections plus US governor, Senate and big-city mayoral races and mayoral elections in major
  world cities. Results, turnout and candidates are read from each election's Wikipedia
  article — every 30 minutes around polling day — and shown as "counting" until a winner is
  recorded (never guessed), with a ✓/⚠ check against what trusted news reports. Candidates
  link to their profiles, with their party's stated ideology and position and a summary of
  their policy positions (from their "Political positions" article or section). **Prediction
  markets**: Polymarket and Kalshi prices matched to each election and candidate, combined
  into one market-implied chance, with each market listed separately and thin markets marked.
- **Local politics**: mayors (or city heads of government) of every national capital, every
  US city over 250,000 people and every curated city, from Wikidata — new cities appear on the
  map — shown on city, state and country profiles alongside each state's governor, Congress
  delegation and local elections.
- **Data page** (`/data`): every live provider's status (ok / serving a cached copy /
  failing), when each background loader last downloaded its data, every news feed's
  health, facts by quality label, and a consistency audit (unknown sources, broken links,
  conflicting values, duplicate people, past events still "scheduled", competing
  officeholders, news that contradicts a record). Every profile has a **Data quality** card
  with the same, for that entity. Live facts show when they were retrieved.
- **Markets page** (commodities, currencies, rates & yield curves) and **Conflicts page**.
- **Curated dataset** (`server/data/curated.ts`): 10 deeply curated countries, 61 with
  government type, 12 IGOs, 18 parties, 57 people, ~115 companies across the US, Europe,
  Asia and emerging markets (`npm run check:tickers` checks every quote symbol), 45
  commodities/products/services, 20 industries, 12 events, ~80 cities — each fact cites a
  source and a "verified as of" date (June 2026).
- **Research workspace** (works like Obsidian): rich-text notes with Markdown shortcuts,
  checklists, tables; type `[[` to link another note or an entity (a link to a note that
  doesn't exist yet creates it when followed); backlinks, outgoing links and unlinked
  mentions on every note; a graph view of notes and entities (whole workspace or per
  note); daily notes; tags, categories, pin, attachments (25 MB), full-text search,
  grouping by date/entity/tag/category, HTML/JSON/Markdown export.
- **Obsidian sync** (Settings → Obsidian): pick a vault (found automatically from
  Obsidian's vault list, or paste a path — Windows paths, OneDrive and "Copy as path"
  quotes all work). Notes are written to `<vault>\Terminal\Notes` as Markdown with
  properties and `[[wikilinks]]`; linked countries, companies, people… get pages in
  `Terminal\Entities` so Obsidian's backlinks and graph work. Two-way: edits, renames and
  new notes made in Obsidian come back within ~10 s. Edits on both sides at once never
  lose text (the Obsidian version is kept as a copy). Deleting here moves the file to
  Obsidian's `.trash`. "Open in Obsidian" on every note.
- **Positions**: long/short, multiple transactions, quantities, portfolios, open/closed,
  thesis; price return and total return (with dividends) on delayed quotes; shown on the
  profile, map preview and search results.
- **Calendar + Catalyst Tracker**: sourced events, and your private forecasts (expected
  outcome, scenarios, implications, thesis, post-event analysis), clearly labelled.
- **Compare & connect**: country comparison table and a relationship explorer that finds
  paths between any two entities.

## Layout

```
server/          Express API (one process; mounts Vite in dev)
  graph.ts       entity graph: baseline geography + curated overlay, search index
  providers.ts   World Bank, Comtrade, Treasury, SEC, quotes, news (disk-cached)
  markets.ts     FX, commodity futures, policy rates, yield curves, IMF, Fed, consensus
  worldEvents.ts Wikipedia conflict list + electoral calendar parsers
  augment.ts     live graph additions: Congress, Wikidata leaders, conflicts, elections
  newsroom.ts    trusted news feeds: ingest, de-duplicate, tag entities, signals
  newsParse.ts   feed parsing, entity tagger, headline signal extraction (pure, tested)
  consistency.ts provenance & consistency audit (Data page, npm run check:data)
  elections.ts   election articles: results, candidates, local races, candidate policies
  electionParse.ts  Infobox election / party parsers (pure, tested)
  predictionMarkets.ts  Polymarket + Kalshi, matched to elections and candidates
  localPolitics.ts  mayors and city heads of government (Wikidata)
  private.ts     per-user notes, positions, catalysts, watchlists, views, prefs
  notes.ts       note storage, [[wikilinks]], backlinks
  obsidian.ts    two-way Obsidian vault sync (Markdown ⇄ notes, Windows-safe)
  data/curated.ts  curated, sourced sample dataset
scripts/check-obsidian.mts  conversion + file-name checks (npm run check:obsidian)
scripts/check-tickers.mts   every quote symbol resolves to the right security (npm run check:tickers)
scripts/check-live.mts      conflict & election parsers against live Wikipedia (npm run check:live)
scripts/check-news.mts      news parsing, tagging, clustering and signals on fixtures (npm run check:news)
scripts/check-data.mts      consistency audit of the built-in dataset (npm run check:data)
scripts/check-parsers.mts   rates, elections, markets and mayors on fixtures (npm run check:parsers)
shared/newsSources.ts       outlet registry and tiers
shared/types.ts  entity / relationship vocabulary
shared/products.ts  HS codes for "who exports / imports what"
src/             React UI (map, profiles, research, portfolio, calendar…)
db/postgres-schema.sql   production target schema (PostgreSQL + PostGIS)
docs/ARCHITECTURE.md     architecture, schema, data requirements, roadmap
data/            runtime: SQLite DB, provider cache, uploads (git-ignored)
```

## Known limits (honest list)

- Curated political facts are verified as of June 2026; anything since may be stale.
  Example caught during testing: October 2026 headlines report John Ternus as Apple's
  new CEO — flagged on Tim Cook's entry rather than guessed. Use "Report an
  inconsistency" on any profile.
- Quotes use Yahoo's unofficial chart endpoint (delayed, personal use). Swap
  `getQuote` in `server/providers.ts` for a licensed feed before any commercial use.
  Headlines via Google News RSS are licensed for personal feed-reader use only.
- Sub-national boundaries are US-only; other countries show capitals and key cities.
- "Consensus" means analyst consensus for companies (Yahoo, personal use). For economies
  the app shows IMF and FOMC projections and futures-implied rates — official forecasts
  and market pricing, not a survey consensus (those are licensed products).
- Wikidata and Wikipedia are community-maintained: usually current, sometimes stale
  (e.g. Thailand's prime minister — the app shows a "verify" note when Wikidata lists two).
  Curated ministers in a country whose government changed are flagged, not replaced.
- No open price feed for lithium, cobalt, nickel or rare earths (profiles show producers
  and live trade instead). Uranium and coal futures trade thinly; quotes older than 10 days
  show the price and date only. Daily yield curves cover US, euro area, UK, Japan, Canada;
  ~30 more countries have monthly 10-year yields; ~40 central banks report policy rates.
- UN Comtrade's free API is rate-limited: a product's first load takes ~10 s, then it is
  cached for a week. Recent years are incomplete until countries report.
- Auth is local email/password (scrypt, httpOnly cookie). For cloud deployment move to
  PostgreSQL (`db/postgres-schema.sql`) and an identity provider.
- Windows doesn't render flag emoji, so flags show as two-letter codes there.
- Obsidian sync needs the terminal running on the same computer as the vault (it reads
  and writes files there). Things the terminal's editor has no equivalent for — embeds
  (`![[image.png]]`), callout styling, Dataview queries, highlights — are kept as text and
  survive round trips, but are not rendered here. If you rename a note's file in Obsidian
  *and* edit it in the terminal before the next sync, you get a conflict copy. Spaces in
  tags become hyphens in Obsidian (Obsidian tags can't contain spaces).

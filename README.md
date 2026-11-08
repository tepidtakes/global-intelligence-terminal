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

1. **Install Node.js 24** (22.13 or newer also works) from <https://nodejs.org> (the "LTS" download; accept the
   defaults). Close any terminal windows you already had open so they pick it up.
   On Linux your distribution's package may be older: check with `node -v`, and if it is older
   than 22.13 install it with [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) (`nvm install 24`)
   or from nodejs.org.
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
   - Linux: right-click inside the folder in your file manager → **Open in Terminal** (or open a
     terminal and type `cd ` followed by the folder's path).
4. **Install and start it** — type these two lines, pressing Enter after each:

   ```bash
   npm install
   npm run dev
   ```

5. **Open <http://localhost:5180>** in your browser. Keep the terminal window open while you
   use it; close it (or press Ctrl+C) to stop.

**Shortcut on Linux (and macOS):** instead of steps 4 and 5, run `bash start.sh` in that folder. It
checks Node.js, installs what is needed on the first run, starts the terminal and opens your
browser. `bash start.sh --desktop` also adds the terminal to your applications menu, and
`bash start.sh --service` runs it in the background whenever you log in (a systemd user service;
the script prints how to stop it).

**If something goes wrong:** "running scripts is disabled" → you are in PowerShell; use `cmd`
as in step 3 (or type `npm.cmd` instead of `npm`). "Could not read package.json" / "ENOENT" →
the terminal is not in the project folder; redo step 3 from the folder that contains
`package.json`. "'npm' is not recognized" → Node.js is not installed yet, or the terminal was
opened before installing it — close it and open a new one.

Next time, only steps 3, the second line of 4 (`npm run dev`) and 5 are needed. To update,
download the ZIP again and copy your old `data` folder into the new one to keep your notes.

## Run it (developers)

Requires Node 22.13+ (24 recommended; uses the built-in `node:sqlite`); runs on Linux, macOS and Windows. `npm install` then `npm run dev`, and
open http://localhost:5180. Public data works signed out; create an account (Sign in →
Create account) for notes, positions, watchlists, saved views and catalysts. Accounts and
everything you write stay in `data/` on your computer. (`seed/test-account.example.json`
is a throwaway login used for local testing — not a real credential.)

Production: `npm run build` then `npm start` (serves `dist/` from the same server).

Optional settings (environment variables): `CONTACT_EMAIL` (sent to SEC/Wikipedia/Wikidata,
which ask API users for one), `ALLOW_SIGNUP=0`, `HOST`, `PORT`, `TERMINAL_VAULT`. The
server listens on this computer only unless you change `HOST` — see [SECURITY.md](SECURITY.md).

Optional free API keys that add sources (everything works without them):
`FRED_API_KEY` (official dates for every US release, not only BLS ones), `EIA_API_KEY`
(weekly Strategic Petroleum Reserve levels straight from the EIA), `AGSI_API_KEY` (European
gas storage), `CENSUS_API_KEY` (higher rate limit for US duty data). Size of the web:
`WIKIDATA_COMPANY_MIN_SITELINKS` (default 25 — lower loads more companies) and
`TRADE_WEB_COUNTRIES` (default 40 largest economies). Alert webhooks go to
Slack, Discord and ntfy by default; add hosts with `TERMINAL_WEBHOOK_HOSTS=host1,host2`.

Checks: `npm run check:obsidian` · `npm run check:tickers` · `npm run check:live` ·
`npm run check:news` (news parsing, tagging and signals, offline) · `npm run check:data`
(consistency audit of the built-in dataset, offline; fails on errors) · `npm run check:parsers`
(rates, election, prediction-market and mayor parsers on fixtures, offline) ·
`npm run check:econ` (alerts, calendar, sanctions, tariffs, budgets, reserves and trade
explorer on fixtures, offline) · `npm run check:web` (the knowledge web: Wikidata loaders,
corroboration and disputes, trade/sanctions/news links, weights, catalog, connections; offline) · `npm run check:quality` (the network gate against local
HTTP servers: limits, gaps, Retry-After, circuit breaker, readable errors; and the World Bank vs IMF cross-checks; offline) · `npm run check:updates` (live updates to open pages,
central-bank dates read from the banks' pages, meetings from Wikidata; offline).

## What's in it

- **The knowledge web**: everything is one connected graph — countries, every international
  organization countries belong to (discovered from Wikidata, with join and leave dates),
  central banks and governors, listed companies with their executives, parents, industries
  and live quotes, capitals and big cities, people, parties, commodities and events — joined
  by links that carry data: trade between the largest economies (UN Comtrade, both countries'
  reports), sanctions programmes from imposer to target, and who is in trusted news together
  this week. Every profile has a **Connections** card (ranked by what each link carries, ✓ when
  two sources agree, ⚠ when they disagree), **Web** (`/web`) draws the network around anything,
  and the map layer **Where something is connected** shades the world by how each country
  relates to it. Little is hard-coded: organizations, companies, cities and indicators come
  from the sources' own data, and importance weights are computed from GDP shares.
- **Any indicator**: search ~1,700 World Bank and IMF series from the map's layer search or a
  country's **Explore any indicator** card — chart it, or map every country.
- **Map** (MapLibre GL): 241 country shapes → 56 US states/territories (zoom ≥ 3) → 3,231
  US counties (zoom ≥ 5) → curated cities. Hover previews, click to select, breadcrumbs,
  fly-to, returns to your last position.
- **Map sidebar**: tabs for Layers / Places / Saved; a card for the active layer with its
  options; layer search ("inflation", "oil", "war"); eleven themed groups (politics,
  conflict, economy, public finances, IMF forecasts, trade, sanctions & tariffs, reserves &
  stocks, markets & rates, portfolio, historical); a color preview on every layer. Any layer
  can be linked to: `/?fill=sanctions:ALL`.
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
- **Trusted newsroom** (refreshed every 30 min): headlines from wire services (Reuters, AP
  via headline search), the official RSS feeds of the WSJ, FT, Bloomberg, The Economist,
  Nikkei Asia, Washington Post, Politico, Axios, SCMP, The Hindu, Straits Times and others,
  public broadcasters (BBC, NPR, DW, France 24, CBC, ABC), major papers (NYT, Guardian, CNBC,
  Al Jazeera) and official sources (White House, EU Council, NATO, Fed, ECB, Bank of England,
  Bank of Japan, IMF, UN, SEC, WTO). **News subscriptions** (Settings): mark the outlets you
  pay for and their stories open on the publisher's site, where you are signed in; the
  terminal never asks for publisher passwords and never downloads article text. The same story from several outlets is shown once with every
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
- **Alerts** (`/alerts`, the bell in the top bar): a "what changed" inbox. Every live loader
  records changes — corroborated news, new leaders, election results, conflicts, price, FX
  and yield moves, policy-rate decisions, data releases, new sanctions designations, US tariff
  actions and duty jumps. Rules watch entities, watchlists, the entities in your notes, your
  positions, or places picked on the map (and everything inside them), with a minimum
  importance (1–10) and move thresholds; alerts arrive in the inbox, as browser
  notifications or by webhook (Slack, Discord, ntfy). "Alert me" on every profile and map
  preview; **My alerts** map layer; add any alert to today's note or a chosen note; notes show
  what changed for the entities they mention.
- **Economic & IGO calendar** (`/calendar`, and on every country and organisation profile):
  data releases (US from the BLS/FRED calendars; euro area, Germany, UK, Japan, China, Canada
  and India), central-bank decisions (Fed, ECB, Bank of England, Bank of Japan, Bank of
  Canada, PBoC loan prime rate), summits, assemblies and votes (UN, European Parliament
  plenaries, European Council, G20, APEC, ASEAN, OPEC+, COP), budget days and elections —
  global or for one country/organisation. Each event is graded **1–10** (what it is + how much
  that economy matters + context; hover for the reasons) and gets its **result** after
  release (FRED, Eurostat, BIS). Dates are labelled: official calendar, published schedule,
  official rule, or "≈ usual timing" when the exact date is not out yet.
- **Sanctions & tariffs**: the US (OFAC), EU, UK and UN consolidated lists on the map (all
  or one list) and on profiles — country programmes, listings connected to the country,
  designations in the last 120 days; the regimes the EU, UN, US and UK impose; a "same name
  as a sanctions listing" notice on people and companies (name match only, with links to
  the official search); alerts on new designations. US tariffs: the rate actually charged on
  each country's goods (Census duties ÷ imports, monthly, and its change over a year),
  Federal Register tariff actions naming each country, and the tariffs every country
  applies itself (World Bank).
- **Government budgets** on country profiles: fiscal year, IMF general-government revenue,
  spending, overall and primary balance, net interest and debt (with projections marked);
  spending by function for EU and EFTA members (Eurostat COFOG); central-government revenue,
  tax, interest burden, defence, health and education spending (World Bank). United States,
  live: debt to the penny, monthly receipts, outlays and deficit, interest on the debt and the
  average rate it pays. Map layers for budget balance, revenue, spending and interest burden.
- **Reserves & stocks**: crude-oil stocks and days of refinery cover by country (JODI), the
  US Strategic Petroleum Reserve weekly, how each major country holds strategic oil (and its
  EU/IEA obligations), wheat, corn and rice stocks and stocks-to-use (USDA), European gas
  storage (AGSI+, free key), FX and gold reserves and months of import cover. Commodity
  profiles list who holds the stocks.
- **Trade explorer** (`/trade`): one country's trade with every partner (table and map
  layer: total, exports, imports, share, balance), or one pair A ↔ B — six years of trade as
  **each side** reports it (the mirror check: A's exports vs B's imports), what they trade by
  product, the US tariff between them, sanctions programmes either imposes on the other and
  shared memberships. From the map: click a country → "Trade partners", then click another →
  "Trade with …".
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

## Live updates

What you see updates by itself. The server tells open pages when its data changes (a provider
answered with new figures, a connector refreshed the knowledge web, a calendar result came in, a
change reached the feed) and each page fetches what it shows again, keeping the current numbers on
screen meanwhile. Pages also refresh anything older than its normal lifetime while the tab is
visible. The **Live** dot in the top bar shows the connection (hover it for the last update);
hidden tabs pause and catch up when you return. The Data page's *Network* card counts the updates sent.

## Speed and screen sizes

Each page loads only the code it needs (a country profile is about 100 KB compressed; the map,
with its geometry, about 580 KB), responses are gzip-compressed, and built files are cached by
the browser for a year. Pages show data the terminal already has immediately and refresh it in
the background, always with its real retrieval time. The layout works from phones (menu, map
drawer and bottom sheet) through tablets and laptops to 4K monitors.

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
- UN Comtrade's free API is rate-limited: a product's or a pair's first load takes ~10 s,
  then it is cached for a week. Recent years are incomplete until countries report, and two
  countries' reports of the same trade often differ (the trade page shows both).
- Sanctions matches on people and companies are by name only and say so; they are not
  identity checks. Listings are tied to countries by nationality and address, which is a
  connection, not a measure of how much trade is restricted.
- Bilateral tariff rates are only shown where the US is one side (Census duties); for other
  pairs the app shows each country's average applied tariff (World Bank, a year or more
  behind).
- Oil stocks cover the ~60 countries that report them to JODI (not China); strategic and
  commercial stocks are not separated there. Grain stocks are USDA projections, revised
  monthly. Central-bank meeting dates are entered by hand from official schedules and the
  Data page warns 90 days before a schedule runs out.
- Auth is local email/password (scrypt, httpOnly cookie). For cloud deployment move to
  PostgreSQL (`db/postgres-schema.sql`) and an identity provider.
- Windows doesn't render flag emoji, so flags show as two-letter codes there. Linux shows them
  when a colour emoji font is installed (Noto Color Emoji: `fonts-noto-color-emoji` on Debian/Ubuntu).
- Obsidian sync needs the terminal running on the same computer as the vault (it reads
  and writes files there). Things the terminal's editor has no equivalent for — embeds
  (`![[image.png]]`), callout styling, Dataview queries, highlights — are kept as text and
  survive round trips, but are not rendered here. If you rename a note's file in Obsidian
  *and* edit it in the terminal before the next sync, you get a conflict copy. Spaces in
  tags become hyphens in Obsidian (Obsidian tags can't contain spaces).

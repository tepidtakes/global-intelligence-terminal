# Where the data comes from, and how it stays up to date

Short version: **almost nothing is stored in this repository.** When you open a page or a
map layer, the terminal asks the original publisher for the data, keeps a copy on your
disk for a while, and shows you where it came from and when it was fetched. The only data
written into the code is a small hand-checked dataset (`server/data/curated.ts`), and every
fact in it says which source it came from and that it was checked in **June 2026**.

## The three kinds of data

| Kind | Example | How it gets updated | How you can tell |
|---|---|---|---|
| **Fetched when you look** | GDP, prices, yields, trade, forecasts, news | Downloaded the first time someone views it, then reused until it is "too old" (times below), then downloaded again | Every number shows its source and period; most show "retrieved … ago" |
| **Loaded in the background** | Members of Congress, world leaders, wars, elections | Checked when the server starts and every 12 hours after | Labelled **community** (Wikidata/Wikipedia) or **official**; <http://localhost:5180/api/live/status> shows when each last ran and whether it worked |
| **Hand-checked (curated)** | Government type, ministers, company HQs, IGO members, commodity producer rankings | Only changes when someone edits `server/data/curated.ts` | Labelled **curated**, with "Verified 2026-06" |

If a source is down, you see **the last copy that worked, marked as cached** — never a
made-up value. If there has never been a copy, the page says the data is unavailable.
Missing values are shown as "—" or "no data", never as 0.

## Source by source

| What you see | Source | Refreshed at most every | Terms |
|---|---|---|---|
| Country statistics (GDP, inflation, unemployment, debt, trade %, FDI, population…) | World Bank — World Development Indicators | 24 h (income groups: 7 days) | CC BY 4.0 |
| Exports/imports by product and partner; "who exports what" | UN Comtrade public API | 7 days | UN Comtrade terms (free tier, rate-limited) |
| IMF growth, inflation, unemployment, debt forecasts | IMF World Economic Outlook (DataMapper) | 24 h | Free reuse with attribution |
| Central-bank policy rates | Bank for International Settlements | 6 h | Free reuse with attribution |
| 10-year government bond yields | Daily: US Treasury, Bank of Canada, Japan MOF, Bank of England (par yields). Monthly: ECB convergence yields (all EU members), OECD via FRED (others) | 6–24 h | Free with attribution / OECD terms |
| Daily yield curves | US Treasury · European Central Bank · Bank of England · Japan Ministry of Finance · Bank of Canada | 6 h | Public / free with attribution |
| Fed projections (FOMC medians) | Federal Reserve, via FRED | 24 h | Public domain |
| Company financials (US filers) | SEC EDGAR | 24 h | Public domain |
| Share prices, FX, commodity futures, fed funds futures | Yahoo Finance (unofficial endpoints) | 5–15 min | **Personal use only** — see below |
| Analyst consensus (targets, ratings, estimates) | Yahoo Finance | 6 h | **Personal use only** |
| Headlines for one profile | Google News RSS (fallback: GDELT) | 1–2 h | **Personal feed-reader use**; links go to the publisher |
| Trusted news feeds (newsroom, profile news, signals, "In the news" map layer) | Publishers' own RSS feeds, official press-release feeds, and wire headlines via Google News site searches — [details below](#trusted-news) | 30 min | Headlines and links only, for personal feed-reader use; each article stays with its publisher |
| Members of Congress | `unitedstates/congress-legislators` | 24 h | Public domain (CC0) |
| Mayors / city heads of government (capitals, US cities over 250k, curated cities) | Wikidata | 24 h | CC0 |
| Election results, candidates, turnout; party ideology; candidates' policy positions | Wikipedia election, party and "Political positions of …" articles | 30 min near polling day, otherwise 12 h; policies 7 days | CC BY-SA 4.0 |
| US governor, Senate and big-city mayoral elections; mayoral elections in curated world cities | Wikipedia election articles | 12 h | CC BY-SA 4.0 |
| Election odds | Polymarket (Gamma API) and Kalshi (public API) | 15 min | Public market data; prices are bets, not polls or forecasts |
| Heads of state/government, US governors, their parties | Wikidata | 24 h | CC0 |
| Ongoing wars and conflicts, deaths by year | Wikipedia "List of ongoing armed conflicts" (which cites ACLED and UCDP) | 12 h | CC BY-SA 4.0 |
| Sides of each war (states, armed groups, supporters, former participants) and the wars inside each listed conflict | The "Belligerents" box of each war's own Wikipedia article (~200 articles, read 20 per request) | 24 h | CC BY-SA 4.0 |
| National elections (this year and next) | Wikipedia "national electoral calendar" pages | 12 h | CC BY-SA 4.0 |
| Economic & IGO calendar — US release dates | BLS release calendar (iCalendar); with `FRED_API_KEY`, the FRED release calendar | 6 h | Public domain / FRED terms |
| Central-bank decision dates, summits, assemblies and votes | Fed, ECB, Bank of England, Bank of Japan, Bank of Canada schedules; UN, EU, G20, APEC, ASEAN, OPEC+ announcements — entered by hand, checked against several sources | Edited in `server/econCalendar.ts` | Official publications |
| Release results | FRED (BLS, BEA, Census series) · Eurostat HICP · BIS policy rates | 15 min after an event | Public domain / free with attribution |
| Sanctions | US OFAC SDN list · UN Security Council consolidated list · EU financial sanctions file · UK Sanctions List (FCDO) | 12 h (checked every 6 h) | Public domain · UN terms · EU reuse · OGL v3 |
| US tariff actions | Federal Register API (proclamations, executive orders, USTR, Commerce, CBP) | 6 h | Public domain |
| US duties by country of origin | US Census Bureau international trade API (calculated duties, imports for consumption) | 12 h | Public domain |
| Tariffs each country applies | World Bank WDI (UNCTAD TRAINS / WTO) | 24 h | CC BY 4.0 |
| US federal debt, interest, average rates | US Treasury Fiscal Data (Debt to the Penny, interest expense, average interest rates) | 6–24 h | Public domain |
| US monthly receipts, outlays, deficit | Monthly Treasury Statement, via FRED | 24 h | Public domain |
| General-government revenue, spending, balances | IMF World Economic Outlook and Fiscal Monitor (DataMapper) | 24 h | Free reuse with attribution |
| Spending by function (EU and EFTA) | Eurostat `gov_10a_exp` (COFOG) | 7 days | Free reuse with attribution |
| Crude-oil stocks by country | JODI-Oil World Database | 7 days | Free reuse with attribution |
| US Strategic Petroleum Reserve (weekly) | EIA (with `EIA_API_KEY`), otherwise the same series via FRED | 12–24 h | Public domain |
| Grain stocks (wheat, corn, rice) | USDA Foreign Agricultural Service, PSD | 7 days | Public domain |
| European gas storage | GIE AGSI+ (needs a free `AGSI_API_KEY`) | 6 h | Free with registration |
| FX and gold reserves | World Bank (IMF International Financial Statistics) | 24 h | CC BY 4.0 |
| How countries hold strategic oil reserves | Official pages (U.S. DOE, JOGMEC, ISPRL, EBV, IEA, EUR-Lex) — entered by hand | Edited in `server/reserves.ts` | Official publications |
| Bilateral trade (all partners; one pair, both sides' reports) | UN Comtrade public API | 7 days | UN Comtrade terms |
| Country names, codes, capitals, currencies, borders | `world-countries` package | Fixed (updates with the package) | ODbL 1.0 |
| Map shapes | Natural Earth (`world-atlas`), US Census (`us-atlas`) | Fixed | Public domain |

The full list with links is in the app (every profile has a **Sources** section) and in
`server/data/curated.ts` (`SOURCES`).

## Trusted news

<a id="trusted-news"></a>Every 30 minutes the terminal reads 27 news feeds and keeps the
headlines for 14 days (`data/news/store.json`). It stores the headline, a short summary
where the feed provides one, the outlet, the time and the link — never the article.

**Which feeds.** Publishers' own RSS: BBC (world, business), The Guardian (world, business),
The New York Times (world, business), NPR, Deutsche Welle (world, business), France 24,
Al Jazeera, CNBC (world, economy), CBC, ABC (Australia). Official sources: Federal Reserve,
European Central Bank, Bank of England, IMF, UN News, SEC, WTO. Wire services and paywalled
papers publish no open feed, so their headlines come from Google News searches limited to
their sites: Reuters, Associated Press, Bloomberg, Financial Times, Wall Street Journal.
The Data page shows whether each feed worked on the last run, and why not.

**Outlet tiers.** Every headline anywhere in the terminal is labelled with what kind of
outlet published it (the full list is in `shared/newsSources.ts` and on the Data page):

| Tier | Meaning |
|---|---|
| official | A government, central bank, regulator or international organisation (also any .gov, .gov.uk, .gouv.fr… site) |
| wire | News agencies whose copy others republish: Reuters, AP, AFP, Bloomberg, dpa, Kyodo, Yonhap… |
| public broadcaster | BBC, NPR, PBS, DW, France 24, CBC, ABC Australia, NHK… |
| major outlet | Established papers and broadcasters with public corrections policies |
| specialist | Specialist or regional outlets with an editorial track record in their field |
| state media | Government-controlled outlets (Xinhua, TASS, RT, Press TV…): a government's stated position, not independent reporting |
| unrated | Anything not in the list — shown, but check the original |

Tiers describe the kind of outlet, not its politics. "Trusted" means the first five.

**Stories and corroboration.** Headlines from different outlets about the same event (most
content words shared, within 72 hours) are grouped into one story. "✓ 3 trusted outlets"
means three *different* trusted outlets carried it.

**Linking to profiles.** Headlines are linked to the countries, US states, organisations,
companies, parties, people and commodities they name. To avoid false matches: names that are
also everyday words (Apple, Shell, Labour, gold, oil) only count with supporting context
(business, political or market words); places with the same name (Georgia, Congo) are told
apart by the other names in the headline, or not linked at all; "Beijing", "the Kremlin" or
"Downing Street" count as their country; sitting heads of state and government are also
matched by surname ("Trump and Xi meet").

**Signals: news that updates profiles.** When trusted headlines say someone was appointed
(CEO, chair, prime minister, president, finance minister), is leaving, or won an election,
the terminal compares that with its records:

- **Reported by two or more independent trusted outlets, or by an official source, and not
  what the record shows** → the profile gets a **reported** fact (dashed label) naming the
  outlets and the date, and the person the record still lists gets a warning. For an
  election that has just taken place, the reported winner is added to the election.
- **One outlet only** → listed in the newsroom's signals panel as "single source"; nothing
  on the profile changes.
- **Matches the record** → nothing to do.

Headlines never close a term, delete a relationship or replace a curated fact. They tell
you where to look; the official source settles it.

## Elections

**Results.** Each election links to its Wikipedia article. The terminal reads the article's
results box — candidates, parties, votes, percentages, seats, turnout and who holds the office
afterwards — every 30 minutes from ten days before polling day to two days after, and every 12
hours otherwise. Until the article names a winner the election shows **counting** (with the
current leader, if the article lists one); the terminal never declares a winner itself. When
trusted news outlets also report a winner, the profile shows whether the two agree (✓) or not
(⚠, also listed in the consistency audit). Official results come from each country's
electoral authority.

**Candidates and policies.** Candidates link to their profiles (created if missing). For each
one the profile shows their party's ideology and left–right position as stated on the party's
Wikipedia page, and a summary of their policy positions from the "Political positions of …"
article — or, if there is none, the "Political positions" / "Platform" section of their own
article — with a link to the full text and its sources.

**Prediction markets.** Open election markets on Polymarket and Kalshi are matched to an
election by place (country, US state or city), office (president, legislature, governor,
mayor, Senate), year and timing, then to candidates by surname or party. A market about a
different office, year or place is never attached. The profile lists every matched market
and combines them into one market-implied chance per candidate (weighted by trading volume).
Markets with less than $25,000 traded are marked **thin**. These prices are what traders pay
for "this candidate wins" — useful as a live read of expectations, not a poll, and not a
forecast by the terminal.

**Local politics.** Mayors (or a city's head of government, e.g. the Governor of Tokyo) come
from Wikidata for every national capital, every US city over 250,000 people and every curated
city; cities the terminal didn't know are added to the map. State profiles list their cities'
mayors, governor, Congress delegation and state and city elections; country profiles list
their capital's and other cities' leaders. Curated mayors are compared with Wikidata the same
way as national leaders.

## The knowledge web

The terminal is one connected graph, built mostly from live sources rather than lists in the
code. Each **connector** (listed on the Data page with what it adds and when it last ran):

| Connector | Source | Adds | Refresh |
|---|---|---|---|
| Countries | Wikidata | Wikidata ids, names in 11 languages (so other sources' spellings match), currency, form of government | 3 days |
| Organizations & memberships | Wikidata | Every organization 3+ countries belong to: members with join/leave dates, seat, leader | 2 days |
| Central banks | Wikidata | Each country's central bank (the ECB for the euro area) and its governor | 3 days |
| Capitals & big cities | Wikidata | Every capital and city of 1M+ people, with population and location | 7 days |
| Listed companies | Wikidata | Companies known in 25+ Wikipedia languages: tickers → live quotes, head office, industry, parent, CEO and chair | 3 days |
| Trade web | UN Comtrade | Goods trade between the 40 largest economies (by IMF GDP) and their top 30 partners, as each reports it | 7 days |
| Sanctions web | OFAC, EU, UK, UN lists | Imposer → country, for programmes aimed at the country | with the lists |
| News web | Trusted outlets | Entities named together in 2+ trusted stories in the last 7 days | 30 min |
| Economy weights | IMF WEO (World Bank fallback) | Share of world GDP — calendar importance and node size | daily |
| Indicator catalog | World Bank, IMF | ~1,700 searchable series for maps and charts | 3 days |

**How sources are combined.** Records are matched by Wikidata id, then by exact name, ticker
or country code — never by guesswork. When a live source reports a link the hand-checked data
already has, the link shows **✓ 2 sources**; when it disagrees (another end date, a different
CEO), the link is marked **⚠** and the disagreement is listed in the audit — neither side is
silently overwritten. Wikidata is community-maintained: links from it are labelled with their
source on hover.

**Still entered by hand.** Central-bank meeting dates and summit dates (no open
machine-readable source), the trust tier of each news outlet (an editorial judgement), which
end of a featured map layer is "better", Yahoo Finance's symbol suffix for each exchange, and
the June 2026 verified overlay. The audit warns when a schedule runs out or live data
disagrees.

## Paid publishers (WSJ, FT, Bloomberg…)

The terminal reads only what publishers offer openly: their **official RSS feeds**
(headline, summary, link). It never logs in to a publisher, never asks for or stores a
password, and never downloads article text — publishers' terms forbid automated access to
subscriber pages and the articles are copyrighted. If you subscribe, tick the outlet under
**Settings → News subscriptions**: its stories get a direct link that opens on the
publisher's site in your browser, where your own login applies, and the newsroom can show
only your subscriptions.

## Alerts: what changed

Every live loader records **changes** into one feed (`server/changes.ts`): corroborated news
(two or more trusted outlets, or one official source), new heads of state or government and
governors, election results, conflict intensity, price/FX/yield moves past fixed thresholds,
policy-rate decisions, data-release results, upcoming high-importance events, new sanctions
designations, US tariff actions and month-on-month jumps in a big partner's effective US
tariff, and the US federal debt passing another trillion. A loader's **first run is a
silent baseline**, so starting the app never floods the inbox. Each change has an importance
(1–10), a source and the entities it concerns; alert rules match on entities, places (and
everything inside them), kinds and importance.

## Economic & IGO calendar

Dates come with a label saying how sure they are: **official** (fetched from an official
calendar, or a published schedule entered by hand), **official rule** (e.g. China's loan
prime rate on the 20th), or **≈ usual timing** (the agency's habit — e.g. UK CPI on a
Wednesday mid-month — shown until the real date is published). US releases missing from the
live calendars (BLS covers only its own releases) are shown at usual timing unless
`FRED_API_KEY` is set. Importance = base for the kind of event + how much that economy
matters worldwide + context, kept within 1–10, with every reason listed. Results are posted
from FRED, Eurostat and the BIS within about 15 minutes of appearing there; consensus
forecasts are licensed data and are not shown.

## Sanctions and tariffs

The four consolidated lists are read in full. A listing is **connected** to a country by
nationality, citizenship or address (place of birth, passports and a ship's flag are left
out); a **country programme** is one named after the country (US "IRAN", EU "RUS", UK
"Russia", UN "DPRK"; the US and EU Ukraine-related regimes count as aimed at Russia).
Everything else (terrorism, cyber, human rights, narcotics) is shown as individual listings.
New entries since the last load become alerts. Name matches with people and companies in the
app are labelled as name matches only.

US tariffs are shown three ways: **actions** (Federal Register documents naming a country;
anti-dumping and countervailing-duty notices counted separately), the **rate actually
charged** (calculated duties ÷ value of imports for consumption, by country of origin, for
the latest month, year to date, the month before and a year earlier), and every country's
own **average applied tariff** (World Bank, with a lag).

## Budgets and reserves

General-government figures (all levels of government) come from the IMF; the current year
and later are **projections** and are marked as such. Net interest is derived as primary
balance minus overall balance. Central-government figures (World Bank) and EU spending by
function (Eurostat) are labelled with their own coverage. Oil stocks are what each
government reports to JODI (China does not report stocks); days of cover = crude stocks ÷
refinery intake. Grain stocks are USDA's current-year projections.

## Rates: one number per country

The 10-year yield on the map, on the Markets page and on a country's profile is now always
the same figure, from one resolver: a **daily close** where an official daily series exists
(US Treasury par yield, Bank of Canada benchmark, Japan MOF, Bank of England par yield);
otherwise the **monthly average** from the ECB (EU members, including Bulgaria, Croatia,
Cyprus, Malta and Romania) or the OECD. Each value shows its date and whether it is daily or
monthly. Monthly values more than 4 months old, daily values more than 14 days old and policy
rates last reported more than 120 days ago are marked **stale** and left off the map. World
Bank "latest available" map layers leave out countries whose latest figure is more than six
years old. Central-government debt (World Bank) and general-government debt (IMF) are labelled
as such — they measure different things and are no longer both called "Govt debt".

## How the live updating works

```
  You open a page or map layer
            │
            ▼
  Server checks its disk cache (data/cache)
     ├─ copy is fresh enough ──────────────► send it
     └─ copy is old or missing
            │
            ▼
     Ask the publisher (World Bank, IMF, Yahoo…)
        ├─ success ─► save copy with timestamp ─► send it
        └─ failure ─► send the last copy, flagged "cached", or say "unavailable"

  Separately, every 12 hours (and at start-up):
     Congress list · Wikidata leaders · Wikipedia conflicts · Wikipedia elections
     · each war's Wikipedia article (sides, status, start date)
            │
            ▼
     Added to the app's knowledge graph, replacing the previous batch

  Separately, every 30 minutes:
     27 trusted news feeds ─► de-duplicate into stories ─► link to profiles
            │
            ▼
     Signals (new CEO, new prime minister, election winner) checked against the records
        ├─ 2+ trusted outlets or official, differs ─► "reported" fact + warning
        └─ otherwise ─► listed only
```

**Wars and their sides.** Wikipedia's conflict list groups wars into rows (the 2026 Iran war
sits inside the "Arab–Israeli/Iran–Israel proxy wars" row). For every war linked in a row, the
app reads that war's own article and its "Belligerents" box: who fights on each side, who only
supports, and who has left ("until 2024", "2006–2009"). Any linked war that its own article
calls ongoing becomes a separate entry with its sides, inherits the row's death-toll band, and
is listed under it. Countries become links to their profiles; non-state forces (Hezbollah, the
RSF, the Houthis…) become **armed group** profiles. Conflicts older than 15 years whose
article covers their whole history are marked *long-running*, because their sides can include
states and groups that no longer fight; they are kept out of "wars between states" and the
"who is fighting" map. Wikipedia only allows a few hundred anonymous requests an hour, so
articles are fetched 20 at a time through one polite queue; a failed refresh is retried after
5 minutes and the last good copy stays in use meanwhile.
**Checking freshness yourself.** The **Data** page (top bar, or <http://localhost:5180/data>)
shows each provider's state — *ok*, *stale* (the source failed and the last good copy is
being served) or *failing* (no copy to fall back on) — when each background loader last
downloaded its data, each news feed's status, and a consistency audit of the whole
dataset. Facts loaded in the background show "Retrieved … ago"; scheduled events whose date
has passed switch to "outcome not recorded" automatically instead of staying "scheduled".

**Leaders: live data vs. the hand-checked list.** When Wikidata says a different person took
office *after* the June 2026 check, the app trusts the newer record: it closes the old term,
shows the new person, and puts a warning on the old person's profile and on other ministers
of that country (they may have changed too). Example found this way: Andy Burnham replacing
Keir Starmer as UK Prime Minister (July 2026). Any other disagreement is shown as a **verify**
note — the app never silently picks one.

**Your own data never leaves your computer.** Notes, positions, watchlists and the Obsidian
vault sync are stored in `data/` (SQLite) and are not sent to any of the sources above.
Requests to publishers contain only what is needed to look something up (for example a
country code or ticker).

## Labels you will see next to numbers

| Label | Meaning |
|---|---|
| official | Published by a government, central bank or international organisation |
| delayed | Market price, typically 15+ minutes old; the time is shown |
| curated | From the hand-checked dataset, verified in June 2026 |
| community | From Wikidata or Wikipedia — usually current, but check before relying on it |
| forecast | An institution's projection (IMF, Fed) — not an outcome and not a survey consensus |
| estimate | An estimate (e.g. conflict deaths, analyst EPS forecasts) |
| reported | Stated by trusted news outlets (named next to it) but not yet in an official or structured record — verify |
| manual | Something you typed in |

## Cross-checks between sources

The World Bank and the IMF are compared country by country for GDP, real growth, inflation, unemployment, the current account and population (the World Bank's latest year, against the IMF's figure for the same year). Figures that conflict are listed in the audit on the Data page and marked on the country's profile, with both values side by side. Tolerances and rules: *Cross-source agreement* in `docs/ARCHITECTURE.md`.

Every request to the sources on this page goes through one network gate per host: rate-limited services (Wikidata, UN Comtrade, the SEC) get one or a few requests at a time with pauses between them, `Retry-After` is honoured, and a source that keeps failing is skipped for a while instead of slowing every page down. The Data page's *Network* card shows each host's state.

## Known gaps

- No openly licensed prices for lithium, cobalt, nickel or rare earths; uranium and coal
  futures trade rarely (prices older than 10 days show only the price and its date).
- Daily yield curves only for the US, euro area, UK, Japan and Canada; monthly 10-year
  yields for ~30 countries; policy rates for ~40 central banks.
- Recent trade years are incomplete until countries report to UN Comtrade.
- Sub-national areas (states, counties) are loaded for the United States only.
- Curated facts can go stale. Use **Report an inconsistency** on any profile; corroborated
  news signals flag many changes automatically, but only for roles and events the signal
  rules recognise.
- Some publishers' feeds may block automated readers or change address; the Data page shows
  which feeds failed and why. Headline searches for wire services depend on Google News.
- The live formats of the newer sources (sanctions lists, Federal Register, Census, Treasury
  Fiscal Data, Eurostat COFOG, JODI, USDA PSD, EIA, AGSI+) are read from their published
  specifications and tested on sample files (`npm run check:econ`); if a publisher changes a
  format, that source shows as failing on the Data page instead of showing wrong numbers.
- Bilateral tariffs are shown only where the US is one side; sanctions name matches are not
  identity checks; hand-entered central-bank and summit dates need adding each year (the
  audit warns 90 days ahead).

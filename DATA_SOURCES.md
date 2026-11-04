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
| 10-year government bond yields (monthly) | OECD, via the St. Louis Fed (FRED) | 24 h | OECD terms |
| Daily yield curves | US Treasury · European Central Bank · Bank of England · Japan Ministry of Finance · Bank of Canada | 6 h | Public / free with attribution |
| Fed projections (FOMC medians) | Federal Reserve, via FRED | 24 h | Public domain |
| Company financials (US filers) | SEC EDGAR | 24 h | Public domain |
| Share prices, FX, commodity futures, fed funds futures | Yahoo Finance (unofficial endpoints) | 5–15 min | **Personal use only** — see below |
| Analyst consensus (targets, ratings, estimates) | Yahoo Finance | 6 h | **Personal use only** |
| Headlines for one profile | Google News RSS (fallback: GDELT) | 1–2 h | **Personal feed-reader use**; links go to the publisher |
| Trusted news feeds (newsroom, profile news, signals, "In the news" map layer) | Publishers' own RSS feeds, official press-release feeds, and wire headlines via Google News site searches — [details below](#trusted-news) | 30 min | Headlines and links only, for personal feed-reader use; each article stays with its publisher |
| Members of Congress | `unitedstates/congress-legislators` | 24 h | Public domain (CC0) |
| Heads of state/government, US governors, their parties | Wikidata | 24 h | CC0 |
| Ongoing wars and conflicts, deaths by year | Wikipedia "List of ongoing armed conflicts" (which cites ACLED and UCDP) | 12 h | CC BY-SA 4.0 |
| National elections (this year and next) | Wikipedia "national electoral calendar" pages | 12 h | CC BY-SA 4.0 |
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

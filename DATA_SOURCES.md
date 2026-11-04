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
| Headlines | Google News RSS (fallback: GDELT) | 1–2 h | **Personal feed-reader use**; links go to the publisher |
| Members of Congress | `unitedstates/congress-legislators` | 24 h | Public domain (CC0) |
| Heads of state/government, US governors, their parties | Wikidata | 24 h | CC0 |
| Ongoing wars and conflicts, deaths by year | Wikipedia "List of ongoing armed conflicts" (which cites ACLED and UCDP) | 12 h | CC BY-SA 4.0 |
| National elections (this year and next) | Wikipedia "national electoral calendar" pages | 12 h | CC BY-SA 4.0 |
| Country names, codes, capitals, currencies, borders | `world-countries` package | Fixed (updates with the package) | ODbL 1.0 |
| Map shapes | Natural Earth (`world-atlas`), US Census (`us-atlas`) | Fixed | Public domain |

The full list with links is in the app (every profile has a **Sources** section) and in
`server/data/curated.ts` (`SOURCES`).

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
```

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
| manual | Something you typed in |

## Known gaps

- No openly licensed prices for lithium, cobalt, nickel or rare earths; uranium and coal
  futures trade rarely (prices older than 10 days show only the price and its date).
- Daily yield curves only for the US, euro area, UK, Japan and Canada; monthly 10-year
  yields for ~30 countries; policy rates for ~40 central banks.
- Recent trade years are incomplete until countries report to UN Comtrade.
- Sub-national areas (states, counties) are loaded for the United States only.
- Curated facts can go stale. Use **Report an inconsistency** on any profile.

# Terminal research: how the Bloomberg Terminal works, and what this product takes from it

A design study written for the Global Intelligence Terminal from research gathered in November 2026.

> **Not affiliated.** The Global Intelligence Terminal is an independent, self-hosted project. It is
> not affiliated with, endorsed by or connected to Bloomberg L.P. "Bloomberg" and "Bloomberg
> Terminal" are trademarks of their owner. This document studies the published design of a
> well-known product in order to learn general principles. The terminal's function names appear
> here only as evidence of how it works, not as names for this product.

**How to read it.** Five researchers each studied one facet of the Bloomberg Terminal from published
material: Bloomberg's own help pages and guides as hosted by universities, library guides,
Bloomberg's API developer guide, product pages, trade press, critics and an accessibility audit.
Their findings are condensed here and mapped onto this product.

- Bracketed tags such as [I10] point to the numbered sources in section 5.
- **(memory)** marks a point a researcher recalled but did not confirm in a page read during the
  research. Treat it as unverified.
- **(snippet)** marks a point seen only in a search-result excerpt: www.bloomberg.com refused
  automated requests, so its UX blog, company stories and press releases were seen this way.
- **Low confidence** marks a finding its researcher graded low.
- Status values: **Built in this round**; **Already present** (before this round); **Planned**
  (section 4, or a smaller follow-up); **Does not apply** (with the reason).

Contents: 1 Summary · 2 The five facets (2.1 Interaction · 2.2 Workspace · 2.3 Functions · 2.4 Data
· 2.5 Information design) · 3 What we deliberately do not copy · 4 Roadmap · 5 Sources

## 1. Summary

### How the terminal operates

**Two nouns and a verb.** A security is loaded by typing its ticker, an optional venue code and a
yellow market-sector key (`IBM US <Equity>`); a function is a short mnemonic, mostly two to five
letters (`DES` for description, `HP` for historical prices); the green `<GO>` key, which is Enter,
runs it: `VOD LN <Equity> HP <GO>` [I1], [I2]. The loaded security stays in the panel's toolbar
until it is replaced, so later functions are typed bare [I2]. Some functions need no security
(world monitors such as `WEI`, `TOP` and `ECO`); the rest act on whatever is loaded, and parameters
after a code skip screens (`GP W` for a weekly chart, `TOP OIL`) [I6], [I10]. The command line tops
every screen and is also the search box: typing opens suggestions, an exact mnemonic is
pre-selected, and free text followed by `<GO>` runs a search [I10].

**One screen anatomy.** Every function shares the same regions: a toolbar (menu, back and forward,
recent securities, export, help), the command line, a function area under a red title bar, and an
information strip. Amber marks what the user can change, and numbered options ("Number `<GO>`")
make every click a keystroke: "Once you learn about these elements, you can use any function" [I10],
[V1].

**Panels for drilling, linked components for watching.** The classic terminal opened up to four
independent panels, each with its own command line, loaded security and history; newer builds allow
up to 16 tabs [I10], [W1]. Launchpad is a separate dashboard of always-on components (monitors,
charts, news panels, calendars) arranged as View, Pages and Components. Components joined into a
lettered, coloured group follow one security, so a click on a monitor row re-targets the linked
chart and news panel [W3], [W4]. A monitor holds up to 30 columns from more than 280,000 data
items, and up to 2,000 securities [W4].

**Fields and pricing sources.** Every number on screen is a named field (`PX_LAST`, `BID`)
described in a searchable dictionary (`FLDS`) [D1], [D3]. Every price comes from a named pricing
source (an exchange, a contributor, or a composite such as BGN or BVAL); the user can set a default
and compare all sources side by side (`ALLQ`) [D1]. The API first sends an "initial paint" with
every subscribed field and afterwards only the fields that changed; failures, data loss and
reconnects travel on a separate status channel [D1].

**Coded news and an expected-versus-actual calendar.** News from tens of thousands of sources is
tagged to millions of securities and thousands of topic codes, and searches prefer codes to
keywords. A saved search becomes the user's own short code and can become an alert delivered to one
inbox shared with price and economic alerts [W12]. The economic calendar keeps survey,
actual, prior and revised as separate fields, and its data layer defines surprise as the actual
minus the survey median, divided by the survey's standard deviation [F2], [D20].

**Information design.** Colour encodes role: amber for editable, green for up, red for down. A
monospaced grid inherited from an 80x25 hardware terminal keeps columns aligned, and screens load
almost instantly, which is what makes the density usable [V1], [V5], [V8]. Bloomberg treats
consistency as part of the product [I24] and changes the interface in small daily increments
(snippet) [V11]. Its own UX team acknowledges the cost of red-green semantics (snippet) [V4], and an
independent accessibility audit lists further failures [V21].

### Principles that transfer

1. **One registry of functions drives everything.** The command line, menus, help and the list of
   related functions are generated from it, so they cannot disagree.
2. **One input for commands and search.** Enter always leads somewhere useful, and the loaded
   entity persists so that a bare code acts on it.
3. **A fixed page skeleton.** The function bar, command line and status line sit in the same places
   on every screen, and the same control is always in the same place.
4. **Every number is a defined field** with a source, a period and an as-of time. Sources are
   compared rather than overwritten, and revisions are kept.
5. **Expected, actual, prior and revised** form the grammar of every scheduled event, from a data
   release to an election.
6. **Independent panes for drilling, linked panes for watching.**
7. **Density only together with speed, colour only together with a second cue** such as a sign, an
   arrow or a letter.
8. **Codes are accelerators.** Plain-language search, menus and the map reach every function too.

What does not transfer: the live help desk, chat and messaging, order entry, entitlements and
single-seat log-in, multi-monitor window management, licensed data (economist surveys, composite
prices, CDS, analyst estimates, Bloomberg's news text and codes) and the look itself (section 3).

### What this round built

This round built the function registry, the command line, the function bar, the generated help and
key pages, the search page, the status line and the four-pane workspace, together with flashing
cells, the `EQ` and `FXM` boards, table export, a compact density and a choice of colours for rises
and falls. It reuses what was already present: per-figure sources and retrieval times, World Bank
versus IMF cross-checks, alerts, the graded calendar, notes, the knowledge web and live updates.
The tables in section 2 give the files and the details.

## 2. The five facets

### 2.1 Interaction: command line, function codes and keys

#### What the terminal does

- **The grammar.** Guides write commands as `TICKER <MARKET> FUNCTION <GO>`, with keys in angle
  brackets. `IBM US <Equity> <GO>` loads IBM and shows its menu of functions;
  `VOD LN <Equity> HP <GO>` loads Vodafone in London and runs historical prices in one line. Other
  classes work the same way (`EUR <Curncy>`, `SPX <Index>`, `CL1 <Cmdty>`, `CT10 <Govt>`). Bonds are
  ticker, coupon and maturity (`F 12 07/16/31 <Corp>`); a CUSIP, ISIN or BBGID can replace a
  ticker; two securities can precede one function (`IBM <Equity> MSFT <Equity> COMP <GO>`); a sector
  key alone opens that sector's menu. "If you do not hit the green `<GO>` button Bloomberg will not
  do anything" [I1], [I2], [I3], [I4], [I5].
- **Two kinds of function, and parameters after the code.** Non-security functions (`WEI`, `WB`,
  `TOP`, `ECO`, `MAIN`) need nothing loaded; security-specific ones (`DES`, `GP`, `HP`, `FA`, `CN`,
  `DVD`) act on the loaded security and carry an asterisk on official cheat sheets. Parameters
  follow the code: `MSFT US <Equity> GP W <GO>` sets a weekly graph and, in the cheat sheet's words,
  "by-passed 2 additional steps"; `TOP ECO`, `N STK`, `NI HOT` and `ECST S` open variants directly.
  A function that does not fit the loaded security answers that "the analysis and security type are
  incompatible" [I2], [I6], [I7], [I8], [I9], [I10].
- **The command line is also the search box, and Enter never dead-ends.** Typing without `<GO>`
  opens a list of functions (mnemonic and title) and securities; a sector key filters it, and an
  exact mnemonic is highlighted so that `<GO>` completes it. No public source documents the
  ranking: a Quick Start tip says results appear "in order of highest relevance" and that a company
  popular in the news ranks higher, and weighting by the user's own usage is (memory); medium
  confidence [I10], [I11], [I12]. Free text plus `<GO>` runs a search: `IBM Q3 2013 REVENUE <GO>`
  returns a targeted answer with data and a chart that lead on, results are grouped by category,
  an ambiguous name ("Coca Cola") lists both the equity and the bond issuer, and `SECF` is an
  explicit finder [I2], [I9], [I10], [I11]. What a mistyped mnemonic showed on older panels is
  (memory).
- **Keys grouped by colour.** Yellow keys on F2 to F12 name market sectors (Govt, Corp, Mtge,
  M-Mkt, Muni, Pfd, Equity, Cmdty, Index, Crncy, Client); green keys act (`<GO>` is Enter, then
  Menu, End/Back, Help on F1, Search, News, the page keys, Print, Home); red keys stop (Cancel is
  Esc; Conn/Dflt logs in and out). A Panel key cycles the panels, and Alt+K shows a picture of the
  keyboard [I1], [I13], [I14], [I15], [I16], [I17], [I18], [I19].
- **Help and menus.** Help pressed inside a function opens its help page ("an explanation of the
  business solution the function provides along with how-to instructions, definitions,
  calculations, and links to related documents and videos"); `DES <HELP>` opens it without running
  the function; Help pressed twice opens a live chat with the 24-hour help desk [I6], [I10], [I11],
  [I15], [I20]. `MAIN` is the root menu, a sector key opens a sector menu, and loading a security
  opens a categorised menu of the functions for its type. Rows are numbered, so "Number `<GO>`"
  turns a route into keystrokes (`4 <GO> 1 <GO>`), and each row shows the mnemonic beside the
  title, so browsing teaches the codes; guides recommend menus first and codes later [I2], [I6],
  [I10], [I20], [I22]. An "Alt-Mode" reaches unnumbered items by keyboard; that it overlays hints
  is (memory).
- **Context, history and related functions.** "The loaded security remains the active security on
  the panel until you load a different security"; it is shown in the toolbar beside the mnemonic,
  each panel keeps its own, and `STO` and `RCL` copy one to another screen [I2], [I6], [I11],
  [I21]. On-screen arrows "act more like the forward and back buttons in a web browser", a History
  key cycles earlier command lines, `LAST` lists the last 8 functions, and `FAVE` keeps favourite
  buttons on each tab; personal defaults follow the login [I1], [I3], [I4], [I6], [I10], [I15].
  The Menu key lists related functions, and the 2026 help page adds "Suggested Functions" with
  "brief hints to let you know why the functions could be valuable to you" [I9], [I10], [I11],
  [I22].
- **Codes, cheat sheets and expert speed.** Codes run from one to six characters, mostly two to
  four; families share a prefix (W for world monitors, EC for economics, FX for currencies, G for
  graphs, N for news), and utilities are plain words (`MAIN`, `HELP`, `LAST`, `EASY`, `FAVE`,
  `GRAB`, `TOP`, `READ`, `LIVE`, `OFF`) [I5], [I7], [I10], [I23]. Official cheat sheets are two
  dense pages grouped by workflow, with an asterisk on security-specific functions, and help pages
  offer tours [I2], [I7], [I8], [I22]. Experts are fast because the cursor lives in the command
  line, compound commands and parameter tails skip dialogs, Tab moves between editable fields,
  count prefixes repeat keys (`13 <Page Fwd>`), defaults remove typing and macro buttons store
  sequences [I6], [I10], [I13], [I14], [I15].
- **The redesign that kept the codes.** Bloomberg NEXT, announced in February 2012 as a multi-year,
  $100 million project "to improve the discoverability and usability of the Core Terminal's
  functionality", added natural-language search to the command line, autocomplete that
  pre-highlights exact codes, categorised related menus with breadcrumbs, tabs, Suggested
  Functions, a colour scheme for colour-vision deficiency (`PDFU COLORS`) and help tours. Old key
  behaviours stayed available as preferences, and the mnemonic layer was never replaced. There were
  about 325,000 subscribers in 2022 [I1], [I10], [I25].
- **What exists only at Bloomberg's scale.** The help-desk chat, messaging, sending screens to
  colleagues, real-time exchange entitlements, order entry (EMSX, FIT, TOMS), biometric log-in with
  a single session, and an Excel add-in whose data "must remain on a licensed Bloomberg
  workstation" [I2], [I6], [I10], [I21].

#### What we take from it

| Principle | How this product applies it | Status |
|---|---|---|
| One grammar: entity, function code, parameters; Enter runs | `DEU BUDG`, `USA CHN TRADE`, `AAPL WEB 2`, `NEWS china`. The parser in `shared/functions.ts` splits the words; `server/command.ts` resolves them to one or two entities by three- or two-letter country code, exact name, alias or ticker, then the best strong match, trying every way of cutting the words in two. | Built in this round |
| A registry of functions is the single source of truth | `shared/functions.ts` gives each code a title, area, description, examples, related codes, the entity types it acts on, its parameters and its address. A code defined twice is an error when the registry loads. | Built in this round |
| Two kinds of function, and a reason when one does not fit | Each entry says whether it needs an entity, takes one optionally, or needs none. A mismatch answers in one line (for example that BUDG works on countries and organizations) and lists the codes that do apply. | Built in this round |
| A command and a link are the same thing | Words after a code become query parameters (`WEB 2`, `MAP inflation`, `HELP CAL`, `NOTE NEW`), so every function screen has an address that can be bookmarked, linked from a note or opened in a pane. | Built in this round |
| The command line is also the search box | One input (`src/components/CommandLine.tsx`) with grouped suggestions: Functions, Entities, Your notes and "Search everything". An exact code is pre-selected; functions that act on the loaded entity come first; typing an entity offers the functions for it; Tab completes; Shift+Enter shows an entity on the map. | Built in this round |
| Enter never dead-ends | A valid command runs; one clear entity opens its profile; anything else opens `FIND` (`/find`) with matching functions, entities and notes. A mistyped code gets "did you mean" suggestions by edit distance, shown in the status line. | Built in this round |
| The loaded entity persists | A chip left of the command line shows it (click to clear); a bare code acts on it; an address that names an entity loads it; each workspace pane keeps its own. | Built in this round |
| History and repeat | Up and Down in an empty command line walk the last 50 commands, kept in this browser; `LAST` runs the previous command again. | Built in this round |
| History that follows the user, and a numbered list of recent work | Keep history on the server so it survives browsers; a numbered list of recent function and entity pairs (the terminal's `LAST` lists 8); drop-downs of recent entities and functions. | Planned |
| Related functions, numbered | The function bar's "Next" chips come from each entry's related list, and pressing 1 to 9 runs one. A chip that cannot run on the loaded entity is dimmed and its tooltip says why. | Built in this round |
| Related functions ranked by use and by data | Order the chips by the user's own most common next function, and hide those with no data for the loaded entity, with a ranking that can be explained. | Planned |
| Help one key away, generated | F1 opens help for the function on screen (`/help?fn=CODE`); `HELP` lists every function by area; `KEYS` lists every key from `src/keys.ts`. Both pages are generated, so they cannot drift from the code. | Built in this round |
| A local substitute for the help desk | F1 pressed twice opens data health for the current screen: which source failed and when it last refreshed. | Planned |
| Numbered rows everywhere, and a hint mode | Number the primary lists (search results, headlines, menu rows) so that a typed number opens a row, and show key hints while Alt is held. Only the related chips are numbered so far. | Planned |
| Menus generated from the registry, with the code beside every title | `HELP` (aliases `MAIN` and `MENU`) shows the functions by area with their codes and examples. Menus per entity type with breadcrumbs are not built yet. | Built in this round |
| Favourites and defaults | A favourites bar of saved commands, and defaults (home country, base currency, chart period) so that most commands need no parameters. | Planned |
| A printable cheat sheet and a first-run tour | A two-column sheet generated from the registry, entity functions marked; a short tour that a code reopens. | Planned |
| Ordinary keys, documented in one place | Enter runs, Esc leaves, `/` or Ctrl+K goes to the command line, a letter typed while nothing has focus goes there too, F1 opens help, Alt+Left and Alt+Right go back and forward; the workspace keys are in 2.2. There are no F2 to F12 bindings, because browsers reserve several of them. | Built in this round |
| Naming rules for codes | Two to five letters, plain words where possible (BUDG, TRADE, SANC, WAR, ELEC, BOARD, FIND), case-insensitive, and aliases rather than renames. | Built in this round |
| Every route leads to the same entry | A typed code, a typed name, a row in help, a related chip and a click on the map all reach the same registry entry and address. | Built in this round |
| Live help desk, chat, order entry, entitlements, biometric log-in | A single-user, self-hosted tool on public data has no desk to call, nothing to trade and no licence to enforce. | Does not apply |

### 2.2 Workspace: panels, linked components, monitors, alerts and personal settings

#### What the terminal does

- **Independent panels and tabs.** Up to four panels (windows numbered 1 to 4), each "an independent
  workspace" with its own toolbar, command line and function area. A function runs on the active
  panel, whose title bar turns blue, and the Panel key rotates between them; a monitor's click
  actions can send a function to a chosen panel, keeping one for drilling down. Users spread panels
  over two to six monitors [I1], [I11], [I17], [I22], [W1], [W2], [W3]. Newer builds allow "up to 16
  screens", each tab showing its mnemonic, and restore the layout at log-on, but "You cannot
  restore a tab after you close it" [I10], [I25].
- **Launchpad: View, Pages, Components.** `BLP` opens a dashboard in which a View (the whole
  arrangement, often across monitors) holds Pages and a Page holds Components: monitors, charts,
  chart grids, news panels, quote lines and calendars. A component browser shows the 25 most popular
  components with ratings and previews, and `LLP` turns any function into a component
  (`WEI <GO>`, then `LLP <GO>`) [I1], [W3], [W4], [W5], [W6]. That Launchpad grew from an earlier
  "New Worksheet" idea comes from a company story (snippet) [W7].
- **Component groups.** "When a ticker code is changed in any one component ... all linked
  components will react and change accordingly." Groups are named and lettered ("Group-1, #A"), and
  a help-desk transcript speaks of "the blue A" and "Green B", so each has a letter and a colour.
  Clicking a monitor row sends that security to the group's chart and news panel; a monitor group
  instead carries the whole list to a news panel ("news for everything in this monitor"); unlinked
  components stay fixed [W3], [W4], [W8], [W9].
- **Saved views and monitors.** Views are saved by hand ("Any time you change any Component, you
  need to save the View"), Launchpad ships sample views by asset class and role [I6], [W3], [W9],
  and `MNRS` restores a monitor from up to ten earlier versions [I1], [W3], [W4], [W6]; the make-up
  of a typical macro desk page is (memory). A monitor's rows are securities and its columns
  fields: up to 30 columns from more than 280,000 data items, and up to 2,000 securities. Rows come
  from typing, from an index expanded into its members, from a list imported as a fixed copy or a
  live link, or from pasted tickers. The worksheet (`W`) starts with Last Price, Net and %1D, groups
  rows and exports to Excel, and a click on a row can run a function in a chosen panel [W3], [W4],
  [W8], [W10]. Sorting by a header click is (memory).
- **Standard boards, and how change is shown.** `WEI` (world equity indices), `MOST` (most
  active), `IM` (money markets), `FXC` (FX matrix) and `WECO` (economic calendars) are fixed
  starting points that can be pinned as components [I6], [W1], [W11]; their inner layout is
  (memory). Amber marks editable fields and a white outline clickable items; news panels highlight
  up to five keywords, each in its own colour; a colour scheme for colour-vision deficiency applies
  globally [I10], [W1], [W4]. Cells that flash when a tick arrives, tinted by direction, are
  (memory): no public source describing them was found.
- **Staleness and delay. Low confidence.** Exchanges charge separately for real-time feeds, so users
  without an entitlement see delayed prices, and boards carry a time column [I1]. How delayed or
  stale values are marked on screen is (memory).
- **Alerts and their delivery.** `ALRT` covers custom conditions, "when a company's ratings change,
  or when an important economic indicator is released", and alerts are made where the data is: a
  news search, a calendar release ("Set audio alert"), an events list, a monitor row; `SALT` offers
  more than 200 ready-made news alerts [I7], [I11], [W2], [W12], [W13], [W14]. Each alert goes to
  one or more channels: the Alert Catcher (`BLRT`, one inbox shared with price and economic
  alerts), a popup, a sound or spoken headline, a real-time or digest message, or a phone
  notification. "Suspend Alert" keeps the search intact, and a preview with a result count stops an
  alert from "swamping" the user [I9], [W2], [W12], [W13], [W16]. Spread alerts between two
  securities come from a video (snippet) [W15]; technical-study alerts and the full list of alert
  sources are (snippet) and (memory).
- **Personal defaults and export.** "Personal default settings are specific to the user login name
  and not the machine"; `PDFQ` covers "time zone, base currency, country, etc" [I1], [I6], [I7],
  [I10], [W2]. How time zones appear on screens is low confidence and largely (memory). Every
  panel toolbar has an Export icon with a fixed menu, but "Not all screens can be Grabbed and some
  screens have custom export options"; tables export from menus that differ by screen ("97)
  Export" on some); a drag icon moves "only the securities and/or data from the function's current
  page"; download limits apply [I6], [I22], [W1], [W10], [W17], [W18].
- **Notes and saved searches.** Every window toolbar has an icon for notes on securities, and
  `NOTE` tags notes to securities, people, sectors, regions or themes (snippet) [I10], [W19], [W20];
  note markers on charts are (memory). News searches combine keywords, topic codes, tickers, people
  and sources with AND, OR and BUT NOT; Save Search gives a short name that becomes a personal code
  (`NI BUFFBALL <GO>`); `MYN` builds personal news pages from sections [I9], [W12], [W16].

#### What we take from it

| Principle | How this product applies it | Status |
|---|---|---|
| Independent panes, each with its own function, entity and history | `BOARD` opens one to four panes (one; two side by side; one large and two stacked; two by two). Each pane is this app in a frame with a slim header, its own command line, back and forward, and its own loaded entity (`src/pages/BoardPage.tsx`, `src/components/PaneShell.tsx`, `src/board.ts`). Dividers can be dragged or moved with the arrow keys. | Built in this round |
| One key moves between panes, and the active pane is marked | Alt or Ctrl with 1 to 4 goes to a pane and puts the cursor in its command line; F6 and Shift+F6 go round; the active pane is highlighted; on a narrow screen one pane shows at a time, with a switcher. | Built in this round |
| Link groups by letter and colour | A pane joins group A, B or C, and panes with the same letter follow the same entity. The letter is always shown beside the colour, and unlinked is the default. A pane whose function does not act on the new entity stays where it is, and parameters typed earlier are kept. | Built in this round |
| A group that follows a whole list | News or calendar for every entity in a linked watch list (the terminal's monitor group). | Planned |
| Saved and starter workspaces | The workspace on screen is restored on the next visit; saved workspaces (up to 40) live with the account when signed in and in the browser otherwise; `BOARD macro` opens one by name. Starters: Macro desk (CAL, RATES, FX, TOP), Country desk (DES, ECON, NEWS, MAP, linked as group A on the loaded or selected country) and Markets (EQ, CMD, FXM, TOP). | Built in this round |
| Autosave with history, reopen a closed pane, export and import | Keep recent versions of each workspace and watch list with one-click restore (the terminal's `MNRS` keeps ten); one JSON file per workspace as backup and import. | Planned |
| Pin any screen to a board | Turn any function and its parameters into a tile on a board page, with a tile browser (the `LLP` idea). | Planned |
| Watch lists | Lists of entities with prices where they have one (`WL`), and positions (`PORT`). | Already present |
| Watch lists as monitors | Columns chosen from the indicator catalogue, sorting and grouping by region or bloc, rows imported from a group as a copy or as a live link. | Planned |
| Standard boards as starting points | `EQ`: the main share index of each large economy by region, with its level and its change over a day and a year. `FXM`: the currencies of the largest economies against each other. The economies come from GDP weights, not a typed list; the quotes are Yahoo's, delayed. | Built in this round |
| A live value says when it changes | A changed number flashes briefly with an up or down arrow (`src/components/Tick.tsx`): never on first paint and never when the shown text is unchanged; the arrow and hidden text state the direction without colour; under reduced motion the tint does not fade. | Built in this round |
| Say how old every value is | Every figure carries its source, period and retrieval time; missing values show "no data", never 0; out-of-date yields are flagged rather than shown as current; the data page lists every provider's state. | Already present |
| Freshness on every cell | A delay badge on quotes (for example 15 minutes, or end of day), staleness rules by cadence, and a freshness mark on each pane. | Planned |
| One alert system, set from where the data is | `ALRT`: rules watch entities, watch lists, the entities in notes, positions or places on the map, with an importance from 1 to 10 and thresholds for price %, currency % and the 10-year yield in basis points; "Alert me" sits on every profile and map preview. | Already present |
| Several deliveries, and pause without deleting | The inbox, browser notifications, and webhooks to Slack, Discord, ntfy or a JSON endpoint on an allowed host; rules can be paused and resumed. | Already present |
| Previews, digests and ready-made alerts | "Would have fired N times in 30 days" before saving; hourly or daily digests; a starter set (major central-bank decisions, new sanctions programmes, releases graded 8 or more); a bell on calendar rows; alerts on the spread between two series. | Planned |
| Appearance that follows the user | Settings (`SET`) hold the density (comfortable or compact) and the colours for rises and falls, kept with the account when signed in. | Built in this round |
| Defaults that change behaviour everywhere | Home country, comparison group, base currency, units, default chart range, news languages and default workspace. | Planned |
| A clock that states its zone | The status line shows local time with the zone's abbreviation; hovering gives the date, the zone name and UTC. | Built in this round |
| Time zones handled throughout | A switch between "my time" and the event's local time in the calendar, countdowns for today's items, and a market-hours view. | Planned |
| Export, identical on every screen | An Export menu in the function bar finds the tables on the page: copy one for a spreadsheet (tab-separated, one cell per column) or save it as a CSV file that records the page and the time. | Built in this round |
| Export beyond tables | An image of a pane with title, entity, sources and time; XLSX; a print style; copy link; stable local CSV or JSON addresses that a spreadsheet can pull. | Planned |
| Notes attached to entities | Rich notes with `[[links]]` to notes and entities, backlinks, a graph and Obsidian sync; `NOTE` and `NOTE NEW` open or start notes about the loaded entity. | Already present |
| Notes in context | A note button in each pane header, pre-tagged with the pane's entity and linking to the exact view; note markers on charts and pins on the map. | Planned |
| Sharing with colleagues, desk pages, message rules, mobile push | A single-user tool has no colleagues on the system; export and import replace sharing. | Does not apply |

### 2.3 Functions for a macro and geopolitics user

#### What the terminal does

The functions researcher found one pattern: a few dozen dense, single-purpose screens share one grammar.
Monitors need no loaded entity and are region-grouped, sortable tables in which every number opens
its history; entity screens apply to whatever is loaded; short parameters make every view
addressable (`TOP OIL`, `MNI OIL 1W`, `BTMM <country>`) [I9], [W12], [F1].

- **Economic calendar (`ECO`).** Releases and central-bank, government, commodity and industry
  events, by region, country and type, saved as custom calendars. Documented columns: date and time;
  a relevance column of lit bars (more bars, more users with a notification set); event; period;
  `Surv(M)`, the median of Bloomberg's economist survey; Actual, filled in at release; Prior. A row
  opens release details with a history chart and related news. In the data layer each event also
  carries the revision and a surprise score, covering 2,000+ events in 100+ countries back to 1997
  [I9], [F1], [F2]. A Revised column, a bell per row and a page of individual forecasts are
  (memory).
- **Statistics, forecasts and country pages.** `ECST` shows one country's series from several
  sources in a category tree, with one transformation selector for the whole table, export, "Export
  to Workbench" and keyword search [I9], [F1], [F3]. `ECFC` shows actuals and then three years of
  forecasts with median, high, low and the contributing analysts (medium confidence) [I9], [F1],
  [F4] (snippet). `COUN` has Profile, Economics and Risk tabs (the profile names who
  is in charge, linked to biographies), known from a search summary; `IFMO` sets inflation against
  target and forecast; `STAT` holds league tables; the layout of the cross-country matrices
  (`ECMX`, `GEW`) is (memory) [W12], [F5], [F6], [F7].
- **Rates.** `BTMM` puts one country's main rates and releases on one screen, and its fixed grid of
  panels is (memory) [I9], [W11], [F8] (snippet). `WB` lists government yields at a chosen
  maturity with each rate's deviation from its average, spreads against a chosen benchmark, and a
  chart behind every number [I9], [W11], [F1]. `GC` plots curves for several dates and a second
  country with the spread in basis points beneath, and a click on a tenor opens its history [W11],
  [F1]. `WIRP` derives the implied path of policy rates from overnight index swaps and futures
  mapped onto each central bank's meetings; its table is (memory), and Bloomberg's page was seen
  only as a search summary [I9], [F11], [F12].
- **Currencies and commodities.** `WCRS` ranks currencies against a base by return, rates,
  volatility, carry and purchasing power; `FXC` is a cross matrix with heat colouring and saved
  baskets; `FXFC` compares forecasters with forwards; `FXCA` converts at past rates [I9], [F7].
  `GLCO` groups commodities by sector with movers; `CT` shows a commodity's contract months, its term
  structure; `OPEC` shows members' production and spare capacity [I9], [F7], [F13]. A function named
  `CMDX` could not be confirmed.
- **Equity boards.** `WEI` covers world indices (its column layout is memory); drill-down runs from
  an index to its sectors and members (`MEMB`, `MOV`), with ranked returns (`GRR`), an intraday heat
  map (`IMAP`) and `MOST` [I9], [F9], [F10].
- **News.** `TOP` curates the day's stories with variants by region, topic, company or person
  (`TOP Europe`, `TOP Oil`, `TOP GOOGLE`), ranked by "editors' news judgment, breadth of
  readership, relevance and time", and rotates headlines every 60 seconds with a Pause button [I9],
  [W12], [F14]. `N` takes natural language (`N MYANMAR SINCE OCT 1`, `N APPLE AND SAMSUNG BUT NOT
  IPHONE`) and prefers codes: `N APPLE` returns stories coded to Apple, and quotation marks force a
  keyword search. It shows the interpreted criteria with "Did you mean", and an advanced editor
  shows stories per hour before a search is saved [W12], [F15], [F16]. `NI` loads a topic code,
  `TNI` intersects two, `2 <GO>` inside a story lists its codes, and type codes mute noise such as
  tables and computer-generated stories [W12]. `READ`, `MNI`, `NT` and `MVP` measure attention, and
  `CN` is the same news component filtered to the loaded entity or a list [I9], [W12], [F15], [F17].
- **Sovereign credit and debt.** `CSDR` is one table of the agencies' ratings for all countries; it
  highlights changes inside a chosen look-back and sorts by last update. `RATC` lists actions across
  issuers, `CRPR` one issuer's ratings and history, `SOVR` sovereign CDS and `SRSK` a model default
  probability [I9], [W11], [F1], [F7], [F18]. `DDIS` charts debt outstanding by maturity year (for
  France, about EUR 2.5 trillion across 201 issues, average maturity 8.88 years) with click-through
  to the bonds; `DEBT` and `AGGD` show holders [I9], [F1], [F18].
- **Risk, politics and sanctions.** A function called `CRSK` could not be confirmed. Documented
  instead: a country risk assessment with scores for 80+ countries and sub-scores for currency,
  banking and sovereign risk, a country risk premium (`CRP`), and geopolitical country-of-risk scores
  announced in June 2025 with a threat-intelligence partner (29 threat types, company-level scores
  for about seven million companies), the last seen only through search summaries [F19], [F20],
  [F21]. **Low confidence:** government, elections and sanctions are thinly documented. `BGOV` tracks
  US legislation and regulation; no dedicated election function (`ELEC`) or sanctions-screening
  function was found, and how elections and sanctions appear is (memory) [F22], [F23].
- **Maps.** `BMAP` draws energy and commodity assets such as refineries and mines (its layers are
  memory); `ECTR` draws a country's trade with every partner from IMF Direction of Trade Statistics
  and can be backdated; `WM` maps world equity markets [I9].
- **Entity screens.** `DES` describes any security on one screen, each block linking to the fuller
  function [I9], [F24]. `FA` gives statements with annual or quarterly views, a definition per line
  and a chart per row [F18], [F25]; `GP` charts and `HP` tables a series, with the range's high,
  low, average and changes [I9], [F9]. `RV` and its relatives compare peers with editable peer
  sets, column search and statistics [I9], [F10], [F26]. `SPLC` places suppliers left, customers
  right and peers above a company, each link quantified where possible (a supplier earning 21% of
  its revenue from one customer is derived to be 9.5% of that customer's cost of goods); it covered
  35,000 companies in 2011 [F27], [F28], [F29] (snippet). `OWN`, `ANR` and `MGMT` cover holders,
  analysts and management, including how a company did under each chief executive [I9], [F18].
- **Calendars, screening, people and charts.** Domain calendars (`EVTS`, `ACDR`, `CACS`, `NIM`,
  `FOMC`, `CAL`) share one pattern: a dated row linked to its entity, filterable by list or country,
  later linked to its outcome (medium confidence) [I9], [W11], [F17]. `EQS` sets a universe, adds
  criteria with conditions or display-only columns, shows results, saves screens and feeds a
  backtest [I9], [F30]. `PEOP` searches people by age, education, employer, position and place, and
  `BIO` links a person to coded news (its layout is memory) [W12], [F17], [F31], [F32]. `ECWB` builds
  charts from any series, with transformations, annotations and event overlays [F3].
- **Shared rules.** Every number links to its history and every label offers a definition; editable
  inputs look different from data; one toolbar sits in the same place with Actions, Export and
  Settings; every table exports; help for the current screen is one key away [I9], [W12], [F1].

#### What we take from it

| Principle | How this product applies it | Status |
|---|---|---|
| Monitors need no entity; entity functions act on what is loaded | The registry marks each function. TOP, WAR, ELEC, EQ, FXM and CMD need none; DES, NEWS, REL, EV, SRC and NOTE act on any entity; ECON, OUT, BUDG and STAT act on countries (BUDG on organizations too). | Built in this round |
| One description screen for every kind of entity | `DES` opens the profile template shared by 12 entity types: facts, relationships, timeline, events, news, notes and sources, each figure with its source. | Already present |
| A calendar of everything scheduled, graded by importance | `CAL`: data releases, central-bank decisions, summits, votes, budget days and elections, graded 1 to 10 with the reasons shown, the result posted after release (FRED, Eurostat, BIS), and each date labelled by how it is known. | Already present |
| Expected, actual, prior, revised and surprise | Columns for when, importance, country, event, period, expected, actual, prior, revised and surprise, with the source of "expected" named on each row, and a release pane showing past surprises. | Planned |
| A statistics browser for any series | `STAT`: search about 1,700 World Bank and IMF series for a country, chart one, or colour the map with it. | Already present |
| One transformation for a whole table | A category tree of a country's series with one selector for level, change, share of GDP, per head or index, and one for frequency. | Planned |
| Forecasts kept apart from outcomes | `OUT` shows IMF projections apart from outcomes, budgets mark projections, and FOMC median projections are loaded. | Already present |
| Official forecasters side by side | IMF, OECD, European Commission, World Bank and central-bank forecasts with their range and vintage dates, and revisions between vintages as alerts. | Planned |
| Rates, curves and the market's implied path | `RATES`: policy rates (BIS) and 10-year yields; daily curves for the US, euro area, UK, Japan and Canada with the 10-year minus 2-year spread; implied rates from fed funds futures for the US. | Already present |
| Curves over time, spreads to a benchmark, a path per meeting | Curve overlays by date with a second country's spread; a world bonds table with the spread to a chosen benchmark and its z-score; an implied path per meeting where futures are public; a map of banks hiking, holding or cutting. | Planned |
| World boards for indices and currency crosses | `EQ` (the main share index of each large economy, by region) and `FXM` (the largest economies' currencies against each other). | Built in this round |
| Currencies and commodities | `FX`: every currency against the dollar over a day, a month and a year; `CMD`: energy, metals and crops with price, change and a year of history. | Already present |
| Rankers and term structures | A currency ranker against a chosen base (returns, real rates, purchasing power), commodity term structures, and producers and importers linked from each commodity. | Planned |
| Top news ranked without readership data | `TOP`: headlines from trusted outlets ranked by how many of them carry the story, each labelled with its outlet's tier. | Already present |
| News for an entity, by tag | `NEWS` with an entity: the headlines the newsroom's tagger links to it. | Already present |
| Topic codes, a query grammar and saved searches as codes | See roadmap item 5. | Planned |
| Attention from public signals | The map layer "In the news (48 h)" shades countries by how many separate stories named them. | Already present |
| Coverage spikes and page views | Story counts per entity over time against a price, Wikipedia page views, and spike detection feeding alerts. | Planned |
| Sovereign ratings and debt structure | A ratings table as reported, with recent changes highlighted (roadmap item 9); a debt wall of redemptions by year beside the budget data. | Planned |
| Country risk with visible inputs | A risk card whose sub-scores (governance, conflict, sanctions, sovereign, currency) list their inputs, source and date, and company exposure weighted by where a company operates. | Planned |
| Elections as events with an expectation and a result | `ELEC` and election profiles: results read from each election's article, and prediction-market odds per candidate. | Already present |
| Election surprise and market reaction | The surprise against odds or polls, and the index, currency and 10-year yield on the day and the week after. | Planned |
| Sanctions on every entity | `SANC`: the OFAC, EU, UK and UN lists on the map and on profiles, and a plainly worded name-match notice on people and companies. | Already present |
| The map as the home screen | `MAP` colours the map by any layer or indicator (`MAP inflation`). | Already present |
| Any ranked table on the map | A "show on map" action on every ranked table, with the list and the map selection kept in step. | Planned |
| Trade flows by partner and product | `TRADE`: one country with every partner, or a pair as each side reports it (`USA CHN TRADE`). | Already present |
| Relationships with numbers on the links | `WEB` and `REL`: the network around an entity, with sizes, periods and sources on the links. | Already present |
| A three-zone view of dependencies | Suppliers left, focus centre, customers right, peers above; a "quantified only" switch; no invented percentages. | Planned |
| Peers side by side | `CMP` compares countries side by side and finds how any two entities are connected. | Already present |
| Peer statistics | Median, mean, rank and percentile rows, column sets by theme, and an "own history" mode (roadmap item 7). | Planned |
| Chart and table as two views of one series | The same controls for both, the range's high and low with dates, average and changes, and event markers from the product's own events. | Planned |
| Financials from filings | `FUND`: revenue, profit, assets and cash flow from SEC EDGAR. | Already present |
| Holders, leaders' tenure, a screener, a chart workbench | See section 4. | Planned |
| Analyst consensus | `CONS` shows price targets and recommendations from Yahoo's endpoint for personal use, labelled as such. The research advises against building further on licensed estimates. | Already present |
| Economist surveys, CDS, industry classifications, readership and crowd relevance, chat, execution | Licensed, or they need thousands of users. | Does not apply |

### 2.4 Data architecture and quality

#### What the terminal does

- **Identity and fields.** A security is a string such as `IBM US Equity`; other identifiers take a
  prefix (`/isin/`, `/cusip/`), and a pricing source can be appended (`/cusip/912828GM6@BGN`).
  Behind it sits the FIGI, a permanent 12-character identifier that is never reused when a ticker
  changes, issued per listing, per country composite and per share class; over 1.3 billion exist,
  and it is an open standard [D1], [D2]. Every number is a field mnemonic (`PX_LAST`,
  `SALES_REV_TURN`) in a dictionary that `FLDS` searches by phrase, showing each field's description
  and its value for the loaded security; library guides call it "the master dictionary" [D1], [D3].
- **Three shapes of data, and overrides.** Reference requests return current values; historical
  requests return one point per period with an explicit periodicity, a fill rule for non-trading
  days (previous value or nothing) and optional currency conversion; intraday requests return ticks
  or bars. Overrides change how a calculated field is computed for one request (the fundamental
  period, the forecast year, the currency, the date a screen is run as of), and an unknown override
  fails with a named error [D1], [D4].
- **Pricing sources.** Every quote names its source: an exchange, one contributor, or a composite
  such as BGN, CBBT or BVAL (an evaluated price for about 2.8 million bonds). `ALLQ` shows every
  dealer quote for a bond in one table, and `PCS` sets a preferred source (its screen is memory).
  BVAL's score from 1 to 10 measures the inputs behind a price and is "not a statement of accuracy"
  [D1], [D5] (snippet), [D6] (snippet).
- **Subscriptions, conflation and status.** A subscription is one string naming the service, the
  security, the fields and options (`//blp/mktdata/ticker/IBM US Equity?fields=BID,ASK&interval=2`)
  with a correlation ID the client chooses. The server confirms or refuses it, sends an initial
  paint with every field and then only the fields that changed ("All fields desired must be
  explicitly listed"); an interval caps updates at one summary per period. Status travels
  separately: started, failed with a category (bad security, bad field) or terminated; connection
  down and up; slow-consumer warnings and data loss. Responses carry per-item errors while
  returning the rest, and every non-data message should be logged [D1], [D7], [D8].
- **Cell states, nulls and corrections.** The Excel add-in shows the state in the cell: requesting,
  no data, invalid security, invalid field, time-out (snippet) [D9]; "field not applicable" is
  (memory). A null means "clear the cell", a new-day message resets day-scoped fields such as
  volume, a trade can be cancelled or corrected after publication, and each message says whether its
  stream is delayed [D1].
- **Infrastructure, in outline.** A ticker plant normalises exchange and contributor feeds into one
  field model; engineering posts seen as snippets speak of over 200 billion pieces of information a
  day [D12]. B-PIPE, the feed sold to firms, carries 35 million instruments from more than 330
  exchanges and 5,000 contributors, and per-exchange entitlements decide whether a user receives
  real-time or delayed data [D1], [D10], [D11]. **Low confidence:** that screens redraw only changed
  cells, flash them and mark delay and staleness is inferred from the API or is (memory); academic
  terminals typically run 15 minutes behind (snippet) [D13]; the UX team confirms green for up and
  red for down as the default and has studied alternatives for colour-blind users (snippet) [D14].
- **Coded news.** News "from tens of thousands of sources" is tagged "to millions of securities and
  thousands of subject or topic codes"; coding is relevance-aware (a passing mention of China in the
  last paragraph is not coded to China), and meta codes mute headline-only items, automated
  stories, wraps and tables [W12]. Metadata is "assigned" by journalists and "derived" by models,
  with a unique ID per story (snippet) [D16]; Bloomberg gives its entity universe as 220,000
  entities, 10,000 topics and 660,000 people (snippet) [D17]. Machine-readable feeds add sentiment,
  novelty and readership [D15], and First Word condenses breaking news into short items (snippet)
  [D18]. Releases are instruments too (`INJCJC Index` for US jobless claims), so a calendar row
  links to its history, its survey and its stories [W12], [F2], [D19].
- **The calendar's fields.** Survey median, average, high, low, standard deviation and number of
  forecasters, actual, prior and revised are separate fields. One example: jobless claims came in at
  272 against a median of 295 (average 293.6, high 310, low 284, standard deviation 6, 23
  forecasters, relevance 97.6) [D20]. Surprise is (actual − survey median) / survey standard
  deviation [F2]. Relevance is "the percentage of Bloomberg users that set up an automatic alert"
  for the release, so importance is measured from user behaviour [D21].
- **Revisions, point in time and nature flags.** First prints and every revision are kept. A
  Point-in-Time dataset launched in 2026 (3,000+ indicators and auction events in 100+ economies,
  time-stamped back to 1997) lets users "see the information as it was available to market
  participants at the time of release" [D22], [D23]. An as-of date makes a company ratio use only
  the figures known on each day; statements switch between "As Reported" and a standardised
  template; parameters choose actuals or estimates, the estimate source and adjusted figures [D4],
  [D24]. An original-versus-restated switch is (memory).
- **Times and corrections.** Reference data is the value "at that moment in time", partial dates
  ("it might only hold a month") are kept as they are, and releases carry both the period and the
  release time [F2], [D1], [D25] (snippet). Users dispute a data point through the help desk (Help
  pressed twice), where Bloomberg's site also sends terminal users; the correction workflow behind
  it is not public [D26], [D27] (snippet).
- **Not relevant here.** The API describes itself at run time; publishing and contributing prices,
  per-user entitlements and unconflated ticks serve firms and trading systems [D1], [D10].

#### What we take from it

| Principle | How this product applies it | Status |
|---|---|---|
| Every figure carries its source, period and retrieval time | Facts carry a source, an as-of date and, for live values, a retrieval time, plus one of ten quality labels (live, delayed, official, estimate and others); missing values show "no data", never 0; `SRC` lists where every figure on a profile comes from. | Already present |
| Sources are compared, not overwritten | World Bank and IMF figures for GDP, growth, inflation, unemployment, the current account and population are compared per country and year, with a fiscal-year rule; gaps beyond tolerance go to the audit, the change feed, the data page and the profile. Links confirmed by a second source are marked and disputes listed. | Already present |
| Provider health in one place | The data page (`DATA`) lists each provider as answering, serving a saved copy or failing, plus the consistency audit. | Already present |
| Health always in view | The status line sums up provider health in a few words ("all N sources answering", "N sources not answering") and links to the data page. | Built in this round |
| Updates pushed, not polled | Server-Sent Events tell open pages which sources changed, merged into at most one event every 2 seconds; pages re-fetch; a client that stops reading is dropped at 64 KB; pages without a stream ask every few seconds. | Already present |
| Subscribe to fields, not views | Subscriptions of entity, fields and interval; an initial paint, then changed fields only; per-subscription status with named error categories (bad entity, bad field, no source, provider down, rate limited, not applicable); one client store per entity and field (roadmap item 10). | Planned |
| One permanent identity | Entities have stable IDs, with Wikidata IDs used for identity. | Already present |
| One resolver for typed identifiers | The command line resolves three- and two-letter country codes, names, aliases and tickers, and offers the alternatives when words could mean several entities. | Built in this round |
| A field dictionary, overrides and a schema | Every number resolves to a defined field with unit, cadence, definition and sources in order of preference; currency, basis, period, as-of date and source as visible override chips; one schema read at start so that new fields appear in pickers (roadmap item 4). | Planned |
| All sources for a figure, and a preferred one | One row per source with value, period, as-of, fetch time and difference; a default source per field group; an agreement score labelled as coverage, not accuracy (roadmap item 3). | Planned |
| Expected, actual, prior and revised as separate fields | Extend the calendar's result from actual and previous to prior as first published, revised prior, expected with its source and range, and surprise (roadmap item 1). | Planned |
| Vintages: first print and every revision | Each value stored with the time it was first seen; a new value for a stored period becomes a revision with old and new values; an as-of switch redraws a view as it was known (roadmap item 2). | Planned |
| Projections kept apart from outcomes | `OUT` and the budget section show IMF projections apart from outcomes. | Already present |
| A nature flag and five cell states | Actual, preliminary, estimate, forecast or restated, separate from the quality label and drawn differently; cells that distinguish loading, value, no data, not applicable and error. | Planned |
| Users can report a wrong number | "Report an inconsistency" on every profile saves a report for review, listed in Settings. | Already present |
| A corrections log in place of a help desk | Prefer another source, pin a value with a note and a source address, or mark a value as suspect; reversible, and re-checked when the source changes. | Planned |
| News coded at ingest | The newsroom links each headline to the countries, companies, people, organizations and commodities it names, labels its outlet's tier, and shows a story carried by several outlets once, with every outlet. | Already present |
| Topic codes, story types and how each tag was made | About 100 topic codes, story types (wire, analysis, opinion, automated, roundup, press release), relevance grades, and whether a tag came from a rule, a model or a person (roadmap item 5). | Planned |
| Delayed quotes labelled | Yahoo quotes are marked delayed and for personal use. | Already present |
| An access class and a call count per source | Open, key required, delayed by N minutes, redistribution restricted; upstream calls per provider shown against free-tier limits. | Planned |
| Entitlements, contributions, unconflated ticks, ticker plants | A single-user tool on public sources has no exchange licences to enforce, no contributors and no trading system that needs every tick. | Does not apply |

### 2.5 Information design

#### What the terminal does

- **The same regions on every screen.** Bloomberg's Getting Started guide divides each panel into a
  toolbar, the command line, the function area and an information panel. A "red bar at the top of
  each function includes the function's title at the right and provides drop-down menus and
  buttons", sometimes with a page number, and message indicators always sit top right [I11], [V1].
- **Colour as a role system.** "Amber fields indicate areas on the screen that you can change"; a
  white outline marks clickable items on hover; blue marks links and the active panel; green is up
  and red is down; a flashing purple indicator means a new message. The keyboard repeats the idea,
  and Esc was made red "to catch one's eye to stop a task" [I1], [I5], [V1], [V2], [V3]. The UX team
  calls black and amber its strongest hallmark (snippet) [V4]; the colours of labels and headers are
  (memory). The Greenwich audit found that links are not distinguished from other text [V21].
- **A typeface from a character grid.** A Bloomberg engineer writes that the terminal "evolved from
  an 80x25 hardware terminal" and that resizing distorted text because the cells had to stay
  aligned, "as the layout was meaningful" [V5]. The UX team says the old bitmap font was copied from
  the hardware and that in September 2007 Bloomberg shipped faces commissioned from the type
  designer Matthew Carter, in proportional and monospaced cuts (snippet) [V6]. Open-source
  look-alikes exist [V7].
- **Hierarchy without whitespace, paging and printed keys.** Levels are separated by a full-width
  title bar, colour by role, short upper-case labels, fixed positions and numbered items; the UX
  team concedes that density makes "clarifying the information hierarchy challenging" (snippet)
  [V10]. Matthew Strom argues that density comes from few design decisions carrying much meaning,
  and that "some whitespace has meaning almost as salient as the darker pixels" [V8], [V9].
  Right-aligned numbers in fixed columns, units in headers and short labels (Px, Chg, %Chg, Yld)
  describe the screens, though this description is (memory) [V5], [V8]. Classic screens were fixed
  pages, numbered in a corner and paged by key, and "Many clickable onscreen options are labeled
  with a Number `<Go>`. For example, 6) NASDAQ", so the label is the shortcut [I13], [V1], [V5].
- **Density in time.** Strom: "loading it with no latency is Terminal's real superpower". Under
  100 ms feels simultaneous, and an animation there makes an app feel slower; 100 ms to 1 s needs a
  visual bridge; 1 to 10 s an indeterminate indicator; beyond 10 s a determinate one. A commenter
  adds that a dense tool that is slow and needs many clicks "feels really sparse" [V8], [V9].
- **Consistency is the product.** Then-CEO Lex Fenwick, quoted in 2007: "We have to be religiously
  consistent" and "You can see a Bloomberg from a mile away"; an IDEO redesign concept from that
  year was never adopted [I24]. The UX team says "even something as simple as a font change or the
  relocation of a button can be disruptive", reports "thousands of client messages like, What did
  you do!?" after one change, ships small daily increments, and advises announcing changes early,
  letting users try and revert, but not defer forever (all snippet) [V6], [V11], [V12], [V13].
- **"It looks hard, so users feel expert."** A 2010 UX Magazine piece calls the terminal a lock-in
  reinforced by a conservative industry and claims "the more painful the UI is, the more satisfied
  these users are", naming no study [I24], [V14] (snippet). IEEE Spectrum says learning it "became a
  rite of passage" [I19]. Bloomberg's own spending on discoverability argues against deliberate
  difficulty [I1], and its official answer to the learning curve is the command line: "Just start
  typing a term at the top of the screen (e.g., INFLATION)" [I5], [V1], [V3].
- **Competitors that modernised. Low confidence.** LSEG replaced Eikon with the web-based Workspace
  (Eikon was withdrawn on 30 June 2025), Koyfin is reviewed as friendlier but "not as robust", and
  OpenBB moved from a command-line tool to web dashboards; all from search excerpts [V15], [V16],
  [V17], [V18], with FactSet's reception (memory). None displaced the incumbent by looking better.
- **Red, green and colour-vision deficiency.** Bloomberg's 2021 post (snippet) shows the two
  colours looking alike under deuteranopia and describes schemes for deuteranopia and protanomaly,
  including blue for up and red for down [V4], [V20]. In mainland China, Japan, South Korea and
  Taiwan red means up and green means down [V22]; the trading app Futubull added an optimised scheme
  for the same reason [V23].
- **Accessibility audit.** The University of Greenwich tested the terminal against WCAG 2.2 AA. It
  credits screen-reader compatibility and colour-blind support, and lists failures: no semantic
  structure on most screens, links not visually distinct, wide tables that need scrolling in two
  directions, low-contrast checkboxes, fixed line height, tooltips that cannot be hovered or
  dismissed, prices that update and cannot be paused, unlabelled inputs, and input errors corrected
  without saying so [V21].
- **Dark and light, status lines, linked monitors.** **Low confidence:** the black interface "has
  become a recognizable trait" [I1] and critics dislike its "yellow and orange text" [I24]; the lack
  of a first-class light theme is (memory). Fixed zones carry state (a message indicator, scrolling
  headlines toggled with `NO <GO>`, confirmations in the message line), so feedback appears in a
  known place rather than in pop-ups [V1]. Launchpad's monitors stay in view beside the panels
  [W7] (snippet), [V19].
- **Legal limits.** BLOOMBERG TERMINAL is a registered US word mark (Reg. No. 5527778, 2018) [V24].
  US trade dress law can protect a product's overall look if it is distinctive and non-functional
  and a copy is likely to cause confusion. Functional ideas (dense tables, a command line, a dark theme, keyboard
  shortcuts, colour for direction) are common to many products; the distinctive combination is amber
  on black, red title bars, the Carter typeface and the coloured-key vocabulary [I24], [V25]
  (snippet), [V26], [V27]. This is general research, not legal advice.

#### What we take from it

| Principle | How this product applies it | Status |
|---|---|---|
| A fixed skeleton on every page | A function bar under the top bar (back and forward, code and title, the entity, numbered related functions, export, F1 help) and a status line at the bottom (the last command's result, data health, the clock). | Built in this round |
| Feedback in a known place, not in pop-ups | The status line says what the last command did or why it could not run, including "did you mean" for a mistyped code; its parts never move. | Built in this round |
| Keys printed beside what they run | Key caps on the related chips (1 to 9), F1 on the help link, a key legend under the command-line suggestions, and Ctrl K in the empty command line. | Built in this round |
| Codes, keys and layout as a stable interface | Codes live in one registry and keys in another; the help pages are generated from both; codes gain aliases rather than new names. | Built in this round |
| Announce changes and let users switch back | A short changelog of codes and keys; new modes shipped as options. | Planned |
| Direction shown by more than colour | A flashing value adds an up or down arrow and hidden text for screen readers; link groups always show their letter. | Built in this round |
| A choice of colours for rises and falls | Green up and red down (the default), blue up and orange down for red-green colour blindness, or red up and green down as in China, Japan, Korea and Taiwan (`src/appearance.ts`, set in Settings). | Built in this round |
| Map colours that survive colour blindness | Better-or-worse map layers use green and red ends that differ in lightness as well as hue, checked for red-green colour blindness. | Already present |
| Colour roles for editable, link, value and alert | Named colour tokens by role, a written role table, and a check against raw colours in components. | Planned |
| Two densities of one design | Comfortable (the default) or compact, with about a third more rows on screen, chosen in Settings and independent of the theme. | Built in this round |
| Tabular numerals and the product's own type | Numeric cells use tabular figures, and the product keeps its own type stack, with a monospace face for codes and keys. | Already present |
| One table component | Units and scale in the header, a sign on every change, a source and vintage column, a sticky header and first column. | Planned |
| Tables fill the work area and page by screen | A taller window shows more rows; Page Up and Page Down move one screen; a position indicator ("rows 41 to 80 of 212"). | Planned |
| Speed as part of density | A view switch painted from cache in under 100 ms, last-known values shown and marked stale instead of spinners, and prefetching on focus. | Planned |
| Accessible structure in the new parts | The command line is a labelled combobox with a list box, the status message is a polite live region, numbered keys carry screen-reader text, and the workspace dividers are separators that the keyboard can move. | Built in this round |
| An accessibility pass and a pause control | Real table markup with header scope, landmarks, a visible focus ring on every control, tooltips that stay open and close on Esc, and a control to pause live updates. | Planned |
| Both themes | Light and dark tokens, using near-black and off-white rather than pure black and white. | Already present |
| The map stays the home screen | The product's differentiator is the map, not a quote monitor. | Already present |
| Amber on black, red title bars, the Carter typeface, the coloured-key vocabulary | These are another product's trade dress and marks (section 3). | Does not apply |

## 3. What we deliberately do not copy

**The look, the names and the vocabulary.** No amber text on black, red function title bars,
yellow, green and red keycap styling, Matthew Carter typeface or look-alike, or screen-for-screen
layouts: Bloomberg's then chief executive called the look recognisable "from a mile away" [I24],
the kind of statement that supports the secondary meaning on which trade-dress protection rests
[V26], [V27]. BLOOMBERG TERMINAL is a registered mark [V24], so "Bloomberg", "Bloomberg
Terminal", "Bloomberg Professional", "Launchpad" and "Alert Catcher" are never product, feature or
theme names, and there is no "Bloomberg theme". The product's own name contains the generic word
"terminal"; one researcher warned against using it as a brand echo, so the product is never described or styled as a version of Bloomberg's. There is no
`<GO>`, `<MENU>` or `<PANEL>` notation and no F2 to F12 binding. Plain words and generic
abbreviations are fine as codes, but the coined catalogue (`WEI`, `WIRP`, `ECST`, `SECF`, `BMAP`,
`FAVE`, `EASY`, `PDFU`), the menu tree, the help texts and the cheat sheets (copyrighted, and in
places marked "may not be redistributed") are not copied. Most of this product's codes are its own
(BUDG, TRADE, SANC, WAR, ELEC, WEB, BOARD, FXM); a few coincide with the terminal's because they
are short descriptive words (TOP, NEWS, HELP, LAST, NOTE, CAL, MAP, STAT, PORT, ALRT). `DES` and
`GP` are the two that a researcher named among the coined set, so they deserve a second look. Field
names such as `PX_LAST` and news topic codes are evidence here, not names for this product's
fields; FIGI is the exception, because it is an open standard [D2].

**Difficulty for its own sake.** Codes are accelerators: every function is also reached by plain
words, the help list, a related chip or the map, and every code shows its title wherever it
appears. Critics describe a week of learning and an 86-page manual and call the obscurity a status
symbol [I19], [I24], while Bloomberg reportedly spent $100 million on discoverability [I1]. So the
product keeps one settings page, one alert manager and one kind of watch list (the terminal has
four settings functions and four alert functions), ranks suggestions by rules it can explain, and
avoids manual saves, tabs that cannot be reopened, links that take several dialogs to set up (the
workspace researcher found that even the help desk could not make a custom group of rows feed a
news panel) and export that sits in a different menu on each screen.

**Colour as the only signal.** Colour always comes with a sign, an arrow, a letter or a label.
Flashes respect reduced motion, and a control to pause live updates is planned, since the
terminal's prices cannot be paused [V21]. Flashing is kept for values that refresh during the day:
public macro data is monthly to annual and Yahoo quotes are delayed, so the product shows each
value's date and source rather than imitating a tick-by-tick tape, and slow series will get a "new
since your last visit" mark instead. There are no auto-rotating headline pages, no sounds by
default and no pop-ups for routine feedback.

**Anything that needs Bloomberg's scale or licensed data.** Staff and scale: the 24-hour help desk,
training and certification, chat and messaging, shared screens and desk pages, mobile push,
multi-monitor window geometry, ticker plants and unconflated ticks; export and import replace
sharing, and a local corrections log will replace the help desk. Business machinery: order entry,
entitlements, seat limits, biometric log-in and download quotas; the product does the opposite,
with open export, plain addresses and the source on every export. Licensed data: economist
consensus surveys (not to be scraped from Bloomberg or from sites such as Investing.com or Trading
Economics), composite and evaluated prices (BGN, BVAL), Bloomberg News text and story codes, the
relevance index, analyst recommendations and estimates, industry classifications (BICS), CDS
quotes, model default probabilities and estimated supply-chain percentages; agency ratings only as
reported, with source and date. The existing `CONS` screen uses Yahoo's analyst consensus for
personal use and says so; it should not grow into a redistributed feed. Crowd signals that need
thousands of users (most read, most viewed, relevance from alert counts) give way to public
attention measures, labelled as such. bloomberg.com blocks automated access and is not a source.

**Other habits.** Calling delayed data real time; invented precision (a computed score shows its
inputs, weights and dates and is labelled as the product's own calculation, and an agreement score
is coverage, not accuracy, as Bloomberg says of its BVAL score (snippet) [D6]); silent overwrites
of revised values and silent carry-forward of old ones; full-text news; exports that work only
inside one vendor's software; density without speed; and opinion treated as evidence (the "users
enjoy the pain" claim names no study [I24]).

## 4. Roadmap

The larger ideas not built yet, in order of value for a macro and geopolitics reader. Ideas that
make existing numbers more trustworthy and the calendar more informative come first, new analytical
screens follow, and engineering that mainly saves work comes last.

| # | Idea | What it gives the reader | Data it needs | Free source? |
|---|---|---|---|---|
| 1 | Expected, actual, prior, revised and surprise in the calendar | Whether a release surprised and by how much against its own history, with the market reaction on past release days; the same grammar for central-bank decisions and elections. | Actual and prior (already from FRED, Eurostat, BIS); revised prior from vintages (item 2); "expected" named per row from Atlanta Fed GDPNow, the Cleveland Fed inflation nowcast, the Philadelphia Fed and ECB surveys of professional forecasters, central-bank and IMF projections, prediction-market odds (already ingested) or a naive model labelled as such; surprise as a z-score against past (actual minus expected). | Partly: no free economist consensus exists, and public expectations cover some series only. |
| 2 | Vintages and revisions | First print against latest for every figure the product watches, a revision marker (old value, new value, date), and any table, chart or map redrawn as it was known on a past date. | Each observation stored with the time it was first seen; ALFRED (St. Louis Fed) for true US vintages. | Yes from the first fetch onward; earlier history only from ALFRED, and the interface must say so. |
| 3 | All sources for a figure, a preferred source, a corrections log | One row per source with value, period, as-of, fetch time and difference; a default source per field group; "flag this value" to prefer a source, pin a value with a note, or mark one suspect. | Values already fetched from the World Bank, IMF, Wikidata and curated records; the existing agreement and consistency checks. | Yes. |
| 4 | A field dictionary | A definition, unit, cadence and source order behind every number, a "what is this" action, field search, and a nature flag (actual, estimate, forecast, restated); the base for items 5 to 10. | World Bank and IMF series metadata, which publish definitions; the product's own definitions for computed fields. | Yes. |
| 5 | News topic codes, and saved searches as codes | About 100 topic codes and story types as chips; a query grammar whose parsed result shows as removable chips; include and exclude by tag; saved searches with short names that run from the command line and become alerts after a volume preview. | The product's own feeds and entity tagger; SQLite full-text search; the GDELT DOC API as optional backfill. | Yes. |
| 6 | A screener over the indicator catalogue | Questions such as "inflation above 10%, policy rate below inflation, election within 12 months" with a live match count; results as a table and on the map; saved as groups for the calendar, news, peer tables and alerts. | The World Bank and IMF catalogue (already held), elections and sanctions (already held), ratings after item 9; companies later from SEC EDGAR. | Yes. |
| 7 | Peer tables with statistics rows | Any country or company against its peers with median, mean, rank and percentile, column sets by theme, and where today's value sits in its own ten-year range. | The indicator store; peer sets from region, income group and bloc memberships in the knowledge web; industry codes from EDGAR or Wikidata. | Yes. |
| 8 | A chart workbench | "Send to chart" from any number; macro series, prices, yields and news volume together; transforms (year on year, index = 100, ratio, spread, z-score, moving average); two axes; shading for conflicts and terms of office; event markers; state kept in the address. | Series the product already holds and its own event store; recession shading would need a dating source not yet chosen. | Yes for the series it holds. |
| 9 | Sovereign ratings history | One row per country with each major agency's long-term foreign-currency rating, outlook and last action, recent changes highlighted, a scale legend and a map layer. | Wikipedia's list of countries by credit rating and agency announcements caught by the news tagger, shown as reported with source and date. | Partly: agency feeds are licensed, so only as-reported data. |
| 10 | Field-level subscriptions on the live stream | Boards and panes that update only the cells that changed, one fetch per field however many panes show it, named error states, and a repaint after a gap. | No new data: subscriptions, an initial paint and changed-field events on the existing stream (`server/live.ts`), with upstream calls counted per provider. | Not needed. |

Further ideas, in rough order of value:

| Idea | Data it needs | Free source? |
|---|---|---|
| World bonds table and curve overlays (spread to a chosen benchmark, z-score, curves by date) | FRED and OECD long-term rates, the ECB, the US Treasury daily curve (history to 1990), the Bank of England, Bundesbank, Bank of Canada and Japan's Ministry of Finance | Yes, though many countries publish only monthly 10-year rates or two or three tenors |
| Central-bank monitor with an implied path per meeting | BIS policy rates, central-bank calendars, fed funds futures (Yahoo, delayed); prediction-market odds elsewhere | For the US only (delayed); no free liquid futures elsewhere |
| Election surprise and market reaction | Odds and results (already held); index, currency and 10-year yield moves (already held) | Yes |
| Country risk card and company exposure | World Bank governance indicators, V-Dem, UCDP or ACLED, the Caldara-Iacoviello geopolitical risk index, the sanctions lists, the OECD country risk classification, IMF data; GLEIF and Wikidata for company footprints | Public sources; their terms were not reviewed in this research |
| Debt wall | US Treasury Fiscal Data, the UK DMO, Agence France Trésor, the German Finance Agency, World Bank International Debt Statistics, the IMF sovereign investor base, US TIC | Yes, with uneven coverage |
| Three-zone dependency view with quantified links | UN Comtrade (already held) and IMF trade statistics for countries; GLEIF, Wikidata and customers disclosed in annual reports for companies | Yes for countries; partial for companies |
| Leaders' tenure performance | Wikidata positions with start and end dates, and the indicator store | Yes; office-holders need checking against official sources |
| Sanctions screening with ownership propagation (the 50% rule) | OpenSanctions bulk data and the official lists (already held) | Public data; terms not reviewed here |
| Attention signals and coverage spikes | Story counts from the product's feeds, GDELT, Wikipedia page views | Yes |
| Holders of US-listed companies | SEC 13F, 13D/G and Form 4 filings | Yes, US only |
| Energy and infrastructure layers on the map | WRI Global Power Plant Database, Global Energy Monitor, World Port Index, USGS | Public sources; live vessel positions need paid AIS data and are left out |
| Boards of tiles, links that follow a whole list, workspace history, export and import | No new data | Not needed |

The smaller items marked Planned in section 2 (history on the server, numbered rows, favourites, a
printable cheat sheet, image export, a pause control, a table component) need no new data and can
be done in any order.

## 5. Sources

Every link the researchers cited, grouped by the facet that first cites it. A source cited by
several facets is listed once and keeps its tag throughout. "(snippet)" and "search summary" mark
pages seen only through search-result excerpts. Points marked (memory) in the text have no source.

### Interaction

- **I1** Wikipedia, "Bloomberg Terminal": <https://en.wikipedia.org/wiki/Bloomberg_Terminal>
- **I2** Duke University Fuqua library: Bloomberg Getting Started Guide for Students (PDF): <https://library.fuqua.duke.edu/docs/Bloomberg-Getting-Started-Guide-for-Students-English.pdf>
- **I3** Columbia University Libraries: Bloomberg basics: <https://guides.library.columbia.edu/bloomberg/basic>
- **I4** Cornell University Library: Bloomberg keyboard: <https://guides.library.cornell.edu/bloomberg_intro/keyboard>
- **I5** New York Public Library: Bloomberg Terminal basics: <https://libguides.nypl.org/BloombergTerminal/basics>
- **I6** Simon Fraser University Library: Bloomberg tips, tricks and shortcuts (PDF): <https://www.lib.sfu.ca/system/files/32883/bloomberg_tips_tricks_shortcuts.pdf>
- **I7** WU Vienna library: Bloomberg getting started (PDF): <https://www.wu.ac.at/fileadmin/wu/s/library/databases_info_image/bloomberg_getting_started.pdf>
- **I8** Stevens Institute of Technology: Bloomberg tutorial commands (PDF): <https://web.stevens.edu/hfslwiki/images/b/b0/Bloomberg_Tutorial_Commands.pdf>
- **I9** Ohio University mirror: Top Newsroom Functions for the Terminal (PDF): <https://sites.ohio.edu/korte/wp-content/uploads/2024/03/Top%20Newsroom%20Functions%20for%20the%20Terminal.pdf>
- **I10** SAFE Frankfurt mirror: Bloomberg's HELP page (PDF): <https://datacenter.safe-frankfurt.de/documents/Bloomberg_help_page.pdf>
- **I11** University of Kent Business School: Bloomberg Terminal Guide (PDF, 2017): <https://blogs.kent.ac.uk/kbs-news-events/files/2017/10/Bloomberg-Terminal-Guide.pdf>
- **I12** bookdown.org: Bloomberg guide, "Getting around": <https://bookdown.org/robohay/bloomberg/getting-around.html>
- **I13** Johns Hopkins University Libraries: Bloomberg keyboard terms: <https://guides.library.jhu.edu/bloomberg/general/keyboard-terms>
- **I14** University of Tampa: Bloomberg keyboard: <https://utopia.ut.edu/bloomberg/keyboard>
- **I15** Florida Gulf Coast University Library: Bloomberg keyboard: <https://library.fgcu.edu/bloomberg/keyboard>
- **I16** University of Pennsylvania Libraries: Bloomberg keyboard: <https://guides.library.upenn.edu/bloomberg/keyboard>
- **I17** University of British Columbia Library: Bloomberg keyboard: <https://guides.library.ubc.ca/finance/bloomberg/keyboard>
- **I18** Western University Libraries: Bloomberg keyboard: <https://guides.lib.uwo.ca/bloomberg/keyboard>
- **I19** IEEE Spectrum: article on the Bloomberg Terminal: <https://spectrum.ieee.org/bloomberg-terminal>
- **I20** NYU Libraries: Bloomberg guide, getting started: <https://guides.nyu.edu/bloombergguide/getting-started>
- **I21** Florida Gulf Coast University Library: Bloomberg command shortcuts: <https://library.fgcu.edu/bloomberg/command_shortcuts>
- **I22** Yale University Library: Bloomberg basics: <https://guides.library.yale.edu/Bloomberg_Basics>
- **I23** University College Dublin: Bloomberg keyboard: <https://buselrn.ucd.ie/bloomberg/bloomberg-keyboard/>
- **I24** UX Magazine: "The Impossible Bloomberg Makeover": <https://uxmag.com/articles/the-impossible-bloomberg-makeover>
- **I25** IE University library: Bloomberg help and support (PDF): <https://metalib.ie.edu/ayuda/Varios/Bloomberg_help_support.pdf>
- Also used without a link: the syntax of the API string form from search snippets of unofficial
  copies of the Core User Guide, and Bloomberg UX blog posts seen only as search snippets.

### Workspace

- **W1** SAFE Frankfurt mirror: Bloomberg Terminal primer (PDF): <https://datacenter.safe-frankfurt.de/documents/Bloomberg_Terminal_primer.pdf>
- **W2** University of Exeter Business School: Bloomberg quick guide (PDF): <https://business-school.exeter.ac.uk/v8media/facultysites/ese/businessschool/documents/database/bloomberg/Quick_Guide_(pdf_-_2Mb).pdf>
- **W3** library.iima.ac.in: Bloomberg Launchpad guide (PDF): <https://library.iima.ac.in/public/download/bloomberg/launchpad.pdf>
- **W4** University of Delaware Lerner College: Getting Started in Launchpad (PDF): <https://my.lerner.udel.edu/wp-content/uploads/BB-Getting-Started-in-Launchpad.pdf>
- **W5** Lippincott Library blog: Bloomberg Launchpad, part III (2013): <https://lippincottlibrary.wordpress.com/2013/09/02/bloomberg-launchpad-part-iii/>
- **W6** Lippincott Library blog: Bloomberg Launchpad, part one (2013): <https://lippincottlibrary.wordpress.com/2013/03/11/bloomberg-launchpad-part-one/>
- **W7** Bloomberg company story: "Innovating a modern icon" (snippet): <https://www.bloomberg.com/company/stories/innovating-a-modern-icon-how-bloomberg-keeps-the-terminal-cutting-edge>
- **W8** Texas State University class blog (yiclass): Launchpad post: <https://yiclass.wp.txstate.edu/?p=481>
- **W9** myfinancialmarkets blog: "Build your own Bloomberg Launchpad" (2018): <https://myfinancialmarkets.wordpress.com/2018/03/05/build-your-own-bloomberg-launchpad/>
- **W10** Cranfield University library blog: Bloomberg worksheets (W): <https://blogs.cranfield.ac.uk/library/bloomberg-w/>
- **W11** Adelphi University: Trading Room Bloomberg Terminal user guide (PDF): <https://www.adelphi.edu/wp-content/uploads/2013/12/James-Riley-Jr.-Trading-Room-Bloomberg-Terminal-User-Guide.pdf>
- **W12** Ohio University mirror: News Searches (PDF, newsroom training handout): <https://sites.ohio.edu/korte/wp-content/uploads/2024/03/News%20Searches.pdf>
- **W13** Trinity College: Top Tips for Students (PDF, 2025): <https://www.trincoll.edu/lits/wp-content/uploads/sites/14/2025/09/Top-Tips-for-Students.pdf>
- **W14** Stanford Libraries: Bloomberg tips and tricks: <https://guides.library.stanford.edu/bloomberg_terminal/tips_tricks>
- **W15** Bloomberg video: alerts on price or yield gaps (2019, snippet): <https://www.bloomberg.com/news/videos/2019-04-05/get-alerts-when-price-or-yield-gaps-flag-opportunities-warnings-video>
- **W16** US Department of Commerce Library: Bloomberg: <https://library.doc.gov/Bloomberg>
- **W17** Columbia University Libraries: exporting from Bloomberg: <https://guides.library.columbia.edu/bloomberg/export>
- **W18** Boston College Libraries: exporting from Bloomberg (snippet): <https://libguides.bc.edu/Bloomberg/exporting>
- **W19** Northwestern University Library: Bloomberg Terminal getting started (PDF): <https://files.library.northwestern.edu/ej/unrestricted/bloomberg_terminal/bloomberg_terminal_getting_started.pdf>
- **W20** Bloomberg company page describing NOTE (snippet): <https://www.bloomberg.com/company/?p=3619>

### Functions

- **F1** University of Ljubljana Bloomberg guide: countries and sovereign data, examples: <https://vodici.cek.ef.uni-lj.si/bbg-eng/countries-and-sovereign-data/examples>
- **F2** polars-bloomberg documentation: US economic data surprises: <https://marekozana.github.io/polars-bloomberg/examples/macro/us-eco-data-surprises>
- **F3** University of Ljubljana guide: macroeconomic charts: <https://vodici.cek.ef.uni-lj.si/bbg-eng/charts/macroeconomic-charts>
- **F4** arXiv paper 2404.04105 (seen through a search summary): <https://www.arxiv.org/pdf/2404.04105>
- **F5** University of Ljubljana guide: countries and sovereign data: <https://vodici.cek.ef.uni-lj.si/bbg-eng/countries-and-sovereign-data>
- **F6** University of Michigan Kresge Library: Bloomberg economic indicators: <https://kresgeguides.bus.umich.edu/bloomberg/EconomicIndicators>
- **F7** Johns Hopkins University Libraries: Bloomberg special topics: <https://guides.library.jhu.edu/bloomberg/special_topics>
- **F8** Scribd: BTMM document (seen through a search summary): <https://www.scribd.com/document/83152659/BTMM>
- **F9** Harvard Business School library: market index prices, members, movers: <https://www.library.hbs.edu/services/help-center/bloomberg-market-index-prices-members-movers>
- **F10** University of Ljubljana guide: sectors and industries: <https://vodici.cek.ef.uni-lj.si/bbg-eng/comparing-securities/sectors-industries>
- **F11** Bloomberg Professional: pro tips on predicted global interest rates (search summary; page blocked): <https://www.bloomberg.com/professional/insights/markets/bloomberg-pro-tips-explore-predicted-global-interest-rates-with-the-bloomberg-terminal>
- **F12** MNI Markets: cuts priced for the October FOMC (search summary): <https://www.mnimarkets.com/articles/nearing-fewest-cuts-priced-for-oct-fomc-since-february-1747822842166>
- **F13** University of Ljubljana guide: commodities, examples: <https://vodici.cek.ef.uni-lj.si/bbg-eng/commodities/examples>
- **F14** University of Ljubljana guide: top news: <https://vodici.cek.ef.uni-lj.si/bbg-eng/news/top-news>
- **F15** University of Ljubljana guide: news research menu: <https://vodici.cek.ef.uni-lj.si/bbg-eng/news/news-research-menu>
- **F16** University of Ljubljana guide: advanced news search: <https://vodici.cek.ef.uni-lj.si/bbg-eng/news/advanced-search>
- **F17** Catholic University of America: Bloomberg Terminal guide (PDF): <https://business.catholic.edu/_media/bloomberg-terminal-guide.pdf>
- **F18** University of Ljubljana guide: company analysis, examples: <https://vodici.cek.ef.uni-lj.si/bbg-eng/company-analysis/examples>
- **F19** IESE library FAQ 77047: <https://libhowto.iese.edu/faq/77047>
- **F20** Bloomberg press release: company-level geopolitical risk scores (search summary; page blocked): <https://www.bloomberg.com/company/press/bloomberg-launches-company-level-geopolitical-risk-scores-quantifying-country-risk-built-with-seerist-threat-intelligence>
- **F21** WatersTechnology: geopolitical country-of-risk scores (search summary): <https://www.waterstechnology.com/data-management/7952524/bloomberg-introduces-geopolitical-country-of-risk-scores-to-terminal>
- **F22** NYU Law library: Bloomberg Terminal guide: <https://nyulaw.libguides.com/bloombergterminal>
- **F23** Bloomberg Government: about page (search summary): <https://about.bgov.com/>
- **F24** University of Ljubljana guide: company analysis, overview: <https://vodici.cek.ef.uni-lj.si/bbg-eng/company-analysis/overview>
- **F25** University of Ljubljana guide: financial reports: <https://vodici.cek.ef.uni-lj.si/bbg-eng/company-analysis/financial-reports>
- **F26** University of Ljubljana guide: peers: <https://vodici.cek.ef.uni-lj.si/bbg-eng/comparing-securities/peers>
- **F27** Emory University Libraries: Bloomberg SPLC guide (PDF): <https://prod.libraries.emory.edu/sites/default/files/migrated-documents/db-pages/bloomberg-splc.pdf>
- **F28** Cranfield University library blog: supply chain on Bloomberg: <https://blogs.cranfield.ac.uk/library/supply-chain-bloomberg-workspace/>
- **F29** Bloomberg Professional insight: researching supply-chain exposures (search summary): <https://www.bloomberg.com/professional/insights/markets/researching-supply-chain-exposures-how-to-analyse-coronavirus-related-risks>
- **F30** University of Ljubljana guide: equity screening: <https://vodici.cek.ef.uni-lj.si/bbg-eng/comparing-securities/equity-screening>
- **F31** Harvard Business School library: finding people on Bloomberg: <https://www.library.hbs.edu/services/help-center/bloomberg-finding-people>
- **F32** IESE library FAQ 77145: <https://libhowto.iese.edu/faq/77145>

### Data architecture and quality

- **D1** Bloomberg: BLPAPI Core Developer Guide (PDF, read in full): <https://data.bloomberglp.com/professional/sites/10/2017/03/BLPAPI-Core-Developer-Guide.pdf>
- **D2** Wikipedia, "Financial Instrument Global Identifier": <https://en.wikipedia.org/wiki/Financial_Instrument_Global_Identifier>
- **D3** University of Pennsylvania Libraries: Bloomberg and Excel: <https://guides.library.upenn.edu/bloomberg/excel>
- **D4** WU Vienna library: Bloomberg BQL fundamentals fact sheet (PDF): <https://www.wu.ac.at/fileadmin/wu/s/library/databases_info_image/Bloomberg_BQL_Fundamentals_FactSheet.pdf>
- **D5** Bloomberg Professional insight: what goes into pricing a bond (snippet): <https://www.bloomberg.com/professional/insights/trading/fixed-income-pricing-what-goes-into-pricing-a-bond>
- **D6** Bloomberg Professional: evaluated pricing (snippet): <https://professional.bloomberg.com/products/data/enterprise-catalog/pricing/evaluated-pricing>
- **D7** BLPAPI Python documentation: Session: <https://bloomberg.github.io/blpapi-docs/python/3.21/_autosummary/blpapi.Session.html>
- **D8** BLPAPI Python documentation: SessionOptions: <https://bloomberg.github.io/blpapi-docs/python/3.21/_autosummary/blpapi.SessionOptions.html>
- **D9** NYU Libraries FAQ 290548 (snippet): <https://library.answers.nyu.edu/faq/290548>
- **D10** Bloomberg Professional: real-time data feed (B-PIPE): <https://professional.bloomberg.com/products/data/enterprise-catalog/real-time-data-feed>
- **D11** WatersTechnology article (node 2358042): <https://www.waterstechnology.com/node/2358042>
- **D12** Bloomberg company story on handling real-time market data (snippet): <https://www.bloomberg.com/company/stories/how-bloomberg-handles-a-massive-wave-of-real-time-market-data-in-microseconds>
- **D13** NYU Libraries: Bloomberg guide (snippet): <https://guides.nyu.edu/bloombergguide>
- **D14** Bloomberg UX site (snippet): <https://www.bloomberg.com/ux>
- **D15** Bloomberg Professional: event-driven feeds: <https://professional.bloomberg.com/products/data/enterprise-catalog/event-driven-feeds>
- **D16** "Signals not noise" slide deck on news metadata (snippet): <https://knowen-production.s3.amazonaws.com/uploads/attachment/file/4683/828786-SignalsNotNoise_Slides.pdf>
- **D17** Bloomberg press release: customizable real-time news feeds (snippet): <https://bloomberg.com/company/press/bloomberg-launches-customizable-real-time-news-feeds-for-enhanced-systematic-workflows>
- **D18** Bloomberg Professional: Terminal news (snippet): <https://professional.bloomberg.com/products/bloomberg-terminal/news>
- **D19** The Full FX: article (p=7380): <https://thefullfx.com/?p=7380>
- **D20** GitHub, BBG-ECO-EXCEL: README: <https://raw.githubusercontent.com/raj-rao-rr/BBG-ECO-EXCEL/master/README.md>
- **D21** Federal Reserve FEDS Notes: macroeconomic news and stock prices over the FOMC cycle (2020): <https://www.federalreserve.gov/econres/notes/feds-notes/macroeconomic-news-and-stock-prices-over-the-fomc-cycle-20201014.htm>
- **D22** FX News Group: Point-in-Time dataset launch: <https://fxnewsgroup.com/forex-news/institutional/bloomberg-launches-economic-releases-and-surveys-point-in-time-dataset/>
- **D23** The TRADE: enterprise dataset for macro signals: <https://www.thetradenews.com/bloomberg-unveils-enterprise-dataset-to-support-macro-signals-across-the-entire-investment-workflow/>
- **D24** University of Pennsylvania Libraries FAQ 45775: <https://faq.library.upenn.edu/business/faq/45775>
- **D25** MathWorks documentation: blp.getdata (snippet): <https://fr.mathworks.com/help/datafeed/blp.getdata.html>
- **D26** Bloomberg feedback page (www.bloomberg.com could not be fetched; snippet): <https://www.bloomberg.com/feedback>
- **D27** Bloomberg Professional support page (snippet): <https://professional.bloomberg.com/support/>
- Also used without a link: cached copies of library guides (Exeter, Kent, Duke, Trinity College).

### Information design

- **V1** City University of Hong Kong mirror: Getting Started with Bloomberg (help page printed 2013, PDF): <https://www.cb.cityu.edu.hk/ef/msc/handbook/2015/doc/Getting_Started_with_Bloomberg.pdf>
- **V2** HSE University: Bloomberg training manual (PDF): <https://finance.hse.ru/data/2019/09/19/1540920642/Bloomberg%20Training%20Manual.pdf>
- **V3** SMU Libraries: Bloomberg basics: <https://guides.smu.edu/bloomberg/basics>
- **V4** Bloomberg UX blog: designing the Terminal for color accessibility (2021, snippet): <https://www.bloomberg.com/ux/2021/10/14/designing-the-terminal-for-color-accessibility/>
- **V5** Hacker News: comment by a Bloomberg engineer (item 40430904): <https://news.ycombinator.com/item?id=40430904>
- **V6** Bloomberg company story: how Terminal UX designers conceal complexity (snippet): <https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/>
- **V7** GitHub, bergoom: an open-source font inspired by Bloomberg's: <https://github.com/dchest/bergoom>
- **V8** Matthew Strom: "UI density": <https://matthewstrom.com/writing/ui-density/>
- **V9** Hacker News discussion (item 40428386): <https://news.ycombinator.com/item?id=40428386>
- **V10** Bloomberg company page on UX (snippet): <https://www.bloomberg.com/company/what-we-do/ux/>
- **V11** Bloomberg UX blog: consistency (2020, snippet): <https://www.bloomberg.com/ux/2020/08/11/consistency-more-than-just-a-buzzword/>
- **V12** Bloomberg UX blog: relaunching Launchpad (2017, snippet): <https://www.bloomberg.com/ux/2017/11/10/relaunching-launchpad-disguising-ux-revolution-within-evolution/>
- **V13** Bloomberg UX blog post 285 (snippet): <https://www.bloomberg.com/ux/?p=285>
- **V14** Core77: multi-monitor trading desks and interface design (snippet): <https://core77.com/posts/24893/moneymaking-multi-monitor-mayhem-and-why-some-prefer-interface-design-that-sucks-24893>
- **V15** LSEG: Eikon product page (search excerpt): <https://www.lseg.com/en/data-analytics/products/eikon-trading-software>
- **V16** WatersTechnology: Refinitiv moves from Eikon to Workspace (search excerpt): <https://www.waterstechnology.com/data-management/7689651/refinitiv-begins-move-away-from-eikon-thomson-one-with-debut-of-workspace>
- **V17** TrustRadius: Bloomberg Terminal compared with Koyfin (search excerpt): <https://www.trustradius.com/compare-products/bloomberg-terminal-vs-koyfin>
- **V18** TechCrunch (2024): OpenBB (search excerpt): <https://techcrunch.com/2024/10/07/fintech-openbb-aims-to-be-more-than-an-open-source-bloomberg-terminal/>
- **V19** Hacker News discussion (item 21821327): <https://news.ycombinator.com/item?id=21821327>
- **V20** Bloomberg UX: accessibility (snippet): <https://www.bloomberg.com/ux/accessibility/>
- **V21** University of Greenwich: accessibility statement for its Bloomberg terminals (WCAG 2.2 audit): <https://www.gre.ac.uk/accessibility-statement/bloomberg-terminals>
- **V22** Benzinga (2021): red and green in China, Japan and Taiwan: <https://www.benzinga.com/general/education/21/10/23258001/did-you-know-you-dont-want-to-be-in-the-green-if-youre-trading-in-china-japan-or-taiwan>
- **V23** Android Developers: Futu app story: <https://developer.android.com/stories/apps/futu>
- **V24** Justia Trademarks: BLOOMBERG TERMINAL (serial 87502854): <https://trademark.justia.com/875/02/bloomberg-87502854.html>
- **V25** Bloomberg terms of service (snippet): <https://www.bloomberg.com/notices/tos/>
- **V26** Wikipedia, "Trade dress": <https://en.wikipedia.org/wiki/Trade_dress>
- **V27** cyber.harvard.edu: intellectual-property protection resource (byerly.html): <https://cyber.harvard.edu/property/protection/resources/byerly.html>

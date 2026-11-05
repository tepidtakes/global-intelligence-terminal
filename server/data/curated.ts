// Curated sample dataset. Narrative facts (offices held, memberships, headquarters,
// rankings) are compiled from the cited official sources and carry a "verified as of"
// date. Numbers that change often (prices, GDP, trade values, financials) are NOT stored
// here — they come live from providers with their own timestamps.
import type { Entity, Fact, Relationship, RelType, Source, TimelineItem } from '../../shared/types.js';

export const AS_OF = '2026-06';

export const SOURCES: Source[] = [
  { id: 'world-bank-wdi', name: 'World Development Indicators', publisher: 'World Bank', url: 'https://data.worldbank.org', license: 'CC BY 4.0' },
  { id: 'world-bank-class', name: 'Country and lending groups', publisher: 'World Bank', url: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/906519', license: 'CC BY 4.0' },
  { id: 'world-countries', name: 'World countries dataset (mledoze/countries)', publisher: 'Mohammed Le Doze et al.', url: 'https://github.com/mledoze/countries', license: 'ODbL' },
  { id: 'natural-earth', name: 'Natural Earth boundaries via world-atlas', publisher: 'Natural Earth', url: 'https://www.naturalearthdata.com', license: 'Public domain' },
  { id: 'us-atlas', name: 'Census cartographic boundaries via us-atlas', publisher: 'U.S. Census Bureau', url: 'https://www.census.gov/geographies/mapping-files.html', license: 'Public domain' },
  { id: 'us-census', name: '2020 Census / geographic codes', publisher: 'U.S. Census Bureau', url: 'https://www.census.gov', license: 'Public domain' },
  { id: 'un-comtrade', name: 'UN Comtrade (public API)', publisher: 'United Nations Statistics Division', url: 'https://comtradeplus.un.org' },
  { id: 'us-treasury', name: 'Daily Treasury Par Yield Curve Rates', publisher: 'U.S. Department of the Treasury', url: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates', license: 'Public domain' },
  { id: 'sec-edgar', name: 'EDGAR XBRL company facts', publisher: 'U.S. Securities and Exchange Commission', url: 'https://www.sec.gov/edgar', license: 'Public domain' },
  { id: 'yahoo-finance', name: 'Yahoo Finance chart data (delayed)', publisher: 'Yahoo', url: 'https://finance.yahoo.com', license: 'Personal, non-commercial use; replace with a licensed feed for production' },
  { id: 'google-news', name: 'Google News search RSS', publisher: 'Google', url: 'https://news.google.com', license: 'Personal, non-commercial feed-reader use; headlines link to original publishers' },
  { id: 'trusted-news', name: 'Trusted news feeds (cross-checked headlines)', publisher: 'Outlets named on each item', url: 'https://github.com/tepidtakes/global-intelligence-terminal/blob/main/DATA_SOURCES.md#trusted-news', license: 'Headlines and links only; articles stay with their publishers' },
  { id: 'gdelt', name: 'GDELT DOC 2.0 news index', publisher: 'The GDELT Project', url: 'https://www.gdeltproject.org', license: 'Open; links to original publishers' },
  { id: 'un', name: 'Member States', publisher: 'United Nations', url: 'https://www.un.org/en/about-us/member-states' },
  { id: 'nato', name: 'NATO member countries', publisher: 'NATO', url: 'https://www.nato.int' },
  { id: 'eu', name: 'EU countries', publisher: 'European Union', url: 'https://european-union.europa.eu' },
  { id: 'opec', name: 'OPEC Member Countries', publisher: 'OPEC', url: 'https://www.opec.org' },
  { id: 'asean', name: 'ASEAN Member States', publisher: 'ASEAN Secretariat', url: 'https://asean.org' },
  { id: 'brics', name: 'BRICS leaders’ declarations (Kazan 2024, Rio de Janeiro 2025)', publisher: 'BRICS presidencies' },
  { id: 'g7', name: 'G7 leaders’ communiqués', publisher: 'G7 presidencies' },
  { id: 'g20', name: 'G20 members', publisher: 'G20 presidencies', url: 'https://g20.org' },
  { id: 'imf', name: 'About the IMF', publisher: 'International Monetary Fund', url: 'https://www.imf.org' },
  { id: 'wto', name: 'About the WTO', publisher: 'World Trade Organization', url: 'https://www.wto.org' },
  { id: 'worldbank-org', name: 'About the World Bank Group', publisher: 'World Bank', url: 'https://www.worldbank.org' },
  { id: 'whitehouse', name: 'The White House', publisher: 'Executive Office of the President', url: 'https://www.whitehouse.gov' },
  { id: 'congress', name: 'Congress.gov member directory', publisher: 'Library of Congress', url: 'https://www.congress.gov/members' },
  { id: 'state-dept', name: 'U.S. Department of State', publisher: 'U.S. Government', url: 'https://www.state.gov' },
  { id: 'treasury-gov', name: 'U.S. Department of the Treasury', publisher: 'U.S. Government', url: 'https://home.treasury.gov' },
  { id: 'fed-fomc', name: 'FOMC meeting calendars', publisher: 'Federal Reserve Board', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
  { id: 'pa-gov', name: 'Commonwealth of Pennsylvania', publisher: 'Government of Pennsylvania', url: 'https://www.pa.gov' },
  { id: 'pa-dos', name: 'Pennsylvania Department of State — elections', publisher: 'Government of Pennsylvania', url: 'https://www.pa.gov/agencies/dos' },
  { id: 'phila-gov', name: 'City of Philadelphia', publisher: 'City of Philadelphia', url: 'https://www.phila.gov' },
  { id: 'pgh-gov', name: 'City of Pittsburgh', publisher: 'City of Pittsburgh', url: 'https://www.pittsburghpa.gov' },
  { id: 'spa', name: 'Saudi Press Agency', publisher: 'Kingdom of Saudi Arabia', url: 'https://www.spa.gov.sa' },
  { id: 'vision2030', name: 'Saudi Vision 2030', publisher: 'Kingdom of Saudi Arabia', url: 'https://www.vision2030.gov.sa' },
  { id: 'sama', name: 'Saudi Central Bank (SAMA)', publisher: 'SAMA', url: 'https://www.sama.gov.sa' },
  { id: 'bundesregierung', name: 'Federal Government of Germany', publisher: 'Presse- und Informationsamt der Bundesregierung', url: 'https://www.bundesregierung.de' },
  { id: 'bundeswahlleiterin', name: 'Federal Returning Officer — 2025 Bundestag election results', publisher: 'Die Bundeswahlleiterin', url: 'https://www.bundeswahlleiterin.de' },
  { id: 'gov-uk', name: 'GOV.UK — ministers', publisher: 'UK Government', url: 'https://www.gov.uk/government/ministers' },
  { id: 'royal-uk', name: 'The Royal Family', publisher: 'The Royal Household', url: 'https://www.royal.uk' },
  { id: 'kantei', name: 'Prime Minister of Japan and His/Her Cabinet', publisher: 'Government of Japan', url: 'https://japan.kantei.go.jp' },
  { id: 'gov-cn', name: 'The State Council of the PRC', publisher: 'Government of China', url: 'https://english.www.gov.cn' },
  { id: 'pmindia', name: 'Prime Minister of India', publisher: 'Government of India', url: 'https://www.pmindia.gov.in' },
  { id: 'gov-br', name: 'Presidência da República', publisher: 'Government of Brazil', url: 'https://www.gov.br/planalto' },
  { id: 'tse-br', name: 'Tribunal Superior Eleitoral', publisher: 'Brazil electoral court', url: 'https://www.tse.jus.br' },
  { id: 'pm-canada', name: 'Prime Minister of Canada', publisher: 'Government of Canada', url: 'https://www.pm.gc.ca' },
  { id: 'elysee', name: 'Élysée — Présidence de la République', publisher: 'Government of France', url: 'https://www.elysee.fr' },
  { id: 'eia', name: 'International Energy Statistics', publisher: 'U.S. Energy Information Administration', url: 'https://www.eia.gov/international/data/world' },
  { id: 'eia-states', name: 'State Energy Profiles', publisher: 'U.S. Energy Information Administration', url: 'https://www.eia.gov/state' },
  { id: 'usgs', name: 'Mineral Commodity Summaries 2025', publisher: 'U.S. Geological Survey', url: 'https://www.usgs.gov/centers/national-minerals-information-center' },
  { id: 'usda-fas', name: 'Production, Supply and Distribution database', publisher: 'USDA Foreign Agricultural Service', url: 'https://apps.fas.usda.gov/psdonline' },
  { id: 'icco', name: 'Quarterly Bulletin of Cocoa Statistics', publisher: 'International Cocoa Organization', url: 'https://www.icco.org' },
  { id: 'wna', name: 'World Uranium Mining Production', publisher: 'World Nuclear Association', url: 'https://world-nuclear.org' },
  { id: 'oica', name: 'Production statistics', publisher: 'OICA', url: 'https://www.oica.net' },
  { id: 'un-tourism', name: 'Tourism statistics', publisher: 'UN Tourism', url: 'https://www.untourism.int' },
  { id: 'sia', name: 'Industry facts', publisher: 'Semiconductor Industry Association', url: 'https://www.semiconductors.org' },
  { id: 'ratings', name: 'Sovereign rating actions (S&P Global Ratings, Moody’s, Fitch)', publisher: 'Credit rating agencies', url: 'https://www.spglobal.com/ratings' },
  { id: 'company-ir', name: 'Company investor-relations disclosures', publisher: 'Respective companies' },
  { id: 'nippon-steel', name: 'Nippon Steel completes acquisition of U.S. Steel (press release, 18 Jun 2025)', publisher: 'Nippon Steel Corporation', url: 'https://www.nipponsteel.com/en/' },
  // Live sources added for markets, forecasts, politics and conflicts
  { id: 'congress-legislators', name: 'congress-legislators: current members of Congress', publisher: '@unitedstates project (compiled from the Biographical Directory of the U.S. Congress and House/Senate records)', url: 'https://github.com/unitedstates/congress-legislators', license: 'CC0 / public domain' },
  { id: 'wikidata', name: 'Wikidata — heads of state and government, US governors, parties', publisher: 'Wikimedia Foundation (community-maintained)', url: 'https://www.wikidata.org', license: 'CC0' },
  { id: 'wikipedia-conflicts', name: 'List of ongoing armed conflicts', publisher: 'Wikipedia (community-maintained; casualty figures cite ACLED, UCDP and others)', url: 'https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts', license: 'CC BY-SA 4.0' },
  { id: 'wikipedia-elections', name: 'National electoral calendars (this year and next)', publisher: 'Wikipedia (community-maintained)', url: 'https://en.wikipedia.org/wiki/2026_national_electoral_calendar', license: 'CC BY-SA 4.0' },
  { id: 'wikipedia-election-results', name: 'Election articles — candidates, results and turnout (infoboxes); party ideology; candidates’ political positions', publisher: 'Wikipedia (community-maintained)', url: 'https://en.wikipedia.org/wiki/Template:Infobox_election', license: 'CC BY-SA 4.0' },
  { id: 'wikidata-local', name: 'Wikidata — mayors and city heads of government', publisher: 'Wikimedia Foundation (community-maintained)', url: 'https://www.wikidata.org/wiki/Property:P6', license: 'CC0' },
  { id: 'polymarket', name: 'Polymarket election markets (Gamma API)', publisher: 'Polymarket', url: 'https://polymarket.com/elections', license: 'Public market data; prices are traders’ bets, not polls or forecasts' },
  { id: 'kalshi', name: 'Kalshi election markets (public API)', publisher: 'Kalshi (CFTC-regulated exchange)', url: 'https://kalshi.com/category/elections', license: 'Public market data; prices are traders’ bets, not polls or forecasts' },
  { id: 'terminal-audit', name: 'Consistency audit (computed by this terminal from the sources above)', publisher: 'Global Intelligence Terminal' },
  { id: 'bls-schedule', name: 'Release calendar (iCalendar)', publisher: 'U.S. Bureau of Labor Statistics', url: 'https://www.bls.gov/schedule/', license: 'Public domain' },
  { id: 'fred-releases', name: 'FRED release calendar (needs a free FRED_API_KEY)', publisher: 'Federal Reserve Bank of St. Louis', url: 'https://fred.stlouisfed.org/releases/calendar', license: 'FRED terms of use' },
  { id: 'fred', name: 'FRED economic data (BLS, BEA, Census, Federal Reserve series)', publisher: 'Federal Reserve Bank of St. Louis', url: 'https://fred.stlouisfed.org', license: 'Public-domain source series; FRED terms of use' },
  { id: 'ecb-calendar', name: 'Governing Council meeting schedule', publisher: 'European Central Bank', url: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html' },
  { id: 'boe-mpc', name: 'Monetary Policy Committee dates', publisher: 'Bank of England', url: 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates' },
  { id: 'boj-mpm', name: 'Monetary Policy Meeting schedule', publisher: 'Bank of Japan', url: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm' },
  { id: 'boc-schedule', name: 'Interest-rate announcement schedule', publisher: 'Bank of Canada', url: 'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/' },
  { id: 'eurostat', name: 'Eurostat database (HICP, government finance)', publisher: 'Eurostat (European Commission)', url: 'https://ec.europa.eu/eurostat', license: 'Free reuse with attribution' },
  { id: 'destatis', name: 'Press release calendar', publisher: 'Destatis (Federal Statistical Office of Germany)', url: 'https://www.destatis.de/EN/Press/Calendar/_node.html' },
  { id: 'ons', name: 'Release calendar', publisher: 'Office for National Statistics (UK)', url: 'https://www.ons.gov.uk/releasecalendar' },
  { id: 'stat-japan', name: 'Consumer Price Index', publisher: 'Statistics Bureau of Japan', url: 'https://www.stat.go.jp/english/data/cpi/' },
  { id: 'nbs-china', name: 'Statistical releases', publisher: 'National Bureau of Statistics of China', url: 'https://www.stats.gov.cn/english/' },
  { id: 'pboc', name: 'Loan prime rate', publisher: 'People’s Bank of China', url: 'http://www.pbc.gov.cn/en/3688006/index.html' },
  { id: 'statcan', name: 'The Daily — release schedule', publisher: 'Statistics Canada', url: 'https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm' },
  { id: 'mospi', name: 'Consumer Price Index releases', publisher: 'Ministry of Statistics and Programme Implementation (India)', url: 'https://www.mospi.gov.in/' },
  { id: 'igo-calendars', name: 'Meeting calendars of the UN, EU institutions, OPEC, ASEAN, APEC (entered by hand from official announcements, checked against several sources)', publisher: 'Respective organisations', url: 'https://www.consilium.europa.eu/en/meetings/calendar/' },
  { id: 'us-budget-law', name: '31 U.S.C. § 1105 — President’s budget deadline', publisher: 'U.S. Code', url: 'https://www.law.cornell.edu/uscode/text/31/1105', license: 'Public domain' },
  { id: 'india-budget', name: 'Union Budget', publisher: 'Ministry of Finance, Government of India', url: 'https://www.indiabudget.gov.in/' },
  { id: 'bis-policy', name: 'Central bank policy rates', publisher: 'Bank for International Settlements', url: 'https://data.bis.org/topics/CBPOL', license: 'BIS terms of use — free reuse with attribution' },
  { id: 'oecd-mei', name: 'Long-term interest rates: 10-year government bond yields (Main Economic Indicators), via FRED', publisher: 'OECD; distributed by the Federal Reserve Bank of St. Louis', url: 'https://fred.stlouisfed.org/searchresults/?st=IRLTLT01', license: 'OECD terms and conditions' },
  { id: 'ecb-irs', name: 'Long-term interest rate statistics for convergence purposes (10-year benchmark yields, EU members)', publisher: 'European Central Bank', url: 'https://data.ecb.europa.eu/data/datasets/IRS', license: 'ECB reuse policy — free with attribution' },
  { id: 'bank-of-canada', name: 'Valet API — benchmark bond and Treasury bill yields', publisher: 'Bank of Canada', url: 'https://www.bankofcanada.ca/valet/docs', license: 'Bank of Canada terms of use' },
  { id: 'mof-japan', name: 'Interest rate (JGB yields by maturity)', publisher: 'Ministry of Finance, Japan', url: 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm' },
  { id: 'bank-of-england', name: 'Yield curve estimates (Interactive Statistical Database)', publisher: 'Bank of England', url: 'https://www.bankofengland.co.uk/statistics/yield-curves' },
  { id: 'ecb-yield-curve', name: 'Euro area yield curves (AAA-rated central government bonds)', publisher: 'European Central Bank', url: 'https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_area_yield_curves/html/index.en.html', license: 'ECB reuse policy — free with attribution' },
  { id: 'imf-weo', name: 'World Economic Outlook database (DataMapper API)', publisher: 'International Monetary Fund', url: 'https://www.imf.org/external/datamapper', license: 'IMF copyright — free reuse with attribution' },
  { id: 'fed-sep', name: 'Summary of Economic Projections — FOMC participants’ median projections, via FRED', publisher: 'Federal Reserve Board', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', license: 'Public domain' },
  { id: 'cme-fedfunds', name: '30-Day Federal Funds futures (CBOT), delayed quotes via Yahoo Finance', publisher: 'CME Group / Yahoo', url: 'https://www.cmegroup.com/markets/interest-rates/stirs/30-day-federal-fund.html', license: 'Personal, non-commercial use' },
  { id: 'yahoo-consensus', name: 'Analyst estimates and recommendations (contributing brokers), via Yahoo Finance', publisher: 'Yahoo', url: 'https://finance.yahoo.com', license: 'Personal, non-commercial use; replace with a licensed estimates feed for production' },
  { id: 'company-filings', name: 'Company annual reports and exchange listings', publisher: 'Respective companies and stock exchanges' },
  { id: 'bea-schedule', name: 'Release schedule (GDP, personal income and outlays)', publisher: 'U.S. Bureau of Economic Analysis', url: 'https://www.bea.gov/news/schedule', license: 'Public domain' },
  { id: 'census-schedule', name: 'Economic indicator calendar (retail sales and other releases)', publisher: 'U.S. Census Bureau', url: 'https://www.census.gov/economic-indicators/calendar-listview.html', license: 'Public domain' },
  // Sanctions and tariffs
  { id: 'ofac-sdn', name: 'Specially Designated Nationals and Blocked Persons list (SDN, with addresses and aliases)', publisher: 'U.S. Department of the Treasury, Office of Foreign Assets Control', url: 'https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists', license: 'Public domain' },
  { id: 'un-consolidated', name: 'United Nations Security Council Consolidated List', publisher: 'United Nations Security Council', url: 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list', license: 'UN terms of use — free reuse with attribution' },
  { id: 'eu-fsf', name: 'Consolidated list of persons, groups and entities subject to EU financial sanctions', publisher: 'European Commission (DG FISMA), Financial Sanctions Files', url: 'https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions', license: 'Free reuse with attribution (Commission Decision 2011/833/EU)' },
  { id: 'uk-sanctions', name: 'UK Sanctions List / consolidated list of financial sanctions targets', publisher: 'Foreign, Commonwealth & Development Office and HM Treasury (OFSI)', url: 'https://www.gov.uk/government/publications/the-uk-sanctions-list', license: 'Open Government Licence v3.0' },
  { id: 'federal-register', name: 'Federal Register documents API — proclamations, executive orders, USTR, Commerce and CBP tariff notices', publisher: 'Office of the Federal Register (National Archives) / U.S. Government Publishing Office', url: 'https://www.federalregister.gov/developers/documentation/api/v1', license: 'Public domain' },
  { id: 'census-trade', name: 'International trade API — US imports by country, calculated duties', publisher: 'U.S. Census Bureau', url: 'https://www.census.gov/data/developers/data-sets/international-trade.html', license: 'Public domain' },
  // Budgets and reserves
  { id: 'us-treasury-fiscal', name: 'Fiscal Data API — Debt to the Penny, Monthly Treasury Statement, interest expense', publisher: 'U.S. Department of the Treasury, Bureau of the Fiscal Service', url: 'https://fiscaldata.treasury.gov/api-documentation/', license: 'Public domain' },
  { id: 'eurostat-cofog', name: 'General government expenditure by function (COFOG, gov_10a_exp)', publisher: 'Eurostat (European Commission)', url: 'https://ec.europa.eu/eurostat/databrowser/view/gov_10a_exp/default/table', license: 'Free reuse with attribution' },
  { id: 'jodi-oil', name: 'JODI-Oil World Database — crude oil production, refinery intake and closing stocks', publisher: 'Joint Organisations Data Initiative (APEC, Eurostat, GECF, IEA, IEF, OLADE, OPEC, UN Statistics Division)', url: 'https://www.jodidata.org/oil/', license: 'Free reuse with attribution' },
  { id: 'eia-spr', name: 'Weekly petroleum stocks — U.S. Strategic Petroleum Reserve and commercial crude', publisher: 'U.S. Energy Information Administration', url: 'https://www.eia.gov/dnav/pet/pet_stoc_wstk_dcu_nus_w.htm', license: 'Public domain' },
  { id: 'gie-agsi', name: 'AGSI+ Aggregated Gas Storage Inventory (needs a free AGSI_API_KEY)', publisher: 'Gas Infrastructure Europe', url: 'https://agsi.gie.eu/', license: 'Free with attribution (registration required)' },
  { id: 'oil-stock-programmes', name: 'Strategic oil reserve programmes — entered by hand from official pages (U.S. DOE, JOGMEC, ISPRL, EBV, IEA, EUR-Lex)', publisher: 'Respective governments and agencies', url: 'https://www.iea.org/about/oil-security-and-emergency-response' },
  { id: 'usda-psd', name: 'Production, Supply and Distribution (PSD) — grain ending stocks by country', publisher: 'U.S. Department of Agriculture, Foreign Agricultural Service', url: 'https://apps.fas.usda.gov/psdonline/app/index.html', license: 'Public domain' },
];

// FIPS → postal code + capital, for the US state baseline.
export const US_STATES: Record<string, { postal: string; capital?: string }> = {
  '01': { postal: 'AL', capital: 'Montgomery' }, '02': { postal: 'AK', capital: 'Juneau' }, '04': { postal: 'AZ', capital: 'Phoenix' },
  '05': { postal: 'AR', capital: 'Little Rock' }, '06': { postal: 'CA', capital: 'Sacramento' }, '08': { postal: 'CO', capital: 'Denver' },
  '09': { postal: 'CT', capital: 'Hartford' }, '10': { postal: 'DE', capital: 'Dover' }, '11': { postal: 'DC' },
  '12': { postal: 'FL', capital: 'Tallahassee' }, '13': { postal: 'GA', capital: 'Atlanta' }, '15': { postal: 'HI', capital: 'Honolulu' },
  '16': { postal: 'ID', capital: 'Boise' }, '17': { postal: 'IL', capital: 'Springfield' }, '18': { postal: 'IN', capital: 'Indianapolis' },
  '19': { postal: 'IA', capital: 'Des Moines' }, '20': { postal: 'KS', capital: 'Topeka' }, '21': { postal: 'KY', capital: 'Frankfort' },
  '22': { postal: 'LA', capital: 'Baton Rouge' }, '23': { postal: 'ME', capital: 'Augusta' }, '24': { postal: 'MD', capital: 'Annapolis' },
  '25': { postal: 'MA', capital: 'Boston' }, '26': { postal: 'MI', capital: 'Lansing' }, '27': { postal: 'MN', capital: 'Saint Paul' },
  '28': { postal: 'MS', capital: 'Jackson' }, '29': { postal: 'MO', capital: 'Jefferson City' }, '30': { postal: 'MT', capital: 'Helena' },
  '31': { postal: 'NE', capital: 'Lincoln' }, '32': { postal: 'NV', capital: 'Carson City' }, '33': { postal: 'NH', capital: 'Concord' },
  '34': { postal: 'NJ', capital: 'Trenton' }, '35': { postal: 'NM', capital: 'Santa Fe' }, '36': { postal: 'NY', capital: 'Albany' },
  '37': { postal: 'NC', capital: 'Raleigh' }, '38': { postal: 'ND', capital: 'Bismarck' }, '39': { postal: 'OH', capital: 'Columbus' },
  '40': { postal: 'OK', capital: 'Oklahoma City' }, '41': { postal: 'OR', capital: 'Salem' }, '42': { postal: 'PA', capital: 'Harrisburg' },
  '44': { postal: 'RI', capital: 'Providence' }, '45': { postal: 'SC', capital: 'Columbia' }, '46': { postal: 'SD', capital: 'Pierre' },
  '47': { postal: 'TN', capital: 'Nashville' }, '48': { postal: 'TX', capital: 'Austin' }, '49': { postal: 'UT', capital: 'Salt Lake City' },
  '50': { postal: 'VT', capital: 'Montpelier' }, '51': { postal: 'VA', capital: 'Richmond' }, '53': { postal: 'WA', capital: 'Olympia' },
  '54': { postal: 'WV', capital: 'Charleston' }, '55': { postal: 'WI', capital: 'Madison' }, '56': { postal: 'WY', capital: 'Cheyenne' },
  '60': { postal: 'AS', capital: 'Pago Pago' }, '66': { postal: 'GU', capital: 'Hagåtña' }, '69': { postal: 'MP', capital: 'Saipan' },
  '72': { postal: 'PR', capital: 'San Juan' }, '78': { postal: 'VI', capital: 'Charlotte Amalie' },
};

// ───────────────────────── helpers ─────────────────────────
type E = Partial<Entity> & { id: string };
const ents: E[] = [];
const rels: Omit<Relationship, 'id'>[] = [];

const f = (label: string, value: string | number, sourceId: string, o: Partial<Fact> = {}): Fact =>
  ({ label, value, sourceId, quality: 'curated', asOf: AS_OF, ...o });
const t = (date: string, title: string, sourceId?: string, detail?: string): TimelineItem => ({ date, title, sourceId, detail });

function add(e: E) { ents.push(e); return e.id; }
function rel(from: string, type: RelType, to: string, o: Partial<Relationship> = {}) { rels.push({ from, type, to, ...o }); }
const C = (iso3: string) => `country:${iso3}`;

// ───────────────────────── Countries (curated overlay) ─────────────────────────
interface CountrySpec { iso3: string; govType: string; govGroup: 'presidential' | 'parliamentary' | 'monarchy' | 'one-party'; system?: string; summary?: string; centralBank?: string; fxRegime?: string; legislature?: string; ratings?: [string, string, string][]; sourceId?: string; aliases?: string[]; timeline?: TimelineItem[]; extraFacts?: Fact[]; }
const COUNTRY_GOV: CountrySpec[] = [
  { iso3: 'USA', govType: 'Federal presidential constitutional republic', govGroup: 'presidential', aliases: ['US', 'U.S.', 'America', 'United States of America', 'USA'],
    summary: 'Federal republic of 50 states and the District of Columbia. World’s largest economy by nominal GDP and issuer of the main global reserve currency; founding member of NATO, the UN, the IMF, G7 and G20.',
    system: 'Separation of powers: President (head of state and government), bicameral Congress (Senate, House of Representatives), Supreme Court.',
    legislature: 'Congress — Senate (100) and House of Representatives (435); 119th Congress (2025–2027) has Republican majorities in both chambers.',
    centralBank: 'Federal Reserve System', fxRegime: 'Free-floating (US dollar)',
    ratings: [['S&P Global', 'AA+', '2011-08'], ['Moody’s', 'Aa1', '2025-05'], ['Fitch', 'AA+', '2023-08']], sourceId: 'whitehouse',
    timeline: [t('1776-07-04', 'Declaration of Independence'), t('1789-03-04', 'Constitution takes effect'), t('2025-01-20', 'Donald Trump inaugurated as 47th President', 'whitehouse'), t('2026-11-03', 'Midterm elections (all House seats, 35 Senate seats, 36 governorships)', 'congress')] },
  { iso3: 'SAU', govType: 'Absolute monarchy', govGroup: 'monarchy', aliases: ['KSA', 'Saudi', 'Kingdom of Saudi Arabia'],
    summary: 'Absolute monarchy governed by the Al Saud family; custodian of Islam’s two holiest mosques. Holds some of the world’s largest proven oil reserves; de facto leader of OPEC and co-chair (with Russia) of the OPEC+ alliance. Vision 2030 aims to diversify the economy away from hydrocarbons.',
    system: 'King is head of state and (by law) head of government; since 2022 the Crown Prince serves as Prime Minister. Consultative Assembly (Shura Council) is appointed. No political parties.',
    legislature: 'Consultative Assembly (Majlis al-Shura), 150 appointed members — advisory.',
    centralBank: 'Saudi Central Bank (SAMA)', fxRegime: 'Pegged to the US dollar at 3.75 riyal per USD (since 1986)',
    ratings: [['Moody’s', 'Aa3', '2024-11'], ['S&P Global', 'A+', '2025-03']], sourceId: 'spa',
    timeline: [t('1932-09-23', 'Kingdom of Saudi Arabia proclaimed (National Day)'), t('1938-03-03', 'Commercial oil discovered at Dammam No. 7'), t('1960-09-14', 'Founding member of OPEC (Baghdad conference)', 'opec'), t('2016-04-25', 'Vision 2030 launched', 'vision2030'), t('2017-06-21', 'Mohammed bin Salman named Crown Prince', 'spa'), t('2019-12-11', 'Saudi Aramco lists on Tadawul — then the largest IPO on record', 'company-ir'), t('2022-09-27', 'Crown Prince appointed Prime Minister by royal decree', 'spa')] },
  { iso3: 'DEU', govType: 'Federal parliamentary republic', govGroup: 'parliamentary', aliases: ['Germany', 'Deutschland', 'FRG', 'Federal Republic of Germany'],
    summary: 'Federal parliamentary republic of 16 states (Länder); largest economy in the EU and a founding member of the European Communities. Export-oriented manufacturing base (automotive, machinery, chemicals).',
    system: 'Chancellor (head of government) elected by the Bundestag; Federal President (head of state) largely ceremonial; Bundesrat represents the Länder.',
    legislature: 'Bundestag (630 seats from 2025) and Bundesrat.', centralBank: 'Deutsche Bundesbank (Eurosystem; monetary policy set by the ECB)', fxRegime: 'Euro (free-floating)',
    ratings: [['S&P Global', 'AAA', AS_OF], ['Moody’s', 'Aaa', AS_OF], ['Fitch', 'AAA', AS_OF]], sourceId: 'bundesregierung',
    timeline: [t('1949-05-23', 'Basic Law (Grundgesetz) adopted'), t('1955-05-06', 'West Germany joins NATO', 'nato'), t('1990-10-03', 'German reunification'), t('2025-02-23', 'Snap federal election: CDU/CSU first (28.5%), AfD second (20.8%)', 'bundeswahlleiterin'), t('2025-05-06', 'Friedrich Merz elected Chancellor; CDU/CSU–SPD coalition', 'bundesregierung')] },
  { iso3: 'GBR', govType: 'Parliamentary constitutional monarchy', govGroup: 'parliamentary', aliases: ['UK', 'U.K.', 'Britain', 'Great Britain', 'United Kingdom'],
    summary: 'Unitary parliamentary democracy and constitutional monarchy comprising England, Scotland, Wales and Northern Ireland. Permanent member of the UN Security Council; left the EU on 31 January 2020.',
    system: 'Monarch is head of state; Prime Minister leads the government and must command a majority in the House of Commons.',
    legislature: 'House of Commons (650) and House of Lords.', centralBank: 'Bank of England', fxRegime: 'Free-floating (pound sterling)',
    ratings: [['S&P Global', 'AA', AS_OF], ['Moody’s', 'Aa3', AS_OF], ['Fitch', 'AA-', AS_OF]], sourceId: 'gov-uk',
    timeline: [t('1949-04-04', 'Founding member of NATO', 'nato'), t('1973-01-01', 'Joins the European Communities'), t('2020-01-31', 'Leaves the European Union', 'eu'), t('2022-09-08', 'Accession of King Charles III', 'royal-uk'), t('2024-07-05', 'Keir Starmer becomes Prime Minister after Labour election win', 'gov-uk')] },
  { iso3: 'FRA', govType: 'Semi-presidential republic', govGroup: 'presidential', aliases: ['France', 'French Republic'],
    summary: 'Unitary semi-presidential republic; founding member of the European Communities and NATO, permanent member of the UN Security Council and a nuclear power.',
    system: 'Directly elected President (head of state) appoints the Prime Minister, who is accountable to the National Assembly.',
    legislature: 'National Assembly (577) and Senate (348).', centralBank: 'Banque de France (Eurosystem)', fxRegime: 'Euro (free-floating)',
    ratings: [['S&P Global', 'A+', '2025-10'], ['Fitch', 'A+', '2025-09'], ['Moody’s', 'Aa3', '2025-10']], sourceId: 'elysee' },
  { iso3: 'JPN', govType: 'Parliamentary constitutional monarchy', govGroup: 'parliamentary', aliases: ['Japan', 'Nippon', 'Nihon'],
    summary: 'Parliamentary democracy with a ceremonial Emperor. Fourth- or fifth-largest economy by nominal GDP; major exporter of vehicles, machinery and electronics; G7 member.',
    system: 'Prime Minister designated by the National Diet; Emperor is the symbol of the state.', legislature: 'National Diet — House of Representatives (465) and House of Councillors (248).',
    centralBank: 'Bank of Japan', fxRegime: 'Free-floating (yen)',
    ratings: [['S&P Global', 'A+', AS_OF], ['Moody’s', 'A1', AS_OF], ['Fitch', 'A', AS_OF]], sourceId: 'kantei',
    timeline: [t('2019-05-01', 'Reiwa era begins with accession of Emperor Naruhito'), t('2025-10-21', 'Sanae Takaichi becomes Japan’s first female Prime Minister', 'kantei')] },
  { iso3: 'CHN', govType: 'One-party socialist republic', govGroup: 'one-party', aliases: ['China', 'PRC', "People's Republic of China", 'Mainland China'],
    summary: 'Single-party state led by the Chinese Communist Party. Second-largest economy by nominal GDP (largest by PPP), largest goods exporter, and the largest importer of crude oil, iron ore and soybeans.',
    system: 'CCP General Secretary is paramount leader; President is head of state; Premier heads the State Council.', legislature: 'National People’s Congress (≈3,000 delegates).',
    centralBank: 'People’s Bank of China', fxRegime: 'Managed float against a currency basket (renminbi)',
    ratings: [['S&P Global', 'A+', AS_OF], ['Moody’s', 'A1', AS_OF], ['Fitch', 'A', '2025-04']], sourceId: 'gov-cn' },
  { iso3: 'IND', govType: 'Federal parliamentary republic', govGroup: 'parliamentary', aliases: ['India', 'Bharat', 'Republic of India'],
    summary: 'Federal parliamentary republic of 28 states and 8 union territories; the world’s most populous country and one of the fastest-growing large economies. Member of BRICS, G20 and the Quad.',
    system: 'Prime Minister leads the government; President is head of state, elected by an electoral college.', legislature: 'Parliament — Lok Sabha (543) and Rajya Sabha.',
    centralBank: 'Reserve Bank of India', fxRegime: 'Floating with central-bank intervention (rupee)',
    ratings: [['S&P Global', 'BBB', '2025-08'], ['Moody’s', 'Baa3', AS_OF], ['Fitch', 'BBB-', AS_OF]], sourceId: 'pmindia' },
  { iso3: 'BRA', govType: 'Federal presidential republic', govGroup: 'presidential', aliases: ['Brazil', 'Brasil', 'Federative Republic of Brazil'],
    summary: 'Federal presidential republic of 26 states and a federal district; Latin America’s largest economy and the world’s leading exporter of soybeans, coffee, sugar and beef. BRICS founding member.',
    system: 'Directly elected President is head of state and government.', legislature: 'National Congress — Chamber of Deputies (513) and Federal Senate (81).',
    centralBank: 'Banco Central do Brasil', fxRegime: 'Free-floating (real)',
    ratings: [['S&P Global', 'BB', AS_OF], ['Moody’s', 'Ba1', '2024-10'], ['Fitch', 'BB', AS_OF]], sourceId: 'gov-br' },
  { iso3: 'CAN', govType: 'Federal parliamentary constitutional monarchy', govGroup: 'parliamentary', aliases: ['Canada'],
    summary: 'Federal parliamentary democracy and constitutional monarchy of 10 provinces and 3 territories. Major energy exporter (fourth-largest oil producer) with deep trade integration with the United States.',
    system: 'Prime Minister must hold the confidence of the House of Commons; the King is represented by the Governor General.', legislature: 'House of Commons (343) and Senate.',
    centralBank: 'Bank of Canada', fxRegime: 'Free-floating (Canadian dollar)',
    ratings: [['S&P Global', 'AAA', AS_OF], ['Moody’s', 'Aaa', AS_OF], ['Fitch', 'AA+', AS_OF]], sourceId: 'pm-canada' },
  // Government type only (no curated politics yet)
  { iso3: 'RUS', govType: 'Federal semi-presidential republic', govGroup: 'presidential' }, { iso3: 'ITA', govType: 'Parliamentary republic', govGroup: 'parliamentary' },
  { iso3: 'ESP', govType: 'Parliamentary constitutional monarchy', govGroup: 'parliamentary' }, { iso3: 'AUS', govType: 'Federal parliamentary constitutional monarchy', govGroup: 'parliamentary' },
  { iso3: 'MEX', govType: 'Federal presidential republic', govGroup: 'presidential' }, { iso3: 'KOR', govType: 'Presidential republic', govGroup: 'presidential' },
  { iso3: 'TUR', govType: 'Presidential republic', govGroup: 'presidential' }, { iso3: 'ARE', govType: 'Federation of absolute monarchies', govGroup: 'monarchy' },
  { iso3: 'POL', govType: 'Parliamentary republic', govGroup: 'parliamentary' }, { iso3: 'IRN', govType: 'Theocratic Islamic republic', govGroup: 'presidential' },
  { iso3: 'ZAF', govType: 'Parliamentary republic (executive presidency)', govGroup: 'parliamentary' }, { iso3: 'NGA', govType: 'Federal presidential republic', govGroup: 'presidential' },
  { iso3: 'IDN', govType: 'Presidential republic', govGroup: 'presidential' }, { iso3: 'ARG', govType: 'Federal presidential republic', govGroup: 'presidential' },
  { iso3: 'NOR', govType: 'Parliamentary constitutional monarchy', govGroup: 'parliamentary' }, { iso3: 'SWE', govType: 'Parliamentary constitutional monarchy', govGroup: 'parliamentary' },
  { iso3: 'NLD', govType: 'Parliamentary constitutional monarchy', govGroup: 'parliamentary' }, { iso3: 'BEL', govType: 'Federal parliamentary constitutional monarchy', govGroup: 'parliamentary' },
  { iso3: 'DNK', govType: 'Parliamentary constitutional monarchy', govGroup: 'parliamentary' }, { iso3: 'FIN', govType: 'Parliamentary republic', govGroup: 'parliamentary' },
  { iso3: 'CHE', govType: 'Federal directorial republic', govGroup: 'parliamentary' }, { iso3: 'KWT', govType: 'Constitutional emirate (parliament suspended 2024)', govGroup: 'monarchy' },
  { iso3: 'QAT', govType: 'Absolute monarchy (emirate)', govGroup: 'monarchy' }, { iso3: 'OMN', govType: 'Absolute monarchy', govGroup: 'monarchy' },
  { iso3: 'IRQ', govType: 'Federal parliamentary republic', govGroup: 'parliamentary' }, { iso3: 'EGY', govType: 'Semi-presidential republic', govGroup: 'presidential' },
  { iso3: 'PRK', govType: 'One-party state', govGroup: 'one-party' }, { iso3: 'VNM', govType: 'One-party socialist republic', govGroup: 'one-party' },
  { iso3: 'CUB', govType: 'One-party socialist republic', govGroup: 'one-party' }, { iso3: 'LAO', govType: 'One-party socialist republic', govGroup: 'one-party' },
  { iso3: 'TWN', govType: 'Semi-presidential republic', govGroup: 'presidential', aliases: ['Taiwan', 'Republic of China', 'ROC'] },
  { iso3: 'CHL', govType: 'Presidential republic', govGroup: 'presidential' }, { iso3: 'PER', govType: 'Presidential republic', govGroup: 'presidential' },
  { iso3: 'COL', govType: 'Presidential republic', govGroup: 'presidential' }, { iso3: 'VEN', govType: 'Federal presidential republic', govGroup: 'presidential' },
  { iso3: 'KAZ', govType: 'Presidential republic', govGroup: 'presidential' }, { iso3: 'BHR', govType: 'Constitutional monarchy', govGroup: 'monarchy' },
  { iso3: 'JOR', govType: 'Constitutional monarchy', govGroup: 'monarchy' }, { iso3: 'MAR', govType: 'Constitutional monarchy', govGroup: 'monarchy' },
  { iso3: 'UKR', govType: 'Semi-presidential republic', govGroup: 'presidential' }, { iso3: 'PRT', govType: 'Semi-presidential republic', govGroup: 'presidential' },
  { iso3: 'IRL', govType: 'Parliamentary republic', govGroup: 'parliamentary' }, { iso3: 'GRC', govType: 'Parliamentary republic', govGroup: 'parliamentary' },
  { iso3: 'ISR', govType: 'Parliamentary republic', govGroup: 'parliamentary' }, { iso3: 'PAK', govType: 'Federal parliamentary republic', govGroup: 'parliamentary' },
  { iso3: 'NZL', govType: 'Parliamentary constitutional monarchy', govGroup: 'parliamentary' }, { iso3: 'THA', govType: 'Parliamentary constitutional monarchy', govGroup: 'parliamentary' },
  { iso3: 'MYS', govType: 'Federal parliamentary elective monarchy', govGroup: 'parliamentary' }, { iso3: 'PHL', govType: 'Presidential republic', govGroup: 'presidential' },
  { iso3: 'SGP', govType: 'Parliamentary republic', govGroup: 'parliamentary' }, { iso3: 'BRN', govType: 'Absolute monarchy (sultanate)', govGroup: 'monarchy' },
];
for (const c of COUNTRY_GOV) {
  const facts: Fact[] = [f('Government type', c.govType, c.sourceId || 'world-countries')];
  if (c.system) facts.push(f('Political system', c.system, c.sourceId!));
  if (c.legislature) facts.push(f('Legislature', c.legislature, c.sourceId!));
  if (c.centralBank) facts.push(f('Central bank', c.centralBank, c.sourceId!));
  if (c.fxRegime) facts.push(f('Exchange-rate regime', c.fxRegime, c.sourceId!));
  add({ id: C(c.iso3), depth: c.summary ? 'curated' : 'baseline', summary: c.summary, aliases: c.aliases, facts, timeline: c.timeline,
    attrs: { govType: c.govType, govGroup: c.govGroup, ratings: c.ratings?.map(([agency, rating, asOf]) => ({ agency, rating, asOf, sourceId: 'ratings' })) } } as E);
}

// ───────────────────────── Regions / states / cities ─────────────────────────
add({ id: 'state:US-PA', depth: 'curated', aliases: ['Pennsylvania', 'Penn', 'Keystone State', 'Commonwealth of Pennsylvania'],
  summary: 'Commonwealth in the Mid-Atlantic and one of the original thirteen states (second to ratify the Constitution, 12 Dec 1787). A perennial presidential swing state with 19 electoral votes; second-largest natural-gas-producing state thanks to the Marcellus Shale.',
  facts: [f('Population (2020 Census)', 13002700, 'us-census', { unit: 'people', period: '2020', quality: 'official' }), f('Statehood', '12 December 1787 (2nd state)', 'pa-gov'),
    f('Electoral votes', 19, 'congress', { period: '2024–2028' }), f('Legislature', 'General Assembly — Senate (50) and House of Representatives (203)', 'pa-gov'),
    f('Key sectors', 'Healthcare & life sciences, advanced manufacturing, energy (natural gas), agriculture & food processing, finance', 'pa-gov'),
    f('Natural gas production rank', '2nd among US states', 'eia-states')],
  timeline: [t('1681-03-04', 'Charter granted to William Penn'), t('1787-12-12', 'Ratifies the U.S. Constitution'), t('2023-01-17', 'Josh Shapiro inaugurated as 48th Governor', 'pa-gov'), t('2026-11-03', 'Gubernatorial and legislative elections', 'pa-dos')] });
add({ id: 'state:US-TX', depth: 'curated', summary: 'Second-largest US state by population and area; largest US producer of crude oil and natural gas, home to the Houston energy cluster.', facts: [f('Oil & gas', 'Largest crude-oil and natural-gas producing state', 'eia-states')] });
add({ id: 'state:US-CA', depth: 'curated', summary: 'Most populous US state; Silicon Valley technology cluster, Hollywood, and the Ports of Los Angeles/Long Beach.' });
add({ id: 'state:US-NY', depth: 'curated', summary: 'Home to New York City, the leading US financial center (NYSE, Nasdaq) and UN headquarters.' });

interface CitySpec { slug: string; name: string; parent: string; coords: [number, number]; tier: 1 | 2 | 3; capitalOf?: string[]; summary?: string; aliases?: string[]; facts?: Fact[]; }
const CITIES: CitySpec[] = [
  { slug: 'washington-dc', name: 'Washington, D.C.', parent: 'state:US-DC', coords: [-77.0369, 38.9072], tier: 1, capitalOf: ['country:USA'], aliases: ['Washington', 'DC'], summary: 'Federal capital of the United States; seat of the White House, Congress and the Supreme Court, and headquarters of the IMF and World Bank.' },
  { slug: 'new-york', name: 'New York City', parent: 'state:US-NY', coords: [-74.006, 40.7128], tier: 1, aliases: ['NYC', 'New York'], summary: 'Largest US city; global financial center (NYSE, Nasdaq) and UN headquarters.' },
  { slug: 'los-angeles', name: 'Los Angeles', parent: 'state:US-CA', coords: [-118.2437, 34.0522], tier: 2, aliases: ['LA'] },
  { slug: 'chicago', name: 'Chicago', parent: 'state:US-IL', coords: [-87.6298, 41.8781], tier: 2, summary: 'Home of CME Group, where many benchmark commodity futures (grains, livestock) are traded.' },
  { slug: 'houston', name: 'Houston', parent: 'state:US-TX', coords: [-95.3698, 29.7604], tier: 2, summary: 'Center of the US oil and gas industry; headquarters region for ExxonMobil and Chevron.' },
  { slug: 'cupertino', name: 'Cupertino', parent: 'state:US-CA', coords: [-122.0322, 37.323], tier: 3, summary: 'Silicon Valley city; Apple Park headquarters.' },
  { slug: 'santa-clara', name: 'Santa Clara', parent: 'state:US-CA', coords: [-121.9552, 37.3541], tier: 3, summary: 'Silicon Valley city; NVIDIA headquarters.' },
  { slug: 'redmond', name: 'Redmond', parent: 'state:US-WA', coords: [-122.1215, 47.674], tier: 3, summary: 'Seattle-area city; Microsoft headquarters.' },
  { slug: 'bethesda', name: 'Bethesda', parent: 'state:US-MD', coords: [-77.1003, 38.9847], tier: 4 as any, summary: 'Washington-area community; Lockheed Martin headquarters.' },
  { slug: 'philadelphia', name: 'Philadelphia', parent: 'state:US-PA', coords: [-75.1652, 39.9526], tier: 2, aliases: ['Philly'],
    summary: 'Largest city in Pennsylvania and sixth-largest in the US; site of the signing of the Declaration of Independence and the Constitution. Economy anchored by healthcare and universities (“eds and meds”), finance, and Comcast’s headquarters.',
    facts: [f('Population (2020 Census)', 1603797, 'us-census', { unit: 'people', period: '2020', quality: 'official' }), f('Government', 'Mayor–council; consolidated city-county (Philadelphia County)', 'phila-gov')] },
  { slug: 'pittsburgh', name: 'Pittsburgh', parent: 'state:US-PA', coords: [-79.9959, 40.4406], tier: 2,
    summary: 'Second-largest city in Pennsylvania, historically the center of the US steel industry. Today a hub for healthcare (UPMC), universities (Carnegie Mellon, Pitt), robotics/AI and finance (PNC). Headquarters of U.S. Steel and PPG.',
    facts: [f('Population (2020 Census)', 302971, 'us-census', { unit: 'people', period: '2020', quality: 'official' }), f('County', 'Allegheny County', 'us-census', { quality: 'official' })] },
  { slug: 'harrisburg', name: 'Harrisburg', parent: 'state:US-PA', coords: [-76.8867, 40.2732], tier: 3, capitalOf: ['state:US-PA'],
    summary: 'Capital of Pennsylvania, on the Susquehanna River; seat of the General Assembly and the Governor.', facts: [f('Population (2020 Census)', 50099, 'us-census', { unit: 'people', period: '2020', quality: 'official' })] },
  { slug: 'allentown', name: 'Allentown', parent: 'state:US-PA', coords: [-75.4902, 40.6084], tier: 3, summary: 'Third-largest city in Pennsylvania; Lehigh Valley logistics and manufacturing center.', facts: [f('Population (2020 Census)', 125845, 'us-census', { unit: 'people', period: '2020', quality: 'official' })] },
  { slug: 'erie', name: 'Erie', parent: 'state:US-PA', coords: [-80.0851, 42.1292], tier: 3, summary: 'Port city on Lake Erie in northwestern Pennsylvania.', facts: [f('Population (2020 Census)', 94831, 'us-census', { unit: 'people', period: '2020', quality: 'official' })] },
  { slug: 'hershey', name: 'Hershey', parent: 'state:US-PA', coords: [-76.6505, 40.2859], tier: 4 as any, summary: 'Unincorporated community in Derry Township founded around Milton S. Hershey’s chocolate factory; headquarters of The Hershey Company.' },
  { slug: 'riyadh', name: 'Riyadh', parent: 'country:SAU', coords: [46.6753, 24.7136], tier: 1, capitalOf: ['country:SAU'], summary: 'Capital and largest city of Saudi Arabia; seat of government and of the Public Investment Fund.' },
  { slug: 'jeddah', name: 'Jeddah', parent: 'country:SAU', coords: [39.1925, 21.4858], tier: 2, summary: 'Red Sea port and commercial hub; gateway to Mecca.' },
  { slug: 'dhahran', name: 'Dhahran', parent: 'country:SAU', coords: [50.1033, 26.2361], tier: 3, summary: 'Eastern Province city; headquarters of Saudi Aramco.' },
  { slug: 'berlin', name: 'Berlin', parent: 'country:DEU', coords: [13.405, 52.52], tier: 1, capitalOf: ['country:DEU'] },
  { slug: 'frankfurt', name: 'Frankfurt am Main', parent: 'country:DEU', coords: [8.6821, 50.1109], tier: 2, aliases: ['Frankfurt'], summary: 'Financial center; seat of the European Central Bank, the Bundesbank and the Frankfurt Stock Exchange.' },
  { slug: 'dusseldorf', name: 'Düsseldorf', parent: 'country:DEU', coords: [6.7735, 51.2277], tier: 3, summary: 'Capital of North Rhine-Westphalia; Rheinmetall headquarters.' },
  { slug: 'walldorf', name: 'Walldorf', parent: 'country:DEU', coords: [8.6429, 49.3064], tier: 3, summary: 'Town in Baden-Württemberg; SAP headquarters.' },
  { slug: 'stuttgart', name: 'Stuttgart', parent: 'country:DEU', coords: [9.1829, 48.7758], tier: 3, summary: 'Automotive cluster (Bosch, Mercedes-Benz, Porsche).' },
  { slug: 'london', name: 'London', parent: 'country:GBR', coords: [-0.1276, 51.5072], tier: 1, capitalOf: ['country:GBR'], summary: 'UK capital and global financial center; headquarters of Shell and BP.' },
  { slug: 'paris', name: 'Paris', parent: 'country:FRA', coords: [2.3522, 48.8566], tier: 1, capitalOf: ['country:FRA'] },
  { slug: 'brussels', name: 'Brussels', parent: 'country:BEL', coords: [4.3517, 50.8503], tier: 1, capitalOf: ['country:BEL'], summary: 'Belgian capital; seat of the main EU institutions and NATO headquarters.' },
  { slug: 'vienna', name: 'Vienna', parent: 'country:AUT', coords: [16.3738, 48.2082], tier: 1, capitalOf: ['country:AUT'], summary: 'Austrian capital; OPEC Secretariat and IAEA headquarters.' },
  { slug: 'geneva', name: 'Geneva', parent: 'country:CHE', coords: [6.1432, 46.2044], tier: 2, summary: 'Seat of the WTO and many UN agencies; commodity-trading hub (Vitol, Trafigura and others).' },
  { slug: 'tokyo', name: 'Tokyo', parent: 'country:JPN', coords: [139.6917, 35.6895], tier: 1, capitalOf: ['country:JPN'] },
  { slug: 'toyota-city', name: 'Toyota City', parent: 'country:JPN', coords: [137.1563, 35.0825], tier: 3, summary: 'Aichi Prefecture city; Toyota Motor headquarters.' },
  { slug: 'beijing', name: 'Beijing', parent: 'country:CHN', coords: [116.4074, 39.9042], tier: 1, capitalOf: ['country:CHN'] },
  { slug: 'shanghai', name: 'Shanghai', parent: 'country:CHN', coords: [121.4737, 31.2304], tier: 2, summary: 'Largest Chinese city by population; financial center and world’s busiest container port.' },
  { slug: 'new-delhi', name: 'New Delhi', parent: 'country:IND', coords: [77.209, 28.6139], tier: 1, capitalOf: ['country:IND'] },
  { slug: 'mumbai', name: 'Mumbai', parent: 'country:IND', coords: [72.8777, 19.076], tier: 2, summary: 'India’s financial capital; home to the Reserve Bank of India, BSE and NSE.' },
  { slug: 'brasilia', name: 'Brasília', parent: 'country:BRA', coords: [-47.8825, -15.7942], tier: 1, capitalOf: ['country:BRA'] },
  { slug: 'sao-paulo', name: 'São Paulo', parent: 'country:BRA', coords: [-46.6333, -23.5505], tier: 2, summary: 'Largest city in the Southern Hemisphere; Brazil’s financial center (B3 exchange).' },
  { slug: 'ottawa', name: 'Ottawa', parent: 'country:CAN', coords: [-75.6972, 45.4215], tier: 1, capitalOf: ['country:CAN'] },
  { slug: 'toronto', name: 'Toronto', parent: 'country:CAN', coords: [-79.3832, 43.6532], tier: 2, summary: 'Canada’s largest city and financial center (TSX).' },
  { slug: 'taipei', name: 'Taipei', parent: 'country:TWN', coords: [121.5654, 25.033], tier: 1, capitalOf: ['country:TWN'] },
  { slug: 'hsinchu', name: 'Hsinchu', parent: 'country:TWN', coords: [120.9675, 24.8138], tier: 3, summary: 'Hsinchu Science Park; TSMC headquarters.' },
  { slug: 'moscow', name: 'Moscow', parent: 'country:RUS', coords: [37.6173, 55.7558], tier: 1, capitalOf: ['country:RUS'] },
  { slug: 'abu-dhabi', name: 'Abu Dhabi', parent: 'country:ARE', coords: [54.3773, 24.4539], tier: 1, capitalOf: ['country:ARE'] },
  { slug: 'jakarta', name: 'Jakarta', parent: 'country:IDN', coords: [106.8456, -6.2088], tier: 1, capitalOf: ['country:IDN'], summary: 'Indonesian capital; ASEAN Secretariat.' },
  { slug: 'suwon', name: 'Suwon', parent: 'country:KOR', coords: [127.0286, 37.2636], tier: 3, summary: 'Samsung Electronics headquarters.' },
  // Capitals and corporate centres added with the expanded company list
  { slug: 'seattle', name: 'Seattle', parent: 'state:US-WA', coords: [-122.3321, 47.6062], tier: 2, summary: 'Largest city in Washington State; Amazon headquarters and a major Pacific trade port.' },
  { slug: 'san-francisco', name: 'San Francisco', parent: 'state:US-CA', coords: [-122.4194, 37.7749], tier: 2, summary: 'Financial and technology centre of the Bay Area; Visa and many AI companies are based here.' },
  { slug: 'mountain-view', name: 'Mountain View', parent: 'state:US-CA', coords: [-122.0838, 37.3861], tier: 3, summary: 'Silicon Valley city; Alphabet (Google) headquarters.' },
  { slug: 'austin', name: 'Austin', parent: 'state:US-TX', coords: [-97.7431, 30.2672], tier: 2, capitalOf: ['state:US-TX'], summary: 'Capital of Texas; technology hub and Tesla headquarters.' },
  { slug: 'omaha', name: 'Omaha', parent: 'state:US-NE', coords: [-95.9345, 41.2565], tier: 3, summary: 'Largest city in Nebraska; Berkshire Hathaway headquarters.' },
  { slug: 'atlanta', name: 'Atlanta', parent: 'state:US-GA', coords: [-84.388, 33.749], tier: 2, capitalOf: ['state:US-GA'], summary: 'Capital of Georgia; Coca-Cola and Delta Air Lines headquarters.' },
  { slug: 'charlotte', name: 'Charlotte', parent: 'state:US-NC', coords: [-80.8431, 35.2271], tier: 3, summary: 'Second-largest US banking centre; Bank of America headquarters.' },
  { slug: 'detroit', name: 'Detroit', parent: 'state:US-MI', coords: [-83.0458, 42.3314], tier: 2, summary: 'Historic centre of the US auto industry; General Motors headquarters (Ford is in nearby Dearborn).' },
  { slug: 'denver', name: 'Denver', parent: 'state:US-CO', coords: [-104.9903, 39.7392], tier: 2, capitalOf: ['state:US-CO'], summary: 'Capital of Colorado; Newmont and Palantir headquarters.' },
  { slug: 'munich', name: 'Munich', parent: 'country:DEU', coords: [11.582, 48.1351], tier: 2, aliases: ['München'], summary: 'Capital of Bavaria; headquarters of Siemens, BMW and Allianz.' },
  { slug: 'wolfsburg', name: 'Wolfsburg', parent: 'country:DEU', coords: [10.7865, 52.4227], tier: 3, summary: 'Lower Saxony city built around Volkswagen’s main plant and headquarters.' },
  { slug: 'amsterdam', name: 'Amsterdam', parent: 'country:NLD', coords: [4.9041, 52.3676], tier: 1, capitalOf: ['country:NLD'], summary: 'Constitutional capital of the Netherlands; Euronext Amsterdam exchange.' },
  { slug: 'copenhagen', name: 'Copenhagen', parent: 'country:DNK', coords: [12.5683, 55.6761], tier: 1, capitalOf: ['country:DNK'], summary: 'Danish capital; A.P. Møller–Maersk headquarters and Nasdaq Copenhagen.' },
  { slug: 'bern', name: 'Bern', parent: 'country:CHE', coords: [7.4474, 46.948], tier: 1, capitalOf: ['country:CHE'], summary: 'Federal city (de facto capital) of Switzerland.' },
  { slug: 'basel', name: 'Basel', parent: 'country:CHE', coords: [7.5886, 47.5596], tier: 3, summary: 'Pharmaceutical centre on the Rhine; Roche and Novartis headquarters, seat of the Bank for International Settlements.' },
  { slug: 'zurich', name: 'Zürich', parent: 'country:CHE', coords: [8.5417, 47.3769], tier: 2, aliases: ['Zurich'], summary: 'Largest Swiss city and financial centre; SIX Swiss Exchange.' },
  { slug: 'madrid', name: 'Madrid', parent: 'country:ESP', coords: [-3.7038, 40.4168], tier: 1, capitalOf: ['country:ESP'] },
  { slug: 'rome', name: 'Rome', parent: 'country:ITA', coords: [12.4964, 41.9028], tier: 1, capitalOf: ['country:ITA'] },
  { slug: 'milan', name: 'Milan', parent: 'country:ITA', coords: [9.19, 45.4642], tier: 2, summary: 'Italy’s financial centre (Borsa Italiana); UniCredit headquarters.' },
  { slug: 'stockholm', name: 'Stockholm', parent: 'country:SWE', coords: [18.0686, 59.3293], tier: 1, capitalOf: ['country:SWE'] },
  { slug: 'oslo', name: 'Oslo', parent: 'country:NOR', coords: [10.7522, 59.9139], tier: 1, capitalOf: ['country:NOR'] },
  { slug: 'stavanger', name: 'Stavanger', parent: 'country:NOR', coords: [5.7331, 58.97], tier: 3, summary: 'Centre of Norway’s offshore oil industry; Equinor headquarters.' },
  { slug: 'hangzhou', name: 'Hangzhou', parent: 'country:CHN', coords: [120.1551, 30.2741], tier: 2, summary: 'Capital of Zhejiang; Alibaba headquarters.' },
  { slug: 'shenzhen', name: 'Shenzhen', parent: 'country:CHN', coords: [114.0579, 22.5431], tier: 2, summary: 'Electronics-manufacturing and technology hub bordering Hong Kong; Tencent, BYD and Huawei headquarters.' },
  { slug: 'hong-kong', name: 'Hong Kong', parent: 'country:HKG', coords: [114.1694, 22.3193], tier: 1, summary: 'Special Administrative Region of China and international financial centre (HKEX).' },
  { slug: 'seoul', name: 'Seoul', parent: 'country:KOR', coords: [126.978, 37.5665], tier: 1, capitalOf: ['country:KOR'] },
  { slug: 'bengaluru', name: 'Bengaluru', parent: 'country:IND', coords: [77.5946, 12.9716], tier: 2, aliases: ['Bangalore'], summary: 'Capital of Karnataka and India’s IT-services centre; Infosys headquarters.' },
  { slug: 'canberra', name: 'Canberra', parent: 'country:AUS', coords: [149.13, -35.2809], tier: 1, capitalOf: ['country:AUS'] },
  { slug: 'melbourne', name: 'Melbourne', parent: 'country:AUS', coords: [144.9631, -37.8136], tier: 2, summary: 'Capital of Victoria; BHP headquarters.' },
  { slug: 'sydney', name: 'Sydney', parent: 'country:AUS', coords: [151.2093, -33.8688], tier: 2, summary: 'Australia’s largest city and financial centre (ASX).' },
  { slug: 'rio-de-janeiro', name: 'Rio de Janeiro', parent: 'country:BRA', coords: [-43.1729, -22.9068], tier: 2, aliases: ['Rio'], summary: 'Headquarters of Petrobras and Vale.' },
  { slug: 'mexico-city', name: 'Mexico City', parent: 'country:MEX', coords: [-99.1332, 19.4326], tier: 1, capitalOf: ['country:MEX'], aliases: ['CDMX'] },
  { slug: 'pretoria', name: 'Pretoria', parent: 'country:ZAF', coords: [28.2293, -25.7479], tier: 1, capitalOf: ['country:ZAF'], summary: 'Administrative (executive) capital of South Africa.' },
  { slug: 'cape-town', name: 'Cape Town', parent: 'country:ZAF', coords: [18.4241, -33.9249], tier: 2, summary: 'Legislative capital of South Africa; Naspers headquarters.' },
  { slug: 'doha', name: 'Doha', parent: 'country:QAT', coords: [51.531, 25.2854], tier: 1, capitalOf: ['country:QAT'], summary: 'Qatari capital; QatarEnergy headquarters.' },
  { slug: 'singapore', name: 'Singapore', parent: 'country:SGP', coords: [103.8198, 1.3521], tier: 1, capitalOf: ['country:SGP'], summary: 'City-state; Asian trading, shipping and commodity-trading hub.' },
];
for (const c of CITIES) {
  const id = add({ id: `city:${c.slug}`, type: 'city', name: c.name, parentId: c.parent, coords: c.coords, depth: c.summary ? 'curated' : 'baseline', aliases: c.aliases, summary: c.summary, facts: c.facts, attrs: { tier: c.tier, capital: !!c.capitalOf } });
  for (const cap of c.capitalOf || []) rel(id, 'capital_of', cap, { sourceId: 'world-countries' });
}

// ───────────────────────── Intergovernmental organizations ─────────────────────────
function igo(slug: string, name: string, o: Partial<Entity>, members: [string, string?, string?][], sourceId: string) {
  const id = add({ id: `igo:${slug}`, type: 'igo', name, depth: 'curated', sources: [sourceId], ...o });
  for (const [iso3, from, to] of members) rel(C(iso3), 'member_of', id, { validFrom: from, validTo: to, sourceId });
  return id;
}
igo('nato', 'NATO', {
  aliases: ['North Atlantic Treaty Organization', 'OTAN', 'Atlantic Alliance'],
  summary: 'Political and military alliance founded by the North Atlantic Treaty (Washington, 4 April 1949). Article 5 commits members to collective defence. 32 members after Finland (2023) and Sweden (2024) joined. At the 2025 Hague summit allies agreed to raise core defence spending toward 3.5% of GDP, plus 1.5% for defence-related investment, by 2035.',
  facts: [f('Founded', '4 April 1949', 'nato'), f('Headquarters', 'Brussels, Belgium', 'nato'), f('Members', 32, 'nato'), f('Decision-making', 'North Atlantic Council — consensus of all allies', 'nato'), f('Defence spending pledge', '5% of GDP by 2035 (3.5% core defence + 1.5% related), agreed June 2025', 'nato')],
  timeline: [t('1949-04-04', 'North Atlantic Treaty signed in Washington by 12 founders', 'nato'), t('1952-02-18', 'Greece and Turkey join', 'nato'), t('1955-05-06', 'West Germany joins', 'nato'), t('1982-05-30', 'Spain joins', 'nato'), t('1999-03-12', 'Czech Republic, Hungary and Poland join', 'nato'), t('2004-03-29', 'Seven Central & Eastern European states join', 'nato'), t('2009-04-01', 'Albania and Croatia join', 'nato'), t('2017-06-05', 'Montenegro joins', 'nato'), t('2020-03-27', 'North Macedonia joins', 'nato'), t('2023-04-04', 'Finland becomes the 31st ally', 'nato'), t('2024-03-07', 'Sweden becomes the 32nd ally', 'nato'), t('2025-06-25', 'The Hague Summit: 5% defence investment pledge', 'nato')],
  attrs: { founded: '1949', hq: 'city:brussels' },
}, [
  ['BEL', '1949'], ['CAN', '1949'], ['DNK', '1949'], ['FRA', '1949'], ['ISL', '1949'], ['ITA', '1949'], ['LUX', '1949'], ['NLD', '1949'], ['NOR', '1949'], ['PRT', '1949'], ['GBR', '1949'], ['USA', '1949'],
  ['GRC', '1952'], ['TUR', '1952'], ['DEU', '1955'], ['ESP', '1982'], ['CZE', '1999'], ['HUN', '1999'], ['POL', '1999'],
  ['BGR', '2004'], ['EST', '2004'], ['LVA', '2004'], ['LTU', '2004'], ['ROU', '2004'], ['SVK', '2004'], ['SVN', '2004'],
  ['ALB', '2009'], ['HRV', '2009'], ['MNE', '2017'], ['MKD', '2020'], ['FIN', '2023'], ['SWE', '2024'],
], 'nato');

igo('eu', 'European Union', {
  aliases: ['EU', 'Union européenne', 'European Communities', 'EEC'],
  summary: 'Political and economic union of 27 European states with a single market, customs union and common trade policy; 21 members share the euro (Bulgaria joined on 1 January 2026). Founded by the Maastricht Treaty (in force 1 November 1993), building on the European Communities of the 1950s.',
  facts: [f('Founded', '1 November 1993 (Maastricht Treaty); EEC 1958', 'eu'), f('Seat', 'Brussels (Commission, Council); Strasbourg (Parliament plenary)', 'eu'), f('Members', 27, 'eu'), f('Euro area', '21 members (from 1 January 2026)', 'eu'), f('Population', 'see member country profiles', 'eu')],
  timeline: [t('1952-07-23', 'European Coal and Steel Community in force', 'eu'), t('1958-01-01', 'Treaty of Rome: EEC established', 'eu'), t('1973-01-01', 'Denmark, Ireland and UK join', 'eu'), t('1993-11-01', 'Maastricht Treaty creates the EU', 'eu'), t('1999-01-01', 'Euro launched', 'eu'), t('2004-05-01', 'Ten-country enlargement', 'eu'), t('2020-01-31', 'United Kingdom leaves', 'eu'), t('2026-01-01', 'Bulgaria adopts the euro', 'eu')],
  attrs: { founded: '1993', hq: 'city:brussels' },
}, [
  ['BEL', '1958'], ['FRA', '1958'], ['DEU', '1958'], ['ITA', '1958'], ['LUX', '1958'], ['NLD', '1958'], ['DNK', '1973'], ['IRL', '1973'], ['GBR', '1973', '2020'],
  ['GRC', '1981'], ['ESP', '1986'], ['PRT', '1986'], ['AUT', '1995'], ['FIN', '1995'], ['SWE', '1995'],
  ['CYP', '2004'], ['CZE', '2004'], ['EST', '2004'], ['HUN', '2004'], ['LVA', '2004'], ['LTU', '2004'], ['MLT', '2004'], ['POL', '2004'], ['SVK', '2004'], ['SVN', '2004'],
  ['BGR', '2007'], ['ROU', '2007'], ['HRV', '2013'],
], 'eu');

igo('opec', 'OPEC', {
  aliases: ['Organization of the Petroleum Exporting Countries'],
  summary: 'Intergovernmental organization of 12 oil-exporting countries that coordinates petroleum policies. Founded at the Baghdad Conference on 14 September 1960 by Iran, Iraq, Kuwait, Saudi Arabia and Venezuela; Secretariat in Vienna since 1965. Since 2016 it coordinates output with 10 non-OPEC producers as OPEC+.',
  facts: [f('Founded', '14 September 1960, Baghdad', 'opec'), f('Secretariat', 'Vienna, Austria', 'opec'), f('Members', 12, 'opec'), f('Former members', 'Qatar (left 2019), Ecuador (2020), Angola (2024), Indonesia (suspended 2016)', 'opec')],
  timeline: [t('1960-09-14', 'Founded at the Baghdad Conference', 'opec'), t('1965-09-01', 'Secretariat moves to Vienna', 'opec'), t('1973-10-17', 'Arab oil embargo begins', 'opec'), t('2016-12-10', 'Declaration of Cooperation with non-OPEC producers (OPEC+)', 'opec'), t('2024-01-01', 'Angola’s exit takes effect', 'opec')],
  attrs: { founded: '1960', hq: 'city:vienna' },
}, [
  ['IRN', '1960'], ['IRQ', '1960'], ['KWT', '1960'], ['SAU', '1960'], ['VEN', '1960'], ['LBY', '1962'], ['ARE', '1967'], ['DZA', '1969'], ['NGA', '1971'],
  ['GAB', '2016'], ['GNQ', '2017'], ['COG', '2018'], ['QAT', '1961', '2019'], ['ECU', '1973', '2020'], ['AGO', '2007', '2024'],
], 'opec');

igo('opec-plus', 'OPEC+', {
  aliases: ['OPEC Plus', 'Declaration of Cooperation', 'DoC'],
  summary: 'Alliance of the 12 OPEC members and 10 other oil producers under the Declaration of Cooperation (December 2016), co-led by Saudi Arabia and Russia, that sets coordinated production targets.',
  facts: [f('Established', '10 December 2016 (Declaration of Cooperation)', 'opec'), f('Participants', 22, 'opec')],
  attrs: { founded: '2016', hq: 'city:vienna' },
}, [
  ['IRN', '2016'], ['IRQ', '2016'], ['KWT', '2016'], ['SAU', '2016'], ['VEN', '2016'], ['LBY', '2016'], ['ARE', '2016'], ['DZA', '2016'], ['NGA', '2016'], ['GAB', '2016'], ['GNQ', '2017'], ['COG', '2018'],
  ['RUS', '2016'], ['KAZ', '2016'], ['MEX', '2016'], ['OMN', '2016'], ['AZE', '2016'], ['BHR', '2016'], ['BRN', '2016'], ['MYS', '2016'], ['SDN', '2016'], ['SSD', '2016'],
], 'opec');

igo('brics', 'BRICS', {
  aliases: ['BRIC', 'BRICS+'],
  summary: 'Grouping of major emerging economies. Began as BRIC (first leaders’ summit, Yekaterinburg, 2009); South Africa joined in 2010. Egypt, Ethiopia, Iran and the UAE joined in January 2024 and Indonesia in January 2025. Saudi Arabia was invited in 2023 but has not formally confirmed membership.',
  facts: [f('First summit', '16 June 2009, Yekaterinburg', 'brics'), f('Members', 10, 'brics'), f('Secretariat', 'None — rotating chair (India in 2026)', 'brics'), f('Associated institution', 'New Development Bank (Shanghai)', 'brics')],
  timeline: [t('2009-06-16', 'First BRIC leaders’ summit', 'brics'), t('2010-12-24', 'South Africa invited to join', 'brics'), t('2024-01-01', 'Egypt, Ethiopia, Iran, UAE join', 'brics'), t('2025-01-06', 'Indonesia joins', 'brics'), t('2025-07-06', 'Rio de Janeiro summit', 'brics')],
  attrs: { founded: '2009', note: 'Saudi Arabia: invited (2023), status unconfirmed.' },
}, [['BRA', '2009'], ['RUS', '2009'], ['IND', '2009'], ['CHN', '2009'], ['ZAF', '2010'], ['EGY', '2024'], ['ETH', '2024'], ['IRN', '2024'], ['ARE', '2024'], ['IDN', '2025']], 'brics');

igo('g7', 'G7', {
  aliases: ['Group of Seven', 'G8'],
  summary: 'Informal forum of seven advanced economies (plus the EU as a non-enumerated member) coordinating on economic policy, security and sanctions. Russia’s participation (G8, 1997–2014) was suspended after the annexation of Crimea.',
  facts: [f('First summit', '1975, Rambouillet (France)', 'g7'), f('Members', 7, 'g7'), f('Secretariat', 'None — rotating presidency', 'g7')],
  timeline: [t('1975-11-15', 'First summit at Rambouillet (G6)', 'g7'), t('1976-06-27', 'Canada joins (G7)', 'g7'), t('2014-03-24', 'Russia’s G8 participation suspended', 'g7'), t('2025-06-15', 'Kananaskis summit, Canada', 'g7')],
  attrs: { founded: '1975' },
}, [['CAN', '1976'], ['FRA', '1975'], ['DEU', '1975'], ['ITA', '1975'], ['JPN', '1975'], ['GBR', '1975'], ['USA', '1975'], ['RUS', '1997', '2014']], 'g7');

igo('g20', 'G20', {
  aliases: ['Group of Twenty'],
  summary: 'Forum of 19 countries plus the European Union and the African Union (member since 2023), together accounting for roughly 85% of world GDP. Leaders’ summits began in Washington in November 2008. The United States holds the 2026 presidency.',
  facts: [f('Leaders’ summits since', 'November 2008 (Washington)', 'g20'), f('Country members', 19, 'g20'), f('Other members', 'European Union; African Union (since 2023)', 'g20'), f('2026 presidency', 'United States', 'g20')],
  attrs: { founded: '1999' },
}, ['ARG', 'AUS', 'BRA', 'CAN', 'CHN', 'FRA', 'DEU', 'IND', 'IDN', 'ITA', 'JPN', 'MEX', 'RUS', 'SAU', 'ZAF', 'KOR', 'TUR', 'GBR', 'USA'].map((x) => [x, '1999'] as [string, string]), 'g20');

igo('asean', 'ASEAN', {
  aliases: ['Association of Southeast Asian Nations'],
  summary: 'Regional organization founded by the Bangkok Declaration (8 August 1967); 11 members after Timor-Leste’s admission in October 2025. Secretariat in Jakarta.',
  facts: [f('Founded', '8 August 1967, Bangkok', 'asean'), f('Secretariat', 'Jakarta, Indonesia', 'asean'), f('Members', 11, 'asean')],
  timeline: [t('1967-08-08', 'Bangkok Declaration', 'asean'), t('1984-01-07', 'Brunei joins', 'asean'), t('1995-07-28', 'Vietnam joins', 'asean'), t('1997-07-23', 'Laos and Myanmar join', 'asean'), t('1999-04-30', 'Cambodia joins', 'asean'), t('2025-10-26', 'Timor-Leste becomes 11th member', 'asean')],
  attrs: { founded: '1967', hq: 'city:jakarta' },
}, [['IDN', '1967'], ['MYS', '1967'], ['PHL', '1967'], ['SGP', '1967'], ['THA', '1967'], ['BRN', '1984'], ['VNM', '1995'], ['LAO', '1997'], ['MMR', '1997'], ['KHM', '1999'], ['TLS', '2025']], 'asean');

add({ id: 'igo:un', type: 'igo', name: 'United Nations', depth: 'curated', aliases: ['UN', 'U.N.', 'United Nations Organization'],
  summary: 'Global intergovernmental organization founded on 24 October 1945 when the UN Charter entered into force; 193 member states. Headquarters in New York. Secretary-General António Guterres’s second term ends on 31 December 2026; selection of a successor is under way.',
  facts: [f('Founded', '24 October 1945', 'un'), f('Headquarters', 'New York City', 'un'), f('Member states', 193, 'un'), f('Security Council permanent members', 'China, France, Russia, United Kingdom, United States', 'un')],
  timeline: [t('1945-06-26', 'UN Charter signed in San Francisco', 'un'), t('1945-10-24', 'Charter enters into force', 'un'), t('2017-01-01', 'António Guterres becomes Secretary-General', 'un')],
  attrs: { founded: '1945', hq: 'city:new-york', membershipNote: 'Membership derived from the UN member flag in the world-countries dataset.' } });
add({ id: 'igo:imf', type: 'igo', name: 'International Monetary Fund', depth: 'curated', aliases: ['IMF'],
  summary: 'Bretton Woods institution (1944 conference; established 27 December 1945) that oversees the international monetary system, provides policy advice, and lends to members facing balance-of-payments problems. 191 member countries; headquarters in Washington, D.C.',
  facts: [f('Established', '27 December 1945', 'imf'), f('Headquarters', 'Washington, D.C.', 'imf'), f('Members', 191, 'imf')],
  attrs: { founded: '1945', hq: 'city:washington-dc', membershipNote: 'Member-by-member list not yet loaded (Phase II).' } });
add({ id: 'igo:wto', type: 'igo', name: 'World Trade Organization', depth: 'curated', aliases: ['WTO'],
  summary: 'Global body administering multilateral trade rules and dispute settlement; successor to the GATT, established 1 January 1995. 166 members; headquarters in Geneva.',
  facts: [f('Established', '1 January 1995', 'wto'), f('Headquarters', 'Geneva, Switzerland', 'wto'), f('Members', 166, 'wto')],
  attrs: { founded: '1995', hq: 'city:geneva', membershipNote: 'Member-by-member list not yet loaded (Phase II).' } });
add({ id: 'igo:world-bank', type: 'igo', name: 'World Bank Group', depth: 'curated', aliases: ['World Bank', 'IBRD', 'WBG'],
  summary: 'Five institutions (IBRD, IDA, IFC, MIGA, ICSID) providing development finance and analysis. Founded with the IMF at Bretton Woods; headquarters in Washington, D.C. Publisher of the World Development Indicators used throughout this app.',
  facts: [f('Founded', '1944 (IBRD)', 'worldbank-org'), f('Headquarters', 'Washington, D.C.', 'worldbank-org'), f('President', 'Ajay Banga (since June 2023)', 'worldbank-org')],
  attrs: { founded: '1944', hq: 'city:washington-dc', membershipNote: 'Member-by-member list not yet loaded (Phase II).' } });
for (const [igoId, city] of [['igo:nato', 'city:brussels'], ['igo:eu', 'city:brussels'], ['igo:opec', 'city:vienna'], ['igo:asean', 'city:jakarta'], ['igo:un', 'city:new-york'], ['igo:imf', 'city:washington-dc'], ['igo:wto', 'city:geneva'], ['igo:world-bank', 'city:washington-dc']])
  rel(igoId, 'headquartered_in', city, { sourceId: 'company-ir' });

// ───────────────────────── Political parties ─────────────────────────
interface PartySpec { slug: string; name: string; country: string; aliases?: string[]; ideology: string; founded: string; summary: string; governing?: boolean; sourceId: string; position?: string; }
const PARTIES: PartySpec[] = [
  { slug: 'us-republican', name: 'Republican Party', country: 'USA', aliases: ['GOP', 'Republicans', 'Grand Old Party'], ideology: 'Conservatism, right-wing populism', position: 'Centre-right to right', founded: '1854', governing: true, sourceId: 'congress', summary: 'One of the two major US parties. Holds the presidency and majorities in both chambers of the 119th Congress (2025–2027).' },
  { slug: 'us-democratic', name: 'Democratic Party', country: 'USA', aliases: ['Democrats', 'DNC'], ideology: 'Liberalism, social liberalism', position: 'Centre to centre-left', founded: '1828', sourceId: 'congress', summary: 'One of the two major US parties; in opposition at the federal level in 2025–2027. Holds the Pennsylvania governorship.' },
  { slug: 'de-cdu', name: 'Christian Democratic Union (CDU)', country: 'DEU', aliases: ['CDU', 'Christlich Demokratische Union'], ideology: 'Christian democracy, liberal conservatism', position: 'Centre-right', founded: '1945', governing: true, sourceId: 'bundesregierung', summary: 'Germany’s main centre-right party; with its Bavarian sister party CSU forms the CDU/CSU Union, which won the February 2025 election and leads the federal government.' },
  { slug: 'de-csu', name: 'Christian Social Union (CSU)', country: 'DEU', aliases: ['CSU'], ideology: 'Christian democracy, Bavarian regionalism', position: 'Centre-right', founded: '1945', governing: true, sourceId: 'bundesregierung', summary: 'Bavaria-only sister party of the CDU; junior partner in the federal coalition since May 2025.' },
  { slug: 'de-spd', name: 'Social Democratic Party (SPD)', country: 'DEU', aliases: ['SPD', 'Sozialdemokratische Partei Deutschlands'], ideology: 'Social democracy', position: 'Centre-left', founded: '1863', governing: true, sourceId: 'bundesregierung', summary: 'Germany’s oldest party; junior coalition partner with CDU/CSU since May 2025, holding the finance ministry.' },
  { slug: 'de-afd', name: 'Alternative for Germany (AfD)', country: 'DEU', aliases: ['AfD', 'Alternative für Deutschland'], ideology: 'Right-wing populism, national conservatism', position: 'Right to far-right', founded: '2013', sourceId: 'bundeswahlleiterin', summary: 'Second-largest party in the Bundestag after the 2025 election (20.8%) and the largest opposition party.' },
  { slug: 'de-greens', name: 'Alliance 90/The Greens', country: 'DEU', aliases: ['Greens', 'Die Grünen', 'Bündnis 90/Die Grünen'], ideology: 'Green politics', position: 'Centre-left', founded: '1993', sourceId: 'bundeswahlleiterin', summary: 'Environmentalist party; in opposition since 2025 after governing in the 2021–2024 traffic-light coalition.' },
  { slug: 'uk-labour', name: 'Labour Party', country: 'GBR', aliases: ['Labour', 'UK Labour'], ideology: 'Social democracy', position: 'Centre-left', founded: '1900', governing: true, sourceId: 'gov-uk', summary: 'Won a large majority at the July 2024 general election and forms the UK government.' },
  { slug: 'uk-conservative', name: 'Conservative Party', country: 'GBR', aliases: ['Conservatives', 'Tories'], ideology: 'Conservatism', position: 'Centre-right', founded: '1834', sourceId: 'gov-uk', summary: 'Official opposition since 2024; led by Kemi Badenoch since November 2024.' },
  { slug: 'uk-reform', name: 'Reform UK', country: 'GBR', aliases: ['Reform'], ideology: 'Right-wing populism', position: 'Right', founded: '2018', sourceId: 'gov-uk', summary: 'Led by Nigel Farage; won five seats in 2024 and has since led many national opinion polls.' },
  { slug: 'jp-ldp', name: 'Liberal Democratic Party (LDP)', country: 'JPN', aliases: ['LDP', 'Jiminto'], ideology: 'Conservatism', position: 'Centre-right to right', founded: '1955', governing: true, sourceId: 'kantei', summary: 'Dominant party in post-war Japan; led by Sanae Takaichi since October 2025.' },
  { slug: 'cn-ccp', name: 'Chinese Communist Party', country: 'CHN', aliases: ['CCP', 'CPC', 'Communist Party of China'], ideology: 'Socialism with Chinese characteristics', position: 'Ruling party (one-party state)', founded: '1921', governing: true, sourceId: 'gov-cn', summary: 'Sole ruling party of the People’s Republic of China; General Secretary Xi Jinping since 2012.' },
  { slug: 'in-bjp', name: 'Bharatiya Janata Party (BJP)', country: 'IND', aliases: ['BJP'], ideology: 'Hindu nationalism, conservatism', position: 'Right', founded: '1980', governing: true, sourceId: 'pmindia', summary: 'Leads India’s National Democratic Alliance government; Narendra Modi’s party.' },
  { slug: 'in-inc', name: 'Indian National Congress', country: 'IND', aliases: ['INC', 'Congress Party'], ideology: 'Liberalism, secularism', position: 'Centre to centre-left', founded: '1885', sourceId: 'pmindia', summary: 'Main opposition party; Rahul Gandhi is Leader of the Opposition in the Lok Sabha since 2024.' },
  { slug: 'br-pt', name: 'Workers’ Party (PT)', country: 'BRA', aliases: ['PT', 'Partido dos Trabalhadores'], ideology: 'Social democracy, democratic socialism', position: 'Centre-left to left', founded: '1980', governing: true, sourceId: 'gov-br', summary: 'Founded in 1980 with Lula among its founders; leads Brazil’s federal government since 2023.' },
  { slug: 'ca-liberal', name: 'Liberal Party of Canada', country: 'CAN', aliases: ['Liberals', 'LPC'], ideology: 'Liberalism', position: 'Centre to centre-left', founded: '1867', governing: true, sourceId: 'pm-canada', summary: 'Governing party; won the April 2025 federal election under Mark Carney.' },
  { slug: 'ca-conservative', name: 'Conservative Party of Canada', country: 'CAN', aliases: ['CPC', 'Tories (Canada)'], ideology: 'Conservatism', position: 'Centre-right', founded: '2003', sourceId: 'pm-canada', summary: 'Official opposition; led by Pierre Poilievre.' },
  { slug: 'fr-renaissance', name: 'Renaissance', country: 'FRA', aliases: ['LREM', 'En Marche'], ideology: 'Liberalism, pro-Europeanism', position: 'Centre', founded: '2016', sourceId: 'elysee', summary: 'Party founded by Emmanuel Macron (as En Marche) in 2016.' },
];
for (const p of PARTIES) {
  const id = add({ id: `party:${p.slug}`, type: 'party', name: p.name, depth: 'curated', aliases: p.aliases, summary: p.summary, parentId: C(p.country),
    facts: [f('Ideology', p.ideology, p.sourceId), f('Political position', p.position || '—', p.sourceId), f('Founded', p.founded, p.sourceId)],
    attrs: { ideology: p.ideology, founded: p.founded, governing: !!p.governing } });
  rel(id, 'party_in', C(p.country), { sourceId: p.sourceId });
  if (p.governing) rel(id, 'governing_party', C(p.country), { sourceId: p.sourceId, role: p.slug === 'de-cdu' ? 'Leads the governing coalition' : p.country === 'DEU' ? 'Coalition partner' : 'Governing party' });
}

// ───────────────────────── People ─────────────────────────
interface Role { type: RelType; to: string; role?: string; from?: string; until?: string; sourceId: string; }
interface PersonSpec { slug: string; name: string; aliases?: string[]; nationality: string; born?: string; summary: string; education?: string; party?: string; roles: Role[]; career?: TimelineItem[]; sourceId: string; }
const P = (p: PersonSpec) => {
  const facts: Fact[] = [f('Nationality', p.nationality, p.sourceId)];
  if (p.born) facts.push(f('Born', p.born, p.sourceId));
  if (p.education) facts.push(f('Education', p.education, p.sourceId));
  const current = p.roles.find((r) => !r.until && r.role);
  if (current) facts.unshift(f('Current role', current.role!, current.sourceId));
  const id = add({ id: `person:${p.slug}`, type: 'person', name: p.name, depth: 'curated', aliases: p.aliases, summary: p.summary, facts, timeline: p.career, attrs: { born: p.born, nationality: p.nationality } });
  if (p.party) rel(id, 'belongs_to_party', `party:${p.party}`, { sourceId: p.sourceId });
  for (const r of p.roles) rel(id, r.type, r.to, { role: r.role, validFrom: r.from, validTo: r.until, sourceId: r.sourceId });
};

P({ slug: 'donald-trump', name: 'Donald Trump', aliases: ['Donald J. Trump', 'Trump', 'President Trump', 'POTUS'], nationality: 'United States', born: '14 June 1946, Queens, New York City', party: 'us-republican', sourceId: 'whitehouse',
  education: 'Wharton School, University of Pennsylvania (BS Economics, 1968)',
  summary: '47th President of the United States (since 20 January 2025), previously 45th President (2017–2021). Real-estate developer and media personality before entering politics. Second-term agenda has centred on broad import tariffs, immigration enforcement, deregulation and tax cuts.',
  roles: [{ type: 'head_of_state', to: 'country:USA', role: 'President of the United States', from: '2025-01-20', sourceId: 'whitehouse' }, { type: 'head_of_government', to: 'country:USA', role: 'President of the United States', from: '2025-01-20', sourceId: 'whitehouse' }],
  career: [t('1971', 'Takes control of family real-estate business (renamed The Trump Organization)'), t('2017-01-20', 'Inaugurated as 45th President'), t('2021-01-20', 'Leaves office after losing the 2020 election'), t('2024-11-05', 'Wins the 2024 presidential election'), t('2025-01-20', 'Inaugurated as 47th President', 'whitehouse'), t('2025-04-02', 'Announces broad "reciprocal" import tariffs', 'whitehouse')] });
P({ slug: 'jd-vance', name: 'JD Vance', aliases: ['J.D. Vance', 'James David Vance', 'Vice President Vance'], nationality: 'United States', born: '2 August 1984, Middletown, Ohio', party: 'us-republican', sourceId: 'whitehouse',
  education: 'Ohio State University (BA); Yale Law School (JD)',
  summary: '50th Vice President of the United States (since January 2025). US Marine Corps veteran, venture capitalist and author of "Hillbilly Elegy"; US Senator from Ohio 2023–2025.',
  roles: [{ type: 'holds_office', to: 'country:USA', role: 'Vice President of the United States', from: '2025-01-20', sourceId: 'whitehouse' }],
  career: [t('2003', 'Enlists in the US Marine Corps'), t('2016', 'Publishes "Hillbilly Elegy"'), t('2023-01-03', 'Sworn in as US Senator from Ohio', 'congress'), t('2025-01-20', 'Becomes Vice President', 'whitehouse')] });
P({ slug: 'marco-rubio', name: 'Marco Rubio', aliases: ['Rubio', 'Secretary Rubio'], nationality: 'United States', born: '28 May 1971, Miami, Florida', party: 'us-republican', sourceId: 'state-dept',
  education: 'University of Florida (BA); University of Miami (JD)',
  summary: 'US Secretary of State since January 2025; also served as acting National Security Advisor from May 2025. US Senator from Florida 2011–2025.',
  roles: [{ type: 'holds_office', to: 'country:USA', role: 'Secretary of State', from: '2025-01-21', sourceId: 'state-dept' }],
  career: [t('2006', 'Speaker of the Florida House of Representatives'), t('2011-01-03', 'US Senator from Florida', 'congress'), t('2025-01-21', 'Confirmed as Secretary of State', 'state-dept')] });
P({ slug: 'scott-bessent', name: 'Scott Bessent', aliases: ['Bessent', 'Treasury Secretary'], nationality: 'United States', born: '21 August 1962', party: 'us-republican', sourceId: 'treasury-gov',
  education: 'Yale University (BA)',
  summary: '79th US Secretary of the Treasury (since January 2025). Former chief investment officer of Soros Fund Management and founder of the macro hedge fund Key Square Group.',
  roles: [{ type: 'holds_office', to: 'country:USA', role: 'Secretary of the Treasury', from: '2025-01-28', sourceId: 'treasury-gov' }] });
P({ slug: 'mike-johnson', name: 'Mike Johnson', aliases: ['Speaker Johnson'], nationality: 'United States', born: '30 January 1972, Shreveport, Louisiana', party: 'us-republican', sourceId: 'congress',
  education: 'Louisiana State University (BA, JD)',
  summary: 'Speaker of the US House of Representatives since October 2023; Representative for Louisiana’s 4th district since 2017.',
  roles: [{ type: 'holds_office', to: 'country:USA', role: 'Speaker of the House of Representatives', from: '2023-10-25', sourceId: 'congress' }] });
P({ slug: 'chuck-schumer', name: 'Chuck Schumer', aliases: ['Charles Schumer', 'Schumer'], nationality: 'United States', born: '23 November 1950, Brooklyn, New York', party: 'us-democratic', sourceId: 'congress',
  education: 'Harvard College (AB); Harvard Law School (JD)',
  summary: 'Senate Democratic Leader since 2017 (Majority Leader 2021–2025, Minority Leader since January 2025); US Senator from New York since 1999.',
  roles: [{ type: 'holds_office', to: 'country:USA', role: 'Senate Minority Leader', from: '2025-01-03', sourceId: 'congress' }] });
P({ slug: 'hakeem-jeffries', name: 'Hakeem Jeffries', aliases: ['Jeffries'], nationality: 'United States', born: '4 August 1970, Brooklyn, New York', party: 'us-democratic', sourceId: 'congress',
  education: 'Binghamton University (BA); Georgetown University (MPP); NYU School of Law (JD)',
  summary: 'House Democratic Leader (Minority Leader) since January 2023; Representative for New York’s 8th district since 2013.',
  roles: [{ type: 'holds_office', to: 'country:USA', role: 'House Minority Leader', from: '2023-01-03', sourceId: 'congress' }] });
P({ slug: 'josh-shapiro', name: 'Josh Shapiro', aliases: ['Joshua Shapiro', 'Governor Shapiro'], nationality: 'United States', born: '20 June 1973, Kansas City, Missouri', party: 'us-democratic', sourceId: 'pa-gov',
  education: 'University of Rochester (BA); Georgetown University Law Center (JD)',
  summary: '48th Governor of Pennsylvania (since January 2023). Previously Pennsylvania Attorney General (2017–2023), chair of the Montgomery County Board of Commissioners and a state representative. Standing for re-election on 3 November 2026.',
  roles: [{ type: 'leads', to: 'state:US-PA', role: 'Governor of Pennsylvania', from: '2023-01-17', sourceId: 'pa-gov' }],
  career: [t('2005', 'Elected to the Pennsylvania House of Representatives'), t('2012', 'Chair, Montgomery County Board of Commissioners'), t('2017-01-17', 'Pennsylvania Attorney General', 'pa-gov'), t('2022-11-08', 'Elected Governor, defeating Doug Mastriano', 'pa-dos'), t('2023-01-17', 'Inaugurated as Governor', 'pa-gov')] });
P({ slug: 'john-fetterman', name: 'John Fetterman', aliases: ['Fetterman', 'Senator Fetterman'], nationality: 'United States', born: '15 August 1969, West Reading, Pennsylvania', party: 'us-democratic', sourceId: 'congress',
  education: 'Albright College (BA); University of Connecticut (MBA); Harvard Kennedy School (MPP)',
  summary: 'US Senator from Pennsylvania since January 2023. Previously Lieutenant Governor of Pennsylvania (2019–2023) and mayor of Braddock (2006–2019).',
  roles: [{ type: 'holds_office', to: 'state:US-PA', role: 'U.S. Senator from Pennsylvania', from: '2023-01-03', sourceId: 'congress' }] });
P({ slug: 'dave-mccormick', name: 'Dave McCormick', aliases: ['David McCormick', 'Senator McCormick'], nationality: 'United States', born: '17 August 1965', party: 'us-republican', sourceId: 'congress',
  education: 'US Military Academy, West Point (BS); Princeton University (PhD)',
  summary: 'US Senator from Pennsylvania since January 2025. Former CEO of Bridgewater Associates (2020–2022) and Under Secretary of the Treasury for International Affairs (2007–2009); Gulf War veteran.',
  roles: [{ type: 'holds_office', to: 'state:US-PA', role: 'U.S. Senator from Pennsylvania', from: '2025-01-03', sourceId: 'congress' }] });
P({ slug: 'stacy-garrity', name: 'Stacy Garrity', aliases: ['Garrity', 'Treasurer Garrity'], nationality: 'United States', party: 'us-republican', sourceId: 'pa-gov',
  summary: 'Pennsylvania State Treasurer since January 2021 and retired US Army Reserve colonel. Announced a campaign for Governor of Pennsylvania in August 2025.',
  roles: [{ type: 'holds_office', to: 'state:US-PA', role: 'Pennsylvania State Treasurer', from: '2021-01-19', sourceId: 'pa-gov' }] });
P({ slug: 'cherelle-parker', name: 'Cherelle Parker', aliases: ['Mayor Parker'], nationality: 'United States', party: 'us-democratic', sourceId: 'phila-gov',
  summary: '100th Mayor of Philadelphia (since January 2024) and the first woman to hold the office. Previously a Philadelphia City Council member and state representative.',
  roles: [{ type: 'leads', to: 'city:philadelphia', role: 'Mayor of Philadelphia', from: '2024-01-02', sourceId: 'phila-gov' }] });
P({ slug: 'corey-oconnor', name: 'Corey O’Connor', aliases: ["Corey O'Connor"], nationality: 'United States', party: 'us-democratic', sourceId: 'pgh-gov',
  summary: 'Mayor of Pittsburgh since January 2026; previously Allegheny County Controller and a Pittsburgh City Council member.',
  roles: [{ type: 'leads', to: 'city:pittsburgh', role: 'Mayor of Pittsburgh', from: '2026-01-05', sourceId: 'pgh-gov' }] });

P({ slug: 'king-salman', name: 'King Salman bin Abdulaziz Al Saud', aliases: ['King Salman', 'Salman bin Abdulaziz'], nationality: 'Saudi Arabia', born: '31 December 1935, Riyadh', sourceId: 'spa',
  summary: 'King of Saudi Arabia and Custodian of the Two Holy Mosques since 23 January 2015. Governor of Riyadh Province for nearly five decades, then Minister of Defence (2011–2015) and Crown Prince (2012–2015).',
  roles: [{ type: 'head_of_state', to: 'country:SAU', role: 'King of Saudi Arabia', from: '2015-01-23', sourceId: 'spa' }],
  career: [t('1963', 'Governor of Riyadh Province (until 2011)'), t('2011-11-05', 'Minister of Defence'), t('2012-06-18', 'Crown Prince'), t('2015-01-23', 'Accedes to the throne', 'spa')] });
P({ slug: 'mohammed-bin-salman', name: 'Mohammed bin Salman', aliases: ['MBS', 'Crown Prince Mohammed', 'Mohammed bin Salman Al Saud'], nationality: 'Saudi Arabia', born: '31 August 1985, Riyadh', sourceId: 'spa',
  education: 'King Saud University (law)',
  summary: 'Crown Prince (since June 2017) and Prime Minister (since September 2022) of Saudi Arabia; de facto ruler. Chairs the Public Investment Fund and the Council of Economic and Development Affairs, and drives the Vision 2030 diversification programme and OPEC+ oil policy.',
  roles: [{ type: 'head_of_government', to: 'country:SAU', role: 'Prime Minister and Crown Prince', from: '2022-09-27', sourceId: 'spa' }],
  career: [t('2015-01-23', 'Minister of Defence'), t('2016-04-25', 'Launches Vision 2030', 'vision2030'), t('2017-06-21', 'Named Crown Prince', 'spa'), t('2022-09-27', 'Appointed Prime Minister', 'spa')] });
P({ slug: 'abdulaziz-bin-salman', name: 'Prince Abdulaziz bin Salman', aliases: ['Abdulaziz bin Salman', 'Saudi energy minister'], nationality: 'Saudi Arabia', sourceId: 'spa',
  summary: 'Saudi Minister of Energy since September 2019 and the kingdom’s lead negotiator in OPEC+ production decisions; decades of prior service in the petroleum ministry.',
  roles: [{ type: 'holds_office', to: 'country:SAU', role: 'Minister of Energy', from: '2019-09-08', sourceId: 'spa' }] });

P({ slug: 'friedrich-merz', name: 'Friedrich Merz', aliases: ['Merz', 'Chancellor Merz'], nationality: 'Germany', born: '11 November 1955, Brilon', party: 'de-cdu', sourceId: 'bundesregierung',
  education: 'Law, University of Bonn and University of Marburg',
  summary: 'Chancellor of Germany since 6 May 2025, leading a CDU/CSU–SPD coalition; CDU leader since January 2022. Former MEP and CDU/CSU parliamentary leader who spent years in corporate law and finance (including chairing BlackRock Germany’s supervisory board).',
  roles: [{ type: 'head_of_government', to: 'country:DEU', role: 'Federal Chancellor', from: '2025-05-06', sourceId: 'bundesregierung' }, { type: 'leads', to: 'party:de-cdu', role: 'Party leader', from: '2022-01-31', sourceId: 'bundesregierung' }],
  career: [t('1989', 'Member of the European Parliament (until 1994)'), t('1994', 'Member of the Bundestag (until 2009)'), t('2000', 'Chair of the CDU/CSU parliamentary group (until 2002)'), t('2016', 'Chair, supervisory board of BlackRock Germany (until 2020)'), t('2022-01-31', 'Elected CDU leader'), t('2025-02-23', 'Wins federal election as CDU/CSU candidate', 'bundeswahlleiterin'), t('2025-05-06', 'Elected Chancellor', 'bundesregierung')] });
P({ slug: 'frank-walter-steinmeier', name: 'Frank-Walter Steinmeier', aliases: ['Steinmeier'], nationality: 'Germany', born: '5 January 1956', party: 'de-spd', sourceId: 'bundesregierung',
  summary: 'Federal President of Germany since March 2017 (re-elected 2022); previously Foreign Minister. Party membership suspended while in office, as is customary.',
  roles: [{ type: 'head_of_state', to: 'country:DEU', role: 'Federal President', from: '2017-03-19', sourceId: 'bundesregierung' }] });
P({ slug: 'lars-klingbeil', name: 'Lars Klingbeil', aliases: ['Klingbeil'], nationality: 'Germany', born: '23 February 1978', party: 'de-spd', sourceId: 'bundesregierung',
  summary: 'Vice-Chancellor and Federal Minister of Finance since May 2025; SPD co-leader since December 2021.',
  roles: [{ type: 'holds_office', to: 'country:DEU', role: 'Vice-Chancellor and Minister of Finance', from: '2025-05-06', sourceId: 'bundesregierung' }, { type: 'leads', to: 'party:de-spd', role: 'Co-leader', from: '2021-12-11', sourceId: 'bundesregierung' }] });
P({ slug: 'markus-soder', name: 'Markus Söder', aliases: ['Soder', 'Söder'], nationality: 'Germany', born: '5 January 1967, Nuremberg', party: 'de-csu', sourceId: 'bundesregierung',
  summary: 'Minister-President of Bavaria since 2018 and CSU leader since 2019.',
  roles: [{ type: 'leads', to: 'party:de-csu', role: 'Party leader', from: '2019-01-19', sourceId: 'bundesregierung' }] });
P({ slug: 'alice-weidel', name: 'Alice Weidel', aliases: ['Weidel'], nationality: 'Germany', born: '6 February 1979', party: 'de-afd', sourceId: 'bundeswahlleiterin',
  summary: 'Co-leader of the AfD since 2022 and its chancellor candidate in 2025; leads the largest opposition group in the Bundestag.',
  roles: [{ type: 'leads', to: 'party:de-afd', role: 'Co-leader', from: '2022-06-18', sourceId: 'bundeswahlleiterin' }] });

P({ slug: 'keir-starmer', name: 'Keir Starmer', aliases: ['Sir Keir Starmer', 'Starmer', 'PM Starmer'], nationality: 'United Kingdom', born: '2 September 1962, London', party: 'uk-labour', sourceId: 'gov-uk',
  education: 'University of Leeds (LLB); University of Oxford (BCL)',
  summary: 'Prime Minister of the United Kingdom since 5 July 2024 and Labour leader since April 2020. Former human-rights barrister and Director of Public Prosecutions (2008–2013); MP for Holborn and St Pancras since 2015.',
  roles: [{ type: 'head_of_government', to: 'country:GBR', role: 'Prime Minister', from: '2024-07-05', sourceId: 'gov-uk' }, { type: 'leads', to: 'party:uk-labour', role: 'Party leader', from: '2020-04-04', sourceId: 'gov-uk' }],
  career: [t('2008', 'Director of Public Prosecutions (until 2013)'), t('2015-05-07', 'Elected MP for Holborn and St Pancras'), t('2020-04-04', 'Elected Labour leader'), t('2024-07-05', 'Becomes Prime Minister', 'gov-uk')] });
P({ slug: 'charles-iii', name: 'King Charles III', aliases: ['Charles III', 'King Charles'], nationality: 'United Kingdom', born: '14 November 1948, London', sourceId: 'royal-uk',
  summary: 'King of the United Kingdom and 14 other Commonwealth realms, including Canada, since 8 September 2022.',
  roles: [{ type: 'head_of_state', to: 'country:GBR', role: 'King', from: '2022-09-08', sourceId: 'royal-uk' }, { type: 'head_of_state', to: 'country:CAN', role: 'King of Canada', from: '2022-09-08', sourceId: 'royal-uk' }] });
P({ slug: 'rachel-reeves', name: 'Rachel Reeves', aliases: ['Reeves', 'Chancellor Reeves'], nationality: 'United Kingdom', born: '13 February 1979', party: 'uk-labour', sourceId: 'gov-uk',
  summary: 'Chancellor of the Exchequer since July 2024 — the first woman in the role. Former Bank of England economist.',
  roles: [{ type: 'holds_office', to: 'country:GBR', role: 'Chancellor of the Exchequer', from: '2024-07-05', sourceId: 'gov-uk' }] });
P({ slug: 'kemi-badenoch', name: 'Kemi Badenoch', aliases: ['Badenoch'], nationality: 'United Kingdom', party: 'uk-conservative', sourceId: 'gov-uk',
  summary: 'Leader of the Conservative Party and Leader of the Opposition since November 2024.', roles: [{ type: 'leads', to: 'party:uk-conservative', role: 'Party leader', from: '2024-11-02', sourceId: 'gov-uk' }] });
P({ slug: 'nigel-farage', name: 'Nigel Farage', aliases: ['Farage'], nationality: 'United Kingdom', party: 'uk-reform', sourceId: 'gov-uk',
  summary: 'Leader of Reform UK and MP for Clacton since 2024; previously led UKIP and the Brexit Party and served as an MEP (1999–2020).', roles: [{ type: 'leads', to: 'party:uk-reform', role: 'Party leader', from: '2024-06-03', sourceId: 'gov-uk' }] });

P({ slug: 'emmanuel-macron', name: 'Emmanuel Macron', aliases: ['Macron'], nationality: 'France', born: '21 December 1977, Amiens', party: 'fr-renaissance', sourceId: 'elysee',
  summary: 'President of France since May 2017 (re-elected 2022); founder of En Marche/Renaissance. His term ends in 2027 and he is constitutionally barred from a third consecutive term.',
  roles: [{ type: 'head_of_state', to: 'country:FRA', role: 'President of the French Republic', from: '2017-05-14', sourceId: 'elysee' }] });
P({ slug: 'sebastien-lecornu', name: 'Sébastien Lecornu', aliases: ['Lecornu'], nationality: 'France', party: 'fr-renaissance', sourceId: 'elysee',
  summary: 'Prime Minister of France, appointed September 2025 (and reappointed in October 2025 after briefly resigning) amid a hung National Assembly. Previously Minister of the Armed Forces.',
  roles: [{ type: 'head_of_government', to: 'country:FRA', role: 'Prime Minister', from: '2025-09-09', sourceId: 'elysee' }] });
P({ slug: 'sanae-takaichi', name: 'Sanae Takaichi', aliases: ['Takaichi'], nationality: 'Japan', born: '7 March 1961, Nara Prefecture', party: 'jp-ldp', sourceId: 'kantei',
  education: 'Kobe University',
  summary: 'Prime Minister of Japan since 21 October 2025 — the first woman to hold the office — and LDP president since October 2025. Long-serving member of the House of Representatives; former Minister for Internal Affairs and Minister for Economic Security.',
  roles: [{ type: 'head_of_government', to: 'country:JPN', role: 'Prime Minister', from: '2025-10-21', sourceId: 'kantei' }, { type: 'leads', to: 'party:jp-ldp', role: 'President', from: '2025-10-04', sourceId: 'kantei' }] });
P({ slug: 'naruhito', name: 'Emperor Naruhito', aliases: ['Naruhito'], nationality: 'Japan', born: '23 February 1960, Tokyo', sourceId: 'kantei',
  summary: 'Emperor of Japan since 1 May 2019 (Reiwa era).', roles: [{ type: 'head_of_state', to: 'country:JPN', role: 'Emperor', from: '2019-05-01', sourceId: 'kantei' }] });
P({ slug: 'xi-jinping', name: 'Xi Jinping', aliases: ['Xi', 'President Xi'], nationality: 'China', born: '15 June 1953, Beijing', party: 'cn-ccp', sourceId: 'gov-cn',
  education: 'Tsinghua University',
  summary: 'General Secretary of the Chinese Communist Party (since 2012), President of the PRC (since 2013) and Chairman of the Central Military Commission; serving an unprecedented third term.',
  roles: [{ type: 'head_of_state', to: 'country:CHN', role: 'President', from: '2013-03-14', sourceId: 'gov-cn' }, { type: 'leads', to: 'party:cn-ccp', role: 'General Secretary', from: '2012-11-15', sourceId: 'gov-cn' }] });
P({ slug: 'li-qiang', name: 'Li Qiang', aliases: ['Premier Li'], nationality: 'China', born: 'July 1959, Zhejiang', party: 'cn-ccp', sourceId: 'gov-cn',
  summary: 'Premier of the State Council since March 2023; previously Party Secretary of Shanghai.', roles: [{ type: 'head_of_government', to: 'country:CHN', role: 'Premier of the State Council', from: '2023-03-11', sourceId: 'gov-cn' }] });
P({ slug: 'narendra-modi', name: 'Narendra Modi', aliases: ['Modi', 'PM Modi'], nationality: 'India', born: '17 September 1950, Vadnagar, Gujarat', party: 'in-bjp', sourceId: 'pmindia',
  summary: 'Prime Minister of India since May 2014, now in a third term (since June 2024) leading the BJP-led NDA coalition. Chief Minister of Gujarat 2001–2014.',
  roles: [{ type: 'head_of_government', to: 'country:IND', role: 'Prime Minister', from: '2014-05-26', sourceId: 'pmindia' }] });
P({ slug: 'droupadi-murmu', name: 'Droupadi Murmu', aliases: ['President Murmu'], nationality: 'India', born: '20 June 1958, Odisha', party: 'in-bjp', sourceId: 'pmindia',
  summary: '15th President of India (since July 2022), the first person from a tribal community to hold the office.', roles: [{ type: 'head_of_state', to: 'country:IND', role: 'President', from: '2022-07-25', sourceId: 'pmindia' }] });
P({ slug: 'rahul-gandhi', name: 'Rahul Gandhi', aliases: ['Gandhi'], nationality: 'India', born: '19 June 1970, New Delhi', party: 'in-inc', sourceId: 'pmindia',
  summary: 'Leader of the Opposition in the Lok Sabha since June 2024; former president of the Indian National Congress.', roles: [{ type: 'holds_office', to: 'country:IND', role: 'Leader of the Opposition (Lok Sabha)', from: '2024-06-09', sourceId: 'pmindia' }] });
P({ slug: 'lula', name: 'Luiz Inácio Lula da Silva', aliases: ['Lula', 'Lula da Silva'], nationality: 'Brazil', born: '27 October 1945, Caetés, Pernambuco', party: 'br-pt', sourceId: 'gov-br',
  summary: 'President of Brazil since January 2023, previously 2003–2010. Former metalworkers’ union leader and co-founder of the Workers’ Party. Candidate in the October 2026 general election.',
  roles: [{ type: 'head_of_state', to: 'country:BRA', role: 'President', from: '2023-01-01', sourceId: 'gov-br' }, { type: 'head_of_government', to: 'country:BRA', role: 'President', from: '2023-01-01', sourceId: 'gov-br' }] });
P({ slug: 'mark-carney', name: 'Mark Carney', aliases: ['Carney', 'PM Carney'], nationality: 'Canada', born: '16 March 1965, Fort Smith, Northwest Territories', party: 'ca-liberal', sourceId: 'pm-canada',
  education: 'Harvard University (AB); University of Oxford (MPhil, DPhil)',
  summary: 'Prime Minister of Canada since 14 March 2025; won the 28 April 2025 general election. Former Governor of the Bank of Canada (2008–2013) and of the Bank of England (2013–2020).',
  roles: [{ type: 'head_of_government', to: 'country:CAN', role: 'Prime Minister', from: '2025-03-14', sourceId: 'pm-canada' }, { type: 'leads', to: 'party:ca-liberal', role: 'Party leader', from: '2025-03-09', sourceId: 'pm-canada' }] });
P({ slug: 'pierre-poilievre', name: 'Pierre Poilievre', aliases: ['Poilievre'], nationality: 'Canada', party: 'ca-conservative', sourceId: 'pm-canada',
  summary: 'Leader of the Conservative Party of Canada since September 2022 and Leader of the Official Opposition.', roles: [{ type: 'leads', to: 'party:ca-conservative', role: 'Party leader', from: '2022-09-10', sourceId: 'pm-canada' }] });

// IGO leadership
P({ slug: 'mark-rutte', name: 'Mark Rutte', aliases: ['Rutte'], nationality: 'Netherlands', born: '14 February 1967, The Hague', sourceId: 'nato',
  summary: 'NATO Secretary General since 1 October 2024; Prime Minister of the Netherlands 2010–2024.', roles: [{ type: 'leads', to: 'igo:nato', role: 'Secretary General', from: '2024-10-01', sourceId: 'nato' }] });
P({ slug: 'ursula-von-der-leyen', name: 'Ursula von der Leyen', aliases: ['von der Leyen', 'VDL'], nationality: 'Germany', born: '8 October 1958, Brussels', party: 'de-cdu', sourceId: 'eu',
  summary: 'President of the European Commission since December 2019, re-elected for a second term from December 2024. Former German Minister of Defence.', roles: [{ type: 'leads', to: 'igo:eu', role: 'President of the European Commission', from: '2019-12-01', sourceId: 'eu' }] });
P({ slug: 'antonio-costa', name: 'António Costa', aliases: ['Costa'], nationality: 'Portugal', sourceId: 'eu',
  summary: 'President of the European Council since 1 December 2024; Prime Minister of Portugal 2015–2024.', roles: [{ type: 'leads', to: 'igo:eu', role: 'President of the European Council', from: '2024-12-01', sourceId: 'eu' }] });
P({ slug: 'haitham-al-ghais', name: 'Haitham Al Ghais', aliases: ['Al Ghais'], nationality: 'Kuwait', sourceId: 'opec',
  summary: 'OPEC Secretary General since August 2022; previously Kuwait’s OPEC governor.', roles: [{ type: 'leads', to: 'igo:opec', role: 'Secretary General', from: '2022-08-01', sourceId: 'opec' }] });
P({ slug: 'antonio-guterres', name: 'António Guterres', aliases: ['Guterres'], nationality: 'Portugal', sourceId: 'un',
  summary: 'Secretary-General of the United Nations since 1 January 2017; second term ends 31 December 2026. Prime Minister of Portugal 1995–2002 and UN High Commissioner for Refugees 2005–2015.', roles: [{ type: 'leads', to: 'igo:un', role: 'Secretary-General', from: '2017-01-01', until: undefined, sourceId: 'un' }] });
P({ slug: 'kristalina-georgieva', name: 'Kristalina Georgieva', aliases: ['Georgieva'], nationality: 'Bulgaria', sourceId: 'imf',
  summary: 'Managing Director of the IMF since October 2019 (second term from October 2024).', roles: [{ type: 'leads', to: 'igo:imf', role: 'Managing Director', from: '2019-10-01', sourceId: 'imf' }] });
P({ slug: 'ngozi-okonjo-iweala', name: 'Ngozi Okonjo-Iweala', aliases: ['Okonjo-Iweala'], nationality: 'Nigeria', sourceId: 'wto',
  summary: 'Director-General of the WTO since March 2021 (second term from September 2025); former Nigerian finance minister.', roles: [{ type: 'leads', to: 'igo:wto', role: 'Director-General', from: '2021-03-01', sourceId: 'wto' }] });

// ───────────────────────── Industries ─────────────────────────
const INDUSTRIES: [string, string, string][] = [
  ['oil-gas', 'Oil & gas', 'Exploration, production, refining and marketing of petroleum and natural gas.'],
  ['technology', 'Technology hardware & software', 'Consumer electronics, software, cloud computing and AI platforms.'],
  ['semiconductor-industry', 'Semiconductor industry', 'Chip design, fabrication (foundries) and equipment.'],
  ['defense', 'Defense & aerospace', 'Military equipment, munitions and aerospace systems.'],
  ['banking', 'Banking & financial services', 'Commercial banking, asset management and payments.'],
  ['automotive', 'Automotive', 'Vehicle manufacturing and automotive components.'],
  ['steel', 'Steel & metals', 'Primary steel and metals production.'],
  ['chemicals', 'Chemicals & materials', 'Paints, coatings and specialty chemicals.'],
  ['food', 'Food & consumer staples', 'Packaged foods and confectionery.'],
  ['media', 'Media & telecommunications', 'Broadband, cable, broadcasting and entertainment.'],
  ['agri-trading', 'Commodity trading & agribusiness', 'Physical trading, processing and logistics of agricultural and energy commodities.'],
  ['internet', 'Internet & digital platforms', 'Search, social media, e-commerce marketplaces, cloud and online services.'],
  ['pharma', 'Pharmaceuticals & healthcare', 'Drug makers, biotechnology and health insurers.'],
  ['retail', 'Retail & e-commerce', 'Store-based and online retailers.'],
  ['mining', 'Mining', 'Extraction of metal ores, coal and industrial minerals.'],
  ['consumer', 'Consumer goods & luxury', 'Household products, beverages, cosmetics, apparel and luxury goods.'],
  ['industrials', 'Industrial machinery & electrification', 'Machinery, electrical equipment, automation and batteries.'],
  ['insurance', 'Insurance', 'Property, casualty, life and reinsurance.'],
  ['utilities', 'Utilities & power generation', 'Electricity generation and networks, including renewables.'],
  ['shipping', 'Shipping & logistics', 'Container shipping, ports and freight logistics.'],
];
for (const [s, n, d] of INDUSTRIES) add({ id: `industry:${s}`, type: 'industry', name: n, depth: 'curated', summary: d });

// ───────────────────────── Companies ─────────────────────────
interface CoSpec { slug: string; name: string; aliases?: string[]; hq: string; country: string; founded: string; industry: string[]; summary: string; ir?: string; website?: string; public: boolean; quoteSymbol?: string; exchange?: string; currency?: string; secTicker?: string; tickers?: string[]; segments?: string; ownership?: string; operatesIn?: string[]; leader?: [string, string, string, string?]; hqCity?: string; }
const COMPANIES: CoSpec[] = [
  { slug: 'apple', name: 'Apple Inc.', aliases: ['Apple', 'AAPL'], hq: 'city:cupertino', country: 'USA', founded: '1976', industry: ['technology'], public: true, quoteSymbol: 'AAPL', exchange: 'Nasdaq', currency: 'USD', secTicker: 'AAPL', tickers: ['AAPL (Nasdaq)'],
    summary: 'Designs consumer electronics (iPhone, Mac, iPad, wearables) and sells services (App Store, iCloud, Apple Music, payments). Manufacturing is outsourced, concentrated in China with growing assembly in India and Vietnam.',
    segments: 'iPhone; Mac; iPad; Wearables, Home & Accessories; Services', ir: 'https://investor.apple.com', website: 'https://www.apple.com', operatesIn: ['USA', 'CHN', 'IND', 'VNM', 'JPN', 'DEU', 'GBR'], leader: ['tim-cook', 'Tim Cook', 'Chief Executive Officer (since August 2011)', '2011-08-24'] },
  { slug: 'microsoft', name: 'Microsoft Corporation', aliases: ['Microsoft', 'MSFT'], hq: 'city:redmond', country: 'USA', founded: '1975', industry: ['technology'], public: true, quoteSymbol: 'MSFT', exchange: 'Nasdaq', currency: 'USD', secTicker: 'MSFT', tickers: ['MSFT (Nasdaq)'],
    summary: 'Software and cloud company: Azure cloud, Microsoft 365, Windows, LinkedIn, Xbox; major investor in and partner of OpenAI.', segments: 'Productivity & Business Processes; Intelligent Cloud; More Personal Computing',
    ir: 'https://www.microsoft.com/en-us/investor', website: 'https://www.microsoft.com', operatesIn: ['USA', 'IRL', 'IND', 'GBR', 'DEU', 'JPN'], leader: ['satya-nadella', 'Satya Nadella', 'Chairman and CEO (CEO since February 2014)', '2014-02-04'] },
  { slug: 'nvidia', name: 'NVIDIA Corporation', aliases: ['NVIDIA', 'Nvidia', 'NVDA'], hq: 'city:santa-clara', country: 'USA', founded: '1993', industry: ['semiconductor-industry', 'technology'], public: true, quoteSymbol: 'NVDA', exchange: 'Nasdaq', currency: 'USD', secTicker: 'NVDA', tickers: ['NVDA (Nasdaq)'],
    summary: 'Fabless designer of GPUs and accelerated-computing platforms; dominant supplier of AI data-center chips. Manufacturing is outsourced primarily to TSMC.', segments: 'Compute & Networking; Graphics',
    ir: 'https://investor.nvidia.com', website: 'https://www.nvidia.com', operatesIn: ['USA', 'TWN', 'CHN', 'ISR', 'IND'], leader: ['jensen-huang', 'Jensen Huang', 'Co-founder, President and CEO (since 1993)', '1993-04-05'] },
  { slug: 'tsmc', name: 'Taiwan Semiconductor Manufacturing Co.', aliases: ['TSMC', 'TSM', '2330'], hq: 'city:hsinchu', country: 'TWN', founded: '1987', industry: ['semiconductor-industry'], public: true, quoteSymbol: 'TSM', exchange: 'NYSE (ADR); primary listing TWSE 2330', currency: 'USD', secTicker: 'TSM', tickers: ['2330 (TWSE)', 'TSM (NYSE ADR)'],
    summary: 'World’s largest contract chipmaker (foundry), producing leading-edge logic chips for Apple, NVIDIA and others. Fabs concentrated in Taiwan, with new plants in Arizona (USA), Kumamoto (Japan) and Dresden (Germany).',
    ir: 'https://investor.tsmc.com', website: 'https://www.tsmc.com', operatesIn: ['TWN', 'USA', 'JPN', 'DEU', 'CHN'], leader: ['cc-wei', 'C. C. Wei', 'Chairman and CEO (chairman since June 2024)', '2024-06-04'] },
  { slug: 'samsung-electronics', name: 'Samsung Electronics', aliases: ['Samsung', '005930'], hq: 'city:suwon', country: 'KOR', founded: '1969', industry: ['semiconductor-industry', 'technology'], public: true, quoteSymbol: '005930.KS', exchange: 'Korea Exchange', currency: 'KRW', tickers: ['005930 (KRX)'],
    summary: 'South Korean electronics conglomerate; leading maker of memory chips (DRAM, NAND) and smartphones, and a contract foundry competitor to TSMC.', website: 'https://www.samsung.com', operatesIn: ['KOR', 'VNM', 'USA', 'CHN', 'IND'] },
  { slug: 'aramco', name: 'Saudi Aramco', aliases: ['Aramco', 'Saudi Arabian Oil Company', '2222'], hq: 'city:dhahran', country: 'SAU', founded: '1933', industry: ['oil-gas'], public: true, quoteSymbol: '2222.SR', exchange: 'Saudi Exchange (Tadawul)', currency: 'SAR', tickers: ['2222 (Tadawul)'],
    summary: 'Saudi Arabia’s national oil company and one of the world’s largest oil producers by output. Majority owned by the Saudi government, with a further stake held by the Public Investment Fund; a small free float trades on Tadawul since the December 2019 IPO.',
    ownership: 'Government of Saudi Arabia (majority); Public Investment Fund; public free float', ir: 'https://www.aramco.com/en/investors', website: 'https://www.aramco.com', operatesIn: ['SAU', 'CHN', 'KOR', 'USA'], leader: ['amin-nasser', 'Amin H. Nasser', 'President and CEO (since 2015)', '2015-09-01'] },
  { slug: 'exxonmobil', name: 'Exxon Mobil Corporation', aliases: ['ExxonMobil', 'Exxon', 'XOM'], hq: 'city:houston', country: 'USA', founded: '1999', industry: ['oil-gas', 'chemicals'], public: true, quoteSymbol: 'XOM', exchange: 'NYSE', currency: 'USD', secTicker: 'XOM', tickers: ['XOM (NYSE)'],
    summary: 'Largest US oil major (formed by the 1999 Exxon–Mobil merger), headquartered in Spring, Texas (Houston area). Key growth assets include the Permian Basin (expanded by the 2024 Pioneer acquisition) and Guyana’s Stabroek block.',
    ir: 'https://investor.exxonmobil.com', website: 'https://corporate.exxonmobil.com', operatesIn: ['USA', 'GUY', 'QAT', 'CAN', 'AUS', 'PNG'], leader: ['darren-woods', 'Darren Woods', 'Chairman and CEO (since 2017)', '2017-01-01'] },
  { slug: 'chevron', name: 'Chevron Corporation', aliases: ['Chevron', 'CVX'], hq: 'city:houston', country: 'USA', founded: '1879', industry: ['oil-gas'], public: true, quoteSymbol: 'CVX', exchange: 'NYSE', currency: 'USD', secTicker: 'CVX', tickers: ['CVX (NYSE)'],
    summary: 'US integrated oil major; relocated its headquarters from San Ramon, California to Houston (announced 2024). Completed its acquisition of Hess in July 2025, adding a stake in Guyana’s Stabroek block.',
    ir: 'https://www.chevron.com/investors', website: 'https://www.chevron.com', operatesIn: ['USA', 'KAZ', 'AUS', 'GUY', 'ISR'], leader: ['mike-wirth', 'Mike Wirth', 'Chairman and CEO (since 2018)', '2018-02-01'] },
  { slug: 'shell', name: 'Shell plc', aliases: ['Shell', 'SHEL', 'Royal Dutch Shell'], hq: 'city:london', country: 'GBR', founded: '1907', industry: ['oil-gas'], public: true, quoteSymbol: 'SHEL', exchange: 'NYSE (ADS); primary listing LSE', currency: 'USD', secTicker: 'SHEL', tickers: ['SHEL (LSE)', 'SHEL (NYSE ADS)'],
    summary: 'British oil and gas major and the world’s largest LNG trader; moved its headquarters from The Hague to London in 2022.', ir: 'https://www.shell.com/investors', website: 'https://www.shell.com', operatesIn: ['GBR', 'NLD', 'USA', 'QAT', 'AUS', 'NGA', 'BRA'], leader: ['wael-sawan', 'Wael Sawan', 'Chief Executive Officer (since January 2023)', '2023-01-01'] },
  { slug: 'totalenergies', name: 'TotalEnergies SE', aliases: ['TotalEnergies', 'Total', 'TTE'], hq: 'city:paris', country: 'FRA', founded: '1924', industry: ['oil-gas'], public: true, quoteSymbol: 'TTE.PA', exchange: 'Euronext Paris', currency: 'EUR', secTicker: 'TTE', tickers: ['TTE (Euronext Paris)', 'TTE (NYSE)'],
    summary: 'French integrated energy company (oil, gas, LNG, power and renewables), headquartered in La Défense near Paris.', ir: 'https://totalenergies.com/investors', website: 'https://totalenergies.com', operatesIn: ['FRA', 'QAT', 'NGA', 'AGO', 'USA', 'BRA'], leader: ['patrick-pouyanne', 'Patrick Pouyanné', 'Chairman and CEO (CEO since 2014)', '2014-10-22'] },
  { slug: 'bp', name: 'BP p.l.c.', aliases: ['BP', 'British Petroleum'], hq: 'city:london', country: 'GBR', founded: '1909', industry: ['oil-gas'], public: true, quoteSymbol: 'BP', exchange: 'NYSE (ADS); primary listing LSE', currency: 'USD', secTicker: 'BP', tickers: ['BP. (LSE)', 'BP (NYSE ADS)'],
    summary: 'British oil major founded as the Anglo-Persian Oil Company in 1909; in 2025 reset strategy back toward oil and gas investment.', ir: 'https://www.bp.com/en/global/corporate/investors.html', website: 'https://www.bp.com', operatesIn: ['GBR', 'USA', 'AZE', 'IRQ', 'ARE', 'EGY'] },
  { slug: 'rheinmetall', name: 'Rheinmetall AG', aliases: ['Rheinmetall', 'RHM'], hq: 'city:dusseldorf', country: 'DEU', founded: '1889', industry: ['defense'], public: true, quoteSymbol: 'RHM.DE', exchange: 'Xetra (Frankfurt)', currency: 'EUR', tickers: ['RHM (Xetra)'],
    summary: 'Germany’s largest defense contractor — artillery ammunition, armored vehicles, air defense — and a major beneficiary of increased NATO defense budgets.', ir: 'https://www.rheinmetall.com/en/investor-relations', website: 'https://www.rheinmetall.com', operatesIn: ['DEU', 'HUN', 'UKR', 'GBR', 'AUS', 'USA'], leader: ['armin-papperger', 'Armin Papperger', 'Chief Executive Officer (since 2013)', '2013-01-01'] },
  { slug: 'lockheed-martin', name: 'Lockheed Martin Corporation', aliases: ['Lockheed Martin', 'Lockheed', 'LMT'], hq: 'city:bethesda', country: 'USA', founded: '1995', industry: ['defense'], public: true, quoteSymbol: 'LMT', exchange: 'NYSE', currency: 'USD', secTicker: 'LMT', tickers: ['LMT (NYSE)'],
    summary: 'Largest US defense contractor; prime contractor for the F-35 fighter used by many NATO allies, plus missiles, space and rotary-wing systems.', segments: 'Aeronautics; Missiles & Fire Control; Rotary & Mission Systems; Space',
    ir: 'https://investors.lockheedmartin.com', website: 'https://www.lockheedmartin.com', operatesIn: ['USA', 'GBR', 'JPN', 'ITA', 'AUS'], leader: ['jim-taiclet', 'Jim Taiclet', 'Chairman, President and CEO (since June 2020)', '2020-06-15'] },
  { slug: 'sap', name: 'SAP SE', aliases: ['SAP'], hq: 'city:walldorf', country: 'DEU', founded: '1972', industry: ['technology'], public: true, quoteSymbol: 'SAP.DE', exchange: 'Xetra (Frankfurt)', currency: 'EUR', secTicker: 'SAP', tickers: ['SAP (Xetra)', 'SAP (NYSE ADR)'],
    summary: 'Europe’s largest software company; enterprise resource planning (ERP) and cloud business applications.', ir: 'https://www.sap.com/investors', website: 'https://www.sap.com', operatesIn: ['DEU', 'USA', 'IND', 'IRL'] },
  { slug: 'toyota', name: 'Toyota Motor Corporation', aliases: ['Toyota', '7203', 'TM'], hq: 'city:toyota-city', country: 'JPN', founded: '1937', industry: ['automotive'], public: true, quoteSymbol: '7203.T', exchange: 'Tokyo Stock Exchange', currency: 'JPY', secTicker: 'TM', tickers: ['7203 (TSE)', 'TM (NYSE ADR)'],
    summary: 'World’s largest automaker by unit sales; pioneer of lean manufacturing and hybrid powertrains.', ir: 'https://global.toyota/en/ir/', website: 'https://global.toyota', operatesIn: ['JPN', 'USA', 'CHN', 'THA', 'MEX', 'CAN'] },
  { slug: 'nippon-steel', name: 'Nippon Steel Corporation', aliases: ['Nippon Steel', '5401'], hq: 'city:tokyo', country: 'JPN', founded: '1950', industry: ['steel'], public: true, quoteSymbol: '5401.T', exchange: 'Tokyo Stock Exchange', currency: 'JPY', tickers: ['5401 (TSE)'],
    summary: 'Japan’s largest steelmaker. Completed its acquisition of United States Steel on 18 June 2025 under a national-security agreement that gives the US government a “golden share”.', ir: 'https://www.nipponsteel.com/en/ir/', website: 'https://www.nipponsteel.com/en/', operatesIn: ['JPN', 'USA', 'IND', 'THA'] },
  { slug: 'us-steel', name: 'United States Steel Corporation', aliases: ['U.S. Steel', 'US Steel', 'USS', 'X'], hq: 'city:pittsburgh', country: 'USA', founded: '1901', industry: ['steel'], public: false,
    summary: 'Pittsburgh-based steelmaker founded in 1901 by J.P. Morgan, Andrew Carnegie and others. Delisted after becoming a wholly owned subsidiary of Nippon Steel on 18 June 2025; the US government holds a golden share covering headquarters location, production and name.',
    ownership: 'Wholly owned by Nippon Steel Corporation (since 18 June 2025); US government golden share', website: 'https://www.ussteel.com', operatesIn: ['USA', 'SVK'] },
  { slug: 'pnc', name: 'PNC Financial Services Group', aliases: ['PNC', 'PNC Bank'], hq: 'city:pittsburgh', country: 'USA', founded: '1845', industry: ['banking'], public: true, quoteSymbol: 'PNC', exchange: 'NYSE', currency: 'USD', secTicker: 'PNC', tickers: ['PNC (NYSE)'],
    summary: 'One of the largest US regional banks, headquartered in Pittsburgh; retail and corporate banking and asset management.', ir: 'https://investor.pnc.com', website: 'https://www.pnc.com', operatesIn: ['USA'] },
  { slug: 'comcast', name: 'Comcast Corporation', aliases: ['Comcast', 'CMCSA', 'NBCUniversal', 'Xfinity'], hq: 'city:philadelphia', country: 'USA', founded: '1963', industry: ['media'], public: true, quoteSymbol: 'CMCSA', exchange: 'Nasdaq', currency: 'USD', secTicker: 'CMCSA', tickers: ['CMCSA (Nasdaq)'],
    summary: 'Philadelphia-headquartered media and connectivity company: Xfinity broadband, NBCUniversal, Universal theme parks and Sky (Europe).', ir: 'https://www.cmcsa.com', website: 'https://corporate.comcast.com', operatesIn: ['USA', 'GBR', 'ITA', 'DEU'], leader: ['brian-roberts', 'Brian L. Roberts', 'Chairman and CEO', '2002-01-01'] },
  { slug: 'hershey', name: 'The Hershey Company', aliases: ['Hershey', "Hershey's", 'HSY'], hq: 'city:hershey', country: 'USA', founded: '1894', industry: ['food'], public: true, quoteSymbol: 'HSY', exchange: 'NYSE', currency: 'USD', secTicker: 'HSY', tickers: ['HSY (NYSE)'],
    summary: 'Largest North American chocolate maker, founded by Milton S. Hershey. Voting control is held by the Hershey Trust Company as trustee for the Milton Hershey School. Highly exposed to cocoa and sugar prices.',
    ownership: 'Hershey Trust Company (for the Milton Hershey School Trust) holds majority voting power', ir: 'https://www.thehersheycompany.com/en_us/home/investors.html', website: 'https://www.thehersheycompany.com', operatesIn: ['USA', 'MEX', 'CAN', 'IND', 'MYS'] },
  { slug: 'ppg', name: 'PPG Industries', aliases: ['PPG'], hq: 'city:pittsburgh', country: 'USA', founded: '1883', industry: ['chemicals'], public: true, quoteSymbol: 'PPG', exchange: 'NYSE', currency: 'USD', secTicker: 'PPG', tickers: ['PPG (NYSE)'],
    summary: 'Pittsburgh-based global supplier of paints, coatings and specialty materials.', ir: 'https://investor.ppg.com', website: 'https://www.ppg.com', operatesIn: ['USA', 'CHN', 'MEX', 'DEU'] },
  { slug: 'cargill', name: 'Cargill, Incorporated', aliases: ['Cargill'], hq: 'country:USA', country: 'USA', founded: '1865', industry: ['agri-trading', 'food'], public: false,
    summary: 'Privately held agribusiness and commodity trader headquartered in Minnesota; one of the largest US private companies. Originates, processes and trades grains, oilseeds, meat and other commodities worldwide.',
    ownership: 'Privately held — Cargill and MacMillan family members and employees', website: 'https://www.cargill.com', operatesIn: ['USA', 'BRA', 'ARG', 'CHN', 'NLD'] },
  { slug: 'vitol', name: 'Vitol Group', aliases: ['Vitol'], hq: 'city:geneva', country: 'CHE', founded: '1966', industry: ['agri-trading', 'oil-gas'], public: false,
    summary: 'Largest independent energy trader, founded in Rotterdam in 1966; principal offices in Geneva, London, Houston and Singapore. Owned by its senior employees.',
    ownership: 'Employee-owned (private partnership)', website: 'https://www.vitol.com', operatesIn: ['CHE', 'GBR', 'NLD', 'USA', 'SGP'] },
  { slug: 'bosch', name: 'Robert Bosch GmbH', aliases: ['Bosch'], hq: 'city:stuttgart', country: 'DEU', founded: '1886', industry: ['automotive', 'technology'], public: false,
    summary: 'World’s largest automotive supplier; also industrial technology, consumer goods and building technology. Headquartered in Gerlingen near Stuttgart and majority owned by a charitable foundation, so its shares do not trade publicly.',
    ownership: 'Majority owned by the Robert Bosch Stiftung (charitable foundation); Bosch family; voting rights held by Robert Bosch Industrietreuhand KG', website: 'https://www.bosch.com', operatesIn: ['DEU', 'CHN', 'USA', 'IND', 'HUN'] },
];

// Expanded coverage: large listed companies across sectors and regions. Stable identifiers
// only (name, listing, headquarters, founding year, industry); prices, financials and
// estimates load live. Executives are not listed here because they change often.
type CoRow = [slug: string, name: string, aliases: string[], symbol: string, exchange: string, currency: string, sec: string | undefined, country: string, hq: string, hqCity: string, founded: string, industry: string[], summary: string];
const MORE: CoRow[] = [
  // United States
  ['alphabet', 'Alphabet Inc.', ['Alphabet', 'Google', 'GOOGL', 'GOOG'], 'GOOGL', 'Nasdaq', 'USD', 'GOOGL', 'USA', 'city:mountain-view', 'Mountain View, California', '1998', ['internet', 'technology'], 'Parent of Google: search and advertising, YouTube, Android, Google Cloud and the Gemini AI models; also Waymo (autonomous driving).'],
  ['amazon', 'Amazon.com, Inc.', ['Amazon', 'AMZN', 'AWS'], 'AMZN', 'Nasdaq', 'USD', 'AMZN', 'USA', 'city:seattle', 'Seattle, Washington', '1994', ['retail', 'internet'], 'Largest online retailer in the US and Europe, and the largest cloud provider (Amazon Web Services); also advertising, logistics and devices.'],
  ['meta', 'Meta Platforms, Inc.', ['Meta', 'Facebook', 'META', 'Instagram', 'WhatsApp'], 'META', 'Nasdaq', 'USD', 'META', 'USA', 'state:US-CA', 'Menlo Park, California', '2004', ['internet'], 'Owner of Facebook, Instagram, WhatsApp and Messenger; revenue comes overwhelmingly from advertising. Invests heavily in AI and virtual/augmented reality.'],
  ['tesla', 'Tesla, Inc.', ['Tesla', 'TSLA'], 'TSLA', 'Nasdaq', 'USD', 'TSLA', 'USA', 'city:austin', 'Austin, Texas', '2003', ['automotive', 'industrials'], 'Electric-vehicle maker with factories in the US, China (Shanghai) and Germany (Berlin-Brandenburg); also battery storage and solar.'],
  ['berkshire-hathaway', 'Berkshire Hathaway Inc.', ['Berkshire', 'BRK.B', 'BRK-B'], 'BRK-B', 'NYSE', 'USD', 'BRK-B', 'USA', 'city:omaha', 'Omaha, Nebraska', '1839', ['insurance', 'banking'], 'Conglomerate built by Warren Buffett: insurance (GEICO, reinsurance), BNSF railway, utilities and energy, manufacturers, and a large listed-equity portfolio.'],
  ['jpmorgan', 'JPMorgan Chase & Co.', ['JPMorgan', 'JPM', 'Chase'], 'JPM', 'NYSE', 'USD', 'JPM', 'USA', 'city:new-york', 'New York City', '1799', ['banking'], 'Largest US bank by assets: consumer banking (Chase), investment banking, markets and asset management.'],
  ['bank-of-america', 'Bank of America Corporation', ['Bank of America', 'BofA', 'BAC'], 'BAC', 'NYSE', 'USD', 'BAC', 'USA', 'city:charlotte', 'Charlotte, North Carolina', '1904', ['banking'], 'Second-largest US bank; consumer banking, Merrill wealth management and global markets.'],
  ['goldman-sachs', 'The Goldman Sachs Group, Inc.', ['Goldman Sachs', 'Goldman', 'GS'], 'GS', 'NYSE', 'USD', 'GS', 'USA', 'city:new-york', 'New York City', '1869', ['banking'], 'Global investment bank: advisory, underwriting, trading and asset & wealth management.'],
  ['visa', 'Visa Inc.', ['Visa', 'V'], 'V', 'NYSE', 'USD', 'V', 'USA', 'city:san-francisco', 'San Francisco, California', '1958', ['banking'], 'World’s largest card-payments network; earns fees on transaction volume rather than lending.'],
  ['mastercard', 'Mastercard Incorporated', ['Mastercard', 'MA'], 'MA', 'NYSE', 'USD', 'MA', 'USA', 'city:new-york', 'Purchase, New York', '1966', ['banking'], 'Second-largest global card-payments network.'],
  ['eli-lilly', 'Eli Lilly and Company', ['Eli Lilly', 'Lilly', 'LLY'], 'LLY', 'NYSE', 'USD', 'LLY', 'USA', 'state:US-IN', 'Indianapolis, Indiana', '1876', ['pharma'], 'Pharmaceutical company whose GLP-1 drugs for diabetes and obesity (Mounjaro, Zepbound) made it one of the world’s most valuable drug makers.'],
  ['johnson-johnson', 'Johnson & Johnson', ['J&J', 'JNJ'], 'JNJ', 'NYSE', 'USD', 'JNJ', 'USA', 'state:US-NJ', 'New Brunswick, New Jersey', '1886', ['pharma'], 'Healthcare company focused on innovative medicines and medical technology (consumer health was spun off as Kenvue in 2023).'],
  ['pfizer', 'Pfizer Inc.', ['Pfizer', 'PFE'], 'PFE', 'NYSE', 'USD', 'PFE', 'USA', 'city:new-york', 'New York City', '1849', ['pharma'], 'Large pharmaceutical company (oncology, vaccines, internal medicine).'],
  ['unitedhealth', 'UnitedHealth Group Incorporated', ['UnitedHealth', 'UNH', 'Optum'], 'UNH', 'NYSE', 'USD', 'UNH', 'USA', 'state:US-MN', 'Minnetonka, Minnesota', '1977', ['pharma', 'insurance'], 'Largest US health insurer (UnitedHealthcare) and health-services provider (Optum).'],
  ['walmart', 'Walmart Inc.', ['Walmart', 'WMT'], 'WMT', 'Nasdaq', 'USD', 'WMT', 'USA', 'state:US-AR', 'Bentonville, Arkansas', '1962', ['retail'], 'World’s largest retailer by revenue, with stores in the US, Mexico (Walmex), Canada, China and elsewhere, plus a growing e-commerce and advertising business.'],
  ['costco', 'Costco Wholesale Corporation', ['Costco', 'COST'], 'COST', 'Nasdaq', 'USD', 'COST', 'USA', 'state:US-WA', 'Issaquah, Washington', '1983', ['retail'], 'Membership warehouse-club retailer.'],
  ['procter-gamble', 'The Procter & Gamble Company', ['Procter & Gamble', 'P&G', 'PG'], 'PG', 'NYSE', 'USD', 'PG', 'USA', 'state:US-OH', 'Cincinnati, Ohio', '1837', ['consumer'], 'Household and personal-care brands (Tide, Pampers, Gillette, Pantene).'],
  ['coca-cola', 'The Coca-Cola Company', ['Coca-Cola', 'Coke', 'KO'], 'KO', 'NYSE', 'USD', 'KO', 'USA', 'city:atlanta', 'Atlanta, Georgia', '1892', ['food', 'consumer'], 'Largest soft-drink company; sells concentrate to a global network of bottlers. Large user of sugar and high-fructose corn syrup.'],
  ['broadcom', 'Broadcom Inc.', ['Broadcom', 'AVGO'], 'AVGO', 'Nasdaq', 'USD', 'AVGO', 'USA', 'state:US-CA', 'Palo Alto, California', '1961', ['semiconductor-industry', 'technology'], 'Designer of networking, custom AI accelerator and wireless chips; owns VMware infrastructure software.'],
  ['amd', 'Advanced Micro Devices, Inc.', ['AMD'], 'AMD', 'Nasdaq', 'USD', 'AMD', 'USA', 'city:santa-clara', 'Santa Clara, California', '1969', ['semiconductor-industry'], 'Fabless designer of CPUs, GPUs and AI accelerators; manufacturing outsourced mainly to TSMC.'],
  ['intel', 'Intel Corporation', ['Intel', 'INTC'], 'INTC', 'Nasdaq', 'USD', 'INTC', 'USA', 'city:santa-clara', 'Santa Clara, California', '1968', ['semiconductor-industry'], 'Largest US chipmaker that still runs its own fabs (Arizona, Oregon, Ireland, Israel); rebuilding a contract-foundry business. The US government took an equity stake in 2025.'],
  ['micron', 'Micron Technology, Inc.', ['Micron', 'MU'], 'MU', 'Nasdaq', 'USD', 'MU', 'USA', 'state:US-ID', 'Boise, Idaho', '1978', ['semiconductor-industry'], 'Memory-chip maker (DRAM, high-bandwidth memory for AI, NAND flash).'],
  ['qualcomm', 'Qualcomm Incorporated', ['Qualcomm', 'QCOM'], 'QCOM', 'Nasdaq', 'USD', 'QCOM', 'USA', 'state:US-CA', 'San Diego, California', '1985', ['semiconductor-industry'], 'Fabless designer of smartphone processors and modems; licenses wireless patents.'],
  ['applied-materials', 'Applied Materials, Inc.', ['Applied Materials', 'AMAT'], 'AMAT', 'Nasdaq', 'USD', 'AMAT', 'USA', 'city:santa-clara', 'Santa Clara, California', '1967', ['semiconductor-industry', 'industrials'], 'Largest supplier of chip-making equipment (deposition, etch, inspection); subject to export controls on sales to China.'],
  ['oracle', 'Oracle Corporation', ['Oracle', 'ORCL'], 'ORCL', 'NYSE', 'USD', 'ORCL', 'USA', 'state:US-TX', 'Austin, Texas (relocation to Nashville announced 2024)', '1977', ['technology'], 'Database and enterprise software company expanding rapidly in AI cloud infrastructure.'],
  ['netflix', 'Netflix, Inc.', ['Netflix', 'NFLX'], 'NFLX', 'Nasdaq', 'USD', 'NFLX', 'USA', 'state:US-CA', 'Los Gatos, California', '1997', ['media', 'internet'], 'Largest subscription video-streaming service.'],
  ['palantir', 'Palantir Technologies Inc.', ['Palantir', 'PLTR'], 'PLTR', 'Nasdaq', 'USD', 'PLTR', 'USA', 'city:denver', 'Denver, Colorado', '2003', ['technology', 'defense'], 'Data-analytics and AI software for governments, militaries and companies.'],
  ['boeing', 'The Boeing Company', ['Boeing', 'BA'], 'BA', 'NYSE', 'USD', 'BA', 'USA', 'state:US-VA', 'Arlington, Virginia', '1916', ['defense'], 'Largest US aerospace exporter: commercial jets, defense and space systems.'],
  ['rtx', 'RTX Corporation', ['RTX', 'Raytheon', 'Pratt & Whitney', 'Collins Aerospace'], 'RTX', 'NYSE', 'USD', 'RTX', 'USA', 'state:US-VA', 'Arlington, Virginia', '1922', ['defense'], 'Aerospace and defense group: Raytheon missiles and air defense (Patriot), Pratt & Whitney engines, Collins Aerospace.'],
  ['northrop-grumman', 'Northrop Grumman Corporation', ['Northrop Grumman', 'NOC'], 'NOC', 'NYSE', 'USD', 'NOC', 'USA', 'state:US-VA', 'Falls Church, Virginia', '1994', ['defense'], 'Defense contractor: B-21 bomber, space systems, nuclear-deterrent and missile programmes.'],
  ['general-dynamics', 'General Dynamics Corporation', ['General Dynamics', 'GD'], 'GD', 'NYSE', 'USD', 'GD', 'USA', 'state:US-VA', 'Reston, Virginia', '1952', ['defense'], 'Defense contractor (submarines, combat vehicles, munitions) and Gulfstream business jets.'],
  ['caterpillar', 'Caterpillar Inc.', ['Caterpillar', 'CAT'], 'CAT', 'NYSE', 'USD', 'CAT', 'USA', 'state:US-TX', 'Irving, Texas', '1925', ['industrials'], 'Largest maker of construction and mining equipment, engines and power-generation systems.'],
  ['deere', 'Deere & Company', ['John Deere', 'Deere', 'DE'], 'DE', 'NYSE', 'USD', 'DE', 'USA', 'state:US-IL', 'Moline, Illinois', '1837', ['industrials'], 'Largest maker of agricultural machinery; sales track farm incomes and crop prices.'],
  ['general-motors', 'General Motors Company', ['General Motors', 'GM'], 'GM', 'NYSE', 'USD', 'GM', 'USA', 'city:detroit', 'Detroit, Michigan', '1908', ['automotive'], 'Largest US automaker by sales (Chevrolet, GMC, Cadillac, Buick).'],
  ['ford', 'Ford Motor Company', ['Ford', 'F'], 'F', 'NYSE', 'USD', 'F', 'USA', 'state:US-MI', 'Dearborn, Michigan', '1903', ['automotive'], 'US automaker best known for F-Series pickups; Ford Pro commercial vehicles and Model e electric vehicles.'],
  ['conocophillips', 'ConocoPhillips', ['Conoco', 'COP'], 'COP', 'NYSE', 'USD', 'COP', 'USA', 'city:houston', 'Houston, Texas', '2002', ['oil-gas'], 'Largest US independent oil and gas producer (exploration and production only).'],
  ['nextera', 'NextEra Energy, Inc.', ['NextEra', 'NEE', 'Florida Power & Light'], 'NEE', 'NYSE', 'USD', 'NEE', 'USA', 'state:US-FL', 'Juno Beach, Florida', '1925', ['utilities'], 'Largest US utility by market value: Florida Power & Light and the world’s largest generator of wind and solar power.'],
  ['freeport-mcmoran', 'Freeport-McMoRan Inc.', ['Freeport', 'FCX'], 'FCX', 'NYSE', 'USD', 'FCX', 'USA', 'state:US-AZ', 'Phoenix, Arizona', '1912', ['mining'], 'One of the largest copper miners (Grasberg in Indonesia, mines in Arizona and Peru); also gold and molybdenum.'],
  ['newmont', 'Newmont Corporation', ['Newmont', 'NEM'], 'NEM', 'NYSE', 'USD', 'NEM', 'USA', 'city:denver', 'Denver, Colorado', '1921', ['mining'], 'World’s largest gold miner, with mines in North and South America, Australia, Africa and Papua New Guinea.'],
  ['adm', 'Archer-Daniels-Midland Company', ['ADM', 'Archer Daniels Midland'], 'ADM', 'NYSE', 'USD', 'ADM', 'USA', 'city:chicago', 'Chicago, Illinois', '1902', ['agri-trading', 'food'], 'Agricultural processor and trader: oilseed crushing, corn processing, grain origination.'],
  // Canada
  ['shopify', 'Shopify Inc.', ['Shopify', 'SHOP'], 'SHOP', 'Nasdaq', 'USD', 'SHOP', 'CAN', 'city:ottawa', 'Ottawa, Ontario', '2006', ['internet'], 'E-commerce software platform used by millions of merchants.'],
  ['royal-bank-of-canada', 'Royal Bank of Canada', ['RBC', 'RY'], 'RY.TO', 'Toronto Stock Exchange', 'CAD', 'RY', 'CAN', 'city:toronto', 'Toronto, Ontario', '1864', ['banking'], 'Canada’s largest bank by assets.'],
  // Europe
  ['asml', 'ASML Holding N.V.', ['ASML'], 'ASML.AS', 'Euronext Amsterdam', 'EUR', 'ASML', 'NLD', 'country:NLD', 'Veldhoven, Netherlands', '1984', ['semiconductor-industry', 'industrials'], 'Sole supplier of extreme-ultraviolet (EUV) lithography machines needed for leading-edge chips; Dutch export licences restrict sales to China.'],
  ['novo-nordisk', 'Novo Nordisk A/S', ['Novo Nordisk', 'Novo', 'NVO'], 'NOVO-B.CO', 'Nasdaq Copenhagen', 'DKK', 'NVO', 'DNK', 'country:DNK', 'Bagsværd, Denmark', '1923', ['pharma'], 'Diabetes and obesity drug maker (Ozempic, Wegovy); majority controlled by the Novo Nordisk Foundation.'],
  ['lvmh', 'LVMH Moët Hennessy Louis Vuitton SE', ['LVMH', 'Louis Vuitton', 'MC'], 'MC.PA', 'Euronext Paris', 'EUR', undefined, 'FRA', 'city:paris', 'Paris, France', '1987', ['consumer'], 'World’s largest luxury-goods group (Louis Vuitton, Dior, Moët Hennessy, Tiffany, Sephora); controlled by the Arnault family.'],
  ['loreal', 'L’Oréal S.A.', ['L\'Oréal', 'LOreal', 'OR'], 'OR.PA', 'Euronext Paris', 'EUR', undefined, 'FRA', 'country:FRA', 'Clichy, France', '1909', ['consumer'], 'World’s largest cosmetics company.'],
  ['sanofi', 'Sanofi', ['Sanofi', 'SNY'], 'SAN.PA', 'Euronext Paris', 'EUR', 'SNY', 'FRA', 'city:paris', 'Paris, France', '1973', ['pharma'], 'French pharmaceutical company (immunology, vaccines, rare diseases).'],
  ['schneider-electric', 'Schneider Electric SE', ['Schneider Electric', 'SU'], 'SU.PA', 'Euronext Paris', 'EUR', undefined, 'FRA', 'country:FRA', 'Rueil-Malmaison, France', '1836', ['industrials'], 'Electrical-equipment and automation group; a major supplier to data centres and power grids.'],
  ['bnp-paribas', 'BNP Paribas', ['BNP Paribas', 'BNP'], 'BNP.PA', 'Euronext Paris', 'EUR', undefined, 'FRA', 'city:paris', 'Paris, France', '2000', ['banking'], 'Largest euro-area bank by assets.'],
  ['airbus', 'Airbus SE', ['Airbus', 'AIR'], 'AIR.PA', 'Euronext Paris', 'EUR', undefined, 'NLD', 'country:NLD', 'Leiden, Netherlands (registered office); main operations in Toulouse, France', '1970', ['defense'], 'Largest commercial aircraft maker by deliveries; also helicopters, defense and space. Major shareholders include the French, German and Spanish states.'],
  ['siemens', 'Siemens AG', ['Siemens', 'SIE'], 'SIE.DE', 'Xetra (Frankfurt)', 'EUR', undefined, 'DEU', 'city:munich', 'Munich, Germany', '1847', ['industrials', 'technology'], 'Industrial technology group: factory automation and software, smart infrastructure, rail (Mobility) and healthcare (Siemens Healthineers).'],
  ['volkswagen', 'Volkswagen AG', ['Volkswagen', 'VW', 'VOW3'], 'VOW3.DE', 'Xetra (Frankfurt)', 'EUR', undefined, 'DEU', 'city:wolfsburg', 'Wolfsburg, Germany', '1937', ['automotive'], 'Europe’s largest carmaker (VW, Audi, Porsche, Škoda, SEAT); China is its largest single market. Controlled by the Porsche/Piëch families, with Lower Saxony holding a blocking stake.'],
  ['mercedes-benz', 'Mercedes-Benz Group AG', ['Mercedes-Benz', 'Mercedes', 'Daimler', 'MBG'], 'MBG.DE', 'Xetra (Frankfurt)', 'EUR', undefined, 'DEU', 'city:stuttgart', 'Stuttgart, Germany', '1926', ['automotive'], 'Premium car and van maker.'],
  ['bmw', 'Bayerische Motoren Werke AG', ['BMW'], 'BMW.DE', 'Xetra (Frankfurt)', 'EUR', undefined, 'DEU', 'city:munich', 'Munich, Germany', '1916', ['automotive'], 'Premium carmaker (BMW, Mini, Rolls-Royce); its largest plant is in Spartanburg, South Carolina.'],
  ['allianz', 'Allianz SE', ['Allianz', 'ALV'], 'ALV.DE', 'Xetra (Frankfurt)', 'EUR', undefined, 'DEU', 'city:munich', 'Munich, Germany', '1890', ['insurance'], 'One of the world’s largest insurers and asset managers (PIMCO, Allianz Global Investors).'],
  ['deutsche-telekom', 'Deutsche Telekom AG', ['Deutsche Telekom', 'DTE', 'T-Mobile'], 'DTE.DE', 'Xetra (Frankfurt)', 'EUR', undefined, 'DEU', 'country:DEU', 'Bonn, Germany', '1995', ['media'], 'Largest European telecoms operator; controlling shareholder of T-Mobile US.'],
  ['nestle', 'Nestlé S.A.', ['Nestle', 'Nestlé', 'NESN'], 'NESN.SW', 'SIX Swiss Exchange', 'CHF', undefined, 'CHE', 'country:CHE', 'Vevey, Switzerland', '1866', ['food', 'consumer'], 'World’s largest food and beverage company (Nescafé, Nespresso, KitKat, Purina); a major buyer of coffee and cocoa.'],
  ['roche', 'Roche Holding AG', ['Roche', 'ROG', 'RO'], 'RO.SW', 'SIX Swiss Exchange', 'CHF', undefined, 'CHE', 'city:basel', 'Basel, Switzerland', '1896', ['pharma'], 'Pharmaceutical and diagnostics group (oncology, Genentech in the US); voting control held by the founding Hoffmann and Oeri families.'],
  ['novartis', 'Novartis AG', ['Novartis', 'NOVN', 'NVS'], 'NOVN.SW', 'SIX Swiss Exchange', 'CHF', 'NVS', 'CHE', 'city:basel', 'Basel, Switzerland', '1996', ['pharma'], 'Innovative-medicines company formed by the merger of Ciba-Geigy and Sandoz (generics spun off in 2023).'],
  ['glencore', 'Glencore plc', ['Glencore', 'GLEN'], 'GLEN.L', 'London Stock Exchange', 'GBP', undefined, 'CHE', 'country:CHE', 'Baar, Switzerland', '1974', ['mining', 'agri-trading'], 'Commodity trader and miner (copper, cobalt, zinc, nickel, coal); one of the largest cobalt producers.'],
  ['rio-tinto', 'Rio Tinto Group', ['Rio Tinto', 'RIO'], 'RIO.L', 'London Stock Exchange', 'GBP', 'RIO', 'GBR', 'city:london', 'London, UK', '1873', ['mining'], 'Iron-ore, copper and aluminium miner; most iron ore comes from Western Australia’s Pilbara and is shipped to China. Developing Simandou in Guinea.'],
  ['astrazeneca', 'AstraZeneca PLC', ['AstraZeneca', 'AZN'], 'AZN.L', 'London Stock Exchange', 'GBP', 'AZN', 'GBR', 'country:GBR', 'Cambridge, UK', '1999', ['pharma'], 'Anglo-Swedish pharmaceutical company (oncology, cardiovascular, rare diseases).'],
  ['hsbc', 'HSBC Holdings plc', ['HSBC', 'HSBA'], 'HSBA.L', 'London Stock Exchange', 'GBP', 'HSBC', 'GBR', 'city:london', 'London, UK', '1865', ['banking'], 'Europe’s largest bank by assets, earning most of its profit in Asia (especially Hong Kong).'],
  ['unilever', 'Unilever PLC', ['Unilever', 'ULVR', 'UL'], 'ULVR.L', 'London Stock Exchange', 'GBP', 'UL', 'GBR', 'city:london', 'London, UK', '1929', ['consumer'], 'Consumer-goods group (Dove, Hellmann’s, Knorr); large buyer of palm oil and other agricultural inputs.'],
  ['bae-systems', 'BAE Systems plc', ['BAE Systems', 'BAE', 'BA.'], 'BA.L', 'London Stock Exchange', 'GBP', undefined, 'GBR', 'city:london', 'London, UK', '1999', ['defense'], 'Europe’s largest defense contractor: combat aircraft (Eurofighter, F-35 parts), submarines, armoured vehicles and munitions.'],
  ['santander', 'Banco Santander, S.A.', ['Santander', 'SAN'], 'SAN.MC', 'Bolsa de Madrid', 'EUR', 'SAN', 'ESP', 'country:ESP', 'Santander / Boadilla del Monte, Spain', '1857', ['banking'], 'Largest euro-area bank by customers; large operations in Brazil, Mexico, the UK and the US.'],
  ['inditex', 'Industria de Diseño Textil, S.A. (Inditex)', ['Inditex', 'Zara', 'ITX'], 'ITX.MC', 'Bolsa de Madrid', 'EUR', undefined, 'ESP', 'country:ESP', 'Arteixo, Spain', '1985', ['retail', 'consumer'], 'World’s largest fashion retailer (Zara, Massimo Dutti, Bershka).'],
  ['unicredit', 'UniCredit S.p.A.', ['UniCredit', 'UCG'], 'UCG.MI', 'Borsa Italiana', 'EUR', undefined, 'ITA', 'city:milan', 'Milan, Italy', '1998', ['banking'], 'Pan-European bank with large operations in Italy, Germany and Central & Eastern Europe.'],
  ['leonardo', 'Leonardo S.p.A.', ['Leonardo', 'LDO'], 'LDO.MI', 'Borsa Italiana', 'EUR', undefined, 'ITA', 'city:rome', 'Rome, Italy', '1948', ['defense'], 'Italian defense and aerospace group (helicopters, electronics, aerostructures); the Italian state is the largest shareholder.'],
  ['saab', 'Saab AB', ['Saab', 'SAAB-B'], 'SAAB-B.ST', 'Nasdaq Stockholm', 'SEK', undefined, 'SWE', 'city:stockholm', 'Stockholm, Sweden', '1937', ['defense'], 'Swedish defense company (Gripen fighter, Carl-Gustaf, sensors and submarines).'],
  ['equinor', 'Equinor ASA', ['Equinor', 'Statoil', 'EQNR'], 'EQNR.OL', 'Oslo Børs', 'NOK', 'EQNR', 'NOR', 'city:stavanger', 'Stavanger, Norway', '1972', ['oil-gas'], 'Norway’s majority state-owned energy company and Europe’s largest supplier of pipeline natural gas.'],
  ['maersk', 'A.P. Møller – Mærsk A/S', ['Maersk', 'Mærsk', 'MAERSK-B'], 'MAERSK-B.CO', 'Nasdaq Copenhagen', 'DKK', undefined, 'DNK', 'city:copenhagen', 'Copenhagen, Denmark', '1904', ['shipping'], 'One of the largest container-shipping and logistics groups; sensitive to Red Sea and Suez routing.'],
  // Asia-Pacific
  ['tencent', 'Tencent Holdings Ltd.', ['Tencent', '0700', 'WeChat'], '0700.HK', 'Hong Kong Stock Exchange', 'HKD', undefined, 'CHN', 'city:shenzhen', 'Shenzhen, China', '1998', ['internet'], 'Chinese internet group: WeChat/Weixin, online games, payments and cloud.'],
  ['alibaba', 'Alibaba Group Holding Ltd.', ['Alibaba', 'BABA', '9988'], '9988.HK', 'Hong Kong Stock Exchange', 'HKD', 'BABA', 'CHN', 'city:hangzhou', 'Hangzhou, China', '1999', ['internet', 'retail'], 'Chinese e-commerce (Taobao, Tmall), cloud computing and AI (Qwen models); also listed in New York as BABA.'],
  ['byd', 'BYD Company Ltd.', ['BYD', '1211'], '1211.HK', 'Hong Kong Stock Exchange', 'HKD', undefined, 'CHN', 'city:shenzhen', 'Shenzhen, China', '1995', ['automotive', 'industrials'], 'World’s largest seller of plug-in electric and hybrid vehicles; also makes batteries.'],
  ['catl', 'Contemporary Amperex Technology Co., Ltd. (CATL)', ['CATL', '300750'], '300750.SZ', 'Shenzhen Stock Exchange', 'CNY', undefined, 'CHN', 'country:CHN', 'Ningde, Fujian, China', '2011', ['industrials'], 'World’s largest maker of electric-vehicle and grid-storage batteries; major consumer of lithium, nickel and cobalt.'],
  ['icbc', 'Industrial and Commercial Bank of China', ['ICBC', '1398'], '1398.HK', 'Hong Kong Stock Exchange', 'HKD', undefined, 'CHN', 'city:beijing', 'Beijing, China', '1984', ['banking'], 'World’s largest bank by assets; majority state-owned.'],
  ['petrochina', 'PetroChina Company Ltd.', ['PetroChina', '0857'], '0857.HK', 'Hong Kong Stock Exchange', 'HKD', undefined, 'CHN', 'city:beijing', 'Beijing, China', '1999', ['oil-gas'], 'Listed arm of state-owned China National Petroleum Corporation; China’s largest oil and gas producer.'],
  ['sony', 'Sony Group Corporation', ['Sony', '6758'], '6758.T', 'Tokyo Stock Exchange', 'JPY', 'SONY', 'JPN', 'city:tokyo', 'Tokyo, Japan', '1946', ['technology', 'media'], 'Games (PlayStation), music, pictures and image sensors.'],
  ['mufg', 'Mitsubishi UFJ Financial Group', ['MUFG', '8306'], '8306.T', 'Tokyo Stock Exchange', 'JPY', 'MUFG', 'JPN', 'city:tokyo', 'Tokyo, Japan', '2005', ['banking'], 'Japan’s largest bank group; owns a large stake in Morgan Stanley.'],
  ['softbank', 'SoftBank Group Corp.', ['SoftBank', '9984'], '9984.T', 'Tokyo Stock Exchange', 'JPY', undefined, 'JPN', 'city:tokyo', 'Tokyo, Japan', '1981', ['technology', 'internet'], 'Technology investor (Vision Funds) and majority owner of chip designer Arm; a large investor in OpenAI.'],
  ['tokyo-electron', 'Tokyo Electron Ltd.', ['Tokyo Electron', 'TEL', '8035'], '8035.T', 'Tokyo Stock Exchange', 'JPY', undefined, 'JPN', 'city:tokyo', 'Tokyo, Japan', '1963', ['semiconductor-industry', 'industrials'], 'Japan’s largest maker of chip-making equipment (coaters/developers, etch, deposition).'],
  ['hitachi', 'Hitachi, Ltd.', ['Hitachi', '6501'], '6501.T', 'Tokyo Stock Exchange', 'JPY', undefined, 'JPN', 'city:tokyo', 'Tokyo, Japan', '1910', ['industrials', 'technology'], 'Industrial and IT group focused on power grids, rail and digital services.'],
  ['sk-hynix', 'SK hynix Inc.', ['SK hynix', 'Hynix', '000660'], '000660.KS', 'Korea Exchange', 'KRW', undefined, 'KOR', 'country:KOR', 'Icheon, South Korea', '1983', ['semiconductor-industry'], 'Memory-chip maker and leading supplier of high-bandwidth memory (HBM) for AI accelerators.'],
  ['hyundai-motor', 'Hyundai Motor Company', ['Hyundai', '005380'], '005380.KS', 'Korea Exchange', 'KRW', undefined, 'KOR', 'city:seoul', 'Seoul, South Korea', '1967', ['automotive'], 'South Korea’s largest automaker; with affiliate Kia, one of the world’s top three by volume.'],
  ['foxconn', 'Hon Hai Precision Industry Co., Ltd. (Foxconn)', ['Foxconn', 'Hon Hai', '2317'], '2317.TW', 'Taiwan Stock Exchange', 'TWD', undefined, 'TWN', 'country:TWN', 'New Taipei, Taiwan', '1974', ['technology', 'industrials'], 'World’s largest contract electronics manufacturer (iPhones, AI servers), with large plants in China, India, Vietnam and Mexico.'],
  ['mediatek', 'MediaTek Inc.', ['MediaTek', '2454'], '2454.TW', 'Taiwan Stock Exchange', 'TWD', undefined, 'TWN', 'city:hsinchu', 'Hsinchu, Taiwan', '1997', ['semiconductor-industry'], 'Fabless designer of smartphone and consumer-electronics chips.'],
  ['reliance', 'Reliance Industries Ltd.', ['Reliance', 'RELIANCE', 'Jio'], 'RELIANCE.NS', 'National Stock Exchange of India', 'INR', undefined, 'IND', 'city:mumbai', 'Mumbai, India', '1973', ['oil-gas', 'retail', 'media'], 'India’s largest company by revenue: oil refining (Jamnagar, the world’s largest refining complex), petrochemicals, Jio telecoms and retail.'],
  ['tcs', 'Tata Consultancy Services Ltd.', ['TCS', 'Tata Consultancy'], 'TCS.NS', 'National Stock Exchange of India', 'INR', undefined, 'IND', 'city:mumbai', 'Mumbai, India', '1968', ['technology'], 'India’s largest IT-services exporter; part of the Tata Group.'],
  ['infosys', 'Infosys Ltd.', ['Infosys', 'INFY'], 'INFY.NS', 'National Stock Exchange of India', 'INR', 'INFY', 'IND', 'city:bengaluru', 'Bengaluru, India', '1981', ['technology'], 'IT-services and consulting company.'],
  ['hdfc-bank', 'HDFC Bank Ltd.', ['HDFC Bank', 'HDFCBANK', 'HDB'], 'HDFCBANK.NS', 'National Stock Exchange of India', 'INR', 'HDB', 'IND', 'city:mumbai', 'Mumbai, India', '1994', ['banking'], 'India’s largest private-sector bank.'],
  ['bhp', 'BHP Group Ltd.', ['BHP', 'BHP Billiton'], 'BHP.AX', 'Australian Securities Exchange', 'AUD', 'BHP', 'AUS', 'city:melbourne', 'Melbourne, Australia', '1885', ['mining'], 'World’s largest listed miner: iron ore (Pilbara), copper (Escondida in Chile) and potash in development in Canada.'],
  ['commonwealth-bank', 'Commonwealth Bank of Australia', ['Commonwealth Bank', 'CBA'], 'CBA.AX', 'Australian Securities Exchange', 'AUD', undefined, 'AUS', 'city:sydney', 'Sydney, Australia', '1911', ['banking'], 'Australia’s largest bank.'],
  // Latin America, Africa & Middle East
  ['petrobras', 'Petróleo Brasileiro S.A. (Petrobras)', ['Petrobras', 'PETR4', 'PBR'], 'PETR4.SA', 'B3 (São Paulo)', 'BRL', 'PBR', 'BRA', 'city:rio-de-janeiro', 'Rio de Janeiro, Brazil', '1953', ['oil-gas'], 'Brazil’s state-controlled oil company; leading producer from deep-water pre-salt fields.'],
  ['vale', 'Vale S.A.', ['Vale', 'VALE3'], 'VALE3.SA', 'B3 (São Paulo)', 'BRL', 'VALE', 'BRA', 'city:rio-de-janeiro', 'Rio de Janeiro, Brazil', '1942', ['mining'], 'One of the two largest iron-ore producers (Carajás) and a major nickel producer.'],
  ['america-movil', 'América Móvil, S.A.B. de C.V.', ['America Movil', 'América Móvil', 'Telcel', 'Claro', 'AMX'], 'AMXB.MX', 'Bolsa Mexicana de Valores', 'MXN', 'AMX', 'MEX', 'city:mexico-city', 'Mexico City, Mexico', '2000', ['media'], 'Largest mobile operator in Latin America (Telcel, Claro); controlled by the Slim family.'],
  ['naspers', 'Naspers Ltd.', ['Naspers', 'NPN'], 'NPN.JO', 'Johannesburg Stock Exchange', 'ZAR', undefined, 'ZAF', 'city:cape-town', 'Cape Town, South Africa', '1915', ['internet'], 'Internet investor; through Prosus holds a large stake in Tencent.'],
  ['qatarenergy', 'QatarEnergy', ['Qatar Petroleum', 'QP'], '', '', '', undefined, 'QAT', 'city:doha', 'Doha, Qatar', '1974', ['oil-gas'], 'State-owned energy company of Qatar and one of the world’s largest LNG producers (North Field). Not listed — no public share price.'],
  ['adnoc', 'Abu Dhabi National Oil Company (ADNOC)', ['ADNOC'], '', '', '', undefined, 'ARE', 'city:abu-dhabi', 'Abu Dhabi, UAE', '1971', ['oil-gas'], 'State-owned oil company of Abu Dhabi; several subsidiaries are listed on the Abu Dhabi Securities Exchange, the parent is not.'],
];
for (const [slug, name, aliases, symbol, exchange, currency, sec, country, hq, hqCity, founded, industry, summary] of MORE) {
  COMPANIES.push({ slug, name, aliases, hq, country, founded, industry, summary, public: !!symbol, quoteSymbol: symbol || undefined, exchange: exchange || undefined, currency: currency || undefined, secTicker: sec, tickers: symbol ? [`${symbol.replace(/\.[A-Z]+$/, '')} (${exchange})`] : undefined, hqCity, ownership: symbol ? undefined : 'State-owned' });
}
for (const c of COMPANIES) {
  const facts: Fact[] = [f('Founded', c.founded, 'company-ir'), f('Ownership', c.public ? 'Publicly listed' : c.ownership === 'State-owned' ? 'State-owned (not listed)' : 'Private', 'company-ir')];
  if (c.hqCity) facts.unshift(f('Headquarters', c.hqCity, 'company-ir'));
  if (c.tickers) facts.push(f('Listings', c.tickers.join(' · '), 'company-ir'));
  if (c.segments) facts.push(f('Operating segments', c.segments, 'company-ir'));
  if (c.ownership) facts.push(f('Significant shareholders', c.ownership, c.slug === 'us-steel' ? 'nippon-steel' : 'company-ir'));
  if (!c.public) facts.push(f('Valuation', 'No verified valuation available', 'company-ir', { note: 'Private company — the app does not show estimates it cannot source.' }));
  const id = add({ id: `company:${c.slug}`, type: 'company', name: c.name, depth: 'curated', aliases: c.aliases, summary: c.summary, facts,
    attrs: { public: c.public, quoteSymbol: c.quoteSymbol, exchange: c.exchange, currency: c.currency, secTicker: c.secTicker, ir: c.ir, website: c.website, hqCountry: C(c.country) } });
  if (c.hq.startsWith('city:')) rel(id, 'headquartered_in', c.hq, { sourceId: 'company-ir' });
  else rel(id, 'headquartered_in', c.hq, { sourceId: 'company-ir' });
  for (const ind of c.industry) rel(id, 'in_industry', `industry:${ind}`, { sourceId: 'company-ir' });
  for (const iso of c.operatesIn || []) rel(id, 'operates_in', C(iso), { sourceId: 'company-ir' });
  if (c.leader) {
    const [slug, name, role, from] = c.leader;
    add({ id: `person:${slug}`, type: 'person', name, depth: 'curated', summary: `${role.split(' (')[0]} of ${c.name}.`, facts: [f('Current role', `${role} — ${c.name}`, 'company-ir')] });
    rel(`person:${slug}`, 'leads', id, { role: role.split(' (')[0], validFrom: from, sourceId: 'company-ir' });
  }
}
// Known staleness: flag rather than guess.
const cook = ents.find((x) => x.id === 'person:tim-cook');
if (cook) cook.summary = 'Chief Executive Officer of Apple Inc. as of the June 2026 verification. Late-October 2026 news coverage reports that John Ternus has been named Apple’s CEO — verify the current officeholder on Apple’s investor-relations site before relying on this.';

rel('company:us-steel', 'subsidiary_of', 'company:nippon-steel', { validFrom: '2025-06-18', sourceId: 'nippon-steel' });
rel('company:tsmc', 'supplies', 'company:apple', { sourceId: 'company-ir', note: 'Fabricates Apple-designed A- and M-series chips' });
rel('company:tsmc', 'supplies', 'company:nvidia', { sourceId: 'company-ir', note: 'Fabricates NVIDIA GPUs' });
rel('company:samsung-electronics', 'competitor_of', 'company:tsmc', { sourceId: 'company-ir', role: 'Foundry' });
rel('company:samsung-electronics', 'competitor_of', 'company:apple', { sourceId: 'company-ir', role: 'Smartphones' });
rel('company:exxonmobil', 'competitor_of', 'company:chevron', { sourceId: 'company-ir' });
rel('company:shell', 'competitor_of', 'company:bp', { sourceId: 'company-ir' });
rel('company:rheinmetall', 'competitor_of', 'company:lockheed-martin', { sourceId: 'company-ir', role: 'Defense' });
rel('company:bosch', 'supplies', 'company:toyota', { sourceId: 'company-ir', role: 'Automotive components' });
rel('company:microsoft', 'competitor_of', 'company:apple', { sourceId: 'company-ir', role: 'PCs & software' });

// ───────────────────────── Commodities, products & services ─────────────────────────
interface ComSpec { slug: string; name: string; aliases?: string[]; parent?: string; kind: 'hard' | 'soft' | 'product' | 'service' | 'benchmark'; summary: string; quoteSymbol?: string; unit?: string; exchange?: string; benchmark?: string; facts?: Fact[]; wbRankings?: string[]; hs?: string[]; }
const COMMODITIES: ComSpec[] = [
  { slug: 'crude-oil', name: 'Crude oil', aliases: ['Oil', 'Petroleum', 'Crude'], kind: 'hard', quoteSymbol: 'BZ=F', unit: 'USD per barrel', exchange: 'ICE / NYMEX', benchmark: 'Brent (front-month futures)', hs: ['27'],
    summary: 'The world’s most traded commodity. Priced off benchmark grades — Brent (North Sea, the international benchmark) and WTI (US). Supply is heavily influenced by OPEC+ policy; demand by China, the US and India. About one-fifth of global oil consumption transits the Strait of Hormuz.',
    facts: [f('Main benchmarks', 'Brent (ICE), WTI (NYMEX), Dubai/Oman (Asian sour crude)', 'eia'), f('Typical unit', 'US dollars per barrel (42 US gallons)', 'eia')], wbRankings: ['TX.VAL.FUEL.ZS.UN'] },
  { slug: 'brent', name: 'Brent crude', aliases: ['Brent', 'Brent Crude', 'BZ=F'], parent: 'commodity:crude-oil', kind: 'benchmark', quoteSymbol: 'BZ=F', unit: 'USD per barrel', exchange: 'NYMEX Brent futures (BZ) — tracks ICE Brent', benchmark: 'Front-month futures',
    summary: 'International crude benchmark based on North Sea grades (Brent, Forties, Oseberg, Ekofisk, Troll and, since 2023, US WTI Midland). Used to price roughly two-thirds of globally traded crude.' },
  { slug: 'wti', name: 'WTI crude', aliases: ['WTI', 'West Texas Intermediate', 'CL=F'], parent: 'commodity:crude-oil', kind: 'benchmark', quoteSymbol: 'CL=F', unit: 'USD per barrel', exchange: 'NYMEX (CME Group)', benchmark: 'Front-month futures',
    summary: 'US light sweet crude benchmark delivered at Cushing, Oklahoma.' },
  { slug: 'natural-gas', name: 'Natural gas', aliases: ['Gas', 'LNG', 'Henry Hub', 'NG=F'], kind: 'hard', quoteSymbol: 'NG=F', unit: 'USD per MMBtu', exchange: 'NYMEX', benchmark: 'Henry Hub front-month futures', hs: ['27'],
    summary: 'Used for power generation, heating and industry. Pipeline gas trades regionally (Henry Hub in the US, TTF in Europe); liquefied natural gas (LNG) links markets globally. The US is the largest producer and LNG exporter.' },
  { slug: 'gold', name: 'Gold', aliases: ['XAU', 'GC=F'], kind: 'hard', quoteSymbol: 'GC=F', unit: 'USD per troy ounce', exchange: 'COMEX', benchmark: 'Front-month futures', hs: ['71'],
    summary: 'Monetary and precious metal held by central banks and investors as a reserve asset and hedge; also used in jewellery and electronics.' },
  { slug: 'copper', name: 'Copper', aliases: ['HG=F', 'Dr. Copper'], kind: 'hard', quoteSymbol: 'HG=F', unit: 'USD per pound', exchange: 'COMEX', benchmark: 'Front-month futures', hs: ['74'],
    summary: 'Industrial metal essential to electrical wiring, power grids, EVs and construction; often treated as a barometer of global industrial activity.' },
  { slug: 'iron-ore', name: 'Iron ore', aliases: ['Iron', 'TIO=F'], kind: 'hard', hs: ['26'], quoteSymbol: 'TIO=F', unit: 'USD per dry metric tonne', exchange: 'COMEX (CME Group)', benchmark: 'Iron Ore 62% Fe, CFR China (TSI) front-month futures',
    summary: 'Primary raw material for steel. Seaborne trade is dominated by Australian and Brazilian exports to China, so Chinese steel output and property construction drive prices.' },
  { slug: 'uranium', name: 'Uranium', aliases: ['U3O8', 'Yellowcake', 'UX=F'], kind: 'hard', quoteSymbol: 'UX=F', unit: 'USD per lb U3O8', exchange: 'COMEX (CME Group)', benchmark: 'UxC uranium U3O8 front-month futures',
    summary: 'Fuel for nuclear power reactors. Kazakhstan supplies roughly 40% of mined output. The futures contract shown trades thinly, so its last price can be days old — check the quote time; most physical uranium is sold on long-term contracts.' },
  { slug: 'wheat', name: 'Wheat', aliases: ['ZW=F'], kind: 'soft', quoteSymbol: 'ZW=F', unit: 'US cents per bushel', exchange: 'CBOT (CME Group)', benchmark: 'Soft red winter wheat front-month futures', hs: ['10'],
    summary: 'Staple food grain. Russia is the largest exporter; the Black Sea region is a key supply route.' },
  { slug: 'corn', name: 'Corn (maize)', aliases: ['Corn', 'Maize', 'ZC=F'], kind: 'soft', quoteSymbol: 'ZC=F', unit: 'US cents per bushel', exchange: 'CBOT (CME Group)', benchmark: 'Front-month futures', hs: ['10'],
    summary: 'Most-produced grain globally, used for animal feed, ethanol and food. The US is the largest producer and exporter.' },
  { slug: 'soybeans', name: 'Soybeans', aliases: ['Soy', 'Soya', 'ZS=F'], kind: 'soft', quoteSymbol: 'ZS=F', unit: 'US cents per bushel', exchange: 'CBOT (CME Group)', benchmark: 'Front-month futures', hs: ['12'],
    summary: 'Oilseed crushed into meal (animal feed) and oil. Brazil and the US dominate exports; China is by far the largest importer, making the crop sensitive to US–China trade policy.' },
  { slug: 'coffee', name: 'Coffee', aliases: ['Arabica', 'KC=F'], kind: 'soft', quoteSymbol: 'KC=F', unit: 'US cents per pound', exchange: 'ICE Futures US', benchmark: 'Arabica “C” front-month futures', hs: ['09'],
    summary: 'Tropical cash crop; Brazil leads Arabica output and Vietnam leads Robusta.' },
  { slug: 'cocoa', name: 'Cocoa', aliases: ['CC=F', 'Cacao'], kind: 'soft', quoteSymbol: 'CC=F', unit: 'USD per metric ton', exchange: 'ICE Futures US', benchmark: 'Front-month futures', hs: ['18'],
    summary: 'Key chocolate input; Côte d’Ivoire and Ghana together grow well over half the world’s cocoa, so West African weather and crop disease drive prices.' },
  { slug: 'sugar', name: 'Sugar', aliases: ['SB=F', 'Raw sugar'], kind: 'soft', quoteSymbol: 'SB=F', unit: 'US cents per pound', exchange: 'ICE Futures US', benchmark: 'Raw sugar No. 11 front-month futures', hs: ['17'],
    summary: 'Produced from sugarcane and sugar beet; Brazil is the largest producer and exporter, followed by India.' },
  { slug: 'semiconductors', name: 'Semiconductors', aliases: ['Chips', 'Microchips', 'Integrated circuits'], kind: 'product', hs: ['85'],
    summary: 'Integrated circuits underpin all electronics. Leading-edge logic manufacturing is concentrated in Taiwan (TSMC); memory in South Korea; design in the United States; key equipment in the Netherlands, Japan and the US. Subject to US export controls on advanced chips to China.' },
  { slug: 'automobiles', name: 'Automobiles', aliases: ['Cars', 'Vehicles', 'Autos'], kind: 'product', hs: ['87'],
    summary: 'Passenger and commercial vehicles. China is by far the largest producer and, since 2023, the largest exporter; tariffs and EV subsidies are central trade-policy issues.' },
  { slug: 'tourism', name: 'International tourism', aliases: ['Tourism', 'Travel'], kind: 'service',
    summary: 'Cross-border travel spending is a major services export for destination countries. Rankings below come live from World Bank data on international arrivals and receipts.', wbRankings: ['ST.INT.ARVL', 'ST.INT.RCPT.CD'] },
  // Energy products
  { slug: 'heating-oil', name: 'Heating oil / diesel', aliases: ['Heating oil', 'ULSD', 'Diesel', 'HO=F'], parent: 'commodity:crude-oil', kind: 'benchmark', quoteSymbol: 'HO=F', unit: 'USD per gallon', exchange: 'NYMEX (CME Group)', benchmark: 'NY Harbor ULSD front-month futures',
    summary: 'US benchmark for diesel and heating oil (ultra-low-sulphur diesel delivered in New York Harbor); the gap to crude is the distillate “crack spread”.' },
  { slug: 'gasoline', name: 'Gasoline (RBOB)', aliases: ['Gasoline', 'Petrol', 'RBOB', 'RB=F'], parent: 'commodity:crude-oil', kind: 'benchmark', quoteSymbol: 'RB=F', unit: 'USD per gallon', exchange: 'NYMEX (CME Group)', benchmark: 'RBOB gasoline front-month futures',
    summary: 'US wholesale gasoline benchmark (New York Harbor reformulated blendstock).' },
  { slug: 'ttf-gas', name: 'European natural gas (TTF)', aliases: ['TTF', 'Dutch TTF', 'European gas', 'TTF=F'], parent: 'commodity:natural-gas', kind: 'benchmark', quoteSymbol: 'TTF=F', unit: 'EUR per MWh', exchange: 'ICE Endex', benchmark: 'Dutch TTF front-month futures',
    summary: 'Main European gas price, set at the Dutch Title Transfer Facility. Europe relies on LNG imports since Russian pipeline flows collapsed in 2022, so TTF links to Asian LNG demand.' },
  { slug: 'coal', name: 'Coal', aliases: ['Thermal coal', 'API2', 'MTF=F'], kind: 'hard', quoteSymbol: 'MTF=F', unit: 'USD per tonne', exchange: 'ICE', benchmark: 'API2 Rotterdam (CIF ARA) front-month futures', hs: ['27'],
    summary: 'Still the largest source of electricity worldwide. China burns over half of the world’s coal; Indonesia and Australia are the largest exporters. The API2 contract shown is the European import benchmark and trades thinly.' },
  // Precious & industrial metals
  { slug: 'silver', name: 'Silver', aliases: ['XAG', 'SI=F'], kind: 'hard', quoteSymbol: 'SI=F', unit: 'USD per troy ounce', exchange: 'COMEX (CME Group)', benchmark: 'Front-month futures', hs: ['71'],
    summary: 'Precious and industrial metal (solar panels, electronics, jewellery). Most silver is mined as a by-product of lead, zinc, copper and gold.' },
  { slug: 'platinum', name: 'Platinum', aliases: ['XPT', 'PL=F'], kind: 'hard', quoteSymbol: 'PL=F', unit: 'USD per troy ounce', exchange: 'NYMEX (CME Group)', benchmark: 'Front-month futures', hs: ['71'],
    summary: 'Used in vehicle catalytic converters (especially diesel), jewellery, chemicals and hydrogen fuel cells. Supply is concentrated in South Africa’s Bushveld Complex.' },
  { slug: 'palladium', name: 'Palladium', aliases: ['XPD', 'PA=F'], kind: 'hard', quoteSymbol: 'PA=F', unit: 'USD per troy ounce', exchange: 'NYMEX (CME Group)', benchmark: 'Front-month futures', hs: ['71'],
    summary: 'Mainly used in gasoline-engine catalytic converters. Russia (Nornickel) and South Africa dominate supply.' },
  { slug: 'aluminium', name: 'Aluminium', aliases: ['Aluminum', 'ALI=F'], kind: 'hard', quoteSymbol: 'ALI=F', unit: 'USD per metric ton', exchange: 'COMEX (CME Group)', benchmark: 'Front-month futures', hs: ['76'],
    summary: 'Light metal used in transport, packaging, construction and power lines. Smelting is very electricity-intensive; China produces well over half of the world’s supply.' },
  { slug: 'nickel', name: 'Nickel', aliases: ['Ni'], kind: 'hard', unit: 'USD per metric ton', hs: ['75'],
    summary: 'Used in stainless steel and EV batteries. Indonesia’s rapid build-out of nickel processing has made it the dominant producer. No openly licensed price feed is connected (the LME benchmark requires a licence).' },
  { slug: 'cobalt', name: 'Cobalt', aliases: ['Co'], kind: 'hard', unit: 'USD per metric ton', hs: ['81'],
    summary: 'Battery and superalloy metal; the Democratic Republic of the Congo supplies around three-quarters of mined output, much of it refined in China. No openly licensed price feed is connected.' },
  { slug: 'lithium', name: 'Lithium', aliases: ['Li', 'Lithium carbonate'], kind: 'hard', unit: 'USD per metric ton (carbonate)', hs: ['28'],
    summary: 'Key battery metal, mined from hard rock in Australia and from brines in Chile and Argentina; China dominates refining. No openly licensed price feed is connected.' },
  { slug: 'rare-earths', name: 'Rare-earth elements', aliases: ['Rare earths', 'REE', 'Neodymium'], kind: 'hard', unit: 'varies by element', hs: ['28'],
    summary: 'Seventeen elements used in permanent magnets (EV motors, wind turbines, defense systems). China dominates mining and especially separation and magnet production, and has restricted exports. Prices are not openly published.' },
  // Agriculture & livestock
  { slug: 'rice', name: 'Rice', aliases: ['Rough rice', 'ZR=F'], kind: 'soft', quoteSymbol: 'ZR=F', unit: 'USD per hundredweight', exchange: 'CBOT (CME Group)', benchmark: 'Rough rice front-month futures', hs: ['10'],
    summary: 'Staple food for over half the world’s population. Most rice is eaten where it is grown; India is the largest exporter, so Indian export policy moves world prices. The CBOT contract reflects US rough rice.' },
  { slug: 'cotton', name: 'Cotton', aliases: ['CT=F'], kind: 'soft', quoteSymbol: 'CT=F', unit: 'US cents per pound', exchange: 'ICE Futures US', benchmark: 'Cotton No. 2 front-month futures', hs: ['52'],
    summary: 'Main natural textile fibre. China and India are the largest growers; Brazil, the US and Australia are the largest exporters.' },
  { slug: 'soybean-oil', name: 'Soybean oil', aliases: ['ZL=F', 'Soyoil'], parent: 'commodity:soybeans', kind: 'benchmark', quoteSymbol: 'ZL=F', unit: 'US cents per pound', exchange: 'CBOT (CME Group)', benchmark: 'Front-month futures',
    summary: 'Cooking oil and a growing feedstock for renewable diesel, which ties its price to US biofuel policy.' },
  { slug: 'soybean-meal', name: 'Soybean meal', aliases: ['ZM=F', 'Soymeal'], parent: 'commodity:soybeans', kind: 'benchmark', quoteSymbol: 'ZM=F', unit: 'USD per short ton', exchange: 'CBOT (CME Group)', benchmark: 'Front-month futures',
    summary: 'High-protein animal feed produced by crushing soybeans.' },
  { slug: 'hrw-wheat', name: 'Hard red winter wheat', aliases: ['KC wheat', 'HRW wheat', 'KE=F'], parent: 'commodity:wheat', kind: 'benchmark', quoteSymbol: 'KE=F', unit: 'US cents per bushel', exchange: 'KCBT (CME Group)', benchmark: 'Front-month futures',
    summary: 'Higher-protein bread wheat grown on the US Great Plains (Kansas City contract).' },
  { slug: 'oats', name: 'Oats', aliases: ['ZO=F'], kind: 'soft', quoteSymbol: 'ZO=F', unit: 'US cents per bushel', exchange: 'CBOT (CME Group)', benchmark: 'Front-month futures', hs: ['10'],
    summary: 'Feed and food grain; a small, thinly traded futures market.' },
  { slug: 'orange-juice', name: 'Orange juice', aliases: ['FCOJ', 'OJ=F'], kind: 'soft', quoteSymbol: 'OJ=F', unit: 'US cents per pound', exchange: 'ICE Futures US', benchmark: 'Frozen concentrated orange juice front-month futures', hs: ['20'],
    summary: 'Brazil supplies most of the world’s orange-juice exports; Florida output has collapsed because of citrus greening disease and hurricanes.' },
  { slug: 'lumber', name: 'Lumber', aliases: ['Timber', 'LBR=F'], kind: 'soft', quoteSymbol: 'LBR=F', unit: 'USD per 1,000 board feet', exchange: 'CME Group', benchmark: 'Front-month futures', hs: ['44'],
    summary: 'Softwood lumber used mainly in North American home building; prices track US housing starts and US–Canada softwood-lumber duties.' },
  { slug: 'cattle', name: 'Live cattle', aliases: ['Cattle', 'Beef', 'LE=F'], kind: 'soft', quoteSymbol: 'LE=F', unit: 'US cents per pound', exchange: 'CME Group', benchmark: 'Live cattle front-month futures', hs: ['02'],
    summary: 'US benchmark for slaughter-ready cattle, a proxy for beef prices. The US, Brazil and China are the largest beef producers; Brazil is the largest exporter.' },
  { slug: 'feeder-cattle', name: 'Feeder cattle', aliases: ['GF=F'], parent: 'commodity:cattle', kind: 'benchmark', quoteSymbol: 'GF=F', unit: 'US cents per pound', exchange: 'CME Group', benchmark: 'Front-month futures',
    summary: 'Young cattle sold to feedlots; prices depend on corn feed costs and herd size.' },
  { slug: 'lean-hogs', name: 'Lean hogs', aliases: ['Hogs', 'Pork', 'HE=F'], kind: 'soft', quoteSymbol: 'HE=F', unit: 'US cents per pound', exchange: 'CME Group', benchmark: 'Front-month futures', hs: ['02'],
    summary: 'US hog price benchmark. China produces and eats about half of the world’s pork.' },
  { slug: 'milk', name: 'Milk (Class III)', aliases: ['Dairy', 'DC=F'], kind: 'soft', quoteSymbol: 'DC=F', unit: 'USD per hundredweight', exchange: 'CME Group', benchmark: 'Class III milk front-month futures', hs: ['04'],
    summary: 'US price for milk used to make cheese.' },
];
const COMMODITY_GROUP: Record<string, string> = {
  'crude-oil': 'Energy', brent: 'Energy', wti: 'Energy', 'natural-gas': 'Energy', 'ttf-gas': 'Energy', 'heating-oil': 'Energy', gasoline: 'Energy', coal: 'Energy', uranium: 'Energy',
  gold: 'Precious metals', silver: 'Precious metals', platinum: 'Precious metals', palladium: 'Precious metals',
  copper: 'Industrial metals', aluminium: 'Industrial metals', 'iron-ore': 'Industrial metals', nickel: 'Industrial metals', cobalt: 'Industrial metals', lithium: 'Industrial metals', 'rare-earths': 'Industrial metals',
  wheat: 'Grains & oilseeds', 'hrw-wheat': 'Grains & oilseeds', corn: 'Grains & oilseeds', soybeans: 'Grains & oilseeds', 'soybean-oil': 'Grains & oilseeds', 'soybean-meal': 'Grains & oilseeds', rice: 'Grains & oilseeds', oats: 'Grains & oilseeds',
  coffee: 'Softs', cocoa: 'Softs', sugar: 'Softs', cotton: 'Softs', 'orange-juice': 'Softs', lumber: 'Softs',
  cattle: 'Livestock & dairy', 'feeder-cattle': 'Livestock & dairy', 'lean-hogs': 'Livestock & dairy', milk: 'Livestock & dairy',
};
for (const c of COMMODITIES) {
  const facts: Fact[] = [...(c.facts || [])];
  if (c.unit) facts.push(f('Unit', c.unit, c.slug === 'crude-oil' ? 'eia' : 'company-ir', { quality: 'official' }));
  if (c.exchange) facts.push(f('Exchange', c.exchange, 'yahoo-finance', { quality: 'official' }));
  if (c.benchmark) facts.push(f('Contract shown', c.benchmark, 'yahoo-finance', { quality: 'official' }));
  add({ id: `commodity:${c.slug}`, type: 'commodity', name: c.name, depth: 'curated', aliases: c.aliases, parentId: c.parent, summary: c.summary, facts,
    attrs: { kind: c.kind, quoteSymbol: c.quoteSymbol, unit: c.unit, wbRankings: c.wbRankings, hs: c.hs, group: COMMODITY_GROUP[c.slug] || (c.kind === 'product' || c.kind === 'service' ? 'Products & services' : 'Other'), benchmark: c.benchmark } });
}

// Producers / exporters / importers. Ranks only where the cited source ranks them.
function ranked(commodity: string, type: RelType, list: string[], sourceId: string, rankedCount: number, period: string) {
  list.forEach((iso, i) => rel(C(iso), type, `commodity:${commodity}`, { rank: i < rankedCount ? i + 1 : undefined, sourceId, note: i < rankedCount ? `Rank ${i + 1}, ${period}` : `Major ${type === 'produces' ? 'producer' : type === 'exports' ? 'exporter' : type === 'imports' ? 'importer' : 'participant'}, ${period}` }));
}
ranked('crude-oil', 'produces', ['USA', 'SAU', 'RUS', 'CAN', 'CHN', 'IRQ', 'ARE', 'BRA', 'IRN', 'KWT'], 'eia', 5, 'total petroleum & other liquids, 2023');
ranked('crude-oil', 'exports', ['SAU', 'RUS', 'IRQ', 'CAN', 'USA', 'ARE', 'NOR', 'KWT'], 'eia', 0, '2023');
ranked('crude-oil', 'imports', ['CHN', 'USA', 'IND', 'KOR', 'JPN', 'DEU'], 'eia', 1, '2023');
ranked('natural-gas', 'produces', ['USA', 'RUS', 'IRN', 'CHN', 'CAN', 'QAT', 'AUS', 'NOR'], 'eia', 2, '2023');
ranked('natural-gas', 'exports', ['USA', 'QAT', 'AUS', 'RUS', 'NOR'], 'eia', 0, 'LNG & pipeline, 2023–24');
ranked('gold', 'produces', ['CHN', 'RUS', 'AUS', 'CAN', 'USA', 'GHA'], 'usgs', 1, 'mine production, 2024 (USGS estimate)');
ranked('copper', 'produces', ['CHL', 'COD', 'PER', 'CHN', 'IDN', 'USA'], 'usgs', 3, 'mine production, 2024 (USGS estimate)');
ranked('iron-ore', 'produces', ['AUS', 'BRA', 'CHN', 'IND', 'RUS'], 'usgs', 2, 'usable ore, 2024 (USGS estimate)');
ranked('iron-ore', 'imports', ['CHN', 'JPN', 'KOR'], 'usgs', 1, '2024');
ranked('uranium', 'produces', ['KAZ', 'CAN', 'NAM', 'AUS', 'UZB'], 'wna', 1, 'mine production, 2022–23');
ranked('wheat', 'produces', ['CHN', 'IND', 'RUS', 'USA', 'CAN', 'AUS', 'UKR'], 'usda-fas', 2, 'marketing year 2024/25 (EU counted as a bloc separately)');
ranked('wheat', 'exports', ['RUS', 'CAN', 'AUS', 'USA', 'UKR', 'ARG'], 'usda-fas', 1, '2024/25');
ranked('corn', 'produces', ['USA', 'CHN', 'BRA', 'ARG', 'UKR', 'IND'], 'usda-fas', 2, '2024/25');
ranked('corn', 'exports', ['USA', 'BRA', 'ARG', 'UKR'], 'usda-fas', 1, '2024/25');
ranked('soybeans', 'produces', ['BRA', 'USA', 'ARG', 'CHN', 'IND'], 'usda-fas', 3, '2024/25');
ranked('soybeans', 'exports', ['BRA', 'USA', 'ARG', 'PRY'], 'usda-fas', 2, '2024/25');
ranked('soybeans', 'imports', ['CHN', 'ARG', 'MEX'], 'usda-fas', 1, '2024/25');
ranked('coffee', 'produces', ['BRA', 'VNM', 'COL', 'IDN', 'ETH', 'HND'], 'usda-fas', 2, '2024/25');
ranked('cocoa', 'produces', ['CIV', 'GHA', 'ECU', 'CMR', 'NGA', 'IDN'], 'icco', 2, '2023/24');
ranked('sugar', 'produces', ['BRA', 'IND', 'THA', 'CHN'], 'usda-fas', 2, '2024/25');
ranked('semiconductors', 'produces', ['TWN', 'KOR', 'CHN', 'JPN', 'USA', 'NLD'], 'sia', 0, 'fabrication & key equipment');
ranked('automobiles', 'produces', ['CHN', 'USA', 'JPN', 'IND', 'KOR', 'DEU', 'MEX'], 'oica', 1, 'motor-vehicle production, 2024');
ranked('tourism', 'exports', ['FRA', 'ESP', 'USA', 'ITA', 'TUR', 'MEX'], 'un-tourism', 0, 'leading destinations by arrivals');
ranked('silver', 'produces', ['MEX', 'CHN', 'PER', 'BOL', 'CHL', 'POL', 'RUS'], 'usgs', 1, 'mine production, 2024 (USGS estimate)');
ranked('platinum', 'produces', ['ZAF', 'RUS', 'ZWE', 'CAN', 'USA'], 'usgs', 2, 'mine production, 2024 (USGS estimate)');
ranked('palladium', 'produces', ['RUS', 'ZAF', 'CAN', 'USA', 'ZWE'], 'usgs', 2, 'mine production, 2024 (USGS estimate)');
ranked('aluminium', 'produces', ['CHN', 'IND', 'RUS', 'CAN', 'ARE', 'BHR', 'AUS', 'NOR'], 'usgs', 1, 'smelter production, 2024 (USGS estimate)');
ranked('nickel', 'produces', ['IDN', 'PHL', 'RUS', 'CAN', 'CHN', 'AUS'], 'usgs', 2, 'mine production, 2024 (USGS estimate)');
ranked('cobalt', 'produces', ['COD', 'IDN', 'RUS', 'AUS', 'PHL'], 'usgs', 2, 'mine production, 2024 (USGS estimate)');
ranked('lithium', 'produces', ['AUS', 'CHL', 'CHN', 'ZWE', 'ARG', 'BRA'], 'usgs', 1, 'mine production, 2024 (USGS estimate)');
ranked('rare-earths', 'produces', ['CHN', 'USA', 'MMR', 'AUS', 'THA', 'NGA'], 'usgs', 1, 'mine production, 2024 (USGS estimate)');
ranked('coal', 'produces', ['CHN', 'IND', 'IDN', 'USA', 'AUS', 'RUS'], 'eia', 2, '2023');
ranked('coal', 'exports', ['IDN', 'AUS', 'RUS', 'USA', 'ZAF', 'COL'], 'eia', 1, '2023');
ranked('cotton', 'produces', ['CHN', 'IND', 'BRA', 'USA', 'PAK', 'AUS'], 'usda-fas', 1, '2024/25');
ranked('cotton', 'exports', ['BRA', 'USA', 'AUS'], 'usda-fas', 0, '2024/25');
ranked('rice', 'produces', ['CHN', 'IND', 'BGD', 'IDN', 'VNM', 'THA'], 'usda-fas', 0, '2024/25');
ranked('rice', 'exports', ['IND', 'VNM', 'THA', 'PAK'], 'usda-fas', 1, '2024/25');
ranked('cattle', 'produces', ['USA', 'BRA', 'CHN', 'ARG', 'AUS'], 'usda-fas', 0, 'beef production, 2024');
ranked('cattle', 'exports', ['BRA', 'AUS', 'USA', 'IND', 'ARG'], 'usda-fas', 1, 'beef & veal exports, 2024');
ranked('lean-hogs', 'produces', ['CHN', 'USA', 'BRA', 'RUS', 'VNM'], 'usda-fas', 1, 'pork production, 2024 (EU counted as a bloc separately)');
ranked('orange-juice', 'produces', ['BRA', 'USA', 'MEX'], 'usda-fas', 1, 'orange juice, 2024/25');
rel('state:US-PA', 'produces', 'commodity:natural-gas', { rank: 2, sourceId: 'eia-states', note: 'Rank 2 among US states (Marcellus & Utica shale)' });
rel('state:US-TX', 'produces', 'commodity:crude-oil', { rank: 1, sourceId: 'eia-states', note: 'Rank 1 among US states' });
rel('state:US-TX', 'produces', 'commodity:natural-gas', { rank: 1, sourceId: 'eia-states', note: 'Rank 1 among US states' });

// Company ↔ commodity
for (const co of ['aramco', 'exxonmobil', 'chevron', 'shell', 'totalenergies', 'bp']) {
  rel(`company:${co}`, 'produces', 'commodity:crude-oil', { sourceId: 'company-ir' });
  rel(`company:${co}`, 'produces', 'commodity:natural-gas', { sourceId: 'company-ir' });
}
rel('company:vitol', 'uses', 'commodity:crude-oil', { sourceId: 'company-ir', role: 'Trades crude oil and products' });
for (const c of ['wheat', 'corn', 'soybeans', 'cocoa']) rel('company:cargill', 'uses', `commodity:${c}`, { sourceId: 'company-ir', role: 'Originates, processes and trades' });
rel('company:tsmc', 'produces', 'commodity:semiconductors', { sourceId: 'company-ir' });
rel('company:samsung-electronics', 'produces', 'commodity:semiconductors', { sourceId: 'company-ir' });
rel('company:nvidia', 'uses', 'commodity:semiconductors', { sourceId: 'company-ir', role: 'Designs chips (fabless)' });
rel('company:apple', 'uses', 'commodity:semiconductors', { sourceId: 'company-ir', role: 'Designs in-house chips; key component input' });
rel('company:toyota', 'produces', 'commodity:automobiles', { sourceId: 'company-ir' });
rel('company:bosch', 'uses', 'commodity:semiconductors', { sourceId: 'company-ir' });
rel('company:hershey', 'uses', 'commodity:cocoa', { sourceId: 'company-ir' });
rel('company:hershey', 'uses', 'commodity:sugar', { sourceId: 'company-ir' });
rel('company:us-steel', 'uses', 'commodity:iron-ore', { sourceId: 'company-ir' });
rel('company:nippon-steel', 'uses', 'commodity:iron-ore', { sourceId: 'company-ir' });
rel('company:ppg', 'uses', 'commodity:natural-gas', { sourceId: 'company-ir', role: 'Energy & petrochemical feedstock input' });
for (const [co, com] of [['conocophillips', 'crude-oil'], ['conocophillips', 'natural-gas'], ['equinor', 'crude-oil'], ['equinor', 'natural-gas'], ['petrobras', 'crude-oil'], ['petrochina', 'crude-oil'], ['petrochina', 'natural-gas'],
  ['qatarenergy', 'natural-gas'], ['adnoc', 'crude-oil'], ['freeport-mcmoran', 'copper'], ['freeport-mcmoran', 'gold'], ['newmont', 'gold'], ['bhp', 'iron-ore'], ['bhp', 'copper'], ['rio-tinto', 'iron-ore'],
  ['rio-tinto', 'copper'], ['rio-tinto', 'aluminium'], ['vale', 'iron-ore'], ['vale', 'nickel'], ['glencore', 'copper'], ['glencore', 'cobalt'], ['glencore', 'coal'], ['tesla', 'automobiles'], ['byd', 'automobiles'],
  ['volkswagen', 'automobiles'], ['general-motors', 'automobiles'], ['ford', 'automobiles'], ['mercedes-benz', 'automobiles'], ['bmw', 'automobiles'], ['hyundai-motor', 'automobiles'],
  ['intel', 'semiconductors'], ['micron', 'semiconductors'], ['sk-hynix', 'semiconductors'], ['amd', 'semiconductors'], ['broadcom', 'semiconductors'], ['qualcomm', 'semiconductors'], ['mediatek', 'semiconductors']] as [string, string][])
  rel(`company:${co}`, ['amd', 'broadcom', 'qualcomm', 'mediatek'].includes(co) ? 'uses' : 'produces', `commodity:${com}`, { sourceId: 'company-ir', role: ['amd', 'broadcom', 'qualcomm', 'mediatek'].includes(co) ? 'Designs chips (fabless)' : undefined });
for (const [co, com] of [['catl', 'lithium'], ['catl', 'nickel'], ['catl', 'cobalt'], ['tesla', 'lithium'], ['byd', 'lithium'], ['coca-cola', 'sugar'], ['nestle', 'coffee'], ['nestle', 'cocoa'], ['adm', 'soybeans'], ['adm', 'corn'],
  ['unilever', 'soybeans'], ['boeing', 'aluminium'], ['airbus', 'aluminium']] as [string, string][]) rel(`company:${co}`, 'uses', `commodity:${com}`, { sourceId: 'company-ir' });
for (const [a, b, note] of [['asml', 'tsmc', 'EUV lithography systems'], ['asml', 'samsung-electronics', 'Lithography systems'], ['asml', 'intel', 'Lithography systems'], ['applied-materials', 'tsmc', 'Chip-making equipment'], ['tokyo-electron', 'tsmc', 'Chip-making equipment'],
  ['foxconn', 'apple', 'Assembles iPhones'], ['foxconn', 'nvidia', 'Builds AI servers'], ['sk-hynix', 'nvidia', 'High-bandwidth memory'], ['catl', 'tesla', 'Batteries'], ['broadcom', 'apple', 'Wireless and connectivity chips']] as [string, string, string][])
  rel(`company:${a}`, 'supplies', `company:${b}`, { sourceId: 'company-ir', note });
for (const [a, b, role] of [['amd', 'nvidia', 'AI accelerators'], ['amd', 'intel', 'PC & server CPUs'], ['airbus', 'boeing', 'Commercial aircraft'], ['visa', 'mastercard', 'Card networks'], ['tesla', 'byd', 'Electric vehicles'], ['bhp', 'rio-tinto', 'Iron ore'], ['vale', 'rio-tinto', 'Iron ore'],
  ['jpmorgan', 'bank-of-america', 'US banking'], ['alibaba', 'amazon', 'E-commerce & cloud'], ['novo-nordisk', 'eli-lilly', 'Obesity & diabetes drugs'], ['sk-hynix', 'micron', 'Memory chips'], ['bae-systems', 'rheinmetall', 'Defense'], ['saab', 'lockheed-martin', 'Fighter aircraft']] as [string, string, string][])
  rel(`company:${a}`, 'competitor_of', `company:${b}`, { sourceId: 'company-ir', role });
rel('igo:opec', 'affects', 'commodity:crude-oil', { sourceId: 'opec', role: 'Coordinates member production quotas' });
rel('igo:opec-plus', 'affects', 'commodity:crude-oil', { sourceId: 'opec', role: 'Sets alliance-wide production targets' });

// ───────────────────────── Events & catalysts (objective information only) ─────────────────────────
interface EvSpec { slug: string; name: string; date: string; endDate?: string; category: string; status: 'scheduled' | 'completed' | 'outcome-not-recorded'; summary: string; location?: string; sourceId: string; affects: string[]; aliases?: string[]; outcome?: string; }
const EVENTS: EvSpec[] = [
  { slug: 'us-midterms-2026', name: '2026 US midterm elections', aliases: ['Midterms', 'US midterms'], date: '2026-11-03', category: 'election', status: 'scheduled', sourceId: 'congress', location: 'United States',
    summary: 'All 435 House seats, 35 Senate seats and 36 governorships are on the ballot. Control of Congress for 2027–2028 is at stake; Republicans currently hold narrow majorities in both chambers.',
    affects: ['country:USA', 'party:us-republican', 'party:us-democratic', 'person:donald-trump', 'person:mike-johnson', 'person:chuck-schumer', 'person:hakeem-jeffries', 'state:US-PA'] },
  { slug: 'pa-governor-2026', name: '2026 Pennsylvania gubernatorial election', aliases: ['PA governor race'], date: '2026-11-03', category: 'election', status: 'scheduled', sourceId: 'pa-dos', location: 'Pennsylvania',
    summary: 'Incumbent Democrat Josh Shapiro seeks a second term; Republican State Treasurer Stacy Garrity is the leading challenger. Pennsylvania is a key bellwether ahead of 2028.',
    affects: ['state:US-PA', 'person:josh-shapiro', 'person:stacy-garrity', 'party:us-democratic', 'party:us-republican'] },
  { slug: 'fomc-2026-12', name: 'FOMC meeting — December 2026', aliases: ['Fed meeting December', 'FOMC December'], date: '2026-12-08', endDate: '2026-12-09', category: 'central-bank', status: 'scheduled', sourceId: 'fed-fomc', location: 'Washington, D.C.',
    summary: 'Scheduled Federal Open Market Committee meeting with a Summary of Economic Projections. Sets the target range for the federal funds rate.',
    affects: ['country:USA', 'commodity:gold', 'company:pnc'] },
  { slug: 'fomc-2026-10', name: 'FOMC meeting — October 2026', date: '2026-10-27', endDate: '2026-10-28', category: 'central-bank', status: 'outcome-not-recorded', sourceId: 'fed-fomc', location: 'Washington, D.C.',
    summary: 'Scheduled Federal Open Market Committee meeting. The decision is not yet recorded in this dataset — see the Federal Reserve statement.', affects: ['country:USA'] },
  { slug: 'g20-summit-2026', name: 'G20 Leaders’ Summit 2026 (US presidency)', date: '2026-12-14', endDate: '2026-12-15', category: 'summit', status: 'scheduled', sourceId: 'g20', location: 'Miami area, Florida (announced)',
    summary: 'First G20 summit hosted by the United States since 2009. Dates and venue as announced by the US presidency; verify closer to the event.', affects: ['igo:g20', 'country:USA', 'person:donald-trump'] },
  { slug: 'un-sg-transition-2026', name: 'UN Secretary-General term ends', date: '2026-12-31', category: 'leadership', status: 'scheduled', sourceId: 'un', location: 'New York',
    summary: 'António Guterres’s second five-year term ends; the Security Council recommends and the General Assembly appoints a successor, who takes office 1 January 2027.', affects: ['igo:un', 'person:antonio-guterres'] },
  { slug: 'brazil-election-2026', name: '2026 Brazilian general election', date: '2026-10-04', endDate: '2026-10-25', category: 'election', status: 'outcome-not-recorded', sourceId: 'tse-br', location: 'Brazil',
    summary: 'Presidential (first round 4 October, run-off 25 October), congressional and state elections. The result is not yet recorded in this dataset — see the Superior Electoral Court (TSE).', affects: ['country:BRA', 'person:lula', 'party:br-pt', 'igo:brics'] },
  { slug: 'nato-hague-summit-2025', name: 'NATO Summit, The Hague 2025', date: '2025-06-24', endDate: '2025-06-25', category: 'summit', status: 'completed', sourceId: 'nato', location: 'The Hague, Netherlands',
    summary: 'Allies agreed to invest 5% of GDP annually in defence and security by 2035 — at least 3.5% on core defence and up to 1.5% on related infrastructure and resilience.', outcome: '5% of GDP defence investment pledge adopted (Spain obtained flexibility on the timeline).',
    affects: ['igo:nato', 'person:mark-rutte', 'company:rheinmetall', 'company:lockheed-martin', 'country:DEU', 'country:USA'] },
  { slug: 'germany-election-2025', name: '2025 German federal election', date: '2025-02-23', category: 'election', status: 'completed', sourceId: 'bundeswahlleiterin', location: 'Germany',
    summary: 'Snap election after the collapse of the traffic-light coalition. Results: CDU/CSU 28.5%, AfD 20.8%, SPD 16.4%, Greens 11.6%, Die Linke 8.8%; FDP and BSW fell below the 5% threshold.', outcome: 'CDU/CSU–SPD coalition formed; Friedrich Merz elected Chancellor on 6 May 2025.',
    affects: ['country:DEU', 'person:friedrich-merz', 'party:de-cdu', 'party:de-csu', 'party:de-spd', 'party:de-afd', 'party:de-greens'] },
  { slug: 'nippon-us-steel-2025', name: 'Nippon Steel completes U.S. Steel acquisition', date: '2025-06-18', category: 'corporate', status: 'completed', sourceId: 'nippon-steel', location: 'Pittsburgh / Tokyo',
    summary: 'After an 18-month national-security review and opposition from two administrations, the deal closed under an agreement giving the US government a golden share and committing ~US$11 billion of investment by 2028.', outcome: 'U.S. Steel became a wholly owned subsidiary of Nippon Steel and was delisted.',
    affects: ['company:us-steel', 'company:nippon-steel', 'city:pittsburgh', 'state:US-PA', 'country:USA', 'country:JPN', 'person:donald-trump'] },
  { slug: 'vision-2030', name: 'Saudi Vision 2030 target year', aliases: ['Vision 2030'], date: '2030-12-31', category: 'policy', status: 'scheduled', sourceId: 'vision2030', location: 'Saudi Arabia',
    summary: 'Target year of the economic diversification programme launched in 2016: raising non-oil revenue, private-sector share of GDP, tourism and female labour participation, financed largely through the Public Investment Fund.', affects: ['country:SAU', 'person:mohammed-bin-salman', 'company:aramco', 'commodity:tourism'] },
  { slug: 'opec-plus-unwind-2025', name: 'OPEC+ eight-country output increases (2025)', date: '2025-04-03', endDate: '2025-09-07', category: 'policy', status: 'completed', sourceId: 'opec', location: 'Virtual meetings',
    summary: 'Saudi Arabia, Russia, Iraq, UAE, Kuwait, Kazakhstan, Algeria and Oman accelerated the unwinding of their 2.2 million b/d voluntary cuts between April and September 2025.', outcome: 'Full 2.2 million b/d voluntary cut unwound by September 2025.',
    affects: ['igo:opec-plus', 'igo:opec', 'commodity:crude-oil', 'commodity:brent', 'country:SAU', 'country:RUS', 'person:abdulaziz-bin-salman', 'company:aramco'] },
];
for (const e of EVENTS) {
  const id = add({ id: `event:${e.slug}`, type: 'event', name: e.name, depth: 'curated', aliases: e.aliases, summary: e.summary,
    facts: [f('Date', e.endDate ? `${e.date} – ${e.endDate}` : e.date, e.sourceId), f('Category', e.category, e.sourceId), f('Status', e.status.replace(/-/g, ' '), e.sourceId), ...(e.location ? [f('Location', e.location, e.sourceId)] : []), ...(e.outcome ? [f('Outcome', e.outcome, e.sourceId)] : [])],
    attrs: { date: e.date, endDate: e.endDate, category: e.category, status: e.status } });
  for (const a of e.affects) rel(id, 'affects', a, { sourceId: e.sourceId });
}

export const CURATED_ENTITIES = ents;
export const CURATED_RELS = rels;

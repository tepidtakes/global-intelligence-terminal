// Map overlay catalog and color logic. Color follows meaning:
//   • better/worse layers use one scale everywhere — green = better, red = worse — with a
//     neutral cream middle (e.g. GDP growth near zero) and gray for "no data";
//   • size-only layers (population, GDP, trade flows) use one themed hue, light → dark;
//   • categories get colors that match what they are (conflict severity in reds, election
//     timing in ambers, income groups on the green ↔ red scale).
// The two arms of the green/red scale differ in lightness as well as hue so they stay
// distinguishable with red–green color blindness (checked with the palette validator).
import { fmtUnit } from '../format';
import { PRODUCTS, productByHs, type ProductGroup } from '../../shared/products';

export type Hue = 'blue' | 'purple' | 'ocean' | 'amber' | 'indigo' | 'olive' | 'steel' | 'gold' | 'rose';
export type ColorRule =
  | { kind: 'better'; dir: 'high' | 'low' }              // ranked; green = better end
  | { kind: 'signed'; good: 'positive' | 'negative'; words?: [string, string] } // centred on zero; words = what each side means
  | { kind: 'target'; target: number }                   // e.g. inflation: close to target = green
  | { kind: 'magnitude'; hue: Hue }                      // size only, no judgement
  | { kind: 'categories'; colors: Record<string, string | [string, string]> }
  | { kind: 'auto' };                                    // categorical slots (organization membership)

export interface LayerDef {
  id: string; label: string; group: string; hint: string;
  variants?: { id: string; label: string }[];
  needsAuth?: boolean; historical?: boolean; yearable?: boolean; live?: boolean;
  color: ColorRule;
  keywords?: string;
}

export const GROUPS: { id: string; label: string; icon: string }[] = [
  { id: 'politics', label: 'Politics & elections', icon: '🏛' },
  { id: 'security', label: 'Conflict & security', icon: '⚔' },
  { id: 'economy', label: 'Economy & people', icon: '📈' },
  { id: 'finance', label: 'Public finances', icon: '🏦' },
  { id: 'outlook', label: 'Forecasts (IMF)', icon: '🔭' },
  { id: 'trade', label: 'Trade & commodities', icon: '🚢' },
  { id: 'sanctions', label: 'Sanctions & tariffs', icon: '⛔' },
  { id: 'reserves', label: 'Reserves & stocks', icon: '🛢' },
  { id: 'markets', label: 'Markets & rates', icon: '💱' },
  { id: 'personal', label: 'My portfolio', icon: '👤' },
  { id: 'history', label: 'Historical', icon: '🕰' },
];

const Y = new Date().getFullYear();
const imfVariants = (code: string) => [{ id: `imf:${code}:${Y}`, label: String(Y) }, { id: `imf:${code}:${Y + 1}`, label: String(Y + 1) }, { id: `imf:${code}:${Y - 1}`, label: `${Y - 1} (est.)` }];

export const LAYERS: LayerDef[] = [
  // Politics
  { id: 'elections', label: 'Elections', group: 'politics', live: true, hint: 'National elections in the next 12 months and the last 60 days (Wikipedia electoral calendars).', keywords: 'vote ballot',
    color: { kind: 'categories', colors: { soon: ['#d97706', '#f59e0b'], upcoming: ['#f5c66b', '#8a6418'], recent: ['#8aa4c8', '#4f6a90'] } } },
  { id: 'govtype', label: 'Government type', group: 'politics', hint: 'Presidential, parliamentary, monarchy or one-party state.', keywords: 'regime democracy',
    color: { kind: 'categories', colors: { presidential: ['#2a78d6', '#3987e5'], parliamentary: ['#1baf7a', '#199e70'], monarchy: ['#6250d6', '#9085e9'], 'one-party': ['#c8312d', '#e66767'] } } },
  { id: 'news', label: 'In the news (48 h)', group: 'politics', live: true, hint: 'How many separate stories from trusted outlets (wires, public broadcasters, major papers, official sources) named each country in a headline in the last 48 hours.', keywords: 'headlines attention media coverage breaking',
    color: { kind: 'magnitude', hue: 'rose' } },
  { id: 'igo', label: 'Organization membership', group: 'politics', hint: 'NATO, EU, OPEC, BRICS, G7… — up to three at once, by year.', keywords: 'nato eu opec brics g20 alliance', color: { kind: 'auto' } },
  // Security
  { id: 'conflicts', label: 'Armed conflicts', group: 'security', live: true, hint: 'Where fighting is taking place, shaded by the deadliest conflict on each country’s territory.', keywords: 'war fighting military',
    color: { kind: 'categories', colors: { 'major-war': ['#7a1410', '#ff6a55'], 'minor-war': ['#c8312d', '#b23a28'], conflict: ['#ec835a', '#7a3a24'], skirmish: ['#f6c39f', '#4a2f26'] } } },
  // Economy & people
  { id: 'wb:NY.GDP.PCAP.CD', label: 'GDP per capita', group: 'economy', yearable: true, hint: 'Income per person. Green = richer, red = poorer.', keywords: 'income wealth living standard',
    variants: [{ id: 'wb:NY.GDP.PCAP.CD', label: 'US$' }, { id: 'wb:NY.GDP.PCAP.PP.CD', label: 'PPP' }], color: { kind: 'better', dir: 'high' } },
  { id: 'wb:NY.GDP.MKTP.CD', label: 'GDP (economy size)', group: 'economy', yearable: true, hint: 'Total output. Darker blue = bigger economy (size only, not better or worse).', keywords: 'output',
    variants: [{ id: 'wb:NY.GDP.MKTP.CD', label: 'Nominal' }, { id: 'wb:NY.GDP.MKTP.PP.CD', label: 'PPP' }], color: { kind: 'magnitude', hue: 'blue' } },
  { id: 'wb:NY.GDP.MKTP.KD.ZG', label: 'Real GDP growth', group: 'economy', yearable: true, hint: 'Green = growing, red = shrinking.', keywords: 'recession', color: { kind: 'signed', good: 'positive' } },
  { id: 'wb:FP.CPI.TOTL.ZG', label: 'Inflation', group: 'economy', yearable: true, hint: 'Green = close to a typical 2% target; red = high inflation or deflation.', keywords: 'prices cpi', color: { kind: 'target', target: 2 } },
  { id: 'wb:SL.UEM.TOTL.ZS', label: 'Unemployment', group: 'economy', yearable: true, hint: 'Green = low unemployment, red = high.', keywords: 'jobs labor', color: { kind: 'better', dir: 'low' } },
  { id: 'income', label: 'Income group (World Bank)', group: 'economy', hint: 'High to low income, on the green ↔ red scale.', keywords: 'development',
    color: { kind: 'categories', colors: { 'High income': ['#0e7a5a', '#9af2cb'], 'Upper middle income': ['#b7e6cf', '#2a8f6b'], 'Lower middle income': ['#f0956f', '#8c2f22'], 'Low income': ['#8f1d14', '#ff9575'] } } },
  { id: 'wb:SP.POP.TOTL', label: 'Population', group: 'economy', yearable: true, hint: 'Darker purple = more people.', keywords: 'people demographics', color: { kind: 'magnitude', hue: 'purple' } },
  // Public finances
  { id: 'wb:GC.DOD.TOTL.GD.ZS', label: 'Central government debt / GDP', group: 'finance', yearable: true, hint: 'World Bank, central government only. Green = low debt, red = high debt. For all levels of government use “Debt forecast” (IMF general government).', keywords: 'sovereign borrowing', color: { kind: 'better', dir: 'low' } },
  { id: 'wb:GC.NLD.TOTL.GD.ZS', label: 'Central government budget balance / GDP', group: 'finance', yearable: true, hint: 'World Bank, central government only. Green = surplus, red = deficit.', keywords: 'fiscal deficit surplus', color: { kind: 'signed', good: 'positive', words: ['surplus', 'deficit'] } },
  { id: 'imf:GGXCNL_NGDP', label: 'Budget balance (all levels of government)', group: 'finance', live: true, hint: 'IMF general-government surplus (green) or deficit (red) as % of GDP; this year and next are IMF projections.', keywords: 'fiscal deficit surplus budget', variants: imfVariants('GGXCNL_NGDP'), color: { kind: 'signed', good: 'positive', words: ['surplus', 'deficit'] } },
  { id: 'wb:GC.REV.XGRT.GD.ZS', label: 'Government revenue', group: 'finance', yearable: true, hint: 'Central-government revenue (excluding grants) or tax revenue as % of GDP. Darker = larger state.', keywords: 'taxes budget income fiscal',
    variants: [{ id: 'wb:GC.REV.XGRT.GD.ZS', label: 'Revenue' }, { id: 'wb:GC.TAX.TOTL.GD.ZS', label: 'Tax' }], color: { kind: 'magnitude', hue: 'steel' } },
  { id: 'wb:GC.XPN.TOTL.GD.ZS', label: 'Government spending', group: 'finance', yearable: true, hint: 'Central-government spending, or what governments spend on defence (SIPRI), health and education, as % of GDP. Darker = more.', keywords: 'expenditure budget military defence defense health education',
    variants: [{ id: 'wb:GC.XPN.TOTL.GD.ZS', label: 'Total' }, { id: 'wb:MS.MIL.XPND.GD.ZS', label: 'Defence' }, { id: 'wb:SH.XPD.GHED.GD.ZS', label: 'Health' }, { id: 'wb:SE.XPD.TOTL.GD.ZS', label: 'Education' }], color: { kind: 'magnitude', hue: 'indigo' } },
  { id: 'wb:GC.XPN.INTP.RV.ZS', label: 'Interest burden', group: 'finance', yearable: true, hint: 'Interest the central government pays as a share of its revenue. Green = light burden, red = heavy.', keywords: 'debt service interest payments', color: { kind: 'better', dir: 'low' } },
  // IMF outlook
  { id: 'imf:NGDP_RPCH', label: 'Growth forecast', group: 'outlook', live: true, hint: 'IMF projected real GDP growth. Green = growing, red = contracting.', keywords: 'projection outlook weo', variants: imfVariants('NGDP_RPCH'), color: { kind: 'signed', good: 'positive' } },
  { id: 'imf:PCPIPCH', label: 'Inflation forecast', group: 'outlook', live: true, hint: 'IMF projected inflation. Green = near 2%, red = far above (or below zero).', keywords: 'projection prices', variants: imfVariants('PCPIPCH'), color: { kind: 'target', target: 2 } },
  { id: 'imf:LUR', label: 'Unemployment forecast', group: 'outlook', live: true, hint: 'IMF projected unemployment. Green = low.', keywords: 'projection jobs', variants: imfVariants('LUR'), color: { kind: 'better', dir: 'low' } },
  { id: 'imf:GGXWDG_NGDP', label: 'Debt forecast', group: 'outlook', live: true, hint: 'IMF general-government (all levels) debt / GDP — the standard comparison measure; last year is an IMF estimate. Green = low.', keywords: 'projection sovereign', variants: imfVariants('GGXWDG_NGDP'), color: { kind: 'better', dir: 'low' } },
  // Trade
  { id: 'trade', label: 'Who exports / imports a product', group: 'trade', live: true, hint: 'Pick a product — crude oil, chips, wheat… — and see every country’s exports or imports (UN Comtrade).', keywords: 'exporters importers hs comtrade goods', color: { kind: 'magnitude', hue: 'ocean' } },
  { id: 'tradewith', label: 'Trade with a country', group: 'trade', live: true, hint: 'Pick a country to see how much it trades with every other one — exports, imports or share of its trade (UN Comtrade, as that country reports). Darker = more.', keywords: 'bilateral partners exports imports dependency',
    color: { kind: 'magnitude', hue: 'ocean' } },
  { id: 'tradewith-balance', label: 'Trade balance with a country', group: 'trade', live: true, hint: 'Pick a country to see its goods surplus (green) or deficit (red) with every other one (UN Comtrade).', keywords: 'bilateral trade deficit surplus',
    color: { kind: 'signed', good: 'positive', words: ['surplus with that country', 'deficit'] } },
  { id: 'commodity', label: 'Commodity producers', group: 'trade', hint: 'Top producers and exporters of a commodity, from USGS, EIA and USDA rankings.', keywords: 'mining oil grain', color: { kind: 'categories', colors: {} } },
  { id: 'wb:NE.EXP.GNFS.CD', label: 'Total exports', group: 'trade', yearable: true, hint: 'Goods and services exports. Darker = larger.', keywords: 'trade', variants: [{ id: 'wb:NE.EXP.GNFS.CD', label: 'US$' }, { id: 'wb:NE.EXP.GNFS.ZS', label: '% of GDP' }], color: { kind: 'magnitude', hue: 'ocean' } },
  { id: 'wb:BN.CAB.XOKA.GD.ZS', label: 'Current-account balance', group: 'trade', yearable: true, hint: 'Green = surplus (earns more abroad than it spends), red = deficit.', keywords: 'balance of payments', color: { kind: 'signed', good: 'positive', words: ['surplus', 'deficit'] } },
  { id: 'wb:TX.VAL.FUEL.ZS.UN', label: 'Fuel share of exports', group: 'trade', yearable: true, hint: 'How dependent exports are on oil, gas and coal. Darker amber = more.', keywords: 'oil petrostate', color: { kind: 'magnitude', hue: 'amber' } },
  // Sanctions & tariffs
  { id: 'sanctions:ALL', label: 'Sanctions', group: 'sanctions', live: true, hint: 'Darkest: a sanctions programme aimed at the country (Russia, Iran, North Korea…). Lighter: people, companies and ships on the US (OFAC), EU, UK or UN lists connected to it by nationality or address.', keywords: 'ofac sdn embargo designations blacklist restrictive measures',
    variants: [{ id: 'sanctions:ALL', label: 'All' }, { id: 'sanctions:US', label: 'US' }, { id: 'sanctions:EU', label: 'EU' }, { id: 'sanctions:UK', label: 'UK' }, { id: 'sanctions:UN', label: 'UN' }],
    color: { kind: 'categories', colors: { programme: ['#4a2178', '#c3a9f5'], many: ['#9479cf', '#7458b0'], some: ['#d9cdf2', '#3d3259'] } } },
  { id: 'tariffs:us-effective', label: 'US tariffs by country of origin', group: 'sanctions', live: true, hint: 'The average US tariff actually charged on each country’s goods in the latest month (duties ÷ imports, US Census). Darker = higher.', keywords: 'tariff duties customs trade war reciprocal effective rate',
    color: { kind: 'magnitude', hue: 'rose' } },
  { id: 'tariffs:us-change', label: 'US tariffs — change in a year', group: 'sanctions', live: true, hint: 'Change in the effective US tariff on each country’s goods since the same month a year earlier. Red = tariffs went up, green = down.', keywords: 'tariff increase trade war',
    color: { kind: 'signed', good: 'negative', words: ['tariffs went down', 'tariffs went up'] } },
  { id: 'tariffs:us-actions', label: 'US tariff actions', group: 'sanctions', live: true, hint: 'How many US tariff actions in the last 12 months — proclamations, executive orders, USTR, Commerce and CBP notices in the Federal Register — name each country.', keywords: 'section 301 232 federal register proclamation executive order',
    color: { kind: 'magnitude', hue: 'amber' } },
  { id: 'wb:TM.TAX.MRCH.WM.AR.ZS', label: 'Tariffs each country applies', group: 'sanctions', yearable: true, hint: 'The average tariff a country charges on its own imports (World Bank, from UNCTAD/WTO data; a year or more behind). Darker = higher.', keywords: 'protectionism mfn import duties',
    variants: [{ id: 'wb:TM.TAX.MRCH.WM.AR.ZS', label: 'Trade-weighted' }, { id: 'wb:TM.TAX.MRCH.SM.AR.ZS', label: 'Simple mean' }, { id: 'wb:TM.TAX.MRCH.WM.FN.ZS', label: 'MFN' }], color: { kind: 'magnitude', hue: 'rose' } },
  // Reserves & stocks
  { id: 'reserves:oil-days', label: 'Crude-oil stocks', group: 'reserves', live: true, hint: 'Crude-oil stocks each government reports to JODI, in days of refinery intake or in barrels. Darker = more. China and some others do not report.', keywords: 'oil reserve spr strategic petroleum inventory',
    variants: [{ id: 'reserves:oil-days', label: 'Days' }, { id: 'reserves:oil-stocks', label: 'Barrels' }], color: { kind: 'magnitude', hue: 'amber' } },
  { id: 'reserves:grain-wheat', label: 'Grain stocks', group: 'reserves', live: true, hint: 'Ending stocks of wheat, corn or rice as a share of a year’s domestic use (USDA projection for the current marketing year). Darker = bigger buffer.', keywords: 'food security wheat corn maize rice stockpile wasde',
    variants: [{ id: 'reserves:grain-wheat', label: 'Wheat' }, { id: 'reserves:grain-corn', label: 'Corn' }, { id: 'reserves:grain-rice', label: 'Rice' }], color: { kind: 'magnitude', hue: 'olive' } },
  { id: 'reserves:gas', label: 'Gas storage (Europe)', group: 'reserves', live: true, hint: 'How full each country’s natural-gas storage is today (GIE AGSI+; needs a free AGSI_API_KEY). Green = fuller.', keywords: 'natural gas storage winter lng', color: { kind: 'better', dir: 'high' } },
  { id: 'wb:FI.RES.TOTL.MO', label: 'Foreign-exchange reserves (months of imports)', group: 'reserves', yearable: true, hint: 'How many months of imports a country’s reserves (incl. gold) could pay for. Green = more cover.', keywords: 'fx reserves central bank adequacy', color: { kind: 'better', dir: 'high' } },
  { id: 'wb:FI.RES.TOTL.CD', label: 'Foreign-exchange & gold reserves', group: 'reserves', yearable: true, hint: 'Central-bank reserves in US dollars, including or excluding gold. Darker = larger.', keywords: 'fx reserves gold central bank',
    variants: [{ id: 'wb:FI.RES.TOTL.CD', label: 'Incl. gold' }, { id: 'wb:FI.RES.XGLD.CD', label: 'Excl. gold' }], color: { kind: 'magnitude', hue: 'gold' } },
  // Markets & rates
  { id: 'fx', label: 'Currency vs US dollar', group: 'markets', live: true, hint: 'Green = currency strengthened against the dollar, red = weakened.', keywords: 'fx forex exchange rate devaluation',
    variants: [{ id: 'fx:m1', label: '1M' }, { id: 'fx:ytd', label: 'YTD' }, { id: 'fx:y1', label: '1Y' }, { id: 'fx:y5', label: '5Y' }], color: { kind: 'signed', good: 'positive' } },
  { id: 'policy-rate', label: 'Central-bank policy rate', group: 'markets', live: true, hint: 'Official interest rate (BIS). Darker = tighter money.', keywords: 'interest rate monetary fed ecb', color: { kind: 'magnitude', hue: 'gold' } },
  { id: 'bond10y', label: '10-year bond yield', group: 'markets', live: true, hint: 'Government borrowing cost. Green = cheap, red = expensive. Daily closes for the US, Canada, Japan and UK; monthly averages elsewhere (ECB, OECD).', keywords: 'sovereign yield rates', color: { kind: 'better', dir: 'low' } },
  { id: 'wb:FR.INR.LEND', label: 'Bank lending rate', group: 'markets', yearable: true, hint: 'Typical bank lending rate. Green = cheaper credit.', keywords: 'interest credit', color: { kind: 'better', dir: 'low' } },
  { id: 'wb:CM.MKT.LCAP.GD.ZS', label: 'Stock-market size / GDP', group: 'markets', yearable: true, hint: 'Listed-company market cap relative to the economy. Darker = deeper market.', keywords: 'equities', color: { kind: 'magnitude', hue: 'indigo' } },
  { id: 'wb:BX.KLT.DINV.WD.GD.ZS', label: 'Foreign direct investment', group: 'markets', yearable: true, hint: 'Net FDI inflows / GDP. Green = more inflows.', keywords: 'fdi capital', color: { kind: 'better', dir: 'high' } },
  // Personal & historical
  { id: 'alerts', label: 'My alerts', group: 'personal', needsAuth: true, live: true, hint: 'Countries shaded by your unread alerts — where the news, leadership changes, market moves or data releases your rules watch for happened.', keywords: 'notifications changes inbox watch',
    color: { kind: 'magnitude', hue: 'rose' } },
  { id: 'exposure', label: 'My position exposure', group: 'personal', needsAuth: true, hint: 'Where your open positions are headquartered or operate.', color: { kind: 'categories', colors: { hq: ['#1c5cab', '#5598e7'], ops: ['#9ec5f4', '#1c3f6b'] } } },
  { id: 'three-worlds', label: 'Cold War “Three Worlds”', group: 'history', historical: true, hint: 'First (US-aligned), Second (Soviet-aligned) and Third (non-aligned) worlds, c. 1950–1991.',
    color: { kind: 'categories', colors: { first: ['#2a78d6', '#3987e5'], second: ['#c8312d', '#e66767'], third: ['#a9a69c', '#6b6a64'] } } },
  { id: 'none', label: 'No fill (outlines only)', group: 'history', hint: 'Plain map.', color: { kind: 'auto' } },
];

export const COMMODITY_LAYERS = ['crude-oil', 'natural-gas', 'coal', 'uranium', 'gold', 'silver', 'platinum', 'palladium', 'copper', 'aluminium', 'iron-ore', 'nickel', 'cobalt', 'lithium', 'rare-earths',
  'wheat', 'corn', 'rice', 'soybeans', 'coffee', 'cocoa', 'sugar', 'cotton', 'cattle', 'lean-hogs', 'orange-juice', 'semiconductors', 'automobiles'];
const COMMODITY_HUE: Record<string, Hue> = {
  'crude-oil': 'amber', 'natural-gas': 'amber', coal: 'steel', uranium: 'olive', gold: 'gold', silver: 'steel', platinum: 'steel', palladium: 'steel', copper: 'rose', aluminium: 'steel', 'iron-ore': 'rose',
  nickel: 'steel', cobalt: 'blue', lithium: 'purple', 'rare-earths': 'purple', wheat: 'olive', corn: 'olive', rice: 'olive', soybeans: 'olive', coffee: 'rose', cocoa: 'rose', sugar: 'olive', cotton: 'indigo',
  cattle: 'rose', 'lean-hogs': 'rose', 'orange-juice': 'gold', semiconductors: 'indigo', automobiles: 'blue',
};
const PRODUCT_HUE: Record<ProductGroup, Hue> = { Energy: 'amber', 'Metals & minerals': 'steel', 'Agriculture & food': 'olive', 'Manufactured goods': 'indigo', 'Chemicals & materials': 'purple' };
export { PRODUCTS };

export function layerDefFor(fill: string) {
  if (fill.startsWith('commodity:')) return LAYERS.find((l) => l.id === 'commodity')!;
  if (fill.startsWith('trade:')) return LAYERS.find((l) => l.id === 'trade')!;
  if (fill.startsWith('tradewith:')) return LAYERS.find((l) => l.id === (fill.endsWith(':balance') ? 'tradewith-balance' : 'tradewith'))!;
  if (fill.startsWith('fx:')) return LAYERS.find((l) => l.id === 'fx')!;
  if (fill.startsWith('imf:')) return LAYERS.find((l) => l.id === fill.split(':').slice(0, 2).join(':'));
  return LAYERS.find((l) => l.id === fill || l.variants?.some((v) => v.id === fill));
}
/** The concrete layer id to load when a layer is picked from the list. */
export function defaultFill(def: LayerDef) {
  if (def.id === 'commodity') return 'commodity:crude-oil';
  if (def.id === 'trade') return 'trade:X:2709';
  if (def.id === 'tradewith') return 'tradewith:USA:total';
  if (def.id === 'tradewith-balance') return 'tradewith:USA:balance';
  if (def.variants) return def.id === 'fx' ? 'fx:y1' : def.variants[0].id;
  return def.id;
}

// ───────────── Palettes ─────────────
export interface Palette { dark: boolean; goodBad: string[]; neutral: string; cat: string[]; nodata: string; former: string; line: string; ocean: string; hover: string; sel: string; overlay: string; }
export function palette(dark: boolean): Palette {
  return dark ? {
    dark, goodBad: ['#ff9575', '#8c2f22', '#2a8f6b', '#9af2cb'], neutral: '#4a4842',
    cat: ['#3987e5', '#d95926', '#199e70', '#d55181'],
    nodata: '#232321', former: '#5a5953', line: '#4a4a46', ocean: '#111416', hover: '#f0efec', sel: '#eda100', overlay: '#f0efec',
  } : {
    dark, goodBad: ['#8f1d14', '#f0956f', '#b7e6cf', '#0e7a5a'], neutral: '#ebe6d6',
    cat: ['#2a78d6', '#eb6834', '#1baf7a', '#e87ba4'],
    nodata: '#cfcdc5', former: '#a9a69c', line: '#9d9a90', ocean: '#dfe6ec', hover: '#0b0b0b', sel: '#c98500', overlay: '#0b0b0b',
  };
}
const HUES: Record<Hue, string[]> = {
  blue: ['#d6e6fb', '#9ec5f4', '#5598e7', '#256abf', '#0d366b'],
  purple: ['#e7e2fb', '#c4b9f3', '#9085e9', '#6250d6', '#382a96'],
  ocean: ['#d4eef2', '#94d4de', '#4fb0c2', '#1d8399', '#0b5466'],
  amber: ['#fcedc8', '#f7cf78', '#eda100', '#b57600', '#784d00'],
  indigo: ['#e0e4f2', '#b4bde0', '#7d8bc4', '#4b5aa0', '#283372'],
  olive: ['#eff1d0', '#d5db8e', '#a9b54a', '#76841f', '#495510'],
  steel: ['#e4e7ea', '#bdc5cc', '#8c99a5', '#5d6b78', '#36434e'],
  gold: ['#fbf0c4', '#f1d572', '#d4aa1c', '#a07c00', '#665000'],
  rose: ['#f9dfdc', '#f0b0a6', '#d9786a', '#a8483b', '#6e271e'],
};
/** Light → dark in light mode; dim → bright in dark mode (low values recede into the background). */
export function hueRamp(hue: Hue, dark: boolean) { const r = HUES[hue]; return dark ? [...r].reverse() : r; }
const pick = (c: string | [string, string], dark: boolean) => (Array.isArray(c) ? c[dark ? 1 : 0] : c);

/** Five-step ramp from worst to best: strong bad, mild bad, neutral, mild good, strong good. */
export function betterRamp(pal: Palette) { const [b2, b1, g1, g2] = pal.goodBad; return [b2, b1, pal.neutral, g1, g2]; }

/** A tiny CSS gradient that previews a layer's color scheme in the layer list. */
export function swatchFor(def: LayerDef, pal: Palette, fill?: string): string {
  const c = def.color;
  if (c.kind === 'better' || c.kind === 'signed' || c.kind === 'target') { const r = betterRamp(pal); return `linear-gradient(90deg, ${r.join(', ')})`; }
  if (c.kind === 'magnitude') { const r = hueRamp(fill ? hueForFill(fill, c.hue) : c.hue, pal.dark); return `linear-gradient(90deg, ${r.join(', ')})`; }
  if (c.kind === 'categories') {
    const cols = def.id === 'commodity' ? hueRamp(COMMODITY_HUE[(fill || 'commodity:crude-oil').slice(10)] || 'amber', pal.dark).slice(1).reverse() : Object.values(c.colors).map((x) => pick(x, pal.dark));
    return `linear-gradient(90deg, ${cols.map((x, i) => `${x} ${(i / cols.length) * 100}% ${((i + 1) / cols.length) * 100}%`).join(', ')})`;
  }
  return def.id === 'none' ? 'transparent' : `linear-gradient(90deg, ${pal.cat.map((x, i) => `${x} ${i * 25}% ${(i + 1) * 25}%`).join(', ')})`;
}
function hueForFill(fill: string, fallback: Hue): Hue {
  if (fill.startsWith('trade:')) { const p = productByHs(fill.split(':')[2]); return p ? PRODUCT_HUE[p.group] : fallback; }
  return fallback;
}

// ───────────── Layer data → colors + legend ─────────────
export interface LayerData {
  kind: 'numeric' | 'categorical' | 'ordinal';
  label: string; unit?: string; scale?: 'sequential' | 'diverging';
  values: Record<string, any>;
  categories?: { key: string; label: string }[];
  detail?: Record<string, string>;
  sourceIds?: string[]; note?: string; lastUpdated?: string; fetchedAt?: string; stale?: boolean;
}
export interface Legend { title: string; rows: { color: string; label: string }[]; hint?: string; note?: string; sourceIds?: string[]; period?: string; stale?: boolean; }

function quantiles(sorted: number[], k: number) {
  const out: number[] = [];
  for (let i = 1; i < k; i++) out.push(sorted[Math.min(sorted.length - 1, Math.floor((i / k) * sorted.length))]);
  return out;
}
const nice = (x: number) => +x.toPrecision(2);

/** Compute a color per ISO3 code plus a legend, following the layer's color rule. */
export function colorize(data: LayerData | undefined, pal: Palette, classify: 'quantile' | 'equal' | 'log', def?: LayerDef, fill?: string): { colors: Record<string, string>; legend?: Legend } {
  if (!data) return { colors: {} };
  const colors: Record<string, string> = {};
  const rule: ColorRule = def?.color || (data.scale === 'diverging' ? { kind: 'signed', good: 'positive' } : { kind: 'magnitude', hue: 'blue' });
  const noData = { color: pal.nodata, label: data.kind === 'numeric' ? 'No data (not zero)' : /Government/.test(data.label) ? 'Not yet classified' : /membership/.test(data.label) ? 'Not a member' : /exposure/.test(data.label) ? 'No exposure' : /conflict/i.test(data.label) ? 'No conflict listed' : /election/i.test(data.label) ? 'None scheduled / not listed' : 'No data / not listed' };

  if (data.kind === 'numeric') {
    const entries = Object.entries(data.values as Record<string, { value: number; period: string }>);
    const vals = entries.map(([, v]) => v.value).sort((a, b) => a - b);
    if (!vals.length) return { colors, legend: { title: data.label, rows: [noData] } };
    const periods = [...new Set(entries.map(([, v]) => String(v.period).replace(/^.* · to /, '')))].sort();
    const period = periods.length > 1 ? `${periods[0]}–${periods[periods.length - 1]} (latest available per country)` : periods[0];
    const f = (x: number) => fmtUnit(x, data.unit);
    const sf = (x: number) => `${x > 0 ? '+' : ''}${f(x)}`;
    let ramp: string[]; let breaks: number[]; let labels: string[] | undefined; let hint: string | undefined;

    if (rule.kind === 'target') {
      // Bands around the target: 1–3% green; 0–1 or 3–5 light green; 5–10 or <0 cream/orange; 10–25 orange; >25 red.
      const r = betterRamp(pal);
      const t = rule.target;
      const bands: [number, number, string, string][] = [
        [25, Infinity, r[0], `≥ 25% (very high)`], [10, 25, r[1], `10 – 25%`], [5, 10, r[2], `5 – 10%`], [t + 1, 5, r[3], `${t + 1} – 5%`],
        [t - 2, t + 1, r[4], `${t - 2} – ${t + 1}% (near target)`], [-2, t - 2, r[2], `−2 – ${t - 2}% (low)`], [-Infinity, -2, r[1], `< −2% (deflation)`],
      ];
      for (const [iso, v] of entries) colors[iso] = (bands.find(([lo, hi]) => v.value >= lo && v.value < hi) || bands[0])[2];
      const used = bands.filter(([lo, hi]) => entries.some(([, v]) => v.value >= lo && v.value < hi));
      return { colors, legend: { title: data.label, hint: `Green = close to ~${t}% · red = far from it`, rows: [...used.map(([, , c, l]) => ({ color: c, label: l })), noData], sourceIds: data.sourceIds, period, stale: data.stale, note: data.note } };
    }
    if (rule.kind === 'signed') {
      const abs = vals.map(Math.abs).sort((a, b) => a - b);
      const tt = Math.max(abs[Math.floor(abs.length * 0.8)] || 1, data.unit === '%' ? 0.5 : 0.1);
      breaks = [-tt, -tt / 4, tt / 4, tt].map(nice);
      ramp = betterRamp(pal); if (rule.good === 'negative') ramp = [...ramp].reverse();
      labels = [`< ${sf(breaks[0])}`, `${sf(breaks[0])} to ${sf(breaks[1])}`, `${sf(breaks[1])} to ${sf(breaks[2])} (little change)`, `${sf(breaks[2])} to ${sf(breaks[3])}`, `> ${sf(breaks[3])}`];
      hint = rule.words ? `Green = ${rule.words[0]} · red = ${rule.words[1]}` : rule.good === 'positive' ? 'Green = positive (better) · red = negative (worse)' : 'Green = negative (better) · red = positive (worse)';
    } else {
      if (classify === 'equal') { const [mn, mx] = [vals[0], vals[vals.length - 1]]; breaks = [1, 2, 3, 4].map((i) => mn + (mx - mn) * i / 5); }
      else if (classify === 'log' && vals[0] > 0) { const [a, b] = [Math.log10(vals[0]), Math.log10(vals[vals.length - 1])]; breaks = [1, 2, 3, 4].map((i) => 10 ** (a + (b - a) * i / 5)); }
      else breaks = quantiles(vals, 5);
      if (rule.kind === 'better') { ramp = betterRamp(pal); if (rule.dir === 'low') ramp = [...ramp].reverse(); hint = rule.dir === 'high' ? 'Green = higher (better) · red = lower (worse)' : 'Green = lower (better) · red = higher (worse)'; }
      else { ramp = hueRamp(rule.kind === 'magnitude' ? hueForFill(fill || '', rule.hue) : 'blue', pal.dark); hint = 'Darker = larger (size only, not better or worse)'; if (pal.dark) hint = 'Brighter = larger (size only, not better or worse)'; }
    }
    const cls = (v: number) => { let i = 0; while (i < breaks.length && v >= breaks[i]) i++; return i; };
    for (const [iso, v] of entries) colors[iso] = ramp[cls(v.value)];
    const rows = ramp.map((c, i) => ({ color: c, label: labels?.[i] ?? (i === 0 ? `< ${f(breaks[0])}` : i === ramp.length - 1 ? `≥ ${f(breaks[i - 1])}` : `${f(breaks[i - 1])} – ${f(breaks[i])}`) }));
    // Highest values on top; the hint line says which end is better.
    return { colors, legend: { title: data.label, hint, rows: [...rows.reverse(), noData], sourceIds: data.sourceIds, period, stale: data.stale, note: data.note } };
  }

  // Categorical / ordinal
  const cats = data.categories || [];
  const map: Record<string, string> = {};
  if (rule.kind === 'categories' && def?.id === 'commodity') {
    const ramp = hueRamp(COMMODITY_HUE[(fill || '').slice(10)] || 'amber', pal.dark);
    const steps = pal.dark ? [ramp[4], ramp[3], ramp[1]] : [ramp[4], ramp[3], ramp[1]];
    cats.forEach((c, i) => { map[c.key] = steps[i] || ramp[2]; });
  } else if (rule.kind === 'categories') {
    cats.forEach((c, i) => { map[c.key] = rule.colors[c.key] ? pick(rule.colors[c.key], pal.dark) : pal.cat[i % pal.cat.length]; });
  } else {
    cats.forEach((c, i) => { map[c.key] = c.key === 'former' ? pal.former : pal.cat[i % pal.cat.length]; });
  }
  for (const [iso, k] of Object.entries(data.values as Record<string, string>)) if (map[k]) colors[iso] = map[k];
  const rows = cats.filter((c) => Object.values(data.values).includes(c.key) || data.kind === 'ordinal').map((c) => ({ color: map[c.key], label: c.label }));
  const more = pal.dark ? 'Brighter' : 'Darker';
  const hint = def?.id === 'conflicts' ? `${more} red = deadlier` : def?.id === 'income' ? 'Green = higher income · red = lower' : def?.id === 'elections' ? 'Amber = election coming up' : def?.id === 'commodity' ? `${more} = bigger producer` : undefined;
  return { colors, legend: { title: data.label, hint, rows: [...rows, noData], note: data.note, sourceIds: data.sourceIds } };
}

/** Value text for the map tooltip, with a sign for centred layers. */
export function tooltipValue(def: LayerDef | undefined, v: { value: number; period: string }, unit?: string) {
  const s = fmtUnit(v.value, unit);
  return def?.color.kind === 'signed' && v.value > 0 ? `+${s}` : s;
}

// Sanctions from the four official consolidated lists:
//   US  — OFAC Specially Designated Nationals (sdn.csv + add.csv + alt.csv), public domain
//   UN  — Security Council consolidated list (XML)
//   EU  — consolidated list of financial sanctions (FSF CSV)
//   UK  — UK Sanctions List (FCDO CSV), falling back to the older OFSI consolidated list
// Every listing is tied to countries by nationality, citizenship and address. A programme named
// after a country (US "IRAN", EU "RUS", UK "Russia", UN "DPRK") counts as a programme targeting
// that country; everything else counts as individual listings connected to it.
// Graph people and companies are flagged only on an exact full-name match, shown as "possible match".
import { cached, fetchText } from './cache.js';
import { countryIdByName, getEntity, listByType, normName, byIso3 } from './graph.js';
import { recordChange, kvGet, kvSet, type Change } from './changes.js';
import { USER_AGENT } from './config.js';
import { runConnector } from './web/connectors.js';

export type ListId = 'US' | 'UN' | 'EU' | 'UK';
export const LIST_IDS: ListId[] = ['US', 'EU', 'UK', 'UN'];
export const LISTS: Record<ListId, { name: string; authority: string; short: string; sourceId: string; urls: string[]; search: string; imposer: string }> = {
  US: { name: 'OFAC Specially Designated Nationals list', authority: 'United States (Treasury, OFAC)', short: 'US (OFAC)', sourceId: 'ofac-sdn', imposer: 'country:USA',
    urls: ['https://www.treasury.gov/ofac/downloads/', 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/'], search: 'https://sanctionssearch.ofac.treas.gov/' },
  UN: { name: 'UN Security Council Consolidated List', authority: 'United Nations Security Council', short: 'UN Security Council', sourceId: 'un-consolidated', imposer: 'igo:un',
    urls: ['https://scsanctions.un.org/resources/xml/en/consolidated.xml'], search: 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list' },
  EU: { name: 'Consolidated list of persons, groups and entities subject to EU financial sanctions', authority: 'European Union', short: 'EU', sourceId: 'eu-fsf', imposer: 'igo:eu',
    urls: ['https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw'], search: 'https://www.sanctionsmap.eu/' },
  UK: { name: 'UK Sanctions List', authority: 'United Kingdom (FCDO / HM Treasury)', short: 'UK', sourceId: 'uk-sanctions', imposer: 'country:GBR',
    urls: ['https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv', 'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv'], search: 'https://www.gov.uk/government/publications/the-uk-sanctions-list' },
};
export const SANCTIONS_SOURCE_IDS = [...LIST_IDS.map((l) => LISTS[l].sourceId), 'federal-register', 'census-trade'];
/** Which list an imposing country or organisation runs. */
export const LIST_OF_IMPOSER: Record<string, ListId> = Object.fromEntries(LIST_IDS.map((l) => [LISTS[l].imposer, l]));

export interface Listing { list: ListId; id: string; name: string; aliases: string[]; type: 'individual' | 'entity' | 'vessel' | 'aircraft' | 'other'; programs: string[]; countries: string[]; listedOn?: string; }

// ───────────────────────── CSV (any delimiter, quoted fields) ─────────────────────────
export function parseDelimited(text: string, delim = ','): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== '' && c !== '\u001a'));
}
const clean = (s?: string) => { const v = (s || '').replace(/^﻿/, '').trim(); return v === '-0-' ? '' : v; };

// ───────────────────────── Country names ─────────────────────────
// Names used by the lists (and by the US Census) that the country matcher would not recognise.
const EXTRA_COUNTRY: Record<string, string> = {
  DPRK: 'PRK', 'NORTH KOREA': 'PRK', "DEMOCRATIC PEOPLE'S REPUBLIC OF KOREA": 'PRK', 'KOREA, NORTH': 'PRK', 'KOREA, SOUTH': 'KOR', 'REPUBLIC OF KOREA': 'KOR', BURMA: 'MMR',
  DRC: 'COD', DRCONGO: 'COD', 'DEMOCRATIC REPUBLIC OF THE CONGO': 'COD', 'CONGO, DEMOCRATIC REPUBLIC OF THE': 'COD', 'CONGO (KINSHASA)': 'COD', 'CONGO, REPUBLIC OF THE': 'COG', 'CONGO (BRAZZAVILLE)': 'COG',
  CAR: 'CAF', 'CENTRAL AFRICAN REPUBLIC': 'CAF', TALIBAN: 'AFG', 'IRAN (NUCLEAR)': 'IRN', 'RUSSIA (SECTORAL)': 'RUS', 'REPUBLIC OF GUINEA': 'GIN', 'GUINEA-BISSAU': 'GNB', 'SOUTH SUDAN': 'SSD',
  'IRAN, ISLAMIC REPUBLIC OF': 'IRN', 'RUSSIAN FEDERATION': 'RUS', 'SYRIAN ARAB REPUBLIC': 'SYR', 'VENEZUELA, BOLIVARIAN REPUBLIC OF': 'VEN', TURKIYE: 'TUR', 'TÜRKIYE': 'TUR', 'HONG KONG': 'HKG', PALESTINIAN: 'PSE',
  'WEST BANK ADMINISTERED BY ISRAEL': 'PSE', 'GAZA STRIP ADMINISTERED BY ISRAEL': 'PSE', 'WEST BANK': 'PSE', GAZA: 'PSE', MACEDONIA: 'MKD', MICRONESIA: 'FSM', SWAZILAND: 'SWZ', 'IVORY COAST': 'CIV', "COTE D'IVOIRE": 'CIV',
  'CZECH REPUBLIC': 'CZE', 'CAPE VERDE': 'CPV', 'EAST TIMOR': 'TLS', 'VATICAN CITY': 'VAT', 'HOLY SEE': 'VAT', 'UNITED STATES OF AMERICA': 'USA', USSR: 'RUS', 'MOLDOVA, REPUBLIC OF': 'MDA', 'LAO PEOPLE\'S DEMOCRATIC REPUBLIC': 'LAO',
  'TANZANIA, UNITED REPUBLIC OF': 'TZA', 'BOLIVIA (PLURINATIONAL STATE OF)': 'BOL', 'VIET NAM': 'VNM', 'BRUNEI DARUSSALAM': 'BRN', 'KYRGYZ REPUBLIC': 'KGZ', 'SLOVAK REPUBLIC': 'SVK', 'TAIWAN, PROVINCE OF CHINA': 'TWN',
};
let iso2Map: Map<string, string> | null = null;
const iso3OfIso2 = (iso2: string) => {
  if (!iso2Map) { iso2Map = new Map(); for (const [iso3, id] of byIso3) { const i2 = getEntity(id)?.iso2; if (i2) iso2Map.set(i2.toUpperCase(), iso3); } }
  return iso2Map.get(iso2.toUpperCase());
};
/** ISO3 for a country name as the lists and the US Census write it (also accepts ISO3, and ISO2 when `iso2` is set). */
export function countryIso(name?: string, iso2 = false): string | undefined {
  if (!name) return undefined;
  const n = name.trim().replace(/\s+/g, ' '); if (!n) return undefined;
  const up = n.toUpperCase();
  if (EXTRA_COUNTRY[up]) return EXTRA_COUNTRY[up];
  if (/^[A-Z]{3}$/.test(n) && byIso3.has(n)) return n;
  if (iso2 && /^[A-Z]{2}$/.test(up)) return iso3OfIso2(up);
  const st = n.replace(/^ST\.? /i, 'Saint ');
  const id = countryIdByName(st) || countryIdByName(st.replace(/\s*\(.*\)$/, ''))
    || (/^(.+), (?:the )?(.+)$/i.test(st) ? countryIdByName(st.replace(/^(.+), (?:the )?(.+)$/i, '$2 $1')) : undefined);
  return id?.slice(8);
}
/** One cell can hold several countries: "(1) Iran (2) Iraq", "Russia; Ukraine". */
const splitCountries = (v: string) => v.split(/\(\d+\)|;|\|/).map((x) => x.trim().replace(/,$/, '')).filter(Boolean);

/** Country a programme targets, if it is named after one. Ukraine-related US/EU regimes target Russia. */
const PROGRAM_TARGET_OVERRIDE: Record<string, string | null> = {
  'UKRAINE-EO13660': 'RUS', 'UKRAINE-EO13661': 'RUS', 'UKRAINE-EO13662': 'RUS', 'UKRAINE-EO13685': null, 'CAATSA - RUSSIA': 'RUS', 'CAATSA-RUSSIA': 'RUS', 'RUSSIA-EO14024': 'RUS',
  'EU:UKR': 'RUS', 'EU:TAQA': null, 'EU:ISIL': null, 'EU:TERR': null, 'EU:CHEM': null, 'EU:CYB': null, 'EU:HR': null, 'EU:HYBRID': 'RUS', 'EU:EUHR': null, 'EU:MD': 'MDA', 'EU:TUR': 'TUR',
  IFSR: 'IRN', IRGC: 'IRN', IFCA: 'IRN', ISA: 'IRN', 'NS-PLC': null, 'HK-EO13936': 'CHN', 'CMIC-EO13959': 'CHN', TALIBAN: 'AFG', 'BALKANS': null, 'BALKANS-EO14033': null, 'PAARSSR-EO13894': 'TUR', 'CAATSA - IRAN': 'IRN', 'HRIT-IR': 'IRN', 'HRIT-SY': 'SYR', 'FSE-IR': 'IRN', 'FSE-SY': 'SYR', DARFUR: 'SDN', 'PEESA-EO14039': 'RUS', 'WEST BANK-EO14115': null, 'ICC-EO14203': null,
  SDGT: null, SDNT: null, SDNTK: null, GLOMAG: null, TCO: null, MAGNIT: null, 'ILLICIT-DRUGS-EO14059': null, CYBER: null, CYBER2: null, CYBER3: null, CYBER4: null, NPWMD: null, FTO: null, 'ELECTION-EO13848': null,
  'AL-QAIDA': null, 'ISIL (DA’ESH) AND AL-QAIDA': null, "ISIL (DA'ESH) AND AL-QAIDA": null, 'HOSTAGES-EO14078': null, 'GLOBAL HUMAN RIGHTS': null, 'GLOBAL ANTI-CORRUPTION': null, 'COUNTER-TERRORISM': null,
  'COUNTER-TERRORISM (INTERNATIONAL)': null, 'COUNTER-TERRORISM (DOMESTIC)': null, 'CHEMICAL WEAPONS': null, 'GLOBAL IRREGULAR MIGRATION AND TRAFFICKING IN PERSONS': null, '1518': 'IRQ', '1267': null, '1988': 'AFG',
};
export function programTarget(list: ListId, program: string): string | undefined {
  const p = program.trim(); const P = p.toUpperCase();
  if (list === 'EU' && `EU:${P}` in PROGRAM_TARGET_OVERRIDE) return PROGRAM_TARGET_OVERRIDE[`EU:${P}`] || undefined;
  if (P in PROGRAM_TARGET_OVERRIDE) return PROGRAM_TARGET_OVERRIDE[P] || undefined;
  if (list === 'EU' && /^[A-Z]{3}$/.test(p)) return byIso3.has(p) ? p : undefined;
  // "VENEZUELA-EO13850" → VENEZUELA, "Iran (Nuclear)" → Iran, "DPRK3" → DPRK; the full name is tried first ("Guinea-Bissau").
  const full = countryIso(p); if (full) return full;
  const head = p.split(/[-–(]| - /)[0].trim().replace(/\d+$/, '');
  return head.length > 2 ? countryIso(head) : undefined;
}

// ───────────────────────── Parsers ─────────────────────────
/** OFAC legacy files: sdn.csv (entries), add.csv (addresses), alt.csv (aliases); no header rows. */
export function parseOfac(sdn: string, add = '', alt = ''): Listing[] {
  const addrs = new Map<string, string[]>(); const alts = new Map<string, string[]>();
  for (const r of parseDelimited(add)) { const c = countryIso(clean(r[4])); if (c) (addrs.get(r[0]) || addrs.set(r[0], []).get(r[0])!).push(c); }
  for (const r of parseDelimited(alt)) { const n = clean(r[3]); if (n) (alts.get(r[0]) || alts.set(r[0], []).get(r[0])!).push(n); }
  const out: Listing[] = [];
  for (const r of parseDelimited(sdn)) {
    const id = clean(r[0]); const name = clean(r[1]); if (!id || !name || !/^\d+$/.test(id)) continue;
    const t = clean(r[2]).toLowerCase();
    const programs = clean(r[3]).replace(/^\[|\]$/g, '').split(/\]\s*\[/).map((x) => x.trim()).filter(Boolean);
    const remarks = clean(r[11]);
    // Remarks: "...; nationality Iran; citizen Russia; Nationality of Registration Cyprus; ..."
    const nat = [...remarks.matchAll(/(?:nationality(?: of registration)?|citizen(?:ship)?)\s+([A-Za-z][A-Za-z .,'()-]+?)(?:;|\.(?:\s|$)|$)/gi)].map((m) => countryIso(m[1])).filter(Boolean) as string[];
    out.push({ list: 'US', id, name, aliases: (alts.get(id) || []).slice(0, 20), type: t === 'individual' ? 'individual' : t === 'vessel' ? 'vessel' : t === 'aircraft' ? 'aircraft' : 'entity', programs,
      countries: [...new Set([...(addrs.get(id) || []), ...nat])] });
  }
  return out;
}

const blocks = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
const tagAll = (block: string, tag: string) => blocks(block, tag).map((x) => x.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
const tag1 = (block: string, tag: string) => tagAll(block, tag)[0];
const xmlText = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");
/** UN consolidated list XML (<INDIVIDUAL> and <ENTITY> records). Countries: nationality and addresses. */
export function parseUn(xml: string): Listing[] {
  const out: Listing[] = [];
  for (const [kind, tag] of [['individual', 'INDIVIDUAL'], ['entity', 'ENTITY']] as const) {
    for (const b of blocks(xml, tag)) {
      const name = xmlText(['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME'].map((t) => tag1(b, t)).filter(Boolean).join(' '));
      const id = tag1(b, 'REFERENCE_NUMBER') || tag1(b, 'DATAID'); if (!name || !id) continue;
      const nat = blocks(b, 'NATIONALITY').flatMap((x) => tagAll(x, 'VALUE'));
      const addr = [...blocks(b, 'INDIVIDUAL_ADDRESS'), ...blocks(b, 'ENTITY_ADDRESS')].flatMap((x) => tagAll(x, 'COUNTRY'));
      const countries = [...nat, ...addr].map((x) => countryIso(xmlText(x))).filter(Boolean) as string[];
      out.push({ list: 'UN', id, name, aliases: [...blocks(b, 'INDIVIDUAL_ALIAS'), ...blocks(b, 'ENTITY_ALIAS')].map((a) => tag1(a, 'ALIAS_NAME')).filter(Boolean).map(xmlText).slice(0, 20),
        type: kind, programs: [xmlText(tag1(b, 'UN_LIST_TYPE') || 'UN')], countries: [...new Set(countries)], listedOn: tag1(b, 'LISTED_ON')?.slice(0, 10) });
    }
  }
  return out;
}

/** Header-based reader for the EU (';') and UK (',') files — one row per name or address, grouped by id. */
export function parseByHeader(text: string, list: 'EU' | 'UK'): Listing[] {
  const first = text.slice(0, 4000);
  const delim = list === 'EU' ? ((first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',') : ',';
  let rows = parseDelimited(text, delim);
  // The UK files start with a "Last Updated" / "Report Date" line before the header.
  const hi = rows.findIndex((r) => r.some((c) => /^(Group ID|Entity_LogicalId|Unique ID|OFSI Group ID)$/i.test(clean(c))));
  if (hi < 0) return [];
  const h = rows[hi].map((c) => clean(c)); rows = rows.slice(hi + 1);
  const col = (...res: RegExp[]) => { for (const re of res) { const i = h.findIndex((x) => re.test(x)); if (i >= 0) return i; } return -1; };
  const idC = col(/^Unique ID$/i, /^Entity_LogicalId$/i, /^Group ID$/i, /^OFSI Group ID$/i);
  const wholeC = col(/^NameAlias_WholeName$/i, /^Full Name$/i, /^Name 6$/i, /^Name$/i);
  const partsC = h.map((x, i) => (/^Name [1-5]$/i.test(x) ? i : -1)).filter((i) => i >= 0);
  const typeC = col(/^Entity_SubjectType$/i, /^Entity_SubjectType_ClassificationCode$/i, /^Designation Type$/i, /^Group Type$/i, /^Entity Type$/i, /^Individual, Entity, Ship$/i);
  const progC = col(/^Entity_Regulation_Programme$/i, /^Regime Name$/i, /^Regime$/i);
  const dateCs = [/^Date Designated$/i, /^UK Sanctions List Date Designated$/i, /^Listed On$/i, /^Entity_DesignationDate$/i, /^Entity_Regulation_PublicationDate$/i].map((re) => h.findIndex((x) => re.test(x))).filter((i) => i >= 0);
  const primaryC = col(/^Name type$/i, /^Alias Type$/i);
  // Nationality, citizenship and address only (not place of birth, passports or a ship's flag).
  const ctryC = h.map((x, i) => (/^(Address|Citizenship)_Country(Iso2Code|Description)$/i.test(x) || /^(Country|Address Country|Nationality|Nationality\(ies\)|Nationality\(\/ies\)|Nationalities)$/i.test(x) ? i : -1)).filter((i) => i >= 0);
  const by = new Map<string, Listing>();
  for (const r of rows) {
    const id = clean(r[idC]); if (!id) continue;
    let name = clean(r[wholeC]);
    if (list === 'UK' && partsC.length) { const parts = partsC.map((i) => clean(r[i])).filter(Boolean); name = [...parts, name].filter(Boolean).join(' '); }
    let cur = by.get(id);
    if (!cur) { cur = { list, id, name, aliases: [], type: 'other', programs: [], countries: [] }; by.set(id, cur); }
    else if (name && name !== cur.name) {
      if (!cur.name) cur.name = name;
      else if (primaryC >= 0 && /^primary name$/i.test(clean(r[primaryC]))) { if (!cur.aliases.includes(cur.name)) cur.aliases.unshift(cur.name); cur.name = name; cur.aliases = cur.aliases.filter((a) => a !== name).slice(0, 20); }
      else if (!cur.aliases.includes(name) && cur.aliases.length < 20) cur.aliases.push(name);
    }
    const t = clean(r[typeC]).toLowerCase();
    if (cur.type === 'other' && t) cur.type = /person|individual|^p$/.test(t) ? 'individual' : /ship|vessel/.test(t) ? 'vessel' : 'entity';
    const p = clean(r[progC]); if (p && !cur.programs.includes(p)) cur.programs.push(p);
    const d = dateCs.map((i) => clean(r[i])).find(Boolean) || '';
    const isoDate = /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : /^(\d{2})\/(\d{2})\/(\d{4})/.test(d) ? `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : '';
    if (isoDate && (!cur.listedOn || isoDate < cur.listedOn)) cur.listedOn = isoDate;
    for (const ci of ctryC) {
      const v = clean(r[ci]); if (!v) continue;
      for (const part of /Iso2Code$/i.test(h[ci]) ? [v] : splitCountries(v)) {
        const c3 = countryIso(part, /Iso2Code$/i.test(h[ci]));
        if (c3 && !cur.countries.includes(c3)) cur.countries.push(c3);
      }
    }
  }
  return [...by.values()].filter((l) => l.name);
}

// ───────────────────────── Name matching ─────────────────────────
const LEGAL_FORM = /\b(public joint[- ]stock company|open joint[- ]stock company|closed joint[- ]stock company|joint[- ]stock company|limited liability company|pjsc|ojsc|cjsc|jsc|llc|ltd|limited|plc|inc|corp|corporation|company|co|gmbh|ag|sa|nv|bv|ao|oao|zao|ooo|fze|fzco|sarl|spa|srl)\b\.?/gi;
/** Keys a name is matched under. People: as written, "LAST, First" turned round, and first + last name
 *  (lists add patronymics and middle names that profiles leave out). Companies: without legal forms. */
export function nameKeys(name: string, individual: boolean): string[] {
  const keys = new Set<string>();
  const add = (x: string, minWords = 2) => { const k = normName(x); if (k && k.split(' ').length >= minWords) keys.add(k); };
  if (individual) {
    const m = /^([^,]+),\s*(.+)$/.exec(name.trim());
    const forward = m ? `${m[2]} ${m[1]}` : name;
    add(name); add(forward);
    const w = normName(forward).split(' ').filter(Boolean);
    if (w.length > 2) add(`${w[0]} ${w[w.length - 1]}`);
  } else {
    add(name);
    const k = normName(name.replace(LEGAL_FORM, ' ')); if (k.split(' ').length >= 2 || k.length >= 6) keys.add(k);
  }
  return [...keys];
}

// ───────────────────────── Loading ─────────────────────────
async function loadList(id: ListId): Promise<{ listings: Listing[]; fetchedAt: string; stale: boolean }> {
  const ua = { 'User-Agent': USER_AGENT };
  const r = await cached(`sanctions:${id}:v2`, 12 * 3600, async () => {
    let lastErr: unknown;
    for (const url of LISTS[id].urls) {
      try {
        if (id === 'US') {
          const names = url.includes('sanctionslistservice') ? ['SDN.CSV', 'ADD.CSV', 'ALT.CSV'] : ['sdn.csv', 'add.csv', 'alt.csv'];
          const [sdn, add, alt] = await Promise.all(names.map((f) => fetchText(`${url}${f}`, ua, 90000)));
          const out = parseOfac(sdn, add, alt); if (out.length > 1000) return out;
          throw new Error(`only ${out.length} entries`);
        }
        const text = await fetchText(url, ua, 120000);
        const out = id === 'UN' ? parseUn(text) : parseByHeader(text, id);
        if (out.length > 100) return out;
        throw new Error(`only ${out.length} entries`);
      } catch (e) { lastErr = e; }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`${id} list unavailable`);
  });
  return { listings: r.data, fetchedAt: r.fetchedAt, stale: r.stale };
}

export interface CountrySanctions { programmes: { list: ListId; program: string; count: number; targeted: boolean }[]; listings: Record<ListId, number>; recent: { list: ListId; name: string; type: string; program: string; date: string }[]; byType: Record<string, number>; }
interface State { at: string; byCountry: Map<string, CountrySanctions>; lists: Record<string, { count: number; fetchedAt?: string; stale?: boolean; error?: string }>; byName: Map<string, Listing[]>; programs: Record<ListId, Map<string, { count: number; target?: string; latest?: string }>> }
let state: State | null = null;
const BASELINE = 'base'; // first-seen marker for entries already listed when the terminal first loaded the list

export async function refreshSanctions() {
  const results = await Promise.allSettled(LIST_IDS.map((id) => loadList(id)));
  const byCountry = new Map<string, CountrySanctions>(); const lists: State['lists'] = {}; const byName = new Map<string, Listing[]>();
  const programs = { US: new Map(), UN: new Map(), EU: new Map(), UK: new Map() } as State['programs'];
  const prev = kvGet<Record<string, string>>('sanctions:firstSeen', {});
  const firstSeen: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);
  const newOnes: Listing[] = [];
  LIST_IDS.forEach((id, i) => {
    const r = results[i];
    if (r.status !== 'fulfilled') {
      lists[id] = { count: 0, error: String((r.reason as any)?.message || r.reason).slice(0, 160) };
      for (const [k, v] of Object.entries(prev)) if (k.startsWith(`${id}:`)) firstSeen[k] = v; // keep history for a list that failed this time
      return;
    }
    lists[id] = { count: r.value.listings.length, fetchedAt: r.value.fetchedAt, stale: r.value.stale };
    const hadBaseline = Object.keys(prev).some((k) => k.startsWith(`${id}:`));
    for (const l of r.value.listings) {
      const key = `${id}:${l.id}`;
      firstSeen[key] = prev[key] || (hadBaseline ? today : BASELINE);
      if (!prev[key] && hadBaseline) newOnes.push(l);
      for (const k of new Set([l.name, ...l.aliases].flatMap((n) => nameKeys(n, l.type === 'individual')))) (byName.get(k) || byName.set(k, []).get(k)!).push(l);
      const date = l.listedOn || (firstSeen[key] !== BASELINE ? firstSeen[key] : '');
      for (const p of l.programs) {
        const pr = programs[id].get(p) || programs[id].set(p, { count: 0, target: programTarget(id, p) }).get(p)!;
        pr.count++; if (date && (!pr.latest || date > pr.latest)) pr.latest = date;
      }
      const targets = new Set(l.programs.map((p) => programTarget(id, p)).filter(Boolean) as string[]);
      for (const c of new Set([...l.countries, ...targets])) {
        const cs = byCountry.get(c) || byCountry.set(c, { programmes: [], listings: { US: 0, UN: 0, EU: 0, UK: 0 }, recent: [], byType: {} }).get(c)!;
        cs.listings[id]++; cs.byType[l.type] = (cs.byType[l.type] || 0) + 1;
        for (const p of l.programs) {
          const ex = cs.programmes.find((x) => x.list === id && x.program === p);
          if (ex) ex.count++; else cs.programmes.push({ list: id, program: p, count: 1, targeted: programTarget(id, p) === c });
        }
        if (date && date >= since) cs.recent.push({ list: id, name: l.name, type: l.type, program: l.programs[0] || '', date });
      }
    }
  });
  for (const cs of byCountry.values()) { cs.programmes.sort((a, b) => Number(b.targeted) - Number(a.targeted) || b.count - a.count); cs.recent.sort((a, b) => b.date.localeCompare(a.date)); cs.recent = cs.recent.slice(0, 40); }
  kvSet('sanctions:firstSeen', firstSeen);
  state = { at: new Date().toISOString(), byCountry, lists, byName, programs };
  nameIndex = null;
  // New designations become changes, one per list and country (the first load of a list is the baseline).
  if (newOnes.length) {
    const groups = new Map<string, Listing[]>();
    for (const l of newOnes) {
      const targets = l.programs.map((p) => programTarget(l.list, p)).filter(Boolean) as string[];
      for (const c of new Set(l.countries.length ? l.countries : targets.length ? targets : ['—'])) { const k = `${l.list}|${c}`; (groups.get(k) || groups.set(k, []).get(k)!).push(l); }
    }
    for (const [k, ls] of groups) {
      const [list, c] = k.split('|') as [ListId, string];
      const placeId = c !== '—' ? `country:${c}` : undefined;
      const matched = [...new Set(ls.flatMap((l) => matchEntities(l)))].slice(0, 10);
      recordChange({
        key: `sanctions:${list}:${c}:${today}:${ls.map((l) => l.id).sort().join(',').slice(0, 160)}`, kind: 'sanctions', entityIds: [...(placeId ? [placeId] : []), ...matched, LISTS[list].imposer],
        title: `${LISTS[list].authority.split(' (')[0]} sanctioned ${ls.length} ${ls.length === 1 ? 'person or entity' : 'people and entities'}${placeId ? ` connected to ${getEntity(placeId)?.name || c}` : ''}: ${ls.slice(0, 3).map((l) => l.name).join('; ')}${ls.length > 3 ? '…' : ''}`,
        detail: `Programmes: ${[...new Set(ls.flatMap((l) => l.programs))].slice(0, 5).join(', ')}`, url: LISTS[list].search, sourceId: LISTS[list].sourceId, quality: 'official', importance: ls.length >= 20 ? 7 : 6, at: new Date().toISOString(),
      } as Change);
    }
  }
  void runConnector('sanctions-web').catch(() => undefined); // sanctions links in the web follow the new lists
  return state;
}

// People and companies in the graph by normalised full name (built once per refresh).
let nameIndex: Map<string, { id: string; person: boolean }[]> | null = null;
function entityNames() {
  if (nameIndex) return nameIndex;
  nameIndex = new Map();
  for (const e of [...listByType('person'), ...listByType('company')]) for (const k of new Set([e.name, ...(e.aliases || [])].flatMap((n) => nameKeys(n, e.type === 'person')))) {
    const list = nameIndex.get(k) || nameIndex.set(k, []).get(k)!; if (!list.some((x) => x.id === e.id)) list.push({ id: e.id, person: e.type === 'person' });
  }
  return nameIndex;
}
/** Graph people/companies with the same name as a listing (by name or alias). */
function matchEntities(l: Listing) {
  const out = new Set<string>();
  for (const k of new Set([l.name, ...l.aliases].flatMap((n) => nameKeys(n, l.type === 'individual')))) for (const e of entityNames().get(k) || []) if (l.type === 'individual' ? e.person : l.type === 'entity' && !e.person) out.add(e.id);
  return [...out];
}
/** Listings with the same name as an entity (people ↔ individuals, companies ↔ entities, vessels never). */
export function listingsFor(entityId: string) {
  const e = getEntity(entityId); if (!e || !state || (e.type !== 'person' && e.type !== 'company')) return [];
  const out = new Map<string, Listing>();
  for (const k of new Set([e.name, ...(e.aliases || [])].flatMap((n) => nameKeys(n, e.type === 'person')))) for (const l of state.byName.get(k) || []) if (e.type === 'person' ? l.type === 'individual' : l.type === 'entity') out.set(`${l.list}:${l.id}`, l);
  return [...out.values()].map((l) => ({ list: l.list, authority: LISTS[l.list].authority, name: l.name, programs: l.programs, listedOn: l.listedOn, countries: l.countries, search: LISTS[l.list].search, sourceId: LISTS[l.list].sourceId }));
}
export function sanctionsFor(iso3: string) { return state?.byCountry.get(iso3) || null; }
/** Regimes run by one list (the EU's, the UN's, the US's, the UK's) with entry counts and target countries. */
export function regimesOf(list: ListId) {
  if (!state) return [];
  return [...state.programs[list]].map(([program, v]) => ({ program, count: v.count, latest: v.latest, target: v.target ? { id: `country:${v.target}`, name: getEntity(`country:${v.target}`)?.name || v.target, flag: getEntity(`country:${v.target}`)?.flag } : null }))
    .sort((a, b) => b.count - a.count);
}
export function sanctionsStatus() { return state ? { at: state.at, lists: state.lists } : null; }
export function sanctionsMeta() { return LIST_IDS.map((id) => { const { urls: _urls, ...meta } = LISTS[id]; return { id, ...meta, ...(state?.lists[id] || {}) }; }); }

/** Map: per country, the strongest tier for one list (or all). */
export function sanctionsLayer(list: ListId | 'ALL') {
  const values: Record<string, string> = {}; const detail: Record<string, string> = {};
  if (!state) return { values, detail };
  for (const [iso, cs] of state.byCountry) {
    const progs = cs.programmes.filter((p) => list === 'ALL' || p.list === list);
    const n = list === 'ALL' ? Object.values(cs.listings).reduce((a, b) => a + b, 0) : cs.listings[list];
    if (!n) continue;
    const targeted = progs.filter((p) => p.targeted);
    values[iso] = targeted.length ? 'programme' : n >= 25 ? 'many' : 'some';
    detail[iso] = `${targeted.length ? `Country programmes: ${[...new Set(targeted.map((p) => `${list === 'ALL' ? `${LISTS[p.list].short} ` : ''}${p.program}`))].slice(0, 4).join(', ')}. ` : ''}${n.toLocaleString('en-US')} listed people/entities connected${list === 'ALL' ? ` (US ${cs.listings.US}, EU ${cs.listings.EU}, UK ${cs.listings.UK}, UN ${cs.listings.UN})` : ''}.`;
  }
  return { values, detail };
}

export function startSanctions() {
  setTimeout(() => { void refreshSanctions().catch((e) => console.warn('[sanctions]', e.message)); }, 15000).unref();
  setInterval(() => { void refreshSanctions().catch(() => {}); }, 6 * 3600_000).unref();
}

export const _test = { setState: (s: any) => { state = s; nameIndex = null; }, splitCountries };

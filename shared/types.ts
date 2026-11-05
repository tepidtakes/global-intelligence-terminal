// Shared vocabulary for server and client. Every record in the app is an Entity or a
// Relationship between two entities; user data points at entity ids.

export type EntityType =
  | 'region' | 'country' | 'state' | 'county' | 'city'
  | 'igo' | 'institution' | 'person' | 'party' | 'company' | 'commodity' | 'industry' | 'event';

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  region: 'Region', country: 'Country', state: 'State / province', county: 'County', city: 'City',
  igo: 'Organization', institution: 'Institution', person: 'Person', party: 'Political party', company: 'Company',
  commodity: 'Commodity / product', industry: 'Industry', event: 'Event',
};

/** How trustworthy / fresh a value is. Shown next to every number. */
export type DataQuality = 'live' | 'delayed' | 'official' | 'estimate' | 'historical' | 'curated' | 'manual' | 'community' | 'forecast' | 'reported';

/** Every quality label, for validation. 'reported' = stated by trusted news outlets, not yet in a structured record. */
export const DATA_QUALITIES: DataQuality[] = ['live', 'delayed', 'official', 'estimate', 'historical', 'curated', 'manual', 'community', 'forecast', 'reported'];

export interface Source {
  id: string;
  name: string;
  publisher?: string;
  url?: string;
  license?: string;
}

export interface Fact {
  label: string;
  value: string | number;
  unit?: string;
  period?: string;   // reporting period the value describes, e.g. "2025"
  asOf?: string;     // when the value was observed / last verified
  retrievedAt?: string; // when a live value was fetched from its source (ISO timestamp)
  sourceId: string;
  quality: DataQuality;
  note?: string;
}

export interface TimelineItem {
  date: string;      // ISO date or year
  title: string;
  detail?: string;
  sourceId?: string;
}

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  aliases?: string[];
  summary?: string;
  parentId?: string;
  iso3?: string; iso2?: string; ccn3?: string; fips?: string;
  coords?: [number, number]; // lon, lat
  flag?: string;             // emoji flag for countries
  depth: 'curated' | 'baseline';
  facts?: Fact[];
  attrs?: Record<string, any>;
  timeline?: TimelineItem[];
  sources?: string[];        // source ids cited by the narrative fields
}

export type RelType =
  | 'member_of' | 'head_of_state' | 'head_of_government' | 'holds_office' | 'leads'
  | 'belongs_to_party' | 'party_in' | 'governing_party' | 'located_in' | 'capital_of'
  | 'headquartered_in' | 'operates_in' | 'produces' | 'exports' | 'imports' | 'consumes'
  | 'trade_partner' | 'subsidiary_of' | 'competitor_of' | 'in_industry' | 'affects' | 'uses'
  | 'in_region' | 'shareholder_of' | 'borders' | 'supplies' | 'candidate_in'
  // Links computed from live data: trade flows, sanctions programmes, news co-mentions, central banks.
  | 'trades_with' | 'sanctions' | 'mentioned_with' | 'central_bank_of';

export interface Relationship {
  id: string;
  from: string;
  to: string;
  type: RelType;
  role?: string;
  rank?: number;
  validFrom?: string;
  validTo?: string;  // undefined = current
  sourceId?: string;
  note?: string;
  origin?: string;   // set on relationships loaded from a live source (replaced on refresh)
  /** Size of the link where it has one (trade in US$, stories in common, listings…), used to rank and draw it. */
  value?: number; unit?: string; period?: string;
  /** Extra figures carried by the link (exports and imports, programmes…). */
  data?: Record<string, any>;
  /** Other sources that report the same link (shown as "✓ 2 sources"). */
  alsoIn?: string[];
  /** Sources that disagree with this link (e.g. another source says the membership ended). */
  disputes?: { sourceId: string; detail: string }[];
  retrievedAt?: string;
}

/** Forward label is read "from → to", inverse is shown on the "to" entity's profile. */
export const REL_LABELS: Record<RelType, { fwd: string; inv: string }> = {
  member_of: { fwd: 'Member of', inv: 'Members' },
  head_of_state: { fwd: 'Head of state of', inv: 'Head of state' },
  head_of_government: { fwd: 'Head of government of', inv: 'Head of government' },
  holds_office: { fwd: 'Office held', inv: 'Officeholders' },
  leads: { fwd: 'Leads', inv: 'Leadership' },
  belongs_to_party: { fwd: 'Party', inv: 'Affiliated politicians' },
  party_in: { fwd: 'Political party in', inv: 'Political parties' },
  governing_party: { fwd: 'Governing party in', inv: 'Governing coalition' },
  located_in: { fwd: 'Located in', inv: 'Contains' },
  capital_of: { fwd: 'Capital of', inv: 'Capital' },
  headquartered_in: { fwd: 'Headquartered in', inv: 'Headquartered here' },
  operates_in: { fwd: 'Operates in', inv: 'Companies operating here' },
  produces: { fwd: 'Produces', inv: 'Major producers' },
  exports: { fwd: 'Major exports', inv: 'Major exporters' },
  imports: { fwd: 'Major imports', inv: 'Major importers' },
  consumes: { fwd: 'Consumes', inv: 'Major consumers' },
  trade_partner: { fwd: 'Trading partner', inv: 'Trading partner of' },
  subsidiary_of: { fwd: 'Parent company', inv: 'Subsidiaries' },
  competitor_of: { fwd: 'Competitors', inv: 'Competitors' },
  in_industry: { fwd: 'Industry', inv: 'Companies' },
  affects: { fwd: 'Affects', inv: 'Events & catalysts' },
  uses: { fwd: 'Key inputs', inv: 'Used by' },
  in_region: { fwd: 'Region', inv: 'Countries' },
  shareholder_of: { fwd: 'Shareholder of', inv: 'Significant shareholders' },
  borders: { fwd: 'Neighbors', inv: 'Neighbors' },
  supplies: { fwd: 'Supplies', inv: 'Key suppliers' },
  candidate_in: { fwd: 'Candidate in', inv: 'Candidates' },
  trades_with: { fwd: 'Trade partners (as it reports)', inv: 'Trade partners (as they report)' },
  sanctions: { fwd: 'Sanctions programmes against', inv: 'Under sanctions programmes of' },
  mentioned_with: { fwd: 'In the news with', inv: 'In the news with' },
  central_bank_of: { fwd: 'Central bank of', inv: 'Central bank' },
};

/** A relationship as seen from one entity, with the other side resolved. */
export interface RelView {
  rel: Relationship;
  direction: 'out' | 'in';
  label: string;
  other: EntityStub;
}

export interface EntityStub {
  id: string;
  type: EntityType;
  name: string;
  flag?: string;
  summary?: string;
  parentName?: string;
}

export interface SearchHit extends EntityStub {
  score: number;
  matched?: string;           // alias that matched, if not the name
  position?: PositionSummary; // user's open position, if any
}

export interface NoteHit {
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
  entityIds: string[];
}

export interface Note {
  id: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  category?: string | null;
  tags: string[];
  pinned: boolean;
  entityIds: string[];
  createdAt: string;
  updatedAt: string;
  attachments?: Attachment[];
}

export interface Attachment { id: string; filename: string; mime: string; size: number; createdAt: string; }

export interface Transaction {
  id: string;
  kind: 'open' | 'add' | 'reduce' | 'close';
  date: string;
  price: number;
  quantity?: number | null;
  fees?: number | null;
  note?: string | null;
}

export interface Position {
  id: string;
  entityId: string;
  side: 'long' | 'short';
  status: 'open' | 'closed';
  portfolio?: string | null;
  thesis?: string | null;
  transactions: Transaction[];
  createdAt: string;
  updatedAt: string;
}

export interface PositionSummary {
  id: string;
  side: 'long' | 'short';
  status: 'open' | 'closed';
  avgEntry: number;
  firstEntryDate: string;
  quantity?: number | null;
}

export interface Catalyst {
  id: string;
  title: string;
  eventEntityId?: string | null;
  eventDate?: string | null;
  status: 'pending' | 'occurred' | 'cancelled';
  expectedOutcome?: string | null;
  scenarios?: string | null;
  implications?: string | null;
  thesis?: string | null;
  postAnalysis?: string | null;
  entityIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Watchlist { id: string; name: string; entityIds: string[]; }

export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  change?: number;
  changePct?: number;
  previousClose?: number;
  exchange?: string;
  marketTime: string;     // ISO timestamp of the quote
  quality: DataQuality;   // 'delayed'
  sourceId: string;
  history?: { t: string; c: number }[];
  dayHigh?: number; dayLow?: number;
  fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number;
}

export interface SeriesPoint { period: string; value: number; }
export interface Indicator {
  code: string;
  label: string;
  unit: string;
  latest?: SeriesPoint;
  series: SeriesPoint[];
  sourceId: string;
}

export function slug(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Pure helpers for trusted-news ingestion: feed parsing (RSS 2.0, Atom, RSS 1.0/RDF),
// URL and title normalisation, story clustering, entity tagging and headline "signals".
// No I/O here, so every rule can be checked offline (npm run check:news).

// ───────────────────────── Feed parsing ─────────────────────────
export interface FeedItem { title: string; url: string; summary?: string; published?: string; guid?: string; sourceName?: string; sourceUrl?: string; }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', eacute: 'é', egrave: 'è', aacute: 'á', oacute: 'ó', uacute: 'ú', iacute: 'í', ntilde: 'ñ', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß' };
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const unCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
/** Text content of markup: CDATA unwrapped, tags removed, entities decoded (twice: feeds often double-encode). */
export function textOf(s: string) {
  const once = decodeEntities(unCdata(s).replace(/<[^>]+>/g, ' '));
  return decodeEntities(once.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function tag(block: string, name: string) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? m[1] : undefined;
}
function attr(block: string, name: string, a: string) {
  const m = new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`, 'i').exec(block);
  return m ? decodeEntities(m[1]) : undefined;
}
function isoDate(s?: string) {
  if (!s) return undefined;
  const t = Date.parse(s.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const atom = !blocks.length ? [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]) : [];
  for (const b of blocks) {
    const title = textOf(tag(b, 'title') || '');
    let url = textOf(tag(b, 'link') || '') || attr(b, 'item', 'rdf:about') || '';
    const guid = textOf(tag(b, 'guid') || '');
    if (!/^https?:/.test(url) && /^https?:/.test(guid)) url = guid;
    if (!title || !/^https?:/.test(url)) continue;
    const desc = tag(b, 'description') || tag(b, 'content:encoded');
    out.push({
      title, url, guid: guid || undefined,
      summary: desc ? textOf(desc).slice(0, 400) || undefined : undefined,
      published: isoDate(textOf(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated') || '')),
      sourceName: tag(b, 'source') ? textOf(tag(b, 'source')!) : undefined,
      sourceUrl: attr(b, 'source', 'url'),
    });
  }
  for (const b of atom) {
    const title = textOf(tag(b, 'title') || '');
    const links = [...b.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => ({ href: /href="([^"]+)"/.exec(m[1])?.[1], rel: /rel="([^"]+)"/.exec(m[1])?.[1] || 'alternate' }));
    const url = decodeEntities((links.find((l) => l.rel === 'alternate') || links[0])?.href || '');
    if (!title || !/^https?:/.test(url)) continue;
    const desc = tag(b, 'summary') || tag(b, 'content');
    out.push({ title, url, guid: textOf(tag(b, 'id') || '') || undefined, summary: desc ? textOf(desc).slice(0, 400) || undefined : undefined, published: isoDate(textOf(tag(b, 'published') || tag(b, 'updated') || '')) });
  }
  return out;
}

// ───────────────────────── Normalisation ─────────────────────────
const TRACKING = /^(utm_|ref$|ref_|cmpid|cmp$|ocid|mod$|smid|fbclid|gclid|mc_|at_|taid|xtor|ito$|guccounter|rss$|feed$|src$)/i;
/** Canonical article URL: https, no tracking parameters, no fragment, no trailing slash. */
export function canonicalUrl(u: string) {
  try {
    const url = new URL(u);
    url.protocol = 'https:'; url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
    return url.toString().replace(/\/(\?|$)/, '$1');
  } catch { return u; }
}

/** "Headline - Reuters" → "Headline" when the suffix is the publisher's name. */
export function stripPublisherSuffix(title: string, publisher?: string) {
  if (publisher) for (const sep of [' - ', ' | ', ' – ', ' — ']) if (title.endsWith(sep + publisher)) return title.slice(0, -(publisher.length + sep.length)).trim();
  return title.replace(/\s+[|–—-]\s+(BBC News|Reuters|AP News|The Guardian|Al Jazeera|DW|France 24|NPR|CNBC)$/, '').trim();
}

const STOP = new Set('a an the and or of to in on for at by with from as is are was were be been it its this that after over into amid says said say new will would could may might than more about up down out not no but his her their they he she we you who what when where why how live latest update updates news video watch analysis opinion explainer'.split(' '));
/** Content words of a headline, for near-duplicate detection across outlets. */
export function titleKey(title: string) {
  return [...new Set(title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]s\b/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)))];
}
export function similarity(a: string[], b: string[]) {
  if (!a.length || !b.length) return { jaccard: 0, shared: 0 };
  const sb = new Set(b); let shared = 0;
  for (const w of a) if (sb.has(w)) shared++;
  return { jaccard: shared / (a.length + b.length - shared), shared };
}
/** Same story? Generous enough for rephrased wire copy, strict enough to keep separate stories apart. */
export const sameStory = (a: string[], b: string[]) => {
  const s = similarity(a, b);
  // Short headlines need high overlap; longer rewrites of the same story share many words.
  return (s.shared >= 3 && s.jaccard >= 0.45) || (s.shared >= 5 && s.jaccard >= 0.3);
};

// ───────────────────────── Tokens ─────────────────────────
/** `poss`: had a possessive 's; `brk`: punctuation (":", ",", "–"…) separates it from the previous token. */
export interface Token { raw: string; low: string; start: number; end: number; poss?: boolean; brk?: boolean; }
const WORD = /[\p{L}\p{N}]+(?:[’'&.\-/][\p{L}\p{N}]+)*\+?/gu;
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let prevEnd = 0;
  for (const m of text.matchAll(WORD)) {
    const raw = m[0].replace(/['’]s$/u, '');
    const gap = text.slice(prevEnd, m.index!);
    out.push({ raw, low: raw.toLowerCase(), start: m.index!, end: m.index! + m[0].length, poss: raw !== m[0] || undefined, brk: /[^\s'’"“”‘]/.test(gap) || undefined });
    prevEnd = m.index! + m[0].length;
  }
  return out;
}

// ───────────────────────── Entity tagging ─────────────────────────
export type TermContext = 'business' | 'politics' | 'commodity';
export interface TermSpec { text: string; ids: string[]; caseSensitive: boolean; context?: TermContext; via: 'name' | 'alias' | 'demonym' | 'capital' | 'surname';
  /** Also a common first name ("Chad Smith", "Jordan Peele"): skip when a capitalised word follows in a sentence-case headline. */
  firstName?: boolean; }
export interface Tag { id: string; in: 'title' | 'summary'; via: TermSpec['via']; }
interface Term extends TermSpec { tokens: string[]; }

export const CONTEXT: Record<TermContext, RegExp> = {
  business: /\b(shares?|stocks?|earnings|profits?|revenues?|sales|CEO|chief executive|chairman|board|company|companies|firm|group|investors?|deal|acquisitions?|acquires?|buys?|merger|results|quarter(?:ly)?|market value|valuation|layoffs|jobs|job cuts|workers|employees|staff|corporate|iPhone|iPad|Mac|AWS|Prime|Instagram|WhatsApp|Facebook|chips?|chipmaker|retailer|oil major|bank|lender|miner|carmaker|automaker|drugmaker|brand|stake|IPO|listing|dividend|buyback|lawsuit|antitrust|regulators?|Inc|Corp|plc|launch(?:es|ed)?|unveils?|recalls?|factory|plant|supplier|contract|orders?|outlook|guidance|forecast)\b/i,
  politics: /\b(party|parties|election|elections|vote|voters?|polls?|polling|parliament|parliamentary|MPs?|lawmakers|leader|leadership|coalition|government|opposition|campaign|Senate|House|seats?|candidates?|conference|manifesto|primary|primaries|majority|minister|cabinet|by-election|midterms?)\b/i,
  commodity: /\b(prices?|futures|output|exports?|imports?|production|producers?|supply|supplies|demand|barrels?|bpd|tonnes?|tons|ounces?|bushels?|OPEC\+?|markets?|mines?|mining|harvests?|crops?|shipments?|tariffs?|stockpiles?|inventories|reserves|refiner(?:y|ies)|traders?|benchmark|rally|slump|surge|plunge|shortage|glut|export controls|chipmakers?|semiconductor)\b/i,
};

/** Matches graph names in text. Longest match wins; ambiguous names are resolved by co-mentions. */
export class Tagger {
  private byFirst = new Map<string, Term[]>();
  constructor(specs: TermSpec[], private homeOf: (id: string) => string | undefined = () => undefined, private typeRank: (id: string) => number = () => 0) {
    const merged = new Map<string, Term>();
    for (const s of specs) {
      const tokens = tokenize(s.text).map((t) => (s.caseSensitive ? t.raw : t.low));
      if (!tokens.length) continue;
      const key = `${s.caseSensitive ? 'cs' : 'ci'}|${tokens.join(' ')}|${s.context || ''}`;
      const prev = merged.get(key);
      if (prev) { for (const id of s.ids) if (!prev.ids.includes(id)) prev.ids.push(id); continue; }
      merged.set(key, { ...s, ids: [...s.ids], tokens });
    }
    for (const t of merged.values()) {
      const k = t.tokens[0].toLowerCase();
      (this.byFirst.get(k) || this.byFirst.set(k, []).get(k)!).push(t);
    }
    for (const list of this.byFirst.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
  }

  private scan(text: string, context: string) {
    const toks = tokenize(text);
    // Title Case headline? Judge by longer words after the first, which are lower-case in sentence case.
    const longer = toks.slice(1).filter((t) => t.raw.length >= 4 && /^\p{L}/u.test(t.raw));
    const titleCase = longer.length >= 3 && longer.filter((t) => /^\p{Lu}/u.test(t.raw)).length >= 0.8 * longer.length;
    const hits: { ids: string[]; via: Term['via'] }[] = [];
    for (let i = 0; i < toks.length;) {
      let matched: Term | undefined;
      for (const t of this.byFirst.get(toks[i].low) || []) {
        if (i + t.tokens.length > toks.length) continue;
        let ok = true;
        for (let j = 0; j < t.tokens.length && ok; j++) ok = t.caseSensitive ? toks[i + j].raw === t.tokens[j] : toks[i + j].low === t.tokens[j];
        if (!ok) continue;
        if (t.context && !CONTEXT[t.context].test(context)) continue;
        const next = toks[i + t.tokens.length];
        if (t.firstName && !titleCase && next && !next.brk && /^\p{Lu}/u.test(next.raw)) continue;
        matched = t; break;
      }
      if (matched) { hits.push({ ids: matched.ids, via: matched.via }); i += matched.tokens.length; } else i++;
    }
    return hits;
  }

  tag(title: string, summary = ''): Tag[] {
    const context = `${title} ${summary}`;
    const raw = [...this.scan(title, context).map((h) => ({ ...h, in: 'title' as const })), ...this.scan(summary, context).map((h) => ({ ...h, in: 'summary' as const }))];
    const sure = new Set(raw.filter((h) => h.ids.length === 1).map((h) => h.ids[0]));
    const homes = new Set([...sure].map((id) => this.homeOf(id)).filter(Boolean) as string[]);
    for (const id of sure) homes.add(id);
    const out = new Map<string, Tag>();
    for (const h of raw) {
      let id = h.ids[0];
      if (h.ids.length > 1) {
        // Prefer the candidate whose country is mentioned elsewhere ("Georgia … Atlanta, US" → the state).
        const scored = h.ids.map((c) => ({ c, s: (homes.has(this.homeOf(c) || '') ? 10 : 0) + (sure.has(c) ? 20 : 0) + this.typeRank(c) }));
        scored.sort((a, b) => b.s - a.s);
        if (scored.length > 1 && scored[0].s === scored[1].s) continue; // genuinely ambiguous: skip rather than guess
        id = scored[0].c;
      }
      const prev = out.get(id);
      if (!prev || (prev.in === 'summary' && h.in === 'title') || (prev.via !== 'name' && h.via === 'name' && prev.in === h.in)) out.set(id, { id, in: h.in, via: h.via });
    }
    return [...out.values()];
  }
}

// ───────────────────────── Headline signals ─────────────────────────
// Leadership changes and election results stated in a headline. Extraction is deliberately
// narrow: a name (2–4 capitalised words), a recognised verb and a recognised role. Signals are
// evidence to verify, never an automatic rewrite of a curated record.
export type SignalKind = 'appointment' | 'departure' | 'election-win';
export type RoleClass = 'ceo' | 'chair' | 'head-of-government' | 'head-of-state' | 'finance-minister' | 'central-bank-governor' | 'leader';
export interface Extracted { kind: SignalKind; person: string; role?: RoleClass; roleText?: string; }

const ROLES: [RegExp, RoleClass][] = [
  [/^(?:ceo|chief executive(?: officer)?|group chief executive|boss)$/i, 'ceo'],
  [/^(?:chair|chairman|chairwoman|chairperson)$/i, 'chair'],
  [/^(?:prime minister|premier|pm|chancellor|taoiseach)$/i, 'head-of-government'],
  [/^(?:president|head of state|king|queen|emperor|monarch)$/i, 'head-of-state'],
  [/^(?:finance minister|treasury secretary|chancellor of the exchequer|minister of finance)$/i, 'finance-minister'],
  [/^(?:central bank governor|central bank chief|central bank head|fed chair|ecb president)$/i, 'central-bank-governor'],
  [/^(?:leader|party leader)$/i, 'leader'],
];
const ROLE_PHRASES = ['chancellor of the exchequer', 'chief executive officer', 'group chief executive', 'central bank governor', 'central bank chief', 'central bank head', 'treasury secretary', 'finance minister', 'minister of finance', 'prime minister', 'head of state', 'chief executive', 'party leader', 'fed chair', 'ecb president', 'chairwoman', 'chairperson', 'chairman', 'president', 'chancellor', 'taoiseach', 'premier', 'chair', 'leader', 'boss', 'ceo', 'pm', 'king', 'queen'];
const roleAt = (low: string[], i: number) => {
  for (const p of ROLE_PHRASES) {
    const parts = p.split(' ');
    if (parts.every((w, j) => low[i + j] === w)) { const cls = ROLES.find(([re]) => re.test(p))?.[1]; return cls ? { cls, text: p, len: parts.length } : undefined; }
  }
  return undefined;
};

const ACTIVE = new Set(['names', 'appoints', 'picks', 'taps', 'elevates', 'promotes', 'nominates', 'selects', 'hires', 'chooses', 'installs']);
const PASSIVE = ['sworn in', 'takes over', 'to become', 'will become', 'set to become', 'becomes', 'named', 'appointed', 'picked', 'tapped', 'chosen', 'selected', 'confirmed', 'inaugurated', 'elected', 'to succeed', 'succeeds', 'to lead', 'will lead', 'to replace', 'replaces', 'takes office'];
const DEPART = ['to step down', 'steps down', 'stepping down', 'will step down', 'resigns', 'has resigned', 'to resign', 'quits', 'is ousted', 'ousted', 'to retire', 'retires', 'is fired', 'fired', 'sacked', 'exits', 'to exit'];
const WIN = ['wins', 'won', 'claims victory', 'declares victory', 'declared winner', 'is re-elected', 're-elected', 'elected', 'sweeps'];
// Capitalised words that are not part of a person's name.
const NOT_NAME = new Set(['the', 'a', 'an', 'new', 'former', 'ex', 'interim', 'acting', 'incoming', 'outgoing', 'veteran', 'longtime', 'us', 'u.s', 'uk', 'eu', 'as', 'its', 'his', 'her', 'and', 'after', 'report', 'reports', 'sources', 'exclusive', 'breaking', 'update', 'live', 'analysis', 'opinion', 'why', 'how', 'what', 'who', 'when', 'officially', 'formally', 'reportedly', 'insider', 'chief', 'top', 'party', 'opposition', 'ruling', 'centre', 'center', 'left', 'right', 'leader', 'candidate', 'challenger', 'incumbent', 'billionaire', 'businessman', 'businesswoman', 'general', 'gen', 'mr', 'ms', 'mrs', 'dr', 'sir', 'dame', 'lord', 'lady',
  'prime', 'minister', 'president', 'chancellor', 'premier', 'ceo', 'chairman', 'chairwoman', 'chair', 'governor', 'secretary', 'king', 'queen', 'boss', 'senator', 'sen', 'rep', 'mayor', 'vice', 'deputy', 'finance', 'foreign', 'defence', 'defense', 'treasury', 'central', 'bank', 'state', 'federal', 'national', 'executive', 'officer', 'founder', 'co-founder', 'mp', 'pm']);
const isCap = (t: Token) => /^\p{Lu}/u.test(t.raw) && !NOT_NAME.has(t.low) && !roleAt([t.low], 0) && !ACTIVE.has(t.low) && !/^\d/.test(t.raw);
/** A run of 2–4 capitalised tokens (allowing particles: de, van, bin…) is taken as a name. */
function nameRun(toks: Token[], from: number, dir: 1 | -1) {
  const particles = new Set(['de', 'da', 'van', 'von', 'der', 'bin', 'al', 'el', 'del', 'di', 'le', 'la', 'dos', 'du']);
  const picked: Token[] = [];
  for (let i = from; i >= 0 && i < toks.length && picked.length < 5; i += dir) {
    const t = toks[i];
    // A possessive ends a name: "Apple's John Ternus" (reading back) / "John Ternus's" (reading forward).
    if (dir === -1 && t.poss) break;
    if (dir === 1 && picked.length && t.brk) break;
    if (isCap(t) || (picked.length && particles.has(t.low))) picked.push(t); else break;
    if (dir === 1 && t.poss) break;
    if (dir === -1 && t.brk) break;
  }
  const run = dir === 1 ? picked : picked.reverse();
  while (run.length && particles.has(run[0].low)) run.shift();
  while (run.length && particles.has(run[run.length - 1].low)) run.pop();
  return run.length >= 2 && run.length <= 4 ? run.map((t) => t.raw).join(' ') : undefined;
}
const phraseAt = (low: string[], i: number, phrases: string[]) => phrases.map((p) => p.split(' ')).find((p) => p.every((w, j) => low[i + j] === w));

/** Pull leadership and election signals out of one headline. */
export function extractSignals(title: string): Extracted[] {
  const toks = tokenize(title.replace(/[‘’“”"]/g, ' '));
  const low = toks.map((t) => t.low);
  const out: Extracted[] = [];
  const roleWithin = (from: number, span = 7) => { for (let i = from; i < Math.min(low.length, from + span); i++) { const r = roleAt(low, i); if (r) return r; } return undefined; };
  const roleBefore = (to: number, span = 4) => { for (let i = to - 1; i >= Math.max(0, to - span); i--) { const r = roleAt(low, i); if (r) return r; } return undefined; };
  for (let i = 0; i < toks.length; i++) {
    // "Apple names John Ternus as CEO"
    if (ACTIVE.has(low[i])) {
      // Allow a short description before the name: "names hardware chief John Ternus as CEO".
      let at = i + 1;
      while (at < i + 4 && at < toks.length && !isCap(toks[at]) && !toks[at].brk && !/^(as|to|for)$/.test(low[at])) at++;
      const person = nameRun(toks, at, 1);
      const r = person ? roleWithin(at + person.split(' ').length) : undefined;
      if (person && r) out.push({ kind: 'appointment', person, role: r.cls, roleText: r.text });
      continue;
    }
    const passive = phraseAt(low, i, PASSIVE);
    if (passive) {
      // "John Ternus named Apple CEO" / "Andy Burnham sworn in as prime minister"
      const person = nameRun(toks, i - 1, -1);
      const r = person ? roleWithin(i + passive.length) : undefined;
      if (person && r) out.push({ kind: 'appointment', person, role: r.cls, roleText: r.text });
      i += passive.length - 1;
      continue;
    }
    const depart = phraseAt(low, i, DEPART);
    if (depart) {
      // "Shell CEO Wael Sawan to step down" / "Prime Minister X resigns"
      const person = nameRun(toks, i - 1, -1);
      const r = person ? roleBefore(i - person.split(' ').length) || roleWithin(i + depart.length, 5) : undefined;
      if (person && r) out.push({ kind: 'departure', person, role: r.cls, roleText: r.text });
      i += depart.length - 1;
      continue;
    }
    const win = phraseAt(low, i, WIN);
    if (win && /\b(election|elections|vote|runoff|run-off|presidency|presidential|polls|ballot|leadership contest|leadership race)\b/i.test(title)) {
      const person = nameRun(toks, i - 1, -1);
      if (person) out.push({ kind: 'election-win', person, role: roleBefore(i - person.split(' ').length)?.cls });
      i += win.length - 1;
    }
  }
  // One signal per (kind, person).
  const seen = new Set<string>();
  return out.filter((s) => { const k = `${s.kind}|${s.person}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export const roleLabel: Record<RoleClass, string> = {
  ceo: 'Chief executive', chair: 'Chair', 'head-of-government': 'Head of government', 'head-of-state': 'Head of state',
  'finance-minister': 'Finance minister', 'central-bank-governor': 'Central bank governor', leader: 'Leader',
};

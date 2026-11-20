// Entity resolution for the command line: turns the words typed before (or after) a function code
// into one or two entities of the knowledge web. "DEU", "de", "south korea japan", "AAPL".
import { byIso3, entities, getEntity, normName, search, stub } from './graph.js';
import type { EntityStub } from '../shared/types.js';

export interface ResolvedEntity {
  id: string; type: EntityStub['type']; name: string; flag?: string;
  /** Three-letter code, for countries. */
  iso3?: string;
  score: number;
  /** The words are a code, name, alias or ticker of this entity, letter for letter. */
  exact: boolean;
  /** Safe to open without asking: exact, or clearly ahead of every other match. */
  sure: boolean;
  /** How the words matched: the whole name, the start of it, or whole words inside it. */
  how: 'code' | 'exact' | 'start' | 'words';
  /** Other entities the words could mean (up to 5): given when the match is not exact, or when several entities share the name. */
  alternatives?: Pick<EntityStub, 'id' | 'type' | 'name' | 'flag' | 'parentName'>[];
}
export interface Resolution {
  /** What was asked, trimmed. */
  q: string;
  entities: ResolvedEntity[];
}

// Two-letter country codes, read from the graph (kept in step with it: rebuilt when it grows).
let iso2: Map<string, string> | null = null; let iso2Size = 0;
function byIso2(code: string) {
  if (!iso2 || iso2Size !== byIso3.size) {
    iso2 = new Map(); iso2Size = byIso3.size;
    for (const id of byIso3.values()) { const e = entities.get(id); if (e?.iso2) iso2.set(e.iso2.toUpperCase(), id); }
  }
  return iso2.get(code);
}

const termsOf = (id: string) => { const e = getEntity(id)!; return [e.name, ...(e.aliases || []), ...((e.attrs?.altNames as string[]) || [])].map(normName).filter(Boolean); };
/** How strongly the words name this entity; undefined when the match is only loose (a typo, a word in the middle). */
function strength(id: string, nq: string): ResolvedEntity['how'] | undefined {
  const terms = termsOf(id);
  if (terms.includes(nq)) return 'exact';
  if (nq.length >= 3 && terms.some((t) => t.startsWith(nq))) return 'start';
  const toks = nq.split(' ');
  if (terms.some((t) => { const w = t.split(' '); return toks.every((k) => k.length >= 2 && w.includes(k)); })) return 'words';
  return undefined;
}
const brief = (id: string) => { const s = stub(id)!; return { id: s.id, type: s.type, name: s.name, flag: s.flag, parentName: s.parentName }; };
const made = (id: string, score: number, how: ResolvedEntity['how'], sure: boolean, alternatives: string[] = []): ResolvedEntity => {
  const e = getEntity(id)!;
  return { id, type: e.type, name: e.name, flag: e.flag, iso3: e.type === 'country' ? e.iso3 : undefined, score: Math.round(score), exact: how === 'code' || how === 'exact', sure, how,
    ...(alternatives.length ? { alternatives: alternatives.slice(0, 5).map(brief) } : {}) };
};

/** One entity for a run of words, or nothing. Order: a three-letter country code, a two-letter one,
 *  an exact name, alias or ticker, then the best strong match. */
export function resolveOne(words: string): ResolvedEntity | undefined {
  const nq = normName(words);
  if (!nq) return undefined;
  const code = words.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code) && byIso3.has(code)) return made(byIso3.get(code)!, 200, 'code', true);
  const hits = search(words, { limit: 12 });
  const graded = hits.map((h) => ({ h, how: strength(h.id, nq) })).filter((x) => x.how) as { h: (typeof hits)[number]; how: ResolvedEntity['how'] }[];
  const exact = graded.filter((x) => x.how === 'exact');
  if (/^[A-Z]{2}$/.test(code) && byIso2(code)) {
    // A two-letter country code, unless something is actually called that (EU, UN are not countries' codes; "AI" could be a name).
    const id = byIso2(code)!; const named = exact.find((x) => normName(getEntity(x.h.id)!.name) === nq && x.h.id !== id);
    if (!named) return made(id, 190, 'code', true, exact.map((x) => x.h.id).filter((x) => x !== id));
  }
  if (exact.length) {
    // Several entities can share a name (Georgia the country and the state): the best-ranked one, with the others offered.
    const [top, ...others] = exact;
    return made(top.h.id, top.h.score, 'exact', true, others.map((x) => x.h.id));
  }
  if (!graded.length) return undefined;
  const top = graded[0]; const next = hits.find((h) => h.id !== top.h.id);
  const sure = hits[0].id === top.h.id && (!next || top.h.score - next.score >= 10);
  return made(top.h.id, top.h.score, top.how, sure, hits.filter((h) => h.id !== top.h.id).map((h) => h.id));
}

const RANK: Record<ResolvedEntity['how'], number> = { code: 4, exact: 4, start: 2, words: 1 };
/** One or two entities for the words typed around a function code. With `max` 2, every way of
 *  cutting the words in two is tried ("USA CHN", "south korea japan"); the whole phrase wins when it
 *  names one entity exactly ("new york", "saudi arabia"). */
export function resolveCommandEntities(text: string, max = 2): Resolution {
  const q = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const words = q ? q.split(' ').slice(0, 8) : [];
  if (!words.length) return { q, entities: [] };
  const whole = resolveOne(words.join(' '));
  if (whole?.exact || max < 2 || words.length < 2) return { q, entities: whole ? [whole] : [] };
  let best: { pair: ResolvedEntity[]; rank: number } | undefined;
  for (let i = 1; i < words.length; i++) {
    const a = resolveOne(words.slice(0, i).join(' ')); if (!a) continue;
    const b = resolveOne(words.slice(i).join(' ')); if (!b || b.id === a.id) continue;
    // The weaker half decides how good a cut is; ties go to the cut whose halves match best together.
    const rank = Math.min(RANK[a.how], RANK[b.how]) * 1000 + RANK[a.how] + RANK[b.how] + (a.score + b.score) / 1000;
    if (!best || rank > best.rank) best = { pair: [a, b], rank };
  }
  // Two entities beat one loose match when both halves are at least as strong as the whole.
  if (best && (!whole || Math.floor(best.rank / 1000) >= RANK[whole.how])) return { q, entities: best.pair };
  return { q, entities: whole ? [whole] : [] };
}

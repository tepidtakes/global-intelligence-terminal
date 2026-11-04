import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, invalidate, useApi } from '../api';
import { useApp, useAuth } from '../state';
import { EntityChip } from './common';
import { money, pct, fmtDate } from '../format';
import type { RelView, PositionSummary, Quote } from '../../shared/types';

const REL_ORDER = ['head_of_state', 'head_of_government', 'leads', 'holds_office', 'belongs_to_party', 'governing_party', 'party_in', 'capital_of', 'headquartered_in', 'located_in', 'member_of',
  'subsidiary_of', 'shareholder_of', 'in_industry', 'produces', 'exports', 'imports', 'consumes', 'uses', 'supplies', 'competitor_of', 'operates_in', 'trade_partner', 'affects', 'borders', 'in_region'];

/** Relationships grouped by label, ranked first. Bidirectional: inverse links show on the other side. */
export function RelGroups({ rels, maxGroups = 99, maxPer = 12, hide = [] }: { rels: RelView[]; maxGroups?: number; maxPer?: number; hide?: string[] }) {
  const groups = new Map<string, RelView[]>();
  for (const r of rels) {
    if (hide.includes(r.rel.type)) continue;
    (groups.get(r.label) || groups.set(r.label, []).get(r.label)!).push(r);
  }
  const rank = (list: RelView[]) => { const i = REL_ORDER.indexOf(list[0].rel.type); return i < 0 ? 99 : i; };
  const ordered = [...groups.entries()].sort((a, b) => rank(a[1]) - rank(b[1]));
  return (
    <div>
      {ordered.slice(0, maxGroups).map(([label, list]) => {
        const sorted = list.slice().sort((a, b) => (a.rel.rank ?? 99) - (b.rel.rank ?? 99) || a.other.name.localeCompare(b.other.name));
        const seen = new Set<string>();
        const uniq = sorted.filter((r) => (seen.has(r.other.id) ? false : (seen.add(r.other.id), true)));
        return (
          <div className="relGroup" key={label}>
            <div className="lbl">{label} <span className="muted">({uniq.length})</span></div>
            <div className="chips">
              {uniq.slice(0, maxPer).map((r) => (
                <EntityChip key={r.rel.id} e={r.other} title={[r.rel.role, r.rel.note, r.rel.validFrom && `since ${r.rel.validFrom}`, r.rel.validTo && `until ${r.rel.validTo}`].filter(Boolean).join(' · ') || undefined} />
              ))}
              {uniq.length > maxPer && <span className="tiny muted" style={{ alignSelf: 'center' }}>+{uniq.length - maxPer} more</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WatchButton({ id }: { id: string }) {
  const { user } = useAuth();
  const { toast } = useApp();
  const wls = useApi<any[]>(user ? '/watchlists' : null);
  const nav = useNavigate();
  const main = wls.data?.[0];
  const on = !!main?.entityIds.includes(id);
  return (
    <button className="btn sm" aria-pressed={on} title={on ? 'Remove from watchlist' : 'Add to watchlist'} onClick={async () => {
      if (!user) return nav('/login');
      if (!main) return;
      const entityIds = on ? main.entityIds.filter((x: string) => x !== id) : [...main.entityIds, id];
      await api(`/watchlists/${main.id}`, { method: 'PUT', body: { entityIds } });
      invalidate('/watchlists'); toast(on ? `Removed from ${main.name}` : `Added to ${main.name}`);
    }}>{on ? '★ Watching' : '☆ Watch'}</button>
  );
}

export function NewNoteButton({ entityIds, label = '＋ Note', className = 'btn sm' }: { entityIds: string[]; label?: string; className?: string }) {
  const loc = useLocation();
  return <Link className={className} to={`/research/new?entities=${encodeURIComponent(entityIds.join(','))}&back=${encodeURIComponent(loc.pathname + loc.search)}`}>{label}</Link>;
}

export function perf(p: PositionSummary, price: number) {
  const r = p.side === 'long' ? (price / p.avgEntry - 1) * 100 : (1 - price / p.avgEntry) * 100;
  const pnl = p.quantity ? (p.side === 'long' ? price - p.avgEntry : p.avgEntry - price) * p.quantity : null;
  return { r, pnl };
}

/** Compact position summary shown in previews and search. */
export function PositionCompact({ entityId, position }: { entityId: string; position: PositionSummary }) {
  const q = useApi<Quote>(`/quote/${encodeURIComponent(entityId)}?range=1mo`, 300_000);
  const cur = q.data?.currency || 'USD';
  const pf = q.data ? perf(position, q.data.price) : null;
  return (
    <div className={`posBox ${position.side}`}>
      <div className="row"><span className={`badge ${position.side}`}>{position.side.toUpperCase()}</span><strong>{money(position.avgEntry, cur)}</strong><span className="small muted">since {fmtDate(position.firstEntryDate)}</span><div className="spacer" /><span className="badge private">Private</span></div>
      <div className="row small" style={{ marginTop: 4 }}>
        {q.data ? <>Last {money(q.data.price, cur)} · Price return <strong className={pf!.r >= 0 ? 'good' : 'bad'}>{pct(pf!.r)}</strong>{pf!.pnl != null && <> · {money(pf!.pnl, cur)}</>}</> : q.error ? <span className="muted">Quote unavailable — return not calculated</span> : <span className="muted">Loading quote…</span>}
      </div>
    </div>
  );
}

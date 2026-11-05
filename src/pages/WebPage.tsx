// The knowledge web: everything connected to one entity — members, leaders, trade partners,
// sanctions, owners, places, and who is in the news with it — drawn as a network you can walk.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import { Card, EntityChip, EntityPicker, Loading, Unavailable } from '../components/common';
import { EntityWeb, kindOf, type WLink, type WNode } from '../components/EntityWeb';
import { compact, TYPE_ICON } from '../format';

export function WebPage() {
  const [sp, setSp] = useSearchParams();
  const focus = sp.get('focus') || 'country:USA';
  const depth = sp.get('depth') === '2' ? 2 : 1;
  const [hidden, setHidden] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, loading, error } = useApi<{ focus: any; nodes: WNode[]; links: WLink[]; types: string[] }>(`/web/${encodeURIComponent(focus)}/graph?depth=${depth}&max=${depth === 2 ? 120 : 70}&per=${depth === 2 ? 6 : 10}`, 120_000);
  const set = (o: Record<string, string>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(o)) n.set(k, v); setSp(n); setSelected(null); };
  const kinds = useMemo(() => [...new Set((data?.links || []).map((l) => kindOf(l.type)))].sort(), [data]);
  const links = useMemo(() => (data?.links || []).filter((l) => !hidden.includes(kindOf(l.type))), [data, hidden]);
  const nodes = useMemo(() => { const keep = new Set([focus, ...links.flatMap((l) => [l.source, l.target])]); return (data?.nodes || []).filter((n) => keep.has(n.id)); }, [data, links, focus]);
  const sel = nodes.find((n) => n.id === selected);
  const selLinks = selected ? links.filter((l) => l.source === selected || l.target === selected) : [];
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name || id;
  return (
    <div className="page">
      <h1>The web</h1>
      <p className="small muted" style={{ marginTop: 0 }}>Everything connected to one country, organization, company, person or commodity — from the hand-checked records and live sources (Wikidata, UN Comtrade, the sanctions lists, trusted news). Click a node to see its links, double-click to open it, or make it the centre.</p>
      <div className="row wrap" style={{ gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ minWidth: 260 }}>{data?.focus ? <EntityChip e={data.focus} /> : null}</div>
        <div style={{ minWidth: 280, flex: '1 1 280px', maxWidth: 420 }}><EntityPicker placeholder="Centre on anything…" onPick={(e) => set({ focus: e.id })} /></div>
        <div className="seg" role="group" aria-label="Depth">
          <button className={depth === 1 ? 'on' : ''} onClick={() => set({ depth: '1' })}>Direct links</button>
          <button className={depth === 2 ? 'on' : ''} onClick={() => set({ depth: '2' })}>+ their links</button>
        </div>
        <Link className="btn sm" to={`/?fill=${encodeURIComponent(`web:${focus}`)}`}>On the map</Link>
        <Link className="btn sm" to={`/entity/${encodeURIComponent(focus)}`}>Profile</Link>
      </div>
      {kinds.length > 1 && (
        <div className="chips" style={{ marginBottom: 10 }} role="group" aria-label="Kinds of link">
          {kinds.map((k) => <button key={k} className={`btn sm${hidden.includes(k) ? '' : ' primary'}`} aria-pressed={!hidden.includes(k)} onClick={() => setHidden(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k])}>{k}</button>)}
        </div>
      )}
      <div className="webLayout">
        <div style={{ minWidth: 0 }}>
          {loading && !data ? <Card><Loading lines={10} /></Card> : error ? <Unavailable>{error.message}</Unavailable> : <EntityWeb nodes={nodes} links={links} focusId={focus} selected={selected} onSelect={setSelected} height={600} />}
        </div>
        <aside className="webSide">
          {sel ? (
            <Card title={<span>{sel.flag || TYPE_ICON[sel.type]} {sel.name}</span>}>
              <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
                <Link className="btn sm primary" to={`/entity/${encodeURIComponent(sel.id)}`}>Open profile</Link>
                {sel.id !== focus && <button className="btn sm" onClick={() => set({ focus: sel.id })}>❖ Centre here</button>}
              </div>
              <div className="stack" style={{ gap: 4 }}>
                {selLinks.map((l, i) => {
                  const other = l.source === sel.id ? l.target : l.source;
                  return <div key={i} className="small"><span className="tiny muted">{l.label}{l.current ? '' : ' (ended)'}</span><br /><button className="linkish" onClick={() => setSelected(other)}>{nameOf(other)}</button>{l.value != null && <span className="tiny muted"> · {l.type === 'trades_with' ? `$${compact(l.value)}` : l.value}</span>}</div>;
                })}
              </div>
            </Card>
          ) : (
            <Card title="How to read it">
              <div className="small">Nodes are sized by data — share of world GDP for countries and organizations, how widely known for the rest. Thicker links carry more (trade value, stories in common). Dashed links have ended.</div>
              {data && <div className="tiny muted" style={{ marginTop: 8 }}>{nodes.length} nodes · {links.length} links shown.</div>}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

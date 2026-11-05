// The knowledge web around one entity: nodes sized by data (share of world GDP, notability),
// colored by kind, links colored by what connects them. Pan, zoom and drag like the notes graph;
// click a node to inspect it, double-click (or Enter) to open its profile.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsDark } from '../state';
import { palette } from '../map/layers';

export interface WNode { id: string; name: string; type: string; flag?: string; weight: number; focus?: boolean }
export interface WLink { source: string; target: string; type: string; label: string; value?: number; current: boolean }
interface P { x: number; y: number; vx: number; vy: number; fixed?: boolean }

export const TYPE_ORDER = ['country', 'igo', 'institution', 'company', 'person', 'party', 'city', 'commodity', 'industry', 'event', 'state', 'region'];
/** Link kinds in plain words, for the legend and the filters. */
export const LINK_KIND: Record<string, string> = {
  member_of: 'Membership', head_of_state: 'Leadership', head_of_government: 'Leadership', leads: 'Leadership', holds_office: 'Leadership', central_bank_of: 'Central bank',
  trades_with: 'Trade', sanctions: 'Sanctions', mentioned_with: 'In the news together', headquartered_in: 'Location', located_in: 'Location', capital_of: 'Location',
  subsidiary_of: 'Ownership', shareholder_of: 'Ownership', in_industry: 'Industry', belongs_to_party: 'Party', party_in: 'Party', governing_party: 'Party', borders: 'Borders',
  produces: 'Commodities', exports: 'Commodities', imports: 'Commodities', consumes: 'Commodities', operates_in: 'Operations', supplies: 'Supply chain', uses: 'Supply chain', affects: 'Events', candidate_in: 'Elections',
  in_region: 'Location', trade_partner: 'Trade', competitor_of: 'Competitors',
};
export const kindOf = (type: string) => LINK_KIND[type] || 'Other';

function layout(nodes: WNode[], links: WLink[], focusId?: string) {
  const pos = new Map<string, P>();
  nodes.forEach((n, i) => { const r = n.id === focusId ? 0 : 30 + 14 * Math.sqrt(i + 0.5), a = i * 2.39996; pos.set(n.id, { x: r * Math.cos(a), y: r * Math.sin(a), vx: 0, vy: 0, fixed: n.id === focusId }); });
  const arr = nodes.map((n) => pos.get(n.id)!);
  const L = links.map((l) => [pos.get(l.source), pos.get(l.target), l] as const).filter(([a, b]) => a && b) as [P, P, WLink][];
  const ticks = nodes.length > 120 ? 220 : 320;
  for (let t = 0; t < ticks; t++) {
    const alpha = 1 - t / ticks;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      let dx = b.x - a.x, dy = b.y - a.y; let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = (i % 7) - 3 || 1; dy = (j % 5) - 2 || 1; d2 = dx * dx + dy * dy; }
      if (d2 > 160000) continue;
      const f = (2600 * alpha) / d2;
      a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
    for (const [a, b, l] of L) {
      const dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const want = l.source === focusId || l.target === focusId ? 110 : 80;
      const f = ((d - want) / d) * 0.06 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const p of arr) { if (p.fixed) { p.x = 0; p.y = 0; p.vx = p.vy = 0; continue; } p.vx -= p.x * 0.008 * alpha; p.vy -= p.y * 0.008 * alpha; p.x += p.vx; p.y += p.vy; p.vx *= 0.55; p.vy *= 0.55; }
  }
  return pos;
}

export function EntityWeb({ nodes, links, focusId, selected, onSelect, height = 560 }: { nodes: WNode[]; links: WLink[]; focusId?: string; selected?: string | null; onSelect: (id: string | null) => void; height?: number }) {
  const nav = useNavigate();
  const pal = palette(useIsDark());
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [, bump] = useState(0);
  const drag = useRef<{ mode: 'pan' | 'node'; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const pos = useMemo(() => layout(nodes, links, focusId), [nodes, links, focusId]);
  const typeColor = useMemo(() => Object.fromEntries(TYPE_ORDER.map((t, i) => [t, pal.catWide[i % pal.catWide.length]])), [pal]);
  const kinds = useMemo(() => [...new Set(links.map((l) => kindOf(l.type)))], [links]);
  const kindColor = useMemo(() => Object.fromEntries(kinds.map((k, i) => [k, pal.catWide[(i + 3) % pal.catWide.length]])), [kinds, pal]);
  const active = hover || selected || null;
  const neighbors = useMemo(() => {
    if (!active) return null;
    const s = new Set([active]); for (const l of links) { if (l.source === active) s.add(l.target); if (l.target === active) s.add(l.source); } return s;
  }, [active, links]);
  const bounds = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pos.values()) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (!isFinite(x0)) return { x: -100, y: -100, w: 200, h: 200 };
    const pad = 60; return { x: x0 - pad, y: y0 - pad, w: Math.max(x1 - x0 + pad * 2, 200), h: Math.max(y1 - y0 + pad * 2, 200) };
  }, [pos]);
  useEffect(() => setView({ k: 1, x: 0, y: 0 }), [bounds]);
  const [boxW, setBoxW] = useState(800);
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth || 800)); ro.observe(el);
    return () => ro.disconnect();
  }, [nodes.length > 0]);
  const u = Math.max(bounds.w / boxW, bounds.h / height);
  const toGraph = (cx: number, cy: number) => {
    const svg = svgRef.current!; const r = svg.getBoundingClientRect();
    const scale = Math.max(bounds.w / r.width, bounds.h / r.height);
    return { scale };
  };
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        const r = svg.getBoundingClientRect(); const scale = Math.max(bounds.w / r.width, bounds.h / r.height);
        const ox = bounds.x + (bounds.w - r.width * scale) / 2, oy = bounds.y + (bounds.h - r.height * scale) / 2;
        const px = (e.clientX - r.left) * scale + ox, py = (e.clientY - r.top) * scale + oy;
        const k = Math.min(6, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [bounds]);

  if (!nodes.length) return <div className="graphBox" style={{ height: 160, display: 'grid', placeItems: 'center' }}><span className="small muted">No connections recorded yet.</span></div>;
  const radius = (n: WNode) => 4 + n.weight * 1.6 + (n.id === focusId ? 4 : 0);
  const maxV = Math.max(1, ...links.map((l) => l.value || 0));
  const width = (l: WLink) => 1 + (l.value ? Math.sqrt(l.value / maxV) * 3 : 0);
  const onDown = (e: React.PointerEvent, id?: string) => {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = id ? pos.get(id)! : null;
    drag.current = { mode: id ? 'node' : 'pan', id, sx: e.clientX, sy: e.clientY, ox: p ? p.x : view.x, oy: p ? p.y : view.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    const { scale } = toGraph(e.clientX, e.clientY);
    if (d.mode === 'pan') setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx) * scale, y: d.oy + (e.clientY - d.sy) * scale }));
    else { const p = pos.get(d.id!)!; p.x = d.ox + ((e.clientX - d.sx) * scale) / view.k; p.y = d.oy + ((e.clientY - d.sy) * scale) / view.k; bump((x) => x + 1); }
  };
  const onUp = (id?: string) => { const d = drag.current; drag.current = null; if (d && !d.moved) onSelect(id || null); };
  const showLabel = (n: WNode) => nodes.length <= 40 || view.k >= 1.6 || n.weight >= 5 || n.id === focusId || (neighbors?.has(n.id) ?? false);

  return (
    <div className="graphBox">
      <svg ref={svgRef} height={height} viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} role="img" aria-label={`Network of ${nodes.length} connected entities`}
        onPointerDown={(e) => onDown(e)} onPointerMove={onMove} onPointerUp={() => onUp()} onPointerLeave={() => { if (drag.current?.mode === 'pan') drag.current = null; }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {links.map((l, i) => {
            const a = pos.get(l.source), b = pos.get(l.target); if (!a || !b) return null;
            const lit = !!active && (l.source === active || l.target === active);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={kindColor[kindOf(l.type)]} strokeWidth={(width(l) * (lit ? 1.6 : 1) * u) / view.k}
              strokeDasharray={l.current ? undefined : `${(4 * u) / view.k} ${(3 * u) / view.k}`} opacity={active && !lit ? 0.12 : 0.7}><title>{l.label}</title></line>;
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id)!; const r = (radius(n) * u) / Math.sqrt(view.k);
            const dim = neighbors && !neighbors.has(n.id);
            return (
              <g key={n.id} className="node" transform={`translate(${p.x} ${p.y})`} opacity={dim ? 0.18 : 1} tabIndex={0} role="button" aria-label={`${n.name} (${n.type})`}
                onPointerDown={(e) => onDown(e, n.id)} onPointerUp={(e) => { e.stopPropagation(); onUp(n.id); }} onDoubleClick={() => nav(`/entity/${encodeURIComponent(n.id)}`)}
                onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                onKeyDown={(e) => { if (e.key === 'Enter') nav(`/entity/${encodeURIComponent(n.id)}`); if (e.key === ' ') { e.preventDefault(); onSelect(n.id); } }}>
                <circle r={r} fill={typeColor[n.type] || pal.cat[1]} stroke={n.id === focusId || n.id === selected ? pal.sel : 'var(--surface)'} strokeWidth={((n.id === focusId || n.id === selected ? 3 : 1.5) * u) / view.k} />
                {showLabel(n) && <text className="lbl" x={0} y={-r - (5 * u) / view.k} textAnchor="middle" style={{ fontSize: ((n.id === focusId ? 14 : 12) * u) / view.k, strokeWidth: (3 * u) / view.k }}>{n.flag ? `${n.flag} ` : ''}{n.name.length > 36 ? `${n.name.slice(0, 34)}…` : n.name}</text>}
                <title>{n.name} · {n.type}</title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="legend" aria-hidden>
        {TYPE_ORDER.filter((t) => nodes.some((n) => n.type === t)).map((t) => <span key={t}><i style={{ background: typeColor[t] }} />{t === 'igo' ? 'organization' : t}</span>)}
        <span style={{ marginLeft: 8 }} />
        {kinds.map((k) => <span key={k}><i style={{ background: kindColor[k], height: 3, borderRadius: 0 }} />{k}</span>)}
      </div>
      <div className="tools">
        <button className="btn sm" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, k: Math.min(6, v.k * 1.3) }))}>＋</button>
        <button className="btn sm" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k / 1.3) }))}>−</button>
        <button className="btn sm" aria-label="Reset view" onClick={() => setView({ k: 1, x: 0, y: 0 })}>⟲</button>
      </div>
    </div>
  );
}

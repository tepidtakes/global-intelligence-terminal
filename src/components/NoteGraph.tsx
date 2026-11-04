// Obsidian-style graph of notes and the entities they mention.
// Force layout is computed once (deterministic start), then you can pan, zoom and drag.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsDark } from '../state';
import { palette } from '../map/layers';

export interface GNode { id: string; kind: 'note' | 'entity'; label: string; type?: string; tags?: string[]; pinned?: boolean }
export interface GLink { source: string; target: string; kind: 'note' | 'entity' }
export interface GraphData { nodes: GNode[]; links: GLink[] }
interface P { x: number; y: number; vx: number; vy: number }

const PLACE = new Set(['country', 'state', 'county', 'city', 'region']);
const MAX_NODES = 600;

/** Keep the nodes within `depth` hops of `focus` (links treated as undirected). */
export function neighborhood(data: GraphData, focus: string, depth = 1): GraphData {
  const adj = new Map<string, string[]>();
  for (const l of data.links) { (adj.get(l.source) || adj.set(l.source, []).get(l.source)!).push(l.target); (adj.get(l.target) || adj.set(l.target, []).get(l.target)!).push(l.source); }
  const keep = new Set([focus]);
  let frontier = [focus];
  for (let d = 0; d < depth; d++) { const next: string[] = []; for (const id of frontier) for (const n of adj.get(id) || []) if (!keep.has(n)) { keep.add(n); next.push(n); } frontier = next; }
  return { nodes: data.nodes.filter((n) => keep.has(n.id)), links: data.links.filter((l) => keep.has(l.source) && keep.has(l.target)) };
}

function layout(nodes: GNode[], links: GLink[]) {
  const pos = new Map<string, P>();
  nodes.forEach((n, i) => { const r = 12 * Math.sqrt(i + 0.5), a = i * 2.39996; pos.set(n.id, { x: r * Math.cos(a), y: r * Math.sin(a), vx: 0, vy: 0 }); });
  const arr = nodes.map((n) => pos.get(n.id)!);
  const L = links.map((l) => [pos.get(l.source), pos.get(l.target)] as const).filter(([a, b]) => a && b) as [P, P][];
  const ticks = nodes.length > 300 ? 160 : 300;
  for (let t = 0; t < ticks; t++) {
    const alpha = 1 - t / ticks;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      let dx = b.x - a.x, dy = b.y - a.y; let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = (i % 7) - 3 || 1; dy = (j % 5) - 2 || 1; d2 = dx * dx + dy * dy; }
      if (d2 > 90000) continue;
      const f = (1400 * alpha) / d2;
      a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
    for (const [a, b] of L) {
      const dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - 55) / d) * 0.08 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const p of arr) { p.vx -= p.x * 0.012 * alpha; p.vy -= p.y * 0.012 * alpha; p.x += p.vx; p.y += p.vy; p.vx *= 0.55; p.vy *= 0.55; }
  }
  return pos;
}

export function NoteGraph({ data, height = 520, focusId, emptyText = 'Nothing to show yet.' }: { data: GraphData; height?: number; focusId?: string; emptyText?: string }) {
  const nav = useNavigate();
  const pal = palette(useIsDark());
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [, bump] = useState(0);
  const drag = useRef<{ mode: 'pan' | 'node'; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const { nodes, links, truncated } = useMemo(() => {
    const truncated = data.nodes.length > MAX_NODES;
    const nodes = truncated ? data.nodes.slice(0, MAX_NODES) : data.nodes;
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, links: data.links.filter((l) => ids.has(l.source) && ids.has(l.target)), truncated };
  }, [data]);
  const pos = useMemo(() => layout(nodes, links), [nodes, links]);
  const degree = useMemo(() => { const m = new Map<string, number>(); for (const l of links) { m.set(l.source, (m.get(l.source) || 0) + 1); m.set(l.target, (m.get(l.target) || 0) + 1); } return m; }, [links]);
  const neighbors = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]); for (const l of links) { if (l.source === hover) s.add(l.target); if (l.target === hover) s.add(l.source); } return s;
  }, [hover, links]);

  // Fit to the box whenever the graph changes.
  const bounds = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pos.values()) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    if (!isFinite(x0)) return { x: -100, y: -100, w: 200, h: 200 };
    const pad = 40; return { x: x0 - pad, y: y0 - pad, w: Math.max(x1 - x0 + pad * 2, 160), h: Math.max(y1 - y0 + pad * 2, 160) };
  }, [pos]);
  useEffect(() => setView({ k: 1, x: 0, y: 0 }), [bounds]);
  // Graph units per screen pixel, so dots, lines and labels keep a constant on-screen size.
  const [boxW, setBoxW] = useState(800);
  const hasNodes = nodes.length > 0;
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth || 800)); ro.observe(el);
    return () => ro.disconnect();
  }, [hasNodes]);
  const u = Math.max(bounds.w / boxW, bounds.h / height);

  const toGraph = (cx: number, cy: number) => {
    const svg = svgRef.current!; const r = svg.getBoundingClientRect();
    const scale = Math.max(bounds.w / r.width, bounds.h / r.height);
    const ox = bounds.x + (bounds.w - r.width * scale) / 2, oy = bounds.y + (bounds.h - r.height * scale) / 2;
    return { gx: ((cx - r.left) * scale + ox - view.x) / view.k, gy: ((cy - r.top) * scale + oy - view.y) / view.k, scale };
  };

  // Wheel zoom around the pointer (non-passive so the page doesn't scroll).
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

  if (!nodes.length) return <div className="graphBox" style={{ height: Math.min(height, 160), display: 'grid', placeItems: 'center' }}><span className="small muted">{emptyText}</span></div>;

  const colorOf = (n: GNode) => n.kind === 'note' ? pal.cat[0] : PLACE.has(n.type || '') ? pal.cat[2] : pal.cat[1];
  const radius = (n: GNode) => (n.kind === 'note' ? 4.5 : 3.5) + Math.sqrt(degree.get(n.id) || 0) * (n.kind === 'note' ? 1.8 : 1.3) + (n.id === focusId ? 2 : 0);
  const showAllLabels = nodes.length <= 45 || view.k >= 1.8;
  const open = (n: GNode) => nav(n.kind === 'note' ? `/research/${n.id}` : `/entity/${encodeURIComponent(n.id)}`);
  const counts = { notes: nodes.filter((n) => n.kind === 'note').length, places: nodes.filter((n) => n.kind === 'entity' && PLACE.has(n.type || '')).length, other: nodes.filter((n) => n.kind === 'entity' && !PLACE.has(n.type || '')).length };

  const onDown = (e: React.PointerEvent, id?: string) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
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
  const onUp = (n?: GNode) => { const d = drag.current; drag.current = null; if (n && d && !d.moved) open(n); };

  return (
    <div className="graphBox">
      <svg ref={svgRef} height={height} viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} className={drag.current?.mode === 'pan' ? 'panning' : ''}
        role="img" aria-label={`Graph of ${counts.notes} notes and ${counts.places + counts.other} linked entities`}
        onPointerDown={(e) => onDown(e)} onPointerMove={onMove} onPointerUp={() => onUp()} onPointerLeave={() => { if (drag.current?.mode === 'pan') drag.current = null; }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {links.map((l, i) => {
            const a = pos.get(l.source)!, b = pos.get(l.target)!;
            const lit = neighbors && neighbors.has(l.source) && neighbors.has(l.target) && (l.source === hover || l.target === hover);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit ? 'var(--text-2)' : 'var(--border-strong)'} strokeWidth={((lit ? 1.6 : 1) * u) / view.k} strokeDasharray={l.kind === 'entity' ? `${(4 * u) / view.k} ${(3 * u) / view.k}` : undefined} opacity={neighbors && !lit ? 0.25 : 1} />;
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id)!; const r = radius(n) * u;
            const dim = neighbors && !neighbors.has(n.id);
            const label = showAllLabels || n.id === hover || n.id === focusId || (neighbors?.has(n.id) ?? false);
            return (
              <g key={n.id} className="node" transform={`translate(${p.x} ${p.y})`} opacity={dim ? 0.2 : 1} tabIndex={0} role="link"
                aria-label={`${n.label} (${n.kind === 'note' ? 'note' : n.type})`}
                onPointerDown={(e) => onDown(e, n.id)} onPointerUp={(e) => { e.stopPropagation(); onUp(n); }}
                onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                onKeyDown={(e) => { if (e.key === 'Enter') open(n); }}>
                <circle r={r / Math.sqrt(view.k)} fill={colorOf(n)} stroke={n.id === focusId ? pal.sel : 'var(--surface)'} strokeWidth={((n.id === focusId ? 2.5 : 1.5) * u) / view.k} />
                {label && <text className="lbl" x={0} y={-(r / Math.sqrt(view.k)) - (5 * u) / view.k} textAnchor="middle" style={{ fontSize: (12 * u) / view.k, strokeWidth: (3 * u) / view.k }}>{n.label.length > 40 ? n.label.slice(0, 38) + '…' : n.label}</text>}
                <title>{n.label}{n.kind === 'entity' ? ` · ${n.type}` : ''}</title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="legend" aria-hidden>
        <span><i style={{ background: pal.cat[0] }} />Notes ({counts.notes})</span>
        {counts.places > 0 && <span><i style={{ background: pal.cat[2] }} />Places ({counts.places})</span>}
        {counts.other > 0 && <span><i style={{ background: pal.cat[1] }} />Other entities ({counts.other})</span>}
        {truncated && <span>Showing first {MAX_NODES}</span>}
      </div>
      <div className="tools">
        <button className="btn sm" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, k: Math.min(6, v.k * 1.3) }))}>＋</button>
        <button className="btn sm" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k / 1.3) }))}>−</button>
        <button className="btn sm" aria-label="Reset view" onClick={() => setView({ k: 1, x: 0, y: 0 })}>⟲</button>
      </div>
    </div>
  );
}

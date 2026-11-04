import { useMemo, useRef, useState } from 'react';

// Thin 2px lines, recessive grid, one y-axis, crosshair + tooltip on hover.
export interface Series { label: string; color: string; points: { x: number; y: number; xLabel: string }[]; dashed?: boolean; }

function niceTicks(min: number, max: number, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min; const step0 = span / n; const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const out: number[] = [];
  // Span from the tick at/below the minimum to the tick at/above the maximum, so no line leaves the plot.
  const top = Math.ceil(max / step - 1e-9) * step;
  for (let v = Math.floor(min / step) * step; v <= top + step * 0.001; v += step) out.push(+v.toFixed(10));
  return out;
}

export function LineChart({ series, height = 220, yFormat = (v: number) => v.toLocaleString(), xTicks = 5, ariaLabel, baseline }: { series: Series[]; height?: number; yFormat?: (v: number) => string; xTicks?: number; ariaLabel: string; baseline?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 52, R = 12, T = 10, B = 26;
  const all = series.flatMap((s) => s.points);
  const { xs, x0, x1, ticks, sx, sy } = useMemo(() => {
    const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
    const ys = all.map((p) => p.y).concat(baseline != null ? [baseline] : []);
    const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
    const x0 = xs[0], x1 = xs[xs.length - 1];
    const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
    const sy = (y: number) => T + (1 - (y - ticks[0]) / (ticks[ticks.length - 1] - ticks[0] || 1)) * (H - T - B);
    return { xs, x0, x1, ticks, sx, sy };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, height, baseline]);
  if (!all.length) return <div className="empty">No data points</div>;
  const labelAt = (x: number) => all.find((p) => p.x === x)?.xLabel || '';
  const tickXs = xs.length <= xTicks ? xs : Array.from({ length: xTicks }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (xTicks - 1))]);
  const hx = hover != null ? xs[hover] : null;

  const onMove = (ev: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    xs.forEach((x, i) => { const d = Math.abs(sx(x) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: 'block', overflow: 'visible' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={L - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tab">{yFormat(t)}</text>
          </g>
        ))}
        {baseline != null && <line x1={L} x2={W - R} y1={sy(baseline)} y2={sy(baseline)} stroke="var(--axis)" strokeWidth={1.2} />}
        {tickXs.map((x) => <text key={x} x={sx(x)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">{labelAt(x)}</text>)}
        {series.map((s) => (
          <path key={s.label} d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('')} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.length > 1 && series.map((s) => { const last = s.points[s.points.length - 1]; return last ? <circle key={s.label} cx={sx(last.x)} cy={sy(last.y)} r={3} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} /> : null; })}
        {hx != null && (
          <g>
            <line x1={sx(hx)} x2={sx(hx)} y1={T} y2={H - B} stroke="var(--axis)" strokeWidth={1} />
            {series.map((s) => { const p = s.points.find((q) => q.x === hx); return p ? <circle key={s.label} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null; })}
          </g>
        )}
      </svg>
      {hx != null && (
        <div className="tooltip" style={{ left: `${(sx(hx) / W) * 100}%`, top: 0, transform: sx(hx) > W * 0.65 ? 'translateX(-105%)' : 'translateX(8px)' }}>
          <div className="t">{labelAt(hx)}</div>
          {series.map((s) => { const p = s.points.find((q) => q.x === hx); return p ? <div key={s.label} className="small"><span className="sw" style={{ display: 'inline-block', width: 10, height: 3, background: s.color, marginRight: 6, verticalAlign: 3 }} />{series.length > 1 ? `${s.label}: ` : ''}<strong>{yFormat(p.y)}</strong></div> : null; })}
        </div>
      )}
      {series.length > 1 && (
        <div className="row wrap small" style={{ marginTop: 4, gap: 14 }}>
          {series.map((s) => <span key={s.label}><span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}`, marginRight: 6, verticalAlign: 3 }} />{s.label}</span>)}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, width = 90, height = 24, color = 'var(--s1)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <span className="tiny muted">—</span>;
  const mn = Math.min(...values), mx = Math.max(...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 2 - ((v - mn) / (mx - mn || 1)) * (height - 4)).toFixed(1)}`).join('');
  return <svg width={width} height={height} aria-hidden><path d={d} fill="none" stroke={color} strokeWidth={1.5} /></svg>;
}

export function BarList({ rows, format, max }: { rows: { key: string; label: React.ReactNode; value: number; sub?: string }[]; format: (v: number) => string; max?: number }) {
  const m = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div role="table">
      {rows.map((r) => (
        <div className="barRow" key={r.key} role="row" title={`${r.sub || ''}`}>
          <div role="cell" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
          <div role="cell"><div className="bar" style={{ width: `${Math.max(1, (r.value / m) * 100)}%` }} /></div>
          <div role="cell" className="num r" style={{ textAlign: 'right' }}>{format(r.value)}{r.sub && <div className="tiny muted">{r.sub}</div>}</div>
        </div>
      ))}
    </div>
  );
}

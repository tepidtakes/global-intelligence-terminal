import { useEffect, useMemo, useState } from 'react';
import { api, useApi } from '../api';
import { useApp, useAuth, useIsDark } from '../state';
import { WorldMap, type HoverInfo, type CityPoint } from '../map/WorldMap';
import { colorize, palette, layerDefFor, tooltipValue, type LayerData } from '../map/layers';
import { LayerPanel } from '../map/LayerPanel';
import { PreviewPane } from './PreviewPane';
import { fmtUnit, TYPE_ICON } from '../format';
import { SourceRef } from '../components/common';

let lastHandledFly = 0;

export function MapPage() {
  const { map: cfg, setMap, selected, select, flyRequest, viewRef } = useApp();
  const { user } = useAuth();
  const dark = useIsDark();
  const pal = useMemo(() => palette(dark), [dark]);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [fly, setFly] = useState<{ id: string; n: number; coords?: [number, number] } | null>(null);

  const nav = useApi<any[]>('/geo/nav', 3600_000);
  const citiesQ = useApi<any[]>('/entities?type=city', 3600_000);
  const ccn3ToIso3 = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of nav.data || []) for (const c of r.countries) if (c.ccn3) m[c.ccn3] = c.iso3;
    return m;
  }, [nav.data]);
  const cities: CityPoint[] = useMemo(() => (citiesQ.data || []).filter((c) => c.coords).map((c) => ({ id: c.id, name: c.name, coords: c.coords, tier: c.attrs?.tier || 3, capital: !!c.attrs?.capital })), [citiesQ.data]);

  // Active fill layer data
  const layerPath = useMemo(() => {
    const f = cfg.fill;
    if (f === 'none') return null;
    if (f === 'exposure' && !user) return null;
    if (f === 'igo') return `/map/layer/igo?igos=${encodeURIComponent(cfg.igos.join(','))}${cfg.igoYear ? `&year=${cfg.igoYear}` : ''}`;
    if (f === 'commodity') return '/map/layer/commodity:crude-oil';
    if (f === 'trade') return '/map/layer/trade:X:2709';
    if (f === 'fx') return '/map/layer/fx:y1';
    return `/map/layer/${encodeURIComponent(f)}${f.startsWith('wb:') && cfg.year ? `?year=${cfg.year}` : ''}`;
  }, [cfg.fill, cfg.igos, cfg.igoYear, cfg.year, user]);
  const layer = useApi<LayerData>(layerPath, 600_000);
  const fillDef = layerDefFor(cfg.fill);
  const { colors, legend } = useMemo(() => colorize(layer.data, pal, cfg.classify, fillDef, cfg.fill), [layer.data, pal, cfg.classify, fillDef, cfg.fill]);

  const overlay = useApi<any[]>(cfg.overlayIgo ? `/igo/${encodeURIComponent(cfg.overlayIgo)}/members` : null, 600_000);
  const overlayIso = useMemo(() => (overlay.data || []).filter((m) => m.active).map((m) => m.iso3), [overlay.data]);

  // Preview of the selected entity (also gives a geographic anchor for non-geo entities)
  const preview = useApi<any>(selected ? `/preview/${encodeURIComponent(selected)}` : null, 30_000);
  const highlightId = preview.data?.anchor?.id || (selected && /^(country|state|county|city):/.test(selected) ? selected : null);

  // Resolve fly requests (from search, profiles, navigator) to a geographic anchor.
  useEffect(() => {
    // Each request flies once; returning to the map keeps the last position instead of replaying it.
    if (!flyRequest || flyRequest.n === lastHandledFly) return;
    lastHandledFly = flyRequest.n;
    const id = flyRequest.id;
    if (id.startsWith('igo:')) { setMap({ fill: 'igo', igos: [id], igoYear: null }); setFly({ id: 'world', n: flyRequest.n, coords: [15, 30] }); return; }
    api(`/preview/${encodeURIComponent(id)}`).then((pv) => { if (pv.anchor) setFly({ id: pv.anchor.id, coords: pv.anchor.coords, n: flyRequest.n }); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyRequest?.n]);

  const onSelect = (id: string) => {
    const flyToIt = id.startsWith('country:') || id.startsWith('state:');
    select(id);
    if (flyToIt) setFly((f) => ({ id, n: (f?.n || 0) + 1 }));
  };

  const tooltip = hover && (() => {
    const v = hover.iso3 && hover.kind === 'country' ? layer.data?.values[hover.iso3] : undefined;
    let line: string | null = null;
    if (layer.data && hover.kind === 'country') {
      if (layer.data.kind === 'numeric') line = v ? `${tooltipValue(fillDef, v, layer.data.unit)} (${v.period})` : 'No data';
      else line = v ? (layer.data.categories?.find((c) => c.key === v)?.label || v) : (layer.data.kind === 'categorical' && cfg.fill === 'igo' ? 'Not a member' : 'No data');
    }
    const detail = hover.iso3 ? layer.data?.detail?.[hover.iso3] : undefined;
    return (
      <div className="tooltip" style={{ left: Math.min(hover.x + 14, 99999), top: hover.y + 14 }}>
        <div className="t">{hover.name}</div>
        {line && <div className="small">{line}</div>}
        {detail && <div className="tiny muted">{detail}</div>}
        <div className="tiny muted">{hover.kind === 'country' ? 'Click to select · zooms in' : hover.kind === 'state' ? 'State — click to select' : 'County — click to select'}</div>
      </div>
    );
  })();

  const crumbs = preview.data ? [...(preview.data.parents || []), preview.data.entity] : [];
  const def = layerDefFor(cfg.fill);

  return (
    <div className={`mapPage ${selected ? 'hasPreview' : 'noPreview'} ${showSidebar ? 'showSidebar' : ''}`}>
      <LayerPanel nav={nav.data || []} onNavigate={(id) => { select(id, { fly: true }); setShowSidebar(false); }} />
      <div className="mapWrap">
        {nav.data ? (
          <WorldMap ccn3ToIso3={ccn3ToIso3} colors={colors} overlayIso={overlayIso} pal={pal} highlightId={highlightId}
            showAdmin={cfg.showAdmin} showCities={cfg.showCities} cities={cities} viewRef={viewRef} fly={fly}
            onHover={setHover} onSelect={onSelect} />
        ) : <div className="empty" style={{ paddingTop: 80 }}>{nav.error ? `Could not load geography: ${nav.error.message}` : 'Loading map…'}</div>}
        <div className="breadcrumbs">
          <button className="chip" onClick={() => setShowSidebar((s) => !s)} style={{ cursor: 'pointer' }} aria-label="Toggle layers panel">☰ Layers</button>
          <button className="chip" style={{ cursor: 'pointer' }} onClick={() => { select(null); setFly((f) => ({ id: 'world', n: (f?.n || 0) + 1, coords: [10, 25] })); }}>🌐 World</button>
          {crumbs.filter((c: any) => c && c.type !== 'region').map((c: any) => (
            <button key={c.id} className="chip" style={{ cursor: 'pointer', fontWeight: c.id === selected ? 650 : 400 }} onClick={() => select(c.id, { fly: true })}>
              <span className="ico">{c.flag || TYPE_ICON[c.type]}</span>{c.name}
            </button>
          ))}
        </div>
        {tooltip}
        {(legend || layer.loading || layer.error || (cfg.fill === 'exposure' && !user)) && (
          <div className="legend" aria-live="polite">
            {cfg.fill === 'exposure' && !user ? <div>Sign in to map your positions’ exposure.</div> :
              layer.error && !layer.data ? <div className="err">Layer unavailable: {layer.error.message}</div> :
              !legend ? <div className="muted">Loading {def?.label || 'layer'}…</div> : (
              <>
                <div className="ttl">{legend.title}{layer.loading && <span className="muted"> · updating…</span>}</div>
                {legend.hint && <div className="lhint">{legend.hint}</div>}
                {legend.rows.map((r) => <div className="lr" key={r.label}><span className="sw" style={{ background: r.color }} />{r.label}</div>)}
                {legend.period && <div className="tiny muted" style={{ marginTop: 4 }}>Period: {legend.period}</div>}
                {legend.note && <div className="tiny muted" style={{ marginTop: 4 }}>{legend.note}</div>}
                {legend.stale && <div className="tiny" style={{ color: 'var(--warn)' }}>Provider unreachable — showing last cached copy.</div>}
                <div style={{ marginTop: 4 }}>{[...new Set(legend.sourceIds || [])].slice(0, 2).map((s) => <div key={s}><SourceRef id={s} /></div>)}</div>
                {cfg.overlayIgo && <div className="tiny" style={{ marginTop: 4 }}><span className="sw" style={{ border: `2px dashed ${pal.overlay}`, background: 'transparent' }} />Outline: {cfg.overlayIgo.replace('igo:', '').toUpperCase()} members</div>}
              </>
            )}
          </div>
        )}
      </div>
      {selected && <PreviewPane id={selected} data={preview.data} loading={preview.loading} error={preview.error?.message} onClose={() => select(null)} />}
    </div>
  );
}

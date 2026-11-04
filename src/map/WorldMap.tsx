import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import * as topojson from 'topojson-client';
import world from 'world-atlas/countries-50m.json';
import usStates from 'us-atlas/states-10m.json';
import { FIPS_POSTAL } from './usStates';
import type { Palette } from './layers';
import type { MapView } from '../state';
import { save } from '../state';

export interface HoverInfo { id: string; name: string; kind: 'country' | 'state' | 'county' | 'city'; iso3?: string; x: number; y: number; }
export interface CityPoint { id: string; name: string; coords: [number, number]; tier: number; capital: boolean; }

interface Props {
  ccn3ToIso3: Record<string, string>;
  colors: Record<string, string>;
  overlayIso: string[];
  pal: Palette;
  highlightId: string | null;
  showAdmin: boolean;
  showCities: boolean;
  cities: CityPoint[];
  viewRef: React.MutableRefObject<MapView>;
  fly: { id: string; n: number; coords?: [number, number] } | null;
  onHover: (h: HoverInfo | null) => void;
  onSelect: (id: string) => void;
}

type BBox = [number, number, number, number];
const bboxes = new Map<string, BBox>();

/** Bounding box of a feature's largest polygon (avoids Alaska/Aleutians stretching the US to the antimeridian). */
function mainBBox(geom: any): BBox {
  const polys: number[][][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let best: number[][][] | null = null; let bestA = -1;
  for (const p of polys) {
    const ring = p[0]; let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    a = Math.abs(a / 2);
    if (a > bestA) { bestA = a; best = p; }
  }
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const [x, y] of best?.[0] || []) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return [minX, minY, maxX, maxY];
}

/** world-atlas rings that cross the antimeridian (Russia, Fiji…) jump from +180 to −180;
 *  shift their western-hemisphere points by +360 so they render as one contiguous shape. */
function fixAntimeridian(geom: any) {
  const polys: number[][][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const poly of polys) for (const ring of poly) {
    let crosses = false;
    for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) { crosses = true; break; }
    if (crosses) for (const pt of ring) if (pt[0] < 0) pt[0] += 360;
  }
}

const NO_ID = '__none__';

function buildCountries(ccn3ToIso3: Record<string, string>) {
  const fc: any = topojson.feature(world as any, (world as any).objects.countries);
  const byName: Record<string, string> = { Kosovo: 'UNK' };
  fc.features.forEach((f: any, i: number) => {
    if (f.id !== '010') fixAntimeridian(f.geometry); // Antarctica's ring legitimately spans all longitudes
    const iso3 = (f.id && ccn3ToIso3[f.id]) || byName[f.properties.name] || '';
    f.properties = { fid: i, name: f.properties.name, iso3, eid: iso3 ? `country:${iso3}` : '' };
    if (iso3) bboxes.set(`country:${iso3}`, mainBBox(f.geometry));
  });
  return fc;
}
function buildStates() {
  const fc: any = topojson.feature(usStates as any, (usStates as any).objects.states);
  fc.features.forEach((f: any, i: number) => {
    const eid = FIPS_POSTAL[f.id] ? `state:US-${FIPS_POSTAL[f.id]}` : '';
    f.properties = { fid: i, name: f.properties.name, eid };
    if (eid) bboxes.set(eid, mainBBox(f.geometry));
  });
  return fc;
}

const FILL_LAYERS = ['counties-fill', 'states-fill', 'countries-fill'] as const;

export function WorldMap(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>();
  const [ready, setReady] = useState(false);
  const hovered = useRef<{ source: string; id: number } | null>(null);
  const markers = useRef<{ m: maplibregl.Marker; c: CityPoint; el: HTMLElement }[]>([]);
  const countiesLoaded = useRef(false);
  const props = useRef(p); props.current = p;

  // Init once.
  useEffect(() => {
    setReady(false); countiesLoaded.current = false;
    const v = p.viewRef.current;
    const m = new maplibregl.Map({
      container: el.current!, center: v.center, zoom: v.zoom, minZoom: 0.6, maxZoom: 11, dragRotate: false, pitchWithRotate: false, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': p.pal.ocean } }] },
    });
    map.current = m;
    if (import.meta.env.DEV) (window as any).__map = m;
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Boundaries © Natural Earth, US Census Bureau · Data: World Bank, UN Comtrade' }));
    m.on('load', () => {
      const pal = props.current.pal;
      m.addSource('countries', { type: 'geojson', data: buildCountries(props.current.ccn3ToIso3), promoteId: 'fid' });
      m.addSource('states', { type: 'geojson', data: buildStates(), promoteId: 'fid' });
      m.addLayer({ id: 'countries-fill', type: 'fill', source: 'countries', paint: { 'fill-color': pal.nodata } });
      m.addLayer({ id: 'countries-line', type: 'line', source: 'countries', paint: { 'line-color': pal.line, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 5, 1] } });
      m.addLayer({ id: 'states-fill', type: 'fill', source: 'states', minzoom: 2.8, paint: { 'fill-color': '#000', 'fill-opacity': 0.001 } });
      m.addLayer({ id: 'states-line', type: 'line', source: 'states', minzoom: 2.6, paint: { 'line-color': pal.line, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 7, 1.2], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 2.6, 0, 3.4, 1] } });
      m.addLayer({ id: 'overlay-line', type: 'line', source: 'countries', filter: ['in', ['get', 'iso3'], ['literal', []]], paint: { 'line-color': pal.overlay, 'line-width': 2, 'line-dasharray': [2, 1] } });
      for (const s of ['countries', 'states']) {
        m.addLayer({ id: `${s}-hover`, type: 'line', source: s, minzoom: s === 'states' ? 2.8 : 0, paint: { 'line-color': pal.hover, 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 0] } });
        m.addLayer({ id: `${s}-sel`, type: 'line', source: s, filter: ['==', ['get', 'eid'], NO_ID], paint: { 'line-color': pal.sel, 'line-width': 2.6 } });
      }
      setReady(true);
    });
    m.on('moveend', () => {
      const c = m.getCenter();
      props.current.viewRef.current = { center: [+c.lng.toFixed(4), +c.lat.toFixed(4)], zoom: +m.getZoom().toFixed(2) };
      save('git.view', props.current.viewRef.current);
    });
    m.on('zoom', () => { updateMarkers(); maybeLoadCounties(); });
    m.on('mousemove', (e) => {
      const avail = FILL_LAYERS.filter((l) => m.getLayer(l));
      const feats = m.queryRenderedFeatures(e.point, { layers: avail as any });
      const f = feats.find((x) => x.properties?.eid);
      const src = f?.source; const id = f?.id as number | undefined;
      if (hovered.current && (hovered.current.source !== src || hovered.current.id !== id)) {
        m.setFeatureState({ source: hovered.current.source, id: hovered.current.id }, { hover: false }); hovered.current = null;
      }
      if (f && src && id != null) {
        m.setFeatureState({ source: src, id }, { hover: true }); hovered.current = { source: src, id };
        m.getCanvas().style.cursor = 'pointer';
        const kind = src === 'countries' ? 'country' : src === 'states' ? 'state' : 'county';
        props.current.onHover({ id: f.properties!.eid, name: f.properties!.name, kind, iso3: f.properties!.iso3, x: e.point.x, y: e.point.y });
      } else { m.getCanvas().style.cursor = ''; props.current.onHover(null); }
    });
    m.on('mouseout', () => { props.current.onHover(null); if (hovered.current) { m.setFeatureState({ source: hovered.current.source, id: hovered.current.id }, { hover: false }); hovered.current = null; } });
    m.on('click', (e) => {
      const avail = FILL_LAYERS.filter((l) => m.getLayer(l));
      const f = m.queryRenderedFeatures(e.point, { layers: avail as any }).find((x) => x.properties?.eid);
      if (f) props.current.onSelect(f.properties!.eid);
    });
    const ro = new ResizeObserver(() => m.resize()); ro.observe(el.current!);
    return () => { ro.disconnect(); m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function maybeLoadCounties() {
    const m = map.current!;
    if (countiesLoaded.current || m.getZoom() < 4.6 || !m.getSource('states')) return;
    countiesLoaded.current = true;
    const mod: any = await import('us-atlas/counties-10m.json');
    const topo = mod.default || mod;
    const fc: any = topojson.feature(topo, topo.objects.counties);
    fc.features.forEach((f: any, i: number) => { f.properties = { fid: i, name: f.properties.name, eid: `county:${f.id}` }; bboxes.set(`county:${f.id}`, mainBBox(f.geometry)); });
    const pal = props.current.pal;
    m.addSource('counties', { type: 'geojson', data: fc, promoteId: 'fid' });
    const vis = props.current.showAdmin ? 'visible' : 'none';
    m.addLayer({ id: 'counties-fill', type: 'fill', source: 'counties', minzoom: 5.2, layout: { visibility: vis }, paint: { 'fill-color': '#000', 'fill-opacity': 0.001 } }, 'states-line');
    m.addLayer({ id: 'counties-line', type: 'line', source: 'counties', minzoom: 5.2, layout: { visibility: vis }, paint: { 'line-color': pal.line, 'line-width': 0.4, 'line-opacity': 0.7 } }, 'states-line');
    m.addLayer({ id: 'counties-hover', type: 'line', source: 'counties', minzoom: 5.2, layout: { visibility: vis }, paint: { 'line-color': pal.hover, 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.4, 0] } });
    m.addLayer({ id: 'counties-sel', type: 'line', source: 'counties', layout: { visibility: vis }, filter: ['==', ['get', 'eid'], props.current.highlightId || NO_ID], paint: { 'line-color': pal.sel, 'line-width': 2.4 } });
  }

  function updateMarkers() {
    const m = map.current; if (!m) return;
    const z = m.getZoom();
    for (const { c, el: e } of markers.current) {
      // Tier 4 = small places that sit next to a bigger label (e.g. Hershey beside Harrisburg).
      const minZ = c.tier === 1 ? 2.2 : c.tier === 2 ? 3.6 : c.tier === 3 ? 5.2 : 7.5;
      e.style.display = props.current.showCities && z >= minZ ? 'flex' : 'none';
    }
  }

  // Fill colors
  useEffect(() => {
    const m = map.current; if (!ready || !m || !m.getLayer('countries-fill')) return;
    const entries = Object.entries(p.colors);
    m.setPaintProperty('countries-fill', 'fill-color', entries.length ? ['match', ['get', 'iso3'], ...entries.flat(), p.pal.nodata] as any : p.pal.nodata);
  }, [ready, p.colors, p.pal]);

  // Theme-dependent paints
  useEffect(() => {
    const m = map.current; if (!ready || !m || !m.getLayer('countries-fill')) return;
    m.setPaintProperty('bg', 'background-color', p.pal.ocean);
    for (const l of ['countries-line', 'states-line', 'counties-line']) if (m.getLayer(l)) m.setPaintProperty(l, 'line-color', p.pal.line);
    for (const l of ['countries-hover', 'states-hover', 'counties-hover']) if (m.getLayer(l)) m.setPaintProperty(l, 'line-color', p.pal.hover);
    for (const l of ['countries-sel', 'states-sel', 'counties-sel']) if (m.getLayer(l)) m.setPaintProperty(l, 'line-color', p.pal.sel);
    m.setPaintProperty('overlay-line', 'line-color', p.pal.overlay);
  }, [ready, p.pal]);

  useEffect(() => {
    const m = map.current; if (!ready || !m || !m.getLayer('countries-fill')) return;
    m.setFilter('overlay-line', ['in', ['get', 'iso3'], ['literal', p.overlayIso]]);
  }, [ready, p.overlayIso]);

  useEffect(() => {
    const m = map.current; if (!ready || !m || !m.getLayer('countries-fill')) return;
    const id = p.highlightId || NO_ID;
    for (const l of ['countries-sel', 'states-sel', 'counties-sel']) if (m.getLayer(l)) m.setFilter(l, ['==', ['get', 'eid'], id]);
    for (const { c, el: e } of markers.current) e.classList.toggle('sel', c.id === id);
  }, [ready, p.highlightId]);

  useEffect(() => {
    const m = map.current; if (!ready || !m || !m.getLayer('countries-fill')) return;
    const vis = p.showAdmin ? 'visible' : 'none';
    for (const l of ['states-fill', 'states-line', 'states-hover', 'states-sel', 'counties-fill', 'counties-line', 'counties-hover', 'counties-sel']) if (m.getLayer(l)) m.setLayoutProperty(l, 'visibility', vis);
  }, [ready, p.showAdmin]);

  // City markers
  useEffect(() => {
    const m = map.current; if (!ready || !m || !m.getLayer('countries-fill')) return;
    for (const x of markers.current) x.m.remove();
    markers.current = p.cities.map((c) => {
      const e = document.createElement('div');
      e.className = `cityMarker${c.capital ? ' capital' : ''}`;
      e.innerHTML = '<span class="dot"></span><span class="lbl"></span>';
      (e.querySelector('.lbl') as HTMLElement).textContent = c.name;
      e.title = c.name;
      e.addEventListener('click', (ev) => { ev.stopPropagation(); props.current.onSelect(c.id); });
      e.addEventListener('mouseenter', () => props.current.onHover(null));
      const mk = new maplibregl.Marker({ element: e, anchor: 'left', offset: [-4, 0] }).setLngLat(c.coords).addTo(m);
      return { m: mk, c, el: e };
    });
    updateMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.cities]);
  useEffect(() => { updateMarkers(); }, [p.showCities]);

  // Fly to a requested entity
  useEffect(() => {
    const m = map.current; if (!ready || !m || !p.fly || !m.getLayer('countries-fill')) return;
    const b = bboxes.get(p.fly.id);
    // On narrow screens the preview pane floats over the map; keep the target clear of it.
    const pv = document.querySelector('.preview') as HTMLElement | null;
    const overlay = pv && getComputedStyle(pv).position === 'absolute' ? pv.clientWidth : 0;
    const pad = { top: 60, bottom: 60, left: 40, right: 40 + overlay };
    if (p.fly.id === 'world') {
      m.flyTo({ center: p.fly.coords || [10, 25], zoom: 1.6, duration: 900 });
    } else if (b) {
      const big = b[2] - b[0] > 60;
      m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad, maxZoom: p.fly.id.startsWith('county:') ? 8 : p.fly.id.startsWith('state:') ? 6.2 : big ? 3 : 5.2, duration: 900 });
      if (p.fly.id.startsWith('state:') || p.fly.id.startsWith('county:')) maybeLoadCounties();
    } else if (p.fly.coords) {
      m.flyTo({ center: p.fly.coords, zoom: Math.max(m.getZoom(), p.fly.id.startsWith('city:') ? 7 : 3.5), duration: 900 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.fly?.n, p.fly?.id]);

  return <div ref={el} style={{ position: 'absolute', inset: 0 }} aria-label="Interactive world map" role="application" />;
}

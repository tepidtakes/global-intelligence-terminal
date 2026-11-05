import { useState } from 'react';
import { api, useApi, invalidate } from '../api';
import { useApp, useAuth, useIsDark, load, save } from '../state';
import { LAYERS, GROUPS, COMMODITY_LAYERS, PRODUCTS, layerDefFor, defaultFill, palette, swatchFor, type LayerDef } from './layers';
import { TYPE_ICON } from '../format';

const YEARS = ['', '2024', '2020', '2015', '2010', '2005', '2000', '1995', '1990'];
type Tab = 'layers' | 'places' | 'saved';
const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase());

export function LayerPanel({ nav, onNavigate }: { nav: any[]; onNavigate: (id: string) => void }) {
  const { map: cfg, setMap } = useApp();
  const { user } = useAuth();
  const pal = palette(useIsDark());
  const [tab, setTabState] = useState<Tab>(() => load('git.sb.tab', 'layers'));
  const setTab = (t: Tab) => { setTabState(t); save('git.sb.tab', t); };
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>(() => load('git.sb.open', {}));
  const def = layerDefFor(cfg.fill);
  const isOpen = (g: string) => (q ? true : open[g] ?? g === def?.group);
  const toggle = (g: string) => { const n = { ...open, [g]: !isOpen(g) }; setOpen(n); save('git.sb.open', n); };
  const matches = (d: LayerDef) => !q || `${d.label} ${d.hint} ${d.keywords || ''}`.toLowerCase().includes(q.toLowerCase());
  const pick = (d: LayerDef) => { if (layerDefFor(cfg.fill)?.id !== d.id) setMap({ fill: defaultFill(d) }); };
  const anyMatch = LAYERS.some(matches);

  return (
    <aside className="sidebar sb" aria-label="Map layers and navigation">
      <div className="sbTabs" role="tablist">
        {([['layers', 'Layers'], ['places', 'Places'], ['saved', 'Saved']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'layers' && (
        <>
          {def && <ActiveLayer def={def} swatch={swatchFor(def, pal, cfg.fill)} />}
          <div className="sbSearch">
            <input className="input" placeholder="Find a layer — e.g. inflation, oil, war" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a map layer" />
          </div>
          <div className="lgroups">
            {GROUPS.map((g) => {
              const items = LAYERS.filter((l) => l.group === g.id && matches(l));
              if (!items.length) return null;
              const active = items.some((l) => l.id === def?.id);
              return (
                <div key={g.id} className={`lgroup${active ? ' hasActive' : ''}`}>
                  <button className="lgHead" onClick={() => toggle(g.id)} aria-expanded={isOpen(g.id)}>
                    <span className="chev" aria-hidden>{isOpen(g.id) ? '▾' : '▸'}</span>
                    <span className="gi" aria-hidden>{g.icon}</span>
                    <span className="gl">{g.label}</span>
                    {active && !isOpen(g.id) && <span className="dot" title="Active layer is in this group" />}
                    <span className="cnt">{items.length}</span>
                  </button>
                  {isOpen(g.id) && (
                    <div className="lgItems">
                      {items.map((l) => (
                        <button key={l.id} className={`litem${def?.id === l.id ? ' on' : ''}`} onClick={() => pick(l)} title={l.hint} aria-pressed={def?.id === l.id}>
                          <span className="lsw" style={{ background: swatchFor(l, pal) }} aria-hidden />
                          <span className="ll">{l.label}</span>
                          {l.live && <span className="lbadge" title="Loaded live from the source">live</span>}
                          {l.needsAuth && !user && <span className="lbadge">sign in</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!anyMatch && <div className="small muted" style={{ padding: '8px 14px' }}>No layer matches “{q}”.</div>}
          </div>
          <DisplayOptions />
        </>
      )}

      {tab === 'places' && <Places nav={nav} onNavigate={onNavigate} />}
      {tab === 'saved' && <Saved />}
    </aside>
  );
}

function ActiveLayer({ def, swatch }: { def: LayerDef; swatch: string }) {
  const { map: cfg, setMap } = useApp();
  const igos = useApi<any[]>(def.id === 'igo' ? '/entities?type=igo' : null, 3600_000);
  const group = GROUPS.find((g) => g.id === def.group);
  const toggleIgo = (id: string) => {
    const cur = cfg.igos.includes(id) ? cfg.igos.filter((x) => x !== id) : [...cfg.igos, id].slice(-3);
    setMap({ igos: cur.length ? cur : [id], fill: 'igo' });
  };
  const [, flow, hs] = cfg.fill.startsWith('trade:') ? cfg.fill.split(':') : ['', 'X', '2709'];
  const productGroups = [...new Set(PRODUCTS.map((p) => p.group))];
  return (
    <div className="activeLayer" aria-live="polite">
      <div className="alHead">
        <span className="alIcon" aria-hidden>{group?.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div className="tiny muted">{group?.label} · showing</div>
          <div className="alTitle">{def.label}</div>
        </div>
      </div>
      {def.id !== 'none' && <div className="alSwatch" style={{ background: swatch }} aria-hidden />}
      <div className="small muted">{def.hint}</div>
      <div className="stack" style={{ marginTop: 8 }}>
        {def.variants && (
          <div className="seg" role="group" aria-label="Measure">
            {def.variants.map((v) => <button key={v.id} className={cfg.fill === v.id ? 'on' : ''} onClick={() => setMap({ fill: v.id })}>{v.label}</button>)}
          </div>
        )}
        {def.yearable && (
          <div className="grid2">
            <label className="field">Year
              <select className="input" value={cfg.year || ''} onChange={(e) => setMap({ year: e.target.value || null })}>
                {YEARS.map((y) => <option key={y} value={y}>{y || 'Latest available'}</option>)}
              </select>
            </label>
            {def.color.kind !== 'signed' && def.color.kind !== 'target' && (
              <label className="field">Color classes
                <select className="input" value={cfg.classify} onChange={(e) => setMap({ classify: e.target.value as any })}>
                  <option value="quantile">Equal counts</option><option value="equal">Equal ranges</option><option value="log">Logarithmic</option>
                </select>
              </label>
            )}
          </div>
        )}
        {def.id === 'trade' && (
          <>
            <div className="seg" role="group" aria-label="Direction">
              <button className={flow === 'X' ? 'on' : ''} onClick={() => setMap({ fill: `trade:X:${hs}` })}>Exporters</button>
              <button className={flow === 'M' ? 'on' : ''} onClick={() => setMap({ fill: `trade:M:${hs}` })}>Importers</button>
            </div>
            <label className="field">Product
              <select className="input" value={hs} onChange={(e) => setMap({ fill: `trade:${flow}:${e.target.value}` })}>
                {productGroups.map((g) => <optgroup key={g} label={g}>{PRODUCTS.filter((p) => p.group === g).map((p) => <option key={p.hs} value={p.hs}>{p.label}</option>)}</optgroup>)}
              </select>
            </label>
            <div className="tiny muted">First load of a product can take ~10 s (UN Comtrade rate limits); it is cached for a week after.</div>
          </>
        )}
        {def.id === 'war' && <WarPicker />}
        {def.id === 'commodity' && (
          <label className="field">Commodity
            <select className="input" value={cfg.fill.startsWith('commodity:') ? cfg.fill : 'commodity:crude-oil'} onChange={(e) => setMap({ fill: e.target.value })}>
              {COMMODITY_LAYERS.map((c) => <option key={c} value={`commodity:${c}`}>{titleCase(c)}</option>)}
            </select>
          </label>
        )}
        {def.id === 'igo' && (
          <>
            <div className="small muted">Pick up to 3 — overlaps get their own color.</div>
            <div className="chips">
              {(igos.data || []).map((g) => (
                <button key={g.id} className={`chip${cfg.igos.includes(g.id) ? ' on' : ''}`} style={{ cursor: 'pointer', ...(cfg.igos.includes(g.id) ? { background: 'var(--accent-wash)', borderColor: 'var(--accent)' } : {}) }} onClick={() => toggleIgo(g.id)} aria-pressed={cfg.igos.includes(g.id)}>{g.name}</button>
              ))}
            </div>
            <label className="field">Membership as of <strong>{cfg.igoYear || 'today'}</strong>
              <input type="range" min={1945} max={new Date().getFullYear()} value={cfg.igoYear ? Number(cfg.igoYear) : new Date().getFullYear()}
                onChange={(e) => setMap({ igoYear: Number(e.target.value) >= new Date().getFullYear() ? null : e.target.value })} aria-label="Membership year" />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

/** Choose which war's sides to colour: wars between states first, then every listed conflict and the wars inside it. */
function WarPicker() {
  const { map: cfg, setMap } = useApp();
  const { data } = useApi<any>('/conflicts', 300_000);
  const withSides = (c: any) => (c.sides || []).length >= 2;
  return (
    <label className="field">War
      <select className="input" value={cfg.fill.startsWith('war:') ? cfg.fill : ''} onChange={(e) => setMap({ fill: e.target.value || 'war' })}>
        <option value="">Deadliest war with the most states taking part</option>
        {(data?.interstate || []).length > 0 && <optgroup label="Wars between states">{data.interstate.map((c: any) => <option key={c.id} value={`war:${c.id}`}>{c.name}</option>)}</optgroup>}
        {(data?.conflicts || []).filter((c: any) => withSides(c) || c.theatres.some(withSides)).map((c: any) => (
          <optgroup key={c.id} label={c.name}>
            {withSides(c) && <option value={`war:${c.id}`}>{c.name} (overall)</option>}
            {c.theatres.filter(withSides).map((t: any) => <option key={t.id} value={`war:${t.id}`}>{t.name}</option>)}
          </optgroup>
        ))}
      </select>
      {!data && <span className="tiny muted">Loading wars…</span>}
    </label>
  );
}

function DisplayOptions() {
  const { map: cfg, setMap } = useApp();
  const igos = useApi<any[]>('/entities?type=igo', 3600_000);
  const [open, setOpen] = useState(() => load('git.sb.display', false));
  return (
    <div className="lgroup display">
      <button className="lgHead" onClick={() => { setOpen(!open); save('git.sb.display', !open); }} aria-expanded={open}>
        <span className="chev" aria-hidden>{open ? '▾' : '▸'}</span><span className="gi" aria-hidden>⚙</span><span className="gl">Map display</span>
        {cfg.overlayIgo && <span className="lbadge">outline on</span>}
      </button>
      {open && (
        <div className="stack" style={{ padding: '4px 14px 12px' }}>
          <label className="field">Outline members of (combine with any layer)
            <select className="input" value={cfg.overlayIgo || ''} onChange={(e) => setMap({ overlayIgo: e.target.value || null })}>
              <option value="">— none —</option>
              {(igos.data || []).filter((g) => !['igo:imf', 'igo:wto', 'igo:world-bank'].includes(g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="layerItem"><input type="checkbox" checked={cfg.showCities} onChange={(e) => setMap({ showCities: e.target.checked })} /> Cities & capitals</label>
          <label className="layerItem"><input type="checkbox" checked={cfg.showAdmin} onChange={(e) => setMap({ showAdmin: e.target.checked })} /> US states & counties (zoom in)</label>
        </div>
      )}
    </div>
  );
}

function Places({ nav, onNavigate }: { nav: any[]; onNavigate: (id: string) => void }) {
  const { select } = useApp();
  const { user } = useAuth();
  const wls = useApi<any[]>(user ? '/watchlists' : null);
  const [q, setQ] = useState('');
  const [openRegion, setOpenRegion] = useState<string | null>(null);
  const countries = nav.flatMap((r) => r.countries.map((c: any) => ({ ...c, region: r.name })));
  const filtered = q ? countries.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30) : [];
  const go = (id: string) => onNavigate(id);
  const key = (id: string) => (e: React.KeyboardEvent) => e.key === 'Enter' && go(id);
  return (
    <>
      <section>
        <input className="input" placeholder="Find a country…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a country" autoFocus />
        <div style={{ marginTop: 6 }}>
          {q ? (filtered.length ? filtered.map((c) => (
            <div key={c.id} className="layerItem" onClick={() => go(c.id)} role="button" tabIndex={0} onKeyDown={key(c.id)}><span>{c.flag}</span>{c.name} <span className="tiny muted">{c.region}</span></div>
          )) : <div className="small muted">No country matches.</div>) : nav.map((r) => (
            <div key={r.id}>
              <div className="layerItem" onClick={() => setOpenRegion(openRegion === r.id ? null : r.id)} role="button" tabIndex={0} aria-expanded={openRegion === r.id} onKeyDown={(e) => e.key === 'Enter' && setOpenRegion(openRegion === r.id ? null : r.id)}>
                <span>{openRegion === r.id ? '▾' : '▸'}</span>{r.name} <span className="tiny muted">{r.countries.length}</span>
              </div>
              {openRegion === r.id && (
                <div style={{ paddingLeft: 14 }}>
                  <div className="layerItem" onClick={() => select(r.id)}><span>{TYPE_ICON.region}</span><em>Region overview</em></div>
                  {r.countries.filter((c: any) => c.independent).map((c: any) => (
                    <div key={c.id} className="layerItem" onClick={() => go(c.id)} role="button" tabIndex={0} onKeyDown={key(c.id)}>
                      <span>{c.flag}</span>{c.name}{c.depth === 'curated' && <span className="badge accent" title="Curated profile with politics, trade and companies">●</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Watchlists</h3>
        {!user ? <div className="small muted">Sign in to use watchlists.</div> : (wls.data || []).length === 0 ? <div className="small muted">No watchlists yet — add items with ☆ on any profile.</div> :
          (wls.data || []).map((w) => (
            <div key={w.id} style={{ marginBottom: 6 }}>
              <div className="small" style={{ fontWeight: 600 }}>{w.name}</div>
              {w.entityIds.length === 0 && <div className="tiny muted">Empty.</div>}
              <div className="chips" style={{ marginTop: 4 }}>
                {(w.entities || []).slice(0, 12).map((e: any) => (
                  <button key={e.id} className="chip" style={{ cursor: 'pointer' }} onClick={() => select(e.id, { fly: true })}><span className="ico">{e.flag || TYPE_ICON[e.type]}</span>{e.name}</button>
                ))}
              </div>
            </div>
          ))}
      </section>
    </>
  );
}

function Saved() {
  const { map: cfg, setMap, viewRef, select, toast } = useApp();
  const { user } = useAuth();
  const views = useApi<any[]>(user ? '/views' : null);
  const def = layerDefFor(cfg.fill);
  const saveView = async () => {
    const name = prompt('Name this map view', `${def?.label || 'View'} — ${new Date().toLocaleDateString()}`);
    if (!name) return;
    await api('/views', { body: { name, state: { map: cfg, view: viewRef.current } } });
    invalidate('/views'); toast('View saved');
  };
  return (
    <section>
      <h3>Saved map views</h3>
      {!user ? <div className="small muted">Sign in to save map views (layer, options and position).</div> : (
        <div className="stack">
          {(views.data || []).length === 0 && <div className="small muted">Nothing saved yet.</div>}
          {(views.data || []).map((v) => (
            <div key={v.id} className="row">
              <button className="btn ghost sm" style={{ flex: 1, justifyContent: 'flex-start' }} onClick={() => { setMap(v.state.map); viewRef.current = v.state.view; select(null); toast(`Applied “${v.name}” — position restores on next map load`); }}>{v.name}</button>
              <button className="btn ghost sm" aria-label={`Delete view ${v.name}`} onClick={async () => { await api(`/views/${v.id}`, { method: 'DELETE' }); invalidate('/views'); }}>✕</button>
            </div>
          ))}
          <button className="btn sm" onClick={saveView}>＋ Save current view</button>
        </div>
      )}
    </section>
  );
}

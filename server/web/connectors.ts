// Connectors: every live source that feeds the knowledge web registers here, saying what it adds
// and how often it refreshes. The runner schedules them, isolates failures (one source down never
// stops the others), records each run for the Data page and tells caches built on the graph to reset.
import { liveStatus } from '../augment.js';
import { graphChanged } from '../graph.js';

export interface ConnectorRun { detail: string; fetchedAt?: string; stale?: boolean; counts?: Record<string, number>; }
export interface Connector {
  id: string;
  label: string;
  /** What it adds to the web, in plain words. */
  provides: string;
  sourceIds: string[];
  everyHours: number;
  /** Seconds after start-up before the first run (sources that need others first start later). */
  delaySec?: number;
  run: () => Promise<ConnectorRun>;
}

const registry: Connector[] = [];
const runtime = new Map<string, { running: boolean; runs: number; counts?: Record<string, number>; lastDurationMs?: number; nextAt?: string }>();
const afterRun: ((id: string) => void)[] = [];

export function registerConnector(c: Connector) {
  if (registry.some((x) => x.id === c.id)) throw new Error(`Connector ${c.id} registered twice`);
  registry.push(c); runtime.set(c.id, { running: false, runs: 0 });
}
/** Called after any connector finishes (successfully or not). */
export const onConnectorRun = (fn: (id: string) => void) => { afterRun.push(fn); };

export async function runConnector(id: string) {
  const c = registry.find((x) => x.id === id); if (!c) throw new Error(`Unknown connector ${id}`);
  const rt = runtime.get(id)!;
  if (rt.running) return liveStatus[id];
  rt.running = true; const t0 = Date.now();
  try {
    const r = await c.run();
    liveStatus[id] = { ok: true, at: new Date().toISOString(), detail: r.detail, fetchedAt: r.fetchedAt, stale: r.stale, sourceId: c.sourceIds[0] };
    rt.counts = r.counts;
    graphChanged();
  } catch (e: any) {
    liveStatus[id] = { ok: false, at: new Date().toISOString(), detail: String(e?.message || e).slice(0, 300), sourceId: c.sourceIds[0] };
  } finally {
    rt.running = false; rt.runs++; rt.lastDurationMs = Date.now() - t0;
    rt.nextAt = new Date(Date.now() + c.everyHours * 3600_000).toISOString();
    for (const fn of afterRun) { try { fn(id); } catch { /* ignore */ } }
  }
  return liveStatus[id];
}

export function startConnectors() {
  for (const c of registry) {
    setTimeout(() => { void runConnector(c.id); }, (c.delaySec ?? 20) * 1000).unref();
    setInterval(() => { void runConnector(c.id); }, c.everyHours * 3600_000).unref();
  }
}

export function connectorsStatus() {
  return registry.map((c) => ({ id: c.id, label: c.label, provides: c.provides, sourceIds: c.sourceIds, everyHours: c.everyHours, status: liveStatus[c.id] || null, ...runtime.get(c.id) }));
}
export const connectorIds = () => registry.map((c) => c.id);

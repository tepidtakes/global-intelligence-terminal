// Connectors: every live source that feeds the knowledge web registers here, saying what it adds
// and how often it refreshes. The runner schedules them, isolates failures (one source down never
// stops the others), records each run for the Data page and tells caches built on the graph to reset.
import { liveStatus } from '../augment.js';
import { graphChanged } from '../graph.js';

export interface ConnectorRun {
  detail: string; fetchedAt?: string; stale?: boolean; counts?: Record<string, number>;
  /** Set to false by a run that found exactly what the web already had: nothing is reset or announced. */
  changed?: boolean;
}
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
interface Runtime {
  running: boolean; runs: number; counts?: Record<string, number>; lastDurationMs?: number; nextAt?: string;
  /** Early retries used since the last scheduled or requested run, and when the pending one is due. */
  retries: number; retryAt?: string;
  timer?: ReturnType<typeof setTimeout>; /** When the regular schedule runs it next (ms). */ dueAt?: number;
}
const runtime = new Map<string, Runtime>();
const afterRun: ((id: string, ok: boolean, changed: boolean) => void)[] = [];

// A run that failed, or could only serve an older copy, is tried again after 5, 15 and 45 minutes
// instead of waiting for its next turn (one to seven days away): most failures are a source having
// a bad few minutes, or its host being skipped by the network gate while this connector's turn came.
let retryDelaysMs = [5, 15, 45].map((m) => m * 60_000);

export function registerConnector(c: Connector) {
  if (registry.some((x) => x.id === c.id)) throw new Error(`Connector ${c.id} registered twice`);
  registry.push(c); runtime.set(c.id, { running: false, runs: 0, retries: 0 });
}
/** Called after any connector finishes. `ok` is false when the run failed; `changed` is true when it
 *  succeeded and may have altered the web (a failed run leaves the web as it was). */
export const onConnectorRun = (fn: (id: string, ok: boolean, changed: boolean) => void) => { afterRun.push(fn); };

/** Run a connector now (its schedule, the Data page, or another module). Starts a new series of
 *  early retries if it fails. */
export const runConnector = (id: string) => execute(id, false);

async function execute(id: string, isRetry: boolean) {
  const c = registry.find((x) => x.id === id); if (!c) throw new Error(`Unknown connector ${id}`);
  const rt = runtime.get(id)!;
  if (rt.running) return liveStatus[id];
  rt.running = true; const t0 = Date.now();
  clearTimeout(rt.timer); rt.timer = undefined; rt.retryAt = undefined; // this run replaces a pending retry
  if (!isRetry) rt.retries = 0;
  let ok = false, changed = false, fresh = false;
  const prev = liveStatus[id];
  try {
    const r = await c.run();
    liveStatus[id] = { ok: true, at: new Date().toISOString(), detail: r.detail, fetchedAt: r.fetchedAt, stale: r.stale, sourceId: c.sourceIds[0] };
    rt.counts = r.counts;
    // A retry that again only had the same older copy brings nothing the last run did not: not news.
    // (One that loaded more than before, though still incomplete, is.)
    ok = true; changed = r.changed !== false && !(isRetry && r.stale && prev?.ok && prev.fetchedAt === r.fetchedAt && prev.detail === r.detail); fresh = !r.stale;
    if (changed) graphChanged();
  } catch (e: any) {
    liveStatus[id] = { ok: false, at: new Date().toISOString(), detail: String(e?.message || e).slice(0, 300), sourceId: c.sourceIds[0] };
  } finally {
    const now = Date.now();
    rt.running = false; rt.runs++; rt.lastDurationMs = now - t0;
    const regular = rt.dueAt && rt.dueAt > now ? rt.dueAt : now + c.everyHours * 3600_000;
    const wait = fresh ? undefined : retryDelaysMs[rt.retries];
    if (fresh) rt.retries = 0;
    if (wait !== undefined && now + wait < regular) { // no early retry when the regular run comes first
      rt.retries++; rt.retryAt = new Date(now + wait).toISOString();
      rt.timer = setTimeout(() => { void execute(id, true); }, wait); rt.timer.unref();
    }
    rt.nextAt = rt.retryAt ?? new Date(regular).toISOString();
    for (const fn of afterRun) { try { fn(id, ok, changed); } catch { /* ignore */ } }
  }
  return liveStatus[id];
}

export function startConnectors() {
  for (const c of registry) {
    const rt = runtime.get(c.id)!; const every = c.everyHours * 3600_000;
    rt.dueAt = Date.now() + every;
    setTimeout(() => { void runConnector(c.id); }, (c.delaySec ?? 20) * 1000).unref();
    setInterval(() => { rt.dueAt = Date.now() + every; void runConnector(c.id); }, every).unref();
  }
}

/** For tests: other delays before a failed run is tried again (milliseconds). */
export const _test = { retryDelaysMs: (ms: number[]) => { retryDelaysMs = ms; } };

const publicRuntime = ({ timer: _timer, dueAt: _dueAt, ...rest }: Runtime) => rest; // the timer handle is not data
export function connectorsStatus() {
  return registry.map((c) => ({ id: c.id, label: c.label, provides: c.provides, sourceIds: c.sourceIds, everyHours: c.everyHours, status: liveStatus[c.id] || null, ...publicRuntime(runtime.get(c.id)!) }));
}
export const connectorIds = () => registry.map((c) => c.id);

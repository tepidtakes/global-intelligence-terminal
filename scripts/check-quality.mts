// Offline checks for data quality and concurrency: the per-host network gate (limits, gaps,
// Retry-After, circuit breaker, readable errors) against local HTTP servers, the World Bank vs
// IMF agreement checks — the comparison rules, and runs against a seeded cache — and the early
// retries of a connector whose run failed.
// Run: npm run check:quality
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-quality-check-'));
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const seed = (key: string, payload: unknown) => {
  const dir = path.join(process.env.TERMINAL_DATA_DIR!, 'cache'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, crypto.createHash('sha1').update(key).digest('hex') + '.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), payload }));
};

const N = await imp('server/net.ts');
const CACHE = await imp('server/cache.ts');

let failures = 0;
const ok = (cond: unknown, label: string, detail?: unknown) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`); if (!cond) failures++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const attempt = async (p: Promise<any>): Promise<{ res?: any; err?: any }> => { try { return { res: await p }; } catch (err) { return { err }; } };
const health = (host: string) => N.hostHealth().find((h: any) => h.host === host);
/** A local server on its own port, so with its own gate. */
async function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse, n: number) => void) {
  let n = 0;
  const srv = http.createServer((req, res) => handler(req, res, ++n));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/`, host: `127.0.0.1:${port}`, hits: () => n, close: () => { srv.closeAllConnections(); srv.close(); } };
}

// ───────────────────────── Network gate ─────────────────────────
console.log('Network gate: limits');
{
  let active = 0, peak = 0;
  const s = await serve((_q, res) => { active++; peak = Math.max(peak, active); setTimeout(() => { active--; res.end('ok'); }, 100); });
  N.setHostPolicy(s.host, { concurrency: 2 });
  const t0 = Date.now();
  const out = await Promise.all(Array.from({ length: 6 }, () => N.netFetch(s.url).then((r: Response) => r.text())));
  ok(peak === 2 && out.every((x) => x === 'ok'), 'at most 2 requests in flight to a host limited to 2', { peak });
  ok(Date.now() - t0 >= 280, 'six 100 ms requests, two at a time, take three rounds', Date.now() - t0);
  s.close();
}
{
  const starts: number[] = [];
  const s = await serve((_q, res) => { starts.push(Date.now()); res.end('ok'); });
  N.setHostPolicy(s.host, { concurrency: 4, minGapMs: 150 });
  await Promise.all(Array.from({ length: 4 }, () => N.netFetch(s.url).then((r: Response) => r.text())));
  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  ok(gaps.length === 3 && gaps.every((g) => g >= 135), 'requests start at least 150 ms apart, even when four may run at once', gaps);
  s.close();
}
{
  // Headers at once, the rest of the answer 150 ms later: the slot is held until the answer is complete.
  let active = 0, peak = 0;
  const s = await serve((_q, res) => { active++; peak = Math.max(peak, active); res.writeHead(200, { 'Content-Type': 'text/plain' }); res.write('first,'); setTimeout(() => { active--; res.end('rest'); }, 150); });
  N.setHostPolicy(s.host, { concurrency: 1 });
  const t0 = Date.now();
  const out = await Promise.all(Array.from({ length: 4 }, () => N.netFetch(s.url).then((r: Response) => r.text())));
  ok(peak === 1 && out.every((x) => x === 'first,rest'), 'a host limited to one at a time never has two answers in progress, bodies included', { peak, out });
  ok(Date.now() - t0 >= 560, 'four answers that take 150 ms to arrive are read one after another', Date.now() - t0);
  s.close();
}
{
  const s = await serve((q, res) => {
    if (q.url === '/json') { res.writeHead(201, { 'Content-Type': 'application/json', 'X-Rows': '2' }); res.end('{"rows":[1,2]}'); }
    else if (q.url === '/gzip') { res.writeHead(200, { 'Content-Encoding': 'gzip' }); res.end(zlib.gzipSync('squeezed')); }
    else if (q.url === '/empty') { res.writeHead(204); res.end(); }
    else { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no such thing'); }
  });
  const j: Response = await N.netFetch(`${s.url}json`);
  ok(j.ok && j.status === 201 && j.headers.get('x-rows') === '2' && j.url === `${s.url}json` && (await j.json()).rows.length === 2, 'the response handed back has the status, headers, address and JSON of the original', { status: j.status, url: j.url });
  const b: Response = await N.netFetch(`${s.url}json`);
  ok(Buffer.from(await b.arrayBuffer()).toString() === '{"rows":[1,2]}', 'its bytes can be read as a buffer');
  const z: Response = await N.netFetch(`${s.url}gzip`);
  ok((await z.text()) === 'squeezed', 'a compressed answer is unpacked once');
  const e: Response = await N.netFetch(`${s.url}empty`);
  const m: Response = await N.netFetch(`${s.url}missing`);
  ok(e.status === 204 && (await e.text()) === '' && !m.ok && m.status === 404 && (await m.text()) === 'no such thing', 'an empty answer and a 404 come back as they are', { empty: e.status, missing: m.status });
  s.close();
}

console.log('Network gate: retries');
{
  const s = await serve((_q, res, n) => { if (n === 1) { res.writeHead(429, { 'Retry-After': '1' }); res.end('slow down'); } else res.end('{"ok":true}'); });
  const t0 = Date.now();
  const j = await CACHE.fetchJson(s.url);
  ok(j.ok === true && s.hits() === 2 && Date.now() - t0 >= 950, 'a 429 with Retry-After: 1 is retried after about a second', { hits: s.hits(), ms: Date.now() - t0 });
  ok(health(s.host)?.retries === 1 && health(s.host)?.state === 'ok', 'the retry is counted and the host stays healthy', health(s.host));
  s.close();
}
{
  const at: number[] = [];
  const s = await serve((_q, res) => { at.push(Date.now()); res.writeHead(503, { 'Retry-After': '0' }); res.end('busy'); });
  N.setHostPolicy(s.host, { retries: 2 });
  const r = await N.netFetch(s.url);
  ok(r.status === 503 && s.hits() === 3, 'a 503 is tried three times, then the caller sees the status', { status: r.status, hits: s.hits() });
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  ok(gaps.every((g) => g >= 235), 'Retry-After: 0 still pauses a quarter of a second before each new try', gaps);
  const e = await attempt(CACHE.fetchJson(s.url));
  ok(/^503 from 127\.0\.0\.1:\d+: busy/.test(e.err?.message || ''), 'fetchJson still reports the status and host', e.err?.message);
  s.close();
}
{
  const s = await serve((_q, res) => { res.writeHead(429, { 'Retry-After': '120' }); res.end('quota'); });
  const r = await N.netFetch(s.url);
  const e = await attempt(N.netFetch(s.url));
  const until = health(s.host)?.openUntil; const left = until ? Date.parse(until) - Date.now() : 0;
  ok(r.status === 429 && s.hits() === 1, 'a Retry-After of two minutes is not waited out inside the request', { status: r.status, hits: s.hits() });
  ok(e.err?.kind === 'circuit' && /rate limit/.test(e.err.message) && left > 110_000 && s.hits() === 1, 'the host is skipped until it said to come back', { msg: e.err?.message, left });
  s.close();
}
{
  // The caller allows half a second in all; the host asks for three. Sleeping would overrun the caller's limit.
  const s = await serve((_q, res) => { res.writeHead(429, { 'Retry-After': '3' }); res.end('slow down'); });
  const t0 = Date.now();
  const r = await N.netFetch(s.url, { timeoutMs: 500 });
  const ms = Date.now() - t0;
  const e = await attempt(N.netFetch(s.url, { timeoutMs: 500 }));
  const until = health(s.host)?.openUntil; const left = until ? Date.parse(until) - Date.now() : 0;
  ok(r.status === 429 && s.hits() === 1 && ms < 400, 'a Retry-After longer than half the request’s time limit is not slept inside the request', { status: r.status, hits: s.hits(), ms });
  ok(e.err?.kind === 'circuit' && /rate limit/.test(e.err.message) && left > 2300 && left <= 3000 && s.hits() === 1, 'the host is skipped for the three seconds it asked for instead', { msg: e.err?.message, left });
  s.close();
}

console.log('Network gate: circuit breaker');
{
  let mode: 'fail' | 'ok' = 'fail';
  const s = await serve((_q, res) => { if (mode === 'fail') { res.writeHead(500); res.end('down'); } else setTimeout(() => res.end('up'), 80); });
  N.setHostPolicy(s.host, { failThreshold: 3, coolDownMs: 300, maxCoolDownMs: 5000, retries: 0 });
  for (let i = 0; i < 3; i++) await N.netFetch(s.url);
  const fast = await attempt(N.netFetch(s.url));
  ok(fast.err?.kind === 'circuit' && s.hits() === 3 && health(s.host)?.state === 'open', 'after 3 failures in a row the host is skipped without a request', { kind: fast.err?.kind, hits: s.hits(), state: health(s.host)?.state });
  ok(/not responding \(3 failures in a row; last: 500/.test(fast.err?.message || '') && /skipped until \d\d:\d\d:\d\d UTC/.test(fast.err?.message || ''), 'the skip says why and until when', fast.err?.message);
  await sleep(330);
  const trial = await N.netFetch(s.url);
  const h1 = health(s.host); const left = h1?.openUntil ? Date.parse(h1.openUntil) - Date.now() : 0;
  ok(trial.status === 500 && s.hits() === 4 && h1?.state === 'open' && left > 450 && left <= 600, 'a failed trial request skips the host again, for twice as long', { status: trial.status, hits: s.hits(), state: h1?.state, left });
  await sleep(left + 30);
  mode = 'ok';
  const [a, b] = await Promise.all([attempt(N.netFetch(s.url)), attempt(N.netFetch(s.url))]);
  const passed = [a, b].filter((x) => x.res?.status === 200).length, skipped = [a, b].filter((x) => x.err?.kind === 'circuit').length;
  ok(passed === 1 && skipped === 1, 'while the trial request is out, other requests are still skipped', { passed, skipped });
  ok(health(s.host)?.state === 'ok' && health(s.host)?.consecutiveFailures === 0, 'a successful trial closes the breaker', health(s.host));
  ok((await N.netFetch(s.url)).status === 200, 'and requests flow again');
  s.close();
}
{
  const s = await serve((_q, res) => setTimeout(() => { res.writeHead(500); res.end('down'); }, 50));
  N.setHostPolicy(s.host, { concurrency: 1, failThreshold: 2, retries: 0 });
  const rs = await Promise.all(Array.from({ length: 5 }, () => attempt(N.netFetch(s.url))));
  const skipped = rs.filter((r) => r.err?.kind === 'circuit').length;
  ok(s.hits() === 2 && skipped === 3, 'requests already waiting for a slot are not sent once the breaker opens', { hits: s.hits(), skipped });
  s.close();
}
{
  // One at a time, 300 ms apart: once the second failure opens the breaker, the six still waiting
  // must all hear at once, not one per gap (which would take two more seconds).
  const s = await serve((_q, res) => { res.writeHead(500); res.end('down'); });
  N.setHostPolicy(s.host, { concurrency: 1, minGapMs: 300, failThreshold: 2, retries: 0 });
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: 8 }, () => attempt(N.netFetch(s.url)).then((r) => ({ ...r, ms: Date.now() - t0 }))));
  const skipped = rs.filter((r) => r.err?.kind === 'circuit'); const last = Math.max(...rs.map((r) => r.ms));
  ok(s.hits() === 2 && skipped.length === 6 && last < 600, 'when the breaker opens, every queued request is rejected at once, not one per gap', { hits: s.hits(), skipped: skipped.length, ms: rs.map((r) => r.ms) });
  s.close();
}
{
  // An answer still on its way when the host began to be skipped says nothing about the host now.
  const handler = (q: http.IncomingMessage, res: http.ServerResponse) => {
    if (q.url === '/slow') setTimeout(() => res.end('late'), 250);
    else if (q.url === '/quota') { res.writeHead(429, { 'Retry-After': '120' }); res.end('quota'); }
    else { res.writeHead(500); res.end('down'); }
  };
  const s = await serve(handler);
  N.setHostPolicy(s.host, { concurrency: 4, failThreshold: 2, retries: 0, coolDownMs: 5000 });
  const slow = attempt(N.netFetch(`${s.url}slow`));
  await sleep(30);
  for (let i = 0; i < 2; i++) await N.netFetch(`${s.url}bad`);
  const late = await slow;
  const after = await attempt(N.netFetch(`${s.url}slow`));
  ok(late.res?.status === 200 && health(s.host)?.state === 'open' && after.err?.kind === 'circuit' && s.hits() === 3, 'a success that was sent before the breaker opened does not close it', { late: late.res?.status, state: health(s.host)?.state, after: after.err?.kind, hits: s.hits() });
  ok(health(s.host)?.ok === 1 && health(s.host)?.failed === 2, 'the late answer is still counted', health(s.host));
  s.close();
  const q = await serve(handler);
  N.setHostPolicy(q.host, { concurrency: 4 });
  const slow2 = attempt(N.netFetch(`${q.url}slow`));
  await sleep(30);
  await N.netFetch(`${q.url}quota`);
  const late2 = await slow2;
  const after2 = await attempt(N.netFetch(`${q.url}slow`));
  const until = health(q.host)?.openUntil; const left = until ? Date.parse(until) - Date.now() : 0;
  ok(late2.res?.status === 200 && after2.err?.kind === 'circuit' && left > 110_000 && q.hits() === 2, 'nor does it cut short a wait the host asked for', { late: late2.res?.status, after: after2.err?.kind, left, hits: q.hits() });
  q.close();
}
{
  // A failure from before the breaker opened arrives while the trial request is out: the trial
  // still decides, the cool-down is not doubled and no second trial is let out.
  const s = await serve((q, res) => {
    if (q.url === '/slowbad') setTimeout(() => { res.writeHead(500); res.end('down'); }, 600);
    else if (q.url === '/slowok') setTimeout(() => res.end('up'), 600);
    else { res.writeHead(500); res.end('down'); }
  });
  N.setHostPolicy(s.host, { concurrency: 4, failThreshold: 2, retries: 0, coolDownMs: 200, maxCoolDownMs: 5000 });
  const old = attempt(N.netFetch(`${s.url}slowbad`));
  await sleep(20);
  for (let i = 0; i < 2; i++) await N.netFetch(`${s.url}bad`);
  await sleep(250); // the cool-down has passed
  const trial = attempt(N.netFetch(`${s.url}slowok`));
  await old;
  const other = await attempt(N.netFetch(`${s.url}bad`));
  ok(health(s.host)?.state === 'trial' && other.err?.kind === 'circuit' && /being tested again/.test(other.err.message) && s.hits() === 4, 'a failure that was sent before the breaker opened is not taken for the trial’s', { state: health(s.host)?.state, msg: other.err?.message, hits: s.hits() });
  ok((await trial).res?.status === 200 && health(s.host)?.state === 'ok' && (await N.netFetch(`${s.url}slowok`)).status === 200, 'the trial request itself then closes the breaker', health(s.host));
  s.close();
}
{
  const s = await serve((_q, res) => { res.writeHead(404); res.end('no such thing'); });
  N.setHostPolicy(s.host, { failThreshold: 2 });
  for (let i = 0; i < 4; i++) await N.netFetch(s.url);
  ok(health(s.host)?.state === 'ok' && s.hits() === 4, 'answers such as 404 are not outages: the breaker stays closed', health(s.host));
  s.close();
}

console.log('Network gate: readable errors');
{
  const dead = await serve(() => undefined); dead.close(); await sleep(50); // a port nothing listens on any more
  const e = await attempt(N.netFetch(`http://${dead.host}/x`));
  ok(e.err?.kind === 'network' && e.err.message === `${dead.host}: connection refused` && health(dead.host)?.retries === 0, 'a refused connection fails at once, with a readable reason', { msg: e.err?.message, retries: health(dead.host)?.retries });
  const s = await serve(() => { /* never answers */ });
  const t = await attempt(N.netFetch(s.url, { timeoutMs: 300 }));
  ok(t.err?.kind === 'timeout' && /: timed out after 300 ms$/.test(t.err.message) && s.hits() === 1, 'a timeout is reported as one and not retried', { msg: t.err?.message, hits: s.hits() });
  s.close();
  // Headers and a first piece arrive, the rest never does.
  const stall = await serve((_q, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"rows":['); });
  N.setHostPolicy(stall.host, { failThreshold: 2, retries: 0 });
  const b1 = await attempt(N.netFetch(stall.url, { timeoutMs: 300 }));
  const b2 = await attempt(CACHE.fetchJson(stall.url, {}, 300));
  const msg = `${stall.host}: timed out after 300 ms`;
  ok(b1.err?.kind === 'timeout' && b1.err.message === msg && b2.err instanceof N.NetError && b2.err.message === msg, 'an answer that stalls part-way is a timeout of that host, with a readable reason', { b1: b1.err?.message, b2: b2.err?.message });
  ok(health(stall.host)?.state === 'open' && health(stall.host)?.failed === 2 && health(stall.host)?.ok === 0, 'stalled answers count as failures and trip the breaker', health(stall.host));
  stall.close();
  const u = await attempt(N.netFetch('http://nowhere.invalid/'));
  if (u.res) console.log('  – skipped: this machine resolves every host name');
  else ok(u.err instanceof N.NetError && /^nowhere\.invalid: (host name not found|DNS lookup failed)$/.test(u.err.message), 'an unknown host name gets a readable reason, not “fetch failed”', u.err?.message);
}
ok(N.hostHealth().length >= 14 && N.hostHealth().every((h: any) => typeof h.requests === 'number' && h.policy), 'host health lists every host contacted', N.hostHealth().length);

// ───────────────────────── Cross-source agreement ─────────────────────────
console.log('Cross-source agreement: rules');
const A = await imp('server/agreement.ts');
const C = await imp('server/consistency.ts');
const CON = await imp('server/web/connectors.ts');
const P = Object.fromEntries(A.PAIRS.map((p: any) => [p.key, p]));
const cmp = (k: string, wb: number, imf: number) => A.compareFigures(P[k], wb, imf).verdict;
ok(cmp('gdp', 29.18e12, 29184.9) === 'agree', 'GDP: World Bank US$ and IMF US$ billions are compared in the same unit');
ok(cmp('gdp', 3.91e12, 3730) === 'differ', 'GDP 4.7% apart: differ (tolerance 3%)');
ok(cmp('gdp', 18.74e12, 15000) === 'conflict', 'GDP 22% apart: conflict');
ok(cmp('gdp', 18.74e9, 18740) === 'conflict', 'a thousandfold unit slip is a conflict');
ok(cmp('growth', 2.0, 2.4) === 'agree' && cmp('growth', 2.0, 3.2) === 'differ' && cmp('growth', 2.0, 4.0) === 'conflict', 'growth: within 0.5 points agree, up to 1.5 differ, beyond that conflict');
ok(cmp('inflation', 219.9, 210) === 'agree', 'very high inflation gets room in proportion (5% of the figure)');
ok(cmp('population', 335.9e6, 336.1) === 'agree' && cmp('population', 220e6, 230) === 'differ', 'population: people against millions');
ok(A.fmtFigure(P.gdp, 18740) === 'US$18.74 tn' && A.fmtFigure(P.population, 0.0397) === '0.04 million' && A.fmtFigure(P['current-account'], -3.25) === '-3.3% of GDP', 'figures are written in readable units', [A.fmtFigure(P.gdp, 18740), A.fmtFigure(P.population, 0.0397), A.fmtFigure(P['current-account'], -3.25)]);

console.log('Cross-source agreement: a run against the seeded cache');
const Y = String(new Date().getUTCFullYear() - 2), NOW = String(new Date().getUTCFullYear());
const wbSeed = (code: string, values: Record<string, [number, string]>) => seed(`wb:all:${code}:latest`, { code, label: code, unit: '', short: code, values: Object.fromEntries(Object.entries(values).map(([k, [value, period]]) => [k, { value, period }])) });
const CH = await imp('server/changes.ts');
const announced = () => CH.recentChanges({ limit: 500 }).filter((c: any) => c.key.startsWith('agreement:')).map((c: any) => c.key);
wbSeed('NY.GDP.MKTP.CD', { USA: [29.18e12, Y], CHN: [18.74e12, Y], IND: [3.91e12, Y], FRA: [3.2e12, NOW], DEU: [4.66e12, '2015'], JPN: [4.03e12, Y], WLD: [110e12, Y] });
seed('imf:NGDPD', { USA: { [Y]: 29184.9 }, CHN: { [Y]: 15000 }, IND: { [Y]: 3730 }, FRA: { [NOW]: 3200 }, DEU: { 2015: 3400 }, JPN: { [String(Number(Y) - 1)]: 4200 } });
{
  // First run on a bad day: only GDP is there, the other five figures cannot be fetched (the network
  // is switched off for this run, so the check never contacts the real sources).
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); }) as typeof fetch;
  const t0 = Date.now();
  let st: any;
  try { st = await CON.runConnector('cross-source-checks'); } finally { globalThis.fetch = realFetch; }
  const p1 = A.agreementSummary().pairs;
  ok(p1.filter((p: any) => p.error).length === 5 && /connection refused/.test(p1[1].error) && A.agreementFor('CHN').checks[0]?.verdict === 'conflict', 'a first run in which only GDP loads still compares GDP and says why the rest is missing', p1.map((p: any) => [p.key, p.error]));
  const next = Date.parse(CON.connectorsStatus().find((c: any) => c.id === 'cross-source-checks').nextAt) - t0;
  ok(st.ok && st.stale === true && /not loaded: Real GDP growth/.test(st.detail) && next > 4.5 * 60_000 && next < 5.5 * 60_000, 'an incomplete run is marked as such and tried again in five minutes, not tomorrow', { st, nextMin: next / 60_000 });
  ok(announced().length === 0, 'the first run announces nothing: what exists is the baseline', announced());
}
wbSeed('NY.GDP.MKTP.KD.ZG', { USA: [2.8, Y], TUR: [3.2, Y] }); seed('imf:NGDP_RPCH', { USA: { [Y]: 2.8 }, TUR: { [Y]: 3.3 } });
wbSeed('FP.CPI.TOTL.ZG', { TUR: [58.5, Y], ARG: [219.9, Y] }); seed('imf:PCPIPCH', { TUR: { [Y]: 40 }, ARG: { [Y]: 210 } });
wbSeed('SL.UEM.TOTL.ZS', { ZAF: [33.2, Y] }); seed('imf:LUR', { ZAF: { [Y]: 25 } });
wbSeed('BN.CAB.XOKA.GD.ZS', {}); seed('imf:BCA_NGDPD', {});
wbSeed('SP.POP.TOTL', { USA: [335.9e6, Y] }); seed('imf:LP', { USA: { [Y]: 336.1 } });
await A.refreshAgreement();
ok(announced().length === 0, 'figures that load for the first time on a later run are a baseline too: their old conflicts are not announced as new', announced());
const chn = A.agreementFor('CHN'), usa = A.agreementFor('USA'), fra = A.agreementFor('FRA'), deu = A.agreementFor('DEU'), jpn = A.agreementFor('JPN');
ok(chn.checks.find((c: any) => c.key === 'gdp')?.verdict === 'conflict', 'China: GDP 22% apart is a conflict', chn.checks);
ok(usa.checks.map((c: any) => c.key).join() === 'gdp,growth,population' && usa.checks.every((c: any) => c.verdict === 'agree'), 'United States: GDP, growth and population agree, listed in a fixed order', usa.checks.map((c: any) => [c.key, c.verdict]));
ok(!fra.checks.length && /still projects/.test(fra.skipped[0]?.reason || ''), 'a figure for the current year is not compared: the IMF still projects it', fra);
ok(!deu.checks.length && /too old/.test(deu.skipped[0]?.reason || ''), 'a figure older than six years is not compared', deu);
ok(!jpn.checks.length && /no figure for/.test(jpn.skipped[0]?.reason || ''), 'a year the IMF has no figure for is not compared', jpn);
ok(!A.agreementFor('WLD').checks.length, 'aggregates such as the world are left out');
const sum = A.agreementSummary();
ok(sum.totals.compared === 9 && sum.totals.conflict === 3 && sum.totals.differ === 1 && sum.totals.countries === 6, 'totals across all figures', sum.totals);
ok(sum.conflicts.map((c: any) => `${c.iso3}:${c.key}`).join() === 'CHN:gdp,TUR:inflation,ZAF:unemployment', 'conflicts are listed worst first, definition gaps (unemployment) last', sum.conflicts.map((c: any) => `${c.iso3}:${c.key}`));
ok(sum.pairs.find((p: any) => p.key === 'current-account')?.compared === 0 && !sum.pairs.some((p: any) => p.error), 'every figure loaded, even one with nothing to compare', sum.pairs.map((p: any) => [p.key, p.compared, p.error]));
const issues = C.audit(true).filter((i: any) => i.category === 'source-figures-conflict');
ok(issues.length === 3 && issues.some((i: any) => i.entityId === 'country:CHN' && i.severity === 'warning' && /World Bank US\$18\.74 tn, IMF US\$15\.00 tn — 22\.2% apart \(tolerance 3%\)/.test(i.message)), 'conflicts appear in the consistency audit with both figures', issues.map((i: any) => i.message));
ok(issues.find((i: any) => i.entityId === 'country:ZAF')?.severity === 'info', 'unemployment conflicts are information only: the definitions differ');
ok(C.CATEGORY_LABEL['source-figures-conflict'] && CON.connectorsStatus().some((c: any) => c.id === 'cross-source-checks'), 'the audit category and the daily connector are registered');
{
  // A conflict that appears later in a figure already seen is news, once.
  wbSeed('NY.GDP.MKTP.KD.ZG', { USA: [2.8, Y], TUR: [3.2, Y], BRA: [3.4, Y] }); seed('imf:NGDP_RPCH', { USA: { [Y]: 2.8 }, TUR: { [Y]: 3.3 }, BRA: { [Y]: 0.9 } });
  CACHE._test.forget('wb:all:NY.GDP.MKTP.KD.ZG:latest'); CACHE._test.forget('imf:NGDP_RPCH');
  await A.refreshAgreement(); await A.refreshAgreement();
  ok(announced().join() === `agreement:BRA:growth:${Y}`, 'a conflict that appears later is announced, once', announced());
}

// ───────────────────────── Connector retries ─────────────────────────
console.log('Connectors: a failed run is tried again soon');
{
  const seen: string[] = [];
  CON.onConnectorRun((id: string, good: boolean, changed: boolean) => { if (id.startsWith('check-')) seen.push(`${id.slice(6)}:${good ? 'ok' : 'failed'}${changed ? ':changed' : ''}`); });
  const row = (id: string) => CON.connectorsStatus().find((c: any) => c.id === id);
  const inMs = (id: string) => Date.parse(row(id).nextAt) - Date.now();
  const calls = { flaky: 0, down: 0, old: 0 };
  const reg = (id: string, run: () => Promise<any>) => CON.registerConnector({ id, label: id, provides: 'check', sourceIds: ['terminal-audit'], everyHours: 24, run });
  reg('check-flaky', async () => { if (++calls.flaky <= 3) throw new Error('source is having a bad few minutes'); return { detail: 'loaded', changed: false }; });
  reg('check-down', async () => { calls.down++; throw new Error('source is gone'); });
  reg('check-old', async () => (++calls.old === 1 ? { detail: 'older copy', stale: true, changed: false } : { detail: 'fresh copy', changed: false }));

  const first = await CON.runConnector('check-flaky');
  ok(!first.ok && inMs('check-flaky') > 4.9 * 60_000 && inMs('check-flaky') <= 5 * 60_000 && row('check-flaky').retries === 1, 'a failed run is due again five minutes later, not a day later', { ok: first.ok, nextMin: inMs('check-flaky') / 60_000 });
  ok(!('timer' in row('check-flaky')) && JSON.stringify(CON.connectorsStatus()).length > 0, 'the status stays plain data');

  CON._test.retryDelaysMs([60, 120, 180]); // the same three steps, in milliseconds
  await CON.runConnector('check-flaky'); // asked for again by hand: replaces the pending retry, fails again
  ok(calls.flaky === 2 && inMs('check-flaky') <= 60 && row('check-flaky').retries === 1, 'a run asked for meanwhile replaces the pending retry and starts the steps again', { calls: calls.flaky, next: inMs('check-flaky') });
  await sleep(110);
  ok(calls.flaky === 3 && !row('check-flaky').status.ok && inMs('check-flaky') > 0 && inMs('check-flaky') <= 120, 'the first retry ran, failed, and the second is due after the longer step', { calls: calls.flaky, next: inMs('check-flaky') });
  await sleep(160);
  ok(calls.flaky === 4 && row('check-flaky').status.ok && row('check-flaky').retries === 0 && inMs('check-flaky') > 23.9 * 3600_000, 'the retry that succeeds ends the series: next run on the usual schedule', { calls: calls.flaky, status: row('check-flaky').status, nextH: inMs('check-flaky') / 3600_000 });
  await sleep(250);
  ok(calls.flaky === 4, 'and nothing more runs after a success', calls.flaky);

  await CON.runConnector('check-down');
  await sleep(60 + 120 + 180 + 200);
  ok(calls.down === 4 && !row('check-down').status.ok && inMs('check-down') > 23.9 * 3600_000, 'a source that stays down gets three retries, then waits for its usual turn', { calls: calls.down, nextH: inMs('check-down') / 3600_000 });
  await sleep(250);
  ok(calls.down === 4, 'no fourth retry', calls.down);

  const old = await CON.runConnector('check-old');
  ok(old.ok && old.stale === true && inMs('check-old') <= 60, 'a run that could only serve an older copy is tried again too', { old, next: inMs('check-old') });
  await sleep(110);
  ok(calls.old === 2 && row('check-old').status.detail === 'fresh copy' && !row('check-old').status.stale && inMs('check-old') > 23.9 * 3600_000, 'and the fresh copy ends the series', row('check-old'));
  ok(seen.join() === 'flaky:failed,flaky:failed,flaky:failed,flaky:ok,down:failed,down:failed,down:failed,down:failed,old:ok,old:ok', 'listeners hear of every run, retries included, with ok and changed as before', seen);
  CON._test.retryDelaysMs([5, 15, 45].map((m) => m * 60_000));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll quality checks passed');
process.exit(failures ? 1 : 0);

// Live updates for open pages. Whenever data the server serves changes (a provider answered with
// different figures in cache.ts, the knowledge web changed, a module refresh brought something new, a
// change entered the feed, an account's private data was written) the producer calls
// publish('<what>'). Bursts are merged into one event, at most one every two seconds, and pushed over
// Server-Sent Events (/api/live) to the open pages, which re-fetch what they show (src/api.ts).
// A browser holds one stream however many windows it has open; pages that cannot hold a stream ask
// /api/live/state every few seconds instead.
import type { Request, Response } from 'express';

export interface LiveEvent { seq: number; at: string; sources: string[]; }
interface Client { res: Response; userId?: string; addr: string; }
const clients = new Set<Client>();
const startedAt = new Date().toISOString();
const MERGE_MS = Math.max(50, Number(process.env.LIVE_MERGE_MS) || 2000);
// The stream needs no sign-in and each one holds a socket open, so their number is limited: in total
// and per address. A page that is refused keeps itself current by asking /api/live/state.
const MAX_STREAMS = Math.max(1, Number(process.env.LIVE_MAX_STREAMS) || 200);
const MAX_PER_ADDRESS = Math.max(1, Number(process.env.LIVE_MAX_PER_ADDRESS) || 20);
/** A client with this much unread data queued has stopped reading: it is dropped, not buffered for. */
const MAX_QUEUED_BYTES = 64 * 1024;

let pending = new Set<string>(); // for every open page
let pendingFor = new Map<string, Set<string>>(); // for one account's pages (its private data)
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
/** The number of the last event each audience was sent: what a returning page compares with. */
let lastPublic = 0;
const lastFor = new Map<string, number>();
const seqFor = (userId?: string) => Math.max(lastPublic, (userId && lastFor.get(userId)) || 0);
const recent: LiveEvent[] = [];
const bySource = new Map<string, number>();
const counters = { refused: 0, dropped: 0, privateEvents: 0 };

/** Data from `source` changed: open pages are told within a couple of seconds. With `userId` only
 *  that account's pages are told (private data: notes, watchlists, positions, alerts). */
export function publish(source: string, userId?: string) {
  if (userId) { let s = pendingFor.get(userId); if (!s) pendingFor.set(userId, s = new Set()); s.add(source); }
  else pending.add(source);
  if (!timer) { timer = setTimeout(flush, MERGE_MS); timer.unref?.(); }
}

const ran = new Set<string>();
/** After a refresh loop ran: announce `source` when it brought something new, and always after its
 *  first run since start (pages opened before it were told "still loading"). */
export function publishRun(source: string, changed: boolean) {
  const first = !ran.has(source); ran.add(source);
  if (first || changed) publish(source);
  return first || changed;
}

const frame = (ev: LiveEvent) => `id: ${ev.seq}\nevent: update\ndata: ${JSON.stringify(ev)}\n\n`;
function send(c: Client, text: string) {
  if (c.res.writableLength > MAX_QUEUED_BYTES) { counters.dropped++; clients.delete(c); c.res.destroy(); return; }
  c.res.write(text);
}

/** Send what is pending now (the timer does this; tests call it directly). */
export function flush(): LiveEvent | undefined {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!pending.size && !pendingFor.size) return undefined;
  const mine = pendingFor;
  const ev: LiveEvent = { seq: ++seq, at: new Date().toISOString(), sources: [...pending].sort() };
  pending = new Set(); pendingFor = new Map();
  if (ev.sources.length) {
    lastPublic = ev.seq;
    for (const s of ev.sources) bySource.set(s, (bySource.get(s) || 0) + 1);
    recent.push(ev); if (recent.length > 50) recent.shift();
  } else counters.privateEvents++;
  for (const u of mine.keys()) lastFor.set(u, ev.seq);
  const forAll = ev.sources.length ? frame(ev) : '';
  for (const c of clients) {
    const own = c.userId ? mine.get(c.userId) : undefined;
    if (own) send(c, frame({ ...ev, sources: [...new Set([...ev.sources, ...own])].sort() }));
    else if (forAll) send(c, forAll);
  }
  return ev;
}

/** Where a stream comes from. Behind a reverse proxy on this machine every socket is loopback, so
 *  there the address the proxy saw is used (the last X-Forwarded-For entry: the only one a client
 *  cannot make up). A client that connects directly cannot set it. */
function addressOf(req: Request) {
  const a = req.socket.remoteAddress || '';
  if (a !== '127.0.0.1' && a !== '::1' && a !== '::ffff:127.0.0.1') return a;
  return String(req.headers['x-forwarded-for'] || '').split(',').at(-1)!.trim() || a;
}

/** GET /api/live: the Server-Sent Events stream. The greeting carries the server's start time and
 *  event number, so a page that was away (or a restarted server) knows to catch up. */
export function liveStream(req: Request & { userId?: string }, res: Response) {
  const addr = addressOf(req);
  let same = 0; for (const c of clients) if (c.addr === addr) same++;
  if (clients.size >= MAX_STREAMS || same >= MAX_PER_ADDRESS) {
    counters.refused++;
    res.setHeader('Retry-After', '60');
    res.status(503).json({ error: 'Too many live streams are open. This page keeps itself current by checking every few seconds instead.' });
    return;
  }
  // "no-transform" keeps the compression middleware from buffering the stream.
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  if (req.method === 'HEAD') { res.end(); return; }
  res.write(`retry: 5000\nevent: hello\ndata: ${JSON.stringify({ seq: seqFor(req.userId), startedAt })}\n\n`);
  const c: Client = { res, userId: req.userId, addr };
  clients.add(c);
  // The response's own "close": the request's fires as soon as a request body has been read.
  res.on('close', () => clients.delete(c));
}
/** GET /api/live/state: the same numbers as the greeting, for pages that poll instead of streaming. */
export function liveState(req: Request & { userId?: string }, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ seq: seqFor(req.userId), startedAt });
}
/** An account signed out: its streams are closed, so they stop hearing about its private data. The
 *  page reconnects by itself, without the account. */
export function dropStreamsOf(userId: string) {
  for (const c of [...clients]) if (c.userId === userId) { clients.delete(c); c.res.end(); }
}
// A ping every 25 s keeps idle streams open through proxies, lets dead ones be dropped, and tells the
// page the stream is alive: a page that hears nothing for a minute reconnects.
setInterval(() => { for (const c of clients) send(c, 'event: ping\ndata: 1\n\n'); }, 25_000).unref();

/** For the Data page: open streams, events sent, and which sources changed most often. */
export function streamStatus() {
  return {
    clients: clients.size, limit: MAX_STREAMS, seq, startedAt, lastAt: recent.at(-1)?.at, recent: recent.slice(-8).reverse(),
    bySource: Object.fromEntries([...bySource].sort((a, b) => b[1] - a[1]).slice(0, 24)), ...counters,
  };
}

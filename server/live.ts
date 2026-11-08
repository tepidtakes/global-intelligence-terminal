// Live updates for open pages. Whenever data the server serves changes (a provider answered with new
// figures in cache.ts, the knowledge web changed, a connector or a module refresh finished, a change
// entered the feed) the producer calls publish('<what>'). Bursts are merged into one event, at most
// one every two seconds, and pushed over Server-Sent Events (/api/live) to every open page, which
// re-fetches what it shows (src/api.ts). Hidden tabs disconnect and catch up when shown again.
import type { Request, Response } from 'express';

export interface LiveEvent { seq: number; at: string; sources: string[]; }
const clients = new Set<Response>();
const startedAt = new Date().toISOString();
const MERGE_MS = Math.max(50, Number(process.env.LIVE_MERGE_MS) || 2000);
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const recent: LiveEvent[] = [];
const bySource = new Map<string, number>();

/** Data from `source` changed: open pages are told within a couple of seconds. */
export function publish(source: string) {
  pending.add(source);
  if (!timer) { timer = setTimeout(flush, MERGE_MS); timer.unref?.(); }
}
/** Send what is pending now (the timer does this; tests call it directly). */
export function flush(): LiveEvent | undefined {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!pending.size) return undefined;
  const ev: LiveEvent = { seq: ++seq, at: new Date().toISOString(), sources: [...pending].sort() };
  pending = new Set();
  for (const s of ev.sources) bySource.set(s, (bySource.get(s) || 0) + 1);
  recent.push(ev); if (recent.length > 50) recent.shift();
  const msg = `id: ${ev.seq}\nevent: update\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) c.write(msg);
  return ev;
}
/** GET /api/live: one Server-Sent Events stream per open page. The greeting carries the server's
 *  start time and event number, so a page that was away (or a restarted server) knows to catch up. */
export function liveStream(req: Request, res: Response) {
  // "no-transform" keeps the compression middleware from buffering the stream.
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 5000\nevent: hello\ndata: ${JSON.stringify({ seq, startedAt })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}
// A comment line every 25 s keeps idle streams open through proxies and lets dead ones be dropped.
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25_000).unref();

/** For the Data page: open pages, events sent, and which sources changed most often. */
export function streamStatus() {
  return { clients: clients.size, seq, startedAt, lastAt: recent.at(-1)?.at, recent: recent.slice(-8).reverse(), bySource: Object.fromEntries([...bySource].sort((a, b) => b[1] - a[1]).slice(0, 24)) };
}

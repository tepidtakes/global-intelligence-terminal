// Offline checks for keeping data current: live updates to open pages (server/live.ts and the
// cache's change detection), central-bank decision days read from the banks' own pages and checked
// against the hand-entered dates, and meetings of the web's organizations found in Wikidata.
// Run: npm run check:updates
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';

// The calendar checks are about dates around November 2026: the clock is pinned there (and keeps
// running), so the checks give the same answers whatever day they are run.
const RealDate = Date, startedReal = RealDate.now(); let pinned = RealDate.parse('2026-11-18T09:00:00Z');
const moveClock = (days: number) => { pinned += days * 86400_000; };
class PinnedDate extends RealDate {
  constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(pinned + (RealDate.now() - startedReal)); }
  static now() { return pinned + (RealDate.now() - startedReal); }
}
(globalThis as any).Date = PinnedDate;

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-updates-check-'));
process.env.LIVE_MERGE_MS = '150';
process.env.LIVE_MAX_PER_ADDRESS = '4';
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const seed = (key: string, payload: unknown, fetchedAt = new Date().toISOString()) => {
  const dir = path.join(process.env.TERMINAL_DATA_DIR!, 'cache'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, crypto.createHash('sha1').update(key).digest('hex') + '.json'), JSON.stringify({ fetchedAt, payload }));
};
let failures = 0;
const ok = (cond: unknown, label: string, detail?: unknown) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`); if (!cond) failures++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LIVE = await imp('server/live.ts');
const CACHE = await imp('server/cache.ts');
const { default: express } = await import('express');

// ───────────────────────── Live updates ─────────────────────────
console.log('Live updates: the stream');
const app = express();
app.use((req: any, _res: any, next: any) => { if (req.headers['x-user']) req.userId = String(req.headers['x-user']); next(); }); // stands in for the session cookie
app.get('/live', LIVE.liveStream);
app.get('/live/state', LIVE.liveState);
const srv = http.createServer(app);
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
const port = (srv.address() as { port: number }).port;
/** Read a stream's events for `ms` milliseconds. */
function listen(ms: number, headers: Record<string, string> = {}) {
  return new Promise<{ events: { event: string; data: any }[]; headers: http.IncomingHttpHeaders; status?: number }>((resolve) => {
    const events: { event: string; data: any }[] = []; let buf = '';
    const req = http.get({ host: '127.0.0.1', port, path: '/live', headers }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
      });
      setTimeout(() => { req.destroy(); resolve({ events, headers: res.headers, status: res.statusCode }); }, ms);
    });
  });
}
const reading = listen(800);
await sleep(100);
LIVE.publish('wb'); LIVE.publish('news'); LIVE.publish('wb');
await sleep(350);
LIVE.publish('graph');
const got = await reading;
const updates = got.events.filter((e) => e.event === 'update');
ok(String(got.headers['content-type']).startsWith('text/event-stream') && String(got.headers['cache-control']).includes('no-transform'), 'served as an event stream, marked so compression does not buffer it', got.headers);
ok(got.events[0]?.event === 'hello' && typeof got.events[0].data.startedAt === 'string' && got.events[0].data.seq === 0, 'a page is greeted with the server’s start time and event number', got.events[0]);
ok(updates.length === 2 && updates[0].data.sources.join() === 'news,wb' && updates[1].data.sources.join() === 'graph', 'a burst of changes arrives as one event naming each source once', updates.map((u) => u.data.sources));
ok(updates[1]?.data.seq === updates[0]?.data.seq + 1, 'events are numbered, so a page that was away can tell it missed some');
await sleep(50);
const st = LIVE.streamStatus();
ok(st.clients === 0 && st.seq === 2 && st.bySource.wb === 1, 'closed streams are dropped; events are counted by source', st);
const back = await listen(150);
ok(back.events[0]?.data.seq === 2 && back.events[0].data.startedAt === got.events[0].data.startedAt, 'a page that reconnects learns the current event number', back.events[0]);

console.log('Live updates: private data, limits and clients that stop reading');
const getJson = (pathname: string, headers: Record<string, string> = {}, method = 'GET') => new Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: pathname, headers, method, timeout: 2000 }, (res) => { let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => { let body: any = b; try { body = JSON.parse(b); } catch { /* text */ } resolve({ status: res.statusCode || 0, body, headers: res.headers }); }); });
  req.on('timeout', () => { req.destroy(new Error('no answer')); }); req.on('error', reject); req.end();
});
const mine = listen(500, { 'x-user': 'u1' }), theirs = listen(500, { 'x-user': 'u2' }), anyone = listen(500);
await sleep(100);
LIVE.publish('notes', 'u1');
const [m1, m2, m3] = await Promise.all([mine, theirs, anyone]);
const upd = (r: { events: { event: string; data: any }[] }) => r.events.filter((e) => e.event === 'update').map((e) => e.data.sources.join());
ok(upd(m1).join('|') === 'notes' && !upd(m2).length && !upd(m3).length, 'a change to one account’s private data reaches that account’s pages only', [upd(m1), upd(m2), upd(m3)]);
const s1 = await getJson('/live/state', { 'x-user': 'u1' }), s0 = await getJson('/live/state');
ok(s1.body.seq === 3 && s0.body.seq === 2 && s0.body.startedAt === got.events[0].data.startedAt && String(s1.headers['cache-control']).includes('no-store'), 'pages that poll get the same numbers: other accounts’ private events do not count for them', [s1.body, s0.body]);
ok(LIVE.streamStatus().bySource.notes === undefined, 'private events stay out of the public statistics', LIVE.streamStatus().bySource);
const head = await getJson('/live', {}, 'HEAD').catch((e) => ({ status: 0, body: String(e.message), headers: {} as http.IncomingHttpHeaders }));
ok(head.status === 200, 'a HEAD request is answered and closed instead of left hanging', head);
const many = [listen(600), listen(600), listen(600), listen(600)];
await sleep(150);
const extra = await getJson('/live');
ok(extra.status === 503 && !!extra.headers['retry-after'] && LIVE.streamStatus().refused === 1, 'more streams than allowed from one address are refused (503 with Retry-After); the page then polls', [extra.status, extra.headers['retry-after'], LIVE.streamStatus().refused]);
await Promise.all(many);
await sleep(50);
ok(LIVE.streamStatus().clients === 0, 'and the limit frees up when streams close', LIVE.streamStatus().clients);
// A client that never reads: once its queue passes the limit it is dropped instead of buffered for.
let destroyed = false;
const stuck: any = { writableLength: 10 ** 6, write() { return false; }, destroy() { destroyed = true; }, on() {}, writeHead() {}, end() {}, setHeader() {} };
LIVE.liveStream({ method: 'GET', headers: {}, socket: { remoteAddress: '10.9.8.7' } } as any, stuck);
LIVE.publish('wb'); LIVE.flush();
ok(destroyed && LIVE.streamStatus().dropped === 1 && LIVE.streamStatus().clients === 0, 'a client that stopped reading is dropped, not buffered for', LIVE.streamStatus());
const before = LIVE.streamStatus().seq;
const r1 = LIVE.publishRun('loop-test', false); LIVE.flush(); const r2 = LIVE.publishRun('loop-test', false); LIVE.flush(); const r3 = LIVE.publishRun('loop-test', true); LIVE.flush();
ok(r1 && !r2 && r3 && LIVE.streamStatus().seq === before + 2, 'a refresh loop is announced after its first run and when it brought something new, not when it found nothing', [r1, r2, r3]);
srv.close();

console.log('Live updates: the cache announces changed figures only');
const count = () => { LIVE.flush(); return LIVE.streamStatus().bySource.qtest || 0; };
await CACHE.cached('qtest:a', 0, async () => ({ v: 1 }));
const c1 = count();
await CACHE.cached('qtest:a', 0, async () => ({ v: 1 }));
const c2 = count();
await CACHE.cached('qtest:a', 0, async () => ({ v: 2 }));
const c3 = count();
ok(c1 === 0 && c2 === 0 && c3 === 1, 'changed figures are announced; a first fetch (whoever asked has it) and the same figures fetched again are not', [c1, c2, c3]);
let calls = 0;
const failing = async () => { calls++; throw new Error('provider down'); };
const e1 = await CACHE.cached('qfail:a', 600, failing).catch((e: Error) => e.message);
const e2 = await CACHE.cached('qfail:a', 600, failing).catch((e: Error) => e.message);
ok(e1 === 'provider down' && e2 === 'provider down' && calls === 1, 'a fetch that just failed is not repeated for every page that asks again', [e1, e2, calls]);
CACHE.retryFailedNow();
await CACHE.cached('qfail:a', 600, failing).catch(() => undefined);
ok(calls === 2, 'unless a person asks to try again now', calls);
seed('qfail:b', { v: 1 });
const old = path.join(process.env.TERMINAL_DATA_DIR!, 'cache', crypto.createHash('sha1').update('qfail:b').digest('hex') + '.json');
fs.writeFileSync(old, JSON.stringify({ fetchedAt: new Date(Date.now() - 3600_000).toISOString(), payload: { v: 1 } }));
calls = 0;
const st1 = await CACHE.cached('qfail:b', 600, failing), st2 = await CACHE.cached('qfail:b', 600, failing);
ok(st1.stale && st2.stale && st2.data.v === 1 && calls === 1, 'while it is remembered, the last good copy is served, marked stale', [st1.stale, st2.stale, calls]);

// ───────────────────────── Central banks ─────────────────────────
console.log('Central banks: reading the banks’ schedule pages');
const B = await imp('server/bankSchedules.ts');
const EC = await imp('server/econCalendar.ts');
const fedRow = (m: string, d: string, extra = '') => `<div class="row fomc-meeting"><div class="fomc-meeting__month"><strong>${m}</strong></div><div class="fomc-meeting__date">${d}</div>${extra}</div>`;
const FED = `<html><head><script>var x = "January 1-2";</script></head><body>
<div class="panel"><div class="panel-heading"><h4>2026 FOMC Meetings</h4></div>
${fedRow('October', '27-28', '<div>Minutes: <a>PDF</a> (Released November 18, 2026)</div>')}${fedRow('November', '5 (notation vote)')}${fedRow('December', '8-9*')}</div>
<div class="panel"><div class="panel-heading"><h4>2027 FOMC Meetings</h4></div>
${fedRow('January', '26-27')}${fedRow('March', '16-17*')}${fedRow('April', '27-28')}${fedRow('June', '8-9*')}${fedRow('July', '27-28')}${fedRow('September', '14-15*')}${fedRow('October', '26-27')}${fedRow('December', '7-8*')}</div></body></html>`;
const fed = B.parseFomc(FED);
ok(fed.join() === '2026-10-28,2026-12-09,2027-01-27,2027-03-17,2027-04-28,2027-06-09,2027-07-28,2027-09-15,2027-10-27,2027-12-08', 'Fed: the last day of each meeting, by year; minutes release dates, notation votes and scripts ignored', fed);
const span = B.parseFomc('<h4>2025 FOMC Meetings</h4><div>Apr/May</div><div>30-1</div><div>Jul/Aug</div><div>31-1*</div>');
ok(span.join() === '2025-05-01,2025-08-01', 'Fed: a meeting that spans two months ends in the second', span);
const cells = B.parseFomc('<h4>2027 FOMC Meetings</h4><div>Sept.</div><div>14-15*</div><div>Jan</div><div>26-27</div><div>May 4-5</div><p>Open Market 12 desks reported. Decision 3 was unanimous. Maybe 4 members dissent. The statement of January 26-27, 2027 is online. The next meeting was moved from March 9-10. See the Beige Book, December 2.</p>');
ok(cells.join() === '2027-01-27,2027-05-05,2027-09-15', 'Fed: a month and its days count when they are all a cell holds; a sentence that contains a date, or a word that starts like a month (“Market 12”), does not', cells);
const tricky = B.parseFomc(`<h4>2027 FOMC Meetings</h4><div>January</div><div>26-27</div><!-- <div>February</div><div>9-10</div> --><div>March</div><div>16-17*</div><div>April</div><div>13 (conference call)</div><div>May</div><div>4 - unscheduled</div><div>June</div><div>8<sup>1</sup></div><div>July</div><div>20 [unscheduled]</div>`);
ok(tricky.join() === '2027-01-27,2027-03-17', 'Fed: commented-out rows and rows with any remark after the days are not scheduled meetings', tricky);
const ECB = `<dl>
<dt>16/12/2026</dt><dd>Monetary policy meeting of the Governing Council of the ECB in Frankfurt (Day 1)</dd>
<dt>17/12/2026</dt><dd>Monetary policy meeting of the Governing Council of the ECB in Frankfurt (Day 2), followed by press conference</dd>
<dt>13/01/2027</dt><dd>Non-monetary policy meeting of the Governing Council of the ECB</dd>
<dt>03/02/2027</dt><dd>Monetary policy meeting of the Governing Council of the ECB (Day 1); the press conference follows on Day 2</dd>
<dt>04/02/2027</dt><dd>Monetary policy meeting of the Governing Council of the ECB (Day 2), followed by press conference</dd>
<dt>29/04/2027</dt><dd>Monetary policy meeting of the Governing Council of the ECB (Day 2), followed by press conference</dd>
<dt>28/10/2027</dt><dd>Monetary policy meeting of the Governing Council of the ECB (Day 2), followed by press conference</dd></dl>`;
const ecb = B.parseEcb(ECB);
ok(ecb.join() === '2026-12-17,2027-02-04,2027-04-29,2027-10-28', 'ECB: the day of the press conference; first days (also when they mention it) and non-monetary meetings ignored', ecb);
const ecbWords = B.parseEcb('<ul><li>3 February 2027: Monetary policy meeting of the Governing Council (Day 1)</li><li>4 February 2027: Monetary policy meeting of the Governing Council (Day 2), followed by press conference</li><li>17 March 2027: Non-monetary policy meeting</li></ul>');
ok(ecbWords.join() === '2027-02-04', 'ECB: dates written out (“4 February 2027”) are read the same way', ecbWords);
const BOE = `<h2>Upcoming MPC dates</h2><h3>2026</h3><table><tr><td>Thursday 5 November</td><td>Monetary Policy Summary and minutes and November Monetary Policy Report</td></tr><tr><td>Thursday 3 October</td><td>not a Thursday in 2026 or 2027</td></tr><tr><td>Thursday 17 December</td><td>Monetary Policy Summary and minutes</td></tr></table>
<p>The Bank is closed on Friday 25 December. Financial Stability Report - Tuesday 1 December.</p>
<h3>Provisional dates for 2027</h3><table>${['4 February', '18 March', '29 April', '17 June', '29 July', '16 September', '4 November', '16 December'].map((d) => `<tr><td>Thursday ${d}</td><td>Monetary Policy Summary${d === '16 September' ? ' (rescheduled from Thursday 9 September)' : ''}</td></tr>`).join('')}</table>
<p>This page was last updated Friday 2 October 2026</p>`;
const boe = B.parseBoe(BOE);
ok(boe.join() === '2026-11-05,2026-12-17,2027-02-04,2027-03-18,2027-04-29,2027-06-17,2027-07-29,2027-09-16,2027-11-04,2027-12-16', 'Bank of England: a date that starts its table cell, weekday and date agreeing (which also settles the year); dates inside sentences ignored', boe);

console.log('Central banks: which readings are used');
const sched = (area: string) => EC.BANK_SCHEDULES.find((b: any) => b.area === area);
const prevDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);
const verdict = (read: string[], area: string) => B.acceptSchedule(read, area ? sched(area).dates : []);
const fedOk = verdict(fed, 'USA');
ok(fedOk.ok && fedOk.dates.length === 10 && fedOk.confirmed === sched('USA').dates.length, 'a reading that contains every checked date is accepted, and says how many it confirms', fedOk);
const fedGap = verdict(fed.filter((d: string) => d !== '2027-03-17'), 'USA');
ok(!fedGap.ok && /2027-03-17/.test(fedGap.reason), 'a reading that misses a checked date is rejected, naming the date', fedGap);
ok(!verdict(['2027-01-27', '2027-03-17', '2027-08-01'], '').ok && !verdict(['2027-01-27'], '').ok, 'a weekend date, or too few dates, rejects a reading');
const wrong: [string, string[], string, RegExp][] = [
  ['a special row and a stray date next to a meeting', [...fed, '2026-11-16', '2026-11-24'], 'USA', /three weeks apart/],
  ['one stray date between two meetings of a full year', [...fed, '2027-02-19'], 'USA', /9 dates in 2027/],
  ['both days of every meeting', ['2027-02-04', '2027-03-18', '2027-04-29', '2027-06-10', '2027-07-22', '2027-09-09', '2027-10-28', '2027-12-16'].flatMap((d) => [prevDay(d), d]), 'XM', /16 dates in 2027|three weeks apart/],
  ['a date years away', [...fed, '2031-01-29'], 'USA', /more than two years away/],
  ['rows from long ago only', ['2015-02-05', '2015-03-19', '2015-04-30'], 'GBR', /no meeting from/],
];
for (const [label, read, area, why] of wrong) { const v = verdict(read, area); ok(!v.ok && why.test(v.reason), `a reading with ${label} is rejected`, v); }
const movedNext = verdict(['2026-12-18', '2027-02-04', '2027-04-29', '2027-10-28'], 'XM');
ok(movedNext.ok && movedNext.moved?.checked === '2026-12-17' && movedNext.moved.page === '2026-12-18' && movedNext.dates.join() === '2027-02-04,2027-04-29,2027-10-28', 'a meeting the page lists a day later than the checked list is handed back as moved, not shown twice; the rest of the reading is used', movedNext);
const movedLast = verdict(boe.map((d: string) => (d === '2027-12-16' ? '2027-12-09' : d)), 'GBR');
ok(movedLast.ok && movedLast.moved?.checked === '2027-12-16' && !movedLast.dates.includes('2027-12-09'), 'also when it is the last meeting on the page that moved', movedLast);
const movedTwo = verdict(boe.map((d: string) => (d === '2027-12-16' ? '2027-12-09' : d === '2027-02-04' ? '2027-02-11' : d)), 'GBR');
ok(!movedTwo.ok && /2027-02-11/.test(movedTwo.reason) && /2027-12-09/.test(movedTwo.reason), 'a reading that moves two meetings is not trusted at all', movedTwo);
const lone = verdict(['2027-01-27', '2027-03-17', '2027-04-28'], '');
ok(lone.ok && lone.confirmed === 0, 'a sound reading with no checked date to compare with is usable, and says nothing vouches for it', lone);
ok(verdict(boe, 'GBR').ok && verdict(ecb, 'XM').ok, 'the ECB and Bank of England readings agree with their checked lists');

console.log('Central banks: what the calendar shows');
const event = (id: string) => EC._test.bankEvents().find((e: any) => e.id === id);
const reseed = (area: string, dates: string[], fetchedAt?: string) => { seed(`econ:bank-page:${area}`, dates, fetchedAt); CACHE._test.forget(`econ:bank-page:${area}`); };
seed('econ:bls-ics', []);
reseed('USA', fed);
reseed('XM', ['2026-11-05', ...ecb, '2027-12-16']); // one meeting just held, and one beyond the checked list
reseed('GBR', ['2026-11-05', '2026-12-18', '2027-02-04']); // December meeting a day later than the checked list
await EC.buildCalendar();
const ecbFeb = event('cb:XM:2027-02-04'), ecbDec = event('cb:XM:2026-12-17');
ok(ecbDec?.basis === 'official-live' && /matches the checked list/.test(ecbDec.basisNote) && !!ecbDec.note, 'ECB: a checked date the page confirms is official, read live', [ecbDec?.basis, ecbDec?.basisNote]);
ok(ecbFeb?.basis === 'official-page' && /agrees with that list/.test(ecbFeb.basisNote) && ecbFeb.note === undefined, 'ECB: a date only the page has is added, labelled as read from the bank’s page, without the note written for the checked list', [ecbFeb?.basis, ecbFeb?.note]);
const gbr = EC._test.bankEvents().filter((e: any) => e.id.startsWith('cb:GBR:'));
const gbrDec = gbr.find((e: any) => e.id === 'cb:GBR:2026-12-17');
ok(gbr.length === sched('GBR').dates.length && !gbr.some((e: any) => e.id === 'cb:GBR:2026-12-18') && gbr.find((e: any) => e.id === 'cb:GBR:2027-02-04')?.basis === 'official-live' && gbr.find((e: any) => e.id === 'cb:GBR:2027-03-18')?.basis === 'official-curated', 'Bank of England: the page’s date for a moved meeting is not added; the rest of the reading is used', gbr.map((e: any) => [e.id, e.basis]));
ok(gbrDec?.basis === 'to-verify' && /18 December 2026/.test(gbrDec.basisNote), 'and the meeting the page moved is marked “to verify”, with the page’s date', [gbrDec?.basis, gbrDec?.basisNote]);
ok(EC.calendarStatus().errors.some((m: string) => /Bank of England.*2026-12-18.*2026-12-17/.test(m)) && EC.listWarnings().some((w: any) => /Bank of England.*2026-12-18/.test(w.message)), 'the calendar status and the audit both name the two dates', [EC.calendarStatus().errors, EC.listWarnings()]);
ok(EC.listWarnings().some((w: any) => /Bank of Japan: no meeting is listed between 2026-12-18 and 2027-07-22/.test(w.message)) && EC.listWarnings().some((w: any) => /summits, assemblies and votes ends/.test(w.message)), 'the audit also warns about a hand-entered list with a gap no schedule has, or one about to end', EC.listWarnings().map((w: any) => w.message));
ok(EC._test.bankEvents().filter((e: any) => e.id.startsWith('cb:JPN:')).every((e: any) => e.basis === 'official-curated'), 'banks without a page reader keep their checked list');
const far = EC.scheduleWarnings(420);
const ecbWarn = far.find((w: any) => /European Central Bank/.test(w.message)), fedWarn = far.find((w: any) => /Federal Reserve/.test(w.message));
ok(EC.scheduleWarnings().length === 0 && far.length === EC.BANK_SCHEDULES.length, 'the audit judges each schedule by its hand-checked list', far.map((w: any) => w.message));
ok(ecbWarn?.severity === 'info' && /hand-checked schedule ends 2027-10-28; later dates, to 2027-12-16/.test(ecbWarn.message) && fedWarn?.severity === 'warning' && /does not extend it/.test(fedWarn.message), 'a list the page extends is a note; one that simply ends is a warning', [ecbWarn, fedWarn]);

reseed('XM', [...ecb, '2027-12-16']); // the day after: the page no longer lists the meeting of 5 November
await EC.buildCalendar();
ok(event('cb:XM:2026-11-05')?.basis === 'official-page', 'a meeting the page dropped once it was held stays on the calendar for the look-back window', event('cb:XM:2026-11-05'));
const keep = { XM: sched('XM').dates, GBR: sched('GBR').dates };
sched('XM').dates = []; sched('GBR').dates = []; // as if nobody had extended the hand-checked lists
(await imp('server/changes.ts')).kvSet('econ:bank-page-memory:GBR', { vouched: [], held: [] }); // and the Bank of England page had never been read before
reseed('XM', [...ecb, '2027-12-16']); reseed('GBR', boe);
await EC.buildCalendar();
ok(event('cb:XM:2027-02-04')?.basis === 'official-page', 'with no checked date left, a reading that continues one vouched for earlier is still trusted', event('cb:XM:2027-02-04')?.basisNote);
ok(event('cb:GBR:2027-02-04')?.basis === 'page-unconfirmed' && /confirm on the bank/.test(event('cb:GBR:2027-02-04').basisNote), 'a reading nothing ever vouched for is shown as unconfirmed', event('cb:GBR:2027-02-04'));
ok(EC.scheduleWarnings(420).some((w: any) => /Bank of England/.test(w.message) && w.severity === 'warning' && /nothing left to compare/.test(w.message)), 'and the audit asks for checked dates to compare it with');
sched('XM').dates = keep.XM; sched('GBR').dates = keep.GBR;
// The terminal was switched off over a meeting only the page had: afterwards the page no longer lists it.
moveClock(74); // to 31 January 2027
reseed('XM', ['2027-02-04', '2027-04-29', '2027-10-28', '2027-12-16']);
await EC.buildCalendar();
moveClock(5); // to 5 February, the day after the meeting
reseed('XM', ['2027-04-29', '2027-10-28', '2027-12-16']);
await EC.buildCalendar();
ok(event('cb:XM:2027-02-04')?.basis === 'official-page', 'a meeting held while the terminal was off for a few days is still listed afterwards', EC._test.bankEvents().filter((e: any) => e.id.startsWith('cb:XM:')).map((e: any) => e.id));
moveClock(60); // to 6 April: the March meeting was last seen on a page months before it
ok(!event('cb:XM:2027-03-18'), 'but a date last seen on the page long before its day is not assumed to have been held', EC._test.bankEvents().filter((e: any) => e.id.startsWith('cb:XM:')).map((e: any) => e.id));
moveClock(-139);
reseed('USA', fed, new Date(Date.now() - 20 * 86400_000).toISOString());
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch; // the bank's site is down
await EC.buildCalendar();
globalThis.fetch = realFetch;
ok(event('cb:USA:2026-12-09')?.basis === 'official-curated' && EC.calendarStatus().errors.some((m: string) => /Federal Reserve.*not been readable since/.test(m)), 'a page that has not been readable for weeks is no longer shown as read live, and the status says so', [event('cb:USA:2026-12-09')?.basis, EC.calendarStatus().errors]);

// ───────────────────────── Wikidata meetings ─────────────────────────
console.log('Meetings of the web’s organizations, from Wikidata');
const EV = await imp('server/web/events.ts');
const q = EV.eventsQuery(['Q7184', 'Q458'], '2026-10-04', '2027-12-13');
ok(/VALUES \?org \{ wd:Q7184 wd:Q458 \}/.test(q) && /wdt:P664/.test(q) && /"2026-10-04T00:00:00Z"\^\^xsd:dateTime/.test(q) && /wikibase:timePrecision \?startPrec/.test(q), 'the query is built from the organizations in the web, and asks how precise each date is', q.slice(0, 160));
const W = 'http://www.wikidata.org/entity/';
const at = (d: string, precision = 11) => ({ start: { value: `${d}T00:00:00Z` }, startPrec: { value: String(precision) } });
const rows = [
  { ev: { value: `${W}Q1001` }, evLabel: { value: '2027 NATO summit' }, ...at('2027-07-07'), end: { value: '2027-07-08T00:00:00Z' }, endPrec: { value: '11' }, org: { value: `${W}Q7184` }, country: { value: `${W}Q43` }, locLabel: { value: 'Ankara' } },
  { ev: { value: `${W}Q1001` }, evLabel: { value: '2027 NATO summit' }, ...at('2027-07-07'), org: { value: `${W}Q7184` }, locLabel: { value: 'Q99999' } },
  { ev: { value: `${W}Q1002` }, evLabel: { value: 'Q1002' }, ...at('2027-03-01'), org: { value: `${W}Q7184` } },
  { ev: { value: `${W}Q1003` }, evLabel: { value: '2027 ministerial conference' }, ...at('2027-01-01', 9), org: { value: `${W}Q7184` } },
  { ev: { value: `${W}Q1004` }, evLabel: { value: 'A meeting of a body outside the web' }, ...at('2027-05-04'), org: { value: `${W}Q999999` }, country: { value: `${W}Q43` } },
  { ev: { value: `${W}Q1007` }, evLabel: { value: 'Spring session, date not set' }, ...at('2027-03-01', 10), org: { value: `${W}Q7184` } },
  { ev: { value: `${W}Q1008` }, evLabel: { value: 'New Year council' }, ...at('2027-01-01'), end: { value: '2027-02-01T00:00:00Z' }, endPrec: { value: '10' }, org: { value: `${W}Q7184` } },
];
const places: Record<string, string> = { Q7184: 'igo:nato', Q43: 'country:TUR' };
const evs = EV.parseOrgEvents(rows, (x: string) => places[x]);
const summit = evs.find((e: any) => e.qid === 'Q1001'), newYear = evs.find((e: any) => e.qid === 'Q1008');
ok(evs.length === 2 && summit?.title === '2027 NATO summit' && summit.placeIds.join() === 'igo:nato,country:TUR' && summit.start === '2027-07-07' && summit.end === '2027-07-08' && summit.location === 'Ankara', 'one event per item, with its organization and host country; unnamed and unrelated items left out', evs);
ok(newYear?.start === '2027-01-01' && newYear.end === undefined && !evs.some((e: any) => e.qid === 'Q1003' || e.qid === 'Q1007'), 'a date known only to the month or year is not put on a day; a real 1 January is kept', evs.map((e: any) => [e.qid, e.start, e.end]));

const M = (title: string, start: string, ...placeIds: string[]) => ({ title, start, placeIds });
const pairs: [boolean, any, any][] = [
  [true, M('G20 Leaders’ Summit — Miami', '2026-12-14', 'igo:g20', 'country:USA'), M('2026 G20 Miami summit', '2026-12-14', 'igo:g20')],
  [true, M('European Council summit (EU heads of government)', '2026-12-16', 'igo:eu'), M('European Council, December 2026', '2026-12-17', 'igo:eu')],
  [true, M('2027 G7 summit', '2027-06-14', 'igo:g7'), M('53rd G7 summit', '2027-06-14', 'igo:g7')],
  [false, M('European Parliament plenary — Strasbourg (votes)', '2026-12-14', 'igo:eu'), M('EU–China summit', '2026-12-15', 'igo:eu')],
  [false, M('European Council summit (EU heads of government)', '2026-12-16', 'igo:eu'), M('EU–China summit', '2026-12-15', 'igo:eu')],
  [false, M('APEC Economic Leaders’ Meeting — Shenzhen', '2026-11-18', 'country:CHN'), M('SCO ministerial conference', '2026-11-19', 'igo:sco', 'country:CHN')],
  [false, M('G20 Leaders’ Summit — Miami', '2026-12-14', 'igo:g20', 'country:USA'), M('UN Ocean Conference', '2026-12-13', 'igo:un', 'country:USA')],
  [false, M('G20 Leaders’ Summit — Miami', '2026-12-14', 'igo:g20'), M('G20 Leaders’ Summit — Johannesburg', '2027-11-20', 'igo:g20')],
];
ok(pairs.every(([same, a, b]) => EC.sameMeeting(a, b) === same && EC.sameMeeting(b, a) === same), 'two entries are one meeting only with an organization in common, close dates and titles that match — a shared host country or week is not enough', pairs.filter(([same, a, b]) => EC.sameMeeting(a, b) !== same).map(([, a, b]) => [a.title, b.title]));

const g20 = EC.IGO_EVENTS.find((d: any) => d.id === 'g20-2026'), euco = EC.IGO_EVENTS.find((d: any) => d.id === 'euco-2026-12');
const wd = (qid: string, title: string, start: string, end: string | undefined, ...placeIds: string[]) => ({ qid, title, start, end, placeIds, url: `https://www.wikidata.org/wiki/${qid}` });
EV.setOrgEventsForTest([summit,
  wd('Q1005', '2026 G20 Miami summit', g20.start, g20.end, 'igo:g20'),
  wd('Q1006', 'OSCE Ministerial Council', '2026-12-03', undefined, 'igo:osce'),
  wd('Q1010', 'European Council, December 2026', '2026-12-17', '2026-12-18', 'igo:eu'),
  wd('Q1011', 'EU–China summit', '2026-12-15', undefined, 'igo:eu', 'country:CHN'),
  { ...wd('Q1012', '2027 G7 summit', '2027-06-14', '2027-06-16', 'igo:g7'), location: 'Évian-les-Bains' },
  { ...wd('Q1013', '53rd G7 summit', '2027-06-14', '2027-06-16', 'igo:g7'), location: 'Évian-les-Bains' }]);
const igo = EC._test.igoEvents();
const nato = igo.find((e: any) => e.id === 'igo:wd-Q1001'), osce = igo.find((e: any) => e.id === 'igo:wd-Q1006'), g20c = igo.find((e: any) => e.id === 'igo:g20-2026'), eucoC = igo.find((e: any) => e.id === 'igo:euco-2026-12');
ok(nato?.basis === 'reference-live' && nato.title === '2027 NATO summit — Ankara' && nato.sourceId === 'wikidata', 'a summit only Wikidata has is added and labelled as from Wikidata', nato);
ok(osce?.basis === 'reference-live' && nato.importance === 5 && osce.importance === 4 && igo.filter((e: any) => e.basis === 'reference-live').every((e: any) => e.importance <= 5), 'Wikidata-only meetings are graded by their title alone: a summit above a ministerial meeting, none above 5', [nato?.importance, osce?.importance]);
ok(!igo.some((e: any) => e.id === 'igo:wd-Q1005') && /Wikidata has the same dates/.test(g20c?.basisNote || ''), 'a meeting the checked list already has is not doubled; the checked entry notes that Wikidata agrees', g20c?.basisNote);
ok(!igo.some((e: any) => e.id === 'igo:wd-Q1010') && /Wikidata has 17–18 December 2026/.test(eucoC?.basisNote || '') && euco.start === '2026-12-16', 'where Wikidata gives other dates for it, the entry says so instead of claiming agreement', eucoC?.basisNote);
ok(igo.some((e: any) => e.id === 'igo:wd-Q1011') && !igo.filter((e: any) => /plenary/i.test(e.title)).some((e: any) => /Wikidata/.test(e.basisNote || '')), 'another meeting of the same organization in the same week is listed in its own right', igo.filter((e: any) => /plenary|China/.test(e.title)).map((e: any) => [e.id, e.basisNote]));
ok(igo.filter((e: any) => /G7 summit/.test(e.title)).length === 1, 'two Wikidata items for one summit are listed once', igo.filter((e: any) => /G7/.test(e.title)).map((e: any) => e.id));
ok(EC.calendarSourceIds().includes('wikidata'), 'the calendar’s sources include Wikidata, so the audit can check it is listed');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll update checks passed');
process.exit(failures ? 1 : 0);

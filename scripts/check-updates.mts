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

process.env.TERMINAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'git-updates-check-'));
process.env.LIVE_MERGE_MS = '150';
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href);
const seed = (key: string, payload: unknown) => {
  const dir = path.join(process.env.TERMINAL_DATA_DIR!, 'cache'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, crypto.createHash('sha1').update(key).digest('hex') + '.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), payload }));
};
let failures = 0;
const ok = (cond: unknown, label: string, detail?: unknown) => { console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`); if (!cond) failures++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LIVE = await imp('server/live.ts');
const CACHE = await imp('server/cache.ts');
const { default: express } = await import('express');

// ───────────────────────── Live updates ─────────────────────────
console.log('Live updates: the stream');
const app = express(); app.get('/live', LIVE.liveStream);
const srv = http.createServer(app);
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
const port = (srv.address() as { port: number }).port;
/** Read a stream's events for `ms` milliseconds. */
function listen(ms: number) {
  return new Promise<{ events: { event: string; data: any }[]; headers: http.IncomingHttpHeaders }>((resolve) => {
    const events: { event: string; data: any }[] = []; let buf = '';
    const req = http.get({ host: '127.0.0.1', port, path: '/live' }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
      });
      setTimeout(() => { req.destroy(); resolve({ events, headers: res.headers }); }, ms);
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
srv.close();

console.log('Live updates: the cache announces changed figures only');
const count = () => { LIVE.flush(); return LIVE.streamStatus().bySource.qtest || 0; };
await CACHE.cached('qtest:a', 0, async () => ({ v: 1 }));
const c1 = count();
await CACHE.cached('qtest:a', 0, async () => ({ v: 1 }));
const c2 = count();
await CACHE.cached('qtest:a', 0, async () => ({ v: 2 }));
const c3 = count();
ok(c1 === 1 && c2 === 1 && c3 === 2, 'new data and changed figures are announced; the same figures fetched again are not', [c1, c2, c3]);

// ───────────────────────── Central banks ─────────────────────────
console.log('Central banks: schedules read from the banks’ pages');
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
const ECB = `<dl>
<dt>16/12/2026</dt><dd>Monetary policy meeting of the Governing Council of the ECB in Frankfurt (Day 1)</dd>
<dt>17/12/2026</dt><dd>Monetary policy meeting of the Governing Council of the ECB in Frankfurt (Day 2), followed by press conference</dd>
<dt>13/01/2027</dt><dd>Non-monetary policy meeting of the Governing Council of the ECB</dd>
<dt>03/02/2027</dt><dd>Monetary policy meeting of the Governing Council of the ECB (Day 1)</dd>
<dt>04/02/2027</dt><dd>Monetary policy meeting of the Governing Council of the ECB (Day 2), followed by press conference</dd>
<dt>29/04/2027</dt><dd>Monetary policy meeting of the Governing Council of the ECB (Day 2), followed by press conference</dd>
<dt>28/10/2027</dt><dd>Monetary policy meeting of the Governing Council of the ECB (Day 2), followed by press conference</dd></dl>`;
const ecb = B.parseEcb(ECB);
ok(ecb.join() === '2026-12-17,2027-02-04,2027-04-29,2027-10-28', 'ECB: the day of the press conference; first days and non-monetary meetings ignored', ecb);
const BOE = `<h2>Upcoming MPC dates</h2><h3>2026</h3><table><tr><td>Thursday 5 November</td><td>Monetary Policy Summary and minutes and November Monetary Policy Report</td></tr><tr><td>Thursday 3 October</td><td>not a Thursday in 2026 or 2027</td></tr><tr><td>Thursday 17 December</td><td>Monetary Policy Summary and minutes</td></tr></table>
<h3>Provisional dates for 2027</h3><table>${['4 February', '18 March', '29 April', '17 June', '29 July', '16 September', '4 November', '16 December'].map((d) => `<tr><td>Thursday ${d}</td><td>Monetary Policy Summary</td></tr>`).join('')}</table>
<p>This page was last updated Friday 2 October 2026</p>`;
const boe = B.parseBoe(BOE);
ok(boe.join() === '2026-11-05,2026-12-17,2027-02-04,2027-03-18,2027-04-29,2027-06-17,2027-07-29,2027-09-16,2027-11-04,2027-12-16', 'Bank of England: weekday and date must agree (which also settles the year); “last updated” dates ignored', boe);

const sched = (area: string) => EC.BANK_SCHEDULES.find((b: any) => b.area === area);
const fedOk = B.acceptSchedule(fed, sched('USA').dates);
ok(fedOk.ok && fedOk.dates.length === 10, 'a reading that contains every checked date is accepted', fedOk);
const fedGap = B.acceptSchedule(fed.filter((d: string) => d !== '2027-03-17'), sched('USA').dates);
ok(!fedGap.ok && /2027-03-17/.test(fedGap.reason), 'a reading that misses a checked date is rejected, naming the date', fedGap);
ok(!B.acceptSchedule(['2027-01-27', '2027-03-17', '2027-08-01'], []).ok && !B.acceptSchedule(['2027-01-27'], []).ok, 'a weekend date, or too few dates, rejects a reading');
ok(B.acceptSchedule(boe, sched('GBR').dates).ok && B.acceptSchedule(ecb, sched('XM').dates).ok, 'the ECB and Bank of England readings agree with their checked lists');

console.log('Central banks: the calendar uses readings that agree, and says why it skips the others');
seed('econ:bls-ics', []);
seed('econ:bank-page:USA', fed);
seed('econ:bank-page:XM', ecb);
seed('econ:bank-page:GBR', ['2026-11-05', '2026-12-18', '2027-02-04']); // disagrees with the checked list
await EC.buildCalendar();
const cb = EC._test.bankEvents();
const ecbFeb = cb.find((e: any) => e.id === 'cb:XM:2027-02-04'), ecbDec = cb.find((e: any) => e.id === 'cb:XM:2026-12-17');
ok(ecbFeb?.basis === 'official-live' && ecbDec?.basis === 'official-live' && /matches the checked list/.test(ecbDec.basisNote), 'ECB: a date only the page has is added; checked dates are confirmed by the page', [ecbFeb?.basis, ecbDec?.basisNote]);
const gbr = cb.filter((e: any) => e.id.startsWith('cb:GBR:'));
ok(gbr.length > 0 && gbr.every((e: any) => e.basis === 'official-curated') && !gbr.some((e: any) => e.id === 'cb:GBR:2026-12-18'), 'Bank of England: a reading that disagrees is not used; the checked dates stay', gbr.map((e: any) => e.id));
ok(EC.calendarStatus().errors.some((m: string) => /Bank of England.*not used.*2026-12-17/.test(m)), 'the calendar status says why the Bank of England page was not used', EC.calendarStatus().errors);
ok(cb.filter((e: any) => e.id.startsWith('cb:JPN:')).every((e: any) => e.basis === 'official-curated'), 'banks without a page reader keep their checked list');
ok(!EC.scheduleWarnings().some((w: any) => /Federal Reserve/.test(w.message)), 'the Fed’s schedule, extended by its page, does not trigger the “schedule runs out” warning');

// ───────────────────────── Wikidata meetings ─────────────────────────
console.log('Meetings of the web’s organizations, from Wikidata');
const EV = await imp('server/web/events.ts');
const q = EV.eventsQuery(['Q7184', 'Q458'], '2026-11-08', '2027-12-13');
ok(/VALUES \?org \{ wd:Q7184 wd:Q458 \}/.test(q) && /wdt:P664/.test(q) && /"2026-11-08T00:00:00Z"\^\^xsd:dateTime/.test(q), 'the query is built from the organizations in the web, for the coming year', q.slice(0, 160));
const W = 'http://www.wikidata.org/entity/';
const rows = [
  { ev: { value: `${W}Q1001` }, evLabel: { value: '2027 NATO summit' }, start: { value: '2027-07-07T00:00:00Z' }, end: { value: '2027-07-08T00:00:00Z' }, org: { value: `${W}Q7184` }, country: { value: `${W}Q43` }, locLabel: { value: 'Ankara' } },
  { ev: { value: `${W}Q1001` }, evLabel: { value: '2027 NATO summit' }, start: { value: '2027-07-07T00:00:00Z' }, org: { value: `${W}Q7184` }, locLabel: { value: 'Q99999' } },
  { ev: { value: `${W}Q1002` }, evLabel: { value: 'Q1002' }, start: { value: '2027-03-01T00:00:00Z' }, org: { value: `${W}Q7184` } },
  { ev: { value: `${W}Q1003` }, evLabel: { value: '2027 ministerial conference' }, start: { value: '2027-01-01T00:00:00Z' }, org: { value: `${W}Q7184` } },
  { ev: { value: `${W}Q1004` }, evLabel: { value: 'A meeting of a body outside the web' }, start: { value: '2027-05-04T00:00:00Z' }, org: { value: `${W}Q999999` }, country: { value: `${W}Q43` } },
];
const places: Record<string, string> = { Q7184: 'igo:nato', Q43: 'country:TUR' };
const evs = EV.parseOrgEvents(rows, (x: string) => places[x]);
ok(evs.length === 1 && evs[0].title === '2027 NATO summit' && evs[0].placeIds.join() === 'igo:nato,country:TUR' && evs[0].start === '2027-07-07' && evs[0].end === '2027-07-08' && evs[0].location === 'Ankara', 'one event per item, with its organization and host country; unnamed, year-only and unrelated items left out', evs);
const g20 = EC.IGO_EVENTS.find((d: any) => d.id === 'g20-2026');
EV.setOrgEventsForTest([...evs,
  { qid: 'Q1005', title: '2026 G20 Miami summit', start: g20.start, end: g20.end, placeIds: ['igo:g20'], url: 'https://www.wikidata.org/wiki/Q1005' },
  { qid: 'Q1006', title: 'OSCE Ministerial Council', start: '2026-12-03', placeIds: ['igo:osce'], url: 'https://www.wikidata.org/wiki/Q1006' }]);
const igo = EC._test.igoEvents();
const nato = igo.find((e: any) => e.id === 'igo:wd-Q1001'), osce = igo.find((e: any) => e.id === 'igo:wd-Q1006'), g20c = igo.find((e: any) => e.id === 'igo:g20-2026');
ok(nato?.basis === 'reference-live' && nato.title === '2027 NATO summit — Ankara' && nato.sourceId === 'wikidata', 'a summit only Wikidata has is added and labelled as from Wikidata', nato);
ok(osce?.basis === 'reference-live' && nato.importance > osce.importance, 'a summit is graded above a ministerial meeting', [nato?.importance, osce?.importance]);
ok(!igo.some((e: any) => e.id === 'igo:wd-Q1005') && /Wikidata has the same dates/.test(g20c?.basisNote || ''), 'a meeting the checked list already has is not doubled; the checked entry notes that Wikidata agrees', g20c?.basisNote);
ok(EC.calendarSourceIds().includes('wikidata'), 'the calendar’s sources include Wikidata, so the audit can check it is listed');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll update checks passed');
process.exit(failures ? 1 : 0);

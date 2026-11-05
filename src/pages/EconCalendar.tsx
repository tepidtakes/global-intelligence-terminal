// Economic & IGO calendar: a daily schedule of data releases, central-bank decisions, summits,
// assemblies and votes, budget days and elections — global or for one country / organisation —
// with importance graded 1–10 (reasons on hover) and results posted after release.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import { Card, Loading, SourceRef, Unavailable, localToday } from '../components/common';
import { AlertButton } from '../components/alertBits';
import { TYPE_ICON } from '../format';

const KINDS: [string, string, string][] = [['release', 'Data releases', '📊'], ['central-bank', 'Central banks', '🏦'], ['igo', 'Summits, assemblies & votes', '🗓'], ['budget', 'Budgets', '💰'], ['election', 'Elections', '🗳'], ['event', 'Other events', '◷']];
const BASIS: Record<string, { label: string; help: string; cls: string }> = {
  'official-live': { label: 'official', help: 'From an official calendar, fetched live', cls: 'ok' },
  'official-curated': { label: 'official', help: 'From an official published schedule, entered by hand and checked against several sources', cls: 'ok' },
  'official-rule': { label: 'official rule', help: 'A fixed rule the institution publishes (e.g. “the 20th of each month”)', cls: 'ok' },
  'usual-timing': { label: '≈ usual timing', help: 'Not a confirmed date: the agency usually publishes around this time. Check the source before relying on it.', cls: 'warn' },
  'to-verify': { label: 'to verify', help: 'From a single source — check the official calendar', cls: 'warn' },
};
const RANGES: [string, string, number, number][] = [['today', 'Today', 0, 0], ['week', 'Next 7 days', 0, 6], ['month', 'Next 30 days', 0, 30], ['quarter', 'Next 90 days', 0, 90], ['past', 'Past 14 days', -14, -1]];
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
const localDay = (e: any) => (e.allDay ? e.start.slice(0, 10) : new Date(e.start).toLocaleDateString('en-CA'));
const localTime = (e: any) => (e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));

export function Importance({ n, why }: { n: number; why?: string[] }) {
  return <span className={`imp imp${n}`} title={`Importance ${n}/10${why?.length ? `\n${why.join('\n')}` : ''}`}>{n}/10</span>;
}

export function EconCalendarView({ fixedPlace }: { fixedPlace?: string }) {
  const [sp, setSp] = useSearchParams();
  const place = fixedPlace || sp.get('place') || '';
  const [range, setRange] = useState(fixedPlace ? 'month' : 'week');
  const [min, setMin] = useState(fixedPlace ? 1 : 3);
  const [kinds, setKinds] = useState<string[]>([]);
  const [usual, setUsual] = useState(true);
  const today = localToday();
  const r = RANGES.find((x) => x[0] === range)!;
  const from = addDays(today, r[2] - 1), to = addDays(today, r[3] + 1);
  const q = new URLSearchParams({ from, to, min: String(min), ...(place ? { place } : {}), ...(kinds.length ? { kinds: kinds.join(',') } : {}), ...(usual ? {} : { usual: '0' }) });
  const { data, loading, error } = useApi<any>(`/calendar/econ?${q}`, 120_000);
  const places = useApi<any[]>(fixedPlace ? null : '/calendar/econ/places', 600_000);
  const days = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of data?.events || []) { const d = localDay(e); if (d < addDays(today, r[2]) || d > addDays(today, r[3])) continue; (m.get(d) || m.set(d, []).get(d)!).push(e); }
    for (const list of m.values()) list.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1) || b.importance - a.importance);
    return [...m].sort((a, b) => (range === 'past' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])));
  }, [data, range, today]);
  const placeName = (places.data || []).find((p) => p.id === place)?.name;
  return (
    <div>
      <div className="toolbar">
        {!fixedPlace && (
          <select className="input" style={{ maxWidth: 260 }} value={place} onChange={(e) => setSp(e.target.value ? { place: e.target.value } : {})} aria-label="Country or organisation">
            <option value="">🌐 Global — all countries & organisations</option>
            {(places.data || []).map((p) => <option key={p.id} value={p.id}>{p.flag || TYPE_ICON[p.type]} {p.name} ({p.count})</option>)}
          </select>
        )}
        <div className="seg" role="group" aria-label="Period">{RANGES.map(([k, l]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}</div>
        <select className="input" style={{ width: 170 }} value={min} onChange={(e) => setMin(Number(e.target.value))} aria-label="Minimum importance">
          {[1, 3, 5, 7, 9].map((n) => <option key={n} value={n}>Importance {n}+ {n === 1 ? '(everything)' : ''}</option>)}
        </select>
        <label className="small" title="Releases whose exact date is not published yet, placed at the agency’s usual timing"><input type="checkbox" checked={usual} onChange={(e) => setUsual(e.target.checked)} /> Usual-timing estimates</label>
        {place && !fixedPlace && <AlertButton entityId={place} name={placeName || place} type={place.split(':')[0]} />}
      </div>
      <div className="chips" style={{ marginBottom: 10 }}>
        {KINDS.map(([k, l, i]) => <button key={k} className={`btn sm${kinds.includes(k) ? ' primary' : ''}`} aria-pressed={kinds.includes(k)} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}>{i} {l}</button>)}
        {kinds.length > 0 && <button className="linkish small" onClick={() => setKinds([])}>Show all kinds</button>}
      </div>
      {loading && !data ? <Loading lines={6} /> : error ? <Unavailable>{error.message}</Unavailable> : !days.length ? <Unavailable>Nothing scheduled{place ? ` for ${placeName || 'this place'}` : ''} in this period at importance {min}+.</Unavailable> : (
        days.map(([day, list]) => (
          <Card key={day} title={<span>{day === today ? 'Today · ' : day === addDays(today, 1) ? 'Tomorrow · ' : ''}{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>} className="calDay">
            <div style={{ overflowX: 'auto' }}>
              <table className="data calTable">
                <tbody>{list.map((e: any) => (
                  <tr key={e.id} className={e.status === 'released' ? 'done' : ''}>
                    <td className="tab small" style={{ width: 92 }}>{localTime(e)}{e.timeLabel && !e.allDay && <div className="tiny muted">{e.timeLabel}</div>}</td>
                    <td style={{ width: 54 }}><Importance n={e.importance} why={e.importanceWhy} /></td>
                    <td>
                      <div>{KINDS.find((k) => k[0] === e.kind)?.[2]} {e.entityId ? <Link to={`/entity/${encodeURIComponent(e.entityId)}`}><strong>{e.title}</strong></Link> : <strong>{e.title}</strong>}{e.end && e.end !== e.start.slice(0, 10) && <span className="tiny muted"> · until {new Date(`${e.end}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}</div>
                      <div className="tiny muted row wrap" style={{ gap: 6 }}>
                        {e.places.slice(0, 3).map((p: any) => <Link key={p.id} to={`/entity/${encodeURIComponent(p.id)}`}>{p.flag || TYPE_ICON[p.type]} {p.name}</Link>)}
                        <span className={`basis ${BASIS[e.basis]?.cls}`} title={`${BASIS[e.basis]?.help}${e.basisNote ? ` — ${e.basisNote}` : ''}`}>{BASIS[e.basis]?.label}</span>
                        {e.url && <a href={e.url} target="_blank" rel="noreferrer">source ↗</a>}
                      </div>
                      {e.note && <div className="tiny muted">{e.note}</div>}
                    </td>
                    <td className="small" style={{ minWidth: 200 }}>
                      {e.result ? <><strong>{e.result.headline}</strong><div className="tiny muted"><SourceRef id={e.result.sourceId} prefix="" /></div></>
                        : e.status === 'result-pending' ? <span className="muted">Result not published in the open data yet</span>
                        : <span className="muted">Scheduled</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        ))
      )}
      <div className="tiny muted" style={{ marginTop: 8 }}>
        Times are in your time zone. Importance (1–10) = what the event is (e.g. a rate decision or CPI release) + how much that economy or organisation matters worldwide + context; hover a score for the breakdown. Results are posted from FRED (US), Eurostat (euro area) and the BIS (every central-bank decision) once published; consensus forecasts are licensed data and not shown.
        {data?.status?.errors?.length ? <span style={{ color: 'var(--warn)' }}> Some calendars could not be loaded: {data.status.errors.join('; ')}.</span> : null}
      </div>
    </div>
  );
}

/** Calendar section on a country or organisation profile. */
export function CalendarSection({ placeId, name }: { placeId: string; name: string }) {
  return (
    <Card title="Economic & political calendar" id="calendar" actions={<Link className="btn sm" to={`/calendar?place=${encodeURIComponent(placeId)}`}>Full calendar</Link>}>
      <div className="small muted" style={{ marginBottom: 6 }}>Data releases, central-bank decisions, summits and votes, budgets and elections for {name}, with results after release.</div>
      <EconCalendarView fixedPlace={placeId} />
    </Card>
  );
}

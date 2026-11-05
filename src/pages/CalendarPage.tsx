import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, invalidate, useApi } from '../api';
import { useApp, useAuth } from '../state';
import { Card, EntityChip, EntityPicker, Loading, Modal, localToday } from '../components/common';
import { fmtDate } from '../format';
import type { Catalyst, EntityStub } from '../../shared/types';
import { EconCalendarView } from './EconCalendar';

const CATS = ['election', 'central-bank', 'summit', 'policy', 'corporate', 'leadership'];

/** Calendar: the economic & political calendar (default) and the events / catalysts view. */
export function CalendarPage() {
  const [sp, setSp] = useSearchParams();
  const mine = sp.get('view') === 'mine' || !!sp.get('track') || !!sp.get('catalyst') || !!sp.get('entity');
  return (
    <div className="page wide">
      <div className="row wrap" style={{ alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h1>Calendar</h1>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={!mine} className={!mine ? 'on' : ''} onClick={() => setSp({})}>Economic & political</button>
          <button role="tab" aria-selected={mine} className={mine ? 'on' : ''} onClick={() => setSp({ view: 'mine' })}>Events & my catalysts</button>
        </div>
      </div>
      {mine ? <EventsAndCatalysts /> : <EconCalendarView />}
    </div>
  );
}

function EventsAndCatalysts() {
  const [sp, setSp] = useSearchParams();
  const { user } = useAuth();
  const [cat, setCat] = useState('');
  const [showPast, setShowPast] = useState(false);
  const entityFilter = sp.get('entity');
  const today = localToday();
  const from = showPast ? '2020-01-01' : today;
  const { data: events, loading } = useApi<any[]>(`/events?from=${from}${cat ? `&category=${cat}` : ''}`, 60_000);
  const cats = useApi<Catalyst[]>(user ? '/catalysts' : null, 5_000);
  const filterEnt = useApi<any>(entityFilter ? `/preview/${encodeURIComponent(entityFilter)}` : null);
  const [editing, setEditing] = useState<Partial<Catalyst> | null>(null);

  // Deep links: ?track=<eventId> starts a catalyst for that event; ?catalyst=<id> opens one.
  useEffect(() => {
    const track = sp.get('track'); const cid = sp.get('catalyst');
    if (track && user) api(`/entity/${encodeURIComponent(track)}`).then((d) => setEditing({ title: `${d.entity.name} — my view`, eventEntityId: track, eventDate: d.entity.attrs?.date, status: 'pending', entityIds: d.relationships.filter((r: any) => r.rel.type === 'affects' && r.direction === 'out').map((r: any) => r.other.id).slice(0, 8) }));
    if (cid && cats.data) { const c = cats.data.find((x) => x.id === cid); if (c) setEditing(c); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.get('track'), sp.get('catalyst'), user, cats.data]);

  const list = useMemo(() => (events || []).filter((e) => !entityFilter || e.affects.some((a: any) => a?.id === entityFilter)), [events, entityFilter]);
  const byMonth = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of list) { const k = new Date(e.date + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long' }); (m.get(k) || m.set(k, []).get(k)!).push(e); }
    return [...m.entries()];
  }, [list]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap"><span className="small muted">Scheduled events in the knowledge graph, and your own catalyst forecasts.</span><div className="spacer" />{user && <button className="btn primary sm" onClick={() => setEditing({ title: '', status: 'pending', entityIds: [] })}>＋ New catalyst forecast</button>}</div>
      <div className="row wrap">
        <div className="seg"><button className={!cat ? 'on' : ''} onClick={() => setCat('')}>all</button>{CATS.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
        <label className="layerItem"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Include past events</label>
        {entityFilter && filterEnt.data && <span className="row small">Affecting <EntityChip e={filterEnt.data.entity} onRemove={() => { sp.delete('entity'); setSp(sp); }} /></span>}
      </div>
      <div className="profile" style={{ padding: 0, maxWidth: 'none' }}>
        <div className="colMain">
          <Card title="Calendar (objective, sourced events)">
            {loading && !events ? <Loading /> : !list.length ? <div className="empty">No events match. The curated calendar is a starting set — add your own expectations as catalysts.</div> : byMonth.map(([m, evs]) => (
              <div key={m} style={{ marginBottom: 14 }}>
                <h3 style={{ marginBottom: 6 }}>{m}</h3>
                <table className="data"><tbody>{evs.map((e) => (
                  <tr key={e.id}>
                    <td style={{ width: 120 }} className="tab">{fmtDate(e.date)}{e.endDate && e.endDate !== e.date ? <div className="tiny muted">to {fmtDate(e.endDate)}</div> : null}</td>
                    <td><Link to={`/entity/${encodeURIComponent(e.id)}`}><strong>{e.name}</strong></Link> <span className="badge">{e.category}</span> <span className="badge">{String(e.status).replace(/-/g, ' ')}</span>
                      <div className="small muted" style={{ margin: '2px 0 4px' }}>{e.summary}</div>
                      <div className="chips">{e.affects.filter(Boolean).slice(0, 8).map((a: any) => <EntityChip key={a.id} e={a} />)}</div></td>
                    <td className="r">{user && <button className="btn sm" onClick={() => setEditing({ title: `${e.name} — my view`, eventEntityId: e.id, eventDate: e.date, status: 'pending', entityIds: e.affects.filter(Boolean).map((a: any) => a.id).slice(0, 8) })}>Track</button>}</td>
                  </tr>
                ))}</tbody></table>
              </div>
            ))}
          </Card>
        </div>
        <div className="colSide">
          <Card title={<>Catalyst tracker <span className="badge private">Your forecasts</span></>}>
            {!user ? <div className="small"><Link to="/login">Sign in</Link> to record expected outcomes, scenarios and post-event analysis.</div> :
              !cats.data?.length ? <div className="small muted">No catalysts yet. Click “Track” on an event or create one.</div> :
              cats.data.map((c) => (
                <div key={c.id} className="noteItem" style={{ cursor: 'pointer' }} onClick={() => setEditing(c)}>
                  <div className="t">{c.title}</div>
                  <div className="tiny muted">{c.eventDate ? fmtDate(c.eventDate) : 'No date'} · {c.status}</div>
                  {c.expectedOutcome && <div className="x">Expected: {c.expectedOutcome}</div>}
                </div>
              ))}
            <div className="tiny muted" style={{ marginTop: 6 }}>Forecasts are hypotheses, stored privately and always labelled separately from sourced event data.</div>
          </Card>
        </div>
      </div>
      {editing && <CatalystEditor c={editing} onClose={() => { setEditing(null); if (sp.get('track') || sp.get('catalyst')) { sp.delete('track'); sp.delete('catalyst'); setSp(sp); } }} />}
    </div>
  );
}

function CatalystEditor({ c, onClose }: { c: Partial<Catalyst>; onClose: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<any>({ ...c });
  const [ents, setEnts] = useState<EntityStub[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { Promise.all((c.entityIds || []).map((id) => api(`/preview/${encodeURIComponent(id)}`).then((p) => p.entity).catch(() => null))).then((l) => setEnts(l.filter(Boolean))); }, [c.entityIds]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      const body = { ...f, entityIds: ents.map((e) => e.id) };
      if (f.id) await api(`/catalysts/${f.id}`, { method: 'PUT', body }); else await api('/catalysts', { body });
      invalidate('/catalysts'); invalidate('/entity'); toast('Catalyst saved'); onClose();
    } catch (x: any) { setErr(x.message); }
  };
  return (
    <Modal title={f.id ? 'Edit catalyst' : 'New catalyst forecast'} onClose={onClose} footer={<>
      {f.id && <button className="btn danger" onClick={async () => { if (confirm('Delete this catalyst?')) { await api(`/catalysts/${f.id}`, { method: 'DELETE' }); invalidate('/catalysts'); onClose(); } }}>Delete</button>}
      <div className="spacer" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="note-banner tiny">Your hypothesis — private, and shown separately from objective event information.</div>
      <label className="field">Title<input className="input" value={f.title || ''} onChange={set('title')} /></label>
      <div className="grid2">
        <label className="field">Event date<input className="input" type="date" value={f.eventDate || ''} onChange={set('eventDate')} /></label>
        <label className="field">Status<select className="input" value={f.status} onChange={set('status')}><option value="pending">Pending</option><option value="occurred">Occurred</option><option value="cancelled">Cancelled</option></select></label>
      </div>
      {f.eventEntityId && <div className="small">Linked event: <Link to={`/entity/${encodeURIComponent(f.eventEntityId)}`}>{f.eventEntityId}</Link></div>}
      <label className="field">Expected outcome<textarea className="input" rows={2} value={f.expectedOutcome || ''} onChange={set('expectedOutcome')} /></label>
      <label className="field">Alternative scenarios (with rough probabilities)<textarea className="input" rows={3} value={f.scenarios || ''} onChange={set('scenarios')} /></label>
      <label className="field">Economic / market implications<textarea className="input" rows={2} value={f.implications || ''} onChange={set('implications')} /></label>
      <label className="field">Personal thesis & relevant positions<textarea className="input" rows={2} value={f.thesis || ''} onChange={set('thesis')} /></label>
      <div className="field">Affected entities
        <div className="chips">{ents.map((e) => <EntityChip key={e.id} e={e} onRemove={() => setEnts(ents.filter((x) => x.id !== e.id))} />)}</div>
        <EntityPicker onPick={(e) => setEnts([...ents, e])} exclude={ents.map((e) => e.id)} />
      </div>
      {f.status === 'occurred' && <label className="field">Post-event analysis<textarea className="input" rows={3} value={f.postAnalysis || ''} onChange={set('postAnalysis')} /></label>}
      {err && <div className="err small">{err}</div>}
    </Modal>
  );
}

// Alerts in the UI: the bell in the top bar (with browser notifications), the one-click
// "Alert me" button used on profiles, the map and notes, and the "recent changes" list.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, invalidate, useApi } from '../api';
import { useApp, useAuth } from '../state';
import { localToday } from './common';
import { ago, fmtDate, TYPE_ICON } from '../format';

const PLACE_TYPES = new Set(['country', 'state', 'county', 'city', 'region']);

/** One-click alert rule for an entity, a place (everything inside it) or a note's entities. */
export function AlertButton({ entityId, name, type, noteId, compact }: { entityId?: string; name: string; type?: string; noteId?: string; compact?: boolean }) {
  const { user } = useAuth();
  const { toast } = useApp();
  const nav = useNavigate();
  const rules = useApi<any[]>(user ? '/alerts/rules' : null, 30_000);
  const mine = (rules.data || []).find((r) => noteId ? r.config.noteIds?.length === 1 && r.config.noteIds[0] === noteId
    : (r.config.entities?.length === 1 && r.config.entities[0] === entityId && !r.config.places?.length) || (r.config.places?.length === 1 && r.config.places[0] === entityId && !r.config.entities?.length));
  const [busy, setBusy] = useState(false);
  const place = !!type && PLACE_TYPES.has(type);
  const label = mine ? '🔔 Alerts on' : '🔔 Alert me';
  return (
    <button className={`btn sm${mine ? ' primary' : ''}`} disabled={busy} aria-pressed={!!mine}
      title={mine ? 'You get alerts for this. Click to stop (edit rules on the Alerts page).' : noteId ? 'Get alerts about every entity linked in this note' : place ? `Get alerts about anything in ${name}: news, leaders, elections, markets, sanctions, data releases…` : `Get alerts about ${name}`}
      onClick={async () => {
        if (!user) return nav('/login');
        setBusy(true);
        try {
          if (mine) { await api(`/alerts/rules/${mine.id}`, { method: 'DELETE' }); toast(`Alerts off for ${name}`); }
          else {
            const config = noteId ? { noteIds: [noteId] } : place ? { places: [entityId], inside: true } : { entities: [entityId] };
            await api('/alerts/rules', { body: { name: noteId ? `Note: ${name}` : name, config } });
            toast(`Alerts on for ${name} — importance 5+ (change on the Alerts page)`);
          }
          invalidate('/alerts');
        } catch (e: any) { toast(e.message); } finally { setBusy(false); }
      }}>{compact ? (mine ? '🔔' : '🔕') : label}</button>
  );
}

/** Top-bar bell: unread count, latest alerts, browser notifications for new ones. */
export function AlertBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const { data, reload } = useApi<any>(user ? `/alerts/summary?t=${tick}` : null, 0);
  const ref = useRef<HTMLDivElement>(null);
  // Poll every minute while the tab is visible.
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => { if (!document.hidden) setTick((x) => x + 1); }, 60_000);
    return () => clearInterval(t);
  }, [user]);
  // Browser notifications for alerts newer than the last one notified.
  useEffect(() => {
    if (!data?.latest?.length || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    let last = ''; try { last = localStorage.getItem('git.lastNotified') || ''; } catch { /* storage off */ }
    const fresh = data.latest.filter((a: any) => a.createdAt > last && !a.readAt && data.browserRules?.includes(a.ruleId)).slice(0, 3);
    for (const a of fresh) {
      const n = new Notification(`${a.icon || '🔔'} ${a.change.title}`.slice(0, 120), { body: `${a.kindLabel} · importance ${a.change.importance}/10`, tag: a.id });
      n.onclick = () => { window.focus(); window.location.assign('/alerts'); };
    }
    try { localStorage.setItem('git.lastNotified', data.latest[0].createdAt); } catch { /* storage off */ }
  }, [data]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!user) return null;
  const n = data?.unread || 0;
  return (
    <div className="bellWrap" ref={ref}>
      <button className="btn ghost sm bell" aria-label={`Alerts${n ? ` (${n} unread)` : ''}`} aria-expanded={open} title="Alerts" onClick={() => setOpen((o) => !o)}>
        🔔{n > 0 && <span className="bellCount">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <div className="bellMenu" role="menu">
          <div className="row" style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <strong className="small">Alerts</strong><span className="spacer" />
            {n > 0 && <button className="linkish tiny" onClick={async () => { await api('/alerts/read', { body: { all: true } }); reload(); invalidate('/alerts'); }}>Mark all read</button>}
          </div>
          {!data?.latest?.length ? <div className="small muted" style={{ padding: 10 }}>No alerts yet. Use “🔔 Alert me” on a profile, a place on the map or a note.</div> :
            data.latest.map((a: any) => (
              <Link key={a.id} to="/alerts" className={`bellItem${a.readAt ? '' : ' unread'}`} onClick={() => setOpen(false)}>
                <span aria-hidden>{a.icon}</span>
                <span style={{ minWidth: 0 }}><span className="t">{a.change.title}</span><span className="tiny muted">{a.kindLabel} · {a.change.importance}/10 · {ago(a.createdAt)}</span></span>
              </Link>
            ))}
          <div className="row" style={{ padding: '8px 10px', gap: 8 }}>
            <Link className="btn sm primary" to="/alerts" onClick={() => setOpen(false)}>Open inbox</Link>
            {typeof Notification !== 'undefined' && Notification.permission === 'default' && <button className="btn sm" onClick={() => Notification.requestPermission().then(() => reload())}>Enable desktop notifications</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Recent changes for an entity (profiles, map preview). */
export function RecentChanges({ entityId, name, type, limit = 6 }: { entityId: string; name: string; type?: string; limit?: number }) {
  const { data } = useApi<any>(`/changes?entity=${encodeURIComponent(entityId)}&limit=${limit}&min=3`, 120_000);
  const list: any[] = data?.changes || [];
  return (
    <section className="card" id="changes">
      <div className="hd"><h2>Recent changes</h2><div className="spacer" /><AlertButton entityId={entityId} name={name} type={type} compact /></div>
      <div className="bd">
        {!list.length ? <div className="small muted">Nothing new recorded yet. Corroborated news, leadership changes, election results, market moves, sanctions and data releases about {name} appear here.</div> :
          <div className="stack" style={{ gap: 6 }}>{list.map((c) => <ChangeRow key={c.key} c={c} />)}</div>}
      </div>
    </section>
  );
}

export function ChangeRow({ c, actions }: { c: any; actions?: React.ReactNode }) {
  return (
    <div className="changeRow">
      <div className="small"><span aria-hidden>{c.icon}</span> {c.url ? <a href={c.url} target="_blank" rel="noreferrer noopener">{c.title}</a> : c.title}</div>
      <div className="tiny muted"><span className={`imp imp${Math.min(10, Math.max(1, c.importance))}`} title="Importance, 1–10">{c.importance}/10</span> {c.kindLabel || ''} · {fmtDate(c.at)}{c.detail ? ` · ${c.detail}` : ''}</div>
      {c.entities?.length > 0 && <div className="tagRow">{c.entities.slice(0, 5).map((e: any) => <Link key={e.id} className="miniChip" to={`/entity/${encodeURIComponent(e.id)}`}><span aria-hidden>{e.flag || TYPE_ICON[e.type]}</span>{e.name}</Link>)}</div>}
      {actions}
    </div>
  );
}

/** "Add to today's note / to a note" for an alert. */
export function AddToNote({ alertId, changeKey }: { alertId?: string; changeKey?: string }) {
  const { toast } = useApp();
  const notes = useApi<any[]>('/notes?limit=30', 60_000);
  const [pick, setPick] = useState(false);
  const send = async (body: any) => {
    try {
      const r = await api(`/alerts/${alertId || 'change'}/to-note`, { body: { ...body, changeKey } });
      invalidate('/notes'); toast('Added to note'); return r;
    } catch (e: any) { toast(e.message); }
  };
  return (
    <span className="row" style={{ gap: 6, display: 'inline-flex', flexWrap: 'wrap' }}>
      <button className="linkish tiny" onClick={() => send({ daily: localToday() })}>＋ Today’s note</button>
      {!pick ? <button className="linkish tiny" onClick={() => setPick(true)}>＋ Note…</button> : (
        <select className="input" style={{ height: 26, fontSize: 12 }} defaultValue="" onChange={(e) => { if (e.target.value) { void send({ noteId: e.target.value }); setPick(false); } }}>
          <option value="">Choose a note…</option>
          {(notes.data || []).map((n: any) => <option key={n.id} value={n.id}>{n.title || 'Untitled note'}</option>)}
        </select>
      )}
    </span>
  );
}

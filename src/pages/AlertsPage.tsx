import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, invalidate, useApi } from '../api';
import { useApp, useAuth } from '../state';
import { Card, EntityChip, EntityPicker, Loading, Unavailable } from '../components/common';
import { AddToNote, ChangeRow } from '../components/alertBits';
import { ago } from '../format';

const IMPORTANCE_HELP = 'Importance runs from 1 (minor) to 10 (major). Each source sets it the same way everywhere: e.g. a corroborated story 5–8, a national election result 9, a G7 central-bank rate change 9, a US CPI release 9.';

export function AlertsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'rules' ? 'rules' : 'inbox';
  if (user === null) return <div className="page"><Card title="Alerts"><p>Alerts are private to your account. <Link to="/login">Sign in or create an account</Link> to set them up.</p></Card></div>;
  return (
    <div className="page wide">
      <div className="row wrap" style={{ alignItems: 'baseline', gap: 12 }}>
        <h1>Alerts</h1>
        <div className="seg" role="tablist">{[['inbox', 'Inbox'], ['rules', 'Rules']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams(k === 'rules' ? { tab: 'rules' } : {})}>{l}</button>)}</div>
      </div>
      <p className="small muted" style={{ maxWidth: 900, marginTop: 0 }}>The terminal records every notable change it detects — corroborated news, leadership and election changes, conflict escalations, price, currency and yield moves, policy-rate decisions, economic data releases, sanctions designations, tariff actions and summit or vote days. Rules decide which ones reach you: by entity, watchlist, your notes, your positions or a place on the map. {IMPORTANCE_HELP}</p>
      {tab === 'inbox' ? <Inbox /> : <Rules />}
    </div>
  );
}

function Inbox() {
  const [unread, setUnread] = useState(false);
  const [kind, setKind] = useState('');
  const [params] = useSearchParams();
  const place = params.get('place') || '';
  const { data, loading, error, reload } = useApi<any>(`/alerts?limit=200${unread ? '&unread=1' : ''}${kind ? `&kind=${kind}` : ''}${place ? `&place=${encodeURIComponent(place)}` : ''}`, 15_000);
  const { select, setMap } = useApp();
  const nav = useNavigate();
  const markRead = async (ids: string[] | 'all') => { await api('/alerts/read', { body: ids === 'all' ? { all: true } : { ids } }); reload(); invalidate('/alerts/summary'); };
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const a of data?.alerts || []) { const d = a.createdAt.slice(0, 10); (m.get(d) || m.set(d, []).get(d)!).push(a); }
    return [...m];
  }, [data]);
  return (
    <>
      <div className="toolbar">
        <label className="small"><input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} /> Unread only</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind of change" style={{ maxWidth: 260 }}>
          <option value="">All kinds</option>
          {Object.entries<any>(data?.kinds || {}).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        {place && <span className="chip">In this place only <Link to="/alerts" className="x" aria-label="Clear place filter">×</Link></span>}
        <span className="spacer" />
        <button className="btn sm" onClick={() => markRead('all')}>Mark all read</button>
        <button className="btn sm" onClick={() => { setMap({ fill: 'alerts' }); select(null); nav('/'); }} title="Countries shaded by unread alerts">◎ Map my alerts</button>
      </div>
      {loading && !data ? <Loading lines={6} /> : error ? <Unavailable>{error.message}</Unavailable> : !groups.length ? (
        <Card title="Inbox"><div className="small muted">No alerts{unread ? ' unread' : ''} yet. Create a rule on the Rules tab, or press “🔔 Alert me” on a profile, a place on the map or a note. New changes are matched as they arrive; the terminal does not alert you about things that happened before a rule existed.</div></Card>
      ) : groups.map(([day, list]) => (
        <Card key={day} title={new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <div className="stack">{list.map((a: any) => (
            <div key={a.id} className={`alertItem${a.readAt ? '' : ' unread'}`}>
              <ChangeRow c={{ ...a.change, icon: a.icon, kindLabel: a.kindLabel, entities: a.entities }} actions={
                <div className="row wrap tiny" style={{ gap: 10, marginTop: 4 }}>
                  <span className="muted">{ago(a.createdAt)}</span>
                  {!a.readAt && <button className="linkish tiny" onClick={() => markRead([a.id])}>Mark read</button>}
                  <AddToNote alertId={a.id} />
                  {a.places?.[0] && <button className="linkish tiny" onClick={() => { select(a.places[0].id, { fly: true }); nav('/'); }}>Show on map</button>}
                  {a.entities?.[0] && <Link className="tiny" to={`/research?entity=${encodeURIComponent(a.entities[0].id)}`}>Your notes on {a.entities[0].name}</Link>}
                </div>} />
            </div>
          ))}</div>
        </Card>
      ))}
    </>
  );
}

function Rules() {
  const { data, loading, reload } = useApi<any[]>('/alerts/rules', 0);
  const [editing, setEditing] = useState<any | null>(null);
  if (editing) return <RuleEditor rule={editing} onDone={() => { setEditing(null); reload(); invalidate('/alerts'); }} />;
  return (
    <Card title="Your alert rules" actions={<button className="btn sm primary" onClick={() => setEditing({ name: '', config: { inside: true, browser: true } })}>＋ New rule</button>}>
      {loading && !data ? <Loading /> : !data?.length ? <div className="small muted">No rules yet. “🔔 Alert me” on any profile, place or note creates one; or build one here.</div> : (
        <table className="data"><thead><tr><th>Rule</th><th>Watches</th><th>Filter</th><th>Delivery</th><th /></tr></thead>
          <tbody>{data.map((r) => (
            <tr key={r.id} style={r.enabled ? undefined : { opacity: 0.55 }}>
              <td><strong>{r.name}</strong></td>
              <td className="small">{describeWatch(r.config)}</td>
              <td className="small">{r.config.kinds?.length ? `${r.config.kinds.length} kinds` : 'All kinds'} · importance ≥ {r.config.minImportance ?? 5}</td>
              <td className="small">{r.config.browser !== false ? 'Inbox + desktop' : 'Inbox'}{r.config.webhook ? ` + ${r.config.webhook.format}` : ''}</td>
              <td className="r" style={{ whiteSpace: 'nowrap' }}>
                <button className="btn sm" onClick={async () => { await api(`/alerts/rules/${r.id}`, { method: 'PUT', body: { enabled: !r.enabled } }); reload(); }}>{r.enabled ? 'Pause' : 'Resume'}</button>{' '}
                <button className="btn sm" onClick={() => setEditing(r)}>Edit</button>{' '}
                <button className="btn sm danger" onClick={async () => { if (!confirm(`Delete “${r.name}”?`)) return; await api(`/alerts/rules/${r.id}`, { method: 'DELETE' }); reload(); }}>Delete</button>
              </td>
            </tr>
          ))}</tbody></table>
      )}
    </Card>
  );
}

function describeWatch(c: any) {
  const parts: string[] = [];
  if (c.entities?.length) parts.push(`${c.entities.length} entit${c.entities.length > 1 ? 'ies' : 'y'}`);
  if (c.places?.length) parts.push(`${c.places.length} place${c.places.length > 1 ? 's' : ''}${c.inside ? ' (and everything in them)' : ''}`);
  if (c.watchlists?.length) parts.push(`${c.watchlists.length} watchlist${c.watchlists.length > 1 ? 's' : ''}`);
  if (c.allNotes) parts.push('everything in your notes'); else if (c.noteIds?.length) parts.push(`${c.noteIds.length} note${c.noteIds.length > 1 ? 's' : ''}`);
  if (c.positions) parts.push('your open positions');
  return parts.join(' · ') || '—';
}

function RuleEditor({ rule, onDone }: { rule: any; onDone: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(rule.name || '');
  const [c, setC] = useState<any>({ ...rule.config });
  const set = (k: string, v: any) => setC((x: any) => ({ ...x, [k]: v }));
  const wls = useApi<any[]>('/watchlists');
  const notes = useApi<any[]>('/notes');
  const kinds = useApi<any>('/alerts?limit=1');
  const [saving, setSaving] = useState(false);
  const toggleIn = (k: string, id: string) => set(k, (c[k] || []).includes(id) ? c[k].filter((x: string) => x !== id) : [...(c[k] || []), id]);
  const save = async () => {
    setSaving(true);
    try {
      if (rule.id) await api(`/alerts/rules/${rule.id}`, { method: 'PUT', body: { name, config: c } });
      else await api('/alerts/rules', { body: { name: name || 'Alert', config: c } });
      toast('Rule saved'); onDone();
    } catch (e: any) { toast(e.message); } finally { setSaving(false); }
  };
  return (
    <Card title={rule.id ? `Edit “${rule.name}”` : 'New alert rule'} actions={<button className="btn sm ghost" onClick={onDone}>Cancel</button>}>
      <div className="stack" style={{ gap: 14 }}>
        <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Taiwan & chips" /></label>
        <div><div className="lbl small muted">Entities</div>
          <div className="chips" style={{ marginBottom: 6 }}>{(c.entities || []).map((id: string) => <EntityChipById key={id} id={id} onRemove={() => toggleIn('entities', id)} />)}</div>
          <EntityPicker onPick={(e) => toggleIn('entities', e.id)} placeholder="Add a company, person, organisation, commodity…" exclude={c.entities || []} />
        </div>
        <div><div className="lbl small muted">Places (picked on the map or here)</div>
          <div className="chips" style={{ marginBottom: 6 }}>{(c.places || []).map((id: string) => <EntityChipById key={id} id={id} onRemove={() => toggleIn('places', id)} />)}</div>
          <EntityPicker onPick={(e) => toggleIn('places', e.id)} types={['country', 'state', 'city', 'region']} placeholder="Add a country, US state or city…" exclude={c.places || []} />
          <label className="small" style={{ display: 'block', marginTop: 4 }}><input type="checkbox" checked={c.inside !== false} onChange={(e) => set('inside', e.target.checked)} /> Include everything located there (companies headquartered, leaders, elections, conflicts…)</label>
        </div>
        <div className="grid2">
          <div><div className="lbl small muted">Watchlists</div>{!(wls.data || []).length ? <div className="tiny muted">No watchlists yet.</div> : (wls.data || []).map((w) => <label key={w.id} className="small" style={{ display: 'block' }}><input type="checkbox" checked={(c.watchlists || []).includes(w.id)} onChange={() => toggleIn('watchlists', w.id)} /> {w.name} ({w.entityIds.length})</label>)}</div>
          <div><div className="lbl small muted">Your research</div>
            <label className="small" style={{ display: 'block' }}><input type="checkbox" checked={!!c.allNotes} onChange={(e) => set('allNotes', e.target.checked)} /> Everything linked in any of my notes</label>
            <label className="small" style={{ display: 'block' }}><input type="checkbox" checked={!!c.positions} onChange={(e) => set('positions', e.target.checked)} /> My open positions</label>
            {!c.allNotes && <select className="input" multiple value={c.noteIds || []} onChange={(e) => set('noteIds', [...e.target.selectedOptions].map((o) => o.value))} style={{ height: 90, marginTop: 4 }} aria-label="Specific notes">
              {(notes.data || []).map((n: any) => <option key={n.id} value={n.id}>{n.title || 'Untitled note'}</option>)}
            </select>}
          </div>
        </div>
        <div><div className="lbl small muted">Kinds of change (none ticked = all)</div>
          <div className="chips">{Object.entries<any>(kinds.data?.kinds || {}).map(([k, v]) => <label key={k} className="small chipCheck"><input type="checkbox" checked={(c.kinds || []).includes(k)} onChange={() => toggleIn('kinds', k)} /> {v.icon} {v.label}</label>)}</div>
        </div>
        <div className="grid2">
          <label className="field" title={IMPORTANCE_HELP}>Minimum importance: <strong>{c.minImportance ?? 5}/10</strong>
            <input type="range" min={1} max={10} value={c.minImportance ?? 5} onChange={(e) => set('minImportance', Number(e.target.value))} /></label>
          <div className="row wrap" style={{ gap: 8 }}>
            <label className="field" style={{ width: 110 }}>Price move %<input className="input" type="number" min={0} step={0.5} value={c.pricePct ?? 5} onChange={(e) => set('pricePct', e.target.value === '' ? null : Number(e.target.value))} /></label>
            <label className="field" style={{ width: 110 }}>Currency %<input className="input" type="number" min={0} step={0.5} value={c.fxPct ?? 2} onChange={(e) => set('fxPct', e.target.value === '' ? null : Number(e.target.value))} /></label>
            <label className="field" style={{ width: 110 }}>10y yield bp<input className="input" type="number" min={0} step={5} value={c.yieldBp ?? 15} onChange={(e) => set('yieldBp', e.target.value === '' ? null : Number(e.target.value))} /></label>
          </div>
        </div>
        <div><div className="lbl small muted">Delivery</div>
          <label className="small" style={{ display: 'block' }}><input type="checkbox" checked={c.browser !== false} onChange={(e) => set('browser', e.target.checked)} /> Desktop notification (while the terminal is open in a tab)</label>
          <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
            <input className="input" style={{ flex: '1 1 260px' }} placeholder="Optional webhook: https://hooks.slack.com/… · discord.com/api/webhooks/… · ntfy.sh/topic" value={c.webhook?.url || ''} onChange={(e) => set('webhook', e.target.value ? { url: e.target.value, format: c.webhook?.format || 'slack' } : null)} />
            <select className="input" style={{ width: 120 }} value={c.webhook?.format || 'slack'} onChange={(e) => set('webhook', { url: c.webhook?.url || '', format: e.target.value })} aria-label="Webhook format">
              {['slack', 'discord', 'ntfy', 'json'].map((f) => <option key={f}>{f}</option>)}
            </select>
            {c.webhook?.url && <button className="btn sm" onClick={async () => { try { const r = await api('/alerts/rules/test-webhook', { body: c.webhook }); toast(r.ok ? 'Test message sent' : `Webhook answered ${r.status}`); } catch (e: any) { toast(e.message); } }}>Send test</button>}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>Webhooks are sent while the terminal is running, at most once every 30 seconds per rule (up to 10 alerts per message). Only Slack, Discord and ntfy.sh hosts are allowed unless you add others with TERMINAL_WEBHOOK_HOSTS.</div>
        </div>
        <div className="row" style={{ gap: 8 }}><button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save rule'}</button><button className="btn" onClick={onDone}>Cancel</button></div>
      </div>
    </Card>
  );
}

function EntityChipById({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { data } = useApi<any>(`/preview/${encodeURIComponent(id)}`, 3600_000);
  const e = data?.entity || { id, type: id.split(':')[0], name: id };
  return <EntityChip e={e} onRemove={onRemove} />;
}

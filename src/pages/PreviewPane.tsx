import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import { useApp, useAuth } from '../state';
import { Loading, Quality, SourceRef, EntityChip } from '../components/common';
import { RelGroups, WatchButton, NewNoteButton, PositionCompact } from '../components/entityBits';
import { TYPE_ICON, fmtUnit, fmtDate, ago } from '../format';
import { ENTITY_TYPE_LABEL } from '../../shared/types';

export function PreviewPane({ id, data, loading, error, onClose }: { id: string; data: any; loading: boolean; error?: string; onClose: () => void }) {
  const { user } = useAuth();
  const { setMap, compare, toggleCompare, select } = useApp();
  const nav = useNavigate();
  const isIgo = id.startsWith('igo:');
  const members = useApi<any[]>(isIgo ? `/igo/${encodeURIComponent(id)}/members` : null, 600_000);
  const e = data?.entity;
  const profileUrl = `/entity/${encodeURIComponent(id)}`;

  return (
    <aside className="preview" aria-label="Selected entity preview">
      {!e || e.id !== id ? (
        <div style={{ padding: 16 }}>{error ? <div className="err">{error}</div> : <Loading lines={6} />}</div>
      ) : (
        <>
          <div className="head">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tiny muted">{ENTITY_TYPE_LABEL[e.type as keyof typeof ENTITY_TYPE_LABEL]}{e.parentName ? ` · ${e.parentName}` : ''}{loading ? ' · refreshing…' : ''}</div>
                <h2><span aria-hidden>{e.flag || TYPE_ICON[e.type]}</span><Link to={profileUrl} style={{ color: 'inherit' }}>{e.name}</Link></h2>
              </div>
              <button className="btn ghost sm" onClick={onClose} aria-label="Close preview">✕</button>
            </div>
            {e.summary && <p className="small" style={{ color: 'var(--text-2)', margin: '6px 0 8px' }}>{e.summary}{e.summary.length >= 220 ? '…' : ''}</p>}
            {e.depth === 'baseline' && <p className="tiny muted" style={{ margin: '0 0 8px' }}>Baseline profile: geography and live statistics only — no curated political or corporate detail yet.</p>}
            <div className="row wrap">
              <Link className="btn primary sm" to={profileUrl}>Open full profile →</Link>
              <NewNoteButton entityIds={[id]} />
              <WatchButton id={id} />
              {e.type === 'country' && <button className="btn sm" onClick={() => toggleCompare(id)} aria-pressed={compare.includes(id)}>{compare.includes(id) ? '✓ Comparing' : '⇄ Compare'}</button>}
            </div>
          </div>

          {isIgo && (
            <section>
              <h3>Members on the map</h3>
              <button className="btn sm" style={{ marginBottom: 8 }} onClick={() => setMap({ fill: 'igo', igos: [id], igoYear: null })}>Highlight members</button>
              <div className="chips">
                {(members.data || []).filter((m) => m.active).map((m) => (
                  <button key={m.id} className="chip" style={{ cursor: 'pointer' }} title="Select and zoom to this member" onClick={() => select(m.id, { fly: true })}><span className="ico">{m.flag}</span>{m.name}</button>
                ))}
                {members.data && !members.data.some((m) => m.active) && <span className="small muted">Member-by-member list not loaded yet for this organization.</span>}
              </div>
            </section>
          )}

          {data.user?.position && (
            <section><h3>Your position</h3><PositionCompact entityId={id} position={data.user.position} /></section>
          )}

          {data.stats?.length > 0 && (
            <section>
              <h3>Key statistics</h3>
              <div className="stats">
                {data.stats.map((s: any) => (
                  <div className="stat" key={s.code}>
                    <div className="k">{s.label}</div>
                    <div className="v">{s.unavailable ? '—' : fmtUnit(s.value, s.unit)}</div>
                    <div className="m">{s.unavailable ? 'provider unavailable' : s.value == null ? 'no data' : s.period}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6 }}><SourceRef id="world-bank-wdi" /></div>
            </section>
          )}

          {!data.stats?.length && e.facts?.length > 0 && (
            <section>
              <h3>Key facts</h3>
              <div className="stack">
                {e.facts.slice(0, 5).map((f: any) => (
                  <div key={f.label} className="small"><span className="muted">{f.label}: </span>{typeof f.value === 'number' ? fmtUnit(f.value, f.unit) : f.value} <Quality q={f.quality} /></div>
                ))}
              </div>
            </section>
          )}

          {data.events?.length > 0 && (
            <section>
              <h3>Upcoming catalysts</h3>
              {data.events.map((ev: any) => (
                <div key={ev.id} className="small" style={{ marginBottom: 4 }}><span className="badge">{fmtDate(ev.date)}</span> <Link to={`/entity/${encodeURIComponent(ev.id)}`}>{ev.name}</Link></div>
              ))}
            </section>
          )}

          <section>
            <h3>Related</h3>
            {data.relationships?.length ? <RelGroups rels={data.relationships} maxGroups={7} maxPer={10} hide={['borders']} /> : <div className="small muted">No curated relationships yet.</div>}
          </section>

          <section>
            <h3>Your notes {data.user ? `(${data.user.noteCount})` : ''}</h3>
            {!user ? <div className="small muted"><Link to="/login">Sign in</Link> to keep private research notes.</div> :
              data.user.notes.length === 0 ? <div className="small muted">No notes yet. <NewNoteButton entityIds={[id]} label="Write the first one" className="" /></div> :
              data.user.notes.map((n: any) => (
                <Link key={n.id} to={`/research/${n.id}`} className="noteItem">
                  <div className="t">{n.pinned ? '📌 ' : ''}{n.title}</div>
                  <div className="x">{n.excerpt || 'Empty note'}</div>
                  <div className="tiny muted">Updated {ago(n.updatedAt)}</div>
                </Link>
              ))}
          </section>
          {e.type === 'company' && !data.user?.position && user && (
            <section><button className="btn sm" onClick={() => nav(`${profileUrl}#position`)}>Record a position…</button></section>
          )}
          {data.parents?.length > 0 && (
            <section><h3>Located in</h3><div className="chips">{data.parents.map((p: any) => <EntityChip key={p.id} e={p} />)}</div></section>
          )}
        </>
      )}
    </aside>
  );
}

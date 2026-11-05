import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, invalidate, useApi } from '../api';
import { useApp, useAuth } from '../state';
import { Card, EntityChip, Loading, localToday, useDebounced } from '../components/common';
import { NewNoteButton } from '../components/entityBits';
import { NoteGraph, type GraphData } from '../components/NoteGraph';
import { fmtDate, ago } from '../format';

type Group = 'date' | 'entity' | 'tag' | 'category';

function ObsidianStatus() {
  const { toast } = useApp();
  const { data, reload } = useApi<any>('/obsidian', 5_000);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  if (!data.config) return <div className="small muted">Use Obsidian? <Link to="/settings#obsidian">Connect a vault</Link> to sync these notes both ways as Markdown files.</div>;
  const c = data.config; const r = c.lastResult;
  return (
    <div className="row wrap small" style={{ gap: 8 }}>
      <span>{r && !r.ok ? '⚠' : '⟳'} Obsidian vault <strong>{c.vaultName}</strong>{c.autoSync ? ' · auto-sync on' : ''} · {c.lastSync ? `last sync ${ago(c.lastSync)}` : 'not synced yet'}</span>
      {r && !r.ok && <span style={{ color: 'var(--bad)' }}>{r.error}</span>}
      <button className="btn sm" disabled={busy} onClick={async () => {
        setBusy(true);
        try { const res = await api('/obsidian/sync', { method: 'POST' }); toast(res.ok ? `Synced: ${res.exported} sent, ${res.imported + res.created} received` : `Sync failed: ${res.error}`); invalidate('/notes'); reload(); }
        catch (e: any) { toast(e.message); } finally { setBusy(false); }
      }}>{busy ? 'Syncing…' : 'Sync now'}</button>
      <a className="btn sm" href={c.folderUri}>Open in Obsidian</a>
      <Link className="small" to="/settings#obsidian">Settings</Link>
    </div>
  );
}

export function ResearchPage() {
  const { user } = useAuth();
  const { toast } = useApp();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') === 'graph' ? 'graph' : 'list';
  const [showEntities, setShowEntities] = useState(true);
  const graph = useApi<GraphData>(user && view === 'graph' ? '/notes/graph' : null, 5_000);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 200);
  const [group, setGroup] = useState<Group>('date');
  const [tag, setTag] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const entity = sp.get('entity') || '';
  const path = user ? `/notes?${new URLSearchParams({ ...(dq ? { q: dq } : {}), ...(tag ? { tag } : {}), ...(pinnedOnly ? { pinned: '1' } : {}), ...(entity ? { entity } : {}) })}` : null;
  const { data, loading } = useApi<any[]>(path, 5_000);
  // Changes on each note's linked entities since it was last edited ("3 updates").
  const updates = useApi<Record<string, number>>(user ? '/notes-updates' : null, 120_000);
  const tags = useApi<any[]>(user ? '/tags' : null, 10_000);

  const groups = useMemo(() => {
    const out = new Map<string, any[]>();
    const push = (k: string, n: any) => (out.get(k) || out.set(k, []).get(k)!).push(n);
    for (const n of data || []) {
      if (group === 'date') push(n.pinned ? '📌 Pinned' : new Date(n.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }), n);
      else if (group === 'category') push(n.category || 'Uncategorized', n);
      else if (group === 'tag') (n.tags.length ? n.tags : ['(untagged)']).forEach((t: string) => push(t === '(untagged)' ? t : `#${t}`, n));
      else (n.entities?.length ? n.entities : [{ name: '(not linked)' }]).forEach((e: any) => push(e.name, n));
    }
    return [...out.entries()];
  }, [data, group]);

  const graphData = useMemo(() => {
    const d = graph.data; if (!d) return null;
    let nodes = d.nodes; let links = d.links;
    if (tag || pinnedOnly) {
      const keepNotes = new Set(nodes.filter((n) => n.kind === 'note' && (!tag || n.tags?.includes(tag)) && (!pinnedOnly || n.pinned)).map((n) => n.id));
      links = links.filter((l) => keepNotes.has(l.source) && (l.kind === 'entity' || keepNotes.has(l.target)));
      const keep = new Set([...keepNotes, ...links.map((l) => l.target)]);
      nodes = nodes.filter((n) => keep.has(n.id));
    }
    if (!showEntities) { nodes = nodes.filter((n) => n.kind === 'note'); links = links.filter((l) => l.kind === 'note'); }
    return { nodes, links };
  }, [graph.data, tag, pinnedOnly, showEntities]);

  if (user === null) return <div className="page"><Card title="Research workspace"><p>Your notes, theses and attached documents live here. <Link to="/login">Sign in or create an account</Link> to start.</p></Card></div>;

  const openDaily = async () => {
    try { const r = await api('/notes/daily', { body: { date: localToday() } }); invalidate('/notes'); nav(`/research/${r.id}?back=/research`); }
    catch (e: any) { toast(e.message); }
  };

  return (
    <div className="page">
      <div className="row wrap">
        <h1>Research workspace</h1><div className="spacer" />
        <div className="seg" role="tablist" aria-label="View">{(['list', 'graph'] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setSp(v === 'graph' ? { view: 'graph' } : {}, { replace: true })}>{v === 'list' ? '☰ List' : '◉ Graph'}</button>)}</div>
        <a className="btn sm" href="/api/notes/export?format=html">Export HTML</a>
        <a className="btn sm" href="/api/notes/export?format=json">Export JSON</a>
        <button className="btn sm" onClick={openDaily}>📅 Today’s note</button>
        <NewNoteButton entityIds={[]} label="＋ New note" className="btn primary sm" />
      </div>
      <ObsidianStatus />
      {view === 'graph' ? (
        <div className="stack">
          <div className="row wrap">
            <label className="layerItem"><input type="checkbox" checked={showEntities} onChange={(e) => setShowEntities(e.target.checked)} /> Show linked entities</label>
            <select className="input" style={{ width: 160 }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
              <option value="">All tags</option>{(tags.data || []).map((t) => <option key={t.tag} value={t.tag}>#{t.tag} ({t.count})</option>)}
            </select>
            <label className="layerItem"><input type="checkbox" checked={pinnedOnly} onChange={(e) => setPinnedOnly(e.target.checked)} /> Pinned only</label>
            <span className="small muted">Drag to pan, scroll to zoom, drag a dot to move it, click to open. Solid lines link notes; dashed lines link a note to an entity.</span>
          </div>
          {!graphData ? <Loading lines={6} /> : <NoteGraph data={graphData} height={Math.max(420, Math.min(720, window.innerHeight - 260))} emptyText="No notes yet. Link notes with [[ and mention entities to build your graph." />}
        </div>
      ) : <>
      <div className="row wrap">
        <input className="input" style={{ maxWidth: 380 }} placeholder="Full-text search your notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        <span className="small muted">Group by</span>
        <div className="seg">{(['date', 'entity', 'tag', 'category'] as Group[]).map((g) => <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{g}</button>)}</div>
        <select className="input" style={{ width: 160 }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
          <option value="">All tags</option>{(tags.data || []).map((t) => <option key={t.tag} value={t.tag}>#{t.tag} ({t.count})</option>)}
        </select>
        <label className="layerItem"><input type="checkbox" checked={pinnedOnly} onChange={(e) => setPinnedOnly(e.target.checked)} /> Pinned only</label>
      </div>
      {loading && !data ? <Loading lines={6} /> : !data?.length ? (
        <Card><div className="empty">{dq ? `No notes match “${dq}”.` : 'No notes yet. Start one here, or from any map selection or profile with “＋ Note”.'}</div></Card>
      ) : groups.map(([k, list]) => (
        <section key={k} className="stack">
          <h3>{k} <span className="muted">({list.length})</span></h3>
          {list.map((n: any) => (
            <div key={n.id + k} className="card" style={{ padding: '10px 14px' }}>
              <div className="row"><Link to={`/research/${n.id}`}><strong>{n.pinned ? '📌 ' : ''}{n.title || 'Untitled note'}</strong></Link>{n.category && <span className="badge">{n.category}</span>}<div className="spacer" />{updates.data?.[n.id] ? <Link className="badge accent" to={`/research/${n.id}#changes`} title="Changes on this note's linked entities since you last edited it">{updates.data[n.id]} update{updates.data[n.id] > 1 ? 's' : ''}</Link> : null}<span className="tiny muted" title={`Created ${fmtDate(n.createdAt, true)}`} style={{ marginLeft: 6 }}>Updated {ago(n.updatedAt)}</span></div>
              <div className="small" style={{ color: 'var(--text-2)', margin: '4px 0 6px' }}>
                {n.snippet ? n.snippet.split(/(\u0001[^\u0002]*\u0002)/).map((p: string, i: number) => p.startsWith('\u0001') ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>) : (n.bodyText?.slice(0, 220) || <em>Empty</em>)}
              </div>
              <div className="chips">
                {(n.entities || []).map((e: any) => <EntityChip key={e.id} e={e} />)}
                {n.tags.map((t: string) => <span key={t} className="chip">#{t}</span>)}
                {n.attachments?.length > 0 && <span className="chip">📎 {n.attachments.length}</span>}
              </div>
            </div>
          ))}
        </section>
      ))}
      </>}
    </div>
  );
}

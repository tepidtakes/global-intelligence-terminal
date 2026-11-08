import { SUBSCRIPTION_OUTLETS } from '../../shared/newsSources';
import { useSubscriptions, saveSubscriptions } from '../components/newsBits';
import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { api, invalidate, useApi } from '../api';
import { useApp, useAuth, DEFAULT_MAP } from '../state';
import { Card, Loading } from '../components/common';
import { fmtDate, ago } from '../format';
import type { Source } from '../../shared/types';

function ObsidianSettings() {
  const { toast } = useApp();
  const { data, reload } = useApi<any>('/obsidian', 0);
  const [vaultPath, setVaultPath] = useState('');
  const [folder, setFolder] = useState('Terminal');
  const [autoSync, setAutoSync] = useState(true);
  const [entityPages, setEntityPages] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const c = data?.config; if (!c) return;
    setVaultPath(c.vaultPath); setFolder(c.folder); setAutoSync(c.autoSync); setEntityPages(c.entityPages);
  }, [data?.config?.vaultPath, data?.config?.folder]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <Loading lines={3} />;
  const win = data.platform === 'win32', mac = data.platform === 'darwin';
  const sep = win ? '\\' : '/';
  const c = data.config;
  const r = c?.lastResult;
  const save = async () => {
    setBusy(true); setError('');
    try {
      const res = await api('/obsidian', { method: 'PUT', body: { vaultPath, folder, autoSync, entityPages } });
      toast(res.result.ok ? `Connected. ${res.result.exported} notes written to the vault${res.result.created ? `, ${res.result.created} imported` : ''}.` : `Connected, but sync failed: ${res.result.error}`);
      setEditing(false); invalidate('/obsidian'); invalidate('/notes'); reload();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (!data.available) return <p className="small muted">Vault sync reads and writes files on the computer running the terminal, so it's only offered when you open the terminal on that same computer (localhost). You can still download any note as Markdown from the note's page.</p>;

  if (c && !editing) return (
    <div className="stack small">
      <div>Connected to vault <strong>{c.vaultName}</strong> — notes are in <span className="codeish">{c.vaultPath}{sep}{c.folder.split('/').join(sep)}{sep}Notes</span></div>
      {!c.vaultExists && <div style={{ color: 'var(--bad)' }}>⚠ That folder can't be found. Was it moved or renamed, or is the drive disconnected?</div>}
      {c.vaultExists && !c.isObsidianVault && <div style={{ color: 'var(--warn)' }}>This folder isn't an Obsidian vault yet. In Obsidian choose “Open folder as vault” and pick it.</div>}
      <div className="muted">{c.autoSync ? 'Auto-sync on: changes here are written within a couple of seconds; edits in Obsidian come back within about 10 seconds.' : 'Auto-sync off: use “Sync now”.'}{c.entityPages ? ' Entity pages are generated in the Entities folder so backlinks and graph view work in Obsidian.' : ''}</div>
      {r && (
        <div>
          <strong>{r.ok ? '✓ Last sync' : '⚠ Last sync failed'}</strong> {ago(r.at)}
          {r.ok ? <> — {r.exported} sent, {r.imported} updated from Obsidian, {r.created} new from Obsidian{r.renamed ? `, ${r.renamed} renamed` : ''}{r.conflicts ? `, ${r.conflicts} conflicts kept as copies` : ''}{r.trashed ? `, ${r.trashed} moved to Obsidian trash` : ''}.</> : <> — <span style={{ color: 'var(--bad)' }}>{r.error}</span></>}
          {r.messages?.length > 0 && <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{r.messages.slice(0, 6).map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>}
        </div>
      )}
      <div className="row wrap">
        <button className="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); try { const res = await api('/obsidian/sync', { method: 'POST' }); toast(res.ok ? 'Sync complete' : `Sync failed: ${res.error}`); invalidate('/notes'); reload(); } catch (e: any) { toast(e.message); } finally { setBusy(false); } }}>{busy ? 'Syncing…' : 'Sync now'}</button>
        <a className="btn sm" href={c.folderUri}>Open in Obsidian</a>
        <button className="btn sm" onClick={() => setEditing(true)}>Change…</button>
        <button className="btn sm danger" onClick={async () => { if (!confirm('Disconnect this vault? Files already in the vault stay there; nothing is deleted.')) return; await api('/obsidian', { method: 'DELETE' }); invalidate('/obsidian'); reload(); }}>Disconnect</button>
      </div>
    </div>
  );

  return (
    <div className="stack small">
      <p className="muted" style={{ margin: 0 }}>Each note becomes a Markdown file with properties (tags, category, linked entities). Entity mentions and note links become [[wikilinks]]. Edits in either place sync both ways; if a note changes in both at once, nothing is lost — the Obsidian version is kept as a separate copy. Deleting a note here moves its file to Obsidian's trash.</p>
      {data.detected.length > 0 && (
        <div className="field">Vaults found on this computer
          <div className="vaultList">{data.detected.map((v: any) => (
            <button key={v.path} className={`btn sm${vaultPath === v.path ? ' primary' : ''}`} onClick={() => setVaultPath(v.path)}>📁 <strong>{v.name}</strong>&nbsp;<span className="codeish muted">{v.path}</span></button>
          ))}</div>
        </div>
      )}
      <label className="field">Vault folder
        <input className="input codeish" value={vaultPath} onChange={(e) => setVaultPath(e.target.value)} placeholder={win ? 'C:\\Users\\you\\Documents\\My Vault' : mac ? '/Users/you/Documents/My Vault' : '/home/you/Documents/My Vault'} spellCheck={false} />
        <span className="tiny muted">{win ? 'Tip: in File Explorer, Shift + right-click the vault folder → “Copy as path”, then paste here. OneDrive folders work too.' : mac ? 'The folder you opened as a vault in Obsidian. Tip: select it in Finder and press ⌥⌘C to copy its path.' : 'The folder you opened as a vault in Obsidian. Tip: in your file manager select the folder, press Ctrl+C and paste here (a file:// link works too).'}{!data.detected.length && ' No vaults were found automatically.'}</span>
      </label>
      <label className="field">Folder inside the vault
        <input className="input" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Terminal" style={{ maxWidth: 260 }} />
        <span className="tiny muted">Notes go in <span className="codeish">{folder || 'Terminal'}{sep}Notes</span>, entity pages in <span className="codeish">{folder || 'Terminal'}{sep}Entities</span>. Your other vault files are never touched.</span>
      </label>
      <label className="layerItem"><input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} /> Sync automatically</label>
      <label className="layerItem"><input type="checkbox" checked={entityPages} onChange={(e) => setEntityPages(e.target.checked)} /> Create pages for linked entities (countries, companies, people…)</label>
      {error && <div role="alert" style={{ color: 'var(--bad)' }}>{error}</div>}
      <div className="row">
        <button className="btn primary sm" disabled={busy || !vaultPath.trim()} onClick={save}>{busy ? 'Connecting…' : c ? 'Save and sync' : 'Connect and sync'}</button>
        {c && <button className="btn sm" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme, setMap, toast } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => { if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }, [loc.hash]);
  const sources = useApi<Source[]>('/sources', 3600_000);
  const stats = useApi<any>('/stats', 3600_000);
  const reports = useApi<any[]>(user ? '/reports' : null);
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h1>Settings</h1>
      <Card title="Account">
        {user ? <div className="row"><span>Signed in as <strong>{user.email}</strong></span><div className="spacer" /><button className="btn" onClick={async () => { await logout(); nav('/'); }}>Sign out</button></div>
          : <div className="row"><span>You are browsing public data. Sign in to keep notes, positions, watchlists and saved views.</span><div className="spacer" /><Link className="btn primary" to="/login">Sign in</Link></div>}
      </Card>
      <Card title="Appearance & map">
        <div className="stack">
          <div className="row"><span style={{ width: 120 }}>Theme</span><div className="seg">{(['system', 'light', 'dark'] as const).map((t) => <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>{t}</button>)}</div></div>
          <div className="row"><span style={{ width: 120 }}>Map layers</span><button className="btn sm" onClick={() => { setMap(DEFAULT_MAP); toast('Map layers reset'); }}>Reset to default</button></div>
        </div>
      </Card>
      <Card title="News subscriptions" id="subscriptions"><SubscriptionSettings /></Card>
      <Card title="Obsidian" id="obsidian">
        {user ? <ObsidianSettings /> : <span className="small muted"><Link to="/login">Sign in</Link> to sync your notes with an Obsidian vault.</span>}
      </Card>
      <Card title="Keyboard shortcuts">
        <table className="data"><tbody>
          <tr><td><span className="kbd">Ctrl K</span> or <span className="kbd">/</span></td><td>Focus global search</td></tr>
          <tr><td><span className="kbd">↑</span> <span className="kbd">↓</span> <span className="kbd">Enter</span></td><td>Choose a search result and open its profile</td></tr>
          <tr><td><span className="kbd">Shift Enter</span></td><td>Show the search result on the map</td></tr>
          <tr><td><span className="kbd">Esc</span></td><td>Close search or dialogs</td></tr>
          <tr><td><span className="kbd">[[</span></td><td>In a note: link another note or an entity</td></tr>
          <tr><td><span className="kbd">Ctrl</span>-click</td><td>In a note: follow a link (a dashed link creates that note)</td></tr>
          <tr><td><span className="kbd">[ ]</span> + space</td><td>In a note: start a checklist</td></tr>
        </tbody></table>
      </Card>
      <Card title="Data coverage">
        {stats.data && <p className="small">{stats.data.entities.toLocaleString()} entities and {stats.data.relationships.toLocaleString()} relationships loaded: {Object.entries(stats.data.byType).map(([k, v]) => `${v} ${k}`).join(', ')}.</p>}
        <p className="small muted">Every value shows a quality label — <strong>official</strong> (statistical agency / regulator), <strong>delayed</strong> (market data, typically 15+ min), <strong>curated</strong> (compiled from a cited official source with a verification date), <strong>manual</strong> (entered by you). Missing data is shown as “—” or “no data”, never as zero.</p>
        <table className="data"><thead><tr><th>Source</th><th>Publisher</th><th>Licence / terms</th></tr></thead>
          <tbody>{(sources.data || []).map((s) => <tr key={s.id}><td>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name}</td><td>{s.publisher}</td><td className="small">{s.license || '—'}</td></tr>)}</tbody></table>
      </Card>
      {user && (
        <Card title="Your data-quality reports">
          {!reports.data?.length ? <div className="small muted">None submitted. Use “⚑ Report an inconsistency” on any profile.</div> :
            <table className="data"><tbody>{reports.data.map((r) => <tr key={r.id}><td className="tab">{fmtDate(r.created_at)}</td><td><Link to={`/entity/${encodeURIComponent(r.entity_id)}`}>{r.entity_id}</Link></td><td>{r.field}</td><td className="small">{r.message}</td><td>{r.status}</td></tr>)}</tbody></table>}
        </Card>
      )}
    </div>
  );
}

function SubscriptionSettings() {
  const { user } = useAuth();
  const subs = useSubscriptions();
  const toggle = async (id: string) => {
    const next = new Set(subs); if (next.has(id)) next.delete(id); else next.add(id);
    await saveSubscriptions(!!user, [...next]);
  };
  return (
    <div className="stack">
      <div className="small muted">Mark the outlets you pay for. Stories they carried get a direct link that opens on the publisher’s own site, where you are already signed in, and the newsroom can show only those stories. The terminal never asks for or stores publisher passwords, and never downloads article text — headlines and summaries come from each publisher’s official feed.</div>
      <div className="chips">{SUBSCRIPTION_OUTLETS.map((p) => (
        <button key={p.id} className={`btn sm${subs.has(p.id) ? ' primary' : ''}`} aria-pressed={subs.has(p.id)} onClick={() => toggle(p.id)}>{subs.has(p.id) ? '✓ ' : ''}{p.name}</button>
      ))}</div>
    </div>
  );
}

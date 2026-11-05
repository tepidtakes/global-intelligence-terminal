import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent, Extension, type Editor } from '@tiptap/react';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import LinkExt from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { api, invalidate, useApi, ApiError } from '../api';
import { useAuth, useApp } from '../state';
import { EntityChip, EntityPicker, Loading, Modal, Card, useDebounced } from '../components/common';
import { NoteGraph, neighborhood, type GraphData } from '../components/NoteGraph';
import { fmtDate, ago, TYPE_ICON } from '../format';
import type { EntityStub, SearchHit } from '../../shared/types';

const CATEGORIES = ['Investment thesis', 'Political catalyst', 'Country research', 'Company research', 'Commodity research', 'Meeting / call notes', 'Reading notes', 'Daily note', 'Other'];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// Lets the [[ suggestion box take over arrow keys / Enter / Esc while it is open.
// (A function, not a ref object: Tiptap deep-copies plain-object options.)
const KeyHook = Extension.create<{ onKey: (e: KeyboardEvent) => boolean }>({
  name: 'keyHook',
  priority: 1000, // before the built-in Enter / arrow-key handling
  addOptions() { return { onKey: () => false }; },
  addProseMirrorPlugins() { const o = this.options; return [new Plugin({ props: { handleKeyDown: (_v, e) => o.onKey(e) } })]; },
});

// One editor instance per note. A note created here keeps its editor when the URL gains its new id.
let justCreated: string | null = null;
export function NoteRoute() {
  const { noteId } = useParams();
  const loc = useLocation();
  const ident = noteId === 'new' ? `new${loc.search}` : noteId;
  const k = useRef<{ ident?: string; key: string }>({ key: '' });
  if (k.current.ident !== ident) {
    if (!(noteId && noteId === justCreated)) k.current.key = `${ident}:${loc.key}`;
    k.current.ident = ident; justCreated = null;
  }
  return <NotePage key={k.current.key} />;
}

type WikiItem = { kind: 'note'; id: string; title: string; updatedAt?: string } | { kind: 'entity'; hit: SearchHit } | { kind: 'new'; title: string };

export function NotePage() {
  const { noteId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { toast } = useApp();
  const back = sp.get('back');
  const [id, setId] = useState<string | null>(noteId === 'new' ? null : noteId!);
  const [loaded, setLoaded] = useState(noteId === 'new');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState<string>('');
  const [pinned, setPinned] = useState(false);
  const [entities, setEntities] = useState<EntityStub[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ createdAt?: string; updatedAt?: string }>({});
  const [status, setStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [conflict, setConflict] = useState<any | null>(null);
  const [linkModal, setLinkModal] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [wiki, setWiki] = useState<{ q: string; from: number; to: number; x: number; y: number } | null>(null);
  const [wikiIdx, setWikiIdx] = useState(0);
  const dirty = useRef(false);
  const saving = useRef<Promise<any> | null>(null);
  const idRef = useRef(id); idRef.current = id;
  const metaRef = useRef(meta); metaRef.current = meta;
  const keyHandler = useRef<(e: KeyboardEvent) => boolean>(() => false);

  const detectWiki = (ed: Editor) => {
    const { selection } = ed.state;
    if (!selection.empty) return setWiki(null);
    const $from = selection.$from;
    const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 80), $from.parentOffset, undefined, '￼');
    const m = /\[\[([^[\]\n|]{0,60})$/.exec(before);
    if (!m) return setWiki(null);
    const c = ed.view.coordsAtPos(selection.from);
    setWiki((w) => { if (!w || w.q !== m[1]) setWikiIdx(0); return { q: m[1], from: selection.from - m[0].length, to: selection.from, x: Math.min(c.left, window.innerWidth - 316), y: c.bottom + 4 }; });
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      LinkExt.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: null } }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      TaskList, TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Write your research… Type [[ to link another note or an entity. Markdown shortcuts work: ## heading, - list, [] checklist, > quote.' }),
      KeyHook.configure({ onKey: (e) => keyHandler.current(e) }),
    ],
    content: '',
    onUpdate: ({ editor: ed }) => { markDirty(); detectWiki(ed as Editor); },
    onSelectionUpdate: ({ editor: ed }) => detectWiki(ed as Editor),
    onBlur: () => setTimeout(() => setWiki(null), 150),
  });

  const applyNote = useCallback((n: any) => {
    setTitle(n.title); setTags(n.tags); setCategory(n.category || ''); setPinned(n.pinned); setEntities(n.entities || []); setAttachments(n.attachments || []);
    setMeta({ createdAt: n.createdAt, updatedAt: n.updatedAt });
    if (editor) {
      const pos = editor.state.selection.from;
      editor.commands.setContent(n.bodyHtml || '', false);
      if (editor.isFocused) editor.commands.setTextSelection(Math.min(pos, editor.state.doc.content.size - 1));
    }
  }, [editor]);

  // Pre-associate entities passed from a profile or the map; prefill the title from a [[link]].
  useEffect(() => {
    if (noteId !== 'new') return;
    const t = sp.get('title');
    if (t) { setTitle(t.split('/').pop()!.split('#')[0]); markDirty(); }
    const ids = (sp.get('entities') || '').split(',').filter(Boolean);
    if (!ids.length) return;
    Promise.all(ids.map((e) => api(`/preview/${encodeURIComponent(e)}`).then((p) => p.entity).catch(() => null))).then((list) => setEntities(list.filter(Boolean)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load existing note
  useEffect(() => {
    if (!user || noteId === 'new' || !editor) return;
    if (loaded && idRef.current === noteId) return; // we just created this note here; keep the live editor state
    api(`/notes/${noteId}`).then((n) => { applyNote(n); setLoaded(true); setStatus('saved'); })
      .catch((e) => { setStatus('error'); toast(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, noteId, editor]);

  // Pick up edits made in Obsidian while this note is open (only when nothing is unsaved here).
  // Only polls when a vault is connected, and only fetches the note when its stamp changed.
  const vault = useApi<any>(user ? '/obsidian' : null, 60_000);
  const vaultConnected = !!vault.data?.config;
  useEffect(() => {
    if (!id || !user || !vaultConnected) return;
    const t = setInterval(async () => {
      if (dirty.current || saving.current || document.hidden) return;
      try {
        const st = await api<{ extUpdatedAt?: string }>(`/notes/${id}/stamp`);
        if (!(st.extUpdatedAt && metaRef.current.updatedAt && st.extUpdatedAt > metaRef.current.updatedAt)) return;
        const n = await api(`/notes/${id}`);
        if (n.extUpdatedAt && metaRef.current.updatedAt && n.extUpdatedAt > metaRef.current.updatedAt && !dirty.current) {
          applyNote(n); setStatus('saved'); toast('Updated with changes from Obsidian');
          invalidate(`/notes/${id}/links`);
        }
      } catch { /* offline: try again next tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [id, user, vaultConnected, applyNote, toast]);

  const markDirty = () => { dirty.current = true; setStatus('dirty'); };

  const doSave = useCallback(async (force = false) => {
    if (!editor || !dirty.current) return;
    if (saving.current) await saving.current;
    dirty.current = false; setStatus('saving');
    const body = { title, bodyHtml: editor.getHTML(), bodyText: editor.getText(), tags, category: category || null, pinned, entityIds: entities.map((e) => e.id), baseUpdatedAt: metaRef.current.updatedAt, force };
    const p = (idRef.current ? api(`/notes/${idRef.current}`, { method: 'PUT', body }) : api('/notes', { body }));
    saving.current = p;
    try {
      const n = await p;
      if (!idRef.current) { setId(n.id); idRef.current = n.id; justCreated = n.id; nav(`/research/${n.id}${back ? `?back=${encodeURIComponent(back)}` : ''}`, { replace: true }); }
      setMeta({ createdAt: n.createdAt, updatedAt: n.updatedAt }); setEntities(n.entities || entities);
      setStatus(dirty.current ? 'dirty' : 'saved'); setConflict(null);
      invalidate('/notes'); invalidate('/preview'); invalidate('/entity'); invalidate('/search'); invalidate('/obsidian');
    } catch (e: any) {
      dirty.current = true;
      if (e instanceof ApiError && e.status === 409) { setConflict(e.data?.note || {}); setStatus('error'); }
      else { setStatus('error'); toast(`Save failed: ${e.message}`); }
    }
    finally { saving.current = null; }
  }, [editor, title, tags, category, pinned, entities, back, nav, toast]);

  // Autosave: 800 ms after the last change, and when leaving the page. Paused while a conflict is open.
  useEffect(() => { if (status !== 'dirty' || conflict) return; const t = setTimeout(() => doSave(), 800); return () => clearTimeout(t); }, [status, doSave, conflict, title, tags, category, pinned, entities]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, []);
  const latestSave = useRef(doSave); latestSave.current = doSave;
  const conflictRef = useRef(conflict); conflictRef.current = conflict;
  useEffect(() => () => { if (dirty.current && !conflictRef.current) latestSave.current(); }, []);

  // [[ suggestions: your notes, matching entities, or a new note with that title.
  const dq = useDebounced(wiki?.q ?? '', 120);
  const noteHits = useApi<any[]>(wiki && user ? `/notes/titles?q=${encodeURIComponent(dq)}` : null, 3_000);
  const entHits = useApi<any>(wiki && dq.trim().length >= 2 ? `/search?q=${encodeURIComponent(dq)}&limit=6` : null, 30_000);
  const wikiItems: WikiItem[] = useMemo(() => {
    if (!wiki) return [];
    const out: WikiItem[] = (noteHits.data || []).filter((n) => n.id !== id).map((n) => ({ kind: 'note' as const, id: n.id, title: n.title, updatedAt: n.updatedAt }));
    for (const h of (entHits.data?.entities || []) as SearchHit[]) out.push({ kind: 'entity', hit: h });
    const q = dq.trim();
    if (q && !out.some((o) => o.kind === 'note' && o.title.toLowerCase() === q.toLowerCase())) out.push({ kind: 'new', title: q });
    return out;
  }, [wiki, noteHits.data, entHits.data, dq, id]);

  const chooseWiki = (it: WikiItem) => {
    if (!editor || !wiki) return;
    const html = it.kind === 'note' ? `<a href="/research/${it.id}">${esc(it.title)}</a>&nbsp;`
      : it.kind === 'entity' ? `<a href="/entity/${encodeURIComponent(it.hit.id)}">${esc(it.hit.name)}</a>&nbsp;`
        : `<a href="/research/new?title=${encodeURIComponent(it.title)}">${esc(it.title)}</a>&nbsp;`;
    // Also swallow an auto-typed "]]" right after the cursor.
    const after = editor.state.doc.textBetween(wiki.to, Math.min(wiki.to + 2, editor.state.doc.content.size), undefined, '￼');
    editor.chain().focus().deleteRange({ from: wiki.from, to: wiki.to + (after === ']]' ? 2 : 0) }).insertContent(html).run();
    if (it.kind === 'entity') addEntity(it.hit);
    setWiki(null);
  };
  keyHandler.current = (e) => {
    if (!wiki || !wikiItems.length) { if (wiki && e.key === 'Escape') { setWiki(null); return true; } return false; }
    if (e.key === 'ArrowDown') { setWikiIdx((i) => (i + 1) % wikiItems.length); return true; }
    if (e.key === 'ArrowUp') { setWikiIdx((i) => (i - 1 + wikiItems.length) % wikiItems.length); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { chooseWiki(wikiItems[Math.min(wikiIdx, wikiItems.length - 1)]); return true; }
    if (e.key === 'Escape') { setWiki(null); return true; }
    return false;
  };

  if (user === null) return <div className="page"><Card title="Sign in required"><p>Notes are private to your account. <Link to="/login">Sign in or create an account</Link> to start writing.</p></Card></div>;
  if (!loaded || !editor) return <div className="page"><Loading lines={8} /></div>;

  function addEntity(e: EntityStub) { setEntities((cur) => cur.some((x) => x.id === e.id) ? cur : [...cur, e]); markDirty(); }
  const insertEntityLink = (e: EntityStub) => {
    editor.chain().focus().insertContent(`<a href="/entity/${encodeURIComponent(e.id)}">${esc(e.name)}</a> `).run();
    addEntity(e); setLinkModal(false);
  };
  const addTag = (t: string) => { const v = t.trim().replace(/^#/, ''); if (v && !tags.includes(v)) { setTags([...tags, v]); markDirty(); } setTagInput(''); };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!idRef.current) { dirty.current = true; await doSave(); }
    for (const f of Array.from(files)) {
      if (f.size > 25 * 1024 * 1024) { toast(`${f.name} is over 25 MB`); continue; }
      try { await api(`/notes/${idRef.current}/attachments`, { raw: f, headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name) } }); }
      catch (e: any) { toast(`Upload failed: ${e.message}`); }
    }
    const n = await api(`/notes/${idRef.current}`); setAttachments(n.attachments || []); setMeta({ createdAt: n.createdAt, updatedAt: n.updatedAt }); toast('Attachment uploaded');
  };
  const here = `/research/${id || 'new'}`;
  const openLink = async (href: string) => {
    if (dirty.current) await doSave();
    const m = /^\/research\/new\?title=(.*)$/.exec(href);
    if (m) {
      const t = decodeURIComponent(m[1]);
      const r = await api(`/notes/resolve?title=${encodeURIComponent(t.split('/').pop()!.split('#')[0])}`).catch(() => ({ id: null }));
      nav(r.id ? `/research/${r.id}` : `/research/new?title=${encodeURIComponent(t)}&back=${encodeURIComponent(here)}`);
    } else nav(href);
  };

  const statusText = { idle: '', dirty: 'Unsaved changes…', saving: 'Saving…', saved: `Saved${meta.updatedAt ? ' · ' + ago(meta.updatedAt) : ''}`, error: conflict ? 'Not saved — see below' : 'Save failed — will retry on next change' }[status];

  return (
    <div className="editorPage">
      <div className="stack" style={{ minWidth: 0 }}>
        <div className="row wrap">
          {back ? <Link className="btn sm" to={back}>← Back</Link> : <Link className="btn sm" to="/research">← Research workspace</Link>}
          <Link className="btn ghost sm" to="/">◎ Map</Link>
          <div className="spacer" />
          <span className="small muted" aria-live="polite">{statusText}</span>
          <button className="btn sm" onClick={() => { dirty.current = true; doSave(); }} disabled={!!conflict}>Save now</button>
        </div>
        {conflict && (
          <div className="banner" role="alert">
            <span style={{ flex: '1 1 260px' }}><strong>This note changed in Obsidian while you were editing.</strong> Your edits here aren't saved yet.</span>
            <button className="btn sm" onClick={() => { dirty.current = false; applyNote(conflict); setConflict(null); setStatus('saved'); toast('Loaded the Obsidian version'); }}>Use Obsidian version</button>
            <button className="btn sm primary" onClick={() => { dirty.current = true; doSave(true); }}>Keep my version</button>
          </div>
        )}
        <input className="titleInput" placeholder="Untitled note" value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} aria-label="Note title" />
        <div className="card">
          <Toolbar editor={editor} onLinkEntity={() => setLinkModal(true)} />
          <div onClick={(ev) => {
            const a = (ev.target as HTMLElement).closest('a');
            const href = a?.getAttribute('href');
            if (a && href && /^\/(entity|research)\//.test(href) && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); openLink(href); }
          }}>
            <EditorContent editor={editor} />
          </div>
        </div>
        <div className="tiny muted">Type <span className="kbd">[[</span> to link a note or entity. <span className="kbd">Ctrl</span>/<span className="kbd">⌘</span>-click a link to follow it; a dashed link creates that note. Autosaves as you type.</div>
        {wiki && (
          <div className="wikiPop" style={{ left: wiki.x, top: Math.min(wiki.y, window.innerHeight - 330) }} role="listbox" aria-label="Link suggestions" onMouseDown={(e) => e.preventDefault()}>
            {!wikiItems.length && <div className="foot">{noteHits.loading ? 'Searching…' : 'Type a note title or an entity name'}</div>}
            {wikiItems.map((it, i) => {
              const head = i === 0 || wikiItems[i - 1].kind !== it.kind;
              return (
                <div key={i}>
                  {head && <div className="grp">{it.kind === 'note' ? 'Notes' : it.kind === 'entity' ? 'Entities' : 'New'}</div>}
                  <div className={`item${i === wikiIdx ? ' on' : ''}`} role="option" aria-selected={i === wikiIdx} onMouseEnter={() => setWikiIdx(i)} onClick={() => chooseWiki(it)}>
                    {it.kind === 'note' && <><span>📝</span><span>{it.title}</span>{it.updatedAt && <span className="sub">{ago(it.updatedAt)}</span>}</>}
                    {it.kind === 'entity' && <><span>{it.hit.flag || TYPE_ICON[it.hit.type] || '•'}</span><span>{it.hit.name}</span><span className="sub">{it.hit.type}{it.hit.parentName ? ` · ${it.hit.parentName}` : ''}</span></>}
                    {it.kind === 'new' && <><span>＋</span><span>Link to new note “{it.title}”</span></>}
                  </div>
                </div>
              );
            })}
            <div className="foot">↑↓ choose · Enter link · Esc close</div>
          </div>
        )}
      </div>

      <div className="stack">
        <Card title="Linked entities">
          <div className="small muted" style={{ marginBottom: 6 }}>This note appears in the research section of every linked profile.</div>
          <div className="chips" style={{ marginBottom: 8 }}>
            {entities.map((e) => <EntityChip key={e.id} e={e} onRemove={() => { setEntities(entities.filter((x) => x.id !== e.id)); markDirty(); }} />)}
            {!entities.length && <span className="small muted">None yet</span>}
          </div>
          <EntityPicker onPick={addEntity} placeholder="Link a country, IGO, company…" exclude={entities.map((e) => e.id)} />
        </Card>
        {id && <LinksCard id={id} />}
        {id && <LocalGraphCard id={id} />}
        <Card title="Organize">
          <div className="stack">
            <label className="field">Category
              <select className="input" value={category} onChange={(e) => { setCategory(e.target.value); markDirty(); }}>
                <option value="">— none —</option>{[...new Set([...CATEGORIES, ...(category ? [category] : [])])].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <div className="field">Tags
              <div className="chips">{tags.map((t) => <span key={t} className="chip">#{t}<span className="x" role="button" aria-label={`Remove tag ${t}`} onClick={() => { setTags(tags.filter((x) => x !== t)); markDirty(); }}>×</span></span>)}</div>
              <input className="input" placeholder="Add tag + Enter" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } }} onBlur={() => tagInput && addTag(tagInput)} />
            </div>
            <label className="layerItem"><input type="checkbox" checked={pinned} onChange={(e) => { setPinned(e.target.checked); markDirty(); }} /> 📌 Pin this note</label>
          </div>
        </Card>
        <ObsidianCard id={id} />
        <Card title="Attachments">
          <div className="stack small">
            {attachments.map((a) => (
              <div key={a.id} className="row"><a href={`/api/attachments/${a.id}`} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {a.filename}</a><span className="tiny muted">{(a.size / 1024).toFixed(0)} KB</span>
                <button className="btn ghost sm" aria-label={`Delete ${a.filename}`} onClick={async () => { if (confirm(`Delete ${a.filename}?`)) { await api(`/attachments/${a.id}`, { method: 'DELETE' }); setAttachments(attachments.filter((x) => x.id !== a.id)); } }}>✕</button></div>
            ))}
            <label className="btn sm" style={{ justifyContent: 'center' }}>＋ Upload document<input type="file" multiple hidden onChange={(e) => upload(e.target.files)} /></label>
            <div className="tiny muted">PDFs, research reports, spreadsheets — up to 25 MB each. Stored privately with your account.</div>
          </div>
        </Card>
        <Card title="Details">
          <div className="small stack">
            <div><span className="muted">Created:</span> {fmtDate(meta.createdAt, true)}</div>
            <div><span className="muted">Modified:</span> {fmtDate(meta.updatedAt, true)}</div>
            {id && <button className="btn sm danger" onClick={async () => { if (confirm('Delete this note? If it is synced to Obsidian, its file moves to Obsidian’s trash.')) { await api(`/notes/${id}`, { method: 'DELETE' }); dirty.current = false; invalidate('/notes'); invalidate('/preview'); invalidate('/entity'); nav(back || '/research'); } }}>Delete note</button>}
          </div>
        </Card>
      </div>
      {linkModal && (
        <Modal title="Link an entity" onClose={() => setLinkModal(false)}>
          <div className="small muted">Inserts a clickable mention and links this note to the entity.</div>
          <EntityPicker onPick={insertEntityLink} autoFocus />
        </Modal>
      )}
    </div>
  );
}

function LinksCard({ id }: { id: string }) {
  const { data } = useApi<any>(`/notes/${id}/links`, 5_000);
  const Row = ({ n, text }: { n: any; text?: React.ReactNode }) => (
    <div><Link to={`/research/${n.id}`}>{n.title}</Link>{text && <div className="ex">{text}</div>}</div>
  );
  const snip = (s: string) => s.split(/(\u0001[^\u0002]*\u0002)/).map((p, i) => p.startsWith('\u0001') ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>);
  return (
    <Card title={`Backlinks${data ? ` (${data.backlinks.length})` : ''}`}>
      {!data ? <Loading lines={2} /> : (
        <div className="stack small">
          <div className="linkList">
            {data.backlinks.length ? data.backlinks.map((n: any) => <Row key={n.id} n={n} text={n.excerpt} />) : <span className="muted">No notes link here yet. Type [[ in another note to link to this one.</span>}
          </div>
          {data.outgoing.length > 0 && <><div className="tiny muted" style={{ marginTop: 4 }}>OUTGOING LINKS</div><div className="linkList">{data.outgoing.map((n: any) => <Row key={n.id} n={n} />)}</div></>}
          {data.unlinked.length > 0 && <><div className="tiny muted" style={{ marginTop: 4 }}>UNLINKED MENTIONS</div><div className="linkList">{data.unlinked.map((n: any) => <Row key={n.id} n={n} text={snip(n.snippet)} />)}</div></>}
        </div>
      )}
    </Card>
  );
}

function LocalGraphCard({ id }: { id: string }) {
  const { data } = useApi<GraphData>('/notes/graph', 5_000);
  const local = useMemo(() => data ? neighborhood(data, id, 2) : null, [data, id]);
  return (
    <Card title="Local graph" actions={<Link className="small" to="/research?view=graph">Full graph →</Link>}>
      {!local ? <Loading lines={3} /> : <NoteGraph data={local} height={220} focusId={id} emptyText="Link entities or other notes to see connections." />}
    </Card>
  );
}

function ObsidianCard({ id }: { id: string | null }) {
  const { toast } = useApp();
  const { data, reload } = useApi<any>(id ? `/obsidian/notes/${id}` : '/obsidian', 4_000);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { const r = await api(`/obsidian/notes/${id}/send`, { method: 'POST' }); toast(r.ok ? 'Sent to Obsidian' : `Sync problem: ${r.error}`); invalidate('/obsidian'); reload(); }
    catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const connected = id ? data?.connected : !!data?.config;
  return (
    <Card title="Obsidian">
      <div className="stack small">
        {!data ? <Loading lines={1} /> : !connected ? (
          <span className="muted">Mirror your notes into an Obsidian vault as Markdown, with two-way sync. <Link to="/settings#obsidian">Connect a vault</Link></span>
        ) : !id ? <span className="muted">Syncs to Obsidian once saved.</span>
          : data.detached ? <><span>The file for this note was deleted in Obsidian. The note is still here.</span><button className="btn sm" disabled={busy} onClick={send}>Send to Obsidian again</button></>
            : data.synced ? <>
              <span>In vault <strong>{data.vaultName}</strong>:</span>
              <span className="codeish">{data.relPath}</span>
              <div className="row wrap"><a className="btn sm primary" href={data.uri}>Open in Obsidian</a><button className="btn sm" disabled={busy} onClick={send}>Sync now</button></div>
            </> : <><span className="muted">Waiting for the next sync…</span><button className="btn sm" disabled={busy} onClick={send}>Send now</button></>}
        {id && <a className="small" href={`/api/notes/${id}/markdown`}>Download as Markdown (.md)</a>}
      </div>
    </Card>
  );
}

function Toolbar({ editor, onLinkEntity }: { editor: Editor; onLinkEntity: () => void }) {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); editor.on('transaction', f); return () => { editor.off('transaction', f); }; }, [editor]);
  const B = ({ on, label, title, run }: { on?: boolean; label: string; title: string; run: () => void }) => (
    <button type="button" className={on ? 'on' : ''} title={title} aria-label={title} aria-pressed={on} onMouseDown={(e) => { e.preventDefault(); run(); }}>{label}</button>
  );
  const c = () => editor.chain().focus();
  const inTable = editor.isActive('table');
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <B label="H2" title="Heading" on={editor.isActive('heading', { level: 2 })} run={() => c().toggleHeading({ level: 2 }).run()} />
      <B label="H3" title="Subheading" on={editor.isActive('heading', { level: 3 })} run={() => c().toggleHeading({ level: 3 }).run()} />
      <B label="B" title="Bold" on={editor.isActive('bold')} run={() => c().toggleBold().run()} />
      <B label="I" title="Italic" on={editor.isActive('italic')} run={() => c().toggleItalic().run()} />
      <span className="sep" />
      <B label="• List" title="Bulleted list" on={editor.isActive('bulletList')} run={() => c().toggleBulletList().run()} />
      <B label="1. List" title="Numbered list" on={editor.isActive('orderedList')} run={() => c().toggleOrderedList().run()} />
      <B label="☑ Tasks" title="Checklist" on={editor.isActive('taskList')} run={() => c().toggleTaskList().run()} />
      <B label="❝" title="Quote" on={editor.isActive('blockquote')} run={() => c().toggleBlockquote().run()} />
      <span className="sep" />
      {!inTable ? <B label="⊞ Table" title="Insert table" run={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} /> : <>
        <B label="+Row" title="Add row" run={() => c().addRowAfter().run()} />
        <B label="+Col" title="Add column" run={() => c().addColumnAfter().run()} />
        <B label="−Row" title="Delete row" run={() => c().deleteRow().run()} />
        <B label="✕Table" title="Delete table" run={() => c().deleteTable().run()} />
      </>}
      <span className="sep" />
      <B label="🔗 Link" title="Web link" on={editor.isActive('link')} run={() => { const url = prompt('Link URL (https://…)', editor.getAttributes('link').href || 'https://'); if (url === null) return; if (!url || url === 'https://') c().unsetLink().run(); else c().extendMarkRange('link').setLink({ href: url }).run(); }} />
      <B label="[[ ]] Link note" title="Link another note or an entity (or type [[)" run={() => c().insertContent('[[').run()} />
      <B label="@ Link entity" title="Mention and link an entity" run={onLinkEntity} />
      <span className="sep" />
      <B label="↶" title="Undo" run={() => c().undo().run()} />
      <B label="↷" title="Redo" run={() => c().redo().run()} />
    </div>
  );
}

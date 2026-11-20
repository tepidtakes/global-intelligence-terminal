// Search everything (/find?q=…): where the command line sends words that are neither a command nor
// one clear entity. Three groups: functions (by code, title or description), entities, your notes.
import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ENTITY_TYPE_LABEL } from '../../shared/types';
import { functionsFor } from '../../shared/functions';
import { TYPE_ICON, fmtDate } from '../format';
import { useApp, useAuth } from '../state';
import { asLoaded, matchFunctions, nearCodes, useRunCommand } from '../command';
import { Card, PositionBadge, useSearch } from '../components/common';
import { PLACEHOLDER } from '../components/CommandLine';

const clean = (s: string) => s.replace(/[\u0001\u0002]/g, '');

export function FindPage() {
  const [sp] = useSearchParams();
  const q = (sp.get('q') || '').trim();
  const nav = useNavigate();
  const run = useRunCommand();
  const { load } = useApp();
  const { user } = useAuth();
  const { entities, notes, loading } = useSearch(q, undefined, 40);
  useEffect(() => { document.title = `${q ? `Find “${q}”` : 'Find'} — Global Intelligence Terminal`; return () => { document.title = 'Global Intelligence Terminal'; }; }, [q]);

  // Functions: the whole phrase against code, title and description, then each word against the codes.
  const fns = [...new Set([...matchFunctions(q, 12), ...q.split(/\s+/).filter((w) => w.length >= 2).flatMap((w) => matchFunctions(w, 4).filter((f) => [f.code, ...(f.aliases || [])].some((c) => c.startsWith(w.toUpperCase()))))])];
  const words = q.split(/\s+/).filter(Boolean);
  const near = words.length === 1 && !fns.length ? nearCodes(q) : [];
  const open = (e: (typeof entities)[number]) => { load(asLoaded({ ...e, iso3: e.type === 'country' ? e.id.split(':')[1] : undefined })); nav(`/entity/${encodeURIComponent(e.id)}`); };

  if (!q) return <div className="page findPage"><h1>Search everything</h1><Card><p style={{ margin: 0 }}>Type words in the command line and press Enter: functions, entities and your notes that match are listed here. A command looks like <code className="typed">{PLACEHOLDER}</code>. <Link to="/help">Every function</Link></p></Card></div>;
  const nothing = !loading && !fns.length && !entities.length && !notes.length;
  return (
    <div className="page findPage">
      <div><h1>Results for “{q}”</h1>
        <div className="muted small" role="status">{loading ? 'Searching…' : nothing ? 'Nothing matches.' : `${fns.length} ${fns.length === 1 ? 'function' : 'functions'}, ${entities.length}${entities.length === 40 ? '+' : ''} ${entities.length === 1 ? 'entity' : 'entities'}${user ? `, ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : ''}`}</div></div>
      {nothing && <Card><p style={{ margin: 0 }}>No function, entity or note matches “{q}”. Try another spelling, an abbreviation (KSA, NATO), a ticker (AAPL) or a country code (DEU).{near.length ? <> Function codes close to it: {near.map((c) => <button key={c} type="button" className="cmdEx" style={{ marginLeft: 6 }} onClick={() => void run(c)}>{c}</button>)}</> : null} <Link to="/help">Every function</Link></p></Card>}
      {fns.length > 0 && (
        <Card title={`Functions (${fns.length})`}>
          <table className="data fnTable"><tbody>{fns.map((f) => (
            <tr key={f.code} onClick={() => void run(f.on && f.need !== 'optional' ? f.examples[0] : f.code)} title={`Run ${f.on && f.need !== 'optional' ? f.examples[0] : f.code}`}>
              <td><Link className="fnCode" to={`/help?fn=${f.code}`} onClick={(e) => e.stopPropagation()} title={`About ${f.code}`}>{f.code}</Link>{f.on && f.need !== 'optional' && <span title="Needs an entity"> *</span>}</td>
              <td className="ttl">{f.title}</td><td>{f.about}</td>
              <td><button type="button" className="cmdEx" onClick={(e) => { e.stopPropagation(); void run(f.examples[0]); }} title={`Run ${f.examples[0]}`}>{f.examples[0]}</button></td>
            </tr>
          ))}</tbody></table>
        </Card>
      )}
      {(entities.length > 0 || loading) && (
        <Card title={`Entities (${entities.length}${entities.length === 40 ? '+' : ''})`}>
          {!entities.length ? <div className="empty">Searching…</div> : (
            <table className="data findTable"><thead><tr><th>Entity</th><th>Kind</th><th>About</th><th>Run on it</th></tr></thead>
              <tbody>{entities.map((e) => (
                <tr key={e.id} onClick={() => open(e)}>
                  <td className="ttl"><span aria-hidden>{e.flag || TYPE_ICON[e.type]}</span> <Link to={`/entity/${encodeURIComponent(e.id)}`} onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); open(e); }}>{e.name}</Link>{e.matched && <span className="tiny muted"> · matched “{e.matched}”</span>} {e.position && <PositionBadge p={e.position} />}</td>
                  <td>{ENTITY_TYPE_LABEL[e.type]}{e.parentName ? <span className="muted"> · {e.parentName}</span> : null}</td>
                  <td className="about">{e.summary}</td>
                  <td className="fnsFor">{functionsFor(e.type).slice(0, 5).map((f) => <button key={f.code} type="button" className="cmdEx" title={`${f.title} for ${e.name}`} onClick={(ev) => { ev.stopPropagation(); void run(`${e.type === 'country' ? e.id.split(':')[1] : e.name} ${f.code}`); }}>{f.code}</button>)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}
      {user ? notes.length > 0 && (
        <Card title={`Your notes (${notes.length})`}>
          <table className="data"><tbody>{notes.map((n) => (
            <tr key={n.id}><td className="ttl"><span aria-hidden>{TYPE_ICON.note}</span> <Link to={`/research/${n.id}`}>{n.title}</Link></td><td className="about">{clean(n.snippet)}</td><td className="r tiny muted">{fmtDate(n.updatedAt)}</td></tr>
          ))}</tbody></table>
        </Card>
      ) : <div className="tiny muted">Sign in to search your notes as well.</div>}
    </div>
  );
}

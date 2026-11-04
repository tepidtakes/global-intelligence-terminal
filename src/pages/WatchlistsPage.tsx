import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, invalidate, useApi } from '../api';
import { useAuth } from '../state';
import { Card, EntityPicker, Loading } from '../components/common';
import { money, pct, TYPE_ICON } from '../format';
import { ENTITY_TYPE_LABEL } from '../../shared/types';
import type { Quote } from '../../shared/types';

function QuoteCell({ id }: { id: string }) {
  const q = useApi<Quote>(`/quote/${encodeURIComponent(id)}?range=1mo`, 300_000);
  if (q.error) return <span className="muted small">no price feed</span>;
  if (!q.data) return <span className="muted">…</span>;
  return <span className="num">{money(q.data.price, q.data.currency)} <span className={q.data.changePct! >= 0 ? 'good' : 'bad'}>{pct(q.data.changePct)}</span></span>;
}

export function WatchlistsPage() {
  const { user } = useAuth();
  const { data, loading } = useApi<any[]>(user ? '/watchlists' : null, 5_000);
  const [active, setActive] = useState<string | null>(null);
  const wl = (data || []).find((w) => w.id === active) || data?.[0];
  const save = async (entityIds: string[], name?: string) => { await api(`/watchlists/${wl.id}`, { method: 'PUT', body: { entityIds, name } }); invalidate('/watchlists'); };

  if (user === null) return <div className="page"><Card title="Watchlists"><p><Link to="/login">Sign in</Link> to build watchlists of countries, companies, commodities and people.</p></Card></div>;
  return (
    <div className="page">
      <div className="row wrap"><h1>Watchlists</h1><div className="spacer" />
        <button className="btn sm" onClick={async () => { const name = prompt('Watchlist name'); if (name) { const w = await api('/watchlists', { body: { name } }); invalidate('/watchlists'); setActive(w.id); } }}>＋ New watchlist</button></div>
      {loading && !data ? <Loading /> : (
        <>
          <div className="seg">{(data || []).map((w) => <button key={w.id} className={wl?.id === w.id ? 'on' : ''} onClick={() => setActive(w.id)}>{w.name} ({w.entityIds.length})</button>)}</div>
          {wl && (
            <Card title={wl.name} actions={<>
              <button className="btn ghost sm" onClick={() => { const n = prompt('Rename watchlist', wl.name); if (n) save(wl.entityIds, n); }}>Rename</button>
              {(data || []).length > 1 && <button className="btn ghost sm danger" onClick={async () => { if (confirm(`Delete “${wl.name}”?`)) { await api(`/watchlists/${wl.id}`, { method: 'DELETE' }); invalidate('/watchlists'); setActive(null); } }}>Delete</button>}
            </>}>
              <div style={{ maxWidth: 480, marginBottom: 10 }}><EntityPicker onPick={(e) => save([...wl.entityIds, e.id])} exclude={wl.entityIds} placeholder="Add a country, company, commodity, person…" /></div>
              {!wl.entities.length ? <div className="empty">Empty watchlist. Add entities above or with ☆ Watch on any profile.</div> : (
                <table className="data">
                  <thead><tr><th>Name</th><th>Type</th><th>Latest price (delayed)</th><th></th></tr></thead>
                  <tbody>{wl.entities.map((e: any) => (
                    <tr key={e.id}>
                      <td><Link to={`/entity/${encodeURIComponent(e.id)}`}>{e.flag || TYPE_ICON[e.type]} <strong>{e.name}</strong></Link>{e.parentName && <span className="tiny muted"> · {e.parentName}</span>}</td>
                      <td>{ENTITY_TYPE_LABEL[e.type as keyof typeof ENTITY_TYPE_LABEL]}</td>
                      <td>{e.type === 'company' || e.type === 'commodity' ? <QuoteCell id={e.id} /> : <span className="muted">—</span>}</td>
                      <td className="r"><button className="btn ghost sm" aria-label={`Remove ${e.name}`} onClick={() => save(wl.entityIds.filter((x: string) => x !== e.id))}>✕</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

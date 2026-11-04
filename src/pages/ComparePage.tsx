import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { useApp } from '../state';
import { Card, EntityChip, EntityPicker, Loading, SourceRef } from '../components/common';
import { Sparkline } from '../components/Charts';
import { fmtUnit, TYPE_ICON } from '../format';
import type { EntityStub, Indicator, RelView } from '../../shared/types';

const ROWS = ['SP.POP.TOTL', 'NY.GDP.MKTP.CD', 'NY.GDP.MKTP.PP.CD', 'NY.GDP.PCAP.CD', 'NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'GC.DOD.TOTL.GD.ZS', 'BN.CAB.XOKA.GD.ZS', 'NE.EXP.GNFS.CD', 'BX.KLT.DINV.WD.GD.ZS', 'TX.VAL.FUEL.ZS.UN'];

export function ComparePage() {
  const { compare, toggleCompare, clearCompare } = useApp();
  const [sp] = useSearchParams();
  const [macro, setMacro] = useState<Record<string, Indicator[]>>({});
  const countries = compare.filter((c) => c.startsWith('country:'));
  const stubs = useApi<any[]>(countries.length ? `/entities?type=country` : null, 3600_000);
  useEffect(() => {
    for (const id of countries) if (!macro[id]) api(`/macro/${id.split(':')[1]}`).then((r) => setMacro((m) => ({ ...m, [id]: r.indicators }))).catch(() => setMacro((m) => ({ ...m, [id]: [] })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries.join(',')]);
  const nameOf = (id: string) => stubs.data?.find((s) => s.id === id);

  return (
    <div className="page">
      <h1>Compare & connect</h1>
      <Card title="Country comparison" actions={countries.length > 0 && <button className="btn ghost sm" onClick={clearCompare}>Clear</button>}>
        <div style={{ maxWidth: 420, marginBottom: 10 }}><EntityPicker types={['country']} onPick={(e) => toggleCompare(e.id)} exclude={countries} placeholder="Add a country to compare (up to 6)…" /></div>
        {!countries.length ? <div className="empty">Add countries here, or with “⇄ Compare” on the map preview or a profile.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead><tr><th>Indicator</th>{countries.map((c) => <th key={c} className="r">{nameOf(c)?.flag} <Link to={`/entity/${encodeURIComponent(c)}`}>{nameOf(c)?.name || c}</Link> <button className="btn ghost sm" aria-label="Remove" onClick={() => toggleCompare(c)}>✕</button></th>)}</tr></thead>
              <tbody>{ROWS.map((code) => {
                const label = Object.values(macro).flat().find((i) => i.code === code)?.label || code;
                return (
                  <tr key={code}><td>{label}</td>{countries.map((c) => {
                    const ind = macro[c]?.find((i) => i.code === code);
                    return <td key={c} className="r">{!macro[c] ? <Loading lines={1} /> : ind?.latest ? <><div>{fmtUnit(ind.latest.value, ind.unit)} <span className="tiny muted">{ind.latest.period}</span></div><Sparkline values={ind.series.map((p) => p.value)} width={80} height={18} /></> : <span className="muted">no data</span>}</td>;
                  })}</tr>
                );
              })}</tbody>
            </table>
            <SourceRef id="world-bank-wdi" /> <span className="tiny muted">· latest available year per country — periods can differ, check before comparing</span>
          </div>
        )}
      </Card>
      <ConnectionExplorer initialA={sp.get('a')} />
    </div>
  );
}

function ConnectionExplorer({ initialA }: { initialA: string | null }) {
  const [a, setA] = useState<EntityStub | null>(null);
  const [b, setB] = useState<EntityStub | null>(null);
  const [paths, setPaths] = useState<RelView[][] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (initialA) api(`/preview/${encodeURIComponent(initialA)}`).then((p) => setA(p.entity)).catch(() => {}); }, [initialA]);
  useEffect(() => {
    if (!a || !b) { setPaths(null); return; }
    setBusy(true);
    api(`/connections?a=${encodeURIComponent(a.id)}&b=${encodeURIComponent(b.id)}`).then(setPaths).finally(() => setBusy(false));
  }, [a?.id, b?.id]);
  return (
    <Card title="Relationship explorer">
      <div className="small muted" style={{ marginBottom: 8 }}>Find how two entities are connected through memberships, leadership, headquarters, trade and production links (up to three hops).</div>
      <div className="grid2">
        <div>{a ? <EntityChip e={a} onRemove={() => setA(null)} /> : <EntityPicker onPick={setA} placeholder="From… (e.g. Saudi Arabia)" />}</div>
        <div>{b ? <EntityChip e={b} onRemove={() => setB(null)} /> : <EntityPicker onPick={setB} placeholder="To… (e.g. ExxonMobil)" />}</div>
      </div>
      <div style={{ marginTop: 12 }}>
        {busy ? <Loading /> : paths && (paths.length === 0 ? <div className="empty">No connection within three hops in the current dataset.</div> : paths.map((p, i) => (
          <div key={i} className="row wrap" style={{ marginBottom: 8, gap: 6 }}>
            <EntityChip e={a!} />
            {p.map((step, j) => <span key={j} className="row" style={{ gap: 6 }}><span className="tiny muted">— {step.label.toLowerCase()} →</span><Link className="chip" to={`/entity/${encodeURIComponent(step.other.id)}`}><span className="ico">{step.other.flag || TYPE_ICON[step.other.type]}</span>{step.other.name}</Link></span>)}
          </div>
        )))}
      </div>
    </Card>
  );
}

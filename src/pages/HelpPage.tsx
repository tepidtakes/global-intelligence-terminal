// Help, generated from the function registry (shared/functions.ts) and the key registry
// (src/keys.ts): nothing on this page is a list kept by hand.
//   /help            how to type a command, then every function by area
//   /help?fn=CODE    one function: what it shows, parameters, examples, what to run next
//   /help?view=keys  the keyboard
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FUNCTIONS, FN_GROUPS, fnByCode, type FnDef } from '../../shared/functions';
import { ENTITY_TYPE_LABEL } from '../../shared/types';
import { KEYS, KEY_AREAS, type KeyDef } from '../keys';
import { nearCodes, useRunCommand } from '../command';
import { useApp } from '../state';
import { Card } from '../components/common';

const needsEntity = (f: FnDef) => !!f.on && f.need !== 'optional';
const ALL_TYPES = Object.keys(ENTITY_TYPE_LABEL).length;
const worksOn = (f: FnDef) => (!f.on ? 'Needs no entity' : f.on.length >= 12 || f.on.length >= ALL_TYPES ? 'Any entity' : f.on.map((t) => ENTITY_TYPE_LABEL[t] || t).join(', '));
/** The first example of each kind of command, taken from the registry. */
const exampleWhere = (test: (f: FnDef, ex: string) => boolean) => { for (const f of FUNCTIONS) for (const ex of f.examples) if (test(f, ex)) return ex; return ''; };

function Run({ command, children, className }: { command: string; children?: React.ReactNode; className?: string }) {
  const run = useRunCommand();
  return <button type="button" className={`cmdEx${className ? ` ${className}` : ''}`} onClick={(e) => { e.stopPropagation(); void run(command); }} title={`Run ${command}`}>{children || command}</button>;
}
const Tabs = ({ view }: { view: 'functions' | 'keys' }) => (
  <div className="seg" role="tablist" aria-label="Help sections">
    <Link role="tab" aria-selected={view === 'functions'} className={view === 'functions' ? 'on' : ''} to="/help">Functions</Link>
    <Link role="tab" aria-selected={view === 'keys'} className={view === 'keys' ? 'on' : ''} to="/help?view=keys">Keyboard</Link>
  </div>
);

function Grammar() {
  const { loaded } = useApp();
  const oneEntity = exampleWhere((f, ex) => needsEntity(f) && ex.split(' ').length === 2 && ex.endsWith(` ${f.code}`));
  const twoEntities = exampleWhere((f, ex) => !!f.entity?.second && ex.split(' ').length === 3);
  const alone = exampleWhere((f, ex) => !f.on && !f.special && ex === f.code && f.group !== 'Workspace');
  const after = exampleWhere((f, ex) => !!f.on && !f.params && ex.startsWith(`${f.code} `));
  const withParam = exampleWhere((f, ex) => !!f.params?.some((p) => p.values) && ex.split(' ').length === 3 && !ex.startsWith(f.code));
  // A code to try alone: one that acts on the loaded entity, whatever kind it is.
  const bare = FUNCTIONS.find((f) => needsEntity(f) && !!f.entity?.hash && (!loaded || f.on!.includes(loaded.type as any)))!;
  return (
    <Card title="How to type a command">
      <ol className="grammar">
        <li><b>A name or code, then a function code.</b> <Run command={oneEntity} /> opens that screen for that entity. Two entities where the function compares them: <Run command={twoEntities} />. Parameters go last: <Run command={withParam} />.</li>
        <li><b>A function code alone</b> opens a screen that needs no entity: <Run command={alone} />. Where it needs one it acts on the loaded entity, the last one you opened{loaded ? <> (now {loaded.flag} {loaded.name}: try <Run command={bare.code} />)</> : <> (shown left of the command line: open one, then type just <code>{bare.code}</code>)</>}. The name may also follow the code: <Run command={after} />.</li>
        <li><b>Anything else is a search.</b> A name on its own opens that entity; words that match nothing exactly list every function, entity and note that comes close. <Run command="LAST" /> runs the previous command again, and Up in the empty command line walks back through your history.</li>
      </ol>
      <div className="tiny muted">Case does not matter. Countries answer to their two- and three-letter codes, companies to their tickers. Press any letter to start typing, or {KEYS.focus.keys.join(', ')}.</div>
    </Card>
  );
}

function FunctionList() {
  const run = useRunCommand();
  return (
    <>
      {FN_GROUPS.map((g) => {
        const list = FUNCTIONS.filter((f) => f.group === g);
        if (!list.length) return null;
        return (
          <Card key={g} title={g} id={`group-${g.toLowerCase()}`}>
            <table className="data fnTable">
              <thead><tr><th>Code</th><th>Function</th><th>What it shows</th><th>Example</th></tr></thead>
              <tbody>{list.map((f) => (
                <tr key={f.code} onClick={() => void run(f.examples[0])} title={`Run ${f.examples[0]}`}>
                  <td><Link className="fnCode" to={`/help?fn=${f.code}`} onClick={(e) => e.stopPropagation()} title={`About ${f.code}`}>{f.code}</Link>{needsEntity(f) && <span title="Needs an entity" aria-label="needs an entity"> *</span>}</td>
                  <td className="ttl">{f.title}</td>
                  <td>{f.about}<span className="tiny muted"> {f.on ? `Works on: ${worksOn(f).toLowerCase()}.` : ''}</span></td>
                  <td><Run command={f.examples[0]} /></td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        );
      })}
      <div className="tiny muted">* needs an entity: type its name or code first, or load one. Click a row to run its example; click a code to read about the function.</div>
    </>
  );
}

function FunctionHelp({ code }: { code: string }) {
  const f = fnByCode(code);
  if (!f) {
    const near = nearCodes(code, 5);
    return <Card title={`No function is called ${code.toUpperCase()}`}>
      <p>{near.length ? <>Close to it: {near.map((c) => <Link key={c} className="fnCode" to={`/help?fn=${c}`} style={{ marginRight: 8 }}>{c}</Link>)}</> : 'Nothing close to it either.'}</p>
      <p><Link to="/help">Every function</Link></p>
    </Card>;
  }
  const typed = [
    f.on ? `[name or code] ${f.code}${f.entity?.second ? '   ·   [first] [second] ' + f.code : ''}` : '',
    f.special === 'last' ? f.code : `${f.code}${f.params ? ` [${f.params.map((p) => p.name).join('] [')}]` : ''}${f.on ? (f.need === 'optional' ? '   (alone: the general screen, or the loaded entity)' : '   (alone: acts on the loaded entity)') : ''}`,
  ].filter(Boolean);
  const where = f.special === 'last' ? 'Handled by the command line itself.' : [f.page && `Without an entity: ${f.page}${f.query ? `?${new URLSearchParams(f.query)}` : ''}`, f.entity && (f.entity.page ? `With an entity: ${f.entity.page}?${f.entity.param}=…` : `With an entity: its profile${f.entity.hash ? `, section “${f.entity.hash}”` : ''}`)].filter(Boolean).join(' · ');
  return (
    <>
      <div className="fnHelpHead"><span className="fnCode big">{f.code}</span><h1>{f.title}</h1><span className="badge">{f.group}</span>{f.aliases?.length ? <span className="tiny muted">also: {f.aliases.join(', ')}</span> : null}</div>
      <Card title="What it shows"><p style={{ margin: 0 }}>{f.about}</p></Card>
      <Card title="How to type it">
        {typed.map((t) => <div key={t}><code className="typed">{t}</code></div>)}
        <div className="chips" style={{ marginTop: 10 }}><span className="tiny muted">Examples (click to run):</span>{f.examples.map((ex) => <Run key={ex} command={ex} />)}</div>
      </Card>
      {f.params?.length ? (
        <Card title="Parameters">
          <table className="data"><thead><tr><th>Parameter</th><th>What to type</th><th>What it does</th></tr></thead>
            <tbody>{f.params.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.values ? Object.keys(p.values).map((v) => <code key={v} className="typed" style={{ marginRight: 6 }}>{v}</code>) : <span className="muted">any words</span>}</td><td>{p.about}</td></tr>)}</tbody>
          </table>
        </Card>
      ) : null}
      <Card title="Works on">
        {f.on ? <div className="chips">{f.on.map((t) => <span key={t} className="badge">{ENTITY_TYPE_LABEL[t] || t}</span>)}<span className="tiny muted">{needsEntity(f) ? 'An entity is required.' : 'An entity is optional.'}</span></div> : <span className="muted">Needs no entity.</span>}
        {where && <div className="tiny muted" style={{ marginTop: 8 }}>{where}</div>}
      </Card>
      <Card title="Related functions">
        <table className="data fnTable"><tbody>{f.related.map((c) => fnByCode(c)).filter((r): r is FnDef => !!r).map((r, i) => (
          <tr key={r.code}><td><span className="kbd">{i + 1}</span></td><td><Link className="fnCode" to={`/help?fn=${r.code}`}>{r.code}</Link>{needsEntity(r) && <span title="Needs an entity"> *</span>}</td><td className="ttl">{r.title}</td><td>{r.about}</td><td><Run command={r.examples[0]} /></td></tr>
        ))}</tbody></table>
        <div className="tiny muted" style={{ marginTop: 6 }}>On the {f.code} screen these are the numbered chips of the function bar: press the digit.</div>
      </Card>
    </>
  );
}

function KeyMap() {
  const all = Object.values(KEYS) as KeyDef[];
  return (
    <>
      {KEY_AREAS.map((area) => {
        const list = all.filter((k) => k.area === area);
        if (!list.length) return null;
        return (
          <Card key={area} title={area}>
            <table className="data keyTable"><tbody>{list.map((k) => (
              <tr key={k.keys.join()}><td className="keys">{k.keys.map((x, i) => <span key={x}>{i > 0 && <span className="muted"> or </span>}<span className="kbd">{x}</span></span>)}</td><td>{k.about}{!k.whileTyping && area === 'Anywhere' && <span className="tiny muted"> Not while typing in a field or a note.</span>}</td></tr>
            ))}</tbody></table>
          </Card>
        );
      })}
      <div className="tiny muted">Single keys never fire while you type in a form field or in a note. Everything here can also be done with the mouse.</div>
    </>
  );
}

export function HelpPage() {
  const [sp] = useSearchParams();
  const code = (sp.get('fn') || '').trim();
  const view = sp.get('view') === 'keys' ? 'keys' : 'functions';
  useEffect(() => { document.title = `${code ? `${code.toUpperCase()} help` : view === 'keys' ? 'Keyboard' : 'Functions and help'} — Global Intelligence Terminal`; return () => { document.title = 'Global Intelligence Terminal'; }; }, [code, view]);
  if (code) return <div className="page helpPage"><div><Link to="/help">‹ Every function</Link></div><FunctionHelp code={code} /></div>;
  return (
    <div className="page helpPage">
      <div className="fnHelpHead"><h1>{view === 'keys' ? 'Keyboard' : 'Functions and help'}</h1><div className="spacer" /><Tabs view={view} /></div>
      {view === 'keys' ? <KeyMap /> : <><Grammar /><FunctionList /></>}
    </div>
  );
}

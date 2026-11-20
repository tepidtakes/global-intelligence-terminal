// The function bar, under the top bar on every page: where you are (function code and title, and
// the entity it is about), back and forward, the functions worth running next as numbered chips
// (press the digit), export and help. Everything in it comes from the registry.
import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../state';
import { TYPE_ICON } from '../format';
import { fnApplies, fnAt, fnByCode, type FnDef } from '../../shared/functions';
import { KEYS, isTyping } from '../keys';
import { useRunCommand } from '../command';
import { ExportMenu } from './TableTools';

export function FunctionBar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { loaded, load } = useApp();
  const run = useRunCommand();
  const at = fnAt(loc);
  const fn = at?.fn;
  const related = (fn?.related || []).map((c) => fnByCode(c)).filter((f): f is FnDef => !!f).slice(0, 9);
  const helpUrl = fn ? `/help?fn=${fn.code}` : '/help';

  // An address that names an entity (a link someone opened, a reload) loads it, so codes typed alone act on it.
  const entityId = at?.entityId;
  useEffect(() => {
    if (!entityId || loaded?.id === entityId || loc.pathname.startsWith('/entity/')) return;
    let live = true;
    api(`/preview/${encodeURIComponent(entityId)}`).then((pv) => { const e = pv?.entity; if (live && e?.id === entityId) load({ id: e.id, type: e.type, name: e.name, flag: e.flag, iso3: e.type === 'country' ? e.id.split(':')[1] : undefined }); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  // Digits run the numbered chips; F1 opens help for this function. The handler reads the latest values through a ref.
  const now = useRef({ related, run, helpUrl, nav });
  now.current = { related, run, helpUrl, nav };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (KEYS.help.is(e)) { e.preventDefault(); now.current.nav(now.current.helpUrl); return; }
      if (KEYS.related.is(e) && !isTyping(e.target) && !document.querySelector('.modal')) {
        const f = now.current.related[Number(e.key) - 1];
        if (f) { e.preventDefault(); void now.current.run(f.code); }
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const about = fn && at?.entityId ? (loaded?.id === at.entityId ? loaded : null) : null;
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0;
  /** Why a chip would not run right now (it still says so when pressed). */
  const blocked = (f: FnDef) => (f.on && f.need !== 'optional' ? (!loaded ? `needs ${f.on.length > 6 ? 'an entity' : `a ${f.on.join(' or ')}`}: load one first` : !fnApplies(f, loaded.type as any) ? `does not apply to ${loaded.name}` : '') : '');
  return (
    <div className="fnbar" role="toolbar" aria-label="Function bar">
      <button type="button" className="fnNav" onClick={() => nav(-1)} disabled={!canGoBack} title={`Back (${KEYS.back.keys[0]})`} aria-label="Back">‹</button>
      <button type="button" className="fnNav" onClick={() => nav(1)} title={`Forward (${KEYS.forward.keys[0]})`} aria-label="Forward">›</button>
      <div className="fnNow" title={fn ? fn.about : undefined}>
        {fn ? <><Link to={helpUrl} className="fnCode" title={`${fn.code}: what this function shows`}>{fn.code}</Link><span className="ttl">{fn.title}</span></> : <span className="ttl muted">This screen has no function code</span>}
        {about && <span className="ent"><span aria-hidden>{about.flag || TYPE_ICON[about.type]}</span> {about.name}</span>}
      </div>
      {related.length > 0 && (
        <div className="fnRelated" aria-label="Related functions">
          <span className="tiny muted next">Next</span>
          {related.map((f, i) => {
            const why = blocked(f);
            return <button type="button" key={f.code} className={`fnRel${why ? ' off' : ''}`} onClick={() => void run(f.code)}
              title={`${f.title}: ${f.about}${why ? ` (${why})` : loaded && f.on && fnApplies(f, loaded.type as any) ? ` For ${loaded.name}.` : ''} Press ${i + 1}.`}>
              <span className="kbd" aria-hidden>{i + 1}</span><span className="srOnly">Key {i + 1}: </span>{f.code}
            </button>;
          })}
        </div>
      )}
      <div className="spacer" />
      <ExportMenu />
      <Link to={helpUrl} className="fnHelp" title={`Help for ${fn ? `${fn.code} (${fn.title})` : 'the terminal'} (${KEYS.help.keys[0]})`}><span className="kbd" aria-hidden>{KEYS.help.keys[0]}</span> Help</Link>
    </div>
  );
}

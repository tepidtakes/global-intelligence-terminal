// "Live" indicator in the top bar: whether this page is receiving updates from the terminal's server.
import { useEffect, useRef, useState } from 'react';
import { startLive, useLiveStatus } from '../api';
import { ago } from '../format';

const LABEL = { live: 'Live', connecting: 'Connecting…', paused: 'Paused', offline: 'Offline' } as const;
/** What changed, in plain words (the server names sources by module, provider or connector id). */
const NAMES: Record<string, string> = {
  graph: 'the knowledge web', changes: 'alerts', 'live-data': 'leaders, conflicts and elections', news: 'news', calendar: 'the calendar', elections: 'election results',
  budgets: 'budgets', sanctions: 'sanctions', reserves: 'reserves', tariffs: 'tariffs', agreement: 'cross-checks', account: 'your account', notes: 'your notes',
  wb: 'World Bank', imf: 'IMF', yahoo: 'market prices', spark: 'market prices', fred: 'FRED', bis: 'BIS', ecb: 'ECB', oecd: 'OECD', comtrade: 'UN Comtrade', treasury: 'US Treasury',
  sec: 'SEC filings', gnews: 'news search', gdelt: 'news search', wp: 'Wikipedia', wd: 'Wikidata', pm: 'prediction markets', econ: 'economic releases', curve: 'yield curves', consensus: 'analyst estimates',
};
const nameOf = (s: string) => NAMES[s] || (s.startsWith('connector:') ? s.slice(10).replace(/-/g, ' ') : s);

export function LiveBadge() {
  const s = useLiveStatus();
  const [, tick] = useState(0);
  useEffect(() => { startLive(); const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  // Screen readers hear about the connection only when it is lost and when it is back, not on
  // every tab switch.
  const [said, setSaid] = useState('');
  const lost = useRef(false);
  useEffect(() => {
    if (s.state === 'offline' && !lost.current) { lost.current = true; setSaid('Live updates lost. What you see may be out of date.'); }
    else if (s.state === 'live' && lost.current) { lost.current = false; setSaid('Live updates restored.'); }
  }, [s.state]);
  const what = [...new Set((s.sources || []).map(nameOf))];
  const title = s.state === 'live'
    ? `Live: what you see updates by itself when new data arrives.${s.lastAt ? ` Last update ${ago(s.lastAt)}${what.length ? ` (${what.slice(0, 4).join(', ')}${what.length > 4 ? ', …' : ''})` : ''}.` : ''}`
    : s.state === 'paused' ? 'Updates pause while this tab is hidden and catch up when you come back.'
      : s.state === 'connecting' ? 'Connecting to the terminal’s server…'
        : 'Can’t reach the terminal’s server — still trying. What you see may be out of date.';
  return (
    <>
      <span className={`liveBadge ${s.state}`} title={title} role="img" aria-label={`${LABEL[s.state]}. ${title}`}><span className="dot" aria-hidden /><span className="lbl" aria-hidden>{LABEL[s.state]}</span></span>
      <span className="srOnly" role="status">{said}</span>
    </>
  );
}

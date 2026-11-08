// "Live" indicator in the top bar: whether this page is receiving updates from the terminal's server.
import { useEffect, useState } from 'react';
import { startLive, useLiveStatus } from '../api';
import { ago } from '../format';

const LABEL = { live: 'Live', connecting: 'Connecting…', paused: 'Paused', offline: 'Offline' } as const;

export function LiveBadge() {
  const s = useLiveStatus();
  const [, tick] = useState(0);
  useEffect(() => { startLive(); const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  const title = s.state === 'live'
    ? `Live: what you see updates by itself when new data arrives.${s.lastAt ? ` Last update ${ago(s.lastAt)}${s.sources?.length ? ` (${s.sources.slice(0, 5).join(', ')}${s.sources.length > 5 ? ', …' : ''})` : ''}.` : ''}`
    : s.state === 'paused' ? 'Updates pause while this tab is hidden and catch up when you come back.'
      : 'Can’t reach the terminal’s server — retrying. What you see may be out of date.';
  return <span className={`liveBadge ${s.state}`} title={title} role="status"><span className="dot" aria-hidden /><span className="lbl">{LABEL[s.state]}</span></span>;
}

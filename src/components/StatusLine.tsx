// The status line, at the bottom of the window: what the last command did (or why it could not run),
// whether the data sources are answering, and the time. Each part has a fixed place, so a new
// message never moves anything.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { useCommandStatus } from '../command';
import { KEYS } from '../keys';

interface ProviderRow { label: string; state: 'ok' | 'stale' | 'failing'; }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Data health in a few words, from the provider table of /api/provenance/status. */
export function healthWords(providers: ProviderRow[] | undefined): { text: string; level: 'ok' | 'warn' | 'bad' | 'none'; detail: string } {
  if (!providers) return { text: 'checking sources…', level: 'none', detail: 'Asking the server which data sources answered last.' };
  if (!providers.length) return { text: 'no source asked yet', level: 'none', detail: 'No data source has been asked for anything since the server started.' };
  const failing = providers.filter((p) => p.state === 'failing'); const stale = providers.filter((p) => p.state === 'stale');
  const names = (list: ProviderRow[]) => list.slice(0, 6).map((p) => p.label).join(', ') + (list.length > 6 ? '…' : '');
  if (failing.length) return { text: `${plural(failing.length, 'source', 'sources')} not answering${stale.length ? `, ${stale.length} on saved data` : ''}`, level: 'bad', detail: `Not answering: ${names(failing)}.${stale.length ? ` Showing saved data: ${names(stale)}.` : ''}` };
  if (stale.length) return { text: `${plural(stale.length, 'source', 'sources')} on saved data`, level: 'warn', detail: `Not answering now, so the last saved copy is shown: ${names(stale)}.` };
  return { text: `all ${providers.length} sources answering`, level: 'ok', detail: 'Every data source that was asked answered the last time.' };
}
const MARK = { ok: '✓', warn: '!', bad: '✕', none: '·' } as const;

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Tick on the minute: the clock shows no seconds.
    let t: number;
    const tick = () => { setNow(new Date()); t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50); };
    t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(t);
  }, []);
  const parts = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).formatToParts(now);
  const zone = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  const time = parts.filter((p) => p.type === 'hour' || p.type === 'minute').map((p) => p.value).join(':');
  return <time className="clock" dateTime={now.toISOString()} title={`${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${Intl.DateTimeFormat().resolvedOptions().timeZone} · ${now.toISOString().slice(11, 16)} UTC`}>{time} {zone}</time>;
}

export function StatusLine() {
  const status = useCommandStatus();
  const health = useApi<{ providers: ProviderRow[] }>('/provenance/status', 60_000, { live: true });
  const h = healthWords(health.data?.providers);
  const offline = !!health.error && !health.data;
  return (
    <footer className="statusline" aria-label="Status">
      <div className={`msg${status && !status.ok ? ' bad' : ''}`} role="status" aria-live="polite" title={status?.message || undefined}>
        {status?.message ? <>{!status.ok && <span aria-hidden>✕ </span>}{status.message}</> : <span className="muted">Type a function code or a name. {KEYS.focus.keys[0]} or / goes to the command line.</span>}
      </div>
      <Link to="/data" className={`slHealth ${offline ? 'bad' : h.level}`} title={offline ? `The server did not answer: ${health.error!.message}` : `${h.detail} Open the data page for every source.`}>
        <span aria-hidden>{offline ? MARK.bad : MARK[h.level]}</span> {offline ? 'server not answering' : h.text}
      </Link>
      <div className="right"><Clock /><Link to="/help" className="f1"><span className="kbd" aria-hidden>{KEYS.help.keys[0]}</span> help</Link></div>
    </footer>
  );
}

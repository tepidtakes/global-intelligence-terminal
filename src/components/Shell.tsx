import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth, useApp } from '../state';
import { GlobalSearch } from './GlobalSearch';
import { ErrorBoundary } from './ErrorBoundary';

const NAV = [
  { to: '/', label: 'Map', icon: '◎', end: true },
  { to: '/markets', label: 'Markets', icon: '◫' },
  { to: '/conflicts', label: 'Conflicts', icon: '⚔' },
  { to: '/research', label: 'Research', icon: '✎' },
  { to: '/watchlists', label: 'Watchlists', icon: '☆' },
  { to: '/portfolio', label: 'Portfolio', icon: '▤' },
  { to: '/calendar', label: 'Calendar', icon: '◷' },
  { to: '/compare', label: 'Compare', icon: '⇄' },
];

export function Shell() {
  const { user } = useAuth();
  const { theme, setTheme, compare } = useApp();
  const loc = useLocation();
  const nextTheme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
  return (
    <div className="app">
      <header className="topnav">
        <Link to="/" className="brand" aria-label="Global Intelligence Terminal — map">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="13" fill="none" stroke="var(--accent)" strokeWidth="2.5" /><path d="M3 16h26M16 3c-6 7-6 19 0 26M16 3c6 7 6 19 0 26" fill="none" stroke="var(--accent)" strokeWidth="1.8" /></svg>
          <span>GIT</span><small>Global Intelligence Terminal</small>
        </Link>
        <GlobalSearch />
        <nav className="row" style={{ gap: 2 }}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
              <span aria-hidden>{n.icon}</span> <span className="lbl">{n.label}{n.to === '/compare' && compare.length ? ` (${compare.length})` : ''}</span>
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => setTheme(nextTheme)} title={`Theme: ${theme} (click for ${nextTheme})`} aria-label="Toggle theme">
          {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
        </button>
        <NavLink to="/settings" className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}><span aria-hidden>⚙</span> <span className="lbl">Settings</span></NavLink>
        {user === null && <Link to="/login" className="btn primary sm" style={{ marginLeft: 6 }}>Sign in</Link>}
        {user && <span className="tiny muted" style={{ marginLeft: 8, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user.email}>{user.email}</span>}
      </header>
      <main className="main"><ErrorBoundary resetKey={loc.pathname} label="this page"><Outlet /></ErrorBoundary></main>
    </div>
  );
}

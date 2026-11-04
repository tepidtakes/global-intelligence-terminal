import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth, useApp } from '../state';
import { GlobalSearch } from './GlobalSearch';
import { ErrorBoundary } from './ErrorBoundary';

const NAV = [
  { to: '/', label: 'Map', icon: '◎', end: true },
  { to: '/markets', label: 'Markets', icon: '◫' },
  { to: '/conflicts', label: 'Conflicts', icon: '⚔' },
  { to: '/news', label: 'News', icon: '▦' },
  { to: '/elections', label: 'Elections', icon: '☑' },
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
  // Phones: the links move into a menu opened from ☰ (closed again on navigation or Escape).
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [loc.pathname]);
  useEffect(() => { if (!menu) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [menu]);
  const link = (to: string, label: string, icon: string, extra?: string, end?: boolean, title?: string) => (
    <NavLink key={to} to={to} end={end} title={title || label} className={({ isActive }) => `navlink${isActive ? ' active' : ''}${extra ? ` ${extra}` : ''}`}>
      <span aria-hidden>{icon}</span> <span className="lbl">{label}{to === '/compare' && compare.length ? ` (${compare.length})` : ''}</span>
    </NavLink>
  );
  return (
    <div className="app">
      <header className="topnav">
        <Link to="/" className="brand" aria-label="Global Intelligence Terminal — map">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="13" fill="none" stroke="var(--accent)" strokeWidth="2.5" /><path d="M3 16h26M16 3c-6 7-6 19 0 26M16 3c6 7 6 19 0 26" fill="none" stroke="var(--accent)" strokeWidth="1.8" /></svg>
          <span>GIT</span><small>Global Intelligence Terminal</small>
        </Link>
        <GlobalSearch />
        <nav id="mainnav" className={`navLinks${menu ? ' open' : ''}`} aria-label="Main">
          {NAV.map((n) => link(n.to, n.label, n.icon, undefined, n.end))}
          {link('/data', 'Data', '◇', 'menuOnly', false, 'Data sources, freshness and consistency audit')}
          {link('/settings', 'Settings', '⚙', 'menuOnly')}
        </nav>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => setTheme(nextTheme)} title={`Theme: ${theme} (click for ${nextTheme})`} aria-label="Toggle theme">
          {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
        </button>
        {link('/data', 'Data', '◇', 'barOnly', false, 'Data sources, freshness and consistency audit')}
        {link('/settings', 'Settings', '⚙', 'barOnly')}
        {user === null && <Link to="/login" className="btn primary sm signIn" style={{ marginLeft: 6 }}>Sign in</Link>}
        {user && <span className="tiny muted userEmail" style={{ marginLeft: 8, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user.email}>{user.email}</span>}
        <button className="btn ghost sm navToggle" aria-expanded={menu} aria-controls="mainnav" aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu((m) => !m)}>{menu ? '✕' : '☰'}</button>
      </header>
      {menu && <div className="navScrim" onClick={() => setMenu(false)} aria-hidden />}
      <main className="main"><ErrorBoundary resetKey={loc.pathname} label="this page"><Suspense fallback={<div className="page" aria-busy="true"><div className="skeleton" style={{ height: 28, width: '40%' }} /><div className="skeleton" style={{ height: 14, width: '70%' }} /><div className="skeleton" style={{ height: 220 }} /></div>}><Outlet /></Suspense></ErrorBoundary></main>
    </div>
  );
}

import React, { lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { Providers } from './state';
import { Shell } from './components/Shell';

// Every page is its own chunk, loaded when first visited: opening a profile no longer downloads
// the map engine, and the map no longer waits for the note editor.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, name: K) => {
  const C = lazy(() => load().then((m) => ({ default: m[name] })));
  (C as any).preload = load;
  return C;
};
const MapPage = page(() => import('./pages/MapPage'), 'MapPage');
const ProfilePage = page(() => import('./pages/ProfilePage'), 'ProfilePage');
const ResearchPage = page(() => import('./pages/ResearchPage'), 'ResearchPage');
const NoteRoute = page(() => import('./pages/NotePage'), 'NoteRoute');
const PortfolioPage = page(() => import('./pages/PortfolioPage'), 'PortfolioPage');
const WatchlistsPage = page(() => import('./pages/WatchlistsPage'), 'WatchlistsPage');
const CalendarPage = page(() => import('./pages/CalendarPage'), 'CalendarPage');
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage');
const LoginPage = page(() => import('./pages/LoginPage'), 'LoginPage');
const ComparePage = page(() => import('./pages/ComparePage'), 'ComparePage');
const MarketsPage = page(() => import('./pages/MarketsPage'), 'MarketsPage');
const ConflictsPage = page(() => import('./pages/ConflictsPage'), 'ConflictsPage');
const NewsPage = page(() => import('./pages/NewsPage'), 'NewsPage');
const DataPage = page(() => import('./pages/DataPage'), 'DataPage');
const ElectionsPage = page(() => import('./pages/ElectionsPage'), 'ElectionsPage');
const AlertsPage = page(() => import('./pages/AlertsPage'), 'AlertsPage');

// Once the first page is up, fetch the two most-visited pages in the background so moving
// between the map and a profile never waits on a download.
// Starts a few seconds after load, when idle, so it never competes with the page's own data —
// and not at all on data-saver or 2G connections.
const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 1000));
const conn = (navigator as any).connection;
if (!conn?.saveData && !/2g/.test(conn?.effectiveType || '')) {
  window.addEventListener('load', () => setTimeout(() => idle(() => { void (MapPage as any).preload(); void (ProfilePage as any).preload(); }), 3000));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Providers>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<MapPage />} />
            <Route path="/entity/:id" element={<ProfilePage />} />
            <Route path="/research" element={<ResearchPage />} />
            <Route path="/research/:noteId" element={<NoteRoute />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/watchlists" element={<WatchlistsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/markets" element={<MarketsPage />} />
            <Route path="/conflicts" element={<ConflictsPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/elections" element={<ElectionsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<div className="page"><h1>Page not found</h1></div>} />
          </Route>
        </Routes>
      </Providers>
    </BrowserRouter>
  </React.StrictMode>,
);

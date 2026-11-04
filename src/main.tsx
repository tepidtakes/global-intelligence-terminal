import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { Providers } from './state';
import { Shell } from './components/Shell';
import { MapPage } from './pages/MapPage';
import { ProfilePage } from './pages/ProfilePage';
import { ResearchPage } from './pages/ResearchPage';
import { NoteRoute } from './pages/NotePage';
import { PortfolioPage } from './pages/PortfolioPage';
import { WatchlistsPage } from './pages/WatchlistsPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { ComparePage } from './pages/ComparePage';
import { MarketsPage } from './pages/MarketsPage';
import { ConflictsPage } from './pages/ConflictsPage';
import { NewsPage } from './pages/NewsPage';
import { DataPage } from './pages/DataPage';

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

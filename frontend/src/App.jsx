import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { FilterProvider } from './context/FilterContext';
import { useAuth } from './hooks/useAuth';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import IndustryOverviewPage from './pages/IndustryOverviewPage';
import IndustryDetailPage from './pages/IndustryDetailPage';
import ClientListPage from './pages/ClientListPage';
import ClientDetailPage from './pages/ClientDetailPage';
import CreativeGalleryPage from './pages/CreativeGalleryPage';
import QueryExplorerPage from './pages/QueryExplorerPage';
import SyncStatusPage from './pages/SyncStatusPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import AdDetailPage from './pages/AdDetailPage';
import SettingsPage from './pages/SettingsPage';
import IntelligencePage from './pages/IntelligencePage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="industries" element={<IndustryOverviewPage />} />
        <Route path="industries/:id" element={<IndustryDetailPage />} />
        <Route path="clients" element={<ClientListPage />} />
        <Route path="clients/:id" element={<ClientDetailPage />} />
        <Route path="clients/:id/campaigns/:campaignId" element={<CampaignDetailPage />} />
        <Route path="campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="ads/:id" element={<AdDetailPage />} />
        <Route path="gallery" element={<CreativeGalleryPage />} />
        <Route path="intelligence" element={<IntelligencePage />} />
        <Route path="query" element={<QueryExplorerPage />} />
        <Route path="sync" element={<SyncStatusPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FilterProvider>
          <AppRoutes />
        </FilterProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

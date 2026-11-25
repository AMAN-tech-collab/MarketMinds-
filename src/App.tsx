import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { PreferencesProvider } from './context/PreferencesContext.tsx';
import { AppShell } from './components/AppShell.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { ScreenerPage } from './pages/ScreenerPage.tsx';
import { CompareStocksPage } from './pages/CompareStocksPage.tsx';
import { StockDetailPage } from './pages/StockDetailPage.tsx';
import { AiAnalysisPage } from './pages/AiAnalysisPage.tsx';
import { TechnicalAnalysisPage } from './pages/TechnicalAnalysisPage.tsx';
import { PortfolioPage } from './pages/PortfolioPage.tsx';
import { WatchlistPage } from './pages/WatchlistPage.tsx';
import { NewsPage } from './pages/NewsPage.tsx';
import { RiskCalculatorPage } from './pages/RiskCalculatorPage.tsx';
import { PredictionsPage } from './pages/PredictionsPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

function WorkspaceRoute({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <PreferencesProvider>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                <Route
                  path="/dashboard"
                  element={
                    <WorkspaceRoute>
                      <DashboardPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/screener"
                  element={
                    <WorkspaceRoute>
                      <ScreenerPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/compare"
                  element={
                    <WorkspaceRoute>
                      <CompareStocksPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/stocks/:symbol"
                  element={
                    <WorkspaceRoute>
                      <StockDetailPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/ai-analysis"
                  element={
                    <WorkspaceRoute>
                      <AiAnalysisPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/technical"
                  element={
                    <WorkspaceRoute>
                      <TechnicalAnalysisPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/portfolio"
                  element={
                    <WorkspaceRoute>
                      <PortfolioPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/watchlist"
                  element={
                    <WorkspaceRoute>
                      <WatchlistPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/news"
                  element={
                    <WorkspaceRoute>
                      <NewsPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/risk"
                  element={
                    <WorkspaceRoute>
                      <RiskCalculatorPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/predictions"
                  element={
                    <WorkspaceRoute>
                      <PredictionsPage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <WorkspaceRoute>
                      <ProfilePage />
                    </WorkspaceRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <WorkspaceRoute>
                      <AdminDashboardPage />
                    </WorkspaceRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </PreferencesProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

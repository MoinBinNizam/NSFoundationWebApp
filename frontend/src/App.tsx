import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LogoProvider } from './context/LogoContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LocalizationLayer } from './components/LocalizationLayer';

// Lazy-loaded page components for optimal bundle splitting
const LoginPage = React.lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const PasswordResetPage = React.lazy(() => import('./pages/PasswordResetPage').then((m) => ({ default: m.PasswordResetPage })));
const ChangePasswordPage = React.lazy(() => import('./pages/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })));
const MemberPortalPage = React.lazy(() => import('./pages/MemberPortalPage').then((m) => ({ default: m.MemberPortalPage })));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const MembersPage = React.lazy(() => import('./pages/MembersPage').then((m) => ({ default: m.MembersPage })));
const SharesPage = React.lazy(() => import('./pages/SharesPage').then((m) => ({ default: m.SharesPage })));
const DuesPage = React.lazy(() => import('./pages/DuesPage').then((m) => ({ default: m.DuesPage })));
const PaymentsPage = React.lazy(() => import('./pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const CustodyPage = React.lazy(() => import('./pages/CustodyPage').then((m) => ({ default: m.CustodyPage })));
const InvestmentsPage = React.lazy(() => import('./pages/InvestmentsPage').then((m) => ({ default: m.InvestmentsPage })));
const ReinvestmentsPage = React.lazy(() => import('./pages/ReinvestmentsPage').then((m) => ({ default: m.ReinvestmentsPage })));
const ExpensesPage = React.lazy(() => import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const DistributionPage = React.lazy(() => import('./pages/DistributionPage').then((m) => ({ default: m.DistributionPage })));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const PreferencesPage = React.lazy(() => import('./pages/PreferencesPage').then((m) => ({ default: m.PreferencesPage })));
const MigrationPage = React.lazy(() => import('./pages/MigrationPage').then((m) => ({ default: m.MigrationPage })));
const GovernancePage = React.lazy(() => import('./pages/GovernancePage').then((m) => ({ default: m.GovernancePage })));
const DocumentsPage = React.lazy(() => import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const AuditPage = React.lazy(() => import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })));

const PageLoadingFallback: React.FC = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-slate-500">
    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-sm font-medium">লোড হচ্ছে... / Loading...</p>
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LogoProvider>
          <LocalizationLayer />
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              {/* Public Authentication Route */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<PasswordResetPage />} />
              <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />

              {/* Protected Application Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="member-portal" element={<MemberPortalPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="reports" element={<Navigate to="/dashboard" replace />} />
                <Route path="members" element={<MembersPage />} />
                <Route path="shares" element={<SharesPage />} />
                <Route path="dues" element={<DuesPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="custody" element={<CustodyPage />} />
                <Route path="investments" element={<InvestmentsPage />} />
                <Route path="reinvestments" element={<ReinvestmentsPage />} />
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="distribution" element={<DistributionPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="preferences" element={<PreferencesPage />} />
                <Route path="migrations" element={<MigrationPage />} />
                <Route path="governance" element={<GovernancePage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="audit" element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><AuditPage /></ProtectedRoute>} />
                {/* Catch-all redirect to members */}
                <Route path="*" element={<Navigate to="/members" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </LogoProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;

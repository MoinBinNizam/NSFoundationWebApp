import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LogoProvider } from './context/LogoContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { SharesPage } from './pages/SharesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { CustodyPage } from './pages/CustodyPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { ReinvestmentsPage } from './pages/ReinvestmentsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { DashboardPage } from './pages/DashboardPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LogoProvider>
          <Routes>
          {/* Public Authentication Route */}
          <Route path="/login" element={<LoginPage />} />

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
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="reports" element={<Navigate to="/dashboard" replace />} />
            <Route path="members" element={<MembersPage />} />
            <Route path="shares" element={<SharesPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="custody" element={<CustodyPage />} />
            <Route path="investments" element={<InvestmentsPage />} />
            <Route path="reinvestments" element={<ReinvestmentsPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            {/* Catch-all redirect to members */}
            <Route path="*" element={<Navigate to="/members" replace />} />
          </Route>
        </Routes>
        </LogoProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: Array<'ADMIN' | 'ACCOUNTANT' | 'MEMBER' | 'SUPER_ADMIN'> }> = ({ children, roles }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0B0F19]">
        <div className="text-center text-gray-400">
          <div className="w-10 h-10 border-[3px] border-white/10 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium">Verifying secure session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && (!user || !roles.includes(user.role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

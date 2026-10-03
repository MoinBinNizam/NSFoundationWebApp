import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/api';

export type MemberDesignation =
  | 'DIRECTOR'
  | 'PRESIDENT'
  | 'ACCOUNTANT'
  | 'ASSISTANT_ACCOUNTANT'
  | 'GENERAL_SECRETARY'
  | 'CONVENER'
  | 'GENERAL_MEMBER';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'ADMIN' | 'ACCOUNTANT' | 'MEMBER' | 'INVESTMENT_MANAGER' | 'SUPER_ADMIN';
  designation?: MemberDesignation | null;
  memberId?: string | null;
  accountantType?: 'PRIMARY' | 'ASSISTANT' | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  permissions: Record<string, { canView: boolean; canEdit: boolean }>;
  canAccess: (moduleKey: string, action?: 'view' | 'edit') => boolean;
  refreshPermissions: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [permissions, setPermissions] = useState<Record<string, { canView: boolean; canEdit: boolean }>>({});
  const [loading, setLoading] = useState<boolean>(true);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await apiRequest<{ modules: Record<string, { canView: boolean; canEdit: boolean }> }>('/settings/permissions/me');
      if (res.data?.modules) {
        setPermissions(res.data.modules);
      }
    } catch {
      // Non-blocking fallback
    }
  }, []);

  useEffect(() => {
    async function verifyAuth() {
      if (token) {
        try {
          const res = await apiRequest<UserProfile>('/auth/me');
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
          await fetchPermissions();
        } catch {
          logout();
        }
      }
      setLoading(false);
    }

    verifyAuth();

    const handleUnauthorized = () => logout();
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [token, fetchPermissions]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    await fetchPermissions();
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setPermissions({});
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const canAccess = useCallback((moduleKey: string, action: 'view' | 'edit' = 'view'): boolean => {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;

    const mod = permissions[moduleKey];
    if (mod) {
      return action === 'edit' ? mod.canEdit : mod.canView;
    }

    // Default fallbacks
    if (user.role === 'ADMIN') return true;
    if (user.role === 'ACCOUNTANT') {
      return ['PAYMENTS', 'CUSTODY', 'MEMBERS', 'EXPENSES', 'REPORTS'].includes(moduleKey);
    }
    return moduleKey === 'MEMBERS' && action === 'view';
  }, [user, permissions]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!token && !!user,
        permissions,
        canAccess,
        refreshPermissions: fetchPermissions,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

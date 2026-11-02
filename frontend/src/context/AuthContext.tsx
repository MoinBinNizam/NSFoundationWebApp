import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  apiRequest,
  getAuthToken,
  setAuthSession,
  clearAuthSession,
  saveInterruptedWork,
  clearInterruptedWork,
} from '../services/api';

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
  signatureImage?: string | null;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  permissions: Record<string, { canView: boolean; canEdit: boolean }>;
  canAccess: (moduleKey: string, action?: 'view' | 'edit') => boolean;
  refreshPermissions: () => Promise<void>;
  updateUser: (data: Partial<UserProfile>) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: (voluntary?: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = sessionStorage.getItem('user') || localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => getAuthToken());
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

  const logout = useCallback((voluntary: boolean = true) => {
    if (voluntary) {
      clearInterruptedWork();
    }
    setToken(null);
    setUser(null);
    setPermissions({});
    clearAuthSession();
  }, []);

  useEffect(() => {
    async function verifyAuth() {
      if (token) {
        try {
          const res = await apiRequest<UserProfile>('/auth/me');
          setUser(res.data);
          sessionStorage.setItem('user', JSON.stringify(res.data));
          localStorage.setItem('user', JSON.stringify(res.data));
          await fetchPermissions();
        } catch {
          logout(true);
        }
      }
      setLoading(false);
    }

    verifyAuth();

    const handleUnauthorized = () => logout(false);
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [token, fetchPermissions, logout]);

  // 5-minute inactivity idle tracker (300,000 ms)
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!token || !user) return;

    const resetIdleTimer = () => {
      lastActivityRef.current = Date.now();
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));

    const idleInterval = setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastActivityRef.current;
      // 5 minutes (300,000 ms) of inactivity
      if (idleTime >= 300000) {
        saveInterruptedWork(window.location.pathname + window.location.search);
        logout(false);
        window.location.href = '/login?reason=idle_timeout';
      }
    }, 15000);

    const handleBeforeUnload = () => {
      // Save current working location if browser or tab is closed
      saveInterruptedWork(window.location.pathname + window.location.search);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(idleInterval);
      activityEvents.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [token, user, logout]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    setUser(newUser);
    setAuthSession(newToken, newUser);
    await fetchPermissions();
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

  const updateUser = useCallback((data: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...data };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

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
        updateUser,
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

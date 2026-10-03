import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../services/api';

interface LogoContextType {
  logo: string | null;
  uploadLogo: (file: File) => Promise<void>;
  resetLogo: () => Promise<void>;
}

const LogoContext = createContext<LogoContextType | undefined>(undefined);
const LEGACY_LOGO_STORAGE_KEY = 'ns_foundation_logo';

export const LogoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logo, setLogo] = useState<string | null>(() => localStorage.getItem(LEGACY_LOGO_STORAGE_KEY));

  useEffect(() => {
    let active = true;
    apiRequest<{ logo: string | null }>('/settings/organization-logo')
      .then(async (response) => {
        if (!active) return;
        if (response.data.logo) {
          setLogo(response.data.logo);
          localStorage.removeItem(LEGACY_LOGO_STORAGE_KEY);
          return;
        }
        // Move the accountant's previously browser-only upload into the shared record on first load.
        const legacyLogo = localStorage.getItem(LEGACY_LOGO_STORAGE_KEY);
        if (legacyLogo && localStorage.getItem('token')) {
          try {
            const saved = await apiRequest<{ logo: string | null }>('/settings/organization-logo', {
              method: 'PUT', body: JSON.stringify({ logo: legacyLogo }),
            });
            if (active) { setLogo(saved.data.logo || legacyLogo); localStorage.removeItem(LEGACY_LOGO_STORAGE_KEY); }
          } catch { /* A non-admin can still see the legacy mark on this device; an admin can publish it. */ }
        }
      })
      .catch(() => { /* Branding is optional; retain the built-in mark. */ });
    return () => { active = false; };
  }, []);

  const uploadLogo = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
        reject(new Error('Please upload a PNG, JPEG, WebP, or SVG logo.'));
        return;
      }

      // 2MB size limit
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error('Logo image must be smaller than 2 MB.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        apiRequest<{ logo: string | null }>('/settings/organization-logo', {
          method: 'PUT', body: JSON.stringify({ logo: base64 }),
        }).then((response) => { setLogo(response.data.logo || null); resolve(); }).catch(reject);
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  };

  const resetLogo = async () => {
    await apiRequest<{ logo: string | null }>('/settings/organization-logo', {
      method: 'PUT', body: JSON.stringify({ logo: null }),
    });
    setLogo(null);
  };

  return (
    <LogoContext.Provider value={{ logo, uploadLogo, resetLogo }}>
      {children}
    </LogoContext.Provider>
  );
};

export const useLogo = (): LogoContextType => {
  const context = useContext(LogoContext);
  if (!context) {
    throw new Error('useLogo must be used within a LogoProvider');
  }
  return context;
};

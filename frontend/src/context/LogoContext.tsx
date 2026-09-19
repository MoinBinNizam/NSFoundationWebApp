import React, { createContext, useContext, useState, useEffect } from 'react';

interface LogoContextType {
  logo: string | null;
  uploadLogo: (file: File) => Promise<void>;
  resetLogo: () => void;
}

const LOGO_STORAGE_KEY = 'ns_foundation_logo';

const LogoContext = createContext<LogoContextType | undefined>(undefined);

export const LogoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logo, setLogo] = useState<string | null>(() => {
    return localStorage.getItem(LOGO_STORAGE_KEY);
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LOGO_STORAGE_KEY) {
        setLogo(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const uploadLogo = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('Please upload a valid image file (PNG, JPG, SVG, WebP)'));
        return;
      }

      // 2MB size limit
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error('Logo image must be smaller than 2MB'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        try {
          localStorage.setItem(LOGO_STORAGE_KEY, base64);
          setLogo(base64);
          resolve();
        } catch {
          reject(new Error('Storage quota exceeded. Please upload a smaller image file.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  };

  const resetLogo = () => {
    localStorage.removeItem(LOGO_STORAGE_KEY);
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

import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    deferredPWAInstallPrompt?: any;
  }
}

export function usePwaInstall() {
  const [prompt, setPrompt] = useState<any>(() => window.deferredPWAInstallPrompt || null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );
  });
  const [showModal, setShowModal] = useState<boolean>(false);

  // Detect platform
  const getPlatform = (): 'ios' | 'android' | 'desktop' => {
    if (typeof window === 'undefined') return 'desktop';
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
    if (/android/.test(userAgent)) return 'android';
    return 'desktop';
  };

  const platform = getPlatform();

  useEffect(() => {
    // 1. Initial check
    if (window.deferredPWAInstallPrompt) {
      setPrompt(window.deferredPWAInstallPrompt);
    }

    // 2. Listener for prompt ready
    const handlePromptReady = () => {
      setPrompt(window.deferredPWAInstallPrompt);
    };

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      window.deferredPWAInstallPrompt = e;
      setPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setPrompt(null);
      window.deferredPWAInstallPrompt = null;
    };

    window.addEventListener('pwa-prompt-ready', handlePromptReady);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('pwa-prompt-ready', handlePromptReady);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    const activePrompt = prompt || window.deferredPWAInstallPrompt;
    if (activePrompt) {
      try {
        activePrompt.prompt();
        const choice = await activePrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setIsInstalled(true);
          setPrompt(null);
          window.deferredPWAInstallPrompt = null;
          setShowModal(false);
          return;
        }
      } catch (err) {
        console.warn('Install prompt error:', err);
      }
    }
    // If prompt is not available or user needs browser guidance (iOS / desktop address bar), open guide modal
    setShowModal(true);
  }, [prompt]);

  return {
    isInstallable: !!prompt || !isInstalled,
    isInstalled,
    hasNativePrompt: !!prompt,
    platform,
    showModal,
    setShowModal,
    triggerInstall,
  };
}

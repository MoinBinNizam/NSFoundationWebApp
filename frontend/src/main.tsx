import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { PreferencesProvider } from './context/PreferencesContext.tsx';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Make sure index.html contains <div id="root"></div>.');
}

createRoot(rootElement).render(
  <StrictMode>
    <PreferencesProvider><App /></PreferencesProvider>
  </StrictMode>
);

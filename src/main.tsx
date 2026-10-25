import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { tauriApi } from './services/tauriApi';
import './styles/index.css';

// Forward uncaught WebView runtime errors and unhandled Promise rejections to puntano.log
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // Ignore resource load events on <img>/<video> elements (handled gracefully by MediaThumbnail/Lightbox)
    if (event.target && event.target !== window) return;
    const msg = event.error?.stack || `${event.message} (${event.filename}:${event.lineno}:${event.colno})`;
    tauriApi.logFrontendEvent('error', 'window.onerror', msg);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? `${reason.name}: ${reason.message} | ${reason.stack || ''}`
        : typeof reason === 'string'
        ? reason
        : JSON.stringify(reason);
    tauriApi.logFrontendEvent('error', 'unhandledrejection', msg);
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

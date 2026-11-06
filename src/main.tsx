import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { startRemoteSync } from './lib/persistence';
import { pickPersisted, useAppStore } from './store/appStore';
import { captureSpotifyCallback } from './services/spotify';

// Návrat z přihlášení Spotify (/spotify?code=…): převzít a hned vyčistit adresu.
captureSpotifyCallback();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// PWA: offline cache aplikace (jen v produkčním buildu).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

// Volitelná synchronizace stavu na vlastní backend.
const syncUrl = import.meta.env.VITE_SYNC_URL;
if (syncUrl) {
  startRemoteSync(useAppStore, { baseUrl: syncUrl, token: import.meta.env.VITE_SYNC_TOKEN, pick: pickPersisted });
}

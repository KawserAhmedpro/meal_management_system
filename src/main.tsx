import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Register service worker for offline PWA functionality
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => console.log('ServiceWorker registered:', reg.scope))
      .catch((err) => console.log('ServiceWorker registration failed:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

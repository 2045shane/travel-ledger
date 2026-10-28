import './styles.css';
import { startApp } from './app.js';

const root = document.querySelector('#app');
startApp(root);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/';
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => undefined);
  });
}

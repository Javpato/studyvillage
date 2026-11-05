import {installBrowserGestures} from './input/browser-gestures';
import { t } from './i18n';
import { loadSpriteCatalog } from './assets/sprite-catalog';
import './style.css';
import { mountDiagnostic } from './diagnostics/page';
const disposeBrowserGestures=installBrowserGestures();
import.meta.hot?.dispose(disposeBrowserGestures);
const root = document.querySelector<HTMLDivElement>('#app')!;
if (new URLSearchParams(location.search).get('diagnostic') === '1') {
  mountDiagnostic(root);
} else {
  root.textContent = t('StudyVillage · Preparando tu rincón…');
  let graphics=true;
  loadSpriteCatalog().then(() => {graphics=false;return import('./bootstrap');}).then(({ startApp }) => startApp(root)).catch(() => {
    root.replaceChildren();
    const main = document.createElement('main'); main.className = 'diagnostic-page';
    const heading = document.createElement('h1'); heading.textContent = t(graphics?'No se pudieron cargar los gráficos.':'No se pudo abrir tu espacio local.');
    const detail = document.createElement('p'); detail.textContent = t(graphics?'Revisa los PNG del catálogo: los nombres y dimensiones deben coincidir con manifest.json. Tus datos guardados se conservan.':'Comprueba el almacenamiento y WebCrypto del navegador o WebView. Si los datos están dañados o son de otra versión, la copia original se conserva: no se ha reiniciado la base de datos. Haz una copia antes de repararla.');
    const link = document.createElement('a'); link.href = '?diagnostic=1'; link.textContent = t('Abrir diagnóstico multimedia');
    main.append(heading, detail, link); root.append(main);
  });
}

if (import.meta.env.PROD && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) window.addEventListener('load',()=>{void navigator.serviceWorker.register('./sw.js').catch(()=>{/* Offline installation unavailable; online app remains usable. */});});

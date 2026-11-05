import { MediaDiagnostic } from './media-diagnostic';
import { downloadLocal } from '../../../packages/runtime/src/local-bridge/files';

/** Standalone gate, shared unchanged by browser and Tauri (?diagnostic=1). */
export function mountDiagnostic(root: HTMLElement): () => void {
  root.innerHTML = `<main class="diagnostic-page"><a href="./">← Volver al vecindario</a><p class="eyebrow">STUDYVILLAGE / GATE MULTIMEDIA</p><h1>Primero, comprobar la conexión.</h1><p>Las pruebas sintéticas, las capturas locales y las pruebas entre dos equipos se registran por separado. Ninguna captura empieza al abrir esta página.</p><div class="diagnostic-actions"><button data-test="capabilities">Comprobar APIs</button><button data-test="microphone">Probar micrófono</button><button data-test="screen">Elegir pantalla o ventana</button><button data-test="loopback">Probar WebRTC sintético</button><button data-test="stop">Detener todas las pistas</button><button id="export-diagnostic">Exportar diagnóstico</button></div><p>Al compartir puedes mostrar notificaciones y contraseñas. Elige una ventana cuando el sistema lo permita. El audio del sistema está desactivado.</p><video id="diagnostic-preview" autoplay muted playsinline aria-label="Vista previa de la captura local"></video><ul id="diagnostic-results" aria-live="polite"></ul></main>`;
  const list = root.querySelector<HTMLUListElement>('#diagnostic-results')!;
  const preview = root.querySelector<HTMLVideoElement>('#diagnostic-preview')!;
  const diagnostic = new MediaDiagnostic(() => {
    list.replaceChildren(...diagnostic.entries.map(entry => {
      const li = document.createElement('li'); li.dataset.status = entry.status;
      const strong = document.createElement('strong'); strong.textContent = `${entry.status} · ${entry.test}`;
      const detail = document.createElement('p'); detail.textContent = entry.detail;
      li.append(strong, detail); return li;
    }));
    if (preview.srcObject !== diagnostic.preview) { preview.srcObject = diagnostic.preview; if (diagnostic.preview) void preview.play().catch(() => {}); }
    preview.hidden = !diagnostic.preview;
  });
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-test]')) {
    button.addEventListener('click', () => { void diagnostic.run(button.dataset.test as Parameters<MediaDiagnostic['run']>[0]); });
  }
  root.querySelector('#export-diagnostic')!.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ timestamp: new Date().toISOString(), note: 'Observaciones del runtime actual; no contiene identidad, dispositivos, rutas ni invitaciones.', entries: diagnostic.entries }, null, 2)], { type: 'application/json' });
    downloadLocal('studyvillage-diagnostic.json', blob);
  });
  diagnostic.capabilities();
  const stop = () => diagnostic.dispose();
  window.addEventListener('pagehide', stop);
  return () => { window.removeEventListener('pagehide', stop); diagnostic.dispose(); root.replaceChildren(); };
}

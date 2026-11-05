import { desktopBridge } from './desktop';

/** Opens a vetted link with the system: the desktop app asks the OS, the browser follows the link. */
export async function openExternal(url: string): Promise<void> {
  if (!url.startsWith('https://') && !url.startsWith('vscode://vscode.git/clone?url=')) throw new Error('Enlace no permitido.');
  const desktop = desktopBridge();
  if (desktop) {
    await desktop.openExternal(url);
    return;
  }
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external', { url });
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  if (url.startsWith('https://')) anchor.target = '_blank';
  anchor.click();
}


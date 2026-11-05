import { isNative } from '../storage/local-store';

export interface SelectedLocalFile { name: string; kind: 'text' | 'image' | 'pdf'; content: string; privatePath?: string; mime?: string }

/** Local gestures only. There is intentionally no read(path), openURL or execute API. */
export async function chooseLocalFile(): Promise<SelectedLocalFile | null> {
  if (isNative()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<SelectedLocalFile | null>('choose_local_file');
  }
  const file = await new Promise<File | null>(resolve => {
    const input = document.createElement('input'); input.type = 'file';
    input.accept = '.txt,.md,.ts,.tsx,.js,.json,.py,.rs,.c,.cpp,.h,.css,.html,.java,.cs,.sql,.png,.jpg,.jpeg,.pdf';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true }); input.click();
  });
  if (!file) return null;
  if (file.size > 4_194_304) throw new Error('Elige un archivo de hasta 4 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffLocalFile(bytes);
  if (kind !== 'text') {
    let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { name: file.name, kind, content: btoa(binary), mime: kind === 'pdf' ? 'application/pdf' : bytes[0] === 0x89 ? 'image/png' : 'image/jpeg' };
  }
  if (bytes.length > 1_048_576) throw new Error('El editor admite hasta 1 MiB de texto.');
  let content: string;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('Elige un archivo de texto UTF-8, PNG, JPEG o PDF.'); }
  if (content.includes('\0')) throw new Error('No se admiten archivos binarios en el editor.');
  return { name: file.name, kind, content };
}

export function sniffLocalFile(bytes: Uint8Array): 'text' | 'image' | 'pdf' {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-') return 'pdf';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((n, i) => bytes[i] === n)) return 'image';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image';
  return 'text';
}

export function downloadLocal(name: string, data: Blob): void {
  const url = URL.createObjectURL(data); const link = document.createElement('a');
  link.href = url; link.download = name; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function showLocalPreview(file: SelectedLocalFile): void {
  const bytes = Uint8Array.from(atob(file.content), char => char.charCodeAt(0));
  const mime = file.kind === 'pdf' ? 'application/pdf' : bytes[0] === 0x89 ? 'image/png' : 'image/jpeg';
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const dialog = document.createElement('dialog'); dialog.className = 'local-file-preview';
  const heading = document.createElement('h2'); heading.textContent = file.name;
  const note = document.createElement('p'); note.textContent = 'Vista local. Solo se verá en otro equipo si decides compartir tu pantalla.';
  const close = document.createElement('button'); close.textContent = 'Cerrar'; close.onclick = () => dialog.close();
  const media = document.createElement(file.kind === 'pdf' ? 'iframe' : 'img');
  if (media instanceof HTMLIFrameElement) { media.setAttribute('sandbox', ''); media.title = 'PDF local seleccionado'; }
  else media.alt = 'Imagen local seleccionada';
  media.src = url;
  dialog.append(heading, note, close, media); document.body.append(dialog);
  dialog.addEventListener('close', () => { media.src = 'about:blank'; URL.revokeObjectURL(url); dialog.remove(); }, { once: true });
  dialog.showModal(); close.focus();
}

/** Phone-portrait camera: the 768x432 scene shown zoomed inside a tall window, following the player. */
export const SCENE = { width: 768, height: 432 } as const;
export const PORTRAIT_ZOOM = { min: 1, max: 3, step: 0.5, initial: 1.5 } as const;
const KEY = 'studyvillage-portrait-zoom-v1';

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return PORTRAIT_ZOOM.initial;
  return Math.min(PORTRAIT_ZOOM.max, Math.max(PORTRAIT_ZOOM.min, Math.round(zoom / PORTRAIT_ZOOM.step) * PORTRAIT_ZOOM.step));
}

export function loadPortraitZoom(): number {
  try { const raw = localStorage.getItem(KEY); return raw === null ? PORTRAIT_ZOOM.initial : clampZoom(Number(raw)); } catch { return PORTRAIT_ZOOM.initial; }
}

export function savePortraitZoom(zoom: number): void {
  try { localStorage.setItem(KEY, String(clampZoom(zoom))); } catch { /* Zoom is a convenience; the game works without storage. */ }
}

/**
 * Offset of the scene inside a `windowW`x`windowH` window. Zoom 1 fills the whole window with the
 * scene (no bars); each extra step enlarges it. The player stays centred until an edge of the scene would show.
 */
export function portraitView(windowW: number, windowH: number, zoom: number, player: { x: number; y: number }): { ppu: number; x: number; y: number } {
  const scale = clampZoom(zoom);
  const ppu = Math.max(windowW / SCENE.width, windowH / SCENE.height) * scale; // CSS pixels per scene unit
  const axis = (window: number, size: number, focus: number) => {
    const span = size * ppu;
    if (span <= window) return (window - span) / 2;
    return Math.min(0, Math.max(window - span, window / 2 - focus * ppu));
  };
  return { ppu, x: Math.round(axis(windowW, SCENE.width, player.x)), y: Math.round(axis(windowH, SCENE.height, player.y)) };
}

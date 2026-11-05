export { toTex } from '../../../packages/core/src/whiteboard/math';
/**
 * LaTeX for the whiteboard.
 *
 * MathJax renders TeX to SVG made only of paths (fontCache: 'none'), so the
 * result needs no webfonts and contains no foreignObject. That matters twice:
 * the page CSP allows no font-src, and an SVG with foreignObject would taint
 * the canvas and break "Exportar PNG". The engine is loaded on first use only,
 * so people who never type a formula never download it.
 */

type Converter = (tex: string, display: boolean) => string;

let engine: Promise<Converter> | null = null;

function loadEngine(): Promise<Converter> {
  engine ??= (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/base/BaseConfiguration.js'),
      import('mathjax-full/js/input/tex/ams/AmsConfiguration.js'),
      import('mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js'),
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const doc = mathjax.document('', {
      InputJax: new TeX({ packages: ['base', 'ams', 'noundefined'] }),
      OutputJax: new SVG({ fontCache: 'none' }),
    });
    return (tex: string, display: boolean) => {
      const node = doc.convert(tex, { display });
      return adaptor.innerHTML(node);
    };
  })();
  return engine;
}

export interface MathImage { image: HTMLImageElement; width: number; height: number; baseline: number }
type Entry = { state: 'loading' } | { state: 'ready'; value: MathImage } | { state: 'error'; message: string };

const cache = new Map<string, Entry>();
/** Most recent ready image per formula at any resolution, shown while a sharper one loads. */
const fallback = new Map<string, MathImage>();
const MAX_CACHE = 300;
let mathGeneration = 0;

export function getMathGeneration(): number {
  return mathGeneration;
}

/**
 * Rasterisation steps. Formulas are drawn into the canvas as images, so they
 * must be rasterised at roughly the on-screen pixel density or zooming in
 * shows a blurry upscale. Snapping to a few steps keeps the cache bounded.
 */
export function rasterStep(pixelsPerUnit: number): number {
  for (const step of [1, 1.5, 2, 3, 4, 6]) if (pixelsPerUnit <= step) return step;
  return 8;
}

/**
 * Synchronous lookup for the render loop. The first call starts an async
 * render; until it decodes, the best previous resolution is returned, or null.
 * `width`/`height` are always in board units, whatever the raster density.
 */
export function mathImage(tex: string, sizePx: number, color: string, display = false, raster = 1): MathImage | 'error' | null {
  const base = `${sizePx}|${color}|${display ? 'D' : 'I'}|${tex}`;
  const key = `${raster}|${base}`;
  const hit = cache.get(key);
  if (hit?.state === 'ready') return hit.value;
  if (hit?.state === 'error') return 'error';
  if (!hit) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key, { state: 'loading' });
    void render(tex, sizePx, color, display, raster).then(
      (value) => { cache.set(key, { state: 'ready', value }); fallback.set(base, value); mathGeneration++; },
      (error: unknown) => { cache.set(key, { state: 'error', message: error instanceof Error ? error.message : 'TeX' }); mathGeneration++; },
    );
  }
  return fallback.get(base) ?? null;
}

async function render(tex: string, sizePx: number, color: string, display: boolean, raster: number): Promise<MathImage> {
  const convert = await loadEngine();
  const markup = convert(tex, display);
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = parsed.querySelector('svg');
  if (!svg || parsed.querySelector('parsererror')) throw new Error('TeX');
  // noundefined marks unknown commands in red; treat that as an error so the
  // board can show the source instead of a half-rendered formula.
  if (svg.querySelector('[data-mjx-error], [fill="red"]')) throw new Error('TeX');
  const viewBox = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some((n) => !Number.isFinite(n))) throw new Error('TeX');
  // MathJax viewBox units are thousandths of an em.
  const scale = sizePx / 1000;
  const width = Math.max(1, Math.ceil(viewBox[2] * scale));
  const height = Math.max(1, Math.ceil(viewBox[3] * scale));
  const baseline = Math.ceil((viewBox[3] + viewBox[1]) * scale);
  // The image's natural size is the raster size; callers draw it at width x
  // height board units, so higher density means a sharper, not larger, result.
  svg.setAttribute('width', String(Math.ceil(width * raster)));
  svg.setAttribute('height', String(Math.ceil(height * raster)));
  svg.removeAttribute('style');
  svg.setAttribute('color', color);
  const text = new XMLSerializer().serializeToString(svg).replace(/currentColor/g, color);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image, width, height, baseline };
  } finally {
    // Decoded pixels stay usable after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Wait for the engine, for export paths that must not draw placeholders. */
export async function mathReady(tex: string, sizePx: number, color: string, display = false, raster = 1): Promise<MathImage | 'error'> {
  for (let i = 0; i < 100; i += 1) {
    const key = `${raster}|${sizePx}|${color}|${display ? 'D' : 'I'}|${tex}`;
    const result = mathImage(tex, sizePx, color, display, raster);
    if (cache.get(key)?.state === 'loading') { await new Promise((resolve) => setTimeout(resolve, 30)); continue; }
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  return 'error';
}

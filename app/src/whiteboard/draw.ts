import type { BoardPoint, BoardStroke, BoardTextStyle } from '../../../packages/core/src/protocol/types';
import { COLORS, text } from '../ui/art';
import { mathImage, mathReady, rasterStep, toTex, type MathImage } from './math';
import { DEFAULT_CAMERA, strokesBounds, type BoardCamera, type BoardRect } from '../../../packages/core/src/whiteboard/model';
import { NOTE_FONTS,ensureExcalifont } from './fonts';

export interface BoardDraft { points: readonly BoardPoint[]; tool: BoardStroke['tool']; color: string; width: number; text?: string; textStyle?: BoardTextStyle }
/** Anything drawable: a stored stroke or an in-progress draft. */
type Drawable = Pick<BoardDraft, 'points' | 'tool' | 'color' | 'width' | 'text' | 'textStyle'>;

const PAPER = '#ffffff';
const GRID = '#eceef1';

/** Width doubles as the text size for notes: Fino 16px, Medio 22px, Grueso 34px. */
export function textFontPx(width: number): number {
  return 10 + width * 3;
}

// ---------------------------------------------------------- text layout --

type Line =
  | { kind: 'text'; value: string; w: number; h: number }
  | { kind: 'math'; source: string; tex: string; image: MathImage | 'error' | null; w: number; h: number };

interface Layout { lines: Line[]; w: number; h: number }

/** Pixels per board unit for the frame being drawn; set by drawBoard. */
let currentRaster = 1;

/** A line that is nothing but one formula renders in display style. */
function isDisplayMath(raw: string): boolean {
  return /^\s*\$[^$]+\$\s*$/.test(raw);
}

let measurer: CanvasRenderingContext2D | null = null;
function measureContext(): CanvasRenderingContext2D | null {
  if (measurer) return measurer;
  try { measurer = document.createElement('canvas').getContext('2d'); } catch { measurer = null; }
  return measurer;
}

/**
 * Lays a note out line by line. A line containing $...$ renders as one TeX
 * expression (plain words around the math become \text{}); any other line is
 * ordinary text. Math that is still loading or failed to parse is measured as
 * its source so the box never collapses.
 */
function layout(stroke: Pick<BoardStroke, 'text' | 'width' | 'color' | 'textStyle'>, ctx?: CanvasRenderingContext2D | null): Layout {
  const size = stroke.textStyle?.fontSize ?? textFontPx(stroke.width);
  const lineH = Math.round(size * 1.3);
  const c = ctx ?? measureContext();
  if (c) c.font = noteFont(stroke.textStyle, size);
  const lines: Line[] = [];
  const rawLines = (stroke.text ?? '').split('\n');
  const wrapped: string[] = [];
  for (const line of rawLines) {
    if (!stroke.textStyle?.boxWidth || toTex(line) || !c) { wrapped.push(line); continue; }
    // Wrap at spaces; only a single word wider than the box is split by characters.
    const limit = stroke.textStyle.boxWidth; let current = '';
    for (const word of line.split(/(\s+)/)) {
      if (!word) continue;
      if (current && c.measureText(current + word).width > limit) { wrapped.push(current.trimEnd()); current = /^\s+$/.test(word) ? '' : word; }
      else current += word;
      while (c.measureText(current).width > limit && current.length > 1) {
        let cut = current.length - 1; while (cut > 1 && c.measureText(current.slice(0, cut)).width > limit) cut--;
        wrapped.push(current.slice(0, cut)); current = current.slice(cut);
      }
    }
    wrapped.push(current);
  }
  for (const raw of wrapped) {
    const tex = toTex(raw);
    const textW = c ? c.measureText(raw).width : raw.length * size * 0.55;
    if (tex) {
      const image = mathImage(tex, Math.round(size * 1.15), stroke.color, isDisplayMath(raw), currentRaster);
      const ready = image && image !== 'error';
      lines.push({ kind: 'math', source: raw, tex, image, w: ready ? image.width : textW, h: ready ? Math.max(lineH, image.height + 4) : lineH });
    } else {
      lines.push({ kind: 'text', value: raw, w: textW, h: lineH });
    }
  }
  return { lines, w: stroke.textStyle?.boxWidth ?? Math.max(8, ...lines.map((line) => line.w)), h: Math.max(lineH, lines.reduce((sum, line) => sum + line.h, 0)) };
}

/** World-space box of a text note, for the eraser and for export bounds. */
export function textBox(stroke: BoardStroke): BoardRect | null {
  if (stroke.tool !== 'text' || !stroke.points.length) return null;
  const { w, h } = layout(stroke);
  return { x: stroke.points[0].x, y: stroke.points[0].y, w, h };
}

function noteFont(style: BoardTextStyle | undefined, size: number): string { return `${style?.italic ? 'italic ' : ''}${style?.bold === false ? 400 : 600} ${size}px ${NOTE_FONTS[style?.fontFamily ?? 'sans']}`; }

function drawNote(ctx: CanvasRenderingContext2D, stroke: Drawable): void {
  const anchor = stroke.points[0];
  if (!anchor) return;
  const size = stroke.textStyle?.fontSize ?? textFontPx(stroke.width);
  const box = layout(stroke, ctx);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = anchor.y;
  for (const line of box.lines) {
    const x = anchor.x + (stroke.textStyle?.align === 'center' ? (box.w-line.w)/2 : stroke.textStyle?.align === 'right' ? box.w-line.w : 0);
    if (line.kind === 'math' && line.image && line.image !== 'error') {
      ctx.drawImage(line.image.image, x, y + (line.h - line.image.height) / 2, line.image.width, line.image.height);
    } else {
      const failed = line.kind === 'math' && line.image === 'error';
      ctx.font = noteFont(stroke.textStyle, size);
      // Loading math shows its source in dark ink; broken math shows it in red so
      // the author can see what to fix.
      ctx.fillStyle = line.kind === 'math' ? (failed ? '#c0473a' : 'rgba(49,95,81,0.82)') : stroke.color;
      const value = line.kind === 'math' ? line.source : line.value, top = y + (line.h - size) / 2;
      ctx.fillText(value, x, top);
      if (stroke.textStyle?.underline && line.kind === 'text' && value.trim()) {
        ctx.fillRect(x, top + size * 1.02, ctx.measureText(value).width, Math.max(1, size / 14));
      }
    }
    y += line.h;
  }
}

// ----------------------------------------------------------- primitives --

function pathStroke(ctx: CanvasRenderingContext2D, stroke: Drawable): void {
  if (!stroke.points.length) return;
  if (stroke.tool === 'text') { drawNote(ctx, stroke); return; }
  const start = stroke.points[0];
  const end = stroke.points[stroke.points.length - 1];
  ctx.beginPath();
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  if (stroke.tool === 'pen') {
    ctx.moveTo(start.x, start.y);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (stroke.points.length === 1) ctx.lineTo(start.x + 0.1, start.y + 0.1);
  } else if (stroke.tool === 'line') {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  } else if (stroke.tool === 'circle') {
    ctx.ellipse((start.x+end.x)/2,(start.y+end.y)/2,Math.max(1,Math.abs(end.x-start.x)/2),Math.max(1,Math.abs(end.y-start.y)/2),0,0,Math.PI*2);
  } else if (stroke.tool === 'arrow') {
    ctx.moveTo(start.x,start.y); ctx.lineTo(end.x,end.y); const a=Math.atan2(end.y-start.y,end.x-start.x), h=Math.max(10,stroke.width*4);
    ctx.moveTo(end.x-h*Math.cos(a-.5),end.y-h*Math.sin(a-.5));ctx.lineTo(end.x,end.y);ctx.lineTo(end.x-h*Math.cos(a+.5),end.y-h*Math.sin(a+.5));
  } else {
    ctx.rect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(start.x - end.x), Math.abs(start.y - end.y));
  }
  ctx.stroke();
}

/** Dot grid in world space, thinned out as you zoom out so it never turns to noise. */
function drawGrid(ctx: CanvasRenderingContext2D, camera: BoardCamera, w: number, h: number): void {
  let step = 24;
  while (step * camera.zoom < 14) step *= 2;
  const x0 = Math.floor(camera.x / step) * step;
  const y0 = Math.floor(camera.y / step) * step;
  const dot = Math.max(1.5, 2 * Math.min(1, camera.zoom));
  ctx.fillStyle = GRID;
  for (let wx = x0; wx <= camera.x + w / camera.zoom; wx += step) {
    for (let wy = y0; wy <= camera.y + h / camera.zoom; wy += step) {
      ctx.fillRect((wx - camera.x) * camera.zoom - dot / 2, (wy - camera.y) * camera.zoom - dot / 2, dot, dot);
    }
  }
  // Mark the world origin, so "Centrar" has an obvious home.
  const ox = -camera.x * camera.zoom;
  const oy = -camera.y * camera.zoom;
  if (ox > -10 && ox < w + 10 && oy > -10 && oy < h + 10) {
    ctx.fillStyle = 'rgba(207,111,60,0.5)';
    ctx.fillRect(ox - 5, oy - 1, 10, 2);
    ctx.fillRect(ox - 1, oy - 5, 2, 10);
  }
}

/**
 * Draws the board through a camera. `w` and `h` are the view's logical size;
 * strokes are in world units, so the same data renders at any pan and zoom.
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  strokes: readonly BoardStroke[],
  draft: BoardDraft | null = null,
  camera: BoardCamera = DEFAULT_CAMERA,
  w = 768,
  h = 432,
  chrome = true,
  pixelRatio = 1,
): void {
  ctx.imageSmoothingEnabled = true;
  currentRaster = rasterStep(camera.zoom * pixelRatio);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, camera, w, h);
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  for (const stroke of strokes) if (!stroke.deleted) pathStroke(ctx, stroke);
  if (draft?.points.length) pathStroke(ctx, draft);
  ctx.restore();
  if (chrome) {
    ctx.fillStyle = 'rgba(30,55,48,0.06)';
    ctx.fillRect(0, 0, w, 22);
    text(ctx, 'STUDYVILLAGE · PIZARRA', 12, 15, COLORS.ink, 9, 'left');
    text(ctx, `${Math.round(camera.zoom * 100)}%`, w - 12, 15, COLORS.ink, 9, 'right');
  }
}

/**
 * Renders the whole board, however far it extends, to a fresh canvas for PNG
 * export. Waits for every formula first, so the file never contains a
 * half-loaded placeholder.
 */
export async function renderBoardForExport(strokes: readonly BoardStroke[]): Promise<HTMLCanvasElement> {
  if(strokes.some(stroke=>!stroke.deleted&&stroke.textStyle?.fontFamily==='excalifont'))await ensureExcalifont();
  for (const stroke of strokes) {
    if (stroke.tool !== 'text' || stroke.deleted) continue;
    const size = Math.round((stroke.textStyle?.fontSize ?? textFontPx(stroke.width)) * 1.15);
    for (const raw of (stroke.text ?? '').split('\n')) {
      const tex = toTex(raw);
      if (tex) await mathReady(tex, size, stroke.color, isDisplayMath(raw), rasterStep(2));
    }
  }
  const pad = 40;
  const bounds = strokesBounds(strokes, textBox) ?? { x: 0, y: 0, w: 768 - pad * 2, h: 432 - pad * 2 };
  const scale = Math.min(2, 4096 / Math.max(bounds.w + pad * 2, bounds.h + pad * 2));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((bounds.w + pad * 2) * scale);
  canvas.height = Math.ceil((bounds.h + pad * 2) * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  drawBoard(ctx, strokes, null, { x: bounds.x - pad, y: bounds.y - pad, zoom: scale }, canvas.width, canvas.height, false, 1);
  return canvas;
}

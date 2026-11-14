import {pointInPolygon} from './selection';
import { LIMITS, type BoardPoint, type BoardStroke } from '../protocol/types';

export type BoardTool = BoardStroke['tool'];
/** Tools that exist only in the UI and never become strokes. */
export type BoardUiTool = BoardTool | 'eraser' | 'hand' | 'select';
export const BOARD_COLORS = ['#315f51', '#df7e6c', '#3d78a2', '#c48b39', '#322f45'] as const;

const EXTENT = LIMITS.boardExtent;
const clampAxis = (value: number) => Math.round(Math.max(-EXTENT, Math.min(EXTENT, Number.isFinite(value) ? value : 0)) * 1000) / 1000;

/**
 * The board is unbounded in practice: points are world coordinates kept only
 * inside ±boardExtent. With the default camera, world equals the old 768x432
 * frame, so drawings made before the board became infinite stay put.
 */
export function clampBoardPoint(point: BoardPoint): BoardPoint {
  return { x: clampAxis(point.x), y: clampAxis(point.y) };
}

export function makeStroke(
  boardId: string, author: string, seq: number, tool: BoardTool,
  color: string, width: number, points: readonly BoardPoint[], id: string = crypto.randomUUID(), text?: string,
): BoardStroke {
  const normalized = (tool === 'text' ? points.slice(0, 1) : points.slice(0, LIMITS.strokePoints)).map(clampBoardPoint);
  const stroke: BoardStroke = {
    id, author, boardId, seq: Math.max(1, Math.floor(seq)), tool,
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : BOARD_COLORS[0],
    width: Math.max(1, Math.min(12, Math.round(width))), points: normalized, deleted: false,
  };
  if (tool === 'text') stroke.text = (text ?? '').slice(0, LIMITS.boardText);
  return stroke;
}

export function boardAtCapacity(strokes: readonly BoardStroke[], boardId: string): boolean {
  return false; // Storage availability, not lifetime operation count, determines capacity.
}

export function visibleStrokes(strokes: readonly BoardStroke[], boardId: string, hiddenAuthors: ReadonlySet<string>): BoardStroke[] {
  return strokes.filter((stroke) => stroke.boardId === boardId && !stroke.deleted && !hiddenAuthors.has(stroke.author));
}

export function canDeleteStroke(stroke: BoardStroke, author: string, boardId: string): boolean {
  return stroke.author === author && stroke.boardId === boardId && !stroke.deleted;
}

export function newestOwnStroke(strokes: readonly BoardStroke[], author: string, boardId: string): BoardStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (canDeleteStroke(strokes[i], author, boardId)) return strokes[i];
  }
  return null;
}

export function nextSequence(strokes: readonly BoardStroke[], author: string, boardId: string): number {
  return 1 + strokes.reduce((max, stroke) => stroke.author === author && stroke.boardId === boardId ? Math.max(max, stroke.seq) : max, 0);
}

// --------------------------------------------------------------- eraser --

export interface BoardRect { x: number; y: number; w: number; h: number }

function distanceToSegment(p: BoardPoint, a: BoardPoint, b: BoardPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Whether an eraser at `point` touches `stroke`. Text notes need their laid-out
 * box, which depends on fonts and rendered math, so the caller supplies it.
 */
export function strokeHit(stroke: BoardStroke, point: BoardPoint, radius: number, textBox?: BoardRect | null): boolean {
  if (stroke.deleted || !stroke.points.length) return false;
  if(stroke.tool==='fill'){for(let i=0;i<stroke.points.length;i+=4){const quad=stroke.points.slice(i,i+4);if(pointInPolygon(point,quad)||quad.some((p,j)=>distanceToSegment(point,p,quad[(j+1)%4])<=radius))return true;}return false;}
  const reach = radius + stroke.width / 2;
  const [first] = stroke.points;
  const last = stroke.points[stroke.points.length - 1];
  if (stroke.tool === 'text') {
    if (!textBox) return false;
    return point.x >= textBox.x - radius && point.x <= textBox.x + textBox.w + radius
      && point.y >= textBox.y - radius && point.y <= textBox.y + textBox.h + radius;
  }
  if (stroke.tool === 'rectangle') {
    const corners = [first, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }];
    return corners.some((corner, i) => distanceToSegment(point, corner, corners[(i + 1) % 4]) <= reach);
  }
  if (stroke.tool === 'line') return distanceToSegment(point, first, last) <= reach;
  if (stroke.points.length === 1) return Math.hypot(point.x - first.x, point.y - first.y) <= reach;
  for (let i = 1; i < stroke.points.length; i += 1) {
    if (distanceToSegment(point, stroke.points[i - 1], stroke.points[i]) <= reach) return true;
  }
  return false;
}

// --------------------------------------------------------------- camera --

/** screen = (world - camera) * zoom, in the board canvas's logical units. */
export interface BoardCamera { x: number; y: number; zoom: number }
export const DEFAULT_CAMERA: BoardCamera = { x: 0, y: 0, zoom: 1 };
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

export function screenToWorld(camera: BoardCamera, sx: number, sy: number): BoardPoint {
  return { x: sx / camera.zoom + camera.x, y: sy / camera.zoom + camera.y };
}

/** Zoom by `factor` while keeping the world point under the cursor fixed. */
export function zoomAt(camera: BoardCamera, sx: number, sy: number, factor: number): BoardCamera {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * factor));
  const anchor = screenToWorld(camera, sx, sy);
  return { zoom, x: anchor.x - sx / zoom, y: anchor.y - sy / zoom };
}

export function panBy(camera: BoardCamera, dxScreen: number, dyScreen: number): BoardCamera {
  return { ...camera, x: camera.x - dxScreen / camera.zoom, y: camera.y - dyScreen / camera.zoom };
}

/** World-space bounds of the given strokes, or null when there are none. */
export function strokesBounds(strokes: readonly BoardStroke[], textBox: (stroke: BoardStroke) => BoardRect | null): BoardRect | null {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const stroke of strokes) {
    if (stroke.deleted) continue;
    if (stroke.tool === 'text') {
      const box = textBox(stroke);
      if (!box) continue;
      minX = Math.min(minX, box.x); minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w); maxY = Math.max(maxY, box.y + box.h);
      continue;
    }
    const pad = stroke.width / 2;
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - pad); minY = Math.min(minY, point.y - pad);
      maxX = Math.max(maxX, point.x + pad); maxY = Math.max(maxY, point.y + pad);
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

/** A camera that frames `bounds` inside a view of the given size. */
export function fitCamera(bounds: BoardRect | null, viewW: number, viewH: number, padding = 48): BoardCamera {
  if (!bounds) return { ...DEFAULT_CAMERA };
  const zoom = Math.max(MIN_ZOOM, Math.min(1.5, Math.min(
    (viewW - padding * 2) / Math.max(1, bounds.w),
    (viewH - padding * 2) / Math.max(1, bounds.h),
  )));
  return { zoom, x: bounds.x + bounds.w / 2 - viewW / 2 / zoom, y: bounds.y + bounds.h / 2 - viewH / 2 / zoom };
}

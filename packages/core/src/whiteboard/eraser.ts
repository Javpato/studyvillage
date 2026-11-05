import type { BoardPoint, BoardStroke } from '../protocol/types';
import { strokeHit, type BoardRect } from './model';

export type EraserMode = 'stroke' | 'precision';
export interface EraserPreferences { mode: EraserMode; diameter: 8 | 16 | 32 }
type Interval = [number, number];
const EPS = 1e-8;
const pointAt = (a: BoardPoint, b: BoardPoint, t: number): BoardPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const same = (a: BoardPoint, b: BoardPoint) => Math.hypot(a.x - b.x, a.y - b.y) < EPS;

/** Parameter interval where a linear scalar lies inside [low, high]. */
function band(origin: number, delta: number, low: number, high: number): Interval | null {
  if (Math.abs(delta) < EPS) return origin >= low && origin <= high ? [0, 1] : null;
  const a = (low - origin) / delta, b = (high - origin) / delta;
  const first = Math.max(0, Math.min(a, b)), last = Math.min(1, Math.max(a, b));
  return first <= last ? [first, last] : null;
}
function circleInterval(a: BoardPoint, b: BoardPoint, center: BoardPoint, radius: number): Interval | null {
  const dx = b.x - a.x, dy = b.y - a.y, ox = a.x - center.x, oy = a.y - center.y;
  const aa = dx * dx + dy * dy, bb = 2 * (ox * dx + oy * dy), cc = ox * ox + oy * oy - radius * radius;
  if (aa < EPS) return cc <= 0 ? [0, 1] : null;
  const discriminant = bb * bb - 4 * aa * cc;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant), first = Math.max(0, (-bb - root) / (2 * aa)), last = Math.min(1, (-bb + root) / (2 * aa));
  return first <= last ? [first, last] : null;
}
/** Exact swept disk (capsule), including the path between pointer events. */
function cutIntervals(a: BoardPoint, b: BoardPoint, from: BoardPoint, to: BoardPoint, radius: number): Interval[] {
  const intervals: Interval[] = [];
  for (const center of [from, to]) { const hit = circleInterval(a, b, center, radius); if (hit) intervals.push(hit); }
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length > EPS) {
    const ux = (to.x - from.x) / length, uy = (to.y - from.y) / length;
    const ox = a.x - from.x, oy = a.y - from.y, dx = b.x - a.x, dy = b.y - a.y;
    const along = band(ox * ux + oy * uy, dx * ux + dy * uy, 0, length);
    const across = band(-ox * uy + oy * ux, -dx * uy + dy * ux, -radius, radius);
    if (along && across) { const low = Math.max(along[0], across[0]), high = Math.min(along[1], across[1]); if (low <= high) intervals.push([low, high]); }
  }
  const merged: Interval[] = [];
  for (const interval of intervals.sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1] + EPS) previous[1] = Math.max(previous[1], interval[1]); else merged.push([...interval]);
  }
  return merged;
}

/** Same geometry as the renderer, flattened only when a shape is actually cut. */
function outlines(stroke: BoardStroke): BoardPoint[][] {
  const first = stroke.points[0], last = stroke.points.at(-1)!;
  if (stroke.tool === 'rectangle') return [[first, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }, first]];
  if (stroke.tool === 'circle') {
    const cx = (first.x + last.x) / 2, cy = (first.y + last.y) / 2;
    const rx = Math.max(1, Math.abs(last.x - first.x) / 2), ry = Math.max(1, Math.abs(last.y - first.y) / 2);
    const count = Math.min(510, Math.max(64, Math.ceil(Math.PI * (rx + ry) / 2)));
    return [Array.from({ length: count + 1 }, (_, i) => ({ x: cx + rx * Math.cos(i / count * Math.PI * 2), y: cy + ry * Math.sin(i / count * Math.PI * 2) }))];
  }
  if (stroke.tool === 'arrow') {
    const angle = Math.atan2(last.y - first.y, last.x - first.x), h = Math.max(10, stroke.width * 4);
    return [[first, last], [{ x: last.x - h * Math.cos(angle - .5), y: last.y - h * Math.sin(angle - .5) }, last, { x: last.x - h * Math.cos(angle + .5), y: last.y - h * Math.sin(angle + .5) }]];
  }
  return [stroke.tool === 'line' ? [first, last] : stroke.points];
}

/** null means no ink was touched; [] means all ink was removed. Text is never cut. */
export function cutStroke(stroke: BoardStroke, from: BoardPoint, to: BoardPoint, radius: number): BoardPoint[][] | null {
  if (stroke.deleted || stroke.tool === 'text' || !stroke.points.length) return null;
  const reach = Math.max(0, radius) + stroke.width / 2;
  let touched = false;
  const result: BoardPoint[][] = [];
  for (const path of outlines(stroke)) {
    if (path.length === 1) {
      if (cutIntervals(path[0], path[0], from, to, reach).length) touched = true; else result.push(path);
      continue;
    }
    let current: BoardPoint[] | null = null;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], cuts = cutIntervals(a, b, from, to, reach);
      if (cuts.some(([low, high]) => high - low > EPS)) touched = true;
      let start = 0;
      const survivors: Interval[] = [];
      for (const [low, high] of cuts) { if (low > start + EPS) survivors.push([start, low]); start = Math.max(start, high); }
      if (start < 1 - EPS) survivors.push([start, 1]);
      for (const [low, high] of survivors) {
        const p = pointAt(a, b, low), q = pointAt(a, b, high);
        if (current && same(current.at(-1)!, p)) current.push(q); else { current = [p, q]; result.push(current); }
        if (high < 1 - EPS) current = null;
      }
      if (!survivors.length || survivors.at(-1)![1] < 1 - EPS) current = null;
    }
  }
  return touched ? result : null;
}

/** A local preview; only its final changes are committed, once, on pointerup. */
export class EraserGesture {
  private original: Map<string, BoardStroke>;
  private working: Map<string, BoardStroke>;
  private previous: BoardPoint | null = null;
  constructor(strokes: BoardStroke[], private readonly editable: (stroke: BoardStroke) => boolean, readonly mode: EraserMode, readonly radius: number, private readonly textBounds: (stroke: BoardStroke) => BoardRect | null) {
    this.original = new Map(strokes.map(s => [s.id, s])); this.working = new Map(this.original);
  }
  erase(point: BoardPoint): void {
    const from = this.previous ?? point; this.previous = point;
    for (const stroke of [...this.working.values()]) {
      if (stroke.deleted || !this.editable(stroke)) continue;
      const cut = cutStroke(stroke, from, point, this.radius);
      if (stroke.tool === 'text') {
        if (this.mode === 'precision') continue;
        const box = this.textBounds(stroke);
        const distance = Math.hypot(point.x - from.x, point.y - from.y);
        const steps = Math.max(1, Math.ceil(distance / Math.max(1, this.radius)));
        let hit = false;
        for (let i = 0; i <= steps && !hit; i++) hit = strokeHit(stroke, pointAt(from, point, i / steps), this.radius, box);
        if (!hit) continue;
      } else if (cut === null) continue;
      this.working.set(stroke.id, { ...stroke, deleted: true });
      if (this.mode === 'precision') for (const [index, points] of (cut ?? []).entries()) {
        const id = index === 0 ? stroke.id : crypto.randomUUID();
        this.working.set(id, { ...stroke, id, tool: 'pen', points, deleted: false });
      }
    }
  }
  conflicts(current: BoardStroke[]): boolean {
    const byId = new Map(current.map(s => [s.id, s]));
    return this.changes().some(s => {
      const original = this.original.get(s.id), now = byId.get(s.id);
      return !!original && (!now || now.seq !== original.seq || now.deleted !== original.deleted);
    });
  }
  changes(): BoardStroke[] { return [...this.working.values()].filter(s => this.original.has(s.id) ? s !== this.original.get(s.id) : !s.deleted); }
  preview(current: BoardStroke[]): BoardStroke[] {
    const byId = new Map(current.map(s => [s.id, s]));
    for (const stroke of this.changes()) byId.set(stroke.id, stroke);
    return [...byId.values()].filter(s => !s.deleted);
  }
}

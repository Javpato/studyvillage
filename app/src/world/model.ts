import {RESIDENTIAL_PARCELS} from '../../../packages/core/src/world/garden';
import { INTERACTION_REACH } from './interactions';
import { lampObstacles } from './lights';
import { LIMITS, type AppView, type Position, type PublicHouse } from '../../../packages/core/src/protocol/types';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Parcel extends Rect { slot: number; doorX: number; doorY: number }
export interface OccupiedParcel { parcel: Parcel; house: PublicHouse; name: string; ownerId: string; isOwn: boolean }

export const PARCELS:readonly Parcel[]=RESIDENTIAL_PARCELS;

export const WORLD_SPAWN: Position = { x: 240, y: 215, direction: 'down', moving: false };
export const WORLD_TREES = [
  { x: 13, y: 157 }, { x: 183, y: 156 }, { x: 294, y: 157 },
  { x: 462, y: 155 }, { x: 574, y: 157 }, { x: 750, y: 158 },
  { x: 15, y: 275 }, { x: 186, y: 275 }, { x: 295, y: 275 },
  { x: 460, y: 275 }, { x: 574, y: 275 }, { x: 750, y: 275 },
] as const;

export function occupiedParcels(view: AppView): OccupiedParcel[] {
  const { network, identity, ownHouse } = view;
  const byOwner = new Map(network.houses.map((house) => [house.ownerId, house]));
  byOwner.set(identity.fingerprint, ownHouse);
  const members = network.members.filter((member) => member.connected);
  // On a server, plots belong to residents whether or not they are online; visitors have none.
  if (network.residents) {
    const used = new Set<number>();
    return network.residents.flatMap(({ ownerId, slot, name }) => {
      const parcel = PARCELS[slot]; const house = byOwner.get(ownerId);
      if (!parcel || !house || used.has(slot)) return [];
      used.add(slot);
      return [{ parcel, house, name, ownerId, isOwn: ownerId === identity.fingerprint }];
    });
  }
  const slots = members.length
    ? members.map((member) => ({ ownerId: member.identity.fingerprint, slot: member.slot, name: member.identity.displayName }))
    : [{ ownerId: identity.fingerprint, slot: 0, name: identity.displayName }];
  if (!slots.some((member) => member.ownerId === identity.fingerprint)) {
    slots.push({ ownerId: identity.fingerprint, slot: 0, name: identity.displayName });
  }
  const usedSlots = new Set<number>();
  return slots.flatMap(({ ownerId, slot, name }) => {
    const parcel = PARCELS[slot];
    const house = byOwner.get(ownerId);
    if (!parcel || !house || usedSlots.has(slot)) return [];
    usedSlots.add(slot);
    return [{ parcel, house, name, ownerId, isOwn: ownerId === identity.fingerprint }];
  });
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function circleHitsRect(x: number, y: number, radius: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2;
}

export function stepPosition(
  from: Position,
  vector: { x: number; y: number },
  dtSeconds: number,
  obstacles: readonly Rect[],
  bounds: Rect = { x: 0, y: 0, w: LIMITS.worldWidth, h: LIMITS.worldHeight },
  speed = 110,
): Position {
  const radius = 9;
  const xDir = Math.sign(vector.x);
  const yDir = Math.sign(vector.y);
  const moving = xDir !== 0 || yDir !== 0;
  if (!moving) return { ...from, moving: false };
  const direction: Position['direction'] = Math.abs(vector.x) >= Math.abs(vector.y)
    ? (xDir < 0 ? 'left' : 'right')
    : (yDir < 0 ? 'up' : 'down');
  const dt = Math.max(0, Math.min(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0.05));
  const length = Math.hypot(vector.x, vector.y) || 1;
  const inBounds = (x: number, y: number) => x >= bounds.x + radius && x <= bounds.x + bounds.w - radius
    && y >= bounds.y + radius && y <= bounds.y + bounds.h - radius;
  const free = (x: number, y: number) => inBounds(x, y) && !obstacles.some((rect) => circleHitsRect(x, y, radius, rect));
  // A player already overlapping an obstacle (a spawn point under a new
  // object, an object moved onto them) may walk out instead of freezing.
  const inside = free(from.x, from.y) ? free : inBounds;
  let x = from.x;
  let y = from.y;
  const distance = Math.max(0, speed) * dt;
  const steps = Math.max(1, Math.ceil(distance / 4));
  for (let i = 0; i < steps; i++) {
    const nextX = x + vector.x / length * distance / steps;
    if (inside(nextX, y)) x = nextX;
    const nextY = y + vector.y / length * distance / steps;
    if (inside(x, nextY)) y = nextY;
  }
  return { ...from, x, y, direction, moving: x !== from.x || y !== from.y };
}

export function worldObstacles(occupied: readonly OccupiedParcel[]): Rect[] {
  return [
    ...lampObstacles('residential'),
    ...occupied.map(({ parcel }) => ({ x: parcel.x - 2, y: parcel.y - 6, w: parcel.w + 4, h: parcel.h + 5 })),
    ...WORLD_TREES.map(({ x, y }) => ({ x: x - 11, y: y - 16, w: 22, h: 25 })),
  ];
}

/**
 * A walkable route for click-to-walk: A* over an 8px grid using the same
 * collision as stepPosition, then trimmed to the corners that matter. The goal
 * snaps to the nearest walkable cell, since you usually click on the thing you
 * want to use rather than next to it. Returns null when nothing is reachable.
 */
export function findPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: readonly Rect[],
  bounds: Rect = { x: 0, y: 0, w: LIMITS.worldWidth, h: LIMITS.worldHeight },
  radius = 9,
): { x: number; y: number }[] | null {
  const cell = 8;
  const cols = Math.floor(bounds.w / cell);
  const rows = Math.floor(bounds.h / cell);
  const center = (i: number) => ({ x: bounds.x + (i % cols) * cell + cell / 2, y: bounds.y + Math.floor(i / cols) * cell + cell / 2 });
  const free = (x: number, y: number) => x >= bounds.x + radius && x <= bounds.x + bounds.w - radius
    && y >= bounds.y + radius && y <= bounds.y + bounds.h - radius
    && !obstacles.some((rect) => circleHitsRect(x, y, radius, rect));
  const walkable = new Uint8Array(cols * rows);
  for (let i = 0; i < walkable.length; i++) { const c = center(i); walkable[i] = free(c.x, c.y) ? 1 : 0; }
  const indexOf = (p: { x: number; y: number }) => {
    const col = Math.max(0, Math.min(cols - 1, Math.floor((p.x - bounds.x) / cell)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((p.y - bounds.y) / cell)));
    return row * cols + col;
  };
  const nearestWalkable = (start: number): number => {
    if (walkable[start]) return start;
    const seen = new Uint8Array(cols * rows);
    const queue = [start];
    seen[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (walkable[i]) return i;
      const col = i % cols;
      for (const n of [i - cols, i + cols, col > 0 ? i - 1 : -1, col < cols - 1 ? i + 1 : -1]) {
        if (n >= 0 && n < seen.length && !seen[n]) { seen[n] = 1; queue.push(n); }
      }
    }
    return -1;
  };
  const start = indexOf(from);
  const goal = nearestWalkable(indexOf(to));
  if (goal < 0) return null;
  // Someone standing inside an obstacle may still leave it.
  walkable[start] = 1;
  const g = new Float64Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const open: number[] = [start];
  const h = (i: number) => { const a = center(i); const b = center(goal); return Math.hypot(a.x - b.x, a.y - b.y); };
  const f = new Float64Array(cols * rows).fill(Infinity);
  g[start] = 0;
  f[start] = h(start);
  while (open.length) {
    let best = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[best]]) best = k;
    const current = open.splice(best, 1)[0];
    if (current === goal) break;
    closed[current] = 1;
    const col = current % cols;
    const row = Math.floor(current / cols);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const c = col + dx; const r = row + dy;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const n = r * cols + c;
        if (!walkable[n] || closed[n]) continue;
        // No cutting corners between two blocked cells.
        if (dx && dy && (!walkable[row * cols + c] || !walkable[r * cols + col])) continue;
        const cost = g[current] + (dx && dy ? Math.SQRT2 : 1) * cell;
        if (cost < g[n]) {
          if (g[n] === Infinity) open.push(n);
          g[n] = cost;
          f[n] = cost + h(n);
          came[n] = current;
        }
      }
    }
  }
  if (goal !== start && came[goal] < 0) return null;
  const cells: number[] = [];
  for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.unshift(i);
  const points = cells.map(center);
  const target = free(to.x, to.y) ? { x: to.x, y: to.y } : null;
  if (target) points.push(target);
  // Keep only the waypoints needed to go around things.
  const clear = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
    for (let s = 1; s <= steps; s++) if (!free(a.x + (b.x - a.x) * s / steps, a.y + (b.y - a.y) * s / steps)) return false;
    return true;
  };
  const route: { x: number; y: number }[] = [];
  let anchor = { x: from.x, y: from.y };
  for (let k = 0; k < points.length; k++) {
    const next = points[k + 1];
    if (next && clear(anchor, next)) continue;
    route.push(points[k]);
    anchor = points[k];
  }
  return route;
}

export function closestDoor(position: Position, occupied: readonly OccupiedParcel[], maxDistance = INTERACTION_REACH): OccupiedParcel | null {
  let closest: OccupiedParcel | null = null;
  let distance = maxDistance;
  for (const item of occupied) {
    const next = Math.hypot(item.parcel.doorX - position.x, item.parcel.doorY - position.y);
    if (next <= distance) { closest = item; distance = next; }
  }
  return closest;
}

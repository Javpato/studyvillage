import {humanSheet} from '../assets/pixel-cast/humans';
import { getRemoteAvatarSheet, getAvatarSheet } from '../assets/avatar-sheet';
import { sprite } from '../assets/sprite-catalog';
import { defaultText } from '../i18n';
import type { Position, PublicIdentity } from '../../../packages/core/src/protocol/types';

/**
 * Shared pixel-art toolkit. See docs/VISUAL_DESIGN.md for the rules this
 * encodes: one art pixel equals two logical units, and light always comes
 * from the top-left.
 */

export const PALETTE = {
  moss: ['#24402f', '#2f5a3e', '#3f7a4f', '#58a05f', '#7cc077', '#a6dc98'],
  earth: ['#5a4028', '#7a5739', '#9c7349', '#c09a64', '#e0c08a'],
  ember: ['#8c3f2c', '#c25f3c', '#e8884f', '#f6b265', '#ffd79a'],
  tide: ['#1f4a4e', '#2f6f73', '#47989b', '#74c0bd'],
  paper: ['#1e3730', '#3c5a4c', '#f2e7cd', '#fbf4e2', '#fffdf5'],
} as const;

/** Original key names kept so existing imports keep compiling. */
export const COLORS = {
  ink: '#1e3730', forest: '#2f5a3e', deep: '#24402f', mint: '#74c0bd',
  grass: '#58a05f', grassDark: '#2f5a3e', cream: '#f2e7cd', paper: '#fbf4e2',
  sand: '#e0c08a', coral: '#c25f3c', peach: '#f6b265', shadow: '#24402f',
};

import { getAvatarCustomization, type AvatarCustomization } from '../assets/custom-assets';

export const UNIT = 1;

/** Snap to the virtual pixel grid so every edge lands on a sharp boundary. */
export function ipx(value: number): number {
  return Math.round(value / UNIT) * UNIT;
}

export function fill(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(ipx(x), ipx(y), Math.max(UNIT, ipx(w)), Math.max(UNIT, ipx(h)));
}

/** Unsnapped fill, for sub-pixel work like soft gradients and glow pools. */
export function fillRaw(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, color = COLORS.ink, size = 11, align: CanvasTextAlign = 'center'): void {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(label, x, y, 200);
}

export function seed(x: number, y: number): number {
  let n = Math.imul(x + 33421, 1597334677) ^ Math.imul(y + 1699, 3812015801);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

/** Stable 0..1 hash from a string, used to desynchronise per-character motion. */
export function hash01(value: string): number {
  let n = 2166136261;
  for (let i = 0; i < value.length; i += 1) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return ((n >>> 0) % 10000) / 10000;
}

/**
 * Whether the viewer asked for reduced motion. Decorative canvas animation
 * (sway, drifting motes, flicker, smoke) is suppressed when this is true, to
 * match the CSS media query. Character walk cycles are kept: they convey
 * state rather than decoration.
 */
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Soft elliptical contact shadow. Cheap: stacked rects, no shadowBlur. */
export function contactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, strength = 0.26): void {
  for (let i = 3; i >= 1; i -= 1) {
    const r = radius * (i / 3);
    ctx.fillStyle = `rgba(26,48,38,${(strength * (4 - i)) / 6})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, Math.max(1.4, r * 0.42), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Warm pool of light on the ground, for lamps and windows.
 * The gradient is rasterised once per tint into a small sprite and then blitted
 * scaled. Building a fresh radial gradient on every call cost a dropped frame
 * roughly every twenty, because a busy scene issues a dozen of these per frame.
 */
const GLOW_SIZE = 128;
const glowSprites = new Map<string, HTMLCanvasElement>();

function glowSprite(tint: string): HTMLCanvasElement | null {
  const cached = glowSprites.get(tint);
  if (cached) return cached;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = GLOW_SIZE;
  canvas.height = GLOW_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const r = GLOW_SIZE / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, `rgba(${tint},0.30)`);
  gradient.addColorStop(0.55, `rgba(${tint},0.12)`);
  gradient.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  glowSprites.set(tint, canvas);
  return canvas;
}

export function glowPool(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, tint = '255,196,110'): void {
  const sprite = glowSprite(tint);
  if (sprite) {
    ctx.drawImage(sprite, x - radius, y - radius * 0.5, radius * 2, radius);
    return;
  }
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${tint},0.30)`);
  gradient.addColorStop(0.55, `rgba(${tint},0.12)`);
  gradient.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Chamfered pixel plate used for signs and name plates. */
export function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, face: string, edge: string): void {
  fill(ctx, edge, x, y + 2, w, h - 4);
  fill(ctx, edge, x + 2, y, w - 4, h);
  fill(ctx, face, x + 2, y + 2, w - 4, h - 6);
  fill(ctx, face, x + 4, y + 2, w - 8, h - 4);
}

// ---------------------------------------------------------------------------
// Per-character animation state. Presentation only: it never feeds back into
// movement, collision or networking, it only decides what gets painted.
// ---------------------------------------------------------------------------

interface CharacterAnim {
  walk: number;
  idle: number;
  renderX: number;
  renderY: number;
  lastSeen: number;
  facing: Position['direction'];
  turn: number;
  sceneId?: string;
}

const anims = new Map<string, CharacterAnim>();
let frameClock = 0;

/** Advance all character animation by dt seconds. Called once per frame. */
export function advanceAnim(dt: number): void {
  frameClock += dt;
  for (const [key, state] of anims) {
    if (frameClock - state.lastSeen > 5) anims.delete(key);
  }
}

export function renderedCharacterPosition(id:string):{x:number;y:number}|null {const s=anims.get(id);return s?{x:s.renderX,y:s.renderY}:null;}

export function animClock(): number {
  return frameClock;
}

function animFor(id: string, position: Position): CharacterAnim {
  let state = anims.get(id);
  if (!state) {
    state = {
      walk: hash01(id) * 10,
      idle: hash01(id) * 6,
      renderX: position.x,
      renderY: position.y,
      lastSeen: frameClock,
      facing: position.direction,
      turn: 1,
    };
    anims.set(id, state);
  }
  return state;
}

/**
 * Update the drawn position for one character.
 * `smooth` interpolates toward the authoritative position, which is what
 * remote peers need because their updates arrive at roughly 12 Hz. The local
 * character passes smooth=false so input stays immediate.
 */
export function trackCharacter(id: string, position: Position, dt: number, smooth: boolean, sceneId = 'residential'): { x: number; y: number } {
  const state = animFor(id, position);
  state.lastSeen = frameClock;
  if (state.sceneId !== sceneId) { state.renderX = position.x; state.renderY = position.y; state.sceneId = sceneId; }

  if (smooth) {
    const blend = 1 - Math.pow(0.0015, dt);
    state.renderX += (position.x - state.renderX) * blend;
    state.renderY += (position.y - state.renderY) * blend;
    if (Math.hypot(position.x - state.renderX, position.y - state.renderY) > 96) {
      state.renderX = position.x;
      state.renderY = position.y;
    }
  } else {
    state.renderX = position.x;
    state.renderY = position.y;
  }

  if (position.direction !== state.facing) {
    state.facing = position.direction;
    state.turn = 0;
  }
  state.turn = Math.min(1, state.turn + dt * 9);

  if (position.moving) {
    state.walk += dt * 9.2;
    state.idle = 0;
  } else {
    // Ease the stride back to a neutral stance instead of freezing mid-step.
    const rest = Math.round(state.walk / Math.PI) * Math.PI;
    state.walk += (rest - state.walk) * Math.min(1, dt * 12);
    state.idle += dt;
  }
  return { x: state.renderX, y: state.renderY };
}

/**
 * Scene-change fade. The stage canvas is reused when moving between the
 * village and a house, so no CSS animation retriggers; this gives that switch
 * the same sense of travel without touching the view logic that owns the pane.
 * Returns progress from 0 to 1, where 1 means the transition has finished.
 */
const SCENE_MS = 300;
let sceneKey = '';
let sceneStart = -1;

export function sceneProgress(key: string): number {
  if (key !== sceneKey) {
    sceneKey = key;
    sceneStart = frameClock;
  }
  if (sceneStart < 0) return 1;
  if (reducedMotion()) return 1;
  return Math.min(1, (frameClock - sceneStart) / (SCENE_MS / 1000));
}

/** Paints the fade for a scene change. A no-op once the transition is done. */
export function paintSceneFade(ctx: CanvasRenderingContext2D, key: string, w: number, h: number, tint = '14,26,20'): void {
  const t = sceneProgress(key);
  if (t >= 1) return;
  // Ease-out so the scene is legible almost immediately and the tail is gentle.
  const alpha = Math.pow(1 - t, 2.2);
  ctx.fillStyle = `rgba(${tint},${alpha.toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
}

const SKIN = ['#8c5a3c', '#c98f63', '#f0c69a'];
const HAIR = ['#2a2018', '#3f3124', '#5a4530'];

/** Slightly shift a hex colour's brightness, for deriving shade/tint pairs. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const avatarSheets = new Map<string, HTMLCanvasElement>();
export function avatarSpriteSheet(identity:PublicIdentity, appearance?:AvatarCustomization):HTMLCanvasElement {
 const key=JSON.stringify([identity.fingerprint,identity.color,appearance]);let sheet=avatarSheets.get(key);if(sheet)return sheet;
 sheet=humanSheet(appearance??{},identity.color);
 if(avatarSheets.size>80)avatarSheets.delete(avatarSheets.keys().next().value!);avatarSheets.set(key,sheet);return sheet;
}
export function drawAvatar(ctx:CanvasRenderingContext2D,x:number,y:number,identity:PublicIdentity,position:Position,isOwn=false,options?:{appearance?:AvatarCustomization;preview?:boolean;sheet?:HTMLImageElement|null}):void {
 const look=options?.appearance??(isOwn?getAvatarCustomization():undefined);
 const sheet=(look?.useCustomSheet?(options?.sheet??(isOwn?getAvatarSheet():getRemoteAvatarSheet(identity.fingerprint))):null)??sprite('avatar')??avatarSpriteSheet(identity,look);
 const row=['down','left','right','up'].indexOf(position.direction);const walk=anims.get(identity.fingerprint)?.walk??0;
 const frame=position.moving?(Math.sin(walk)>0?1:2):0;ctx.imageSmoothingEnabled=false;ctx.drawImage(sheet,frame*64,row*64,64,64,Math.round(x)-32,Math.round(y)-52,64,64);
 if(isOwn&&!options?.preview){ctx.strokeStyle='#fff0c8';ctx.beginPath();ctx.ellipse(x,y+6,11,4,0,0,Math.PI*2);ctx.stroke();}
 if(options?.preview)return;
 const name=defaultText(identity.displayName).slice(0,18);ctx.font='700 9.5px system-ui';const width=Math.min(145,Math.ceil(ctx.measureText(name).width)+18);
 plate(ctx,x-width/2,y-60,width,15,'#fbf4e2','#3c5a4c');ctx.fillStyle=COLORS.ink;ctx.textAlign='center';ctx.fillText(name,x,y-49);
}


export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, sway = 0, variant = 0): void {
  const asset=sprite(`world-tree-${variant%3}`);if(asset){ctx.drawImage(asset,ipx(x-32*scale+sway),ipx(y-48*scale),64*scale,64*scale);return;}
  const [d0, d1, d2, d3, d4, d5] = PALETTE.moss;
  contactShadow(ctx, x, y + 10, 14 * scale, 0.36);
  ctx.save();
  ctx.translate(ipx(x), ipx(y));
  ctx.scale(scale, scale);

  fill(ctx, PALETTE.earth[0], -4, -4, 9, 16);
  fill(ctx, PALETTE.earth[1], -4, -4, 5, 16);
  fill(ctx, PALETTE.earth[2], -4, -4, 2, 13);
  fill(ctx, d0, -7, 8, 14, 4);

  ctx.translate(Math.round(sway), 0);
  if (variant === 1) {
    // Tall and narrow.
    fill(ctx, d0, -12, -30, 24, 30);
    fill(ctx, d1, -12, -33, 22, 29);
    fill(ctx, d2, -10, -38, 18, 27);
    fill(ctx, d3, -9, -41, 15, 19);
    fill(ctx, d4, -7, -42, 10, 10);
    fill(ctx, d5, -6, -41, 5, 4);
  } else if (variant === 2) {
    // Low and broad.
    fill(ctx, d0, -18, -20, 36, 22);
    fill(ctx, d1, -18, -23, 33, 21);
    fill(ctx, d2, -15, -27, 27, 20);
    fill(ctx, d3, -13, -29, 21, 15);
    fill(ctx, d4, -11, -30, 13, 9);
    fill(ctx, d5, -10, -29, 6, 4);
    fill(ctx, d1, 9, -15, 7, 9);
  } else {
    fill(ctx, d0, -15, -25, 31, 26);
    fill(ctx, d1, -15, -28, 28, 25);
    fill(ctx, d2, -13, -32, 23, 23);
    fill(ctx, d3, -12, -35, 19, 18);
    fill(ctx, d4, -10, -36, 13, 10);
    fill(ctx, d5, -9, -35, 6, 4);
    fill(ctx, d1, 7, -18, 7, 9);
  }
  fill(ctx, d0, -13, -7, 9, 7);
  ctx.restore();
}

/**
 * Small key prompt that floats above the character when an action is
 * available, such as "E · Entrar" at a door. It tells the player the key
 * works here, which matters now that E only acts at doorways.
 */
export function drawPrompt(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  const bob = reducedMotion() ? 0 : Math.round(Math.sin(frameClock * 4) * 1.5);
  ctx.font = '700 9.5px Inter, ui-sans-serif, system-ui, sans-serif';
  const w = Math.ceil(ctx.measureText(label).width) + 16;
  const px = Math.round(x - w / 2);
  const py = Math.round(y) + bob;
  plate(ctx, px, py, w, 16, 'rgba(255,215,154,0.97)', 'rgba(90,64,40,0.85)');
  fill(ctx, 'rgba(90,64,40,0.85)', x - 2, py + 15, 4, 3);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.paper[0];
  ctx.fillText(label, Math.round(x), py + 12);
}

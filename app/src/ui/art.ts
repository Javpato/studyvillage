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
 sheet=document.createElement('canvas');sheet.width=192;sheet.height=256;const c=sheet.getContext('2d')!;
 const directions=['down','left','right','up'] as const;
 for(let row=0;row<4;row++)for(let column=0;column<3;column++){
  c.save();c.beginPath();c.rect(column*64,row*64,64,64);c.clip();
  drawAvatarSource(c,column*64+32,row*64+52,identity,{x:0,y:0,moving:column!==0,direction:directions[row]},false,{appearance,preview:true,frame:column===2?3:column});c.restore();
 }
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

function drawAvatarSource(ctx: CanvasRenderingContext2D, x: number, y: number, identity: PublicIdentity, position: Position, isOwn = false, options?: { appearance?: AvatarCustomization; preview?: boolean; frame?: number }): void {
  const id = identity.fingerprint || identity.displayName;
  const state = options?.preview ? undefined : anims.get(id);
  const custom = options?.appearance ?? (isOwn ? getAvatarCustomization() : null);
  const tone = hash01(id + 'skin');
  const skin = custom?.skinTone || SKIN[Math.floor(tone * SKIN.length) % SKIN.length];
  const hair = custom?.hairColor || HAIR[Math.floor(hash01(id + 'hair') * HAIR.length) % HAIR.length];
  const hairStyle = custom?.hairStyle || 'short';
  const feminine = custom?.body === 'feminine';
  const accessory = custom?.accessory || 'none';
  const shirt = custom?.outfitColor || identity.color || COLORS.coral;
  const shirtLit = shade(shirt, 26);
  const shirtDark = shade(shirt, -42);

  const walk = options?.frame !== undefined ? options.frame * Math.PI / 2 : state ? state.walk : 0;
  const idle = state ? state.idle : 0;
  const moving = position.moving;

  // Vertical bob: a short hop on each stride, or a slow breath when still.
  // The idle breath is decorative, so it stops under reduced motion; the
  // stride hop stays, because it communicates that the character is walking.
  const stride = Math.sin(walk);
  const breath = reducedMotion() ? 0 : Math.sin(idle * 1.9) * 0.7;
  const bob = moving ? -Math.abs(Math.sin(walk)) * 2 : breath;
  const squash = moving ? Math.abs(Math.cos(walk)) * 0.8 : 0;
  const facing = position.direction;
  const side=facing==='left'||facing==='right';
  const lead=facing==='right'?1:-1;

  const baseY = Math.round(y);
  contactShadow(ctx, Math.round(x), baseY + 5, 10 + squash, 0.32);

  ctx.save();
  ctx.translate(Math.round(x), baseY + Math.round(bob));
  // Slightly larger than the 9px collision radius so the character reads at
  // a glance. Presentation only: collision and movement are untouched.
  ctx.scale(1, 1);

  const pants = custom?.pantsColor || '#2c4238';
  // Legs swing in opposition; when idle they stand together.
  const swing = moving ? Math.round(stride * 2.4) : 0;
  if (facing === 'left' || facing === 'right') {
    const lead = facing === 'right' ? 1 : -1;
    fill(ctx, pants, -4 + swing * lead, 0, 4, 8 - Math.abs(swing) / 2);
    fill(ctx, shade(pants, 18), 0 - swing * lead, 0, 4, 8 - Math.abs(swing) / 2);
  } else {
    fill(ctx, pants, -5, 0, 4, 8 - Math.abs(swing));
    fill(ctx, shade(pants, 18), 1, 0, 4, 8 - Math.abs(swing));
  }

  // Torso with a lit top-left face and a shaded bottom-right edge.
  const torsoY = -15 - Math.round(squash);
  if(side){
    // A profile torso has narrow shoulders, a waist, and a chest on the facing edge.
    fill(ctx,shirtDark,-5,torsoY,10,16);
    fill(ctx,shirt,-5,torsoY,feminine?8:9,14);
    fill(ctx,shirtLit,-5,torsoY,7,3);
    fill(ctx,shirtDark,lead>0?4:-6,torsoY+4,2,5);
    if(feminine){fill(ctx,shirtDark,-5,torsoY+8,2,4);fill(ctx,shirt, -5,torsoY+12,9,3);}
  } else if (feminine) {
    // Narrower shoulders, a waist and hips.
    fill(ctx, shirtDark, -7, torsoY, 14, 7);
    fill(ctx, shirtDark, -6, torsoY + 6, 12, 5);
    fill(ctx, shirtDark, -7, torsoY + 10, 14, 6);
    fill(ctx, shirt, -7, torsoY, 12, 6);
    fill(ctx, shirt, -6, torsoY + 6, 10, 4);
    fill(ctx, shirt, -7, torsoY + 10, 12, 4);
    fill(ctx, shirtLit, -7, torsoY, 9, 3);
  } else {
    fill(ctx, shirtDark, -8, torsoY, 16, 16);
    fill(ctx, shirt, -8, torsoY, 14, 14);
    fill(ctx, shirtLit, -8, torsoY, 10, 4);
  }

  // Arms track the opposite phase of the legs.
  if (side) {
    fill(ctx,shade(shirt,-50),-2,torsoY+3+swing*lead,3,9);
  } else if (feminine) {
    fill(ctx, shirtDark, -10, torsoY + 3 + swing, 3, 9);
    fill(ctx, shirtDark, 7, torsoY + 3 - swing, 3, 9);
  } else {
    fill(ctx, shirtDark, -11, torsoY + 3 + swing, 4, 9);
    fill(ctx, shirtDark, 7, torsoY + 3 - swing, 4, 9);
  }

  if (custom) drawClothing(ctx, custom, facing, torsoY, swing, shirt);
  if(side){
    const sleeve=custom?.jacket&&custom.jacket!=='none'?custom.jacketColor:shirt;
    const armY=torsoY+3-swing*lead,armX=-2+Math.round(swing*.4)*lead;
    fill(ctx,shade(sleeve,-20),armX,armY,4,8);fill(ctx,shade(sleeve,12),armX,armY,2,6);
    fill(ctx,skin,armX,armY+8,3,3);
    // Feet point along the stride, rather than across the viewer.
    fill(ctx,shade(pants,-25),-3+swing*lead+(lead>0?0:-2),6-Math.abs(swing)/2,6,2);
  }

  // Head, hair and a simple face.
  const headY = torsoY - 10;
  fill(ctx, shade(skin, -40), -7, headY, 14, 12);
  fill(ctx, skin, -7, headY, 12, 11);
  fill(ctx, shade(skin, 18), -7, headY + 2, 4, 5);
  const longSides = hairStyle === 'long' || (feminine && hairStyle !== 'ponytail' && hairStyle !== 'bun' && hairStyle !== 'spiky');
  // Feminine long hair falls past the shoulders.
  const sideHair = longSides ? (feminine ? 17 : 13) : 9;
  if (hairStyle === 'bun') {
    fill(ctx, hair, -3, headY - 7, 6, 5);
    fill(ctx, shade(hair, 20), -2, headY - 7, 3, 2);
  }
  if (facing === 'up') {
    // Facing away: the back of the head is all hair.
    fill(ctx, hair, -7, headY - 2, 14, longSides ? (feminine ? 19 : 15) : 12);
    fill(ctx, shade(hair, 18), -7, headY - 2, 14, 3);
    if (hairStyle === 'ponytail') {
      fill(ctx, '#c9606a', -1, headY + 8, 3, 2);
      fill(ctx, hair, -2, headY + 10, 5, 7);
      fill(ctx, shade(hair, -18), 1, headY + 11, 2, 6);
    }
  } else {
    if (hairStyle === 'ponytail') {
      // The tail swings out behind the head.
      const tx = facing === 'left' ? 6 : facing === 'right' ? -9 : 6;
      fill(ctx, hair, tx, headY, 3, facing === 'down' ? 8 : 11);
      fill(ctx, shade(hair, -18), tx + 1, headY + 3, 2, facing === 'down' ? 5 : 8);
      if (facing !== 'down') fill(ctx, '#c9606a', tx, headY, 3, 2);
    }
    fill(ctx, hair, -8, headY - 3, 15, 6);
    fill(ctx, shade(hair, 16), -8, headY - 3, 15, 2);
    if (hairStyle === 'spiky') {
      fill(ctx, hair, -7, headY - 6, 3, 3);
      fill(ctx, hair, -2, headY - 7, 4, 4);
      fill(ctx, hair, 3, headY - 6, 3, 3);
    } else if (hairStyle === 'curly') {
      fill(ctx, hair, -9, headY - 4, 17, 6);
      fill(ctx, shade(hair, 20), -8, headY - 5, 5, 3);
      fill(ctx, shade(hair, 20), 1, headY - 5, 5, 3);
    } else if (hairStyle === 'beanie') {
      fill(ctx, '#c9604a', -8, headY - 5, 16, 6);
      fill(ctx, '#e2886f', -8, headY - 2, 16, 2);
      fill(ctx, '#f4efdd', -2, headY - 7, 4, 2);
    }
    if (facing === 'down') {
      const sideLen = sideHair;
      fill(ctx, hair, -8, headY - 3, 3, sideLen);
      fill(ctx, hair, 4, headY - 3, 3, sideLen);
      if (feminine && hairStyle !== 'spiky') fill(ctx, hair, -7, headY, 7, 2);
      fill(ctx, '#2b2b26', -4, headY + 5, 2, 2);
      fill(ctx, '#2b2b26', 2, headY + 5, 2, 2);
      if (feminine) {
        // Lashes, blush and lips.
        fill(ctx, '#2b2b26', -5, headY + 4, 1, 1);
        fill(ctx, '#2b2b26', 4, headY + 4, 1, 1);
        fill(ctx, '#e8978a', -6, headY + 7, 2, 1);
        fill(ctx, '#e8978a', 4, headY + 7, 2, 1);
        fill(ctx, '#c9606a', -1, headY + 8, 3, 1);
      } else {
        fill(ctx, shade(skin, -30), -1, headY + 8, 3, 1);
      }
    } else if (facing === 'left') {
      fill(ctx, hair, -8, headY - 3, 4, longSides ? sideHair : 10);
      fill(ctx, '#2b2b26', -4, headY + 5, 2, 2);
      if (feminine) { fill(ctx, '#2b2b26', -5, headY + 4, 1, 1); fill(ctx, '#e8978a', -3, headY + 7, 2, 1); }
    } else {
      fill(ctx, hair, 3, headY - 3, 4, longSides ? sideHair : 10);
      fill(ctx, '#2b2b26', 2, headY + 5, 2, 2);
      if (feminine) { fill(ctx, '#2b2b26', 4, headY + 4, 1, 1); fill(ctx, '#e8978a', 1, headY + 7, 2, 1); }
    }
  }

  // Glasses and headwear are independent layers; both can be worn with a jacket.
  const eyewear = custom?.eyewear ?? (accessory === 'glasses' ? 'square' : 'none');
  if (eyewear !== 'none' && facing !== 'up') {
    const lenses = facing === 'left' ? [-5] : facing === 'right' ? [1] : [-5, 1];
    for (const lx of lenses) {
      fill(ctx, '#24332d', lx, headY + 4, 5, 4);
      fill(ctx, eyewear === 'sunglasses' ? '#243e4b' : '#a1cbd0', lx + 1, headY + 5, 3, 2);
      if (eyewear === 'round') { fill(ctx, skin, lx, headY + 4, 1, 1); fill(ctx, skin, lx + 4, headY + 7, 1, 1); }
      if (eyewear !== 'sunglasses') fill(ctx, '#26332c', lx + 2, headY + 5, 1, 1);
    }
    if (facing === 'down') fill(ctx, '#24332d', -1, headY + 5, 2, 1);
  }
  if (accessory === 'headphones') {
    const headphoneColor=custom?.headphonesColor??'#cf6f3c';
    fill(ctx, shade(headphoneColor,-45), -9, headY - 4, 18, 2);
    fill(ctx, headphoneColor, -10, headY + 1, 3, 6); fill(ctx, headphoneColor, 7, headY + 1, 3, 6);
  }
  const headwear = custom?.headwear ?? (accessory === 'hat' ? 'explorer' : 'none');
  drawHeadwear(ctx, headwear, custom?.headwearColor || '#a77b50', facing, headY);

  if (isOwn) {
    // A soft arc under the owner instead of a hard selection box.
    ctx.strokeStyle = 'rgba(255,240,200,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 7 - Math.round(bob), 11, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  if (options?.preview) return;
  const name = defaultText(identity.displayName).slice(0, 18);
  ctx.font = '700 9.5px Inter, ui-sans-serif, system-ui, sans-serif';
  const width = Math.min(145, Math.ceil(ctx.measureText(name).width) + 18);
  const plateY = baseY - (custom?.headwear && custom.headwear !== 'none' ? 60 : 54);
  plate(ctx, x - width / 2, plateY, width, 15, 'rgba(251,244,226,0.96)', 'rgba(30,55,48,0.55)');
  fill(ctx, identity.color || shirt, x - width / 2 + 5, plateY + 5, 5, 5);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(name, Math.round(x - width / 2 + 13), plateY + 11);
  ctx.textAlign = 'center';
}

function drawClothing(ctx: CanvasRenderingContext2D, look: AvatarCustomization, facing: Position['direction'], y: number, swing: number, shirt: string): void {
  if(facing==='left'||facing==='right'){
    const lead=facing==='right'?1:-1,edge=lead>0?3:-5;
    if(look.outfit==='hoodie'){fill(ctx,shade(shirt,-35),lead>0?-6:3,y,3,6);fill(ctx,shade(shirt,-20),edge,y+10,3,3);}
    else if(look.outfit==='suit'){fill(ctx,'#fff4dc',edge,y+1,2,5);fill(ctx,shade(shirt,28),edge,y+5,2,5);}
    else if(look.outfit==='overalls'){fill(ctx,look.pantsColor,-3,y+6,6,10);fill(ctx,look.pantsColor,edge,y+1,2,9);fill(ctx,'#e5ba69',edge,y+6,1,2);}
    else if(look.outfit==='dress'){fill(ctx,shirt,-6,y+10,12,9);fill(ctx,shade(shirt,24),-6,y+17,10,2);fill(ctx,'#edce8a',-5,y+9,10,2);}
    else if(look.outfit==='sporty')fill(ctx,'#f4eddf',edge,y+3,2,9);
    if(look.jacket!=='none'){
      const color=look.jacketColor,length=look.jacket==='coat'?24:16;
      fill(ctx,shade(color,-20),-5,y,11,length);fill(ctx,color,-5,y,9,length-1);fill(ctx,shade(color,24),-5,y,8,3);
      fill(ctx,shade(color,-30),edge,y+4,2,length-4);for(let i=7;i<length-2;i+=5)fill(ctx,'#d9b77a',edge,y+i,1,1);
    }
    return;
  }
  const front = facing !== 'up';
  if (look.outfit === 'hoodie') {
    fill(ctx, shade(shirt, -30), -6, y, 12, 5);
    if (front) { fill(ctx, '#f5ecd8', -3, y + 2, 1, 5); fill(ctx, '#f5ecd8', 2, y + 2, 1, 5); fill(ctx, shade(shirt, -20), -4, y + 10, 8, 3); }
  } else if (look.outfit === 'suit') {
    if (front) { fill(ctx, '#fff4dc', -3, y + 1, 6, 10); fill(ctx, '#9f3e37', -1, y + 3, 2, 9); fill(ctx, shade(shirt, 40), -6, y + 1, 3, 5); fill(ctx, shade(shirt, 40), 3, y + 1, 3, 5); }
    else fill(ctx, shade(shirt, -20), 0, y + 3, 1, 12);
  } else if (look.outfit === 'overalls') {
    const denim=look.pantsColor;fill(ctx, denim, -5, y + 7, 10, 9);fill(ctx, denim, -5, y + 1, 3, 10);fill(ctx, denim, 2, y + 1, 3, 10);
    if (front) { fill(ctx, '#e5ba69', -4, y + 7, 1, 2);fill(ctx, '#e5ba69', 3, y + 7, 1, 2);fill(ctx, shade(denim, 22), -2, y + 10, 4, 3); }
  } else if (look.outfit === 'dress') {
    fill(ctx, shirt, -10, y + 10, 20, 7);fill(ctx, shirt, -12, y + 16, 24, 4);fill(ctx, shade(shirt, 25), -10, y + 17, 20, 2);
    if(front)fill(ctx, '#edce8a', -8, y + 9, 16, 2);
  } else if (look.outfit === 'sporty') {
    fill(ctx, '#f4eddf', -7, y + 4, 14, 2);fill(ctx, '#f4eddf', -1, y + 7, 2, 4);
  }
  if(look.jacket==='none')return;
  const jacket=look.jacketColor;const length=look.jacket==='coat'?24:16;
  if(!front){fill(ctx,jacket,-8,y,16,length);fill(ctx,shade(jacket,20),-8,y,15,3);fill(ctx,shade(jacket,-20),0,y+5,1,length-6);}
  else {
    fill(ctx,jacket,-9,y,6,length);fill(ctx,shade(jacket,-15),3,y,6,length);
    fill(ctx,shade(jacket,26),-6,y+1,3,look.jacket==='cardigan'?9:6);fill(ctx,shade(jacket,26),3,y+1,3,look.jacket==='cardigan'?9:6);
    if(look.jacket==='coat')fill(ctx,shade(jacket,-25),-3,y+15,6,9);
    for(let i=7;i<length-1;i+=5)fill(ctx,'#d9b77a',3,y+i,1,1);
  }
  fill(ctx,jacket,-11,y+3+swing,4,10);fill(ctx,shade(jacket,-18),7,y+3-swing,4,10);
}

function drawHeadwear(ctx: CanvasRenderingContext2D, kind: AvatarCustomization['headwear'], color: string, facing: Position['direction'], y: number): void {
  if(kind==='none')return;
  const dark=shade(color,-35),light=shade(color,24);
  if(kind==='cap'){
    fill(ctx,color,-8,y-7,16,6);fill(ctx,light,-6,y-7,10,2);
    fill(ctx,dark,facing==='left'?-13:facing==='right'?1:-10,y-2,facing==='down'||facing==='up'?20:12,2);
  } else if(kind==='beanie') {
    fill(ctx,color,-8,y-7,16,7);fill(ctx,light,-9,y-1,18,3);fill(ctx,color,-2,y-10,4,3);
    for(let x=-7;x<8;x+=3)fill(ctx,dark,x,y,1,2);
  } else if(kind==='explorer') {
    fill(ctx,dark,-11,y-2,22,2);fill(ctx,color,-7,y-8,14,6);fill(ctx,light,-7,y-8,12,2);fill(ctx,'#e4bd73',-7,y-3,14,1);
  } else if(kind==='beret') {
    fill(ctx,color,-9,y-6,18,5);fill(ctx,color,-5,y-8,12,3);fill(ctx,dark,1,y-10,2,3);fill(ctx,light,-7,y-6,7,1);
  } else if(kind==='crown') {
    fill(ctx,color,-8,y-5,16,4);for(const x of [-8,-2,4])fill(ctx,color,x,y-9,4,5);
    fill(ctx,light,-8,y-2,16,1);fill(ctx,'#b54b46',-1,y-5,2,2);fill(ctx,'#4a8798',-6,y-5,2,2);fill(ctx,'#4a8798',4,y-5,2,2);
  }
}

/**
 * Leafy tree. The trunk sits on the 22x25 collision footprint from
 * world/model.ts; the canopy is allowed to overhang it, as real foliage does.
 * `variant` picks one of three silhouettes so a row of trees is not a stamp.
 */
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

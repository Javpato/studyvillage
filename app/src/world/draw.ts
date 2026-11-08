import {drawWorldLabel} from '../ui/world-label';
import {gardenItemRect,resolveGardenItem} from '../../../packages/core/src/world/garden';
import {sprite} from '../assets/sprite-catalog';
import { STREET_LIGHTS, drawStreetLight } from './lights';
import { t, defaultText, getLanguage } from '../i18n';
import type { AvatarCustomization } from '../assets/custom-assets';
import { type PublicIdentity, type Position } from '../../../packages/core/src/protocol/types';
import {
  PALETTE, animClock, contactShadow, drawAvatar, drawTree, fill,
  glowPool, hash01, ipx, paintSceneFade, plate, reducedMotion, seed, shade, text, trackCharacter,
} from '../ui/art';
import { drawPortalSign, WORLD_AREAS } from './areas';
import { PARCELS, WORLD_TREES, type OccupiedParcel } from './model';

export interface DrawPerson { identity: PublicIdentity; position: Position; isOwn: boolean; appearance?: AvatarCustomization }

const W = 768;
const H = 432;
const ROAD_TOP = 190;
const ROAD_BOTTOM = 244;

const [, moss1, moss2, moss3, moss4, moss5] = PALETTE.moss;
const [earth0, earth1, earth2, earth3, earth4] = PALETTE.earth;
const [ember0, ember1, ember2, ember3, ember4] = PALETTE.ember;

/** A sprite that must be depth-sorted against the characters. */
interface Sprite { baseline: number; paint: () => void }

// ---------------------------------------------------------------------------
// Terrain. Static for a given occupancy, so it is painted once into an
// offscreen canvas and blitted each frame instead of re-tiling 1,000 cells.
// ---------------------------------------------------------------------------

let terrainCache: HTMLCanvasElement | null = null;
let terrainKey = '';

function paintGrass(ctx: CanvasRenderingContext2D): void {
  fill(ctx, moss3, 0, 0, W, H);
  // Soft meadow patches drawn as overlapping ellipses. Square cells on a grid
  // produced visible banding, so the variation is organic instead.
  // Kept faint and broad on purpose. At higher opacity these read as stains
  // rather than as ground variation.
  for (let i = 0; i < 30; i += 1) {
    const n = hash01(`patch${i}`);
    const m = hash01(`patchb${i}`);
    ctx.fillStyle = n > 0.5 ? 'rgba(124,192,119,0.075)' : 'rgba(47,90,62,0.065)';
    ctx.beginPath();
    ctx.ellipse(m * W, n * H, 70 + m * 110, 34 + n * 52, n * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sparse detail: roughly one feature per four cells, so the field stays calm
  // and the buildings and characters remain the subject.
  for (let y = 0; y < H; y += 16) {
    for (let x = 0; x < W; x += 16) {
      const n = seed(x / 16 + 7, y / 16 + 3);
      if (n > 0.93) {
        fill(ctx, moss2, x + 4, y + 9, 2, 4);
        fill(ctx, moss5, x + 6, y + 7, 2, 6);
        fill(ctx, moss2, x + 9, y + 10, 2, 3);
      } else if (n > 0.88) {
        fill(ctx, shade(moss2, 6), x + 6, y + 10, 6, 3);
      } else if (n < 0.022) {
        const petal = n < 0.011 ? ember3 : '#e9e2f2';
        fill(ctx, moss1, x + 8, y + 10, 2, 4);
        fill(ctx, petal, x + 6, y + 6, 5, 4);
        fill(ctx, ember4, x + 8, y + 8, 2, 2);
      } else if (n < 0.04) {
        fill(ctx, '#938d80', x + 6, y + 9, 5, 4);
        fill(ctx, '#aaa397', x + 6, y + 9, 5, 2);
      }
    }
  }
  // Dappled shade sits under each individual tree instead of running as a band
  // across the full width, which read as a stripe over the road and the plots.
  for (const tree of WORLD_TREES) {
    for (let i = 0; i < 7; i += 1) {
      const n = seed(tree.x + i, tree.y);
      if (n < 0.45) continue;
      ctx.fillStyle = 'rgba(36,64,47,0.13)';
      ctx.fillRect(ipx(tree.x - 18 + i * 6), ipx(tree.y + 2 + n * 8), 8, 5);
    }
  }
}

/** Horizontal high street plus the garden paths up to each door. */
function paintPaths(ctx: CanvasRenderingContext2D): void {
  const edge = (y: number, flip: number) => {
    // Scalloped dirt edge so the road does not read as a plain band.
    for (let x = 0; x < W; x += 8) {
      const n = seed(x / 8 + 31, y + flip);
      const lip = n > 0.6 ? 4 : n > 0.3 ? 2 : 0;
      fill(ctx, earth1, x, y - lip * flip, 8, lip + 2);
    }
  };

  fill(ctx, earth1, 0, ROAD_TOP, W, ROAD_BOTTOM - ROAD_TOP);
  fill(ctx, earth3, 0, ROAD_TOP + 4, W, ROAD_BOTTOM - ROAD_TOP - 8);
  fill(ctx, earth4, 0, ROAD_TOP + 8, W, 12);
  edge(ROAD_TOP, 1);
  edge(ROAD_BOTTOM, -1);

  // Cobbles, ruts and grass creeping in at the verges.
  for (let x = 0; x < W; x += 12) {
    const n = seed(x / 12 + 5, 91);
    if (n > 0.62) fill(ctx, earth2, x + 2, ROAD_TOP + 14 + Math.floor(n * 16), 8, 4);
    if (n < 0.3) fill(ctx, shade(earth4, 12), x + 4, ROAD_TOP + 10, 6, 3);
    if (n > 0.86) {
      fill(ctx, moss2, x, ROAD_TOP + 2, 6, 3);
      fill(ctx, moss2, x + 4, ROAD_BOTTOM - 4, 6, 3);
    }
  }
  fill(ctx, shade(earth2, -8), 0, ROAD_TOP + 26, W, 3);

  // North/south spine sits in the existing gap between parcels; no house is displaced.
  fill(ctx, earth1, 218, 0, 44, H);
  fill(ctx, earth3, 222, 0, 36, H);
  for (let y = 4; y < H; y += 14) {
    fill(ctx, earth4, 226, y, 12, 5); fill(ctx, shade(earth2, -5), 244, y + 6, 8, 4);
  }
  for (const parcel of PARCELS) {
    const top = parcel.slot < 3;
    const y0 = top ? 117 : ROAD_BOTTOM;
    const y1 = top ? ROAD_TOP : 300;
    fill(ctx, earth1, parcel.doorX - 11, y0, 22, y1 - y0);
    fill(ctx, earth3, parcel.doorX - 8, y0, 16, y1 - y0);
    for (let y = y0; y < y1; y += 10) {
      const n = seed(parcel.doorX / 10, y / 10 + 17);
      fill(ctx, n > 0.5 ? earth4 : shade(earth3, 10), parcel.doorX - 6 + (n > 0.5 ? 0 : 5), y + 2, 6, 4);
    }
  }
}

/**
 * An unclaimed plot. Kept deliberately quiet: it is mown lawn with a fence and
 * a small board, not a slab of earth. An empty plot must never out-weigh a
 * neighbour's actual house.
 */
export function paintEmptyPlotSource(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, slot: number): void {
  // Mown lawn, a touch lighter and flatter than the surrounding meadow.
  ctx.fillStyle = 'rgba(166,220,152,0.34)';
  ctx.fillRect(ipx(x - 4), ipx(y), ipx(w + 8), ipx(h + 8));
  for (let gy = y; gy < y + h + 8; gy += 8) {
    ctx.fillStyle = 'rgba(47,90,62,0.07)';
    ctx.fillRect(ipx(x - 4), ipx(gy), ipx(w + 8), 3);
  }
  for (let gy = y; gy < y + h + 8; gy += 12) {
    for (let gx = x - 4; gx < x + w + 8; gx += 12) {
      if (seed(gx / 12 + 61, gy / 12 + 13) > 0.88) fill(ctx, moss5, gx, gy + 3, 4, 3);
    }
  }

  // Low picket fence: posts with two rails, lit from the top-left.
  const post = (fx: number, fy: number) => {
    fill(ctx, shade(earth1, -14), fx, fy, 3, 9);
    fill(ctx, shade(earth2, -6), fx, fy, 2, 9);
  };
  for (const fy of [y - 4, y + h + 6]) {
    fill(ctx, shade(earth1, -10), x - 6, fy + 3, w + 14, 2);
    for (let fx = x - 6; fx <= x + w + 6; fx += 18) post(fx, fy);
  }
  post(x - 6, y + h / 2);
  post(x + w + 6, y + h / 2);

  // Vacancy board on a post.
  const signX = x + w / 2;
  const signY = y + h / 2 - 10;
  fill(ctx, earth0, signX - 2, signY + 10, 5, 18);
  fill(ctx, earth3, signX - 2, signY + 10, 2, 18);
  plate(ctx, signX - 31, signY - 12, 62, 26, PALETTE.paper[3], earth0);
  contactShadow(ctx, signX, signY + 28, 8, 0.26);
}

function paintEmptyPlot(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,slot:number):void{const asset=sprite('plot-empty');if(asset)ctx.drawImage(asset,x-7,y-6);else paintEmptyPlotSource(ctx,x,y,w,h,slot);const signX=x+w/2,signY=y+h/2-10;text(ctx,t('PARCELA {n}',{n:slot+1}),signX,signY-1,PALETTE.paper[1],8);text(ctx,t('Disponible'),signX,signY+9,shade(moss1,40),8);}

export function paintResidentialGround(ctx:CanvasRenderingContext2D):void{paintGrass(ctx);paintPaths(ctx);paintPlaza(ctx);}
function terrain(occupied: readonly OccupiedParcel[]): HTMLCanvasElement | null {
  // The plot signs are painted into this cache, so a language change must repaint it.
  const key = `${getLanguage()}|${occupied.map((item) => item.parcel.slot).sort().join(',')}`;
  if (terrainCache && terrainKey === key) return terrainCache;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);
  ctx.imageSmoothingEnabled = false;
  const ground=sprite('terrain-residential');if(ground)ctx.drawImage(ground,0,0,W,H);else paintResidentialGround(ctx);
  for (const parcel of PARCELS) {
    if (!occupied.some((item) => item.parcel.slot === parcel.slot)) {
      paintEmptyPlot(ctx, parcel.x, parcel.y, parcel.w, parcel.h, parcel.slot);
    }
  }
  terrainCache = canvas;
  terrainKey = key;
  return canvas;
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

export function paintHouseSource(ctx: CanvasRenderingContext2D, item: OccupiedParcel, time: number): void {
  const { x, y, w, h, slot } = item.parcel;
  const warm = item.house.theme === 'peach';
  const wall = warm ? '#e8c9a4' : '#d9dfbe';
  const wallLit = shade(wall, 18);
  const wallDark = shade(wall, -40);
  const roof = warm ? ember1 : '#35705c';
  const roofLit = shade(roof, 26);
  const roofDark = shade(roof, -34);
  const trim = warm ? '#9c5340' : '#27584a';

  contactShadow(ctx, x + w / 2, y + h + 8, w * 0.46, 0.34);

  // Plinth the building sits on, so it is planted rather than floating.
  fill(ctx, moss1, x + 2, y + h - 2, w - 4, 12);
  fill(ctx, earth2, x + 4, y + h + 2, w - 8, 6);
  fill(ctx, earth3, x + 4, y + h + 2, w - 8, 3);

  // Body.
  fill(ctx, wallDark, x + 6, y + 20, w - 12, h - 18);
  fill(ctx, wall, x + 6, y + 20, w - 16, h - 20);
  fill(ctx, wallLit, x + 6, y + 20, 6, h - 20);
  // Plank seams.
  for (let py = y + 26; py < y + h - 2; py += 10) {
    fill(ctx, shade(wall, -16), x + 8, py, w - 18, 2);
  }

  // Roof: overhanging eave, then shingle rows stepping up to the ridge.
  fill(ctx, roofDark, x - 2, y + 14, w + 4, 10);
  fill(ctx, roofLit, x - 2, y + 14, w + 4, 3);
  for (let row = 0; row < 4; row += 1) {
    const inset = 2 + row * 7;
    const ry = y + 12 - row * 4;
    fill(ctx, row % 2 ? roof : shade(roof, -12), x + inset, ry, w - inset * 2, 6);
    fill(ctx, roofLit, x + inset, ry, w - inset * 2, 2);
    for (let sx = x + inset + 3; sx < x + w - inset - 3; sx += 9) {
      fill(ctx, roofDark, sx, ry + 2, 2, 4);
    }
  }
  fill(ctx, shade(roof, 34), x + w / 2 - 14, y - 4, 28, 4);

  // Chimney with a slow smoke plume.
  const chimX = x + w - 30;
  fill(ctx, earth0, chimX, y - 12, 12, 18);
  fill(ctx, earth2, chimX, y - 12, 7, 18);
  fill(ctx, shade(earth0, -14), chimX - 2, y - 14, 16, 5);
  for (let p = 0; p < 3; p += 1) {
    const t = (time * 0.32 + p * 0.33) % 1;
    const alpha = (1 - t) * 0.3;
    if (alpha <= 0.01) continue;
    ctx.fillStyle = `rgba(246,240,226,${alpha})`;
    ctx.beginPath();
    ctx.arc(chimX + 6 + Math.sin(t * 5 + p) * 6, y - 16 - t * 30, 3 + t * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Windows with warm interior light and a gentle flicker.
  const flicker = 0.78 + Math.sin(time * 2.1 + hash01(item.ownerId) * 9) * 0.07;
  for (const wx of [x + 16, x + w - 38]) {
    const wy = y + 40;
    fill(ctx, trim, wx - 2, wy - 2, 26, 24);
    ctx.fillStyle = `rgba(255,208,130,${flicker})`;
    ctx.fillRect(ipx(wx), ipx(wy), 22, 20);
    fill(ctx, 'rgba(255,236,190,0.85)', wx, wy, 22, 6);
    fill(ctx, trim, wx + 10, wy, 2, 20);
    fill(ctx, trim, wx, wy + 9, 22, 2);
    fill(ctx, shade(trim, -18), wx - 4, wy + 20, 30, 4);
    glowPool(ctx, wx + 11, y + h + 4, 26);
  }

  // Door with step, handle and a lantern beside it.
  const doorW = 24;
  const doorX = x + w / 2 - doorW / 2;
  const doorY = y + 54;
  fill(ctx, shade(earth0, -16), doorX - 3, doorY - 3, doorW + 6, h - 50);
  fill(ctx, earth1, doorX, doorY, doorW, h - 52);
  fill(ctx, earth2, doorX + 2, doorY + 2, doorW - 6, h - 56);
  fill(ctx, shade(earth2, -18), doorX + 4, doorY + 6, doorW - 10, 2);
  fill(ctx, ember4, doorX + doorW - 8, doorY + 16, 3, 3);
  fill(ctx, earth3, doorX - 4, y + h - 2, doorW + 8, 5);

  const lampX = doorX - 12;
  fill(ctx, trim, lampX, doorY + 6, 4, 4);
  fill(ctx, ember4, lampX - 1, doorY + 10, 6, 7);
  fill(ctx, 'rgba(255,230,170,0.95)', lampX, doorY + 11, 4, 5);
  glowPool(ctx, lampX + 2, doorY + 16, 16);

  // Flower boxes under the windows.
  for (const bx of [x + 14, x + w - 40]) {
    fill(ctx, earth0, bx, y + 62, 26, 7);
    fill(ctx, earth2, bx, y + 62, 26, 3);
    for (let i = 0; i < 4; i += 1) {
      const n = seed(bx + i, y);
      fill(ctx, moss2, bx + 3 + i * 6, y + 58, 2, 5);
      fill(ctx, n > 0.5 ? ember3 : '#e9dcf2', bx + 2 + i * 6, y + 56, 4, 3);
    }
  }

 }
function paintHouse(ctx:CanvasRenderingContext2D,item:OccupiedParcel,time:number):void {
  const {x,y,w,h,slot}=item.parcel,warm=item.house.theme==='peach',trim=warm?'#9c5340':'#27584a';
  const asset=sprite(`house-exterior-${warm?'peach':'mint'}`);
  if(asset){const frame=Math.floor(time/0.78)%4;ctx.drawImage(asset,frame*160,0,160,160,x-16,y-56,160,160);}else paintHouseSource(ctx,item,time);
  drawWorldLabel(ctx,defaultText(item.house.name.trim()),x+w/2,y+26,w+24);
  const tagY=slot<3?y+h+16:y-22;
  drawWorldLabel(ctx,item.isOwn?t('TU CASA'):defaultText(item.name),item.parcel.doorX,tagY,160);
}

// ---------------------------------------------------------------------------
// Plaza, lamps and ambience
// ---------------------------------------------------------------------------

/**
 * The plaza is painted flat into the terrain, not built as an object.
 * WORLD_SPAWN is 384,215 - dead centre - and decorative props are not
 * collision obstacles, so anything tall here would swallow the character.
 */
function paintPlaza(ctx: CanvasRenderingContext2D): void {
  const cx = 384;
  const cy = 217;
  fill(ctx, shade(earth2, -12), cx - 58, cy - 20, 116, 40);
  fill(ctx, earth3, cx - 56, cy - 18, 112, 36);
  // Radial cobble medallion.
  for (let ring = 0; ring < 3; ring += 1) {
    const rw = 96 - ring * 30;
    const rh = 30 - ring * 9;
    ctx.strokeStyle = ring % 2 ? shade(earth4, 10) : shade(earth2, -6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    fill(ctx, shade(earth2, -4), cx + Math.cos(a) * 40 - 2, cy + Math.sin(a) * 13 - 2, 5, 4);
  }
  fill(ctx, shade(earth4, 14), cx - 8, cy - 4, 16, 8);
}

function paintAmbience(ctx: CanvasRenderingContext2D, time: number): void {
  // Drifting motes, kept few and cheap.
  for (let i = 0; i < 16; i += 1) {
    const base = hash01(`mote${i}`);
    const speed = 0.14 + base * 0.2;
    const x = (base * W + time * speed * 60) % W;
    const y = 40 + ((base * 613) % 320) + Math.sin(time * 0.8 + i) * 12;
    if (y > ROAD_TOP - 14 && y < ROAD_BOTTOM + 14) continue;
    const alpha = 0.22 + Math.sin(time * 1.6 + i * 2) * 0.16;
    if (alpha <= 0.02) continue;
    ctx.fillStyle = `rgba(255,242,198,${alpha})`;
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
}

/**
 * Corner darkening, which focuses the eye on the middle of the village.
 * Cached, because a full-canvas radial gradient every frame is the single most
 * expensive thing in the scene and it never changes.
 */
let vignetteCache: HTMLCanvasElement | null = null;

function vignette(): HTMLCanvasElement | null {
  if (vignetteCache) return vignetteCache;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);
  const gradient = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.92);
  gradient.addColorStop(0, 'rgba(20,40,32,0)');
  gradient.addColorStop(1, 'rgba(20,40,32,0.30)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  vignetteCache = canvas;
  return canvas;
}

function paintVignette(ctx: CanvasRenderingContext2D): void {
  const cached = vignette();
  if (cached) { ctx.drawImage(cached, 0, 0, W, H); return; }
  const gradient = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.92);
  gradient.addColorStop(0, 'rgba(20,40,32,0)');
  gradient.addColorStop(1, 'rgba(20,40,32,0.30)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  occupied: readonly OccupiedParcel[],
  people: readonly DrawPerson[],
  dt = 0,
  nearbyPortalId: string | null = null,
  editing=false,
): void {
  ctx.imageSmoothingEnabled = false;
  const calm = reducedMotion();
  // Freezing the clock holds every decorative animation on a single frame
  // while leaving character walk cycles, which read dt directly, intact.
  const time = calm ? 0 : animClock();

  const ground = terrain(occupied);
  if (ground) ctx.drawImage(ground, 0, 0, W, H);
  else { paintGrass(ctx); paintPaths(ctx); paintPlaza(ctx); }

  for (const portal of WORLD_AREAS.residential.portals) {
    drawPortalSign(ctx, portal, portal.id === nearbyPortalId);
  }

  const sprites: Sprite[] = [];

  for (const tree of WORLD_TREES) {
    const n = hash01(`${tree.x}:${tree.y}`);
    const sway = calm ? 0 : Math.sin(time * 0.9 + n * 6.3) * 1.6;
    const scale = 0.88 + n * 0.3;
    const variant = Math.floor(n * 2137) % 3;
    sprites.push({ baseline: tree.y + 12, paint: () => drawTree(ctx, tree.x, tree.y, scale, sway, variant) });
  }
  for (const item of occupied) {
    sprites.push({ baseline: item.parcel.y + item.parcel.h, paint: () => paintHouse(ctx, item, time) });
    for(const decoration of item.house.garden??[]){const rect=gardenItemRect(item.parcel,resolveGardenItem(item.parcel,decoration)),asset=sprite(decoration.kind);if(asset)sprites.push({baseline:rect.y+28,paint:()=>ctx.drawImage(asset,rect.x,rect.y,32,32)});}
  }
  // Lamps stand on the verge, clear of the plaza and of every door path.
  for (const light of STREET_LIGHTS.residential) {
    sprites.push({ baseline: light.y, paint: () => drawStreetLight(ctx, light, time) });
  }

  for (const person of people) {
    const id = person.identity.fingerprint || person.identity.displayName;
    const at = trackCharacter(id, person.position, dt, !person.isOwn);
    sprites.push({
      baseline: at.y,
      paint: () => drawAvatar(ctx, at.x, at.y, person.identity, person.position, person.isOwn, { appearance: person.appearance }),
    });
  }

  sprites.sort((a, b) => a.baseline - b.baseline);
  for (const sprite of sprites) sprite.paint();

  if(!editing){if (!calm) paintAmbience(ctx, time);paintVignette(ctx);paintSceneFade(ctx, 'world', W, H);}
}

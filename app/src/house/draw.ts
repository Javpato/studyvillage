import {drawWorldLabel} from '../ui/world-label';
import { sprite } from '../assets/sprite-catalog';
import { furniturePaintTransform } from './rotation';
import { inlineFurnitureSprite } from './sprites';
import { drawSpacePortal, type SpacePortal } from './space-draw';
import { defaultText } from '../i18n';
import type { Furniture, PublicHouse } from '../../../packages/core/src/protocol/types';
import { getFurnitureCustomColor, getFurnitureCustomSprite } from '../assets/custom-assets';
import {
  PALETTE, animClock, contactShadow, drawAvatar, fill, glowPool, hash01,
  ipx, paintSceneFade, plate, reducedMotion, seed, shade, text, trackCharacter,
} from '../ui/art';
import type { DrawPerson } from '../world/draw';
import { furnitureRect } from './model';

const W = 768;
const H = 432;
const WALL_BOTTOM = 72;

const [, moss1, moss2, , moss4] = PALETTE.moss;
const [earth0, earth1, earth2, earth3, earth4] = PALETTE.earth;
const [ember0, , ember2, ember3, ember4] = PALETTE.ember;

interface Sprite { baseline: number; paint: () => void }

interface Room {
  wall: string; wallLit: string; wallDark: string;
  floor: string; floorLit: string; floorDark: string;
  trim: string; rug: string; rugAlt: string;
}

function palette(house: PublicHouse): Room {
  const peach = house.theme === 'peach';
  const wall = peach ? '#e3bfa3' : '#bfd0ba';
  const floor = peach ? '#b98a5e' : '#a8814f';
  return {
    wall,
    wallLit: shade(wall, 20),
    wallDark: shade(wall, -34),
    floor,
    floorLit: shade(floor, 20),
    floorDark: shade(floor, -30),
    trim: peach ? '#8d5440' : '#39614c',
    rug: peach ? '#a6513c' : '#8a6246',
    rugAlt: peach ? '#d98f62' : '#c08f5c',
  };
}

/** Back wall: wallpaper, picture rail, wainscot panelling and skirting. */
function paintWall(ctx: CanvasRenderingContext2D, room: Room, time: number): void {
  fill(ctx, room.wall, 0, 0, W, WALL_BOTTOM);
  fill(ctx, room.wallLit, 0, 0, W, 8);
  // Faint vertical wallpaper stripes.
  for (let x = 0; x < W; x += 16) {
    fill(ctx, shade(room.wall, 8), x, 0, 4, WALL_BOTTOM - 18);
    if (seed(x / 16, 3) > 0.7) fill(ctx, shade(room.wall, 14), x + 7, 14, 2, 2);
  }
  // Wainscot along the bottom of the wall.
  fill(ctx, shade(room.wall, -14), 0, WALL_BOTTOM - 22, W, 22);
  for (let x = 6; x < W; x += 34) {
    fill(ctx, shade(room.wall, -4), x, WALL_BOTTOM - 18, 24, 12);
    fill(ctx, shade(room.wall, 10), x, WALL_BOTTOM - 18, 24, 2);
  }
  fill(ctx, room.trim, 0, WALL_BOTTOM - 24, W, 4);
  fill(ctx, room.trim, 0, WALL_BOTTOM - 6, W, 6);
  fill(ctx, shade(room.trim, 20), 0, WALL_BOTTOM - 6, W, 2);

  // Two windows with daylight and a sill.
  for (const x of [96, 604]) {
    fill(ctx, room.trim, x - 6, 14, 80, 44);
    fill(ctx, shade(room.trim, -18), x - 6, 54, 80, 6);
    const warm = 0.9 + Math.sin(time * 0.7 + x) * 0.05;
    ctx.fillStyle = `rgba(206,232,236,${warm})`;
    ctx.fillRect(ipx(x), ipx(20), 68, 34);
    // A hint of garden outside.
    fill(ctx, '#9cc8d2', x, 20, 68, 14);
    fill(ctx, moss2, x, 40, 68, 14);
    fill(ctx, moss4, x + 8, 36, 14, 8);
    fill(ctx, moss4, x + 44, 38, 12, 6);
    fill(ctx, '#f2efe0', x + 50, 23, 10, 6);
    fill(ctx, room.trim, x + 32, 20, 4, 34);
    fill(ctx, room.trim, x, 35, 68, 4);
    fill(ctx, earth3, x - 10, 58, 88, 6);
    fill(ctx, earth4, x - 10, 58, 88, 2);
    // Potted plant on the sill.
    fill(ctx, earth1, x + 54, 48, 14, 10);
    fill(ctx, moss2, x + 57, 40, 4, 9);
    fill(ctx, moss4, x + 53, 40, 6, 5);
    fill(ctx, moss4, x + 60, 38, 7, 6);
  }
}

/**
 * Wood flooring plus the light the windows throw across it.
 * Deliberately NO staggered vertical joints: combining horizontal rows with
 * offset vertical joints renders as brickwork, not floorboards.
 */
function paintFloor(ctx: CanvasRenderingContext2D, room: Room, time: number): void {
  fill(ctx, room.floor, 0, WALL_BOTTOM, W, H - WALL_BOTTOM);

  // Long planks running the width of the room, alternating tone very slightly.
  for (let y = WALL_BOTTOM; y < H; y += 18) {
    const band = Math.round((y - WALL_BOTTOM) / 18);
    fill(ctx, band % 2 ? shade(room.floor, 5) : shade(room.floor, -4), 0, y, W, 18);
    // A single soft seam, not a hard dark rule.
    ctx.fillStyle = 'rgba(60,40,24,0.17)';
    ctx.fillRect(0, ipx(y), W, 1);
    ctx.fillStyle = 'rgba(255,230,190,0.10)';
    ctx.fillRect(0, ipx(y) + 1, W, 1);
    // Grain: short horizontal strokes along the length of each board.
    for (let x = (band * 37) % 64; x < W; x += 64) {
      const n = seed(x / 64 + band * 3, band);
      if (n > 0.52) {
        ctx.fillStyle = 'rgba(70,46,26,0.10)';
        ctx.fillRect(ipx(x), ipx(y + 5 + n * 7), 26 + n * 22, 1);
      }
      // Occasional butt joint between boards, kept rare and short.
      if (n > 0.93) {
        ctx.fillStyle = 'rgba(60,40,24,0.20)';
        ctx.fillRect(ipx(x + 20), ipx(y) + 2, 1, 15);
      }
    }
  }

  // Contact shadow where the wall meets the floor.
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = `rgba(28,42,34,${0.2 - i * 0.02})`;
    ctx.fillRect(0, WALL_BOTTOM + i, W, 1);
  }

  // Daylight falling from each window, skewed across the boards.
  for (const x of [96, 604]) {
    ctx.save();
    ctx.globalAlpha = 0.15 + Math.sin(time * 0.5 + x) * 0.02;
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath();
    ctx.moveTo(x - 4, WALL_BOTTOM);
    ctx.lineTo(x + 72, WALL_BOTTOM);
    ctx.lineTo(x + 116, H);
    ctx.lineTo(x + 20, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Rug: a warm woven piece that anchors the middle of the room.
  const rx = 252;
  const ry = 210;
  const rw = 264;
  const rh = 126;
  contactShadow(ctx, rx + rw / 2, ry + rh, rw * 0.44, 0.2);
  fill(ctx, shade(room.rug, -30), rx, ry, rw, rh);
  fill(ctx, room.rug, rx + 3, ry + 3, rw - 6, rh - 6);
  fill(ctx, shade(room.rug, 16), rx + 10, ry + 10, rw - 20, rh - 20);
  fill(ctx, room.rugAlt, rx + 20, ry + 20, rw - 40, rh - 40);
  fill(ctx, shade(room.rug, 10), rx + 34, ry + 32, rw - 68, rh - 64);
  // Woven motif.
  for (let i = 0; i < 7; i += 1) {
    fill(ctx, shade(room.rugAlt, 22), rx + 44 + i * 26, ry + 44, 12, 8);
    fill(ctx, shade(room.rugAlt, 22), rx + 44 + i * 26, ry + rh - 52, 12, 8);
  }
  for (let i = 0; i < 3; i += 1) {
    fill(ctx, shade(room.rug, -14), rx + 72 + i * 48, ry + 60, 24, 6);
  }
  // Fringe along the short ends.
  for (let i = 0; i < rh; i += 7) {
    fill(ctx, shade(room.rug, 34), rx - 3, ry + i, 3, 4);
    fill(ctx, shade(room.rug, 34), rx + rw, ry + i, 3, 4);
  }
}

/**
 * Side and front walls drawn in the margins HOUSE_BOUNDS leaves unwalkable
 * (x below 28, x above 740, y below 406), so the room reads as enclosed
 * without ever covering ground a character can stand on.
 */
function paintRoomFrame(ctx: CanvasRenderingContext2D, room: Room): void {
  // Dark stained skirting, keyed to the floor rather than the wall paint, so
  // the frame reads as joinery instead of a second wall colour.
  const deep = shade(room.floorDark, -26);
  const mid = shade(room.floorDark, -8);
  for (const [x, lit] of [[0, true], [746, false]] as const) {
    fill(ctx, deep, x, WALL_BOTTOM - 4, 22, H - WALL_BOTTOM);
    fill(ctx, lit ? mid : shade(deep, -8), x + (lit ? 0 : 8), WALL_BOTTOM - 4, 14, H - WALL_BOTTOM);
    for (let y = WALL_BOTTOM; y < H - 16; y += 30) fill(ctx, shade(deep, -8), x + 2, y, 18, 2);
  }
  fill(ctx, deep, 0, H - 18, W, 18);
  fill(ctx, mid, 0, H - 18, W, 11);
  for (let x = 4; x < W; x += 38) fill(ctx, shade(deep, -6), x, H - 16, 2, 9);
  fill(ctx, shade(room.trim, -14), 0, H - 20, W, 3);

  // The doorway out of the room, centred on the doormat. E only works here.
  fill(ctx, shade(deep, -22), 356, H - 20, 56, 20);
  fill(ctx, '#2a3d32', 360, H - 18, 48, 18);
  fill(ctx, 'rgba(255,214,150,0.35)', 362, H - 18, 44, 3);
  fill(ctx, room.trim, 352, H - 22, 6, 22);
  fill(ctx, room.trim, 410, H - 22, 6, 22);

  // Inner corner shadows so the joinery sits against the boards.
  for (let i = 0; i < 12; i += 1) {
    const a = (0.15 - i * 0.012).toFixed(3);
    ctx.fillStyle = `rgba(28,20,12,${a})`;
    ctx.fillRect(22 + i, WALL_BOTTOM, 1, H - WALL_BOTTOM - 18);
    ctx.fillRect(745 - i, WALL_BOTTOM, 1, H - WALL_BOTTOM - 18);
    ctx.fillRect(0, H - 19 - i, W, 1);
  }
}

/** Fixtures that belong to the building rather than to the furniture list. */
function paintFixtures(ctx: CanvasRenderingContext2D, room: Room, time: number): void {
  // A shelf of books and a clock on the back wall.
  fill(ctx, shade(earth0, -8), 300, 44, 70, 5);
  fill(ctx, earth2, 300, 44, 70, 2);
  const books = ['#c9604a', '#4b8f7e', '#d9a65c', '#7a6ba8'];
  for (let i = 0; i < 7; i += 1) {
    const bh = 10 + Math.floor(seed(i, 5) * 4);
    fill(ctx, books[i % books.length], 304 + i * 9, 44 - bh, 7, bh);
    fill(ctx, 'rgba(255,255,255,0.16)', 304 + i * 9, 44 - bh, 7, 2);
  }
  fill(ctx, shade(earth0, -6), 436, 20, 26, 26);
  fill(ctx, PALETTE.paper[3], 439, 23, 20, 20);
  fill(ctx, room.trim, 448, 26, 2, 8);
  fill(ctx, room.trim, 449, 32, 7, 2);
  void time;
}

/**
 * Warm ambient light over the middle of the room.
 * A visible pendant fitting was tried and removed: furniture positions are
 * user-controlled, so any fixed fitting eventually overlaps a wall-mounted
 * frame or board and reads as a drawing error. Light without a fixture has no
 * such failure mode.
 */
function paintLampPool(ctx: CanvasRenderingContext2D, time: number): void {
  const breathe = 1 + Math.sin(time * 0.6) * 0.015;
  glowPool(ctx, 384, 262, 210 * breathe, '255,208,140');
  glowPool(ctx, 384, 250, 120 * breathe, '255,226,176');
}

function paintFurniture(
  ctx: CanvasRenderingContext2D,
  item: Furniture,
  selected: boolean,
  nearby: boolean,
  time: number,
  perItemSprite?: HTMLImageElement | null,
  privateSpace = false,
): void {
  const { x, y, w, h } = furnitureRect(item);
  const wall = item.kind === 'frame' || item.kind === 'board';
  if (!wall) contactShadow(ctx, x + w / 2, y + h - 1, w * 0.46, 0.32);

  const customSprite = (item.kind==='sketchboard'?null:perItemSprite) || inlineFurnitureSprite(item.sprite) || (privateSpace ? null : getFurnitureCustomSprite(item.kind)) || sprite(item.kind);
  const customColor = item.color ?? (privateSpace?null:getFurnitureCustomColor(item.kind));
  const baseEarth0 = customColor ? shade(customColor, -38) : earth0;
  const baseEarth1 = customColor ? shade(customColor, -22) : earth1;
  const baseEarth2 = customColor || earth2;
  const baseEarth3 = customColor ? shade(customColor, 16) : earth3;
  const baseEarth4 = customColor ? shade(customColor, 32) : earth4;

  // Paint the object, its frame and its board contents in one unrotated local space.
  ctx.save();ctx.transform(...furniturePaintTransform(item));
  {
  const {w,h}=furnitureRect({...item,rotation:0});const x=0,y=0;
  if(item.kind==='sketchboard'){
    // The image occupies the board surface; the feet and frame remain furniture.
    if(item.showFrame!==false&&customSprite)ctx.drawImage(customSprite,x,y,w,h);
    const bx=x+w*10/64,by=y+h*10/64,bw=w*44/64,bh=h*38/64;
    ctx.save();ctx.beginPath();ctx.rect(bx,by,bw,bh);ctx.clip();ctx.fillStyle='#fff9e9';ctx.fillRect(bx,by,bw,bh);if(perItemSprite){const fit=Math.min(bw/perItemSprite.naturalWidth,bh/perItemSprite.naturalHeight),dw=perItemSprite.naturalWidth*fit,dh=perItemSprite.naturalHeight*fit;ctx.drawImage(perItemSprite,bx+(bw-dw)/2,by+(bh-dh)/2,dw,dh);}ctx.restore();
  } else if (customSprite) {
    ctx.drawImage(customSprite,0,0,w,h);
  } else {
    switch (item.kind) {
      case 'desk': {
        // Legs, apron, top with a lit front edge, monitor, lamp and papers.
        fill(ctx, baseEarth0, x + 5, y + 20, 6, h - 20);
        fill(ctx, baseEarth0, x + w - 11, y + 20, 6, h - 20);
        fill(ctx, shade(baseEarth1, -10), x + 2, y + 16, w - 4, 8);
        fill(ctx, baseEarth2, x, y + 10, w, 10);
        fill(ctx, baseEarth4, x, y + 10, w, 4);
        fill(ctx, shade(baseEarth2, -16), x, y + 19, w, 3);
        fill(ctx, '#34504a', x + 14, y, 28, 14);
        fill(ctx, '#1f3a38', x + 16, y + 2, 24, 10);
        fill(ctx, '#7fc7c0', x + 17, y + 3, 22, 5);
        fill(ctx, '#34504a', x + 25, y + 13, 6, 4);
        fill(ctx, PALETTE.paper[4], x + 46, y + 4, 16, 7);
        fill(ctx, shade(PALETTE.paper[4], -22), x + 46, y + 9, 16, 2);
        fill(ctx, ember0, x + 6, y + 2, 4, 9);
        fill(ctx, ember4, x + 3, y, 10, 4);
        glowPool(ctx, x + 8, y + 16, 22);
        break;
      }
      case 'bookshelf': {
        fill(ctx, shade(baseEarth0, -12), x, y, w, h);
        fill(ctx, baseEarth1, x + 3, y + 2, w - 6, h - 4);
        fill(ctx, baseEarth2, x + 3, y + 2, 3, h - 4);
        for (let row = 0; row < 4; row += 1) {
          const sy = y + 6 + row * 14;
          fill(ctx, shade(baseEarth0, -6), x + 4, sy + 11, w - 8, 3);
          const count = 4 + Math.floor(seed(row, item.x) * 2);
          for (let col = 0; col < count; col += 1) {
            const n = seed(row * 7 + col, item.y);
            const bh = 8 + Math.floor(n * 3);
            const books = ['#c9604a', '#4b8f7e', '#d9a65c', '#7a6ba8', '#bf7f52'];
            fill(ctx, books[(row + col) % books.length], x + 6 + col * 8, sy + 11 - bh, 6, bh);
            fill(ctx, 'rgba(255,255,255,0.18)', x + 6 + col * 8, sy + 11 - bh, 6, 2);
          }
        }
        fill(ctx, moss2, x + w - 14, y + 2, 5, 7);
        fill(ctx, moss4, x + w - 17, y, 10, 5);
        break;
      }
      case 'board': {
        fill(ctx, shade(baseEarth0, -10), x, y, w, h);
        fill(ctx, baseEarth2, x + 1, y + 1, w - 2, 3);
        fill(ctx, '#f7f3e4', x + 4, y + 4, w - 8, h - 10);
        fill(ctx, shade('#f7f3e4', -16), x + 4, y + h - 8, w - 8, 2);
        fill(ctx, '#4b8f7e', x + 9, y + 9, 26, 3);
        fill(ctx, '#c9604a', x + 9, y + 15, 36, 3);
        fill(ctx, '#7a6ba8', x + 9, y + 20, 18, 2);
        fill(ctx, baseEarth1, x + 2, y + h - 5, w - 4, 4);
        fill(ctx, ember4, x + w - 16, y + h - 4, 8, 2);
        break;
      }
      case 'plant': {
        fill(ctx, shade(baseEarth1, -14), x + 5, y + 13, w - 10, h - 13);
        fill(ctx, baseEarth1, x + 5, y + 13, w - 13, h - 13);
        fill(ctx, baseEarth3, x + 3, y + 11, w - 6, 5);
        fill(ctx, shade(baseEarth1, -20), x + 5, y + h - 4, w - 10, 3);
        const sway = Math.sin(time * 1.1 + hash01(item.id) * 6) * 1.2;
        fill(ctx, moss1, x + 12, y + 2, 4, 12);
        fill(ctx, moss2, x + 4 + sway, y + 3, 10, 7);
        fill(ctx, moss4, x + 13 + sway, y - 1, 10, 8);
        fill(ctx, moss4, x + 2 + sway, y, 8, 5);
        fill(ctx, PALETTE.moss[5], x + 15 + sway, y - 2, 5, 3);
        break;
      }
      case 'table': {
        fill(ctx, baseEarth0, x + 6, y + 22, 6, h - 22);
        fill(ctx, baseEarth0, x + w - 12, y + 22, 6, h - 22);
        fill(ctx, shade(baseEarth1, -12), x + 2, y + 18, w - 4, 7);
        fill(ctx, baseEarth2, x, y + 8, w, 12);
        fill(ctx, baseEarth4, x, y + 8, w, 4);
        fill(ctx, shade(baseEarth2, -18), x, y + 19, w, 3);
        // A mug and a plate of something.
        fill(ctx, '#f4efdd', x + 14, y + 2, 10, 8);
        fill(ctx, '#d8d2bd', x + 14, y + 8, 10, 2);
        fill(ctx, '#c9604a', x + 32, y + 4, 14, 6);
        fill(ctx, ember4, x + 34, y + 2, 10, 3);
        ctx.fillStyle = `rgba(255,255,255,${0.14 + Math.sin(time * 1.4) * 0.06})`;
        ctx.fillRect(ipx(x + 18), ipx(y - 4), 2, 6);
        break;
      }
      case 'frame': {
        fill(ctx, shade(baseEarth0, -8), x, y, w, h);
        fill(ctx, baseEarth2, x + 2, y + 2, w - 4, h - 4);
        fill(ctx, PALETTE.paper[3], x + 4, y + 4, w - 8, h - 8);
        fill(ctx, '#8fb79f', x + 6, y + 6, w - 12, h - 12);
        fill(ctx, '#5d8f7c', x + 6, y + h - 12, w - 12, 6);
        fill(ctx, ember4, x + 10, y + 8, 5, 5);
        fill(ctx, 'rgba(255,255,255,0.22)', x + 4, y + 4, w - 8, 3);
        break;
      }
      case 'cabinet': {
        fill(ctx, shade(baseEarth0, -10), x, y, w, h);
        fill(ctx, baseEarth1, x + 2, y + 2, w - 4, h - 4);
        fill(ctx, baseEarth2, x + 2, y + 2, w - 4, 4);
        for (const dx of [6, w / 2 + 2]) {
          fill(ctx, shade(baseEarth2, -6), x + dx, y + 8, w / 2 - 8, h - 16);
          fill(ctx, baseEarth3, x + dx, y + 8, w / 2 - 8, 3);
          fill(ctx, shade(baseEarth0, -4), x + dx + 2, y + 14, w / 2 - 12, 2);
        }
        // Hanger and mirror distinguish the wardrobe from a notes cabinet.
        fill(ctx, '#dfc18c', x + 9, y + 16, 9, 1);
        fill(ctx, '#dfc18c', x + 11, y + 14, 5, 1);
        fill(ctx, '#dfc18c', x + 13, y + 12, 1, 3);
        fill(ctx, '#789e97', x + w / 2 + 6, y + 14, 10, 14);
        fill(ctx, '#a9c4b5', x + w / 2 + 7, y + 15, 3, 10);
        fill(ctx, ember4, x + w / 2 - 5, y + 22, 3, 4);
        fill(ctx, ember4, x + w / 2 + 3, y + 22, 3, 4);
        fill(ctx, baseEarth3, x, y + h - 5, w, 4);
        break;
      }
      case 'flashcards': {
        // A small podium with card decks, like the library's flashcard station.
        fill(ctx, shade(baseEarth0, -10), x + 6, y + 18, 6, h - 18);
        fill(ctx, shade(baseEarth0, -10), x + w - 12, y + 18, 6, h - 18);
        fill(ctx, baseEarth1, x, y + 6, w, 16);
        fill(ctx, baseEarth3, x + 2, y + 6, w - 4, 3);
        for (const cx of [x + 5, x + 19, x + 33]) {
          fill(ctx, PALETTE.paper[3], cx, y + 9, 13, 9);
          fill(ctx, ember2, cx + 2, y + 11, 9, 2);
          fill(ctx, shade(PALETTE.paper[3], -18), cx, y + 17, 13, 1);
        }
        fill(ctx, PALETTE.paper[4], x + 21, y + 1, 11, 7);
        fill(ctx, ember4, x + 23, y + 3, 7, 2);
        break;
      }
    }
  }

  }
  ctx.restore();

  if (nearby && !selected) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 224, 150, 0.9)';
    ctx.lineWidth = 1.75;
    ctx.strokeRect(ipx(x - 3), ipx(y - 3), ipx(w + 6), ipx(h + 6));
    ctx.restore();
  }

  if (selected) {
    // Animated marching highlight rather than a static dashed box.
    ctx.save();
    ctx.strokeStyle = ember3;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -(time * 18) % 10;
    ctx.strokeRect(ipx(x - 4), ipx(y - 4), ipx(w + 8), ipx(h + 8));
    ctx.restore();
    for (const [cx, cy] of [[x - 4, y - 4], [x + w + 4, y - 4], [x - 4, y + h + 4], [x + w + 4, y + h + 4]]) {
      fill(ctx, ember4, cx - 2, cy - 2, 4, 4);
    }
  }

  if (item.publicAlias) {
    drawWorldLabel(ctx,defaultText(item.publicAlias),x+w/2,y+h+4);
  }
}

let roomCache: HTMLCanvasElement | null = null;
let roomCacheKey = '';
let houseVignetteCache: HTMLCanvasElement | null = null;

export function paintRoomSource(ctx:CanvasRenderingContext2D,house:PublicHouse):void {
 const room=palette(house);
  paintWall(ctx, room, 0);
  paintFloor(ctx, room, 0);
  paintRoomFrame(ctx, room);
  paintFixtures(ctx, room, 0);
  paintLampPool(ctx, 0);
  // A doormat at the entrance the characters spawn on.
  fill(ctx, shade(earth0, -6), 344, 380, 80, 18);
  fill(ctx, earth2, 348, 383, 72, 12);
  for (let i = 0; i < 9; i += 1) fill(ctx, shade(earth2, -18), 352 + i * 8, 385, 3, 8);
}
function getRoomShell(house: PublicHouse, room: Room): HTMLCanvasElement | null {
  const key = house.theme;
  if (roomCache && roomCacheKey === key) return roomCache;
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
  const asset=sprite(`house-interior-${house.theme==='peach'?'peach':'mint'}`);if(asset)ctx.drawImage(asset,0,0,W,H);else paintRoomSource(ctx,house);
  roomCache = canvas;
  roomCacheKey = key;
  return canvas;
}

function getHouseVignette(): HTMLCanvasElement | null {
  if (houseVignetteCache) return houseVignetteCache;
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
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.95);
  vignette.addColorStop(0, 'rgba(32,24,16,0)');
  vignette.addColorStop(1, 'rgba(32,24,16,0.26)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  houseVignetteCache = canvas;
  return canvas;
}

export function drawHouseInterior(
  ctx: CanvasRenderingContext2D,
  house: PublicHouse,
  people: readonly DrawPerson[],
  selectedId: string | null,
  dt = 0,
  nearbyId: string | null = null,
  perItemSprites?: ReadonlyMap<string, HTMLImageElement | null>,
  entrances: readonly SpacePortal[] = [],
  privateSpace = false,
): void {
  ctx.imageSmoothingEnabled = false;
  // Held at a single frame when the viewer asked for reduced motion.
  const time = reducedMotion() ? 0 : animClock();
  const room = palette(house);

  const cachedRoom = getRoomShell(house, room);
  if (cachedRoom) {
    ctx.drawImage(cachedRoom, 0, 0, W, H);
  } else {
    paintWall(ctx, room, time);
    paintFloor(ctx, room, time);
    paintRoomFrame(ctx, room);
    paintFixtures(ctx, room, time);
    paintLampPool(ctx, time);
    fill(ctx, shade(earth0, -6), 344, 380, 80, 18);
    fill(ctx, earth2, 348, 383, 72, 12);
    for (let i = 0; i < 9; i += 1) fill(ctx, shade(earth2, -18), 352 + i * 8, 385, 3, 8);
  }

  // Hanging sign with the house name.
  const label = defaultText(house.name).slice(0, 28);
  ctx.font = '700 12px Inter, ui-sans-serif, system-ui, sans-serif';
  const signW = Math.max(150, Math.min(300, Math.ceil(ctx.measureText(label).width) + 40));
  const signX = 384 - signW / 2;
  fill(ctx, room.trim, 384 - 2, 0, 4, 10);
  plate(ctx, signX, 8, signW, 26, PALETTE.paper[3], room.trim);
  fill(ctx, shade(PALETTE.paper[3], -10), signX + 6, 28, signW - 12, 2);
  text(ctx, label, 384, 26, PALETTE.paper[0], 12);

  const sprites: Sprite[] = [];
  for(const portal of entrances)sprites.push({baseline:portal.y,paint:()=>drawSpacePortal(ctx,portal)});
  for (const item of house.furniture) {
    const rect = furnitureRect(item);
    const wallItem = item.kind === 'frame' || item.kind === 'board';
    const itemSprite = perItemSprites?.get(item.id) ?? null;
    sprites.push({
      baseline: wallItem ? rect.y : rect.y + rect.h,
      paint: () => paintFurniture(ctx,item,item.id===selectedId,item.id===nearbyId,time,itemSprite,privateSpace),
    });
  }
  for (const person of people) {
    const id = person.identity.fingerprint || person.identity.displayName;
    const at = trackCharacter(id, person.position, dt, !person.isOwn, `house:${house.ownerId}`);
    sprites.push({
      baseline: at.y,
      paint: () => drawAvatar(ctx, at.x, at.y, person.identity, person.position, person.isOwn, { appearance: person.appearance }),
    });
  }
  sprites.sort((a, b) => a.baseline - b.baseline);
  for (const sprite of sprites) sprite.paint();

  // Warm corner falloff so the room feels enclosed.
  const cachedVignette = getHouseVignette();
  if (cachedVignette) {
    ctx.drawImage(cachedVignette, 0, 0, W, H);
  } else {
    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.95);
    vignette.addColorStop(0, 'rgba(32,24,16,0)');
    vignette.addColorStop(1, 'rgba(32,24,16,0.26)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  // Keyed by owner, so stepping from one house into another also reads as a
  // move rather than an instant content swap.
  paintSceneFade(ctx, `house:${house.ownerId}`, W, H, '22,16,10');
}

export function drawFurniturePreview(ctx: CanvasRenderingContext2D, kind: Furniture['kind'], rotation: Furniture['rotation']=0, item?:Furniture,privateSpace=false,perItemSprite?:HTMLImageElement|null): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.imageSmoothingEnabled = false;
  const furniture={id:'preview',kind,rotation,publicAlias:'',...item,x:0,y:0},rect=furnitureRect(furniture);
  const scale=Math.min((ctx.canvas.width-16)/rect.w,(ctx.canvas.height-16)/rect.h);
  ctx.save();ctx.translate((ctx.canvas.width-rect.w*scale)/2,(ctx.canvas.height-rect.h*scale)/2);ctx.scale(scale,scale);
  paintFurniture(ctx,furniture,false,false,0,perItemSprite,privateSpace);ctx.restore();
}

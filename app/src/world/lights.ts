import {sprite} from '../assets/sprite-catalog';
import { PALETTE, contactShadow, fill, ipx, reducedMotion } from '../ui/art';
import type { WorldAreaId } from './location';
import type { Rect } from './model';
export interface StreetLight { x: number; y: number }
/** Fixture bases, shared by rendering, collision, and atmospheric illumination. */
export const STREET_LIGHTS: Record<WorldAreaId, readonly StreetLight[]> = {
  residential: [{ x: 280, y: 188 }, { x: 530, y: 188 }],
  community: [{ x: 248, y: 160 }, { x: 520, y: 160 }, { x: 248, y: 328 }, { x: 520, y: 328 }],
  study: [{ x: 50, y: 245 }, { x: 718, y: 245 }, { x: 384, y: 372 }],
};
export function lampSource(light: StreetLight): { x: number; y: number; groundY: number } { return { x: light.x, y: light.y - 30, groundY: light.y }; }
export function lampObstacles(area: WorldAreaId): Rect[] { return STREET_LIGHTS[area].map(l => ({ x: l.x - 4, y: l.y - 3, w: 8, h: 6 })); }
export function drawStreetLight(ctx: CanvasRenderingContext2D, light: StreetLight, time: number): void {
  const { x, y } = light;
  const asset=sprite('street-lamp');if(asset){ctx.drawImage(asset,ipx(x-12),ipx(y-40),24,48);return;}
  contactShadow(ctx, x, y + 2, 7, .3);
  fill(ctx, PALETTE.earth[0], x - 4, y - 3, 8, 6);
  fill(ctx, PALETTE.earth[0], x - 2, y - 30, 4, 30);
  fill(ctx, PALETTE.earth[2], x - 2, y - 30, 2, 28);
  fill(ctx, PALETTE.earth[0], x - 7, y - 36, 14, 10);
  ctx.fillStyle = `rgba(255,224,160,${reducedMotion() ? .9 : .86 + Math.sin(time * 2.4 + x) * .06})`;
  ctx.fillRect(ipx(x - 5), ipx(y - 34), 10, 8);
  fill(ctx, PALETTE.ember[0], x - 8, y - 38, 16, 4);
  fill(ctx, PALETTE.ember[4], x - 6, y - 38, 10, 2);
}

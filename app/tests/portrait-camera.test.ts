import { describe, expect, it } from 'vitest';
import { PORTRAIT_ZOOM, clampZoom, portraitView } from '../src/input/portrait-camera';

describe('portrait camera', () => {
  it('fills a tall window at zoom 1 with no empty bars', () => {
    const v = portraitView(396, 478, 1, { x: 384, y: 216 });
    expect(432 * v.ppu).toBeGreaterThan(477.99);
    expect(v.x).toBeLessThanOrEqual(0);
    expect(v.x + 768 * v.ppu).toBeGreaterThanOrEqual(396);
  });
  it('centres the player when away from the edges', () => {
    const v = portraitView(400, 480, 2, { x: 384, y: 216 });
    expect(v.x + 384 * v.ppu).toBeCloseTo(200, 0);
    expect(v.y + 216 * v.ppu).toBeCloseTo(240, 0);
  });
  it('never shows past the scene edges near a corner', () => {
    const v = portraitView(400, 480, 2, { x: 0, y: 0 });
    expect(v).toMatchObject({ x: 0, y: 0 });
    const end = portraitView(400, 480, 2, { x: 768, y: 432 });
    expect(end.x + 768 * end.ppu).toBeCloseTo(400, 0);
    expect(end.y + 432 * end.ppu).toBeCloseTo(480, 0);
  });
  it('keeps zoom within range and on its steps', () => {
    expect(clampZoom(99)).toBe(PORTRAIT_ZOOM.max);
    expect(clampZoom(0)).toBe(PORTRAIT_ZOOM.min);
    expect(clampZoom(Number.NaN)).toBe(PORTRAIT_ZOOM.initial);
    expect(clampZoom(1.7)).toBe(1.5);
  });
});

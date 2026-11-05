import { describe, expect, it } from 'vitest';
import { positionSchema, roomSchema } from '../../packages/core/src/protocol/schema';
import type { Member, Position } from '../../packages/core/src/protocol/types';
import { areaOf, isInScene } from '../src/world/location';
import { trackCharacter } from '../src/ui/art';

const position: Position = { x: 72, y: 220, direction: 'right', moving: false };
const member = (areaId: Position['areaId'], houseId: string | null = null, connected = true) => ({ position: { ...position, areaId }, houseId, connected }) as Member;

describe('world scene boundaries', () => {
  it('separates areas even when coordinates are identical, with the residential fallback for old positions', () => {
    expect(areaOf(position)).toBe('residential');
    for (const area of ['residential', 'community', 'study'] as const) {
      for (const other of ['residential', 'community', 'study'] as const) {
        expect(isInScene(member(area), other, null)).toBe(area === other);
      }
    }
    expect(isInScene(member('community', null, false), 'community', null)).toBe(false);
  });
  it('keeps houses isolated and allows visitors from different outdoor areas in the same house', () => {
    expect(isInScene(member('study', 'house-a'), 'community', 'house-a')).toBe(true);
    expect(isInScene(member('study', 'house-a'), 'study', null)).toBe(false);
    expect(isInScene(member('study', 'house-a'), 'study', 'house-b')).toBe(false);
  });
  it('rejects arbitrary areas and media room names', () => {
    expect(positionSchema.safeParse({ ...position, areaId: 'elsewhere' }).success).toBe(false);
    expect(roomSchema.safeParse('area:community').success).toBe(true);
    expect(roomSchema.safeParse('area:study').success).toBe(true);
    expect(roomSchema.safeParse('area:elsewhere').success).toBe(false);
  });
  it('snaps a remote avatar to its arrival when changing scene instead of animating from its previous map', () => {
    trackCharacter('scene-traveller', position, .016, true, 'residential');
    const interpolated = trackCharacter('scene-traveller', { ...position, x: 92 }, .016, true, 'residential');
    expect(interpolated.x).toBeLessThan(92);
    expect(trackCharacter('scene-traveller', { ...position, x: 92 }, .016, true, 'community')).toEqual({ x: 92, y: 220 });
    expect(trackCharacter('scene-traveller', { ...position, x: 100 }, .016, true, 'house:a')).toEqual({ x: 100, y: 220 });
  });
});

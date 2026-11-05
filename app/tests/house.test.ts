import { describe, expect, it } from 'vitest';
import type { PublicHouse } from '../../packages/core/src/protocol/types';
import { HOUSE_SPAWN, addFurniture, deleteFurniture, moveFurniture, setFurnitureAlias, stepHousePosition } from '../src/house/model';

const empty = (): PublicHouse => ({ ownerId: 'owner', revision: 1, name: 'Casa', access: 'ask', theme: 'mint', furniture: [] });

describe('house ownership and geometry', () => {
  it('rejects visitor layout edits even when they know furniture ids', () => {
    const owned = addFurniture(empty(), 'desk', 'owner', 'desk-1');
    expect(owned.furniture).toHaveLength(1);
    expect(moveFurniture(owned, 'desk-1', 500, 200, 'visitor')).toBe(owned);
    expect(setFurnitureAlias(owned, 'desk-1', 'Injected', 'visitor')).toBe(owned);
    expect(deleteFurniture(owned, 'desk-1', 'visitor')).toBe(owned);
    expect(addFurniture(owned, 'board', 'visitor', 'board-1')).toBe(owned);
  });

  it('clamps furniture to the logical room and enforces the cap', () => {
    let owned = addFurniture(empty(), 'desk', 'owner', 'desk-1');
    owned = moveFurniture(owned, 'desk-1', 50_000, -50_000, 'owner');
    expect(owned.furniture[0].x).toBeLessThanOrEqual(736);
    expect(owned.furniture[0].y).toBeGreaterThanOrEqual(72);
    for (let n = 2; n <= 32; n++) owned = addFurniture(owned, 'plant', 'owner', `id-${n}`);
    expect(owned.furniture).toHaveLength(32);
    expect(addFurniture(owned, 'table', 'owner', 'overflow')).toBe(owned);
  });

  it('keeps an avatar from walking through solid furniture', () => {
    const room = addFurniture(empty(), 'table', 'owner', 'table-1');
    const item = room.furniture[0];
    const start = { ...HOUSE_SPAWN, x: item.x - 10, y: item.y + 15 };
    const next = stepHousePosition(start, { x: 1, y: 0 }, 0.05, room);
    expect(next.x).toBe(start.x);
  });
});

describe('house doorway', () => {
  it('lets E leave only from the doormat, not from the spawn point or the room', async () => {
    const { atHouseDoor, HOUSE_SPAWN, HOUSE_DOOR } = await import('../src/house/model');
    expect(atHouseDoor({ ...HOUSE_DOOR, direction: 'down', moving: false })).toBe(true);
    expect(atHouseDoor({ x: 396, y: 380, direction: 'down', moving: false })).toBe(true);
    expect(atHouseDoor(HOUSE_SPAWN)).toBe(false);
    expect(atHouseDoor({ x: 384, y: 220, direction: 'down', moving: false })).toBe(false);
    expect(atHouseDoor({ x: 120, y: 396, direction: 'down', moving: false })).toBe(false);
  });

  it('detects nearby furniture for E interaction without triggering at the house spawn point', async () => {
    const { closestFurniture, HOUSE_SPAWN } = await import('../src/house/model');
    const house = addFurniture(empty(), 'desk', 'owner', 'desk-1');
    expect(closestFurniture(HOUSE_SPAWN, house)).toBeNull();
    const nearDesk = closestFurniture({ x: 130, y: 170, direction: 'up', moving: false }, house);
    expect(nearDesk?.kind).toBe('desk');
  });
});


import { describe, expect, it } from 'vitest';
import {
  FURNITURE_PROMPT_LABELS,
  closestFurniture,
  atHouseDoor,
  stepHousePosition,
} from '../src/house/model';
import {
  closestDoor,
  occupiedParcels,
  stepPosition,
  worldObstacles,
  WORLD_SPAWN,
} from '../src/world/model';
import type { PublicHouse, AppView } from '../../packages/core/src/protocol/types';

describe('Mobile Controller Logic & D-pad Direction Calculations', () => {
  it('correctly maps virtual D-pad touch coordinates to 4-way and 8-way directional inputs', () => {
    const center = { x: 66, y: 66 };
    const deadzone = 12;

    const computeDpadDirections = (clientX: number, clientY: number) => {
      const dx = clientX - center.x;
      const dy = clientY - center.y;
      const keys = new Set<string>();
      if (Math.hypot(dx, dy) >= deadzone) {
        if (dy < -deadzone) keys.add('arrowup');
        if (dy > deadzone) keys.add('arrowdown');
        if (dx < -deadzone) keys.add('arrowleft');
        if (dx > deadzone) keys.add('arrowright');
      }
      return keys;
    };

    // Center tap within deadzone produces no movement
    expect(computeDpadDirections(66, 66).size).toBe(0);
    expect(computeDpadDirections(70, 68).size).toBe(0);

    // Cardinal directions
    const up = computeDpadDirections(66, 20);
    expect(up.has('arrowup')).toBe(true);
    expect(up.size).toBe(1);

    const down = computeDpadDirections(66, 110);
    expect(down.has('arrowdown')).toBe(true);
    expect(down.size).toBe(1);

    const left = computeDpadDirections(10, 66);
    expect(left.has('arrowleft')).toBe(true);
    expect(left.size).toBe(1);

    const right = computeDpadDirections(120, 66);
    expect(right.has('arrowright')).toBe(true);
    expect(right.size).toBe(1);

    // Diagonal thumbstick glide (Up-Right, Down-Left)
    const upRight = computeDpadDirections(110, 20);
    expect(upRight.has('arrowup')).toBe(true);
    expect(upRight.has('arrowright')).toBe(true);

    const downLeft = computeDpadDirections(20, 110);
    expect(downLeft.has('arrowdown')).toBe(true);
    expect(downLeft.has('arrowleft')).toBe(true);
  });

  it('updates contextual Action Button prompts for mobile players near doors and furniture', () => {
    const house: PublicHouse = {
      ownerId: 'player-1',
      name: 'Casa Móvil',
      access: 'open',
      theme: 'mint',
      revision: 1,
      furniture: [
        { id: 'desk-1', kind: 'desk', x: 200, y: 150, publicAlias: 'Mi escritorio' },
        { id: 'board-1', kind: 'board', x: 380, y: 120, publicAlias: 'Pizarra de estudio' },
        { id: 'bookshelf-1', kind: 'bookshelf', x: 550, y: 140, publicAlias: 'Biblioteca' },
      ],
    };

    // When standing near the desk
    const nearDesk = closestFurniture({ x: 210, y: 160, direction: 'down', moving: false }, house);
    expect(nearDesk?.kind).toBe('desk');
    expect(FURNITURE_PROMPT_LABELS['desk']).toContain('Proyectos');

    // When standing near the bookshelf
    const nearBookshelf = closestFurniture({ x: 545, y: 150, direction: 'down', moving: false }, house);
    expect(nearBookshelf?.kind).toBe('bookshelf');
    expect(FURNITURE_PROMPT_LABELS['bookshelf']).toContain('Tarjetas');

    // When standing right at the house exit door
    expect(atHouseDoor({ x: 384, y: 395, direction: 'down', moving: false })).toBe(true);
    // When far from the door
    expect(atHouseDoor({ x: 200, y: 200, direction: 'down', moving: false })).toBe(false);
  });

  it('calculates tap-to-walk vectors and advances avatar towards destination', () => {
    const start = { x: 384, y: 216, direction: 'down' as const, moving: false };
    const destination = { x: 450, y: 216 };

    const dx = destination.x - start.x;
    const dy = destination.y - start.y;
    const dist = Math.hypot(dx, dy);

    expect(dist).toBeGreaterThan(0);
    const vector = { x: dx / dist, y: dy / dist };
    expect(vector.x).toBe(1);
    expect(vector.y).toBe(0);

    const next = stepPosition(start, vector, 0.05, []);
    expect(next.x).toBeGreaterThan(start.x);
    expect(next.moving).toBe(true);
  });
});

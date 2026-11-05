import { describe, expect, it } from 'vitest';
import type { AppView, PublicHouse, PublicIdentity } from '../../packages/core/src/protocol/types';
import { PARCELS, WORLD_SPAWN, closestDoor, occupiedParcels, stepPosition, worldObstacles } from '../src/world/model';

const identity = (fingerprint: string): PublicIdentity => ({ fingerprint, publicKey: 'key', displayName: fingerprint, color: '#e88d79' });
const house = (ownerId: string): PublicHouse => ({ ownerId, revision: 1, name: `${ownerId} house`, access: 'open', theme: 'mint', furniture: [] });
const member = (id: string, slot: number, connected = true) => ({
  identity: identity(id), endpoint: id, slot, connected, houseId: null, position: WORLD_SPAWN,
});
const view = (members: ReturnType<typeof member>[], houses: PublicHouse[]): AppView => ({
  identity: identity('own'), ownHouse: house('own'), contacts: [], friendCode: '', storage: 'memory',
  identitySaved: false, lockedIdentity: false, notice: null, diagnostics: [], editorText: '',
  network: { gameCamera: { local: null, remote: [], pending: false, error: null }, phase: 'JOINED', isHost: true, hostId: null, sessionId: 's', invite: '', members, houses,
    pendingJoins: [], pendingVisits: [], strokes: [], hostGraceRemainingMs: null, error: null,
    privateCall: { with: null, active: false, incoming: [] },
    media: { micEnabled: false, muted: false, deafened: false, pushToTalk: false, talking: false,
      screenPhase: 'OFF', localScreen: null, remote: [], audience: '', error: null } },
});

describe('village parcels', () => {
  it('uses exactly six fixed slots and renders only connected owners with a house', () => {
    expect(PARCELS).toHaveLength(6);
    const placed = occupiedParcels(view([member('own', 0), member('alice', 2), member('bob', 4, false)], [house('alice'), house('bob')]));
    expect(placed.map((item) => [item.ownerId, item.parcel.slot])).toEqual([['own', 0], ['alice', 2]]);
    expect(closestDoor({ ...WORLD_SPAWN, x: PARCELS[2].doorX, y: PARCELS[2].doorY }, placed)?.ownerId).toBe('alice');
  });

  it('shows only the own house while offline', () => {
    const placed = occupiedParcels(view([], [house('old-remote')]));
    expect(placed.map((item) => item.ownerId)).toEqual(['own']);
  });
});

describe('walking', () => {
  it('uses bounded delta time and cannot cross a house footprint', () => {
    const placed = occupiedParcels(view([member('own', 0)], []));
    const start = { ...WORLD_SPAWN, x: 104, y: 139 };
    const next = stepPosition(start, { x: 0, y: -1 }, 3, worldObstacles(placed));
    expect(next.y).toBeGreaterThanOrEqual(126);
    expect(next.y).toBeLessThan(start.y);
    expect(next.direction).toBe('up');
  });

  it('stays finite and inside bounds for invalid frame intervals', () => {
    const next = stepPosition({ ...WORLD_SPAWN, x: 10, y: 10 }, { x: -1, y: -1 }, Number.POSITIVE_INFINITY, []);
    expect(Number.isFinite(next.x) && Number.isFinite(next.y)).toBe(true);
    expect(next.x).toBeGreaterThanOrEqual(9);
    expect(next.y).toBeGreaterThanOrEqual(9);
  });
});

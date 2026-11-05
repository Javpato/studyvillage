import { describe, expect, it } from 'vitest';
import { newLocalData, parseLocalData, publicHouse, SaveQueue, serializeLocalData } from '../../packages/runtime/src/storage/local-store';
import type { LocalData, LocalStore } from '../../packages/runtime/src/storage/local-store';
import type { PublicHouse } from '../../packages/core/src/protocol/types';
import { DEFAULT_APPEARANCE } from '../src/assets/appearance';

const house: PublicHouse = { ownerId: 'local-owner', revision: 1, name: 'Casa', access: 'ask', theme: 'mint', furniture: [{ id: 'desk', kind: 'desk', publicAlias: 'Proyecto', x: 100, y: 100 }] };
describe('local storage boundary', () => {
  it('loads avatars saved before body selection without losing other local data', () => {
    const { body, ...appearance } = { ...DEFAULT_APPEARANCE, hairColor: '#123456' };
    const legacy = { ...newLocalData(), house, editor: 'Saved notes', profile: { displayName: 'Ana', color: '#336699', appearance } };
    const original = JSON.stringify(legacy);
    const loaded = parseLocalData(legacy);
    expect(loaded).toEqual({ ...legacy, profile: { ...legacy.profile, appearance: { ...appearance, body } } });
    expect(JSON.stringify(legacy)).toBe(original);
    expect(parseLocalData(JSON.parse(serializeLocalData(loaded)))).toEqual(loaded);
  });
  it('preserves selected body types and rejects invalid saved avatar fields', () => {
    const data = newLocalData();
    data.profile.appearance = { ...DEFAULT_APPEARANCE, body: 'feminine' };
    expect(parseLocalData(data)).toEqual(data);
    expect(() => parseLocalData({ ...data, profile: { ...data.profile, appearance: { ...data.profile.appearance, body: 'invalid' } } })).toThrow();
    expect(() => parseLocalData({ ...data, profile: { ...data.profile, appearance: { ...data.profile.appearance, hairColor: 'invalid' } } })).toThrow();
  });
  it('roundtrips a versioned own-only document', () => {
    const data = newLocalData(); data.house = house;
    expect(parseLocalData(JSON.parse(serializeLocalData(data)))).toEqual(data);
  });
  it('keeps private nicknames and session contacts without inventing a friend code',()=>{
    const data=newLocalData();data.contacts=[{schemaVersion:1,identity:{fingerprint:'b'.repeat(64),publicKey:'A'.repeat(44),displayName:'Ana',color:'#336699'},nickname:'Study buddy'}];
    expect(parseLocalData(JSON.parse(serializeLocalData(data))).contacts).toEqual(data.contacts);
    expect(()=>serializeLocalData({...data,contacts:[{...data.contacts[0],nickname:'x'.repeat(49)}]})).toThrow();
  });
  it('rejects unsupported versions, remote caches and plaintext private keys', () => {
    const data = newLocalData();
    expect(() => parseLocalData({ ...data, schemaVersion: 2 })).toThrow();
    expect(() => parseLocalData({ ...data, remoteHouses: [house] })).toThrow();
    expect(() => parseLocalData({ ...data, privateKey: 'SECRET' })).toThrow();
  });
  it('projects only public furniture metadata even from extended objects', () => {
    const extended = { ...house, privatePath: '/home/private', furniture: [{ ...house.furniture[0], privatePath: '/secrets/project', content: 'PRIVATE' }] };
    expect(publicHouse(extended)).toEqual(house);
    expect(JSON.stringify(publicHouse(extended))).not.toMatch(/privatePath|PRIVATE|secrets/);
  });
  it('rejects out of bounds, duplicate IDs and oversized editor text', () => {
    expect(() => publicHouse({ ...house, furniture: [{ ...house.furniture[0], x: Infinity }] })).toThrow();
    expect(() => publicHouse({ ...house, furniture: [house.furniture[0], house.furniture[0]] })).toThrow();
    expect(() => serializeLocalData({ ...newLocalData(), editor: 'a'.repeat(1_048_577) })).toThrow();
  });
  it('coalesces burst writes and retains the newest layout', async () => {
    const writes: LocalData[] = []; let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const store: LocalStore = { kind: 'memory', load: async () => null, close() {}, async save(data) { writes.push(data); if (writes.length === 1) await gate; } };
    const queue = new SaveQueue(store, () => {}); const data = newLocalData();
    void queue.save(data);
    for (let i = 0; i < 1000; i++) void queue.save({ ...data, editor: `revision ${i}` });
    release(); await queue.flush();
    expect(writes).toHaveLength(2); expect(writes[1].editor).toBe('revision 999');
  });
  it('reports failure without deleting or resetting the previous store', async () => {
    const failures: unknown[] = [];
    const store: LocalStore = { kind: 'memory', load: async () => null, close() {}, save: async () => { throw new Error('disk full'); } };
    const queue = new SaveQueue(store, e => failures.push(e));
    await queue.save(newLocalData()); expect(failures).toHaveLength(1);
  });
});

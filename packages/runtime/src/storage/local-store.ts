import { FURNITURE_KINDS } from '../../../core/src/house/furniture';
import {petConfigSchema} from '../../../core/src/pets/model';
import { gardenSchema } from '../../../core/src/protocol/garden';
import { doorPositionsSchema, accessListSchema, floorsSchema } from '../../../core/src/house/workspaces';
import { desktopBridge } from '../local-bridge/desktop';
import { appearanceSchema, DEFAULT_APPEARANCE, type AvatarAppearance } from '../../../core/src/assets/appearance';
import { z } from 'zod';
import type { Contact, EncryptedIdentity, PublicHouse } from '../../../core/src/protocol/types';

const text = (max: number) => z.string().max(max);
const identity = z.object({ fingerprint: text(128).min(16), publicKey: text(2048).min(32), displayName: text(32).min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict();
const furniture = z.object({ pet:petConfigSchema.optional(), guideText:text(320).optional(), showFrame:z.boolean().optional(), color:z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(), id: text(80).min(1), kind: z.enum(FURNITURE_KINDS), x: z.number().finite().min(0).max(736), y: z.number().finite().min(0).max(400), publicAlias: text(48) }).strict();
export const houseSchema = z.object({ garden:gardenSchema.optional(), floors: floorsSchema.optional(), allowlist: accessListSchema.optional(), doorPositions: doorPositionsSchema.optional(), ownerId: text(128).min(1), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), name: text(48).min(1), access: z.enum(['open', 'ask', 'locked']), theme: z.enum(['mint', 'peach']), furniture: z.array(furniture).max(32) }).strict().refine(h => new Set(h.furniture.map(f => f.id)).size === h.furniture.length, 'Duplicate furniture id');
const contact = z.object({ schemaVersion: z.literal(1), identity, friendCode: text(128).min(1).optional(), nickname: text(48).optional() }).strict();
const encrypted = z.object({ v: z.literal(1), kdf: z.literal('PBKDF2-SHA256'), iterations: z.number().int().min(100_000).max(2_000_000), salt: text(128), iv: text(128), ciphertext: text(8192), publicIdentity: identity }).strict();
// Older saved avatars predate body selection. Supply only the missing field;
// keep validating every saved value rather than resetting the avatar or store.
const savedAppearanceSchema = appearanceSchema.extend({
  body: appearanceSchema.shape.body.default(DEFAULT_APPEARANCE.body),
});
const localSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.object({ displayName: text(32).min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i), appearance: savedAppearanceSchema.optional(), wardrobeAdded: z.boolean().optional() }).strict(),
  house: houseSchema.nullable(), friendCode: text(128).min(1),
  contacts: z.array(contact).max(100), encryptedIdentity: encrypted.nullable(),
  editor: text(1_048_576),
  projectLinks: z.record(z.string().max(80), z.object({ name: text(256), kind: z.enum(['text', 'image', 'pdf']), privatePath: text(4096).optional() }).strict()).refine(v => Object.keys(v).length <= 32),
}).strict();

export interface LocalData {
  schemaVersion: 1;
  profile: { displayName: string; color: string; appearance?: AvatarAppearance; wardrobeAdded?: boolean };
  house: PublicHouse | null;
  friendCode: string;
  contacts: Contact[];
  encryptedIdentity: EncryptedIdentity | null;
  editor: string;
  projectLinks: Record<string, { name: string; kind: 'text' | 'image' | 'pdf'; privatePath?: string }>;
}

/** Local data is deliberately unrelated to NetworkView: no remote cache can be serialized. */
export function parseLocalData(value: unknown): LocalData { return localSchema.parse(value); }
export function serializeLocalData(value: LocalData): string {
  const result = JSON.stringify(parseLocalData(value));
  if (new TextEncoder().encode(result).length > 2_097_152) throw new Error('Almacenamiento local lleno (límite de 2 MiB).');
  return result;
}
export function newLocalData(): LocalData {
  return { schemaVersion: 1, profile: { displayName: 'Explorador', color: '#df8a72' }, house: null, friendCode: crypto.randomUUID(), contacts: [], encryptedIdentity: null, editor: '', projectLinks: {} };
}

export interface LocalStore { kind: 'sqlite' | 'indexeddb' | 'memory'; load(): Promise<LocalData | null>; save(data: LocalData): Promise<void>; close(): void }

/** Use an explicit projection even when callers pass extended local objects. */
export function publicHouse(house: PublicHouse, ownerId = house.ownerId): PublicHouse {
  return houseSchema.parse({ ...(house.garden?{garden:house.garden}:{}), ...(house.doorPositions?{doorPositions:house.doorPositions}:{}), ...(house.allowlist ? {allowlist:house.allowlist} : {}), ...(house.floors ? {floors:house.floors} : {}), ownerId, revision: house.revision, name: house.name, access: house.access, theme: house.theme,
    furniture: house.furniture.map(f => ({ ...(f.pet?{pet:f.pet}:{}), id: f.id, kind: f.kind, x: f.x, y: f.y, publicAlias: f.publicAlias, ...(f.guideText!==undefined?{guideText:f.guideText}:{}), ...(f.showFrame!==undefined?{showFrame:f.showFrame}:{}), ...(f.sprite?{sprite:f.sprite}:{}), ...(f.color?{color:f.color}:{}), ...(f.rotation !== undefined ? { rotation: f.rotation } : {}) })) });
}

export function isNative(): boolean { return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window; }

export async function openLocalStore(): Promise<LocalStore> {
  const desktop = desktopBridge();
  if (desktop) return {
    kind: 'sqlite',
    async load() { const raw = await desktop.loadLocal(); return raw === null ? null : parseLocalData(JSON.parse(raw)); },
    async save(data) { await desktop.saveLocal(serializeLocalData(data)); },
    close() {},
  };
  if (isNative()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return {
      kind: 'sqlite',
      async load() { const raw = await invoke<string | null>('load_local'); return raw === null ? null : parseLocalData(JSON.parse(raw)); },
      async save(data) { await invoke('save_local', { json: serializeLocalData(data) }); }, close() {},
    };
  }
  if (typeof indexedDB === 'undefined') throw new Error('Este entorno no ofrece almacenamiento local.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('studyvillage-local', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('own-data')) request.result.createObjectStore('own-data'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento local. No se ha borrado nada.'));
    request.onblocked = () => reject(new Error('Cierra otras ventanas de StudyVillage para actualizar el almacenamiento.'));
  });
  db.onversionchange = () => db.close();
  return {
    kind: 'indexeddb',
    async load():Promise<LocalData|null> {
      const committed=await new Promise<LocalData|null>((resolve,reject)=>{
        const tx=db.transaction('own-data','readonly'),request=tx.objectStore('own-data').get('state');
        request.onsuccess=()=>{try{resolve(request.result===undefined?null:parseLocalData(JSON.parse(request.result as string)));}catch{reject(new Error('Datos locales incompatibles o dañados. Conservamos la copia original; no se sobrescribirá.'));}};
        request.onerror=()=>reject(new Error('No se pudo leer el almacenamiento local.'));
      });
      if(committed)return committed;
      // Adopt an old synchronous mirror only when no committed canonical record exists.
      const legacy=typeof localStorage==='undefined'?null:localStorage.getItem('studyvillage-local-sync');
      if(!legacy)return null;
      const migrated=parseLocalData(JSON.parse(legacy));await new Promise<void>((resolve,reject)=>{const tx=db.transaction('own-data','readwrite');tx.objectStore('own-data').put(serializeLocalData(migrated),'state');tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);});return migrated;
    },
    async save(data) {
      const json = serializeLocalData(data);
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('own-data', 'readwrite');
        tx.objectStore('own-data').put(json, 'state');
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(new Error('No se pudo guardar. Comprueba el espacio disponible; tu copia anterior se conserva.'));
      });
    },
    close() { db.close(); },
  };
}

/** Latest-state write coalescing: at most one in flight and one pending snapshot. */
export class SaveQueue {
  private pending: LocalData | null = null;
  private active: Promise<void> | null = null;
  constructor(private store: LocalStore, private onError: (error: unknown) => void) {}
  save(data: LocalData): Promise<void> {
    this.pending = parseLocalData(data);
    if (!this.active) this.active = this.drain().finally(() => {
      this.active = null;
      if (this.pending) void this.save(this.pending);
    });
    return this.active;
  }
  private async drain() {
    while (this.pending) {
      const data = this.pending; this.pending = null;
      try { await this.store.save(data); } catch (error) { this.onError(error); }
    }
  }
  async flush() { while (this.active) await this.active; }
}

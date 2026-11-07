import {isValidCustomSpriteDataUrl,sanitizeObjectDisplayName} from '../../../packages/core/src/assets/validation';
export {isValidCustomSpriteDataUrl,sanitizeObjectDisplayName} from '../../../packages/core/src/assets/validation';
import { INTERACTION_REACH } from './interactions';
import { z } from 'zod';
import type { Rect } from './model';

/**
 * Part 3 — Extensible Interactive Object System
 *
 * Stations and decorations share stable IDs, editable names and sprites,
 * permissions and persistent state. Gameplay targets are restricted to objects
 * with a real action; decorations remain available to the configuration tools.
 */

export type WorldAreaKind = 'residential' | 'community' | 'study' | 'house';

export type InteractiveObjectKind =
  | 'whiteboard'
  | 'computer_project'
  | 'arcade_tetris'
  | 'drawing_table_gartic'
  | 'campfire_werewolves'
  | 'bookshelf_notes'
  | 'flashcard_podium'
  | 'ai_tutor_console'
  | 'study_desk'
  | 'voice_table'
  | 'lamp'
  | 'plant'
  | 'frame'
  | 'cabinet'
  | 'guide'
  | 'portal';

const ACTION_KINDS: ReadonlySet<InteractiveObjectKind> = new Set([
  'arcade_tetris', 'whiteboard', 'computer_project', 'drawing_table_gartic', 'campfire_werewolves',
  'bookshelf_notes', 'flashcard_podium', 'ai_tutor_console', 'study_desk', 'voice_table', 'guide',
]);
/** Rendering/configuration also supports ornaments; only these open a real activity. */
export function worldObjectHasAction(kind: InteractiveObjectKind): boolean {
  return ACTION_KINDS.has(kind);
}

export type ObjectPermissionScope =
  | 'public'
  | 'participants'
  | 'selected'
  | 'host_only'
  | 'owner_only';

export type ObjectVisibilityScope = 'everyone' | 'participants' | 'owner_only';

export interface InteractiveObjectConfig {
  id: string;
  areaId: string;
  kind: InteractiveObjectKind;
  defaultLabel: string;
  displayName: string;
  description: string;
  promptKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: 'ground' | 'object' | 'wall' | 'overlay';
  hasCollision: boolean;
  interactionRadius: number;
  ownerId: string | null;
  visibility: ObjectVisibilityScope;
  usePermission: ObjectPermissionScope;
  editPermission: ObjectPermissionScope;
  allowedUsers: string[];
  customSpriteDataUrl: string | null;
  customColor: string | null;
  targetAreaId?: string;
  linkedBoardId?: string;
  linkedProjectId?: string;
  linkedNotebookId?: string;
  state: Record<string, string | number | boolean>;
  revision: number;
}

export const interactiveObjectSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9:_-]{1,96}$/),
  areaId: z.string().min(1).max(96),
  kind: z.enum([
    'whiteboard',
    'computer_project',
    'arcade_tetris',
    'drawing_table_gartic',
    'campfire_werewolves',
    'bookshelf_notes',
    'flashcard_podium',
    'ai_tutor_console',
    'study_desk',
    'voice_table',
    'lamp',
    'plant',
    'frame',
    'cabinet',
    'guide',
    'portal',
  ]),
  defaultLabel: z.string().min(1).max(60),
  displayName: z.string().min(1).max(48),
  description: z.string().max(200),
  promptKey: z.string().min(1).max(48),
  x: z.number().min(0).max(768),
  y: z.number().min(0).max(432),
  w: z.number().min(8).max(240),
  h: z.number().min(8).max(200),
  layer: z.enum(['ground', 'object', 'wall', 'overlay']),
  hasCollision: z.boolean(),
  interactionRadius: z.number().min(12).max(120),
  ownerId: z.string().max(128).nullable(),
  visibility: z.enum(['everyone', 'participants', 'owner_only']),
  usePermission: z.enum(['public', 'participants', 'selected', 'host_only', 'owner_only']),
  editPermission: z.enum(['public', 'participants', 'selected', 'host_only', 'owner_only']),
  allowedUsers: z.array(z.string().max(128)).max(16),
  customSpriteDataUrl: z
    .string()
    .refine((val) => isValidCustomSpriteDataUrl(val), 'Invalid or unsafe sprite image Data URL')
    .nullable(),
  customColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  targetAreaId: z.string().max(96).optional(),
  linkedBoardId: z.string().max(96).optional(),
  linkedProjectId: z.string().max(96).optional(),
  linkedNotebookId: z.string().max(96).optional(),
  state: z.record(z.string().max(48), z.union([z.string().max(240), z.number(), z.boolean()])),
  revision: z.number().int().nonnegative(),
});

const STORAGE_KEY = 'studyvillage-interactive-objects-v1';
const decodedObjectSprites = new Map<string, HTMLImageElement>();

export class InteractiveObjectRegistry {
  private objects = new Map<string, InteractiveObjectConfig>();

  constructor(initialObjects: readonly InteractiveObjectConfig[] = []) {
    for (const obj of initialObjects) {
      this.objects.set(obj.id, { ...obj });
    }
    this.loadPersistedOverrides();
  }

  registerDefaults(defaults: readonly InteractiveObjectConfig[]): void {
    for (const def of defaults) {
      const existing = this.objects.get(def.id);
      if (!existing) {
        this.objects.set(def.id, { ...def, state: { ...def.state }, allowedUsers: [...def.allowedUsers] });
      }
    }
  }

  get(id: string): InteractiveObjectConfig | null {
    return this.objects.get(id) ?? null;
  }

  listByArea(areaId: string, viewerId?: string, isJoinedParticipant = true): InteractiveObjectConfig[] {
    const result: InteractiveObjectConfig[] = [];
    for (const obj of this.objects.values()) {
      if (obj.areaId !== areaId) continue;
      if (!this.canView(obj, viewerId ?? '', isJoinedParticipant)) continue;
      result.push(obj);
    }
    return result;
  }

  canView(obj: InteractiveObjectConfig, userId: string, isParticipant = true): boolean {
    if (obj.visibility === 'everyone') return true;
    if (obj.ownerId && obj.ownerId === userId) return true;
    if (obj.visibility === 'participants') return isParticipant;
    if (obj.visibility === 'owner_only') return obj.ownerId === userId;
    return true;
  }

  canUse(obj: InteractiveObjectConfig, userId: string, isHost: boolean, isParticipant = true): boolean {
    if (obj.ownerId && obj.ownerId === userId) return true;
    switch (obj.usePermission) {
      case 'public':
        return true;
      case 'participants':
        return isParticipant;
      case 'host_only':
        return isHost;
      case 'owner_only':
        return obj.ownerId === userId;
      case 'selected':
        return isHost || obj.allowedUsers.includes(userId);
      default:
        return false;
    }
  }

  canConfigure(obj: InteractiveObjectConfig, userId: string, isHost: boolean, isParticipant = true): boolean {
    if (obj.ownerId && obj.ownerId === userId) return true;
    switch (obj.editPermission) {
      case 'public':
        return true;
      case 'participants':
        return isParticipant;
      case 'host_only':
        return isHost;
      case 'owner_only':
        return obj.ownerId === userId || (obj.ownerId === null && isHost);
      case 'selected':
        return isHost || obj.allowedUsers.includes(userId);
      default:
        return false;
    }
  }

  renameObject(id: string, newDisplayName: string, actorId: string, isHost: boolean): InteractiveObjectConfig {
    const obj = this.objects.get(id);
    if (!obj) throw new Error('Objeto interactivo no encontrado.');
    if (!this.canConfigure(obj, actorId, isHost)) {
      throw new Error('No tienes permiso para renombrar este objeto.');
    }
    const cleanName = sanitizeObjectDisplayName(newDisplayName, obj.defaultLabel);
    const updated: InteractiveObjectConfig = {
      ...obj,
      displayName: cleanName,
      revision: obj.revision + 1,
    };
    interactiveObjectSchema.parse(updated);
    this.objects.set(id, updated);
    this.persistOverrides();
    return updated;
  }

  assignCustomSprite(
    id: string,
    spriteDataUrl: string | null,
    customColor: string | null,
    actorId: string,
    isHost: boolean,
  ): InteractiveObjectConfig {
    const obj = this.objects.get(id);
    if (!obj) throw new Error('Objeto interactivo no encontrado.');
    if (!this.canConfigure(obj, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar el sprite de este objeto.');
    }
    if (spriteDataUrl !== null && !isValidCustomSpriteDataUrl(spriteDataUrl)) {
      throw new Error('El sprite debe ser una imagen PNG, JPEG o WebP válida de hasta 512 KB.');
    }
    if (customColor !== null && !/^#[0-9a-fA-F]{6}$/.test(customColor)) {
      throw new Error('El color personalizado debe estar en formato hexadecimal (#RRGGBB).');
    }
    const updated: InteractiveObjectConfig = {
      ...obj,
      customSpriteDataUrl: spriteDataUrl,
      customColor,
      revision: obj.revision + 1,
    };
    interactiveObjectSchema.parse(updated);
    this.objects.set(id, updated);
    this.refreshDecodedSprite(id, spriteDataUrl);
    this.persistOverrides();
    return updated;
  }

  updatePermissions(
    id: string,
    patch: Partial<Pick<InteractiveObjectConfig, 'visibility' | 'usePermission' | 'editPermission' | 'allowedUsers'>>,
    actorId: string,
    isHost: boolean,
  ): InteractiveObjectConfig {
    const obj = this.objects.get(id);
    if (!obj) throw new Error('Objeto interactivo no encontrado.');
    if (!this.canConfigure(obj, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar los permisos de este objeto.');
    }
    const updated: InteractiveObjectConfig = {
      ...obj,
      ...patch,
      revision: obj.revision + 1,
    };
    interactiveObjectSchema.parse(updated);
    this.objects.set(id, updated);
    this.persistOverrides();
    return updated;
  }

  updateState(
    id: string,
    statePatch: Record<string, string | number | boolean>,
    actorId: string,
    isHost: boolean,
  ): InteractiveObjectConfig {
    const obj = this.objects.get(id);
    if (!obj) throw new Error('Objeto interactivo no encontrado.');
    if (!this.canUse(obj, actorId, isHost)) {
      throw new Error('No tienes permiso para usar este objeto.');
    }
    const updated: InteractiveObjectConfig = {
      ...obj,
      state: { ...obj.state, ...statePatch },
      revision: obj.revision + 1,
    };
    interactiveObjectSchema.parse(updated);
    this.objects.set(id, updated);
    this.persistOverrides();
    return updated;
  }

  applyRemoteUpdate(raw: unknown): InteractiveObjectConfig {
    const parsed = interactiveObjectSchema.parse(raw);
    const existing = this.objects.get(parsed.id);
    if (existing && existing.revision > parsed.revision) {
      return existing;
    }
    this.objects.set(parsed.id, parsed);
    this.refreshDecodedSprite(parsed.id, parsed.customSpriteDataUrl);
    return parsed;
  }

  getDecodedSprite(id: string): HTMLImageElement | null {
    const img = decodedObjectSprites.get(id);
    if (img && img.complete && img.naturalWidth > 0) return img;
    return null;
  }

  obstaclesForArea(areaId: string): Rect[] {
    return this.listByArea(areaId)
      .filter((o) => o.hasCollision)
      .map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
  }

  closestInteractable(
    areaId: string,
    x: number,
    y: number,
    userId: string,
    isParticipant = true,
  ): InteractiveObjectConfig | null {
    let best: InteractiveObjectConfig | null = null;
    let bestDist = Infinity;
    for (const obj of this.listByArea(areaId, userId, isParticipant)) {
      if (!worldObjectHasAction(obj.kind)) continue;
      const nx = Math.max(obj.x, Math.min(x, obj.x + obj.w));
      const ny = Math.max(obj.y, Math.min(y, obj.y + obj.h));
      const dist = Math.hypot(x - nx, y - ny);
      if (dist <= Math.min(INTERACTION_REACH,obj.interactionRadius) && dist < bestDist) {
        bestDist = dist;
        best = obj;
      }
    }
    return best;
  }

  hitTest(areaId: string, x: number, y: number, userId = '', isParticipant = true): InteractiveObjectConfig | null {
    const list = this.listByArea(areaId, userId, isParticipant);
    for (let i = list.length - 1; i >= 0; i--) {
      const obj = list[i];
      if (x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + obj.h) {
        return worldObjectHasAction(obj.kind) ? obj : null;
      }
    }
    return null;
  }

  private refreshDecodedSprite(id: string, dataUrl: string | null): void {
    if (!dataUrl || typeof Image === 'undefined') {
      decodedObjectSprites.delete(id);
      return;
    }
    const img = new Image();
    img.src = dataUrl;
    decodedObjectSprites.set(id, img);
  }

  private persistOverrides(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const overrides: Record<
        string,
        Pick<
          InteractiveObjectConfig,
          | 'displayName'
          | 'customSpriteDataUrl'
          | 'customColor'
          | 'visibility'
          | 'usePermission'
          | 'editPermission'
          | 'allowedUsers'
          | 'state'
          | 'revision'
        >
      > = {};
      for (const [id, obj] of this.objects.entries()) {
        if (obj.revision > 1) {
          overrides[id] = {
            displayName: obj.displayName,
            customSpriteDataUrl: obj.customSpriteDataUrl,
            customColor: obj.customColor,
            visibility: obj.visibility,
            usePermission: obj.usePermission,
            editPermission: obj.editPermission,
            allowedUsers: obj.allowedUsers,
            state: obj.state,
            revision: obj.revision,
          };
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      // Ignore storage quota issues
    }
  }

  private loadPersistedOverrides(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, Partial<InteractiveObjectConfig>>;
      for (const [id, patch] of Object.entries(parsed)) {
        const base = this.objects.get(id);
        if (!base) continue;
        const candidate: InteractiveObjectConfig = {
          ...base,
          displayName: typeof patch.displayName === 'string' ? sanitizeObjectDisplayName(patch.displayName, base.defaultLabel) : base.displayName,
          customSpriteDataUrl: isValidCustomSpriteDataUrl(patch.customSpriteDataUrl) ? patch.customSpriteDataUrl : null,
          customColor: typeof patch.customColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(patch.customColor) ? patch.customColor : null,
          visibility: patch.visibility ?? base.visibility,
          usePermission: patch.usePermission ?? base.usePermission,
          editPermission: patch.editPermission ?? base.editPermission,
          allowedUsers: Array.isArray(patch.allowedUsers) ? patch.allowedUsers.slice(0, 16) : base.allowedUsers,
          state: patch.state && typeof patch.state === 'object' ? { ...base.state, ...patch.state } : base.state,
          revision: typeof patch.revision === 'number' ? patch.revision : base.revision,
        };
        const valid = interactiveObjectSchema.safeParse(candidate);
        if (valid.success) {
          this.objects.set(id, valid.data);
          this.refreshDecodedSprite(id, valid.data.customSpriteDataUrl);
        }
      }
    } catch {
      // Keep defaults on parse error
    }
  }
}

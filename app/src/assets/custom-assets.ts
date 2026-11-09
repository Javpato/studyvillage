import { FURNITURE_KINDS } from '../../../packages/core/src/house/furniture';
import type { FurnitureKind } from '../../../packages/core/src/protocol/types';

import { DEFAULT_APPEARANCE, normalizeAppearance, type AvatarAppearance, type HairStyle, type AvatarAccessory } from './appearance';
export type { HairStyle, AvatarAccessory } from './appearance';
export type AvatarCustomization = AvatarAppearance;

export interface AssetPackManifest {
  schemaVersion: 1;
  name: string;
  author: string;
  license: string;
  avatar?: Partial<AvatarCustomization>;
  furnitureColors?: Partial<Record<FurnitureKind, string>>;
  furnitureSprites?: Partial<Record<FurnitureKind, string>>;
}

export const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
  short: 'Corto clásico',
  long: 'Largo',
  curly: 'Rizado',
  beanie: 'Gorro de lana',
  spiky: 'Despeinado',
  ponytail: 'Coleta',
  bun: 'Moño',
};

export const ACCESSORY_LABELS: Record<AvatarAccessory, string> = {
  none: 'Sin accesorio',
  glasses: 'Gafas de estudio',
  headphones: 'Auriculares',
  hat: 'Sombrero explorador',
};

export const SKIN_TONES = ['#f0c69a', '#e0ac7e', '#c98f63', '#9e6843', '#6e452b'] as const;
export const HAIR_COLORS = ['#2a2018', '#5a4530', '#a84a32', '#d9a441', '#3b6e8c', '#6c4b7d'] as const;

const STORAGE_KEY = 'studyvillage-custom-assets-v1';

const DEFAULT_AVATAR: AvatarCustomization = { ...DEFAULT_APPEARANCE };

let currentPack: AssetPackManifest = {
  schemaVersion: 1,
  name: 'Pack Base StudyVillage',
  author: 'Local',
  license: 'UNLICENSED — owner artwork',
  avatar: { ...DEFAULT_AVATAR },
  furnitureColors: {},
  furnitureSprites: {},
};

const decodedSprites = new Map<FurnitureKind, HTMLImageElement>();

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isSafeDataImage(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 524_288
    && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function refreshDecodedSprites(): void {
  decodedSprites.clear();
  if (typeof Image === 'undefined') return;
  const sprites = currentPack.furnitureSprites ?? {};
  for (const [kind, dataUrl] of Object.entries(sprites) as [FurnitureKind, string | undefined][]) {
    if (!dataUrl || !isSafeDataImage(dataUrl)) continue;
    const img = new Image();
    img.src = dataUrl;
    decodedSprites.set(kind, img);
  }
}

export function loadCustomAssets(): AssetPackManifest {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = validateAssetPack(JSON.parse(raw));
        currentPack = parsed;
        refreshDecodedSprites();
      }
    }
  } catch {
    // Keep defaults if localStorage is unavailable or corrupted.
  }
  return currentPack;
}

export function saveCustomAssets(pack: AssetPackManifest): AssetPackManifest {
  currentPack = validateAssetPack(pack);
  refreshDecodedSprites();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentPack));
    }
  } catch {
    // Ignore quota errors in restricted environments.
  }
  return currentPack;
}

export function getAvatarCustomization(): AvatarCustomization {
  return normalizeAppearance(currentPack.avatar);
}

export function updateAvatarCustomization(patch: Partial<AvatarCustomization>): AvatarCustomization {
  const merged = { ...getAvatarCustomization(), ...patch };
  if (patch.accessory !== undefined) {
    if (patch.headwear === undefined) merged.headwear = patch.accessory === 'hat' ? 'explorer' : 'none';
    if (patch.eyewear === undefined) merged.eyewear = patch.accessory === 'glasses' ? 'square' : 'none';
  }
  const next = normalizeAppearance(merged);
  saveCustomAssets({ ...currentPack, avatar: next });
  return next;
}

export function getFurnitureCustomColor(kind: FurnitureKind): string | null {
  const color = currentPack.furnitureColors?.[kind];
  return isHexColor(color) ? color : null;
}

export function setFurnitureCustomColor(kind: FurnitureKind, color: string | null): void {
  const nextColors = { ...(currentPack.furnitureColors ?? {}) };
  if (color && isHexColor(color)) nextColors[kind] = color;
  else delete nextColors[kind];
  saveCustomAssets({ ...currentPack, furnitureColors: nextColors });
}

export function getFurnitureCustomSprite(kind: FurnitureKind): HTMLImageElement | null {
  const img = decodedSprites.get(kind);
  if (img && img.complete && img.naturalWidth > 0) return img;
  return null;
}

export function setFurnitureCustomSpriteData(kind: FurnitureKind, dataUrl: string | null): void {
  const nextSprites = { ...(currentPack.furnitureSprites ?? {}) };
  if (dataUrl && isSafeDataImage(dataUrl)) nextSprites[kind] = dataUrl;
  else delete nextSprites[kind];
  saveCustomAssets({ ...currentPack, furnitureSprites: nextSprites });
}

export function resetCustomAssets(): AssetPackManifest {
  return saveCustomAssets({
    schemaVersion: 1,
    name: 'Pack Base StudyVillage',
    author: 'Local',
    license: 'UNLICENSED — owner artwork',
    avatar: { ...DEFAULT_AVATAR },
    furnitureColors: {},
    furnitureSprites: {},
  });
}

/**
 * Validates an imported declarative Asset Pack JSON per Master Spec §13.
 * Rejects executable code, path traversal, or oversized sprites.
 */
export function validateAssetPack(raw: unknown): AssetPackManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El pack de assets debe ser un objeto JSON válido.');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) {
    throw new Error('Versión de pack no compatible (se requiere schemaVersion: 1).');
  }
  // Reject any suspicious executable keys per §13 security rules
  for (const forbidden of ['script', 'scripts', 'code', 'exec', 'command', 'shell', 'plugin', 'wasm', 'dll']) {
    if (forbidden in obj) {
      throw new Error(`El pack contiene campos ejecutables no permitidos (${forbidden}).`);
    }
  }
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 64) : 'Pack Personalizado';
  const author = typeof obj.author === 'string' && obj.author.trim() ? obj.author.trim().slice(0, 48) : 'Comunidad';
  const license = typeof obj.license === 'string' && obj.license.trim() ? obj.license.trim().slice(0, 32) : 'CC-BY-4.0';

  const avatar = normalizeAppearance(obj.avatar);

  const furnitureColors: Partial<Record<FurnitureKind, string>> = {};
  if (obj.furnitureColors && typeof obj.furnitureColors === 'object') {
    for (const kind of FURNITURE_KINDS) {
      const c = (obj.furnitureColors as Record<string, unknown>)[kind];
      if (isHexColor(c)) furnitureColors[kind] = c;
    }
  }

  const furnitureSprites: Partial<Record<FurnitureKind, string>> = {};
  if (obj.furnitureSprites && typeof obj.furnitureSprites === 'object') {
    for (const kind of FURNITURE_KINDS) {
      const s = (obj.furnitureSprites as Record<string, unknown>)[kind];
      if (s !== undefined) {
        if (!isSafeDataImage(s)) {
          throw new Error(`El sprite para "${kind}" debe ser una imagen PNG/JPEG/WebP válida de hasta 512 KiB.`);
        }
        furnitureSprites[kind] = s;
      }
    }
  }

  return { schemaVersion: 1, name, author, license, avatar, furnitureColors, furnitureSprites };
}

export function exportAssetPackJson(name?: string): string {
  const pack = name ? { ...currentPack, name } : currentPack;
  return JSON.stringify(pack, null, 2);
}

export function importAssetPackJson(rawJson: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(rawJson);
    const pack = saveCustomAssets(parsed);
    return { ok: true, message: `Pack «${pack.name}» importado correctamente.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'No se pudo importar el pack de assets.',
    };
  }
}

export const setAvatarCustomization = updateAvatarCustomization;
export const setFurnitureCustomSprite = setFurnitureCustomSpriteData;

// Initialize on module load
loadCustomAssets();


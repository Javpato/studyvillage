import { INTERACTION_REACH } from '../world/interactions';
import { LIMITS, type Furniture, type FurnitureKind, type Position, type PublicHouse } from '../../../packages/core/src/protocol/types';
import { type Rect, stepPosition } from '../world/model';

export const HOUSE_SPAWN: Position = { x: 384, y: 344, direction: 'up', moving: false };
export const HOUSE_BOUNDS: Rect = { x: 28, y: 72, w: 712, h: 334 };

/** The doorway at the bottom of every room, on the doormat. */
export const HOUSE_DOOR = { x: 384, y: 396 } as const;
const DOOR_REACH = INTERACTION_REACH;

/**
 * Whether the character is standing at the doorway. Leaving with E is only
 * allowed here, so a stray keypress in the middle of the room no longer ejects
 * the player to the village. Spawn (384,344) is deliberately out of reach.
 */
export function atHouseDoor(position: Position): boolean {
  return Math.hypot(position.x-HOUSE_DOOR.x,position.y-HOUSE_DOOR.y)<=DOOR_REACH;
}
export const FURNITURE_KINDS: readonly FurnitureKind[] = ['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet', 'flashcards', 'oak', 'palm', 'cherry', 'flowerbed', 'lantern', 'fountain', 'picnic', 'hammock', 'mailbox', 'birdbath', 'mushrooms', 'stonepath', 'inkdesk', 'guide', 'sketchboard', 'clock', 'jukebox', 'vanity'];
export const FURNITURE_LABELS: Record<FurnitureKind, string> = {
  vanity: 'Tocador de sprites', oak: 'Roble', palm: 'Palmera', cherry: 'Cerezo', flowerbed: 'Jardinera', lantern: 'Farol', fountain: 'Fuente', picnic: 'Mesa de picnic', hammock: 'Hamaca', mailbox: 'Buzón', birdbath: 'Bebedero de aves', mushrooms: 'Setas', stonepath: 'Camino de piedra', inkdesk: 'Escritorio de tinta', guide: 'Guía de la casa', sketchboard: 'Pizarra de exposición', jukebox:'Jukebox de estudio', clock: 'Reloj de concentración',
  desk: 'Escritorio', bookshelf: 'Librería', board: 'Pizarra', plant: 'Planta',
  table: 'Mesa', frame: 'Cuadro', cabinet: 'Armario', flashcards: 'Tarjetas de repaso',
};

/** Only furniture with an actual tool or conversation exposes a use action. */
export const FURNITURE_ACTION_LABELS = {
  mailbox: 'Abrir buzón',
  vanity: 'Tocador de sprites', inkdesk: 'Escritorio de tinta', guide: 'Guía de la casa',
  sketchboard: 'Pizarra de exposición', jukebox: 'Jukebox de estudio', clock: 'Reloj de concentración',
  desk: 'Proyectos en VS Code', bookshelf: 'Tarjetas de repaso', board: 'Abrir pizarra colaborativa',
  table: 'Mesa de estudio y voz', cabinet: 'Cambiar de ropa', flashcards: 'Repasar tarjetas',
} as const satisfies Partial<Record<FurnitureKind, string>>;
export type InteractiveFurnitureKind = keyof typeof FURNITURE_ACTION_LABELS;
export type InteractiveFurniture = Furniture & {kind: InteractiveFurnitureKind};
export function isInteractiveFurniture(kind: FurnitureKind): kind is InteractiveFurnitureKind {
  return Object.hasOwn(FURNITURE_ACTION_LABELS, kind);
}

export const FURNITURE_PROMPT_LABELS: Record<InteractiveFurnitureKind, string> = {
  mailbox: 'E · Buzón',
  vanity: 'E · Crear personaje', inkdesk: 'E · Escritorio de tinta', guide: 'E · Guía de la casa',
  sketchboard: 'E · Pizarra de exposición', jukebox: 'E · Música', clock: 'E · Reloj de concentración',
  desk: 'E · Proyectos', bookshelf: 'E · Tarjetas', board: 'E · Abrir Pizarra',
  table: 'E · Mesa de voz', cabinet: 'E · Abrir armario', flashcards: 'E · Tarjetas',
};

export function furnitureRect(item: Furniture): Rect {
  const size: Record<FurnitureKind, [number, number]> = {
    vanity: [48, 48], oak: [48, 48], palm: [48, 48], cherry: [48, 48], flowerbed: [48, 48], lantern: [48, 48], fountain: [48, 48], picnic: [48, 48], hammock: [48, 48], mailbox: [48, 48], birdbath: [48, 48], mushrooms: [48, 48], stonepath: [48, 48], inkdesk: [48, 48], guide: [48, 48], sketchboard: [48, 48], jukebox:[48,48], clock: [48, 48],
    desk: [69, 39], bookshelf: [45, 60], board: [66, 28], plant: [27, 27],
    table: [58, 42], frame: [34, 22], cabinet: [48, 45], flashcards: [52, 36],
  };
  const rotated = item.rotation === 90 || item.rotation === 270;
  const [w, h] = rotated ? [...size[item.kind]].reverse() : size[item.kind];
  return { x: item.x, y: item.y, w, h };
}

export function clampFurniture(item: Furniture, x: number, y: number): Furniture {
  const rect = furnitureRect(item);
  return {
    ...item,
    x: Math.round(Math.max(HOUSE_BOUNDS.x, Math.min(LIMITS.worldWidth - 32, HOUSE_BOUNDS.x + HOUSE_BOUNDS.w - rect.w, x))),
    y: Math.round(Math.max(HOUSE_BOUNDS.y, Math.min(LIMITS.worldHeight - 32, HOUSE_BOUNDS.y + HOUSE_BOUNDS.h - rect.h, y))),
  };
}

export function canEditHouse(house: PublicHouse, fingerprint: string): boolean {
  return house.ownerId === fingerprint;
}

export function moveFurniture(house: PublicHouse, id: string, x: number, y: number, fingerprint: string): PublicHouse {
  if (!canEditHouse(house, fingerprint)) return house;
  const furniture = house.furniture.map((item) => item.id === id ? clampFurniture(item, x, y) : item);
  if (furniture.every((item, index) => item === house.furniture[index]
    || (item.x === house.furniture[index].x && item.y === house.furniture[index].y))) return house;
  return { ...house, revision: house.revision + 1, furniture };
}

export function addFurniture(house: PublicHouse, kind: FurnitureKind, fingerprint: string, id: string): PublicHouse {
  if (!canEditHouse(house, fingerprint) || house.furniture.length >= LIMITS.furniture || house.furniture.some((item) => item.id === id)) return house;
  const step = house.furniture.length % 5;
  const item: Furniture = { id, kind, x: 105 + step * 92, y: 145 + Math.floor(house.furniture.length / 5) * 48, publicAlias: '' };
  return { ...house, revision: house.revision + 1, furniture: [...house.furniture, clampFurniture(item, item.x, item.y)] };
}

export function deleteFurniture(house: PublicHouse, id: string, fingerprint: string): PublicHouse {
  if (!canEditHouse(house, fingerprint)) return house;
  const furniture = house.furniture.filter((item) => item.id !== id);
  return furniture.length === house.furniture.length ? house : { ...house, revision: house.revision + 1, furniture };
}

export function setFurnitureAlias(house: PublicHouse, id: string, alias: string, fingerprint: string): PublicHouse {
  if (!canEditHouse(house, fingerprint)) return house;
  const safeAlias = alias.trim().slice(0, 40);
  const furniture = house.furniture.map((item) => item.id === id ? { ...item, publicAlias: safeAlias } : item);
  return furniture.some((item, index) => item.publicAlias !== house.furniture[index].publicAlias)
    ? { ...house, revision: house.revision + 1, furniture }
    : house;
}

export function houseObstacles(house: PublicHouse): Rect[] {
  return house.furniture.filter((item) => item.kind !== 'frame' && item.kind !== 'board')
    .map((item) => furnitureRect(item));
}

export function stepHousePosition(from: Position, vector: { x: number; y: number }, dt: number, house: PublicHouse, speedMultiplier = 1): Position {
  return stepPosition(from, vector, dt, houseObstacles(house), HOUSE_BOUNDS, 105 * speedMultiplier);
}

export function hitFurniture(house: PublicHouse, x: number, y: number): Furniture | null {
  for (let i = house.furniture.length - 1; i >= 0; i--) {
    const item = house.furniture[i];
    const rect = furnitureRect(item);
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return item;
  }
  return null;
}

/** A decoration may cover a usable item; never click through it to activate that item. */
export function hitInteractiveFurniture(house: PublicHouse, x: number, y: number): InteractiveFurniture | null {
  const item = hitFurniture(house, x, y);
  return item && isInteractiveFurniture(item.kind) ? item as InteractiveFurniture : null;
}

/**
 * Finds the nearest furniture item within reach of the character (`maxDistance`
 * from the furniture's bounding rectangle) so pressing E interacts with it.
 */
export function closestFurniture(position: Position, house: PublicHouse, maxDistance = INTERACTION_REACH): InteractiveFurniture | null {
  let closest: InteractiveFurniture | null = null;
  let best = maxDistance;
  for (const item of house.furniture) {
    if (!isInteractiveFurniture(item.kind)) continue;
    const rect = furnitureRect(item);
    const nx = Math.max(rect.x, Math.min(position.x, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(position.y, rect.y + rect.h));
    const dist = Math.hypot(position.x - nx, position.y - ny);
    if (dist <= best) {
      best = dist;
      closest = item as InteractiveFurniture;
    }
  }
  return closest;
}


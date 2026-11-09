/** Shared by placement, persistence, wire validation and replaceable asset packs. */
export const FURNITURE_KINDS = ['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet', 'flashcards', 'oak', 'palm', 'cherry', 'flowerbed', 'lantern', 'fountain', 'picnic', 'hammock', 'mailbox', 'birdbath', 'mushrooms', 'stonepath', 'inkdesk', 'guide', 'sketchboard', 'clock', 'jukebox', 'vanity', 'pet-atelier', 'pet-cat', 'pet-dog', 'pet-parrot', 'pet-hamster', 'pet-rabbit', 'pet-bowl'] as const;
export type FurnitureKind = typeof FURNITURE_KINDS[number];

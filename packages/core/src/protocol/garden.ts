import { z } from 'zod';
// The origin remains the original front garden anchor, including for saved gardens.
// Wider relative coordinates add the sides/back without migrating people's artwork.
export const gardenItemSchema=z.strictObject({id:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),plot:z.number().int().min(0).max(5).optional(),kind:z.enum(['oak','palm','cherry','flowerbed','lantern','fountain','picnic','hammock','mailbox','birdbath','mushrooms','stonepath']),x:z.number().finite().min(-32).max(192),y:z.number().finite().min(-112).max(184)});
export const gardenSchema=z.array(gardenItemSchema).max(16).refine(items=>new Set(items.map(i=>i.id)).size===items.length);
export type GardenItem=z.infer<typeof gardenItemSchema>;

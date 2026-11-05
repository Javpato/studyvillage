import { z } from 'zod';

export const HAIR_STYLES = ['short','long','curly','beanie','spiky','ponytail','bun'] as const;
export const BODY_TYPES = { masculine:'Masculino', feminine:'Femenino' } as const;
export const ACCESSORIES = ['none','glasses','headphones','hat'] as const;
export const HEADWEAR = { none:'Sin sombrero', cap:'Gorra', beanie:'Gorro de lana', explorer:'Sombrero explorador', beret:'Boina', crown:'Corona' } as const;
export const EYEWEAR = { none:'Sin lentes', round:'Lentes redondos', square:'Lentes cuadrados', sunglasses:'Lentes de sol' } as const;
export const OUTFITS = { casual:'Camiseta', hoodie:'Sudadera', suit:'Traje', overalls:'Overol', dress:'Vestido', sporty:'Deportivo' } as const;
export const JACKETS = { none:'Sin saco', blazer:'Saco', cardigan:'Cárdigan', coat:'Abrigo' } as const;
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const appearanceSchema = z.strictObject({
  body:z.enum(['masculine','feminine']), hairStyle:z.enum(HAIR_STYLES), hairColor:color, skinTone:color, accessory:z.enum(ACCESSORIES),
  headwear:z.enum(['none','cap','beanie','explorer','beret','crown']),
  eyewear:z.enum(['none','round','square','sunglasses']),
  outfit:z.enum(['casual','hoodie','suit','overalls','dress','sporty']),
  jacket:z.enum(['none','blazer','cardigan','coat']),
  headphonesColor:color.default('#cf6f3c'),
  outfitColor:color.nullable(), pantsColor:color, headwearColor:color, jacketColor:color,
  useCustomSheet:z.boolean(),
});
export type AvatarAppearance = z.infer<typeof appearanceSchema>;
export type HairStyle = AvatarAppearance['hairStyle'];
export type AvatarAccessory = AvatarAppearance['accessory'];
export const DEFAULT_APPEARANCE: AvatarAppearance = {
  body:'masculine', hairStyle:'short', hairColor:'#3f3124', skinTone:'#f0c69a', accessory:'none',
  headwear:'none', eyewear:'none', outfit:'casual', jacket:'none',
  headphonesColor:'#cf6f3c', outfitColor:null, pantsColor:'#2c4238', headwearColor:'#a77b50', jacketColor:'#765338', useCustomSheet:false,
};
/** Read old four-field packs without losing their glasses, hats or hair. */
export function normalizeAppearance(raw: unknown): AvatarAppearance {
  const input=raw && typeof raw==='object' && !Array.isArray(raw)?raw as Record<string,unknown>:{};
  const value:Record<string,unknown>={...DEFAULT_APPEARANCE};
  for(const key of Object.keys(appearanceSchema.shape) as (keyof AvatarAppearance)[]){
    const parsed=appearanceSchema.shape[key].safeParse(input[key]);if(parsed.success)value[key]=parsed.data;
  }
  if(input.headwear===undefined)value.headwear=value.accessory==='hat'?'explorer':value.hairStyle==='beanie'?'beanie':'none';
  if(input.eyewear===undefined)value.eyewear=value.accessory==='glasses'?'square':'none';
  value.useCustomSheet = input.useCustomSheet === true;
  return appearanceSchema.parse(value);
}

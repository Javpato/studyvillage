import type {OwnedPet,PetAppearance} from '../../../packages/core/src/pets/definitions';
import {petCollection} from '../../../packages/runtime/src/storage/pets';
const images=new Map<string,HTMLImageElement>(),data=new Map<string,string>();
export const petAsset=(custom?:PetAppearance)=>custom?images.get(custom.hash):undefined;
export const petAssetData=(hash:string)=>data.get(hash);
export async function petHash(sheet:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sheet)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function cachePetAsset(hash:string,sheet:string){if(sheet.length>700000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sheet)||await petHash(sheet)!==hash)throw Error('Invalid pet art');const image=new Image();image.src=sheet;await image.decode();if(image.width!==448||image.height!==256)throw Error('Invalid pet dimensions');if(images.size>=100&&!images.has(hash)){const oldest=images.keys().next().value!;images.delete(oldest);data.delete(oldest);}images.set(hash,image);data.set(hash,sheet);}
export async function loadPetCollection(owner:string):Promise<OwnedPet[]>{const pets=await petCollection(owner);await Promise.all(pets.map(p=>cachePetAsset(p.appearance.hash,p.sheet).catch(()=>{if(import.meta.env.DEV)console.warn('Invalid saved pet artwork; using template',p.appearance.id);})));return pets;}

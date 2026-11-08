import {PET_ART_SPECIES,FALLBACK_PET_ART,validPetArt,fallbackPetImage} from './pet-assets';
declare const __SV_SPRITE_REVISION__:string;
/** Revision URLs bypass an older worker's unversioned catalogue during upgrades. */
export function spriteUrl(file:string):URL{const url=new URL(`./sprites/${file}`,document.baseURI);url.searchParams.set('v',typeof __SV_SPRITE_REVISION__==='string'?__SV_SPRITE_REVISION__:'development');return url;}
let enabled=true;
export function useSpriteCatalog(value:boolean):void{enabled=value;}
const definitions=new Map<string,unknown>(),catalog=new Map<string,HTMLImageElement>(),warned=new Set<string>();
export function spriteDefinition(id:string):unknown{return definitions.get(id);}
function report(id:string,error:unknown){if(!warned.has(id)){warned.add(id);console.warn(`[StudyVillage sprites] ${id}`,error);}}
const required=PET_ART_SPECIES.flatMap(s=>[`pet-${s}`,`pet-${s}-sheet`]).concat('pet-bowl');
export async function loadSpriteCatalog():Promise<void>{
 const response=await fetch(spriteUrl('manifest.json'));if(!response.ok)throw new Error('Sprite catalogue unavailable');const entries=await response.json();
 await Promise.all([...new Set([...Object.keys(entries),...required])].map(async id=>{
  try{const raw=entries[id],entry=raw as {file:string;width:number;height:number};if(!entry||!/^[a-z0-9_-]+\.png$/.test(entry.file)||![entry.width,entry.height].every(n=>Number.isInteger(n)&&n>0&&n<=2048))throw new Error('Missing or invalid catalogue entry');
   if(id.endsWith('-sheet')&&id.startsWith('pet-')&&!validPetArt(raw,entry.width,entry.height))throw new Error('Invalid pet frame or animation metadata');
   const image=new Image();image.src=spriteUrl(entry.file).href;await image.decode();if(image.naturalWidth!==entry.width||image.naturalHeight!==entry.height)throw new Error(`Expected ${entry.width}×${entry.height}, received ${image.naturalWidth}×${image.naturalHeight}`);image.dataset.spriteId=id;catalog.set(id,image);definitions.set(id,raw);
  }catch(error){report(id,error);if(required.includes(id)){const fallback=await fallbackPetImage(id);fallback.dataset.spriteId=id;catalog.set(id,fallback);if(id.endsWith('-sheet'))definitions.set(id,FALLBACK_PET_ART);}}
 }));
}
export function sprite(id:string):HTMLImageElement|null{return enabled?catalog.get(id)??null:null;}

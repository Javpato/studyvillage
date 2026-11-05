/** Owner-editable, same-origin PNG files; never accepts executable assets. */
let enabled=true;
export function useSpriteCatalog(value:boolean):void{enabled=value;}
const catalog = new Map<string, HTMLImageElement>();
export async function loadSpriteCatalog():Promise<void>{
 const base=new URL('./sprites/',document.baseURI);const response=await fetch(new URL('manifest.json',base));if(!response.ok)throw new Error('Sprite catalogue unavailable');const entries=await response.json();
 await Promise.all(Object.entries(entries).map(async([id,raw])=>{const entry=raw as {file:string;width:number;height:number};if(!/^[a-z0-9_-]+\.png$/.test(entry.file)||!Number.isInteger(entry.width)||!Number.isInteger(entry.height)||entry.width<1||entry.height<1||entry.width>2048||entry.height>2048)throw new Error('Invalid sprite manifest');const image=new Image();image.src=new URL(entry.file,base).href;await image.decode();if(image.naturalWidth!==entry.width||image.naturalHeight!==entry.height)throw new Error(`Sprite dimensions: ${id}`);catalog.set(id,image);}));
}
export function sprite(id:string):HTMLImageElement|null{return enabled?catalog.get(id)??null:null;}

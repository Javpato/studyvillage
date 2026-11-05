const images = new Map<string, HTMLImageElement>();
let generation = 0;
export const inlineSpriteGeneration = ():number => generation;
export function inlineFurnitureSprite(data?:string):HTMLImageElement|null {
  if(!data||typeof Image==='undefined')return null;
  let image=images.get(data);
  if(!image){image=new Image();image.onload=()=>{generation++;};image.src=data;images.set(data,image);}
  return image.complete&&image.naturalWidth>0?image:null;
}

import type {GardenItem} from '../protocol/garden';
export interface GardenRect {x:number;y:number;w:number;h:number}
export interface GardenParcel extends GardenRect {slot:number;doorX:number;doorY:number}
export const RESIDENTIAL_PARCELS:readonly GardenParcel[]=[
 {slot:0,x:47,y:34,w:114,h:83,doorX:104,doorY:117},{slot:1,x:327,y:34,w:114,h:83,doorX:384,doorY:117},{slot:2,x:607,y:34,w:114,h:83,doorX:664,doorY:117},
 {slot:3,x:47,y:293,w:114,h:83,doorX:104,doorY:293},{slot:4,x:327,y:293,w:114,h:83,doorX:384,doorY:293},{slot:5,x:607,y:293,w:114,h:83,doorX:664,doorY:293},
];
export type GardenPlacementIssue='bounds'|'house'|'door';
export function gardenOrigin(parcel:GardenParcel):{x:number;y:number}{return{x:parcel.x-23,y:parcel.slot<3?parcel.y+parcel.h+18:parcel.y-44};}
/** Parcel cells stop before the main road, the vertical street and the neighboring garden. */
export function gardenBounds(parcel:GardenParcel):GardenRect{
 const columns=[{x:8,w:200},{x:278,w:224},{x:548,w:212}];const column=columns[parcel.slot%3];
 return{...column,y:parcel.slot<3?0:244,h:parcel.slot<3?186:188};
}
/** Visible eaves, chimney and foundation, excluding the animated smoke plume. */
export function gardenHouseFootprint(parcel:GardenParcel):GardenRect{return{x:parcel.x-4,y:parcel.y-16,w:parcel.w+8,h:parcel.h+28};}
export function gardenDoorway(parcel:GardenParcel):GardenRect{
 const top=parcel.slot<3;return{x:parcel.doorX-20,y:top?parcel.y+parcel.h:244,w:40,h:top?190-parcel.y-parcel.h:parcel.y-244};
}
/** Mirrors the existing 32px artwork anchor exactly. */
export function gardenItemRect(parcel:GardenParcel,item:Pick<GardenItem,'x'|'y'>):GardenRect{const origin=gardenOrigin(parcel);return{x:origin.x+item.x-16,y:origin.y+item.y-28,w:32,h:32};}
const intersects=(a:GardenRect,b:GardenRect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export function gardenPlacementIssue(parcel:GardenParcel,item:Pick<GardenItem,'x'|'y'>):GardenPlacementIssue|null{
 const rect=gardenItemRect(parcel,item),bounds=gardenBounds(parcel);
 if(rect.x<bounds.x||rect.y<bounds.y||rect.x+rect.w>bounds.x+bounds.w||rect.y+rect.h>bounds.y+bounds.h)return'bounds';
 if(intersects(rect,gardenHouseFootprint(parcel)))return'house';
 if(intersects(rect,gardenDoorway(parcel)))return'door';
 return null;
}

const resolutions=new Map<string,{x:number;y:number}>();
/** New artwork follows its owner between plots; old untagged artwork keeps its exact pixels. */
export function resolveGardenItem(parcel:GardenParcel,item:GardenItem):GardenItem {
 if(item.plot===undefined)return item;
 if(item.plot===parcel.slot&&!gardenPlacementIssue(parcel,item))return item;
 const key=`${item.plot}:${item.x}:${item.y}:${parcel.slot}:${parcel.x}:${parcel.y}:${parcel.w}:${parcel.h}:${parcel.doorX}:${parcel.doorY}`;
 const cached=resolutions.get(key);if(cached)return{...item,...cached,plot:parcel.slot};
 const source=RESIDENTIAL_PARCELS[item.plot],sourceBounds=gardenBounds(source),targetBounds=gardenBounds(parcel),rect=gardenItemRect(source,item),origin=gardenOrigin(parcel);
 const u=Math.max(0,Math.min(1,(rect.x+16-sourceBounds.x)/sourceBounds.w));let v=Math.max(0,Math.min(1,(rect.y+16-sourceBounds.y)/sourceBounds.h));
 if((source.slot<3)!==(parcel.slot<3))v=1-v;
 const desired={x:targetBounds.x+u*targetBounds.w-origin.x,y:targetBounds.y+v*targetBounds.h+12-origin.y};
 let resolved={x:Math.round(desired.x/4)*4,y:Math.round(desired.y/4)*4};
 if(gardenPlacementIssue(parcel,resolved)){
  let best=Infinity;
  for(let x=-32;x<=192;x+=4)for(let y=-112;y<=184;y+=4){const distance=(x-desired.x)**2+(y-desired.y)**2;if(distance>=best||gardenPlacementIssue(parcel,{x,y}))continue;best=distance;resolved={x,y};}
 }
 resolutions.set(key,resolved);if(resolutions.size>2048)resolutions.delete(resolutions.keys().next().value!);
 return{...item,...resolved,plot:parcel.slot};
}

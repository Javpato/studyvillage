import {describe,expect,it} from 'vitest';
import {gardenItemSchema,gardenSchema,type GardenItem} from '../../packages/core/src/protocol/garden';
import {houseSchema as wireHouseSchema} from '../../packages/core/src/protocol/schema';
import {gardenBounds,gardenDoorway,gardenHouseFootprint,gardenItemRect,gardenOrigin,gardenPlacementIssue,resolveGardenItem,type GardenParcel,type GardenRect} from '../../packages/core/src/world/garden';
import {newLocalData,parseLocalData,publicHouse,serializeLocalData} from '../../packages/runtime/src/storage/local-store';
import {parseBackup} from '../../packages/runtime/src/storage/backup';
import {PARCELS} from '../src/world/model';

const kinds=['oak','palm','cherry','flowerbed','lantern','fountain','picnic','hammock','mailbox','birdbath','mushrooms','stonepath'] as const;
const overlap=(a:GardenRect,b:GardenRect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

/** Include exact boundaries, fractional near-boundaries and a grid through all garden regions. */
function validPoints(parcel:GardenParcel):{x:number;y:number}[]{
 const bounds=gardenBounds(parcel),house=gardenHouseFootprint(parcel),door=gardenDoorway(parcel),origin=gardenOrigin(parcel);
 const xs=new Set<number>([bounds.x+16,bounds.x+bounds.w-16]),ys=new Set<number>([bounds.y+28,bounds.y+bounds.h-4]);
 for(let x=bounds.x+16;x<=bounds.x+bounds.w-16;x+=8)xs.add(x);
 for(let y=bounds.y+28;y<=bounds.y+bounds.h-4;y+=8)ys.add(y);
 for(const block of [house,door]){
  for(const x of [block.x-16,block.x+block.w+16])for(const delta of [-.25,0,.25])xs.add(x+delta);
  for(const y of [block.y-4,block.y+block.h+28])for(const delta of [-.25,0,.25])ys.add(y+delta);
 }
 return [...xs].flatMap(x=>[...ys].map(y=>({x:x-origin.x,y:y-origin.y}))).filter(point=>gardenPlacementIssue(parcel,point)===null);
}

const samples=PARCELS.map(validPoints);
const pairs=PARCELS.flatMap(source=>PARCELS.map(destination=>({source:source.slot,destination:destination.slot})));

describe('portable expanded garden layouts',()=>{
 it.each(pairs)('keeps complete artwork clear when moving plot $source to $destination',({source,destination})=>{
  const from=PARCELS[source],to=PARCELS[destination],bounds=gardenBounds(to),house=gardenHouseFootprint(to),door=gardenDoorway(to);
  expect(samples[source].length).toBeGreaterThan(100);
  for(const [index,point]of samples[source].entries()){
   const item=gardenItemSchema.parse({id:`garden-${source}-${index}`,kind:kinds[index%kinds.length],...point,plot:source}),before={...item};
   const relocated=resolveGardenItem(to,item),rect=gardenItemRect(to,relocated);
   const context=`${source}→${destination}, anchor(${point.x},${point.y}), artwork(${rect.x},${rect.y})`;
   expect({width:rect.w,height:rect.h,inside:rect.x>=bounds.x&&rect.y>=bounds.y&&rect.x+rect.w<=bounds.x+bounds.w&&rect.y+rect.h<=bounds.y+bounds.h,house:overlap(rect,house),door:overlap(rect,door),id:relocated.id,kind:relocated.kind,plot:relocated.plot},context).toEqual({width:32,height:32,inside:true,house:false,door:false,id:item.id,kind:item.kind,plot:destination});
   expect(gardenItemSchema.parse(relocated),context).toEqual(relocated);
   expect(item,context).toEqual(before);
   if(from.slot===to.slot)expect(relocated,context).toEqual(item);
  }
 });

 it.each(PARCELS)('preserves untagged saved coordinates and exact artwork anchors on plot $slot',parcel=>{
  for(const point of [{x:0,y:0},{x:160,y:40},{x:120,y:24},{x:12.5,y:3.75},{x:-20,y:-100},{x:172,y:176}]){
   const item=gardenItemSchema.parse({id:'legacy-palm',kind:'palm',...point}),resolved=resolveGardenItem(parcel,item);
   expect(resolved).toEqual(item);expect(Object.hasOwn(resolved,'plot')).toBe(false);
   expect(gardenItemRect(parcel,resolved)).toEqual({x:parcel.x-23+point.x-16,y:(parcel.slot<3?parcel.y+parcel.h+18:parcel.y-44)+point.y-28,w:32,h:32});
  }
 });

 it('retains source slots, IDs, artwork kinds and fractional coordinates through local, public and backup serialization',async()=>{
  const garden:GardenItem[]=kinds.map((kind,index)=>({id:`kept-${index}`,kind,...samples[index%6][index+1],plot:index%6}));
  garden.push({id:'legacy-untagged',kind:'palm',x:120.25,y:24.5});
  expect(gardenSchema.parse(garden)).toEqual(garden);
  const local=newLocalData();local.house={ownerId:'a'.repeat(64),revision:7,name:'Portable garden',access:'ask',theme:'mint',furniture:[],garden};
  const reloaded=parseLocalData(JSON.parse(serializeLocalData(local)));
  expect(reloaded.house!.garden).toEqual(garden);
  expect(wireHouseSchema.parse(JSON.parse(JSON.stringify(publicHouse(reloaded.house!)))).garden).toEqual(garden);
  const backup=await parseBackup(JSON.stringify({format:'studyvillage-backup',version:1,createdAt:1,local,values:{},notebooks:{notebooks:[],attachments:[]}}));
  expect(backup.local.house!.garden).toEqual(garden);
  expect(Object.hasOwn(backup.local.house!.garden!.at(-1)!,'plot')).toBe(false);
 });

 it('rejects invalid source slots instead of silently discarding relocation metadata',()=>{
  for(const plot of [-1,6,1.5,NaN,Infinity,'2',null])expect(gardenItemSchema.safeParse({id:'invalid-slot',kind:'palm',x:0,y:0,plot}).success).toBe(false);
 });
});

import {describe,expect,it} from 'vitest';
import {gardenItemSchema,gardenSchema} from '../../packages/core/src/protocol/garden';
import {gardenBounds,gardenOrigin,gardenItemRect,gardenPlacementIssue,gardenHouseFootprint,gardenDoorway} from '../../packages/core/src/world/garden';
import {PARCELS} from '../src/world/model';
const at=(slot:number,x:number,y:number)=>{const origin=gardenOrigin(PARCELS[slot]);return{x:x-origin.x,y:y-origin.y};};
describe('expanded gardens',()=>{
 it.each(PARCELS)('keeps legacy coordinates and their exact pixels in slot $slot',parcel=>{
  const item=gardenItemSchema.parse({id:'legacy',kind:'palm',x:120,y:24});
  expect(gardenItemRect(parcel,item)).toEqual({x:parcel.x-23+120-16,y:(parcel.slot<3?parcel.y+parcel.h+18:parcel.y-44)+24-28,w:32,h:32});
  expect(gardenSchema.parse([{...item,x:0,y:0},{...item,id:'far',x:160,y:40}])).toHaveLength(2);
 });
 it.each(PARCELS)('allows new side decorations and protects the complete footprint, building and doorway in slot $slot',parcel=>{
  const bounds=gardenBounds(parcel),side=at(parcel.slot,bounds.x+16,parcel.slot<3?80:330);expect(gardenPlacementIssue(parcel,side)).toBeNull();expect(gardenItemSchema.safeParse({id:'side',kind:'oak',...side}).success).toBe(true);
  expect(gardenPlacementIssue(parcel,at(parcel.slot,bounds.x+15,parcel.slot<3?80:330))).toBe('bounds');
  const house=gardenHouseFootprint(parcel);expect(gardenPlacementIssue(parcel,at(parcel.slot,house.x+16,house.y+28))).toBe('house');
  const door=gardenDoorway(parcel);expect(gardenPlacementIssue(parcel,at(parcel.slot,parcel.doorX,parcel.slot<3?180:272))).not.toBeNull();expect(door.w).toBeGreaterThanOrEqual(40);
 });
 it('adds a rear garden to southern plots and upper side corners to northern plots',()=>{
  expect(gardenPlacementIssue(PARCELS[3],at(3,104,420))).toBeNull();expect(gardenPlacementIssue(PARCELS[0],at(0,24,32))).toBeNull();
 });
 it('keeps every expanded cell away from the streets and neighbors',()=>{
  const bounds=PARCELS.map(gardenBounds);for(const b of bounds){expect(b.x>=262||b.x+b.w<=218).toBe(true);expect(b.y>=244||b.y+b.h<=190).toBe(true);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(768);expect(b.y+b.h).toBeLessThanOrEqual(432);}
  for(let a=0;a<bounds.length;a++)for(let b=a+1;b<bounds.length;b++){const x=bounds[a],y=bounds[b];expect(x.x<y.x+y.w&&x.x+x.w>y.x&&x.y<y.y+y.h&&x.y+x.h>y.y).toBe(false);}
 });
 it('keeps the sixteen-object limit and rejects non-finite or excessively distant coordinates',()=>{
  const items=Array.from({length:16},(_,i)=>({id:`i${i}`,kind:'palm',x:0,y:0}));expect(gardenSchema.safeParse(items).success).toBe(true);expect(gardenSchema.safeParse([...items,{...items[0],id:'extra'}]).success).toBe(false);
  for(const x of [Infinity,NaN,-100,1000])expect(gardenItemSchema.safeParse({id:'bad',kind:'palm',x,y:0}).success).toBe(false);
 });
});

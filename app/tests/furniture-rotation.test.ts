import {describe,expect,it} from 'vitest';
import type {Furniture,PublicHouse} from '../../packages/core/src/protocol/types';
import {furniturePaintTransform} from '../src/house/rotation';
import {FURNITURE_KINDS,furnitureRect,hitFurniture,clampFurniture,HOUSE_BOUNDS} from '../src/house/model';
import {placementError} from '../src/house/decoration';
const home=(furniture:Furniture[]):PublicHouse=>({ownerId:'owner',revision:1,name:'Home',theme:'mint',access:'open',furniture});
describe('whole-object furniture rotation',()=>{
 for(const kind of FURNITURE_KINDS)it(`${kind}: all four painted corners agree with the hit and placement footprint`,()=>{
  const item: Furniture={id:'item',kind,x:120,y:160,publicAlias:''};const base=furnitureRect(item);
  for(const rotation of [0,90,180,270] as const){const rotated={...item,rotation},rect=furnitureRect(rotated),[a,b,c,d,e,f]=furniturePaintTransform(rotated);const corners=[[0,0],[base.w,0],[0,base.h],[base.w,base.h]].map(([x,y])=>({x:a*x+c*y+e,y:b*x+d*y+f}));
   expect(Math.min(...corners.map(p=>p.x))).toBe(rect.x);expect(Math.max(...corners.map(p=>p.x))).toBe(rect.x+rect.w);expect(Math.min(...corners.map(p=>p.y))).toBe(rect.y);expect(Math.max(...corners.map(p=>p.y))).toBe(rect.y+rect.h);
   expect(a*d-b*c).toBe(1); // A true turn, never a mirror.
   expect(hitFurniture(home([rotated]),rect.x+rect.w-1,rect.y+rect.h-1)?.id).toBe('item');expect(hitFurniture(home([rotated]),rect.x+rect.w+1,rect.y+rect.h+1)).toBeNull();
   const clamped=clampFurniture(rotated,1000,1000),edge=furnitureRect(clamped);expect(edge.x+edge.w).toBeLessThanOrEqual(HOUSE_BOUNDS.x+HOUSE_BOUNDS.w);expect(edge.y+edge.h).toBeLessThanOrEqual(HOUSE_BOUNDS.y+HOUSE_BOUNDS.h);
  }
 });
 it('keeps a rotated whiteboard full size and catches overlap introduced by its new orientation',()=>{
  const board:Furniture={id:'board',kind:'board',x:120,y:160,publicAlias:''};expect(furnitureRect(board)).toMatchObject({w:66,h:28});expect(furnitureRect({...board,rotation:90})).toMatchObject({w:28,h:66});
  const plant:Furniture={id:'plant',kind:'plant',x:120,y:200,publicAlias:''};expect(placementError(home([board,plant]),'board')).toBeNull();expect(placementError(home([{...board,rotation:90},plant]),'board')).toBe('Los muebles se solapan.');
 });
});

import {describe,expect,it} from 'vitest';
import type {Furniture,PublicHouse} from '../../packages/core/src/protocol/types';
import {placementError} from '../src/house/decoration';
const house=(furniture:Furniture[]):PublicHouse=>({ownerId:'a'.repeat(64),revision:1,name:'Floor',theme:'mint',access:'open',furniture});
const plant=(id:string,x:number,y:number):Furniture=>({id,kind:'plant',x,y,publicAlias:''});
const entrance={x:106,y:144};
describe('floor door clearance',()=>{
 it('keeps both the visible door and the standing area free',()=>{
  for(const [x,y] of [[96,112],[96,152]])expect(placementError(house([plant('new',x,y)]),'new',[entrance])).toBe('Deja libre el acceso a las puertas.');
  expect(placementError(house([{...plant('frame',96,112),kind:'frame'}]),'frame',[entrance])).toBe('Deja libre el acceso a las puertas.');
  expect(placementError(house([plant('new',240,224)]),'new',[entrance])).toBeNull();
 });
 it('rejects a wall that cuts the route even though the door and approach do not overlap any object',()=>{
  const wall=Array.from({length:26},(_,i)=>plant(`p${i}`,28+i*27,220));
  expect(placementError(house(wall),'p25',[entrance])).toBe('Deja libre el acceso a las puertas.');
  expect(placementError(house(wall.filter(f=>f.id!=='p6'&&f.id!=='p7')),'p25',[entrance])).toBeNull();
 });
 it('checks each entrance and its configured position, without reserving an obsolete default doorway',()=>{
  const moved={x:520,y:200};expect(placementError(house([plant('new',96,112)]),'new',[moved])).toBeNull();
  expect(placementError(house([plant('new',512,208)]),'new',[entrance,moved])).toBe('Deja libre el acceso a las puertas.');
 });
});

import {describe,it,expect} from 'vitest';
import {initialHouse} from '../src/house/initial';
import {placementError} from '../src/house/decoration';
import {spacePortals} from '../src/house/space-draw';
import {deleteFurniture} from '../src/house/model';
import {newLocalData,parseLocalData,serializeLocalData} from '../../packages/runtime/src/storage/local-store';
describe('new house',()=>{
 it('starts with exactly five furnishings and the existing room portal',()=>{
  const house=initialHouse('a'.repeat(64));expect(house.furniture.map(f=>f.kind)).toEqual(['board','desk','plant','cabinet','guide']);
  for(const f of house.furniture)expect(placementError(house,f.id)).toBeNull();
  expect(spacePortals(house)).toHaveLength(1);
 });
 it('saved houses retain their layout, including a removed wardrobe',()=>{
  const owner='a'.repeat(64),data=newLocalData();data.house=deleteFurniture(initialHouse(owner),'wardrobe',owner);
  const reopened=parseLocalData(JSON.parse(serializeLocalData(data)));expect(reopened.house).toEqual(data.house);expect(reopened.house!.furniture.some(f=>f.kind==='cabinet')).toBe(false);
 });
});

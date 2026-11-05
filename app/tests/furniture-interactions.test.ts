import {describe,it,expect} from 'vitest';
import type {FurnitureKind,PublicHouse} from '../../packages/core/src/protocol/types';
import {closestFurniture,hitFurniture,hitInteractiveFurniture,moveFurniture,setFurnitureAlias} from '../src/house/model';
import {InteractiveObjectRegistry,type InteractiveObjectKind} from '../src/world/interactive-objects';
import {DEFAULT_AREA_OBJECTS} from '../src/world/areas';
const room=(kind:FurnitureKind):PublicHouse=>({ownerId:'owner',revision:1,name:'Home',theme:'mint',access:'open',furniture:[{id:'object',kind,x:100,y:100,publicAlias:''}]});
const ornaments: FurnitureKind[]=['plant','frame','oak','palm','cherry','flowerbed','lantern','fountain','picnic','hammock','birdbath','mushrooms','stonepath'];
describe('furniture use requires an actual action',()=>{
 it.each(ornaments)('%s is selectable and movable for decoration, without a use target',kind=>{
  const house=room(kind),position={x:105,y:105,direction:'down' as const,moving:false};
  expect(hitFurniture(house,105,105)?.id).toBe('object');expect(hitInteractiveFurniture(house,105,105)).toBeNull();expect(closestFurniture(position,house)).toBeNull();
  const moved=moveFurniture(house,'object',200,200,'owner');expect(moved.furniture[0]).toMatchObject({kind,x:200,y:200});expect(setFurnitureAlias(moved,'object','My ornament','owner').furniture[0].publicAlias).toBe('My ornament');
 });
 it('a nearby ornament cannot steal the E action from a useful desk',()=>{
  const house=room('desk');house.furniture[0].x=140;house.furniture.push({id:'plant',kind:'plant',x:215,y:100,publicAlias:''});
  expect(closestFurniture({x:220,y:110,direction:'left',moving:false},house)?.id).toBe('object');
 });
 it('does not activate a desk through a decoration covering it',()=>{
  const house=room('desk');house.furniture.push({id:'plant',kind:'plant',x:100,y:100,publicAlias:''});
  expect(hitFurniture(house,110,110)?.id).toBe('plant');expect(hitInteractiveFurniture(house,110,110)).toBeNull();expect(hitInteractiveFurniture(house,150,110)?.kind).toBe('desk');
 });
 it('keeps every tool and the removable guide usable',()=>{
  const tools: FurnitureKind[]=['mailbox','desk','bookshelf','board','table','cabinet','flashcards','inkdesk','guide','sketchboard','clock','jukebox','vanity'];
  for(const kind of tools){const house=room(kind);expect(hitInteractiveFurniture(house,105,105)?.kind).toBe(kind);expect(closestFurniture({x:105,y:105,direction:'up',moving:false},house)?.kind).toBe(kind);}
 });
});
describe('world decorations stay configurable without opening an inspector on use',()=>{
 it.each(['lamp','plant','frame','cabinet','portal'] as InteractiveObjectKind[])('%s is excluded from proximity and click activation',kind=>{
  const object={...DEFAULT_AREA_OBJECTS[0],id:`test:${kind}`,kind,x:100,y:100};const registry=new InteractiveObjectRegistry([object]);
  expect(registry.closestInteractable(object.areaId,110,110,'visitor')).toBeNull();expect(registry.hitTest(object.areaId,110,110,'visitor')).toBeNull();expect(registry.listByArea(object.areaId)).toHaveLength(1);expect(registry.canConfigure(object,'host',true)).toBe(true);expect(registry.renameObject(object.id,'Custom ornament','host',true).displayName).toBe('Custom ornament');
 });
 it('keeps guiding NPCs discoverable by touch and proximity',()=>{
  const guide=DEFAULT_AREA_OBJECTS.find(o=>o.kind==='guide')!,registry=new InteractiveObjectRegistry([guide]);expect(registry.hitTest(guide.areaId,guide.x+4,guide.y+4)?.id).toBe(guide.id);expect(registry.closestInteractable(guide.areaId,guide.x+4,guide.y+4,'visitor')?.id).toBe(guide.id);
 });
});

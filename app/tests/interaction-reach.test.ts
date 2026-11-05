import{describe,it,expect}from'vitest';
import{atHouseDoor,HOUSE_DOOR,closestFurniture}from'../src/house/model';
import{closestPortal}from'../src/world/areas';
import type{Position,PublicHouse}from'../../packages/core/src/protocol/types';
const position=(x:number,y:number):Position=>({x,y,direction:'up',moving:false});
describe('twenty-unit interaction boundaries',()=>{
 it('shows house exit prompts only within the actual doorway radius',()=>{expect(atHouseDoor(position(HOUSE_DOOR.x,HOUSE_DOOR.y-20))).toBe(true);expect(atHouseDoor(position(HOUSE_DOOR.x,HOUSE_DOOR.y-21))).toBe(false);expect(atHouseDoor(position(HOUSE_DOOR.x+19,HOUSE_DOOR.y-19))).toBe(false);});
 it('measures portal and furniture reach from their usable boundaries',()=>{expect(closestPortal('residential',position(240,92))).not.toBeNull();expect(closestPortal('residential',position(240,93))).toBeNull();const house:PublicHouse={ownerId:'owner',revision:1,name:'Home',theme:'mint',access:'open',furniture:[{id:'guide',kind:'guide',x:100,y:100,publicAlias:''}]};expect(closestFurniture(position(168,110),house)).not.toBeNull();expect(closestFurniture(position(169,110),house)).toBeNull();});
});

import {describe,it,expect} from 'vitest';
import {publicHouse,houseSchema as storedHouse} from '../../packages/runtime/src/storage/local-store';
import {houseSchema} from '../../packages/core/src/protocol/schema';
import {workspaceSchema} from '../../packages/core/src/house/workspaces';
import type {PublicHouse} from '../../packages/core/src/protocol/types';
const house=():PublicHouse=>({ownerId:'a'.repeat(64),revision:1,name:'Casa',access:'open',theme:'mint',furniture:[{id:'guide',kind:'guide',x:100,y:100,publicAlias:'Guía',guideText:'Bienvenue chez nous !'},{id:'board',kind:'sketchboard',x:200,y:100,publicAlias:'Dessin',showFrame:false},{id:'vanity',kind:'vanity',x:300,y:100,publicAlias:''}]});
describe('editable furniture details survive every storage boundary',()=>{
 it('preserves custom guide dialogue and an explicitly disabled frame in public projection',()=>{const value=publicHouse(house());expect(storedHouse.parse(value)).toEqual(house());expect(houseSchema.parse(value)).toEqual(house());});
 it('also retains details inside a private room document',()=>{const value={revision:1,furniture:house().furniture,notes:[],materials:[],projects:[]};expect(workspaceSchema.parse(value)).toEqual(value);});
 it('rejects oversized guide dialogue across local, wire and private room schemas',()=>{const value=house();value.furniture[0].guideText='a'.repeat(321);expect(storedHouse.safeParse(value).success).toBe(false);expect(houseSchema.safeParse(value).success).toBe(false);expect(workspaceSchema.safeParse({revision:1,furniture:value.furniture,notes:[],materials:[],projects:[]}).success).toBe(false);});
});

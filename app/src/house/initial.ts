import type {PublicHouse} from '../../../packages/core/src/protocol/types';
/** Used only when no saved house exists. Never replenish removed furniture. */
export function initialHouse(ownerId:string):PublicHouse {
 return {ownerId,revision:1,name:'Mi rincón de estudio',access:'ask',theme:'mint',garden:[{id:'starter-mailbox',kind:'mailbox',plot:0,x:40,y:24}],furniture:[
  {id:'board',kind:'board',x:340,y:95,publicAlias:'Ideas compartidas'},
  {id:'desk',kind:'desk',x:130,y:150,publicAlias:'Mi proyecto'},
  {id:'plant',kind:'plant',x:660,y:120,publicAlias:'Un poco de verde'},
  {id:'wardrobe',kind:'cabinet',x:620,y:160,publicAlias:'Mi armario'},
  {id:'guide',kind:'guide',x:600,y:285,publicAlias:'Guía de la casa'},
 ]};
}

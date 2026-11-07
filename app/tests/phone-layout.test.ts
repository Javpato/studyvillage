import {describe,it,expect} from 'vitest';
import {defaultPhoneLayout,phoneLayoutSchema,removePhoneFolder,movePhoneApp,removePhoneApp,dropPhoneApp,normalizePhoneLayout} from '../../packages/core/src/phone/layout';
import {loadPhoneLayout,savePhoneLayout,PHONE_LAYOUT_KEY} from '../../packages/runtime/src/storage/phone-layout';
import {parseBackup} from '../../packages/runtime/src/storage/backup';
import {newLocalData} from '../../packages/runtime/src/storage/local-store';
describe('phone layout',()=>{
 it('starts with the requested apps and folders',()=>{expect(defaultPhoneLayout().entries).toEqual([
  {type:'app',id:'village'},{type:'app',id:'contacts'},
  {type:'folder',id:'home',name:'Hogar',builtin:true,apps:['house','rooms','decorate','garden']},
  {type:'folder',id:'settings',name:'Ajustes',builtin:true,apps:['settings','voice','hud-editor']},
 ]);});
 it('moves apps without duplication and preserves settings when deleting its folder',()=>{
  let layout=movePhoneApp(defaultPhoneLayout(),'ink','home');layout=movePhoneApp(layout,'ink',null);
  layout=removePhoneFolder(layout,'settings');expect(phoneLayoutSchema.parse(layout)).toEqual(layout);
  expect(layout.entries.slice(-3)).toEqual(['settings','voice','hud-editor'].map(id=>({type:'app',id})));
  expect(removePhoneApp(layout,'settings')).toBe(layout);expect(removePhoneApp(layout,'ink').entries.some(e=>e.id==='ink')).toBe(false);
 });
 it('rejects duplicates and missing settings, and recovers invalid local state',()=>{
  for(const entries of [[],[...defaultPhoneLayout().entries,{type:'app',id:'settings'}]])expect(phoneLayoutSchema.safeParse({version:1,entries}).success).toBe(false);
  expect(loadPhoneLayout({getItem:()=>'{broken',setItem:()=>{}})).toEqual(defaultPhoneLayout());
 });
 it('persists customized layouts and reports storage failure',()=>{
  let raw:string|null=null;const store={getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
  const layout=movePhoneApp(defaultPhoneLayout(),'music',null);savePhoneLayout(layout,store);expect(loadPhoneLayout(store)).toEqual(layout);
  expect(()=>savePhoneLayout(layout,{getItem:()=>null,setItem:()=>{throw Error('quota');}})).toThrow('quota');
 });
 it('accepts phone organization in backups and validates its invariant',async()=>{
  const backup={format:'studyvillage-backup',version:1,createdAt:1,local:newLocalData(),values:{[PHONE_LAYOUT_KEY]:JSON.stringify(defaultPhoneLayout())},notebooks:{notebooks:[],attachments:[]}};
  expect((await parseBackup(JSON.stringify(backup))).values).toEqual(backup.values);
  backup.values[PHONE_LAYOUT_KEY]=JSON.stringify({version:1,entries:[]});await expect(parseBackup(JSON.stringify(backup))).rejects.toThrow();
 });
});

it('groups icons, cleans empty folders and migrates retired shortcuts',()=>{
 let layout=dropPhoneApp(defaultPhoneLayout(),'contacts','village',true);
 expect(layout.entries[0]).toMatchObject({type:'folder',name:'Folder 1',apps:['village','contacts']});
 layout=dropPhoneApp(layout,'contacts',null);layout=dropPhoneApp(layout,'village',null);
 expect(layout.entries.some(e=>e.type==='folder'&&e.name==='Folder 1')).toBe(false);
 expect(normalizePhoneLayout({...layout,entries:[...layout.entries,{type:'app',id:'identity'}]})).toEqual(layout);
});

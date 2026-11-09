import {describe,it,expect} from 'vitest';
import {defaultPhoneLayout,phoneLayoutSchema,removePhoneFolder,movePhoneApp,removePhoneApp,dropPhoneApp,normalizePhoneLayout} from '../../packages/core/src/phone/layout';
import {loadPhoneLayout,savePhoneLayout,PHONE_LAYOUT_KEY} from '../../packages/runtime/src/storage/phone-layout';
import {parseBackup} from '../../packages/runtime/src/storage/backup';
import {newLocalData} from '../../packages/runtime/src/storage/local-store';
describe('phone layout',()=>{
 it('starts with the requested apps and folders',()=>{expect(defaultPhoneLayout().entries).toEqual([
  {type:'app',id:'village'},{type:'app',id:'contacts'},
  {type:'folder',id:'home',name:'Hogar',builtin:true,apps:['house','rooms','decorate','garden','pets']},
  {type:'folder',id:'settings',name:'Ajustes',builtin:true,apps:['settings','voice','hud-editor','devices']},
 ]);});
 it('moves apps without duplication and preserves settings when deleting its folder',()=>{
  let layout=movePhoneApp(defaultPhoneLayout(),'ink','home');layout=movePhoneApp(layout,'ink',null);
  layout=removePhoneFolder(layout,'settings');expect(phoneLayoutSchema.parse(layout)).toEqual(layout);
  expect(layout.entries.slice(-4)).toEqual(['settings','voice','hud-editor','devices'].map(id=>({type:'app',id})));
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

import {dropPhoneItem} from '../../packages/core/src/phone/layout';
it('distinguishes Settings app from its namesake folder and keeps it installed',()=>{
 let layout=movePhoneApp(defaultPhoneLayout(),'settings',null);
 layout=dropPhoneItem(layout,{type:'app',id:'settings'},{type:'group',target:{type:'folder',id:'settings'}});
 expect(layout.entries.find(e=>e.type==='folder'&&e.id==='settings')).toMatchObject({apps:['voice','hud-editor','devices','settings']});
 expect(phoneLayoutSchema.parse(layout)).toEqual(layout);
});
it('inserts apps and whole folders into packed slots without nesting or losing custom names',()=>{
 const original=defaultPhoneLayout();let layout=dropPhoneItem(original,{type:'folder',id:'settings'},{type:'insert',folder:null,index:1});
 expect(layout.entries.map(e=>e.id)).toEqual(['village','settings','contacts','home']);
 layout=dropPhoneItem(layout,{type:'folder',id:'settings'},{type:'insert',folder:null,index:4});expect(layout).toEqual(original);
 expect(dropPhoneItem(layout,{type:'folder',id:'settings'},{type:'group',target:{type:'folder',id:'home'}})).toBe(layout);
 layout=dropPhoneItem(layout,{type:'app',id:'garden'},{type:'insert',folder:'home',index:1});expect(layout.entries[2]).toMatchObject({apps:['house','garden','rooms','decorate','pets']});
 expect(original.entries[2]).toMatchObject({apps:['house','rooms','decorate','garden','pets']});
});

it('introduces Devices once without changing custom folders or reinstalling a removed shortcut',()=>{
 const old=defaultPhoneLayout();delete old.introducedApps;
 const settings=old.entries.find(e=>e.type==='folder'&&e.id==='settings')!;
 if(settings.type!=='folder')throw Error('Expected folder');
 settings.apps=settings.apps.filter(id=>id!=='devices');settings.name='My tools';settings.appearance={icon:'notes',color:'#123456'};
 const upgraded=normalizePhoneLayout(old);
 expect(upgraded.entries.find(e=>e.id==='settings')).toMatchObject({name:'My tools',appearance:settings.appearance,apps:['settings','voice','hud-editor','devices']});
 expect(settings.apps).not.toContain('devices');
 expect(normalizePhoneLayout(upgraded)).toEqual(upgraded);
 const removed=removePhoneApp(upgraded,'devices');expect(normalizePhoneLayout(removed)).toEqual(removed);
});

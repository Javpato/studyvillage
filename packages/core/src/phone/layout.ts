import {z} from 'zod';

export const PHONE_APPS = {
 pets:'Mascotas', village:'Aldea', contacts:'Contactos', identity:'Identidad', house:'Mi casa', rooms:'Habitaciones',
 decorate:'Decorar', garden:'Mi jardín', settings:'Ajustes', connection:'Conexión', voice:'Voz',
 'hud-editor':'Editar controles', ink:'Cuaderno de tinta', music:'Música', study:'Estudio', projects:'Proyectos', focus:'Concentración', tetris:'Bloques del Bosque',
} as const;
export type PhoneAppId = keyof typeof PHONE_APPS;
const appId=z.enum(Object.keys(PHONE_APPS) as [PhoneAppId,...PhoneAppId[]]);
const app=z.strictObject({type:z.literal('app'),id:appId});
const folder=z.strictObject({type:z.literal('folder'),id:z.string().min(1).max(80),name:z.string().trim().min(1).max(48),builtin:z.boolean().optional(),apps:z.array(appId).max(16)});
export const phoneLayoutSchema=z.strictObject({version:z.literal(1),entries:z.array(z.discriminatedUnion('type',[app,folder])).max(48)}).superRefine((layout,ctx)=>{
 const apps=layout.entries.flatMap(e=>e.type==='app'?[e.id]:e.apps);
 const folders=layout.entries.filter(e=>e.type==='folder').map(e=>e.id);
 if(new Set(apps).size!==apps.length||new Set(folders).size!==folders.length||!apps.includes('settings'))ctx.addIssue({code:'custom',message:'Invalid phone layout'});
});
export type PhoneLayout=z.infer<typeof phoneLayoutSchema>;
export type PhoneFolder=Extract<PhoneLayout['entries'][number],{type:'folder'}>;
export function defaultPhoneLayout():PhoneLayout{return {version:1,entries:[
 {type:'app',id:'village'},{type:'app',id:'contacts'},
 {type:'folder',id:'home',name:'Hogar',builtin:true,apps:['house','rooms','decorate','garden','pets']},
 {type:'folder',id:'settings',name:'Ajustes',builtin:true,apps:['settings','voice','hud-editor']},
]};}
export function removePhoneFolder(layout:PhoneLayout,id:string):PhoneLayout{
 const found=layout.entries.find(e=>e.type==='folder'&&e.id===id);
 if(!found||found.type!=='folder')return layout;
 return {...layout,entries:[...layout.entries.filter(e=>e!==found),...found.apps.map(id=>({type:'app' as const,id}))]};
}
export function movePhoneApp(layout:PhoneLayout,id:PhoneAppId,destination:string|null):PhoneLayout{
 if(destination!==null&&!layout.entries.some(e=>e.type==='folder'&&e.id===destination))return layout;
 const next:PhoneLayout={...layout,entries:layout.entries.filter(e=>e.type!=='app'||e.id!==id).map(e=>e.type==='folder'?{...e,apps:e.apps.filter(a=>a!==id)}:e)};
 if(destination===null)next.entries.push({type:'app',id});
 else {const target=next.entries.find(e=>e.type==='folder'&&e.id===destination) as PhoneFolder;target.apps.push(id);}
 return next;
}
export function removePhoneApp(layout:PhoneLayout,id:PhoneAppId):PhoneLayout{
 if(id==='settings')return layout;
 return {...layout,entries:layout.entries.filter(e=>e.type!=='app'||e.id!==id).map(e=>e.type==='folder'?{...e,apps:e.apps.filter(a=>a!==id)}:e)};
}

/** Also used when importing older backups. Removed shortcuts never delete app data. */
export function normalizePhoneLayout(layout:PhoneLayout):PhoneLayout {
 const retired=new Set(['identity','connection']);
 return {...layout,entries:layout.entries.flatMap<PhoneLayout['entries'][number]>(e=>e.type==='app'?(retired.has(e.id)?[]:[e]):[{...e,apps:e.apps.filter(id=>!retired.has(id))}]).filter(e=>e.type==='app'||e.apps.length>0)};
}
/** Compatibility helper; interactive code uses typed references. */
export function dropPhoneApp(layout:PhoneLayout,id:PhoneAppId,target:string|null,group=false):PhoneLayout {
 const folder=layout.entries.find(e=>e.type==='folder'&&e.id===target);
 if(folder)return dropPhoneItem(layout,{type:'app',id},{type:'group',target:{type:'folder',id:folder.id}});
 const parent=layout.entries.find(e=>e.type==='folder'&&e.apps.includes(target as PhoneAppId));
 if(group&&target)return dropPhoneItem(layout,{type:'app',id},{type:'group',target:{type:'app',id:target as PhoneAppId}});
 const index=parent?.type==='folder'?parent.apps.indexOf(target as PhoneAppId):layout.entries.findIndex(e=>e.type==='app'&&e.id===target);
 return dropPhoneItem(layout,{type:'app',id},{type:'insert',folder:parent?.id??null,index:index<0?layout.entries.length:index});
}

/** App and folder IDs occupy different namespaces, including the built-in Settings pair. */
export type PhoneItemRef={type:'app';id:PhoneAppId}|{type:'folder';id:string};
export type PhoneDrop={type:'insert';folder:string|null;index:number}|{type:'group';target:PhoneItemRef};
export function dropPhoneItem(layout:PhoneLayout,item:PhoneItemRef,drop:PhoneDrop):PhoneLayout {
 const next=structuredClone(layout);
 const source=item.type==='folder'?next.entries.find(e=>e.type==='folder'&&e.id===item.id):next.entries.find(e=>e.type==='app'?e.id===item.id:e.apps.includes(item.id));
 if(!source)return layout;
 if(drop.type==='group'&&(item.type==='folder'||(drop.target.type===item.type&&drop.target.id===item.id)))return layout;
 if(drop.type==='insert'&&item.type==='folder'&&drop.folder!==null)return layout;
 const destination=drop.type==='group'?next.entries.find(e=>e.type===drop.target.type&&e.id===drop.target.id||(e.type==='folder'&&drop.target.type==='app'&&e.apps.includes(drop.target.id))):drop.folder===null?null:next.entries.find(e=>e.type==='folder'&&e.id===drop.folder);
 if((drop.type==='group'||drop.folder!==null)&&!destination)return layout;
 if(destination?.type==='folder'&&item.type==='app'&&!destination.apps.includes(item.id)&&destination.apps.length>=16)return layout;
 // Insertion indexes refer to the original packed grid, before lifting the source.
 let index=drop.type==='insert'?drop.index:0;
 if(drop.type==='insert'){
  const oldIndex=drop.folder===null?next.entries.findIndex(e=>e.type===item.type&&e.id===item.id):source.type==='folder'&&source.id===drop.folder&&item.type==='app'?source.apps.indexOf(item.id):-1;
  if(oldIndex>=0&&oldIndex<index)index--;
 }
 if(item.type==='folder'||source.type==='app')next.entries.splice(next.entries.indexOf(source),1);
 else source.apps=source.apps.filter(id=>id!==item.id);
 if(drop.type==='insert'){
  if(destination?.type==='folder'&&item.type==='app')destination.apps.splice(Math.max(0,index),0,item.id);
  else next.entries.splice(Math.max(0,index),0,item.type==='folder'?source:{type:'app',id:item.id});
 }else if(item.type==='app'&&drop.target.type==='folder'&&destination?.type==='folder')destination.apps.push(item.id);
 else if(item.type==='app'&&drop.target.type==='app'&&destination){
  // Apps inside a folder reorder there; nesting folders is never allowed.
  if(destination.type==='folder')destination.apps.splice(destination.apps.indexOf(drop.target.id),0,item.id);
  else {let n=1;while(next.entries.some(e=>e.type==='folder'&&e.name===`Folder ${n}`))n++;
   next.entries.splice(next.entries.indexOf(destination),1,{type:'folder',id:crypto.randomUUID(),name:`Folder ${n}`,apps:[destination.id,item.id]});}
 }
 return normalizePhoneLayout(next);
}

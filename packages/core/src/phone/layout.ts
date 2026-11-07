import {z} from 'zod';

export const PHONE_APPS = {
 village:'Aldea', contacts:'Contactos', identity:'Identidad', house:'Mi casa', rooms:'Habitaciones',
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
 {type:'folder',id:'home',name:'Hogar',builtin:true,apps:['house','rooms','decorate','garden']},
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
export function dropPhoneApp(layout:PhoneLayout,id:PhoneAppId,target:string|null,group=false):PhoneLayout {
 if(id===target)return layout;
 const next=structuredClone(layout);
 const source=next.entries.find(e=>e.type==='app'?e.id===id:e.apps.includes(id));
 const destination=next.entries.find(e=>e.type==='app'?e.id===target:e.id===target||e.apps.includes(target as PhoneAppId));
 if(!source)return layout;
 if(source.type==='app')next.entries.splice(next.entries.indexOf(source),1);else source.apps=source.apps.filter(a=>a!==id);
 if(!destination)next.entries.push({type:'app',id});
 else if(destination.type==='folder'){
  const at=destination.apps.indexOf(target as PhoneAppId);destination.apps.splice(at<0?destination.apps.length:at,0,id);
 }else if(group){
  let n=1;while(next.entries.some(e=>e.type==='folder'&&e.name===`Folder ${n}`))n++;
  next.entries.splice(next.entries.indexOf(destination),1,{type:'folder',id:crypto.randomUUID(),name:`Folder ${n}`,apps:[destination.id,id]});
 }else next.entries.splice(next.entries.indexOf(destination),0,{type:'app',id});
 return normalizePhoneLayout(next);
}

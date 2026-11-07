import {PHONE_APPS,defaultPhoneLayout,movePhoneApp,removePhoneApp,removePhoneFolder,type PhoneAppId,type PhoneLayout,type PhoneFolder} from '../../../packages/core/src/phone/layout';
import {loadPhoneLayout,savePhoneLayout} from '../../../packages/runtime/src/storage/phone-layout';
import {msg,setDisplayText,setDisplayAttribute,type DisplayText} from '../i18n';
export class PhoneLayoutEditor {
 readonly root=document.createElement('div');
 private draft=loadPhoneLayout();
 constructor(private saved:(layout:PhoneLayout)=>void){this.root.className='sv-phone-layout-editor';this.render();}
 reset(){this.draft=loadPhoneLayout();this.render();}
 private text(tag:string,label:DisplayText){const e=document.createElement(tag);setDisplayText(e,label);return e;}
 private button(label:DisplayText,run:()=>void){const b=document.createElement('button');b.type='button';b.className='sv-button';setDisplayText(b,label);b.onclick=run;return b;}
 private destination(id:PhoneAppId,folder:string|null){const select=document.createElement('select');setDisplayAttribute(select,'aria-label',msg('Ubicación de {app}',{app:msg(PHONE_APPS[id])}));
  for(const [value,label] of [['',msg('Inicio')],...this.draft.entries.filter((e):e is PhoneFolder=>e.type==='folder').map(e=>[e.id,e.builtin?msg(e.name):e.name] as const)] as const){const o=document.createElement('option');o.value=value as string;setDisplayText(o,label);select.append(o);}
  select.value=folder??'';select.onchange=()=>{this.draft=movePhoneApp(this.draft,id,select.value||null);this.render();};return select;
 }
 private reorder<T>(items:T[],index:number,row:HTMLElement){for(const [delta,key]of [[-1,'Subir'],[1,'Bajar']]as const){const b=this.button(msg(key),()=>{[items[index],items[index+delta]]=[items[index+delta],items[index]];this.render();});b.disabled=index+delta<0||index+delta>=items.length;row.append(b);}}
 private appRow(id:PhoneAppId,folder:string|null,index:number,items:PhoneAppId[]|PhoneLayout['entries']){
  const row=this.text('div',msg(PHONE_APPS[id]));row.className='sv-phone-layout-row';row.dataset.app=id;
  row.append(this.destination(id,folder));this.reorder(items as unknown[],index,row);
  const remove=this.button(msg('Quitar aplicación'),()=>{this.draft=removePhoneApp(this.draft,id);this.render();});remove.disabled=id==='settings';row.append(remove);return row;
 }
 private render(){
  this.root.replaceChildren(this.text('h3',msg('Organizar teléfono')),this.text('p',msg('Quitar una aplicación solo oculta su acceso. Tus datos se conservan. Ajustes siempre permanece disponible.')));
  this.draft.entries.forEach((entry,index)=>{
   if(entry.type==='app'){this.root.append(this.appRow(entry.id,null,index,this.draft.entries));return;}
   const group=document.createElement('fieldset');group.dataset.folder=entry.id;group.append(this.text('legend',entry.builtin?msg(entry.name):entry.name));
   const name=document.createElement('input');name.value=entry.name;name.maxLength=48;setDisplayAttribute(name,'aria-label',msg('Nombre de la carpeta'));
   name.onchange=()=>{if(name.value.trim()){entry.name=name.value.trim();entry.builtin=false;this.render();}else name.value=entry.name;};group.append(name);
   this.reorder(this.draft.entries,index,group);group.append(this.button(msg('Eliminar carpeta'),()=>{this.draft=removePhoneFolder(this.draft,entry.id);this.render();}));
   entry.apps.forEach((id,i)=>group.append(this.appRow(id,entry.id,i,entry.apps)));this.root.append(group);
  });
  const installed=new Set(this.draft.entries.flatMap(e=>e.type==='app'?[e.id]:e.apps));
  const available=document.createElement('select');setDisplayAttribute(available,'aria-label',msg('Aplicación para añadir'));
  for(const id of Object.keys(PHONE_APPS)as PhoneAppId[])if(!installed.has(id)){const o=document.createElement('option');o.value=id;setDisplayText(o,msg(PHONE_APPS[id]));available.append(o);}
  const add=this.button(msg('Añadir aplicación'),()=>{if(available.value){this.draft=movePhoneApp(this.draft,available.value as PhoneAppId,null);this.render();}});add.disabled=!available.options.length;
  const folderName=document.createElement('input');folderName.maxLength=48;setDisplayAttribute(folderName,'aria-label',msg('Nueva carpeta'));
  this.root.append(available,add,folderName,this.button(msg('Crear carpeta'),()=>{const name=folderName.value.trim();if(name&&this.draft.entries.length<48){this.draft.entries.push({type:'folder',id:crypto.randomUUID(),name,apps:[]});this.render();}}));
  const error=this.text('p','');error.setAttribute('role','alert');
  this.root.append(this.button(msg('Guardar teléfono'),()=>{try{savePhoneLayout(this.draft);this.saved(structuredClone(this.draft));setDisplayText(error,msg('Teléfono guardado.'));}catch{setDisplayText(error,msg('No se pudo guardar el teléfono. Tus cambios siguen aquí.'));}}),this.button(msg('Cancelar'),()=>this.reset()),this.button(msg('Restablecer distribución'),()=>{this.draft=defaultPhoneLayout();this.render();}),error);
 }
}

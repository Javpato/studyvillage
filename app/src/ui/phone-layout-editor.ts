import {PHONE_APPS,dropPhoneApp,movePhoneApp,removePhoneApp,normalizePhoneLayout,type PhoneAppId,type PhoneLayout} from '../../../packages/core/src/phone/layout';
import {loadPhoneLayout,savePhoneLayout} from '../../../packages/runtime/src/storage/phone-layout';
import {msg,setDisplayText,setDisplayAttribute} from '../i18n';
/** Pointer editing lives on the phone; browser dragging is deliberately not used on touch. */
export class PhoneLayoutEditor {
 readonly root=document.createElement('div'); editing=false;
 private draft=loadPhoneLayout();private library=false;private error='';private timer:ReturnType<typeof setTimeout>|null=null;
 private gesture:{id:number,x:number,y:number,app:PhoneAppId|null,moved:boolean,tile:HTMLElement,touch:boolean}|null=null;private suppress=false;
 private dragPreview:HTMLElement|null=null;private dragSource:HTMLElement|null=null;
 private dragOffset={x:0,y:0};private dragPosition={x:0,y:0};private settling=new Map<HTMLElement,Animation>();
 private blur=()=>this.cancel();
 constructor(private screen:HTMLElement,private saved:(layout:PhoneLayout)=>void,private folder:()=>string|null){
  this.root.className='sv-phone-edit-tools';this.screen.addEventListener('contextmenu',e=>{if(this.tile(e.target)){e.preventDefault();if(!e.pointerType||e.pointerType==='mouse')this.enter();}});
  screen.addEventListener('pointerdown',e=>this.down(e));screen.addEventListener('pointermove',e=>this.move(e));screen.addEventListener('pointerup',e=>this.up(e));screen.addEventListener('pointercancel',()=>this.cancel());
  screen.addEventListener('lostpointercapture',()=>{if(this.gesture)this.cancel();});window.addEventListener('blur',this.blur);
  screen.addEventListener('dragstart',event=>{if(this.tile(event.target))event.preventDefault();});
  screen.addEventListener('click',e=>{if(this.suppress){e.preventDefault();e.stopImmediatePropagation();this.suppress=false;return;}const tile=this.tile(e.target);if(this.editing&&tile?.dataset.phoneApp){e.preventDefault();e.stopImmediatePropagation();if((e.target as HTMLElement).closest('[data-remove]'))this.change(removePhoneApp(this.draft,tile.dataset.phoneApp as PhoneAppId));}},true);
  screen.addEventListener('keydown',e=>{const tile=this.tile(e.target),id=tile?.dataset.phoneApp as PhoneAppId|undefined;if(e.key==='Escape'&&this.editing){e.preventDefault();e.stopPropagation();this.finish();}if(!id)return;if(e.key==='F2'){e.preventDefault();this.enter();}if(this.editing&&e.key==='Delete'){e.preventDefault();this.change(removePhoneApp(this.draft,id));}if(this.editing&&e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const container=this.draft.entries.find(item=>item.type==='folder'&&item.apps.includes(id));const ids=container?.type==='folder'?container.apps:this.draft.entries.map(e=>e.id);const index=ids.indexOf(id),other=ids[index+(e.key==='ArrowLeft'?-1:1)];if(other){if(container?.type==='folder'){[container.apps[index],container.apps[index+(e.key==='ArrowLeft'?-1:1)]]=[container.apps[index+(e.key==='ArrowLeft'?-1:1)],id];this.change(this.draft);}else{const next=structuredClone(this.draft);const a=next.entries.findIndex(e=>e.id===id),b=next.entries.findIndex(e=>e.id===other);[next.entries[a],next.entries[b]]=[next.entries[b],next.entries[a]];this.change(next);}}}if(this.editing&&e.altKey&&e.key==='ArrowUp'){e.preventDefault();this.change(movePhoneApp(this.draft,id,null));}},true);
  this.render();
 }
 private tile(target:EventTarget|null){return target instanceof Element?target.closest<HTMLElement>('[data-phone-app],[data-phone-folder]'):null;}
 private clearTarget(){this.screen.querySelectorAll('.sv-drop-target').forEach(e=>e.classList.remove('sv-drop-target'));}
 private clearPreview(){this.dragPreview?.remove();this.dragPreview=null;this.dragSource?.classList.remove('sv-phone-drag-source');this.dragSource=null;}
 private cancel(){
  if(this.timer)clearTimeout(this.timer);this.timer=null;
  const pointer=this.gesture?.id;this.gesture=null;
  if(pointer!==undefined&&this.screen.hasPointerCapture(pointer))this.screen.releasePointerCapture(pointer);
  this.clearPreview();this.clearTarget();
  for(const [preview,animation]of this.settling){animation.cancel();preview.remove();}this.settling.clear();
 }
 private lift(x:number,y:number){
  const g=this.gesture;if(!g?.app||this.dragPreview)return;
  const rect=g.tile.getBoundingClientRect(),preview=g.tile.cloneNode(true) as HTMLElement;
  // This is a visual copy only: never duplicate focus targets, test IDs or app IDs.
  for(const node of [preview,...preview.querySelectorAll<HTMLElement>('*')]){
   node.removeAttribute('id');node.removeAttribute('data-testid');node.removeAttribute('data-phone-app');node.removeAttribute('data-phone-folder');node.removeAttribute('aria-label');
  }
  preview.querySelector('[data-remove]')?.remove();preview.classList.remove('sv-drop-target');
  preview.classList.add('sv-phone-drag-preview');preview.setAttribute('aria-hidden','true');preview.inert=true;
  preview.style.width=`${rect.width}px`;preview.style.height=`${rect.height}px`;preview.style.font=getComputedStyle(g.tile).font;
  this.dragOffset={x:(g.x-rect.x)*1.06,y:(g.y-rect.y)*1.06+(g.touch?18:0)};
  this.dragPreview=preview;this.dragSource=g.tile;g.tile.classList.add('sv-phone-drag-source');document.body.append(preview);this.follow(x,y);
 }
 private follow(x:number,y:number){
  this.dragPosition={x:x-this.dragOffset.x,y:y-this.dragOffset.y};
  if(this.dragPreview)this.dragPreview.style.transform=`translate3d(${this.dragPosition.x}px,${this.dragPosition.y}px,0) scale(1.06)`;
 }
 private settle(app:PhoneAppId){
  const preview=this.dragPreview;if(!preview)return;
  this.dragPreview=null;this.dragSource?.classList.remove('sv-phone-drag-source');this.dragSource=null;
  const entry=this.draft.entries.find(e=>e.type==='app'?e.id===app:e.apps.includes(app));
  const target=[...this.screen.querySelectorAll<HTMLElement>('[data-phone-app],[data-phone-folder]')].find(el=>(el.dataset.phoneApp===app||el.dataset.phoneFolder===entry?.id)&&el.getClientRects().length>0);
  if(!target||matchMedia('(prefers-reduced-motion: reduce)').matches){preview.remove();return;}
  const rect=target.getBoundingClientRect(),animation=preview.animate([
   {transform:preview.style.transform,opacity:1},
   {transform:`translate3d(${rect.x}px,${rect.y}px,0) scale(${rect.width/preview.offsetWidth})`,opacity:0},
  ],{duration:170,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
  this.settling.set(preview,animation);const done=()=>{preview.remove();this.settling.delete(preview);};animation.onfinish=done;animation.oncancel=done;
 }
 private down(e:PointerEvent){
  if(e.button!==0||(e.target as Element).closest('[data-remove]')||this.gesture)return;
  const tile=this.tile(e.target);if(!tile)return;this.cancel();
  this.gesture={id:e.pointerId,x:e.clientX,y:e.clientY,app:(tile.dataset.phoneApp as PhoneAppId)||null,moved:false,tile,touch:e.pointerType!=='mouse'};
  if(!this.editing)this.timer=setTimeout(()=>{if(this.gesture?.id!==e.pointerId)return;this.timer=null;this.enter();this.suppress=true;if(this.gesture.app){this.screen.setPointerCapture(e.pointerId);this.lift(e.clientX,e.clientY);}},3000);
  else if(this.gesture.app)this.screen.setPointerCapture(e.pointerId);
 }
 private move(e:PointerEvent){
  const g=this.gesture;if(!g||g.id!==e.pointerId)return;
  if(!g.moved&&Math.hypot(g.x-e.clientX,g.y-e.clientY)<8)return;
  if(this.timer)clearTimeout(this.timer);this.timer=null;if(!this.editing){this.cancel();return;}
  if(!g.app)return;g.moved=true;e.preventDefault();this.lift(e.clientX,e.clientY);this.follow(e.clientX,e.clientY);this.clearTarget();
  const target=this.tile(document.elementFromPoint(e.clientX,e.clientY));if(target!==g.tile)target?.classList.add('sv-drop-target');
 }
 private up(e:PointerEvent){
  const g=this.gesture;if(!g||g.id!==e.pointerId)return;
  if(g.moved&&g.app){
   const tile=this.tile(document.elementFromPoint(e.clientX,e.clientY)),r=tile?.getBoundingClientRect();
   const group=!!r&&e.clientX>r.left+r.width*.25&&e.clientX<r.right-r.width*.25;
   this.change(dropPhoneApp(this.draft,g.app,tile?.dataset.phoneApp??tile?.dataset.phoneFolder??null,group));
   this.suppress=true;setTimeout(()=>{this.suppress=false;},0);
  }
  if(this.timer)clearTimeout(this.timer);this.timer=null;this.gesture=null;
  if(this.screen.hasPointerCapture(e.pointerId))this.screen.releasePointerCapture(e.pointerId);
  this.clearTarget();if(g.app)this.settle(g.app);else this.clearPreview();
 }
 enter(){this.editing=true;this.render();this.decorate();}
 finish(){this.cancel();this.editing=false;this.library=false;this.render();this.decorate();}
 private change(layout:PhoneLayout){this.draft=normalizePhoneLayout(layout);try{savePhoneLayout(this.draft);this.error='';}catch{this.error='No se pudo guardar el teléfono. Tus cambios siguen aquí.';}this.saved(this.draft);this.render();this.decorate();}
 private button(label:string,run:()=>void){const b=document.createElement('button');b.type='button';b.className='sv-button';setDisplayText(b,msg(label));b.onclick=run;return b;}
 decorate(){this.screen.classList.toggle('is-editing',this.editing);for(const tile of this.screen.querySelectorAll<HTMLElement>('[data-phone-app]')){tile.querySelector('[data-remove]')?.remove();const id=tile.dataset.phoneApp;if(this.editing&&id!=='settings'){const x=document.createElement('span');x.dataset.remove='';x.className='sv-phone-remove';x.textContent='×';setDisplayAttribute(x,'aria-label',msg('Quitar aplicación'));tile.append(x);}}
 const title=this.screen.querySelector<HTMLElement>('.sv-phone-title');if(title){title.onclick=event=>{if(event.target instanceof HTMLInputElement)return;if(!this.editing||!this.folder())return;const folder=this.draft.entries.find(e=>e.type==='folder'&&e.id===this.folder());if(folder?.type!=='folder')return;const input=document.createElement('input');input.maxLength=48;input.value=folder.name;setDisplayAttribute(input,'aria-label',msg('Nombre de la carpeta'));title.replaceChildren(input);input.focus();input.select();const done=()=>{if(input.value.trim()){folder.name=input.value.trim();folder.builtin=false;this.change(this.draft);}};input.onblur=done;input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')input.blur();};};}}
 private render(){this.root.hidden=!this.editing;this.root.replaceChildren();if(!this.editing)return;this.root.append(this.button('Listo',()=>this.finish()),this.button('Biblioteca de apps',()=>{this.library=!this.library;this.render();}));if(this.error){const error=document.createElement('p');error.setAttribute('role','alert');setDisplayText(error,msg(this.error));this.root.append(error,this.button('Reintentar',()=>this.change(this.draft)));}
 if(this.library){const box=document.createElement('div');box.className='sv-phone-library';const installed=new Set(this.draft.entries.flatMap(e=>e.type==='app'?[e.id]:e.apps));for(const id of Object.keys(PHONE_APPS)as PhoneAppId[]){if(id==='identity'||id==='connection')continue;const b=this.button(PHONE_APPS[id],()=>this.change(movePhoneApp(this.draft,id,null)));b.disabled=installed.has(id);b.setAttribute('aria-pressed',String(installed.has(id)));box.append(b);}this.root.append(box);}}
 dispose(){this.cancel();window.removeEventListener('blur',this.blur);}
}

import {editFolderAppearance} from './folder-appearance';
import {activeInput,buttonGlyph,onInputChange} from '../input/actions';
import {PHONE_APPS,dropPhoneItem,movePhoneApp,removePhoneApp,normalizePhoneLayout,type PhoneAppId,type PhoneLayout,type PhoneItemRef,type PhoneDrop} from '../../../packages/core/src/phone/layout';
import {loadPhoneLayout,savePhoneLayout} from '../../../packages/runtime/src/storage/phone-layout';
import {msg,setDisplayText,setDisplayAttribute} from '../i18n';
/** Pointer editing lives on the phone; browser dragging is deliberately not used on touch. */
export class PhoneLayoutEditor {
 readonly root=document.createElement('div'); editing=false;
 private hint=document.createElement('p');private offInput:()=>void;
 private draft=loadPhoneLayout();private library=false;private error='';private timer:ReturnType<typeof setTimeout>|null=null;
 private gesture:{id:number,x:number,y:number,item:PhoneItemRef,moved:boolean,tile:HTMLElement,touch:boolean}|null=null;private suppress=false;
 private dragPreview:HTMLElement|null=null;private dragSource:HTMLElement|null=null;
 private dragOffset={x:0,y:0};private dragPosition={x:0,y:0};private settling=new Map<HTMLElement,Animation>();
 private drop:PhoneDrop|null=null;private hover:{key:string;since:number}|null=null;private frame=0;
 private pointer={x:0,y:0};private slots:{tile:HTMLElement;rect:DOMRect}[]=[];private marker:HTMLElement|null=null;
 private cancelledClick=false;
 private clearCancelledClick=()=>{this.cancelledClick=false;};
 private swallowCancelledClick=(e:MouseEvent)=>{if(this.cancelledClick){this.cancelledClick=false;e.preventDefault();e.stopImmediatePropagation();}};
 private blur=()=>this.cancel();
 constructor(private screen:HTMLElement,private saved:(layout:PhoneLayout)=>void,private folder:()=>string|null){
  document.addEventListener('pointerdown',this.clearCancelledClick,true);document.addEventListener('click',this.swallowCancelledClick,true);
  this.hint.className='sv-phone-edit-hint';this.screen.append(this.hint);this.offInput=onInputChange(()=>this.help());this.help();
  this.screen.addEventListener('sv-phone-edit',()=>this.enter());
  this.root.className='sv-phone-edit-tools';this.screen.addEventListener('contextmenu',e=>{if(this.tile(e.target)){e.preventDefault();if(!e.pointerType||e.pointerType==='mouse')this.enter();}});
  screen.addEventListener('pointerdown',e=>this.down(e));screen.addEventListener('pointermove',e=>this.move(e));screen.addEventListener('pointerup',e=>this.up(e));screen.addEventListener('pointercancel',()=>this.cancel());
  screen.addEventListener('lostpointercapture',e=>{if(e.target===screen&&this.gesture&&!screen.hasPointerCapture(e.pointerId))this.cancel();});window.addEventListener('blur',this.blur);
  screen.addEventListener('dragstart',event=>{if(this.tile(event.target))event.preventDefault();});
  screen.addEventListener('click',e=>{if(this.suppress){e.preventDefault();e.stopImmediatePropagation();this.suppress=false;return;}const tile=this.tile(e.target);if(this.editing&&tile?.dataset.phoneApp){e.preventDefault();e.stopImmediatePropagation();if((e.target as HTMLElement).closest('[data-remove]'))this.change(removePhoneApp(this.draft,tile.dataset.phoneApp as PhoneAppId));}},true);
  screen.addEventListener('keydown',e=>{
   if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
   const tile=this.tile(e.target),item=tile?this.ref(tile):null;
   if(e.key==='Escape'&&this.editing){e.preventDefault();e.stopPropagation();if(this.gesture)this.cancel();else this.finish();return;}
   if(!item)return;if(e.key==='F2'){e.preventDefault();this.enter();}
   if(!this.editing)return;
   if(e.key==='Delete'&&item.type==='app'){e.preventDefault();this.change(removePhoneApp(this.draft,item.id));}
   if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();const folder=this.folder(),parent=this.draft.entries.find(e=>e.type==='folder'&&e.id===folder);
    const ids=parent?.type==='folder'?parent.apps:this.draft.entries.map(e=>`${e.type}:${e.id}`);
    const index=ids.indexOf(parent?.type==='folder'?item.id:`${item.type}:${item.id}`);
    this.change(dropPhoneItem(this.draft,item,{type:'insert',folder,index:e.key==='ArrowLeft'?Math.max(0,index-1):index+2}));
   }
   if(e.altKey&&e.key==='ArrowUp'&&item.type==='app'){e.preventDefault();this.change(movePhoneApp(this.draft,item.id,null));}
  },true);
  this.render();
 }
 private tile(target:EventTarget|null){return target instanceof Element?target.closest<HTMLElement>('[data-phone-app],[data-phone-folder]'):null;}
 private ref(tile:HTMLElement):PhoneItemRef{return tile.dataset.phoneApp?{type:'app',id:tile.dataset.phoneApp as PhoneAppId}:{type:'folder',id:tile.dataset.phoneFolder!};}
 private clearTarget(){this.screen.querySelectorAll('.sv-drop-target,.sv-group-pending').forEach(e=>e.classList.remove('sv-drop-target','sv-group-pending'));}
 private clearPreview(){this.dragPreview?.remove();this.dragPreview=null;this.dragSource?.classList.remove('sv-phone-drag-source');this.dragSource=null;}
 private cancel(){
  if(this.gesture)this.cancelledClick=true;
  if(this.timer)clearTimeout(this.timer);this.timer=null;
  const pointer=this.gesture?.id,tile=this.gesture?.tile;this.gesture=null;
  if(pointer!==undefined&&this.screen.hasPointerCapture(pointer))this.screen.releasePointerCapture(pointer);
  if(pointer!==undefined&&tile?.hasPointerCapture(pointer))tile.releasePointerCapture(pointer);
  this.clearPreview();this.clearTarget();this.clearInsertion();cancelAnimationFrame(this.frame);this.frame=0;this.drop=null;this.hover=null;
  for(const [preview,animation]of this.settling){animation.cancel();preview.remove();}this.settling.clear();
 }
 private lift(x:number,y:number){
  const g=this.gesture;if(!g||this.dragPreview)return;
  const rect=g.tile.getBoundingClientRect(),preview=g.tile.cloneNode(true) as HTMLElement;
  // This is a visual copy only: never duplicate focus targets, test IDs or app IDs.
  for(const node of [preview,...preview.querySelectorAll<HTMLElement>('*')]){
   node.removeAttribute('id');node.removeAttribute('data-testid');node.removeAttribute('data-phone-app');node.removeAttribute('data-phone-folder');node.removeAttribute('aria-label');
  }
  preview.querySelector('[data-remove]')?.remove();preview.classList.remove('sv-drop-target');
  preview.classList.add('sv-phone-drag-preview');preview.setAttribute('aria-hidden','true');preview.inert=true;
  preview.style.width=`${rect.width}px`;preview.style.height=`${rect.height}px`;preview.style.font=getComputedStyle(g.tile).font;
  this.dragOffset={x:(g.x-rect.x)*1.06,y:(g.y-rect.y)*1.06+(g.touch?18:0)};
  this.dragPreview=preview;this.dragSource=g.tile;g.tile.classList.add('sv-phone-drag-source');document.body.append(preview);this.follow(x,y);this.pointer={x,y};this.measure();this.frame=requestAnimationFrame(()=>this.track());
 }
 private follow(x:number,y:number){
  this.dragPosition={x:x-this.dragOffset.x,y:y-this.dragOffset.y};
  if(this.dragPreview)this.dragPreview.style.transform=`translate3d(${this.dragPosition.x}px,${this.dragPosition.y}px,0) scale(1.06)`;
 }
 private settle(item:PhoneItemRef){
  const preview=this.dragPreview;if(!preview)return;
  this.dragPreview=null;this.dragSource?.classList.remove('sv-phone-drag-source');this.dragSource=null;
  const entry=this.draft.entries.find(e=>item.type==='folder'?e.type==='folder'&&e.id===item.id:e.type==='app'?e.id===item.id:e.apps.includes(item.id));
  const target=[...this.screen.querySelectorAll<HTMLElement>('[data-phone-app],[data-phone-folder]')].find(el=>((item.type==='app'&&el.dataset.phoneApp===item.id)||(entry?.type==='folder'&&el.dataset.phoneFolder===entry.id))&&el.getClientRects().length>0);
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
  this.gesture={id:e.pointerId,x:e.clientX,y:e.clientY,item:this.ref(tile),moved:false,tile,touch:e.pointerType!=='mouse'};
  tile.setPointerCapture(e.pointerId);
  if(!this.editing)this.timer=setTimeout(()=>{if(this.gesture?.id!==e.pointerId)return;this.timer=null;this.enter();this.suppress=true;{this.screen.setPointerCapture(e.pointerId);this.lift(e.clientX,e.clientY);}},3000);

 }
 private clearInsertion(){this.marker?.remove();this.marker=null;for(const {tile}of this.slots){tile.style.transform='';tile.classList.remove('sv-phone-shifting');}this.slots=[];}
 private measure(){this.clearInsertion();this.slots=[...this.screen.querySelectorAll<HTMLElement>('[data-phone-app],[data-phone-folder]')].filter(t=>t.getClientRects().length>0).map(tile=>({tile,rect:tile.getBoundingClientRect()}));}
 private track(){if(!this.gesture||!this.dragPreview)return;
  const {x,y}=this.pointer,page=this.gesture.tile.closest<HTMLElement>('.sv-phone-page'),r=page?.getBoundingClientRect();
  if(page&&r){const delta=y>r.bottom-38?8:y<r.top+38?-8:0;if(delta){const old=page.scrollTop;page.scrollTop+=delta;if(old!==page.scrollTop)this.measure();}}
  this.locate(x,y);this.frame=requestAnimationFrame(()=>this.track());
 }
 private locate(x:number,y:number){
  const g=this.gesture;if(!g)return;this.clearTarget();
  for(const {tile}of this.slots){tile.style.transform='';tile.classList.remove('sv-phone-shifting');}
  this.marker?.remove();this.marker=null;
  const screen=this.screen.getBoundingClientRect();if(x<screen.left||x>screen.right||y<screen.top||y>screen.bottom){this.drop=null;this.hover=null;return;}
  // The back arrow is also a drop destination for taking an app out of a folder.
  const back=this.screen.querySelector<HTMLElement>('.sv-phone-head > button'),br=back?.getBoundingClientRect();
  if(this.folder()&&g.item.type==='app'&&br&&x>=br.left&&x<=br.right&&y>=br.top&&y<=br.bottom){this.drop={type:'insert',folder:null,index:this.draft.entries.length};back!.classList.add('sv-drop-target');return;}
  const inside=this.slots.find(({rect:r})=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom);
  const r=inside?.rect,center=inside&&inside.tile!==g.tile&&r&&x>r.left+r.width*.28&&x<r.right-r.width*.28&&y>r.top+r.height*.25&&y<r.bottom-r.height*.25;
  const grouping=!!center&&g.item.type==='app'&&!this.folder();
  if(grouping){
   const target=this.ref(inside!.tile),key=`${target.type}:${target.id}`;
   if(this.hover?.key!==key)this.hover={key,since:performance.now()};
   if(performance.now()-this.hover.since>=400){this.drop={type:'group',target};inside!.tile.classList.add('sv-drop-target');return;}
  }else this.hover=null;
  let index=this.slots.findIndex(({rect:r})=>y<r.bottom&&(y<r.top||x<r.right));if(index<0)index=this.slots.length;
  this.drop={type:'insert',folder:this.folder(),index};
  // Keep the potential group target under the pointer during the dwell period.
  if(grouping){inside!.tile.classList.add('sv-group-pending');return;}
  const source=this.slots.findIndex(s=>s.tile===g.tile),dest=index>source?index-1:index;
  if(source<0||source===dest)return;
  const positions=this.slots.map(s=>s.rect),ordered=this.slots.filter(s=>s.tile!==g.tile);ordered.splice(dest,0,this.slots[source]);
  ordered.forEach(({tile,rect},i)=>{if(tile===g.tile)return;tile.classList.add('sv-phone-shifting');tile.style.transform=`translate(${positions[i].x-rect.x}px,${positions[i].y-rect.y}px)`;});
  const slot=positions[dest];if(slot){this.marker=document.createElement('div');this.marker.className='sv-phone-insertion-marker';Object.assign(this.marker.style,{left:`${slot.x}px`,top:`${slot.y}px`,width:`${slot.width}px`,height:`${slot.height}px`});document.body.append(this.marker);}
 }
 private move(e:PointerEvent){
  const g=this.gesture;if(!g||g.id!==e.pointerId)return;
  if(!g.moved&&Math.hypot(g.x-e.clientX,g.y-e.clientY)<8)return;
  if(this.timer)clearTimeout(this.timer);this.timer=null;if(!this.editing){this.cancel();return;}
  g.moved=true;e.preventDefault();if(!this.screen.hasPointerCapture(e.pointerId))this.screen.setPointerCapture(e.pointerId);this.lift(e.clientX,e.clientY);this.follow(e.clientX,e.clientY);this.pointer={x:e.clientX,y:e.clientY};this.locate(e.clientX,e.clientY);
 }
 private up(e:PointerEvent){
  const g=this.gesture;if(!g||g.id!==e.pointerId)return;
  cancelAnimationFrame(this.frame);this.frame=0;
  if(g.moved){this.locate(e.clientX,e.clientY);this.clearInsertion();if(this.drop)this.change(dropPhoneItem(this.draft,g.item,this.drop));this.suppress=true;setTimeout(()=>{this.suppress=false;},0);}
  if(this.timer)clearTimeout(this.timer);this.timer=null;this.gesture=null;this.drop=null;this.hover=null;
  if(this.screen.hasPointerCapture(e.pointerId))this.screen.releasePointerCapture(e.pointerId);if(g.tile.hasPointerCapture(e.pointerId))g.tile.releasePointerCapture(e.pointerId);
  this.clearTarget();this.clearInsertion();this.settle(g.item);
 }
 handleEscape(){if(!this.editing)return false;if(this.gesture)this.cancel();else this.finish();return true;}
 enter(){this.editing=true;this.render();this.decorate();}
 finish(){this.cancel();this.editing=false;this.library=false;this.render();this.decorate();}
 private change(layout:PhoneLayout){this.draft=normalizePhoneLayout(layout);try{savePhoneLayout(this.draft);this.error='';}catch{this.error='No se pudo guardar el teléfono. Tus cambios siguen aquí.';}this.saved(this.draft);this.render();this.decorate();}
 private button(label:string,run:()=>void){const b=document.createElement('button');b.type='button';b.className='sv-button';setDisplayText(b,msg(label));b.onclick=run;return b;}
 decorate(){this.screen.classList.toggle('is-editing',this.editing);for(const tile of this.screen.querySelectorAll<HTMLElement>('[data-phone-app]')){tile.querySelector('[data-remove]')?.remove();const id=tile.dataset.phoneApp;if(this.editing&&id!=='settings'){const x=document.createElement('span');x.dataset.remove='';x.className='sv-phone-remove';x.textContent='×';setDisplayAttribute(x,'aria-label',msg('Quitar aplicación'));tile.append(x);}}
 const title=this.screen.querySelector<HTMLElement>('.sv-phone-title');if(title){const editable=this.editing&&!!this.folder();title.classList.toggle('sv-folder-rename',editable);title.tabIndex=editable?0:-1;title.onkeydown=e=>{if(editable&&(e.key==='Enter'||e.key===' ')){e.preventDefault();title.click();}};title.onclick=event=>{if(event.target instanceof HTMLInputElement)return;if(!this.editing||!this.folder())return;const folder=this.draft.entries.find(e=>e.type==='folder'&&e.id===this.folder());if(folder?.type!=='folder')return;const input=document.createElement('input');input.maxLength=48;input.value=folder.name;setDisplayAttribute(input,'aria-label',msg('Nombre de la carpeta'));title.replaceChildren(input);input.focus();input.select();const done=()=>{if(input.value.trim()){folder.name=input.value.trim();folder.builtin=false;this.change(this.draft);}};input.onblur=done;input.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){input.onblur=null;this.saved(this.draft);this.decorate();return;}if(e.key==='Enter')input.blur();};};}}
 private help(){setDisplayText(this.hint,this.editing?msg('Pulsa Listo para salir de edición'):activeInput()==='touch'?msg('Mantén pulsado un elemento 3 segundos para editar'):activeInput()==='gamepad'?msg('{button} · Editar teléfono',{button:buttonGlyph(2)}):msg('Clic derecho sobre un elemento para editar · F2'));}
 private render(){this.help();this.root.hidden=!this.editing;this.root.replaceChildren();if(!this.editing)return;this.root.append(this.button('Listo',()=>this.finish()),this.button('Biblioteca de apps',()=>{this.library=!this.library;this.render();}));const folder=this.draft.entries.find(e=>e.type==='folder'&&e.id===this.folder());if(folder?.type==='folder')this.root.append(this.button('Personalizar carpeta',()=>editFolderAppearance(folder,appearance=>{folder.appearance=appearance;this.change(this.draft);})));if(this.error){const error=document.createElement('p');error.setAttribute('role','alert');setDisplayText(error,msg(this.error));this.root.append(error,this.button('Reintentar',()=>this.change(this.draft)));}
 if(this.library){const box=document.createElement('div');box.className='sv-phone-library';const installed=new Set(this.draft.entries.flatMap(e=>e.type==='app'?[e.id]:e.apps));for(const id of Object.keys(PHONE_APPS)as PhoneAppId[]){if(id==='identity'||id==='connection')continue;const b=this.button(PHONE_APPS[id],()=>this.change(movePhoneApp(this.draft,id,null)));b.disabled=installed.has(id);b.setAttribute('aria-pressed',String(installed.has(id)));box.append(b);}this.root.append(box);}}
 dispose(){this.offInput();this.hint.remove();this.cancel();window.removeEventListener('blur',this.blur);document.removeEventListener('pointerdown',this.clearCancelledClick,true);document.removeEventListener('click',this.swallowCancelledClick,true);}
}

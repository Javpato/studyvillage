import {gardenItemSchema,gardenSchema,type GardenItem} from '../../../packages/core/src/protocol/garden';
import {gardenBounds,gardenDoorway,gardenHouseFootprint,gardenItemRect,gardenOrigin,gardenPlacementIssue,resolveGardenItem,type GardenPlacementIssue} from '../../../packages/core/src/world/garden';
import type {AppView,PublicHouse} from '../../../packages/core/src/protocol/types';
import {occupiedParcels,type OccupiedParcel} from '../world/model';
import {sprite} from '../assets/sprite-catalog';
import {FURNITURE_LABELS,FURNITURE_DESCRIPTIONS} from '../house/model';
import {errorMessage} from '../errors/messages';
import {msg,setDisplayText,setDisplayAttribute} from '../i18n';
import './garden.css';
import {drawWorld} from '../world/draw';
type Point={x:number;y:number};
type CatalogueDrag={pointer:number;button:HTMLButtonElement;kind:GardenItem['kind'];start:Point;moved:boolean};

/** A local draft: placement and dragging become durable only when Finish succeeds. */
export class GardenPanel {
 readonly root=document.createElement('aside');active=false;
 private viewport=document.createElement('div');private canvas=document.createElement('canvas');private frame=0;private zoom=1;private pan=false;private panStart:{x:number;y:number;left:number;top:number}|null=null;private transform={scale:1,x:0,y:0};
 private items:GardenItem[]=[];private selected:string|null=null;private pending:GardenItem['kind']|null=null;
 private dragging=false;private dragOffset:Point={x:0,y:0};private beforeDrag:GardenItem[]|null=null;private invalid:GardenPlacementIssue|null=null;
 private catalogueDrag:CatalogueDrag|null=null;private suppressClick=false;private ghost:GardenItem|null=null;
 private floating=document.createElement('img');private saving=false;private feedback=document.createElement('p');private catalogue=document.createElement('div');private count=document.createElement('span');private undo:GardenItem[][]=[];
 private undoButton:HTMLButtonElement;private removeButton:HTMLButtonElement;private doneButton:HTMLButtonElement;
 constructor(private readonly view:()=>AppView|null,private readonly save:(house:PublicHouse)=>Promise<void>,_stage:()=>HTMLCanvasElement){
  this.viewport.className='sv-garden-preview';this.viewport.hidden=true;setDisplayAttribute(this.canvas,'aria-label',msg('Jardín'));this.viewport.append(this.canvas);document.body.append(this.viewport);
  this.canvas.onpointerdown=e=>{if(e.button!==0)return;if(this.pan){this.panStart={x:e.clientX,y:e.clientY,left:this.viewport.scrollLeft,top:this.viewport.scrollTop};this.canvas.setPointerCapture(e.pointerId);return;}this.pointerDown(this.point(e));this.canvas.setPointerCapture(e.pointerId);};this.canvas.onpointermove=e=>{if(this.panStart){this.viewport.scrollLeft=this.panStart.left+this.panStart.x-e.clientX;this.viewport.scrollTop=this.panStart.top+this.panStart.y-e.clientY;}else this.pointerMove(this.point(e));};this.canvas.onpointerup=e=>{this.panStart=null;this.pointerUp();if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);};this.canvas.onpointercancel=()=>this.pointerUp(true);
  this.root.className='sv-garden-tray';this.root.hidden=true;setDisplayAttribute(this.root,'aria-label',msg('Decoración exterior'));
  const button=(key:string,run:()=>void)=>{const b=document.createElement('button');b.type='button';b.className='sv-button';setDisplayText(b,msg(key));b.onclick=run;return b;};
  const head=document.createElement('header'),title=document.createElement('h2');setDisplayText(title,msg('Decorar el exterior'));head.append(title,button('Cancelar',()=>this.close()));
  const help=document.createElement('p');setDisplayText(help,msg('Arrastra un objeto del catálogo al jardín, o tócalo y elige dónde colocarlo.'));
  this.catalogue.className='sv-garden-catalog';for(const kind of gardenItemSchema.shape.kind.options){
   const b=button('',()=>{if(this.suppressClick){this.suppressClick=false;return;}if(this.saving)return;this.pending=kind;this.selected=null;this.ghost=null;this.feedback.textContent='';this.selectButtons();});
   b.dataset.kind=kind;setDisplayAttribute(b,'aria-label',msg(FURNITURE_LABELS[kind]));setDisplayAttribute(b,'title',msg(FURNITURE_LABELS[kind]));
   const img=document.createElement('img');img.src=sprite(kind)?.src??`sprites/${kind}.png`;img.alt='';img.draggable=false;const name=document.createElement('span'),description=document.createElement('small');setDisplayText(name,msg(FURNITURE_LABELS[kind]));setDisplayText(description,msg(FURNITURE_DESCRIPTIONS[kind]));b.append(img,name,description);
   b.addEventListener('dragstart',event=>event.preventDefault());b.addEventListener('pointerdown',event=>this.startCatalogueDrag(event,b,kind));b.addEventListener('pointermove',event=>this.moveCatalogueDrag(event));b.addEventListener('pointerup',event=>this.finishCatalogueDrag(event));b.addEventListener('pointercancel',event=>this.finishCatalogueDrag(event,true));
   this.catalogue.append(b);
  }
  const actions=document.createElement('div');actions.className='sv-garden-actions';this.count.className='sv-garden-count';
  this.undoButton=button('Deshacer',()=>{if(this.saving)return;this.cancelGestures();const old=this.undo.pop();if(old){this.items=old;this.selected=null;this.pending=null;this.selectButtons();}});
  this.removeButton=button('Retirar',()=>{if(this.selected&&!this.saving){this.remember();this.items=this.items.filter(item=>item.id!==this.selected);this.selected=null;this.selectButtons();}});
  this.doneButton=button('Terminar',()=>{void this.commit();});this.doneButton.classList.add('sv-button-primary');const zoomControls=document.createElement('div');zoomControls.className='sv-garden-zoom';zoomControls.append(button('Desplazar',()=>{this.pan=!this.pan;this.canvas.style.cursor=this.pan?'grab':'crosshair';}),button('−',()=>{this.zoom=Math.max(1,this.zoom-.25);}),button('+',()=>{this.zoom=Math.min(3,this.zoom+.25);}));head.append(zoomControls);actions.append(this.count,this.undoButton,this.removeButton,this.doneButton);
  this.feedback.setAttribute('role','status');this.feedback.setAttribute('aria-live','polite');this.root.append(head,help,this.catalogue,actions,this.feedback);document.body.append(this.root);
  this.floating.className='sv-garden-drag-preview';this.floating.hidden=true;this.floating.alt='';this.floating.draggable=false;document.body.append(this.floating);
 }
 private parcel(){const view=this.view();return view?occupiedParcels(view).find(parcel=>parcel.isOwn)?.parcel:null;}
 open(){if(!this.parcel())return;this.items=structuredClone((this.view()!.ownHouse.garden??[]).map(item=>resolveGardenItem(this.parcel()!,item)));this.undo=[];this.selected=null;this.pending=null;this.ghost=null;this.feedback.textContent='';this.active=true;this.root.hidden=false;document.documentElement.classList.add('sv-decorating');this.selectButtons();this.viewport.hidden=false;this.zoom=1;this.paint();}
 close(){if(this.saving)return;this.cancelGestures();this.active=false;cancelAnimationFrame(this.frame);this.viewport.hidden=true;this.root.hidden=true;document.documentElement.classList.remove('sv-decorating');}
 preview(parcels:OccupiedParcel[]):OccupiedParcel[]{return this.active?parcels.map(parcel=>parcel.isOwn?{...parcel,house:{...parcel.house,garden:this.items.map(({plot,...item})=>item)}}:parcel):parcels;}
 private remember(){this.undo.push(structuredClone(this.items));if(this.undo.length>30)this.undo.shift();}
 private selectButtons(){for(const b of this.catalogue.querySelectorAll('button')){b.setAttribute('aria-pressed',String(b.dataset.kind===this.pending));b.disabled=this.saving;}this.undoButton.disabled=this.saving||!this.undo.length;this.removeButton.disabled=this.saving||!this.selected;this.doneButton.disabled=this.saving;setDisplayText(this.count,msg('{count}/16 objetos',{count:this.items.length}));}
 private candidate(kind:GardenItem['kind'],point:Point,id='garden-preview'):GardenItem|null{const parcel=this.parcel();if(!parcel)return null;const origin=gardenOrigin(parcel);return{id,kind,plot:parcel.slot,x:Math.round((point.x-origin.x)/4)*4,y:Math.round((point.y-origin.y)/4)*4};}
 private placement(item:GardenItem){const parcel=this.parcel();return parcel?gardenPlacementIssue(parcel,item):'bounds' as const;}
 private explain(issue:GardenPlacementIssue|null){setDisplayText(this.feedback,msg(issue==='house'?'Deja libre la casa, el tejado y sus bordes.':issue==='door'?'Deja libre el camino de la puerta.':issue==='bounds'?'Coloca el objeto dentro del jardín marcado.':'Suelta para colocar.'));}
 private add(item:GardenItem):boolean{
  const issue=this.placement(item);if(issue){this.explain(issue);return false;}if(this.items.length>=16){setDisplayText(this.feedback,msg('Tu jardín ya tiene 16 objetos. Retira uno para añadir otro.'));return false;}
  this.remember();const saved={...item,id:crypto.randomUUID()};this.items.push(saved);this.selected=saved.id;this.pending=null;this.ghost=null;this.feedback.textContent='';this.selectButtons();return true;
 }
 pointerDown(point:Point){
  if(!this.active||this.saving||this.catalogueDrag)return;const parcel=this.parcel();if(!parcel)return;
  if(this.pending){this.ghost=this.candidate(this.pending,point);if(this.ghost)this.add(this.ghost);return;}
  const hit=[...this.items].reverse().find(item=>{const rect=gardenItemRect(parcel,item);return point.x>=rect.x&&point.x<=rect.x+rect.w&&point.y>=rect.y&&point.y<=rect.y+rect.h;});this.selected=hit?.id??null;
  if(hit){const origin=gardenOrigin(parcel);this.beforeDrag=structuredClone(this.items);this.dragging=true;this.invalid=null;this.dragOffset={x:point.x-origin.x-hit.x,y:point.y-origin.y-hit.y};}this.selectButtons();
 }
 pointerMove(point:Point){
  if(!this.active||this.saving||this.catalogueDrag)return;
  if(this.pending){this.ghost=this.candidate(this.pending,point);return;}
  if(!this.dragging)return;const item=this.items.find(item=>item.id===this.selected);if(!item)return;const next=this.candidate(item.kind,{x:point.x-this.dragOffset.x,y:point.y-this.dragOffset.y},item.id);if(!next)return;item.x=next.x;item.y=next.y;item.plot=next.plot;this.invalid=this.placement(item);
 }
 pointerUp(cancel=false){
  if(this.dragging&&this.beforeDrag){if(cancel||this.invalid){this.items=this.beforeDrag;if(this.invalid&&!cancel)this.explain(this.invalid);}else if(JSON.stringify(this.beforeDrag)!==JSON.stringify(this.items)){this.undo.push(this.beforeDrag);if(this.undo.length>30)this.undo.shift();}}
  this.dragging=false;this.beforeDrag=null;this.invalid=null;this.selectButtons();
 }
 private point(event:PointerEvent):Point{const rect=this.canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)/this.transform.scale+this.transform.x,y:(event.clientY-rect.top)/this.transform.scale+this.transform.y};}
 private clientPoint(event:PointerEvent):Point|null{return document.elementFromPoint(event.clientX,event.clientY)===this.canvas?this.point(event):null;}
 private paint=()=>{if(!this.active)return;const parcel=this.parcel(),view=this.view();if(!parcel||!view){this.close();return;}const bounds=gardenBounds(parcel);this.viewport.style.bottom=`${Math.max(180,innerHeight-this.root.getBoundingClientRect().top+8)}px`;const w=this.viewport.clientWidth,h=this.viewport.clientHeight,scale=Math.max(.1,Math.min((w-24)/bounds.w,(h-24)/bounds.h))*this.zoom;const cw=Math.max(w,bounds.w*scale+24),ch=Math.max(h,bounds.h*scale+24),dpr=devicePixelRatio||1;
 this.canvas.style.width=`${cw}px`;this.canvas.style.height=`${ch}px`;if(this.canvas.width!==Math.round(cw*dpr)||this.canvas.height!==Math.round(ch*dpr)){this.canvas.width=Math.round(cw*dpr);this.canvas.height=Math.round(ch*dpr);}this.transform={scale,x:bounds.x-(cw/scale-bounds.w)/2,y:bounds.y-(ch/scale-bounds.h)/2};const ctx=this.canvas.getContext('2d')!;ctx.setTransform(dpr*scale,0,0,dpr*scale,-this.transform.x*dpr*scale,-this.transform.y*dpr*scale);this.canvas.dataset.worldScale=String(scale);this.canvas.dataset.worldX=String(this.transform.x);this.canvas.dataset.worldY=String(this.transform.y);ctx.imageSmoothingEnabled=false;drawWorld(ctx,this.preview(occupiedParcels(view)),[],0,null,true);this.draw(ctx);this.frame=requestAnimationFrame(this.paint);};
 private startCatalogueDrag(event:PointerEvent,button:HTMLButtonElement,kind:GardenItem['kind']){
  if(!this.active||this.saving||event.button!==0||this.catalogueDrag)return;this.suppressClick=false;this.catalogueDrag={pointer:event.pointerId,button,kind,start:{x:event.clientX,y:event.clientY},moved:false};button.setPointerCapture(event.pointerId);
 }
 private moveCatalogueDrag(event:PointerEvent){
  const drag=this.catalogueDrag;if(!drag||event.pointerId!==drag.pointer)return;
  if(!drag.moved&&Math.hypot(event.clientX-drag.start.x,event.clientY-drag.start.y)<6)return;drag.moved=true;event.preventDefault();this.pending=null;this.selected=null;this.selectButtons();
  const point=this.clientPoint(event);this.ghost=point?this.candidate(drag.kind,point):null;const issue=this.ghost?this.placement(this.ghost):'bounds';this.root.dataset.preview=issue?'invalid':'valid';this.explain(issue);
  this.floating.hidden=!!point;this.floating.src=sprite(drag.kind)?.src??`sprites/${drag.kind}.png`;this.floating.style.left=`${event.clientX}px`;this.floating.style.top=`${event.clientY}px`;
 }
 private finishCatalogueDrag(event:PointerEvent,cancel=false){
  const drag=this.catalogueDrag;if(!drag||event.pointerId!==drag.pointer)return;
  if(drag.moved){this.suppressClick=!cancel;event.preventDefault();if(!cancel){const point=this.clientPoint(event),item=point?this.candidate(drag.kind,point):null;if(item)this.add(item);else this.explain('bounds');}}
  if(drag.button.hasPointerCapture(drag.pointer))drag.button.releasePointerCapture(drag.pointer);this.catalogueDrag=null;this.floating.hidden=true;this.ghost=null;delete this.root.dataset.preview;this.selectButtons();
 }
 private cancelGestures(){this.pointerUp(true);const drag=this.catalogueDrag;if(drag?.button.hasPointerCapture(drag.pointer))drag.button.releasePointerCapture(drag.pointer);this.catalogueDrag=null;this.ghost=null;this.floating.hidden=true;delete this.root.dataset.preview;}
 draw(ctx:CanvasRenderingContext2D){
  if(!this.active)return;const parcel=this.parcel();if(!parcel)return;const bounds=gardenBounds(parcel),house=gardenHouseFootprint(parcel),door=gardenDoorway(parcel);
  ctx.save();ctx.beginPath();ctx.rect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.clip();for(const rect of [house,door]){ctx.beginPath();ctx.rect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip('evenodd');}ctx.fillStyle='#e8f5c918';ctx.fillRect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.clip();for(const rect of [house,door]){ctx.beginPath();ctx.rect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip('evenodd');}ctx.strokeStyle='#e7f2c850';ctx.lineWidth=.5;ctx.beginPath();for(let x=bounds.x+((gardenOrigin(parcel).x-bounds.x)%4+4)%4;x<=bounds.x+bounds.w;x+=4){ctx.moveTo(x,bounds.y);ctx.lineTo(x,bounds.y+bounds.h);}for(let y=bounds.y+((gardenOrigin(parcel).y-bounds.y)%4+4)%4;y<=bounds.y+bounds.h;y+=4){ctx.moveTo(bounds.x,y);ctx.lineTo(bounds.x+bounds.w,y);}ctx.stroke();ctx.restore();ctx.save();ctx.strokeStyle='#a14d39';for(const rect of [house,door])ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);ctx.restore();
  ctx.save();ctx.strokeStyle='#fff8dc';ctx.lineWidth=1;ctx.setLineDash([4,3]);ctx.strokeRect(bounds.x+.5,bounds.y+.5,bounds.w-1,bounds.h-1);ctx.setLineDash([]);
  for(const item of this.items)if(item.id===this.selected){const rect=gardenItemRect(parcel,item);ctx.strokeStyle=this.dragging&&this.invalid?'#c75445':'#fff8dc';ctx.lineWidth=1.5;ctx.strokeRect(rect.x-1,rect.y-1,rect.w+2,rect.h+2);}
  if(this.ghost){const rect=gardenItemRect(parcel,this.ghost),asset=sprite(this.ghost.kind),valid=!this.placement(this.ghost)&&this.items.length<16;ctx.globalAlpha=.7;if(asset)ctx.drawImage(asset,rect.x,rect.y,32,32);ctx.globalAlpha=1;ctx.fillStyle=valid?'#5b9d5730':'#d254493b';ctx.fillRect(rect.x,rect.y,32,32);ctx.strokeStyle=valid?'#e7f9ca':'#e06451';ctx.lineWidth=2;ctx.strokeRect(rect.x,rect.y,32,32);}
  ctx.restore();
 }
 private async commit(){const view=this.view();if(!view||this.saving||this.dragging||this.catalogueDrag)return;this.saving=true;this.selectButtons();try{await this.save({...view.ownHouse,garden:gardenSchema.parse(this.items)});this.saving=false;this.close();}catch(error){this.feedback.textContent=errorMessage(error);}finally{this.saving=false;this.selectButtons();}}
 dispose(){cancelAnimationFrame(this.frame);this.viewport.remove();this.cancelGestures();this.root.remove();this.floating.remove();}
}

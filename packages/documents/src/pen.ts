import type { InkSample } from './model';
import { viewToPage,type PageRotation } from './editing';
export interface PointerSample {pointerId:number;pointerType:string;clientX:number;clientY:number;pressure:number;tiltX?:number;tiltY?:number;timeStamp:number;buttons?:number}
/** Real samples only, with a safe fallback on older Safari and the final dispatched point. */
export function pointerSamples<T extends PointerSample>(event:T&{getCoalescedEvents?:()=>T[]}):T[] {
 let samples:T[]=[];try{samples=event.getCoalescedEvents?.()??[];}catch{/* Some WebViews expose the API without supporting it. */}
 samples=samples.filter(sample=>sample.pointerId===event.pointerId&&sample.pointerType===event.pointerType);
 const last=samples.at(-1);
 if(!last||last.clientX!==event.clientX||last.clientY!==event.clientY||last.pressure!==event.pressure||last.timeStamp!==event.timeStamp)samples.push(event);
 return samples;
}
/** Contacts present during a pen stroke stay quarantined until lifted, including after pen-up. */
export class PencilTouchGuard {
 private contacts=new Set<number>();private ignored=new Set<number>();private penActive=false;private lastPenUp=-Infinity;
 touchDown(event:Pick<PointerSample,'pointerId'|'timeStamp'>&{width?:number;height?:number},pencilMode:boolean):boolean {
  this.contacts.add(event.pointerId);
  if(this.penActive||event.timeStamp-this.lastPenUp<250||(pencilMode&&Math.max(event.width??0,event.height??0)>=40))this.ignored.add(event.pointerId);
  return !this.ignored.has(event.pointerId);
 }
 touchEnd(id:number):void{this.contacts.delete(id);this.ignored.delete(id);}
 ignores(id:number):boolean{return this.ignored.has(id);}
 penDown():void{this.penActive=true;for(const id of this.contacts)this.ignored.add(id);}
 penUp(time:number):void{if(this.penActive)this.lastPenUp=time;this.penActive=false;}
 reset():void{this.contacts.clear();this.ignored.clear();this.penActive=false;this.lastPenUp=-Infinity;}
}
/** No DOM or world state. A second finger/palm cannot take ownership of an active stroke. */
export class PenInput {
 private active:{id:number;kind:string}|null=null;
 fingerDrawing=false;
 // A pointer-down starts immediately, even with zero pressure/buttons (light Pencil contact).
 begin(e:PointerSample):boolean {if(this.active || (e.pointerType==='touch'&&!this.fingerDrawing))return false;this.active={id:e.pointerId,kind:e.pointerType};return true;}
 accepts(e:PointerSample):boolean{return !!this.active&&this.active.id===e.pointerId&&this.active.kind===e.pointerType;}
 finish(id:number):boolean{if(this.active?.id!==id)return false;this.active=null;return true;}
 cancel():void{this.active=null;}
 get drawing():boolean{return this.active!==null;}
 get activeKind():string|null{return this.active?.kind??null;}
 point(e:PointerSample,rect:{left:number;top:number;width:number;height:number},width=768,height=1024,rotation:PageRotation=0):InkSample {
  const p=viewToPage(e.clientX-rect.left,e.clientY-rect.top,rect.width,rect.height,rotation);
  return {x:p.x*width/768,y:p.y*height/1024,pressure:e.pointerType==='pen'&&e.pressure>0?Math.min(1,e.pressure):.5,tiltX:e.tiltX??0,tiltY:e.tiltY??0,time:Math.max(0,e.timeStamp)};
 }
}

import type { InkSample } from './model';
import { viewToPage,type PageRotation } from './editing';
export interface PointerSample {pointerId:number;pointerType:string;clientX:number;clientY:number;pressure:number;tiltX?:number;tiltY?:number;timeStamp:number;buttons?:number}
/** No DOM or world state. A second finger/palm cannot take ownership of an active stroke. */
export class PenInput {
 private active:{id:number;kind:string}|null=null;
 fingerDrawing=false;
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

import type { InkObject, InkPage, InkSample } from '../../../packages/documents/src/model';
import { hitsInk } from '../../../packages/documents/src/model';
import { eraseInk,moveInk,selectedByLasso,type PageRotation,type Point } from '../../../packages/documents/src/editing';
import { PenInput } from '../../../packages/documents/src/pen';
import { drawInk,drawPage } from '../../../packages/documents/src/render';
import { msg,setDisplayAttribute } from '../i18n';

export type InkTool=InkObject['tool']|'erase'|'partial-erase'|'select';
interface EditorCallbacks {page:()=>InkPage|null;before:()=>void;commit:()=>void;rollback:()=>void;canEdit?:(ink:InkObject)=>boolean;view?:(zoom:number)=>void}
/** Local ink never waits for storage or the network. The static page is a separate layer. */
export class InkCanvasEditor {
 readonly root=document.createElement('div');
 readonly paper=document.createElement('div');
 readonly canvas=document.createElement('canvas');
 readonly preview=document.createElement('canvas');
 private surface=document.createElement('div');
 private pen=new PenInput();
 private stroke:InkObject|null=null;
 private editing=false;
 private lasso:Point[]=[];
 private selection=new Set<string>();
 private moveStart:InkSample|null=null;
 private moving:InkObject[]=[];
 private clipboard:InkObject[]=[];
 private pointers=new Map<number,Point>();
 private touchBase:{distance:number;zoom:number;center:Point;left:number;top:number}|null=null;
 private pageId='';
 private lastPreview=0;
 private background:HTMLCanvasElement|null=null;
 private backingScale=1;
 private hidden=()=>{if(document.hidden)this.cancel();};
 private rotated=()=>this.cancel();
 tool:InkTool='pen';color='#24402f';width=3;zoom=1;rotation:PageRotation=0;
 constructor(private callbacks:EditorCallbacks){
  this.root.className='sv-notebook-scroll';this.surface.className='sv-notebook-surface';this.paper.className='sv-notebook-paper';
  this.canvas.width=this.preview.width=768;this.canvas.height=this.preview.height=1024;this.preview.className='sv-ink-input';setDisplayAttribute(this.preview,'aria-label',msg('Página para escribir'));
  this.paper.append(this.canvas,this.preview);this.surface.append(this.paper);this.root.append(this.surface);this.layout();
  this.preview.addEventListener('pointerdown',e=>this.down(e));this.preview.addEventListener('pointermove',e=>this.move(e));this.preview.addEventListener('pointerup',e=>this.up(e));
  this.preview.addEventListener('pointercancel',e=>{this.pointers.delete(e.pointerId);if(this.pen.accepts(e))this.cancel();this.touchBase=null;});
  this.preview.addEventListener('lostpointercapture',e=>{if(this.pen.accepts(e))this.cancel();this.pointers.delete(e.pointerId);});
  document.addEventListener('visibilitychange',this.hidden);
  window.addEventListener('orientationchange',this.rotated);
 }
 get fingerDrawing(){return this.pen.fingerDrawing;}
 get busy(){return this.pen.drawing||this.editing;}
 set fingerDrawing(value:boolean){this.cancel();this.pen.fingerDrawing=value;}
 private point(e:PointerEvent):InkSample{return this.pen.point(e,this.preview.getBoundingClientRect(),768,1024,this.rotation);}
 private allowed(ink:InkObject):boolean{return this.callbacks.canEdit?.(ink)??true;}
 setZoom(value:number,anchor?:Point):void {
  const old=this.zoom;this.zoom=Math.max(.25,Math.min(4,value));const rect=this.root.getBoundingClientRect();const x=anchor?anchor.x-rect.left:rect.width/2,y=anchor?anchor.y-rect.top:rect.height/2;
  const left=(this.root.scrollLeft+x)*this.zoom/old-x,top=(this.root.scrollTop+y)*this.zoom/old-y;this.layout();this.root.scrollLeft=left;this.root.scrollTop=top;this.paint();this.callbacks.view?.(this.zoom);
 }
 fit():void{const style=getComputedStyle(this.root),padding=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);this.setZoom(Math.min(1,(this.root.clientWidth-padding)/(this.rotation===90||this.rotation===270?1024:768)));this.root.scrollLeft=0;this.root.scrollTop=0;}
 rotate():void{this.cancel();this.rotation=((this.rotation+90)%360) as PageRotation;this.layout();this.paint();}
 private layout():void {
  const landscape=this.rotation===90||this.rotation===270,w=768*this.zoom,h=1024*this.zoom;
  this.surface.style.width=`${landscape?h:w}px`;this.surface.style.height=`${landscape?w:h}px`;
  this.paper.style.width=`${w}px`;this.paper.style.height=`${h}px`;
  this.paper.style.transform=this.rotation===90?`translate(${h}px,0) rotate(90deg)`:this.rotation===180?`translate(${w}px,${h}px) rotate(180deg)`:this.rotation===270?`translate(0,${w}px) rotate(270deg)`:'none';
  const backingScale=Math.max(1,Math.min(2,(window.devicePixelRatio||1)*this.zoom));
  if(backingScale!==this.backingScale){this.backingScale=backingScale;for(const canvas of [this.canvas,this.preview]){canvas.width=Math.round(768*backingScale);canvas.height=Math.round(1024*backingScale);canvas.getContext('2d')!.setTransform(canvas.width/768,0,0,canvas.height/1024,0,0);}}
 }
 setBackground(background:HTMLCanvasElement|null):void{this.background=background;this.paint();}
 paint():void {
  const page=this.callbacks.page();if(!page)return;
  if(this.pageId!==page.id){this.selection.clear();this.pageId=page.id;}
  const ctx=this.canvas.getContext('2d')!;drawPage(ctx,page);
  if(this.background){ctx.drawImage(this.background,0,0);for(const ink of page.ink)drawInk(ctx,ink);ctx.fillStyle='#24402f';ctx.font='18px sans-serif';page.text.split('\n').forEach((line,i)=>ctx.fillText(line,32,48+i*26,704));}
  this.paintOverlay();
 }
 private paintOverlay():void {
  const ctx=this.preview.getContext('2d')!;ctx.clearRect(0,0,768,1024);
  if(this.stroke)drawInk(ctx,this.stroke);
  ctx.save();ctx.strokeStyle='#467ba1';ctx.lineWidth=1.5/this.zoom;ctx.setLineDash([6/this.zoom,4/this.zoom]);
  for(const ink of this.callbacks.page()?.ink??[])if(this.selection.has(ink.id)){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of ink.points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}ctx.strokeRect(minX-5,minY-5,maxX-minX+10,maxY-minY+10);}
  if(this.lasso.length){ctx.beginPath();ctx.moveTo(this.lasso[0].x,this.lasso[0].y);for(const p of this.lasso.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.stroke();}ctx.restore();
 }
 private down(e:PointerEvent):void {
  if(e.pointerType==='mouse'&&e.button!==0)return;
  const page=this.callbacks.page();if(!page)return;
  if(e.pointerType==='touch'){
   // A palm can neither steal the pen nor pan the page under it.
   if(this.pen.activeKind==='pen')return;
   this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.preview.setPointerCapture(e.pointerId);
   if(!this.pen.fingerDrawing||this.pointers.size>1){if(this.pen.activeKind==='touch')this.cancel(false);this.startTouch();e.preventDefault();return;}
  }
  if(!this.pen.begin(e))return;e.preventDefault();this.preview.setPointerCapture(e.pointerId);
  const point=this.point(e);this.stroke=null;this.moveStart=null;this.moving=[];
  if(this.tool==='select'){
   if(page.ink.some(i=>this.selection.has(i.id)&&this.allowed(i)&&hitsInk(i,point.x,point.y,8/this.zoom))){this.beginEdit();this.moveStart=point;this.moving=page.ink.filter(i=>this.selection.has(i.id)&&this.allowed(i)).map(i=>structuredClone(i));}
   else{this.selection.clear();this.lasso=[point];}
  }else{
   this.selection.clear();this.beginEdit();
   if(this.tool==='erase'||this.tool==='partial-erase')this.erase(point);
   else{this.stroke={id:crypto.randomUUID(),tool:this.tool,color:this.color,width:this.tool==='highlight'?Math.max(12,this.width):this.width,points:[point]};this.lastPreview=0;this.paintOverlay();}
  }
 }
 private beginEdit(){this.callbacks.before();this.editing=true;}
 private startTouch():void {
  const points=[...this.pointers.values()],center=points.length>1?{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}:points[0];
  this.touchBase=center?{distance:points.length>1?Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y):0,zoom:this.zoom,center,left:this.root.scrollLeft,top:this.root.scrollTop}:null;
 }
 private move(e:PointerEvent):void {
  if(e.pointerType==='touch'&&this.pointers.has(e.pointerId)){
   this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(this.touchBase&&!this.pen.accepts(e)){
    e.preventDefault();const points=[...this.pointers.values()],base=this.touchBase;
    const center=points.length>1?{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}:points[0];
    if(points.length>1&&base.distance){const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);this.setZoom(base.zoom*distance/base.distance,base.center);}
    const ratio=this.zoom/base.zoom,rect=this.root.getBoundingClientRect();this.root.scrollLeft=(base.left+base.center.x-rect.left)*ratio-(center.x-rect.left);this.root.scrollTop=(base.top+base.center.y-rect.top)*ratio-(center.y-rect.top);return;
   }
  }
  if(!this.pen.accepts(e))return;e.preventDefault();const point=this.point(e),page=this.callbacks.page();if(!page)return;
  if(this.tool==='erase'||this.tool==='partial-erase'){this.erase(point);return;}
  if(this.tool==='select'){
   if(this.moveStart){const delta={x:point.x-this.moveStart.x,y:point.y-this.moveStart.y};const originals=new Map(this.moving.map(i=>[i.id,i]));page.ink=page.ink.map(i=>originals.has(i.id)?moveInk(originals.get(i.id)!,delta.x,delta.y):i);this.paint();}
   else{this.lasso.push(point);this.paintOverlay();}return;
  }
  if(!this.stroke)return;const events=e.getCoalescedEvents?.();for(const sample of events?.length?events:[e])this.stroke.points.push(this.point(sample));
  if(this.stroke.tool==='pen'){
   const points=this.stroke.points.slice(Math.max(0,this.lastPreview-1));drawInk(this.preview.getContext('2d')!,{...this.stroke,points});this.lastPreview=this.stroke.points.length;
  }else this.paintOverlay();
 }
 private erase(point:Point):void {
  const page=this.callbacks.page();if(!page)return;
  page.ink=page.ink.flatMap(ink=>!this.allowed(ink)?[ink]:this.tool==='partial-erase'?eraseInk(ink,point,this.width+4):hitsInk(ink,point.x,point.y,this.width+5)?[]:[ink]);this.paint();
 }
 private up(e:PointerEvent):void {
  this.pointers.delete(e.pointerId);this.startTouch();
  if(!this.pen.finish(e.pointerId))return;
  if(this.stroke){this.callbacks.page()?.ink.push(this.stroke);this.stroke=null;}
  if(this.tool==='select'&&!this.moveStart){for(const ink of this.callbacks.page()?.ink??[])if(this.allowed(ink)&&selectedByLasso(ink,this.lasso))this.selection.add(ink.id);}
  this.lasso=[];this.moveStart=null;this.moving=[];
  if(this.editing){this.editing=false;this.callbacks.commit();}this.paint();
 }
 copySelection():void{this.clipboard=(this.callbacks.page()?.ink??[]).filter(i=>this.selection.has(i.id)).map(i=>structuredClone(i));}
 paste():void{const page=this.callbacks.page();if(!page||!this.clipboard.length)return;this.callbacks.before();const copies=this.clipboard.map(i=>({...moveInk(i,20,20),id:crypto.randomUUID()}));page.ink.push(...copies);this.selection=new Set(copies.map(i=>i.id));this.callbacks.commit();this.paint();}
 deleteSelection():void{const page=this.callbacks.page();if(!page||!this.selection.size)return;this.callbacks.before();page.ink=page.ink.filter(i=>!this.selection.has(i.id)||!this.allowed(i));this.selection.clear();this.callbacks.commit();this.paint();}
 cancel(clearTouches=true):void {
  this.pen.cancel();this.stroke=null;this.lasso=[];this.moveStart=null;this.moving=[];if(clearTouches){this.pointers.clear();this.touchBase=null;}
  if(this.editing){this.editing=false;this.callbacks.rollback();}this.paint();
 }
 dispose():void{this.cancel();document.removeEventListener('visibilitychange',this.hidden);window.removeEventListener('orientationchange',this.rotated);this.root.remove();}
}

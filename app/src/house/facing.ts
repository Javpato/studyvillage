import {fill,shade} from '../ui/art';
import type{Furniture}from'../../../packages/core/src/protocol/types';
import type{Rect}from'../world/model';
/** Upright directional artwork. The footprint changes direction, never the camera. */
export function paintFurnitureFacing(ctx:CanvasRenderingContext2D,item:Furniture,rect:Rect,wood:string):boolean{
 if(!item.rotation||item.kind==='plant')return false;
 const{x,y,w,h}=rect,side=item.rotation===90||item.rotation===270,right=item.rotation===90;
 const dark=shade(wood,-40),mid=shade(wood,-15),light=shade(wood,25);
 if(item.kind==='desk'||item.kind==='table'){
  const top=side?h-20:19;
  fill(ctx,dark,x+4,y+top,w-8,h-top);fill(ctx,wood,x,y+8,w,top-5);fill(ctx,light,x,y+8,w,3);fill(ctx,mid,x,y+top,w,5);
  // Legs remain vertical for every facing.
  fill(ctx,dark,x+5,y+top+4,5,h-top-4);fill(ctx,dark,x+w-10,y+top+4,5,h-top-4);
  fill(ctx,light,x+5,y+top+4,2,h-top-4);
  if(item.kind==='desk'){
   if(side){const mx=right?x+w-12:x+4;fill(ctx,'#263f39',mx,y+1,8,18);fill(ctx,right?'#517d71':'#9bc8c0',mx+(right?0:5),y+3,3,12);fill(ctx,dark,mx+2,y+18,4,8);}
   else{fill(ctx,'#29423a',x+w/2-14,y,28,15);fill(ctx,'#3d5950',x+w/2-11,y+3,22,9);fill(ctx,'#1c302a',x+w/2-5,y+6,10,2);fill(ctx,dark,x+w/2-2,y+15,4,7);}
  }else{fill(ctx,'#416f8c',right?x+w-15:x+6,y+10,9,12);fill(ctx,'#ece0bd',right?x+w-14:x+7,y+13,7,2);}
 }else if(item.kind==='bookshelf'||item.kind==='cabinet'){
  fill(ctx,dark,x,y,w,h);fill(ctx,wood,x+3,y+3,w-6,h-7);fill(ctx,light,x+3,y+3,w-6,3);fill(ctx,mid,x+3,y+h-7,w-6,3);
  if(side){
   const edge=Math.min(12,w/3),fx=right?x+w-edge:x;fill(ctx,mid,fx,y+4,edge,h-8);fill(ctx,light,right?fx:fx+edge-2,y+4,2,h-8);
   if(item.kind==='bookshelf')for(let row=12;row<h-6;row+=13){fill(ctx,'#345c4a',fx+2,y+row,edge-4,8);fill(ctx,'#d3b071',fx+4,y+row,2,8);}
   else fill(ctx,'#d7b66b',right?fx+3:fx+edge-5,y+h/2,2,5);
   fill(ctx,shade(wood,-8),right?x+7:x+w-9,y+7,2,h-17);
  }else{
   // Rear panels and diagonal braces are deliberately different from doors/books.
   for(let px=8;px<w-6;px+=10)fill(ctx,mid,x+px,y+6,1,h-15);
   ctx.strokeStyle=dark;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+5,y+7);ctx.lineTo(x+w-5,y+h-9);ctx.moveTo(x+w-5,y+7);ctx.lineTo(x+5,y+h-9);ctx.stroke();
  }
 }else{
  // Boards and picture frames have a wooden rear and a thin upright edge view.
  fill(ctx,dark,x,y,w,h);fill(ctx,side?mid:wood,x+2,y+2,w-4,h-4);
  if(side){fill(ctx,light,right?x+w-5:x+2,y+2,3,h-4);fill(ctx,shade(wood,-28),right?x+2:x+w-8,y+4,6,h-8);}
  else{fill(ctx,mid,x+5,y+5,w-10,h-10);fill(ctx,'#b8a17c',x+w/2-4,y+4,8,3);for(const dx of[4,w-6])for(const dy of[4,h-6])fill(ctx,dark,x+dx,y+dy,2,2);}
 }
 return true;
}

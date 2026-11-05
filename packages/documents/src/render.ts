import type { InkObject, InkPage } from './model';
export function drawInk(ctx:CanvasRenderingContext2D,ink:InkObject):void {
 const p=ink.points;if(!p.length)return;ctx.save();ctx.strokeStyle=ink.color;ctx.fillStyle=ink.color;ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=ink.tool==='highlight'?.28:1;ctx.lineWidth=ink.width;
 // One path for highlighter: overlapping samples do not darken a single stroke.
 if(ink.tool==='rectangle'){ctx.strokeRect(p[0].x,p[0].y,p[p.length-1].x-p[0].x,p[p.length-1].y-p[0].y);}
 else if(p.length===1){ctx.beginPath();ctx.arc(p[0].x,p[0].y,ink.width/2,0,Math.PI*2);ctx.fill();}
 else if(ink.tool==='pen'){
  // Batch adjacent pressure bands into paths. Stored pressure/coordinates remain exact;
  // only paint width is quantized to an eighth of a document pixel.
  let width=-1;for(let i=1;i<p.length;i++){
   const next=Math.max(.125,Math.round(ink.width*(.4+.6*(p[i-1].pressure+p[i].pressure))*8)/8);
   if(next!==width){if(width>=0)ctx.stroke();width=next;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(p[i-1].x,p[i-1].y);}
   ctx.lineTo(p[i].x,p[i].y);
  }if(width>=0)ctx.stroke();
 }
 else {ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(const point of ink.tool==='line'?[p[p.length-1]]:p.slice(1))ctx.lineTo(point.x,point.y);ctx.stroke();}ctx.restore();
}
export function drawPage(ctx:CanvasRenderingContext2D,page:InkPage):void {
 ctx.clearRect(0,0,768,1024);ctx.fillStyle='#fffdf5';ctx.fillRect(0,0,768,1024);ctx.strokeStyle='#dfdfd2';ctx.lineWidth=.6;
 if(page.background!=='blank'){ctx.beginPath();for(let y=32;y<1024;y+=32){ctx.moveTo(0,y);ctx.lineTo(768,y);}if(page.background==='grid')for(let x=32;x<768;x+=32){ctx.moveTo(x,0);ctx.lineTo(x,1024);}ctx.stroke();}
 for(const ink of page.ink)drawInk(ctx,ink);
 ctx.fillStyle='#24402f';ctx.font='18px sans-serif';page.text.split('\n').forEach((line,i)=>ctx.fillText(line,32,48+i*26,704));
}

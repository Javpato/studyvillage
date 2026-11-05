import type { InkObject, InkSample } from './model';
export interface Point {x:number;y:number}
export type PageRotation=0|90|180|270;
/** Coordinates remain in document units; only the viewport rotates/scales. */
export function viewToPage(x:number,y:number,width:number,height:number,rotation:PageRotation=0):Point {
 const u=x/width,v=y/height;
 return rotation===90?{x:v*768,y:(1-u)*1024}:rotation===180?{x:(1-u)*768,y:(1-v)*1024}:rotation===270?{x:(1-v)*768,y:u*1024}:{x:u*768,y:v*1024};
}
export function insidePolygon(point:Point,polygon:Point[]):boolean {
 let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }return inside;
}
export function inkPath(ink:InkObject):InkSample[] {
 const p=ink.points;if(ink.tool==='line')return [p[0],p[p.length-1]];
 if(ink.tool==='rectangle'){const a=p[0],b=p[p.length-1];return [a,{...a,x:b.x},{...b},{...b,x:a.x},a];}
 return p;
}
export function selectedByLasso(ink:InkObject,polygon:Point[]):boolean {
 if(polygon.length<3)return false;
 const path=inkPath(ink);if(path.some(p=>insidePolygon(p,polygon)))return true;
 const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const intersects=(a:Point,b:Point,c:Point,d:Point)=>{
  if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y))return false;
  return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
 };
 return path.some((point,i)=>i>0&&polygon.some((edge,j)=>intersects(path[i-1],point,edge,polygon[(j+1)%polygon.length])));
}
export function moveInk(ink:InkObject,dx:number,dy:number):InkObject {
 return {...ink,points:ink.points.map(p=>({...p,x:Math.max(-10000,Math.min(10000,p.x+dx)),y:Math.max(-10000,Math.min(10000,p.y+dy))}))};
}
function interpolate(a:InkSample,b:InkSample,t:number):InkSample {
 return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,pressure:a.pressure+(b.pressure-a.pressure)*t,tiltX:a.tiltX+(b.tiltX-a.tiltX)*t,tiltY:a.tiltY+(b.tiltY-a.tiltY)*t,time:a.time+(b.time-a.time)*t};
}
/** Exact segment/circle intersections, preserving pressure/tilt/time at the split. */
export function eraseInk(ink:InkObject,center:Point,radius:number,makeId:()=>string=()=>crypto.randomUUID()):InkObject[] {
 const points=inkPath(ink),r=radius+ink.width/2,r2=r*r;
 if(points.length===1)return Math.hypot(points[0].x-center.x,points[0].y-center.y)<=r?[]:[ink];
 const runs:InkSample[][]=[];let run:InkSample[]=[];let changed=false;
 const flush=()=>{if(run.length)runs.push(run);run=[];};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,ox=a.x-center.x,oy=a.y-center.y,A=dx*dx+dy*dy;
  const times=[0,1];if(A>0){const B=2*(ox*dx+oy*dy),C=ox*ox+oy*oy-r2,D=B*B-4*A*C;if(D>=0){const q=Math.sqrt(D);for(const t of [(-B-q)/(2*A),(-B+q)/(2*A)])if(t>0&&t<1)times.push(t);}}
  times.sort((a,b)=>a-b);
  for(let j=1;j<times.length;j++){
   const start=times[j-1],end=times[j],middle=interpolate(a,b,(start+end)/2);
   if((middle.x-center.x)**2+(middle.y-center.y)**2<=r2){changed=true;flush();continue;}
   const first=interpolate(a,b,start),last=interpolate(a,b,end);if(!run.length)run.push(first);run.push(last);
  }
 }flush();
 if(!changed)return [ink];
 // New IDs make the split immutable for collaboration; undo can restore the original ID.
 return runs.map(points=>({...ink,id:makeId(),tool:ink.tool==='highlight'?'highlight':'pen',points}));
}

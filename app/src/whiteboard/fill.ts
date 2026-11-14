import type {BoardPoint,BoardStroke} from '../../../packages/core/src/protocol/types';
import {strokesBounds} from '../../../packages/core/src/whiteboard/model';
import {pathStroke,textBox} from './draw';
export async function fillDrawing(strokes:BoardStroke[],at:BoardPoint):Promise<BoardPoint[][]|null>{
 const bounds=strokesBounds(strokes,textBox);if(!bounds)return null;
 const x=Math.floor(bounds.x)-2,y=Math.floor(bounds.y)-2,width=Math.ceil(bounds.w)+5,height=Math.ceil(bounds.h)+5;
 // Rendering is independent of camera zoom. Fail explicitly if the device cannot allocate the canvas.
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('No se pudo rellenar el dibujo.');ctx.translate(-x,-y);for(const stroke of strokes)pathStroke(ctx,stroke);
 const pixels=ctx.getImageData(0,0,width,height).data,worker=new Worker(new URL('./fill-worker.ts',import.meta.url),{type:'module'});
 try{const rects=await new Promise<number[][]|null>((resolve,reject)=>{worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.rects);worker.onerror=()=>reject(Error('No se pudo rellenar el dibujo.'));worker.postMessage({pixels,width,height,x:Math.floor(at.x-x),y:Math.floor(at.y-y)},[pixels.buffer]);});if(!rects)return null;
 const parts:BoardPoint[][]=[];let points:BoardPoint[]=[];for(const [rx,ry,w,h]of rects){points.push({x:x+rx,y:y+ry},{x:x+rx+w,y:y+ry},{x:x+rx+w,y:y+ry+h},{x:x+rx,y:y+ry+h});if(points.length===512){parts.push(points);points=[];}}if(points.length)parts.push(points);return parts;
 }finally{worker.terminate();canvas.width=canvas.height=0;}
}

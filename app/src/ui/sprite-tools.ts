/** Shared pixel operations for character and animal ateliers; no persistence in drawing code. */
export const SPRITE_COLORS=['#f9e8c7','#d7a77b','#976345','#563e36','#2d3d37','#4a7354','#9ab173','#9fcad0','#426680','#b9757c','#e3ad74','#ffffff'];
export function pixelLine(ctx:CanvasRenderingContext2D,from:{x:number;y:number},to:{x:number;y:number},offset:{x:number;y:number},color:string,erase:boolean){const steps=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y),1);ctx.fillStyle=color;for(let k=0;k<=steps;k++){const x=offset.x+Math.round(from.x+(to.x-from.x)*k/steps),y=offset.y+Math.round(from.y+(to.y-from.y)*k/steps);if(erase)ctx.clearRect(x,y,1,1);else ctx.fillRect(x,y,1,1);}}
export function pixelGrid(ctx:CanvasRenderingContext2D,size=384){ctx.strokeStyle='#7f8a771c';ctx.lineWidth=1;for(let n=0;n<=size;n+=size/64){ctx.beginPath();ctx.moveTo(n+.5,0);ctx.lineTo(n+.5,size);ctx.moveTo(0,n+.5);ctx.lineTo(size,n+.5);ctx.stroke();}}
export async function readSpritePng(file:File,columns:number){if(file.size>512*1024)throw Error('Elige un PNG de hasta 512 KB.');const url=URL.createObjectURL(file),image=new Image();try{image.src=url;await image.decode();}finally{URL.revokeObjectURL(url);}if(!((image.width===64&&image.height===64)||(image.width===columns*64&&image.height===256)))throw Error('Dimensiones del sprite no válidas.');return image;}
export function copySpriteFrame(sheet:HTMLCanvasElement,frame:number,columns:number){const c=sheet.getContext('2d')!,image=c.getImageData(frame%columns*64,Math.floor(frame/columns)*64,64,64);for(let y=0;y<4;y++)for(let x=0;x<columns;x++)c.putImageData(image,x*64,y*64);}

/** Four-connected exact RGBA fill; transparent RGB values do not affect matching. */
export function floodPixels(data:Uint8ClampedArray,width:number,height:number,x:number,y:number,color:readonly number[]):boolean {
 const start=(y*width+x)*4,target=Array.from(data.slice(start,start+4));
 const matches=(i:number)=>data[i+3]===target[3]&&(!target[3]||data[i]===target[0]&&data[i+1]===target[1]&&data[i+2]===target[2]);
 if(target.every((n,i)=>n===color[i]))return false;
 const seen=new Uint8Array(width*height),stack=[y*width+x];seen[y*width+x]=1;let changed=false;
 while(stack.length){const n=stack.pop()!,i=n*4;if(!matches(i))continue;data.set(color,i);changed=true;const px=n%width,py=Math.floor(n/width);
 for(const next of [px>0?n-1:-1,px+1<width?n+1:-1,py>0?n-width:-1,py+1<height?n+width:-1])if(next>=0&&!seen[next]){seen[next]=1;stack.push(next);}}
 return changed;
}
export function fillSpriteFrame(sheet:HTMLCanvasElement,frame:number,columns:number,x:number,y:number,color:string){const c=sheet.getContext('2d')!,ox=frame%columns*64,oy=Math.floor(frame/columns)*64,pixels=c.getImageData(ox,oy,64,64);const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));if(floodPixels(pixels.data,64,64,x,y,[...rgb,255]))c.putImageData(pixels,ox,oy);}
export function addPreviousFrame(sheet:HTMLCanvasElement,frame:number,columns:number){if(frame%columns===0)return;const c=sheet.getContext('2d')!,ox=frame%columns*64,oy=Math.floor(frame/columns)*64;c.save();c.globalCompositeOperation='destination-over';c.drawImage(sheet,ox-64,oy,64,64,ox,oy,64,64);c.restore();}
export function drawPreviousFrame(ctx:CanvasRenderingContext2D,sheet:HTMLCanvasElement,frame:number,columns:number){if(frame%columns===0)return;ctx.save();ctx.globalAlpha=.25;ctx.drawImage(sheet,(frame%columns-1)*64,Math.floor(frame/columns)*64,64,64,0,0,384,384);ctx.restore();}

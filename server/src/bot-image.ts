import { deflateSync } from 'node:zlib';
import type { Drawing } from '../../packages/core/src/minigames/gartic-phone';

/** A bounded raster of the game's selected drawing, for a vision model. No file/URL access. */
export function botDrawingPng(drawing:Drawing):string {
  const w=160,h=100,pixels=Buffer.alloc(w*h*3,255);
  let points=0;
  for(const stroke of drawing.strokes.slice(0,100)) {
    if(!/^#[0-9a-f]{6}$/i.test(stroke.c))continue;
    const rgb=[1,3,5].map(offset=>parseInt(stroke.c.slice(offset,offset+2),16));
    const radius=Math.max(0.5,Math.min(6,stroke.w/8));
    const dot=(x:number,y:number)=>{
      for(let cy=Math.max(0,Math.floor(y-radius));cy<=Math.min(h-1,y+radius);cy++)for(let cx=Math.max(0,Math.floor(x-radius));cx<=Math.min(w-1,x+radius);cx++)if((cx-x)**2+(cy-y)**2<=radius**2)for(let c=0;c<3;c++)pixels[(cy*w+cx)*3+c]=rgb[c];
    };
    let previous:number[]|null=null;
    for(let i=0;i+1<stroke.p.length&&points<4000;i+=2,points++) {
      const x=Math.max(0,Math.min(w-1,stroke.p[i]/4)),y=Math.max(0,Math.min(h-1,stroke.p[i+1]/4));
      if(!Number.isFinite(x+y))continue;
      if(previous){const [px,py]=previous,n=Math.max(1,Math.ceil(Math.hypot(x-px,y-py)*2));for(let j=0;j<=n;j++)dot(px+(x-px)*j/n,py+(y-py)*j/n);}else dot(x,y);
      previous=[x,y];
    }
  }
  const rows=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)pixels.copy(rows,y*(w*3+1)+1,y*w*3,(y+1)*w*3);
  const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
  const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(body.length+8);out.writeUInt32BE(data.length);body.copy(out,4);let crc=0xffffffff;for(const byte of body){crc^=byte;for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;};
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}

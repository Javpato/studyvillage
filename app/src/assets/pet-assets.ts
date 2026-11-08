/** Semantic fallback data; normal artwork remains entirely manifest-controlled. */
export const PET_ART_SPECIES=['cat','dog','parrot','hamster','rabbit'] as const;
export interface PetArt {frameWidth:number;frameHeight:number;animations:Record<string,number[]>;directions:Record<string,number>;fps:number;scale:number;anchor:{x:number;y:number};collisionRadius:number;jumpHeight?:number}
export const FALLBACK_PET_ART:PetArt={frameWidth:32,frameHeight:32,animations:{idle:[0],walk:[1,2],eat:[3],pet:[4],rest:[5],ability:[6],jump:[6],ballIdle:[6],ballWalk:[6]},directions:{down:0,left:1,right:2,up:3},fps:6,scale:1.25,anchor:{x:16,y:27},collisionRadius:9,jumpHeight:32};
export function validPetArt(raw:unknown,width:number,height:number):raw is PetArt{
 const a=raw as PetArt;if(!a||!Number.isInteger(a.frameWidth)||!Number.isInteger(a.frameHeight)||a.frameWidth<1||a.frameHeight<1||width%a.frameWidth||height%a.frameHeight)return false;
 if(a.jumpHeight!==undefined&&(!Number.isFinite(a.jumpHeight)||a.jumpHeight<0||a.jumpHeight>128))return false;
 if(![a.fps,a.scale,a.collisionRadius,a.anchor?.x,a.anchor?.y].every(Number.isFinite)||a.fps<=0||a.scale<=0||a.collisionRadius<=0||!a.animations?.idle?.length)return false;
 return Object.values(a.animations).every(frames=>Array.isArray(frames)&&frames.length>0&&frames.every(n=>Number.isInteger(n)&&n>=0&&n<width/a.frameWidth))&&['up','down','left','right'].every(d=>Number.isInteger(a.directions?.[d])&&a.directions[d]>=0&&a.directions[d]<height/a.frameHeight);
}
export async function fallbackPetImage(id:string):Promise<HTMLImageElement>{
 const sheet=id.endsWith('-sheet'),canvas=document.createElement('canvas');canvas.width=sheet?224:64;canvas.height=sheet?128:64;const c=canvas.getContext('2d')!;
 const index=PET_ART_SPECIES.findIndex(s=>id===`pet-${s}`||id===`pet-${s}-sheet`),color=['#d99761','#a67b54','#75ae72','#c6a478','#d9c7ac'][Math.max(0,index)];
 if(sheet){for(let y=0;y<4;y++)for(let x=0;x<7;x++){c.save();c.translate(x*32,y*32);c.fillStyle='#594c42';c.fillRect(8,17,17,11);c.fillStyle=color;c.fillRect(7,14,18,11);c.fillRect(8,8,15,12);c.fillRect(8,5,5,5);c.fillRect(19,5,4,5);if(y!==3){c.fillStyle='#302a28';const eyes=y===1?[10,16]:y===2?[16,21]:[11,19];for(const eye of eyes)c.fillRect(eye,12,2,2);}if(index===3&&x===6){c.strokeStyle='#79b9cf';c.lineWidth=2;c.beginPath();c.ellipse(16,16,14,14,0,0,Math.PI*2);c.stroke();}c.restore();}}
 else if(id==='pet-bowl'){c.fillStyle='#758d9b';c.fillRect(12,30,40,20);c.fillStyle='#e2b96b';c.fillRect(16,28,32,9);}
 else {c.fillStyle='#655046';c.beginPath();c.moveTo(5,27);c.lineTo(32,5);c.lineTo(59,27);c.fill();c.fillStyle=color;c.fillRect(11,27,42,31);c.fillStyle='#493c38';c.fillRect(24,36,17,22);c.fillStyle='#f8ead1';c.font='bold 12px sans-serif';c.fillText(String(index+1),29,26);}
 const image=new Image();image.src=canvas.toDataURL('image/png');await image.decode();return image;
}

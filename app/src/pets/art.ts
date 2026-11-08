import {sprite} from '../assets/sprite-catalog';
import type {PetEntity} from '../../../packages/core/src/pets/model';
import manifest from '../../public/sprites/manifest.json';
/** Animation metadata is owner-editable alongside PNG paths in the shared manifest. */
export function drawPet(ctx:CanvasRenderingContext2D,pet:PetEntity,now:number,scale=1):void{
 const asset=manifest[`pet-${pet.species}-sheet`],image=sprite(`pet-${pet.species}-sheet`);if(!image)return;
 const animation=pet.state==='petted'?'pet':pet.state==='eating'?'eat':pet.state==='rest'?'rest':pet.state==='ability'?'ability':pet.moving?'walk':'idle';
 const frames=asset.animations[animation]??asset.animations.idle,index=frames[Math.floor(now/1000*asset.fps)%frames.length],row=asset.directions[pet.direction]??0;
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(pet.x,pet.y);ctx.scale(asset.scale*scale,asset.scale*scale);
 ctx.drawImage(image,index*asset.frameWidth,row*asset.frameHeight,asset.frameWidth,asset.frameHeight,-asset.anchor.x,-asset.anchor.y,asset.frameWidth,asset.frameHeight);ctx.restore();
 if(pet.state==='petted'&&pet.reactionUntil>now){ctx.save();ctx.font='16px system-ui';ctx.fillStyle='#d87886';ctx.fillText('♥',pet.x-4,pet.y-35);ctx.restore();}
}
export function petPortrait(pet:{id:string;owner:string;species:PetEntity['species']}):HTMLCanvasElement{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.setAttribute('aria-hidden','true');drawPet(canvas.getContext('2d')!,{...pet,x:32,y:54,scene:'',state:'idle',direction:'down',moving:false,reactionUntil:0},0,1.6);return canvas;}

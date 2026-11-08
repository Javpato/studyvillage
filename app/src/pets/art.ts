import {sprite,spriteDefinition} from '../assets/sprite-catalog';
import type {PetEntity} from '../../../packages/core/src/pets/model';
import type {PetArt} from '../assets/pet-assets';
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function definition(species:PetEntity['species']):PetArt|undefined{return spriteDefinition(`pet-${species}-sheet`) as PetArt|undefined;}
export function petRadius(species:PetEntity['species']):number{return definition(species)?.collisionRadius??9;}
/** Animation metadata is owner-editable alongside PNG paths in the shared manifest. */
export function drawPet(ctx:CanvasRenderingContext2D,pet:PetEntity,now:number,scale=1):void{
 const asset=definition(pet.species),image=sprite(`pet-${pet.species}-sheet`);if(!image||!asset)return;
 const jumping=pet.jumpProgress!==undefined;const animation=pet.ball?(pet.moving?'ballWalk':'ballIdle'):jumping?'jump':pet.state==='petted'?'pet':pet.state==='eating'?'eat':pet.state==='rest'?'rest':pet.state==='ability'?'ability':pet.moving?'walk':'idle';
 const frames=asset.animations[animation]??asset.animations[jumping||pet.ball?'ability':'idle']??asset.animations.idle,index=frames[jumping?Math.min(frames.length-1,Math.floor(pet.jumpProgress!*frames.length)):Math.floor(now/1000*asset.fps)%frames.length],row=asset.directions[pet.direction]??0;
 if(pet.toy){ctx.save();ctx.fillStyle='#d89b49';ctx.strokeStyle='#705133';ctx.beginPath();ctx.arc(pet.toy.x,pet.toy.y,4,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
 ctx.save();ctx.imageSmoothingEnabled=false;if(jumping){ctx.save();ctx.fillStyle='#263d3438';ctx.beginPath();ctx.ellipse(pet.x,pet.y+1,12,3,0,0,Math.PI*2);ctx.fill();ctx.restore();}
 const lift=jumping&&!reducedMotion()?Math.sin(Math.PI*pet.jumpProgress!)*(asset.jumpHeight??32):0;
 ctx.translate(pet.x,pet.y-lift);ctx.scale(asset.scale*scale,asset.scale*scale);
 ctx.drawImage(image,index*asset.frameWidth,row*asset.frameHeight,asset.frameWidth,asset.frameHeight,-asset.anchor.x,-asset.anchor.y,asset.frameWidth,asset.frameHeight);ctx.restore();
 if(pet.state==='petted'&&pet.reactionUntil>Date.now()){ctx.save();ctx.font='16px system-ui';ctx.fillStyle='#d87886';ctx.fillText('♥',pet.x-4,pet.y-35);ctx.restore();}
}
export function petPortrait(pet:{id:string;owner:string;species:PetEntity['species'];ball?:boolean}):HTMLCanvasElement{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.setAttribute('aria-hidden','true');drawPet(canvas.getContext('2d')!,{...pet,x:32,y:54,scene:'',state:'idle',direction:'down',moving:false,reactionUntil:0},0,1.6);return canvas;}

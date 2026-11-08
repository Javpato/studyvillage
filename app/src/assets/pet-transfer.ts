import {z} from 'zod';
import type {AppActions,AppMessage,AppView} from '../../../packages/core/src/protocol/types';
import type {PetAppearance} from '../../../packages/core/src/pets/definitions';
import {cachePetAsset,petAsset,petAssetData} from './pet-custom';
const id=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const packet=z.discriminatedUnion('t',[
 z.strictObject({t:z.literal('request'),id,hash}),
 z.strictObject({t:z.literal('start'),id,hash,size:z.number().int().min(1).max(700000),count:z.number().int().min(1).max(30)}),
 z.strictObject({t:z.literal('chunk'),id,index:z.number().int().min(0).max(29),data:z.string().max(24000)}),
]);
/** Artwork is requested only for an authenticated active pet, never the owner's private collection. */
export class PetArtTransfer {
 private off:()=>void;private pending=new Map<string,{owner:string;hash:string;at:number;size:number;count:number;parts:Map<number,string>}>();private served=new Map<string,number>();private retried=new Map<string,number>();private generation=0;
 constructor(private actions:Pick<AppActions,'sendApp'|'onApp'>,private view:()=>AppView|null,private active:()=>PetAppearance[]){this.off=actions.onApp(m=>void this.receive(m));}
 request(owner:string,appearance:PetAppearance){if(petAsset(appearance))return;const now=Date.now(),key=owner+appearance.hash;for(const [id,p] of this.pending)if(now-p.at>20000)this.pending.delete(id);if(this.pending.size>=12||now-(this.retried.get(key)??0)<15000)return;this.retried.set(key,now);if(this.retried.size>200)this.retried.delete(this.retried.keys().next().value!);const id=crypto.randomUUID();this.pending.set(id,{owner,hash:appearance.hash,at:now,size:0,count:0,parts:new Map()});if(!this.actions.sendApp('pet-art',owner,JSON.stringify({t:'request',id,hash:appearance.hash})))this.pending.delete(id);}
 private async receive(m:AppMessage){const view=this.view();if(m.channel!=='pet-art'||!view||view.network.phase!=='JOINED'||!view.network.members.some(p=>p.connected&&p.identity.fingerprint===m.from))return;let p;try{p=packet.parse(JSON.parse(m.data));}catch{return;}const generation=this.generation;
  if(p.t==='request'){if(!this.active().some(a=>a.hash===p.hash))return;const key=m.from+p.hash,now=Date.now();if(now-(this.served.get(key)??0)<5000)return;this.served.set(key,now);if(this.served.size>100)this.served.delete(this.served.keys().next().value!);const data=petAssetData(p.hash);if(!data)return;const count=Math.ceil(data.length/24000);if(!this.actions.sendApp('pet-art',m.from,JSON.stringify({t:'start',id:p.id,hash:p.hash,size:data.length,count})))return;for(let index=0;index<count;index++){if(generation!==this.generation||!this.actions.sendApp('pet-art',m.from,JSON.stringify({t:'chunk',id:p.id,index,data:data.slice(index*24000,(index+1)*24000)})))return;await new Promise(r=>setTimeout(r,20));}return;}
  const pending=this.pending.get(p.id);if(!pending||pending.owner!==m.from||Date.now()-pending.at>20000)return;if(p.t==='start'){if(pending.count||pending.hash!==p.hash||Math.ceil(p.size/24000)!==p.count)return;pending.size=p.size;pending.count=p.count;return;}if(!pending.count||p.index>=pending.count||pending.parts.has(p.index))return;pending.parts.set(p.index,p.data);if(pending.parts.size!==pending.count)return;this.pending.delete(p.id);const data=Array.from({length:pending.count},(_,n)=>pending.parts.get(n)!).join('');if(data.length!==pending.size)return;try{await cachePetAsset(pending.hash,data);}catch{if(import.meta.env.DEV)console.warn('Rejected custom pet artwork',pending.hash);}
 }
 dispose(){this.generation++;this.off();this.pending.clear();}
}

import {z} from 'zod';
import type {AppActions,AppMessage,AppView} from '../../../packages/core/src/protocol/types';
import {avatarSheetData,clearRemoteAvatarSheets,decodeAvatarSheet,getRemoteAvatarSheet,storeRemoteAvatarSheet} from './avatar-sheet';
const id=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const wire=z.discriminatedUnion('t',[
 z.strictObject({t:z.literal('request'),id}),z.strictObject({t:z.literal('changed')}),
 z.strictObject({t:z.literal('start'),id,hash,size:z.number().int().min(1).max(700000),chunks:z.number().int().min(1).max(30)}),
 z.strictObject({t:z.literal('chunk'),id,index:z.number().int().min(0).max(29),data:z.string().max(24000)}),
]);
interface Incoming {id:string;started:number;hash?:string;size?:number;count?:number;chunks:Map<number,string>}
/** Only the avatar PNG explicitly selected in the wardrobe is shared, in bounded validated chunks. */
export class SpriteTransfer {
 private off:()=>void;private timer:ReturnType<typeof setInterval>;private session='';private incoming=new Map<string,Incoming>();private retries=new Map<string,number>();private served=new Map<string,number>();private lastData:string|null=null;
 constructor(private readonly actions:Pick<AppActions,'sendApp'|'onApp'>,private readonly view:()=>AppView|null) {
  this.off=actions.onApp(message=>{void this.receive(message);});this.timer=setInterval(()=>this.sync(),2000);
 }
 sync():void {
  const view=this.view(),key=view?.network.sessionId??'';
  if(key!==this.session){this.session=key;this.incoming.clear();this.retries.clear();this.served.clear();clearRemoteAvatarSheets();this.lastData=null;}
  if(!view||view.network.phase!=='JOINED')return;
  const data=avatarSheetData();if(data!==this.lastData){this.lastData=data;this.actions.sendApp('sprites',null,JSON.stringify({t:'changed'}));}
  for(const [person,pending]of this.incoming)if(Date.now()-pending.started>20000)this.incoming.delete(person);
  for(const member of view.network.members)if(member.connected&&member.identity.fingerprint!==view.identity.fingerprint&&member.appearance?.useCustomSheet&&!getRemoteAvatarSheet(member.identity.fingerprint))this.request(member.identity.fingerprint);
 }
 dispose():void{clearInterval(this.timer);this.off();this.incoming.clear();clearRemoteAvatarSheets();}
 private request(person:string):void {
  if(this.incoming.has(person)||Date.now()-(this.retries.get(person)||0)<10000||this.incoming.size>=12)return;
  const id=crypto.randomUUID();this.incoming.set(person,{id,started:Date.now(),chunks:new Map()});this.retries.set(person,Date.now());
  if(!this.actions.sendApp('sprites',person,JSON.stringify({t:'request',id})))this.incoming.delete(person);
 }
 private async receive(message:AppMessage):Promise<void> {
  if(message.channel!=='sprites')return;
  const view=this.view();if(!view||view.network.phase!=='JOINED'||!view.network.members.some(m=>m.connected&&m.identity.fingerprint===message.from))return;
  let raw;try{raw=wire.parse(JSON.parse(message.data));}catch{return;}
  if(raw.t==='changed'){this.incoming.delete(message.from);this.retries.delete(message.from);this.request(message.from);return;}
  if(raw.t==='request') {
   if(Date.now()-(this.served.get(message.from)||0)<5000)return;
   this.served.set(message.from,Date.now());const data=avatarSheetData();if(!data||!view.network.members.find(m=>m.identity.fingerprint===view.identity.fingerprint)?.appearance?.useCustomSheet)return;
   const session=this.session,digest=await this.hash(data),chunks=Math.ceil(data.length/24000);
   if(session!==this.session)return;
   if(!this.actions.sendApp('sprites',message.from,JSON.stringify({t:'start',id:raw.id,hash:digest,size:data.length,chunks})))return;
   for(let index=0;index<chunks;index++) {if(session!==this.session||!this.actions.sendApp('sprites',message.from,JSON.stringify({t:'chunk',id:raw.id,index,data:data.slice(index*24000,(index+1)*24000)})))return;await new Promise(resolve=>setTimeout(resolve,20));}
   return;
  }
  const pending=this.incoming.get(message.from);if(!pending||pending.id!==raw.id)return;
  if(raw.t==='start'){if(pending.hash)return;pending.hash=raw.hash;pending.size=raw.size;pending.count=raw.chunks;if(Math.ceil(raw.size/24000)!==raw.chunks)this.incoming.delete(message.from);return;}
  if(!pending.count||raw.index>=pending.count||pending.chunks.has(raw.index))return;
  pending.chunks.set(raw.index,raw.data);
  if(pending.chunks.size!==pending.count)return;
  this.incoming.delete(message.from);const data=Array.from({length:pending.count},(_,index)=>pending.chunks.get(index)!).join('');const session=this.session;
  try{if(data.length!==pending.size||await this.hash(data)!==pending.hash)return;const image=await decodeAvatarSheet(data);if(session===this.session)storeRemoteAvatarSheet(message.from,image);}catch{/* Invalid assets never replace a valid avatar. */}
 }
 private async hash(data:string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
}

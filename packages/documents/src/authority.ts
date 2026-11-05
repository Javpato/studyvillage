import { z } from 'zod';
import { InkPackets,inkPackets } from './packets';
import { applyInkOperation,emptySharedInk,InkConflict,inkOperationSchema,inkScopeSchema,sharedStateSchema,type SharedInkState } from './shared';
const requestSchema=z.discriminatedUnion('t',[
 z.strictObject({t:z.literal('hello')}),z.strictObject({t:z.literal('op'),operation:inkOperationSchema}),
]);
export interface InkAuthorityOptions {
 load(key:string):Promise<unknown>|unknown;save(key:string,state:SharedInkState):Promise<void>|void;
 allowed(endpoint:string,namespace:string,scope:string):boolean;
 moderator(person:string,scope:string):boolean;
 send(endpoint:string,data:string):Promise<boolean>|boolean;
}
/** Same operation authority for temporary hosts and persistent servers. Commit precedes acknowledgement. */
export class InkAuthority {
 private packets=new InkPackets();private states=new Map<string,SharedInkState>();private queues=new Map<string,Promise<void>>();
 private depths=new Map<string,number>();
 private watchers=new Map<string,Map<string,{person:string;namespace:string;scope:string}>>();private disposed=false;
 constructor(private options:InkAuthorityOptions){}
 async receive(endpoint:string,person:string,namespace:string,raw:string):Promise<void>{
  if(this.disposed||raw.length>55000)return;let scope:unknown;try{scope=JSON.parse(raw).scope;}catch{return;}
  const validScope=inkScopeSchema.safeParse(scope);if(!validScope.success||!this.options.allowed(endpoint,namespace,validScope.data))return;
  const packet=this.packets.receive(endpoint,raw);if(!packet)return;const parsed=requestSchema.safeParse(packet.value);if(!parsed.success)return;
  const key=`${namespace}|${packet.scope}`;
  if((this.depths.get(key)??0)>=64||[...this.depths.values()].reduce((a,b)=>a+b,0)>=256){await this.deliver(endpoint,namespace,packet.scope,{t:'error',id:parsed.data.t==='op'?parsed.data.operation.id:'',code:'busy'});return;}
  this.depths.set(key,(this.depths.get(key)??0)+1);
  const run=async()=>{
   if(!this.options.allowed(endpoint,namespace,packet.scope))return;
   const watchers=this.watchers.get(key)??new Map();watchers.set(endpoint,{person,namespace,scope:packet.scope});this.watchers.set(key,watchers);
   try{
    let state=this.states.get(key);if(!state){const saved=await this.options.load(key);state=saved?sharedStateSchema.parse(saved):emptySharedInk();this.states.set(key,state);}
    if(parsed.data.t==='hello'){await this.deliver(endpoint,namespace,packet.scope,{t:'snapshot',state});return;}
    const operation=parsed.data.operation,moderator=this.options.moderator(person,packet.scope),next=applyInkOperation(state,person,operation,moderator);
    if(next!==state){await this.options.save(key,next);this.states.set(key,next);for(const [peer,watch]of watchers){if(!this.options.allowed(peer,watch.namespace,watch.scope)){watchers.delete(peer);continue;}await this.deliver(peer,watch.namespace,watch.scope,{t:'applied',operation,actor:person,moderator,revision:next.revision});}}
    await this.deliver(endpoint,namespace,packet.scope,{t:'ack',id:operation.id,revision:next.revision});
   }catch(error){await this.deliver(endpoint,namespace,packet.scope,{t:'error',id:parsed.data.t==='op'?parsed.data.operation.id:'',code:error instanceof InkConflict?error.code:'storage'});}
  };
  const job=(this.queues.get(key)??Promise.resolve()).then(run).catch(()=>{}).finally(()=>{const depth=(this.depths.get(key)??1)-1;if(depth)this.depths.set(key,depth);else this.depths.delete(key);});this.queues.set(key,job);await job;if(this.queues.get(key)===job)this.queues.delete(key);
 }
 private async deliver(endpoint:string,namespace:string,scope:string,message:unknown):Promise<void>{
  const packets=inkPackets(scope,message);for(let i=0;i<packets.length;i++){
   if(this.disposed||!this.options.allowed(endpoint,namespace,scope))return;
   if(!await this.options.send(endpoint,packets[i]))return;
   if(packets.length>1)await new Promise(resolve=>setTimeout(resolve,4));
  }
 }
 detach(endpoint:string):void{this.packets.clear(endpoint);for(const watchers of this.watchers.values())watchers.delete(endpoint);}
 dispose():void{this.disposed=true;this.packets.clear();this.watchers.clear();}
}

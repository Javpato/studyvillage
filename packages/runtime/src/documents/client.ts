import type { AppActions,AppMessage } from '../../../core/src/protocol/types';
import { InkAuthority } from '../../../documents/src/authority';
import { InkPackets,inkPackets } from '../../../documents/src/packets';
import { NotebookRepository } from '../../../documents/src/repository';
import { applyInkOperation,emptySharedInk,inkOperationSchema,sharedStateSchema,type InkOperation,type SharedInkState } from '../../../documents/src/shared';
export interface InkClientContext {person:string;host:string|null;namespace:string|null;scope:string;joined:boolean;isAuthority:boolean}
export interface SharedInkView {state:SharedInkState;pending:number;error:string|null;connected:boolean}
/** Durable outbox is bound to the original session AND room; it is never replayed into another village. */
export class SharedInkClient {
 private authority:InkAuthority;private packets=new InkPackets();private off:()=>void;private key='';private state=emptySharedInk();private pending:InkOperation[]=[];private failed=new Set<string>();private error:string|null=null;private sending=false;private disposed=false;private timer:ReturnType<typeof setInterval>;private revision=0;private ready=false;private initialized:Promise<void>=Promise.resolve();
 constructor(private actions:Pick<AppActions,'sendApp'|'onApp'>,private context:()=>InkClientContext,private repo:NotebookRepository,
   private allowed:(person:string,scope:string)=>boolean,private changed:(view:SharedInkView)=>void){
  this.authority=new InkAuthority({load:key=>repo.loadShared('host:'+key),save:(key,state)=>repo.saveShared('host:'+key,state),allowed:(endpoint,namespace,scope)=>{const c=context();return c.joined&&c.isAuthority&&c.namespace===namespace&&allowed(endpoint,scope);},moderator:(person,scope)=>scope.startsWith(`room:${person}:`),send:(endpoint,data)=>{if(endpoint===context().person){void this.reply(data);actions.sendApp('ink',endpoint,data);return true;}return actions.sendApp('ink',endpoint,data);}});
  this.off=actions.onApp(message=>this.receive(message));this.timer=setInterval(()=>{void this.flush();},5000);
 }
 sync():void {
  const c=this.context(),key=`${c.namespace}|${c.host}|${c.scope}|${c.joined}|${c.isAuthority}`;if(key===this.key)return;this.key=key;this.revision++;this.failed.clear();this.error=null;this.packets.clear();this.ready=false;
  if(!c.joined){this.emit();return;}
  this.state=emptySharedInk();this.pending=[];this.emit();
  const token=this.revision;this.initialized=(async()=>{try{const cached=await this.repo.loadShared(`client:${c.namespace}|${c.scope}`);const outbox=await this.repo.outbox();if(token!==this.revision)return;this.state=cached?sharedStateSchema.parse(cached):emptySharedInk();this.pending=outbox.filter(o=>o.namespace===c.namespace&&o.scope===c.scope).map(o=>inkOperationSchema.parse(o.operation));this.ready=true;this.emit();await this.send({t:'hello'});await this.flush();}catch{this.error='storage';this.emit();}})();
 }
 view():SharedInkView {
  let state=this.state;const c=this.context();
  // Recovery preview rebases only locally. The original CAS revisions remain in the outbox sent to authority.
  for(const raw of this.pending){try{let op=raw;if(raw.kind==='objects'){const page=state.pages.find(p=>p.id===raw.pageId);op={...raw,changes:raw.changes.map(change=>({...change,expected:page?.objects.find(o=>o.id===change.id)?.revision??0}))};}else if(raw.kind==='text')op={...raw,expected:state.pages.find(p=>p.id===raw.pageId)?.texts.find(t=>t.author===c.person)?.revision??0};state=applyInkOperation(state,c.person,op,c.scope.startsWith(`room:${c.person}:`));}catch{/* A refused cross-author edit is not made visible as an accepted edit. */}}
  return {state,pending:this.pending.length,error:this.error,connected:c.joined};
 }
 async commit(raw:InkOperation):Promise<void>{const c=this.context(),token=this.revision;await this.initialized;if(token!==this.revision||!c.namespace)throw new Error('network');const operation=inkOperationSchema.parse(raw);await this.repo.enqueue({id:operation.id,namespace:c.namespace,scope:c.scope,operation});if(token!==this.revision)return;this.pending.push(operation);this.emit();void this.flush();}
 async retry():Promise<void>{this.failed.clear();this.error=null;await this.send({t:'hello'});await this.flush();}
 async discardPending():Promise<void>{for(const op of this.pending)await this.repo.acknowledge(op.id);this.pending=[];this.failed.clear();this.error=null;this.emit();}
 private emit():void{this.changed(this.view());}
 private receive(message:AppMessage):void {
  if(message.channel!=='ink')return;const c=this.context();if(!c.joined||!c.host||!c.namespace)return;
  if(c.isAuthority){void this.authority.receive(message.from,message.from,c.namespace,message.data);return;}
  if(message.from===c.host)void this.reply(message.data);
 }
 private async reply(raw:string):Promise<void>{
  const c=this.context();const packet=this.packets.receive(c.host??'',raw);if(!packet||packet.scope!==c.scope)return;const wire=packet.value as {t?:string;state?:unknown;operation?:unknown;actor?:string;moderator?:boolean;revision?:number;id?:string;code?:string};
  try{
   if(wire.t==='snapshot'){this.state=sharedStateSchema.parse(wire.state);await this.repo.saveShared(`client:${c.namespace}|${c.scope}`,this.state);this.emit();}
   else if(wire.t==='applied'&&typeof wire.actor==='string'){
    if(wire.revision!==this.state.revision+1){if(wire.revision!>this.state.revision)await this.send({t:'hello'});return;}
    this.state=applyInkOperation(this.state,wire.actor,inkOperationSchema.parse(wire.operation),wire.moderator===true);await this.repo.saveShared(`client:${c.namespace}|${c.scope}`,this.state);this.emit();
   }else if(wire.t==='ack'&&typeof wire.id==='string'){
    const acknowledged=this.pending.find(o=>o.id===wire.id);
    if(acknowledged&&wire.revision===this.state.revision+1){try{this.state=applyInkOperation(this.state,c.person,acknowledged,c.scope.startsWith(`room:${c.person}:`));await this.repo.saveShared(`client:${c.namespace}|${c.scope}`,this.state);}catch{await this.send({t:'hello'});}}
    else if(typeof wire.revision==='number'&&wire.revision>this.state.revision)await this.send({t:'hello'});
    await this.repo.acknowledge(wire.id);this.pending=this.pending.filter(o=>o.id!==wire.id);this.failed.delete(wire.id);if(!this.failed.size)this.error=null;this.emit();
   }else if(wire.t==='error'){if(wire.id&&wire.code!=='busy')this.failed.add(wire.id);this.error=wire.code||'invalid';this.emit();}
  }catch{this.error='storage';this.emit();}
 }
 private async send(wire:unknown):Promise<boolean>{
  const c=this.context();if(!c.joined||!c.host||!c.namespace||this.disposed)return false;const token=this.revision;
  for(const packet of inkPackets(c.scope,wire)){
   if(token!==this.revision||this.disposed)return false;
   if(c.isAuthority)await this.authority.receive(c.person,c.person,c.namespace,packet);
   else if(!this.actions.sendApp('ink',c.host,packet))return false;
   // Stay below the shared transport's per-person rate limit even for very long ink.
   await new Promise(resolve=>setTimeout(resolve,25));
  }return true;
 }
 private async flush():Promise<void>{if(this.sending||!this.ready||!this.context().joined||this.disposed)return;this.sending=true;try{for(const op of [...this.pending])if(!this.failed.has(op.id)&&!await this.send({t:'op',operation:op}))break;}catch{this.error='network';this.emit();}finally{this.sending=false;}}
 dispose():void{this.disposed=true;clearInterval(this.timer);this.off();this.authority.dispose();this.packets.clear();}
}

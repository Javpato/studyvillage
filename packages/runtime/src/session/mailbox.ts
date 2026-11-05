import {z} from 'zod';
import {MailboxAuthority,MailboxError,mailboxCommandSchema,mailboxResult,mailboxResultSchema,unwrapMailboxResult,type MailboxActor,type MailboxCommand,type MailboxStorage,type MailboxView} from '../../../core/src/house/mailbox';
const requestId=z.string().uuid();
const wireSchema=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('request'),id:requestId,command:mailboxCommandSchema}),
 z.strictObject({type:z.literal('reply'),id:requestId,result:mailboxResultSchema}),
]);
/** Recipient-owned P2P inbox. Replies go only to the authenticated requester. */
export class PeerMailbox {
 private authority:MailboxAuthority;
 private pending=new Map<string,{owner:string;resolve:(view:MailboxView)=>void;reject:(error:unknown)=>void;timer:ReturnType<typeof setTimeout>}>();
 constructor(private self:MailboxActor,storage:MailboxStorage,private identity:(id:string)=>MailboxActor|undefined,private send:(to:string,data:string)=>boolean,private isAuthority:()=>boolean=()=>true){this.authority=new MailboxAuthority(storage);}
 command(raw:MailboxCommand):Promise<MailboxView>{
  const command=mailboxCommandSchema.parse(raw);
  if(command.owner===this.self.fingerprint&&this.isAuthority())return Promise.resolve().then(()=>this.authority.execute(this.self,command));
  if(!this.identity(command.owner))return Promise.reject(new MailboxError('offline'));
  const id=crypto.randomUUID();return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(new MailboxError('offline'));},8000);
   this.pending.set(id,{owner:command.owner,resolve,reject,timer});
   if(!this.send(command.owner,JSON.stringify({type:'request',id,command}))) {clearTimeout(timer);this.pending.delete(id);reject(new MailboxError('offline'));}
  });
 }
 receive(from:string,data:string):void{
  let wire:z.infer<typeof wireSchema>;try{wire=wireSchema.parse(JSON.parse(data));}catch{return;}
  if(wire.type==='reply'){
   const pending=this.pending.get(wire.id);if(!pending||pending.owner!==from)return;
   clearTimeout(pending.timer);this.pending.delete(wire.id);
   try{const view=unwrapMailboxResult(wire.result);if(view.owner!==pending.owner)throw new MailboxError('invalid');pending.resolve(view);}catch(error){pending.reject(error);}return;
  }
  const actor=this.identity(from);if(!actor||wire.command.owner!==this.self.fingerprint||!this.isAuthority())return;
  let result;try{result=mailboxResult(()=>this.authority.execute(actor,wire.command));}catch{result={ok:false as const,error:'invalid' as const};}
  this.send(from,JSON.stringify({type:'reply',id:wire.id,result}));
 }
 cancel():void{for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new MailboxError('offline'));}this.pending.clear();}
}

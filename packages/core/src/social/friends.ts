import {z} from 'zod';
import type {PublicIdentity} from '../protocol/types';
const id=z.string().regex(/^[a-f0-9]{64}$/);
const identity=z.strictObject({fingerprint:id,publicKey:z.string().min(100).max(256),displayName:z.string().min(1).max(40),color:z.string().regex(/^#[a-fA-F0-9]{6}$/)});
export const friendCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('request'),target:id}),
 z.strictObject({action:z.literal('respond'),id:z.string().max(140),accept:z.boolean()}),
 z.strictObject({action:z.literal('cancel'),id:z.string().max(140)})
]);
const record=z.strictObject({id:z.string().max(140),from:identity,to:identity,accepted:z.boolean()});
export const friendViewSchema=z.strictObject({incoming:z.array(record).max(100),outgoing:z.array(record).max(100),accepted:z.array(identity).max(100)});
export type FriendCommand=z.infer<typeof friendCommandSchema>;
export type FriendView=z.infer<typeof friendViewSchema>;
export const emptyFriends=():FriendView=>({incoming:[],outgoing:[],accepted:[]});
/** Authority-owned, private views. Retain accepted pairs for offline agenda synchronization. */
export class Friends {
 records:z.infer<typeof record>[];
 constructor(saved:unknown=[]){this.records=z.array(record).max(10000).parse(saved);}
 view(who:string):FriendView{return {incoming:this.records.filter(r=>!r.accepted&&r.to.fingerprint===who),outgoing:this.records.filter(r=>!r.accepted&&r.from.fingerprint===who),accepted:this.records.filter(r=>r.accepted&&(r.from.fingerprint===who||r.to.fingerprint===who)).map(r=>r.from.fingerprint===who?r.to:r.from)};}
 apply(who:string,raw:FriendCommand,online:PublicIdentity[]):void {
  const command=friendCommandSchema.parse(raw);
  if(command.action==='request'){
   const from=online.find(p=>p.fingerprint===who),to=online.find(p=>p.fingerprint===command.target);
   if(!from||!to||from.fingerprint===to.fingerprint)throw new Error('Esa persona ya no está en la sesión.');
   const existing=this.records.find(r=>[r.from.fingerprint,r.to.fingerprint].includes(who)&&[r.from.fingerprint,r.to.fingerprint].includes(to.fingerprint));
   if(existing)return;
   if(this.records.length>=10000||[who,to.fingerprint].some(p=>this.records.filter(r=>r.from.fingerprint===p||r.to.fingerprint===p).length>=100))throw new Error('La agenda admite hasta 100 contactos.');
   this.records.push({id:crypto.randomUUID(),from,to,accepted:false});return;
  }
  const r=this.records.find(r=>r.id===command.id);if(!r)return;
  if(command.action==='cancel'?r.from.fingerprint!==who:r.to.fingerprint!==who)throw new Error('No tienes permiso.');
  if(r.accepted)return;
  if(command.action==='respond'&&command.accept)r.accepted=true;else this.records=this.records.filter(item=>item!==r);
 }
}

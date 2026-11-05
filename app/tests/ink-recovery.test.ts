import {describe,it,expect,vi} from 'vitest';
import {SharedInkClient,type InkClientContext} from '../../packages/runtime/src/documents/client';
import type {NotebookRepository} from '../../packages/documents/src/repository';
import type {AppActions,AppMessage} from '../../packages/core/src/protocol/types';
import type {InkOperation} from '../../packages/documents/src/shared';

function memoryRepository(){
 const snapshots=new Map<string,unknown>(),outbox=new Map<string,{id:string;namespace:string;scope:string;operation:unknown}>();
 return {snapshots,outbox,repo:{loadShared:async(key:string)=>snapshots.get(key),saveShared:async(key:string,value:unknown)=>{snapshots.set(key,structuredClone(value));},outbox:async()=>[...outbox.values()],enqueue:async(op:{id:string;namespace:string;scope:string;operation:unknown})=>{outbox.set(op.id,structuredClone(op));},acknowledge:async(id:string)=>{outbox.delete(id);}} as unknown as NotebookRepository};
}
describe('ink outbox recovery across interrupted sessions',()=>{
 it('recovers a lost acknowledgement once, and never replays old edits into another village',async()=>{
  const listeners=new Map<string,(m:AppMessage)=>void>();let loseAck=true;const sent:{from:string;to:string|null;data:string}[]=[];
  const actions=(person:string):Pick<AppActions,'sendApp'|'onApp'>=>({onApp:fn=>{listeners.set(person,fn);return()=>listeners.delete(person);},sendApp:(channel,to,data)=>{sent.push({from:person,to,data});const packet=JSON.parse(data);let wire:{t?:string}={};try{wire=JSON.parse(packet.body);}catch{}if(person==='host'&&to==='guest'&&wire.t==='ack'&&loseAck)return true;queueMicrotask(()=>{if(to)listeners.get(to)?.({channel,from:person,data});});return true;}});
  const h:InkClientContext={person:'host',host:'host',namespace:'world-one',scope:'village',joined:true,isAuthority:true},g:InkClientContext={person:'guest',host:'host',namespace:'world-one',scope:'village',joined:true,isAuthority:false};
  const hostRepo=memoryRepository(),guestRepo=memoryRepository();const host=new SharedInkClient(actions('host'),()=>h,hostRepo.repo,()=>true,()=>{}),guest=new SharedInkClient(actions('guest'),()=>g,guestRepo.repo,()=>true,()=>{});
  try{
   host.sync();guest.sync();const op:InkOperation={id:crypto.randomUUID(),kind:'page.create',page:{id:crypto.randomUUID(),title:'A surviving page',background:'blank',ink:[],text:'Recover me'}};
   await guest.commit(op);await vi.waitFor(()=>expect(host.view().state.pages).toHaveLength(1));await vi.waitFor(()=>expect(guest.view().state.pages).toHaveLength(1));expect(guestRepo.outbox.size).toBe(1);
   loseAck=false;await guest.retry();await vi.waitFor(()=>expect(guestRepo.outbox.size).toBe(0));expect(host.view().state.revision).toBe(1);
   // An edit committed while offline remains attached to the original namespace.
   g.joined=false;guest.sync();const second:InkOperation={...op,id:crypto.randomUUID(),page:{...op.page,id:crypto.randomUUID(),title:'Original village only'}};await guest.commit(second);expect(guestRepo.outbox.size).toBe(1);
   const count=sent.length;g.namespace='world-two';g.joined=true;guest.sync();await vi.waitFor(()=>expect(guest.view().state.pages).toHaveLength(0));await new Promise(resolve=>setTimeout(resolve,50));
   expect(sent.slice(count).some(m=>m.data.includes('Original village only'))).toBe(false);expect([...guestRepo.outbox.values()][0].namespace).toBe('world-one');
  }finally{host.dispose();guest.dispose();}
 });
});

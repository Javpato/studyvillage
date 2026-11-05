import { z } from 'zod';
import { inkScopeSchema } from './shared';
const packetSchema=z.strictObject({v:z.literal(1),scope:inkScopeSchema,id:z.string().uuid(),index:z.number().int().nonnegative(),count:z.number().int().min(1).max(2500),body:z.string().max(12000)});
export function inkPackets(scope:string,value:unknown):string[] {
 inkScopeSchema.parse(scope);const raw=JSON.stringify(value);if(raw.length>25*1024*1024)throw new Error('limit');
 const id=crypto.randomUUID(),count=Math.ceil(raw.length/12000);return Array.from({length:count},(_,index)=>JSON.stringify({v:1,scope,id,index,count,body:raw.slice(index*12000,(index+1)*12000)}));
}
/** Per-author bounded assembly. Chunks never execute and expire rather than accumulating. */
export class InkPackets {
 private pending=new Map<string,{scope:string;count:number;chunks:Map<number,string>;size:number;at:number}>();
 receive(sender:string,raw:string):{scope:string;value:unknown}|null {
  if(raw.length>55000)return null;let parsed:unknown;try{parsed=JSON.parse(raw);}catch{return null;}const result=packetSchema.safeParse(parsed);if(!result.success)return null;const p=result.data;
  if(p.index>=p.count)return null;const now=Date.now();for(const [key,value]of this.pending)if(now-value.at>120000)this.pending.delete(key);
  const key=sender+':'+p.id;let item=this.pending.get(key);
  if(!item){if(this.pending.size>=16||[...this.pending.keys()].filter(k=>k.startsWith(sender+':')).length>=2)return null;item={scope:p.scope,count:p.count,chunks:new Map(),size:0,at:now};this.pending.set(key,item);}
  if(item.scope!==p.scope||item.count!==p.count){this.pending.delete(key);return null;}
  const previous=item.chunks.get(p.index);if(previous!==undefined&&previous!==p.body){this.pending.delete(key);return null;}
  if(previous===undefined){item.size+=p.body.length;item.chunks.set(p.index,p.body);}
  if(item.size>25*1024*1024||[...this.pending.values()].reduce((n,v)=>n+v.size,0)>32*1024*1024){this.pending.delete(key);return null;}
  if(item.chunks.size!==item.count)return null;this.pending.delete(key);
  try{return {scope:item.scope,value:JSON.parse(Array.from({length:item.count},(_,i)=>item!.chunks.get(i)!).join(''))};}catch{return null;}
 }
 clear(sender?:string):void{if(!sender)this.pending.clear();else for(const key of this.pending.keys())if(key.startsWith(sender+':'))this.pending.delete(key);}
}

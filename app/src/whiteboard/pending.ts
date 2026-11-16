import type {BoardStroke} from '../../../packages/core/src/protocol/types';
/** Presentation-only edits bridge pointer-up to durable storage. Never exported as a network acknowledgment. */
export class PendingInk {
 private scopes=new Map<string,Map<string,{token:object;stroke:BoardStroke}>>();
 revision=0;
 stage(scope:string,changes:readonly BoardStroke[]):()=>void{
  const entries=this.scopes.get(scope)??new Map(),token={};
  for(const stroke of changes)entries.set(stroke.id,{token,stroke:structuredClone(stroke)});
  this.scopes.set(scope,entries);this.revision++;
  return()=>{for(const [id,entry]of entries)if(entry.token===token)entries.delete(id);if(!entries.size)this.scopes.delete(scope);this.revision++;};
 }
 merge(scope:string,strokes:readonly BoardStroke[]):BoardStroke[]{
  const entries=this.scopes.get(scope);if(!entries?.size)return [...strokes];
  const merged=new Map(strokes.map(s=>[s.id,s]));
  for(const {stroke}of entries.values()){const old=merged.get(stroke.id);if(!old||!old.deleted&&stroke.seq>old.seq)merged.set(stroke.id,stroke);}
  return [...merged.values()];
 }
}

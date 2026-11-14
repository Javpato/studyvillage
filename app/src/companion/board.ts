import {boardBatches} from '../../../packages/core/src/whiteboard/batches';
import {companionRecovery,setBoardExtra} from '../../../packages/runtime/src/storage/whiteboards';
import {z} from 'zod';
import {strokeSchema} from '../../../packages/core/src/protocol/schema';
import {whiteboardMetadataSchema} from '../../../packages/core/src/whiteboard/boards-registry';
import type {BoardStroke} from '../../../packages/core/src/protocol/types';
import {msg,setDisplayAttribute} from '../i18n';
export const companionBoardSchema=z.strictObject({board:z.string(),author:z.string(),strokes:z.array(strokeSchema),canEdit:z.boolean(),moderate:z.boolean(),configure:z.boolean(),display:z.boolean(),metadata:whiteboardMetadataSchema,next:z.object({token:z.string(),offset:z.number().int().nonnegative()}).optional()});
export type CompanionBoardState=z.infer<typeof companionBoardSchema>;
export interface BoardSurface {node:HTMLElement;activate():void;changed():void;deactivate():void;}
/** Mount the actual village whiteboard, including its toolbar and input controller.
 * Only its data/command port changes. Camera, pen preferences and history remain local. */
export class CompanionBoard {
 readonly root=document.createElement('dialog');state:CompanionBoardState|null=null;
 private home=document.createComment('whiteboard home');private timer:ReturnType<typeof setInterval>;private generation=0;private polling=false;private mutation=0;
 private pending=new Map<string,BoardStroke>();private jobs=new Set<Promise<unknown>>();
 private request:(action:string,value?:unknown)=>Promise<unknown>=async()=>{throw Error('Dispositivo no conectado.');};
 constructor(private surface:BoardSurface,private notify:(error:unknown)=>void){
  this.root.className='sv-companion-board';setDisplayAttribute(this.root,'aria-label',msg('Pizarra'));document.body.append(this.root);
  this.root.onclose=()=>{if(!this.root.open)this.close();};
  this.timer=setInterval(()=>void this.poll(),600);
 }
 async open(raw:unknown,request:(action:string,value?:unknown)=>Promise<unknown>){
  this.close();this.generation++;const generation=this.generation;this.request=request;const state=await this.completeState(raw,request);const recovered=await companionRecovery(state.board,state.author);if(generation!==this.generation)return;this.state=state;const current=new Map(state.strokes.map(s=>[s.id,s]));for(const stroke of recovered){const old=current.get(stroke.id);if(!old||!old.deleted&&stroke.seq>old.seq)this.pending.set(stroke.id,stroke);}
  this.surface.node.before(this.home);this.root.append(this.surface.node);this.root.show();this.surface.activate();this.surface.changed();
 }
 private async completeState(raw:unknown,request:(action:string,value?:unknown)=>Promise<unknown>):Promise<CompanionBoardState>{const state=companionBoardSchema.parse(raw),strokes=[...state.strokes];let next=state.next;while(next){const page=companionBoardSchema.parse(await request('page',next));if(page.board!==state.board||page.next&&page.next.offset<=next.offset)throw Error('La pizarra cambió antes de guardar.');strokes.push(...page.strokes);next=page.next;}return {...state,strokes,next:undefined};}
 all(){const map=new Map(this.state?.strokes.map(s=>[s.id,s])??[]);for(const [id,stroke]of this.pending)map.set(id,stroke);return [...map.values()];}
 async command(action:string,value?:unknown){const generation=this.generation;const result=await this.request(action,value);if(['rename','access'].includes(action)){const state=await this.completeState(result,this.request);if(generation===this.generation){this.state=state;this.surface.changed();}}return result;}
 commit(changes:BoardStroke[]):Promise<void>{
  const state=this.state;if(!state)return Promise.reject(Error('Esta acción ya no está disponible.'));
  this.mutation++;const generation=this.generation,request=this.request,key='studyvillage-companion-pending-board:'+state.board+':'+crypto.randomUUID();
  for(const stroke of changes)this.pending.set(stroke.id,stroke);
  const job=(async()=>{let complete=false;try{await setBoardExtra(key,{board:state.board,author:state.author,changes});let remaining=changes;for(const batch of boardBatches(changes)){await request('commit',{board:state.board,changes:batch});remaining=remaining.slice(batch.length);await setBoardExtra(key,{board:state.board,author:state.author,changes:remaining});}const result=await this.completeState(await request('state'),request);await setBoardExtra(key,undefined);if(generation===this.generation)this.state=result;complete=true;}finally{if(generation===this.generation){if(complete)for(const stroke of changes)if(this.pending.get(stroke.id)?.seq===stroke.seq)this.pending.delete(stroke.id);this.surface.changed();}}})();
  this.jobs.add(job);void job.finally(()=>this.jobs.delete(job)).catch(()=>{});return job;
 }
 close(){if(!this.state)return;this.surface.deactivate();this.generation++;this.root.close();this.home.replaceWith(this.surface.node);this.state=null;this.pending.clear();}
 async flush(){await Promise.allSettled([...this.jobs]);}
 private async poll(){if(!this.root.open||this.polling||this.jobs.size)return;this.polling=true;const generation=this.generation,mutation=this.mutation;try{const state=await this.completeState(await this.request('state'),this.request);if(generation===this.generation&&mutation===this.mutation&&state.board===this.state?.board){this.state=state;this.surface.changed();}}catch(e){if(generation===this.generation)this.notify(e);}finally{this.polling=false;}}
 dispose(){clearInterval(this.timer);this.close();this.root.remove();}
}

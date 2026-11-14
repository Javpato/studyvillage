import {setBoardExtra} from '../../../packages/runtime/src/storage/whiteboards';
import {z} from 'zod';
import {strokeSchema} from '../../../packages/core/src/protocol/schema';
import {whiteboardMetadataSchema} from '../../../packages/core/src/whiteboard/boards-registry';
import type {BoardStroke} from '../../../packages/core/src/protocol/types';
import {msg,setDisplayAttribute} from '../i18n';
export const companionBoardSchema=z.strictObject({board:z.string(),author:z.string(),strokes:z.array(strokeSchema),canEdit:z.boolean(),moderate:z.boolean(),configure:z.boolean(),display:z.boolean(),metadata:whiteboardMetadataSchema});
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
  this.close();this.generation++;this.request=request;this.state=companionBoardSchema.parse(raw);
  this.surface.node.before(this.home);this.root.append(this.surface.node);this.root.show();this.surface.activate();this.surface.changed();
 }
 all(){const map=new Map(this.state?.strokes.map(s=>[s.id,s])??[]);for(const [id,stroke]of this.pending)map.set(id,stroke);return [...map.values()];}
 async command(action:string,value?:unknown){const generation=this.generation;const result=await this.request(action,value);if(generation===this.generation&&['rename','access'].includes(action)){this.state=companionBoardSchema.parse(result);this.surface.changed();}return result;}
 commit(changes:BoardStroke[]):Promise<void>{
  const state=this.state;if(!state)return Promise.reject(Error('Esta acción ya no está disponible.'));
  this.mutation++;const generation=this.generation,request=this.request,key='studyvillage-companion-pending-board:'+state.board+':'+crypto.randomUUID();
  for(const stroke of changes)this.pending.set(stroke.id,stroke);
  const job=(async()=>{try{await setBoardExtra(key,{board:state.board,changes});const result=companionBoardSchema.parse(await request('commit',{board:state.board,changes}));await setBoardExtra(key,undefined);if(generation===this.generation)this.state=result;}finally{if(generation===this.generation){for(const stroke of changes)this.pending.delete(stroke.id);this.surface.changed();}}})();
  this.jobs.add(job);void job.finally(()=>this.jobs.delete(job)).catch(()=>{});return job;
 }
 close(){if(!this.state)return;this.surface.deactivate();this.generation++;this.root.close();this.home.replaceWith(this.surface.node);this.state=null;this.pending.clear();}
 async flush(){await Promise.allSettled([...this.jobs]);}
 private async poll(){if(!this.root.open||this.polling||this.jobs.size)return;this.polling=true;const generation=this.generation,mutation=this.mutation;try{const state=companionBoardSchema.parse(await this.request('state'));if(generation===this.generation&&mutation===this.mutation&&state.board===this.state?.board){this.state=state;this.surface.changed();}}catch(e){if(generation===this.generation)this.notify(e);}finally{this.polling=false;}}
 dispose(){clearInterval(this.timer);this.close();this.root.remove();}
}

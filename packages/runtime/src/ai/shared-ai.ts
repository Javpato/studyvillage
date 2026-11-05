import { z } from 'zod';
import type { AppActions, AppMessage } from '../../../core/src/protocol/types';
import { AiError, aiErrorSchema, aiResults, aiStatusSchema, aiWireSchema, type AiInput, type AiProvider, type AiReply, type AiStatus, type AiWire } from './contracts';

export interface AiContext { selfId:string; hostId:string|null; sessionId:string|null; authority?:boolean }
const replySchema=z.discriminatedUnion('t',[
  z.strictObject({t:z.literal('result'),id:z.string(),value:z.unknown()}),
  z.strictObject({t:z.literal('error'),id:z.string(),code:aiErrorSchema}),
]);
interface Pending { resolve:(value:unknown)=>void; reject:(error:Error)=>void; timer:ReturnType<typeof setTimeout> }
/** Routes only to the actual session authority; ignores forged replies from other members. */
export class SharedAi {
  private pending=new Map<string,Pending>();
  private off:()=>void;
  private key='';
  private timer:ReturnType<typeof setInterval>;
  private capabilities:AiStatus={features:[],model:''};
  private querying=false;
  constructor(private readonly actions:Pick<AppActions,'sendApp'|'onApp'>,private readonly context:()=>AiContext,
    private readonly local:AiProvider,private readonly changed:(status:AiStatus|null)=>void) {
    this.off=actions.onApp(message=>{void this.receive(message);});
    this.timer=setInterval(()=>{void this.refresh();},15000);
  }
  sync():void {
    const c=this.context(),key=`${c.sessionId}:${c.hostId}:${c.selfId}:${c.authority}`;
    if(key===this.key)return;
    this.key=key;this.cancelAll();this.capabilities={features:[],model:''};
    this.changed(this.remote()?this.capabilities:null);void this.refresh();
  }
  remote():boolean {const {selfId,hostId}=this.context();return !!hostId&&!(this.context().authority??hostId===selfId);}
  async refresh():Promise<void> {
    if(!this.remote()||this.querying)return;
    this.querying=true;const key=this.key;
    try {const status=aiStatusSchema.parse(await this.send({t:'status',id:crypto.randomUUID()}));if(key===this.key){this.capabilities=status;this.changed(status);}}
    catch {if(key===this.key){this.capabilities={features:[],model:''};this.changed(this.capabilities);}}
    finally{this.querying=false;}
  }
  generate(input:AiInput,signal:AbortSignal):Promise<unknown> {
    if(!this.remote()||signal.aborted)return Promise.reject(new AiError('cancelled'));
    const id=crypto.randomUUID();
    const cancel=()=>{this.actions.sendApp('ai',this.context().hostId,JSON.stringify({t:'cancel',id}));const pending=this.pending.get(id);if(pending){clearTimeout(pending.timer);this.pending.delete(id);pending.reject(new AiError('cancelled'));}};
    signal.addEventListener('abort',cancel,{once:true});
    return this.send({t:'generate',id,input}).then(value=>aiResults[input.feature].parse(value)).finally(()=>signal.removeEventListener('abort',cancel));
  }
  dispose():void{clearInterval(this.timer);this.cancelAll();this.off();}
  private cancelAll():void {for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new AiError('cancelled'));}this.pending.clear();}
  private send(wire:AiWire):Promise<unknown> {
    if(this.pending.size>=2)return Promise.reject(new AiError('ai-busy'));
    const raw=JSON.stringify(wire);if(raw.length>55000)return Promise.reject(new AiError('ai-response'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{if(wire.t==='generate')this.actions.sendApp('ai',this.context().hostId,JSON.stringify({t:'cancel',id:wire.id}));this.pending.delete(wire.id);reject(new AiError('ai-unavailable'));},wire.t==='status'?6000:65000);
      this.pending.set(wire.id,{resolve,reject,timer});
      if(!this.actions.sendApp('ai',this.context().hostId,raw)){clearTimeout(timer);this.pending.delete(wire.id);reject(new AiError('ai-unavailable'));}
    });
  }
  private async receive(message:AppMessage):Promise<void> {
    if(message.channel!=='ai')return;
    const context=this.context();let raw:unknown;try{raw=JSON.parse(message.data);}catch{return;}
    if(this.remote()) {
      if(message.from!==context.hostId)return;
      const result=replySchema.safeParse(raw);if(!result.success)return;
      const pending=this.pending.get(result.data.id);if(!pending)return;
      clearTimeout(pending.timer);this.pending.delete(result.data.id);
      if(result.data.t==='error')pending.reject(new AiError(result.data.code));else pending.resolve(result.data.value);
      return;
    }
    if(!(context.authority??context.hostId===context.selfId))return;
    const parsed=aiWireSchema.safeParse(raw);if(!parsed.success)return;
    const request=parsed.data;
    if(request.t==='cancel'){this.local.cancel(message.from,request.id);return;}
    let reply:AiReply;
    try{const value=request.t==='status'?await this.local.status():await this.local.generate(message.from,request.id,request.input);reply={t:'result',id:request.id,value};}
    catch(error){reply={t:'error',id:request.id,code:error instanceof AiError?error.code:'ai-unavailable'};}
    if(this.key===`${context.sessionId}:${context.hostId}:${context.selfId}:${context.authority}`)this.actions.sendApp('ai',message.from,JSON.stringify(reply));
  }
}

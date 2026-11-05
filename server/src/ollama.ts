import { z } from 'zod';
import { AiError, aiInputSchema, aiResults, type AiFeature, type AiInput, type AiProvider, type AiStatus } from '../../packages/runtime/src/ai/contracts';

export interface OllamaConfig { enabled:boolean; url:string; model:string; features:AiFeature[]; timeoutMs?:number }
interface Job { person:string; id:string; input:AiInput; resolve:(result:unknown)=>void; reject:(error:Error)=>void; controller:AbortController }
/** Configured only by the server operator. No participant-selected URL/model or cloud fallback. */
export class ServerOllama implements AiProvider {
  private active:Job|null=null;
  private queue:Job[]=[];
  private history=new Map<string,number[]>();
  private cached:{until:number; status:AiStatus}|null=null;
  private stopped=false;
  constructor(private readonly config:OllamaConfig, private readonly request:typeof fetch=fetch) {
    const url=new URL(config.url);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid operator Ollama URL');
  }
  async status():Promise<AiStatus> {
    if(this.stopped || !this.config.enabled || !this.config.model || this.config.model.endsWith(':cloud'))return {features:[],model:''};
    if(this.cached && this.cached.until>Date.now())return this.cached.status;
    const empty={features:[],model:''};
    try {
      const signal=AbortSignal.timeout(4000);
      const tags=await this.json('/api/tags',{},signal);
      const local=z.object({models:z.array(z.object({name:z.string(),remote_host:z.string().optional()})).max(200)}).parse(tags).models;
      if(!local.some(m=>m.name===this.config.model&&!m.remote_host))throw new AiError('ai-unavailable');
      const model=z.object({capabilities:z.array(z.string()).default([])}).parse(await this.json('/api/show',{model:this.config.model},signal));
      const features=this.config.features.filter(f=>!['boardVision','gartic'].includes(f)||model.capabilities.includes('vision'));
      const status={features,model:this.config.model};this.cached={until:Date.now()+15000,status};return status;
    }catch{this.cached={until:Date.now()+3000,status:empty};return empty;}
  }
  generate(person:string,id:string,raw:AiInput):Promise<unknown> {
    const parsed=aiInputSchema.safeParse(raw);
    if(!parsed.success)return Promise.reject(new AiError('ai-response'));
    if(this.stopped||!this.config.enabled)return Promise.reject(new AiError('ai-unavailable'));
    const jobs=[...this.queue,...(this.active?[this.active]:[])];
    const recent=(this.history.get(person)||[]).filter(t=>Date.now()-t<60000);
    if(jobs.length>=8 || jobs.some(j=>j.person===person) || recent.length>=10)return Promise.reject(new AiError('ai-busy'));
    recent.push(Date.now());this.history.set(person,recent);
    // Bound bookkeeping even on long-running servers with many historical visitors.
    if(this.history.size>256)for(const [key,values]of this.history)if(!values.some(t=>Date.now()-t<60000))this.history.delete(key);
    return new Promise((resolve,reject)=>{this.queue.push({person,id,input:parsed.data,resolve,reject,controller:new AbortController()});void this.pump();});
  }
  cancel(person:string,id?:string):void {
    const matches=(job:Job)=>job.person===person&&(!id||job.id===id);
    if(this.active&&matches(this.active))this.active.controller.abort();
    this.queue=this.queue.filter(job=>{if(!matches(job))return true;job.reject(new AiError('cancelled'));return false;});
  }
  dispose():void {this.stopped=true;this.active?.controller.abort();for(const job of this.queue)job.reject(new AiError('cancelled'));this.queue=[];}
  private async pump():Promise<void> {
    if(this.active||!this.queue.length||this.stopped)return;
    const job=this.queue.shift()!;this.active=job;
    const timer=setTimeout(()=>job.controller.abort(),this.config.timeoutMs??60000);
    try {
      const status=await this.status();
      if(!status.features.includes(job.input.feature))throw new AiError('ai-unavailable');
      if(job.controller.signal.aborted)throw new AiError('cancelled');
      const schema=aiResults[job.input.feature];
      const envelope=z.object({response:z.string().max(150000)}).parse(await this.json('/api/generate',{
        model:this.config.model,prompt:job.input.prompt,images:job.input.images,stream:false,
        format:z.toJSONSchema(schema),options:{temperature:0.2,num_predict:job.input.feature==='sprites'?3000:2400},
      },job.controller.signal));
      const result=schema.parse(JSON.parse(envelope.response));
      if(JSON.stringify(result).length>50000)throw new AiError('ai-response');
      if(job.controller.signal.aborted)throw new AiError('cancelled');
      job.resolve(result);
    }catch(error){job.reject(job.controller.signal.aborted?new AiError('cancelled'):error instanceof AiError?error:new AiError('ai-response'));}
    finally{clearTimeout(timer);this.active=null;void this.pump();}
  }
  private async json(path:string,body:unknown,signal:AbortSignal):Promise<unknown> {
    const response=await this.request(`${this.config.url.replace(/\/$/,'')}${path}`,path==='/api/tags'?{signal}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    if(!response.ok)throw new AiError('ai-unavailable');
    const reader=response.body?.getReader();if(!reader)throw new AiError('ai-response');
    const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>160000)throw new AiError('ai-response');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder().decode(bytes));
  }
}

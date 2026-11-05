import { z } from 'zod';
import { LocalOllama } from './local-ollama';
import { errorMessage } from '../../../../app/src/errors/messages';
import { GarticGame, type GarticAction, type GarticView } from '../../../core/src/minigames/gartic-phone';
import { SharedRoom } from '../session/shared-room';
import { paintDrawing } from '../../../../app/src/ui/gartic-ui';
export const botResponseSchema = z.object({ text: z.string().trim().min(1).max(120).optional(), drawing: z.object({ strokes: z.array(z.object({ c: z.string().regex(/^#[a-fA-F0-9]{6}$/), w: z.number().min(1).max(48), p: z.array(z.number().finite().min(0).max(640)).min(2).max(1000).refine(p=>p.length%2===0 && p.every((n,i)=>i%2===0||n<=400)) })).min(1).max(100) }).optional() }).refine(r=>!!r.text||!!r.drawing);
export class OllamaGarticBots {
  private readyModel = ''; private busy = false; private tried = new Set<string>(); private off: () => void; private generation = 0;
  constructor(private readonly gateway: LocalOllama, private readonly room: SharedRoom<GarticAction,GarticView,GarticGame>, private readonly notify: (m:string)=>void) { this.off=room.subscribe(()=>{void this.pump();}); }
  ready(): boolean { return this.gateway.isReady('gartic') && this.gateway.modelFor('gartic') === this.readyModel; }
  async enable(): Promise<void> {
    if(!this.room.canLead())throw new Error('Solo el anfitrión configura bots.');
    if (!this.gateway.isReady('gartic')) throw new Error('Configura los bots desde el mueble Ollama.');
    const cfg = { selectedModel: this.gateway.modelFor('gartic') };
    this.readyModel=cfg.selectedModel;this.room.command('bots.enable');
  }
  cancel(): void {this.generation++;this.gateway.cancel('gartic');}
  disable(): void {this.readyModel='';this.cancel();if(this.room.canLead())this.room.command('bots.disable');}
  dispose(): void {this.cancel();this.off();}
  private async pump(): Promise<void> {
    if (this.readyModel && this.room.canLead() && !this.ready()) { this.disable(); this.notify('Los bots se han desactivado: el modelo ya no está disponible o ha cambiado.'); return; }
    if(this.room.usesServer())return;
    if(this.busy||!this.room.canLead()||!this.ready())return;
    // Only a temporary desktop host runs these jobs. Persistent bots run inside the server.
    this.busy=true;let jobs: ReturnType<GarticGame['botJobs']>=[];try{jobs=await this.room.botJobs() as ReturnType<GarticGame['botJobs']>;}finally{this.busy=false;}
    if (this.tried.size > 256) this.tried = new Set([...this.tried].filter(key => jobs.some(j => key === `${j.key}:${j.id}`)));
    const job=jobs.find(j=>!this.tried.has(`${j.key}:${j.id}`));if(!job)return;
    const token=this.generation;this.busy=true;this.tried.add(`${job.key}:${job.id}`);
    try {
      const images:string[]=[];if(job.task.previous?.drawing){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;paintDrawing(canvas.getContext('2d')!,job.task.previous.drawing);images.push(canvas.toDataURL('image/png').split(',')[1]);}
      const prompt=job.task.kind==='draw' ? `Dibuja esta frase como trazos JSON en un lienzo 640x400: ${JSON.stringify(job.task.previous?.text??'')}. Devuelve {"drawing":{"strokes":[{"c":"#000000","w":4,"p":[x,y,x,y]}]}}; máximo 100 trazos, 4000 puntos totales.` : job.task.kind==='guess' ? 'Describe solo la imagen adjunta en español: {"text":"descripción de hasta 120 caracteres"}.' : 'Escribe una frase original para un juego de dibujo: {"text":"frase de hasta 120 caracteres"}.';
      const answer=botResponseSchema.parse(await this.gateway.requestJson(prompt,images));
      if(job.task.kind==='draw'&&!answer.drawing||job.task.kind!=='draw'&&!answer.text)throw new Error('La respuesta no corresponde al turno.');
      if(answer.drawing && answer.drawing.strokes.reduce((n,s)=>n+s.p.length/2,0)>4000)throw new Error('Demasiados puntos.');
      if(token===this.generation&&this.ready())this.room.command('bots.submit',{key:job.key,id:job.id,answer});
    } catch(e){ if(token===this.generation)this.notify(`Bot Ollama: ${errorMessage(e)}. Se aplicará el tiempo límite.`); }
    finally {this.busy=false;if(token===this.generation)queueMicrotask(()=>{void this.pump();});}
  }
}

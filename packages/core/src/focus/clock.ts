import {z} from 'zod';
export const focusStepSchema=z.strictObject({id:z.string().min(1).max(80),name:z.string().trim().min(1).max(80),seconds:z.number().int().min(1).max(86399)});
export const focusProgramSchema=z.strictObject({id:z.string().min(1).max(80),name:z.string().trim().min(1).max(80),repeat:z.boolean(),steps:z.array(focusStepSchema).min(1).max(32).refine(s=>new Set(s.map(i=>i.id)).size===s.length)});
export type FocusProgram=z.infer<typeof focusProgramSchema>;
export const focusSoundSchema=z.strictObject({kind:z.enum(['bell','chime','drop','custom','silent']),volume:z.number().min(0).max(1),target:z.enum(['primary','companion','both']),customId:z.string().max(80).nullable()});
export type FocusSound=z.infer<typeof focusSoundSchema>;
const extrasSchema=z.object({programs:z.array(focusProgramSchema).max(20).refine(p=>new Set(p.map(i=>i.id)).size===p.length),selectedProgramId:z.string().max(80).nullable(),run:focusProgramSchema.nullable(),stepIndex:z.number().int().min(0).max(31),sound:focusSoundSchema,alert:z.object({id:z.number().int().nonnegative(),at:z.number().finite().nonnegative()})});
export const FOCUS_COMMANDS=['start','pause','reset','stop','duration','program-save','program-delete','program-select','sound'] as const;
export type FocusCommand=typeof FOCUS_COMMANDS[number];
export type FocusMode='focus'|'break';
export interface FocusClockState {
 version:2;programs:FocusProgram[];selectedProgramId:string|null;run:FocusProgram|null;stepIndex:number;sound:FocusSound;alert:{id:number;at:number};mode:FocusMode;durations:Record<FocusMode,number>;remaining:number;deadline:number|null;
 status:'idle'|'running'|'paused'|'finished';activeDuration:number;started:boolean;hud:boolean|null;position:{x:number;y:number};
}
export const FOCUS_CLOCK_KEY='studyvillage-focus-clock-v1';
export const MAX_FOCUS_SECONDS=24*60*60-1;
export const newFocusClockState=():FocusClockState=>({version:2,programs:[],selectedProgramId:null,run:null,stepIndex:0,sound:{kind:'bell',volume:.5,target:'primary',customId:null},alert:{id:0,at:0},mode:'focus',durations:{focus:25*60,break:5*60},remaining:25*60,deadline:null,status:'idle',activeDuration:25*60,started:false,hud:null,position:{x:1,y:.16}});
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=min&&value<=max;
export function parseFocusClockState(raw:unknown):FocusClockState {
 if(!raw||typeof raw!=='object')throw new Error('Invalid clock preferences');
 const v=raw as FocusClockState;
 if(![1,2].includes(v.version)||!['focus','break'].includes(v.mode)||!v.durations||!integer(v.durations.focus,1,MAX_FOCUS_SECONDS)||!integer(v.durations.break,1,MAX_FOCUS_SECONDS)||!integer(v.remaining,0,MAX_FOCUS_SECONDS)||v.deadline!==null&&(!Number.isFinite(v.deadline)||v.deadline<0)||typeof v.started!=='boolean'||v.hud!==null&&typeof v.hud!=='boolean'||!v.position||![v.position.x,v.position.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))throw new Error('Invalid clock preferences');
 const status=v.status??(v.deadline!==null?'running':v.remaining<v.durations[v.mode]&&v.remaining>0?'paused':'idle');
 if(!['idle','running','paused','finished'].includes(status)||(status==='running')!==(v.deadline!==null))throw new Error('Invalid clock status');
 const activeDuration=v.activeDuration??v.durations[v.mode];if(!integer(activeDuration,1,MAX_FOCUS_SECONDS))throw new Error('Invalid phase duration');
 const extras=extrasSchema.parse(Number(v.version)===1?newFocusClockState():v);
 if(extras.selectedProgramId&&!extras.programs.some(p=>p.id===extras.selectedProgramId)||extras.run&&extras.stepIndex>=extras.run.steps.length||extras.run===null&&extras.stepIndex!==0)throw Error('Invalid program state');
 return {...extras,version:2,mode:v.mode,durations:{...v.durations},remaining:v.remaining,deadline:v.deadline,status,activeDuration,started:v.started,hud:v.hud,position:{...v.position}};
}
export function durationFromFields(hours:string,minutes:string,seconds:string):number|null {
 const values=[hours,minutes,seconds].map(v=>v.trim()===''?0:/^\d{1,2}$/.test(v)?Number(v):NaN);
 if(!integer(values[0],0,23)||!integer(values[1],0,59)||!integer(values[2],0,59))return null;
 const total=values[0]*3600+values[1]*60+values[2];return total>0?total:null;
}
export function clockParts(seconds:number):[string,string,string]{const value=Math.max(0,Math.floor(seconds));return [Math.floor(value/3600),Math.floor(value/60)%60,value%60].map(n=>String(n).padStart(2,'0')) as [string,string,string];}
export function formatClock(seconds:number):string{const parts=clockParts(seconds);return (seconds>=3600?parts:parts.slice(1)).join(':');}
/** Wall-clock deadline avoids accumulated drift when mobile browsers suspend timers. */
export class FocusClockModel {
 readonly state:FocusClockState;
 constructor(state:FocusClockState=newFocusClockState(),private readonly now:()=>number=Date.now){this.state=parseFocusClockState(state);this.tick();}
 get running():boolean{return this.state.deadline!==null;}
 get visible():boolean{return this.state.hud??this.state.started;}
 get duration():number{return this.state.activeDuration;}
 setDuration(seconds:number,mode:FocusMode=this.state.mode):void{
  if(!integer(seconds,1,MAX_FOCUS_SECONDS))throw new Error('Invalid clock duration');
  this.tick();this.state.durations[mode]=seconds;
  if(!this.state.selectedProgramId&&this.state.status==='idle'&&this.state.mode===mode){this.state.remaining=seconds;this.state.activeDuration=seconds;}
 }
 setMode(mode:FocusMode):void{if(this.state.status!=='idle'||this.state.selectedProgramId)return;this.state.mode=mode;this.state.remaining=this.state.activeDuration=this.state.durations[mode];}
 get selected(){return this.state.programs.find(p=>p.id===this.state.selectedProgramId)??null;}
 saveProgram(value:unknown){const program=focusProgramSchema.parse(value),index=this.state.programs.findIndex(p=>p.id===program.id);if(index<0){if(this.state.programs.length>=20)throw Error('Puedes guardar hasta 20 programas.');this.state.programs.push(program);}else this.state.programs[index]=program;if(this.state.status==='idle')this.reset();}
 deleteProgram(id:string){this.state.programs=this.state.programs.filter(p=>p.id!==id);if(this.state.selectedProgramId===id)this.state.selectedProgramId=null;if(this.state.status==='idle')this.reset();}
 selectProgram(id:string|null){if(this.state.status==='running'||this.state.status==='paused')throw Error('Detén el reloj antes de cambiar de programa.');if(id&&!this.state.programs.some(p=>p.id===id))throw Error('Programa no disponible.');this.state.selectedProgramId=id;this.reset();}
 setSound(value:unknown){this.state.sound=focusSoundSchema.parse(value);}
 start():void{
  if(this.running)return;
  if(this.state.status==='finished')this.reset();
  if(this.state.status==='idle'){
   this.state.run=this.selected?structuredClone(this.selected):null;this.state.stepIndex=0;this.state.mode='focus';
   this.state.remaining=this.state.activeDuration=this.state.run?.steps[0].seconds??this.state.durations.focus;
  }
  this.state.deadline=this.now()+this.state.remaining*1000;this.state.status='running';this.state.started=true;
 }
 pause():void{if(!this.running)return;this.tick();if(!this.running)return;this.state.deadline=null;this.state.status='paused';}
 stop():void{this.reset();}
 reset():void{this.state.deadline=null;this.state.status='idle';this.state.mode='focus';this.state.run=null;this.state.stepIndex=0;this.state.remaining=this.state.activeDuration=this.selected?.steps[0].seconds??this.state.durations.focus;}
 command(action:FocusCommand,value?:unknown){
  if(action==='duration'){const v=z.strictObject({mode:z.enum(['focus','break']),seconds:z.number().int().min(1).max(MAX_FOCUS_SECONDS)}).parse(value);this.setDuration(v.seconds,v.mode);}
  else if(action==='program-save')this.saveProgram(value);
  else if(action==='program-delete')this.deleteProgram(z.string().max(80).parse(value));
  else if(action==='program-select')this.selectProgram(z.string().max(80).nullable().parse(value));
  else if(action==='sound')this.setSound(value);
  else this[action]();
 }
 /** One notification for any number of elapsed phases; deadlines never accumulate callback drift. */
 tick():boolean{
  if(this.state.deadline===null)return false;
  const now=this.now();let changed=false;
  if(this.state.run){
   const run=this.state.run,cycle=run.steps.reduce((sum,s)=>sum+s.seconds*1000,0);
   if(now>=this.state.deadline){
    changed=true;
    // Whole cycles preserve the step index; bound work even after years asleep.
    if(run.repeat)this.state.deadline+=Math.floor((now-this.state.deadline)/cycle)*cycle;
    while(now>=this.state.deadline){
     if(this.state.stepIndex+1===run.steps.length&&!run.repeat){this.state.alert={id:this.state.alert.id+1,at:this.state.deadline};this.state.deadline=null;this.state.remaining=0;this.state.status='finished';return true;}
     this.state.stepIndex=(this.state.stepIndex+1)%run.steps.length;this.state.activeDuration=run.steps[this.state.stepIndex].seconds;this.state.deadline+=this.state.activeDuration*1000;
    }
   }
  }else if(now>=this.state.deadline){
   changed=true;this.state.mode=this.state.mode==='focus'?'break':'focus';
   this.state.activeDuration=this.state.durations[this.state.mode];this.state.deadline+=this.state.activeDuration*1000;
   const cycle=(this.state.durations.focus+this.state.durations.break)*1000;
   if(now>=this.state.deadline){this.state.deadline+=Math.floor((now-this.state.deadline)/cycle)*cycle;
    while(now>=this.state.deadline){this.state.mode=this.state.mode==='focus'?'break':'focus';this.state.activeDuration=this.state.durations[this.state.mode];this.state.deadline+=this.state.activeDuration*1000;}
   }
  }
  if(changed)this.state.alert={id:this.state.alert.id+1,at:this.state.deadline-this.state.activeDuration*1000};
  this.state.remaining=Math.max(0,Math.ceil((this.state.deadline-now)/1000));return changed;
 }
}

export type FocusMode='focus'|'break';
export interface FocusClockState {
 version:1;mode:FocusMode;durations:Record<FocusMode,number>;remaining:number;deadline:number|null;
 started:boolean;hud:boolean|null;position:{x:number;y:number};
}
export const FOCUS_CLOCK_KEY='studyvillage-focus-clock-v1';
export const MAX_FOCUS_SECONDS=24*60*60-1;
export const newFocusClockState=():FocusClockState=>({version:1,mode:'focus',durations:{focus:25*60,break:5*60},remaining:25*60,deadline:null,started:false,hud:null,position:{x:1,y:.16}});
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=min&&value<=max;
export function parseFocusClockState(raw:unknown):FocusClockState {
 if(!raw||typeof raw!=='object')throw new Error('Invalid clock preferences');
 const v=raw as FocusClockState;
 if(v.version!==1||!['focus','break'].includes(v.mode)||!v.durations||!integer(v.durations.focus,1,MAX_FOCUS_SECONDS)||!integer(v.durations.break,1,MAX_FOCUS_SECONDS)||!integer(v.remaining,0,MAX_FOCUS_SECONDS)||v.deadline!==null&&(!Number.isFinite(v.deadline)||v.deadline<0)||typeof v.started!=='boolean'||v.hud!==null&&typeof v.hud!=='boolean'||!v.position||![v.position.x,v.position.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))throw new Error('Invalid clock preferences');
 return {version:1,mode:v.mode,durations:{...v.durations},remaining:v.remaining,deadline:v.deadline,started:v.started,hud:v.hud,position:{...v.position}};
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
 get duration():number{return this.state.durations[this.state.mode];}
 setDuration(seconds:number):void{if(!integer(seconds,1,MAX_FOCUS_SECONDS))throw new Error('Invalid clock duration');this.state.durations[this.state.mode]=seconds;this.state.remaining=seconds;this.state.deadline=null;}
 setMode(mode:FocusMode):void{this.state.mode=mode;this.state.remaining=this.state.durations[mode];this.state.deadline=null;}
 start():void{if(this.running)return;if(this.state.remaining===0)this.state.remaining=this.duration;this.state.deadline=this.now()+this.state.remaining*1000;this.state.started=true;}
 pause():void{this.tick();this.state.deadline=null;}
 reset():void{this.state.deadline=null;this.state.remaining=this.duration;}
 /** Returns true only for the transition into completion. */
 tick():boolean{if(this.state.deadline===null)return false;this.state.remaining=Math.min(MAX_FOCUS_SECONDS,Math.max(0,Math.ceil((this.state.deadline-this.now())/1000)));if(this.state.remaining===0){this.state.deadline=null;return true;}return false;}
}

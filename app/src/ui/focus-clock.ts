import {layoutViewport,subscribeViewport} from '../input/browser-viewport';
import {currentHudProfile,loadHud,saveHud,type HudWidget} from '../input/hud-layout';
import {msg,setDisplayText,setDisplayAttribute,subscribeLanguage} from '../i18n';
import {FocusClockModel,FOCUS_CLOCK_KEY,newFocusClockState,parseFocusClockState,durationFromFields,clockParts,formatClock,type FocusMode} from './focus-clock-model';
import './study-desk.css';
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text?:string):HTMLElementTagNameMap[K]=>{const node=document.createElement(tag);node.className=cls;if(text)setDisplayText(node,msg(text));return node;};
const button=(text:string,run:()=>void,cls='sv-desk-button')=>{const b=element('button',cls,text);b.type='button';b.onclick=run;return b;};

export class FocusClock {
 readonly root=element('dialog','sv-desk-dialog sv-focus-clock');
 readonly hud=element('aside','sv-focus-hud');
 private model:FocusClockModel;private timer:ReturnType<typeof setInterval>;private unlanguage:()=>void;private unviewport:()=>void;
 private face=element('output','sv-focus-face');private ring=element('div','sv-focus-dial');private phase=element('span','sv-desk-eyebrow');private status=element('p','sv-focus-status');private error=element('p','sv-desk-error');
 private start=button('Comenzar',()=>this.toggle(),'sv-desk-button sv-desk-primary');private fields:Record<FocusMode,HTMLInputElement[]>={focus:[],break:[]};
 private hudFace=element('span','sv-focus-hud-time');private hudPhase=element('span','sv-focus-hud-mode');private hudPlay=button('',()=>this.toggle(),'sv-desk-icon-button');private switches=new Set<HTMLInputElement>();
 private valid=true;private pointer:{id:number;x:number;y:number;left:number;top:number}|null=null;
 private hudLayout:HudWidget|null=null;
 private resize=()=>this.placeHud();private visibility=()=>{if(this.model.tick())this.save();this.paint();};
 constructor(){
  let saved=newFocusClockState();try{const raw=localStorage.getItem(FOCUS_CLOCK_KEY);if(raw)saved=parseFocusClockState(JSON.parse(raw));}catch{/* Keep an unreadable preference untouched until the user changes a setting. */}this.model=new FocusClockModel(saved);
  setDisplayAttribute(this.root,'aria-label',msg('Reloj de concentración'));
  const header=element('header','sv-desk-header');const titles=element('div');titles.append(element('span','sv-desk-eyebrow','Un rato para ti'),element('h2','','Reloj de concentración'));const close=button('×',()=>this.root.close(),'sv-desk-close');setDisplayAttribute(close,'aria-label',msg('Cerrar'));header.append(titles,close);
  const body=element('div','sv-focus-body');const display=element('section','sv-focus-display');const dialInner=element('div','sv-focus-dial-inner');setDisplayAttribute(this.face,'aria-label',msg('Tiempo restante'));this.face.setAttribute('aria-live','off');dialInner.append(this.phase,this.face,element('span','sv-focus-dial-note','A tu ritmo'));this.ring.append(dialInner);this.status.setAttribute('role','status');display.append(this.ring,this.status);
  const setup=element('section','sv-focus-setup');for(const mode of ['focus','break'] as const){
   const duration=element('fieldset','sv-focus-duration');duration.append(element('legend','',mode==='focus'?'Concentración':'Descanso'));const row=element('div','sv-focus-fields');
   for(const label of ['Horas','Minutos','Segundos']){const field=element('label','sv-focus-unit'),input=element('input');input.type='text';input.inputMode='numeric';input.maxLength=2;input.autocomplete='off';setDisplayAttribute(input,'aria-label',msg('{phase}: {unit}',{phase:msg(mode==='focus'?'Concentración':'Descanso'),unit:msg(label)}));input.oninput=()=>this.readFields();input.onblur=()=>{if(this.valid)this.syncFields();};field.append(input,element('span','',label));this.fields[mode].push(input);row.append(field);}duration.append(row);setup.append(duration);
  }
  this.error.setAttribute('role','status');setup.append(this.error,element('p','sv-subtle','Los intervalos se repiten automáticamente. Los cambios se aplican al siguiente intervalo. Reiniciar detiene la sesión.'));
  const actions=element('div','sv-focus-actions');actions.append(this.start,button('Reiniciar',()=>{this.model.reset();this.valid=true;this.error.textContent='';this.syncFields();this.save();this.paint();}));setup.append(actions,this.visibilitySwitch());body.append(display,setup);this.root.append(header,body);this.root.addEventListener('close',()=>{if(!this.valid){this.valid=true;this.error.textContent='';this.syncFields();this.paint();}});
  this.buildHud();document.body.append(this.root,this.hud);this.syncFields();this.paint();this.placeHud();
  this.timer=setInterval(()=>{if(this.model.tick())this.save();this.paint();},250);this.unviewport=subscribeViewport(this.resize);document.addEventListener('visibilitychange',this.visibility);this.unlanguage=subscribeLanguage(()=>this.paint());
 }
 private readFields():void{
  const values=Object.fromEntries((['focus','break'] as const).map(mode=>[mode,durationFromFields(...this.fields[mode].map(f=>f.value) as [string,string,string])]));
  this.valid=values.focus!==null&&values.break!==null;
  for(const mode of ['focus','break'] as const)for(const input of this.fields[mode])input.setAttribute('aria-invalid',String(values[mode]===null));
  if(!this.valid)setDisplayText(this.error,msg('Elige entre 1 segundo y 23 horas, 59 minutos y 59 segundos.'));
  else{this.error.textContent='';for(const mode of ['focus','break'] as const)this.model.setDuration(values[mode]!,mode);this.save();}this.paint();
 }
 private syncFields():void{for(const mode of ['focus','break'] as const)clockParts(this.model.state.durations[mode]).forEach((value,i)=>{this.fields[mode][i].value=value;this.fields[mode][i].setAttribute('aria-invalid','false');});}
 private toggle():void{if(!this.valid)return;if(this.model.running)this.model.pause();else this.model.start();this.save();this.paint();this.placeHud();}
 private save():void{try{localStorage.setItem(FOCUS_CLOCK_KEY,JSON.stringify(this.model.state));}catch{setDisplayText(this.error,msg('El reloj sigue funcionando, pero no se pudo guardar su configuración.'));}}
 private visibilitySwitch():HTMLElement{const label=element('label','sv-desk-switch');const input=element('input');input.type='checkbox';input.checked=this.model.visible;setDisplayAttribute(input,'aria-label',msg('Mostrar reloj flotante'));input.onchange=()=>this.setHudVisible(input.checked);label.append(input,element('span','','Mostrar reloj flotante'));this.switches.add(input);return label;}
 setHudVisible(show:boolean):void{this.model.state.hud=show;this.paint();this.placeHud();this.saveHudPosition();}
 /** The clock keeps one coordinate system for its own handle and the controls editor. */
 applyHudLayout(value:HudWidget|null):void{
  this.hudLayout=value;
  this.hud.style.translate='none';this.hud.style.transformOrigin='top left';
  if(value?.color)this.hud.style.setProperty('background',value.color,'important');else this.hud.style.removeProperty('background');
  if(value){this.model.state.hud=value.visible;this.paint();const size=this.hudSize(),viewport=layoutViewport();this.positionHud(viewport.width*value.x/100-size.width/2,viewport.height*value.y/100-size.height/2);this.save();}
  else this.placeHud();
 }
 /** Mounted by the application's Settings → Controls panel. */
 settingsControl():HTMLElement{const box=element('section','sv-focus-settings');box.append(this.visibilitySwitch(),element('p','sv-subtle','Arrastra el reloj por su asa. Ocultarlo no detiene la sesión.'),button('Recolocar reloj',()=>{this.model.state.position={x:1,y:.16};this.placeHud();this.saveHudPosition();},'sv-button'));return box;}
 private buildHud():void{
  setDisplayAttribute(this.hud,'aria-label',msg('Reloj flotante'));const handle=button('⠿',()=>{},'sv-focus-hud-handle');setDisplayAttribute(handle,'aria-label',msg('Mover reloj flotante'));setDisplayAttribute(handle,'title',msg('Arrastra para mover; usa las flechas con el teclado'));
  handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();const rect=this.hud.getBoundingClientRect();this.pointer={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};handle.setPointerCapture(event.pointerId);this.hud.classList.add('is-dragging');};
  handle.onpointermove=event=>{if(this.pointer?.id!==event.pointerId)return;const p=this.pointer;this.positionHud(p.left+event.clientX-p.x,p.top+event.clientY-p.y);};
  const finish=(event:PointerEvent)=>{if(this.pointer?.id!==event.pointerId)return;this.pointer=null;this.hud.classList.remove('is-dragging');if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);this.saveHudPosition();};handle.onpointerup=finish;handle.onpointercancel=finish;
  handle.onkeydown=event=>{const direction={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[event.key];if(!direction)return;event.preventDefault();event.stopPropagation();const rect=this.hud.getBoundingClientRect();this.positionHud(rect.left+direction[0],rect.top+direction[1]);this.saveHudPosition();};
  const open=button('',()=>this.open(),'sv-focus-hud-open');setDisplayAttribute(open,'aria-label',msg('Abrir reloj de concentración'));open.append(this.hudPhase,this.hudFace);
  const hide=button('×',()=>this.setHudVisible(false),'sv-desk-icon-button');setDisplayAttribute(hide,'aria-label',msg('Ocultar reloj flotante'));this.hud.append(handle,open,this.hudPlay,hide);
 }
 private hudSize():{width:number;height:number}{const width=this.hud.offsetWidth||276,height=this.hud.offsetHeight||66,viewport=layoutViewport();const scale=Math.max(.01,Math.min(this.hudLayout?.scale??1,(viewport.width-24)/width,(viewport.height-24)/height));this.hud.style.scale=String(scale);return{width:width*scale,height:height*scale};}
 private positionHud(x:number,y:number):void{const {width,height}=this.hudSize();const maxX=Math.max(12,layoutViewport().width-width-12),maxY=Math.max(12,layoutViewport().height-height-12);const left=Math.min(maxX,Math.max(12,x)),top=Math.min(maxY,Math.max(12,y));this.model.state.position={x:maxX===12?0:(left-12)/(maxX-12),y:maxY===12?0:(top-12)/(maxY-12)};this.hud.style.left=`${left}px`;this.hud.style.top=`${top}px`;}
 private placeHud():void{const {width,height}=this.hudSize();this.positionHud(12+this.model.state.position.x*Math.max(0,layoutViewport().width-width-24),12+this.model.state.position.y*Math.max(0,layoutViewport().height-height-24));}
 private saveHudPosition():void{
  this.save();if(!this.hudLayout)return;
  const viewport=layoutViewport(),size=this.hudSize();
  const x=(parseFloat(this.hud.style.left)+size.width/2)/viewport.width*100,y=(parseFloat(this.hud.style.top)+size.height/2)/viewport.height*100;
  const value={...this.hudLayout,x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y)),visible:this.model.visible};
  try{const profile=currentHudProfile();saveHud(profile,{...loadHud(profile),clock:value});this.hudLayout=value;}catch{setDisplayText(this.error,msg('El reloj sigue funcionando, pero no se pudo guardar su configuración.'));}
 }
 private paint():void{
  const {remaining,mode}=this.model.state;this.face.textContent=formatClock(remaining);this.hudFace.textContent=formatClock(remaining);setDisplayText(this.phase,msg(mode==='focus'?'Concentración':'Descanso'));setDisplayText(this.hudPhase,msg(mode==='focus'?'Concentración':'Descanso'));this.root.dataset.mode=mode;this.hud.dataset.running=String(this.model.running);
  this.ring.style.setProperty('--clock-progress',`${Math.max(0,Math.min(1,remaining/this.model.duration))*360}deg`);setDisplayText(this.status,msg(remaining===0?'Tiempo cumplido. Respira y estírate.':this.model.running?'Un paso cada vez.':this.model.state.status==='paused'?'En pausa. Continúa cuando quieras.':'Tu siguiente paso empieza aquí.'));
  setDisplayText(this.start,msg(this.model.running?'Pausar':this.model.state.status==='paused'?'Continuar':'Comenzar'));this.start.disabled=!this.valid;this.hud.hidden=!this.model.visible;this.hudPlay.textContent=this.model.running?'Ⅱ':'▶';setDisplayAttribute(this.hudPlay,'aria-label',msg(this.model.running?'Pausar reloj':'Continuar reloj'));for(const input of this.switches)input.checked=this.model.visible;
 }
 open():void{this.visibility();if(!this.root.open)this.root.showModal();}
 dispose():void{clearInterval(this.timer);this.unlanguage();this.unviewport();document.removeEventListener('visibilitychange',this.visibility);this.root.remove();this.hud.remove();}
}

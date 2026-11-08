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
 private start=button('Comenzar',()=>this.toggle(),'sv-desk-button sv-desk-primary');private fields:HTMLInputElement[]=[];private modes=new Map<FocusMode,HTMLButtonElement>();private presets=element('div','sv-focus-presets');
 private hudFace=element('span','sv-focus-hud-time');private hudPhase=element('span','sv-focus-hud-mode');private hudPlay=button('',()=>this.toggle(),'sv-desk-icon-button');private switches=new Set<HTMLInputElement>();
 private valid=true;private pointer:{id:number;x:number;y:number;left:number;top:number}|null=null;
 private hudLayout:HudWidget|null=null;
 private resize=()=>this.placeHud();private visibility=()=>{if(this.model.tick())this.save();this.paint();};
 constructor(){
  let saved=newFocusClockState();try{const raw=localStorage.getItem(FOCUS_CLOCK_KEY);if(raw)saved=parseFocusClockState(JSON.parse(raw));}catch{/* Keep an unreadable preference untouched until the user changes a setting. */}this.model=new FocusClockModel(saved);
  setDisplayAttribute(this.root,'aria-label',msg('Reloj de concentración'));
  const header=element('header','sv-desk-header');const titles=element('div');titles.append(element('span','sv-desk-eyebrow','Un rato para ti'),element('h2','','Reloj de concentración'));const close=button('×',()=>this.root.close(),'sv-desk-close');setDisplayAttribute(close,'aria-label',msg('Cerrar'));header.append(titles,close);
  const body=element('div','sv-focus-body');const display=element('section','sv-focus-display');const dialInner=element('div','sv-focus-dial-inner');setDisplayAttribute(this.face,'aria-label',msg('Tiempo restante'));this.face.setAttribute('aria-live','off');dialInner.append(this.phase,this.face,element('span','sv-focus-dial-note','A tu ritmo'));this.ring.append(dialInner);this.status.setAttribute('role','status');display.append(this.ring,this.status);
  const setup=element('section','sv-focus-setup');const modes=element('div','sv-desk-segments');setDisplayAttribute(modes,'aria-label',msg('Tipo de sesión'));modes.setAttribute('role','group');for(const [mode,label]of [['focus','Concentración'],['break','Descanso']] as const){const b=button(label,()=>{this.model.setMode(mode);this.valid=true;this.error.textContent='';this.syncFields();this.renderPresets();this.save();this.paint();},'sv-desk-segment');this.modes.set(mode,b);modes.append(b);}
  const duration=element('fieldset','sv-focus-duration');duration.append(element('legend','','Prepara tu tiempo'));const fieldRow=element('div','sv-focus-fields');
  for(const [index,label]of ['Horas','Minutos','Segundos'].entries()){const field=element('label','sv-focus-unit');const input=element('input');input.type='text';input.inputMode='numeric';input.maxLength=2;input.autocomplete='off';input.spellcheck=false;setDisplayAttribute(input,'aria-label',msg(label));input.addEventListener('input',()=>this.readFields());input.addEventListener('blur',()=>{if(this.valid)this.syncFields();});input.addEventListener('keydown',event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();const max=index===0?23:59;input.value=String(Math.min(max,Math.max(0,(Number(input.value)||0)+(event.key==='ArrowUp'?1:-1))));this.readFields();}});field.append(input,element('span','',label));this.fields.push(input);fieldRow.append(field);}
  duration.append(fieldRow);this.error.setAttribute('role','status');setup.append(modes,duration,this.presets,this.error);
  const actions=element('div','sv-focus-actions');actions.append(this.start,button('Reiniciar',()=>{this.model.reset();this.valid=true;this.error.textContent='';this.syncFields();this.save();this.paint();}));setup.append(actions,this.visibilitySwitch());body.append(display,setup);this.root.append(header,body);this.root.addEventListener('close',()=>{if(!this.valid){this.valid=true;this.error.textContent='';this.syncFields();this.paint();}});
  this.buildHud();document.body.append(this.root,this.hud);this.syncFields();this.renderPresets();this.paint();this.placeHud();
  this.timer=setInterval(()=>{if(this.model.tick())this.save();this.paint();},250);this.unviewport=subscribeViewport(this.resize);document.addEventListener('visibilitychange',this.visibility);this.unlanguage=subscribeLanguage(()=>this.paint());
 }
 private readFields():void{const value=durationFromFields(this.fields[0].value,this.fields[1].value,this.fields[2].value);this.valid=value!==null;for(const input of this.fields)input.setAttribute('aria-invalid',String(!this.valid));if(value===null)setDisplayText(this.error,msg('Elige entre 1 segundo y 23 horas, 59 minutos y 59 segundos.'));else{this.error.textContent='';this.model.setDuration(value);this.save();}this.paint();}
 private syncFields():void{clockParts(this.model.duration).forEach((value,i)=>{this.fields[i].value=value;this.fields[i].setAttribute('aria-invalid','false');});}
 private renderPresets():void{this.presets.replaceChildren();for(const minutes of this.model.state.mode==='focus'?[25,50,90]:[5,10,15]){const b=button('',()=>{this.model.setDuration(minutes*60);this.valid=true;this.error.textContent='';this.syncFields();this.save();this.paint();},'sv-desk-chip');b.dataset.seconds=String(minutes*60);setDisplayText(b,msg('{n} min',{n:minutes}));this.presets.append(b);}}
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
  this.ring.style.setProperty('--clock-progress',`${Math.max(0,Math.min(1,remaining/this.model.duration))*360}deg`);setDisplayText(this.status,msg(remaining===0?'Tiempo cumplido. Respira y estírate.':this.model.running?'Un paso cada vez.':remaining!==this.model.duration?'En pausa. Continúa cuando quieras.':'Tu siguiente paso empieza aquí.'));
  setDisplayText(this.start,msg(this.model.running?'Pausar':remaining>0&&remaining<this.model.duration?'Continuar':'Comenzar'));this.start.disabled=!this.valid;for(const input of this.fields)input.disabled=this.model.running;for(const b of this.presets.querySelectorAll('button')){b.disabled=this.model.running;b.setAttribute('aria-pressed',String(Number(b.dataset.seconds)===this.model.duration));}
  for(const [value,b]of this.modes){b.setAttribute('aria-pressed',String(value===mode));b.disabled=this.model.running;}this.hud.hidden=!this.model.visible;this.hudPlay.textContent=this.model.running?'Ⅱ':'▶';setDisplayAttribute(this.hudPlay,'aria-label',msg(this.model.running?'Pausar reloj':'Continuar reloj'));for(const input of this.switches)input.checked=this.model.visible;
 }
 open():void{this.visibility();if(!this.root.open)this.root.showModal();}
 dispose():void{clearInterval(this.timer);this.unlanguage();this.unviewport();document.removeEventListener('visibilitychange',this.visibility);this.root.remove();this.hud.remove();}
}

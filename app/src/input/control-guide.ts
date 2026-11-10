import './control-guide.css';
import {msg,setDisplayText,setDisplayAttribute,t} from '../i18n';
import {controllerArt,controlIcon} from './controller-art';
import {guideActions,POSITION_LABELS,type GuideAction,type GuideContext,type ControlTarget} from './control-guide-model';

function text<K extends keyof HTMLElementTagNameMap>(tag:K,label:string,className=''){
 const el=document.createElement(tag);el.className=className;setDisplayText(el,msg(label));return el;
}
export class ControlGuide {
 readonly root=document.createElement('dialog');
 private context:GuideContext='menu';private available:GuideContext[]=[];private phone=false;private kind='';
 private device:'gamepad'|'keyboard'='gamepad';private selected='';
 private connection=document.createElement('p');private content=document.createElement('div');private tabs=document.createElement('nav');
 private pressed=new Map<ControlTarget,number>();private highlights:Element[]=[];private rows:HTMLButtonElement[]=[];
 constructor(){
  this.root.className='sv-controls-guide';setDisplayAttribute(this.root,'aria-label',msg('Controles'));
  // Native dialog retains Tab/Enter/Escape behavior, without forwarding keystrokes to the world.
  this.root.addEventListener('keydown',e=>e.stopPropagation());
  const header=document.createElement('header'),heading=document.createElement('div');
  heading.append(text('p','StudyVillage','sv-guide-eyebrow'),text('h2','Controles del mando'));
  const close=text('button','Volver','sv-button sv-guide-close');close.type='button';close.onclick=()=>this.root.close();header.append(heading,close);
  const modes=document.createElement('div');modes.className='sv-guide-modes';setDisplayAttribute(modes,'aria-label',msg('Dispositivo de entrada'));modes.setAttribute('role','group');
  for(const [mode,label]of [['gamepad','Mando'],['keyboard','Teclado']]as const){const b=text('button',label);b.type='button';b.dataset.device=mode;b.onclick=()=>{this.device=mode;for(const button of modes.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===b));this.render();};modes.append(b);}
  this.connection.className='sv-guide-connection';this.connection.setAttribute('role','status');this.tabs.className='sv-guide-contexts';setDisplayAttribute(this.tabs,'aria-label',msg('Contexto de los controles'));
  this.content.className='sv-guide-content';this.root.append(header,modes,this.connection,this.tabs,this.content);
 }
 open(context:GuideContext,phone:boolean,kind:string){this.context=context;this.phone=phone;this.kind=kind;this.selected='';this.device='gamepad';this.available=['world','menu',...(kind==='tetris'?['tetris' as const]:[])];this.pressed.clear();
  this.root.querySelectorAll<HTMLButtonElement>('[data-device]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.device===this.device)));this.renderTabs();this.render();this.root.showModal();this.root.querySelector<HTMLButtonElement>('.sv-guide-close')!.focus();
 }
 setConnection(label:string,ready:boolean){setDisplayText(this.connection,msg(label));this.connection.dataset.ready=String(ready);}
 private renderTabs(){this.tabs.replaceChildren();for(const context of this.available){const label=context==='world'?'Exploración':context==='tetris'?'Forest Blocks':'Navegación';const b=text('button',label);b.type='button';b.dataset.context=context;b.setAttribute('aria-pressed',String(this.context===context));b.onclick=()=>{this.context=context;this.selected='';for(const tab of this.tabs.querySelectorAll('button'))tab.setAttribute('aria-pressed',String(tab===b));this.render();};this.tabs.append(b);}}
 private render(){
  this.content.replaceChildren();this.rows=[];this.highlights=[];
  const actions=guideActions(this.context,this.phone);
  this.content.append(text('p',this.device==='gamepad'?'Guíate por la posición, sea cual sea tu mando.':'Atajos de teclado','sv-guide-intro'));
  if(this.device==='keyboard'){
   const list=document.createElement('dl');list.className='sv-guide-keyboard';
   for(const action of actions.filter(a=>a.keys.length)){const dt=text('dt',action.label),dd=document.createElement('dd');for(const key of action.keys){const kbd=document.createElement('kbd');kbd.textContent=({ArrowLeft:'←',ArrowRight:'→',ArrowDown:'↓',ArrowUp:'↑',' ':t('Espacio')} as Record<string,string>)[key]??key;dd.append(kbd);}list.append(dt,dd);}
   this.content.append(list);
  }else{
   const layout=document.createElement('div');layout.className='sv-guide-layout';
   const left=document.createElement('div'),right=document.createElement('div');left.className='sv-guide-actions sv-guide-left';right.className='sv-guide-actions sv-guide-right';
   const figure=document.createElement('figure');figure.className='sv-controller-diagram';figure.append(controllerArt());
   const caption=text('figcaption','Selecciona una acción o pulsa un botón para verlo en el mando.');figure.append(caption);
   for(const [group,label,side]of [['movement','Movimiento',left],['actions','Acciones',right],['navigation','Navegación',this.context==='menu'?right:left]]as const){const grouped=actions.filter(a=>a.group===group);if(!grouped.length)continue;side.append(text('h3',label));for(const action of grouped)side.append(this.row(action,actions));}
   layout.append(left,figure,right);this.content.append(layout);
   const note=text('p','La posición de los sticks puede variar. Los botones iluminados indican su función, no su marca.','sv-guide-note');this.content.append(note);
   this.highlights=[...figure.querySelectorAll('[data-pad]')];this.paint();
  }
  if(this.kind==='gartic'&&this.context==='menu')this.content.append(text('p','Para escribir y dibujar en Gartic, utiliza teclado, ratón o pantalla táctil.','sv-guide-note'));
  if(this.context==='tetris')this.content.append(text('p','En línea, la partida continúa mientras consultas los controles.','sv-guide-note'));
 }
 private row(action:GuideAction,actions:GuideAction[]){
  const b=document.createElement('button');b.type='button';b.className='sv-guide-action';b.dataset.action=action.id;b.dataset.targets=action.targets.join(',');b.setAttribute('aria-pressed',String(this.selected===action.id));
  const labels=document.createElement('span');labels.append(text('strong',action.label));
  const position=document.createElement('small');const primary=action.targets[0];setDisplayText(position,msg(action.id==='move'||action.id==='navigate'?'Stick izquierdo / cruceta':POSITION_LABELS[String(primary)]));labels.append(position);b.append(controlIcon(action.targets),labels);
  const select=()=>{this.selected=action.id;for(const row of this.rows)row.setAttribute('aria-pressed',String(row===b));this.paint(actions);};b.onclick=select;b.onfocus=select;this.rows.push(b);return b;
 }
 private paint(actions=guideActions(this.context,this.phone)){
  const targets=actions.find(a=>a.id===this.selected)?.targets??[];
  for(const node of this.highlights){const id=node.getAttribute('data-pad')!,target:ControlTarget=/^\d+$/.test(id)?Number(id):id as ControlTarget;node.classList.toggle('is-selected',targets.includes(target));node.classList.toggle('is-pressed',this.pressed.has(target));}
  for(const row of this.rows)row.classList.toggle('is-live',row.dataset.targets!.split(',').some(id=>this.pressed.has(/^\d+$/.test(id)?Number(id):id as ControlTarget)));
 }
 /** Keep short taps visible, without replacing DOM or stealing menu focus. */
 sample(buttons:ReadonlySet<number>,axes:readonly number[],now:number){if(!this.root.open)return;for(const i of buttons)this.pressed.set(i,now+160);if(Math.abs(axes[0]??0)>.25||Math.abs(axes[1]??0)>.25)this.pressed.set('left-stick',now+160);if(Math.abs(axes[2]??0)>.25||Math.abs(axes[3]??0)>.25)this.pressed.set('right-stick',now+160);for(const [key,until]of this.pressed)if(now>until)this.pressed.delete(key);this.paint();}
}

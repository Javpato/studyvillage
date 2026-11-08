import {msg,setDisplayText,setDisplayAttribute} from '../i18n';
export function axisDirection(value:number,deadZone=.25):number{return Math.abs(value)<deadZone?0:Math.sign(value);}
export class GamepadController {
 readonly root=document.createElement('section');
 private enabled=true;private selected=-1;private frame=0;private held=new Set<string>();private previous=new Set<number>();private context='';private nextRepeat=0;private status=document.createElement('p');private meter=document.createElement('pre');private statusKey='';private select=document.createElement('select');private signature='';
 constructor(private readonly worldKey:(key:string,down:boolean)=>void,private readonly contextOf:()=> 'world'|'game'|'menu',private readonly gameKey:(key:string)=>void,private readonly gameMenu:()=>void){
  try{this.enabled=localStorage.getItem('studyvillage-gamepad')!=='off';}catch{}
  const title=document.createElement('h3');setDisplayText(title,msg('Mando'));
  const guide=document.createElement('p');setDisplayText(guide,msg('Conecta el mando por USB o emparéjalo en los ajustes Bluetooth del dispositivo. Vuelve aquí y pulsa un botón para detectarlo.'));
  const scope=document.createElement('p');setDisplayText(scope,msg('Usa el mando para recorrer menús, moverte por la aldea y jugar. Para escribir y dibujar utiliza teclado, ratón o pantalla táctil.'));
  const label=document.createElement('label'),enable=document.createElement('input');enable.type='checkbox';enable.checked=this.enabled;const labelText=document.createElement('span');setDisplayText(labelText,msg('Activar mando'));label.append(enable,labelText);enable.onchange=()=>{this.enabled=enable.checked;this.release();try{localStorage.setItem('studyvillage-gamepad',this.enabled?'on':'off');}catch{}};
  setDisplayAttribute(this.select,'aria-label',msg('Mando'));this.select.onchange=()=>{this.release();this.selected=Number(this.select.value);this.previous.clear();};
  const help=document.createElement('p');setDisplayText(help,msg('Menús: cruceta para navegar, botón inferior para aceptar y derecho para volver; LB/RB anterior/siguiente; palanca derecha para desplazar. Aldea: palanca izquierda, botón inferior para interactuar, RT para correr y Start para el teléfono. Bloques: cruceta para mover, inferior/derecho para girar, superior para caída, izquierdo para reservar, LB/RB/LT para poderes y Start para el menú.'));
  this.status.setAttribute('role','status');this.root.append(title,guide,scope,label,this.select,this.status,this.meter,help);
  window.addEventListener('blur',this.release);document.addEventListener('visibilitychange',this.release);this.frame=requestAnimationFrame(this.tick);
 }
 private release=()=>{for(const key of this.held)this.worldKey(key,false);this.held.clear();};
 private menuScope():HTMLElement{
  const dialog=[...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(e=>e.getClientRects().length).at(-1);if(dialog)return dialog;
  return [...document.querySelectorAll<HTMLElement>('.sv-phone:not([hidden]),.sv-activity:not([hidden]),.sv-lock-overlay:not([hidden]),.sv-garden-tray:not([hidden])')].filter(e=>e.getClientRects().length).at(-1)??document.body;
 }
 private focus(delta:number){const scope=this.menuScope(),items=[...scope.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex="0"],summary')].filter(e=>!e.closest('[hidden],[inert]')&&e.getClientRects().length&&!(e as HTMLButtonElement).disabled);if(!items.length)return;const current=items.indexOf(document.activeElement as HTMLElement),next=items[(current+delta+items.length)%items.length];next.focus();next.scrollIntoView({block:'nearest',inline:'nearest'});}
 private tick=(now:number)=>{
  this.frame=requestAnimationFrame(this.tick);
  let pads:Gamepad[]=[];try{pads=[...(navigator.getGamepads?.()??[])].filter((p):p is Gamepad=>!!p&&p.connected);}catch{}
  const signature=pads.map(p=>`${p.index}:${p.id}:${p.mapping}`).join('|');if(signature!==this.signature){this.signature=signature;this.select.replaceChildren();for(const pad of pads){const option=document.createElement('option');option.value=String(pad.index);option.textContent=pad.id;this.select.append(option);}if(!pads.some(p=>p.index===this.selected))this.selected=pads[0]?.index??-1;this.select.value=String(this.selected);this.release();this.previous.clear();}
  const pad=pads.find(p=>p.index===this.selected);
  const statusKey=!navigator.getGamepads?'Este navegador no admite mandos.':!pad?'Conecta un mando y pulsa un botón.':pad.mapping!=='standard'?'Este mando no tiene una distribución estándar compatible.':'Mando conectado';if(statusKey!==this.statusKey){this.statusKey=statusKey;setDisplayText(this.status,msg(statusKey));}
  if(!this.root.closest('[hidden]')&&this.root.getClientRects().length)this.meter.textContent=pad?`${pad.buttons.map((b,i)=>b.pressed?i:'·').join(' ')}\n${pad.axes.map(a=>a.toFixed(2)).join(' ')}`:'';
  if(!pad||pad.mapping!=='standard'||!this.enabled||document.hidden||!document.hasFocus()){this.release();this.previous.clear();return;}
  const pressed=new Set(pad.buttons.flatMap((b,i)=>b.pressed?[i]:[])),edge=(i:number)=>pressed.has(i)&&!this.previous.has(i);
  const context=this.contextOf();if(context!==this.context){this.release();this.context=context;this.previous=pressed;return;}
  const x=axisDirection(pad.axes[0]??0),y=axisDirection(pad.axes[1]??0);
  if(context==='world'){
   const keys=new Set<string>();if(x<0||pressed.has(14))keys.add('ArrowLeft');if(x>0||pressed.has(15))keys.add('ArrowRight');if(y<0||pressed.has(12))keys.add('ArrowUp');if(y>0||pressed.has(13))keys.add('ArrowDown');if(pressed.has(7))keys.add('Shift');
   for(const key of this.held)if(!keys.has(key))this.worldKey(key,false);for(const key of keys)if(!this.held.has(key))this.worldKey(key,true);this.held=keys;
   if(edge(0)){this.worldKey('e',true);this.worldKey('e',false);}if(edge(9)){this.release();this.worldKey('m',true);this.worldKey('m',false);}
  }else if(context==='game'){
   if(x<0)pressed.add(14);if(x>0)pressed.add(15);if(y>0)pressed.add(13);
   const repeat=now>=this.nextRepeat;for(const [i,key]of [[14,'left'],[15,'right'],[13,'down'],[0,'cw'],[1,'ccw'],[3,'drop'],[2,'hold'],[4,'shield'],[5,'moss'],[6,'roots']] as const)if(edge(i)||(i>=13&&pressed.has(i)&&repeat))this.gameKey(key);
   if(repeat)this.nextRepeat=now+100;if(edge(9))this.gameMenu();
  }else{
   const direction=pressed.has(12)||pressed.has(14)||x<0||y<0?-1:pressed.has(13)||pressed.has(15)||x>0||y>0?1:0;
   const field=document.activeElement;const selecting=field instanceof HTMLSelectElement&&(pressed.has(12)||pressed.has(13)||y!==0);
   if(selecting&&direction&&now>=this.nextRepeat){field.selectedIndex=Math.max(0,Math.min(field.options.length-1,field.selectedIndex+direction));field.dispatchEvent(new Event('change',{bubbles:true}));this.nextRepeat=now+220;}
   else if(field instanceof HTMLInputElement&&field.type==='range'&&direction&&now>=this.nextRepeat){if(direction>0)field.stepUp();else field.stepDown();field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));this.nextRepeat=now+120;}
   else if((direction&&now>=this.nextRepeat)||edge(4)||edge(5)){this.focus(edge(4)?-1:edge(5)?1:direction);this.nextRepeat=now+220;}
   if(edge(0)){const el=document.activeElement as HTMLElement;if(el?.closest('button,a,input,summary'))el.click();}

   if(edge(9)&&document.querySelector('.sv-activity[data-kind=tetris]:not([hidden])'))this.gameMenu();
   else if(edge(1)||edge(9)){const dialog=this.menuScope();if(dialog instanceof HTMLDialogElement)dialog.close();else {this.worldKey('Escape',true);this.worldKey('Escape',false);}}
   if(Math.abs(pad.axes[3]??0)>.25)this.menuScope().scrollBy(0,(pad.axes[3]??0)*18);
  }
  this.previous=pressed;
 };
 dispose(){cancelAnimationFrame(this.frame);this.release();window.removeEventListener('blur',this.release);document.removeEventListener('visibilitychange',this.release);}
}

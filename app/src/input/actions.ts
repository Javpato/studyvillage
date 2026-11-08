export type InputDevice='keyboard'|'gamepad'|'touch';
export type ControlAction='confirm'|'cancel'|'menu'|'controls'|'edit'|'previous'|'next'|'interact'|'run'|'left'|'right'|'up'|'down'|'cw'|'ccw'|'drop'|'hold'|'shield'|'moss'|'roots';
export interface Binding {action:ControlAction;button:number;label:string;keys:string[];repeat?:boolean}
export const MENU_BINDINGS:Binding[]=[{action:'confirm',button:0,label:'Confirmar',keys:['Enter']},{action:'cancel',button:1,label:'Volver',keys:['Escape']},{action:'previous',button:4,label:'Anterior',keys:['Shift+Tab']},{action:'next',button:5,label:'Siguiente',keys:['Tab']},{action:'controls',button:8,label:'Controles',keys:['F1']},{action:'menu',button:9,label:'Menú',keys:['Escape']},{action:'edit',button:2,label:'Editar teléfono',keys:['F2']}];
export const TETRIS_BINDINGS:Binding[]=[
 {action:'left',button:14,label:'Mover a la izquierda',keys:['ArrowLeft'],repeat:true},{action:'right',button:15,label:'Mover a la derecha',keys:['ArrowRight'],repeat:true},{action:'down',button:13,label:'Bajar',keys:['ArrowDown'],repeat:true},
 {action:'cw',button:0,label:'Girar a la derecha',keys:['ArrowUp','x']},{action:'ccw',button:1,label:'Girar a la izquierda',keys:['z']},{action:'drop',button:3,label:'Caída inmediata',keys:['Shift',' ']},{action:'hold',button:2,label:'Reservar',keys:['e','c']},{action:'shield',button:4,label:'Escudo',keys:['1']},{action:'moss',button:5,label:'Musgo',keys:['2']},{action:'roots',button:6,label:'Raíces',keys:['3']}];
export const WORLD_BINDINGS:Binding[]=[{action:'interact',button:0,label:'Interactuar',keys:['e']},{action:'run',button:7,label:'Correr',keys:['Shift']},{action:'menu',button:9,label:'Teléfono',keys:['m']}];
export const INPUT_TIMING={deadZone:.25,repeatDelay:300,repeatEvery:100};
export function axisDirection(value:number,deadZone=INPUT_TIMING.deadZone):number{return Number.isFinite(value)&&Math.abs(value)>=deadZone?Math.sign(value):0;}
export function keyboardGameAction(key:string){return TETRIS_BINDINGS.find(b=>b.keys.includes(key)||b.keys.includes(key.toLowerCase()))?.action;}
let device:InputDevice='keyboard',family='generic';const listeners=new Set<()=>void>();
export const activeInput=()=>device;
export function setActiveInput(next:InputDevice,id=''){const nextFamily=/dualsense|dualshock|playstation|054c/i.test(id)?'playstation':/xbox|xinput|045e/i.test(id)?'xbox':'generic';if(device===next&&(next!=='gamepad'||family===nextFamily))return;device=next;if(next==='gamepad')family=nextFamily;for(const fn of listeners)fn();}
export function onInputChange(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function buttonGlyph(index:number):string{const generic=['◇↓','◇→','◇←','◇↑','LB','RB','LT','RT','View','Start','L3','R3','↑','↓','←','→'];if(index<4)return family==='playstation'?['✕','○','□','△'][index]:family==='xbox'?['A','B','X','Y'][index]:generic[index];return generic[index]??'•';}
export function interactionGlyph(){return device==='gamepad'?buttonGlyph(WORLD_BINDINGS[0].button):device==='touch'?'◎':'E';}
/** Deterministic edge/repeat handling, shared by every input context. */
export class PressRepeater {private due=new Map<string,number>();press(id:string,down:boolean,now:number,repeat=false){if(!down){this.due.delete(id);return false;}const due=this.due.get(id);if(due===undefined){this.due.set(id,now+INPUT_TIMING.repeatDelay);return true;}if(repeat&&now>=due){this.due.set(id,now+INPUT_TIMING.repeatEvery);return true;}return false;}clear(){this.due.clear();}}

import {DIRECTION_BUTTONS, GAME_MENU_BINDING, MENU_BINDINGS, TETRIS_BINDINGS, WORLD_BINDINGS, type Binding} from './actions';

export type GuideContext = 'world' | 'menu' | 'tetris';
export type ControlTarget = number | 'left-stick' | 'right-stick';
export interface GuideAction {
 id:string; label:string; targets:ControlTarget[]; keys:string[];
 group:'movement'|'actions'|'navigation';
}
const menu = (action:string) => MENU_BINDINGS.find(b=>b.action===action)!;
const entry = (b:Binding, group:GuideAction['group']='actions'):GuideAction => ({id:b.action,label:b.label,targets:[b.button],keys:b.keys,group});
/** The guide references the exact bindings consumed by GamepadController and keyboardGameAction. */
export function guideActions(context:GuideContext, phone=false):GuideAction[] {
 const directions=Object.values(DIRECTION_BUTTONS);
 const navigation:GuideAction[]=[
  {id:'navigate',label:'Navegar',targets:['left-stick',...directions],keys:['Tab','Shift+Tab'],group:'movement'},
  {id:'scroll',label:'Desplazar',targets:['right-stick'],keys:[],group:'movement'},
  ...['confirm','cancel','previous','next','controls'].map(a=>entry(menu(a),'navigation')),
 ];
 if(context==='menu')return [...navigation,...(phone?[entry(menu('edit'))]:[])];
 if(context==='world')return [
  {id:'move',label:'Caminar',targets:['left-stick',...directions],keys:['W A S D','↑ ← ↓ →'],group:'movement'},
  ...WORLD_BINDINGS.map(b=>entry(b,b.action==='run'?'movement':'actions')),
  entry(menu('controls'),'navigation'),
  {id:'back',label:'Volver',targets:[],keys:['Escape'],group:'navigation'},
 ];
 return [...TETRIS_BINDINGS.map(b=>({...entry(b,['left','right','down'].includes(b.action)?'movement':'actions'),targets:[b.button,...(['left','right','down'].includes(b.action)?['left-stick' as const]:[])]})),entry(GAME_MENU_BINDING,'navigation'),entry(menu('controls'),'navigation')];
}
export const POSITION_LABELS:Record<string,string>={
 0:'Botón inferior',1:'Botón derecho',2:'Botón izquierdo',3:'Botón superior',
 4:'Botón superior izquierdo',5:'Botón superior derecho',6:'Gatillo izquierdo',7:'Gatillo derecho',
 8:'Botón central izquierdo',9:'Botón central derecho',10:'Stick izquierdo',11:'Stick derecho',
 12:'Cruceta arriba',13:'Cruceta abajo',14:'Cruceta izquierda',15:'Cruceta derecha',
 'left-stick':'Stick izquierdo','right-stick':'Stick derecho',
};

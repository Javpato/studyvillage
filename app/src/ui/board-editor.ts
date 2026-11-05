import type { BoardPoint, BoardStroke, BoardTextStyle } from '../../../packages/core/src/protocol/types';
import { LIMITS } from '../../../packages/core/src/protocol/types';
import { AppError, errorMessage } from '../errors/messages';
import { msg, t, setDisplayText, setDisplayAttribute } from '../i18n';
function existingColor(stroke:BoardStroke|null,fallback:string):string{return stroke?.color??fallback;}
import { DEFAULT_TEXT_STYLE, selectionBounds, objectBounds, contains, selectedByArea, moveObjects, scaleObjects, clipboardText, validateClipboard } from '../whiteboard/selection';
import type { BoardCamera, BoardRect } from '../../../packages/core/src/whiteboard/model';
interface Context {
 wrap:HTMLElement;canvas:HTMLCanvasElement;board():string;author():string;strokes():BoardStroke[];all():BoardStroke[];canEdit():boolean;
 /** True on the boards of my own house: I may change anyone's layer there. */ moderate():boolean;
 camera():BoardCamera;world(event:MouseEvent):BoardPoint;commit(changes:BoardStroke[]):Promise<void>;changed():void;notify(text:string):void;
}
interface Command {before:BoardStroke[];after:BoardStroke[]}
interface Gesture {kind:'area'|'move'|'scale'|'wrap';pointer:number;origin:BoardPoint;path:BoardPoint[];base:BoardStroke[];bounds:BoardRect|null}
let internalClipboard='';let systemClipboard='';
function element<K extends keyof HTMLElementTagNameMap>(tag:K,label=''):HTMLElementTagNameMap[K]{const e=document.createElement(tag);if(label)setDisplayText(e,msg(label));return e;}
function button(label:string,fn:()=>void):HTMLButtonElement{const b=element('button',label);b.type='button';b.onclick=fn;return b;}
export class BoardEditor {
 readonly root=element('div');readonly style:BoardTextStyle={...DEFAULT_TEXT_STYLE};
 selected=new Set<string>();private board='';private gesture:Gesture|null=null;private preview:BoardStroke[]|null=null;private lasso=false;private active=false;private busy=false;
 private histories=new Map<string,{undo:Command[];redo:Command[]}>();private editor:HTMLTextAreaElement|null=null;private editing:BoardStroke|null=null;private textAt:BoardPoint|null=null;
 private clipboardOffset=0;private paintVersion=0;private textTool=false;private textColor='#315f51';private formatOpen=false;
 constructor(private ctx:Context){this.root.className='sv-board-context';ctx.wrap.append(this.root);this.renderToolbar();}
 setActive(active:boolean,textTool=false):void{if(this.active!==active||this.textTool!==textTool){this.active=active;this.textTool=textTool;this.renderToolbar();}}
 get version():number{return this.paintVersion;}
 private changed():void{this.paintVersion++;this.ctx.changed();}
 sync():void{if(this.board!==this.ctx.board()){this.cancel();this.selected.clear();this.board=this.ctx.board();this.renderToolbar();}for(const id of this.selected)if(!this.ctx.strokes().some(s=>s.id===id&&!s.deleted))this.selected.delete(id);}
 private history(){const id=this.ctx.board();if(!this.histories.has(id))this.histories.set(id,{undo:[],redo:[]});return this.histories.get(id)!;}
 canUndo():boolean{return this.history().undo.length>0;}canRedo():boolean{return this.history().redo.length>0;}
 private selectedObjects():BoardStroke[]{if(!this.selected.size)return[];return this.ctx.strokes().filter(s=>this.selected.has(s.id)&&!s.deleted);}
 displayed(strokes:BoardStroke[]):BoardStroke[]{if(!this.preview)return strokes;const byId=new Map(this.preview.map(s=>[s.id,s]));return strokes.map(s=>byId.get(s.id)??s);}
 private owned(strokes:BoardStroke[]):void{if(!this.ctx.canEdit())throw new AppError('invalid',t('Esta pizarra es de solo lectura.'));if(!this.ctx.moderate()&&strokes.some(s=>s.author!==this.ctx.author()))throw new AppError('invalid',t('Los objetos de otras personas están bloqueados. Puedes copiarlos para crear tu propia versión.'));}
 async apply(changes:BoardStroke[],record=true):Promise<boolean>{
  if(this.busy)return false;try{this.owned(changes);const all=this.ctx.all();const next=changes.map(s=>({...structuredClone(s),boardId:this.ctx.board(),seq:Math.max(s.seq,all.find(x=>x.id===s.id)?.seq??0)+1}));
   if(next.length>128||new TextEncoder().encode(JSON.stringify(next)).length>45000)throw new AppError('invalid',t('La selección es demasiado grande. Selecciona una zona más pequeña.'));
   const before=next.flatMap(s=>{const old=all.find(x=>x.id===s.id);return old?[structuredClone(old)]:[];});this.busy=true;this.renderToolbar();await this.ctx.commit(next);
   if(record){const h=this.history();h.undo.push({before,after:structuredClone(next)});if(h.undo.length>100)h.undo.shift();h.redo=[];}this.changed();return true;
  }catch(error){this.ctx.notify(errorMessage(error));return false;}finally{this.busy=false;this.renderToolbar();this.ctx.changed();}
 }
 async undo():Promise<void>{await this.restore(false);}async redo():Promise<void>{await this.restore(true);}
 private async restore(redo:boolean):Promise<void>{const h=this.history(),source=redo?h.redo:h.undo,target=redo?h.undo:h.redo,command=source.at(-1);if(!command||this.busy)return;
  const expected=redo?command.before:command.after,desired=redo?command.after:command.before;const current=this.ctx.all();const ids=new Set([...expected,...desired].map(s=>s.id));const changes:BoardStroke[]=[];
  for(const id of ids){const now=current.find(s=>s.id===id);const want=desired.find(s=>s.id===id);if(!want){if(now&&!now.deleted)changes.push({...now,deleted:true});continue;}
   if(now?.deleted&&!want.deleted){const replacement=crypto.randomUUID();for(const list of [command.before,command.after])for(const s of list)if(s.id===id)s.id=replacement;changes.push({...want,id:replacement,seq:0});}
   else changes.push({...want,seq:now?.seq??0});}
  if(await this.apply(changes,false)){source.pop();target.push(command);this.selected.clear();this.renderToolbar();}
 }
 pointerDown(event:PointerEvent,selectMode:boolean):boolean{this.sync();if(!selectMode)return false;if(event.button!==0)return false;
  const at=this.ctx.world(event),objects=this.selectedObjects(),bounds=selectionBounds(objects),pad=12/Math.max(.05,this.ctx.camera().zoom*this.ctx.canvas.clientWidth/768);
  const wrap=objects.length===1&&objects[0].tool==='text'&&!!bounds&&Math.hypot(at.x-(bounds.x+bounds.w),at.y-(bounds.y+bounds.h/2))<=pad;
  const scale=!!bounds&&Math.hypot(at.x-(bounds.x+bounds.w),at.y-(bounds.y+bounds.h))<=pad*1.4;
  if(wrap||scale||bounds&&contains(bounds,at,pad)){try{this.owned(objects);}catch(e){this.ctx.notify(errorMessage(e));return true;}this.gesture={kind:wrap?'wrap':scale?'scale':'move',pointer:event.pointerId,origin:at,path:[at],base:structuredClone(objects),bounds};}
  else{const hit=[...this.ctx.strokes()].reverse().find(s=>!s.deleted&&contains(objectBounds(s),at,pad));if(hit&&!event.shiftKey){this.selected=new Set([hit.id]);this.gesture={kind:'move',pointer:event.pointerId,origin:at,path:[at],base:[structuredClone(hit)],bounds:objectBounds(hit)};}else{if(!event.shiftKey)this.selected.clear();this.gesture={kind:'area',pointer:event.pointerId,origin:at,path:[at],base:[],bounds:null};}}
  this.ctx.canvas.setPointerCapture(event.pointerId);this.renderToolbar();this.changed();event.preventDefault();return true;
 }
 pointerMove(event:PointerEvent):boolean{const g=this.gesture;if(!g||g.pointer!==event.pointerId)return false;const at=this.ctx.world(event);if(g.kind==='area'){if(g.path.length<2000)g.path.push(at);}else if(this.ctx.moderate()||g.base.every(s=>s.author===this.ctx.author()))this.preview=g.kind==='wrap'?g.base.map(s=>({...s,textStyle:{...DEFAULT_TEXT_STYLE,...s.textStyle,boxWidth:Math.max(24,Math.min(4000,at.x-g.bounds!.x))}})):g.kind==='move'?moveObjects(g.base,at.x-g.origin.x,at.y-g.origin.y):scaleObjects(g.base,g.bounds!,Math.max(.1,(at.x-g.bounds!.x)/g.bounds!.w));this.changed();return true;}
 pointerUp(event:PointerEvent):boolean{const g=this.gesture;if(!g||g.pointer!==event.pointerId)return false;this.gesture=null;if(this.ctx.canvas.hasPointerCapture(event.pointerId))this.ctx.canvas.releasePointerCapture(event.pointerId);
  if(event.type==='pointercancel'){this.preview=null;this.changed();return true;}
  if(g.kind==='area'){for(const s of selectedByArea(this.ctx.strokes(),g.path,this.lasso))this.selected.add(s.id);this.renderToolbar();this.changed();}
  else if(this.preview){const changes=this.preview;this.preview=null;void this.apply(changes);}return true;
 }
 cancelGesture():void{this.gesture=null;this.preview=null;this.changed();}
 cancel():void{this.cancelGesture();if(this.editor){this.editor.remove();this.editor=null;}this.editing=null;this.textAt=null;}
 deselect():boolean{if(this.editor){this.cancel();return true;}if(this.gesture||this.selected.size){this.cancel();this.selected.clear();this.renderToolbar();return true;}return false;}
 editAt(at:BoardPoint):boolean{const hit=[...this.ctx.strokes()].reverse().find(s=>s.tool==='text'&&!s.deleted&&contains(objectBounds(s),at,10/this.ctx.camera().zoom));if(!hit)return false;this.editText(hit.points[0],hit);return true;}
 editText(at:BoardPoint,existing?:BoardStroke):void{
  try{this.owned(existing?[existing]:[]);}catch(e){this.ctx.notify(errorMessage(e));return;}this.commitText();this.editing=existing?structuredClone(existing):null;this.textAt=at;const input=element('textarea');input.className='sv-board-text';input.maxLength=LIMITS.boardText;input.setAttribute('aria-label',t('Texto para la pizarra'));input.placeholder=t('Escribe… ($x^2$ para fórmulas)');input.value=existing?.text??'';input.rows=Math.min(8,input.value.split('\n').length);if(existing?.textStyle)Object.assign(this.style,existing.textStyle);
  input.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();this.cancel();}else if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.commitText();}};input.onblur=()=>this.commitText();input.oninput=()=>{input.rows=Math.min(8,input.value.split('\n').length);};this.editor=input;this.ctx.wrap.append(input);this.positionText();input.focus();
 }
 positionText():void{if(!this.editor||!this.textAt)return;const c=this.ctx.camera(),s=this.ctx.canvas.clientWidth/768;Object.assign(this.editor.style,{left:`${(this.textAt.x-c.x)*c.zoom*s}px`,top:`${(this.textAt.y-c.y)*c.zoom*s}px`,fontSize:`${this.style.fontSize*c.zoom*s}px`,fontFamily:this.style.fontFamily==='serif'?'Georgia,serif':this.style.fontFamily==='mono'?'monospace':'inherit',fontWeight:this.style.bold?'700':'400',fontStyle:this.style.italic?'italic':'normal',textDecoration:this.style.underline?'underline':'none',color:existingColor(this.editing,this.textColor),textAlign:this.style.align,width:this.style.boxWidth?`${this.style.boxWidth*c.zoom*s}px`:'min(420px,80%)'});}
 commitText():void{const input=this.editor,at=this.textAt,existing=this.editing;if(!input||!at)return;this.editor=null;this.textAt=null;this.editing=null;const text=input.value.trimEnd();input.remove();if(!text.trim())return;const stroke:BoardStroke={...(existing??{}),id:existing?.id??crypto.randomUUID(),boardId:this.ctx.board(),author:this.ctx.author(),seq:existing?.seq??0,color:existing?.color??this.textColor,width:existing?.width??4,tool:'text',points:[at],text,textStyle:{...this.style},deleted:false};void this.apply([stroke]).then(ok=>{if(ok){this.selected=new Set([stroke.id]);this.renderToolbar();}});}
 async copy(cut=false):Promise<void>{const objects=this.selectedObjects();if(!objects.length)return;if(cut)try{this.owned(objects);}catch(e){this.ctx.notify(errorMessage(e));return;}
  const bounds=selectionBounds(objects)!;const normalized=moveObjects(objects,-bounds.x,-bounds.y);const data=JSON.stringify({kind:'studyvillage-selection',version:1,objects:normalized});if(data.length>60000){this.ctx.notify(t('La selección es demasiado grande. Selecciona una zona más pequeña.'));return;}internalClipboard=data;this.clipboardOffset=0;
  try{systemClipboard=objects.every(s=>s.tool==='text')?clipboardText(objects):data;await navigator.clipboard.writeText(systemClipboard);}catch{this.ctx.notify(t('Selección copiada dentro de la app. Usa Pegar para colocarla.'));}if(cut)await this.apply(objects.map(s=>({...s,deleted:true})));
 }
 async paste(duplicate=false):Promise<void>{try{let raw=internalClipboard;if(duplicate){const objects=this.selectedObjects();if(!objects.length)return;const b=selectionBounds(objects)!;raw=JSON.stringify({kind:'studyvillage-selection',version:1,objects:moveObjects(objects,-b.x,-b.y)});}else try{const system=await navigator.clipboard.readText();raw=system===systemClipboard&&internalClipboard?internalClipboard:system||raw;}catch{/* Internal clipboard remains available on touch. */}
  if(!raw)return;if(raw.length>60000)throw new AppError('invalid',t('El contenido que quieres pegar es demasiado grande.'));
  let list:BoardStroke[];try{list=validateClipboard(JSON.parse(raw));}catch{if(raw.includes('studyvillage-selection'))throw new AppError('invalid',t('No se pudo leer esta selección.'));if(raw.length>LIMITS.boardText)throw new AppError('invalid',t('Este texto es demasiado largo para una nota.'));list=[{id:'paste',author:'',boardId:'',seq:0,tool:'text',text:raw,color:'#315f51',width:4,points:[{x:0,y:0}],deleted:false,textStyle:{...this.style}}];}
  const camera=this.ctx.camera(),offset=24*(++this.clipboardOffset);const b=selectionBounds(this.selectedObjects());const at=duplicate&&b?{x:b.x+24,y:b.y+24}:{x:camera.x+80/camera.zoom+offset,y:camera.y+80/camera.zoom+offset};const changes=moveObjects(list,at.x,at.y).map(s=>({...s,id:crypto.randomUUID(),author:this.ctx.author(),boardId:this.ctx.board(),seq:0,deleted:false}));if(await this.apply(changes)){this.selected=new Set(changes.map(s=>s.id));this.renderToolbar();}
 }catch(e){this.ctx.notify(errorMessage(e));}}
 key(event:KeyboardEvent):boolean{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||(event.target instanceof HTMLElement&&event.target.isContentEditable))return false;const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;if(key==='escape')return this.deselect();if(mod&&key==='z'){event.preventDefault();void(event.shiftKey?this.redo():this.undo());return true;}if(mod&&key==='y'){event.preventDefault();void this.redo();return true;}if(mod&&['c','x','v','d'].includes(key)){event.preventDefault();if(key==='v'||key==='d')void this.paste(key==='d');else void this.copy(key==='x');return true;}if((key==='delete'||key==='backspace')&&this.selected.size){event.preventDefault();void this.apply(this.selectedObjects().map(s=>({...s,deleted:true})));return true;}return false;}
 draw(ctx:CanvasRenderingContext2D):void{this.sync();const c=this.ctx.camera();const ratio=this.ctx.canvas.clientWidth/768;const unit=1/Math.max(.1,c.zoom*ratio);ctx.save();ctx.scale(c.zoom,c.zoom);ctx.translate(-c.x,-c.y);ctx.strokeStyle='#416c46';ctx.fillStyle='#416c4614';ctx.lineWidth=1.5*unit;ctx.setLineDash([6*unit,4*unit]);const g=this.gesture;if(g?.kind==='area'){const path=g.path;if(this.lasso&&path.length>1){ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();ctx.stroke();}else{const a=path[0],b=path.at(-1)!;ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);}}
  const selected=this.preview??this.selectedObjects(),bounds=selectionBounds(selected);if(bounds){ctx.strokeRect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.setLineDash([]);ctx.fillStyle='#fff8e9';const size=12*unit;for(const p of [...(selected.length===1&&selected[0].tool==='text'?[{x:bounds.x+bounds.w,y:bounds.y+bounds.h/2}]:[]),{x:bounds.x+bounds.w,y:bounds.y+bounds.h}]){ctx.fillRect(p.x-size/2,p.y-size/2,size,size);ctx.strokeRect(p.x-size/2,p.y-size/2,size,size);}}
  ctx.restore();this.positionText();
 }
 private renderToolbar():void{
  this.root.replaceChildren();const objects=this.selectedObjects();const text=objects.length===1&&objects[0].tool==='text'?objects[0]:null;
  this.root.hidden=!this.active&&!this.textTool&&!objects.length;
  if(this.active){const selectShape=element('select');setDisplayAttribute(selectShape,'aria-label',msg('Tipo de selección'));for(const [value,label]of [['rectangle','Rectángulo'],['lasso','Lazo']]){const o=element('option',label);o.value=value;selectShape.append(o);}selectShape.value=this.lasso?'lasso':'rectangle';selectShape.onchange=()=>{this.lasso=selectShape.value==='lasso';};this.root.append(selectShape);}
  if(objects.length){
   if(text)this.root.append(button('Editar',()=>this.editText(text.points[0],text)));
   this.root.append(button('Copiar',()=>void this.copy()),button('Cortar',()=>void this.copy(true)),button('Duplicar',()=>void this.paste(true)),button('Eliminar',()=>void this.apply(objects.map(s=>({...s,deleted:true})))));
  }
  if(this.active||objects.length)this.root.append(button('Pegar',()=>void this.paste()));
  if(text||this.textTool)this.root.append(this.formatPanel(text));
  for(const b of this.root.querySelectorAll<HTMLButtonElement>('button'))b.disabled=this.busy;
 }
 /** Formats the selected text, or the next text you write when nothing is selected. */
 private formatPanel(stroke:BoardStroke|null):HTMLDetailsElement{
  const base:BoardTextStyle={...DEFAULT_TEXT_STYLE,...(stroke?stroke.textStyle??{fontSize:10+stroke.width*3}:this.style)};
  const format=element('details');format.open=this.formatOpen;format.ontoggle=()=>{this.formatOpen=format.open;};format.append(element('summary','Formato'));
  const form=element('div');form.className='sv-board-format';
  const labelled=<T extends HTMLElement>(label:string,control:T):HTMLLabelElement=>{const l=element('label');const span=element('span',label);l.append(span,control);return l;};
  const size=element('input');size.type='number';size.min='8';size.max='160';size.value=String(Math.round(base.fontSize));
  const family=element('select');for(const [v,label]of [['sans','Sans'],['serif','Serif'],['mono','Monoespaciada']]){const o=element('option',label);o.value=v;family.append(o);}family.value=base.fontFamily;
  const align=element('select');for(const [v,label]of [['left','Izquierda'],['center','Centro'],['right','Derecha']]){const o=element('option',label);o.value=v;align.append(o);}align.value=base.align;
  const color=element('input');color.type='color';color.value=stroke?.color??this.textColor;
  const wrap=element('select');for(const [v,label]of [['auto','Sin ajuste'],['box','Ajustar al ancho']]){const o=element('option',label);o.value=v;wrap.append(o);}wrap.value=base.boxWidth?'box':'auto';
  const width=element('input');width.type='number';width.min='24';width.max='4000';width.value=String(Math.round(base.boxWidth??300));width.disabled=wrap.value!=='box';wrap.onchange=()=>{width.disabled=wrap.value!=='box';};
  const flags={bold:base.bold,italic:base.italic,underline:!!base.underline};
  const toggle=(label:string,key:keyof typeof flags)=>{const b=button(label,()=>{flags[key]=!flags[key];b.setAttribute('aria-pressed',String(flags[key]));});b.setAttribute('aria-pressed',String(flags[key]));return b;};
  const styleRow=element('div');styleRow.className='sv-board-format-row';styleRow.append(toggle('Negrita','bold'),toggle('Cursiva','italic'),toggle('Subrayado','underline'));
  const applyButton=button(stroke?'Aplicar formato':'Usar para el texto nuevo',()=>{
   const fontSize=Number(size.value),boxWidth=Number(width.value);
   if(!Number.isFinite(fontSize)||fontSize<8||fontSize>160||wrap.value==='box'&&(!Number.isFinite(boxWidth)||boxWidth<24||boxWidth>4000)){this.ctx.notify(t('Revisa el tamaño y el ancho del texto.'));return;}
   const textStyle:BoardTextStyle={fontSize,fontFamily:family.value as BoardTextStyle['fontFamily'],align:align.value as BoardTextStyle['align'],bold:flags.bold,italic:flags.italic,underline:flags.underline,...(wrap.value==='box'?{boxWidth}:{})};
   this.style.boxWidth=undefined;Object.assign(this.style,textStyle);this.textColor=color.value;
   if(stroke)void this.apply([{...stroke,textStyle,color:color.value}]);else{this.formatOpen=false;this.renderToolbar();this.positionText();}
  });
  form.append(labelled('Tamaño del texto',size),labelled('Fuente del texto',family),labelled('Alineación del texto',align),labelled('Color del texto',color),labelled('Ajuste de líneas',wrap),labelled('Ancho del texto',width),styleRow,applyButton);
  format.append(form);return format;
 }
 dispose():void{this.cancel();this.root.remove();}
}

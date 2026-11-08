import {msg,setDisplayText,setDisplayAttribute} from '../i18n';
export interface WindowRect {x:number;y:number;width:number;height:number}
export function clampWindow(r:WindowRect,w:number,h:number):WindowRect {
 const width=Math.min(Math.max(180,r.width),Math.max(1,w-16)),height=Math.min(Math.max(100,r.height),Math.max(1,h-16));
 return {width,height,x:Math.max(8,Math.min(r.x,w-width-8)),y:Math.max(8,Math.min(r.y,h-height-8))};
}
/** Viewer-only geometry. No media or network state is changed here. */
export function mediaWindow(root:HTMLElement,head:HTMLElement,index:number):()=>void {
 let rect:WindowRect={x:24+index*28,y:90+index*28,width:520,height:340},saved=rect,minimized=false;
 let drag:{id:number;x:number;y:number;base:WindowRect;resize:boolean}|null=null;
 root.classList.add('sv-floating-screen');head.classList.add('sv-window-handle');
 const size=()=>({w:visualViewport?.width??innerWidth,h:visualViewport?.height??innerHeight});
 const apply=()=>{const {w,h}=size();rect=clampWindow(rect,w,h);Object.assign(root.style,{left:`${rect.x+(visualViewport?.offsetLeft??0)}px`,top:`${rect.y+(visualViewport?.offsetTop??0)}px`,width:`${rect.width}px`,height:minimized?'auto':`${rect.height}px`});};
 const button=(label:string,run:()=>void)=>{const b=document.createElement('button');b.type='button';setDisplayText(b,msg(label));b.onclick=run;head.append(b);return b;};
 const minimize=button('Minimizar',()=>{minimized=!minimized;root.classList.toggle('is-minimized',minimized);setDisplayText(minimize,msg(minimized?'Restaurar':'Minimizar'));apply();});
 button('Restablecer ventana',()=>{rect={...saved};minimized=false;root.classList.remove('is-minimized');setDisplayText(minimize,msg('Minimizar'));apply();});
 const grip=document.createElement('button');grip.className='sv-window-resize';grip.type='button';grip.textContent='↘';setDisplayAttribute(grip,'aria-label',msg('Cambiar tamaño'));root.append(grip);
 const down=(e:PointerEvent)=>{const resize=e.target===grip;if(!resize&&(e.target as Element).closest('button,input'))return;if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,base:{...rect},resize};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);e.preventDefault();root.style.zIndex=String(++layer);};
 const move=(e:PointerEvent)=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;rect=drag.resize?{...drag.base,width:drag.base.width+dx,height:drag.base.height+dy}:{...drag.base,x:drag.base.x+dx,y:drag.base.y+dy};apply();};
 const up=()=>{drag=null;};
 for(const target of [head,grip]){target.addEventListener('pointerdown',down);target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',up);target.addEventListener('lostpointercapture',up);}
 grip.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();rect.width+=e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0;rect.height+=e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0;apply();};
 window.addEventListener('resize',apply);visualViewport?.addEventListener('resize',apply);visualViewport?.addEventListener('scroll',apply);apply();saved={...rect};
 return()=>{window.removeEventListener('resize',apply);visualViewport?.removeEventListener('resize',apply);visualViewport?.removeEventListener('scroll',apply);};
}
let layer=90;

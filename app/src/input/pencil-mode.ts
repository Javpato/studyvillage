import { browserKeyValue } from '../../../packages/runtime/src/storage/key-value';

/** A device preference shared by the notebook and room whiteboards. */
export const PENCIL_MODE_KEY='studyvillage-apple-pencil-mode-v1';
const listeners=new Set<(enabled:boolean)=>void>();
let fallback=false,sessionOverride:boolean|null=null;
function display(enabled:boolean):void{if(typeof document!=='undefined')document.documentElement.dataset.pencilMode=String(enabled);}
export function getPencilMode():boolean {
 if(sessionOverride!==null){display(sessionOverride);return sessionOverride;}
 try{const stored=browserKeyValue.getItem(PENCIL_MODE_KEY);if(stored!==null)fallback=stored==='true';else fallback=false;}catch{/* Restricted storage: keep the preference for this session. */}
 display(fallback);return fallback;
}
function notify(enabled:boolean):void{display(enabled);for(const listener of listeners)listener(enabled);}
export function setPencilMode(enabled:boolean):void {
 fallback=enabled;try{browserKeyValue.setItem(PENCIL_MODE_KEY,JSON.stringify(enabled));sessionOverride=null;}catch{sessionOverride=enabled;/* The current session still supports the chosen input mode. */}
 notify(enabled);
}
const storageChanged=(event:StorageEvent)=>{if(event.key===null||event.key===PENCIL_MODE_KEY){sessionOverride=null;notify(getPencilMode());}};
export function subscribePencilMode(listener:(enabled:boolean)=>void):()=>void {
 if(!listeners.size&&typeof window!=='undefined')window.addEventListener('storage',storageChanged);
 listeners.add(listener);listener(getPencilMode());
 return()=>{listeners.delete(listener);if(!listeners.size&&typeof window!=='undefined')window.removeEventListener('storage',storageChanged);};
}

import {installViewportTracking} from './browser-viewport';
import './browser-gestures.css';
/** Editable text and deliberately copyable documents keep native selection and context menus. */
export const SELECTABLE_CONTENT='input,textarea,[contenteditable]:not([contenteditable="false"]),pre,code,.sv-mailbox-note p,.nb-title,.nb-blocks,.sv-selectable,[data-sv-selectable]';
export function isSelectableTarget(target:EventTarget|null):boolean {
 const element=target instanceof Element?target:target instanceof Node?target.parentElement:null;
 if(element?.closest('button,[role=button],summary,select')&&!element.closest('input,textarea,[contenteditable]:not([contenteditable="false"])'))return false;
 return !!element?.closest(SELECTABLE_CONTENT);
}
export function installBrowserGestures():()=>void {
 const root=document.documentElement;root.classList.add('sv-browser-gestures');const stopViewport=installViewportTracking();
 const suppressChrome=(event:Event)=>{if(!isSelectableTarget(event.target)&&event.cancelable)event.preventDefault();};
 // CSS is the primary policy. These handlers also cover Safari's native long-press selection/callout paths.
 // They do not stop propagation: the game's double-tap handlers still receive their events.
 document.addEventListener('selectstart',suppressChrome);document.addEventListener('contextmenu',suppressChrome);document.addEventListener('dblclick',suppressChrome);
 return()=>{stopViewport();root.classList.remove('sv-browser-gestures');document.removeEventListener('selectstart',suppressChrome);document.removeEventListener('contextmenu',suppressChrome);document.removeEventListener('dblclick',suppressChrome);};
}

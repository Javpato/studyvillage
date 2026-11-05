/** Keep Safari's Scribble, long-press selection and native gestures out of ink.
 * Pointer Events still reach the editor; real text fields retain native editing.
 * Excalidraw also cancels non-passive touchstart on iOS for this reason.
 */
export function installDrawingSurface(surface:HTMLElement):()=>void {
 surface.dataset.svDrawingSurface='true';
 const editable=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
 const prevent=(event:Event)=>{if(!editable(event.target)&&event.cancelable)event.preventDefault();};
 const clearSelection=(event:PointerEvent)=>{
  if(editable(event.target))return;
  surface.ownerDocument.getSelection()?.removeAllRanges();
 };
 const events=['touchstart','touchmove','gesturestart','gesturechange','gestureend','selectstart','contextmenu','dragstart'];
 for(const type of events)surface.addEventListener(type,prevent,{passive:false});
 surface.addEventListener('pointerdown',clearSelection,{capture:true});
 return()=>{delete surface.dataset.svDrawingSurface;for(const type of events)surface.removeEventListener(type,prevent);surface.removeEventListener('pointerdown',clearSelection,{capture:true});};
}

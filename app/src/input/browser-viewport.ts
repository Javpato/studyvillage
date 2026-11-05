/** Layout coordinates stay stable during browser pinch zoom; visual coordinates do not. */
export interface ViewportSize {width:number;height:number}
export interface VisualViewportState extends ViewportSize {left:number;top:number;right:number;bottom:number;scale:number}
export const VIEWPORT_CHANGE='studyvillage:viewportchange';
export function layoutViewport():ViewportSize {
 const root=document.documentElement;
 return {width:Math.max(1,root.clientWidth||window.innerWidth),height:Math.max(1,root.clientHeight||window.innerHeight)};
}
export function normalizedVisualViewport(layout:ViewportSize,visual?:Pick<VisualViewport,'width'|'height'|'offsetLeft'|'offsetTop'|'scale'>|null):VisualViewportState {
 const positive=(value:number|undefined,fallback:number)=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:fallback;
 const width=Math.min(layout.width,positive(visual?.width,layout.width)),height=Math.min(layout.height,positive(visual?.height,layout.height));
 const offset=(value:number|undefined,max:number)=>Math.min(Math.max(0,max),Math.max(0,Number.isFinite(value)?value!:0));
 // Clamp stale Safari pan offsets once the visual viewport expands back to the layout viewport.
 const left=offset(visual?.offsetLeft,layout.width-width),top=offset(visual?.offsetTop,layout.height-height);
 return {width,height,left,top,right:Math.max(0,layout.width-left-width),bottom:Math.max(0,layout.height-top-height),scale:positive(visual?.scale,1)};
}
export function subscribeViewport(listener:()=>void):()=>void {window.addEventListener(VIEWPORT_CHANGE,listener);return()=>window.removeEventListener(VIEWPORT_CHANGE,listener);}
/** No zoom resets, inverse transforms, scrollTo or persisted viewport offsets. */
export function installViewportTracking():()=>void {
 const root=document.documentElement,viewport=window.visualViewport;let frame=0,settle:ReturnType<typeof setTimeout>|undefined,last='';
 const update=()=>{frame=0;const layout=layoutViewport(),visual=normalizedVisualViewport(layout,viewport),signature=JSON.stringify([layout,visual]);
  if(signature===last)return;last=signature;
  for(const [name,value]of Object.entries(visual))root.style.setProperty(`--sv-visual-${name}`,name==='scale'?String(value):`${value}px`);
  root.style.setProperty('--sv-layout-width',`${layout.width}px`);root.style.setProperty('--sv-layout-height',`${layout.height}px`);
  window.dispatchEvent(new Event(VIEWPORT_CHANGE));
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);if(settle)clearTimeout(settle);settle=setTimeout(()=>{settle=undefined;if(!frame)frame=requestAnimationFrame(update);},180);};
 window.addEventListener('resize',schedule);window.addEventListener('orientationchange',schedule);window.addEventListener('pageshow',schedule);
 viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);update();
 return()=>{if(frame)cancelAnimationFrame(frame);if(settle)clearTimeout(settle);window.removeEventListener('resize',schedule);window.removeEventListener('orientationchange',schedule);window.removeEventListener('pageshow',schedule);viewport?.removeEventListener('resize',schedule);viewport?.removeEventListener('scroll',schedule);for(const key of ['width','height','left','top','right','bottom','scale'])root.style.removeProperty(`--sv-visual-${key}`);root.style.removeProperty('--sv-layout-width');root.style.removeProperty('--sv-layout-height');};
}

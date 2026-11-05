import {layoutViewport,subscribeViewport} from '../input/browser-viewport';
import { msg, t, setDisplayText, setDisplayAttribute, subscribeLanguage, type DisplayText } from '../i18n';
import { HUD_IDS, currentHudProfile, defaultHud, loadHud, mobileKind, saveHudLayouts, type HudId, type HudLayout, type HudProfile } from '../input/hud-layout';
export interface HudTarget { id:HudId; label:DisplayText; element:HTMLElement }
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,label?:DisplayText):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);if(label)setDisplayText(e,label);return e;};
const button=(label:DisplayText,run:()=>void)=>{const b=element('button',label);b.type='button';b.className='sv-button sv-button-small';b.onclick=run;return b;};
export class MobileHudEditor {
 readonly root=element('dialog');
 private original=new Map<HTMLElement,string>();private profile:HudProfile=currentHudProfile();private layout:HudLayout=loadHud(this.profile);private draft:HudLayout|null=null;
 private viewportGeometry=JSON.stringify(layoutViewport());
 private drafts=new Map<HudProfile,HudLayout>();
 private selected:HudId='movement';private preview=element('div');private fields=element('div');private error=element('p');private offLanguage:()=>void;private offViewport:()=>void;
 constructor(private targets:HudTarget[],private release:()=>void,private availability:(mobile:boolean)=>void){
  this.root.className='sv-hud-editor sv-space-dialog';setDisplayAttribute(this.root,'aria-label',msg('Editor de controles'));
  for(const target of targets){this.original.set(target.element,target.element.style.cssText);for(const child of target.element.querySelectorAll<HTMLElement>('button'))this.original.set(child,child.style.cssText);target.element.dataset.hudWidget=target.id;}
  this.root.addEventListener('cancel',event=>{event.preventDefault();this.cancel();});this.offViewport=subscribeViewport(this.resized);this.offLanguage=subscribeLanguage(()=>{if(this.root.open)this.render();});this.apply();
 }
 get mobile():boolean{return mobileKind()!==null;}
 open():void{if(!this.mobile)return;this.release();this.profile=currentHudProfile();this.drafts.clear();this.draft=structuredClone(loadHud(this.profile));this.drafts.set(this.profile,this.draft);this.render();this.root.showModal();this.renderPreview();}
 private cancel():void{this.draft=null;this.drafts.clear();this.profile=currentHudProfile();this.layout=loadHud(this.profile);this.root.close();this.release();this.apply();}
 private resized=()=>{const geometry=JSON.stringify(layoutViewport()),changed=geometry!==this.viewportGeometry;this.viewportGeometry=geometry;this.release();this.layout=loadHud(currentHudProfile());this.apply();if(this.root.open){if(changed)this.render();}else this.profile=currentHudProfile();};
 private apply():void{
  const mobile=this.mobile;document.documentElement.classList.toggle('sv-mobile-device',mobile);this.availability(mobile);
  for(const [element,style]of this.original)element.style.cssText=style;
  if(!mobile)return;
  for(const target of this.targets){
   const value=this.layout[target.id],el=target.element;
   el.style.transition='none';el.style.position='fixed';el.style.margin='0';el.style.right='auto';el.style.bottom='auto';el.style.translate='-50% -50%';el.style.scale=String(value.scale);el.style.transformOrigin='center';
   const rect=el.getBoundingClientRect();const halfW=Math.max(22,rect.width/2),halfH=Math.max(22,rect.height/2);
   const {width,height}=layoutViewport();
   const x=Math.max(halfW+8,Math.min(width-halfW-8,width*value.x/100)),y=Math.max(halfH+12,Math.min(height-halfH-12,height*value.y/100));
   el.style.left=`clamp(calc(env(safe-area-inset-left, 0px) + ${halfW+8}px), ${x}px, calc(100vw - env(safe-area-inset-right, 0px) - ${halfW+8}px))`;el.style.top=`clamp(calc(env(safe-area-inset-top, 0px) + ${halfH+12}px), ${y}px, calc(100dvh - env(safe-area-inset-bottom, 0px) - ${halfH+12}px))`;
   if(!value.visible)el.style.setProperty('display','none','important');
   if(value.color){el.style.setProperty('background',value.color,'important');for(const child of el.querySelectorAll<HTMLElement>('button'))child.style.setProperty('background',value.color,'important');}
  }
 }
 private previewViewport():{width:number;height:number}{const {width,height}=layoutViewport(),short=Math.min(width,height),long=Math.max(width,height);return this.profile.endsWith('portrait')?{width:short,height:long}:{width:long,height:short};}
 private render():void{
  if(!this.draft)return;this.root.replaceChildren(element('h2',msg('Editar controles')),button(msg('Cancelar'),()=>this.cancel()));
  this.root.append(element('p',msg('Arrastra los controles de la vista previa o usa los ajustes. El menú permanece fijo arriba a la derecha.')));
  const orientation=element('select');setDisplayAttribute(orientation,'aria-label',msg('Orientación del diseño'));
  for(const[value,label]of[['portrait',msg('Vertical')],['landscape',msg('Horizontal')]]as const){const option=element('option',label);option.value=value;orientation.append(option);}orientation.value=this.profile.endsWith('portrait')?'portrait':'landscape';
  orientation.onchange=()=>{const prefix=this.profile.startsWith('tablet')?'tablet':'phone';this.profile=`${prefix}-${orientation.value}` as HudProfile;this.draft=this.drafts.get(this.profile)??structuredClone(loadHud(this.profile));this.drafts.set(this.profile,this.draft);this.render();};
  this.root.append(orientation,element('p',msg('Cada orientación tiene su propio diseño. Guardar conserva ambos; cancelar descarta los cambios.')));
  const viewport=this.previewViewport();
  this.preview=element('div');this.preview.className='sv-hud-layout-preview';this.preview.classList.toggle('is-phone-portrait',this.profile==='phone-portrait');this.preview.style.aspectRatio=`${viewport.width}/${viewport.height}`;this.preview.style.width=`min(100%, ${Math.max(240,layoutViewport().height*.42)*viewport.width/viewport.height}px)`;this.preview.style.maxHeight='none';this.preview.style.marginInline='auto';
  const menu=element('span',msg('Menú'));menu.className='sv-hud-preview-menu';this.preview.append(menu);
  this.fields=element('div');this.fields.className='sv-hud-layout-fields';
  const select=element('select');setDisplayAttribute(select,'aria-label',msg('Control para editar'));
  for(const target of this.targets){const option=element('option',target.label);option.value=target.id;select.append(option);}select.value=this.selected;
  select.onchange=()=>{this.selected=select.value as HudId;this.renderFields();this.renderPreview();};
  this.root.append(this.preview,select,this.fields);this.error=element('p');this.error.setAttribute('role','alert');
  this.root.append(button(msg('Guardar controles'),()=>{try{saveHudLayouts(Object.fromEntries(this.drafts));this.profile=currentHudProfile();this.layout=loadHud(this.profile);this.drafts.clear();this.draft=null;this.root.close();this.release();this.apply();}catch{setDisplayText(this.error,msg('No se pudieron guardar los controles. Tu diseño sigue aquí.'));}}),button(msg('Restablecer controles'),()=>{this.draft=defaultHud(this.profile);this.drafts.set(this.profile,this.draft);this.renderFields();this.renderPreview();}),this.error);
  this.renderFields();this.renderPreview();
 }
 private renderFields():void{
  const item=this.draft![this.selected];this.fields.replaceChildren();
  const range=(label:DisplayText,key:'x'|'y'|'scale',min:number,max:number,step:number)=>{const wrap=element('label',label),input=element('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(item[key]);setDisplayAttribute(input,'aria-label',label);const value=element('output',String(Math.round(item[key]* (key==='scale'?100:1)))+'%');input.oninput=()=>{item[key]=Number(input.value);value.textContent=String(Math.round(item[key]*(key==='scale'?100:1)))+'%';this.renderPreview();};wrap.append(input,value);return wrap;};
  this.fields.append(range(msg('Tamaño'),'scale',.5,1.75,.05),range(msg('Posición horizontal'),'x',0,100,1),range(msg('Posición vertical'),'y',0,100,1));
  const colorLabel=element('label',msg('Color del control')),color=element('input');color.type='color';color.value=item.color??'#446e50';setDisplayAttribute(color,'aria-label',msg('Color del control'));color.oninput=()=>{item.color=color.value;this.renderPreview();};colorLabel.append(color);
  const shown=element('input');shown.type='checkbox';shown.checked=item.visible;setDisplayAttribute(shown,'aria-label',msg('Mostrar en pantalla'));shown.onchange=()=>{item.visible=shown.checked;this.renderPreview();};const visibility=element('label',msg('Mostrar en pantalla'));visibility.append(shown);
  this.fields.append(colorLabel,visibility,button(msg('Restaurar color'),()=>{item.color=null;this.renderFields();this.renderPreview();}));
 }
 private renderPreview():void{
  for(const el of this.preview.querySelectorAll('[data-preview-widget]'))el.remove();
  const factor=this.preview.clientWidth/this.previewViewport().width||.6;
  for(const target of this.targets){const value=this.draft![target.id];if(!value.visible)continue;
   const wrapper=element('div');wrapper.dataset.previewWidget=target.id;wrapper.className='sv-hud-preview-widget';wrapper.classList.toggle('is-selected',target.id===this.selected);wrapper.style.left=`${value.x}%`;wrapper.style.top=`${value.y}%`;wrapper.title=t(target.label);
   const clone=target.element.cloneNode(true) as HTMLElement;clone.removeAttribute('hidden');clone.style.cssText=this.original.get(target.element)??'';
   for(const e of[clone,...clone.querySelectorAll<HTMLElement>('*')]){e.removeAttribute('id');e.removeAttribute('data-testid');e.removeAttribute('data-hud-widget');}
   clone.style.position='relative';clone.style.inset='auto';clone.style.maxWidth='none';clone.style.pointerEvents='none';wrapper.style.width=`${(target.element.offsetWidth||96)*value.scale*factor}px`;wrapper.style.height=`${(target.element.offsetHeight||52)*value.scale*factor}px`;clone.style.position='absolute';clone.style.left='50%';clone.style.top='50%';clone.style.transform='none';clone.style.animation='none';clone.style.translate='-50% -50%';clone.style.scale=String(value.scale*factor);clone.style.transformOrigin='center';
   if(value.color){clone.style.background=value.color;for(const b of clone.querySelectorAll<HTMLElement>('button'))b.style.background=value.color;}
   wrapper.append(clone);wrapper.onpointerdown=event=>{this.selected=target.id;this.renderFields();wrapper.setPointerCapture(event.pointerId);event.preventDefault();};
   wrapper.onpointermove=event=>{if(!wrapper.hasPointerCapture(event.pointerId))return;const rect=this.preview.getBoundingClientRect();value.x=Math.max(0,Math.min(100,(event.clientX-rect.x)/rect.width*100));value.y=Math.max(0,Math.min(100,(event.clientY-rect.y)/rect.height*100));wrapper.style.left=`${value.x}%`;wrapper.style.top=`${value.y}%`;};
   wrapper.onpointerup=event=>{if(wrapper.hasPointerCapture(event.pointerId))wrapper.releasePointerCapture(event.pointerId);this.renderFields();};this.preview.append(wrapper);
  }
 }
 dispose():void{this.offViewport();this.offLanguage();this.root.close();this.root.remove();}
}

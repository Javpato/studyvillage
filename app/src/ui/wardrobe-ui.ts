import { msg, t, setDisplayText, setDisplayAttribute, getLocale, formatDate, type DisplayText } from '../i18n';
import { errorMessage } from '../errors/messages';
import { BODY_TYPES, HEADWEAR, EYEWEAR, OUTFITS, JACKETS, normalizeAppearance, type AvatarAppearance } from '../assets/appearance';
import { getAvatarCustomization, HAIR_STYLE_LABELS, SKIN_TONES } from '../assets/custom-assets';
import type { Position, PublicIdentity } from '../../../packages/core/src/protocol/types';
import { avatarSheetData, decodeAvatarSheet, getAvatarSheet, setAvatarSheet, loadAvatarSheet } from '../assets/avatar-sheet';
import { downloadLocal } from '../../../packages/runtime/src/local-bridge/files';
import { drawAvatar, avatarSpriteSheet } from './art';

type Category = 'body'|'headwear'|'eyewear'|'outfit'|'jacket'|'appearance';
const COLORS=['#d8b04e','#a77b50','#e18b78','#416c46','#416f8c','#3d4053','#f2e7cd','#773f57','#2a292b','#af6049'];
function node<K extends keyof HTMLElementTagNameMap>(tag:K, cls='', text:DisplayText=''):HTMLElementTagNameMap[K]{const el=document.createElement(tag);el.className=cls;setDisplayText(el,text);return el;}
function button(text:DisplayText,run:()=>void):HTMLButtonElement{const b=node('button','sv-wardrobe-button',text);b.type='button';b.onclick=run;return b;}

export class WardrobePanel {
  readonly root=node('dialog','sv-wardrobe');
  private draft:AvatarAppearance=getAvatarCustomization();
  private identity!:PublicIdentity;
  private category:Category='headwear';
  private direction=0;
  private openColors=new Set<string>();
  private busy=false;
  private pendingSheet:HTMLImageElement|null=null;
  private importGeneration=0;
  private importing=false;
  private preview=node('canvas','sv-wardrobe-preview');
  private catalog=node('div','sv-wardrobe-catalog');
  private tabs=node('div','sv-wardrobe-tabs');
  private error=node('p','sv-wardrobe-error');
  private save:HTMLButtonElement;
  private discard:HTMLButtonElement;
  constructor(private readonly ctx:{save(look:AvatarAppearance):Promise<void>;closed():void}){
    loadAvatarSheet();
    this.root.setAttribute('aria-labelledby','sv-wardrobe-title');
    const head=node('header','sv-wardrobe-head');const title=node('h2','',msg('Mi armario'));title.id='sv-wardrobe-title';
    const close=button('×',()=>this.close());setDisplayAttribute(close, 'aria-label', msg('Cerrar armario'));head.append(title,close);
    const body=node('div','sv-wardrobe-body');const mirror=node('section','sv-wardrobe-mirror');setDisplayAttribute(mirror, 'aria-label', msg('Vista previa de tu personaje'));
    this.preview.width=480;this.preview.height=540;setDisplayAttribute(this.preview, 'aria-label', msg('Vista previa del look'));
    const turn=node('div','sv-wardrobe-turn');turn.append(button('↶',()=>this.rotate(-1)),node('span','',msg('Girar')),button('↷',()=>this.rotate(1)));
    setDisplayAttribute(turn.querySelectorAll('button')[0], 'aria-label', msg('Girar personaje a la izquierda'));setDisplayAttribute(turn.querySelectorAll('button')[1], 'aria-label', msg('Girar personaje a la derecha'));
    mirror.append(this.preview,turn,node('p','sv-wardrobe-hint',msg('Prueba lo que quieras. Guarda cuando te guste.')));
    const wardrobe=node('section','sv-wardrobe-options');setDisplayAttribute(this.tabs, 'aria-label', msg('Categorías de ropa'));wardrobe.append(this.tabs,this.catalog);body.append(mirror,wardrobe);
    const foot=node('footer','sv-wardrobe-foot');this.error.setAttribute('role','alert');this.error.hidden=true;
    this.discard=button(msg('Descartar'),()=>this.close());this.save=button(msg('Guardar look'),()=>{void this.commit();});this.save.classList.add('is-primary');const sheetInput=node('input');sheetInput.type='file';sheetInput.accept='image/png';sheetInput.hidden=true;
    sheetInput.onchange=()=>{
      const file=sheetInput.files?.[0];sheetInput.value='';if(!file)return;
      if(file.size>512*1024){this.error.textContent=t('Elige un PNG de hasta 512 KB.');this.error.hidden=false;return;}
      const generation=++this.importGeneration;this.importing=true;this.save.disabled=true;this.error.hidden=true;
      const reader=new FileReader();
      const finish=()=>{if(generation===this.importGeneration){this.importing=false;this.save.disabled=this.busy;}};
      const fail=(error:unknown)=>{if(generation===this.importGeneration&&this.root.open){this.error.textContent=errorMessage(error,'Elige un PNG de hasta 512 KB.');this.error.hidden=false;}finish();};
      reader.onerror=()=>fail(reader.error);reader.onabort=finish;
      reader.onload=()=>{void decodeAvatarSheet(String(reader.result)).then(image=>{
        if(generation!==this.importGeneration||!this.root.open)return;
        this.pendingSheet=image;this.draft={...this.draft,useCustomSheet:true};this.paint();
      }).catch(fail).finally(finish);};reader.readAsDataURL(file);
    };
    foot.append(button(msg('Importar sprite 192 × 256'),()=>sheetInput.click()),button(msg('Exportar sprite'),()=>{const custom=this.draft.useCustomSheet?(this.pendingSheet??getAvatarSheet()):null;const canvas=avatarSpriteSheet(this.identity,this.draft);if(custom){const output=document.createElement('canvas');output.width=192;output.height=256;output.getContext('2d')!.drawImage(custom,0,0);output.toBlob(b=>{if(b)downloadLocal('avatar-192x256.png',b);});}else canvas.toBlob(b=>{if(b)downloadLocal('avatar-192x256.png',b);});}),sheetInput,this.error,this.discard,this.save);this.root.append(head,body,foot);
    this.root.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    this.root.addEventListener('close',()=>this.ctx.closed());
  }
  open(identity:PublicIdentity):void{this.importGeneration++;this.importing=false;this.save.disabled=false;this.identity=identity;this.pendingSheet=null;this.draft=getAvatarCustomization();this.direction=0;this.category='headwear';this.openColors.clear();this.error.hidden=true;this.render();if(!this.root.open)this.root.showModal();}
  isOpen():boolean{return this.root.open;}
  close():void{if(!this.busy){this.importGeneration++;this.importing=false;this.save.disabled=false;this.root.close();}}
  dispose():void{this.importGeneration++;this.root.close();this.root.remove();}
  private rotate(delta:number):void{this.direction=(this.direction+delta+4)%4;this.paint();}
  private change(patch:Partial<AvatarAppearance>):void{if(this.busy)return;this.draft=normalizeAppearance({...this.draft,...patch,useCustomSheet:patch.useCustomSheet??false});this.render();}
  private draw(canvas:HTMLCanvasElement,look:AvatarAppearance,large=false):void{
    const c=canvas.getContext('2d');if(!c)return;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);c.scale(2,2);c.imageSmoothingEnabled=false;
    const w=canvas.width/2,h=canvas.height/2;c.fillStyle=large?'#e6d4b3':'#f5e7cb';c.fillRect(0,0,w,h);
    if(large){c.fillStyle='#d0b58c';c.fillRect(12,h-60,w-24,2);c.fillStyle='#d7bd96';c.beginPath();c.ellipse(w/2,h-53,64,13,0,0,Math.PI*2);c.fill();}
    c.translate(w/2,large?h-82:84);c.scale(large?4:2,large?4:2);
    const directions:Position['direction'][]=['down','left','up','right'];
    drawAvatar(c,0,0,this.identity,{x:0,y:0,direction:directions[large?this.direction:0],moving:false},false,{appearance:look,preview:true,sheet:large?(this.pendingSheet??getAvatarSheet()):null});
  }
  private paint():void{this.draw(this.preview,this.draft,true);}
  private render():void{
    this.paint();this.tabs.replaceChildren();this.catalog.replaceChildren();
    for(const [key,label] of [['body',msg('Cuerpo')],['headwear',msg('Sombreros')],['eyewear',msg('Lentes')],['outfit',msg('Ropa')],['jacket',msg('Sacos')],['appearance',msg('Aspecto')]] as const){const b=button(label,()=>{this.category=key;this.render();});b.setAttribute('aria-pressed',String(this.category===key));this.tabs.append(b);}
    if(this.category==='appearance'){this.appearanceControls();return;}
    const category=this.category;const options=category==='body'?BODY_TYPES:category==='headwear'?HEADWEAR:category==='eyewear'?EYEWEAR:category==='outfit'?OUTFITS:JACKETS;
    const grid=node('div','sv-wardrobe-grid');
    for(const [value,label] of Object.entries(options)){
      const patch={...this.draft,[category]:value,useCustomSheet:false};
      const b=button('',()=>this.change({[category]:value}));b.classList.add('sv-wardrobe-item');setDisplayAttribute(b,'aria-label',msg(label));b.setAttribute('aria-pressed',String(this.draft[category]===value));
      const canvas=node('canvas');canvas.width=176;canvas.height=192;this.draw(canvas,normalizeAppearance(patch));b.append(canvas,node('span','',msg(label)));grid.append(b);
    }
    this.catalog.append(grid);
    if(category==='headwear')this.colorControl('Color del sombrero','headwearColor');
    if(category==='outfit'){this.colorControl('Color de la ropa','outfitColor');this.colorControl('Color del pantalón','pantsColor');}
    if(category==='jacket')this.colorControl('Color del saco','jacketColor');
  }
  private colorControl(label:string,key:'headwearColor'|'outfitColor'|'pantsColor'|'jacketColor'|'hairColor'|'headphonesColor'):void{
    const details=node('details','sv-wardrobe-color-details');details.open=this.openColors.has(key);details.append(node('summary','',msg(label)));
    details.addEventListener('toggle',()=>{if(details.isConnected){if(details.open)this.openColors.add(key);else this.openColors.delete(key);}});
    const row=node('div','sv-wardrobe-colors');
    for(const color of COLORS){const swatch=button('',()=>this.change({[key]:color}));swatch.classList.add('sv-wardrobe-swatch');swatch.style.background=color;setDisplayAttribute(swatch,'aria-label',msg('{label}: {color}',{label:msg(label),color}));swatch.setAttribute('aria-pressed',String((this.draft[key]??this.identity.color)===color));row.append(swatch);}
    const input=node('input');input.type='color';input.value=this.draft[key]??this.identity.color;setDisplayAttribute(input,'aria-label',msg(label));input.onchange=()=>this.change({[key]:input.value});row.append(input);details.append(row);this.catalog.append(details);
  }
  private appearanceControls():void{
    const hair=node('select');setDisplayAttribute(hair, 'aria-label', msg('Peinado'));for(const [value,label]of Object.entries(HAIR_STYLE_LABELS).filter(([v])=>v!=='beanie')){const option=node('option','',msg(label));option.value=value;hair.append(option);}hair.value=this.draft.hairStyle==='beanie'?'short':this.draft.hairStyle;hair.onchange=()=>this.change({hairStyle:hair.value as AvatarAppearance['hairStyle']});
    const label=node('label','',msg('Peinado'));label.append(hair);this.catalog.append(label);this.colorControl('Color del pelo','hairColor');
    const skin=node('div','sv-wardrobe-colors');skin.append(node('span','',msg('Tono de piel')));for(const [i,tone]of SKIN_TONES.entries()){const b=button('',()=>this.change({skinTone:tone}));b.classList.add('sv-wardrobe-swatch');b.style.background=tone;setDisplayAttribute(b, 'aria-label', msg("Tono de piel {p0}", { p0: i+1 }));b.setAttribute('aria-pressed',String(this.draft.skinTone===tone));skin.append(b);}this.catalog.append(skin);
    const headphones=node('input');headphones.type='checkbox';headphones.checked=this.draft.accessory==='headphones';headphones.onchange=()=>this.change({accessory:headphones.checked?'headphones':'none'});const audio=node('label','',msg('Auriculares'));audio.append(headphones);this.catalog.append(audio);if(this.draft.accessory==='headphones')this.colorControl('Color de los auriculares','headphonesColor');
  }
  private async commit():Promise<void>{
    if(this.busy||this.importing)return;this.busy=true;this.save.disabled=true;this.discard.disabled=true;setDisplayText(this.save, msg('Guardando…'));this.error.hidden=true;
    const previous=avatarSheetData();
    try{if(this.pendingSheet&&this.draft.useCustomSheet)await setAvatarSheet(this.pendingSheet.src);await this.ctx.save(normalizeAppearance(this.draft));this.pendingSheet=null;this.root.close();}
    catch(e){if(this.pendingSheet)await setAvatarSheet(previous).catch(()=>{});this.error.textContent=errorMessage(e, 'No se pudo guardar el look. Vuelve a intentarlo.');this.error.hidden=false;}
    finally{this.busy=false;this.save.disabled=false;this.discard.disabled=false;setDisplayText(this.save, msg('Guardar look'));}
  }
}

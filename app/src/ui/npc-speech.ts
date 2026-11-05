import {msg, setDisplayText, setDisplayAttribute} from '../i18n';
import {DEFAULT_DIALOGUE, NPC_DIALOGUE_KEY, parseDialoguePreferences, dialoguePages, type NpcDialoguePreferences} from './npc-speech-model';
import './npc-speech.css';
interface SpeechViewport {
  left: number; right: number; top: number;
  screenLeft?: number; screenTop?: number; screenRight?: number; screenBottom?: number;
  canvasLeft?: number; canvasTop?: number; scale?: number;
}
/** A small screen-sized bubble, anchored to world coordinates even when the phone camera zooms. */
export class NpcSpeech {
  readonly root = document.createElement('section');
  readonly announcement = document.createElement('span');
  private text = document.createElement('div');
  private count = document.createElement('span');
  private next = document.createElement('button');
  private current: {text:string;x:number;y:number;scene:string;page:number} | null = null;
  private preferences: NpcDialoguePreferences = {...DEFAULT_DIALOGUE};
  private pages: string[] = [];
  private layoutKey = '';
  private startedAt = 0;
  private revealed = false;
  private animation = 0;
  private settingControls: (() => void)[] = [];
  constructor() {
    try { this.preferences = parseDialoguePreferences(JSON.parse(localStorage.getItem(NPC_DIALOGUE_KEY) || '{}')); } catch { /* Keep readable defaults. */ }
    this.root.className = 'sv-npc-bubble'; this.root.hidden = true;
    this.root.setAttribute('role', 'group'); setDisplayAttribute(this.root, 'aria-label', msg('Diálogo del guía'));
    this.text.className = 'sv-npc-bubble-text';
    const footer = document.createElement('footer'); this.count.className = 'sv-npc-page'; this.count.setAttribute('aria-hidden', 'true');
    this.next.type = 'button'; this.next.className = 'sv-npc-next'; this.next.onclick = () => this.advance();
    const close = document.createElement('button'); close.type = 'button'; close.className = 'sv-npc-close'; close.textContent = '×';
    setDisplayAttribute(close, 'aria-label', msg('Cerrar diálogo')); close.onclick = () => this.clear();
    footer.append(this.count, this.next, close); this.root.append(this.text, footer);
    this.text.onclick = () => this.advance();
    this.announcement.className = 'sv-sr-only'; this.announcement.setAttribute('role', 'status');
    document.body.append(this.root, this.announcement);
    document.addEventListener('pointerdown', this.outside, true);
    document.addEventListener('keydown', this.key, true);
  }
  private outside = (event: PointerEvent) => { if (this.current && !this.root.contains(event.target as Node)) this.clear(); };
  private key = (event: KeyboardEvent) => {
    if (!this.current || event.key !== 'Escape') return;
    this.clear(); event.preventDefault(); event.stopPropagation();
  };
  say(text:string, x:number, y:number, scene:string) {
    if (this.current?.text === text && this.current.scene === scene && this.current.x === x && this.current.y === y) { this.advance(); return; }
    cancelAnimationFrame(this.animation); this.animation = 0;
    this.current = {text, x, y, scene, page:0}; this.layoutKey = ''; this.pages = [];
    this.root.style.visibility = 'hidden'; this.root.hidden = false; this.announcement.textContent = text;
  }
  get isOpen(): boolean { return this.current !== null; }
  clear() {
    this.current = null; this.root.hidden = true; this.announcement.textContent = '';
    cancelAnimationFrame(this.animation); this.animation = 0;
  }
  private advance() {
    if (!this.current || !this.pages.length) return;
    if (!this.revealed) { this.revealed = true; this.paintText(); return; }
    if (this.current.page + 1 >= this.pages.length) { this.clear(); return; }
    this.current.page++; this.beginPage();
  }
  private beginPage() {
    this.startedAt = performance.now();
    this.revealed = !this.preferences.progressive || matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.paintText();
  }
  private paintText = () => {
    cancelAnimationFrame(this.animation);
    if (!this.current) return;
    const full = this.pages[this.current.page] || '', characters = Array.from(full);
    const length = this.revealed ? characters.length : Math.floor((performance.now() - this.startedAt) / 24);
    this.revealed ||= length >= characters.length;
    this.text.textContent = characters.slice(0, length).join('');
    this.count.textContent = this.pages.length > 1 ? `${this.current.page + 1}/${this.pages.length}` : '';
    setDisplayText(this.next, msg(!this.revealed ? 'Mostrar texto' : this.current.page + 1 < this.pages.length ? 'Siguiente' : 'Listo'));
    if (!this.revealed) this.animation = requestAnimationFrame(this.paintText);
  };
  draw(ctx:CanvasRenderingContext2D, scene:string, viewport?:()=>SpeechViewport) {
    const speech = this.current; if (!speech) return;
    if (speech.scene !== scene) { this.clear(); return; }
    const v = viewport?.() || {left:0,right:768,top:0};
    const scale = v.scale || 1, leftEdge = v.screenLeft ?? 0, topEdge = v.screenTop ?? 0;
    const rightEdge = v.screenRight ?? innerWidth, bottomEdge = v.screenBottom ?? innerHeight;
    const width = Math.max(140, Math.min(240, rightEdge - leftEdge - 16));
    const font = this.preferences.textSize === 'large' ? 16 : 14;
    const key = `${speech.text}:${width}:${font}:${this.preferences.lines}`;
    if (key !== this.layoutKey) {
      ctx.save(); ctx.font = `600 ${font}px system-ui`;
      this.pages = dialoguePages(speech.text, width - 26, this.preferences.lines, value => ctx.measureText(value).width); ctx.restore();
      speech.page = Math.min(speech.page, this.pages.length - 1); this.layoutKey = key;
      this.root.style.width = `${width}px`; this.root.style.setProperty('--speech-font', `${font}px`);
      this.root.style.setProperty('--speech-lines', String(this.preferences.lines)); this.beginPage();
    }
    this.root.style.setProperty('--speech-opacity', String(this.preferences.opacity));
    const anchorX = (v.canvasLeft ?? 0) + speech.x * scale, anchorY = (v.canvasTop ?? 0) + speech.y * scale;
    const height = this.root.offsetHeight;
    const left = Math.max(leftEdge + 8, Math.min(rightEdge - width - 8, anchorX - width / 2));
    const top = Math.max(topEdge + 8, Math.min(bottomEdge - height - 8, anchorY - height - 10));
    this.root.style.left = `${Math.round(left)}px`; this.root.style.top = `${Math.round(top)}px`; this.root.style.visibility = 'visible';
    this.root.style.setProperty('--speech-tip', `${Math.max(14, Math.min(width - 14, anchorX - left))}px`);
  }
  settingsControl(): HTMLElement {
    const details = document.createElement('details'); details.className = 'sv-npc-settings';
    const summary = document.createElement('summary'); setDisplayText(summary, msg('Diálogos de los guías')); details.append(summary);
    const field = (label:string, control:HTMLElement) => { const row = document.createElement('label'), title = document.createElement('span'); setDisplayText(title,msg(label)); row.append(title,control); details.append(row); return row; };
    const opacity = document.createElement('input'); opacity.type='range'; opacity.min='35'; opacity.max='100'; opacity.step='5'; setDisplayAttribute(opacity,'aria-label',msg('Opacidad del fondo'));
    const output = document.createElement('output'); field('Opacidad del fondo',opacity).append(output);
    const size = document.createElement('select'); setDisplayAttribute(size,'aria-label',msg('Tamaño del texto'));
    for (const [value,label] of [['normal','Normal'],['large','Grande']]) { const o=document.createElement('option');o.value=value;setDisplayText(o,msg(label));size.append(o); } field('Tamaño del texto',size);
    const lines = document.createElement('select'); setDisplayAttribute(lines,'aria-label',msg('Texto por burbuja'));
    for (const [value,label] of [['2','Breve · 2 líneas'],['3','Más amplio · 3 líneas']]) { const o=document.createElement('option');o.value=value;setDisplayText(o,msg(label));lines.append(o); } field('Texto por burbuja',lines);
    const progressive = document.createElement('input'); progressive.type='checkbox';field('Texto progresivo',progressive);
    const hint=document.createElement('p');setDisplayText(hint,msg('Toca fuera para cerrar. Dentro, toca para completar el texto o pasar a la siguiente parte.'));details.append(hint);
    const error = document.createElement('p'); error.setAttribute('role','status');details.append(error);
    const sync = () => {opacity.value=String(Math.round(this.preferences.opacity*100));output.textContent=`${opacity.value}%`;size.value=this.preferences.textSize;lines.value=String(this.preferences.lines);progressive.checked=this.preferences.progressive;}; this.settingControls.push(sync);sync();
    const save = () => {
      this.preferences=parseDialoguePreferences({opacity:Number(opacity.value)/100,textSize:size.value,lines:Number(lines.value),progressive:progressive.checked});
      try {localStorage.setItem(NPC_DIALOGUE_KEY,JSON.stringify(this.preferences));error.textContent='';} catch {setDisplayText(error,msg('No se pudo guardar la preferencia en este equipo.'));}
      this.layoutKey='';this.settingControls.forEach(update=>update());
    };
    opacity.oninput=save;size.onchange=save;lines.onchange=save;progressive.onchange=save;
    return details;
  }
  dispose() { this.clear();document.removeEventListener('pointerdown',this.outside,true);document.removeEventListener('keydown',this.key,true);this.root.remove();this.announcement.remove(); }
}

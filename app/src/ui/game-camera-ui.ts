import { msg, t, defaultText, setDisplayText, setDisplayAttribute, getLocale, formatDate, type DisplayText } from '../i18n';
import type { WerewolvesView } from '../../../packages/core/src/minigames/werewolves';
import type { AppView } from '../../../packages/core/src/protocol/types';
import {colorIcon} from './pixel-icons';

interface Tile { root: HTMLElement; video: HTMLVideoElement; name: HTMLElement; quality: HTMLElement; stream: MediaStream }
export class GameCameraDock {
  readonly root = document.createElement('section');
  private button = document.createElement('button');
  private label = document.createElement('span');
  private gallery = document.createElement('div');
  private error = document.createElement('p');
  private tiles = new Map<string, Tile>();
  private bots=new Map<string,HTMLElement>();
  private container: HTMLElement | null = null;private sleep= document.createElement('p');private dead=false;private hidden=new Set<string>();private countdown:ReturnType<typeof setInterval>|null=null;private awake=false;private policyKey='';
  constructor(private readonly toggle: () => Promise<void>) {
    this.root.className = 'sv-game-camera'; setDisplayAttribute(this.root, 'aria-label', msg('Cámaras del juego'));
    const controls = document.createElement('div'); controls.className = 'sv-game-camera-controls';
    this.button.type = 'button'; this.button.className = 'sv-game-camera-toggle';
    // Camera glyph follows the existing 12 px icon grid; the card itself has a quiet rounded frame.
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('width','18'); icon.setAttribute('height','18'); icon.setAttribute('aria-hidden','true');
    const path = document.createElementNS(icon.namespaceURI,'path'); path.setAttribute('d','M8 5.5 9.5 3h5L16 5.5h3A2.5 2.5 0 0 1 21.5 8v10a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 18V8A2.5 2.5 0 0 1 5 5.5Z M16 12.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'); path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');icon.append(path);
    this.button.append(icon,this.label);this.button.onclick=()=>{void this.toggle();};
    this.error.className='sv-game-camera-error';this.error.setAttribute('role','status');this.error.hidden=true;
    this.gallery.className='sv-game-camera-gallery';controls.append(this.button);this.root.append(controls,this.error,this.sleep,this.gallery);this.sleep.hidden=true;
  }
  mount(container: HTMLElement): void { this.container=container;container.classList.add('has-game-camera');container.append(this.root); }
  update(view: AppView): void {
    const camera=view.network.gameCamera;
    const on=!!camera.local;this.button.disabled=this.dead;if(this.dead&&(on||camera.pending))void this.toggle();
    setDisplayText(this.label, camera.pending ? msg('Abriendo…') : on ? msg('Apagar') : msg('Cámara'));
    setDisplayAttribute(this.button, 'aria-label', camera.pending ? msg('Cancelar activación de cámara') : on ? msg('Apagar cámara') : msg('Activar cámara'));
    this.button.setAttribute('aria-pressed',String(on||camera.pending));this.button.classList.toggle('is-on',on);
    this.error.textContent=camera.error?t(camera.error):'';this.error.hidden=!camera.error;
    const streams=new Map<string,{stream:MediaStream;name:string;self:boolean}>();
    if(camera.local)streams.set(view.identity.fingerprint,{stream:camera.local,name:t('Tú'),self:true});
    for(const remote of camera.remote){const member=view.network.members.find(m=>m.identity.fingerprint===remote.identityId);streams.set(remote.identityId,{stream:remote.stream,name:member?.identity.displayName?defaultText(member.identity.displayName):t('Vecino'),self:false});}
    for(const [id,tile] of this.tiles)if(!streams.has(id)){tile.video.srcObject=null;tile.root.remove();this.tiles.delete(id);}
    for(const [id,item] of streams){
      let tile=this.tiles.get(id);
      if(tile&&tile.stream!==item.stream){tile.video.srcObject=null;tile.root.remove();this.tiles.delete(id);tile=undefined;}
      if(!tile){
        const card=document.createElement('div');card.className='sv-game-camera-tile';card.dataset.cameraPeer=id;
        const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.className=item.self?'is-self':'';video.srcObject=item.stream;setDisplayAttribute(video, 'aria-label', item.self ? msg('Tu cámara') : msg("Cámara de {p0}", { p0: item.name }));
        const caption=document.createElement('div');caption.className='sv-game-camera-caption';
        const dot=document.createElement('span');dot.className='sv-game-camera-live';dot.setAttribute('aria-hidden','true');
        const name=document.createElement('span');const quality=document.createElement('span');quality.className='sv-game-camera-quality';
        const hide=document.createElement('button');setDisplayText(hide,msg('Ocultar cámara'));hide.onclick=()=>{if(this.hidden.has(id))this.hidden.delete(id);else this.hidden.add(id);video.hidden=this.hidden.has(id);setDisplayText(hide,msg(video.hidden?'Mostrar cámara':'Ocultar cámara'));};video.hidden=this.hidden.has(id);caption.append(hide);
        caption.append(dot,name,quality);card.append(video,caption);this.gallery.append(card);
        const current:Tile={root:card,video,name,quality,stream:item.stream};this.tiles.set(id,current);tile=current;
        const updateQuality=()=>{setDisplayText(quality, video.videoWidth>=1920&&video.videoHeight>=1080 ? msg('Full HD') : Math.min(video.videoWidth,video.videoHeight)>=720 ? msg('HD') : '');};
        video.onloadedmetadata=updateQuality;video.addEventListener('resize',updateQuality);
        void video.play().catch(()=>{/* Muted inline video can resume after a browser gesture. */});
      }
      tile.name.textContent=item.name;
    }
    const live=streams.size>0||this.bots.size>0;this.root.classList.toggle('is-live',live);this.container?.classList.toggle('is-camera-live',live);
  }
  policy(view:WerewolvesView|null):void {
    if(!view)return;this.dead=!view.canBroadcastCamera;
    const activeBots=view.players.filter(p=>p.bot&&(p.alive||view.phase==='end')&&view.phase!=='lobby');
    for(const [id,element]of this.bots)if(!activeBots.some(p=>p.id===id)){element.remove();this.bots.delete(id);}
    for(const bot of activeBots)if(!this.bots.has(bot.id)){const tile=document.createElement('div');tile.className='sv-game-camera-tile is-bot';tile.dataset.cameraPeer=bot.id;tile.append(colorIcon('bot',80));const caption=document.createElement('div');caption.className='sv-game-camera-caption';caption.textContent=bot.name;tile.append(caption);this.gallery.append(tile);this.bots.set(bot.id,tile);}
    const awake=view.canSeeCameras;const key=[view.phase,view.step,view.me.acted,view.me.alive,awake].join(':');if(key===this.policyKey)return;this.policyKey=key;
    this.root.dataset.phase=view.phase;
    if(this.countdown&&!awake&&!this.awake)return;
    if(this.countdown)clearInterval(this.countdown);this.countdown=null;
    if(this.awake&&!awake){let n=3;this.sleep.hidden=false;setDisplayText(this.sleep,msg('Cerrar los ojos en {n}…',{n}));this.countdown=setInterval(()=>{n--;if(n>0)setDisplayText(this.sleep,msg('Cerrar los ojos en {n}…',{n}));else{clearInterval(this.countdown!);this.countdown=null;this.gallery.hidden=true;setDisplayText(this.sleep,msg('La aldea duerme. Las voces siguen activas.'));}},1000);}
    else {this.gallery.hidden=!awake;this.sleep.hidden=awake;if(!awake)setDisplayText(this.sleep,msg('La aldea duerme. Las voces siguen activas.'));}
    this.awake=awake;
  }
  unmount(): void {if(this.countdown)clearInterval(this.countdown);this.dead=false;this.awake=false;this.policyKey='';this.gallery.hidden=false;this.sleep.hidden=true;
    for(const tile of this.tiles.values())tile.video.srcObject=null;
    this.tiles.clear();this.bots.clear();this.gallery.replaceChildren();this.root.remove();this.container?.classList.remove('has-game-camera','is-camera-live');this.container=null;
  }
}

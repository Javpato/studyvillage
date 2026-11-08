import {PetController,petSpecies,newPetConfig,type PetHome,type PetEntity,type PetConfig,type Point} from '../../../packages/core/src/pets/model';
import {petSnapshotSchema,type PetBot} from '../../../packages/core/src/pets/protocol';
import type {AppActions,AppView,PublicHouse,Furniture} from '../../../packages/core/src/protocol/types';
import {LocalWorkspaces} from '../../../packages/runtime/src/storage/workspaces';
import {spaceKey,type HouseSpace} from '../../../packages/core/src/house/workspaces';
import {gardenBounds,gardenItemRect,resolveGardenItem,gardenDoorway} from '../../../packages/core/src/world/garden';
import {occupiedParcels,worldObstacles,findPath,circleHitsRect,type Rect} from '../world/model';
import {HOUSE_BOUNDS,houseObstacles} from '../house/model';
import {drawPet} from './art';
import {msg,t,setDisplayText,setDisplayAttribute} from '../i18n';
import {NpcSpeech} from '../ui/npc-speech';
export interface PetWorldContext {view():AppView|null;scene():string;position():Point;obstacles():Rect[];save(home:PetHome,config:PetConfig):void;stop():void;}
export class PetWorld {
 readonly panel=document.createElement('dialog');
 private homes:PetHome[]=[];private habitats=new Map<string,{bounds:Rect;obstacles:Rect[];bowls:{id:string;point:Point}[]}>();private remote=new Map<string,{seq:number;pets:PetEntity[];at:number}>();private sequence=Date.now();private sent=0;private synced=0;private signature='';private selected:string|null=null;private off:()=>void;private speech=new NpcSpeech();private said=new Map<string,number>();private reserved=new Set<string>();private matches=new Map<string,string[]>();
 readonly controller:PetController;
 constructor(private ctx:PetWorldContext,private actions:Pick<AppActions,'onApp'|'sendApp'>){
  this.controller=new PetController({safe:(scene,p,h)=>this.safe(scene,p,h),path:(scene,a,b,h)=>{const habitat=this.habitat(scene,h);return habitat?findPath(a,b,habitat.obstacles,habitat.bounds):null;},wander:(h,r)=>{const b=this.habitat(h.scene,h)?.bounds;return b?this.safe(h.scene,{x:b.x+r()*b.w,y:b.y+r()*b.h},h):null;},bowls:h=>this.habitats.get(h.scene)?.bowls??[]});
  this.panel.className='sv-pet-panel';setDisplayAttribute(this.panel,'aria-label',msg('Mascotas'));document.body.append(this.panel);this.panel.addEventListener('close',()=>ctx.stop());
  this.off=actions.onApp(message=>{if(message.channel!=='pets')return;const view=ctx.view();if(!view||!view.network.members.some(m=>m.connected&&m.identity.fingerprint===message.from))return;try{const packet=petSnapshotSchema.parse(JSON.parse(message.data));const old=this.remote.get(message.from);if(old&&packet.seq<=old.seq)return;
   const pets=packet.pets.filter(p=>p.owner===message.from&&this.validRemote(p,view));this.remote.set(message.from,{seq:packet.seq,pets,at:Date.now()});}catch{/* Ignore malformed or unauthenticated pet state. */}});
 }
 private validRemote(p:PetEntity,view:AppView){const owner=view.network.members.find(m=>m.identity.fingerprint===p.owner);if(!owner)return false;const ownerScene=owner.houseId?`house:${owner.houseId}:${spaceKey(owner.position.space)}`:`area:${owner.position.areaId??'residential'}`;return p.scene===ownerScene&&p.scene===this.ctx.scene();}
 private habitat(scene:string,home?:PetHome){const h=this.habitats.get(scene);if(home&&scene===home.scene)return h;return scene===this.ctx.scene()?{bounds:scene.startsWith('house:')?HOUSE_BOUNDS:{x:0,y:0,w:768,h:432},obstacles:this.ctx.obstacles(),bowls:[]}:h;}
 private safe(scene:string,p:Point,home?:PetHome):Point|null{
  const h=this.habitat(scene,home);if(!h)return null;const free=(q:Point)=>q.x>=h.bounds.x+9&&q.y>=h.bounds.y+9&&q.x<=h.bounds.x+h.bounds.w-9&&q.y<=h.bounds.y+h.bounds.h-9&&!h.obstacles.some(r=>circleHitsRect(q.x,q.y,9,r));if(free(p))return p;
  for(let radius=8;radius<=96;radius+=8)for(let n=0;n<16;n++){const q={x:p.x+Math.cos(n*Math.PI/8)*radius,y:p.y+Math.sin(n*Math.PI/8)*radius};if(free(q))return q;}return null;
 }
 sync(){const view=this.ctx.view();if(!view)return;const me=view.identity.fingerprint,house=view.ownHouse,homes:PetHome[]=[];this.habitats.clear();
  const room=(space:HouseSpace|null,items:Furniture[])=>{const scene=`house:${me}:${spaceKey(space)}`,bowls=items.filter(i=>i.kind==='pet-bowl').map(i=>({id:`${scene}:${i.id}`,point:{x:i.x+12,y:i.y+36}}));this.habitats.set(scene,{bounds:HOUSE_BOUNDS,obstacles:houseObstacles({...house,furniture:items}),bowls});for(const item of items){const species=petSpecies(item.kind);if(species){const config=item.pet??newPetConfig(item.id);homes.push({id:config.id,owner:me,furnitureId:item.id,species,scene,x:item.x+24,y:item.y+62,config});}}};
  room(null,house.furniture);const storage=new LocalWorkspaces(me);for(const floor of house.floors??[])for(const id of floor.rooms.map(r=>r.id)){const space={floorId:floor.id,roomId:id},current=view.network.workspace;const doc=current?.houseId===me&&spaceKey(current.space)===spaceKey(space)?current.document:storage.get(me,space);if(doc)room(space,doc.furniture);}
  const parcel=occupiedParcels(view).find(p=>p.isOwn)?.parcel;if(parcel){const scene='area:residential',items=(house.garden??[]).map(i=>resolveGardenItem(parcel,i)),bowls=items.filter(i=>i.kind==='pet-bowl').map(i=>{const r=gardenItemRect(parcel,i);return{id:`garden:${i.id}`,point:{x:r.x+16,y:r.y+40}};});this.habitats.set(scene,{bounds:gardenBounds(parcel),obstacles:[...worldObstacles(occupiedParcels(view)),gardenDoorway(parcel),...items.map(i=>gardenItemRect(parcel,i))],bowls});for(const item of items){const species=petSpecies(item.kind);if(species){const r=gardenItemRect(parcel,item),config=item.pet??newPetConfig(item.id);homes.push({id:config.id,owner:me,furnitureId:item.id,species,scene,x:r.x+16,y:r.y+44,config});}}}
  this.homes=homes;this.controller.reconcile(homes);for(const id of this.reserved)this.controller.reserve(id,true);const signature=JSON.stringify(homes.map(h=>[h.id,h.config]));if(signature!==this.signature){this.signature=signature;if(this.panel.open)this.render();}
 }
 tick(dt:number,now:number){if(now-this.synced>500){this.synced=now;this.sync();}const view=this.ctx.view();if(!view)return;const authority=view.network.phase!=='JOINED'||!view.network.devices?.length||!!view.network.devices.find(d=>d.current&&d.media);if(authority)this.controller.tick(dt,Date.now(),{scene:this.ctx.scene(),position:this.ctx.position()});
  for(const [owner,r]of this.remote)if(Date.now()-r.at>10000||!view.network.members.some(m=>m.connected&&m.identity.fingerprint===owner))this.remote.delete(owner);
  if(authority&&view.network.phase==='JOINED'&&now-this.sent>150){this.sent=now;this.actions.sendApp('pets',null,JSON.stringify({version:1,seq:++this.sequence,pets:this.controller.entities().filter(p=>p.scene===this.ctx.scene())}));}
 }
 draw(ctx:CanvasRenderingContext2D,now:number,canvas:HTMLCanvasElement){const scene=this.ctx.scene();for(const pet of [...this.controller.entities(),...[...this.remote.values()].flatMap(r=>r.pets)].filter(p=>p.scene===scene&&p.state!=='game').sort((a,b)=>a.y-b.y)){drawPet(ctx,pet,now);if(pet.phrase&&pet.reactionUntil>Date.now()&&this.said.get(pet.id)!==pet.reactionUntil){this.said.set(pet.id,pet.reactionUntil);this.speech.say(pet.phrase,pet.x,pet.y-24,scene);}}
  this.speech.draw(ctx,scene,()=>{const r=canvas.getBoundingClientRect();return{left:0,right:768,top:0,canvasLeft:r.left,canvasTop:r.top,scale:r.width/768,screenLeft:Math.max(0,r.left),screenTop:Math.max(0,r.top),screenRight:Math.min(innerWidth,r.right),screenBottom:Math.min(innerHeight,r.bottom)};});
 }
 count(){this.sync();return this.homes.length;}
 get active(){return this.controller.entities().some(p=>p.scene===this.ctx.scene())||this.remote.size>0;}
 bots():PetBot[]{this.sync();return this.homes.filter(h=>!this.reserved.has(h.id)).map(h=>({id:h.id,owner:h.owner,species:h.species,name:h.config.name||t(({cat:'Gato',dog:'Perro',parrot:'Loro',hamster:'Hámster',rabbit:'Conejo'})[h.species])}));}
 match(key:string,ids:string[]){this.matches.set(key,ids);this.reserve([...this.matches.values()].flat());}
 reserve(ids:string[]){const next=new Set(ids);for(const id of this.reserved)if(!next.has(id))this.controller.reserve(id,false);for(const id of next)if(!this.reserved.has(id))this.controller.reserve(id,true);this.reserved=next;}
 hit(point:Point):boolean{const p=this.controller.entities().filter(p=>p.scene===this.ctx.scene()&&p.state!=='game').find(p=>Math.hypot(p.x-point.x,p.y-12-point.y)<22);if(!p)return false;this.open(p.id);return true;}
 open(id?:string){this.sync();this.selected=id??null;this.ctx.stop();this.render();if(!this.panel.open)this.panel.showModal();}
 private render(){this.panel.replaceChildren();const header=document.createElement('h2');setDisplayText(header,msg('Mascotas · {count}/5 casas',{count:this.homes.length}));this.panel.append(header);const button=(key:string,run:()=>void)=>{const b=document.createElement('button');b.className='sv-button';b.type='button';setDisplayText(b,msg(key));b.onclick=run;return b;};this.panel.append(button('Cerrar',()=>this.panel.close()));
  const hint=document.createElement('p');setDisplayText(hint,msg('Coloca una casa de mascota desde Decorar o Mi jardín. Cada casa recibe su animal; no hay desbloqueos.'));this.panel.append(hint);
  for(const home of this.homes.filter(h=>!this.selected||h.id===this.selected)){const section=document.createElement('section'),title=document.createElement('h3');title.textContent=home.config.name||t(({cat:'Gato',dog:'Perro',parrot:'Loro',hamster:'Hámster',rabbit:'Conejo'})[home.species]);section.append(title);const img=document.createElement('img');img.src=new URL(`sprites/pet-${home.species}.png`,document.baseURI).href;img.width=64;img.alt='';section.append(img);
   const name=document.createElement('input');name.maxLength=32;name.value=home.config.name??'';setDisplayAttribute(name,'aria-label',msg('Nombre de la mascota'));name.onchange=()=>this.ctx.save(home,{...home.config,name:name.value.trim()});section.append(name);
   const command=(mode:'roam'|'follow')=>{this.ctx.save(home,{...home.config,mode});home.config.mode=mode;this.controller.reconcile(this.homes);this.render();};
   const roam=button('Quedarse aquí / Pasear',()=>{command('roam');this.controller.sendHome(home.id);}),follow=button('Sígueme',()=>command('follow'));roam.setAttribute('aria-pressed',String(home.config.mode==='roam'));follow.setAttribute('aria-pressed',String(home.config.mode==='follow'));section.append(roam,follow,button('Volver a casa',()=>{command('roam');this.controller.sendHome(home.id);}));
   const pet=button('Acariciar',()=>{this.controller.pet(home.id,Date.now());this.panel.close();});section.append(pet);
   if(home.species==='parrot'){const phrase=document.createElement('input');phrase.maxLength=160;phrase.value=home.config.phrase??'';setDisplayAttribute(phrase,'aria-label',msg('Frase del loro'));phrase.onchange=()=>{home.config.phrase=phrase.value;this.ctx.save(home,{...home.config});};section.append(phrase);}
   const ability=button(({cat:'Ronronear',dog:'Buscar juguete',parrot:'Repetir frase',hamster:'Rodar en bola',rabbit:'Saltar aquí'})[home.species],()=>{const target=this.ctx.position();this.controller.ability(home.id,Date.now(),home.species==='rabbit'?target:undefined);this.panel.close();});section.append(ability);
   const nearby=this.controller.entities().some(p=>p.id===home.id&&p.scene===this.ctx.scene()&&Math.hypot(p.x-this.ctx.position().x,p.y-this.ctx.position().y)<120);pet.disabled=ability.disabled=!nearby||this.reserved.has(home.id);follow.disabled=roam.disabled=this.reserved.has(home.id);this.panel.append(section);
  }
 }
 dispose(){this.off();this.speech.dispose();this.panel.remove();}
}

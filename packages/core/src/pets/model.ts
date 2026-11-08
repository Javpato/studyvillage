import {z} from 'zod';
export const PET_SPECIES=['cat','dog','parrot','hamster','rabbit'] as const;
export type PetSpecies=typeof PET_SPECIES[number];
export const PET_HOUSES=['pet-cat','pet-dog','pet-parrot','pet-hamster','pet-rabbit'] as const;
export const PET_LIMIT=5;
export const PET_LIMIT_MESSAGE='Puedes colocar un máximo de 5 casas de mascotas entre todas las habitaciones y el jardín.';
export const petConfigSchema=z.strictObject({id:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),mode:z.enum(['roam','follow']),name:z.string().max(32).optional(),phrase:z.string().max(160).optional()});
export type PetConfig=z.infer<typeof petConfigSchema>;
export const petSpecies=(kind:string):PetSpecies|null=>PET_HOUSES.includes(kind as typeof PET_HOUSES[number])?kind.slice(4) as PetSpecies:null;
export const petCount=(items:readonly {kind:string}[])=>items.filter(i=>petSpecies(i.kind)).length;
export function assertPetLimit(groups:readonly (readonly {kind:string}[])[]):void{if(groups.reduce((n,g)=>n+petCount(g),0)>PET_LIMIT)throw new Error(PET_LIMIT_MESSAGE);}
export function newPetConfig(id:string):PetConfig{return{id,mode:'roam'};}
export interface PetHome {id:string;owner:string;furnitureId:string;species:PetSpecies;scene:string;x:number;y:number;config:PetConfig}
export type PetState='idle'|'roaming'|'following'|'food'|'eating'|'petted'|'home'|'game'|'ability'|'rest';
export type Point={x:number;y:number};
export interface PetEntity extends Point {id:string;owner:string;species:PetSpecies;scene:string;state:PetState;direction:'up'|'down'|'left'|'right';moving:boolean;phrase?:string;reactionUntil:number}
export const PET_BEHAVIOR={follow:48,stop:32,far:256,stuck:3000,recoveryCooldown:5000,speed:82,petting:1800,ability:3200,abilityCooldown:5000,foodMin:120000,foodMax:300000,eating:3500} as const;
export interface PetNavigation {
 path(scene:string,from:Point,to:Point,home?:PetHome):Point[]|null;
 safe(scene:string,point:Point,home?:PetHome):Point|null;
 wander(home:PetHome,random:()=>number):Point|null;
 bowls(home:PetHome):{id:string;point:Point}[];
}
interface Actor {home:PetHome;entity:PetEntity;path:Point[];target:Point|null;wait:number;food:number;stuck:number;cooldown:number;abilityCooldown:number;bowl:string|null;returnToy:boolean;game:boolean;lastCommand:PetConfig['mode']}
/** Decisions are run by one owner authority; remote clients only render snapshots. */
export class PetController {
 private actors=new Map<string,Actor>();private bowls=new Map<string,string>();
 constructor(private nav:PetNavigation,private random:()=>number=Math.random){}
 private foodDelay(){return PET_BEHAVIOR.foodMin+this.random()*(PET_BEHAVIOR.foodMax-PET_BEHAVIOR.foodMin);}
 reconcile(homes:PetHome[]){
  const ids=new Set(homes.map(h=>h.id));for(const [id,a]of this.actors)if(!ids.has(id)){this.releaseBowl(a);this.actors.delete(id);}
  for(const home of homes){const old=this.actors.get(home.id);if(old){const moved=old.home.scene!==home.scene||old.home.x!==home.x||old.home.y!==home.y;old.home=home;if(old.lastCommand!==home.config.mode){old.lastCommand=home.config.mode;this.interrupt(old);}
    if(moved&&home.config.mode==='roam')this.sendHome(home.id);continue;}
   const at=this.nav.safe(home.scene,home,home)??home;
   this.actors.set(home.id,{home,entity:{id:home.id,owner:home.owner,species:home.species,scene:home.scene,x:at.x,y:at.y,state:'idle',direction:'down',moving:false,reactionUntil:0},path:[],target:null,wait:1000,food:this.foodDelay(),stuck:0,cooldown:0,abilityCooldown:0,bowl:null,returnToy:false,game:false,lastCommand:home.config.mode});
  }
 }
 entities():PetEntity[]{return [...this.actors.values()].map(a=>({...a.entity}));}
 home(id:string){return this.actors.get(id)?.home;}
 private releaseBowl(a:Actor){if(a.bowl)this.bowls.delete(a.bowl);a.bowl=null;}
 private interrupt(a:Actor){this.releaseBowl(a);a.path=[];a.target=null;a.wait=0;a.returnToy=false;a.entity.phrase=undefined;a.entity.moving=false;a.entity.state=a.game?'game':'idle';}
 reserve(id:string,on:boolean){const a=this.actors.get(id);if(!a)return;a.game=on;this.interrupt(a);if(!on)this.sendHome(id);}
 sendHome(id:string){const a=this.actors.get(id);if(!a||a.game)return;this.interrupt(a);const at=this.nav.safe(a.home.scene,a.home,a.home);if(at){if(a.entity.scene===a.home.scene){a.path=this.nav.path(a.home.scene,a.entity,at,a.home)??[];a.entity.state='home';}else Object.assign(a.entity,at,{scene:a.home.scene,state:'idle'});a.wait=0;}}
 pet(id:string,now:number):boolean{const a=this.actors.get(id);if(!a||a.game||['petted','ability'].includes(a.entity.state))return false;this.interrupt(a);a.entity.state='petted';a.wait=PET_BEHAVIOR.petting;a.entity.reactionUntil=now+a.wait;return true;}
 ability(id:string,now:number,target?:Point):boolean{
  const a=this.actors.get(id);if(!a||a.game||a.abilityCooldown>0||['petted','ability'].includes(a.entity.state))return false;
  const home=a.home.config.mode==='roam'?a.home:undefined;
  const point=target??{x:a.entity.x+48,y:a.entity.y};
  const route=['dog','hamster','rabbit'].includes(a.home.species)?this.nav.path(a.entity.scene,a.entity,point,home):[];
  if(!route||Math.hypot(point.x-a.entity.x,point.y-a.entity.y)>128)return false;
  this.interrupt(a);a.entity.state='ability';a.wait=PET_BEHAVIOR.ability;a.abilityCooldown=PET_BEHAVIOR.abilityCooldown;a.path=route;a.target=point;a.returnToy=a.home.species==='dog';
  if(a.home.species==='parrot')a.entity.phrase=a.home.config.phrase||'♪';a.entity.reactionUntil=now+PET_BEHAVIOR.ability;return true;
 }
 tick(dt:number,now:number,owner:{scene:string;position:Point}){
  const ms=Math.min(100,Math.max(0,dt*1000));const followers=[...this.actors.values()].filter(a=>a.home.config.mode==='follow').sort((a,b)=>a.home.id.localeCompare(b.home.id));
  for(const a of this.actors.values()){
   const e=a.entity;e.moving=false;a.cooldown=Math.max(0,a.cooldown-ms);a.abilityCooldown=Math.max(0,a.abilityCooldown-ms);
   if(a.game){e.state='game';continue;}
   if(a.home.config.mode==='follow'&&e.scene!==owner.scene){const at=this.nav.safe(owner.scene,owner.position);if(!at)continue;this.interrupt(a);Object.assign(e,at,{scene:owner.scene});}
   if(a.home.config.mode==='roam'&&e.scene!==a.home.scene){this.sendHome(e.id);}
   if(e.scene!==owner.scene)continue; // Ambient time is active simulation, never offline debt.
   if(a.home.config.mode==='roam')a.food-=ms;
   if(a.bowl&&!this.nav.bowls(a.home).some(b=>b.id===a.bowl)){this.interrupt(a);}
   if(['petted','eating','rest'].includes(e.state)){a.wait-=ms;if(a.wait>0)continue;this.interrupt(a);}
   if(e.state==='ability'){a.wait-=ms;if(a.wait<=0){this.interrupt(a);}else if(!a.path.length){if(a.returnToy){a.returnToy=false;a.path=this.nav.path(e.scene,e,owner.position,a.home.config.mode==='roam'?a.home:undefined)??[];}else continue;}}
   if(e.state==='home'&&!a.path.length)this.interrupt(a);
   if(e.state!=='ability'&&e.state!=='home'){
    if(a.home.config.mode==='follow'){
     const slot=followers.indexOf(a),angle=slot*2.39996,target={x:owner.position.x+Math.cos(angle)*PET_BEHAVIOR.follow,y:owner.position.y+Math.sin(angle)*PET_BEHAVIOR.follow};
     const distance=Math.hypot(target.x-e.x,target.y-e.y);e.state='following';
     if(distance>PET_BEHAVIOR.follow||a.path.length&&distance>PET_BEHAVIOR.stop){if(!a.target||Math.hypot(target.x-a.target.x,target.y-a.target.y)>16||!a.path.length){a.target=target;a.path=this.nav.path(e.scene,e,target)??[];}
      if(!a.path.length)a.stuck+=ms;
      if(a.stuck>=PET_BEHAVIOR.stuck&&Math.hypot(owner.position.x-e.x,owner.position.y-e.y)>PET_BEHAVIOR.far&&!a.cooldown){const at=this.nav.safe(e.scene,target);if(at){Object.assign(e,at);a.path=[];a.stuck=0;a.cooldown=PET_BEHAVIOR.recoveryCooldown;}}
     }else{a.path=[];a.stuck=0;}
    }else{
     if(e.state==='food'&&!a.path.length){e.state='eating';a.wait=PET_BEHAVIOR.eating;a.food=this.foodDelay();continue;}
     if(!a.path.length){a.wait-=ms;if(a.wait>0)continue;
      if(a.food<=0){a.food=this.foodDelay();for(const bowl of this.nav.bowls(a.home)){if(this.bowls.has(bowl.id))continue;const path=this.nav.path(e.scene,e,bowl.point,a.home);if(!path)continue;a.path=path;a.bowl=bowl.id;this.bowls.set(bowl.id,e.id);e.state='food';break;}}
      if(!a.path.length){const target=this.nav.wander(a.home,this.random);a.path=target?this.nav.path(e.scene,e,target,a.home)??[]:[];e.state=this.random()<.2?'rest':'roaming';a.wait=1500+this.random()*4000;if(e.state==='rest'){a.path=[];continue;}}
     }
    }
   }
   const target=a.path[0];if(target){const dx=target.x-e.x,dy=target.y-e.y,d=Math.hypot(dx,dy),step=Math.min(d,PET_BEHAVIOR.speed*ms/1000);const at={x:e.x+dx/(d||1)*step,y:e.y+dy/(d||1)*step};const safe=this.nav.safe(e.scene,at,a.home.config.mode==='roam'?a.home:undefined);
    if(safe&&Math.hypot(safe.x-at.x,safe.y-at.y)<1){Object.assign(e,at);e.moving=step>0;e.direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';a.stuck=0;if(d<3||step===d)a.path.shift();}else{a.stuck+=ms;a.path=[];}
   }
  }
 }
}

export function ownerPetGroups(house:import('../protocol/types').PublicHouse,read:(space:{floorId:string;roomId:string|null})=>{furniture:readonly {kind:string}[]}|null):readonly (readonly {kind:string}[])[]{
 const groups:(readonly {kind:string}[])[]=[house.furniture,house.garden??[]];
 for(const floor of house.floors??[])for(const room of [null,...floor.rooms.map(r=>r.id)])groups.push(read({floorId:floor.id,roomId:room})?.furniture??[]);
 return groups;
}
export function ownsPet(house:import('../protocol/types').PublicHouse,read:(space:{floorId:string;roomId:string|null})=>{furniture:readonly {kind:string;id:string;pet?:PetConfig}[]}|null,pet:{owner:string;id:string;species:PetSpecies}):boolean{
 if(house.ownerId!==pet.owner)return false;
 const groups=ownerPetGroups(house,read) as readonly (readonly {kind:string;id:string;pet?:PetConfig}[])[];
 return groups.some(items=>items.some(item=>(item.pet?.id??item.id)===pet.id&&petSpecies(item.kind)===pet.species));
}

import {z} from 'zod';
import {PET_SPECIES} from './model';
export const petCommandSchema=z.strictObject({version:z.literal(1),command:z.enum(['pet','ability']),id:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),target:z.strictObject({x:z.number().finite().min(0).max(768),y:z.number().finite().min(0).max(432)}).optional()});
export const petBotSchema=z.strictObject({id:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),owner:z.string().regex(/^[a-f0-9]{64}$/),species:z.enum(PET_SPECIES),name:z.string().min(1).max(32)});
export type PetBot=z.infer<typeof petBotSchema>;
export const petSnapshotSchema=z.strictObject({version:z.literal(1),seq:z.number().int().nonnegative(),pets:z.array(z.strictObject({id:z.string().max(80),owner:z.string().regex(/^[a-f0-9]{64}$/),species:z.enum(PET_SPECIES),scene:z.string().max(180),state:z.enum(['idle','roaming','following','food','eating','petted','home','game','ability','rest']),x:z.number().finite().min(0).max(768),y:z.number().finite().min(0).max(432),direction:z.enum(['up','down','left','right']),moving:z.boolean(),phrase:z.string().max(160).optional(),toy:z.strictObject({x:z.number().finite().min(0).max(768),y:z.number().finite().min(0).max(432)}).optional(),reactionUntil:z.number().finite().nonnegative()})).max(5)});
/** Shared by all activity engines on a single authority, never by individual renderers. */
export class PetReservations {
 private matches=new Map<string,string>();
 constructor(private eligible:(pet:PetBot)=>boolean=()=>true){}
 available(pet:PetBot){return this.eligible(pet);}
 reserve(pet:PetBot,actor:string,match:string):void{
  if(pet.owner!==actor||!this.eligible(pet))throw new Error('Esta mascota no está disponible.');
  const key=`${pet.owner}:${pet.id}`,current=this.matches.get(key);if(current)throw new Error('Esta mascota ya participa en una partida.');this.matches.set(key,match);
 }
 release(pet:PetBot,match:string){const key=`${pet.owner}:${pet.id}`;if(this.matches.get(key)===match)this.matches.delete(key);}
 releaseMatch(match:string){for(const [key,value]of this.matches)if(value===match)this.matches.delete(key);}
 reserved(owner:string,id:string){return this.matches.has(`${owner}:${id}`);}
}
export class PetMatch {
 readonly id=crypto.randomUUID();private pets=new Map<string,PetBot>();private held=new Set<string>();
 constructor(private registry=new PetReservations()){}
 connect(registry:PetReservations){this.clear();this.registry=registry;}
 add(raw:PetBot,actor:string){const pet=petBotSchema.parse(raw);this.registry.reserve(pet,actor,this.id);this.pets.set(`${pet.owner}:${pet.id}`,pet);this.held.add(`${pet.owner}:${pet.id}`);return pet;}
 remove(id:string,owner:string){const key=`${owner}:${id}`,pet=this.pets.get(key);if(pet)this.registry.release(pet,this.id);this.pets.delete(key);this.held.delete(key);}
 valid(){return [...this.pets.values()].every(p=>this.registry.available(p));}
 start(){const acquired:string[]=[];try{for(const [key,p] of this.pets)if(!this.held.has(key)){this.registry.reserve(p,p.owner,this.id);acquired.push(key);this.held.add(key);}}catch(error){for(const id of acquired){this.registry.release(this.pets.get(id)!,this.id);this.held.delete(id);}throw error;}}
 release(){this.registry.releaseMatch(this.id);this.held.clear();}
 clear(){this.release();this.pets.clear();}
}

import {petCollection,saveOwnedPet,removeOwnedPet} from '../../../packages/runtime/src/storage/pets';
import {type OwnedPet} from '../../../packages/core/src/pets/definitions';
import {newPetConfig,type PetHome,type PetConfig} from '../../../packages/core/src/pets/model';
import {loadPetCollection,cachePetAsset} from '../assets/pet-custom';
import {PetAtelier} from '../ui/pet-atelier';
import {petPortrait} from './art';
import {msg,t,setDisplayText,setDisplayAttribute} from '../i18n';
import {errorMessage} from '../errors/messages';
interface CollectionContext {owner():string;homes():PetHome[];reserved(id:string):boolean;save(home:PetHome,config:PetConfig):Promise<void>;place(pet:OwnedPet):void;}
export class PetCollectionPanel {
 readonly root=document.createElement('dialog');private atelierInstance:PetAtelier|null=null;private assignment:PetHome|null=null;private error=document.createElement('p');
 constructor(private ctx:CollectionContext){this.root.className='sv-pet-collection';setDisplayAttribute(this.root,'aria-label',msg('Colección de mascotas'));document.body.append(this.root);}
 get atelierOpen(){return this.atelierInstance?.root.open??false;}
 get atelier(){if(!this.atelierInstance){const ctx=this.ctx;this.atelierInstance=new PetAtelier(async(pet,place)=>{if(this.ctx.reserved(pet.appearance.id))throw Error(t('Esta mascota está jugando. Termina la partida antes de editarla.'));await saveOwnedPet(pet);for(const home of ctx.homes().filter(h=>h.config.custom?.id===pet.appearance.id&&!h.config.empty))await ctx.save(home,{...home.config,name:pet.appearance.name,custom:pet.appearance,phrase:pet.appearance.phrase,ball:pet.appearance.ability==='ball'&&home.config.ball});if(place){if(ctx.homes().some(h=>!h.config.empty&&h.id===pet.appearance.id))throw Error(t('Esta mascota ya tiene una casa.'));ctx.place(pet);}else await this.open();});}return this.atelierInstance;}
 create(pet?:OwnedPet){this.root.close();this.atelier.open(this.ctx.owner(),pet);}
 async open(home?:PetHome){this.assignment=home??null;await this.render();if(!this.root.open)this.root.showModal();}
 private b(label:string,run:()=>void|Promise<void>){const b=document.createElement('button');b.type='button';b.className='sv-button';setDisplayText(b,msg(label));b.onclick=()=>{Promise.resolve().then(run).catch(e=>{this.error.textContent=errorMessage(e);});};return b;}
 private async render(){const pets=await loadPetCollection(this.ctx.owner());this.root.replaceChildren();const header=document.createElement('header'),title=document.createElement('h2');setDisplayText(title,msg(this.assignment?'Asignar mascota':'Colección de mascotas'));header.append(title,this.b('Cerrar',()=>this.root.close()));this.root.append(header);this.error.textContent='';this.error.setAttribute('role','alert');this.root.append(this.error,this.b('Crear animal',()=>this.create()));
  const count=document.createElement('p');setDisplayText(count,msg('Mascotas · {count}/5 casas',{count:this.ctx.homes().length}));this.root.append(count);
  if(this.assignment){const home=this.assignment;this.root.append(this.b('Dejar casa vacía',async()=>{await this.ctx.save(home,{...newPetConfig(home.furnitureId),empty:true});this.root.close();}),this.b('Restaurar mascota original',async()=>{await this.ctx.save(home,newPetConfig(home.furnitureId));this.root.close();}));}
  for(const pet of pets){const a=pet.appearance,home=this.ctx.homes().find(h=>h.config.custom?.id===a.id&&!h.config.empty),reserved=this.ctx.reserved(a.id),section=document.createElement('section'),heading=document.createElement('h3'),identity=document.createElement('div');identity.className='sv-pet-identity';heading.textContent=a.name;identity.append(petPortrait({id:a.id,owner:pet.owner,species:a.template,custom:a}),heading);section.append(identity);const status=document.createElement('p');setDisplayText(status,msg(home?'En casa':'En colección'));section.append(status);const actions=document.createElement('div');actions.className='sv-pet-actions';
   const edit=this.b('Editar mascota',()=>this.create(pet));edit.disabled=reserved;actions.append(edit,this.b('Duplicar',async()=>{const copy={...structuredClone(pet),appearance:{...a,id:crypto.randomUUID(),revision:0,name:a.name.slice(0,32)}};await saveOwnedPet(copy);await this.render();}));
   if(this.assignment){const target=this.assignment;const assign=this.b('Asignar a esta casa',async()=>{if(home&&home.furnitureId!==target.furnitureId)await this.ctx.save(home,{...newPetConfig(home.furnitureId),empty:true});await this.ctx.save(target,{id:a.id,mode:'roam',name:a.name,custom:a,phrase:a.phrase});this.root.close();});assign.disabled=reserved;actions.append(assign);}else if(home){const release=this.b('Volver a la colección',async()=>{await this.ctx.save(home,{...newPetConfig(home.furnitureId),empty:true});await this.render();});release.disabled=reserved;actions.append(release);}else{actions.append(this.b('Colocar casa',()=>{this.ctx.place(pet);this.root.close();}),this.b('Eliminar',async()=>{await removeOwnedPet(pet.owner,a.id);await this.render();}));}section.append(actions);this.root.append(section);
  }
 }
 dispose(){this.atelierInstance?.dispose();this.root.remove();}
}

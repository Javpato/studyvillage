import {ownedPetSchema,type OwnedPet} from '../../../core/src/pets/definitions';
import {petCollection,replacePetCollection} from './pets';
import {assertPetLimit} from '../../../core/src/pets/model';
import {phoneLayoutSchema} from '../../../core/src/phone/layout';
import { AppError } from '../../../core/src/errors';
import { z } from 'zod';
import { parseLocalData,serializeLocalData,type LocalData,type LocalStore } from './local-store';
import { NotebookRepository, type NotebookSnapshot } from '../../../documents/src/repository';
import { secureNoteSchema } from '../../../core/src/notes/secure-notes';
import { flashcardDeckSchema,quizDefinitionSchema } from '../../../core/src/study/library';
import { strokeSchema } from '../../../core/src/protocol/schema';
import { whiteboardMetadataSchema } from '../../../core/src/whiteboard/boards-registry';
import { workspaceSchema, floorWorkspaceSchema } from '../../../core/src/house/workspaces';
import {mailboxNotesSchema,localMailboxSchema} from '../../../core/src/house/mailbox';
import { validateAssetPack } from '../../../../app/src/assets/custom-assets';
import { validatePublicIdentity } from '../../../core/src/identity';

const MAX_BACKUP=128*1024*1024;
const baseKeys=['secure-notes-v1','flashcard-decks-v1','quizzes-v1','group-projects-v1','whiteboards-v1','workspaces-v1','custom-assets-v1','avatar-sheet-v1','language','village-name','servers-v1','ollama-v2','review-v2','flashcard-progress-v1','role-sets','eraser-v1','hud-layout-v1','controls-v2','portrait-zoom-v1','environment-v1','interactive-objects-v1','network-v1','focus-clock-v1','npc-dialogue-v1','apple-pencil-mode-v1','phone-layout-v1'];
const acceptedKey=(key:string)=>/^studyvillage-mailbox-v1:(?:own|[a-f0-9]{64})$/.test(key)||baseKeys.some(base=>key===`studyvillage-${base}`||(['secure-notes-v1','flashcard-decks-v1','quizzes-v1','group-projects-v1'].includes(base)&&key.startsWith(`studyvillage-${base}:room:`)));
const backupSchema=z.strictObject({format:z.literal('studyvillage-backup'),version:z.literal(1),createdAt:z.number().finite().nonnegative(),local:z.unknown(),values:z.record(z.string().max(512),z.string().max(8*1024*1024)),notebooks:z.unknown(),pets:z.array(ownedPetSchema).max(1000).optional(),references:z.record(z.string().max(512),z.string().max(8*1024*1024)).optional()});
export interface AppBackup {format:'studyvillage-backup';version:1;createdAt:number;local:LocalData;values:Record<string,string>;notebooks:NotebookSnapshot;pets?:OwnedPet[];references?:Record<string,string>}
export interface BackupPreview {profile:string;identity:string|null;keys:number;notebooks:number;pages:number;attachments:number;conflicts:number}
function boundedJson(value:unknown,depth=0,budget={left:400000}):void {
 if(depth>32||--budget.left<0)throw new AppError('invalid','Copia fuera de límites.');
 if(typeof value==='number'&&!Number.isFinite(value))throw new AppError('invalid','Copia no válida.');
 if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw new AppError('invalid','Copia no válida.');boundedJson(item,depth+1,budget);}
}
function validateEntry(key:string,raw:string):void {
 if(!acceptedKey(key))throw new AppError('invalid','La copia contiene una clave desconocida.');
 if(key==='studyvillage-language'){if(!['es','en','fr'].includes(raw))throw new AppError('invalid','Idioma no válido.');return;}
 if(key==='studyvillage-village-name'){if(raw.length>80)throw new AppError('invalid','Nombre fuera de límites.');return;}
 if(key==='studyvillage-avatar-sheet-v1'){if(!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(raw)||raw.length>750000)throw new AppError('invalid','Sprite no válido.');return;}
 const value=JSON.parse(raw);boundedJson(value);
 if(key==='studyvillage-phone-layout-v1'){phoneLayoutSchema.parse(value);return;}
 if(key==='studyvillage-apple-pencil-mode-v1'){z.boolean().parse(value);return;}
 if(key.startsWith('studyvillage-mailbox-v1:')){(key.endsWith(':own')?localMailboxSchema:mailboxNotesSchema).parse(value);return;}
 if(key.startsWith('studyvillage-secure-notes-v1'))z.object({notebooks:z.array(z.object({id:z.string().max(96),name:z.string().max(120),ownerId:z.string().max(128),createdAt:z.number()})).max(1000),notes:z.array(secureNoteSchema).max(10000)}).parse(value);
 else if(key.startsWith('studyvillage-flashcard-decks-v1'))z.array(flashcardDeckSchema).max(1000).parse(value);
 else if(key.startsWith('studyvillage-quizzes-v1'))z.object({version:z.literal(1),quizzes:z.array(quizDefinitionSchema).max(1000),migrated:z.array(z.string()).max(10000)}).parse(value);
 else if(key==='studyvillage-npc-dialogue-v1')z.object({opacity:z.number().min(.35).max(1),size:z.enum(['small','standard','large']).optional(),textSize:z.enum(['normal','large']),lines:z.union([z.literal(2),z.literal(3)]),progressive:z.boolean()}).parse(value);
 else if(key==='studyvillage-workspaces-v1'){const spaces=z.record(z.string(),workspaceSchema).parse(value);if(Object.keys(spaces).length>2000)throw new AppError('invalid','Copia fuera de límites.');for(const [scope,doc]of Object.entries(spaces))if(scope.endsWith('/@floor'))floorWorkspaceSchema.parse(doc);}
 else if(key==='studyvillage-custom-assets-v1')validateAssetPack(value);
 else if(key==='studyvillage-whiteboards-v1'){
  z.object({metadata:z.array(z.tuple([z.string(),whiteboardMetadataSchema])).max(2000),strokes:z.array(z.tuple([z.string(),z.array(strokeSchema).max(2000)])).max(2000),elements:z.array(z.tuple([z.string(),z.array(z.object({id:z.string(),boardId:z.string(),authorId:z.string(),authorName:z.string(),kind:z.enum(['pen','line','rectangle','circle','arrow','text']),color:z.string().regex(/^#[0-9a-f]{6}$/i),width:z.number().min(.25).max(100),points:z.array(z.object({x:z.number().finite(),y:z.number().finite()})).max(200000),text:z.string().max(100000).optional(),deleted:z.boolean(),updatedAt:z.number()})).max(2000)])).max(2000)}).parse(value);
 }
 else if(key.startsWith('studyvillage-group-projects-v1')){
  z.array(z.object({id:z.string().max(128),name:z.string().max(120),description:z.string().max(10000),repoUrl:z.string().max(1000).nullable(),liveShareUrl:z.string().max(1000).nullable(),liveShareBy:z.string().max(128).nullable(),ownerId:z.string().max(128),ownerName:z.string().max(120),working:z.record(z.string(),z.object({name:z.string().max(120),color:z.string().regex(/^#[0-9a-f]{6}$/i)})),tasks:z.array(z.object({id:z.string(),text:z.string().max(1000),done:z.boolean(),by:z.string().nullable()})).max(1000),updatedAt:z.number()})).max(1000).parse(value);
 }
}
function localValues():Record<string,string>{const values:Record<string,string>={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)!;if(acceptedKey(key))values[key]=localStorage.getItem(key)!;}return values;}
async function hash(bytes:Uint8Array):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function decode(value:string):Uint8Array{const binary=atob(value);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
export async function createBackup(local:LocalData):Promise<AppBackup>{const repo=new NotebookRepository();try{return {format:'studyvillage-backup',version:1,createdAt:Date.now(),local:parseLocalData(local),values:localValues(),notebooks:await repo.snapshot(),pets:await petCollection()};}finally{await repo.close();}}
export async function parseBackup(text:string):Promise<AppBackup>{
 if(new TextEncoder().encode(text).length>MAX_BACKUP)throw new AppError('invalid','La copia supera 128 MiB.');
 const parsed=backupSchema.parse(JSON.parse(text)),local=parseLocalData(parsed.local);serializeLocalData(local);
 if(local.encryptedIdentity)await validatePublicIdentity(local.encryptedIdentity.publicIdentity);
 for(const contact of local.contacts)await validatePublicIdentity(contact.identity);
 if(Object.keys(parsed.values).length>2000)throw new AppError('invalid','Copia fuera de límites.');for(const [key,value]of Object.entries(parsed.values))validateEntry(key,value);
 if(parsed.references&&Object.keys(parsed.references).length>2000)throw new AppError('invalid','Copia fuera de límites.');
 const rooms=JSON.parse(parsed.values['studyvillage-workspaces-v1']??'{}') as Record<string,{furniture:{kind:string;id:string;pet?:import('../../../core/src/pets/model').PetConfig}[]}>;assertPetLimit([local.house?.furniture??[],local.house?.garden??[],...Object.entries(rooms).filter(([key])=>key.startsWith('own/')).map(([,doc])=>doc.furniture)]);
 for(const pet of parsed.pets??[])if(await hash(new TextEncoder().encode(pet.sheet))!==pet.appearance.hash)throw new AppError('invalid','La copia contiene un adjunto dañado.');
 const notebooks=NotebookRepository.parseSnapshot(parsed.notebooks);
 for(const attachment of notebooks.attachments)if(await hash(decode(attachment.base64))!==attachment.sha256)throw new AppError('invalid','La copia contiene un adjunto dañado.');
 return {...parsed,local,notebooks};
}
export function previewBackup(backup:AppBackup,current?:AppBackup):BackupPreview {
 const existing=current?.values??Object.fromEntries(Object.keys(backup.values).flatMap(k=>{const value=localStorage.getItem(k);return value===null?[]:[[k,value]];}));
 let conflicts=Object.entries(existing).filter(([key,value])=>backup.values[key]!==value).length;
 if(current){
  for(const key of Object.keys(current.local) as (keyof LocalData)[])if(JSON.stringify(current.local[key])!==JSON.stringify(backup.local[key]))conflicts++;
  const books=new Map(backup.notebooks.notebooks.map(b=>[b.id,b]));
  for(const book of current.notebooks.notebooks)if(JSON.stringify(book)!==JSON.stringify(books.get(book.id)))conflicts++;
 }
 return {profile:backup.local.profile.displayName,identity:backup.local.encryptedIdentity?.publicIdentity.fingerprint??null,keys:Object.keys(backup.values).length,notebooks:backup.notebooks.notebooks.length,pages:backup.notebooks.notebooks.reduce((n,b)=>n+b.pages.length,0),attachments:backup.notebooks.attachments.length,conflicts};
}
async function recoveryDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open('studyvillage-backup-recovery',1);req.onupgradeneeded=()=>req.result.createObjectStore('recovery');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function journal(action:'put'|'get'|'delete',key:string,value?:unknown):Promise<unknown>{const db=await recoveryDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('recovery',action==='get'?'readonly':'readwrite'),store=tx.objectStore('recovery');const req=action==='get'?store.get(key):action==='put'?store.put(value,key):store.delete(key);let result:unknown;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
async function applySnapshot(backup:AppBackup,store:LocalStore):Promise<void>{
 const repo=new NotebookRepository();try{await repo.importSnapshot(backup.notebooks);await replacePetCollection(backup.pets??[]);for(const key of Object.keys(localValues()))if(!(key in backup.values))localStorage.removeItem(key);for(const [key,value]of Object.entries(backup.values))localStorage.setItem(key,value);await store.save(backup.local);}finally{await repo.close();}
}
/** Journal before any overwrite. An interrupted import is rolled back at the next application launch. */
export async function restoreBackup(backup:AppBackup,current:LocalData,store:LocalStore):Promise<void>{
 const previous=await createBackup(current);await journal('put','pending',previous);await journal('put','previous',previous);
 try{await applySnapshot(backup,store);await journal('delete','pending');}
 catch(error){try{await applySnapshot(previous,store);await journal('delete','pending');}catch{/* Startup recovery retains the journal; do not report success. */}throw error;}
}
export async function recoverInterruptedRestore(store:LocalStore):Promise<void>{const pending=await journal('get','pending');if(pending){await applySnapshot(parseRecovery(pending),store);await journal('delete','pending');}}
export async function previousBackup():Promise<AppBackup|null>{const previous=await journal('get','previous');return previous?parseRecovery(previous):null;}

function parseRecovery(value:unknown):AppBackup{const raw=backupSchema.parse(value);return {...raw,local:parseLocalData(raw.local),notebooks:NotebookRepository.parseSnapshot(raw.notebooks)};}

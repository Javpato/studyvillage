import { z } from 'zod';
import { notebookSchema, type Notebook } from './model';
const snapshotSchema=z.strictObject({notebooks:z.array(notebookSchema).max(1000),attachments:z.array(z.strictObject({id:z.string().uuid(),base64:z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(28*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).max(1000)});
export type NotebookSnapshot=z.infer<typeof snapshotSchema>;
export class NotebookRepository {
 private db:Promise<IDBDatabase>;
 constructor(name='studyvillage-notebooks-v1') {
  this.db=new Promise((resolve,reject)=>{const req=indexedDB.open(name,3);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('notebooks'))req.result.createObjectStore('notebooks',{keyPath:'id'});if(!req.result.objectStoreNames.contains('attachments'))req.result.createObjectStore('attachments');if(!req.result.objectStoreNames.contains('sharedStates'))req.result.createObjectStore('sharedStates');if(!req.result.objectStoreNames.contains('outbox'))req.result.createObjectStore('outbox',{keyPath:'id'});};req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Cierra las otras ventanas y vuelve a intentarlo.'));req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};});
 }
 async list():Promise<Notebook[]> {const db=await this.db;return new Promise((resolve,reject)=>{const req=db.transaction('notebooks').objectStore('notebooks').getAll();req.onsuccess=()=>{try{resolve(req.result.map(n=>notebookSchema.parse(n)));}catch(e){reject(e);}};req.onerror=()=>reject(req.error);});}
 async save(notebook:Notebook):Promise<Notebook> {
  const next=notebookSchema.parse({...notebook,revision:notebook.revision+1,updatedAt:Date.now()});const db=await this.db;
  return new Promise((resolve,reject)=>{const tx=db.transaction('notebooks','readwrite');const store=tx.objectStore('notebooks');const read=store.get(next.id);let failure:Error|null=null;
   read.onsuccess=()=>{if(read.result && read.result.revision!==notebook.revision){failure=new Error('Otra ventana ha cambiado este cuaderno. Exporta tus cambios antes de volver a abrirlo.');tx.abort();}else store.put(next);};
   tx.oncomplete=()=>resolve(next);tx.onabort=()=>reject(failure??tx.error??new Error('No se pudo guardar. Exporta tus cambios.'));tx.onerror=()=>{failure=tx.error;};
  });
 }
 async attachment(id:string):Promise<Uint8Array>{const db=await this.db;return new Promise((resolve,reject)=>{const req=db.transaction('attachments').objectStore('attachments').get(id);req.onsuccess=()=>req.result?resolve(req.result):reject(new Error('Falta un archivo adjunto.'));req.onerror=()=>reject(req.error);});}
 async attach(id:string,bytes:Uint8Array):Promise<void>{if(bytes.length>20*1024*1024)throw new Error('El PDF supera 20 MiB.');const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('attachments','readwrite');const store=tx.objectStore('attachments');const req=store.get(id);req.onsuccess=()=>{const old=req.result as Uint8Array|undefined;if(old&&(old.length!==bytes.length||old.some((b,i)=>b!==bytes[i]))){tx.abort();return;}if(!old)store.put(bytes,id);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Copia no válida.'));});}
 static parseSnapshot(raw:unknown):NotebookSnapshot {
  const snapshot=snapshotSchema.parse(raw);
  const ids=new Set(snapshot.notebooks.map(n=>n.id)),files=new Set(snapshot.attachments.map(a=>a.id));
  if(ids.size!==snapshot.notebooks.length||files.size!==snapshot.attachments.length||snapshot.notebooks.some(n=>n.pages.some(p=>p.pdf&&!files.has(p.pdf.attachment))))throw new Error('Copia no válida.');
  return snapshot;
 }
 async snapshot():Promise<NotebookSnapshot> {
  const notebooks=await this.list(),attachments:NotebookSnapshot['attachments']=[];
  for(const id of new Set(notebooks.flatMap(n=>n.pages.flatMap(p=>p.pdf?[p.pdf.attachment]:[])))){
   const bytes=await this.attachment(id);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');attachments.push({id,base64:btoa(binary),sha256});
  }
  return NotebookRepository.parseSnapshot({notebooks,attachments});
 }
 async importSnapshot(raw:NotebookSnapshot):Promise<void> {
  const snapshot=NotebookRepository.parseSnapshot(raw),attachments: {id:string;bytes:Uint8Array}[]=[];
  for(const a of snapshot.attachments){const bytes=Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==a.sha256||bytes.length>20*1024*1024)throw new Error('Copia no válida.');attachments.push({id:a.id,bytes});}
  const db=await this.db;await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['notebooks','attachments'],'readwrite');tx.objectStore('notebooks').clear();tx.objectStore('attachments').clear();for(const book of snapshot.notebooks)tx.objectStore('notebooks').put(book);for(const a of attachments)tx.objectStore('attachments').put(a.bytes,a.id);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error??new Error('No se pudo restaurar la copia.'));});
 }
 async close():Promise<void>{(await this.db).close();}
 async loadShared(key:string):Promise<unknown>{const db=await this.db;return new Promise((resolve,reject)=>{const req=db.transaction('sharedStates').objectStore('sharedStates').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 async saveShared(key:string,state:unknown):Promise<void>{const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('sharedStates','readwrite');tx.objectStore('sharedStates').put(state,key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
 async outbox():Promise<{id:string;namespace:string;scope:string;operation:unknown}[]>{const db=await this.db;return new Promise((resolve,reject)=>{const req=db.transaction('outbox').objectStore('outbox').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 async enqueue(value:{id:string;namespace:string;scope:string;operation:unknown}):Promise<void>{const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('outbox','readwrite');tx.objectStore('outbox').put(value);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
 async acknowledge(id:string):Promise<void>{const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('outbox','readwrite');tx.objectStore('outbox').delete(id);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
}

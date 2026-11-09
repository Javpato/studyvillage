import {NotebookRepository} from '../../../packages/documents/src/repository';
import {notebookSchema,type Notebook} from '../../../packages/documents/src/model';
import {notebookEdit,applyNotebookEdit} from '../../../packages/documents/src/notebook-edits';
import {z} from 'zod';
export type NotebookStore=Pick<NotebookRepository,'list'|'save'|'attach'|'attachment'|'outbox'|'close'>;
const attachment=z.strictObject({id:z.string().uuid(),base64:z.string().max(28*1024*1024).regex(/^[A-Za-z0-9+/]*={0,2}$/)});
const encode=(bytes:Uint8Array)=>{let binary='';for(let n=0;n<bytes.length;n+=8192)binary+=String.fromCharCode(...bytes.subarray(n,n+8192));return btoa(binary);};
export class NotebookAuthority {
 readonly repo=new NotebookRepository();private queue:Promise<unknown>=Promise.resolve();
 constructor(private refresh:(book:Notebook)=>void,private flush:()=>Promise<void>){}
 request(action:string,value:unknown):Promise<unknown>{const result=this.queue.catch(()=>{}).then(async()=>{await this.flush();if(action==='list')return this.repo.list();if(action==='edit'){const books=await this.repo.list(),id=(value as {id?:unknown})?.id;const saved=await this.repo.save(applyNotebookEdit(books.find(b=>b.id===id),value));this.refresh(saved);return saved;}if(action==='attachment'){const id=z.string().uuid().parse(value);if(!(await this.repo.list()).some(b=>b.pages.some(p=>p.pdf?.attachment===id)))throw Error('Falta un archivo adjunto.');return encode(await this.repo.attachment(id));}if(action==='attach'){const a=attachment.parse(value);await this.repo.attach(a.id,Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0)));return null;}throw Error('Esta acción ya no está disponible.');});this.queue=result;return result;}
 dispose(){void this.repo.close();}
}
export class RemoteNotebooks implements NotebookStore {
 private bases=new Map<string,Notebook>();
 constructor(private call:(action:string,value?:unknown)=>Promise<unknown>){}
 private remember(book:Notebook){this.bases.set(book.id+':'+book.revision,structuredClone(book));if(this.bases.size>100)this.bases.delete(this.bases.keys().next().value!);return book;}
 async list(){const books=z.array(notebookSchema).max(1000).parse(await this.call('list'));return books.map(b=>this.remember(b));}
 async save(book:Notebook){const base=this.bases.get(book.id+':'+book.revision);if(!base&&book.revision!==0)throw Error('Otra ventana ha cambiado este cuaderno. Exporta tus cambios antes de volver a abrirlo.');const edit=notebookEdit(base,book);try{localStorage.setItem('studyvillage-companion-pending-notebook',JSON.stringify({book,edit}));}catch{throw Error('No se pudo guardar. Exporta tus cambios.');}const saved=notebookSchema.parse(await this.call('edit',edit));this.remember(saved);localStorage.removeItem('studyvillage-companion-pending-notebook');return saved;}
 async attach(id:string,bytes:Uint8Array){await this.call('attach',{id,base64:encode(bytes)});}
 async attachment(id:string){const base64=z.string().max(28*1024*1024).parse(await this.call('attachment',id));return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}
 async outbox(){return [];}
 async close(){}
}

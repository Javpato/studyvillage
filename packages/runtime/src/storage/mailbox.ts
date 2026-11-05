import {localMailboxSchema,mailboxNotesSchema,type MailboxNote,type MailboxStorage} from '../../../core/src/house/mailbox';
/** Own-house data uses a stable local alias; remote inboxes never use that alias. */
export class LocalMailbox implements MailboxStorage {
 private memory=new Map<string,MailboxNote[]>();
 constructor(private own?:string,private previousOwner?:string){}
 private key(owner:string){return`studyvillage-mailbox-v1:${owner}`;}
 load(owner:string):MailboxNote[]{
  if(owner===this.own&&typeof localStorage!=='undefined'){
   const raw=localStorage.getItem(this.key('own'));
   if(raw!==null){const saved=localMailboxSchema.parse(JSON.parse(raw)),notes=saved.notes.map(note=>note.author===saved.owner?{...note,author:owner}:note);if(saved.owner!==owner)this.save(owner,notes);return notes;}
   const previous=this.previousOwner??owner,legacy=localStorage.getItem(this.key(previous));
   if(legacy!==null){const notes=mailboxNotesSchema.parse(JSON.parse(legacy)).map(note=>note.author===previous?{...note,author:owner}:note);this.save(owner,notes);localStorage.removeItem(this.key(previous));return notes;}
  }
  const raw=typeof localStorage==='undefined'?null:localStorage.getItem(this.key(owner));
  if(raw===null&&!this.own&&typeof localStorage!=='undefined'){
   const ownRaw=localStorage.getItem(this.key('own'));
   if(ownRaw!==null){const saved=localMailboxSchema.parse(JSON.parse(ownRaw));if(saved.owner===owner){this.save(owner,saved.notes);localStorage.removeItem(this.key('own'));return saved.notes;}}
  }
  return mailboxNotesSchema.parse(raw===null?this.memory.get(owner)??[]:JSON.parse(raw));
 }
 save(owner:string,notes:MailboxNote[]):void{const parsed=mailboxNotesSchema.parse(notes);if(typeof localStorage!=='undefined')localStorage.setItem(this.key(owner===this.own?'own':owner),JSON.stringify(owner===this.own?{owner,notes:parsed}:parsed));this.memory.set(owner,parsed);}
}

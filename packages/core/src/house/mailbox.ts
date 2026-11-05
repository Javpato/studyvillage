import {z} from 'zod';

const person=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
// Five notes also bound the worst-case UTF-8/JSON-escaped peer reply below 48 KiB.
export const MAILBOX_AUTHOR_LIMIT=5,MAILBOX_PAGE_SIZE=5;
export const mailboxNoteSchema=z.strictObject({id,author:person,authorName:z.string().min(1).max(40),text:z.string().trim().min(1).max(1000),createdAt:z.number().int().nonnegative()});
export type MailboxNote=z.infer<typeof mailboxNoteSchema>;
export const mailboxNotesSchema=z.array(mailboxNoteSchema).max(10000).refine(notes=>new Set(notes.map(note=>note.id)).size===notes.length&&[...new Set(notes.map(note=>note.author))].every(author=>notes.filter(note=>note.author===author).length<=MAILBOX_AUTHOR_LIMIT));
/** The local house survives temporary signing identities, just like its room workspaces. */
export const localMailboxSchema=z.strictObject({owner:person,notes:mailboxNotesSchema});
const page=z.number().int().min(0).max(2000).optional();
export const mailboxCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('list'),owner:person,page}),
 z.strictObject({action:z.literal('post'),owner:person,id,text:z.string().trim().min(1).max(1000),page}),
 z.strictObject({action:z.literal('remove'),owner:person,id,page}),
]);
export type MailboxCommand=z.infer<typeof mailboxCommandSchema>;
export const mailboxViewSchema=z.strictObject({owner:person,notes:z.array(mailboxNoteSchema).max(MAILBOX_PAGE_SIZE),total:z.number().int().min(0).max(10000),page:z.number().int().min(0).max(2000),ownCount:z.number().int().min(0).max(MAILBOX_AUTHOR_LIMIT),limit:z.literal(MAILBOX_AUTHOR_LIMIT)});
export type MailboxView=z.infer<typeof mailboxViewSchema>;
export const mailboxErrorSchema=z.enum(['limit','forbidden','missing','offline','invalid']);
export type MailboxErrorCode=z.infer<typeof mailboxErrorSchema>;
export class MailboxError extends Error {constructor(readonly code:MailboxErrorCode){super(code);}}
export const mailboxResultSchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),view:mailboxViewSchema}),z.strictObject({ok:z.literal(false),error:mailboxErrorSchema})]);
export type MailboxResult=z.infer<typeof mailboxResultSchema>;
export interface MailboxStorage {load(owner:string):MailboxNote[];save(owner:string,notes:MailboxNote[]):void}
export interface MailboxActor {fingerprint:string;displayName:string}

/** The authenticated caller supplies actor; no command can claim another author. */
export class MailboxAuthority {
 constructor(private storage:MailboxStorage){}
 execute(actor:MailboxActor,raw:MailboxCommand,now=Date.now()):MailboxView{
  const command=mailboxCommandSchema.parse(raw);person.parse(actor.fingerprint);
  const notes=mailboxNotesSchema.parse(this.storage.load(command.owner));
  if(command.action==='post'){
   const existing=notes.find(note=>note.id===command.id);
   if(existing){if(existing.author!==actor.fingerprint||existing.text!==command.text)throw new MailboxError('invalid');}
   else{
    if(notes.filter(note=>note.author===actor.fingerprint).length>=MAILBOX_AUTHOR_LIMIT)throw new MailboxError('limit');
    const note=mailboxNoteSchema.parse({id:command.id,author:actor.fingerprint,authorName:actor.displayName,text:command.text,createdAt:now});
    notes.push(note);this.storage.save(command.owner,mailboxNotesSchema.parse(notes));
   }
  }else if(command.action==='remove'){
   const index=notes.findIndex(note=>note.id===command.id);
   if(index!==-1){if(actor.fingerprint!==command.owner&&notes[index].author!==actor.fingerprint)throw new MailboxError('forbidden');notes.splice(index,1);this.storage.save(command.owner,notes);}
  }
  const visible=notes.filter(note=>actor.fingerprint===command.owner||note.author===actor.fingerprint).sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
  const currentPage=Math.min(command.page??0,Math.max(0,Math.ceil(visible.length/MAILBOX_PAGE_SIZE)-1));
  return{owner:command.owner,notes:visible.slice(currentPage*MAILBOX_PAGE_SIZE,(currentPage+1)*MAILBOX_PAGE_SIZE),total:visible.length,page:currentPage,ownCount:notes.filter(note=>note.author===actor.fingerprint).length,limit:MAILBOX_AUTHOR_LIMIT};
 }
}
export function mailboxResult(work:()=>MailboxView):MailboxResult{try{return{ok:true,view:work()};}catch(error){if(error instanceof MailboxError)return{ok:false,error:error.code};throw error;}}
export function unwrapMailboxResult(raw:unknown):MailboxView{const result=mailboxResultSchema.parse(raw);if(!result.ok)throw new MailboxError(result.error);return result.view;}

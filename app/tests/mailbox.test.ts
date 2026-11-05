import {afterEach,describe,expect,it,vi} from 'vitest';
import {MailboxAuthority,MailboxError,mailboxCommandSchema,mailboxNotesSchema,type MailboxActor,type MailboxNote,type MailboxStorage} from '../../packages/core/src/house/mailbox';
import {LocalMailbox} from '../../packages/runtime/src/storage/mailbox';
import {PeerMailbox} from '../../packages/runtime/src/session/mailbox';
import {parseBackup} from '../../packages/runtime/src/storage/backup';
import {newLocalData} from '../../packages/runtime/src/storage/local-store';

const owner={fingerprint:'a'.repeat(64),displayName:'Owner'},author={fingerprint:'b'.repeat(64),displayName:'Author'},other={fingerprint:'c'.repeat(64),displayName:'Other'};
function memory():MailboxStorage{const boxes=new Map<string,MailboxNote[]>();return{load:id=>structuredClone(boxes.get(id)??[]),save:(id,notes)=>{boxes.set(id,structuredClone(notes));}};}
const post=(id:string,text='Private note',box=owner.fingerprint)=>({action:'post' as const,owner:box,id,text});
const list=(box=owner.fingerprint)=>({action:'list' as const,owner:box});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('private house mailboxes',()=>{
 it('keeps the temporary local house inbox and its five-note quota across regenerated identities, without rewriting visitor authors',async()=>{
  const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
  const first=new MailboxAuthority(new LocalMailbox(owner.fingerprint));for(let n=0;n<5;n++)first.execute(owner,post(`own-${n}`),n);first.execute(author,post('visitor','Visitor note'),10);
  const reloaded=new MailboxAuthority(new LocalMailbox(other.fingerprint,owner.fingerprint)),view=reloaded.execute(other,list(other.fingerprint));expect(view).toMatchObject({total:6,ownCount:5});expect(view.notes.find(note=>note.id==='visitor')?.author).toBe(author.fingerprint);
  expect(()=>reloaded.execute(other,post('sixth','Still limited',other.fingerprint))).toThrowError(new MailboxError('limit'));
  expect(reloaded.execute(author,list(other.fingerprint))).toMatchObject({total:1,ownCount:1,notes:[{id:'visitor',author:author.fingerprint}]});
  const backup=await parseBackup(JSON.stringify({format:'studyvillage-backup',version:1,createdAt:1,local:newLocalData(),values:Object.fromEntries(values),notebooks:{notebooks:[],attachments:[]}}));expect(backup.values).toEqual(Object.fromEntries(values));
 });
 it('isolates saved identities and adopts the temporary inbox only when saving that exact owner identity',()=>{
  const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
  const local=new MailboxAuthority(new LocalMailbox(owner.fingerprint));local.execute(owner,post('mine'));
  const otherSaved=new MailboxAuthority(new LocalMailbox());expect(otherSaved.execute(other,list(other.fingerprint)).notes).toEqual([]);expect(values.has('studyvillage-mailbox-v1:own')).toBe(true);
  const sameSaved=new MailboxAuthority(new LocalMailbox());expect(sameSaved.execute(owner,list()).notes[0].id).toBe('mine');expect(values.has('studyvillage-mailbox-v1:own')).toBe(false);expect(values.has(`studyvillage-mailbox-v1:${owner.fingerprint}`)).toBe(true);
  expect(new MailboxAuthority(new LocalMailbox()).execute(other,list(other.fingerprint)).notes).toEqual([]);
 });
 it('migrates a pre-alias local inbox using the previously saved house owner without losing notes',()=>{
  const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
  new MailboxAuthority(new LocalMailbox()).execute(owner,post('legacy'));
  const adopted=new MailboxAuthority(new LocalMailbox(other.fingerprint,owner.fingerprint));expect(adopted.execute(other,list(other.fingerprint))).toMatchObject({total:1,ownCount:1,notes:[{id:'legacy',author:other.fingerprint}]});expect(values.has(`studyvillage-mailbox-v1:${owner.fingerprint}`)).toBe(false);
 });
 it('enforces five active notes per authenticated author and mailbox; retries never duplicate a note',()=>{
  const authority=new MailboxAuthority(memory());for(let n=0;n<5;n++)authority.execute(author,post(`note-${n}`),n);
  expect(authority.execute(author,post('note-0'),10)).toMatchObject({total:5,ownCount:5});
  expect(()=>authority.execute(author,post('sixth'))).toThrowError(new MailboxError('limit'));
  expect(authority.execute(other,post('others-note'))).toMatchObject({total:1,ownCount:1});
  expect(authority.execute(author,post('other-box','Separate',other.fingerprint))).toMatchObject({total:1,ownCount:1});
  expect(authority.execute(owner,list()).total).toBe(6);
  authority.execute(author,{action:'remove',owner:owner.fingerprint,id:'note-0'});expect(authority.execute(author,post('replacement')).ownCount).toBe(5);
 });
 it('shares content only with author and recipient and allows either of them to remove it',()=>{
  const authority=new MailboxAuthority(memory());authority.execute(author,post('secret','Only two people'));
  expect(authority.execute(other,list())).toMatchObject({notes:[],total:0,ownCount:0});
  expect(authority.execute(owner,list()).notes[0]).toMatchObject({author:author.fingerprint,authorName:'Author',text:'Only two people'});
  expect(()=>authority.execute(other,{action:'remove',owner:owner.fingerprint,id:'secret'})).toThrowError(new MailboxError('forbidden'));
  expect(()=>authority.execute(other,post('secret','Hijack'))).toThrowError(new MailboxError('invalid'));
  authority.execute(owner,{action:'remove',owner:owner.fingerprint,id:'secret'});expect(authority.execute(author,list()).notes).toEqual([]);
 });
 it('paginates the recipient inbox without revealing other authors or totals to a sender',()=>{
  const authority=new MailboxAuthority(memory());for(let n=1;n<=25;n++)authority.execute({fingerprint:n.toString(16).padStart(64,'0'),displayName:`Sender${n}`},post(`note-${n}`),n);
  expect(authority.execute(owner,list())).toMatchObject({total:25,page:0,ownCount:0});expect(authority.execute(owner,list()).notes).toHaveLength(5);
  expect(authority.execute(owner,{...list(),page:1}).notes).toHaveLength(5);
  expect(authority.execute({fingerprint:'1'.padStart(64,'0'),displayName:'Sender1'},{...list(),page:1})).toMatchObject({total:1,page:0,ownCount:1,notes:[{id:'note-1'}]});
 });
 it('rejects spoofed authors, empty or oversized messages and malformed persisted author quotas',()=>{
  expect(mailboxCommandSchema.safeParse({...post('forged'),author:other.fingerprint}).success).toBe(false);
  for(const text of [' ','x'.repeat(1001)])expect(mailboxCommandSchema.safeParse(post('invalid',text)).success).toBe(false);
  const authority=new MailboxAuthority(memory());expect(authority.execute(author,post('valid','x'.repeat(1000))).notes[0].text).toHaveLength(1000);
  const note=authority.execute(author,list()).notes[0];expect(mailboxNotesSchema.safeParse(Array.from({length:6},(_,n)=>({...note,id:`copy-${n}`}))).success).toBe(false);
 });
 it('persists reloads without exposing an old identity inbox to a different identity and preserves backups',async()=>{
  const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
  const authority=new MailboxAuthority(new LocalMailbox());authority.execute(author,post('saved','Persistent private note'),100);
  const reloaded=new MailboxAuthority(new LocalMailbox());expect(reloaded.execute(owner,list()).notes[0].text).toBe('Persistent private note');expect(reloaded.execute(other,list(other.fingerprint)).notes).toEqual([]);expect(reloaded.execute(other,list()).notes).toEqual([]);
  const backup=await parseBackup(JSON.stringify({format:'studyvillage-backup',version:1,createdAt:1,local:newLocalData(),values:Object.fromEntries(values),notebooks:{notebooks:[],attachments:[]}}));
  expect(backup.values).toEqual(Object.fromEntries(values));
 });
});

describe('recipient-owned P2P mailbox transport',()=>{
 it('keeps maximum-length Unicode and JSON-escaped note pages below the transport limit without truncation',async()=>{
  for(const text of ['\u0000'.repeat(1000),'界'.repeat(1000),'\\'.repeat(1000)]){
   const storage=memory(),authority=new MailboxAuthority(storage);for(let n=0;n<5;n++)authority.execute(author,post(`long-${n}`,text),n);
   const peers=new Map<string,PeerMailbox>();for(const identity of [owner,author])peers.set(identity.fingerprint,new PeerMailbox(identity,identity===owner?storage:memory(),id=>[owner,author].find(p=>p.fingerprint===id),(to,data)=>{
    const wire=JSON.stringify({v:1,payload:{type:'app.relay',channel:'mailbox',from:identity.fingerprint,data}});expect(new TextEncoder().encode(wire).byteLength).toBeLessThan(48000);queueMicrotask(()=>peers.get(to)!.receive(identity.fingerprint,data));return true;
   }));
   const view=await peers.get(author.fingerprint)!.command(list());expect(view.notes).toHaveLength(5);expect(view.notes.every(note=>note.text===text)).toBe(true);for(const peer of peers.values())peer.cancel();
  }
 });
 it('routes simultaneous senders privately, enforces the limit and persists on the recipient',async()=>{
  const people=[owner,author,other],peers=new Map<string,PeerMailbox>(),storage=memory(),deliveries:{from:string;to:string;data:string}[]=[];
  for(const identity of people)peers.set(identity.fingerprint,new PeerMailbox(identity,identity===owner?storage:memory(),id=>people.find(p=>p.fingerprint===id),(to,data)=>{deliveries.push({from:identity.fingerprint,to,data});queueMicrotask(()=>peers.get(to)?.receive(identity.fingerprint,data));return peers.has(to);}));
  const sender=peers.get(author.fingerprint)!;await Promise.all(Array.from({length:5},(_,n)=>sender.command(post(`p2p-${n}`))));await expect(sender.command(post('too-many'))).rejects.toMatchObject({code:'limit'});
  expect(await peers.get(other.fingerprint)!.command(list())).toMatchObject({notes:[],total:0});expect((await peers.get(owner.fingerprint)!.command(list())).total).toBe(5);
  const outsiderReplies=deliveries.filter(d=>d.to===other.fingerprint);expect(outsiderReplies.every(d=>!d.data.includes('Private note'))).toBe(true);
  const reloaded=new PeerMailbox(owner,storage,()=>undefined,()=>false);expect((await reloaded.command(list())).notes).toHaveLength(5);for(const peer of peers.values())peer.cancel();
 });
 it('ignores forged replies and unknown senders and rejects pending work when disconnected',async()=>{
  let sent='';const peer=new PeerMailbox(author,memory(),id=>id===owner.fingerprint?owner:undefined,(_to,data)=>{sent=data;return true;});const pending=peer.command(list());const id=JSON.parse(sent).id;
  peer.receive(other.fingerprint,JSON.stringify({type:'reply',id,result:{ok:true,view:{owner:owner.fingerprint,notes:[],total:0,page:0,ownCount:0,limit:5}}}));
  const rejected=expect(pending).rejects.toMatchObject({code:'offline'});peer.cancel();await rejected;
  const storage=memory(),recipient=new PeerMailbox(owner,storage,()=>undefined,()=>true);recipient.receive(other.fingerprint,JSON.stringify({type:'request',id:crypto.randomUUID(),command:post('unauthenticated')}));expect(storage.load(owner.fingerprint)).toEqual([]);
 });
 it('rejects offline delivery promptly and translates an unanswered request into retryable failure',async()=>{
  const offline=new PeerMailbox(author,memory(),()=>undefined,()=>false);await expect(offline.command(list())).rejects.toMatchObject({code:'offline'});
  vi.useFakeTimers();const disconnected=new PeerMailbox(author,memory(),()=>owner,()=>true),request=disconnected.command(list()),rejected=expect(request).rejects.toMatchObject({code:'offline'});await vi.advanceTimersByTimeAsync(8000);await rejected;
 });
});

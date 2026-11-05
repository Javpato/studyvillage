import { describe,it,expect,vi,afterEach } from 'vitest';
import { generateIdentity,encryptIdentity,sign,verify,exportContact } from '../../packages/core/src/identity';
import { exportIdentityTransfer,inspectIdentityTransfer,unlockIdentityTransfer } from '../../packages/runtime/src/storage/identity-transfer';
import { parseBackup,previewBackup } from '../../packages/runtime/src/storage/backup';
import { makeFloorWorkspace, makeWorkspace } from '../../packages/core/src/house/workspaces';
import { newLocalData } from '../../packages/runtime/src/storage/local-store';
import { newNotebook } from '../../packages/documents/src/model';

afterEach(()=>vi.unstubAllGlobals());
describe('deliberate encrypted identity transfer',()=>{
 it('retains the same signing identity and requires the encryption password',async()=>{
  const original=await generateIdentity('Ana','#336699'),encrypted=await encryptIdentity(original,'correct password 123');
  const file=exportIdentityTransfer(encrypted);expect(file).not.toContain('privateKey');expect((await inspectIdentityTransfer(file)).publicIdentity).toEqual(original.public);
  await expect(unlockIdentityTransfer(file,'incorrect password')).rejects.toThrow();
  const imported=await unlockIdentityTransfer(file,'correct password 123');expect(imported.identity.public.fingerprint).toBe(original.public.fingerprint);
  expect(await verify(original.public,'paired-device','challenge',await sign(imported.identity,'paired-device','challenge'))).toBe(true);
 });
 it('rejects public contact cards and tampered identity descriptions',async()=>{
  const identity=await generateIdentity('Ana','#336699');await expect(inspectIdentityTransfer(exportContact(identity,'public-friend-code'))).rejects.toThrow();
  const encrypted=await encryptIdentity(identity,'correct password 123'),raw=JSON.parse(exportIdentityTransfer(encrypted));raw.identity.publicIdentity.displayName='Tampered';
  await expect(unlockIdentityTransfer(JSON.stringify(raw),'correct password 123')).rejects.toThrow();
 });
});
describe('portable backup validation',()=>{
 it('preserves separate floor decorations and existing room keys, rejecting study tools in floor entries',async()=>{
  const palm={id:'palm',kind:'palm',x:100,y:160,publicAlias:'Palm',color:'#336699'};
  const spaces={'own/ground/@floor':{...makeFloorWorkspace(),theme:'peach',furniture:[palm]},'own/upper/@floor':makeFloorWorkspace(),'own/ground/null':makeWorkspace()};
  const raw={format:'studyvillage-backup',version:1,createdAt:1,local:newLocalData(),values:{'studyvillage-workspaces-v1':JSON.stringify(spaces)},notebooks:{notebooks:[],attachments:[]}};
  const parsed=await parseBackup(JSON.stringify(raw));expect(JSON.parse(parsed.values['studyvillage-workspaces-v1'])).toEqual(spaces);
  await expect(parseBackup(JSON.stringify({...raw,values:{'studyvillage-workspaces-v1':JSON.stringify({...spaces,'own/ground/@floor':makeWorkspace()})}}))).rejects.toThrow();
 });
 it('preserves precise private ink, stable IDs and synthetic legacy notes',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null});const book=newNotebook('Physics');book.pages[0].text='Private text';
  const local=newLocalData();const values={'studyvillage-secure-notes-v1':JSON.stringify({notebooks:[{id:'nb1',name:'Notes',ownerId:'local-owner',createdAt:1}],notes:[{id:'n1',notebookId:'nb1',title:'Saved',content:'Formula',ownerId:'local-owner',visibility:'private',tags:[],updatedAt:1,revision:1}]})};
  const raw={format:'studyvillage-backup',version:1,createdAt:1,local,values,notebooks:{notebooks:[book],attachments:[]}};
  const result=await parseBackup(JSON.stringify(raw));expect(result.notebooks.notebooks[0]).toEqual(book);expect(result.values).toEqual(values);expect(previewBackup(result)).toMatchObject({notebooks:1,pages:1,keys:1,conflicts:0});
 });
 it('rejects unknown storage keys, mismatched attachments and invalid legacy material before writes',async()=>{
  const raw={format:'studyvillage-backup',version:1,createdAt:1,local:newLocalData(),values:{},notebooks:{notebooks:[],attachments:[]}};
  await expect(parseBackup(JSON.stringify({...raw,values:{'foreign-secret':'anything'}}))).rejects.toThrow();
  await expect(parseBackup(JSON.stringify({...raw,values:{'studyvillage-flashcard-decks-v1':'[{"cards":[]}]'}}))).rejects.toThrow();
  await expect(parseBackup(JSON.stringify({...raw,notebooks:{notebooks:[],attachments:[{id:crypto.randomUUID(),base64:'YWJj',sha256:'0'.repeat(64)}]}}))).rejects.toThrow('adjunto dañado');
 });
});

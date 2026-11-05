import {expect,it} from 'vitest';
import {setTimeout as wait} from 'node:timers/promises';
import {generateIdentity} from '../../packages/core/src/identity';
import {ServerVillageClient} from '../../packages/runtime/src/server/client';

it('does not enter a workspace after cancelling while the initial house publication is still being prepared',async()=>{
 const identity=await generateIdentity('Cancelled entry','#336699'),owner=identity.public.fingerprint;
 const client=new ServerVillageClient(identity,{ownerId:owner,revision:1,name:'Home',theme:'mint',access:'ask',furniture:[]},{url:'http://127.0.0.1:1',saved:true});
 // No socket or production state is exposed: this unit controls the delayed acknowledgement boundary.
 Object.assign(client,{phase:'JOINED',role:'resident',scope:'synthetic_scope'});
 const requests:Record<string,unknown>[]=[];let finishPublish:((value:unknown)=>void)|undefined;
 client.request=<T=unknown>(body:Record<string,unknown>)=>{
  requests.push(body);
  if(body.op==='house.publish')return new Promise<T>(resolve=>{finishPublish=resolve as (value:unknown)=>void;});
  if(body.op==='access.cancel')return Promise.resolve({pendingAccess:null} as T);
  return Promise.resolve({pendingAccess:null} as T);
 };
 try{
  client.workspaceCommand({action:'enter',owner,space:{floorId:'ground',roomId:null}});expect(client.view.pendingAccess?.kind).toBe('floor');
  client.cancelAccessRequest();await expect.poll(()=>client.view.pendingAccess).toBeNull();await expect.poll(()=>!!finishPublish).toBe(true);
  finishPublish!({revision:1});await wait(10);
  expect(requests.map(r=>r.op)).toEqual(expect.arrayContaining(['house.publish','access.cancel']));expect(requests.some(r=>r.op==='workspace')).toBe(false);expect(client.view.pendingAccess).toBeNull();
 }finally{client.dispose();}
});

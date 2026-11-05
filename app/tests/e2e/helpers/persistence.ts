import type { Page } from '@playwright/test';
import type { LocalData } from '../../../../packages/runtime/src/storage/local-store';

/** Read the committed browser record. local-sync is only an old-profile import fixture. */
export async function readPersistedLocalData(page:Page):Promise<LocalData> {
 return page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
   const request=indexedDB.open('studyvillage-local',1);
   request.onupgradeneeded=()=>request.transaction?.abort();
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  try{return await new Promise<LocalData>((resolve,reject)=>{
   const request=db.transaction('own-data','readonly').objectStore('own-data').get('state');
   request.onsuccess=()=>{try{if(typeof request.result!=='string')throw new Error('No committed local state');resolve(JSON.parse(request.result) as LocalData);}catch(error){reject(error);}};
   request.onerror=()=>reject(request.error);
  });}finally{db.close();}
 });
}

import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(process.env.INK_PROFILE_URL||'http://127.0.0.1:3100');
 const result=await page.evaluate(async root=>{
  const {newNotebook}=await import(root+'/packages/documents/src/model.ts');
  const {drawPage}=await import(root+'/packages/documents/src/render.ts');
  const {NotebookRepository}=await import(root+'/packages/documents/src/repository.ts');
  const book=newNotebook('Synthetic ink performance fixture'),p=book.pages[0],sample=(x,y,time)=>({x,y,time,pressure:.6,tiltX:0,tiltY:0});
  p.ink.push({id:crypto.randomUUID(),tool:'pen',color:'#24402f',width:2,points:Array.from({length:12000},(_,i)=>sample((i%700)+.125,30+Math.sin(i/20)*20,i))});
  for(let j=0;j<2000;j++)p.ink.push({id:crypto.randomUUID(),tool:'pen',color:'#24402f',width:2,points:Array.from({length:20},(_,i)=>sample((j%35)*20+i/2,80+Math.floor(j/35)*15+Math.sin(i/3)*3,j*20+i))});
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1024;const ctx=canvas.getContext('2d');const times=[];for(let i=0;i<3;i++){const at=performance.now();drawPage(ctx,p);times.push(performance.now()-at);await new Promise(resolve=>requestAnimationFrame(resolve));}
  const start=performance.now(),serialized=JSON.stringify(book),serializeMs=performance.now()-start;const name='sv-synthetic-ink-'+crypto.randomUUID(),repo=new NotebookRepository(name);
  const at=performance.now();await repo.save(book);const saveMs=performance.now()-at;const readAt=performance.now(),restored=await repo.list(),readMs=performance.now()-readAt;await repo.close();await new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase(name);q.onsuccess=resolve;q.onerror=()=>reject(q.error);});
  return {recordedAt:new Date().toISOString(),environment:navigator.userAgent,canvas:[768,1024],objects:p.ink.length,samples:p.ink.reduce((n,s)=>n+s.points.length,0),longStrokeSamples:restored[0].pages[0].ink[0].points.length,editableJsonBytes:new TextEncoder().encode(serialized).length,drawPageMs:times,serializeMs,indexedDbSaveMs:saveMs,indexedDbReadAndValidateMs:readMs,physicalDevice:false};
 },'/@fs'+resolve('.'));
 await mkdir('docs/verification',{recursive:true});await writeFile('docs/verification/ink-profile.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}

import {spriteRevision} from './sprite-revision.mjs';
import {openPhoneApp} from './phone-ui.mjs';
/** Exercise the actual static package at the GitHub Pages subpath, without Vite fallbacks. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {lstat,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit,expect} from '@playwright/test';

const root=path.resolve(process.env.SV_BUILD_DIR||'app/dist'),mount='/studyvillage/';
const files=new Map();
async function collect(dir,prefix=''){
 for(const name of await readdir(dir)){
  const full=path.join(dir,name),stat=await lstat(full),key=prefix+name;
  assert(!stat.isSymbolicLink(),`Build contains a symbolic link: ${key}`);
  if(stat.isDirectory())await collect(full,key+'/');
  else{assert(stat.isFile(),`Unexpected build entry: ${key}`);files.set(key,await readFile(full));}
 }
}
await collect(root);
for(const name of ['index.html','sw.js','manifest.webmanifest'])assert(files.has(name),`Missing ${name}`);
const worker=files.get('sw.js').toString(),cache=worker.match(/const CACHE='([^']+)'/)?.[1];
const precache=JSON.parse(worker.match(/const FILES=(\[.*?\]);/)?.[1]||'null');
assert(cache&&Array.isArray(precache),'Missing service-worker cache manifest');
const revision=spriteRevision(new URL('file://'+root+'/sprites/'));const expectedFiles=[...files.keys()].filter(name=>name!=='sw.js');
assert.deepEqual([...precache].sort(),expectedFiles.map(name=>'./'+name).concat(expectedFiles.filter(name=>name.startsWith('sprites/')).map(name=>'./'+name+'?v='+revision)).sort(),'Precache does not match the packaged files');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const missing=[];
const server=createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const name=pathname===mount?'index.html':pathname.startsWith(mount)?pathname.slice(mount.length):null;
 const content=name===null?null:files.get(name);
 if(!content){missing.push(pathname);res.writeHead(404).end();return;}
 res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');
 res.setHeader('Cache-Control','no-store');res.end(content);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=`http://127.0.0.1:${server.address().port}${mount}`;

async function openNotebook(page){
 await page.getByTestId('phone-button').click();await openPhoneApp(page,'ink');
 await expect(page.getByLabel('Título del cuaderno',{exact:true})).toHaveValue('Cuaderno');
}
async function options(page,tab){
 await page.getByRole('button',{name:'Opciones del cuaderno',exact:true}).click();
 await page.getByRole('tab',{name:tab,exact:true}).click();
}
const closeOptions=page=>page.locator('.sv-ink-drawer-head').getByRole('button',{name:'Cerrar panel',exact:true}).click();
async function savedPage(page){
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('studyvillage-notebooks-v1');request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,read=db.transaction('notebooks').objectStore('notebooks').getAll();
   read.onsuccess=()=>{resolve(read.result[0]?.pages[0]);db.close();};read.onerror=()=>{reject(read.error);db.close();};};
 }));
}
async function pointer(canvas,type,id,kind,x,y,time,width=8){
 await canvas.evaluate((el,p)=>{
  // Synthetic events cannot own native capture. Coordinates stay in screen space.
  el.setPointerCapture=()=>{};el.hasPointerCapture=()=>false;
  const event=new PointerEvent(p.type,{bubbles:true,cancelable:true,pointerId:p.id,pointerType:p.kind,clientX:p.x,clientY:p.y,button:0,buttons:p.type==='pointerup'?0:1,width:p.width,height:p.width,pressure:.4});
  Object.defineProperty(event,'timeStamp',{value:p.time});el.dispatchEvent(event);
 },{type,id,kind,x,y,time,width});
}
async function verify(name,engine){
 const browser=await engine.launch(name==='chromium'?{...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox']}:{ });
 const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,isMobile:true});
  let page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(address);await expect(page.getByTestId('phone-button')).toBeVisible();
  await expect(page.getByTestId('board-pencil-mode')).toHaveAttribute('aria-label','Modo lápiz');
  // `active` can already exist while its activate event is still running. A reload
  // during that interval may remain uncontrolled because this app does not claim open tabs.
  await page.waitForFunction(async()=>(await navigator.serviceWorker.getRegistration())?.active?.state==='activated');
  // Open a new client after installation. An existing document can remain
  // uncontrolled across a reload in Chromium; the app deliberately never claims
  // open editors or forces a reload while someone is writing. Keep the installed
  // client alive until the new client is controlled (some CI Chromium lifecycles
  // discard the idle worker between closing the final page and opening another).
  const installedPage=page;page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  const navigation=await page.goto(address);try{await page.waitForFunction(()=>!!navigator.serviceWorker.controller);}catch(error){console.error('Offline controller diagnostic',name,{version:browser.version(),url:page.url(),fromWorker:navigation?.fromServiceWorker(),state:await page.evaluate(async()=>({controlled:!!navigator.serviceWorker.controller,registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state,script:r.active?.scriptURL,waiting:r.waiting?.state,installing:r.installing?.state})),caches:await caches.keys(),secure:isSecureContext}))});throw error;}await installedPage.close();
  const installed=await page.evaluate(async key=>(await (await caches.open(key)).keys()).map(request=>new URL(request.url).pathname+new URL(request.url).search),cache);
  assert.deepEqual(installed.sort(),precache.map(name=>mount+name.slice(2)).sort(),'Incomplete offline package');
  await openNotebook(page);await options(page,'Página');
  const note='Pages deployment check — lápiz';
  await page.getByLabel('Texto de la página',{exact:true}).fill(note);await page.getByLabel('Texto de la página',{exact:true}).blur();
  await expect.poll(async()=>(await savedPage(page))?.text).toBe(note);await closeOptions(page);
  const canvas=page.locator('.sv-ink-input');
  await page.locator('.sv-notebook').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  const box=await canvas.boundingBox(),x=box.x+100,y=box.y+150;
  await pointer(canvas,'pointerdown',1,'pen',x,y,100);await pointer(canvas,'pointermove',1,'pen',x+30,y,110);
  await pointer(canvas,'pointerdown',9,'touch',x+80,y+60,111,60);
  await pointer(canvas,'pointerup',1,'pen',x+50,y,120);await pointer(canvas,'pointerup',9,'touch',x+80,y+60,121,60);
  await expect.poll(async()=>(await savedPage(page))?.ink.length).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('data-pencil-mode','true');
  const before=await savedPage(page),tool=page.getByLabel('Herramienta',{exact:true});
  const view=()=>page.locator('.sv-notebook-scroll').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft,width:el.querySelector('.sv-notebook-paper').style.width}));
  for(const name of ['erase','pen','hand']){
   await tool.selectOption(name);await expect(page.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true})).toBeChecked();
   const start=await view();await pointer(canvas,'pointerdown',2,'touch',x,y,130);await pointer(canvas,'pointermove',2,'touch',x,y-30,131);
   assert.notDeepEqual(await view(),start,`${name}: Pen mode must allow normal one-finger pan`);
   await pointer(canvas,'pointerdown',3,'touch',x+100,y-30,132);await pointer(canvas,'pointermove',3,'touch',x+150,y-60,133);
   assert(parseFloat((await view()).width)>parseFloat(start.width),`${name}: pinch did not enlarge the page`);
   await pointer(canvas,'pointerup',2,'touch',x,y-30,134);await pointer(canvas,'pointerup',3,'touch',x+150,y-60,135);
   assert.deepEqual(await savedPage(page),before,`${name}: finger navigation changed saved ink`);
  }
  await tool.selectOption('pen');await expect(page.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true})).toBeChecked();await pointer(canvas,'pointerdown',4,'pen',x,y+40,200);await pointer(canvas,'pointerup',4,'pen',x+50,y+40,210);
  await expect.poll(async()=>(await savedPage(page))?.ink.length).toBe(2);const saved=await savedPage(page);
  await context.setOffline(true);await page.reload();await openNotebook(page);
  assert.deepEqual(await savedPage(page),saved,'Offline reload lost notebook data');
  await tool.selectOption('hand');
  assert.deepEqual(errors,[],'Browser runtime errors');assert.deepEqual(missing,[],'Missing static files');
  console.log(`PASS ${name}: ${files.size} packaged files at ${mount}; offline cache, saved ink, palm rejection and finger pan/pinch without writing or erasure.`);
 }catch(error){
  if(errors.length||missing.length)console.error({browser:name,runtimeErrors:errors,missingFiles:missing});throw error;
 }finally{await browser.close();}
}
try{
 const engines={chromium,webkit};
 for(const name of (process.env.SV_BROWSERS||'chromium,webkit').split(',')){
  assert(engines[name],`Unknown browser: ${name}`);await verify(name,engines[name]);
 }
 console.log(`Verified ${cache}. No deployment was requested.`);
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

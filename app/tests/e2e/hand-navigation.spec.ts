import {test,expect,type Page,type Locator} from '@playwright/test';
import {openDecorate} from './root-polish-helpers';
import {notebookOptions,closeNotebookOptions} from './notebook-ui';
type Surface='board'|'notebook';
const canvas=(page:Page,s:Surface)=>page.locator(s==='board'?'.sv-board-pane canvas.sv-canvas':'.sv-ink-input');
async function open(page:Page,s:Surface){
 await page.goto('/');
 if(s==='board'){const editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Pizarra'}).dblclick();}
 else{await page.getByTestId('phone-button').click();await page.getByTestId('phone-ink').click();await expect(page.getByLabel('Título del cuaderno',{exact:true})).toHaveValue('Cuaderno');}
 await expect(canvas(page,s)).toBeVisible();
 await page.locator(s==='board'?'.sv-board-pane':'.sv-notebook').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
}
async function tool(page:Page,s:Surface,value:'hand'|'pen'){
 if(s==='board')await page.locator(`[data-board-tool=${value}]`).click();else await page.getByLabel('Herramienta',{exact:true}).selectOption(value);
}
async function pointer(c:Locator,type:string,id:number,kind:string,x:number,y:number,time:number,width=8){
 // Fixed screen coordinates: the paper moves under the fingers. Only capture is
 // stubbed, since synthetic events are not browser-owned hardware contacts.
 await c.evaluate((el,p)=>{el.setPointerCapture=()=>{};el.hasPointerCapture=()=>false;const e=new PointerEvent(p.type,{bubbles:true,cancelable:true,pointerId:p.id,pointerType:p.kind,clientX:p.x,clientY:p.y,button:0,buttons:p.type==='pointerup'?0:1,width:p.width,height:p.width,pressure:.4});Object.defineProperty(e,'timeStamp',{value:p.time});el.dispatchEvent(e);},{type,id,kind,x,y,time,width});
}
async function zoom(page:Page,s:Surface){
 if(s==='notebook')return canvas(page,s).evaluate(el=>parseFloat((el.closest('.sv-notebook-paper') as HTMLElement).style.width)/768);
 return Number((await page.locator('.sv-zoom-label').textContent())!.replace('%',''))/100;
}
async function contents(page:Page,s:Surface){
 if(s==='board')return page.evaluate(()=>JSON.parse(localStorage.getItem('studyvillage-whiteboards-v1')||'{"strokes":[]}').strokes.flatMap(([,items]:[string,{deleted?:boolean}[]])=>items.filter(i=>!i.deleted)));
 return page.evaluate(()=>new Promise<unknown[]>((resolve,reject)=>{const r=indexedDB.open('studyvillage-notebooks-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('notebooks').objectStore('notebooks').getAll();q.onsuccess=()=>{resolve(q.result.flatMap(b=>b.pages.flatMap((p:{ink:unknown[]})=>p.ink)));db.close();};q.onerror=()=>{reject(q.error);db.close();};};}));
}
async function view(c:Locator,s:Surface){return c.evaluate(async(el,s)=>{
 // Board rendering is scheduled on animation frames, not inside pointer events.
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 return s==='board'?(el as HTMLCanvasElement).toDataURL():{left:el.closest('.sv-notebook-scroll')!.scrollLeft,top:el.closest('.sv-notebook-scroll')!.scrollTop,width:(el.closest('.sv-notebook-paper') as HTMLElement).style.width};
 },s);}
for(const s of ['board','notebook'] as const){
 test(`${s}: Hand pans and pinches, then writing still rejects the resting hand`,async({page})=>{
  await open(page,s);const c=canvas(page,s),b=(await c.boundingBox())!,x=b.x+200,y=b.y+200;
  await pointer(c,'pointerdown',1,'pen',x,y,100);await pointer(c,'pointerup',1,'pen',x+30,y,110);
  await expect(page.locator('html')).toHaveAttribute('data-pencil-mode','true');
  await expect.poll(()=>contents(page,s)).toHaveLength(1);const original=await contents(page,s);
  await tool(page,s,'hand');const start=await view(c,s),z=await zoom(page,s);
  // New fingers work immediately after pen-up, without the writing cooldown.
  await pointer(c,'pointerdown',10,'touch',x,y,120);await pointer(c,'pointermove',10,'touch',x,y-50,121);expect(await view(c,s)).toEqual(start);
  await pointer(c,'pointerdown',11,'touch',x+100,y-50,122);
  await pointer(c,'pointermove',10,'touch',x,y-100,123);await pointer(c,'pointermove',11,'touch',x+100,y-100,124);
  expect(await view(c,s)).not.toEqual(start);expect(await zoom(page,s)).toBeCloseTo(z,2);
  await pointer(c,'pointermove',11,'touch',x+150,y-100,125);expect(await zoom(page,s)).toBeCloseTo(z*1.5,2);
  await pointer(c,'pointermove',11,'touch',x+75,y-100,126);expect(await zoom(page,s)).toBeCloseTo(z*.75,2);
  await pointer(c,'pointerup',11,'touch',x+75,y-100,127);const stopped=await view(c,s);
  await pointer(c,'pointermove',10,'touch',x,y-130,128);expect(await view(c,s)).toEqual(stopped);
  await pointer(c,'pointerup',10,'touch',x,y-130,129);expect(await contents(page,s)).toEqual(original);
  await tool(page,s,'pen');await pointer(c,'pointerdown',20,'touch',x+40,y+60,500);
  await pointer(c,'pointerdown',2,'pen',x,y+30,510);await pointer(c,'pointermove',20,'touch',x+200,y+100,520);
  const frozen=await zoom(page,s);await pointer(c,'pointerdown',21,'touch',x+70,y+70,530);
  await pointer(c,'pointermove',21,'touch',x+200,y+150,540);expect(await zoom(page,s)).toBe(frozen);
  await pointer(c,'pointerup',2,'pen',x+30,y+30,550);await expect.poll(()=>contents(page,s)).toHaveLength(2);
 });
 test(`${s}: tool changes and a third finger cannot revive old contacts`,async({page})=>{
  await open(page,s);const c=canvas(page,s),b=(await c.boundingBox())!,x=b.x+200,y=b.y+200;
  await pointer(c,'pointerdown',1,'pen',x,y,100);await pointer(c,'pointerup',1,'pen',x+20,y,110);
  await pointer(c,'pointerdown',10,'touch',x,y,400);await tool(page,s,'hand');const before=await view(c,s);
  await pointer(c,'pointermove',10,'touch',x-80,y-80,410);await pointer(c,'pointerdown',11,'touch',x+100,y,420);await pointer(c,'pointermove',11,'touch',x+200,y,430);expect(await view(c,s)).toEqual(before);
  for(const id of [10,11])await pointer(c,'pointerup',id,'touch',x,y,440);
  await pointer(c,'pointerdown',12,'touch',x,y,450);await pointer(c,'pointerdown',13,'touch',x+100,y,460);await pointer(c,'pointerdown',14,'touch',x+50,y+30,470);
  await pointer(c,'pointerup',14,'touch',x+50,y+30,480);await pointer(c,'pointermove',13,'touch',x+200,y,490);expect(await view(c,s)).toEqual(before);
  for(const id of [12,13])await pointer(c,'pointerup',id,'touch',x,y,500);
  await pointer(c,'pointerdown',15,'touch',x,y,510);await pointer(c,'pointerdown',16,'touch',x+100,y,520);await pointer(c,'pointermove',16,'touch',x+200,y,530);expect(await view(c,s)).not.toEqual(before);
 });
 test(`${s}: Hand cancels an unfinished stroke and keeps pen, mouse and palm contacts separate`,async({page})=>{
  await open(page,s);const c=canvas(page,s),b=(await c.boundingBox())!,x=b.x+200,y=b.y+200;
  await pointer(c,'pointerdown',1,'pen',x,y,100);await pointer(c,'pointermove',1,'pen',x+50,y,110);
  await tool(page,s,'hand');await pointer(c,'pointerup',1,'pen',x+60,y,120);
  expect(await contents(page,s)).toEqual([]);const before=await view(c,s);
  await pointer(c,'pointerdown',2,'pen',x,y,200);
  await pointer(c,'pointerdown',10,'touch',x+100,y,201,60);await pointer(c,'pointerdown',11,'touch',x+180,y,202);
  await pointer(c,'pointermove',2,'pen',x,y-50,210);await pointer(c,'pointerup',2,'pen',x,y-50,220);
  await expect.poll(()=>view(c,s)).not.toEqual(before);const after=await view(c,s);
  await pointer(c,'pointermove',10,'touch',x-100,y-100,230,60);await pointer(c,'pointermove',11,'touch',x+300,y-100,240);
  expect(await view(c,s)).toEqual(after);expect(await contents(page,s)).toEqual([]);
  for(const id of [10,11])await pointer(c,'pointerup',id,'touch',x,y,250);
  // A broad palm plus a fresh finger is never a usable navigation pair.
  await pointer(c,'pointerdown',12,'touch',x,y,260,60);await pointer(c,'pointerdown',13,'touch',x+100,y,261);
  await pointer(c,'pointermove',13,'touch',x+200,y-50,270);expect(await view(c,s)).toEqual(after);
  for(const id of [12,13])await pointer(c,'pointerup',id,'touch',x,y,280);
  await pointer(c,'pointerdown',3,'mouse',x,y,300);await pointer(c,'pointermove',3,'mouse',x,y-50,310);await pointer(c,'pointerup',3,'mouse',x,y-50,320);
  await expect.poll(()=>view(c,s)).not.toEqual(after);expect(await contents(page,s)).toEqual([]);
 });
}
test('notebook Hand keeps the pinch anchor on rotated paper and clamps zoom without sticking',async({page})=>{
 await open(page,'notebook');await notebookOptions(page,'Página');await page.getByLabel('Zoom',{exact:true}).selectOption('200');await page.getByRole('button',{name:'Girar página',exact:true}).click();await closeNotebookOptions(page);await tool(page,'notebook','hand');
 const c=canvas(page,'notebook');await c.evaluate(el=>{const scroll=el.closest('.sv-notebook-scroll')!;scroll.scrollLeft=400;scroll.scrollTop=400;});
 const r=await page.locator('.sv-notebook-scroll').boundingBox(),x=r!.x+r!.width/2,y=r!.y+r!.height/2;
 const anchor=()=>c.evaluate((el,{x,y})=>{const rect=el.closest('.sv-notebook-surface')!.getBoundingClientRect();return {u:(x-rect.left)/rect.width,v:(y-rect.top)/rect.height};},{x,y});const initial=await anchor();
 await pointer(c,'pointerdown',10,'touch',x-50,y,100);await pointer(c,'pointerdown',11,'touch',x+50,y,101);
 await pointer(c,'pointermove',10,'touch',x-75,y,102);await pointer(c,'pointermove',11,'touch',x+75,y,103);
 expect(await zoom(page,'notebook')).toBeCloseTo(3,2);const after=await anchor();expect(after.u).toBeCloseTo(initial.u,2);expect(after.v).toBeCloseTo(initial.v,2);
 await pointer(c,'pointermove',11,'touch',x+1000,y,104);expect(await zoom(page,'notebook')).toBe(4);
 await pointer(c,'pointermove',11,'touch',x+800,y,105);expect(await zoom(page,'notebook')).toBeLessThan(4);
 await pointer(c,'pointermove',11,'touch',x-65,y,105.1);expect(await zoom(page,'notebook')).toBe(.25);
 await pointer(c,'pointermove',11,'touch',x-55,y,105.2);expect(await zoom(page,'notebook')).toBeCloseTo(.5,2);
 const saved=await contents(page,'notebook');await pointer(c,'pointerup',10,'touch',x-75,y,106);await pointer(c,'pointerup',11,'touch',x+800,y,107);
 // Pencil dragging in Hand moves the viewport without becoming saved ink.
 await pointer(c,'pointerdown',1,'pen',x,y,200);await pointer(c,'pointermove',1,'pen',x-50,y-50,210);await pointer(c,'pointerup',1,'pen',x-50,y-50,220);expect(await contents(page,'notebook')).toEqual(saved);
});

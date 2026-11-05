import {test,expect,type Page} from '@playwright/test';
import {notebookOptions,closeNotebookOptions} from './notebook-ui';
import type {InkObject} from '../../../packages/documents/src/model';
async function openNotebook(page:Page){await page.getByTestId('phone-button').click();await page.getByTestId('phone-ink').click();await expect(page.locator('.sv-notebook').getByLabel('Título del cuaderno',{exact:true})).toHaveValue('Cuaderno');await expect(page.locator('.sv-notebook select[aria-label="Página"] option')).toHaveCount(1);}
async function mode(page:Page,enabled:boolean){await notebookOptions(page,'Tinta y selección');await page.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true}).setChecked(enabled);await closeNotebookOptions(page);}
async function savedInk(page:Page):Promise<InkObject[]>{return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('studyvillage-notebooks-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,read=db.transaction('notebooks').objectStore('notebooks').getAll();read.onsuccess=()=>{resolve(read.result[0]?.pages[0]?.ink??[]);db.close();};read.onerror=()=>{reject(read.error);db.close();};};}));}
type Sample={type:string;id:number;kind:'pen'|'touch';x:number;y:number;time:number;pressure?:number;width?:number;coalesced?:{x:number;y:number;time:number}[]};
/** Deterministic browser-event ordering, not a substitute for physical Apple Pencil testing.
 * Synthetic pointers do not belong to the UA's active pointer table, so only capture is stubbed. */
async function send(page:Page,events:Sample[]){return page.locator('.sv-ink-input').evaluate((node,samples)=>{const canvas=node as HTMLCanvasElement;canvas.setPointerCapture=()=>{};for(const sample of samples){const rect=canvas.getBoundingClientRect();const make=(x:number,y:number,time:number)=>{const event=new PointerEvent(sample.type,{bubbles:true,cancelable:true,pointerId:sample.id,pointerType:sample.kind,clientX:rect.left+x,clientY:rect.top+y,pressure:sample.pressure??.001,width:sample.width??8,height:sample.width??8,buttons:sample.type==='pointerup'?0:1});Object.defineProperty(event,'timeStamp',{value:time});return event;};const event=make(sample.x,sample.y,sample.time);if(sample.coalesced)Object.defineProperty(event,'getCoalescedEvents',{value:()=>sample.coalesced!.map(p=>make(p.x,p.y,p.time))});canvas.dispatchEvent(event);}const scroll=canvas.closest('.sv-notebook-scroll')!;const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;return {left:scroll.scrollLeft,top:scroll.scrollTop,inkVisible:pixels.some((_,i)=>i%4===3&&pixels[i]>0),surfaceWidth:(canvas.closest('.sv-notebook-surface') as HTMLElement).style.width};},events);}
test('Pencil mode persists, synchronizes tabs and leaves finger drawing unavailable while enabled',async({page,context})=>{
 await page.goto('/');await openNotebook(page);await notebookOptions(page,'Tinta y selección');await expect(page.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true})).not.toBeChecked();await page.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true}).check();await expect(page.locator('.sv-notebook').getByLabel('Dibujar con el dedo',{exact:true})).toBeDisabled();const other=await context.newPage();await other.goto('/');await openNotebook(other);await notebookOptions(other,'Tinta y selección');await expect(other.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true})).toBeChecked();await other.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true}).uncheck();await expect(page.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true})).not.toBeChecked();await expect(page.locator('.sv-notebook').getByLabel('Dibujar con el dedo',{exact:true})).toBeEnabled();await other.close();await page.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true}).check();await page.reload();await openNotebook(page);await notebookOptions(page,'Tinta y selección');await expect(page.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true})).toBeChecked();await expect(page.locator('html')).toHaveAttribute('data-pencil-mode','true');
});
test('light pen starts over a resting palm, keeps coalesced/final samples and ignores palms through pen-up',async({page})=>{
 await page.goto('/');await openNotebook(page);await mode(page,true);
 const start=await send(page,[{type:'pointerdown',id:10,kind:'touch',x:30,y:180,time:1},{type:'pointerdown',id:1,kind:'pen',x:50.125,y:60.875,time:10}]);expect(start.inkVisible).toBe(true);
 const during=await send(page,[{type:'pointermove',id:10,kind:'touch',x:30,y:40,time:11},{type:'pointermove',id:1,kind:'pen',x:140,y:80,time:20,coalesced:[{x:80,y:70,time:16},{x:100,y:75,time:18}]},{type:'pointercancel',id:10,kind:'touch',x:30,y:40,time:21},{type:'pointerdown',id:11,kind:'touch',x:60,y:180,time:22,width:60},{type:'pointerdown',id:12,kind:'touch',x:90,y:180,time:23},{type:'pointerup',id:11,kind:'touch',x:60,y:180,time:24}]);expect(during.top).toBe(start.top);expect(during.surfaceWidth).toBe(start.surfaceWidth);expect(await savedInk(page)).toHaveLength(0);
 await send(page,[{type:'pointerup',id:1,kind:'pen',x:180,y:85,time:30}]);await expect.poll(async()=>(await savedInk(page)).length).toBe(1);
 const after=await send(page,[{type:'pointermove',id:12,kind:'touch',x:90,y:40,time:600},{type:'pointerup',id:12,kind:'touch',x:90,y:40,time:610}]);expect(after.top).toBe(start.top);expect(after.surfaceWidth).toBe(start.surfaceWidth);
 const ink=await savedInk(page);expect(ink[0].points).toHaveLength(5);expect(ink[0].points.map(p=>p.time)).toEqual([10,16,18,20,30]);expect(ink[0].points.every(p=>Math.abs(p.pressure-.001)<.00001)).toBe(true);expect(ink[0].points.at(-1)!.x).toBeGreaterThan(ink[0].points[3].x);
 await page.reload();await openNotebook(page);expect(await savedInk(page)).toEqual(ink);
});
test('Pencil allows one-finger pan and pinch, and cancelled edits roll back',async({page})=>{
 await page.goto('/');await openNotebook(page);await mode(page,true);
 const start=await send(page,[]);
 const single=await send(page,[{type:'pointerdown',id:10,kind:'touch',x:200,y:250,time:10},{type:'pointermove',id:10,kind:'touch',x:200,y:150,time:20}]);expect(single.top).toBeGreaterThan(start.top);
 const pan=await send(page,[{type:'pointerdown',id:11,kind:'touch',x:300,y:150,time:25},{type:'pointermove',id:11,kind:'touch',x:350,y:80,time:30}]);expect(pan.top).toBeGreaterThan(start.top);expect(parseFloat(pan.surfaceWidth)).toBeGreaterThan(parseFloat(start.surfaceWidth));
 const remaining=await send(page,[{type:'pointerup',id:11,kind:'touch',x:350,y:80,time:40},{type:'pointermove',id:10,kind:'touch',x:200,y:50,time:41},{type:'pointerup',id:10,kind:'touch',x:200,y:50,time:42}]);expect(remaining.top).toBeGreaterThan(pan.top);expect(await savedInk(page)).toHaveLength(0);
 // Selection also yields to a two-finger pinch without changing saved content.
 await page.locator('.sv-notebook').getByLabel('Herramienta',{exact:true}).selectOption('select');
 const zoomed=await send(page,[{type:'pointerdown',id:10,kind:'touch',x:200,y:150,time:50},{type:'pointerdown',id:11,kind:'touch',x:300,y:150,time:51},{type:'pointermove',id:11,kind:'touch',x:350,y:150,time:52},{type:'pointerup',id:10,kind:'touch',x:200,y:150,time:60},{type:'pointerup',id:11,kind:'touch',x:350,y:150,time:61}]);expect(parseFloat(zoomed.surfaceWidth)).toBeGreaterThan(parseFloat(start.surfaceWidth));
 await page.locator('.sv-notebook').getByLabel('Herramienta',{exact:true}).selectOption('pen');
 await notebookOptions(page,'Página');await page.locator('.sv-notebook').getByLabel('Zoom',{exact:true}).selectOption('100');await closeNotebookOptions(page);await page.locator('.sv-notebook-scroll').evaluate(el=>{el.scrollTop=0;el.scrollLeft=0;});
 await mode(page,false);await notebookOptions(page,'Tinta y selección');await page.locator('.sv-notebook').getByLabel('Dibujar con el dedo',{exact:true}).check();await closeNotebookOptions(page);
 await send(page,[{type:'pointerdown',id:20,kind:'touch',x:200,y:150,time:100},{type:'pointermove',id:20,kind:'touch',x:220,y:160,time:110},{type:'pointerdown',id:1,kind:'pen',x:50,y:60,time:120},{type:'pointermove',id:1,kind:'pen',x:140,y:60,time:130},{type:'pointerup',id:20,kind:'touch',x:220,y:160,time:140},{type:'pointerup',id:1,kind:'pen',x:180,y:60,time:150}]);await expect.poll(async()=>(await savedInk(page)).length).toBe(1);const original=await savedInk(page);expect(original[0].points[0].x).toBe(50);
 await mode(page,false);
 await page.locator('.sv-notebook').getByLabel('Herramienta',{exact:true}).selectOption('erase');await send(page,[{type:'pointerdown',id:21,kind:'touch',x:80,y:60,time:1000},{type:'pointerdown',id:2,kind:'pen',x:80,y:60,time:1010},{type:'pointercancel',id:2,kind:'pen',x:80,y:60,time:1020},{type:'pointerup',id:21,kind:'touch',x:80,y:60,time:1030}]);expect(await savedInk(page)).toEqual(original);
 // A later edit must save the restored contents, not just leave an old storage snapshot intact.
 await page.locator('.sv-notebook').getByLabel('Herramienta',{exact:true}).selectOption('pen');await send(page,[{type:'pointerdown',id:3,kind:'pen',x:250,y:60,time:1500},{type:'pointerup',id:3,kind:'pen',x:280,y:60,time:1510}]);await expect.poll(async()=>(await savedInk(page)).length).toBe(2);expect((await savedInk(page))[0]).toEqual(original[0]);await page.getByRole('button',{name:'Deshacer',exact:true}).click();await expect.poll(()=>savedInk(page)).toEqual(original);
});

test('automatic pen detection, native selection suppression and lost-contact recovery',async({page})=>{
 await page.goto('/');await openNotebook(page);
 const canvas=page.locator('.sv-ink-input');
 const policy=await canvas.evaluate(el=>{
  const text=document.createTextNode('Previously selected text');document.body.append(text);const range=document.createRange();range.selectNode(text);getSelection()!.addRange(range);
  el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:10,clientX:100,clientY:100,width:60,height:60}));
  const cleared=getSelection()!.rangeCount===0;text.remove();
  const blocked=['touchstart','touchmove','gesturestart','gesturechange','gestureend','selectstart','contextmenu'].every(type=>!el.dispatchEvent(new Event(type,{bubbles:true,cancelable:true})));
  return {cleared,blocked};
 });expect(policy).toEqual({cleared:true,blocked:true});
 await expect(canvas).toHaveCSS('touch-action','none');await expect(canvas).toHaveCSS('user-select','none');
 await send(page,[{type:'pointerdown',id:1,kind:'pen',x:40,y:60,time:100},{type:'pointermove',id:1,kind:'pen',x:100,y:60,time:110}]);
 await expect(page.locator('html')).toHaveAttribute('data-pencil-mode','true');
 // OS stole pen 1 without an up. Pen 2 must recover while the palm remains down.
 await send(page,[{type:'pointerdown',id:2,kind:'pen',x:220,y:60,time:200},{type:'pointerup',id:2,kind:'pen',x:280,y:60,time:210}]);
 await expect.poll(async()=>(await savedInk(page)).length).toBe(1);expect((await savedInk(page))[0].points[0].x).toBe(220);
 // Capture may throw after a native interruption. An off-canvas release still completes the next stroke.
 await canvas.evaluate(el=>{
  el.setPointerCapture=()=>{throw new DOMException('No active pointer','NotFoundError');};
  const b=el.getBoundingClientRect(),init={bubbles:true,cancelable:true,pointerType:'pen',pointerId:3,clientX:b.left+300,clientY:b.top+90,pressure:.3};
  el.dispatchEvent(new PointerEvent('pointerdown',init));window.dispatchEvent(new PointerEvent('pointerup',{...init,clientX:b.left+330}));
 });await expect.poll(async()=>(await savedInk(page)).length).toBe(2);
 await send(page,[{type:'pointerdown',id:4,kind:'pen',x:100,y:150,time:1000}]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await send(page,[{type:'pointerdown',id:5,kind:'pen',x:200,y:150,time:1100},{type:'pointerup',id:5,kind:'pen',x:240,y:150,time:1110}]);await expect.poll(async()=>(await savedInk(page)).length).toBe(3);
 await mode(page,false);await send(page,[{type:'pointerdown',id:6,kind:'pen',x:300,y:160,time:1200},{type:'pointerup',id:6,kind:'pen',x:340,y:160,time:1210}]);await expect(page.locator('html')).toHaveAttribute('data-pencil-mode','false');
 await notebookOptions(page,'Página');const field=page.getByLabel('Texto de la página',{exact:true});await field.fill('Texto seleccionable');expect(await field.evaluate(el=>el.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})))).toBe(true);
});

import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {test,expect,type Page} from '@playwright/test';
import {openDecorate} from './root-polish-helpers';
import type {BoardStroke} from '../../../packages/core/src/protocol/types';
const board=(page:Page)=>page.locator('.sv-board-pane canvas.sv-canvas');
const strokes=(page:Page):Promise<BoardStroke[]>=>page.evaluate(()=>{const data=JSON.parse(localStorage.getItem('studyvillage-whiteboards-v1')||'{"strokes":[]}');return data.strokes.flatMap(([,items]:[string,BoardStroke[]])=>items).filter((s:BoardStroke)=>!s.deleted);});
async function openBoard(page:Page){const editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Pizarra'}).dblclick();await expect(board(page)).toBeVisible();await page.locator('.sv-board-pane').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));await board(page).evaluate(canvas=>{canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;});}
async function pointer(page:Page,type:string,id:number,kind:string,x:number,y:number,extra:Record<string,number>={},coalesced:number[][]=[]){await board(page).evaluate((element,{type,id,kind,x,y,extra,coalesced})=>{const canvas=element as HTMLCanvasElement;const b=canvas.getBoundingClientRect(),sample=(x:number,y:number)=>({bubbles:true,cancelable:true,pointerId:id,pointerType:kind,button:0,buttons:type==='pointerup'?0:1,pressure:.01,width:1,height:1,clientX:b.left+x*b.width/768,clientY:b.top+y*b.height/(canvas.height*768/canvas.width),...extra});const event=new PointerEvent(type,sample(x,y));if(coalesced.length)Object.defineProperty(event,'getCoalescedEvents',{value:()=>coalesced.map(([x,y])=>new PointerEvent('pointermove',sample(x,y)))});canvas.dispatchEvent(event);},{type,id,kind,x,y,extra,coalesced});}
async function mode(page:Page){await page.getByRole('button',{name:'Opciones avanzadas',exact:true}).click();await page.getByTestId('board-pencil-mode').check();await page.getByRole('button',{name:'Opciones avanzadas',exact:true}).click();}
test('a light pen preempts a palm, keeps all coalesced fractions and only its own release commits',async({page})=>{
 await page.goto('/');await openBoard(page);
 await pointer(page,'pointerdown',1,'touch',100,100);await pointer(page,'pointermove',1,'touch',120,110);
 await pointer(page,'pointerdown',2,'pen',160.125,140.375);await pointer(page,'pointermove',2,'pen',190.75,150.5,{},[[170.25,143.125],[180.5,147.25]]);
 await pointer(page,'pointermove',1,'touch',300,250);await pointer(page,'pointerup',1,'touch',300,250);expect(await strokes(page)).toHaveLength(0);
 await pointer(page,'pointerdown',3,'touch',220,170,{width:65,height:80});await pointer(page,'pointermove',3,'touch',280,220);await pointer(page,'pointerup',3,'touch',280,220);expect(await strokes(page)).toHaveLength(0);
 await pointer(page,'pointerup',2,'pen',201.375,153.125);await expect.poll(async()=>(await strokes(page)).length).toBe(1);
 const ink=(await strokes(page))[0],expected=[{x:160.125,y:140.375},{x:170.25,y:143.125},{x:180.5,y:147.25},{x:190.75,y:150.5},{x:201.375,y:153.125}];expect(ink.points).toHaveLength(expected.length);
 // WebKit quantizes CSS geometry slightly; retain subpixel ink without requiring identical engine rounding.
 ink.points.forEach((point,index)=>{expect(Math.abs(point.x-expected[index].x)).toBeLessThan(.01);expect(Math.abs(point.y-expected[index].y)).toBeLessThan(.01);});
 await page.reload();await openBoard(page);expect((await strokes(page))[0].points).toEqual(ink.points);
});
test('Pencil mode allows finger pan and zoom, persists and is shared with the notebook',async({page})=>{
 await page.goto('/');await openBoard(page);await mode(page);
 await pointer(page,'pointerdown',1,'touch',100,100);await pointer(page,'pointermove',1,'touch',180,140);await pointer(page,'pointerdown',2,'touch',280,140);await pointer(page,'pointermove',2,'touch',380,140);await pointer(page,'pointerup',2,'touch',380,140);await pointer(page,'pointerup',1,'touch',180,140);
 expect(await strokes(page)).toHaveLength(0);await page.getByRole('button',{name:'Opciones avanzadas',exact:true}).click();await page.locator('.sv-board-options-panel summary').filter({hasText:/^Vista$/}).click();await expect(page.locator('.sv-zoom-label')).toHaveText('200%');await page.getByRole('button',{name:'Opciones avanzadas',exact:true}).click();
 await page.reload();await openBoard(page);await page.getByRole('button',{name:'Opciones avanzadas',exact:true}).click();await expect(page.getByTestId('board-pencil-mode')).toBeChecked();await page.locator('[data-testid=board-back]:visible, .sv-hud-back:visible').first().click();
 await page.getByTestId('phone-button').click();await openPhoneApp(page,'ink');await page.getByRole('button',{name:'Opciones del cuaderno',exact:true}).click();await page.getByRole('tab',{name:'Tinta y selección',exact:true}).click();await expect(page.locator('.sv-notebook').getByLabel('Modo lápiz',{exact:true})).toBeChecked();
});
test('cancelled pen and lost capture discard drafts, and cancellation never erases saved ink',async({page})=>{
 await page.goto('/');await openBoard(page);await mode(page);
 for(const end of ['pointercancel','lostpointercapture']){await pointer(page,'pointerdown',2,'pen',100,100);await pointer(page,'pointermove',2,'pen',200,100);await pointer(page,end,2,'pen',200,100);expect(await strokes(page)).toHaveLength(0);}
 await pointer(page,'pointerdown',2,'pen',100,100);await pointer(page,'pointerup',2,'pen',200,100);await expect.poll(async()=>(await strokes(page)).length).toBe(1);const original=await strokes(page);
 await page.locator('[data-board-tool=eraser]').click();await pointer(page,'pointerdown',4,'pen',150,100);await pointer(page,'pointercancel',4,'pen',150,100);expect(await strokes(page)).toEqual(original);
 await page.locator('[data-board-tool=pen]').click();await pointer(page,'pointerdown',5,'pen',300,100);await pointer(page,'pointerdown',6,'touch',400,200);await pointer(page,'pointerup',5,'pen',350,100);await expect.poll(async()=>(await strokes(page)).length).toBe(2);await pointer(page,'pointermove',6,'touch',600,300);await pointer(page,'pointerup',6,'touch',600,300);expect(await strokes(page)).toHaveLength(2);
});
test('finger drawing becomes a pinch without prematurely releasing the first contact',async({page})=>{
 await page.goto('/');await openBoard(page);
 // Model the lostpointercapture event emitted by an explicit release; plain capture stubs miss this transition.
 await board(page).evaluate(canvas=>{const captured=new Set<number>();canvas.setPointerCapture=id=>{captured.add(id);};canvas.hasPointerCapture=id=>captured.has(id);canvas.releasePointerCapture=id=>{if(captured.delete(id))canvas.dispatchEvent(new PointerEvent('lostpointercapture',{bubbles:true,pointerId:id,pointerType:'touch'}));};});
 await pointer(page,'pointerdown',1,'touch',100,100);await pointer(page,'pointermove',1,'touch',120,100);await pointer(page,'pointerdown',2,'touch',220,100);await pointer(page,'pointermove',2,'touch',320,100);
 expect(await board(page).evaluate(canvas=>canvas.hasPointerCapture(1))).toBe(true);expect(await strokes(page)).toHaveLength(0);
 await pointer(page,'pointerup',2,'touch',320,100);await pointer(page,'pointerup',1,'touch',120,100);
 await page.getByRole('button',{name:'Opciones avanzadas',exact:true}).click();await page.locator('.sv-board-options-panel summary').filter({hasText:/^Vista$/}).click();await expect(page.locator('.sv-zoom-label')).toHaveText('200%');
});
test('starting a second text note with the pencil saves the first note',async({page})=>{
 await page.goto('/');await openBoard(page);await page.locator('[data-board-tool=text]').click();
 await pointer(page,'pointerdown',1,'pen',100,100);await pointer(page,'pointerup',1,'pen',100,100);await page.getByLabel('Texto para la pizarra',{exact:true}).fill('Nota escrita antes de tocar con el lápiz');
 await pointer(page,'pointerdown',2,'pen',300,200);await pointer(page,'pointerup',2,'pen',300,200);
 await expect.poll(async()=>(await strokes(page)).map(s=>s.text)).toEqual(['Nota escrita antes de tocar con el lápiz']);await expect(page.getByLabel('Texto para la pizarra',{exact:true})).toHaveValue('');
});

test('board recovers a missing pen-up and cannot select text or zoom from a resting palm',async({page})=>{
 await page.goto('/');await openBoard(page);await mode(page);
 const before=await board(page).evaluate(el=>(el as HTMLCanvasElement).toDataURL());
 await pointer(page,'pointerdown',1,'touch',100,100);expect(await board(page).evaluate(el=>(el as HTMLCanvasElement).toDataURL())).toBe(before);
 await pointer(page,'pointerdown',2,'pen',160,140);await pointer(page,'pointermove',2,'pen',200,140);
 await pointer(page,'pointerdown',3,'pen',300,140);await pointer(page,'pointerup',3,'pen',360,140);await expect.poll(async()=>(await strokes(page)).length).toBe(1);expect((await strokes(page))[0].points[0]).toEqual({x:300,y:140});
 await pointer(page,'pointermove',1,'touch',300,260);await pointer(page,'pointerup',1,'touch',300,260);expect(await strokes(page)).toHaveLength(1);
 expect(await board(page).evaluate(el=>['touchstart','touchmove','selectstart','contextmenu'].every(type=>!el.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}))))).toBe(true);
 await board(page).evaluate(el=>{
  el.setPointerCapture=()=>{throw new DOMException('No active pointer','NotFoundError');};
  const b=el.getBoundingClientRect(),init={bubbles:true,cancelable:true,pointerType:'pen',pointerId:4,button:0,clientX:b.left+50,clientY:b.top+50,pressure:.3};
  el.dispatchEvent(new PointerEvent('pointerdown',init));window.dispatchEvent(new PointerEvent('pointerup',{...init,clientX:b.left+80}));
 });await expect.poll(async()=>(await strokes(page)).length).toBe(2);
});

test('Excalifont renders in the editor, survives offline reload and exports with local fonts',async({page,browserName})=>{
 await page.goto('/');await openBoard(page);await page.locator('[data-board-tool=text]').click();await page.locator('.sv-board-context summary').click();
 await page.getByLabel('Fuente del texto',{exact:true}).selectOption('excalifont');await page.locator('.sv-board-context').getByLabel('Tamaño del texto',{exact:true}).fill('32');await page.getByRole('button',{name:'Usar para el texto nuevo',exact:true}).click();
 await pointer(page,'pointerdown',1,'pen',100,100);await pointer(page,'pointerup',1,'pen',100,100);
 const input=page.getByLabel('Texto para la pizarra',{exact:true});await expect(input).toHaveCSS('font-family','Excalifont, cursive');await input.fill('Lápiz, acción, français\nExcalifont · Ελληνικά');await input.press('Enter');
 await expect.poll(async()=>(await strokes(page))[0]?.textStyle?.fontFamily).toBe('excalifont');
 await expect.poll(()=>page.evaluate(()=>[...document.fonts].filter(f=>f.family==='Excalifont'&&f.status==='loaded').length)).toBe(7);
 if(await page.evaluate(()=>navigator.serviceWorker.getRegistration().then(Boolean))){await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.context().setOffline(true);}
 await page.reload();await openBoard(page);expect((await strokes(page))[0].textStyle?.fontFamily).toBe('excalifont');
 await expect.poll(()=>page.evaluate(()=>[...document.fonts].filter(f=>f.family==='Excalifont'&&f.status==='loaded').length)).toBe(7);
 await page.screenshot({path:`/tmp/studyvillage-excalifont-${browserName}.png`});
 await page.getByRole('button',{name:'Opciones avanzadas',exact:true}).click();await page.locator('.sv-board-options-panel summary').filter({hasText:/^Pizarra y archivo$/}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'↓ Exportar PNG',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.png$/);
});

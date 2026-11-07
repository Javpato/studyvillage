import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {test,expect,type Page,type CDPSession} from '@playwright/test';
import {savedHouse,worldPoint} from './root-polish-helpers';
const tray=(page:Page)=>page.locator('.sv-garden-tray');
async function openGarden(page:Page){await page.getByTestId('phone-button').click();await openPhoneApp(page,'garden');await expect(tray(page)).toBeVisible();if((await savedHouse(page)).garden?.some(item=>item.id==='starter-mailbox')){await page.mouse.click(...await worldPoint(page,64,147));await tray(page).getByRole('button',{name:'Retirar',exact:true}).click();await tray(page).getByRole('button',{name:'Terminar',exact:true}).click();await expect(tray(page)).toBeHidden();await openGarden(page);}}
async function dragFromCatalogue(page:Page,kind:string,x:number,y:number,valid:boolean){
 const tile=tray(page).getByRole('button',{name:kind,exact:true}),box=(await tile.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();const before=(await page.locator('.sv-stage-pane canvas').boundingBox())!;await page.mouse.move(...await worldPoint(page,x,y),{steps:10});await expect(tray(page)).toHaveAttribute('data-preview',valid?'valid':'invalid');const after=(await page.locator('.sv-stage-pane canvas').boundingBox())!;expect(Math.abs(after.width-before.width)).toBeLessThan(2);expect(Math.abs(after.y-before.y)).toBeLessThan(2);await page.mouse.up();
}
test('dragging catalogue artwork uses the whole yard, previews validity, protects house/door/road and persists',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');await openGarden(page);
 await dragFromCatalogue(page,'Palmera',24,83,true);await expect(tray(page).locator('.sv-garden-count')).toHaveText('1/16 objetos');expect((await savedHouse(page)).garden??[]).toEqual([]);
 await dragFromCatalogue(page,'Roble',104,80,false);await expect(tray(page).getByRole('status')).toHaveText('Deja libre la casa, el tejado y sus bordes.');
 await dragFromCatalogue(page,'Roble',104,175,false);await expect(tray(page).getByRole('status')).toHaveText('Deja libre el camino de la puerta.');
 await dragFromCatalogue(page,'Roble',240,210,false);await expect(tray(page).getByRole('status')).toHaveText('Coloca el objeto dentro del jardín marcado.');await expect(tray(page).locator('.sv-garden-count')).toHaveText('1/16 objetos');
 await page.screenshot({path:testInfo.outputPath('garden-desktop.png'),animations:'disabled'});await tray(page).getByRole('button',{name:'Terminar',exact:true}).click();await expect(tray(page)).toBeHidden();await expect.poll(async()=>(await savedHouse(page)).garden).toEqual([expect.objectContaining({kind:'palm',plot:0,x:0,y:-52})]);
 await page.reload();await openGarden(page);await expect(tray(page).locator('.sv-garden-count')).toHaveText('1/16 objetos');await page.mouse.move(...await worldPoint(page,24,71));await page.mouse.down();await page.mouse.move(...await worldPoint(page,60,147),{steps:10});await page.mouse.up();
 await tray(page).getByRole('button',{name:'Retirar',exact:true}).click();await expect(tray(page).locator('.sv-garden-count')).toHaveText('0/16 objetos');await tray(page).getByRole('button',{name:'Deshacer',exact:true}).click();await tray(page).getByRole('button',{name:'Terminar',exact:true}).click();await expect.poll(async()=>(await savedHouse(page)).garden).toEqual([expect.objectContaining({kind:'palm',plot:0,x:36,y:24})]);
 await openGarden(page);await page.mouse.click(...await worldPoint(page,60,147));await tray(page).getByRole('button',{name:'Retirar',exact:true}).click();await tray(page).getByRole('button',{name:'Cancelar',exact:true}).click();await page.reload();expect((await savedHouse(page)).garden).toEqual([expect.objectContaining({kind:'palm',plot:0,x:36,y:24})]);expect(errors).toEqual([]);
});

test.describe('small touch garden',()=>{
 test.use({viewport:{width:320,height:568},isMobile:true,hasTouch:true});
 test('a small phone fits the yard above a compact catalogue and still supports tap placement',async({page},testInfo)=>{
  await page.goto('/');await openGarden(page);const panel=(await tray(page).boundingBox())!;expect(panel.height).toBeLessThanOrEqual(280);await tray(page).getByRole('button',{name:'Palmera',exact:true}).tap();
  const [x,y]=await worldPoint(page,24,83);expect(y).toBeGreaterThan(72);expect(y).toBeLessThan(panel.y);await page.touchscreen.tap(x,y);await expect(tray(page).locator('.sv-garden-count')).toHaveText('1/16 objetos');
  for(const label of ['Deshacer','Retirar','Terminar']){const button=tray(page).getByRole('button',{name:label,exact:true});expect(await button.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;})).toBe(true);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('garden-phone.png'),animations:'disabled'});await tray(page).getByRole('button',{name:'Terminar',exact:true}).tap();await expect(tray(page)).toBeHidden();await page.reload();expect((await savedHouse(page)).garden).toEqual([expect.objectContaining({kind:'palm',plot:0,x:0,y:-52})]);
 });
 test('native touch drag places from the catalogue, cancellation discards previews, and an invalid move rolls back',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Native continuous touch input uses the Chromium CDP driver; WebKit covers tap and pointer drags separately.');
  await page.goto('/');await openGarden(page);const touch=await page.context().newCDPSession(page);
  const start=async(x:number,y:number)=>touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});const move=async(x:number,y:number)=>touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1}]});const end=async(cancel=false)=>touch.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  const tile=tray(page).getByRole('button',{name:'Palmera',exact:true}),b=(await tile.boundingBox())!;
  await start(b.x+b.width/2,b.y+b.height/2);await move(...await worldPoint(page,24,83));await expect(tray(page)).toHaveAttribute('data-preview','valid');await end(true);await expect(tray(page).locator('.sv-garden-count')).toHaveText('0/16 objetos');
  await start(b.x+b.width/2,b.y+b.height/2);await move(...await worldPoint(page,24,83));await expect(tray(page)).toHaveAttribute('data-preview','valid');await end();await expect(tray(page).locator('.sv-garden-count')).toHaveText('1/16 objetos');
  await start(...await worldPoint(page,24,71));await move(...await worldPoint(page,104,68));await end();await expect(tray(page).getByRole('status')).toHaveText('Deja libre la casa, el tejado y sus bordes.');// Finish with the mouse driver after raw CDP gestures; the preceding test covers touch-only saving.
  await tray(page).getByRole('button',{name:'Terminar',exact:true}).click();await expect(tray(page)).toBeHidden();expect((await savedHouse(page)).garden).toEqual([expect.objectContaining({kind:'palm',plot:0,x:0,y:-52})]);await touch.detach();
 });
});

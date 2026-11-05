import {test,expect,type Page} from '@playwright/test';
import type {WorkspaceDocument} from '../../../packages/core/src/house/workspaces';
import {readPersistedLocalData} from './helpers/persistence';
import {worldPoint} from './root-polish-helpers';

async function phone(page:Page,app:string){await page.getByTestId('phone-button').click();await page.getByTestId(`phone-${app}`).click();}
const spaces=(page:Page)=>page.getByRole('dialog',{name:'Plantas y habitaciones'});
const workspaceDocs=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('studyvillage-workspaces-v1')||'{}') as Record<string,WorkspaceDocument>);
const ground=(page:Page)=>workspaceDocs(page).then(docs=>docs['own/ground/@floor']);
async function enterFloor(page:Page,index=0){await phone(page,'rooms');await spaces(page).getByRole('button',{name:'Entrar a la planta',exact:true}).nth(index).click();await spaces(page).getByRole('button',{name:'Cerrar',exact:true}).click();}
async function clickWorld(page:Page,x:number,y:number){const [clientX,clientY]=await worldPoint(page,x,y);await page.mouse.click(clientX,clientY);}
async function dragWorld(page:Page,x:number,y:number,toX:number,toY:number){const [fromX,fromY]=await worldPoint(page,x,y),[destX,destY]=await worldPoint(page,toX,toY);await page.mouse.move(fromX,fromY);await page.mouse.down();await page.mouse.move(destX,destY,{steps:10});await page.mouse.up();}
async function catalogueDetails(page:Page){const details=page.locator('.sv-house-editor > details');if(!await details.evaluate(e=>(e as HTMLDetailsElement).open))await details.locator(':scope > summary').click();return page.locator('.sv-house-editor');}

// Every mutation goes through the UI. Storage reads verify independent committed documents.
test('floor ornaments place, drag, rename, undo and persist independently from rooms, another floor and the lobby',async({page},testInfo)=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');await phone(page,'rooms');
 const originalLobby=structuredClone((await readPersistedLocalData(page)).house!.furniture);
 await spaces(page).getByRole('button',{name:'Añadir habitación',exact:true}).click();await spaces(page).getByLabel('Nombre de la habitación').fill('Aula');await spaces(page).getByLabel('Nombre de la habitación').press('Tab');
 await spaces(page).getByRole('button',{name:'Añadir planta',exact:true}).click();await spaces(page).getByLabel('Nombre de la planta').nth(1).fill('Ático');await spaces(page).getByLabel('Nombre de la planta').nth(1).press('Tab');
 await spaces(page).getByLabel('Nombre de la planta').first().fill('Pasillo principal');await spaces(page).getByLabel('Nombre de la planta').first().press('Tab');await spaces(page).getByRole('button',{name:'Entrar a la planta',exact:true}).first().click();await spaces(page).getByRole('button',{name:'Cerrar',exact:true}).click();
 await expect(page.locator('.sv-hud-place h1')).toHaveText('Pasillo principal');await expect.poll(async()=>(await ground(page))?.furniture).toEqual([]);
 await phone(page,'decorate');await expect(page.getByRole('button',{name:'Colocar Planta',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Colocar Roble',exact:true})).toBeVisible();
 for(const name of ['Escritorio','Pizarra','Guía de la casa','Reloj de concentración'])await expect(page.getByRole('button',{name:`Colocar ${name}`,exact:true})).toBeHidden();
 await page.getByRole('button',{name:'Colocar Planta',exact:true}).click();const toolbar=page.getByRole('group',{name:'Decorar planta',exact:true});await expect(toolbar).toBeVisible();await clickWorld(page,240,224);await expect.poll(async()=>(await ground(page))?.furniture.length).toBe(1);
 await dragWorld(page,250,234,314,250);await expect.poll(async()=>(await ground(page)).furniture[0]).toMatchObject({kind:'plant',x:304,y:240});
 await toolbar.getByRole('button',{name:'Catálogo',exact:true}).click();const editor=await catalogueDetails(page);await editor.getByLabel('Alias visible para todos').fill('Jade del pasillo');await editor.getByLabel('Alias visible para todos').press('Tab');await expect.poll(async()=>(await ground(page)).furniture[0].publicAlias).toBe('Jade del pasillo');
 await editor.getByRole('button',{name:'Decorar planta',exact:true}).click();await toolbar.getByRole('button',{name:'Retirar',exact:true}).click();await expect.poll(async()=>(await ground(page)).furniture.length).toBe(0);
 const undo=toolbar.getByRole('button',{name:'Deshacer',exact:true});await undo.focus();await page.keyboard.press('Enter');await expect.poll(async()=>(await ground(page)).furniture[0]?.publicAlias).toBe('Jade del pasillo');
 const saved=structuredClone((await ground(page)).furniture);await page.screenshot({path:testInfo.outputPath('floor-decoration-desktop.png'),animations:'disabled'});await toolbar.getByRole('button',{name:'Terminar',exact:true}).click();
 // Real pathfinding still reaches the room door after decorating the corridor.
 const [doorX,doorY]=await worldPoint(page,106,124);await page.mouse.dblclick(doorX,doorY);await expect(page.locator('.sv-hud-place h1')).toHaveText('Aula',{timeout:15000});
 await phone(page,'decorate');await expect(page.getByRole('button',{name:'Colocar Escritorio',exact:true})).toBeVisible();await catalogueDetails(page);await expect(page.locator('.sv-furniture-item',{hasText:'Jade del pasillo'})).toHaveCount(0);await page.keyboard.press('Escape');
 await enterFloor(page,1);await expect(page.locator('.sv-hud-place h1')).toHaveText('Ático');await phone(page,'decorate');await page.getByRole('button',{name:'Decorar planta',exact:true}).click();await toolbar.getByRole('button',{name:'Deshacer',exact:true}).click();
 const upper=Object.entries(await workspaceDocs(page)).find(([key])=>key.endsWith('/@floor')&&key!=='own/ground/@floor')!;expect(upper[1].furniture).toEqual([]);expect((await ground(page)).furniture).toEqual(saved);await toolbar.getByRole('button',{name:'Terminar',exact:true}).click();
 await phone(page,'rooms');await spaces(page).getByRole('button',{name:'Vestíbulo',exact:true}).click();await spaces(page).getByRole('button',{name:'Cerrar',exact:true}).click();await phone(page,'decorate');await catalogueDetails(page);await expect(page.locator('.sv-furniture-item',{hasText:'Jade del pasillo'})).toHaveCount(0);await page.keyboard.press('Escape');
 expect((await readPersistedLocalData(page)).house!.furniture).toEqual(originalLobby);await page.reload();await enterFloor(page);await expect(page.locator('.sv-hud-place h1')).toHaveText('Pasillo principal');expect((await ground(page)).furniture).toEqual(saved);expect((await workspaceDocs(page))[upper[0]].furniture).toEqual([]);expect((await readPersistedLocalData(page)).house!.furniture).toEqual(originalLobby);expect(errors).toEqual([]);
});

test('a decoration cannot cover a room entrance or its approach',async({page})=>{
 await page.goto('/');await phone(page,'rooms');await spaces(page).getByRole('button',{name:'Añadir habitación',exact:true}).click();await spaces(page).getByRole('button',{name:'Entrar a la planta',exact:true}).click();await spaces(page).getByRole('button',{name:'Cerrar',exact:true}).click();await phone(page,'decorate');await page.getByRole('button',{name:'Colocar Planta',exact:true}).click();
 await clickWorld(page,96,144);await expect(page.getByText('Deja libre el acceso a las puertas.',{exact:true})).toBeVisible();expect((await ground(page)).furniture).toEqual([]);
 await clickWorld(page,240,224);await expect.poll(async()=>(await ground(page)).furniture.length).toBe(1);await page.getByRole('group',{name:'Decorar planta',exact:true}).getByRole('button',{name:'Terminar',exact:true}).click();
 const [x,y]=await worldPoint(page,106,124);await page.mouse.dblclick(x,y);await expect(page.locator('.sv-hud-place h1')).toHaveText('Habitación 1',{timeout:15000});
});

test.describe('touch corridor decoration',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 test('a finger places an ornament with reachable controls and keeps it after reload',async({page},testInfo)=>{
  await page.goto('/');await enterFloor(page);await phone(page,'decorate');await page.getByRole('button',{name:'Colocar Planta',exact:true}).tap();const toolbar=page.getByRole('group',{name:'Decorar planta',exact:true});await expect(toolbar).toBeVisible();await expect(page.locator('[data-hud-widget="movement"]')).toBeHidden();await expect(page.getByTestId('touch-action-btn')).toBeHidden();
  const wrap=(await page.locator('.sv-stage-pane .sv-canvas-wrap').boundingBox())!,bar=(await toolbar.boundingBox())!;const bottom=Math.min(wrap.y+wrap.height,bar.y);await page.touchscreen.tap(wrap.x+wrap.width*.3,wrap.y+(bottom-wrap.y)*.3);await expect.poll(async()=>(await ground(page))?.furniture.length).toBe(1);
  const saved=structuredClone((await ground(page)).furniture);const done=toolbar.getByRole('button',{name:'Terminar',exact:true});await done.scrollIntoViewIfNeeded();expect(await done.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;})).toBe(true);await page.screenshot({path:testInfo.outputPath('floor-decoration-phone.png'),animations:'disabled'});await done.tap();await page.reload();await enterFloor(page);expect((await ground(page)).furniture).toEqual(saved);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
});

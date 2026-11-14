import {test,expect,type Page} from '@playwright/test';
import {openDecorate,openPetAtelier} from './root-polish-helpers';
import {savedStrokes} from './board-storage';
async function openBoard(page:Page){const editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Pizarra'}).first().dblclick();await expect(page.getByLabel('Pizarra para dibujar')).toBeVisible();}
async function draw(page:Page){const c=page.getByLabel('Pizarra para dibujar'),r=(await c.boundingBox())!;await page.mouse.move(r.x+r.width*.2,r.y+r.height*.3);await page.mouse.down();await page.mouse.move(r.x+r.width*.4,r.y+r.height*.4);await page.mouse.up();}
test('migrates over 2000 strokes, clears the entire layer, undoes and persists',async({page})=>{
 await page.goto('/');await openBoard(page);await draw(page);await expect.poll(async()=>(await savedStrokes(page)).length).toBe(1);
 const [first]=await savedStrokes(page);
 await page.evaluate(async first=>{await new Promise<void>((resolve,reject)=>{const r=indexedDB.deleteDatabase('studyvillage-whiteboards');r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);r.onblocked=()=>resolve();});localStorage.setItem('studyvillage-whiteboards-v1',JSON.stringify({metadata:[],elements:[],strokes:[[first.boardId,Array.from({length:2500},(_,n)=>({...first,id:'large'+n,points:[{x:100+n%100,y:100+Math.floor(n/100)},{x:101+n%100,y:100+Math.floor(n/100)}]}))]]}));},first);
 await page.reload();await openBoard(page);await expect.poll(async()=>(await savedStrokes(page)).length).toBe(2500);expect(await page.evaluate(()=>localStorage.getItem('studyvillage-whiteboards-v1'))).toBeNull();
 await page.getByRole('button',{name:'Borrar lo mío',exact:true}).click();await page.getByRole('button',{name:'¿Borrar todo lo tuyo?',exact:true}).click();await expect.poll(async()=>(await savedStrokes(page)).length).toBe(0);
 await page.getByRole('button',{name:'↶ Deshacer',exact:true}).click();await expect.poll(async()=>(await savedStrokes(page)).length).toBe(2500);
 await draw(page);await expect.poll(async()=>(await savedStrokes(page)).length).toBe(2501);await page.reload();expect(await savedStrokes(page)).toHaveLength(2501);
});
test('animal bucket and previous-frame tools stay inside their frame and export no shadow',async({page})=>{
 await page.goto('/');await openPetAtelier(page);const dialog=page.getByRole('dialog',{name:'Taller de mascotas',exact:true});await dialog.locator('summary').filter({hasText:'Plantilla e importación'}).click();await dialog.getByRole('button',{name:'Lienzo vacío',exact:true}).click();await dialog.getByLabel('Un solo sprite, sin animación',{exact:true}).uncheck();
 await dialog.getByRole('button',{name:'Rellenar',exact:true}).click();await dialog.locator('.sv-vanity-swatch').first().click();await expect(dialog.getByRole('button',{name:'Rellenar',exact:true})).toHaveAttribute('aria-pressed','true');await dialog.locator('.sv-vanity-canvas').click({position:{x:120,y:120}});
 await dialog.getByRole('button',{name:'Abajo · Caminar 1',exact:true}).click();await dialog.getByRole('button',{name:'Mostrar fotograma anterior',exact:true}).click();await expect(dialog.getByRole('button',{name:'Mostrar fotograma anterior',exact:true})).toHaveAttribute('aria-pressed','true');await dialog.getByRole('button',{name:'Añadir fotograma anterior debajo',exact:true}).click();await dialog.getByRole('button',{name:'Deshacer',exact:true}).click();await dialog.getByRole('button',{name:'Mostrar fotograma anterior',exact:true}).click();const alpha=await dialog.locator('.sv-vanity-canvas').evaluate((e:HTMLCanvasElement)=>e.getContext('2d')!.getImageData(122,122,1,1).data[3]);expect(alpha).toBe(0);
});

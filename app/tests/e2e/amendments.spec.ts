import {savedStrokes} from './board-storage';
import {test,expect,type Page} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {openDecorate} from './root-polish-helpers';
async function phone(page:Page,app:string){await page.getByTestId('phone-button').click();await openPhoneApp(page,app);}
// Reported on an unspecified Mac browser/input/OS; the owner does not reproduce on Linux.
// Synthetic events test the shared lifecycle, not the original physical Mac configuration.
for(const dpr of [1,2])test.describe(`completed strokes at DPR ${dpr}`,()=>{
 test.use({deviceScaleFactor:dpr});
 test('immediate consecutive releases remain saved with one undo action each',async({page})=>{
  await page.goto('/');const editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Pizarra'}).dblclick();const board=page.locator('.sv-board-pane canvas.sv-canvas');await expect(board).toBeVisible();
  await board.evaluate(element=>{const r=element.getBoundingClientRect();for(let i=0;i<12;i++){const values={bubbles:true,pointerId:i+1,pointerType:'pen',button:0,buttons:1,clientX:r.left+r.width*.2,clientY:r.top+r.height*(.2+i*.03)};element.dispatchEvent(new PointerEvent('pointerdown',values));element.dispatchEvent(new PointerEvent('pointermove',{...values,clientX:r.left+r.width*.4}));window.dispatchEvent(new PointerEvent('pointerup',{...values,buttons:0,clientX:r.left+r.width*.45}));element.dispatchEvent(new PointerEvent('lostpointercapture',{...values,buttons:0}));}});
  const count=()=>savedStrokes(page).then(s=>s.length);
  await expect.poll(count).toBe(12);await page.keyboard.press('ControlOrMeta+z');await expect.poll(count).toBe(11);await page.keyboard.press('ControlOrMeta+Shift+z');await expect.poll(count).toBe(12);
  await page.reload();expect(await count()).toBe(12);
 });
});
test('focus and rest repeat while the panel is closed, and reset stops repetition',async({page})=>{
 await page.goto('/');await phone(page,'focus');const panel=page.getByRole('dialog',{name:'Reloj de concentración'});
 for(const phase of ['Concentración','Descanso']){await panel.getByLabel(`${phase}: Minutos`,{exact:true}).fill('0');await panel.getByLabel(`${phase}: Segundos`,{exact:true}).fill('2');}
 await panel.getByRole('button',{name:'Comenzar',exact:true}).click();await panel.getByRole('button',{name:'Cerrar',exact:true}).click();
 const phase=page.locator('.sv-focus-hud-mode');await expect(phase).toHaveText('Descanso');await expect(phase).toHaveText('Concentración');await expect(phase).toHaveText('Descanso');await expect(phase).toHaveText('Concentración');
 await page.locator('.sv-focus-hud-open').click();await panel.getByRole('button',{name:'Reiniciar',exact:true}).click();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('studyvillage-focus-clock-v1')!));expect(saved).toMatchObject({status:'idle',mode:'focus',remaining:2,deadline:null});
});
test('pet houses spawn distinct persistent entities and expose species abilities',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('studyvillage-local',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('own-data','readwrite'),store=tx.objectStore('own-data'),read=store.get('state');read.onsuccess=()=>{const data=JSON.parse(read.result);data.house.furniture=['cat','dog','parrot','hamster','rabbit'].map((kind,i)=>({id:`test-${kind}`,kind:`pet-${kind}`,x:80+i*120,y:200,publicAlias:'',pet:{id:`test-${kind}`,mode:'roam'}}));store.put(JSON.stringify(data),'state');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}));
 await page.reload();await phone(page,'house');await phone(page,'pets');const panel=page.getByRole('dialog',{name:'Mascotas',exact:true});await expect(panel.getByRole('heading',{name:'Mascotas · 5/5 casas'})).toBeVisible();await expect(panel.getByRole('button',{name:'Ver mascota',exact:true})).toHaveCount(5);
 const parrot=panel.locator('section').filter({has:page.getByRole('heading',{name:'Loro',exact:true})});await parrot.getByRole('button',{name:'Gestionar casa',exact:true}).click();await panel.getByLabel('Nombre de la mascota').fill('Pico');await panel.getByLabel('Nombre de la mascota').blur();await panel.getByRole('button',{name:'Ver mascota',exact:true}).click();await panel.locator('summary').click();await panel.getByLabel('Frase del loro').fill('Bonjour, village !');await panel.getByLabel('Frase del loro').blur();await panel.getByRole('button',{name:'Sígueme',exact:true}).click();await panel.getByRole('button',{name:'Cerrar',exact:true}).click();await page.reload();await phone(page,'pets');await panel.locator('section').filter({has:page.getByRole('heading',{name:'Pico',exact:true})}).getByRole('button',{name:'Ver mascota',exact:true}).click();await expect(panel.getByRole('button',{name:'Sígueme',exact:true})).toHaveAttribute('aria-pressed','true');await panel.locator('summary').click();await expect(panel.getByLabel('Frase del loro')).toHaveValue('Bonjour, village !');
});

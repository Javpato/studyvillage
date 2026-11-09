import {test,expect} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {openDecorate} from './root-polish-helpers';
test('a saved but locked identity can still draw on its local house board',async({page})=>{
 await page.goto('/');await openPhoneApp(page,'settings');
 const settings=page.getByRole('dialog',{name:'Ajustes',exact:true});
 await settings.getByRole('tab',{name:'Identidad',exact:true}).click();
 await settings.getByLabel('Contraseña (12+ caracteres)').fill('companion-board-regression');
 await settings.getByRole('button',{name:'Cifrar y guardar',exact:true}).click();
 await expect(page.getByText('Identidad guardada cifrada. Necesitarás esta contraseña al reiniciar.',{exact:true}).first()).toBeVisible();
 await page.reload();const editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Pizarra'}).dblclick();
 await expect(page.locator('.sv-board-readonly')).toBeHidden();
 const canvas=page.locator('.sv-board-pane canvas.sv-canvas');const r=(await canvas.boundingBox())!;
 await page.mouse.move(r.x+r.width*.3,r.y+r.height*.3);await page.mouse.down();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.4);await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('studyvillage-whiteboards-v1')||'{"strokes":[]}').strokes.flatMap(([,items]:any)=>items).filter((s:any)=>!s.deleted).length)).toBe(1);
});

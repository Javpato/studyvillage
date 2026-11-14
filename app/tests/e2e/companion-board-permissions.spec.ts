import {savedBoards,savedStrokes} from './board-storage';
import {test,expect} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {openDecorate} from './root-polish-helpers';
test('a saved but locked identity can still draw at home and on both library boards',async({page})=>{
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
 await expect.poll(()=>savedStrokes(page).then(s=>s.length)).toBe(1);
 if(await page.getByTestId('board-back').isVisible())await page.getByTestId('board-back').click();else await page.getByRole('button',{name:'← Volver a mi casa',exact:true}).click();await page.getByRole('button',{name:'← Salir',exact:true}).click();
 const stage=page.locator('.sv-stage-pane canvas');const clickWorld=async(x:number,y:number)=>{const b=(await stage.boundingBox())!;await stage.dblclick({position:{x:b.width*x/768,y:b.height*y/432}});};
 await clickWorld(240,392);await expect(page.locator('.sv-hud-place h1')).toContainText('Biblioteca',{timeout:12000});
 for(const x of [270,490]){await clickWorld(x,90);await expect(canvas).toBeVisible({timeout:12000});await expect(page.locator('.sv-board-readonly')).toBeHidden();const b=(await canvas.boundingBox())!;await page.mouse.move(b.x+b.width*.3,b.y+b.height*.3);await page.mouse.down();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.4);await page.mouse.up();await expect(page.getByRole('button',{name:'↶ Deshacer',exact:true})).toBeEnabled();if(await page.getByTestId('board-back').isVisible())await page.getByTestId('board-back').click();else await page.getByRole('button',{name:'← Volver',exact:true}).first().click();}

});

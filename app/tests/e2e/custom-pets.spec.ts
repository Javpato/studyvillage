import {test,expect} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {openDecorate,savedHouse,worldPoint} from './root-polish-helpers';
test('create a custom animal, place its chosen house, reload and retain its independent ability',async({page})=>{
 await page.addInitScript(()=>{(window as any).customPetDrawn=false;const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args:any[]){if(this.canvas.matches('.sv-stage-pane canvas')&&args[0]?.dataset?.petArt)(window as any).customPetDrawn=true;return Reflect.apply(original,this,args);};});await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();await page.getByTestId('phone-button').click();await openPhoneApp(page,'pets');await page.getByRole('button',{name:'Colección de mascotas',exact:true}).click();await page.getByRole('button',{name:'Crear animal',exact:true}).click();const atelier=page.getByRole('dialog',{name:'Taller de mascotas',exact:true});await expect(atelier).toBeVisible();await atelier.getByLabel('Nombre de la mascota',{exact:true}).fill('Pip custom');await atelier.getByLabel('Habilidad especial',{exact:true}).selectOption('jump');await atelier.getByLabel('Casa de mascota',{exact:true}).selectOption('pet-dog');const canvas=atelier.locator('.sv-vanity-canvas');const r=(await canvas.boundingBox())!;await page.mouse.click(r.x+r.width*.5,r.y+r.height*.5);await atelier.getByRole('button',{name:'Guardar y colocar casa',exact:true}).click();await expect(atelier).toBeHidden();await page.mouse.click(...await worldPoint(page,510,270));await page.keyboard.press('Escape');await expect.poll(async()=>(await savedHouse(page)).furniture.some(f=>f.pet?.custom?.name==='Pip custom')).toBe(true);const animal=(await savedHouse(page)).furniture.find(f=>f.pet?.custom)!;expect(animal.kind).toBe('pet-dog');expect(animal.pet?.custom?.ability).toBe('jump');await expect.poll(()=>page.evaluate(()=>(window as any).customPetDrawn)).toBe(true);await page.reload();await page.getByTestId('phone-button').click();await openPhoneApp(page,'house');await expect.poll(()=>page.evaluate(()=>(window as any).customPetDrawn)).toBe(true);await page.getByTestId('phone-button').click();await openPhoneApp(page,'pets');await page.getByRole('button',{name:'Colección de mascotas',exact:true}).click();await expect(page.locator('.sv-pet-collection h3')).toHaveText('Pip custom');await page.getByRole('button',{name:'Editar mascota',exact:true}).click();await expect(atelier.getByLabel('Habilidad especial',{exact:true})).toHaveValue('jump');await expect(atelier.getByLabel('Casa de mascota',{exact:true})).toHaveValue('pet-dog');await page.screenshot({path:test.info().outputPath('custom-pet-atelier.png')});await atelier.getByRole('button',{name:'Cerrar',exact:true}).click();
});

test('place the animal atelier furniture, reload it and open the editor from that furniture',async({page})=>{
 await page.goto('/');
 await expect(page.getByTestId('phone-button')).toBeVisible();
 const before=await savedHouse(page);
 let editor=await openDecorate(page);
 await editor.getByRole('button',{name:'Colocar Taller de mascotas',exact:true}).click();
 await page.mouse.click(...await worldPoint(page,310,245));
 await page.getByRole('group',{name:'Decorar habitación',exact:true}).getByRole('button',{name:'Terminar',exact:true}).click();
 await expect.poll(async()=>(await savedHouse(page)).furniture.filter(f=>f.kind==='pet-atelier').length).toBe(1);
 const placed=(await savedHouse(page)).furniture.find(f=>f.kind==='pet-atelier')!;
 await page.reload();
 expect((await savedHouse(page)).furniture).toEqual(expect.arrayContaining([...before.furniture,placed]));
 editor=await openDecorate(page);
 await editor.locator('.sv-furniture-item').filter({hasText:'Taller de mascotas'}).dblclick();
 await expect(page.getByRole('dialog',{name:'Taller de mascotas',exact:true})).toBeVisible();
});

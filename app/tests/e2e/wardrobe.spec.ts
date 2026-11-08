import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import { test, expect } from '@playwright/test';
test('walking to the wardrobe picks the feminine body, combines hat, glasses, suit and jacket, and the look survives a reload', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('phone-button').click(); await openPhoneApp(page,'house');
  const canvas = page.locator('.sv-stage-pane canvas'); const box = (await canvas.boundingBox())!;
  await canvas.dblclick({ position: { x: box.width * 644 / 768, y: box.height * 182 / 432 } });
  const dialog = page.getByRole('dialog', { name: 'Mi armario' }); await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Cuerpo', exact: true }).click(); await dialog.getByRole('button', { name: 'Femenino', exact: true }).click();
  await dialog.getByRole('button', { name: 'Sombreros', exact: true }).click(); await dialog.getByRole('button', { name: 'Sombrero explorador', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lentes', exact: true }).click(); await dialog.getByRole('button', { name: 'Lentes redondos', exact: true }).click();
  await dialog.getByRole('button', { name: 'Ropa', exact: true }).click(); await dialog.getByRole('button', { name: 'Traje', exact: true }).click();
  await dialog.getByRole('button', { name: 'Sacos', exact: true }).click(); await dialog.getByRole('button', { name: 'Saco', exact: true }).click();
  await dialog.getByRole('button',{name:'Aspecto',exact:true}).click();await dialog.getByLabel('Auriculares',{exact:true}).check();await dialog.locator('summary',{hasText:'Color de los auriculares'}).click();await dialog.getByLabel('Color de los auriculares',{exact:true}).fill('#123456');await dialog.getByLabel('Color de los auriculares',{exact:true}).dispatchEvent('change');
  await dialog.getByRole('button', { name: 'Guardar look', exact: true }).click(); await expect(dialog).toBeHidden();
  await page.reload();
  const look = await page.evaluate(() => JSON.parse(localStorage.getItem('studyvillage-custom-assets-v1')!).avatar);
  expect(look).toMatchObject({ body: 'feminine', headwear: 'explorer', eyewear: 'round', outfit: 'suit', jacket: 'blazer',accessory:'headphones',headphonesColor:'#123456' });
});
test('discarding the wardrobe keeps the previous look', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('phone-button').click(); await openPhoneApp(page,'house');
  const canvas = page.locator('.sv-stage-pane canvas'); const box = (await canvas.boundingBox())!;
  await canvas.dblclick({ position: { x: box.width * 644 / 768, y: box.height * 182 / 432 } });
  const dialog = page.getByRole('dialog', { name: 'Mi armario' }); await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Corona', exact: true }).click();
  await dialog.getByRole('button', { name: 'Descartar', exact: true }).click(); await expect(dialog).toBeHidden();
  const look = await page.evaluate(() => JSON.parse(localStorage.getItem('studyvillage-custom-assets-v1') ?? '{}').avatar);
  expect(look?.headwear ?? 'none').not.toBe('crown');
});

test('repeated wardrobe exits restore movement and room changes leave no editor open',async({page})=>{
 await page.addInitScript(()=>{const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args:any[]){const source=args[0];if(this.canvas.matches('.sv-stage-pane canvas')&&source?.width===192&&source?.height===256&&args[7]===64)(window as any).avatarX=args[5];Reflect.apply(draw,this,args);};});
 await page.goto('/');await openPhoneApp(page,'house');const canvas=page.locator('.sv-stage-pane canvas'),dialog=page.getByRole('dialog',{name:'Mi armario'});
 for(const exit of ['Escape','Descartar','Guardar look']){
  const box=(await canvas.boundingBox())!;await canvas.dblclick({position:{x:box.width*644/768,y:box.height*182/432}});await expect(dialog).toBeVisible({timeout:15000});
  if(exit==='Escape')await page.keyboard.press('Escape');else await dialog.getByRole('button',{name:exit,exact:true}).click();await expect(dialog).toBeHidden();
  const before=await page.evaluate(()=>(window as any).avatarX);await page.keyboard.down('a');await expect.poll(()=>page.evaluate(()=>(window as any).avatarX)).toBeLessThan(before-15);await page.keyboard.up('a');expect(await page.locator('dialog.sv-wardrobe').count()).toBe(1);
 }
 await openPhoneApp(page,'village');await openPhoneApp(page,'house');await expect(dialog).toBeHidden();
});

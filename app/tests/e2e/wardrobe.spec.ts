import { test, expect } from '@playwright/test';
test('walking to the wardrobe picks the feminine body, combines hat, glasses, suit and jacket, and the look survives a reload', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('phone-button').click(); await page.getByTestId('phone-house').click();
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
  await page.goto('/'); await page.getByTestId('phone-button').click(); await page.getByTestId('phone-house').click();
  const canvas = page.locator('.sv-stage-pane canvas'); const box = (await canvas.boundingBox())!;
  await canvas.dblclick({ position: { x: box.width * 644 / 768, y: box.height * 182 / 432 } });
  const dialog = page.getByRole('dialog', { name: 'Mi armario' }); await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Corona', exact: true }).click();
  await dialog.getByRole('button', { name: 'Descartar', exact: true }).click(); await expect(dialog).toBeHidden();
  const look = await page.evaluate(() => JSON.parse(localStorage.getItem('studyvillage-custom-assets-v1') ?? '{}').avatar);
  expect(look?.headwear ?? 'none').not.toBe('crown');
});

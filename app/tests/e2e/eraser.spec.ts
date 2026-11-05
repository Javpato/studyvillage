import { test, expect } from '@playwright/test';
test('precision sizes persist and a partial eraser drag is undone together', async ({ page }) => {
  await page.goto('/');
  const openBoard = async () => {
    await page.getByTestId('phone-button').click(); await page.getByTestId('phone-decorate').click();
    const details = page.locator('.sv-house-editor > details');
    if (!await details.evaluate(el => (el as HTMLDetailsElement).open)) await details.locator(':scope > summary').click();
    await page.locator('.sv-furniture-item', { hasText: 'Pizarra' }).first().dblclick();
  };
  await openBoard();
  const canvas = page.getByLabel('Pizarra para dibujar');
  const box = (await canvas.boundingBox())!;
  const strokes = () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('studyvillage-whiteboards-v1') || '{}');
    return (saved.strokes || []).flatMap(([, list]: [string, {deleted:boolean;points:{x:number;y:number}[]}[]]) => list).filter((s:{deleted:boolean}) => !s.deleted).map(({ seq, ...s }: { seq:number }) => s);
  });
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .5); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .5, { steps: 15 }); await page.mouse.up();
  await expect.poll(async () => (await strokes()).length).toBe(1);
  const original = await strokes();
  await page.getByRole('button', { name: 'Opciones avanzadas', exact:true }).click();
  await page.locator('summary', { hasText: 'Trazo y edición' }).click();
  await page.getByLabel('Modo del borrador', { exact:true }).selectOption('precision');
  await page.getByLabel('Tamaño del borrador', { exact:true }).selectOption('32');
  await page.getByRole('button', { name: 'Opciones avanzadas', exact:true }).click();
  await page.getByRole('button', { name: 'Borrador', exact:true }).click();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .35); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .65); await page.mouse.up();
  await expect.poll(async () => (await strokes()).length).toBe(2);
  await page.getByRole('button', { name: '↶ Deshacer' }).click();
  await expect.poll(strokes).toEqual(original);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await strokes()).length).toBe(2);
  await page.reload(); await openBoard();
  await page.getByRole('button', { name: 'Opciones avanzadas', exact:true }).click();
  await page.locator('summary', { hasText: 'Trazo y edición' }).click();
  await expect(page.getByLabel('Modo del borrador', { exact:true })).toHaveValue('precision');
  await expect(page.getByLabel('Tamaño del borrador', { exact:true })).toHaveValue('32');
});

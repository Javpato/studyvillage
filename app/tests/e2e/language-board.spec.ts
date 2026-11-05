import { test, expect, type Page } from '@playwright/test';

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-settings').click();
}
async function openHouseBoard(page: Page, name = 'Pizarra'): Promise<void> {
  await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-decorate').click();
  if (!await page.locator('.sv-house-editor > details').evaluate(el => (el as HTMLDetailsElement).open)) await page.locator('.sv-house-editor > details > summary').click();
  await page.locator('.sv-furniture-item', { hasText: name }).first().dblclick();
}

test('switching to English happens in place: no reload, open drafts and drawings stay', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 42; });
  // A pending form value in the phone and a drawing on the board.
  await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-village').click();
  await page.getByLabel('Código de invitación').fill('borrador-de-invitacion');
  await page.keyboard.press('Escape');
  await openHouseBoard(page);
  const canvas = page.getByLabel('Pizarra para dibujar');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .4); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5, { steps: 8 }); await page.mouse.up();
  const drawn = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());

  await openSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await dialog.getByLabel('Idioma').selectOption('en');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Servers' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();

  await expect(page.getByLabel('Whiteboard for drawing')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Whiteboard tools' }).getByRole('button', { name: 'Select', exact: true })).toBeVisible();
  await expect.poll(() => page.getByLabel('Whiteboard for drawing').evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(drawn);
  await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-village').click();
  await expect(page.getByLabel('Invite code')).toHaveValue('borrador-de-invitacion');
  await page.keyboard.press('Escape');

  // The choice persists on this device and Spanish comes back the same way.
  await page.reload();
  await expect(page.getByTestId('phone-button')).toHaveAttribute('aria-label', /menu/i);
  await openSettings(page);
  await page.getByRole('dialog', { name: 'Settings' }).getByLabel('Language').selectOption('es');
  await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeVisible();
});

test('board: text format, selection, duplicate, undo of the whole gesture and delete', async ({ page }) => {
  await page.goto('/');
  await openHouseBoard(page);
  const tools = page.getByRole('group', { name: 'Herramientas de pizarra' });
  const canvas = page.getByLabel('Pizarra para dibujar');
  await tools.getByRole('button', { name: 'Texto', exact: true }).click();
  // The format can be chosen before writing, independently of the pen width.
  const context = page.locator('.sv-board-context');
  await context.locator('summary', { hasText: 'Formato' }).click();
  await context.getByLabel('Tamaño del texto').fill('40');
  await context.getByLabel('Fuente del texto').selectOption('serif');
  await context.getByRole('button', { name: 'Subrayado' }).click();
  await context.getByRole('button', { name: 'Usar para el texto nuevo' }).click();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * .3, y: box.height * .3 } });
  const editor = page.locator('textarea.sv-board-text');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveCSS('text-decoration-line', 'underline');
  await editor.fill('Hola pizarra');
  await editor.press('Enter');
  await expect(page.getByText('1 trazos en esta pizarra')).toBeAttached();

  await tools.getByRole('button', { name: 'Seleccionar', exact: true }).click();
  await canvas.click({ position: { x: box.width * .3 + 12, y: box.height * .3 + 12 } });
  await expect(context.getByRole('button', { name: 'Editar', exact: true })).toBeVisible();
  await context.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await expect(page.getByText('2 trazos en esta pizarra')).toBeAttached();
  // Undo reverts the duplicate as one step.
  await page.getByRole('button', { name: '↶ Deshacer' }).click();
  await expect(page.getByText('1 trazos en esta pizarra')).toBeAttached();

  // Rectangle selection then drag moves it as one transaction.
  await page.mouse.move(box.x + 4, box.y + 4); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .8, { steps: 6 }); await page.mouse.up();
  await expect(context.getByRole('button', { name: 'Eliminar', exact: true })).toBeVisible();
  await context.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByText('0 trazos en esta pizarra')).toBeAttached();
  await page.getByRole('button', { name: '↶ Deshacer' }).click();
  await expect(page.getByText('1 trazos en esta pizarra')).toBeAttached();
});

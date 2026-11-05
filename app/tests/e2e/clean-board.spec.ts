import { test, expect, type Page } from '@playwright/test';

/** The furniture list lives in the phone's «Decorar» app. */
async function openHouseBoard(page: Page): Promise<void> {
  await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-decorate').click();
  if (!await page.locator('.sv-house-editor > details').evaluate(el => (el as HTMLDetailsElement).open)) await page.locator('.sv-house-editor > details > summary').click();
  await page.locator('.sv-furniture-item', { hasText: 'Pizarra' }).first().dblclick();
}

for (const [device, width, height] of [['phone', 390, 844], ['iPad', 820, 1180], ['desktop', 1440, 1000]] as const) {
  test(`${device}: simple board draws and reveals advanced tools without losing work`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await openHouseBoard(page);
    const primary = page.getByRole('group', { name: 'Herramientas de pizarra' });
    const more = page.getByRole('button', { name: 'Opciones avanzadas', exact: true });
    const options = page.getByRole('region', { name: 'Opciones avanzadas de pizarra' });
    const canvas = page.getByLabel('Pizarra para dibujar');
    // Pencil, text, eraser, select and hand, then undo and «Más».
    await expect(primary.getByRole('button')).toHaveCount(7);
    await expect(primary.getByRole('button', { name: 'Seleccionar', exact: true })).toBeVisible();
    await expect(primary.getByRole('button', { name: 'Mano', exact: true })).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(options).not.toBeVisible();
    await expect(page.getByTestId('phone-button')).toBeVisible();
    await expect(page.getByTestId('ai-board-prompt')).not.toBeVisible();
    await expect(page.getByTestId('board-rename-input')).not.toBeVisible();
    await expect(primary.getByRole('button', { name: 'Lápiz', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await canvas.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/clean-board-${device}.png`, fullPage: true });
    const box = (await canvas.boundingBox())!;
    const pixels = () => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
    const empty = await pixels();
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .6, box.y + box.height * .6, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: '↶ Deshacer' })).toBeEnabled();
    await expect.poll(pixels).not.toBe(empty);
    const drawn = await pixels();
    const scroll = () => page.locator('.sv-board-pane').evaluate(e => ({ top:e.scrollTop, scroll:e.scrollHeight, client:e.clientHeight }));
    const beforeScroll = await scroll(); expect(beforeScroll.scroll).toBeLessThanOrEqual(beforeScroll.client+1);
    await page.mouse.move(5, height-10); await page.mouse.wheel(0, 700); expect((await scroll()).top).toBe(0);
    await more.click();
    await expect(options).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(options.locator('summary:visible')).toHaveText(['Formas', 'Trazo y edición', 'Vista', 'Fórmulas', 'Capas', 'Pizarra y archivo']);
    await expect(options.locator('details[open]')).toHaveCount(0);
    await expect(page.getByTestId('ai-board-prompt')).not.toBeVisible();
    await options.locator('summary', { hasText: 'Vista' }).click();
    await expect(options.getByRole('button', { name: 'Mano', exact: true })).toHaveCount(0);
    await options.locator('summary', { hasText: 'Formas' }).click();
    await expect(page.getByTestId('board-tool-circle')).toBeVisible();
    await page.screenshot({ path: `/tmp/organized-board-${device}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(options).not.toBeVisible();
    await expect(canvas).toBeVisible();
    await more.click();
    if (!await page.getByTestId('board-tool-arrow').isVisible()) await options.locator('summary', { hasText: 'Formas' }).click();
    await page.getByTestId('board-tool-arrow').click();
    await expect(more).toContainText('Flecha');
    await expect(options.locator('summary', { hasText: 'Asistente IA' })).not.toBeVisible();
    await expect(page.getByTestId('ai-board-prompt')).not.toBeVisible();
    await more.click();
    await expect(options).not.toBeVisible();
    await expect.poll(pixels).toBe(drawn);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '↶ Deshacer' }).click();
    await expect.poll(pixels).toBe(empty);
    await more.click();
    await page.getByRole('button', { name: '← Volver a mi casa' }).click();
    await openHouseBoard(page);
    await expect(more).toHaveAttribute('aria-expanded', 'false');
  });
}

import { test, expect, type Page } from '@playwright/test';

const plants = (page: Page) => page.evaluate(() => {
  const all = JSON.parse(localStorage.getItem('studyvillage-workspaces-v1') || '{}') as Record<string, { furniture: { kind: string }[] }>;
  return Object.values(all).reduce((n, doc) => n + doc.furniture.filter(f => f.kind === 'plant').length, 0);
});

for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]] as const) {
  test.describe(`phone ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test('furniture can be placed inside a room from the catalogue and persists', async ({ page }) => {
      await page.goto('/');
      const phone = async (app: string) => { await page.getByTestId('phone-button').click(); await page.getByTestId(`phone-${app}`).click(); };
      await phone('rooms');
      const spaces = page.getByRole('dialog', { name: 'Plantas y habitaciones' });
      await spaces.getByRole('button', { name: 'Añadir habitación', exact: true }).click();
      await spaces.getByRole('button', { name: 'Entrar a la habitación', exact: true }).click();
      await spaces.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await expect(page.locator('.sv-hud-place h1')).toHaveText('Habitación 1');
      const before = await plants(page);
      await phone('decorate');
      await page.getByRole('button', { name: 'Colocar Planta', exact: true }).click();
      const toolbarEl = page.locator('.sv-decoration-toolbar');
      await expect(toolbarEl).toBeVisible();
      // Walking controls step aside so they cover neither the toolbar nor the room.
      await expect(page.locator('[data-hud-widget="movement"]')).toBeHidden();
      await expect(page.getByTestId('touch-action-btn')).toBeHidden();
      // Every toolbar button is the topmost element where it sits, so a finger reaches it.
      for (const name of ['Catálogo', 'Terminar']) {
        const b = toolbarEl.getByRole('button', { name, exact: true });
        await b.scrollIntoViewIfNeeded();
        expect(await b.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; })).toBe(true);
      }
      // Tap an empty spot of the visible screen (not under the toolbar or the touch controls).
      const wrap = (await page.locator('.sv-stage-pane .sv-canvas-wrap').boundingBox())!;
      const toolbar = (await page.locator('.sv-decoration-toolbar').boundingBox())!;
      const bottom = Math.min(wrap.y + wrap.height, toolbar.y);
      await page.screenshot({ path: `test-results/room-decor-${name}-placing.png` });
      await page.touchscreen.tap(wrap.x + wrap.width * 0.3, wrap.y + (bottom - wrap.y) * 0.3);
      await expect.poll(() => plants(page)).toBe(before + 1);
      await page.screenshot({ path: `test-results/room-decor-${name}-placed.png` });
      await page.getByRole('button', { name: 'Terminar', exact: true }).click();
      await page.reload();
      await expect.poll(() => plants(page)).toBe(before + 1);
    });
  });
}

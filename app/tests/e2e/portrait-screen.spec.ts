import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('portrait phone: the screen fills its window, follows the player, zooms and keeps Usar in place', async ({ page }) => {
  await page.goto('/');
  const wrap = page.locator('.sv-stage-pane .sv-canvas-wrap');
  const canvas = page.locator('.sv-stage-pane canvas');
  await expect(canvas).toHaveCSS('transform', /matrix/);
  const win = (await wrap.boundingBox())!;
  expect(win.height).toBeGreaterThan(844 * 0.5);
  // No empty bars: the scene covers the whole window.
  const scene = (await canvas.boundingBox())!;
  expect(scene.y).toBeLessThanOrEqual(win.y + 4);
  expect(scene.y + scene.height).toBeGreaterThanOrEqual(win.y + win.height - 4);

  // Zoom changes the scale, is remembered and never scrolls the window.
  const zoom = page.locator('.sv-portrait-zoom');
  await expect(zoom.locator('.sv-portrait-zoom-label')).toHaveText('×1.5');
  await zoom.getByRole('button', { name: 'Acercar' }).click();
  await expect(zoom.locator('.sv-portrait-zoom-label')).toHaveText('×2');
  expect((await canvas.boundingBox())!.width).toBeGreaterThan(scene.width * 1.2);
  expect(await wrap.evaluate(e => e.scrollLeft + e.scrollTop)).toBe(0);
  await page.reload();
  await expect(page.locator('.sv-portrait-zoom-label')).toHaveText('×2');

  // Walking right moves the camera with the player.
  const before = await canvas.evaluate(e => e.style.transform);
  const pad = (await page.locator('.sv-dpad').boundingBox())!;
  await page.mouse.move(pad.x + pad.width - 6, pad.y + pad.height / 2);
  await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  await expect.poll(() => canvas.evaluate(e => e.style.transform)).not.toBe(before);

  // The pulsing «Usar» prompt neither moves nor grows the button.
  const usar = page.getByTestId('touch-action-btn');
  const idle = (await usar.boundingBox())!;
  await usar.evaluate(e => { e.classList.add('is-active-prompt'); e.style.animationDelay = '-1.2s'; e.style.animationPlayState = 'paused'; });
  const pulsing = (await usar.boundingBox())!;
  expect(Math.abs(pulsing.x + pulsing.width / 2 - (idle.x + idle.width / 2))).toBeLessThan(2);
  expect(Math.abs(pulsing.y + pulsing.height / 2 - (idle.y + idle.height / 2))).toBeLessThan(2);
  expect(pulsing.width).toBeLessThan(idle.width * 1.1);
});

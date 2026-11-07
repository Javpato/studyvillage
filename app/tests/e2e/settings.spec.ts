import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import { test, expect, type Page } from '@playwright/test';

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('phone-button').click();
  await openPhoneApp(page,'settings');
}

for (const [device, width, height] of [['phone', 390, 844], ['iPad', 820, 1180], ['desktop', 1440, 1000]] as const) {
  test(`${device}: the village fills the screen and settings live in the phone`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    // No side panels: only the place, the stage and the phone button.
    await expect(page.locator('.sv-sidebar, .sv-inspector, .sv-nav-item')).toHaveCount(0);
    await expect(page.getByTestId('phone-button')).toBeVisible();
    await expect(page.getByTestId('env-weather-select')).not.toBeVisible();
    await openSettings(page);
    const dialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`settings-${device}.png`), fullPage: true });
    await dialog.getByLabel('Nombre del vecindario (en este equipo)').fill('Aldea de prueba');
    await dialog.getByLabel('Nombre del vecindario (en este equipo)').press('Tab');
    await dialog.getByLabel('Nombre de tu casa').fill('Casa del bosque');
    await dialog.getByLabel('Nombre de tu casa').press('Tab');
    await dialog.getByRole('tab', { name: 'Ambiente', exact: true }).click();
    await dialog.getByRole('button', { name: /Niebla de bosque/ }).click();
    await dialog.getByLabel('Sonido de fondo').selectOption('rain');
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aldea de prueba', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await openSettings(page);
    await dialog.getByRole('tab', { name: 'Ambiente', exact: true }).click();
    await expect(dialog.getByTestId('env-weather-select')).toHaveValue('fog');
    await expect(dialog.getByLabel('Sonido de fondo')).toHaveValue('rain');
    await dialog.getByRole('tab', { name: 'Perfil', exact: true }).click();
    await expect(dialog.getByLabel('Nombre de tu casa')).toHaveValue('Casa del bosque');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
}

test('desktop clicks select; double clicks approach and open, and E works up close', async ({ page }) => {
  await page.goto('/'); const canvas=page.locator('.sv-stage-pane canvas'); const box=(await canvas.boundingBox())!;
  const north={x:box.width*240/768,y:box.height*50/432};
  await canvas.click({position:north}); await page.waitForTimeout(700); await expect(page.locator('.sv-hud-place h1')).toHaveText('La aldea');
  await canvas.dblclick({position:north}); await expect(page.locator('.sv-hud-place h1')).toHaveText('Plaza Comunitaria');
  await page.keyboard.press('e'); await expect(page.locator('.sv-hud-place h1')).toHaveText('La aldea');
});

test('closing the werewolves table always gives movement back', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.sv-stage-pane canvas');
  const bounds = (await canvas.boundingBox())!;
  await canvas.dblclick({ position: { x: bounds.width * 240 / 768, y: bounds.height * 50 / 432 } });
  await expect(page.getByRole('heading', { name: 'Plaza Comunitaria', exact: true })).toBeVisible({ timeout: 8000 });
  // Click the campfire: walk up to it and sit down.
  await canvas.dblclick({ position: { x: bounds.width * 384 / 768, y: bounds.height * 205 / 432 } });
  await expect(page.getByRole('heading', { name: 'La mesa de la hoguera' })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Sentarme a la mesa' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('expansion-modal-overlay')).not.toBeVisible();
  // Walk back west to the residential portal: only possible if the player can move.
  await page.keyboard.down('s');
  await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Barrio Residencial', { timeout: 8000 });
  await page.keyboard.up('s');
  await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: 'La aldea', exact: true })).toBeVisible();
  // Home and back out: you land at your own door and can still walk.
  await page.getByTestId('phone-button').click();
  await openPhoneApp(page,'house');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'La aldea', exact: true })).toBeVisible();
  await page.keyboard.down('s');
  await page.waitForTimeout(400);
  await page.keyboard.up('s');
  await page.keyboard.down('d');
  await expect(page.locator('.sv-touch-btn-label').last()).not.toContainText('Entrar', { timeout: 4000 });
  await page.keyboard.up('d');
});

test.describe('touch (emulated phone, not a physical device)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('one tap walks closer without opening, even on arrival; a double tap approaches and opens', async ({ page }) => {
    // Zoom ×1 shows the scene's full height in portrait, so the north portal is on screen from the start.
    await page.addInitScript(() => localStorage.setItem('studyvillage-portrait-zoom-v1', '1'));
    await page.goto('/');
    const canvas = page.locator('.sv-stage-pane canvas');
    // In portrait the camera follows the player, so the portal's screen position is read again after walking.
    const northPortal = async () => { const box = (await canvas.boundingBox())!; return { x: box.x + box.width * 240 / 768, y: box.y + box.height * 50 / 432 }; };
    let north = await northPortal();
    await page.touchscreen.tap(north.x, north.y);
    await page.waitForTimeout(2500); // long enough to arrive at the portal
    await expect(page.locator('.sv-hud-place h1')).toHaveText('La aldea');
    north = await northPortal();
    await page.touchscreen.tap(north.x, north.y); await page.waitForTimeout(80); await page.touchscreen.tap(north.x, north.y);
    await expect(page.locator('.sv-hud-place h1')).toHaveText('Plaza Comunitaria');
  });
  test('touch controls set to «Ocultos» hide the pad and are remembered on a touchscreen', async ({ page }) => {
    await page.goto('/');
    await openSettings(page);
    const dialog = page.getByRole('dialog', { name: 'Ajustes' });
    await dialog.getByRole('tab', { name: 'Controles', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Controles táctiles' }).selectOption('off');
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await expect(page.locator('.sv-touch-controls, [class*=touch-controls]').first()).toBeHidden();
    await page.reload();
    await openSettings(page);
    await page.getByRole('dialog', { name: 'Ajustes' }).getByRole('tab', { name: 'Controles', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Ajustes' }).getByRole('combobox', { name: 'Controles táctiles' })).toHaveValue('off');
  });
  test('each arrow presses only its own direction, even at its corners', async ({ page }) => {
    await page.goto('/');
    const pad = page.locator('.sv-dpad'); await expect(pad).toBeVisible();
    for (const dir of ['up', 'down', 'left', 'right']) {
      const b = (await page.locator(`.sv-dpad-${dir}`).boundingBox())!;
      for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1]]) {
        await pad.dispatchEvent('pointerdown', { pointerId: 7, clientX: b.x + b.width * fx, clientY: b.y + b.height * fy, isPrimary: true, pointerType: 'touch' });
        await expect(page.locator('.sv-dpad-btn.is-pressed'), `${dir} at ${fx},${fy}`).toHaveCount(1);
        await expect(page.locator(`.sv-dpad-${dir}`)).toHaveClass(/is-pressed/);
        await pad.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch' });
      }
    }
  });
});


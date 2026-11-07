import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import { expect, test, type Page } from '@playwright/test';
import { openDecorate, savedHouse, worldPoint } from './root-polish-helpers';

const longDialogue = 'Bienvenido a tu casa. Aquí puedes crear cuadernos, dibujar ideas y preparar tarjetas para estudiar. Usa el teléfono para visitar la aldea y hablar con tus amigos. Cuando necesites descansar, prueba el reloj o escucha tu música. Puedes mover esta guía y personalizar el espacio a tu ritmo.';
const bubble = (page: Page) => page.getByRole('group', { name: 'Diálogo del guía', exact: true });

async function speak(page: Page, text?: string) {
  const editor = await openDecorate(page);
  await editor.locator('.sv-furniture-item').filter({ hasText: 'Guía de la casa' }).click();
  if (text !== undefined) {
    await editor.getByLabel('Diálogo del guía', { exact: true }).fill(text);
    await editor.getByLabel('Diálogo del guía', { exact: true }).blur();
    await expect.poll(async () => (await savedHouse(page)).furniture.find(item => item.kind === 'guide')?.guideText).toBe(text);
  }
  await editor.locator('.sv-furniture-detail>button').first().click();
  await expect(page.locator('.sv-phone')).toBeHidden();
  await expect(bubble(page)).toBeVisible();
  await expect(bubble(page).locator('.sv-npc-next')).not.toHaveText('');
}

async function observeAvatar(page: Page) {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(this: CanvasRenderingContext2D, ...args: Parameters<typeof original>) {
      const source = args[0];
      if (this.canvas.matches('.sv-stage-pane canvas') && (source instanceof HTMLCanvasElement || source instanceof HTMLImageElement) && source.width === 192 && source.height === 256 && args[7] === 64 && args[8] === 64) {
        (window as unknown as { drawnAvatar: {x:number;y:number} }).drawnAvatar = { x: Number(args[5]), y: Number(args[6]) };
      }
      Reflect.apply(original, this, args);
    } as typeof original;
  });
}

async function dialogueSettings(page: Page) {
  await page.getByTestId('phone-button').click();
  await openPhoneApp(page,'settings');
  const settings = page.getByRole('dialog', { name: 'Ajustes', exact: true });
  await settings.getByRole('tab', { name: 'Controles', exact: true }).click();
  const disclosure = settings.locator('.sv-npc-settings');
  if (!(await disclosure.evaluate(el => el.hasAttribute('open')))) await disclosure.locator('summary').click();
  return settings;
}

for (const profile of [{ name: 'desktop', width: 1440, height: 1000, touch: false }, { name: 'phone', width: 320, height: 568, touch: true }]) {
  test.describe(`guide dialogue on ${profile.name}`, () => {
    test.use({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.touch, isMobile: profile.touch });
    test('stays compact, reveals and pages, dismisses outside and keeps controls available', async ({ page }) => {
      test.setTimeout(75_000);
      await observeAvatar(page);
      await page.goto('/');
      await speak(page, 'Bienvenido.');
      const shortHeight = (await bubble(page).boundingBox())!.height;
      const outside = await worldPoint(page, 384, 365);
      if (profile.touch) await page.touchscreen.tap(...outside); else await page.mouse.click(...outside);
      expect(await bubble(page).isHidden()).toBe(true); // The same pointer action dismisses it; no timeout or second click.

      const position = () => page.evaluate(() => (window as unknown as { drawnAvatar: {x:number;y:number} }).drawnAvatar);
      const start = await position();
      if (profile.touch) {
        const right = (await page.getByRole('button', { name: 'Mover derecha', exact: true }).boundingBox())!;
        await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2);
        await page.mouse.down();
      } else await page.keyboard.down('d');
      await expect.poll(async () => (await position()).x - start.x).toBeGreaterThan(15);
      if (profile.touch) await page.mouse.up(); else await page.keyboard.up('d');

      await speak(page, longDialogue);
      const speech = bubble(page), next = speech.locator('.sv-npc-next');
      await expect(next).toHaveText('Mostrar texto');
      const firstPage = await speech.locator('.sv-npc-page').textContent();
      await next.click();
      await expect(next).toHaveText('Siguiente');
      expect(await speech.locator('.sv-npc-page').textContent()).toBe(firstPage);
      const bounds = (await speech.boundingBox())!;
      expect(bounds.width).toBeLessThanOrEqual(240);
      expect(bounds.height).toBeLessThanOrEqual(shortHeight + 2);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(profile.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(profile.height);
      await page.screenshot({ path:test.info().outputPath(`npc-speech${profile.touch ? '-phone' : ''}.png`), animations: 'disabled' });
      const parts: string[] = [];
      for (let count = 0; count < 20 && await speech.isVisible(); count++) {
        await expect(next).toHaveText(/^(Siguiente|Listo)$/);
        const text = await speech.locator('.sv-npc-bubble-text').textContent();
        parts.push(text!);
        expect(text!.split('\n').length).toBeLessThanOrEqual(2);
        expect((await speech.boundingBox())!.height).toBeLessThanOrEqual(shortHeight + 2);
        await next.click();
      }
      await expect(speech).toBeHidden();
      expect(parts.length).toBeGreaterThan(2);
      expect(parts.join(' ').replace(/\s+/g, ' ').trim()).toBe(longDialogue);

      let settings = await dialogueSettings(page);
      const opacity = settings.getByLabel('Opacidad del fondo', { exact: true });
      await opacity.focus(); await opacity.press('Home');
      for (let n = 0; n < 5; n++) await opacity.press('ArrowRight');
      await settings.getByLabel('Tamaño del texto', { exact: true }).selectOption('large');
      await settings.getByLabel('Texto por burbuja', { exact: true }).selectOption('3');
      await settings.getByLabel('Texto progresivo', { exact: true }).uncheck();
      await expect(opacity).toHaveValue('60');
      if (!profile.touch) { await settings.locator('.sv-npc-settings').scrollIntoViewIfNeeded(); await page.screenshot({ path:test.info().outputPath('npc-dialogue-settings.png'), animations: 'disabled' }); }
      await page.reload();
      settings = await dialogueSettings(page);
      await expect(settings.getByLabel('Opacidad del fondo', { exact: true })).toHaveValue('60');
      await expect(settings.getByLabel('Tamaño del texto', { exact: true })).toHaveValue('large');
      await expect(settings.getByLabel('Texto por burbuja', { exact: true })).toHaveValue('3');
      await expect(settings.getByLabel('Texto progresivo', { exact: true })).not.toBeChecked();
      await settings.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await speak(page);
      await expect(next).toHaveText('Siguiente');
      expect(await speech.evaluate(el => el.style.getPropertyValue('--speech-opacity'))).toBe('0.6');
      await expect(speech.locator('.sv-npc-bubble-text')).toHaveCSS('font-size', '16px');
      expect((await speech.locator('.sv-npc-bubble-text').textContent())!.split('\n').length).toBe(3);
      await speech.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
      await expect(speech).toBeHidden();
    });
  });
}

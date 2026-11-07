import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import { expect, test, type Page } from '@playwright/test';

const devices = [
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'iPad', viewport: { width: 820, height: 1180 }, touch: true },
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, touch: false },
];

async function openVillageApp(page: Page): Promise<void> {
  if (await page.locator('.sv-phone').isHidden()) await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-village').click();
}

for (const device of devices) {
  test.describe(device.name, () => {
    test.use({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.name === 'phone' });

    test('only the newest notice shows, it can always be closed, and closed ones do not come back', async ({ page }) => {
      await page.goto('/');
      const toast = page.locator('.sv-notice.sv-hud-toast');
      await expect(page.locator('.sv-stage-pane canvas')).toBeVisible();
      await openPhoneApp(page,'settings');
      const settings=page.getByRole('dialog',{name:'Ajustes',exact:true});
      await settings.getByLabel('Nombre visible',{exact:true}).fill('   ');
      await settings.getByRole('button',{name:'Guardar perfil',exact:true}).click();
      await settings.getByRole('button',{name:'Cerrar',exact:true}).click();
      await expect(toast).toBeVisible();
      await expect(toast).toContainText('Elige un nombre');

      // A second, different notice replaces the first instead of queueing behind it.
      await openVillageApp(page);
      await page.getByPlaceholder('Pega una invitación').fill('esto-no-es-una-invitacion');
      await page.getByRole('button', { name: 'Unirme', exact: true }).click();
      await expect(toast).toBeVisible();
      await expect(toast).not.toContainText('Elige un nombre');
      await expect(page.locator('.sv-notice:visible')).toHaveCount(1);

      // The close button is on top of everything (phone, controls) and removes it for good.
      await toast.getByRole('button', { name: 'Cerrar aviso' }).click();
      await expect(toast).toBeHidden();
      await page.waitForTimeout(800);
      await expect(toast).toBeHidden();

      // The same message sent again shows again.
      await page.getByRole('button',{name:'Unirme',exact:true}).click();
      await expect(toast).toBeVisible();
      await toast.getByRole('button', { name: 'Cerrar aviso' }).click();
      await expect(toast).toBeHidden();
    });
  });
}

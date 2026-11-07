import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import { expect, test } from '@playwright/test';

for (const savedIdentity of [false, true]) {
  for (const key of ['w', 'ArrowUp']) {
    test(`${key} moves ${savedIdentity ? 'after continuing offline with a locked identity' : 'on a fresh launch'}`, async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.sv-stage-pane canvas')).toBeVisible();
      if (savedIdentity) {
        await page.getByTestId('phone-button').click();
        await openPhoneApp(page,'settings');
        const settings = page.getByRole('dialog', { name: 'Ajustes' });
        await settings.getByRole('tab', { name: 'Identidad', exact: true }).click();
        await settings.getByLabel('Contraseña (12+ caracteres)').fill('keyboard-regression-password');
        await settings.getByRole('button', { name: 'Cifrar y guardar' }).click();
        await expect(page.getByText('Identidad guardada cifrada. Necesitarás esta contraseña al reiniciar.', { exact: true }).first()).toBeVisible();
        await page.reload();
        await expect(page.locator('.sv-stage-pane canvas')).toBeVisible();
        // Rebuild opens offline directly; identity unlock is an explicit phone action.
        await expect(page.locator('.sv-lock-card')).toBeHidden();
      }

      // Reaching the portal proves actual movement, not just an animation change.
      await page.keyboard.down(key);
      try {
        await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Ir a Plaza Comunitaria', { timeout: 8000 });
      } finally {
        await page.keyboard.up(key);
      }
      await page.keyboard.press('e');
      await expect(page.locator('.sv-hud-place h1')).toHaveText('Plaza Comunitaria');
    });
  }
}

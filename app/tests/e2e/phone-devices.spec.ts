import {test,expect} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';

test('Devices is a movable phone app with three short pairing steps',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();
 await openPhoneApp(page,'devices');
 const dialog=page.getByRole('dialog',{name:'Enlazar dispositivo',exact:true});
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('.sv-pair-steps li')).toHaveText(['Abre StudyVillage en los dos dispositivos.','Crea un código aquí y escríbelo en el otro.','Aquí, elige el jugador principal y confirma.']);
 await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.getByTestId('phone-button').click();await page.getByTestId('phone-folder-settings').click();
 await page.getByTestId('phone-devices').click({button:'right'});
 await page.getByTestId('phone-devices').locator('[data-remove]').click();
 await page.getByRole('button',{name:'Listo',exact:true}).click();await page.reload();
 await page.getByTestId('phone-button').click();await page.getByTestId('phone-folder-settings').click();
 await expect(page.getByTestId('phone-devices')).toHaveCount(0);
 await page.getByTestId('phone-settings').click({button:'right'});
 await page.getByRole('button',{name:'Biblioteca de apps',exact:true}).click();
 await page.locator('.sv-phone-library').getByRole('button',{name:'Dispositivos',exact:true}).click();
 await page.getByRole('button',{name:'Listo',exact:true}).click();
 await openPhoneApp(page,'devices');await expect(dialog).toBeVisible();
});

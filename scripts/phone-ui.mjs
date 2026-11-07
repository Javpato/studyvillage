/** Navigate the real phone, installing optional shortcuts through Settings when needed. */
import {readFileSync} from 'node:fs';
export async function openPhoneApp(page,id){
 const phone=page.locator('.sv-phone');
 if(await phone.isHidden())await page.getByTestId('phone-button').click();
 if(await phone.getAttribute('data-page')!=='home')await phone.locator('.sv-phone-head button').first().click();
 if(await phone.getAttribute('data-page')!=='home')await phone.locator('.sv-phone-head button').first().click();
 const target=page.getByTestId(`phone-${id}`);
 if(await target.isVisible()){await target.click();return;}
 const folder=['house','rooms','decorate','garden'].includes(id)?'home':'settings';
 await page.getByTestId(`phone-folder-${folder}`).click();
 if(await target.isVisible()){await target.click();return;}
 await page.getByTestId('phone-settings').click();
 const lang=await page.locator('html').getAttribute('lang')||'es';
 const catalog=JSON.parse(readFileSync(new URL(`../app/src/i18n/${lang}.json`,import.meta.url),'utf8'));
 const t=key=>catalog[key]||key;
 await page.getByRole('tab',{name:t('Teléfono'),exact:true}).click();
 await page.getByLabel(t('Aplicación para añadir'),{exact:true}).selectOption(id);
 await page.getByRole('button',{name:t('Añadir aplicación'),exact:true}).click();
 await page.getByRole('button',{name:t('Guardar teléfono'),exact:true}).click();
 await page.getByRole('dialog',{name:t('Ajustes'),exact:true}).getByRole('button',{name:t('Cerrar'),exact:true}).click();
 await page.getByTestId('phone-button').click();await page.getByTestId(`phone-${id}`).click();
}

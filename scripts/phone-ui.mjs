/** Navigate the real phone, installing optional shortcuts through Settings when needed. */
import {readFileSync} from 'node:fs';
export async function openPhoneApp(page,id){
 const phone=page.locator('.sv-phone');
 if(await phone.isHidden())await page.getByTestId('phone-button').click();
 if(await phone.getAttribute('data-page')!=='home')await phone.locator('.sv-phone-head button').first().click();
 if(await phone.getAttribute('data-page')!=='home')await phone.locator('.sv-phone-head button').first().click();
 const target=page.getByTestId(`phone-${id}`);
 if(await target.isVisible()){await target.click();return;}
 const folder=['house','rooms','decorate','garden','pets'].includes(id)?'home':'settings';
 await page.getByTestId(`phone-folder-${folder}`).click();
 if(await target.isVisible()){await target.click();return;}
 const lang=await page.locator('html').getAttribute('lang')||'es';
 const catalog=JSON.parse(readFileSync(new URL(`../app/src/i18n/${lang}.json`,import.meta.url),'utf8'));
 const t=key=>catalog[key]||key;
 if(id==='identity'||id==='connection'){
  await page.getByTestId('phone-settings').click();await page.getByRole('tab',{name:t(id==='identity'?'Identidad':'Servidores'),exact:true}).click();
  if(id==='connection')await page.getByText(t('Conexión avanzada'),{exact:true}).click();return;
 }
 await page.getByTestId('phone-settings').click({button:'right'});
 await page.getByRole('button',{name:t('Biblioteca de apps'),exact:true}).click();
 const names={pets:'Mascotas',ink:'Cuaderno de tinta',music:'Música',study:'Estudio',projects:'Proyectos',focus:'Concentración',tetris:'Bloques del Bosque'};
 await page.locator('.sv-phone-library').getByRole('button',{name:t(names[id]),exact:true}).click();
 await page.getByRole('button',{name:t('Listo'),exact:true}).click();
 await phone.locator('.sv-phone-head button').first().click();await page.getByTestId(`phone-${id}`).click();
}

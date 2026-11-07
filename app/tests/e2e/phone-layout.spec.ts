import {test,expect,type Page} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
async function editor(page:Page){await openPhoneApp(page,'settings');await page.getByRole('tab',{name:'Teléfono',exact:true}).click();return page.locator('.sv-phone-layout-editor');}
async function closeSettings(page:Page){await page.getByRole('dialog',{name:'Ajustes',exact:true}).getByRole('button',{name:'Cerrar',exact:true}).click();}
for(const width of [390,1440])test(`default phone and folders at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/');await page.getByTestId('phone-button').click();
 await expect(page.locator('.sv-phone-home .sv-app-label')).toHaveText(['Aldea','Contactos','Identidad','Hogar','Ajustes']);
 await page.getByTestId('phone-folder-home').click();await expect(page.locator('[data-page=folder] .sv-phone-page:not([hidden]) .sv-app-label')).toHaveText(['Mi casa','Habitaciones','Decorar','Mi jardín']);
 await page.getByRole('button',{name:'Volver',exact:true}).click();await page.getByTestId('phone-folder-settings').click();await expect(page.getByTestId('phone-settings')).toBeVisible();
 for(const id of ['ink','music','study','projects','focus'])await expect(page.getByTestId(`phone-${id}`)).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('edit, reorder and delete folders while keeping Settings reachable after reload',async({page})=>{
 await page.goto('/');const e=await editor(page);await expect(e.locator('[data-app=settings]').getByRole('button',{name:'Quitar aplicación'})).toBeDisabled();
 await e.getByLabel('Nueva carpeta',{exact:true}).fill('Mis cosas');await e.getByRole('button',{name:'Crear carpeta',exact:true}).click();
 await e.getByLabel('Aplicación para añadir',{exact:true}).selectOption('ink');await e.getByRole('button',{name:'Añadir aplicación',exact:true}).click();
 const folder=await e.locator('fieldset').last().getAttribute('data-folder');await e.getByLabel('Ubicación de Cuaderno de tinta',{exact:true}).selectOption(folder!);
 await e.locator('[data-folder=settings]').getByRole('button',{name:'Eliminar carpeta',exact:true}).click();
 await e.locator('[data-app=settings]').getByRole('button',{name:'Subir',exact:true}).click();
 await e.getByRole('button',{name:'Guardar teléfono',exact:true}).click();await closeSettings(page);await page.reload();await page.getByTestId('phone-button').click();
 await expect(page.getByTestId('phone-settings')).toBeVisible();await page.getByTestId(`phone-folder-${folder}`).click();await expect(page.getByTestId('phone-ink')).toBeVisible();
 await page.getByTestId('phone-ink').click();await expect(page.getByLabel('Título del cuaderno',{exact:true})).toBeVisible();
});
test('failed saving keeps draft and cancel leaves persisted layout unchanged',async({page})=>{
 await page.goto('/');const e=await editor(page);await e.getByLabel('Aplicación para añadir',{exact:true}).selectOption('focus');await e.getByRole('button',{name:'Añadir aplicación',exact:true}).click();
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='studyvillage-phone-layout-v1')throw new DOMException('Full','QuotaExceededError');original.call(this,k,v);};});
 await e.getByRole('button',{name:'Guardar teléfono',exact:true}).click();await expect(e.getByRole('alert')).toContainText('No se pudo guardar');await expect(e.locator('[data-app=focus]')).toBeVisible();
 await e.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(e.locator('[data-app=focus]')).toHaveCount(0);
});
test('a full backup restores folders and optional shortcuts',async({page})=>{
 await page.goto('/');let e=await editor(page);
 await e.getByLabel('Aplicación para añadir',{exact:true}).selectOption('focus');await e.getByRole('button',{name:'Añadir aplicación',exact:true}).click();
 await e.getByRole('button',{name:'Guardar teléfono',exact:true}).click();await closeSettings(page);
 await openPhoneApp(page,'identity');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exportar copia completa',exact:true}).click()]);
 const stream=await download.createReadStream(),parts:Buffer[]=[];for await(const chunk of stream!)parts.push(Buffer.from(chunk));const bytes=Buffer.concat(parts);
 expect(JSON.parse(JSON.parse(bytes.toString()).values['studyvillage-phone-layout-v1']).entries).toContainEqual({type:'app',id:'focus'});await closeSettings(page);
 e=await editor(page);await e.locator('[data-app=focus]').getByRole('button',{name:'Quitar aplicación',exact:true}).click();await e.locator('[data-folder=home]').getByRole('button',{name:'Eliminar carpeta',exact:true}).click();
 await e.getByRole('button',{name:'Guardar teléfono',exact:true}).click();await closeSettings(page);
 await openPhoneApp(page,'identity');await page.getByLabel('Copia completa de StudyVillage',{exact:true}).setInputFiles({name:'phone-backup.json',mimeType:'application/json',buffer:bytes});
 await page.getByLabel('He cerrado otras ventanas. Quiero reemplazar los datos locales con esta copia.',{exact:true}).check();
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Restaurar copia y reiniciar',exact:true}).click()]);await page.getByTestId('phone-button').click();
 await expect(page.getByTestId('phone-folder-home')).toBeVisible();await expect(page.getByTestId('phone-focus')).toBeVisible();
});

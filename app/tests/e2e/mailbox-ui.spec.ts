import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {test,expect} from '@playwright/test';
import {openDecorate,worldPoint} from './root-polish-helpers';
import {readPersistedLocalData} from './helpers/persistence';
import type {Page} from '@playwright/test';
const mailbox=(page:import('@playwright/test').Page)=>page.getByRole('dialog',{name:'Buzón',exact:true});
async function placeMailbox(page:import('@playwright/test').Page){const editor=await openDecorate(page);await editor.getByRole('button',{name:'Colocar Buzón',exact:true}).click();await page.mouse.click(...await worldPoint(page,320,230));await page.getByRole('group',{name:'Decorar habitación',exact:true}).getByRole('button',{name:'Terminar',exact:true}).click();}
async function openMailbox(page:import('@playwright/test').Page){const editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Buzón'}).dblclick();await expect(mailbox(page)).toBeVisible();await expect(mailbox(page).getByRole('button',{name:'Actualizar',exact:true})).toBeEnabled();}
const passphrase='mailbox-regression-password';
async function identitySettings(page:Page){await page.getByTestId('phone-button').click();await page.getByTestId('phone-identity').click();return page.getByRole('dialog',{name:'Ajustes',exact:true});}
async function saveIdentity(page:Page){const settings=await identitySettings(page);await settings.getByLabel('Contraseña (12+ caracteres)',{exact:true}).fill(passphrase);await settings.getByRole('button',{name:'Cifrar y guardar',exact:true}).click();await expect(page.getByText('Identidad guardada cifrada. Necesitarás esta contraseña al reiniciar.',{exact:true}).first()).toBeVisible();return settings;}
async function exportIdentity(page:Page){const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exportar identidad cifrada',exact:true}).click()]);const stream=await download.createReadStream(),parts:Buffer[]=[];for await(const chunk of stream!)parts.push(Buffer.from(chunk));return Buffer.concat(parts);}
async function importIdentity(page:Page,file:Buffer){const settings=await identitySettings(page),fingerprint=JSON.parse(file.toString()).identity.publicIdentity.fingerprint;await settings.getByLabel('Copia cifrada de identidad',{exact:true}).setInputFiles({name:'identity.json',mimeType:'application/json',buffer:file});await expect(settings.getByRole('status').filter({hasText:fingerprint})).toBeVisible();await settings.getByLabel('Contraseña de la copia',{exact:true}).fill(passphrase);await settings.getByRole('button',{name:'Importar y usar esta identidad',exact:true}).click();await expect.poll(async()=>(await readPersistedLocalData(page)).encryptedIdentity?.publicIdentity.fingerprint).toBe(fingerprint);await settings.getByRole('button',{name:'Cerrar',exact:true}).click();}
async function leaveNote(page:Page,text:string){await mailbox(page).getByLabel('Escribe una nota',{exact:true}).fill(text);await mailbox(page).getByRole('button',{name:'Dejar nota',exact:true}).click();await expect(mailbox(page).getByText(text,{exact:true})).toBeVisible();}
for(const profile of [{name:'desktop',width:1440,height:1000,touch:false},{name:'phone',width:390,height:844,touch:true}]){
 test.describe(profile.name,()=>{test.use({viewport:{width:profile.width,height:profile.height},hasTouch:profile.touch,isMobile:profile.touch});
  test('physical mailbox limits active notes to five and preserves them after reload',async({page},info)=>{
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await placeMailbox(page);await openMailbox(page);const box=mailbox(page),input=box.getByLabel('Escribe una nota',{exact:true}),send=box.getByRole('button',{name:'Dejar nota',exact:true});
   for(let n=1;n<=5;n++){await input.fill(`Nota ${n}`);await send.click();await expect(box.locator('.sv-mailbox-note')).toHaveCount(n);await expect(input).toBeEnabled();}
   await input.fill('Sexta nota');await expect(send).toBeDisabled();await box.getByRole('button',{name:'Retirar nota',exact:true}).first().click();await expect(box.locator('.sv-mailbox-note')).toHaveCount(4);await expect(send).toBeEnabled();await send.click();await expect(box.locator('.sv-mailbox-note')).toHaveCount(5);await expect(box.getByText('Sexta nota',{exact:true})).toBeVisible();
   expect(await box.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:info.outputPath(`mailbox-${profile.name}.png`)});await box.getByRole('button',{name:'Cerrar',exact:true}).click();await page.reload();await openMailbox(page);await expect(box.locator('.sv-mailbox-note')).toHaveCount(5);await expect(box.getByText('Sexta nota',{exact:true})).toBeVisible();await expect(send).toBeDisabled();expect(errors).toEqual([]);
  });
 });
}
test('the outdoor mailbox opens by approaching it and pressing E',async({page})=>{
 await page.goto('/');await page.getByTestId('phone-button').click();await openPhoneApp(page,'garden');const tray=page.locator('.sv-garden-tray');await tray.getByRole('button',{name:'Buzón',exact:true}).click();await page.mouse.click(...await worldPoint(page,64,160));await expect(tray.locator('.sv-garden-count')).toContainText('1/16');await tray.getByRole('button',{name:'Terminar',exact:true}).click();await expect(tray).toBeHidden();
 await page.mouse.dblclick(...await worldPoint(page,64,150));await expect(mailbox(page)).toBeVisible({timeout:15000});await mailbox(page).getByLabel('Escribe una nota',{exact:true}).fill('Nota exterior');await mailbox(page).getByRole('button',{name:'Dejar nota',exact:true}).click();await expect(mailbox(page).getByText('Nota exterior',{exact:true})).toBeVisible();await mailbox(page).getByRole('button',{name:'Cerrar',exact:true}).click();await page.keyboard.press('e');await expect(mailbox(page)).toBeVisible();await expect(mailbox(page).getByText('Nota exterior',{exact:true})).toBeVisible();
});

test('local notes survive saving the identity, reload and unlocking without exposing a locked inbox',async({page})=>{
 await page.goto('/');await placeMailbox(page);await openMailbox(page);await leaveNote(page,'Before saving identity');await mailbox(page).getByRole('button',{name:'Cerrar',exact:true}).click();
 const settings=await saveIdentity(page);await settings.getByRole('button',{name:'Cerrar',exact:true}).click();await page.reload();await openMailbox(page);await expect(mailbox(page).locator('.sv-mailbox-note')).toHaveCount(0);await expect(mailbox(page).getByRole('alert')).toHaveText('Desbloquea tu identidad guardada para abrir el buzón.');await mailbox(page).getByRole('button',{name:'Cerrar',exact:true}).click();
 const locked=await identitySettings(page);await locked.getByRole('button',{name:'Desbloquear identidad',exact:true}).click();const card=page.locator('.sv-lock-card');await card.getByLabel('Contraseña',{exact:true}).fill(passphrase);await card.getByRole('button',{name:'Desbloquear identidad',exact:true}).click();await expect(card).toBeHidden();await openMailbox(page);await expect(mailbox(page).getByText('Before saving identity',{exact:true})).toBeVisible();await expect(mailbox(page).locator('.sv-mailbox-count')).toContainText('1 de 5');
});

test('importing another saved identity keeps each private mailbox separate',async({page,browser})=>{
 test.setTimeout(90000);const second=await browser.newContext();try{
  const otherPage=await second.newPage();await otherPage.goto('/');await saveIdentity(otherPage);const otherIdentity=await exportIdentity(otherPage);
  await page.goto('/');await placeMailbox(page);await openMailbox(page);await leaveNote(page,'Only original owner');await mailbox(page).getByRole('button',{name:'Cerrar',exact:true}).click();const settings=await saveIdentity(page),original=await exportIdentity(page);await settings.getByRole('button',{name:'Cerrar',exact:true}).click();
  await openMailbox(page);await expect(mailbox(page).getByText('Only original owner',{exact:true})).toBeVisible();await mailbox(page).getByRole('button',{name:'Cerrar',exact:true}).click();
  await importIdentity(page,otherIdentity);await openMailbox(page);await expect(mailbox(page).locator('.sv-mailbox-note')).toHaveCount(0);await leaveNote(page,'Only second owner');await mailbox(page).getByRole('button',{name:'Cerrar',exact:true}).click();
  await importIdentity(page,original);await openMailbox(page);await expect(mailbox(page).getByText('Only original owner',{exact:true})).toBeVisible();await expect(mailbox(page).getByText('Only second owner',{exact:true})).toHaveCount(0);
 }finally{await second.close();}
});

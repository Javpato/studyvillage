import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {test,expect,type Page,type Browser,type BrowserContext} from '@playwright/test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {build} from 'rolldown';

// Real browser clients and real authority; the server bundle is temporary, never production dist.
let directory='',bundle='';
test.beforeAll(async()=>{directory=mkdtempSync(join(tmpdir(),'sv-access-ui-'));bundle=join(directory,'server.mjs');await build({input:resolve('server/src/main.ts'),platform:'node',external:[/^node:/],output:{file:bundle,format:'esm'},logLevel:'warn'});});
test.afterAll(()=>{if(directory)rmSync(directory,{recursive:true,force:true});});
async function phone(page:Page,app:string){if(await page.locator('.sv-phone').isHidden())await page.getByTestId('phone-button').click();else if(await page.locator('.sv-phone-head [aria-label="Volver"]').isVisible())await page.locator('.sv-phone-head [aria-label="Volver"]').click();await openPhoneApp(page,app);}
async function person(browser:Browser,contexts:BrowserContext[],name:string,mobile=false){const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});contexts.push(context);const page=await context.newPage();await page.goto('/');await phone(page,'settings');const settings=page.getByRole('dialog',{name:'Ajustes',exact:true});await settings.getByLabel('Nombre visible',{exact:true}).fill(name);await settings.getByRole('button',{name:'Guardar perfil',exact:true}).click();await settings.getByRole('button',{name:'Cerrar',exact:true}).click();return page;}
for(const mode of ['server','temporary'] as const)for(const mobile of [false,true])test(`one pending access, explicit cancellation and decisions in ${mode} on ${mobile?'phone':'desktop'}`,async({browser})=>{
 test.skip(mode==='temporary'&&!process.env.STUDYVILLAGE_LIVE,'real PeerJS signaling is opt-in');test.setTimeout(120_000);
 const contexts:BrowserContext[]=[];let server:ChildProcess|undefined;
 try{
  const owner=await person(browser,contexts,'Door owner'),guest=await person(browser,contexts,'Door guest',mobile);
  await phone(owner,'rooms');const ownerRooms=owner.getByRole('dialog',{name:'Plantas y habitaciones',exact:true});
  await ownerRooms.getByRole('button',{name:'Añadir habitación',exact:true}).click();await ownerRooms.getByLabel('Nombre de la habitación',{exact:true}).fill('Math');await ownerRooms.getByLabel('Nombre de la habitación',{exact:true}).press('Tab');
  await ownerRooms.getByRole('button',{name:'Añadir habitación',exact:true}).click();await ownerRooms.getByLabel('Nombre de la habitación',{exact:true}).nth(1).fill('Door lab 42');await ownerRooms.getByLabel('Nombre de la habitación',{exact:true}).nth(1).press('Tab');
  await ownerRooms.getByLabel('Acceso de la casa',{exact:true}).selectOption('ask');await ownerRooms.getByRole('button',{name:'Cerrar',exact:true}).click();
  if(mode==='temporary'){
   await phone(owner,'village');await owner.getByRole('button',{name:'Abrir mi aldea a otras personas',exact:true}).click();const invitation=owner.getByLabel('Invitación actual',{exact:true});await expect(invitation).not.toHaveValue('',{timeout:30_000});
   await phone(guest,'village');await guest.getByPlaceholder('Pega una invitación').fill(await invitation.inputValue());await guest.getByRole('button',{name:'Unirme',exact:true}).click();await owner.locator('.sv-hud-card').getByRole('button',{name:'Permitir',exact:true}).click({timeout:30_000});await expect(guest.locator('.sv-status-pill')).toHaveText(/en la aldea/,{timeout:30_000});await owner.keyboard.press('Escape');await guest.keyboard.press('Escape');
  }else{
   const port=26000+Math.floor(Math.random()*2000),secret='access-e2e-install-secret';
   await new Promise<void>((done,fail)=>{server=spawn(process.execPath,[bundle],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:join(directory,`world-${mobile}`),CLAIM_SECRET:secret,WORLD_NAME:'Access E2E',ALLOWED_ORIGINS:'*'},stdio:['ignore','pipe','pipe']});server.stdout!.on('data',data=>{if(String(data).includes('Listening'))done();});server.on('error',fail);server.on('exit',code=>{if(code)fail(new Error(`Test server exited ${code}`));});});
   await phone(owner,'settings');const settings=owner.getByRole('dialog',{name:'Ajustes',exact:true});await settings.getByRole('tab',{name:'Identidad',exact:true}).click();await settings.getByLabel('Contraseña (12+ caracteres)',{exact:true}).fill('access-request-password-2026');await settings.getByRole('button',{name:'Cifrar y guardar',exact:true}).click();await expect(owner.getByText(/Identidad guardada cifrada/).first()).toBeVisible();
   await settings.getByRole('tab',{name:'Servidores',exact:true}).click();await settings.getByLabel('Dirección del servidor',{exact:true}).fill(`http://127.0.0.1:${port}`);await settings.getByRole('button',{name:'Comprobar',exact:true}).click();await settings.getByLabel('Secreto de instalación',{exact:true}).fill(secret);await settings.getByRole('button',{name:'Conectar',exact:true}).click();await expect(settings.getByText(/Access E2E · Administración/)).toBeVisible();
   await settings.getByRole('button',{name:'Importar mi casa y pizarras',exact:true}).click();await expect(settings.getByRole('button',{name:'Volver a importar mi casa y pizarras',exact:true})).toBeVisible();await settings.getByText('Administrar servidor',{exact:true}).click();await settings.getByRole('button',{name:'Crear invitación privada',exact:true}).click();const invitation=(await settings.getByLabel('Invitación creada',{exact:true}).inputValue()).split('\n')[1].split(': ')[1].trim();await settings.getByRole('button',{name:'Cerrar',exact:true}).click();
   await phone(guest,'settings');const guestSettings=guest.getByRole('dialog',{name:'Ajustes',exact:true});await guestSettings.getByRole('tab',{name:'Servidores',exact:true}).click();await guestSettings.getByLabel('Dirección del servidor',{exact:true}).fill(`http://127.0.0.1:${port}`);await guestSettings.getByLabel('Invitación del servidor',{exact:true}).fill(invitation);await guestSettings.getByRole('button',{name:'Conectar',exact:true}).click();await expect(guestSettings.getByText(/Visitante · Barrio 1 de 1 · 2\/6/)).toBeVisible();await guestSettings.getByRole('button',{name:'Cerrar',exact:true}).click();
  }
  const pending=guest.locator('.sv-access-pending'),approvals=owner.locator('.sv-approval-list');
  const visit=async()=>{await phone(guest,'village');await guest.locator('.sv-house-row').filter({hasText:'Door owner'}).click();await guest.keyboard.press('Escape');};
  await visit();await expect(pending).toBeVisible();await expect(approvals.getByRole('button',{name:'Permitir',exact:true})).toHaveCount(1);
  await visit();await phone(guest,'house');await guest.keyboard.press('Escape');await expect(pending).toBeVisible();await expect(guest.locator('.sv-hud-place h1')).toHaveText('La aldea');await expect(approvals.getByRole('button',{name:'Permitir',exact:true})).toHaveCount(1);
  await pending.getByRole('button',{name:'Cancelar solicitud',exact:true}).click();await expect(pending).toBeHidden();await expect(approvals.getByRole('button',{name:'Permitir',exact:true})).toHaveCount(0);
  await visit();await approvals.getByRole('button',{name:'Rechazar',exact:true}).click();await expect(pending).toBeHidden();
  await visit();await approvals.getByRole('button',{name:'Permitir',exact:true}).click();await expect(pending).toBeHidden();await expect(guest.locator('.sv-hud-place h1')).toHaveText('Mi rincón de estudio');
  await phone(guest,'rooms');const rooms=guest.getByRole('dialog',{name:'Plantas y habitaciones',exact:true});const floor=rooms.getByRole('button',{name:'Entrar a la planta',exact:true}),room=rooms.getByRole('button',{name:'Entrar a la habitación',exact:true});
  await floor.click();await expect(floor).toBeDisabled();await expect(room.first()).toBeDisabled();await expect(room.nth(1)).toBeDisabled();await rooms.getByRole('button',{name:'Cancelar solicitud',exact:true}).click();await expect(floor).toBeEnabled();await expect(approvals.getByRole('button',{name:'Permitir',exact:true})).toHaveCount(0);
  await floor.click();await approvals.getByRole('button',{name:'Permitir',exact:true}).click();await expect(floor).toBeEnabled();await rooms.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(guest.locator('.sv-hud-place h1')).toHaveText('Planta baja');
  await phone(guest,'rooms');await room.first().click();await expect(room.nth(1)).toBeDisabled();await rooms.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(pending).toBeVisible();
  await approvals.getByRole('button',{name:'Rechazar',exact:true}).click();await expect(pending).toBeHidden();await phone(guest,'rooms');await room.nth(1).click();await approvals.getByRole('button',{name:'Permitir',exact:true}).click();await rooms.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(guest.locator('.sv-hud-place h1')).toHaveText('Door lab 42');await expect(pending).toBeHidden();
 }finally{await Promise.all(contexts.map(context=>context.close()));if(server&&server.exitCode===null)await new Promise<void>(done=>{server!.once('exit',()=>done());server!.kill('SIGTERM');});}
});

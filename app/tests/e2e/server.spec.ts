import { readPersistedLocalData } from './helpers/persistence';
import { test, expect, type Page, type Browser } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Real self-hosted server (the bundled server/dist/server.mjs) and two separate browsers. */
const BUNDLE = resolve('server/dist/server.mjs');
const SECRET = 'e2e-install-secret-0123456789';
const PASS = 'clave-larga-de-prueba-2026';
let server: ChildProcess | null = null; let dataDir = ''; let port = 0;

function start(): Promise<void> {
  return new Promise((done, fail) => {
    server = spawn(process.execPath, [BUNDLE], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, CLAIM_SECRET: SECRET, WORLD_NAME: 'Aldea E2E', ALLOWED_ORIGINS: '*' }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout!.on('data', chunk => { if (String(chunk).includes('Listening')) done(); });
    server.on('exit', code => { if (code) fail(new Error(`server exited ${code}`)); });
  });
}
function stop(): Promise<void> { return new Promise(done => { if (!server) { done(); return; } server.once('exit', () => done()); server.kill('SIGTERM'); server = null; }); }

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  test.skip(!existsSync(BUNDLE), 'Run npm run server:build first');
  dataDir = mkdtempSync(join(tmpdir(), 'sv-e2e-server-')); port = 18000 + Math.floor(Math.random() * 2000);
  await start();
});
test.afterAll(async () => { await stop(); if (dataDir) rmSync(dataDir, { recursive: true, force: true }); });

async function settings(page: Page, tab: string) {
  await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-settings').click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await dialog.getByRole('tab', { name: tab, exact: true }).click();
  return dialog;
}
async function newPerson(browser: Browser) { const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await context.newPage(); await page.goto('/'); return { context, page }; }

test('owner claims the server, invites a temporary visitor, grows capacity, leaves, and the world survives a restart', async ({ browser }) => {
  const admin = await newPerson(browser);
  let dialog = await settings(admin.page, 'Identidad');
  await dialog.getByLabel('Contraseña (12+ caracteres)').fill(PASS);
  await dialog.getByRole('button', { name: 'Cifrar y guardar' }).click();
  await expect(admin.page.getByText(/Identidad guardada cifrada/).first()).toBeVisible({ timeout: 15_000 });

  await dialog.getByRole('tab', { name: 'Servidores', exact: true }).click();
  await dialog.getByLabel('Dirección del servidor').fill(`http://127.0.0.1:${port}`);
  await dialog.getByRole('button', { name: 'Comprobar' }).click();
  await expect(dialog.getByText('Aldea E2E: compatible · 0/6 conectadas')).toBeVisible();
  await dialog.getByLabel('Secreto de instalación', { exact: true }).fill(SECRET);
  await dialog.getByRole('button', { name: 'Conectar' }).click();
  await expect(dialog.getByText('Aldea E2E · Administración · Barrio 1 de 1 · 1/6 conectadas')).toBeVisible({ timeout: 15_000 });

  // Diagnostics must preserve the live authenticated server connection.
  await dialog.getByRole('tab', {name:'Controles',exact:true}).click();
  await dialog.getByRole('link', {name:'Diagnóstico de micrófono y pantalla'}).click();
  await expect(admin.page.getByText('COMPROBACIONES LOCALES',{exact:true})).toBeVisible();
  dialog = await settings(admin.page, 'Servidores');
  await expect(dialog.getByText('Aldea E2E · Administración · Barrio 1 de 1 · 1/6 conectadas')).toBeVisible();

  await dialog.getByText('Administrar servidor').click();
  await dialog.getByLabel('Nombre de la invitación').fill('clase');
  await dialog.getByRole('button', { name: 'Crear invitación privada' }).click();
  const invite = (await dialog.getByLabel('Invitación creada').inputValue()).split('\n')[1].split(': ')[1].trim();
  expect(invite).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  await expect(dialog.locator('.sv-servers-invites li')).toContainText(['clase · 0/10 usos']);

  // A temporary identity enters as a visitor.
  const guest = await newPerson(browser);
  const guestDialog = await settings(guest.page, 'Servidores');
  await guestDialog.getByLabel('Dirección del servidor').fill(`http://127.0.0.1:${port}`);
  await guestDialog.getByLabel('Invitación del servidor').fill(invite);
  await guestDialog.getByRole('button', { name: 'Conectar' }).click();
  await expect(guestDialog.getByText(/Visitante · Barrio 1 de 1 · 2\/6 conectadas/)).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText(/Administración · Barrio 1 de 1 · 2\/6 conectadas/)).toBeVisible();

  // Ten people need two neighbourhoods.
  await dialog.getByRole('spinbutton', { name: 'Personas conectadas a la vez' }).fill('10');
  await expect(dialog.getByText(/Necesita 2 barrio\(s\)/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Guardar capacidad' }).click();
  await expect(dialog.getByText(/Barrio 1 de 2 · 2\/10 conectadas/)).toBeVisible();
  await expect(guestDialog.getByRole('button', { name: 'Barrio 2 →' })).toBeVisible();

  // A party invite requires acceptance, and the channel appears in both clients.
  for (const person of [admin, guest]) {
    await person.page.keyboard.press('Escape'); await person.page.keyboard.press('Escape');
    await person.page.getByTestId('phone-button').click(); await person.page.getByTestId('phone-voice').click();
  }
  const adminVoice = admin.page.locator('.sv-voice-channels');
  const guestVoice = guest.page.locator('.sv-voice-channels');
  await adminVoice.locator('summary', { hasText: 'Crear grupo' }).click();
  await adminVoice.getByLabel('Nombre del grupo').fill('Study friends');
  await adminVoice.getByRole('button', { name: 'Crear grupo', exact: true }).click();
  await expect(adminVoice.getByText('Grupo: Study friends', { exact: true })).toBeVisible();
  await adminVoice.locator('summary', { hasText: 'Invitar al grupo' }).click();
  await adminVoice.locator('summary', { hasText: 'Invitar al grupo' }).locator('..').getByRole('button').first().click();
  await expect(guestVoice.getByText(/te invita a Study friends/)).toBeVisible();
  await guestVoice.getByRole('button', { name: 'Aceptar', exact: true }).click();
  await expect(guestVoice.getByText('Grupo: Study friends', { exact: true })).toBeVisible();
  await guest.page.keyboard.press('Escape');
  const restoredGuestDialog = await settings(guest.page, 'Servidores');
  await expect(restoredGuestDialog.getByText(/Visitante · Barrio 1 de 2/)).toBeVisible();

  // The administrator leaves; the visitor stays in a working world.
  await admin.context.close();
  await expect(guestDialog.getByText(/Visitante · Barrio 1 de 2 · 1\/10 conectadas/)).toBeVisible({ timeout: 15_000 });
  // Walking off the right edge leads to the neighbouring neighbourhood.
  await guestDialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
  await guest.page.bringToFront();
  await guest.page.locator('.sv-stage-pane canvas').focus();
  await guest.page.keyboard.down('Shift'); await guest.page.keyboard.down('d');
  await expect(guest.page.locator('.sv-notice')).toContainText('Barrio 2', { timeout: 10_000 });
  await guest.page.keyboard.up('d'); await guest.page.keyboard.up('Shift');
  const again = await settings(guest.page, 'Servidores');
  await expect(again.getByText(/Visitante · Barrio 2 de 2/)).toBeVisible();

  // Restart: the visitor reconnects on its own; capacity and neighbourhoods persist.
  await stop(); await start();
  await expect(again.getByText(/Visitante · Barrio \d de 2 · 1\/10 conectadas/)).toBeVisible({ timeout: 30_000 });
  await guest.context.close();
});

test('in my own house I can clear a guest\'s layer from the layers panel', async ({ browser }) => {
  // A fresh claimable world for this test.
  await stop(); rmSync(dataDir, { recursive: true, force: true }); dataDir = mkdtempSync(join(tmpdir(), 'sv-e2e-server-')); await start();
  const owner = await newPerson(browser);
  let dialog = await settings(owner.page, 'Identidad');
  await dialog.getByLabel('Contraseña (12+ caracteres)').fill(PASS);
  await dialog.getByRole('button', { name: 'Cifrar y guardar' }).click();
  await expect(owner.page.getByText(/Identidad guardada cifrada/).first()).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('tab', { name: 'Servidores', exact: true }).click();
  await dialog.getByLabel('Dirección del servidor').fill(`http://127.0.0.1:${port}`);
  await dialog.getByRole('button', { name: 'Comprobar' }).click();
  await dialog.getByLabel('Secreto de instalación', { exact: true }).fill(SECRET);
  await dialog.getByRole('button', { name: 'Conectar' }).click();
  await expect(dialog.getByText(/Administración/)).toBeVisible({ timeout: 15_000 });
  await dialog.getByText('Administrar servidor').click();
  await dialog.getByRole('button', { name: 'Crear invitación privada' }).click();
  const invite = (await dialog.getByLabel('Invitación creada').inputValue()).split('\n')[1].split(': ')[1].trim();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();

  const guest = await newPerson(browser);
  const guestDialog = await settings(guest.page, 'Servidores');
  await guestDialog.getByLabel('Dirección del servidor').fill(`http://127.0.0.1:${port}`);
  await guestDialog.getByLabel('Invitación del servidor').fill(invite);
  await guestDialog.getByRole('button', { name: 'Conectar' }).click();
  await expect(guestDialog.getByText(/Visitante/)).toBeVisible({ timeout: 15_000 });
  await guestDialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();

  // The owner goes home; the guest knocks on the owner's door (plot 1) and is let in.
  await owner.page.getByTestId('phone-button').click(); await owner.page.getByTestId('phone-house').click();
  // Private floors work before an explicit import of the local lobby boards.
  await owner.page.getByTestId('phone-button').click();await owner.page.getByTestId('phone-rooms').click();
  const rooms=owner.page.getByRole('dialog',{name:'Plantas y habitaciones'});
  await rooms.getByRole('button',{name:'Añadir habitación',exact:true}).click();
  await rooms.getByRole('button',{name:'Entrar a la planta',exact:true}).click();
  await rooms.getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(owner.page.locator('.sv-hud-place h1')).toHaveText('Planta baja');
  await owner.page.keyboard.press('Escape');
  const stage = guest.page.locator('.sv-stage-pane canvas'); let box = (await stage.boundingBox())!;
  await stage.dblclick({ position: { x: box.width * 104 / 768, y: box.height * 75 / 432 } });
  await owner.page.getByTestId('phone-button').click(); await owner.page.getByTestId('phone-village').click();
  await owner.page.getByRole('button', { name: 'Permitir' }).click({ timeout: 15_000 });
  await owner.page.keyboard.press('Escape');
  await expect(guest.page.locator('.sv-hud-place h1')).not.toHaveText('La aldea', { timeout: 15_000 });

  // Both open the owner's whiteboard; the guest draws.
  box = (await stage.boundingBox())!;
  await stage.dblclick({ position: { x: box.width * 373 / 768, y: box.height * 109 / 432 } });
  await owner.page.getByTestId('phone-button').click(); await owner.page.getByTestId('phone-decorate').click();
  if (!await owner.page.locator('.sv-house-editor > details').evaluate(el => (el as HTMLDetailsElement).open)) await owner.page.locator('.sv-house-editor > details > summary').click();
  await owner.page.locator('.sv-furniture-item', { hasText: 'Pizarra' }).first().dblclick();
  const canvas = guest.page.getByLabel('Pizarra para dibujar');
  await expect(canvas).toBeVisible({timeout:15_000});
  const c = (await canvas.boundingBox())!;
  await guest.page.mouse.move(c.x + c.width * .3, c.y + c.height * .4); await guest.page.mouse.down();
  await guest.page.mouse.move(c.x + c.width * .6, c.y + c.height * .5, { steps: 8 }); await guest.page.mouse.up();
  await expect(guest.page.getByText('1 trazos en esta pizarra')).toBeAttached();
  await expect(owner.page.getByText('1 trazos en esta pizarra')).toBeAttached({ timeout: 15_000 });

  // The guest cannot clear the owner's layers (no button); the owner can clear the guest's.
  await owner.page.getByRole('button', { name: 'Opciones avanzadas', exact: true }).click();
  await owner.page.locator('.sv-board-category > summary', { hasText: 'Capas' }).click();
  // The layer shows the guest's name, not their identity code.
  await expect(owner.page.locator('.sv-layer').filter({ hasText: 'Explorador' })).toHaveCount(1);
  await owner.page.getByRole('button', { name: /Borrar la capa de/ }).click();
  await expect(owner.page.getByText('0 trazos en esta pizarra')).toBeAttached();
  await expect(guest.page.getByText('0 trazos en esta pizarra')).toBeAttached({ timeout: 15_000 });
  await guest.page.getByRole('button', { name: 'Opciones avanzadas', exact: true }).click();
  await expect(guest.page.getByRole('button', { name: /Borrar la capa de/ })).toHaveCount(0);
  await owner.context.close(); await guest.context.close();
});

test('friend lists saved in the phone allow offline-owner room entry after a server restart',async({browser})=>{
 await stop();rmSync(dataDir,{recursive:true,force:true});dataDir=mkdtempSync(join(tmpdir(),'sv-e2e-server-'));await start();
 const guest=await newPerson(browser);let guestDialog=await settings(guest.page,'Identidad');
 await guestDialog.getByLabel('Contraseña (12+ caracteres)').fill(PASS);await guestDialog.getByRole('button',{name:'Cifrar y guardar'}).click();
 await expect(guest.page.getByText(/Identidad guardada cifrada/).first()).toBeVisible();
 const identity=(await readPersistedLocalData(guest.page)).encryptedIdentity!.publicIdentity;
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 // Deliberate legacy fixture: startup must adopt this once into canonical IndexedDB.
 await context.addInitScript(identity=>{if(!localStorage.getItem('studyvillage-local-sync'))localStorage.setItem('studyvillage-local-sync',JSON.stringify({schemaVersion:1,profile:{displayName:'Owner',color:'#df8a72'},house:null,friendCode:'owner-code',contacts:[{schemaVersion:1,identity,friendCode:'guest-code'}],encryptedIdentity:null,editor:'',projectLinks:{}}));},identity);
 const page=await context.newPage();await page.goto('/');let dialog=await settings(page,'Identidad');
 await dialog.getByLabel('Contraseña (12+ caracteres)').fill(PASS);await dialog.getByRole('button',{name:'Cifrar y guardar'}).click();await expect(page.getByText(/Identidad guardada cifrada/).first()).toBeVisible();
 await dialog.getByRole('tab',{name:'Servidores',exact:true}).click();await dialog.getByLabel('Dirección del servidor').fill(`http://127.0.0.1:${port}`);await dialog.getByRole('button',{name:'Comprobar'}).click();await dialog.getByLabel('Secreto de instalación',{exact:true}).fill(SECRET);await dialog.getByRole('button',{name:'Conectar'}).click();await expect(dialog.getByText(/Administración/)).toBeVisible();
 await dialog.getByText('Administrar servidor').click();await dialog.getByRole('button',{name:'Crear invitación privada'}).click();const invite=(await dialog.getByLabel('Invitación creada').inputValue()).split('\n')[1].split(': ')[1].trim();await dialog.getByRole('button',{name:'Cerrar',exact:true}).first().click();
 await guestDialog.getByRole('tab',{name:'Servidores',exact:true}).click();await guestDialog.getByLabel('Dirección del servidor').fill(`http://127.0.0.1:${port}`);await guestDialog.getByLabel('Invitación del servidor').fill(invite);await guestDialog.getByRole('button',{name:'Conectar'}).click();await expect(guestDialog.getByText(/Residente/)).toBeVisible();
 await guestDialog.getByRole('button',{name:'Cerrar',exact:true}).first().click();
 await guest.page.getByTestId('phone-button').click();await guest.page.getByTestId('phone-contacts').click();
 await guest.page.getByRole('button',{name:'Añadir a Owner a contactos',exact:true}).click();
 const nickname=guest.page.getByLabel('Apodo de Owner',{exact:true});await nickname.fill('Study buddy');await nickname.press('Tab');
 await expect(guest.page.locator('.sv-contact-list strong')).toHaveText('Study buddy');
 await expect.poll(async()=>(await readPersistedLocalData(guest.page)).contacts.some(c=>c.nickname==='Study buddy'&&!c.friendCode)).toBe(true);
 await guest.page.keyboard.press('Escape');guestDialog=await settings(guest.page,'Servidores');
 await page.getByTestId('phone-button').click();await page.getByTestId('phone-rooms').click();const rooms=page.getByRole('dialog',{name:'Plantas y habitaciones'});
 await rooms.getByRole('button',{name:'Añadir habitación',exact:true}).click();await expect(rooms.getByRole('status')).toContainText('Guardado en el servidor');
 // Importing a legacy house with no house allowlist must still sign valid JSON.
 await rooms.getByRole('button',{name:'Cerrar',exact:true}).click();
 dialog=await settings(page,'Servidores');await dialog.getByRole('button',{name:'Volver a importar mi casa y pizarras',exact:true}).click();
 await expect(page.locator('.sv-notice')).toContainText('Copiados tu casa');await dialog.getByRole('button',{name:'Cerrar',exact:true}).first().click();
 await page.getByTestId('phone-button').click();await page.getByTestId('phone-rooms').click();
 await rooms.getByLabel('Acceso de la casa',{exact:true}).selectOption('locked');await expect(rooms.getByLabel('Acceso de la casa',{exact:true})).toBeEnabled();
 await rooms.locator('.sv-space-home summary').click();await rooms.locator('.sv-space-home').getByRole('checkbox').check();await expect(rooms.locator('.sv-space-home').getByRole('checkbox')).toBeEnabled();
 await rooms.locator('.sv-space-room summary').click();await rooms.locator('.sv-space-room').getByRole('checkbox').check();await expect(rooms.getByRole('status')).toContainText('Guardado en el servidor');await expect(rooms.locator('.sv-space-room').getByRole('checkbox')).toBeEnabled();
 await context.close();await stop();await start();await expect(guestDialog.getByText(/Residente.*1\/6 conectadas/)).toBeVisible({timeout:30000});await guestDialog.getByRole('button',{name:'Cerrar',exact:true}).first().click();
 const stage=guest.page.locator('.sv-stage-pane canvas');const box=(await stage.boundingBox())!;await stage.dblclick({position:{x:box.width*104/768,y:box.height*75/432}});
 await expect(guest.page.locator('.sv-hud-place h1')).toHaveText('Mi rincón de estudio',{timeout:15000});
 await guest.page.getByTestId('phone-button').click();await guest.page.getByTestId('phone-rooms').click();const guestRooms=guest.page.getByRole('dialog',{name:'Plantas y habitaciones'});
 await guestRooms.getByRole('button',{name:'Entrar a la habitación',exact:true}).click();await guestRooms.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(guest.page.locator('.sv-hud-place h1')).toHaveText('Habitación 1');
 await guest.context.close();
});


test('a saved custom avatar is transferred and rendered by a second server client',async({browser})=>{
 test.setTimeout(60000);
 await stop();rmSync(dataDir,{recursive:true,force:true});dataDir=mkdtempSync(join(tmpdir(),'sv-e2e-server-'));await start();
 const owner=await newPerson(browser),png=readFileSync(resolve('app/public/sprites/avatar-template.png'));
 const guestContext=await browser.newContext({viewport:{width:1280,height:900}});
 const expected='data:image/png;base64,'+png.toString('base64');
 await guestContext.addInitScript(expected=>{
  const original=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(this:CanvasRenderingContext2D,...args:unknown[]){
   Reflect.apply(original,this,args);
   const source=args[0];if(source instanceof HTMLImageElement&&source.src===expected&&this.canvas instanceof HTMLCanvasElement&&this.canvas.matches('.sv-stage-pane canvas'))document.documentElement.dataset.remoteSpriteRendered='true';
  };
 },expected);
 try{
  await owner.page.getByTestId('phone-button').click();await owner.page.getByTestId('phone-house').click();
  const world=owner.page.locator('.sv-stage-pane canvas'),bounds=(await world.boundingBox())!;await world.dblclick({position:{x:bounds.width*644/768,y:bounds.height*182/432}});
  const wardrobe=owner.page.locator('.sv-wardrobe');await expect(wardrobe).toBeVisible();await wardrobe.locator('input[type=file]').setInputFiles({name:'custom-avatar.png',mimeType:'image/png',buffer:png});await expect(wardrobe.getByRole('button',{name:'Guardar look',exact:true})).toBeEnabled();await wardrobe.getByRole('button',{name:'Guardar look',exact:true}).click();await expect(wardrobe).toBeHidden();
  await owner.page.getByTestId('phone-button').click();await owner.page.getByTestId('phone-house').click();await expect(owner.page.locator('.sv-hud-place h1')).toHaveText('La aldea');
  const dialog=await settings(owner.page,'Identidad');await dialog.getByLabel('Contraseña (12+ caracteres)').fill(PASS);await dialog.getByRole('button',{name:'Cifrar y guardar'}).click();await expect(owner.page.getByText(/Identidad guardada cifrada/).first()).toBeVisible();
  await dialog.getByRole('tab',{name:'Servidores',exact:true}).click();await dialog.getByLabel('Dirección del servidor').fill(`http://127.0.0.1:${port}`);await dialog.getByRole('button',{name:'Comprobar'}).click();await dialog.getByLabel('Secreto de instalación',{exact:true}).fill(SECRET);await dialog.getByRole('button',{name:'Conectar'}).click();await expect(dialog.getByText(/Administración.*1\/6 conectadas/)).toBeVisible();await dialog.getByText('Administrar servidor').click();await dialog.getByRole('button',{name:'Crear invitación privada'}).click();const invite=(await dialog.getByLabel('Invitación creada').inputValue()).split('\n')[1].split(': ')[1].trim();await dialog.getByRole('button',{name:'Cerrar',exact:true}).first().click();
  const guest=await guestContext.newPage();await guest.goto('/');expect(await guest.locator('html').getAttribute('data-remote-sprite-rendered')).toBeNull();const guestDialog=await settings(guest,'Servidores');await guestDialog.getByLabel('Dirección del servidor').fill(`http://127.0.0.1:${port}`);await guestDialog.getByLabel('Invitación del servidor').fill(invite);await guestDialog.getByRole('button',{name:'Conectar'}).click();await expect(guestDialog.getByText(/Visitante.*2\/6 conectadas/)).toBeVisible();await guestDialog.getByRole('button',{name:'Cerrar',exact:true}).first().click();
  await expect(guest.locator('.sv-stage-pane canvas')).toHaveAttribute('aria-label',/Explorador.*Explorador/);await expect(guest.locator('html')).toHaveAttribute('data-remote-sprite-rendered','true',{timeout:20000});expect(await guest.evaluate(()=>localStorage.getItem('studyvillage-avatar-sheet-v1'))).toBeNull();
 }finally{await owner.context.close();await guestContext.close();}
});

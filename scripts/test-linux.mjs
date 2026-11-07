import {openPhoneApp} from './phone-ui.mjs';
import { _electron as electron, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const executablePath = path.resolve(process.env.SV_DESKTOP_EXECUTABLE||'deliverables/linux-current/linux-unpacked/studyvillage');
const directory = mkdtempSync(path.join(tmpdir(), 'studyvillage-linux-test-'));
const apps = [];
async function launch(name) {
  const data = path.join(directory, name);mkdirSync(path.join(data, 'localstorage'), { recursive: true });
  const old = new DatabaseSync(path.join(data, 'localstorage/tauri_localhost_0.localstorage'));
  old.exec('CREATE TABLE ItemTable (key TEXT UNIQUE,value BLOB)');
  old.prepare('INSERT INTO ItemTable VALUES(?,?)').run('studyvillage-migration-test', Buffer.from('Apuntes 📝', 'utf16le'));old.close();
  const app = await electron.launch({ executablePath, chromiumSandbox:true, args: ['--allow-loopback-in-peer-connection','--add-server=https://saved-server.example.org','--server-name=Synthetic saved server'], env: { ...process.env, STUDYVILLAGE_TEST_DATA_DIR: data } });apps.push(app);
  expect(await app.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox'))).toBe(false);
  const page = await app.firstWindow();await expect(page.getByTestId('phone-button')).toBeVisible();
  const capabilities = await page.evaluate(() => ({ rtc: typeof RTCPeerConnection, secure: isSecureContext, node: typeof window.require, legacy: localStorage.getItem('studyvillage-migration-test') }));
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('studyvillage-servers-v1')||'[]'))).toContainEqual({url:'https://saved-server.example.org',name:'Synthetic saved server'});
  expect(capabilities).toEqual({ rtc: 'function', secure: true, node: 'undefined', legacy: 'Apuntes 📝' });
  expect(await app.evaluate(({ BrowserWindow }) => { const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { sandbox: p.sandbox, isolation: p.contextIsolation, node: p.nodeIntegration }; })).toEqual({ sandbox: true, isolation: true, node: false });
  return { app, page, data };
}
async function phone(page, name) {
  if (await page.locator('.sv-phone').isHidden()) await page.getByTestId('phone-button').click();
  else if (await page.locator('.sv-phone-head [aria-label="Volver"]').isVisible()) await page.locator('.sv-phone-head [aria-label="Volver"]').click();
  await openPhoneApp(page,name);
}
try {
  const host = await launch('host');
  const saved = path.join(directory, 'exported-contact.json');
  await host.app.evaluate(({ session }, filename) => { session.defaultSession.on('will-download', (_event, item) => { globalThis.testSaveOptions = item.getSaveDialogOptions(); item.setSavePath(filename); }); }, saved);
  await phone(host.page, 'contacts');
  await host.page.getByRole('button', { name: '↓ Exportar mi tarjeta', exact: true }).click();
  await expect.poll(() => existsSync(saved)).toBe(true);
  const contact = JSON.parse(readFileSync(saved, 'utf8'));expect(contact.schemaVersion).toBe(1);expect(contact.identity.publicKey).toBeTruthy();expect(contact.privateKey).toBeUndefined();
  expect(await host.app.evaluate(() => globalThis.testSaveOptions.title)).toContain('Guardar archivo');
  console.log('PASS: sandbox, WebRTC API, secure context, legacy import, terminal saved-server profile, real file download and save dialog configuration');
  await host.page.reload();await expect(host.page.getByTestId('phone-button')).toBeVisible();
  expect(await host.page.evaluate(() => localStorage.getItem('studyvillage-migration-test'))).toBe('Apuntes 📝');
  console.log('PASS: restart preserves imported settings and SQLite data');
  await phone(host.page,'ink');
  const notebook=host.page.locator('.sv-notebook');
  const pageOptions=async()=>{
    await notebook.getByRole('button',{name:'Opciones del cuaderno',exact:true}).click();
    await notebook.getByRole('tab',{name:'Página',exact:true}).click();
  };
  await pageOptions();
  const text=notebook.getByLabel('Texto de la página',{exact:true});
  await text.fill('Native notebook — synthetic persistence check');await text.blur();
  await expect(notebook.getByText('Guardado en este dispositivo',{exact:true})).toBeVisible();
  await host.page.reload();await expect(host.page.getByTestId('phone-button')).toBeVisible();
  await host.page.getByTestId('phone-button').click();await expect(host.page.getByTestId('phone-ink')).toBeVisible();
  await host.page.getByTestId('phone-ink').click();await pageOptions();
  await expect(text).toHaveValue('Native notebook — synthetic persistence check');
  console.log('PASS: optional phone shortcut and private notebook content persist in the native application');
  await notebook.locator('.sv-ink-header').getByRole('button',{name:'Cerrar',exact:true}).click();
  if (process.env.STUDYVILLAGE_LIVE === '1') {
    const guest = await launch('guest');
    await phone(host.page, 'village');await host.page.getByRole('button', { name: 'Abrir mi aldea a otras personas' }).click();
    const invite = host.page.getByLabel('Invitación actual', { exact: true });await expect(invite).not.toHaveValue('', { timeout: 30000 });
    await phone(guest.page, 'village');await guest.page.getByPlaceholder('Pega una invitación').fill(await invite.inputValue());await guest.page.getByRole('button', { name: 'Unirme', exact: true }).click();
    await host.page.locator('.sv-hud-card').getByRole('button', { name: 'Permitir', exact: true }).click({ timeout: 30000 });
    await expect(guest.page.locator('.sv-status-pill')).toHaveText(/en la aldea/, { timeout: 30000 });
    console.log('PASS: two packaged Linux clients joined through real PeerJS signaling and WebRTC');
  }
} finally { for (const app of apps.reverse()) await app.close(); rmSync(directory,{recursive:true,force:true}); }

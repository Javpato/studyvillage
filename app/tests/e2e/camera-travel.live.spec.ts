import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { build } from 'rolldown';

test.use({ permissions: ['camera', 'microphone'], launchOptions: {
  executablePath: process.env.CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined),
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
} });

const secret = 'camera-travel-test-install-secret';
let server: ChildProcess | undefined, directory = '', port = 0;
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'sv-camera-travel-'));
  const bundle = join(directory, 'server.mjs');
  await build({ input: resolve('server/src/main.ts'), platform: 'node', external: [/^node:/], output: { file: bundle, format: 'esm' }, logLevel: 'warn' });
  port = 24000 + Math.floor(Math.random() * 2000);
  await new Promise<void>((done, fail) => {
    server = spawn(process.execPath, [bundle], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: join(directory, 'data'), CLAIM_SECRET: secret, WORLD_NAME: 'Cámara E2E', ALLOWED_ORIGINS: '*' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let error = '';
    server.stderr!.on('data', data => { error += data; });
    server.stdout!.on('data', data => { if (String(data).includes('Listening')) done(); });
    server.on('error', fail); server.on('exit', code => { if (code) fail(new Error(`Camera test server exited ${code}: ${error}`)); });
  });
});
test.afterAll(async () => {
  if (server && server.exitCode === null) await new Promise<void>(done => { server!.once('exit', () => done()); server!.kill('SIGTERM'); });
  if (directory) rmSync(directory, { recursive: true, force: true });
});

async function phone(page: Page, app: string) {
  if (await page.locator('.sv-phone').isHidden()) await page.getByTestId('phone-button').click();
  else if (await page.locator('.sv-phone-head [aria-label="Volver"]').isVisible()) await page.locator('.sv-phone-head [aria-label="Volver"]').click();
  await page.getByTestId(`phone-${app}`).click();
}

for (const mode of ['temporary', 'server'] as const) test(`floating camera keeps its original stream across world, house, floor and room travel in ${mode} mode`, async ({ page }) => {
  test.skip(mode === 'temporary' && !process.env.STUDYVILLAGE_LIVE, 'temporary mode uses real PeerJS signaling');
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    type CameraProof = { requests: number; stream: MediaStream | null; frames: number; drawnStream: string | null };
    const proof: CameraProof = { requests: 0, stream: null, frames: 0, drawnStream: null };
    (window as unknown as { cameraTravelProof: CameraProof }).cameraTravelProof = proof;
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (constraints?.video) proof.requests++;
      const stream = await capture(constraints);
      if (constraints?.video) proof.stream = stream;
      return stream;
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(this: CanvasRenderingContext2D, ...args: Parameters<typeof draw>) {
      if (this.canvas.matches('.sv-stage-pane canvas') && args[0] instanceof HTMLVideoElement && args[0].srcObject instanceof MediaStream) {
        proof.frames++; proof.drawnStream = args[0].srcObject.id;
      }
      Reflect.apply(draw, this, args);
    } as typeof draw;
  });
  await page.goto('/');
  if (mode === 'temporary') {
    await phone(page, 'village');
    await page.getByRole('button', { name: 'Abrir mi aldea a otras personas', exact: true }).click();
    await expect(page.getByLabel('Invitación actual', { exact: true })).not.toHaveValue('', { timeout: 30_000 });
    await page.keyboard.press('Escape');
  } else {
    await phone(page, 'settings');
    const settings = page.getByRole('dialog', { name: 'Ajustes', exact: true });
    await settings.getByRole('tab', { name: 'Identidad', exact: true }).click();
    await settings.getByLabel('Contraseña (12+ caracteres)', { exact: true }).fill('camera-travel-password-2026');
    await settings.getByRole('button', { name: 'Cifrar y guardar', exact: true }).click();
    await expect(page.getByText(/Identidad guardada cifrada/).first()).toBeVisible();
    await settings.getByRole('tab', { name: 'Servidores', exact: true }).click();
    await settings.getByLabel('Dirección del servidor', { exact: true }).fill(`http://127.0.0.1:${port}`);
    await settings.getByRole('button', { name: 'Comprobar', exact: true }).click();
    await expect(settings.getByLabel('Secreto de instalación', { exact: true })).toBeVisible();
    await settings.getByLabel('Secreto de instalación', { exact: true }).fill(secret);
    await settings.getByRole('button', { name: 'Conectar', exact: true }).click();
    await expect(settings.getByText(/Cámara E2E · Administración/)).toBeVisible();
    await settings.getByRole('button', { name: 'Cerrar', exact: true }).click();
  }
  const toggle = page.getByTestId('world-camera');
  await toggle.click();
  const proof = () => page.evaluate(() => {
    const p = (window as unknown as { cameraTravelProof: { requests: number; stream: MediaStream | null; frames: number; drawnStream: string | null } }).cameraTravelProof;
    return { requests: p.requests, id: p.stream?.id, track: p.stream?.getVideoTracks()[0].id, state: p.stream?.getVideoTracks()[0].readyState, frames: p.frames, drawnStream: p.drawnStream };
  });
  await expect.poll(async () => (await proof()).state).toBe('live');
  const original = await proof(); let frames = original.frames;
  const stillCapturing = async () => {
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await proof()).frames).toBeGreaterThan(frames);
    const now = await proof();
    expect(now).toMatchObject({ requests: 1, id: original.id, track: original.track, state: 'live', drawnStream: original.id });
    frames = now.frames;
  };
  await stillCapturing();
  await phone(page, 'house');
  await expect(page.locator('.sv-hud-place h1')).toHaveText('Mi rincón de estudio');
  await stillCapturing();
  await phone(page, 'rooms');
  const rooms = page.getByRole('dialog', { name: 'Plantas y habitaciones', exact: true });
  await rooms.getByRole('button', { name: 'Añadir habitación', exact: true }).click();
  await expect(rooms.getByLabel('Nombre de la habitación', { exact: true })).toBeVisible();
  await rooms.getByLabel('Nombre de la habitación', { exact: true }).fill('Camera room');
  await rooms.getByLabel('Nombre de la habitación', { exact: true }).blur();
  await rooms.getByRole('button', { name: 'Entrar a la planta', exact: true }).click();
  await rooms.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.locator('.sv-hud-place h1')).toHaveText('Planta baja');
  await stillCapturing();
  await phone(page, 'rooms');
  await rooms.getByRole('button', { name: 'Entrar a la habitación', exact: true }).click();
  await rooms.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.locator('.sv-hud-place h1')).toHaveText('Camera room');
  await stillCapturing();
  await phone(page, 'rooms');
  await rooms.getByRole('button', { name: 'Vestíbulo', exact: true }).click();
  await rooms.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.locator('.sv-hud-place h1')).toHaveText('Mi rincón de estudio');
  await stillCapturing();
  await phone(page, 'house');
  await expect(page.locator('.sv-hud-place h1')).toHaveText('La aldea');
  await stillCapturing();
  const portal = async (x:number, y:number, title:string) => {
    const canvas = page.locator('.sv-stage-pane canvas'), box = (await canvas.boundingBox())!;
    await canvas.dblclick({ position: { x: box.width * x / 768, y: box.height * y / 432 } });
    await expect(page.locator('.sv-hud-place h1')).toHaveText(title, { timeout: 15_000 });
    await stillCapturing();
  };
  await portal(240, 50, 'Plaza Comunitaria');
  await portal(384, 394, 'La aldea');
  await portal(240, 392, 'Biblioteca y Taller de Estudio');
  await phone(page, 'village');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Salir de la sesión', exact: true }).click();
  await expect.poll(async () => (await proof()).state).toBe('ended');
  expect((await proof()).requests).toBe(1);
});

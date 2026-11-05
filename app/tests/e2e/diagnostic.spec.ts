import { test, expect } from '@playwright/test';

test('capability page is honest and sends no signaling requests on load', async ({ page,baseURL }) => {
  const external: string[] = [];
  page.on('request', req => {
    if (new URL(req.url()).origin !== new URL(baseURL!).origin) external.push(req.url());
  });
  await page.goto('/?diagnostic=1');
  await expect(page.getByRole('heading', { name: 'Primero, comprobar la conexión.' })).toBeVisible();
  await expect(page.getByText('UNVERIFIED · Dos Linux / redes distintas')).toBeVisible();
  await expect(page.getByText('Navegador: este resultado no valida Tauri/WebKitGTK.')).toBeVisible();
  expect(external).toEqual([]);
});

test('real WebRTC in one browser carries synthetic video, audio and data then closes', async ({ page }) => {
  await page.goto('/?diagnostic=1');
  await page.getByRole('button', { name: 'Probar WebRTC sintético' }).click();
  await expect(page.getByText('PASS · WebRTC sintético en este equipo')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/DataChannel: recibido; paquetes audio: [1-9]/)).toBeVisible();
  await page.getByRole('button', { name: 'Detener todas las pistas' }).click();
  await expect(page.getByText('PASS · Detener pistas')).toBeVisible();
});

test('a denied microphone permission is reported as failure', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Synthetic test denial', 'NotAllowedError'); };
  });
  await page.goto('/?diagnostic=1');
  await page.getByRole('button', { name: 'Probar micrófono' }).click();
  await expect(page.getByText('FAIL · Captura de micrófono')).toBeVisible();
  await expect(page.getByText(/NotAllowedError. No se ha confirmado captura/)).toBeVisible();
});

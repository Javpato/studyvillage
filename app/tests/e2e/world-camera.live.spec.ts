import { existsSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// The temporary village uses real PeerJS signaling; media is Chrome's synthetic camera.
test.skip(!process.env.STUDYVILLAGE_LIVE, 'needs signaling; set STUDYVILLAGE_LIVE=1');
test.use({ permissions: ['camera', 'microphone'], launchOptions: {
  executablePath: process.env.CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined),
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
} });

test('world camera follows a moving avatar without replacing its live capture', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    type Probe = { track: MediaStreamTrack; streamId: string; x: number; y: number; frames: number };
    const observed = window as unknown as { cameraProbe?: Probe };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(this: CanvasRenderingContext2D, ...args: Parameters<typeof drawImage>) {
      const source = args[0];
      if (this.canvas.matches('.sv-stage-pane canvas') && source instanceof HTMLVideoElement && source.srcObject instanceof MediaStream) {
        const track = source.srcObject.getVideoTracks()[0];
        if (track) observed.cameraProbe = { track, streamId: source.srcObject.id, x: Number(args[5]), y: Number(args[6]), frames: (observed.cameraProbe?.frames ?? 0) + 1 };
      }
      Reflect.apply(drawImage, this, args);
    } as typeof drawImage;
  });
  await page.goto('/');
  await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-village').click();
  await page.getByRole('button', { name: 'Abrir mi aldea a otras personas' }).click();
  await expect(page.getByLabel('Invitación actual', { exact: true })).not.toHaveValue('', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  const toggle = page.getByTestId('world-camera');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const capture = () => page.evaluate(() => {
    const p = (window as unknown as { cameraProbe?: { track: MediaStreamTrack; streamId: string; x: number; y: number; frames: number } }).cameraProbe;
    return p ? { trackId: p.track.id, streamId: p.streamId, readyState: p.track.readyState, x: p.x, y: p.y, frames: p.frames } : null;
  });
  await expect.poll(async () => (await capture())?.readyState).toBe('live');
  const before = (await capture())!;
  await page.locator('.sv-stage-pane canvas').focus();
  await page.keyboard.down('d');
  await expect.poll(async () => Math.abs((await capture())!.x - before.x), { timeout: 3000 }).toBeGreaterThan(20);
  await page.keyboard.up('d');
  const after = (await capture())!;
  expect(after.frames).toBeGreaterThan(before.frames);
  expect(after.trackId).toBe(before.trackId);
  expect(after.streamId).toBe(before.streamId);
  expect(after.readyState).toBe('live');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await capture())?.readyState).toBe('ended');
});

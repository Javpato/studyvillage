import { existsSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
test.use({permissions:['camera'],launchOptions:{executablePath:process.env.CHROME_PATH||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined),args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']}});
async function openGame(page:Page,game:'werewolves'|'gartic'){
  await page.goto('/');const canvas=page.locator('.sv-stage-pane canvas');let box=(await canvas.boundingBox())!;
  await canvas.dblclick({position:{x:box.width*240/768,y:box.height*50/432}});await expect(page.locator('.sv-hud-place h1')).toHaveText('Plaza Comunitaria',{timeout:15000});
  box=(await canvas.boundingBox())!;await canvas.dblclick({position:{x:box.width*(game==='werewolves'?384:169)/768,y:box.height*(game==='werewolves'?210:110)/432}});
  await expect(page.locator(game==='werewolves'?'.ww':'.gp')).toBeVisible({timeout:15000});
}
for(const [device,width,height] of [['phone',390,844],['iPad',820,1180],['desktop',1440,1000]] as const)for(const game of ['werewolves','gartic'] as const){
  test(`${device}: ${game} has an optional square camera and releases it when closed`,async({page})=>{
    await page.setViewportSize({width,height});await openGame(page,game);const voice=(await page.getByRole('button',{name:'Unirse a la voz del juego',exact:true}).boundingBox())!;expect(voice.height).toBeLessThanOrEqual(44);expect(voice.width).toBeLessThanOrEqual(220);await expect(page.locator('.sv-game-camera-tile')).toHaveCount(0);
    await page.getByRole('button',{name:'Activar cámara',exact:true}).click();const video=page.locator('.sv-game-camera-tile video.is-self');
    await expect(video).toBeVisible();await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await video.evaluate(v=>{(window as any).cameraTrack=((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0];});
    const tile=(await page.locator('.sv-game-camera-tile').boundingBox())!;expect(Math.abs(tile.width-tile.height)).toBeLessThan(2);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath(`camera-${game}-${device}.png`),animations:'disabled'});
    await page.getByRole('button',{name:'Apagar cámara',exact:true}).click();await expect(page.locator('.sv-game-camera-tile')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).cameraTrack.readyState)).toBe('ended');
    await page.getByRole('button',{name:'Activar cámara',exact:true}).click();await expect(video).toBeVisible();await video.evaluate(v=>{(window as any).cameraTrack=((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0];});
    await page.getByTestId('expansion-modal-close').click();await expect(page.locator('.sv-game-camera')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).cameraTrack.readyState)).toBe('ended');
  });
}
test('a rejected camera permission is explained and the game stays usable',async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
  await openGame(page,'werewolves');await page.getByRole('button',{name:'Activar cámara',exact:true}).click();await expect(page.locator('.sv-game-camera-error')).toContainText('permiso');
  await expect(page.getByRole('button',{name:'Sentarme a la mesa'})).toBeEnabled();await page.getByTestId('expansion-modal-close').click();await expect(page.getByTestId('phone-button')).toBeVisible();
});

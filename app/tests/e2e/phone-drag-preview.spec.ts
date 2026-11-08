import {test,expect} from '@playwright/test';

test('mouse drag follows the pointer, groups apps and cleans its visual copy',async({page})=>{
 await page.goto('/');await page.getByTestId('phone-button').click();const source=page.getByTestId('phone-contacts');await source.click({button:'right'});
 const a=(await source.boundingBox())!,b=(await page.getByTestId('phone-village').boundingBox())!;
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2+20,a.y+a.height/2+18);
 const preview=page.locator('.sv-phone-drag-preview');await expect(preview).toBeVisible();await expect(source).toHaveCSS('opacity','0.25');
 const first=(await preview.boundingBox())!;await page.mouse.move(a.x+a.width/2+45,a.y+a.height/2+38);const second=(await preview.boundingBox())!;expect(second.x-first.x).toBeCloseTo(25,0);expect(second.y-first.y).toBeCloseTo(20,0);
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await expect(page.getByTestId('phone-village')).toHaveClass(/sv-drop-target/);await page.mouse.up();await expect(page.getByText('Folder 1',{exact:true})).toBeVisible();await expect(preview).toHaveCount(0);await expect(page.locator('.sv-phone-drag-source')).toHaveCount(0);
});

for(const width of [390,820])test.describe(`touch drag at ${width}`,()=>{
 test.use({viewport:{width,height:1000},hasTouch:true,isMobile:true});
 test('native touch preview follows the finger and cancellation preserves the layout',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Continuous native touch is driven through Chromium CDP.');
  await page.goto('/');await page.getByTestId('phone-button').tap();const source=page.getByTestId('phone-contacts');await source.focus();await page.keyboard.press('F2');const a=(await source.boundingBox())!;
  const session=await page.context().newCDPSession(page),x=a.x+a.width/2,y=a.y+a.height/2;
  const send=(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',x:number,y:number)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchCancel'||type==='touchEnd'?[]:[{x,y,id:1}]});
  try{
   await send('touchStart',x,y);await send('touchMove',x+20,y+25);const preview=page.locator('.sv-phone-drag-preview');await expect(preview).toBeVisible();const first=(await preview.boundingBox())!;await send('touchMove',x+40,y+45);
   // CDP acknowledges input before Chromium necessarily delivers its coalesced pointer event.
   await expect.poll(async()=>((await preview.boundingBox())!.x-first.x)).toBeCloseTo(20,0);await expect.poll(async()=>((await preview.boundingBox())!.y-first.y)).toBeCloseTo(20,0);
   await page.screenshot({path:test.info().outputPath('phone-drag.png')});await send('touchCancel',0,0);await expect(preview).toHaveCount(0);await expect(source).not.toHaveClass(/sv-phone-drag-source/);await expect(page.locator('.sv-phone-home .sv-app-label')).toHaveText(['Aldea','Contactos','Hogar','Ajustes']);
  }finally{await session.detach();}
 });
});

test('long press can continue directly into a drag and closing releases the preview',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.getByTestId('phone-button').click();const a=(await page.getByTestId('phone-contacts').boundingBox())!;await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await expect(page.locator('.sv-phone-drag-preview')).toBeVisible({timeout:5000});await page.mouse.move(a.x+a.width/2+30,a.y+a.height/2+30);await page.keyboard.press('Escape');await expect(page.locator('.sv-phone-drag-preview')).toHaveCount(0);await page.mouse.up();await expect(page.locator('.sv-phone-drag-source')).toHaveCount(0);
});

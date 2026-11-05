import {test,expect} from '@playwright/test';
for(const[device,width,height]of[['phone',390,844],['tablet',820,1180]]as const){
 test.describe(device,()=>{
  test.use({viewport:{width,height},hasTouch:true,isMobile:true,userAgent:device==='phone'?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148':'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
  test('smaller defaults, fixed menu, editable controls and separate orientation layouts',async({page})=>{
   await page.goto('/');const menu=page.getByTestId('phone-button'),action=page.getByTestId('touch-action-btn');
   await expect(action).toBeVisible();
   for(const target of[action,page.getByTestId('touch-sprint-btn')]){const rect=(await target.boundingBox())!;expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width);expect(rect.y+rect.height).toBeLessThanOrEqual(height);}
   if(device==='phone'){const screen=(await page.locator('.sv-stage-pane canvas').boundingBox())!,pad=(await page.getByRole('group',{name:'Cruceta de movimiento táctil'}).boundingBox())!;expect(screen.y+screen.height).toBeLessThan(pad.y);expect(screen.y).toBeLessThan(height*.25);}
   expect((await page.getByRole('group',{name:'Cruceta de movimiento táctil'}).boundingBox())!.width).toBeLessThan(130);
   const menuBox=(await menu.boundingBox())!;expect(menuBox.y).toBeLessThan(30);expect(menuBox.x+menuBox.width).toBeGreaterThan(width-30);
   const open=async()=>{await menu.click();await page.getByTestId('phone-hud-editor').click();};
   await open();const editor=page.getByRole('dialog',{name:'Editor de controles'});
   const preview=(await editor.locator('.sv-hud-layout-preview').boundingBox())!;expect(Math.abs(preview.width/preview.height-width/height)).toBeLessThan(.02);
   await expect(editor.locator('.sv-hud-layout-preview')).toHaveCSS('background-size',/^10% 10%(?:, 10% 10%)?$/);
   await expect(menu).toHaveCSS('user-select','none');
   await editor.getByLabel('Control para editar').selectOption('interact');await editor.getByLabel('Mostrar en pantalla').uncheck();await editor.getByRole('button',{name:'Guardar controles',exact:true}).click();await expect(action).toBeHidden();await expect(menu).toBeVisible();
   await open();await editor.getByLabel('Control para editar').selectOption('interact');await expect(editor.getByLabel('Mostrar en pantalla')).not.toBeChecked();await editor.getByLabel('Mostrar en pantalla').check();
   await editor.getByLabel('Tamaño',{exact:true}).evaluate(e=>{(e as HTMLInputElement).value='1.25';e.dispatchEvent(new Event('input',{bubbles:true}));});
   await editor.getByLabel('Color del control',{exact:true}).evaluate(e=>{(e as HTMLInputElement).value='#123456';e.dispatchEvent(new Event('input',{bubbles:true}));});
   await editor.getByRole('button',{name:'Guardar controles',exact:true}).click();await expect(action).toHaveCSS('background-color','rgb(18, 52, 86)');await page.reload();await expect(action).toHaveCSS('background-color','rgb(18, 52, 86)');
   await page.setViewportSize({width:height,height:width});await expect(action).not.toHaveCSS('background-color','rgb(18, 52, 86)');await page.setViewportSize({width,height});await expect(action).toHaveCSS('background-color','rgb(18, 52, 86)');
   await open();await editor.getByLabel('Orientación del diseño').selectOption('landscape');await editor.getByLabel('Control para editar').selectOption('interact');
   await editor.getByLabel('Color del control',{exact:true}).evaluate(e=>{(e as HTMLInputElement).value='#654321';e.dispatchEvent(new Event('input',{bubbles:true}));});
   await editor.getByLabel('Orientación del diseño').selectOption('portrait');await expect(editor.getByLabel('Color del control',{exact:true})).toHaveValue('#123456');
   await editor.getByRole('button',{name:'Guardar controles',exact:true}).click();await expect(action).toHaveCSS('background-color','rgb(18, 52, 86)');
   await page.setViewportSize({width:height,height:width});await expect(action).toHaveCSS('background-color','rgb(101, 67, 33)');await page.setViewportSize({width,height});await expect(action).toHaveCSS('background-color','rgb(18, 52, 86)');
   await open();await editor.getByLabel('Control para editar').selectOption('interact');await editor.getByLabel('Mostrar en pantalla').uncheck();await editor.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(action).toBeVisible();
   await page.screenshot({path:`/tmp/studyvillage-hud-${device}.png`,fullPage:true});
  });
 });
}

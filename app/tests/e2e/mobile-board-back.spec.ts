import{test,expect}from'@playwright/test';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'});
test('board back remains reachable in both orientations even with the location widget hidden',async({page})=>{
 await page.goto('/');const phone=async(app:string)=>{await page.getByTestId('phone-button').click();await page.getByTestId(`phone-${app}`).click();};
 await phone('hud-editor');const editor=page.getByRole('dialog',{name:'Editor de controles'});
 for(const orientation of ['portrait','landscape']){await editor.getByLabel('Orientación del diseño').selectOption(orientation);await editor.getByLabel('Control para editar').selectOption('location');await editor.getByLabel('Mostrar en pantalla').uncheck();}
 await editor.getByRole('button',{name:'Guardar controles',exact:true}).click();await phone('house');
 for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);await phone('decorate');const options=page.locator('.sv-house-editor>details');if(!await options.evaluate(e=>(e as HTMLDetailsElement).open))await options.locator('summary').click();
  await page.locator('.sv-furniture-item',{hasText:'Pizarra'}).dblclick();await expect(page.getByLabel('Pizarra para dibujar')).toBeVisible();
  const back=page.getByTestId('board-back');await expect(back).toBeVisible();const box=(await back.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.y+box.height).toBeLessThanOrEqual(size.height);
  expect(await back.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  await back.tap();await expect(page.getByLabel('Pizarra para dibujar')).toBeHidden();await expect(page.locator('.sv-stage-pane canvas')).toBeVisible();
 }
});

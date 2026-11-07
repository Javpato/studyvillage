import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import { test, expect } from '@playwright/test';
test('each room has its own full projects app, furniture and boards after reload',async({page})=>{
 await page.goto('/');
 const phone=async(app:string)=>{await page.getByTestId('phone-button').click();await openPhoneApp(page,app);};
 const projects=page.getByRole('region',{name:'Proyectos en VS Code'});
 const closeProjects=async()=>{await projects.getByRole('button',{name:'Cerrar',exact:true}).first().click();};
 await phone('rooms');const spaces=page.getByRole('dialog',{name:'Plantas y habitaciones'});
 await spaces.getByRole('button',{name:'Añadir habitación',exact:true}).click();
 await spaces.getByLabel('Nombre de la habitación').fill('Math');await spaces.getByLabel('Nombre de la habitación').press('Tab');
 await spaces.getByRole('button',{name:'Entrar a la habitación',exact:true}).click();await spaces.getByRole('button',{name:'Cerrar',exact:true}).click();
 await expect(page.locator('.sv-hud-place h1')).toHaveText('Math');
 // The same Projects app as the lobby, but this room's own list.
 await phone('projects');await expect(projects).toBeVisible();
 await projects.getByRole('button',{name:'Crear el primer proyecto'}).click();
 await page.getByPlaceholder('Proyecto final de Programación').fill('Math repo');
 await page.getByPlaceholder('https://github.com/usuario/proyecto').fill('https://github.com/example/math');
 await page.getByRole('button',{name:'Crear proyecto'}).click();
 await expect(projects.getByRole('heading',{name:'Math repo'})).toBeVisible();await closeProjects();
 await phone('decorate');const details=page.locator('.sv-house-editor > details');if(!await details.evaluate(e=>(e as HTMLDetailsElement).open))await details.locator(':scope > summary').click();
 await page.locator('.sv-furniture-item',{hasText:'Pizarra'}).dblclick();const canvas=page.getByLabel('Pizarra para dibujar');const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5,{steps:8});await page.mouse.up();
 await expect(page.getByRole('button',{name:'↶ Deshacer'})).toBeEnabled();await page.keyboard.press('Escape');
 await phone('rooms');await spaces.getByRole('button',{name:'Añadir habitación',exact:true}).click();const names=spaces.getByLabel('Nombre de la habitación');await names.nth(1).fill('Taller7');await names.nth(1).press('Tab');
 await spaces.getByRole('button',{name:'Entrar a la habitación',exact:true}).nth(1).click();await spaces.getByRole('button',{name:'Cerrar',exact:true}).click();
 await expect(page.locator('.sv-hud-place h1')).toHaveText('Taller7');
 await phone('projects');await expect(projects.getByRole('button',{name:'Crear el primer proyecto'})).toBeVisible();await expect(projects.getByRole('heading',{name:'Math repo'})).toHaveCount(0);await closeProjects();
 await page.reload();await phone('rooms');await expect(spaces.getByLabel('Nombre de la habitación')).toHaveCount(2);await spaces.getByRole('button',{name:'Entrar a la habitación',exact:true}).first().click();await spaces.getByRole('button',{name:'Cerrar',exact:true}).click();
 await phone('projects');await expect(projects.getByRole('heading',{name:'Math repo'})).toBeVisible();
});

for(const device of [{name:'phone',width:390,height:844,language:'es'},{name:'tablet',width:820,height:1180,language:'en'},{name:'desktop',width:1440,height:1000,language:'es'}]){
 test(`house and room friends persist with soft controls on ${device.name}`,async({page})=>{
  await page.setViewportSize({width:device.width,height:device.height});
  await page.addInitScript(({language})=>{
   localStorage.setItem('studyvillage-language',language);
   if(!localStorage.getItem('studyvillage-local-sync'))localStorage.setItem('studyvillage-local-sync',JSON.stringify({schemaVersion:1,profile:{displayName:'Owner',color:'#df8a72'},house:null,friendCode:'test-owner',contacts:[{schemaVersion:1,identity:{fingerprint:'b'.repeat(64),publicKey:'A'.repeat(44),displayName:'Ana',color:'#627c69'},friendCode:'test-friend'}],encryptedIdentity:null,editor:'',projectLinks:{}}));
  },{language:device.language});
  const en=device.language==='en';
  const open=async()=>{await page.getByTestId('phone-button').click();await openPhoneApp(page,'rooms');};
  await page.goto('/');await open();
  const dialog=page.getByRole('dialog',{name:en?'Floors and rooms':'Plantas y habitaciones'});
  await dialog.getByRole('button',{name:en?'Add room':'Añadir habitación',exact:true}).click();
  const home=dialog.locator('.sv-space-home');const room=dialog.locator('.sv-space-room');
  await home.locator('summary').click();await home.getByRole('checkbox',{name:en?'Allow Ana':'Autorizar a Ana'}).check();
  await expect(home.getByRole('checkbox')).toBeChecked();
  await room.locator('summary').click();await room.getByRole('checkbox').check();await expect(room.getByRole('checkbox')).toBeChecked();
  await expect(dialog.getByRole('status')).toContainText(en?'Saved on this device':'Guardado en este dispositivo');
  expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  const styles=await dialog.getByRole('button',{name:en?'Enter room':'Entrar a la habitación',exact:true}).evaluate(e=>({radius:parseFloat(getComputedStyle(e).borderRadius),height:e.getBoundingClientRect().height,clip:getComputedStyle(e).clipPath}));
  expect(styles.radius).toBeGreaterThanOrEqual(10);expect(styles.height).toBeGreaterThanOrEqual(44);expect(styles.clip).toBe('none');
  await dialog.evaluate(e=>e.scrollTop=0);await page.screenshot({path:`test-results/house-spaces-${device.name}.png`});
  await page.reload();await open();await home.locator('summary').click();await room.locator('summary').click();
  await expect(home.getByRole('checkbox')).toBeChecked();await expect(room.getByRole('checkbox')).toBeChecked();
  await room.getByRole('checkbox').uncheck();await expect(room.getByRole('checkbox')).not.toBeChecked();await expect(home.getByRole('checkbox')).toBeChecked();
  await page.reload();await open();await room.locator('summary').click();await expect(room.getByRole('checkbox')).not.toBeChecked();
 });
}

import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {test,expect} from '@playwright/test';
import {openDecorate,savedHouse} from './root-polish-helpers';
for(const profile of [{name:'desktop',width:1440,height:1000,touch:false},{name:'phone',width:390,height:844,touch:true}]){
 test.describe(profile.name,()=>{
  test.use({viewport:{width:profile.width,height:profile.height},hasTouch:profile.touch,isMobile:profile.touch});
  test('settings stays simple, diagnostic goes back to the same place and decoration names survive undo and reload',async({page})=>{
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
   let editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Planta'}).click();await editor.getByRole('button',{name:'Decorar en la habitación',exact:true}).click();
   const toolbar=page.getByRole('group',{name:'Decorar habitación',exact:true});await toolbar.getByRole('button',{name:'Cambiar nombre',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Nombre del mueble',exact:true});await dialog.getByLabel('Nombre del mueble',{exact:true}).fill('Jardín de tinta');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await expect(dialog).toBeHidden();
   await expect.poll(async()=>(await savedHouse(page)).furniture.find(f=>f.kind==='plant')?.publicAlias).toBe('Jardín de tinta');
   await toolbar.getByRole('button',{name:'Deshacer',exact:true}).click();await expect.poll(async()=>(await savedHouse(page)).furniture.find(f=>f.kind==='plant')?.publicAlias).not.toBe('Jardín de tinta');
   await toolbar.getByRole('button',{name:'Rehacer',exact:true}).click();await expect.poll(async()=>(await savedHouse(page)).furniture.find(f=>f.kind==='plant')?.publicAlias).toBe('Jardín de tinta');
   await toolbar.getByRole('button',{name:'Terminar',exact:true}).click();const place=await page.locator('.sv-hud-place h1').textContent();
   const diagnostics=async()=>{await page.getByTestId('phone-button').click();await openPhoneApp(page,'settings');const settings=page.getByRole('dialog',{name:'Ajustes',exact:true});await settings.getByRole('tab',{name:'Perfil',exact:true}).click();await expect(settings.getByText('Personalizar Avatar y Assets',{exact:true})).toHaveCount(0);await settings.getByRole('tab',{name:'Controles',exact:true}).click();await settings.getByRole('link',{name:'Diagnóstico de micrófono y pantalla',exact:true}).click();await expect(page.getByTestId('diagnostics-back')).toBeVisible();};
   await diagnostics();await page.getByTestId('diagnostics-back').click();await expect(page.locator('.sv-hud-place h1')).toHaveText(place!);await expect(page.locator('.sv-stage-pane canvas')).toBeVisible();
   await diagnostics();await page.keyboard.press('Escape');await expect(page.locator('.sv-hud-place h1')).toHaveText(place!);
   await page.reload();editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Jardín de tinta'}).click();await expect(editor.getByLabel('Alias visible para todos')).toHaveValue('Jardín de tinta');expect(errors).toEqual([]);
  });
 });
}

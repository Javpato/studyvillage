import { test, expect, type Page } from '@playwright/test';
async function app(page: Page, id: string) { await page.getByTestId('phone-button').click(); await page.getByTestId(id).click(); }
test('decoration validates previews, rotates, undoes, redoes and persists',async({page})=>{
  await page.goto('/');await app(page,'phone-decorate');await page.getByRole('button',{name:'Colocar Mesa',exact:true}).click();
  const controls=page.getByRole('group',{name:'Decorar habitación'});await expect(controls).toBeVisible();
  const canvas=page.locator('.sv-stage-pane canvas');const box=(await canvas.boundingBox())!;
  const click=async(x:number,y:number)=>canvas.click({position:{x:box.width*x/768,y:box.height*y/432}});
  await click(384,380);await expect(page.locator('.sv-furniture-item')).toHaveCount(7);
  await click(256,272);await expect(page.locator('.sv-furniture-item')).toHaveCount(8);
  await controls.getByRole('button',{name:'Girar',exact:true}).click();await page.screenshot({path:'/tmp/redesign-decoration.png',fullPage:true,animations:'disabled'});
  await controls.getByRole('button',{name:'Deshacer',exact:true}).click();await controls.getByRole('button',{name:'Deshacer',exact:true}).click();await expect(page.locator('.sv-furniture-item')).toHaveCount(7);
  await controls.getByRole('button',{name:'Rehacer',exact:true}).click();await controls.getByRole('button',{name:'Rehacer',exact:true}).click();await expect(page.locator('.sv-furniture-item')).toHaveCount(8);
  await controls.getByRole('button',{name:'Terminar',exact:true}).click();await expect(controls).toBeHidden();await page.reload();await app(page,'phone-decorate');await expect(page.locator('.sv-furniture-item')).toHaveCount(8);
});
test('host selects role sets and ends a running Werewolves game',async({page})=>{
  await page.goto('/');const canvas=page.locator('.sv-stage-pane canvas');await canvas.focus();
  await page.keyboard.down('w');await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Ir a Plaza Comunitaria',{timeout:10000});await page.keyboard.up('w');await page.keyboard.press('e');
  await page.keyboard.down('w');await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Hombres Lobo',{timeout:10000});await page.keyboard.up('w');await page.keyboard.press('e');
  await page.locator('.sv-role-setup > summary').click();await expect(page.locator('.sv-role-card')).toHaveCount(32);await page.getByLabel('Set de cartas').selectOption('bonds');
  await page.getByText('Guardar este set',{exact:true}).click();await page.getByPlaceholder('Nombre del set').fill('Con vínculos');await page.getByRole('button',{name:'Guardar set',exact:true}).click();
  await page.screenshot({path:'/tmp/redesign-roles.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Sentarme a la mesa'}).click();for(let i=0;i<3;i++)await page.getByRole('button',{name:'Añadir bot',exact:true}).click();
  await page.getByRole('button',{name:'Repartir cartas'}).click();await expect(page.getByRole('heading',{name:'Mira tu carta'})).toBeVisible();
  await page.getByRole('button',{name:'Terminar partida',exact:true}).click();await page.getByRole('button',{name:'¿Terminar para todos?',exact:true}).click();await expect(page.getByRole('heading',{name:'La mesa de la hoguera'})).toBeVisible();
  await expect(page.locator('.ww-seat:not(.is-empty)')).toHaveCount(4);
});
test('notes and VS Code projects use village paper surfaces without example records',async({page})=>{
  await page.goto('/');await app(page,'phone-study');await page.getByRole('button',{name:/^Cuadernos/}).click();await expect(page.getByTestId('secure-note-title')).toHaveCount(0);await page.screenshot({path:'/tmp/redesign-notes.png',fullPage:true,animations:'disabled'});
  await page.getByRole('region',{name:'Estudio',exact:true}).getByRole('button',{name:'Cerrar',exact:true}).click();await app(page,'phone-projects');await expect(page.getByRole('region',{name:'Proyectos en VS Code'})).toBeVisible();await page.screenshot({path:'/tmp/redesign-projects.png',fullPage:true,animations:'disabled'});
});


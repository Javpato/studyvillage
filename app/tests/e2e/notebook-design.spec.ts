import {test,expect} from '@playwright/test';
import {notebookOptions,closeNotebookOptions} from './notebook-ui';
for(const [device,width,height]of [['phone',390,844],['tablet',820,1180],['desktop',1440,1000]]as const){
 test(`${device}: notebook leaves room to write and reveals document controls on demand`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/');await page.getByTestId('phone-button').click();await page.getByTestId('phone-ink').click();
  const root=page.locator('.sv-notebook'),paper=root.locator('.sv-notebook-scroll');await expect(page.getByText('Guardado en este dispositivo',{exact:true})).toBeVisible();
  expect((await paper.boundingBox())!.height).toBeGreaterThan(height*.55);
  expect(await root.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await expect(root.getByRole('button',{name:'Exportar copia editable',exact:true})).toBeHidden();await expect(root.getByLabel('Texto de la página')).toBeHidden();
  expect(await root.getByRole('toolbar').getByRole('button').count()).toBeLessThanOrEqual(4);
  await expect(root.getByLabel('Herramienta',{exact:true})).toBeVisible();await expect(root.getByRole('button',{name:'Nueva página',exact:true})).toBeVisible();
  await notebookOptions(page,'Página');await expect(root.getByLabel('Texto de la página')).toBeVisible();await expect(root.getByLabel('Papel',{exact:true})).toBeVisible();
  await notebookOptions(page,'Archivos');await expect(root.getByRole('button',{name:'Exportar copia editable',exact:true})).toBeVisible();await closeNotebookOptions(page);
  await root.locator('.sv-ink-header').getByRole('button',{name:'Mis cuadernos',exact:true}).click();await expect(root.locator('.sv-ink-library').getByRole('button',{name:'Importar PDF',exact:true})).toBeVisible();await expect(root.locator('.sv-ink-book')).toHaveCount(1);
  await page.keyboard.press('Escape');await expect(root.locator('.sv-ink-drawer')).toBeHidden();await expect(root).toBeVisible();
 });
}

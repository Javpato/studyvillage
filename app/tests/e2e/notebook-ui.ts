import type {Page} from '@playwright/test';
/** Exercise the same progressive disclosure used by people, without hidden-control shortcuts. */
export async function notebookOptions(page:Page,tab:'Página'|'Archivos'|'Compartir'|'Tinta y selección'):Promise<void>{
 const toggle=page.locator('.sv-ink-header').getByRole('button',{name:'Opciones del cuaderno',exact:true});
 if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 await page.locator('.sv-ink-drawer').getByRole('tab',{name:tab,exact:true}).click();
}
export async function closeNotebookOptions(page:Page):Promise<void>{
 const drawer=page.locator('.sv-ink-drawer');
 if(await drawer.isVisible())await drawer.locator('.sv-ink-drawer-head').getByRole('button',{name:'Cerrar panel',exact:true}).click();
}

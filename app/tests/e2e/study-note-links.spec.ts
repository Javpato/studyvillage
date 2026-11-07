import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {test,expect,type Page,type Locator} from '@playwright/test';
async function study(page:Page){await page.getByTestId('phone-button').click();await openPhoneApp(page,'study');return page.getByRole('region',{name:'Estudio',exact:true});}
async function sourceNote(root:Locator){
 await root.getByRole('button',{name:/^Cuadernos/}).click();await root.getByRole('button',{name:'Nuevo cuaderno',exact:true}).click();await root.getByLabel('Nombre del cuaderno').fill('Biología');await root.getByRole('button',{name:'Crear cuaderno',exact:true}).click();await root.getByRole('button',{name:'Nueva página',exact:true}).click();
 await root.getByTestId('secure-note-title').fill('La célula');await root.locator('.nb-text').first().fill('El núcleo contiene el ADN.');
}
async function createLinked(root:Locator){await root.getByRole('button',{name:'Más opciones de la página'}).click();await root.getByRole('button',{name:'Crear tarjetas de repaso'}).click();await expect(root.getByRole('button',{name:'Abrir apunte: La célula'})).toBeVisible();}
async function library(root:Locator){await root.getByRole('button',{name:/^Flashcards/}).click();await root.getByRole('button',{name:/Repasar mis flashcards/}).click();}

test('note ↔ deck survives reload, preserves unsaved card fields and returns to the same review',async({page})=>{
 await page.setViewportSize({width:390,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');const root=await study(page);await sourceNote(root);await createLinked(root);
 await expect(root.getByLabel('Nombre',{exact:true})).toHaveValue('Tarjetas de La célula');await root.getByLabel('Pregunta',{exact:true}).fill('¿Qué contiene el núcleo?');await root.getByLabel('Respuesta',{exact:true}).fill('ADN');
 await root.getByRole('button',{name:'Abrir apunte: La célula'}).click();await expect(root.getByTestId('secure-note-title')).toHaveText('La célula');await expect(root.locator('.nb-text').first()).toHaveText('El núcleo contiene el ADN.');
 await expect(root.getByRole('navigation',{name:'Flashcards vinculadas'})).toBeVisible();await page.screenshot({path:'/tmp/study-note-backlink-phone.png',animations:'disabled'});
 await root.locator('.nb-text').first().fill('El núcleo contiene el ADN. Repaso preparado.');await root.getByRole('button',{name:'Abrir mazo: Tarjetas de La célula'}).click();await expect(root.getByLabel('Pregunta',{exact:true})).toHaveValue('¿Qué contiene el núcleo?');await expect(root.getByLabel('Respuesta',{exact:true})).toHaveValue('ADN');
 await root.getByRole('button',{name:'Añadir tarjeta',exact:true}).click();await root.getByRole('button',{name:'Terminar edición'}).click();await root.getByRole('button',{name:'Repasar',exact:true}).click();await root.getByRole('button',{name:'Revelar respuesta'}).click();await expect(root.locator('.sv-study-review article')).toHaveText('ADN');
 await root.getByRole('button',{name:'Abrir apunte: La célula'}).click();await expect(root.locator('.nb-text').first()).toContainText('Repaso preparado.');await root.getByRole('button',{name:'Volver al mazo',exact:true}).click();await expect(root.locator('.sv-study-review article')).toHaveText('ADN');await expect(root.getByRole('button',{name:'Lo sabía'})).toBeVisible();
 await page.reload();await study(page);await library(root);await root.getByRole('button',{name:'Editar',exact:true}).click();await expect(root.getByText('1. ¿Qué contiene el núcleo?')).toBeVisible();await expect(root.getByRole('button',{name:'Abrir apunte: La célula'})).toBeVisible();await page.screenshot({path:'/tmp/study-deck-source-phone.png',animations:'disabled'});
 await root.getByRole('button',{name:'Abrir apunte: La célula'}).click();await expect(root.locator('.nb-text').first()).toContainText('Repaso preparado.');await expect(root.getByRole('button',{name:'Abrir mazo: Tarjetas de La célula'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('deleted source is a quiet unavailable reference and saved cards remain usable after reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');const root=await study(page);await sourceNote(root);await createLinked(root);await root.getByLabel('Pregunta',{exact:true}).fill('Pregunta guardada');await root.getByLabel('Respuesta',{exact:true}).fill('Respuesta guardada');await root.getByRole('button',{name:'Añadir tarjeta',exact:true}).click();
 await root.getByRole('button',{name:'Abrir apunte: La célula'}).click();await root.getByRole('button',{name:'Más opciones de la página'}).click();await root.getByRole('button',{name:'Borrar página',exact:true}).click();await root.getByRole('button',{name:'Volver al mazo',exact:true}).click();await expect(root.getByText('Apunte no disponible',{exact:true})).toBeVisible();await expect(root.getByRole('button',{name:/Abrir apunte:/})).toHaveCount(0);await expect(root.getByText('1. Pregunta guardada')).toBeVisible();
 await page.reload();await study(page);await library(root);await expect(root.getByText('Apunte no disponible',{exact:true})).toBeVisible();await root.getByRole('button',{name:'Repasar',exact:true}).click();await root.getByRole('button',{name:'Revelar respuesta'}).click();await expect(root.locator('.sv-study-review article')).toHaveText('Respuesta guardada');expect(errors).toEqual([]);
});

test('deleting a deck removes the derived backlink without deleting its source note',async({page})=>{
 await page.goto('/');const root=await study(page);await sourceNote(root);await createLinked(root);await root.getByRole('button',{name:'Abrir apunte: La célula'}).click();await expect(root.getByRole('button',{name:'Abrir mazo: Tarjetas de La célula'})).toBeVisible();await root.getByRole('button',{name:'Volver al mazo',exact:true}).click();await root.locator('summary').filter({hasText:/^Opciones$/}).click();await root.getByRole('button',{name:'Eliminar mazo',exact:true}).click();await root.getByRole('button',{name:'Confirmar eliminación',exact:true}).click();
 await page.reload();await study(page);await root.getByRole('button',{name:/^Cuadernos/}).click();await root.getByRole('button',{name:/^Biología/}).click();await expect(root.getByTestId('secure-note-title')).toHaveText('La célula');await expect(root.locator('.nb-text').first()).toHaveText('El núcleo contiene el ADN.');await expect(root.getByRole('navigation',{name:'Flashcards vinculadas'})).toHaveCount(0);
});

test('the page menu flushes edits before creating a deck and blocks the transition on storage failure',async({page})=>{
 await page.goto('/');const root=await study(page);await sourceNote(root);
 await page.evaluate(()=>{const proto=Storage.prototype,original=proto.setItem;proto.setItem=function(key,value){if(key.includes('secure-notes'))throw new DOMException('Quota exceeded','QuotaExceededError');return original.call(this,key,value);};});
 await root.getByTestId('secure-note-title').fill('Cambio todavía sin guardar');await root.getByRole('button',{name:'Más opciones de la página'}).click();await expect(root.getByTestId('secure-note-title')).toHaveText('Cambio todavía sin guardar');await expect(root.getByRole('button',{name:'Crear tarjetas de repaso'})).toHaveCount(0);await expect(root.locator('.nb-edited')).toContainText('Sin guardar');
 await page.reload();await study(page);await library(root);await expect(root.getByRole('button',{name:'Crear mi primer mazo'})).toBeVisible();
});

test('backlinks respect read-only and private decks without granting editor access',async({page})=>{
 await page.goto('/');const root=await study(page);await sourceNote(root);await createLinked(root);await root.getByLabel('Pregunta',{exact:true}).fill('Solo lectura');await root.getByLabel('Respuesta',{exact:true}).fill('Respuesta');await root.getByRole('button',{name:'Añadir tarjeta',exact:true}).click();
 const permission=async(visibility:'shared_read'|'private')=>page.evaluate(visibility=>{const key=Object.keys(localStorage).find(key=>key.startsWith('studyvillage-flashcard-decks-v1'));if(!key)throw new Error('Missing persisted deck');const decks=JSON.parse(localStorage.getItem(key)!);for(const deck of decks){deck.ownerId='another-person';deck.visibility=visibility;}localStorage.setItem(key,JSON.stringify(decks));},visibility);
 await permission('shared_read');await page.reload();await study(page);await root.getByRole('button',{name:/^Cuadernos/}).click();await root.getByRole('button',{name:/^Biología/}).click();await root.getByRole('button',{name:'Abrir mazo: Tarjetas de La célula'}).click();await expect(root.locator('.sv-study-review article')).toHaveText('Solo lectura');await expect(root.getByLabel('Pregunta',{exact:true})).toHaveCount(0);await expect(root.getByRole('button',{name:'Añadir tarjeta',exact:true})).toHaveCount(0);
 await permission('private');await page.reload();await study(page);await root.getByRole('button',{name:/^Cuadernos/}).click();await root.getByRole('button',{name:/^Biología/}).click();await expect(root.getByTestId('secure-note-title')).toHaveText('La célula');await expect(root.getByRole('navigation',{name:'Flashcards vinculadas'})).toHaveCount(0);
});

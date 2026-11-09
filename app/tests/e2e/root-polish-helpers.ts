import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import type {Page} from '@playwright/test';
import type {PublicHouse} from '../../../packages/core/src/protocol/types';
/** Read the real persisted result; user actions perform every mutation. */
export async function savedHouse(page:Page):Promise<PublicHouse>{return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('studyvillage-local',1);request.onsuccess=()=>{const db=request.result,read=db.transaction('own-data','readonly').objectStore('own-data').get('state');read.onsuccess=()=>{db.close();resolve(JSON.parse(read.result).house);};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);}));}
export async function worldPoint(page:Page,x:number,y:number):Promise<[number,number]>{const garden=page.locator('.sv-garden-preview canvas');if(await garden.isVisible())return garden.evaluate((c,[x,y])=>{const r=c.getBoundingClientRect(),d=(c as HTMLElement).dataset;return [r.x+(x-Number(d.worldX))*Number(d.worldScale),r.y+(y-Number(d.worldY))*Number(d.worldScale)] as [number,number];},[x,y]);const b=(await page.locator('.sv-stage-pane canvas').boundingBox())!;return [b.x+b.width*x/768,b.y+b.height*y/432];}
export async function openDecorate(page:Page){await page.getByTestId('phone-button').click();await openPhoneApp(page,'decorate');const more=page.getByText('Más opciones de muebles',{exact:true});if(!await more.evaluate(e=>e.parentElement!.hasAttribute('open')))await more.click();return page.locator('.sv-house-editor');}

/** Enter creation through the real, persisted workshop furniture. */
export async function openPetAtelier(page:Page){
 let editor=await openDecorate(page);
 if(!(await savedHouse(page)).furniture.some(f=>f.kind==='pet-atelier')){
  await editor.getByRole('button',{name:'Colocar Taller de mascotas',exact:true}).click();
  await page.mouse.click(...await worldPoint(page,310,245));
  await page.getByRole('group',{name:'Decorar habitación',exact:true}).getByRole('button',{name:'Terminar',exact:true}).click();
  editor=await openDecorate(page);
 }
 await editor.locator('.sv-furniture-item').filter({hasText:'Taller de mascotas'}).dblclick();
 return page.getByRole('dialog',{name:'Taller de mascotas',exact:true});
}

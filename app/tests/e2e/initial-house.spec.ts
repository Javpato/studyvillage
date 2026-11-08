import {test,expect} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {savedHouse,worldPoint} from './root-polish-helpers';
test('new house has essential furnishings and a removable outdoor mailbox',async({page},info)=>{
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();await expect.poll(async()=>(await savedHouse(page)).furniture.map(f=>f.kind)).toEqual(['board','desk','plant','cabinet','guide']);
 await openPhoneApp(page,'house');await page.screenshot({path:info.outputPath('initial-house.png')});
 await openPhoneApp(page,'garden');const tray=page.locator('.sv-garden-tray');await expect(tray.locator('.sv-garden-count')).toHaveText('Jardín: 1/16 · Casas de mascotas: 0/5');
 await page.mouse.click(...await worldPoint(page,64,147));await tray.getByRole('button',{name:'Retirar',exact:true}).click();await expect(tray.locator('.sv-garden-count')).toHaveText('Jardín: 0/16 · Casas de mascotas: 0/5');
 await tray.getByRole('button',{name:'Terminar',exact:true}).click();await expect.poll(async()=>(await savedHouse(page)).garden).toEqual([]);await page.reload();await expect(page.getByTestId('phone-button')).toBeVisible();expect((await savedHouse(page)).garden).toEqual([]);
});
test('saved layouts including removed wardrobe are never replenished',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();const original=await savedHouse(page);const house={...original,furniture:original.furniture.filter(f=>f.kind!=='cabinet'),garden:[]};
 await page.evaluate(house=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('studyvillage-local',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('own-data','readwrite'),store=tx.objectStore('own-data'),read=store.get('state');read.onsuccess=()=>{const data=JSON.parse(read.result);data.house=house;delete data.profile.wardrobeAdded;store.put(JSON.stringify(data),'state');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),house);
 await page.reload();await expect(page.getByTestId('phone-button')).toBeVisible();expect((await savedHouse(page)).furniture).toEqual(house.furniture);expect((await savedHouse(page)).garden).toEqual([]);
});

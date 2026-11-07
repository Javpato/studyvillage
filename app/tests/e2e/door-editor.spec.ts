import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import{test,expect}from'@playwright/test';
test('decoration moves floor and room doors and persists their entrances',async({page})=>{
 await page.goto('/');const phone=async(app:string)=>{await page.getByTestId('phone-button').click();await openPhoneApp(page,app);};
 await phone('rooms');const rooms=page.getByRole('dialog',{name:'Plantas y habitaciones'});await rooms.getByRole('button',{name:'Añadir habitación',exact:true}).click();await rooms.getByRole('button',{name:'Cerrar',exact:true}).click();
 const decorate=async()=>{await phone('decorate');await page.getByRole('button',{name:/^Decorar (en la habitación|planta)$/}).click();};
 const drag=async(x:number,y:number,toX:number,toY:number)=>{const stage=page.locator('.sv-stage-pane canvas'),box=(await stage.boundingBox())!;await page.mouse.move(box.x+box.width*x/768,box.y+box.height*y/432);await page.mouse.down();await page.mouse.move(box.x+box.width*toX/768,box.y+box.height*toY/432,{steps:10});await page.mouse.up();};
 const positions=()=>page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('studyvillage-local');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{return await new Promise<any>((resolve,reject)=>{const request=db.transaction('own-data','readonly').objectStore('own-data').get('state');request.onsuccess=()=>resolve(JSON.parse(request.result).house.doorPositions);request.onerror=()=>reject(request.error);});}finally{db.close();}});
 await decorate();await drag(690,332,520,340);await expect.poll(positions).toMatchObject({'lobby>ground:-':{x:520,y:360}});await page.getByRole('button',{name:'Terminar',exact:true}).click();
 await phone('rooms');await rooms.getByRole('button',{name:'Entrar a la planta',exact:true}).click();await rooms.getByRole('button',{name:'Cerrar',exact:true}).click();
 await decorate();await drag(106,124,210,180);
 await expect.poll(async()=>Object.values((await positions())??{}).some((v:any)=>v.x===208&&v.y===200)).toBe(true);
 await page.getByRole('button',{name:'Terminar',exact:true}).click();await page.reload();await phone('rooms');await rooms.getByRole('button',{name:'Entrar a la planta',exact:true}).click();await rooms.getByRole('button',{name:'Cerrar',exact:true}).click();
 const stage=page.locator('.sv-stage-pane canvas'),box=(await stage.boundingBox())!;await stage.dblclick({position:{x:box.width*208/768,y:box.height*180/432}});await expect(page.locator('.sv-hud-place h1')).toHaveText('Habitación 1',{timeout:15000});
});

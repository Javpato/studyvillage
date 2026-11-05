import {test,expect} from '@playwright/test';

test('stop controls follow game phase and authority, discarding stale confirmations',async({page})=>{
 const source=await page.request.get('/src/ui/activity-stop-control.ts');test.skip(!source.headers()['content-type']?.includes('javascript'),'The isolated UI lifecycle fixture uses development module endpoints.');
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();
 await page.evaluate(async()=>{
  const path='/src/ui/activity-stop-control.ts';const {ActivityStopControl}=await import(path);const root=document.createElement('section');root.id='stop-control-fixture';root.style.cssText='position:fixed;inset:20px;background:white;z-index:100000';document.body.append(root);let calls=0;const control=new ActivityStopControl(root,()=>{calls++;control.update('lobby',true);});
  (window as any).stopFixture={update:(phase:string|null,authorized:boolean)=>control.update(phase,authorized),calls:()=>calls,dispose:()=>{control.dispose();root.remove();}};
 });
 const stop=page.getByRole('button',{name:'Terminar partida',exact:true}),confirm=page.getByRole('button',{name:'¿Terminar para todos?',exact:true});
 for(const phase of [null,'lobby','end']){await page.evaluate(phase=>(window as any).stopFixture.update(phase,true),phase);await expect(page.locator('#stop-control-fixture button')).toHaveCount(0);}
 for(const phase of ['reveal','night','day','write','draw','guess','album']){await page.evaluate(phase=>(window as any).stopFixture.update(phase,true),phase);await expect(stop).toBeVisible();}
 await stop.click();await expect(confirm).toBeVisible();await page.evaluate(()=>(window as any).stopFixture.update('end',true));await expect(page.locator('#stop-control-fixture button')).toHaveCount(0);
 await page.evaluate(()=>(window as any).stopFixture.update('day',false));await expect(page.locator('#stop-control-fixture button')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).stopFixture.calls())).toBe(0);
 await page.evaluate(()=>(window as any).stopFixture.update('day',true));await stop.click();await page.evaluate(()=>(window as any).stopFixture.update('day',false));await expect(page.locator('#stop-control-fixture button')).toHaveCount(0);
 await page.evaluate(()=>(window as any).stopFixture.update('day',true));await expect(stop).toBeVisible();await stop.click();await page.evaluate(()=>(window as any).stopFixture.update('night',true));await confirm.click();expect(await page.evaluate(()=>(window as any).stopFixture.calls())).toBe(1);await expect(page.locator('#stop-control-fixture button')).toHaveCount(0);await page.evaluate(()=>(window as any).stopFixture.dispose());
});

test('Gartic lobby has no end-game action before a round starts',async({page})=>{
 await page.goto('/');const canvas=page.locator('.sv-stage-pane canvas');let box=(await canvas.boundingBox())!;await canvas.dblclick({position:{x:box.width*240/768,y:box.height*50/432}});await expect(page.locator('.sv-hud-place h1')).toHaveText('Plaza Comunitaria',{timeout:15000});box=(await canvas.boundingBox())!;await canvas.dblclick({position:{x:box.width*169/768,y:box.height*110/432}});await expect(page.locator('.gp')).toBeVisible({timeout:15000});await expect(page.locator('.sv-activity-stop')).toHaveCount(0);
});

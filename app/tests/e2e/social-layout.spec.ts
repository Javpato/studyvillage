import {test,expect} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
for(const [width,height,touch] of [[390,844,true],[844,390,true],[820,1180,true],[1180,820,true],[1440,1000,false]] as const){
 test(`contained menus and garden ${width}x${height}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:width<600});const page=await context.newPage();await page.goto('/');
 await openPhoneApp(page,'village');const screen=page.locator('.sv-phone-screen');await expect(screen).toBeVisible();const box=await screen.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);expect(box!.y+box!.height).toBeLessThanOrEqual(height+1);
 await page.keyboard.press('Escape');await openPhoneApp(page,'garden');
 const canvas=page.locator('.sv-garden-preview canvas');const sizes=[];for(let i=0;i<8;i++){sizes.push(await canvas.evaluate((c:HTMLCanvasElement)=>({w:c.width,h:c.height})));await page.waitForTimeout(50);}expect(new Set(sizes.map(s=>JSON.stringify(s))).size).toBe(1);
 if(touch&&width>=600&&height>600){const garden=await page.locator('.sv-garden-preview').boundingBox();expect(garden!.height).toBeGreaterThan(height*.59);}
 await context.close();
 });
}
test('controller settings explain pairing and limits; local stop is next to start',async({page})=>{
 await page.goto('/');await openPhoneApp(page,'settings');await page.getByRole('tab',{name:'Mando',exact:true}).click();await expect(page.getByText('Conecta el mando por USB',{exact:false})).toBeVisible();await page.getByRole('dialog',{name:'Ajustes',exact:true}).getByRole('button',{name:'Cerrar',exact:true}).click();
 await openPhoneApp(page,'tetris');await page.getByRole('button',{name:'Comenzar',exact:true}).click();const controls=page.locator('.sv-tetris-round-controls');await expect(controls.getByRole('button',{name:'Terminar partida',exact:true})).toBeVisible();await controls.getByRole('button',{name:'Terminar partida',exact:true}).click();await controls.getByRole('button',{name:'¿Terminar para todos?',exact:true}).click();await expect(controls.getByRole('button',{name:'Comenzar',exact:true})).toBeEnabled();
});

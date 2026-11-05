import {test,expect} from '@playwright/test';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
test('unsupported mobile screen capture is hidden while voice remains accessible',async({page})=>{
 await page.addInitScript(()=>{if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:undefined,configurable:true});});
 await page.goto('/');await page.getByTestId('phone-button').click();await page.getByTestId('phone-voice').click();
 await expect(page.locator('.sv-media-card').getByRole('button',{name:'Compartir pantalla',exact:true})).toBeHidden();
 await expect(page.locator('.sv-media-card').getByRole('button',{name:'Activar micro',exact:true})).toBeVisible();
});

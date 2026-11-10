import {test,expect,type Page} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
async function mockPad(page:Page,id='Unknown controller',mapping='standard',connected=true){
 await page.addInitScript(({id,mapping,connected})=>{localStorage.setItem('studyvillage-language','fr');const pad={id,index:0,mapping,connected,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};(window as any).guidePad=pad;Object.defineProperty(navigator,'getGamepads',{value:()=>pad.connected?[pad]:[]});},{id,mapping,connected});
}
async function frames(page:Page,button:number,down:boolean){await page.evaluate(async({button,down})=>{(window as any).guidePad.buttons[button].pressed=down;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));},{button,down});}
async function press(page:Page,button:number){await frames(page,button,true);await frames(page,button,false);}
async function settings(page:Page){await openPhoneApp(page,'settings');await page.getByRole('tab',{name:'Contrôles',exact:true}).click();return page.getByRole('dialog',{name:'Paramètres',exact:true});}
const guide=(page:Page)=>page.locator('.sv-controls-guide');
for(const id of ['DualSense Wireless Controller','Xbox Wireless Controller','Nintendo Switch Pro Controller','Unknown controller'])test(`physical positions and modal isolation: ${id}`,async({page})=>{
 await mockPad(page,id);await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();await press(page,8);await expect(guide(page)).toBeVisible();await expect(guide(page).locator('[data-context="world"]')).toHaveAttribute('aria-pressed','true');
 await guide(page).locator('[data-action="interact"]').click();await expect(guide(page).locator('[data-pad="0"]')).toHaveClass(/is-selected/);
 await frames(page,7,true);await expect(guide(page).locator('[data-pad="7"]')).toHaveClass(/is-pressed/);await frames(page,7,false);await expect(guide(page).locator('[data-pad="7"]')).not.toHaveClass(/is-pressed/);
 // Upper/west buttons are safe to inspect; the app remains behind the native modal.
 await press(page,3);await press(page,2);await page.keyboard.press('m');await expect(page.locator('.sv-phone')).toBeHidden();await expect(guide(page)).toBeVisible();
 // Navigate its device controls with the existing shoulder/confirm path.
 await guide(page).locator('.sv-guide-close').focus();await press(page,5);await press(page,5);await press(page,0);await expect(guide(page).locator('.sv-guide-keyboard')).toBeVisible();await expect(guide(page).locator('kbd').filter({hasText:'Shift'})).toBeVisible();
 await press(page,1);await expect(guide(page)).toBeHidden();await press(page,9);await expect(page.locator('.sv-phone')).toBeVisible();
});
test('disconnect, reconnect and unknown mapping update live without losing keyboard access',async({page})=>{
 await mockPad(page,'Unknown adapter','',false);await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();await expect(page.locator('.sv-control-strip')).toBeHidden();await page.keyboard.press('F1');await expect(guide(page)).toContainText('Connecte');
 await page.evaluate(()=>{(window as any).guidePad.connected=true;});await expect(guide(page)).toContainText('Disposition inconnue');await press(page,1);await expect(guide(page)).toBeVisible();
 await page.evaluate(()=>{(window as any).guidePad.mapping='standard';});await expect(guide(page).locator('.sv-guide-connection')).toHaveAttribute('data-ready','true');await press(page,1);await expect(page.locator('.sv-control-strip')).toBeVisible();
 await page.evaluate(()=>{(window as any).guidePad.connected=false;});await expect(page.locator('.sv-control-strip')).toBeHidden();await page.keyboard.press('F1');await guide(page).locator('[data-device="keyboard"]').click();await expect(guide(page).locator('.sv-guide-keyboard')).toBeVisible();await page.keyboard.press('Escape');await expect(guide(page)).toBeHidden();
});
test('floating help stays hidden across reloads and is recoverable from Settings controls',async({page})=>{
 await mockPad(page);await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();await page.getByRole('button',{name:'Masquer l’aide flottante'}).click();await expect(page.locator('.sv-control-strip')).toBeHidden();await page.reload();await expect(page.getByTestId('phone-button')).toBeVisible();await expect(page.locator('.sv-control-strip')).toBeHidden();
 const panel=await settings(page);await expect(panel.getByLabel('Afficher l’aide flottante')).not.toBeChecked();await panel.getByRole('button',{name:'Contrôles',exact:true}).click();await expect(guide(page)).toBeVisible();await page.keyboard.press('Escape');await expect(panel.getByRole('button',{name:'Contrôles',exact:true})).toBeFocused();await panel.getByLabel('Afficher l’aide flottante').check();await panel.getByRole('button',{name:'Fermer',exact:true}).click();await expect(page.locator('.sv-control-strip')).toBeVisible();
});
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:820,height:1180},{width:1280,height:900},{width:740,height:360}])test(`guide contains its illustration and scrolls at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await mockPad(page);await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();const strip=await page.locator('.sv-control-strip').boundingBox();expect(strip).not.toBeNull();if(viewport.width<=760){expect(strip!.width).toBeLessThan(185);expect(strip!.height).toBeLessThan(49);}
 await press(page,8);await guide(page).locator('[data-context="menu"]').click();await expect(guide(page).locator('.sv-controller-diagram>svg')).toBeVisible();const dimensions=await guide(page).evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,height:e.getBoundingClientRect().height}));expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client+1);expect(dimensions.height).toBeLessThan(viewport.height);
 await guide(page).locator('[data-action="confirm"]').focus();await expect(guide(page).locator('[data-action="confirm"]')).toBeInViewport();await guide(page).evaluate(e=>e.scrollTop=0);await page.screenshot({path:`/tmp/sv-guide-${viewport.width}.png`});
});
test('Forest Blocks guide shows live bindings and prevents drop or keyboard input during help',async({page})=>{
 await mockPad(page);await page.goto('/');await openPhoneApp(page,'tetris');const game=page.locator('.sv-tetris');await game.getByRole('button',{name:'Démarrer',exact:true}).click();await expect(game.getByRole('button',{name:'Mettre en pause',exact:true})).toBeVisible();await press(page,8);await expect(guide(page).locator('[data-context="tetris"]')).toHaveAttribute('aria-pressed','true');await expect(guide(page).locator('[data-action="drop"]')).toHaveAttribute('data-targets','3');
 await page.screenshot({path:'/tmp/sv-guide-tetris.png'});const before=await game.locator('.sv-tetris-stats').innerText();await frames(page,3,true);await expect(guide(page).locator('[data-pad="3"]')).toHaveClass(/is-pressed/);await frames(page,3,false);await page.keyboard.press('Shift');await page.keyboard.press('ArrowUp');expect(await game.locator('.sv-tetris-stats').innerText()).toBe(before);await press(page,1);await expect(guide(page)).toBeHidden();await press(page,3);await expect(game.locator('.sv-tetris-stats')).not.toHaveText(before);
});
test('manual keyboard help remains available without the Gamepad API',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('studyvillage-language','fr');Object.defineProperty(navigator,'getGamepads',{value:undefined});});await page.goto('/');const panel=await settings(page);await panel.getByRole('button',{name:'Contrôles',exact:true}).click();await expect(guide(page).locator('.sv-guide-connection')).toHaveAttribute('data-ready','false');await guide(page).locator('[data-device="keyboard"]').click();await expect(guide(page).locator('.sv-guide-keyboard')).toBeVisible();await expect(guide(page)).toContainText('Confirmer');await expect(page.locator('.sv-control-strip')).toBeHidden();
});
test('disabled controller cannot open help or navigate, while Settings can restore it',async({page})=>{
 await mockPad(page);await page.goto('/');const panel=await settings(page);
 // The controller preference is distinct from the floating-help preference.
 const label=panel.locator('label').filter({hasText:'Activer la manette'});await label.locator('input').uncheck();await panel.getByRole('button',{name:'Fermer',exact:true}).click();await press(page,8);await expect(guide(page)).toBeHidden();await expect(page.locator('.sv-control-strip')).toBeHidden();
 await settings(page);await label.locator('input').check();await panel.getByRole('button',{name:'Fermer',exact:true}).click();await press(page,8);await expect(guide(page)).toBeVisible();
});

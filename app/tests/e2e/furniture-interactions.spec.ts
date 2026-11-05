import {test,expect} from '@playwright/test';
import {openDecorate,savedHouse,worldPoint} from './root-polish-helpers';

for(const [name,hasTouch] of [['mouse',false],['touch',true]] as const)test.describe(name,()=>{
 test.use({reducedMotion:'reduce',hasTouch,viewport:{width:1440,height:1000}});
 test('ornaments do not move the character or open anything, but remain editable',async({page})=>{
  await page.goto('/');await page.getByTestId('phone-button').click();await page.getByTestId('phone-house').click();const canvas=page.locator('.sv-stage-pane canvas');await expect(canvas).toBeVisible();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));const before=await canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL());
  const [x,y]=await worldPoint(page,670,130);if(hasTouch){await page.touchscreen.tap(x,y);await page.touchscreen.tap(x,y);}else await page.mouse.dblclick(x,y);
  // A queued walk/interaction would visibly move the avatar within this interval.
  await page.waitForTimeout(500);expect(await canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL())).toBe(before);await expect(page.locator('.sv-notice:visible')).toHaveCount(0);await page.keyboard.press('e');await expect(page.locator('.sv-notice:visible')).toHaveCount(0);if(hasTouch)await expect(page.getByTestId('touch-action-btn')).toBeDisabled();
  let editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Planta ·'}).dblclick();await expect(editor.locator('.sv-furniture-detail>button').first()).toBeHidden();await expect(editor.getByLabel('Alias visible para todos',{exact:true})).toBeVisible();await editor.getByLabel('Alias visible para todos',{exact:true}).fill('Petit jardin');await editor.getByLabel('Alias visible para todos',{exact:true}).blur();await expect.poll(async()=>(await savedHouse(page)).furniture.find(f=>f.kind==='plant')?.publicAlias).toBe('Petit jardin');
  await editor.getByRole('button',{name:'Decorar en la habitación',exact:true}).click();await page.mouse.move(...await worldPoint(page,670,130));await page.mouse.down();await page.mouse.move(...await worldPoint(page,620,230),{steps:8});await page.mouse.up();await page.getByRole('group',{name:'Decorar habitación',exact:true}).getByRole('button',{name:'Terminar',exact:true}).click();await expect.poll(async()=>(await savedHouse(page)).furniture.find(f=>f.kind==='plant')?.x).not.toBe(660);
  await page.reload();editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Planta · Petit jardin'}).click();await expect(editor.getByLabel('Alias visible para todos',{exact:true})).toHaveValue('Petit jardin');await expect(editor.locator('.sv-furniture-detail>button').first()).toBeHidden();await editor.locator('.sv-furniture-item').filter({hasText:'Escritorio ·'}).click();await expect(editor.locator('.sv-furniture-detail>button').first()).toBeVisible();
 });
});

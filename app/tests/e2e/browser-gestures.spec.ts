import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
test.use({viewport:{width:1024,height:768},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 17_7_10 like Mac OS X) AppleWebKit/605.1.15 Version/17.7 Mobile/15E148 Safari/604.1'});
async function settings(page:Page){await page.getByTestId('phone-button').click();await openPhoneApp(page,'settings');return page.getByRole('dialog',{name:'Ajustes',exact:true});}
const output='/tmp/sv-browser-gestures';
test('long-press policy covers detached dialogs without disabling editable or intentional copy content',async({page,browserName})=>{
 await page.goto('/');const menu=page.getByTestId('phone-button');await expect(menu).toBeVisible();
 await expect(menu).toHaveCSS('user-select','none');await expect(menu).toHaveCSS('touch-action','manipulation');await expect(page.locator('.sv-stage-pane canvas')).toHaveCSS('touch-action','none');
 const point=(await menu.boundingBox())!;await page.touchscreen.tap(point.x+point.width/2,point.y+point.height/2);await page.touchscreen.tap(point.x+point.width/2,point.y+point.height/2);await expect(page.locator('.sv-phone')).toBeHidden();expect(await page.evaluate(()=>window.visualViewport!.scale)).toBe(1);
 const dialog=await settings(page),input=dialog.getByLabel('Nombre visible',{exact:true});await input.fill('Copy this name');await input.evaluate(el=>(el as HTMLInputElement).setSelectionRange(0,4));expect(await input.evaluate(el=>(el as HTMLInputElement).selectionEnd!-(el as HTMLInputElement).selectionStart!)).toBe(4);
 await expect(input).toHaveCSS('user-select','text');
 const policy=await dialog.evaluate(el=>{
  const button=el.querySelector('button')!,field=el.querySelector('input')!;
  const note=document.createElement('section');note.className='nb-blocks';note.innerHTML='Read-only notes stay copyable <button><span>Note action</span></button>';el.append(note);
  const detached=document.createElement('dialog');detached.innerHTML='<button>Detached surface</button><pre>copy me</pre><article class="sv-mailbox-note"><p>Copy a received letter</p></article>';document.body.append(detached);const results={
   chrome:button.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})),menu:button.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})),doubleTap:button.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true})),
   edit:field.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})),editMenu:field.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})),notes:note.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})),notesStyle:getComputedStyle(note).userSelect,noteButton:note.querySelector('span')!.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})),noteButtonStyle:getComputedStyle(note.querySelector('span')!).userSelect,
   detached:detached.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})),letter:detached.querySelector('p')!.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})),letterStyle:getComputedStyle(detached.querySelector('p')!).userSelect,copy:detached.querySelector('pre')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})),callout:getComputedStyle(button).getPropertyValue('-webkit-touch-callout'),
  };detached.remove();note.remove();return results;
 });
 expect(policy).toMatchObject({chrome:false,menu:false,doubleTap:false,edit:true,editMenu:true,notes:true,notesStyle:'text',noteButton:false,noteButtonStyle:'none',detached:false,copy:true,letter:true,letterStyle:'text'});if(await page.evaluate(()=>CSS.supports('-webkit-touch-callout','none')))expect(policy.callout).toBe('none');
 expect(await page.locator('meta[name=viewport]').getAttribute('content')).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
 await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByTestId('phone-button').click();await openPhoneApp(page,'focus');await expect(page.getByRole('button',{name:'Mover reloj flotante',exact:true,includeHidden:true})).toHaveCSS('touch-action','none');
});

test('visual-only zoom and pan settle HUD, modal geometry and editor focus without mutating saved positions',async({page,browserName})=>{
 await page.addInitScript(()=>{
  const state={width:1024,height:768,offsetLeft:0,offsetTop:0,scale:1,innerWidth:1024,innerHeight:768},viewport=new EventTarget();
  for(const key of ['width','height','offsetLeft','offsetTop','scale'] as const)Object.defineProperty(viewport,key,{get:()=>state[key]});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});Object.defineProperty(window,'innerWidth',{configurable:true,get:()=>state.innerWidth});Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>state.innerHeight});
  (window as unknown as {setTestViewport:(next:Partial<typeof state>)=>void}).setTestViewport=next=>{Object.assign(state,next);viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));};
 });
 await page.goto('/');const action=page.getByTestId('touch-action-btn');await expect(action).toBeVisible();const before=(await action.boundingBox())!,saved=await page.evaluate(()=>localStorage.getItem('studyvillage-hud-layout-v1'));
 const dialog=await settings(page);const initial=(await dialog.boundingBox())!,name=dialog.getByLabel('Nombre visible',{exact:true});await name.focus();
 await page.evaluate(()=>(window as unknown as {setTestViewport:(next:object)=>void}).setTestViewport({width:512,height:384,offsetLeft:120,offsetTop:80,scale:2,innerWidth:512,innerHeight:600}));
 await expect(page.locator('html')).toHaveCSS('--sv-visual-left','120px');await expect(name).toBeFocused();await expect(page.locator('html')).toHaveClass(/sv-mobile-device/);
 const zoomed=(await dialog.boundingBox())!;expect(zoomed.x).toBeGreaterThanOrEqual(120);expect(zoomed.y).toBeGreaterThanOrEqual(80);expect(zoomed.x+zoomed.width).toBeLessThanOrEqual(632);expect(zoomed.y+zoomed.height).toBeLessThanOrEqual(464);
 await page.evaluate(()=>(window as unknown as {setTestViewport:(next:object)=>void}).setTestViewport({width:1024,height:768,offsetLeft:120,offsetTop:80,scale:1,innerWidth:1024,innerHeight:768}));
 await expect(page.locator('html')).toHaveCSS('--sv-visual-left','0px');await expect(page.locator('html')).toHaveCSS('--sv-visual-top','0px');await expect(name).toBeFocused();
 await expect.poll(async()=>Math.abs((await dialog.boundingBox())!.x-initial.x)).toBeLessThan(1);await expect.poll(async()=>Math.abs((await dialog.boundingBox())!.y-initial.y)).toBeLessThan(1);
 mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/${browserName}-dialog-restored.png`});await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
 await expect.poll(async()=>Math.abs((await action.boundingBox())!.x-before.x)).toBeLessThan(1);await expect.poll(async()=>Math.abs((await action.boundingBox())!.y-before.y)).toBeLessThan(1);expect(await page.evaluate(()=>localStorage.getItem('studyvillage-hud-layout-v1'))).toBe(saved);
 await page.screenshot({path:`${output}/${browserName}-hud-restored.png`});
});

test('browser page-scale zoom stays enabled and returns controls to their original position',async({page,browserName})=>{
 test.skip(browserName!=='chromium','CDP page-scale emulation is Chromium-only; visual viewport contract is separately tested in WebKit');
 await page.goto('/');const action=page.getByTestId('touch-action-btn');await expect(action).toBeVisible();const before=(await action.boundingBox())!;const session=await page.context().newCDPSession(page);
 await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});await expect.poll(()=>page.evaluate(()=>window.visualViewport!.scale)).toBe(2);
 await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await expect.poll(()=>page.evaluate(()=>window.visualViewport!.scale)).toBe(1);
 await expect.poll(async()=>Math.abs((await action.boundingBox())!.x-before.x)).toBeLessThan(1);await expect.poll(async()=>Math.abs((await action.boundingBox())!.y-before.y)).toBeLessThan(1);await session.detach();
});

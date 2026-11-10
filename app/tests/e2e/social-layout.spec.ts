import {test,expect} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
for(const [width,height,touch] of [[390,844,true],[844,390,true],[820,1180,true],[1180,820,true],[1440,1000,false]] as const){
 test(`contained menus and garden ${width}x${height}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:width<600});const page=await context.newPage();await page.goto('/');
 await openPhoneApp(page,'village');const screen=page.locator('.sv-phone-screen');await expect(screen).toBeVisible();const box=await screen.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);expect(box!.y+box!.height).toBeLessThanOrEqual(height+1);
 await page.keyboard.press('Escape');await openPhoneApp(page,'garden');
 const canvas=page.locator('.sv-garden-preview canvas');await page.waitForTimeout(300);const sizes=[];for(let i=0;i<8;i++){sizes.push(await canvas.evaluate((c:HTMLCanvasElement)=>({w:c.width,h:c.height})));await page.waitForTimeout(50);}expect(new Set(sizes.map(s=>JSON.stringify(s))).size).toBe(1);
 if(touch&&width>=600&&height>600){const garden=await page.locator('.sv-garden-preview').boundingBox();expect(garden!.height).toBeGreaterThan(height*.59);}
 await context.close();
 });
}
test('controller settings explain pairing and limits; local stop is next to start',async({page})=>{
 await page.goto('/');await openPhoneApp(page,'settings');await page.getByRole('tab',{name:'Controles',exact:true}).click();await expect(page.getByText('Conecta el mando por USB',{exact:false})).toBeVisible();await page.getByRole('dialog',{name:'Ajustes',exact:true}).getByRole('button',{name:'Cerrar',exact:true}).click();
 await openPhoneApp(page,'tetris');await page.getByRole('button',{name:'Comenzar',exact:true}).click();const controls=page.locator('.sv-tetris-round-controls');await expect(controls.getByRole('button',{name:'Terminar partida',exact:true})).toBeVisible();await controls.getByRole('button',{name:'Terminar partida',exact:true}).click();await controls.getByRole('button',{name:'¿Terminar para todos?',exact:true}).click();await expect(controls.getByRole('button',{name:'Comenzar',exact:true})).toBeEnabled();
});

test('one controller instance handles presses and releases on disconnect',async({page})=>{
 await page.addInitScript(()=>{
  for(const key of ['studyvillage-gamepad','studyvillage-control-help'])if(localStorage.getItem(key)===null)localStorage.setItem(key,'on');
  const pad={index:0,id:'Test controller',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};(window as any).testPad=pad;Object.defineProperty(navigator,'getGamepads',{value:()=>pad.connected?[pad]:[]});
 });
 await page.goto('/');await openPhoneApp(page,'settings');await page.getByRole('tab',{name:'Controles',exact:true}).click();await expect(page.getByRole('dialog',{name:'Ajustes',exact:true}).getByText('Mando conectado',{exact:true})).toHaveCount(1);await page.waitForTimeout(300);await expect(page.getByRole('dialog',{name:'Ajustes',exact:true}).getByText('Mando conectado',{exact:true})).toHaveCount(1);
 // Close the menu and press Start in the same frame: a fresh press must survive the context change.
 await page.getByRole('dialog',{name:'Ajustes',exact:true}).getByRole('button',{name:'Cerrar',exact:true}).evaluate(button=>new Promise<void>(resolve=>requestAnimationFrame(()=>{(button as HTMLButtonElement).click();(window as any).testPad.buttons[9].pressed=true;resolve();})));
 await expect(page.locator('.sv-phone')).toBeVisible();await page.waitForTimeout(80);await expect(page.locator('.sv-phone')).toBeVisible();await page.evaluate(()=>{(window as any).testPad.buttons[9].pressed=false;});await page.waitForTimeout(80);
 await page.evaluate(()=>{(window as any).testPad.buttons[1].pressed=true;});await expect(page.locator('.sv-phone')).toBeHidden();await page.evaluate(()=>{(window as any).testPad.connected=false;});
});

test('shared windows move and resize locally and stay contained after rotation',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();await page.evaluate(async()=>{
  const path='/src/input/media-window.ts';const {mediaWindow}=await import(path);const root=document.createElement('section'),head=document.createElement('header');head.className='sv-media-tile-head';head.textContent='Test screen';root.id='window-fixture';root.append(head,document.createElement('video'));document.body.append(root);(window as any).disposeWindow=mediaWindow(root,head,0);
 });
 const root=page.locator('#window-fixture'),before=(await root.boundingBox())!;await page.mouse.move(before.x+20,before.y+10);await page.mouse.down();await page.mouse.move(before.x+120,before.y+90,{steps:4});await page.mouse.up();expect((await root.boundingBox())!.x).toBeGreaterThan(before.x+50);
 const grip=page.getByRole('button',{name:'Cambiar tamaño',exact:true});await grip.focus();await page.keyboard.press('ArrowLeft');expect((await root.boundingBox())!.width).toBeLessThan(before.width);
 await page.setViewportSize({width:390,height:300});await expect(async()=>{const rect=(await root.boundingBox())!;expect(rect.x+rect.width).toBeLessThanOrEqual(390);expect(rect.y+rect.height).toBeLessThanOrEqual(300);}).toPass({timeout:5000});
 await root.getByRole('button',{name:'Minimizar',exact:true}).click();await expect(root.locator('video')).toBeHidden();await root.getByRole('button',{name:'Restaurar',exact:true}).click();await expect(root.locator('video')).toBeVisible();
});

test('camera hide stays outside the image and preserves the local stream',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();await page.evaluate(async()=>{
  const path='/src/ui/game-camera-ui.ts';const {GameCameraDock}=await import(path);const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const stream=canvas.captureStream();const root=document.createElement('section');root.className='sv-activity';root.dataset.kind='tetris';root.style.background='#eef';document.body.append(root);
  const dock=new GameCameraDock(async()=>{});dock.mount(root);dock.update({identity:{fingerprint:'test'},network:{gameCamera:{local:stream,pending:false,error:null,remote:[]},members:[]}});(window as any).cameraFixture={dock,stream};
 });
 const hide=page.getByRole('button',{name:'Ocultar cámara',exact:true}),video=page.locator('.sv-game-camera video');const h=(await hide.boundingBox())!,v=(await video.boundingBox())!;expect(h.y+h.height).toBeLessThanOrEqual(v.y+1);await hide.click();await expect(video).toBeHidden();expect(await page.evaluate(()=>(window as any).cameraFixture.stream.getTracks()[0].readyState)).toBe('live');await page.getByRole('button',{name:'Mostrar cámara',exact:true}).click();await expect(video).toBeVisible();
});

test('friend and voice requests use one dismissible notice without repeating',async({page})=>{
 await page.goto('/?diagnostic=1');await page.evaluate(async rootPath=>{
  const paths=['/src/ui/app.ts',`/@fs${rootPath}/packages/core/src/identity/index.ts`,`/@fs${rootPath}/packages/runtime/src/session/client.ts`,'/src/house/initial.ts','/src/assets/sprite-catalog.ts'];
  const [{createStudyUI},{generateIdentity},{VillageClient},{initialHouse},{loadSpriteCatalog}]=await Promise.all(paths.map(p=>import(p)));await loadSpriteCatalog();
  const identity=await generateIdentity('Viewer','#336699'),house=initialHouse(identity.public.fingerprint),client=new VillageClient(identity,house);
  const actions:any=Object.fromEntries(Object.getOwnPropertyNames(Object.getPrototypeOf(client)).filter(k=>typeof client[k]==='function').map(k=>[k,client[k].bind(client)]));Object.assign(actions,{updateOwnHouse:()=>{},saveHouseLayout:async()=>{},dismissNotice:()=>{},friendCommand:()=>{}});
  const ui=createStudyUI(document.querySelector('#app')!,actions),view={identity:identity.public,network:client.view,ownHouse:house,contacts:[],friendCode:'test',storage:'memory',identitySaved:false,lockedIdentity:false,notice:null,diagnostics:[],editorText:''};
  (window as any).requestFixture={ui,view};ui.update(view);
 },process.cwd());
 await page.evaluate(()=>{const {ui,view}=(window as any).requestFixture;view.network.friends={incoming:[{id:'request-1',from:{displayName:'Alice'},to:view.identity,accepted:false}],outgoing:[],accepted:[]};ui.update(view);});
 const toast=page.locator('.sv-notice.sv-hud-toast');await expect(toast).toContainText('Alice');await toast.getByRole('button',{name:'Cerrar aviso'}).click();await page.evaluate(()=>{const {ui,view}=(window as any).requestFixture;ui.update(view);});await expect(toast).toBeHidden();
 await page.evaluate(()=>{const {ui,view}=(window as any).requestFixture;view.network.voice={...view.network.voice,invitations:[{id:'voice-1',kind:'call',from:'bob',to:view.identity.fingerprint,name:'Bob'}]};view.network.voiceDirectory=[{fingerprint:'bob',displayName:'Bob'}];ui.update(view);});await expect(toast).toContainText('Bob');await expect(page.locator('.sv-notice:visible')).toHaveCount(1);await expect(toast).toBeHidden({timeout:8000});
});

test('iPad invitation remains reachable above a simulated onscreen keyboard',async({page})=>{
 await page.setViewportSize({width:820,height:1180});await page.goto('/');await openPhoneApp(page,'village');const input=page.getByPlaceholder('Pega una invitación');await input.focus();
 await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:420});window.visualViewport!.dispatchEvent(new Event('resize'));});await input.fill('test-code');await page.waitForTimeout(300);
 const rect=(await input.boundingBox())!;expect(rect.y).toBeGreaterThanOrEqual(0);expect(rect.y+rect.height).toBeLessThanOrEqual(420);await expect(input).toHaveValue('test-code');await expect(page.getByRole('button',{name:'Unirme',exact:true})).toBeInViewport();
});
for(const zoom of [2,2.05,2.5])test(`garden stable at effective ${zoom*100}% desktop viewport`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:Math.floor(1440/zoom),height:Math.floor(1000/zoom)},deviceScaleFactor:zoom});const page=await context.newPage();await page.goto('/');await openPhoneApp(page,'garden');await page.waitForTimeout(300);const sizes=await page.locator('.sv-garden-preview canvas').evaluate(async(c:HTMLCanvasElement)=>{const values=[];for(let i=0;i<30;i++){await new Promise(requestAnimationFrame);values.push(`${c.width}:${c.height}`);}return values;});expect(new Set(sizes).size).toBe(1);await context.close();
});

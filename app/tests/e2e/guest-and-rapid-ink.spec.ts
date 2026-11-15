import {test,expect} from '@playwright/test';
import {openPhoneApp} from '../../../scripts/phone-ui.mjs';
import {openDecorate} from './root-polish-helpers';
import {savedStrokes} from './board-storage';

test('locked identity offers guest connection without losing the encrypted identity',async({page})=>{
 await page.goto('/');await openPhoneApp(page,'identity');
 await page.getByLabel('Contraseña (12+ caracteres)').fill('guest regression password');
 await page.getByRole('button',{name:'Cifrar y guardar',exact:true}).click();
 await expect(page.getByText('Identidad guardada cifrada. Necesitarás esta contraseña al reiniciar.',{exact:true}).first()).toBeVisible();
 // Exporting also exercises the supported saved-identity path before and after guest use.
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar identidad cifrada',exact:true}).click();const before=await download;const stream=await before.createReadStream();let original='';for await(const b of stream!)original+=b;
 await page.reload();await openPhoneApp(page,'identity');await page.getByRole('button',{name:'Desbloquear identidad',exact:true}).click();const lock=page.locator('.sv-lock-card');await expect(lock).toBeVisible();
 await lock.getByLabel('Contraseña',{exact:true}).fill('wrong password');await lock.getByRole('button',{name:'Desbloquear identidad',exact:true}).click();await expect(lock.locator('.sv-error')).not.toBeEmpty();
 await lock.getByRole('button',{name:'Continuar como invitado',exact:true}).click();await expect(lock).toBeHidden();
 await openPhoneApp(page,'village');await expect(page.getByRole('button',{name:'Abrir mi aldea a otras personas',exact:true})).toBeEnabled();
 await page.keyboard.press('Escape');await openPhoneApp(page,'identity');
 const again=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar identidad cifrada',exact:true}).click();const after=await again;const next=await after.createReadStream();let preserved='';for await(const b of next!)preserved+=b;expect(JSON.parse(preserved).identity).toEqual(JSON.parse(original).identity);
 await page.getByRole('button',{name:'Desbloquear identidad',exact:true}).click();await expect(lock).toBeVisible();await lock.getByLabel('Contraseña',{exact:true}).fill('guest regression password');await lock.getByRole('button',{name:'Desbloquear identidad',exact:true}).click();await expect(lock).toBeHidden();
 await expect(page.getByText('Identidad desbloqueada; tus contactos pueden reconocer tu huella.',{exact:true}).first()).toBeVisible();
});

for(const initial of [0,2500])test(`rapid pen strokes on ${initial} objects recover from a canvas failure and persist`,async({page})=>{
 if(initial)await page.addInitScript(count=>{if(localStorage.getItem('rapid-seeded'))return;localStorage.setItem('rapid-seeded','1');const boardId='house:own:board:board';localStorage.setItem('studyvillage-whiteboards-v1',JSON.stringify({metadata:[],elements:[],strokes:[[boardId,Array.from({length:count},(_,n)=>({id:'seed'+n,boardId,author:'a'.repeat(64),seq:1,tool:'pen',color:'#315f51',width:3,deleted:false,points:[{x:100+n%100,y:100+Math.floor(n/100)},{x:101+n%100,y:102+Math.floor(n/100)}]}))]]}));},initial);
 await page.goto('/');const editor=await openDecorate(page);await editor.locator('.sv-furniture-item').filter({hasText:'Pizarra'}).dblclick();
 const board=page.getByLabel('Pizarra para dibujar');await expect(board).toBeVisible();
 await board.evaluate(async element=>{
  const canvas=element as HTMLCanvasElement,b=canvas.getBoundingClientRect();canvas.setPointerCapture=()=>{};canvas.hasPointerCapture=()=>false;
  const ctx=canvas.getContext('2d')!,draw=ctx.drawImage.bind(ctx);let fail=true;
  ctx.drawImage=((...args:any[])=>{if(fail){fail=false;throw Error('Synthetic transient canvas failure');}return (draw as any)(...args);}) as typeof ctx.drawImage;
  for(let i=0;i<80;i++){
   for(const [type,dx]of [['pointerdown',0],['pointermove',4],['pointermove',8],['pointerup',12]] as const){canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:i+1,pointerType:'pen',buttons:type==='pointerup'?0:1,clientX:b.left+20+i%10*20+dx,clientY:b.top+30+Math.floor(i/10)*15,pressure:.5}));}
   await new Promise(resolve=>setTimeout(resolve,8));
  }
 });
 await expect.poll(async()=>(await savedStrokes(page)).length,{timeout:20000}).toBe(initial+80);
 const before=await board.screenshot();await page.getByRole('button',{name:'↶ Deshacer',exact:true}).click();await expect.poll(async()=>(await savedStrokes(page)).length).toBe(initial+79);
 await expect.poll(async()=>Buffer.compare(before,await board.screenshot())).not.toBe(0);
 await page.reload();expect(await savedStrokes(page)).toHaveLength(initial+79);
});

test('a locked saved identity hosts a signed village and another local browser joins',async({browser,browserName})=>{
 test.skip(browserName!=='chromium','Local WebRTC transport check runs in Chromium.');
 const sockets=new Map<string,import('@playwright/test').WebSocketRoute>();
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 try{
  for(const context of contexts){
   // Intercept PeerJS discovery/signaling entirely inside the test process.
   // Real data channels and cryptographic village authentication remain active.
   await context.route(/peerjs\.com/,route=>route.fulfill({status:200,contentType:'text/plain',body:crypto.randomUUID(),headers:{'Access-Control-Allow-Origin':'*'}}));
   await context.routeWebSocket(/peerjs\.com/,socket=>{
    const id=new URL(socket.url()).searchParams.get('id')!;sockets.set(id,socket);socket.send(JSON.stringify({type:'OPEN'}));
    socket.onMessage(message=>{const data=JSON.parse(String(message));if(data.dst)sockets.get(data.dst)?.send(JSON.stringify({...data,src:id}));});
    socket.onClose(()=>sockets.delete(id));
   });
   await context.addInitScript(()=>{const Native=RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(config?:RTCConfiguration){super({...config,iceServers:[]});}};});
  }
  const host=await contexts[0].newPage(),guest=await contexts[1].newPage();
  await host.goto('/');await openPhoneApp(host,'identity');await host.getByLabel('Contraseña (12+ caracteres)').fill('local hosting password');await host.getByRole('button',{name:'Cifrar y guardar',exact:true}).click();await expect(host.getByText(/Identidad guardada cifrada/).first()).toBeVisible();await host.reload();
  await openPhoneApp(host,'village');await host.getByRole('button',{name:'Abrir mi aldea a otras personas',exact:true}).click();
  const invite=host.getByLabel('Invitación actual',{exact:true});await expect(invite).not.toHaveValue('',{timeout:20000});
  await guest.goto('/');await openPhoneApp(guest,'village');await guest.getByPlaceholder('Pega una invitación').fill(await invite.inputValue());await guest.getByRole('button',{name:'Unirme',exact:true}).click();
  await host.locator('.sv-hud-card').getByRole('button',{name:'Permitir',exact:true}).click({timeout:20000});await expect(guest.locator('.sv-status-pill')).toHaveText(/en la aldea/,{timeout:20000});
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});

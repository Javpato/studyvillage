import { existsSync } from 'node:fs';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Two real clients on one machine, joined through the real PeerJS cloud
// signaling server, with Chrome's fake microphone. It needs internet access,
// so it is opt-in:  STUDYVILLAGE_LIVE=1 npm run test:e2e
// It proves the protocol end to end. It does NOT prove two separate machines
// or networks, where NAT can still block direct WebRTC.
test.skip(!process.env.STUDYVILLAGE_LIVE, 'needs internet; set STUDYVILLAGE_LIVE=1');
test.use({
  permissions: ['microphone', 'camera'],
  launchOptions: {
    executablePath: process.env.CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined),
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  },
});

const audience = (page: Page) => page.locator('.sv-media-card .sv-subtle').first();
const hearsSomeone = (page: Page) => page.waitForFunction(() => [...document.querySelectorAll('.sv-media-tile audio')]
  .some((el) => (el as HTMLAudioElement).srcObject instanceof MediaStream
    && ((el as HTMLAudioElement).srcObject as MediaStream).getAudioTracks().some((t) => t.readyState === 'live')), null, { timeout: 30_000 });

async function phoneApp(page: Page, app: string): Promise<void> {
  if (await page.locator('.sv-phone').isHidden()) await page.getByTestId('phone-button').click();
  else if (await page.locator('.sv-phone-head [aria-label="Volver"]').isVisible()) await page.locator('.sv-phone-head [aria-label="Volver"]').click();
  await page.getByTestId(`phone-${app}`).click();
}

/** Opens a named client in its own context and joins the first one's village. */
async function village(browser: Browser, names: string[], contexts: BrowserContext[]): Promise<Page[]> {
  const pages: Page[] = [];
  for (const name of names) {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage();
    await page.goto('/');
    await phoneApp(page, 'settings');
    await page.getByLabel('Nombre visible', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    pages.push(page);
  }
  const [host, ...guests] = pages;
  await phoneApp(host, 'village');
  await host.getByRole('button', { name: 'Abrir mi aldea a otras personas' }).click();
  const invite = host.getByLabel('Invitación actual', { exact: true });
  await expect(invite).not.toHaveValue('', { timeout: 30_000 });
  for (const guest of guests) {
    await phoneApp(guest, 'village');
    await guest.getByPlaceholder('Pega una invitación').fill(await invite.inputValue());
    await guest.getByRole('button', { name: 'Unirme', exact: true }).click();
    // The request appears as a card in the corner of the host's screen.
    await host.locator('.sv-hud-card').getByRole('button', { name: 'Permitir', exact: true }).click({ timeout: 30_000 });
    await expect(guest.locator('.sv-status-pill')).toHaveText(/en la aldea/, { timeout: 30_000 });
  }
  for (const page of pages) await page.keyboard.press('Escape');
  return pages;
}

test('two players talk in the village, then privately, then hang up', async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  try {
    const [ana, beto] = await village(browser, ['Ana', 'Beto'], contexts);
    await phoneApp(ana, 'voice');
    await phoneApp(beto, 'voice');

    // Outside any house: one public room, the village.
    await expect(audience(ana)).toHaveText(/^La aldea · 1/, { timeout: 30_000 });
    await ana.getByRole('button', { name: 'Activar micro' }).click();
    await beto.getByRole('button', { name: 'Activar micro' }).click();
    await hearsSomeone(beto);
    await hearsSomeone(ana);

    // Private call, by mutual choice. Changing channels revokes capture until each person enables it again.
    await ana.locator('.sv-voice-channels summary',{hasText:'Llamada directa'}).click();
    await ana.locator('.sv-voice-channels').getByRole('button',{name:'Beto',exact:true}).click();
    await beto.locator('.sv-private-request').getByRole('button', { name: 'Aceptar' }).click();
    await expect(audience(ana)).toHaveText(/^Privado con Beto · 1/, { timeout: 20_000 });
    await expect(ana.getByRole('button', { name: 'Activar micro' })).toBeVisible();
    await expect(beto.getByRole('button', { name: 'Activar micro' })).toBeVisible();
    await ana.getByRole('button', { name: 'Activar micro' }).click();
    await beto.getByRole('button', { name: 'Activar micro' }).click();
    await hearsSomeone(beto);await hearsSomeone(ana);

    // Hanging up widens the audience, so the mic is switched off again.
    await ana.locator('.sv-voice-channels').getByRole('button', { name: 'Volver a voz de ubicación',exact:true }).click();
    await expect(audience(ana)).toHaveText(/^La aldea · 1/, { timeout: 20_000 });
    await expect(ana.getByRole('button', { name: 'Activar micro' })).toBeVisible();
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('portal travel separates avatars and public media across areas, including stationary arrivals', async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  try {
    const [host, guest] = await village(browser, ['PortalHost', 'PortalGuest'], contexts);
    const hostCanvas = host.locator('.sv-stage-pane canvas');
    const guestCanvas = guest.locator('.sv-stage-pane canvas');
    await expect(hostCanvas).toHaveAttribute('aria-label', /PortalGuest/, { timeout: 30_000 });
    await expect(guestCanvas).toHaveAttribute('aria-label', /PortalHost/);
    const walkTo = async (page: Page, key: string, label: string) => {
      await page.keyboard.down(key);
      try { await expect(page.locator('.sv-touch-btn-label').last()).toContainText(label, { timeout: 12_000 }); }
      finally { await page.keyboard.up(key); }
      await page.keyboard.press('e');
    };
    await walkTo(guest, 'w', 'Ir a Plaza Comunitaria');
    await expect(guestCanvas).toHaveAttribute('aria-label', /^Plaza Comunitaria · Personas aquí: PortalGuest$/);
    await expect(hostCanvas).toHaveAttribute('aria-label', /^La aldea · Personas aquí: PortalHost$/);
    await expect(audience(host)).toHaveText(/^La aldea · 0/);
    await expect(audience(guest)).toHaveText(/^Plaza Comunitaria · 0/);

    await walkTo(host, 'w', 'Ir a Plaza Comunitaria');
    await expect(hostCanvas).toHaveAttribute('aria-label', /PortalGuest/);
    await expect(guestCanvas).toHaveAttribute('aria-label', /PortalHost/);
    await expect(audience(host)).toHaveText(/^Plaza Comunitaria · 1/);

    // The guest is still standing at the arrival: E goes back through the west portal.
    await guest.keyboard.press('e');
    await expect(guestCanvas).toHaveAttribute('aria-label', /^La aldea · Personas aquí: PortalGuest$/);
    await walkTo(guest, 's', 'Ir a Biblioteca de Estudio');
    await expect(guestCanvas).toHaveAttribute('aria-label', /^Biblioteca y Taller de Estudio · Personas aquí: PortalGuest$/);
    await expect(hostCanvas).toHaveAttribute('aria-label', /^Plaza Comunitaria · Personas aquí: PortalHost$/);
    await expect(audience(guest)).toHaveText(/^Biblioteca y Estudio · 0/);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('the group shares projects and plays one werewolves table, each seeing only their own card', async ({ browser }) => {
  test.setTimeout(150_000);
  const contexts: BrowserContext[] = [];
  try {
    const [ana, beto] = await village(browser, ['Ana', 'Beto'], contexts);

    // A project created by the guest appears on the host's board, and back.
    await phoneApp(beto, 'projects');
    await beto.getByRole('button', { name: 'Crear el primer proyecto' }).click();
    await beto.getByPlaceholder('Proyecto final de Programación').fill('Proyecto de grupo');
    await beto.getByPlaceholder('https://github.com/usuario/proyecto').fill('https://github.com/Javpato/HACKATHON');
    await beto.getByRole('button', { name: 'Crear proyecto' }).click();
    await phoneApp(ana, 'projects');
    await expect(ana.getByRole('heading', { name: 'Proyecto de grupo' })).toBeVisible({ timeout: 15_000 });
    await ana.getByPlaceholder(/Nueva tarea/).fill('Pantalla de inicio');
    await ana.getByRole('button', { name: 'Añadir', exact: true }).click();
    await expect(beto.getByText('Pantalla de inicio')).toBeVisible({ timeout: 15_000 });
    await ana.keyboard.press('Escape');
    await beto.keyboard.press('Escape');

    // Both walk to the campfire by clicking: portal, then the fire.
    for (const page of [ana, beto]) {
      const canvas = page.locator('.sv-stage-pane canvas');
      const box = (await canvas.boundingBox())!;
      await canvas.dblclick({ position: { x: box.width * 240 / 768, y: box.height * 50 / 432 } });
      await expect(page.getByRole('heading', { name: 'Plaza Comunitaria', exact: true })).toBeVisible({ timeout: 10_000 });
      await canvas.dblclick({ position: { x: box.width * 384 / 768, y: box.height * 205 / 432 } });
      await expect(page.getByRole('heading', { name: 'La mesa de la hoguera' })).toBeVisible({ timeout: 10_000 });
    }
    await ana.getByRole('button', { name: 'Sentarme a la mesa' }).click();
    await beto.getByRole('button', { name: 'Sentarme a la mesa' }).click();
    await expect(ana.locator('.ww-seat-name', { hasText: 'Beto' })).toBeVisible({ timeout: 10_000 });
    // Only the host deals; the guest waits.
    await expect(beto.getByText(/Esperando a que Ana reparta/)).toBeVisible();
    await ana.getByRole('button', { name: 'Añadir bot' }).click();
    await ana.getByRole('button', { name: 'Añadir bot' }).click();
    await ana.getByRole('button', { name: 'Repartir cartas' }).click();
    for (const page of [ana, beto]) {
      await expect(page.getByRole('heading', { name: 'Mira tu carta' })).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('.ww-card-team')).toBeVisible();
    }
    // With four players there is one wolf, so neither human can see the other's card.
    await expect(beto.locator('.ww-seat', { hasText: 'Ana' }).locator('[aria-label="Carta oculta"]')).toBeVisible();
    await expect(ana.locator('.ww-seat', { hasText: 'Beto' }).locator('[aria-label="Carta oculta"]')).toBeVisible();
    await ana.getByRole('button', { name: 'Entendido' }).click();
    await beto.getByRole('button', { name: 'Entendido' }).click();
    for (const page of [ana, beto]) await expect(page.getByRole('heading', { name: 'Noche 1' })).toBeVisible({ timeout: 10_000 });
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('host and guest answer the same quiz with hidden solutions and can stop it for everyone', async ({ browser }) => {
  test.setTimeout(120000);const contexts:BrowserContext[]=[];
  try {
    const [host,guest]=await village(browser,['QuizHost','QuizGuest'],contexts);
    await phoneApp(host,'study');const study=host.getByRole('region',{name:'Estudio',exact:true});
    await study.getByRole('button',{name:/^Quiz/}).click();await study.getByRole('button',{name:/Crear un quiz/}).click();await study.getByLabel('Nombre del quiz').fill('Concurso');await study.getByRole('button',{name:'Crear',exact:true}).click();
    await study.getByLabel('Pregunta',{exact:true}).fill('Pregunta de concurso');await study.getByLabel('Respuesta 1',{exact:true}).fill('Correcta');await study.getByLabel('Respuesta 2',{exact:true}).fill('Incorrecta');await study.getByRole('button',{name:'Añadir pregunta',exact:true}).click();
    await study.getByRole('button',{name:'← Volver',exact:true}).click();await study.getByRole('button',{name:'Jugar',exact:true}).click();await study.getByRole('button',{name:'Crear concurso en la aldea'}).click();
    await phoneApp(guest,'study');const guestStudy=guest.getByRole('region',{name:'Estudio',exact:true});await guestStudy.getByRole('button',{name:/^Quiz/}).click();await guestStudy.getByRole('button',{name:/Jugar un quiz/}).click();await guestStudy.getByRole('button',{name:'Unirme al concurso de la aldea'}).click();
    await expect(study.getByText('2 participantes')).toBeVisible({timeout:15000});await study.getByRole('button',{name:'Comenzar concurso'}).click();
    await expect(guestStudy.getByRole('heading',{name:'Pregunta de concurso'})).toBeVisible({timeout:15000});await expect(guestStudy.getByText('Respuesta correcta: Correcta')).toHaveCount(0);
    await guestStudy.getByRole('button',{name:'Correcta',exact:true}).click();await expect(guestStudy.getByText('Respuesta enviada. Esperando al resto…')).toBeVisible();await expect(guestStudy.getByText('Respuesta correcta: Correcta')).toHaveCount(0);
    await study.getByRole('button',{name:'Correcta',exact:true}).click();await expect(study.getByText('Respuesta correcta: Correcta')).toBeVisible({timeout:15000});await expect(guestStudy.getByText(/QuizGuest · (?:[5-9]\d\d|1000) puntos/)).toBeVisible();
    await study.locator('summary',{hasText:'Opciones del concurso'}).click();await study.getByRole('button',{name:'Terminar concurso',exact:true}).click();await study.getByRole('button',{name:'Confirmar fin para todos',exact:true}).click();await expect(guestStudy.getByText('El concurso ha terminado. Puedes empezar otro cuando quieras.')).toBeVisible({timeout:15000});
  } finally {await Promise.all(contexts.map(c=>c.close()));}
});

test('the village host can stop Werewolves without taking a seat', async ({ browser }) => {
  test.setTimeout(120000);const contexts:BrowserContext[]=[];
  try {
    const [host,guest]=await village(browser,['ObserverHost','Organizer'],contexts);
    const reach=async(page:Page)=>{const canvas=page.locator('.sv-stage-pane canvas');let box=(await canvas.boundingBox())!;await canvas.dblclick({position:{x:box.width*240/768,y:box.height*50/432}});await expect(page.locator('.sv-hud-place h1')).toHaveText('Plaza Comunitaria',{timeout:15000});box=(await canvas.boundingBox())!;await canvas.dblclick({position:{x:box.width*384/768,y:box.height*210/432}});await expect(page.getByRole('region',{name:'Hombres lobo'})).toBeVisible({timeout:15000});};
    await reach(guest);await guest.getByRole('button',{name:'Sentarme a la mesa'}).click();await expect(guest.getByRole('button',{name:'Repartir cartas'})).toBeDisabled();await expect(guest.getByRole('button',{name:'Añadir bot',exact:true})).toHaveCount(0);
    await reach(host);for(let i=0;i<3;i++)await host.getByRole('button',{name:'Añadir bot',exact:true}).click();await host.getByRole('button',{name:'Repartir cartas'}).click();await expect(guest.getByRole('heading',{name:'Mira tu carta'})).toBeVisible();await expect(host.locator('.ww-seat.is-me')).toHaveCount(0);
    await host.getByRole('button',{name:'Terminar partida',exact:true}).click();await host.getByRole('button',{name:'¿Terminar para todos?',exact:true}).click();await expect(guest.getByRole('heading',{name:'La mesa de la hoguera'})).toBeVisible({timeout:15000});
  } finally {await Promise.all(contexts.map(c=>c.close()));}
});


test('game cameras share video only inside the same open game and stop when it closes', async ({browser})=>{
  test.setTimeout(120_000);const contexts:BrowserContext[]=[];
  try {
    const [host,guest]=await village(browser,['Cámara anfitrión','Cámara invitado'],contexts);
    const reach=async(page:Page,game:'werewolves'|'gartic')=>{
      const canvas=page.locator('.sv-stage-pane canvas');let box=(await canvas.boundingBox())!;
      await canvas.dblclick({position:{x:box.width*240/768,y:box.height*50/432}});await expect(page.locator('.sv-hud-place h1')).toHaveText('Plaza Comunitaria',{timeout:15000});
      box=(await canvas.boundingBox())!;await canvas.dblclick({position:{x:box.width*(game==='werewolves'?384:169)/768,y:box.height*(game==='werewolves'?210:110)/432}});
      await expect(page.locator(game==='werewolves'?'.ww':'.gp')).toBeVisible({timeout:15000});
    };
    await reach(host,'werewolves');await reach(guest,'gartic');
    await host.getByTestId('expansion-modal-overlay').getByRole('button',{name:'Activar cámara',exact:true}).click();await guest.getByTestId('expansion-modal-overlay').getByRole('button',{name:'Activar cámara',exact:true}).click();
    await expect(host.locator('.sv-game-camera-tile')).toHaveCount(1);await expect(guest.locator('.sv-game-camera-tile')).toHaveCount(1);
    await guest.getByTestId('expansion-modal-close').click();
    const canvas=guest.locator('.sv-stage-pane canvas');const box=(await canvas.boundingBox())!;await canvas.dblclick({position:{x:box.width*384/768,y:box.height*210/432}});
    await expect(guest.locator('.ww')).toBeVisible({timeout:15000});
    await expect(guest.getByLabel('Cámara de Cámara anfitrión',{exact:true})).toBeVisible({timeout:25000});
    await expect.poll(()=>guest.getByLabel('Cámara de Cámara anfitrión',{exact:true}).evaluate(v=>(v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await guest.getByTestId('expansion-modal-overlay').getByRole('button',{name:'Activar cámara',exact:true}).click();await expect(host.locator('.sv-game-camera-tile')).toHaveCount(2,{timeout:25000});
    await expect.poll(()=>host.getByLabel('Cámara de Cámara invitado',{exact:true}).evaluate(v=>(v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await host.screenshot({path:'/tmp/camera-two-clients.png',animations:'disabled'});
    await guest.getByTestId('expansion-modal-close').click();await expect(host.locator('.sv-game-camera-tile')).toHaveCount(1,{timeout:15000});
    await host.getByTestId('expansion-modal-close').click();await expect(host.locator('.sv-game-camera')).toHaveCount(0);
  } finally {await Promise.all(contexts.map(c=>c.close()));}
});

test('floating cameras keep their capture and reconnect only after both people reach the same scene', async ({browser})=>{
  test.setTimeout(120_000);const contexts:BrowserContext[]=[];
  try {
    const pages=await village(browser,['Travel camera host','Travel camera guest'],contexts);
    for(const page of pages){
      await page.evaluate(()=>{
        type Proof={requests:number;local:MediaStream|null;seen:Map<string,MediaStream>};
        const proof:Proof={requests:0,local:null,seen:new Map()};(window as unknown as {floatingCameraProof:Proof}).floatingCameraProof=proof;
        const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await capture(constraints);if(constraints?.video){proof.requests++;proof.local=stream;}return stream;};
        const draw=CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage=function(this:CanvasRenderingContext2D,...args:Parameters<typeof draw>){if(this.canvas.matches('.sv-stage-pane canvas')&&args[0] instanceof HTMLVideoElement&&args[0].srcObject instanceof MediaStream)proof.seen.set(args[0].srcObject.id,args[0].srcObject);Reflect.apply(draw,this,args);} as typeof draw;
      });
      await page.getByTestId('world-camera').click();
    }
    const proof=(page:Page)=>page.evaluate(()=>{const p=(window as unknown as {floatingCameraProof:{requests:number;local:MediaStream|null;seen:Map<string,MediaStream>}}).floatingCameraProof;return{requests:p.requests,id:p.local?.id,state:p.local?.getVideoTracks()[0].readyState,visible:[...p.seen.values()].filter(s=>s.getVideoTracks().some(t=>t.readyState==='live')).length};});
    for(const page of pages)await expect.poll(async()=>(await proof(page)).visible,{timeout:25000}).toBe(2);
    const original=await Promise.all(pages.map(proof));
    const portal=async(page:Page,x:number,y:number,title:string)=>{const canvas=page.locator('.sv-stage-pane canvas'),box=(await canvas.boundingBox())!;await canvas.dblclick({position:{x:box.width*x/768,y:box.height*y/432}});await expect(page.locator('.sv-hud-place h1')).toHaveText(title,{timeout:15000});};
    for(const destination of [{x:240,y:50,title:'Plaza Comunitaria'},{x:384,y:394,title:'La aldea'}]){
      await portal(pages[0],destination.x,destination.y,destination.title);
      for(const page of pages)await expect.poll(async()=>(await proof(page)).visible).toBe(1);
      await portal(pages[1],destination.x,destination.y,destination.title);
      for(const [i,page] of pages.entries()){
        await expect.poll(async()=>(await proof(page)).visible,{timeout:25000}).toBe(2);
        expect(await proof(page)).toMatchObject({requests:1,id:original[i].id,state:'live'});
        await expect(page.getByTestId('world-camera')).toHaveAttribute('aria-pressed','true');
      }
    }
    await phoneApp(pages[1],'village');await pages[1].getByRole('button',{name:'Salir de la sesión',exact:true}).click();
    await expect.poll(async()=>(await proof(pages[1])).state).toBe('ended');
    await expect.poll(async()=>(await proof(pages[0])).visible).toBe(1);
    expect(await proof(pages[0])).toMatchObject({requests:1,id:original[0].id,state:'live'});
  }finally{await Promise.all(contexts.map(context=>context.close()));}
});

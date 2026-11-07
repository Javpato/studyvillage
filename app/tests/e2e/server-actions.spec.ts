import {test,expect} from '@playwright/test';

test('server actions wait for an import acknowledgement even when the new house is already visible',async({page})=>{
 const source=await page.request.get('/src/ui/servers-ui.ts');
 test.skip(!source.headers()['content-type']?.includes('javascript'),'The isolated panel fixture imports the development module.');
 await page.goto('/');
 await page.evaluate(async()=>{
  const path='/src/ui/servers-ui.ts';const {ServersPanel}=await import(path);
  let release:()=>void=()=>{};const pending=new Promise<void>(resolve=>{release=resolve;});
  let invitations=0;
  const view:any={identitySaved:false,network:{phase:'JOINED',server:{url:'http://localhost:8787',name:'Import race',role:'admin',houseOnServer:false,neighborhood:0,neighborhoods:1,online:1,maxOnline:6}}};
  const panel=new ServersPanel({notify:()=>{},ownBoards:()=>[],actions:{
   importToServer:async()=>{view.network.server={...view.network.server,houseOnServer:true,neighborhoods:2};panel.update(view);await pending;return {objects:0};},
   serverRequest:async(request:any)=>{if(request.op==='admin.invite.create'){invitations++;return {code:'invitation-after-acknowledgement'};}return [];},
  } as any});
  panel.root.id='server-action-fixture';panel.root.style.cssText='position:fixed;inset:10px;background:white;z-index:100000;overflow:auto';document.body.append(panel.root);panel.update(view);
  (window as any).serverActionFixture={release,invitationCount:()=>invitations};
 });
 const panel=page.locator('#server-action-fixture');
 await panel.getByText('Administrar servidor',{exact:true}).click();
 await panel.getByRole('button',{name:'Importar mi casa y pizarras',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Volver a importar mi casa y pizarras',exact:true})).toBeDisabled();
 const create=panel.getByRole('button',{name:'Crear invitación privada',exact:true});
 await expect(create).toBeDisabled();
 await expect(panel.getByRole('button',{name:'Barrio 2 →',exact:true})).toBeDisabled();
 await page.evaluate(()=>(window as any).serverActionFixture.release());
 await expect(create).toBeEnabled();await create.click();
 await expect(panel.getByLabel('Invitación creada',{exact:true})).toHaveValue(/invitation-after-acknowledgement/);
 expect(await page.evaluate(()=>(window as any).serverActionFixture.invitationCount())).toBe(1);
});

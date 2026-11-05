import{test,expect}from'@playwright/test';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'});
const contacts=async(page:import('@playwright/test').Page)=>{await page.goto('/');await page.getByTestId('phone-button').click();await page.getByTestId('phone-contacts').click();};
test('shares the real public JSON file and treats cancellation as normal',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'canShare',{value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{(window as any).sharedCard=JSON.parse(await data.files![0].text());}});});
 await contacts(page);await page.getByRole('button',{name:'Enviar tarjeta por WhatsApp'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).sharedCard?.schemaVersion)).toBe(1);
 const card=await page.evaluate(()=>(window as any).sharedCard);expect(Object.keys(card).sort()).toEqual(['friendCode','identity','schemaVersion']);expect(card.identity.fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(card)).not.toContain('privateKey');
 await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError');}}));
 await page.getByRole('button',{name:'Enviar tarjeta por WhatsApp'}).click();await expect(page.locator('.sv-notice')).not.toContainText('No se pudo abrir WhatsApp');
});
test('downloads JSON with clear instructions when file sharing is unavailable',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'canShare',{value:()=>false}));await contacts(page);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Enviar tarjeta por WhatsApp'}).click();expect((await download).suggestedFilename()).toBe('studyvillage-contact.json');await expect(page.locator('.sv-notice')).toContainText('Tarjeta descargada');
});

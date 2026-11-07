import {openPhoneApp} from './phone-ui.mjs';
/** Two real service-worker versions, isolated HTTP origin, no mutation of the working build. */
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('app/dist');let newer=false;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');let name=decodeURIComponent(url.pathname);if(name==='/')name='/index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('path');let data=await readFile(file);if(name==='/sw.js'&&newer)data=Buffer.from(data.toString().replace(/const CACHE='([^']+)'/,"const CACHE='$1-update-fixture'"));res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
 const context=await browser.newContext();let page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(address);await page.waitForSelector('[data-testid=phone-button]');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.getByTestId('phone-button').click();await openPhoneApp(page,'ink');
 await page.getByLabel('Texto de la página').fill('Saved before update');await page.getByLabel('Texto de la página').blur();await expect(page.getByText('Guardado en este dispositivo',{exact:true})).toBeVisible();
 newer=true;await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting);
 await expect(page.getByLabel('Texto de la página')).toHaveValue('Saved before update');
 await page.getByLabel('Texto de la página').fill('Work continued while update waited');await page.getByLabel('Texto de la página').blur();await expect(page.getByText('Guardado en este dispositivo',{exact:true})).toBeVisible();await page.close();
 page=await context.newPage();await page.goto(address);await page.waitForFunction(async()=>!(await navigator.serviceWorker.getRegistration())?.waiting);await expect.poll(()=>page.evaluate(async()=>(await caches.keys()).some(key=>key.endsWith('-update-fixture')))).toBe(true);
 await context.setOffline(true);await page.reload();await page.getByTestId('phone-button').click();await openPhoneApp(page,'ink');await expect(page.getByLabel('Texto de la página')).toHaveValue('Work continued while update waited');
 console.log('PASS: waiting update leaves active writing intact; new shell starts offline after old window closes and retains committed notebook.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

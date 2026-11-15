/** Export the same original grids used by the live wardrobe. Run with local Vite on port 3100. */
import {chromium} from '@playwright/test';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:3100');
 const result=await page.evaluate(async()=>{
  const {humanSheet,CAST_PRESETS}=await import('/src/assets/pixel-cast/humans.ts');
  const all=Object.entries(CAST_PRESETS).map(([name,look])=>({name,sheet:humanSheet(look)}));
  const preview=document.createElement('canvas');preview.width=all.length*96;preview.height=160;
  const c=preview.getContext('2d');c.fillStyle='#e9dfcb';c.fillRect(0,0,preview.width,preview.height);c.imageSmoothingEnabled=false;
  const files={};all.forEach(({name,sheet},i)=>{c.drawImage(sheet,0,0,64,64,i*96,0,96,96);c.drawImage(sheet,0,64,64,64,i*96,96,64,64);
   if(name.startsWith('guide')){const icon=document.createElement('canvas');icon.width=64;icon.height=64;const ctx=icon.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(sheet,0,0,64,64,0,0,64,64);files[name]={data:icon.toDataURL(),width:64,height:64};}
   files[name+'-sheet']={data:sheet.toDataURL(),width:192,height:256};
  });files['avatar-template']={data:humanSheet({}).toDataURL(),width:192,height:256};return{files,preview:preview.toDataURL()};
 });
 const dir=new URL('../app/public/sprites/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',dir)));
 for(const [name,{data,width,height}]of Object.entries(result.files)){await writeFile(new URL(name+'.png',dir),Buffer.from(data.split(',')[1],'base64'));manifest[name]={file:name+'.png',width,height};}
 await writeFile(new URL('guide.png',dir),Buffer.from(result.files['guide-study'].data.split(',')[1],'base64'));manifest.guide={file:'guide.png',width:64,height:64};
 await writeFile(new URL('manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
 await mkdir(new URL('../docs/images/pixel-cast/',import.meta.url),{recursive:true});await writeFile(new URL('../docs/images/pixel-cast/humans.png',import.meta.url),Buffer.from(result.preview.split(',')[1],'base64'));
}finally{await browser.close();}

/** Exercise the shipping debug APK through Android accessibility, without enabling WebView debugging. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const pkg='com.studyvillage.rebuild',out='test-results/android-smoke';
await mkdir(out,{recursive:true});
const adb=(...args)=>execFileSync('adb',args,{timeout:45000,maxBuffer:8*1024*1024});
const shell=(...args)=>adb('shell',...args).toString('utf8');
const decode=value=>value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>');
let lastXml='';
async function node(label){
 const end=Date.now()+45000;
 while(Date.now()<end){
  shell('uiautomator','dump','/sdcard/studyvillage-ui.xml');lastXml=shell('cat','/sdcard/studyvillage-ui.xml');
  for(const tag of lastXml.matchAll(/<node\s[^>]+>/g)){
   const attrs=Object.fromEntries([...tag[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],decode(m[2])]));
   if([attrs.text,attrs['content-desc']].some(value=>value===label))return attrs;
  }
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 throw Error(`Android UI did not expose: ${label}`);
}
async function tap(label){const item=await node(label),bounds=item.bounds.match(/\d+/g).map(Number);shell('input','tap',String(Math.round((bounds[0]+bounds[2])/2)),String(Math.round((bounds[1]+bounds[3])/2)));}
const launch=()=>shell('am','start','-W','-n',`${pkg}/.MainActivity`);
try{
 adb('wait-for-device');assert.equal(shell('getprop','ro.kernel.qemu').trim(),'1','Use a disposable Android emulator');
 adb('install','-r','deliverables/android-current/StudyVillage-development.apk');adb('logcat','-c');
 launch();await tap('Abrir menú (M)');await node('Aldea');await node('Contactos');await node('Identidad');await node('Hogar');await node('Ajustes');
 await tap('Hogar');await node('Habitaciones');await node('Decorar');await node('Mi jardín');await tap('Mi casa');await node('Mi rincón de estudio');
 await writeFile(`${out}/house.png`,adb('exec-out','screencap','-p'));
 shell('am','force-stop',pkg);launch();await node('Abrir menú (M)');assert(shell('pidof',pkg).trim());
 const crashes=adb('logcat','-d','-s','AndroidRuntime:E').toString('utf8');assert(!crashes.includes('FATAL EXCEPTION'),crashes);
 console.log('PASS Android API 35 emulator: APK installation, WebView startup, default phone folders, house navigation and process restart.');
}finally{
 await writeFile(`${out}/ui.xml`,lastXml);await writeFile(`${out}/logcat.txt`,adb('logcat','-d','-t','400').toString('utf8'));
 shell('am','force-stop',pkg);
}

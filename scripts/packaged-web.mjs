import {extractFile} from '@electron/asar';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
export async function verifyPackagedWeb(location,kind,bundle=path.resolve('app/dist')){
 const files=async(dir,prefix='')=>{const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())result.push(...await files(path.join(dir,entry.name),name+'/'));else result.push(name);}return result;};
 const names=await files(bundle),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const get=name=>kind==='asar'?extractFile(location,name):execFileSync('unzip',['-p',location,'assets/public/'+name.replaceAll(path.sep,'/')],{maxBuffer:32*1024*1024});
 for(const name of names){const bytes=get(kind==='asar'?path.join('web',name):name);if(hash(bytes)!==hash(await readFile(path.join(bundle,name))))throw Error(`Different packaged web asset: ${name}`);}
 if(kind==='asar')for(const name of ['main.cjs','preload.cjs','storage.cjs','server-profile.cjs'])if(hash(get(name))!==hash(await readFile(path.join('app/linux',name))))throw Error(`Different native bridge: ${name}`);
 return {matchedWebFiles:names.length,webIndexSha256:hash(await readFile(path.join(bundle,'index.html'))),pwaCache:(await readFile(path.join(bundle,'sw.js'),'utf8')).match(/const CACHE='([^']+)'/)?.[1]};
}

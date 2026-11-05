/** Compare every web asset in packaged apps with the current PWA, without claiming foreign-OS execution. */
import {extractFile} from '@electron/asar';
import {readFile,readdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import path from 'node:path';
const root=path.resolve('.'),bundle=path.join(root,'app/dist');
async function files(dir,prefix=''){const all=[];for(const e of await readdir(dir,{withFileTypes:true})){const name=prefix+e.name;if(e.isDirectory())all.push(...await files(path.join(dir,e.name),name+'/'));else all.push(name);}return all;}
const entries=await files(bundle),digest=value=>createHash('sha256').update(value).digest('hex');
const expected=new Map(await Promise.all(entries.map(async name=>[name,digest(await readFile(path.join(bundle,name)))])));
const targets=[
 ['Linux x64','deliverables/linux-current/StudyVillage/resources/app','folder'],
 ['Windows x64','deliverables/windows-current/StudyVillage-win32-x64/resources/app.asar','asar'],
 ['macOS Intel','deliverables/macos-current/StudyVillage-darwin-x64/StudyVillage.app/Contents/Resources/app.asar','asar'],
 ['macOS Apple Silicon','deliverables/macos-current/StudyVillage-darwin-arm64/StudyVillage.app/Contents/Resources/app.asar','asar'],
 ['Android debug','deliverables/android-current/StudyVillage-development.apk','apk'],
];
const checked=[];
for(const[label,location,kind]of targets){
 for(const[name,hash]of expected){const bytes=kind==='folder'?await readFile(path.join(location,'web',name)):kind==='asar'?extractFile(location,'web/'+name):execFileSync('unzip',['-p',location,'assets/public/'+name],{maxBuffer:32*1024*1024});if(digest(bytes)!==hash)throw Error(`${label}: different ${name}`);}
 if(kind!=='apk')for(const name of ['main.cjs','preload.cjs','storage.cjs','server-profile.cjs']){const bytes=kind==='folder'?await readFile(path.join(location,name)):extractFile(location,name);if(digest(bytes)!==digest(await readFile(path.join('app/linux',name))))throw Error(`${label}: different bridge ${name}`);}
 checked.push({target:label,matchedWebFiles:entries.length,package:location,nativeExecutedByThisCheck:false});console.log(`PASS ${label}: ${entries.length} current web assets match byte-for-byte.`);
}
const sw=await readFile(path.join(bundle,'sw.js'),'utf8'),version=JSON.parse(await readFile('package.json','utf8')).version;
const report={version,builtAt:new Date().toISOString(),pwaCache:sw.match(/const CACHE='([^']+)'/)?.[1],webIndexSha256:expected.get('index.html'),packages:checked};
await writeFile('deliverables/BUILD_INFO.json',JSON.stringify(report,null,2)+'\n');

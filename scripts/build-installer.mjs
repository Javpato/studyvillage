import {build,Platform,Arch} from 'electron-builder';
import {mkdir,readFile,rename,rm,copyFile,chmod} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {prepareDesktop} from './prepare-desktop.mjs';
import {installerConfig} from './installer-config.mjs';
import {releaseTarget,verifyInstallerFormat} from './release-targets.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),key=process.argv[2],target=releaseTarget(key);
const out=path.join(root,'deliverables/release-current');await mkdir(out,{recursive:true});
const destination=path.join(out,target.file),temporary=path.join(out,'.'+target.file);
if(key==='android'){
 await copyFile(path.join(root,'deliverables/android-current/StudyVillage-development.apk'),temporary);
 await verifyInstallerFormat(key,temporary);await rename(temporary,destination);
}else{
 if(process.platform!==target.host)throw Error(`Build ${key} on its native OS (${target.host}).`);
 const source=path.join(root,`deliverables/.installer-source-${key}`),staging=path.join(root,`deliverables/.installer-build-${key}`);
 const current=path.join(root,'deliverables',target.folder),previous=path.join(root,`deliverables/.installer-previous-${key}`);
 try{
  await prepareDesktop(pathToFileURL(source+path.sep));await rm(staging,{recursive:true,force:true});
  const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const platform=key==='windows'?Platform.WINDOWS:key==='linux'?Platform.LINUX:Platform.MAC;
  await build({projectDir:root,targets:platform.createTarget([target.format==='nsis'?'nsis':target.format==='dmg'?'dmg':'AppImage'],key==='macos'?Arch.universal:Arch.x64),config:installerConfig(key,root,source,staging,pkg),publish:'never'});
  await verifyInstallerFormat(key,path.join(staging,target.file));
  await rm(previous,{recursive:true,force:true});try{await rename(current,previous);}catch(error){if(error.code!=='ENOENT')throw error;}
  try{await rename(staging,current);}catch(error){try{await rename(previous,current);}catch{}throw error;}
  await copyFile(path.join(current,target.file),temporary);await rename(temporary,destination);
  if(key==='linux')await chmod(destination,0o755);
  await rm(previous,{recursive:true,force:true});
 }finally{await rm(source,{recursive:true,force:true});await rm(staging,{recursive:true,force:true});await rm(temporary,{force:true});}
}
console.log(destination);

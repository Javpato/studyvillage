/** Test generated installers; Windows installation requires a disposable GitHub runner. */
import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,rm,readdir,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {releaseTarget,verifyInstallerFormat} from './release-targets.mjs';
import {verifyPackagedWeb} from './packaged-web.mjs';
import {recordInstallerCheck} from './installer-receipt.mjs';
const key=process.argv[2],target=releaseTarget(key),file=path.resolve('deliverables/release-current',target.file);
assert.equal(process.platform,target.host,'Test the installer on its native OS');
if(key==='windows'||key==='linux')assert(process.env.GITHUB_ACTIONS==='true'&&process.env.CI==='true','Install/uninstall and sandbox-helper setup require a disposable GitHub runner');
await verifyInstallerFormat(key,file);
const scratch=await mkdtemp(path.join(tmpdir(),'studyvillage-installer-'));
const run=async(command,args,options={})=>promisify(execFile)(command,args,{timeout:120000,maxBuffer:8*1024*1024,...options});
let mounted=false,installed=false,profileSentinel;
const mount=path.join(scratch,'mounted'),install=path.join(scratch,'installed');
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const waitFor=async condition=>{const end=Date.now()+30000;while(Date.now()<end){if(await condition())return;await new Promise(r=>setTimeout(r,200));}throw Error('Installer did not finish within 30 seconds');};
const uninstall=async()=>{
 const name=(await readdir(install)).find(name=>/^Uninstall .*\.exe$/.test(name));assert(name,'Installer must provide an uninstaller');
 await run(path.join(install,name),['/S']);await waitFor(async()=>!await exists(path.join(install,'StudyVillage.exe')));installed=false;
};
try{
 let appRoot,executable,environment={...process.env};
 if(key==='windows'){
  profileSentinel=path.join(process.env.APPDATA,'local.studyvillage.rebuild',`installer-check-${path.basename(scratch)}.txt`);
  await mkdir(path.dirname(profileSentinel),{recursive:true});await writeFile(profileSentinel,'Keep existing player data',{flag:'wx'});
  await run(file,['/S','/CURRENTUSER',`/D=${install}`]);installed=true;
  executable=path.join(install,'StudyVillage.exe');await waitFor(()=>exists(executable));appRoot=install;
 }else if(key==='linux'){
  await run(file,['--appimage-extract'],{cwd:scratch});appRoot=path.join(scratch,'squashfs-root');
  const helper=path.join(appRoot,'chrome-sandbox');await run('sudo',['chown','root:root',helper]);await run('sudo',['chmod','4755',helper]);
  environment.CHROME_DEVEL_SANDBOX=helper;executable=path.join(appRoot,'AppRun');
 }else{
  await run('hdiutil',['verify',file]);await mkdir(mount);await run('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,file]);mounted=true;
  appRoot=path.join(install,'StudyVillage.app');await mkdir(install);await run('ditto',[path.join(mount,'StudyVillage.app'),appRoot]);
  executable=path.join(appRoot,'Contents/MacOS/StudyVillage');
  for(const binary of [executable,path.join(appRoot,'Contents/Frameworks/Electron Framework.framework/Electron Framework')]){
   const {stdout}=await run('lipo',['-archs',binary]);assert(stdout.includes('x86_64')&&stdout.includes('arm64'),'DMG must contain both Mac architectures');
  }
  await run('codesign',['--verify','--deep','--strict',appRoot]);
 }
 const asar=path.join(appRoot,key==='macos'?'Contents/Resources/app.asar':'resources/app.asar');
 const compared=await verifyPackagedWeb(asar,'asar');
 console.log(`PASS ${target.label}: actual installer payload matches ${compared.matchedWebFiles} current web files.`);
 execFileSync(process.execPath,['scripts/test-linux.mjs'],{env:{...environment,SV_DESKTOP_EXECUTABLE:executable},stdio:'inherit',timeout:120000});
 const checks={payload:true,startup:true,storage:true,restart:true,notebook:true,nativeExport:true};
 if(key==='windows'){await uninstall();assert.equal(await readFile(profileSentinel,'utf8'),'Keep existing player data');checks.uninstallPreservesUserData=true;}
 if(key==='macos')checks.universalBinary=true;
 await recordInstallerCheck(key,checks);
 console.log(`PASS ${target.label}: single-file delivery verified on ${process.arch}.`);
}finally{
 if(installed)await uninstall();
 if(mounted)await run('hdiutil',['detach',mount]);
 if(profileSentinel)await rm(profileSentinel,{force:true});
 // This directory was exclusively created above; never clean a user install/profile.
 assert(path.dirname(scratch)===path.resolve(tmpdir())&&path.basename(scratch).startsWith('studyvillage-installer-'));
 await rm(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}

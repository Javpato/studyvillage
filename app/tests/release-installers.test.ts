import {it,expect,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {releaseTargets,publishedFiles} from '../../scripts/release-targets.mjs';
import {installerConfig} from '../../scripts/installer-config.mjs';
const directories:string[]=[];
afterEach(()=>{for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});});
function fixture(){
 const directory=mkdtempSync(path.join(tmpdir(),'sv-installer-receipts-'));directories.push(directory);
 const version=JSON.parse(readFileSync('package.json','utf8')).version,commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 for(const [key,target]of Object.entries(releaseTargets)){
  const bytes=Buffer.alloc(512);
  if(key==='windows'){bytes.write('MZ');bytes.writeUInt32LE(128,60);bytes.write('PE\0\0',128);}
  else if(key==='linux'){bytes.set([0x7f,0x45,0x4c,0x46]);bytes.set([0x41,0x49,0x02],8);}
  else if(key==='macos')bytes.write('koly');else bytes.set([0x50,0x4b,0x03,0x04]);
  writeFileSync(path.join(directory,target.file),bytes);
  writeFileSync(path.join(directory,`BUILD_INFO-${key}.json`),JSON.stringify({version,commit,target:key,installer:target.file,format:target.format,architectures:target.architectures,matchedWebFiles:163,webIndexSha256:'same-web',pwaCache:'same-cache'}));
  for(const architecture of target.architectures)writeFileSync(path.join(directory,`INSTALL_CHECK-${key}-${architecture}.json`),JSON.stringify({version,commit,target:key,architecture,installer:target.file,sha256:createHash('sha256').update(bytes).digest('hex'),checks:{payload:true,startup:true,storage:true,restart:true,notebook:true,nativeExport:true,uninstallPreservesUserData:true,universalBinary:true,installation:true,phone:true,house:true}}));
 }
 return directory;
}
const verify=(directory:string)=>spawnSync(process.execPath,['scripts/verify-release.mjs',directory],{encoding:'utf8'});
it('publishes exactly one installer per OS and retains both Mac architectures',()=>{
 expect(publishedFiles().filter(name=>/\.(exe|AppImage|dmg|apk)$/.test(name))).toHaveLength(4);
 expect(publishedFiles().some(name=>/\.(zip|tar\.gz)$/.test(name))).toBe(false);
 expect(releaseTargets.macos.architectures).toEqual(['arm64','x64']);
 const pkg=JSON.parse(readFileSync('package.json','utf8')),config=installerConfig('windows',process.cwd(),'app','out',pkg);
 expect(config.nsis).toMatchObject({perMachine:false,allowElevation:false,deleteAppDataOnUninstall:false,runAfterFinish:false});
 expect(config.appImage.executableArgs).toEqual([]);
});
it('refuses publication without verification of the same DMG on Intel',()=>{
 const directory=fixture();rmSync(path.join(directory,'INSTALL_CHECK-macos-x64.json'));
 const result=verify(directory);expect(result.status).not.toBe(0);expect(result.stderr).toContain('INSTALL_CHECK-macos-x64.json');
});
it('rejects a changed installer even when its filename and PE signature remain valid',()=>{
 const directory=fixture(),file=path.join(directory,releaseTargets.windows.file),bytes=readFileSync(file);bytes[200]=1;writeFileSync(file,bytes);
 expect(verify(directory).status).not.toBe(0);
});
it('rejects an archive renamed to an executable',()=>{
 const directory=fixture(),file=path.join(directory,releaseTargets.windows.file),bytes=readFileSync(file);bytes.write('PK');writeFileSync(file,bytes);
 const result=verify(directory);expect(result.status).not.toBe(0);expect(result.stderr).toContain('Windows installer must be a PE executable');
});
it('requires the Windows uninstall check to preserve player data',()=>{
 const directory=fixture(),file=path.join(directory,'INSTALL_CHECK-windows-x64.json'),receipt=JSON.parse(readFileSync(file,'utf8'));delete receipt.checks.uninstallPreservesUserData;writeFileSync(file,JSON.stringify(receipt));
 const result=verify(directory);expect(result.status).not.toBe(0);expect(result.stderr).toContain('missing uninstallPreservesUserData');
});
it('rejects package metadata from a different source commit',()=>{
 const directory=fixture(),file=path.join(directory,'BUILD_INFO-windows.json'),report=JSON.parse(readFileSync(file,'utf8'));report.commit='obsolete-source';writeFileSync(file,JSON.stringify(report));
 expect(verify(directory).status).not.toBe(0);
});

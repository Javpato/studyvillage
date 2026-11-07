import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {releaseTargets,publishedFiles,verifyInstallerFormat,sha256} from './release-targets.mjs';
const directory=path.resolve(process.argv[2]||'deliverables/release-current');
const version=JSON.parse(await readFile('package.json','utf8')).version,commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const reports=[];let first;
for(const [key,target]of Object.entries(releaseTargets)){
 const report=JSON.parse(await readFile(path.join(directory,`BUILD_INFO-${key}.json`),'utf8'));
 assert.equal(report.version,version);assert.equal(report.commit,commit);assert.equal(report.target,key);assert.equal(report.installer,target.file);assert.equal(report.format,target.format);
 assert.deepEqual(report.architectures,target.architectures);assert(report.matchedWebFiles>0);
 first??=report;assert.equal(report.webIndexSha256,first.webIndexSha256);assert.equal(report.pwaCache,first.pwaCache);
 const file=path.join(directory,target.file);await verifyInstallerFormat(key,file);const digest=await sha256(file);
 if(key==='android')execFileSync('unzip',['-t',file],{stdio:'ignore'});
 const checks=[];
 for(const architecture of target.architectures){
  const receipt=JSON.parse(await readFile(path.join(directory,`INSTALL_CHECK-${key}-${architecture}.json`),'utf8'));
  assert.equal(receipt.version,version);assert.equal(receipt.commit,commit);assert.equal(receipt.target,key);assert.equal(receipt.architecture,architecture);assert.equal(receipt.installer,target.file);assert.equal(receipt.sha256,digest);
  const required=key==='android'?['installation','startup','phone','house','restart']:['payload','sandbox','startup','storage','restart','notebook','nativeExport',...(key==='windows'?['uninstallPreservesUserData']:key==='macos'?['universalBinary']:[])];
  for(const check of required)assert.equal(receipt.checks[check],true,`${key}/${architecture}: missing ${check}`);
  checks.push(receipt);
 }
 reports.push({...report,sha256:digest,nativeVerification:checks});
}
const names=await readdir(directory);for(const name of names)if(/\.(zip|tar\.gz|exe|AppImage|dmg|apk)$/.test(name)&&!publishedFiles().includes(name))throw Error(`Obsolete or unexpected release package: ${name}`);
await writeFile(path.join(directory,'BUILD_INFO.json'),JSON.stringify({version,commit,packages:reports},null,2)+'\n');
const hashes=await Promise.all(publishedFiles().filter(name=>name!=='SHA256SUMS').sort().map(async name=>`${await sha256(path.join(directory,name))}  ${name}`));
await writeFile(path.join(directory,'SHA256SUMS'),hashes.join('\n')+'\n');
console.log(`Verified four single-file ${version} installers, including the same universal DMG on Intel and Apple Silicon, from ${commit}.`);

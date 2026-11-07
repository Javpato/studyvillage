import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const dir=path.resolve(process.argv[2]||'deliverables/release-current');
const keys=['linux','windows','intel','arm64','android'];
const reports=await Promise.all(keys.map(async key=>JSON.parse(await readFile(path.join(dir,`BUILD_INFO-${key}.json`),'utf8'))));
const version=JSON.parse(await readFile('package.json','utf8')).version,commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
for(const report of reports){
 assert.equal(report.version,version);assert.equal(report.commit,commit);assert.equal(report.webIndexSha256,reports[0].webIndexSha256);assert.equal(report.pwaCache,reports[0].pwaCache);
 assert.equal(report.packages.length,1);assert(report.packages[0].matchedWebFiles>0);
 const archive=path.join(dir,report.archive);
 if(report.archive.endsWith('.tar.gz'))execFileSync('tar',['-tzf',archive],{stdio:'ignore'});
 else execFileSync('unzip',['-t',archive],{stdio:'ignore'});
}
assert.equal(new Set(reports.map(r=>r.packages[0].target)).size,5);
await writeFile(path.join(dir,'BUILD_INFO.json'),JSON.stringify({version,commit,packages:reports},null,2)+'\n');
const names=(await readdir(dir)).filter(n=>!n.startsWith('.')&&n!=='SHA256SUMS').sort();
const hashes=await Promise.all(names.map(async name=>`${createHash('sha256').update(await readFile(path.join(dir,name))).digest('hex')}  ${name}`));
await writeFile(path.join(dir,'SHA256SUMS'),hashes.join('\n')+'\n');
console.log(`Verified all five ${version} packages from ${commit}.`);

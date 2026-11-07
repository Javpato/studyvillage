import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {releaseTarget,sha256,verifyInstallerFormat} from './release-targets.mjs';
export async function recordInstallerCheck(key,checks){
 const target=releaseTarget(key),directory=path.resolve('deliverables/release-current'),file=path.join(directory,target.file);
 await verifyInstallerFormat(key,file);await mkdir(directory,{recursive:true});
 const version=JSON.parse(await readFile('package.json','utf8')).version,architecture=key==='android'?'android':process.arch;
 if(!target.architectures.includes(architecture))throw Error(`Unsupported verification architecture: ${architecture}`);
 const receipt={version,commit:process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),target:key,architecture,installer:target.file,sha256:await sha256(file),checks};
 await writeFile(path.join(directory,`INSTALL_CHECK-${key}-${architecture}.json`),JSON.stringify(receipt,null,2)+'\n');
 return receipt;
}

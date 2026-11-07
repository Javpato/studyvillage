import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
const targets={
 linux:['linux-current','StudyVillage','StudyVillage-linux-x64.tar.gz'],
 windows:['windows-current','StudyVillage-win32-x64','StudyVillage-windows-x64.zip'],
 intel:['macos-current','StudyVillage-darwin-x64','StudyVillage-macos-intel.zip'],
 arm64:['macos-current','StudyVillage-darwin-arm64','StudyVillage-macos-arm64.zip'],
 android:['android-current','StudyVillage-development.apk','StudyVillage-development.apk'],
};
const key=process.argv[2],target=targets[key];if(!target)throw Error('Unknown platform');
const [folder,source,name]=target,base=path.resolve('deliverables',folder),out=path.resolve('deliverables/release-current');
await mkdir(out,{recursive:true});const final=path.join(out,name),temporary=path.join(out,'.'+name);
try{
 if(key==='android')await copyFile(path.join(base,source),temporary);
 else if(key==='linux')execFileSync('tar',['-C',base,'-czf',temporary,source]);
 else if(process.platform==='darwin')execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',path.join(base,source),temporary]);
 else if(process.platform==='win32')execFileSync('tar',['-a','-cf',temporary,'-C',base,source]);
 else execFileSync('zip',['-q','-r','-y',temporary,source],{cwd:base});
 await rename(temporary,final);
 const info=JSON.parse(await readFile('deliverables/BUILD_INFO.json','utf8'));info.archive=name;
 await writeFile(path.join(out,`BUILD_INFO-${key}.json`),JSON.stringify(info,null,2)+'\n');console.log(final);
}finally{await rm(temporary,{force:true});await rm(temporary+'.zip',{force:true});}

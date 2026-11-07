import {packager} from '@electron/packager';import {rm,readFile,mkdir,rename} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {prepareDesktop} from './prepare-desktop.mjs';
const platform=process.argv[2];const arch=process.argv[3]||'x64';if(!['win32','darwin'].includes(platform)||!['x64','arm64'].includes(arch))throw new Error('Use: node scripts/package-platform.mjs win32|darwin x64|arm64');
const root=new URL('../deliverables/',import.meta.url),source=new URL(`.desktop-${platform}-${arch}/`,root),staging=new URL(`.package-${platform}-${arch}/`,root),temporary=new URL(`.tmp-${platform}-${arch}/`,root);
const out=new URL(platform==='win32'?'windows-current/':'macos-current/',root);await mkdir(out,{recursive:true});await prepareDesktop(source);
try{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
 const [output]=await packager({dir:fileURLToPath(source),name:'StudyVillage',platform,arch,asar:true,electronVersion:pkg.devDependencies.electron,out:fileURLToPath(staging),tmpdir:fileURLToPath(temporary),overwrite:true});
 const target=new URL(`StudyVillage-${platform}-${arch}`,out),previous=new URL(`.previous-${platform}-${arch}`,root);
 await rm(previous,{recursive:true,force:true});try{await rename(target,previous);}catch(e){if(e.code!=='ENOENT')throw e;}
 try{await rename(output,target);}catch(e){try{await rename(previous,target);}catch{}throw e;}
 await rm(previous,{recursive:true,force:true});console.log(fileURLToPath(target));
}finally{await rm(source,{recursive:true,force:true});await rm(staging,{recursive:true,force:true});await rm(temporary,{recursive:true,force:true});}

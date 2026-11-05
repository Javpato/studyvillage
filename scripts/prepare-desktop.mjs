import {mkdir,cp,rm,readFile,writeFile} from 'node:fs/promises';
export async function prepareDesktop(out){await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const name of ['main.cjs','preload.cjs','storage.cjs','server-profile.cjs'])await cp(new URL('../app/linux/'+name,import.meta.url),new URL(name,out));
await cp(new URL('../app/dist/',import.meta.url),new URL('web/',out),{recursive:true});await cp(new URL('../app/src-tauri/icons/128x128.png',import.meta.url),new URL('icon.png',out));const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));await writeFile(new URL('package.json',out),JSON.stringify({name:'studyvillage',version:pkg.version,main:'main.cjs'}));}

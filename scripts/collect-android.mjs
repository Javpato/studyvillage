import {mkdir,copyFile,rename} from 'node:fs/promises';
const dir=new URL('../deliverables/android-current/',import.meta.url);await mkdir(dir,{recursive:true});
const staging=new URL('.StudyVillage-development.apk',dir),final=new URL('StudyVillage-development.apk',dir);
await copyFile(new URL('../android/app/build/outputs/apk/debug/app-debug.apk',import.meta.url),staging);await rename(staging,final);console.log(final.pathname);

import assert from 'node:assert/strict';
import {open,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const releaseTargets={
 windows:{label:'Windows x64',host:'win32',file:'StudyVillage-Setup-x64.exe',folder:'windows-current',app:'win-unpacked',executable:'StudyVillage.exe',format:'nsis',architectures:['x64']},
 linux:{label:'Linux x64',host:'linux',file:'StudyVillage-linux-x64.AppImage',folder:'linux-current',app:'linux-unpacked',executable:'studyvillage',format:'appimage',architectures:['x64']},
 macos:{label:'macOS universal',host:'darwin',file:'StudyVillage-macos-universal.dmg',folder:'macos-current',app:'mac-universal/StudyVillage.app',executable:'Contents/MacOS/StudyVillage',format:'dmg',architectures:['arm64','x64']},
 android:{label:'Android debug',file:'StudyVillage-development.apk',folder:'android-current',format:'apk',architectures:['android']},
};
export function releaseTarget(key){const target=releaseTargets[key];if(!target)throw Error(`Unknown release target: ${key}`);return target;}
export const publishedFiles=()=>[...Object.values(releaseTargets).map(t=>t.file),'BUILD_INFO.json','SHA256SUMS'];
export async function sha256(file){return createHash('sha256').update(await readFile(file)).digest('hex');}
/** Reject renamed archives before accepting a native verification receipt. */
export async function verifyInstallerFormat(key,file){
 const target=releaseTarget(key),handle=await open(file,'r');
 try{
  const {size}=await handle.stat();assert(size>=512,`${target.file}: truncated installer`);
  const head=Buffer.alloc(64);await handle.read(head,0,head.length,0);
  if(key==='windows'){
   assert.equal(head.toString('ascii',0,2),'MZ','Windows installer must be a PE executable');
   const offset=head.readUInt32LE(60),signature=Buffer.alloc(4);assert(offset+4<=size,'Invalid PE header');await handle.read(signature,0,4,offset);assert(signature.equals(Buffer.from('PE\0\0')),'Invalid PE signature');
  }else if(key==='linux'){
   assert(head.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46])),'AppImage must be ELF');
   assert(head.subarray(8,11).equals(Buffer.from([0x41,0x49,0x02])),'Expected a type-2 AppImage');
  }else if(key==='macos'){
   const footer=Buffer.alloc(4);await handle.read(footer,0,4,size-512);assert.equal(footer.toString('ascii'),'koly','Expected a UDIF disk image');
  }else assert(head.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04])),'Expected an APK ZIP container');
 }finally{await handle.close();}
}

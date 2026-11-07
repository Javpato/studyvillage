import {execFileSync} from 'node:child_process';
const [platform,arch='x64']=process.argv.slice(2);if(platform==='win32'&&arch!=='x64')throw Error('Windows installers currently target x64.');
const key=platform==='win32'?'windows':platform==='darwin'?'macos':null;if(!key)throw Error('Use win32 x64 or darwin universal.');
execFileSync(process.execPath,['scripts/build-installer.mjs',key],{stdio:'inherit'});

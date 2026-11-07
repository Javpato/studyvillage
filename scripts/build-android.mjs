import {execFileSync} from 'node:child_process';
import path from 'node:path';
execFileSync(process.execPath,[path.resolve('node_modules/@capacitor/cli/bin/capacitor'),'sync','android'],{stdio:'inherit'});
if(process.platform==='win32')execFileSync('cmd.exe',['/d','/s','/c','gradlew.bat assembleDebug'],{cwd:'android',stdio:'inherit'});
else execFileSync('bash',['gradlew','assembleDebug'],{cwd:'android',stdio:'inherit'});
await import('./collect-android.mjs');

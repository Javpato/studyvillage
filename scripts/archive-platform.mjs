/** Compatibility entry point: desktop deliveries are now actual single-file installers. */
import {execFileSync} from 'node:child_process';
const supplied=process.argv[2],key=['intel','arm64'].includes(supplied)?'macos':supplied;
execFileSync(process.execPath,['scripts/build-installer.mjs',key],{stdio:'inherit'});

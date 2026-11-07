import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['scripts/build-installer.mjs','linux'],{stdio:'inherit'});

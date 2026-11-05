import { cp, mkdir, readFile, writeFile, rename, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const final = path.join(root, 'deliverables', 'linux-current');
const staging=path.join(root,'deliverables','.linux-staging');
await rm(staging,{recursive:true,force:true});
const output = path.join(staging, 'StudyVillage');
await mkdir(output, { recursive: true });
await cp(path.join(root, 'node_modules/electron/dist'), output, { recursive: true });
await rename(path.join(output, 'electron'), path.join(output, 'studyvillage-bin'));
const app = path.join(output, 'resources/app');
await mkdir(app, { recursive: true });
for (const file of ['main.cjs', 'preload.cjs', 'storage.cjs', 'server-profile.cjs']) await cp(path.join(root, 'app/linux', file), path.join(app, file));
// Hashed assets change between builds; copying over the old bundle leaves obsolete versions behind.
await rm(path.join(app, 'web'), { recursive: true, force: true });
await cp(path.join(root, 'app/dist'), path.join(app, 'web'), { recursive: true });
await cp(path.join(root, 'app/src-tauri/icons/128x128.png'), path.join(app, 'icon.png'));
await writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'studyvillage', version, main: 'main.cjs' }, null, 2));
// Ubuntu may restrict user namespaces. Reuse Chrome's root-owned sandbox
// helper when available; never launch with --no-sandbox.
await writeFile(path.join(output, 'studyvillage'), `#!/bin/sh\nAPP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nif [ -u /opt/google/chrome/chrome-sandbox ]; then\n  export CHROME_DEVEL_SANDBOX=/opt/google/chrome/chrome-sandbox\nfi\nexec "$APP_DIR/studyvillage-bin" "$@"\n`);
await chmod(path.join(output, 'studyvillage'), 0o755);
await chmod(path.join(output, 'studyvillage-bin'), 0o755);
const previous=path.join(root,'deliverables','.linux-previous');await rm(previous,{recursive:true,force:true});
try{await rename(final,previous);}catch(e){if(e.code!=='ENOENT')throw e;}
try{await rename(staging,final);}catch(e){try{await rename(previous,final);}catch{}throw e;}
await rm(previous,{recursive:true,force:true});
console.log(path.join(final,'StudyVillage'));

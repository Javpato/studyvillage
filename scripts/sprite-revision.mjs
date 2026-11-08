import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function spriteRevision(root){const hash=createHash('sha256');for(const file of readdirSync(root).filter(f=>f==='manifest.json'||f.endsWith('.png')).sort()){hash.update(file);hash.update(readFileSync(new URL(file,root)));}return hash.digest('hex').slice(0,16);}

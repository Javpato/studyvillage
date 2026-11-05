import {readFileSync} from 'node:fs';
const load=l=>JSON.parse(readFileSync(new URL(`../app/src/i18n/${l}.json`,import.meta.url)));
const es=load('es');const tokens=s=>[...s.matchAll(/\{([A-Za-z_]\w*)\}/g)].map(m=>m[1]).sort().join('|');let failures=[];
for(const lang of ['en','fr']){const target=load(lang);for(const [key,value] of Object.entries(es))if(!target[key]||tokens(value)!==tokens(target[key]))failures.push(`${lang}: ${key}`);}
if(failures.length)throw new Error(failures.join('\n'));console.log(`${Object.keys(es).length} messages: ES / EN / FR placeholders and coverage passed`);

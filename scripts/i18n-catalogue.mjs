/** Extract and validate build-time UI messages. Never sends user documents to a translator. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseSync } from 'rolldown/utils';
const ROOT = resolve('app/src');
const BASE = resolve('app/src/i18n');
function files(folder){return readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(folder,entry.name)):entry.name.endsWith('.ts')?[join(folder,entry.name)]:[]);}
function walk(node,visit){if(!node||typeof node!=='object')return;if(node.type)visit(node);for(const [key,value]of Object.entries(node)){if(['start','end','loc','range','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(n=>walk(n,visit));else if(value&&typeof value==='object')walk(value,visit);}}
const core = ['Idioma','No se pudo guardar el idioma.'];
function extract(){
 const catalogue = new Map(core.map(source=>[source,{source,files:[]} ]));
 for(const file of files(ROOT)){
  if(file.includes('/i18n/')||file.endsWith('/i18n.ts')||file.endsWith('.node-test.ts'))continue;
  const source=readFileSync(file,'utf8');const result=parseSync(file,source,{lang:'ts'});if(result.errors.length)throw new Error(`Cannot parse ${file}`);
  walk(result.program,node=>{
   // Every literal handed to msg()/t() is a message, whatever it looks like.
   if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&(node.callee.name==='msg'||node.callee.name==='t')&&node.arguments[0]?.type==='Literal'&&typeof node.arguments[0].value==='string'){
    const text=node.arguments[0].value;if(text.trim()&&!/^\{[A-Za-z0-9_]+\}$/.test(text)){if(!catalogue.has(text))catalogue.set(text,{source:text,files:[]});const entry=catalogue.get(text);if(!entry.files.includes(file))entry.files.push(file);}
    return;
   }
   if(node.type!=='Literal'||typeof node.value!=='string')return;
   const text=node.value;
   if(!text.trim()||text.length>1500||/^https?:|^data:|^vscode:/.test(text)||/[<>]/.test(text))return;
   // Also: a capitalised word after a symbol («↑ Comunidad», «⚡ Usar») and signs in capitals («PARCELA», «TU CASA»).
   if(!(/[áéíóúñ¿¡]/i.test(text)||/^[A-Z][a-z]/.test(text)||/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text)||/(^|[^A-Za-z0-9_.\-/#])[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/.test(text)||/\b[A-ZÁÉÍÓÚÑ]{5,}\b/.test(text)&&!/[_.:\/#]/.test(text)))return;
   if(!catalogue.has(text))catalogue.set(text,{source:text,files:[]});const entry=catalogue.get(text);if(!entry.files.includes(file))entry.files.push(file);
  });
 }
 return [...catalogue.values()].sort((a,b)=>a.source.localeCompare(b.source));
}
const mode=process.argv[2]||'extract';
if(mode==='extract'){
 const data=extract();const out=process.argv[3]||'scripts/i18n-source.json';writeFileSync(out,JSON.stringify(data,null,2));console.log(JSON.stringify({messages:data.length,output:out}));
}else if(mode==='build'){
 const source=JSON.parse(readFileSync(process.argv[3]||'scripts/i18n-source.json','utf8'));
 const translations=JSON.parse(readFileSync(process.argv[4]||'app/src/i18n/en.json','utf8'));
 const missing=source.filter(item=>typeof translations[item.source]!=='string'||!translations[item.source].trim());if(missing.length)throw new Error(`Missing ${missing.length} translations`);
 const es=Object.fromEntries(source.map(item=>[item.source,item.source]));const en=Object.fromEntries(source.map(item=>[item.source,translations[item.source]]));
 mkdirSync(BASE,{recursive:true});writeFileSync(join(BASE,'es.json'),JSON.stringify(es,null,2)+'\n');writeFileSync(join(BASE,'en.json'),JSON.stringify(en,null,2)+'\n');
 writeFileSync(join(BASE,'catalogue.ts'),`/** Build-time, reviewed catalogue. No runtime translation service. */\nexport const ES = ${JSON.stringify(es,null,2)} as const;\nexport const EN: Record<keyof typeof ES,string> = ${JSON.stringify(en,null,2)};\n`);
 console.log(`Built ${source.length} ES/EN messages`);
}else if(mode==='validate'){
 const es=JSON.parse(readFileSync(join(BASE,'es.json'),'utf8'));const en=JSON.parse(readFileSync(join(BASE,'en.json'),'utf8'));const errors=[];
 const placeholders=text=>[...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(m=>m[1]).sort().join('|');
 for(const key of Object.keys(es)){if(typeof en[key]!=='string'||!en[key].trim())errors.push(`Missing: ${key}`);else if(placeholders(es[key])!==placeholders(en[key]))errors.push(`Placeholders: ${key}`);}
 for(const key of Object.keys(en))if(!(key in es))errors.push(`Unexpected: ${key}`);
 const source=extract();for(const item of source){if(item.files.some(file=>file.includes('/ui/'))&&!(item.source in es))errors.push(`Uncatalogued UI message: ${item.source}`);}
 if(errors.length)throw new Error(errors.join('\n'));console.log(`Validated ${Object.keys(es).length} messages and placeholders`);
}else throw new Error(`Unknown mode ${mode}`);

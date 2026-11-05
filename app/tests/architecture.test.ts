import {describe,it,expect} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {dirname,resolve,relative,sep} from 'node:path';
import {parseSync} from 'rolldown/utils';

const root=resolve('packages/core/src');
function files(directory:string):string[]{return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(resolve(directory,entry.name)):entry.name.endsWith('.ts')?[resolve(directory,entry.name)]:[]);}
describe('domain package boundary',()=>{
 it('keeps every static and dynamic dependency inside core or an approved pure library',()=>{
  const violations:string[]=[];
  for(const file of files(root)){
   const source=parseSync(file,readFileSync(file,'utf8'));
   expect(source.errors,relative(root,file)).toEqual([]);
   const inspect=(node:unknown):void=>{
    if(!node||typeof node!=='object')return;
    const record=node as {type?:string;source?:{value?:unknown}};
    if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration','ImportExpression'].includes(record.type??'')&&record.source){
     const name=record.source.value;
     if(typeof name!=='string'){violations.push(`${relative(root,file)} → nonliteral import`);return;}
     const target=name.startsWith('.')?relative(root,resolve(dirname(file),name)):null;
     if(target===null?name!=='zod':target==='..'||target.startsWith(`..${sep}`)||target.startsWith(sep))violations.push(`${relative(root,file)} → ${name}`);
    }
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(inspect);else if(value&&typeof value==='object')inspect(value);
   };
   inspect(source.program);
  }
  expect(violations).toEqual([]);
 });
});

/** Explicit label migration. Raw variable/user-content expressions are never translated. */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseSync } from 'rolldown/utils';
const apply = process.argv.includes('--apply');
const files = process.argv.slice(2).filter(a => a !== '--apply');
for (const file of files) {
 const source = readFileSync(file,'utf8'); const result = parseSync(file,source,{lang:'ts'});
 if(result.errors.length)throw new Error(`Cannot parse ${file}`);
 const shortEl = /(?:study-ui|ollama-setup-ui)\.ts$/.test(file);
 const edits=[]; const selected=[];
 const raw=n=>source.slice(n.start,n.end);
 const human=s=>typeof s==='string' && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(s) && !/^#[a-fA-F0-9]+$/.test(s) && !/^https?:|^vscode:|^data:/.test(s);
 function convert(node, fn='msg') {
  if(!node)return null;
  if(node.type==='Literal'&&human(node.value))return `${fn}(${raw(node)})`;
  if(node.type==='TemplateLiteral') {
   const pieces=node.quasis.map(q=>q.value.cooked??q.value.raw);
   if(!pieces.some(human))return null;
   const template=pieces.map((q,i)=>q+(i<node.expressions.length?`{p${i}}`:'')).join('');
   const params=node.expressions.map((e,i)=>`p${i}: ${raw(e)}`).join(', ');
   return `${fn}(${JSON.stringify(template)}${params?`, { ${params} }`:''})`;
  }
  if(node.type==='ConditionalExpression') {
   const yes=convert(node.consequent,fn),no=convert(node.alternate,fn);
   if(yes||no)return `${raw(node.test)} ? ${yes||raw(node.consequent)} : ${no||raw(node.alternate)}`;
  }
  if(node.type==='LogicalExpression' && ['||','??'].includes(node.operator)) {
   const right=convert(node.right,fn);if(right)return `${raw(node.left)} ${node.operator} ${right}`;
  }
  return null;
 }
 function edit(node,value) { if(selected.some(([a,b])=>node.start>=a&&node.end<=b))return;selected.push([node.start,node.end]);edits.push({start:node.start,end:node.end,value}); }
 function walk(node,parent=null,key=null){
  if(!node||typeof node!=='object'||!node.type)return;
  if(node.type==='CallExpression'){
   const name=node.callee.type==='Identifier'?node.callee.name:'';
   const index=name==='node'?2:name==='el'?(shortEl?1:2):['button','btn','field','primary','secondary'].includes(name)?0:-1;
   if(index>=0&&node.arguments[index]){const arg=node.arguments[index];const replacement=convert(arg);if(replacement)edit(arg,replacement);}
   if(node.callee.type==='MemberExpression') {
    const prop=node.callee.property.name;
    const positions=prop==='card'?[0]:shortEl&&prop==='input'?[0]:shortEl&&prop==='empty'?[1,2]:shortEl&&prop==='deleteMenu'?[1]:[];
    for(const index of positions){const arg=node.arguments[index],replacement=convert(arg);if(replacement)edit(arg,replacement);}
    if(prop==='setAttribute'&&node.arguments[0]?.type==='Literal'&&['aria-label','title','placeholder','alt','aria-description'].includes(node.arguments[0].value)){
      const arg=node.arguments[1], replacement=convert(arg);if(replacement)edit(node,`setDisplayAttribute(${raw(node.callee.object)}, ${raw(node.arguments[0])}, ${replacement})`);
    }
    if(['notify','notifyError','fail'].includes(prop)&&node.arguments[0]){const arg=node.arguments[0],replacement=convert(arg,'t');if(replacement)edit(arg,replacement);}
   }
  }
  if(node.type==='AssignmentExpression'&&node.operator==='='&&node.left.type==='MemberExpression'){
   const prop=node.left.property.name;
   if(['textContent','placeholder','alt','title'].includes(prop)){
    const replacement=convert(node.right);
    if(replacement){const dataset=node.left.object.type==='MemberExpression'&&node.left.object.property.name==='dataset';const receiver=dataset?raw(node.left.object.object):raw(node.left.object);const attribute=dataset?`data-${prop}`:prop;edit(node,`${prop==='textContent'?'setDisplayText':'setDisplayAttribute'}(${receiver}, ${prop==='textContent'?'':`${JSON.stringify(attribute)}, `}${replacement})`);}
   }
  }
  if(node.type==='Property'&&!node.computed&&['label','placeholder','ariaLabel'].includes(node.key.name||node.key.value)){
   const replacement=convert(node.value);if(replacement)edit(node.value,replacement);
  }
  // UI choice tuples convention: [technicalValue, visibleLabel].
  if(node.type==='ArrayExpression'&&parent?.type==='ArrayExpression'&&node.elements.length>=2&&node.elements[0]?.type==='Literal'&&typeof node.elements[0].value==='string'&&/^[a-z0-9_:-]+$/.test(node.elements[0].value)&&node.elements[1]?.type==='Literal'){
    const replacement=/[A-ZÁÉÍÓÚÑáéíóúñ ]/.test(node.elements[1].value||'')?convert(node.elements[1]):null;if(replacement)edit(node.elements[1],replacement);
  }
  for(const [k,v]of Object.entries(node)){
   if(['start','end','loc','range','comments','parent'].includes(k))continue;
   if(Array.isArray(v))v.forEach(n=>walk(n,node,k));else if(v&&typeof v==='object')walk(v,node,k);
  }
 }
 walk(result.program);
 const final=[];for(const e of edits.sort((a,b)=>(b.end-b.start)-(a.end-a.start)))if(!final.some(f=>e.start>=f.start&&e.end<=f.end))final.push(e);
 let output=source;for(const e of final.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.value+output.slice(e.end);
 if(apply)writeFileSync(file,output);
 console.log(`${file}: ${final.length} explicit labels${apply?' updated':''}`);
}

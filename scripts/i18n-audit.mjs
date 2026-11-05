/** Lists human-looking string literals that are not wrapped in msg()/t(). Review aid; never edits files. */
import { readFileSync } from 'node:fs';
import { parseSync } from 'rolldown/utils';
const SKIP = new Set(['msg','t','querySelector','querySelectorAll','addEventListener','removeEventListener','setAttribute','getAttribute','getItem','setItem','removeItem','closest','add','remove','toggle','contains','error','warn','log','debug','createElement','matches','getContext','startsWith','endsWith','includes','replace','test','split','join','padStart','setProperty','AppError','getElementById','has','get','set','delete','dispatchEvent','fetch','requestJson','request','Blob','RegExp','downloadLocal','open','writeText','postMessage','encode','parse','stringify']);
let total = 0;
for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, 'utf8'); const res = parseSync(file, src, { lang: 'ts' });
  const out = [];
  const walk = (n, parent) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(c => walk(c, parent)); return; }
    if ((n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral') {
      const text = n.type === 'Literal' ? n.value : n.quasis.map(q => q.value.cooked).join('{}');
      const callee = parent?.type === 'CallExpression' || parent?.type === 'NewExpression' ? (parent.callee.name || parent.callee.property?.name || '') : '';
      const human = /[a-záéíóúñ]{3,}\s+[a-záéíóúñ]{2,}/i.test(text) || /[áéíóúñ¿¡]/i.test(text) || /^[A-ZÁÉÍÓÚ][a-záéíóúñ]{2,}( [a-záéíóúñ]+)*$/.test(text);
      const technical = /^[a-z0-9_.:/#-]+(\s[a-z0-9_.:/#-]+)*$/.test(text) || /^(sv-|data-|aria-|--)/.test(text) || /[{};]\s*$/.test(text) && /:/.test(text);
      const isKey = parent?.type === 'Property' && parent.key === n;
      const isImport = parent?.type === 'ImportDeclaration';
      if (human && !technical && !isKey && !isImport && !SKIP.has(callee)) out.push(`${file}:${src.slice(0, n.start).split('\n').length}: [${callee || parent?.type}] ${text.replace(/\n/g, ' ').slice(0, 120)}`);
      if (n.type === 'Literal') return;
    }
    if (n.type === 'CallExpression' && (n.callee.name === 'msg' || n.callee.name === 't')) { for (const a of n.arguments.slice(1)) walk(a, n); return; }
    for (const [k, v] of Object.entries(n)) { if (['start','end','loc','range'].includes(k)) continue; if (v && typeof v === 'object') walk(v, n); }
  };
  walk(res.program, null);
  total += out.length; if (out.length) console.log(out.join('\n'));
}
console.error(`${total} unwrapped human-looking literals`);

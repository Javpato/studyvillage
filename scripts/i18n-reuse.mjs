/** Collects reusable English strings from another StudyVillage catalogue (an `EN` object literal). Read-only. */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseSync } from 'rolldown/utils';
const [sourceFile, siblingFile, out] = process.argv.slice(2);
const source = JSON.parse(readFileSync(sourceFile, 'utf8'));
const text = readFileSync(siblingFile, 'utf8');
const program = parseSync(siblingFile, text, { lang: 'ts' }).program;
const found = {};
const visit = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(visit);
  if (n.type === 'VariableDeclarator' && n.id?.name === 'EN' && n.init?.type === 'ObjectExpression') for (const p of n.init.properties) if (p.key && p.value?.type === 'Literal') found[p.key.value ?? p.key.name] = p.value.value;
  for (const [k, v] of Object.entries(n)) if (!['start', 'end'].includes(k) && v && typeof v === 'object') visit(v); };
visit(program);
const placeholders = s => [...s.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(m => m[1]).sort().join('|');
const reused = {};
for (const { source: es } of source) if (typeof found[es] === 'string' && found[es].trim() && placeholders(found[es]) === placeholders(es)) reused[es] = found[es];
writeFileSync(out, JSON.stringify(reused, null, 2));
console.log(JSON.stringify({ sibling: Object.keys(found).length, reused: Object.keys(reused).length, needed: source.length }));

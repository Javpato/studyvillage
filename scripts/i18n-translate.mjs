/**
 * Build-time translation of static interface text through the local Claude CLI.
 * Only the deduplicated catalogue strings are sent (never user documents), in
 * short batches with every tool disabled and a JSON schema for the reply.
 * Results are cached; a rerun only sends entries that are missing or failed
 * validation. The app itself never calls a translator at run time.
 *
 *   node scripts/i18n-translate.mjs <source.json> <reused.json> <cache.json> [--batch 80] [--jobs 4]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const [sourceFile, reusedFile, cacheFile] = process.argv.slice(2);
const option = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : fallback; };
const BATCH = option('--batch', 80), JOBS = option('--jobs', 4), ROUNDS = option('--rounds', 3);
const CLAUDE = process.env.CLAUDE_BIN || 'claude';

const source = JSON.parse(readFileSync(sourceFile, 'utf8')).map(e => e.source);
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
const reused = existsSync(reusedFile) ? JSON.parse(readFileSync(reusedFile, 'utf8')) : {};
for (const [es, en] of Object.entries(reused)) if (!cache[es]) cache[es] = en;

const placeholders = s => [...s.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(m => m[1]).sort().join('|');
const maths = s => (s.match(/\$/g) || []).length;
export function valid(es, en) {
  if (typeof en !== 'string' || !en.trim()) return 'empty';
  if (placeholders(es) !== placeholders(en)) return 'placeholders';
  if (maths(es) !== maths(en)) return 'math delimiters';
  if (/^\s/.test(es) !== /^\s/.test(en) || /\s$/.test(es) !== /\s$/.test(en)) return 'surrounding spaces';
  if (en.length > Math.max(40, es.length * 3)) return 'too long';
  return null;
}

const SCHEMA = JSON.stringify({ type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'en'], properties: { id: { type: 'integer' }, en: { type: 'string' } } } } } });
const SYSTEM = [
  'You translate the static interface text of StudyVillage, a calm pixel-art village where students study together: houses, a whiteboard, flashcards, quizzes, notes, voice chat, Werewolves and a drawing game, self-hosted servers, and a local Ollama AI.',
  'Translate each Spanish string into natural, concise English as a careful product localiser would. Match the tone: warm, plain, second person.',
  'Keep exactly: every {placeholder} (same names, never translated), LaTeX between $ signs, Markdown markers, emoji, arrows and symbols, keyboard keys (WASD, E, M, Shift, Ctrl, Esc), product names (StudyVillage, Ollama, Gartic Phone, PeerJS, LaTeX, PNG, JSON) and leading/trailing spaces.',
  'Keep capitalisation style (ALL CAPS stays caps). Keep it short where the source is a button or label. Strings that are code, CSS or identifiers are returned unchanged.',
  'Werewolves role names: Hombre lobo=Werewolf, Vidente=Seer, Guardián=Guard, Bruja=Witch, Cazador=Hunter, Cupido=Cupid, Aldeano=Villager. Aldea/vecindario=village/neighbourhood, barrio=neighbourhood, parcela=plot, pizarra=whiteboard, mazo=deck, apunte=note.',
  'Return only JSON matching the schema, one item per input id.',
].join(' ');

function run(batch) {
  const input = JSON.stringify(batch.map(([id, es]) => ({ id, es })));
  return new Promise(resolve => {
    const child = spawn(CLAUDE, ['-p', '--model', 'sonnet', '--effort', 'low', '--tools', '', '--no-session-persistence', '--output-format', 'json', '--json-schema', SCHEMA, '--system-prompt', SYSTEM], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      try {
        const envelope = JSON.parse(out);
        const payload = envelope.structured_output ?? (typeof envelope.result === 'string' ? JSON.parse(envelope.result.replace(/^```json\s*|```\s*$/g, '')) : envelope.result);
        resolve({ items: payload.items ?? [], cost: envelope.total_cost_usd ?? 0 });
      } catch { resolve({ items: [], cost: 0, error: `exit ${code}: ${(err || out).slice(0, 300)}` }); }
    });
    child.stdin.end(`Translate these ${batch.length} strings:\n${input}`);
  });
}

let spent = 0;
for (let round = 1; round <= ROUNDS; round++) {
  const missing = source.map((es, id) => [id, es]).filter(([, es]) => valid(es, cache[es]) !== null);
  console.log(`round ${round}: ${missing.length} to translate`);
  if (!missing.length) break;
  const batches = []; for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, batches.length) }, async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const result = await run(batch);
      spent += result.cost;
      if (result.error) { console.log(`  batch failed: ${result.error}`); continue; }
      let accepted = 0;
      for (const item of result.items) {
        const entry = batch.find(([id]) => id === item.id); if (!entry) continue;
        const problem = valid(entry[1], item.en);
        if (problem) console.log(`  rejected (${problem}): ${entry[1].slice(0, 60)} -> ${String(item.en).slice(0, 60)}`);
        else { cache[entry[1]] = item.en; accepted++; }
      }
      writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
      console.log(`  batch of ${batch.length}: ${accepted} accepted`);
    }
  }));
}
const left = source.filter(es => valid(es, cache[es]) !== null);
console.log(JSON.stringify({ total: source.length, translated: source.length - left.length, missing: left.length, costUsd: Number(spent.toFixed(4)) }));
if (left.length) process.exitCode = 1;

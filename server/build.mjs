/** Bundles server/src (and the shared app engines/contracts it imports) into one dependency-free file. */
import { build } from 'rolldown';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
await build({
  input: `${here}src/main.ts`,
  platform: 'node',
  external: [/^node:/],
  output: { file: `${here}dist/server.mjs`, format: 'esm', banner: '#!/usr/bin/env node', minify: false },
  logLevel: 'warn',
});
console.log('Built server/dist/server.mjs');

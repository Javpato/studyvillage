import {spriteRevision} from '../scripts/sprite-revision.mjs';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
// npm run dev:lan sets SV_HTTPS so iPads and phones get a secure context.
const https = process.env.SV_HTTPS ? { key: readFileSync(new URL('./.cert/key.pem', import.meta.url)), cert: readFileSync(new URL('./.cert/cert.pem', import.meta.url)) } : undefined;
export default defineConfig({
  define:{__SV_SPRITE_REVISION__:JSON.stringify(spriteRevision(new URL('./public/sprites/',import.meta.url)))},
  root: fileURLToPath(new URL('.', import.meta.url)), base: './',
  server: { host: '0.0.0.0', port: 3100, allowedHosts: true, https },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true }, clearScreen: false,
});

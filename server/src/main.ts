import {TetrisGame} from '../../packages/core/src/minigames/tetris';
/**
 * StudyVillage self-hosted server. The owner installs and operates it; it
 * needs only Node 24 (built-in SQLite) and stores everything in DATA_DIR.
 *
 *   node dist/server.mjs                 start
 *   node dist/server.mjs backup <file>   consistent copy while running
 *   node dist/server.mjs restore <file>  replace the database (server stopped)
 */
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WerewolvesGame } from '../../packages/core/src/minigames/werewolves';
import { GarticGame } from '../../packages/core/src/minigames/gartic-phone';
import { StudyQuiz } from '../../packages/core/src/minigames/study-quiz';
import { GroupProjectsBoard } from '../../packages/core/src/projects/group-projects';
import { SERVER_AUTHORITY, SERVER_PROTOCOL } from '../../packages/runtime/src/server/contracts';
import { Store } from './store';
import { ServerOllama, type OllamaConfig } from './ollama';
import { aiFeatureSchema } from '../../packages/runtime/src/ai/contracts';
import { upgrade } from './ws';
import { World, type RoomEngine, type WorldOptions } from './world';

export const VERSION = '1.0.0';
export const ENGINES: WorldOptions['engines'] = {
  tetris: () => new TetrisGame() as unknown as RoomEngine,
  werewolves: () => new WerewolvesGame(undefined, SERVER_AUTHORITY) as unknown as RoomEngine,
  gartic: () => new GarticGame(undefined, SERVER_AUTHORITY) as unknown as RoomEngine,
  study: organizer => new StudyQuiz(() => organizer() ?? SERVER_AUTHORITY) as unknown as RoomEngine,
  projects: () => new GroupProjectsBoard(false) as unknown as RoomEngine,
};

export interface ServerConfig { ollama?:OllamaConfig; port: number; host: string; dataDir: string; name: string; origins: string[]; claimSecret?: string; tlsCert?: string; tlsKey?: string; log?: (line: string) => void }

export function configFromEnv(env = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 8787), host: env.HOST ?? '0.0.0.0', dataDir: resolve(env.DATA_DIR ?? './data'),
    name: (env.WORLD_NAME ?? 'StudyVillage').slice(0, 48), origins: (env.ALLOWED_ORIGINS ?? '*').split(',').map(s => s.trim()).filter(Boolean),
    ollama: { enabled:env.OLLAMA_ENABLED==='true', url:env.OLLAMA_URL||'http://127.0.0.1:11434', model:env.OLLAMA_MODEL||'', features:(env.OLLAMA_FEATURES||'flashcards,quizzes,board,boardVision,sprites,gartic').split(',').map(s=>aiFeatureSchema.parse(s.trim())) },
    claimSecret: env.CLAIM_SECRET, tlsCert: env.TLS_CERT, tlsKey: env.TLS_KEY,
  };
}

export function startServer(config: ServerConfig): Promise<{ port: number; world: World; store: Store; claimSecret: string | null; close(): Promise<void> }> {
  const log = config.log ?? (line => console.log(`[studyvillage] ${line}`));
  const store = new Store(config.dataDir === ':memory:' ? ':memory:' : join(config.dataDir, 'world.sqlite'));
  let claimSecret: string | null = null;
  if (!store.admin()) {
    claimSecret = config.claimSecret ?? randomBytes(24).toString('base64url');
    store.setClaimSecret(claimSecret);
    if (config.dataDir !== ':memory:') writeFileSync(join(config.dataDir, 'claim-secret.txt'), `${claimSecret}\n`, { mode: 0o600 });
    log(`No administrator yet. One-time claim secret: ${claimSecret} (also in ${config.dataDir}/claim-secret.txt)`);
  } else if (config.dataDir !== ':memory:' && existsSync(join(config.dataDir, 'claim-secret.txt'))) rmSync(join(config.dataDir, 'claim-secret.txt'));
  const ai = config.ollama ? new ServerOllama(config.ollama) : undefined;
  const world = new World(store, { name: config.name, engines: ENGINES, ai, log });
  const allowOrigin = (origin: string | undefined) => config.origins.includes('*') || (!!origin && config.origins.includes(origin));
  const handler = (request: IncomingMessage, response: ServerResponse) => {
    const origin = request.headers.origin;
    if (origin && allowOrigin(origin)) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET' && (request.url === '/health' || request.url === '/api/info')) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ app: 'studyvillage-server', version: VERSION, protocol: SERVER_PROTOCOL, name: config.name, maxOnline: store.maxOnline, online: world.online, neighborhoods: store.neighborhoods, needsClaim: !store.admin() }));
      return;
    }
    response.statusCode = 404; response.end('Not found');
  };
  const server = config.tlsCert && config.tlsKey ? createHttps({ cert: readFileSync(config.tlsCert), key: readFileSync(config.tlsKey) }, handler) : createHttp(handler);
  let counter = 0;
  server.on('upgrade', (request, socket, head) => {
    if (!request.url?.startsWith('/ws')) { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
    const ws = upgrade(request, socket, head, `${Date.now().toString(36)}${(counter++).toString(36)}${randomBytes(3).toString('hex')}`, { maxMessageBytes: 96 * 1024, maxBufferedBytes: 4 * 1024 * 1024, allowOrigin });
    if (ws) world.attach(ws);
  });
  return new Promise((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : config.port;
      log(`Listening on ${config.tlsCert ? 'https' : 'http'}://${config.host}:${port} (WebSocket /ws, data ${config.dataDir})`);
      resolveStart({ port, world, store, claimSecret, close: () => new Promise(done => { ai?.dispose(); world.dispose(); server.close(() => { store.close(); done(); }); server.closeAllConnections?.(); }) });
    });
  });
}

function cli(): void {
  const [command, file] = process.argv.slice(2);
  const config = configFromEnv();
  const database = join(config.dataDir, 'world.sqlite');
  if (command === 'backup') {
    if (!file) throw new Error('Usage: backup <target.sqlite>');
    const store = new Store(database); store.backup(resolve(file)); store.close();
    console.log(`Backup written to ${resolve(file)}`); return;
  }
  if (command === 'restore') {
    if (!file) throw new Error('Usage: restore <backup.sqlite>');
    const check = new DatabaseSync(resolve(file), { readOnly: true });
    const ok = check.prepare("SELECT value FROM meta WHERE key = 'worldId'").get(); check.close();
    if (!ok) throw new Error('That file is not a StudyVillage backup.');
    for (const suffix of ['-wal', '-shm']) if (existsSync(database + suffix)) rmSync(database + suffix);
    if (existsSync(database)) copyFileSync(database, `${database}.before-restore`);
    copyFileSync(resolve(file), database);
    console.log(`Restored ${resolve(file)}. The previous database is kept as world.sqlite.before-restore.`); return;
  }
  void startServer(config).then(running => {
    const stop = () => { void running.close().then(() => process.exit(0)); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }).catch(error => { console.error(error); process.exit(1); });
}

if (process.argv[1] && /server\.mjs$|main\.ts$/.test(process.argv[1])) cli();

import { createServer } from 'node:http';
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateIdentity, randomId, sign } from '../../packages/core/src/identity';
import type { LocalIdentity, PublicHouse, BoardStroke } from '../../packages/core/src/protocol/types';
import { SERVER_PROTOCOL, SERVER_AUTHORITY, neighborhoodsFor, type ServerMessage } from '../../packages/runtime/src/server/contracts';
import { startServer } from '../src/main';
import { Store } from '../src/store';

type Running = Awaited<ReturnType<typeof startServer>>;
const running: Running[] = []; const dirs: string[] = [];
afterEach(async () => { for (const r of running.splice(0)) await r.close(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function boot(dataDir = ':memory:', claimSecret = 'install-secret-0123456789'): Promise<Running> {
  const r = await startServer({ port: 0, host: '127.0.0.1', dataDir, name: 'Prueba', origins: ['*'], claimSecret, log: () => {} });
  running.push(r); return r;
}
function tempDir(): string { const d = mkdtempSync(join(tmpdir(), 'sv-server-')); dirs.push(d); return d; }

class TestClient {
  ws!: WebSocket; messages: ServerMessage[] = []; welcome: Extract<ServerMessage, { t: 'welcome' }> | null = null; denied: string | null = null;
  private waiters: { match: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  constructor(readonly identity: LocalIdentity) {}
  static async create(name: string): Promise<TestClient> { return new TestClient(await generateIdentity(name, '#336699')); }
  get id(): string { return this.identity.public.fingerprint; }
  async connect(port: number, options: { saved?: boolean; invite?: string; claim?: string; deviceId?:string; deviceName?:string } = {}): Promise<string> {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.onmessage = event => { const m = JSON.parse(String(event.data)) as ServerMessage; this.messages.push(m); for (const w of [...this.waiters]) if (w.match(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); } };
    await new Promise<void>((resolve, reject) => { this.ws.onopen = () => resolve(); this.ws.onerror = () => reject(new Error('socket')); });
    const challenge = this.next(m => m.t === 'challenge');
    this.ws.send(JSON.stringify({ t: 'hello', v: SERVER_PROTOCOL }));
    const c = await challenge as Extract<ServerMessage, { t: 'challenge' }>;
    const saved = options.saved ?? true;
    const signature = await sign(this.identity, 'server-auth', { worldId: c.worldId, nonce: c.nonce, fingerprint: this.id, saved,...(options.deviceId?{deviceId:options.deviceId}:{}) });
    const outcome = this.next(m => m.t === 'welcome' || m.t === 'denied');
    this.ws.send(JSON.stringify({ t: 'auth', identity: this.identity.public, saved, signature,...(options.deviceId?{deviceId:options.deviceId}:{}),...(options.deviceName?{deviceName:options.deviceName}:{}), ...(options.invite ? { invite: options.invite } : {}), ...(options.claim ? { claim: options.claim } : {}) }));
    const result = await outcome;
    if (result.t === 'welcome') { this.welcome = result; return result.role; }
    this.denied = (result as { code: string }).code; return `denied:${this.denied}`;
  }
  next(match: (m: ServerMessage) => boolean, timeout = 5000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('timeout waiting')), timeout); this.waiters.push({ match, resolve: m => { clearTimeout(timer); resolve(m); } }); });
  }
  async request(body: unknown, id = randomId(12)): Promise<Extract<ServerMessage, { t: 'ack' }>> {
    const ack = this.next(m => m.t === 'ack' && m.id === id);
    this.ws.send(JSON.stringify({ t: 'req', id, body }));
    try{return await ack as Extract<ServerMessage, { t: 'ack' }>; }catch(error){throw new Error(`Request timed out: ${(body as {op?:string}).op}; socket state ${this.ws.readyState}`,{cause:error});}
  }
  send(body: unknown): void { this.ws.send(JSON.stringify({ t: 'req', id: randomId(12), body })); }
  async signHouse(house: PublicHouse) { return { house, signature: await sign(this.identity, 'house', { sessionId: this.welcome!.scope, epoch: this.welcome!.epoch, house }) }; }
  async commit(boardId: string, strokes: BoardStroke[]) {
    const scope = { sessionId: this.welcome!.scope, epoch: this.welcome!.epoch };
    const documents = []; for (const stroke of strokes) documents.push({ stroke, signature: await sign(this.identity, 'board', { ...scope, stroke }) });
    const unsigned = { id: randomId(), boardId, documents };
    return { ...unsigned, signature: await sign(this.identity, 'board-commit', { ...scope, ...unsigned }) };
  }
  close(): Promise<void> { return new Promise(resolve => { if (this.ws.readyState === WebSocket.CLOSED) { resolve(); return; } this.ws.onclose = () => resolve(); this.ws.close(); }); }
}

const house = (owner: string, revision = 2): PublicHouse => ({ ownerId: owner, revision, name: 'Casa de prueba', access: 'open', theme: 'mint', furniture: [{ id: 'board', kind: 'board', x: 340, y: 95, publicAlias: 'Ideas' }] });
const stroke = (author: string, boardId: string, id = randomId(9), seq = 1): BoardStroke => ({ id, author, boardId, seq, color: '#336699', width: 4, tool: 'pen', points: [{ x: 1, y: 2 }, { x: 30, y: 40 }], deleted: false });
async function adminAndInvite(r: Running) {
  const admin = await TestClient.create('Admin');
  expect(await admin.connect(r.port, { claim: 'install-secret-0123456789' })).toBe('admin');
  const ack = await admin.request({ op: 'admin.invite.create', label: 'clase', uses: 30, hours: 24 });
  expect(ack.ok).toBe(true);
  return { admin, invite: (ack as { result: { code: string; id: string } }).result };
}

describe('neighbourhood capacity rule', () => {
  it('needs one neighbourhood per six people, never more than four', () => {
    expect([1, 6, 7, 10, 12, 13, 18, 19, 24, 99].map(neighborhoodsFor)).toEqual([1, 1, 2, 2, 2, 3, 3, 4, 4, 4]);
  });
});

describe('self-hosted server', () => {
  it('reports compatibility over HTTP', async () => {
    const r = await boot();
    const info = await (await fetch(`http://127.0.0.1:${r.port}/health`)).json();
    expect(info).toMatchObject({ app: 'studyvillage-server', protocol: SERVER_PROTOCOL, maxOnline: 6, needsClaim: true });
  });

  it('claims administration once with the installation secret; knowing the URL grants nothing', async () => {
    const r = await boot();
    const stranger = await TestClient.create('Desconocido');
    expect(await stranger.connect(r.port)).toBe('denied:invite');
    const wrong = await TestClient.create('Intruso');
    expect(await wrong.connect(r.port, { claim: 'not-the-secret-000000' })).toBe('denied:claim');
    const temporary = await TestClient.create('Temporal');
    expect(await temporary.connect(r.port, { claim: 'install-secret-0123456789', saved: false })).toBe('denied:unsaved');
    const admin = await TestClient.create('Admin');
    expect(await admin.connect(r.port, { claim: 'install-secret-0123456789' })).toBe('admin');
    const second = await TestClient.create('Otro');
    expect(await second.connect(r.port, { claim: 'install-secret-0123456789' })).toBe('denied:claim');
    await admin.close();
  });

  it('rejects a forged signature', async () => {
    const r = await boot();
    const a = await TestClient.create('A'), b = await TestClient.create('B');
    const ws = new WebSocket(`ws://127.0.0.1:${r.port}/ws`);
    await new Promise(resolve => { ws.onopen = resolve; });
    const got: ServerMessage[] = []; ws.onmessage = e => got.push(JSON.parse(String(e.data)));
    ws.send(JSON.stringify({ t: 'hello', v: SERVER_PROTOCOL }));
    await new Promise(resolve => setTimeout(resolve, 100));
    const c = got[0] as Extract<ServerMessage, { t: 'challenge' }>;
    const signature = await sign(b.identity, 'server-auth', { worldId: c.worldId, nonce: c.nonce, fingerprint: a.id, saved: true });
    ws.send(JSON.stringify({ t: 'auth', identity: a.identity.public, saved: true, signature, claim: 'install-secret-0123456789' }));
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(got.at(-1)).toEqual({ t: 'denied', code: 'signature' });
  });

  it('admits invited people: saved identities become residents, temporary ones visit; revoked invites stop working', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const ana = await TestClient.create('Ana'), tmp = await TestClient.create('Temporal');
    expect(await ana.connect(r.port, { invite: invite.code })).toBe('resident');
    expect(await tmp.connect(r.port, { invite: invite.code, saved: false })).toBe('visitor');
    expect(r.store.resident(ana.id)?.plot).toBe(1);
    expect(r.store.resident(tmp.id)).toBeNull();
    // A visitor cannot keep a house on the server.
    const publish = await tmp.request({ op: 'house.publish', document: await tmp.signHouse(house(tmp.id)) });
    expect(publish).toMatchObject({ ok: false, code: 'unsaved' });
    expect((await admin.request({ op: 'admin.invite.revoke', id: invite.id })).ok).toBe(true);
    const late = await TestClient.create('Tarde');
    expect(await late.connect(r.port, { invite: invite.code })).toBe('denied:invite');
    // Accepted members come back without an invite and without the admin.
    await admin.close(); await ana.close();
    const again = new TestClient(ana.identity);
    expect(await again.connect(r.port)).toBe('resident');
    await again.close(); await tmp.close();
  });

  it('enforces capacity for new entries only and grows neighbourhoods up to four without deleting any', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const one = await TestClient.create('Uno');
    expect(await one.connect(r.port, { invite: invite.code })).toBe('resident');
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 2 })).ok).toBe(true);
    const three = await TestClient.create('Tres');
    expect(await three.connect(r.port, { invite: invite.code })).toBe('denied:full');
    expect(r.world.online).toBe(2);
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 1 })).ok).toBe(true);
    expect(r.world.online).toBe(2); // Lowering never kicks anyone.
    const ten = await admin.request({ op: 'admin.capacity', maxOnline: 10 });
    expect(ten).toMatchObject({ ok: true, result: { maxOnline: 10, neighborhoods: 2 } });
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 24 }) as { result: { neighborhoods: number } }).result.neighborhoods).toBe(4);
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 6 }) as { result: { neighborhoods: number } }).result.neighborhoods).toBe(4);
    expect(r.store.residents()).toHaveLength(2);
    expect((await admin.request({ op: 'admin.capacity', maxOnline: 25 })).ok).toBe(false);
    await admin.close(); await one.close();
  });

  it('fills 24 connections across four neighbourhoods of six plots and refuses the 25th', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    await admin.request({ op: 'admin.capacity', maxOnline: 24 });
    const people: TestClient[] = [];
    for (let i = 0; i < 23; i++) { const p = await TestClient.create(`P${i}`); expect(await p.connect(r.port, { invite: invite.code })).toBe('resident'); people.push(p); }
    const counts = [0, 0, 0, 0]; for (const res of r.store.residents()) counts[res.neighborhood]++;
    expect(counts).toEqual([6, 6, 6, 6]);
    const extra = await TestClient.create('Extra');
    expect(await extra.connect(r.port, { invite: invite.code })).toBe('denied:full');
    for (const p of people) await p.close(); await admin.close();
  });

  it('persists houses and boards across a restart; guests continue when the admin leaves', async () => {
    const dir = tempDir();
    let r = await boot(dir);
    const { admin, invite } = await adminAndInvite(r);
    const bea = await TestClient.create('Bea');
    await bea.connect(r.port, { invite: invite.code });
    expect((await bea.request({ op: 'house.publish', document: await bea.signHouse(house(bea.id)) })).ok).toBe(true);
    const old = await bea.request({ op: 'house.publish', document: await bea.signHouse(house(bea.id, 1)) });
    expect(old).toMatchObject({ ok: true, result: { conflict: true, revision: 2 } });
    const ref = `house:${bea.id}:board`;
    bea.send({ op: 'presence', position: { areaId: 'residential', x: 100, y: 100, direction: 'down', moving: false }, houseId: bea.id });
    expect((await bea.request({ op: 'board.select', ref })).ok).toBe(true);
    const commit = await bea.commit(ref, [stroke(bea.id, ref, 'line-1')]);
    const requestId = randomId(12);
    expect(await bea.request({ op: 'board.commit', document: commit }, requestId)).toMatchObject({ ok: true, result: { applied: 1 } });
    // Retrying the same request id returns the stored answer, not a second write.
    expect(await bea.request({ op: 'board.commit', document: commit }, requestId)).toMatchObject({ ok: true, result: { applied: 1 } });
    await admin.close();
    // The admin is gone; Bea can still start an activity and is its organiser.
    const view = bea.next(m => m.t === 'app' && m.from === SERVER_AUTHORITY);
    bea.send({ op: 'app.send', channel: 'werewolves', to: SERVER_AUTHORITY, data: JSON.stringify({ t: 'hello' }) });
    expect(JSON.parse((await view as { data: string }).data)).toMatchObject({ t: 'view', lead: true });
    await bea.close(); await r.close(); running.splice(running.indexOf(r), 1);

    r = await boot(dir);
    const back = new TestClient(bea.identity);
    expect(await back.connect(r.port)).toBe('resident');
    expect(back.welcome!.scope).toBe(commit.boardId ? back.welcome!.scope : '');
    back.send({ op: 'presence', position: { areaId: 'residential', x: 100, y: 100, direction: 'down', moving: false }, houseId: back.id });
    const board = back.next(m => m.t === 'board');
    await back.request({ op: 'board.select', ref });
    expect((await board as { documents: { stroke: { id: string } }[] }).documents.map(d => d.stroke.id)).toEqual(['line-1']);
    expect((r.store.house(back.id)!.document as { house: PublicHouse }).house.name).toBe('Casa de prueba');
    await back.close();
  });

  it('keeps a room\'s own activities apart and only for people inside that room', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const carl = await TestClient.create('Carl');
    await carl.connect(r.port, { invite: invite.code });
    const scope = `room:${admin.id}:ground:r1`;
    // Carl is not in that room (it does not even exist): the server refuses its copy of the activity.
    expect(await carl.request({ op: 'app.send', channel: 'projects', to: SERVER_AUTHORITY, data: JSON.stringify({ t: 'hello', s: scope }) })).toMatchObject({ ok: false });
    expect(await carl.request({ op: 'app.send', channel: 'projects', to: SERVER_AUTHORITY, data: JSON.stringify({ t: 'hello', s: 'room:../../etc' }) })).toMatchObject({ ok: false });
    // The village-wide copy still answers, without a scope.
    const view = carl.next(m => m.t === 'app' && m.from === SERVER_AUTHORITY);
    carl.send({ op: 'app.send', channel: 'projects', to: SERVER_AUTHORITY, data: JSON.stringify({ t: 'hello' }) });
    const wire = JSON.parse((await view as { data: string }).data);
    expect(wire).toMatchObject({ t: 'view' });
    expect(wire.s).toBeUndefined();
    await carl.close(); await admin.close();
  });

  it('shares board changes with people at the same board and refuses foreign objects and forged commits', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const carl = await TestClient.create('Carl');
    await carl.connect(r.port, { invite: invite.code });
    const ref = 'area:community:main';
    const at = { areaId: 'community', x: 300, y: 200, direction: 'down', moving: false };
    for (const c of [admin, carl]) { c.send({ op: 'presence', position: at, houseId: null }); await c.request({ op: 'board.select', ref }); }
    const seen = carl.next(m => m.t === 'board' && !m.reset);
    expect((await admin.request({ op: 'board.commit', document: await admin.commit(ref, [stroke(admin.id, ref, 'mine')]) })).ok).toBe(true);
    expect((await seen as { documents: { stroke: { id: string } }[] }).documents[0].stroke.id).toBe('mine');
    // Carl may copy it, but cannot overwrite it under his own name.
    const stolen = await carl.request({ op: 'board.commit', document: await carl.commit(ref, [{ ...stroke(carl.id, ref, 'mine', 5) }]) });
    expect(stolen).toMatchObject({ ok: false, code: 'forbidden' });
    const forged = await carl.commit(ref, [stroke(carl.id, ref, 'x')]);
    forged.documents[0].stroke.points = [{ x: 9, y: 9 }];
    expect(await carl.request({ op: 'board.commit', document: forged })).toMatchObject({ ok: false, code: 'signature' });
    // Signals only reach people in the same scene.
    expect((await carl.request({ op: 'media.signal', to: admin.id, data: '{"kind":"offer"}' })).ok).toBe(true);
    carl.send({ op: 'presence', position: { ...at, areaId: 'study' }, houseId: null });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(await carl.request({ op: 'media.signal', to: admin.id, data: '{"kind":"offer"}' })).toMatchObject({ ok: false, code: 'forbidden' });
    await admin.close(); await carl.close();
  });

  it('lets a house owner change a guest\'s layer in that house only', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const guest = await TestClient.create('Invitada'); await guest.connect(r.port, { invite: invite.code });
    await admin.request({ op: 'house.publish', document: await admin.signHouse(house(admin.id)) });
    const ref = `house:${admin.id}:board`;
    for (const c of [admin, guest]) { c.send({ op: 'presence', position: { areaId: 'residential', x: 100, y: 100, direction: 'down', moving: false }, houseId: admin.id }); await c.request({ op: 'board.select', ref }); }
    const drawn = stroke(guest.id, ref, 'guest-line');
    expect((await guest.request({ op: 'board.commit', document: await guest.commit(ref, [drawn]) })).ok).toBe(true);
    expect((await admin.request({ op: 'board.commit', document: await admin.commit(ref, [{ ...drawn, seq: 2, deleted: true }]) })).ok).toBe(true);
    expect(r.store.stroke(ref, 'guest-line')!.stroke).toMatchObject({ author: guest.id, deleted: true });
    // The guest has no such power over the owner's objects.
    const owners = stroke(admin.id, ref, 'owner-line');
    await admin.request({ op: 'board.commit', document: await admin.commit(ref, [owners]) });
    expect(await guest.request({ op: 'board.commit', document: await guest.commit(ref, [{ ...owners, seq: 2, deleted: true }]) })).toMatchObject({ ok: false, code: 'forbidden' });
    await admin.close(); await guest.close();
  });

  it('asks the owner before a visit into an "ask" house and never lets anyone into a locked one', async () => {
    const r = await boot();
    const { admin, invite } = await adminAndInvite(r);
    const dora = await TestClient.create('Dora');
    await dora.connect(r.port, { invite: invite.code });
    await admin.request({ op: 'house.publish', document: await admin.signHouse({ ...house(admin.id), access: 'ask' }) });
    const pending = await dora.request({ op: 'house.visit', ownerId: admin.id }) as { result: { pending: boolean; requestId: string } };
    expect(pending.result.pending).toBe(true);
    const result = dora.next(m => m.t === 'visit.result');
    await admin.request({ op: 'house.decide', requestId: pending.result.requestId, accept: true });
    expect(await result).toMatchObject({ accepted: true, ownerId: admin.id });
    await admin.request({ op: 'house.publish', document: await admin.signHouse({ ...house(admin.id, 3), access: 'locked' }) });
    const eve = await TestClient.create('Eve'); await eve.connect(r.port, { invite: invite.code });
    expect(await eve.request({ op: 'house.visit', ownerId: admin.id })).toMatchObject({ ok: false, code: 'forbidden' });
    await admin.close(); await dora.close(); await eve.close();
  });

  it('imports my own house and boards in one transaction', async () => {
    const r = await boot();
    const { admin } = await adminAndInvite(r);
    const ref = `house:${admin.id}:board`;
    const boards = [await admin.commit(ref, [stroke(admin.id, ref, 'a'), stroke(admin.id, ref, 'b')])];
    const ack = await admin.request({ op: 'import', house: await admin.signHouse(house(admin.id, 7)), boards });
    expect(ack).toMatchObject({ ok: true, result: { house: 7, objects: 2 } });
    // Someone else's board cannot be smuggled into my import.
    const other = `house:${'a'.repeat(64)}:board`;
    const bad = await admin.request({ op: 'import', house: await admin.signHouse(house(admin.id, 8)), boards: [await admin.commit(other, [stroke(admin.id, other)])] });
    expect(bad).toMatchObject({ ok: false, code: 'forbidden' });
    expect(r.store.house(admin.id)!.revision).toBe(7);
    await admin.close();
  });

  it('backs up and restores the database', async () => {
    const dir = tempDir();
    const r = await boot(dir);
    const { admin } = await adminAndInvite(r);
    await admin.request({ op: 'house.publish', document: await admin.signHouse(house(admin.id, 4)) });
    r.store.backup(join(dir, 'backup.sqlite'));
    await admin.close();
    const copy = new Store(join(dir, 'backup.sqlite'));
    expect(copy.house(admin.id)!.revision).toBe(4);
    expect(copy.worldId).toBe(r.store.worldId);
    copy.close();
  });

  it('reports a disk failure instead of acknowledging a write it did not keep', async () => {
    const r = await boot();
    const { admin } = await adminAndInvite(r);
    const original = r.store.putHouse.bind(r.store);
    r.store.putHouse = () => { throw new Error('SQLITE_FULL: database or disk is full'); };
    expect(await admin.request({ op: 'house.publish', document: await admin.signHouse(house(admin.id, 5)) })).toMatchObject({ ok: false, code: 'storage' });
    r.store.putHouse = original;
    expect(r.store.house(admin.id)).toBeNull();
    await admin.close();
  });
});

it('keeps accepted calls and parties across neighborhoods and excludes unrelated location voice', async () => {
  const r = await boot();
  const { admin, invite } = await adminAndInvite(r);
  await admin.request({ op: 'admin.capacity', maxOnline: 12 });
  const guest = await TestClient.create('VoiceGuest'); await guest.connect(r.port, { invite: invite.code });
  const lastVoice = (c: TestClient) => c.messages.filter((m): m is Extract<ServerMessage, {t:'voice'}> => m.t === 'voice').at(-1)!;
  await admin.request({ op: 'voice', command: { action: 'create', name: 'Friends' } });
  const invitationEvent = guest.next(m => m.t === 'voice' && m.voice.invitations.length > 0);
  await admin.request({ op: 'voice', command: { action: 'invite', target: guest.id } });
  await invitationEvent;
  const invited = lastVoice(guest).voice.invitations[0]; expect(invited).toBeDefined();
  await guest.request({ op: 'voice', command: { action: 'respond', invitation: invited.id, accept: true } });
  const channel = lastVoice(guest).voice.selected!.id;
  const session = lastVoice(guest).session;
  expect((await guest.request({ op: 'travel', neighborhood: 1 })).ok).toBe(true);
  const offer = JSON.stringify({ k: 'offer', cid: 'test-call-001', meta: { kind: 'audio' }, sdp: 'test' });
  expect((await guest.request({ op: 'media.signal', to: admin.id, data: offer })).ok).toBe(true);
  expect(lastVoice(guest).voice.selected!.id).toBe(channel); expect(lastVoice(guest).session).toBe(session);
  await admin.request({ op: 'voice', command: { action: 'remove', target: guest.id } });
  expect(await guest.request({ op: 'media.signal', to: admin.id, data: offer })).toMatchObject({ ok: false, code: 'forbidden' });
  await admin.request({ op: 'voice', command: { action: 'call', target: guest.id } });
  expect(await guest.request({ op: 'media.signal', to: admin.id, data: offer })).toMatchObject({ ok: false, code: 'forbidden' });
  await guest.request({ op: 'voice', command: { action: 'call', target: admin.id } });
  expect((await guest.request({ op: 'media.signal', to: admin.id, data: offer })).ok).toBe(true);
  await admin.close(); await guest.close();
});

it('authorizes each private entry, isolates room content and boards, and saves workspaces across restarts', async()=>{
 const dir=tempDir();let r=await boot(dir);const{admin,invite}=await adminAndInvite(r);
 const guest=await TestClient.create('RoomGuest');await guest.connect(r.port,{invite:invite.code});
 const home={...house(admin.id),floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math'},{id:'code',name:'Code'}]}]};
 await admin.request({op:'house.publish',document:await admin.signHouse(home)});
 const at={areaId:'residential',x:384,y:344,direction:'up',moving:false};
 for(const p of[admin,guest])p.send({op:'presence',position:at,houseId:admin.id});
 const corridor={floorId:'ground',roomId:null},room={floorId:'ground',roomId:'math'};
 const view=(p:TestClient)=>p.messages.filter((m):m is Extract<ServerMessage,{t:'workspace'}>=>m.t==='workspace').at(-1)!.workspace;
 expect((await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}})).ok).toBe(false);
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:corridor}});
 const floorRequest=view(admin).requests[0];expect(floorRequest.space).toEqual(corridor);
 await admin.request({op:'workspace',command:{action:'decide',request:floorRequest.id,accept:true}});
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}});
 await admin.request({op:'workspace',command:{action:'decide',request:view(admin).requests[0].id,accept:true}});
 await admin.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}});
 const doc=view(admin).document!;expect(doc.revision).toBe(0);
 await admin.request({op:'workspace',command:{action:'commit',base:0,document:{...doc,notes:[{id:'mathnote',title:'Math',text:'Room-only proof'}]}}});
 const ref=`house:${admin.id}:space:ground:math:board`;
 expect((await guest.request({op:'board.select',ref})).ok).toBe(true);
 // Equal floor/room ids in another house cannot be used to bypass its entry approval.
 await guest.request({op:'house.publish',document:await guest.signHouse({...house(guest.id),floors:home.floors})});
 guest.send({op:'presence',houseId:guest.id,position:{...at,space:room}});
 expect((await guest.request({op:'board.select',ref})).ok).toBe(true);
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:corridor}});
 expect((await guest.request({op:'board.select',ref})).ok).toBe(false);expect(view(guest).document).toMatchObject({furniture:[],notes:[],materials:[],projects:[]});
 const deniedPosition=guest.next(m=>m.t==='state'&&m.present.some(p=>p.identity.fingerprint===guest.id&&p.position.space?.roomId===null));guest.send({op:'presence',houseId:admin.id,position:{...at,space:room}});await deniedPosition;
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}});expect(view(admin).requests).toHaveLength(1);
 await guest.request({op:'access.cancel',requestId:view(admin).requests[0].id});
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:null}});
 expect((await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}})).ok).toBe(false);
 await admin.close();await guest.close();await r.close();running.splice(running.indexOf(r),1);
 r=await boot(dir);const again=new TestClient(admin.identity);await again.connect(r.port);again.send({op:'presence',houseId:again.id,position:at});await again.request({op:'workspace',command:{action:'enter',owner:again.id,space:room}});
 expect(view(again).document?.notes[0].text).toBe('Room-only proof');await again.close();
});

it('explicitly reports a protocol mismatch to older clients',async()=>{
 const r=await boot();const socket=new WebSocket(`ws://127.0.0.1:${r.port}/ws`);
 const message=await new Promise<ServerMessage>((resolve,reject)=>{socket.onopen=()=>socket.send(JSON.stringify({t:'hello',v:SERVER_PROTOCOL-1}));socket.onmessage=e=>resolve(JSON.parse(String(e.data)));socket.onerror=()=>reject(new Error('socket'));});
 expect(message).toEqual({t:'denied',code:'version'});socket.close();
});

it('keeps house and room friend access across a server restart with the owner offline, then revokes it',async()=>{
  const dir=tempDir();let r=await boot(dir);const{admin,invite}=await adminAndInvite(r);
  const houseFriend=await TestClient.create('House friend'),roomFriend=await TestClient.create('Room friend'),outsider=await TestClient.create('Room friend');
  for(const friend of [houseFriend,roomFriend,outsider])expect(await friend.connect(r.port,{invite:invite.code})).toBe('resident');
  const room={floorId:'ground',roomId:'math'};
  const layout:PublicHouse={...house(admin.id),doorPositions:{'lobby>ground:-':{x:600,y:320},'ground:->ground:math':{x:240,y:200}},access:'locked',allowlist:[houseFriend.id],floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math',allowlist:[roomFriend.id]},{id:'code',name:'Code'}]}]};
  expect((await admin.request({op:'house.publish',document:await admin.signHouse(layout)})).ok).toBe(true);
  await Promise.all([admin,houseFriend,roomFriend,outsider].map(c=>c.close()));await r.close();running.splice(running.indexOf(r),1);
  r=await boot(dir);
  for(const friend of [houseFriend,roomFriend,outsider])expect(await friend.connect(r.port)).toBe('resident');
  for(const friend of [houseFriend,roomFriend]){
    expect(await friend.request({op:'house.visit',ownerId:admin.id})).toMatchObject({ok:true,result:{accepted:true}});
    friend.send({op:'presence',houseId:admin.id,position:{x:384,y:344,direction:'up',moving:false}});
  }
  expect((await outsider.request({op:'house.visit',ownerId:admin.id})).ok).toBe(false);
  const state=[...roomFriend.messages].reverse().find(m=>m.t==='state');
  expect(state?.t==='state'&&state.residents.find(r=>r.fingerprint===admin.id)?.house?.house.doorPositions).toEqual(layout.doorPositions);
  expect((await roomFriend.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}})).ok).toBe(true);
  expect((await roomFriend.request({op:'board.select',ref:`house:${admin.id}:space:ground:math:board`})).ok).toBe(true);
  expect((await roomFriend.request({op:'workspace',command:{action:'enter',owner:admin.id,space:{floorId:'ground',roomId:'code'}}})).ok).toBe(false);
  expect((await houseFriend.request({op:'workspace',command:{action:'enter',owner:admin.id,space:room}})).ok).toBe(false);
  expect(await admin.connect(r.port)).toBe('admin');
  const revoked={...layout,revision:layout.revision+1,allowlist:[],floors:[{...layout.floors![0],rooms:layout.floors![0].rooms.map(r=>({...r,allowlist:[]}))}]};
  expect((await admin.request({op:'house.publish',document:await admin.signHouse(revoked)})).ok).toBe(true);
  expect((await roomFriend.request({op:'board.select',ref:`house:${admin.id}:space:ground:math:board`})).ok).toBe(false);
  for(const friend of [houseFriend,roomFriend])expect((await friend.request({op:'house.visit',ownerId:admin.id})).ok).toBe(false);
  await Promise.all([admin,houseFriend,roomFriend,outsider].map(c=>c.close()));
});

it('runs selected AI through server Ollama while its administrator is offline',async()=>{
  const calls:string[]=[];
  const ollama=createServer((request,response)=>{calls.push(request.url||'');response.setHeader('Content-Type','application/json');response.end(JSON.stringify(request.url==='/api/tags'?{models:[{name:'test:local'}]}:request.url==='/api/show'?{capabilities:['completion']}:{response:JSON.stringify({steps:['Use the selected formula'],hint:'Check your units'})}));});
  await new Promise<void>(resolve=>ollama.listen(0,'127.0.0.1',resolve));
  try {
    const address=ollama.address() as {port:number};
    const r=await startServer({port:0,host:'127.0.0.1',dataDir:':memory:',name:'AI',origins:['*'],claimSecret:'install-secret-0123456789',log:()=>{},ollama:{enabled:true,url:`http://127.0.0.1:${address.port}`,model:'test:local',features:['board']}});running.push(r);
    const {admin,invite}=await adminAndInvite(r),guest=await TestClient.create('Student');await guest.connect(r.port,{invite:invite.code});await admin.close();
    const reply=guest.next(m=>m.t==='app'&&m.channel==='ai'&&JSON.parse(m.data).id==='request_1234');
    const ack=await guest.request({op:'app.send',channel:'ai',to:SERVER_AUTHORITY,data:JSON.stringify({t:'generate',id:'request_1234',input:{feature:'board',prompt:'Selected formula',images:[]}})});expect(ack.ok).toBe(true);
    const message=await reply as Extract<ServerMessage,{t:'app'}>;expect(message.from).toBe(SERVER_AUTHORITY);expect(JSON.parse(message.data)).toMatchObject({t:'result',value:{steps:['Use the selected formula']}});expect(calls).toContain('/api/generate');
    expect(await guest.request({op:'app.send',channel:'ai',to:guest.id,data:JSON.stringify({t:'status',id:'request_5678'})})).toMatchObject({ok:false,code:'forbidden'});await guest.close();
  }finally{await new Promise<void>(resolve=>ollama.close(()=>resolve()));}
});

it('keeps up to three signed devices for one person, one house, and one selected media endpoint',async()=>{
  const r=await boot(),{admin,invite}=await adminAndInvite(r);
  const tablet=new TestClient(admin.identity);expect(await tablet.connect(r.port,{deviceId:'tablet_1234',deviceName:'Tablet'})).toBe('admin');
  expect(admin.ws.readyState).toBe(WebSocket.OPEN);expect(r.world.online).toBe(1);expect(r.store.residents()).toHaveLength(1);
  const state=tablet.messages.filter(m=>m.t==='state').at(-1) as Extract<ServerMessage,{t:'state'}>|undefined;
  if(state)expect(state.present).toHaveLength(1);
  const changed=admin.next(m=>m.t==='devices'&&m.devices.some(d=>d.id==='tablet_1234'&&d.media));
  expect(await tablet.request({op:'device.media',deviceId:'tablet_1234'})).toMatchObject({ok:true});await changed;
  // Both devices can submit ink; only the selected endpoint can signal audio/video.
  expect(await admin.request({op:'media.signal',to:admin.id,data:JSON.stringify({k:'close'})})).toMatchObject({ok:false,code:'forbidden'});
  const stranger=await TestClient.create('Other');await stranger.connect(r.port,{invite:invite.code,deviceId:'other_12345'});
  expect(await stranger.request({op:'device.media',deviceId:'tablet_1234'})).toMatchObject({ok:false,code:'forbidden'});
  const third=new TestClient(admin.identity);expect(await third.connect(r.port,{deviceId:'third_12345'})).toBe('admin');
  const fourth=new TestClient(admin.identity);expect(await fourth.connect(r.port,{deviceId:'fourth_1234'})).toBe('denied:full');
  expect(r.world.online).toBe(2);expect(admin.ws.readyState).toBe(WebSocket.OPEN);
  await tablet.close();expect(admin.ws.readyState).toBe(WebSocket.OPEN);expect(r.world.online).toBe(2);
  await third.close();await stranger.close();await admin.close();
});

it('authorizes Werewolves camera offers by private turns and death while keeping voice independent',async()=>{
 const r=await boot(),{admin,invite}=await adminAndInvite(r),clients=[admin];
 for(let i=1;i<4;i++){const c=await TestClient.create(`Player ${i}`);await c.connect(r.port,{invite:invite.code});clients.push(c);}
 const command=(c:TestClient,a:unknown)=>c.request({op:'app.send',channel:'werewolves',to:SERVER_AUTHORITY,data:JSON.stringify({t:'act',a})});
 const view=(c:TestClient)=>{const messages=c.messages.filter((m):m is Extract<ServerMessage,{t:'app'}>=>m.t==='app'&&m.channel==='werewolves');return messages.map(m=>JSON.parse(m.data)).filter(m=>m.t==='view').at(-1)?.v;};
 for(const c of clients)await command(c,{kind:'join',name:c.identity.public.displayName,color:'#336699'});
 await command(clients[1],{kind:'start'});expect(view(clients[1]).phase).toBe('lobby');
 await command(admin,{kind:'configure',counts:{werewolf:1,seer:1,guard:1}});await command(admin,{kind:'start'});await expect.poll(()=>clients.every(c=>view(c)?.phase==='reveal')).toBe(true);
 const wolf=clients.find(c=>view(c).me.role==='werewolf')!,seer=clients.find(c=>view(c).me.role==='seer')!,guard=clients.find(c=>view(c).me.role==='guard')!,villager=clients.find(c=>view(c).me.role==='villager')!;
 for(const c of clients)await command(c,{kind:'ready'});await expect.poll(()=>clients.every(c=>view(c)?.step==='wolves')).toBe(true);
 const offer=(from:TestClient,to:TestClient,kind='camera')=>from.request({op:'media.signal',to:to.id,data:JSON.stringify({k:'offer',cid:randomId(12),meta:{kind,room:'village:game:werewolves'},sdp:'synthetic-test'})});
 expect(view(villager).cameraAudience).toBeNull();expect(view(villager).players.filter((p:{role:string|null})=>p.role!==null)).toHaveLength(1);
 expect(await offer(villager,wolf)).toMatchObject({ok:true});expect(await offer(wolf,villager)).toMatchObject({ok:false,code:'forbidden'});
 await command(wolf,{kind:'wolf_vote',target:seer.id});await expect.poll(()=>view(seer).step).toBe('seer');expect(await offer(wolf,seer)).toMatchObject({ok:true});expect(await offer(seer,wolf)).toMatchObject({ok:false,code:'forbidden'});
 await command(seer,{kind:'seer_look',target:villager.id});await command(guard,{kind:'guard',target:guard.id});await expect.poll(()=>view(seer).me.alive).toBe(false);
 expect(await offer(seer,wolf)).toMatchObject({ok:false,code:'forbidden'});expect(await offer(wolf,seer)).toMatchObject({ok:true});expect(await offer(seer,wolf,'audio')).toMatchObject({ok:true});
 await Promise.all(clients.map(c=>c.close()));
});

it('persists separate owner-decorated floors, gates visitors and keeps the literal null room independent',async()=>{
 const dir=tempDir();let r=await boot(dir);const{admin,invite}=await adminAndInvite(r),guest=await TestClient.create('FloorGuest');await guest.connect(r.port,{invite:invite.code});
 const home={...house(admin.id),floors:[{id:'ground',name:'Ground',rooms:[{id:'null',name:'Named null'}]},{id:'upper',name:'Upper',rooms:[]}]};await admin.request({op:'house.publish',document:await admin.signHouse(home)});
 const at={areaId:'residential',x:384,y:344,direction:'up',moving:false};for(const p of[admin,guest])p.send({op:'presence',houseId:admin.id,position:at});
 const floor={floorId:'ground',roomId:null},upper={floorId:'upper',roomId:null},namedNull={floorId:'ground',roomId:'null'};
 const view=(p:TestClient)=>p.messages.filter((m):m is Extract<ServerMessage,{t:'workspace'}>=>m.t==='workspace').at(-1)!.workspace;
 expect((await admin.request({op:'workspace',command:{action:'enter',owner:admin.id,space:floor}})).ok).toBe(true);const initial=view(admin).document!;expect(initial.furniture).toEqual([]);expect(view(guest).document).toBeNull();
 const palm={id:'palm',kind:'palm',x:100,y:180,publicAlias:'Palm',color:'#336699'};
 expect((await admin.request({op:'workspace',command:{action:'commit',base:0,document:{...initial,theme:'peach',furniture:[palm]}}})).ok).toBe(true);
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:floor}});expect(view(guest).document).toBeNull();const admitted=guest.next(m=>m.t==='workspace'&&m.workspace.space?.roomId===null&&m.workspace.document?.revision===1);await admin.request({op:'workspace',command:{action:'decide',request:view(admin).requests[0].id,accept:true}});await admitted;expect(view(guest).document).toMatchObject({revision:1,theme:'peach',furniture:[palm]});
 expect((await guest.request({op:'workspace',command:{action:'commit',base:1,document:{...view(guest).document!,theme:'mint'}}})).ok).toBe(false);
 expect((await admin.request({op:'workspace',command:{action:'commit',base:1,document:{...view(admin).document!,notes:[{id:'n',title:'Not in the hall',text:'private'}]}}})).ok).toBe(false);
 expect((await admin.request({op:'workspace',command:{action:'commit',base:1,document:{...view(admin).document!,furniture:[{...palm,kind:'desk'}]}}})).ok).toBe(false);
 await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:namedNull}});expect(view(guest).space).toEqual(floor);expect(view(admin).requests).toHaveLength(1);expect((await guest.request({op:'board.select',ref:`house:${admin.id}:space:ground:null:board`})).ok).toBe(false);
 await admin.request({op:'workspace',command:{action:'enter',owner:admin.id,space:upper}});expect(view(admin).document!.furniture).toEqual([]);expect(view(guest).document!.furniture).toEqual([palm]);
 await admin.request({op:'workspace',command:{action:'enter',owner:admin.id,space:namedNull}});expect(view(admin).document!.furniture.some(f=>f.kind==='board')).toBe(true);
 await admin.close();await guest.close();await r.close();running.splice(running.indexOf(r),1);r=await boot(dir);const again=new TestClient(admin.identity);await again.connect(r.port);again.send({op:'presence',houseId:again.id,position:at});
 await again.request({op:'workspace',command:{action:'enter',owner:again.id,space:floor}});expect(view(again).document).toMatchObject({revision:1,theme:'peach',furniture:[palm],notes:[]});
 await again.request({op:'workspace',command:{action:'enter',owner:again.id,space:upper}});expect(view(again).document!.furniture).toEqual([]);
 await again.request({op:'workspace',command:{action:'enter',owner:again.id,space:namedNull}});expect(view(again).document!.furniture.some(f=>f.kind==='board')).toBe(true);await again.close();
});

it('keeps mailbox notes private, enforces five per authenticated sender and persists offline recipients across restart',async()=>{
 const dir=tempDir();let r=await boot(dir);const{admin,invite}=await adminAndInvite(r),sender=await TestClient.create('Mailbox sender'),other=await TestClient.create('Mailbox stranger');
 await sender.connect(r.port,{invite:invite.code});await other.connect(r.port,{invite:invite.code});await admin.close();
 const owner=admin.id,post=(id:string)=>({op:'mailbox',command:{action:'post',owner,id,text:'Private durable message'}}),list={op:'mailbox',command:{action:'list',owner}};
 for(let n=0;n<5;n++)expect(await sender.request(post(`letter-${n}`))).toMatchObject({ok:true,result:{ok:true,view:{ownCount:n+1,total:n+1}}});
 expect(await sender.request(post('sixth'))).toMatchObject({ok:true,result:{ok:false,error:'limit'}});
 expect(await sender.request(post('letter-0'))).toMatchObject({ok:true,result:{ok:true,view:{ownCount:5,total:5}}});
 expect(await other.request(list)).toMatchObject({ok:true,result:{ok:true,view:{notes:[],total:0}}});
 expect(await other.request({op:'mailbox',command:{action:'remove',owner,id:'letter-0'}})).toMatchObject({ok:true,result:{ok:false,error:'forbidden'}});
 expect(await other.request({op:'mailbox',command:{action:'post',owner,id:'forged',author:sender.id,text:'Forged sender'}})).toMatchObject({ok:false,code:'invalid'});
 expect(await other.request({op:'mailbox',command:{action:'post',owner,id:'too-long',text:'x'.repeat(1001)}})).toMatchObject({ok:false,code:'invalid'});
 expect(await other.request({op:'app.send',channel:'mailbox',to:owner,data:JSON.stringify({type:'reply',result:{ok:true}})})).toMatchObject({ok:false,code:'forbidden'});
 expect(JSON.stringify(other.messages)).not.toContain('Private durable message');
 await sender.close();await other.close();await r.close();running.splice(running.indexOf(r),1);r=await boot(dir);
 const recipient=new TestClient(admin.identity);await recipient.connect(r.port);const received=await recipient.request(list);expect(received).toMatchObject({ok:true,result:{ok:true,view:{total:5,notes:expect.arrayContaining([expect.objectContaining({author:sender.id,text:'Private durable message'})])}}});
 expect(await recipient.request({op:'mailbox',command:{action:'remove',owner,id:'letter-0'}})).toMatchObject({ok:true,result:{ok:true,view:{total:4}}});
 const returning=new TestClient(sender.identity);await returning.connect(r.port);expect(await returning.request(post('replacement'))).toMatchObject({ok:true,result:{ok:true,view:{ownCount:5}}});
 await recipient.close();await returning.close();
});

it('keeps the original pending access across repeated house and workspace requests until decision or requester cancellation',async()=>{
 const r=await boot(),{admin,invite}=await adminAndInvite(r),guest=await TestClient.create('Pending visitor'),stranger=await TestClient.create('Other requester');
 await guest.connect(r.port,{invite:invite.code});await stranger.connect(r.port,{invite:invite.code});
 const home={...house(admin.id),access:'ask' as const,floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math'},{id:'code',name:'Code'}]}]};
 await admin.request({op:'house.publish',document:await admin.signHouse(home)});
 const floor={floorId:'ground',roomId:null},room={floorId:'ground',roomId:'math'},at={x:384,y:344,direction:'up',moving:false};
 const state=(person:TestClient)=>person.messages.filter((m):m is Extract<ServerMessage,{t:'state'}>=>m.t==='state').at(-1)!;
 const workspace=(person:TestClient)=>person.messages.filter((m):m is Extract<ServerMessage,{t:'workspace'}>=>m.t==='workspace').at(-1)!.workspace;
 const houseRequest={op:'house.visit',ownerId:admin.id,requestId:'original_house'};
 expect(await guest.request(houseRequest)).toMatchObject({ok:true,result:{pendingAccess:{requestId:'original_house',ownerId:admin.id,kind:'house'}}});
 for(const ownerId of [admin.id,stranger.id])expect(await guest.request({...houseRequest,ownerId,requestId:'replacement_house'})).toMatchObject({ok:true,result:{requestId:'original_house'}});
 expect(await guest.request({op:'workspace',command:{action:'enter',owner:admin.id,space:floor,requestId:'replacement_floor'}})).toMatchObject({ok:true,result:{pendingAccess:{requestId:'original_house',kind:'house'}}});
 await stranger.request({op:'access.cancel',requestId:'original_house'});await guest.request({op:'access.cancel',requestId:'wrong_request'});
 await expect.poll(()=>state(admin).visits.map(v=>v.requestId)).toEqual(['original_house']);expect(state(guest).pendingAccess?.requestId).toBe('original_house');expect(state(stranger).pendingAccess).toBeNull();expect(state(stranger).visits).toEqual([]);
 const resync=guest.next(m=>m.t==='state');guest.send({op:'presence',houseId:guest.id,position:at});await resync;expect(state(guest).present.find(p=>p.identity.fingerprint===guest.id)?.houseId).toBeNull();
 await guest.request({op:'access.cancel',requestId:'original_house'});await expect.poll(()=>state(admin).visits).toEqual([]);expect(state(guest).pendingAccess).toBeNull();
 await guest.request({...houseRequest,requestId:'second_house'});await admin.request({op:'house.decide',requestId:'second_house',accept:false});await expect.poll(()=>state(guest).pendingAccess).toBeNull();
 await guest.request({...houseRequest,requestId:'third_house'});await admin.request({op:'house.decide',requestId:'third_house',accept:true});await expect.poll(()=>state(guest).pendingAccess).toBeNull();
 const entered=guest.next(m=>m.t==='state'&&m.present.some(p=>p.identity.fingerprint===guest.id&&p.houseId===admin.id));guest.send({op:'presence',houseId:admin.id,position:at});await entered;
 const enter={op:'workspace',command:{action:'enter',owner:admin.id,space:floor,requestId:'first_floor'}};
 expect(await guest.request(enter)).toMatchObject({ok:true,result:{pendingAccess:{requestId:'first_floor',kind:'floor'}}});
 for(const space of [floor,room,null])await guest.request({...enter,command:{...enter.command,space,requestId:'replacement_floor'}});
 expect(await guest.request({...houseRequest,ownerId:stranger.id,requestId:'different_house'})).toMatchObject({ok:true,result:{pendingAccess:{requestId:'first_floor',kind:'floor'}}});
 expect(workspace(admin).requests.map(v=>v.id)).toEqual(['first_floor']);expect(workspace(guest).space).toBeNull();
 await guest.request({op:'access.cancel',requestId:'first_floor'});await expect.poll(()=>state(guest).pendingAccess).toBeNull();expect(workspace(admin).requests).toEqual([]);
 await guest.request({...enter,command:{...enter.command,requestId:'second_floor'}});await admin.request({op:'workspace',command:{action:'decide',request:'second_floor',accept:true}});await expect.poll(()=>workspace(guest).space).toEqual(floor);expect(state(guest).pendingAccess).toBeNull();
 await guest.request({...enter,command:{...enter.command,space:room,requestId:'first_room'}});await guest.request({...enter,command:{...enter.command,space:{floorId:'ground',roomId:'code'},requestId:'second_room'}});
 expect(workspace(admin).requests.map(v=>v.id)).toEqual(['first_room']);await guest.request({op:'access.cancel',requestId:'first_floor'});expect(state(guest).pendingAccess?.requestId).toBe('first_room');
 await admin.request({op:'workspace',command:{action:'decide',request:'first_room',accept:false}});await expect.poll(()=>state(guest).pendingAccess).toBeNull();
 await guest.request({...enter,command:{...enter.command,space:room,requestId:'next_room'}});await admin.close();await expect.poll(()=>state(guest).pendingAccess).toBeNull();expect(workspace(guest).notice).toBeNull();await guest.close();await stranger.close();
});

it('shares the request lock across paired devices and clears it only when the last requester endpoint disconnects',async()=>{
 const r=await boot(),{admin,invite}=await adminAndInvite(r),guest=await TestClient.create('Two devices');await guest.connect(r.port,{invite:invite.code,deviceId:'laptop_device'});
 const tablet=new TestClient(guest.identity);await tablet.connect(r.port,{deviceId:'tablet_device'});
 await admin.request({op:'house.publish',document:await admin.signHouse({...house(admin.id),access:'ask'})});
 await guest.request({op:'house.visit',ownerId:admin.id,requestId:'paired_request'});
 expect(await tablet.request({op:'house.visit',ownerId:guest.id,requestId:'other_request'})).toMatchObject({ok:true,result:{pendingAccess:{requestId:'paired_request'}}});
 const state=()=>admin.messages.filter((m):m is Extract<ServerMessage,{t:'state'}>=>m.t==='state').at(-1)!;
 await guest.close();await expect.poll(()=>state().present.find(p=>p.identity.fingerprint===tablet.id)?.endpoint).toBeDefined();expect(state().visits.map(v=>v.requestId)).toEqual(['paired_request']);
 await tablet.request({op:'access.cancel',requestId:'paired_request'});await expect.poll(()=>state().visits).toEqual([]);
 await tablet.request({op:'house.visit',ownerId:admin.id,requestId:'last_request'});await expect.poll(()=>state().visits).toHaveLength(1);await tablet.close();await expect.poll(()=>state().visits).toEqual([]);await admin.close();
});

it('runs a 16-person Forest Blocks room across server neighborhoods with shared game voice',async()=>{
 const r=await boot(),{admin,invite}=await adminAndInvite(r);await admin.request({op:'admin.capacity',maxOnline:24});const clients=[admin];
 try{
  for(let i=1;i<16;i++){const client=await TestClient.create(`Blocks ${i}`);expect(await client.connect(r.port,{invite:invite.code})).toBe('resident');clients.push(client);}
  const act=(client:TestClient,a:unknown)=>client.request({op:'app.send',channel:'tetris',to:SERVER_AUTHORITY,data:JSON.stringify({t:'act',a})});
  for(const [i,client]of clients.entries()){expect((await act(client,{type:'join',name:`Blocks ${i}`})).ok).toBe(true);await act(client,{type:'ready',ready:true});}
  const last=clients[15];const countdown=last.next(m=>m.t==='app'&&m.channel==='tetris'&&JSON.parse(m.data).v?.phase==='countdown');await act(admin,{type:'start'});expect(JSON.parse((await countdown as {data:string}).data).v.players).toHaveLength(16);
  const play=last.next(m=>m.t==='app'&&m.channel==='tetris'&&JSON.parse(m.data).v?.phase==='playing');await play;
  const moved=admin.next(m=>m.t==='app'&&m.channel==='tetris'&&JSON.parse(m.data).v?.players.some((p:{id:string;seq:number})=>p.id===last.id&&p.seq===1));await act(last,{type:'input',round:1,seq:1,key:'left'});await moved;
  await admin.request({op:'voice',command:{action:'game',game:'tetris'}});const voice=last.next(m=>m.t==='voice'&&m.voice.selected?.members.includes(admin.id)===true);await last.request({op:'voice',command:{action:'game',game:'tetris'}});expect((await voice as Extract<ServerMessage,{t:'voice'}>).voice.selected?.members).toContain(last.id);
 }finally{await Promise.all(clients.map(c=>c.close()));}
},15000);

it('broadcasts shared difficulty and authoritative NPC moves to human Forest Blocks clients',async()=>{
 const r=await boot(),{admin,invite}=await adminAndInvite(r),guest=await TestClient.create('Forest guest');
 try{
  expect(await guest.connect(r.port,{invite:invite.code})).toBe('resident');const act=(client:TestClient,a:unknown)=>client.request({op:'app.send',channel:'tetris',to:SERVER_AUTHORITY,data:JSON.stringify({t:'act',a})});
  await act(admin,{type:'join',name:'Host'});await act(guest,{type:'join',name:'Guest'});await act(admin,{type:'bot',operation:'add'});await act(admin,{type:'difficulty',difficulty:'hard'});
  await act(admin,{type:'ready',ready:true});await act(guest,{type:'ready',ready:true});const countdown=guest.next(m=>m.t==='app'&&m.channel==='tetris'&&JSON.parse(m.data).v?.phase==='countdown');await act(admin,{type:'start'});
  const view=JSON.parse((await countdown as {data:string}).data).v as {difficulty:string;players:{bot?:boolean;next:number[];piece:unknown}[]};expect(view.difficulty).toBe('hard');expect(view.players).toHaveLength(3);expect(view.players.filter(p=>p.bot)).toHaveLength(1);expect(view.players.every(p=>p.next.length===1)).toBe(true);expect(new Set(view.players.map(p=>JSON.stringify([p.piece,p.next]))).size).toBe(1);
  const move=guest.next(m=>m.t==='app'&&m.channel==='tetris'&&JSON.parse(m.data).v?.players.some((p:{bot?:boolean;seq:number})=>p.bot&&p.seq>=0));await move;
 }finally{await guest.close();await admin.close();}
},12000);

it('keeps friendship requests private and durable across server restart and sender absence',async()=>{
 const dir=tempDir();let r=await boot(dir);const {admin,invite}=await adminAndInvite(r);const guest=await TestClient.create('Friend'),other=await TestClient.create('Other');
 await guest.connect(r.port,{invite:invite.code});await other.connect(r.port,{invite:invite.code});
 const delivery=guest.next(m=>m.t==='friends'&&m.friends.incoming.length===1);
 expect((await admin.request({op:'friend',command:{action:'request',target:guest.id}})).ok).toBe(true);
 const last=(c:TestClient)=>c.messages.filter((m):m is Extract<ServerMessage,{t:'friends'}>=>m.t==='friends').at(-1)!.friends;
 await delivery;const request=last(guest).incoming[0];expect(request.from.fingerprint).toBe(admin.id);expect(last(other).incoming).toEqual([]);
 expect((await other.request({op:'friend',command:{action:'respond',id:request.id,accept:true}})).ok).toBe(false);
 await Promise.all([admin.close(),guest.close(),other.close()]);await r.close();running.splice(running.indexOf(r),1);r=await boot(dir);
 const restored=guest.next(m=>m.t==='friends'&&m.friends.incoming.length===1);await guest.connect(r.port);await restored;expect(last(guest).incoming[0].id).toBe(request.id);
 expect((await guest.request({op:'friend',command:{action:'respond',id:request.id,accept:true}})).ok).toBe(true);
 const accepted=admin.next(m=>m.t==='friends'&&m.friends.accepted.length===1);await admin.connect(r.port);await accepted;expect(last(admin).accepted.map(p=>p.fingerprint)).toContain(guest.id);await Promise.all([admin.close(),guest.close()]);
});

it('routes owned pets between clients in one scene and rejects forged pets and excess houses',async()=>{
 const r=await boot(),{admin,invite}=await adminAndInvite(r),guest=await TestClient.create('Pet viewer');await guest.connect(r.port,{invite:invite.code});
 const furniture=Array.from({length:5},(_,i)=>({id:`pet${i}`,kind:'pet-cat' as const,x:80+i*110,y:180,publicAlias:'',pet:{id:`pet${i}`,mode:'roam' as const}}));
 const home={...house(admin.id),furniture,floors:[{id:'floor',name:'Floor',rooms:[{id:'room',name:'Room'}]}]};
 expect(await admin.request({op:'house.publish',document:await admin.signHouse(home)})).toMatchObject({ok:true});
 expect(await admin.request({op:'house.publish',document:await admin.signHouse({...home,revision:3,furniture:[...furniture,{...furniture[0],id:'extra',pet:{id:'extra',mode:'roam'}}]})})).toMatchObject({ok:false});
 expect(await admin.request({op:'house.publish',document:await admin.signHouse({...home,revision:3,furniture:[...furniture.slice(0,4),{...furniture[4],pet:{id:'pet0',mode:'roam'}}]})})).toMatchObject({ok:false});
 const entity={id:'pet0',owner:admin.id,species:'cat',scene:'area:residential',state:'idle',x:100,y:100,direction:'down',moving:false,reactionUntil:0};
 const send=(pets:unknown[],seq=1)=>admin.request({op:'app.send',channel:'pets',to:null,data:JSON.stringify({version:1,seq,pets})});
 const received=guest.next(m=>m.t==='app'&&m.channel==='pets');expect(await send([entity])).toMatchObject({ok:true});expect(JSON.parse((await received as Extract<ServerMessage,{t:'app'}>).data).pets).toEqual([entity]);
 expect(await send([{...entity,id:'invented'}])).toMatchObject({ok:false});expect(await send([{...entity,owner:guest.id}])).toMatchObject({ok:false});expect(await send([{...entity,scene:'house:private'}])).toMatchObject({ok:false});
 const at={areaId:'residential',x:384,y:344,direction:'up',moving:false};admin.send({op:'presence',position:at,houseId:admin.id});
 await admin.request({op:'workspace',command:{action:'enter',owner:admin.id,space:{floorId:'floor',roomId:null}}});
 await admin.request({op:'workspace',command:{action:'enter',owner:admin.id,space:{floorId:'floor',roomId:'room'}}});
 const doc=admin.messages.filter((m):m is Extract<ServerMessage,{t:'workspace'}>=>m.t==='workspace').at(-1)!.workspace.document!;
 expect(await admin.request({op:'workspace',command:{action:'commit',base:doc.revision,document:{...doc,furniture:[{...furniture[0],id:'extra',pet:{id:'extra',mode:'roam'}}]}}})).toMatchObject({ok:false});
 const before=guest.messages.filter(m=>m.t==='app'&&m.channel==='pets').length;expect(await send([{...entity,scene:`house:${admin.id}:floor:room`}],2)).toMatchObject({ok:true});
 await guest.request({op:'app.send',channel:'werewolves',to:SERVER_AUTHORITY,data:JSON.stringify({t:'hello'})});expect(guest.messages.filter(m=>m.t==='app'&&m.channel==='pets')).toHaveLength(before);
 await admin.close();await guest.close();
});

it('shares pet reservations across both games and releases them when the owner disconnects',async()=>{
 const r=await boot(),{admin,invite}=await adminAndInvite(r),guest=await TestClient.create('Other player');await guest.connect(r.port,{invite:invite.code});
 const pet={id:'cat',owner:admin.id,species:'cat',name:'Mina'};
 expect(await admin.request({op:'house.publish',document:await admin.signHouse({...house(admin.id),furniture:[{id:'cat',kind:'pet-cat',x:100,y:180,publicAlias:'',pet:{id:'cat',mode:'roam'}}]})})).toMatchObject({ok:true});
 const act=(client:TestClient,channel:string,a:unknown)=>client.request({op:'app.send',channel,to:SERVER_AUTHORITY,data:JSON.stringify({t:'act',a})});
 const view=(client:TestClient,channel:string)=>client.messages.filter((m):m is Extract<ServerMessage,{t:'app'}>=>m.t==='app'&&m.channel===channel).map(m=>JSON.parse(m.data)).filter(m=>m.t==='view').at(-1)?.v;
 await act(admin,'werewolves',{kind:'join',name:'Admin',color:'#336699'});await act(guest,'werewolves',{kind:'join',name:'Guest',color:'#336699'});await act(admin,'werewolves',{kind:'add_bot',pet});expect(view(admin,'werewolves').players.some((p:any)=>p.pet?.id==='cat')).toBe(true);
 await act(admin,'tetris',{type:'join',name:'Admin'});await act(admin,'tetris',{type:'bot',operation:'add',pet});expect(view(admin,'tetris').players.filter((p:any)=>p.pet)).toHaveLength(0);
 const updated=guest.next(m=>m.t==='app'&&m.channel==='werewolves'&&!JSON.parse(m.data).v?.players.some((p:any)=>p.pet));await admin.close();await updated;
 const again=new TestClient(admin.identity);await again.connect(r.port);await act(again,'tetris',{type:'join',name:'Admin'});await act(again,'tetris',{type:'bot',operation:'add',pet});expect(view(again,'tetris').players.filter((p:any)=>p.pet)).toHaveLength(1);await again.close();await guest.close();
});

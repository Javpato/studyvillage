import { makeStroke } from '../../packages/core/src/whiteboard/model';
import { SharedRoom } from '../../packages/runtime/src/session/shared-room';
import { StudyQuiz, type QuizAction, type QuizView } from '../../packages/core/src/minigames/study-quiz';
import { normalizeAppearance } from '../src/assets/appearance';
import { areaOf, isInScene } from '../src/world/location';
import { afterEach, describe, expect, it } from 'vitest';
import { setTimeout as waitReal } from 'node:timers/promises';
import { generateIdentity, randomId } from '../../packages/core/src/identity';
import { houseSchema, parseWire, strokeSchema, type WireMessage } from '../../packages/core/src/protocol/schema';
import type { LocalIdentity, PublicHouse } from '../../packages/core/src/protocol/types';
import { BoardStore } from '../../packages/runtime/src/session/board';
import { VillageClient } from '../../packages/runtime/src/session/client';
import { STUN_ONLY_CONFIG } from '../../packages/runtime/src/signaling/peerjs';
import { BoundedChannel } from '../../packages/runtime/src/transport/bounded-channel';
import type { Clock, DataChannel, MediaCall, TransportEndpoint } from '../../packages/runtime/src/transport/types';

class ManualClock implements Clock {
  time = 0; wall = 1_800_000_000_000; sequence = 0;
  timers = new Map<number, { due: number; callback: () => void }>();
  now = () => this.time;
  wallNow = () => this.wall;
  setTimeout = (callback: () => void, milliseconds: number): ReturnType<typeof setTimeout> => { const id = ++this.sequence; this.timers.set(id, { due: this.time + milliseconds, callback }); return id as unknown as ReturnType<typeof setTimeout>; };
  clearTimeout = (handle: ReturnType<typeof setTimeout>) => { this.timers.delete(handle as unknown as number); };
  advance(milliseconds: number): void {
    this.time += milliseconds;
    for (const [id, timer] of [...this.timers]) if (timer.due <= this.time) { this.timers.delete(id); timer.callback(); }
  }
}
class FakeChannel implements DataChannel {
  open = false; bufferedAmount = 0; closed = false; other?: FakeChannel;
  opens = new Set<() => void>(); data = new Set<(data: unknown) => void>(); closes = new Set<() => void>();
  constructor(readonly endpoint: string, readonly local: string, readonly network: FakeNetwork) {}
  send(data: string): void {
    if (!this.open) throw new Error('Fake link closed');
    this.network.messages.push({ from: this.local, to: this.endpoint, message: JSON.parse(data) });
    if (this.network.drop?.(this.local, this.endpoint, JSON.parse(data))) return;
    queueMicrotask(() => { if (this.other?.open) for (const callback of this.other.data) callback(data); });
  }
  close(): void {
    if (this.closed) return; this.closed = true; this.open = false;
    for (const callback of [...this.closes]) callback();
    this.other?.close();
  }
  onOpen(callback: () => void): () => void { this.opens.add(callback); return () => this.opens.delete(callback); }
  onData(callback: (data: unknown) => void): () => void { this.data.add(callback); return () => this.data.delete(callback); }
  onClose(callback: () => void): () => void { this.closes.add(callback); return () => this.closes.delete(callback); }
}
class FakeEndpoint implements TransportEndpoint {
  connections = new Set<(channel: DataChannel) => void>(); calls = new Set<(call: MediaCall) => void>(); changes = new Set<(connected: boolean) => void>();
  constructor(readonly id: string, readonly network: FakeNetwork) {}
  connect(endpoint: string): DataChannel { return this.network.connect(this.id, endpoint); }
  call(endpoint:string,stream:MediaStream,metadata:unknown): MediaCall {
    if(!this.network.recordMedia)throw new Error('This fake transport does not test real media.');
    const call={endpoint,metadata,closed:false,answer(){},close(){this.closed=true;},onStream:()=>()=>{},onClose:()=>()=>{},limitBitrate(){}};
    this.network.mediaCalls.push({from:this.id,stream,call});return call;
  }
  onConnection(callback: (channel: DataChannel) => void): () => void { this.connections.add(callback); return () => this.connections.delete(callback); }
  onCall(callback: (call: MediaCall) => void): () => void { this.calls.add(callback); return () => this.calls.delete(callback); }
  onSignalingChange(callback: (connected: boolean) => void): () => void { this.changes.add(callback); return () => this.changes.delete(callback); }
  destroy(): void { this.network.endpoints.delete(this.id); for (const channel of this.network.channels) if (channel.local === this.id) channel.close(); }
}
class FakeNetwork {
  endpoints = new Map<string, FakeEndpoint>(); channels: FakeChannel[] = [];
  messages: { from: string; to: string; message: WireMessage }[] = [];
  drop?: (from: string, to: string, message: WireMessage) => boolean;
  blocked = new Set<string>();
  recordMedia=false;
  mediaCalls:{from:string;stream:MediaStream;call:MediaCall&{closed:boolean}}[]=[];
  create = async (): Promise<TransportEndpoint> => { const endpoint = new FakeEndpoint(`peer-${this.endpoints.size}-${randomId(8)}`, this); this.endpoints.set(endpoint.id, endpoint); return endpoint; };
  connect(from: string, to: string): FakeChannel {
    const a = new FakeChannel(to, from, this), b = new FakeChannel(from, to, this); a.other = b; b.other = a; this.channels.push(a, b);
    queueMicrotask(() => {
      const endpoint = this.endpoints.get(to);
      if (!endpoint || this.blocked.has(to) || this.blocked.has(from)) { a.close(); return; }
      for (const callback of endpoint.connections) callback(b);
      if (a.closed || b.closed) return;
      a.open = b.open = true; for (const callback of b.opens) callback(); for (const callback of a.opens) callback();
    });
    return a;
  }
  sever(endpoint: string): void { for (const channel of this.channels) if (channel.local === endpoint) channel.close(); }
  inject(from: string, to: string, message: unknown): void {
    const incoming = this.channels.find(channel => channel.local === to && channel.endpoint === from && channel.open);
    if (!incoming) throw new Error('No fake link to inject into');
    for (const callback of incoming.data) callback(JSON.stringify(message));
  }
}
async function until(predicate: () => boolean, label = 'condition'): Promise<void> {
  for (let i = 0; i < 500; i++) { if (predicate()) return; await waitReal(2); }
  throw new Error(`Fake integration timed out: ${label}`);
}
const clients: VillageClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) client.dispose(); });
const houseFor = (identity: LocalIdentity): PublicHouse => ({ ownerId: identity.public.fingerprint, revision: 1, name: `Casa ${identity.public.displayName}`, access: 'open', theme: 'mint', furniture: [] });
async function client(network: FakeNetwork, clock: ManualClock, name: string) {
  const identity = await generateIdentity(name, '#55aa88'); const house = houseFor(identity);
  const instance = new VillageClient(identity, house, { transportFactory: network.create, clock }); clients.push(instance);
  return { instance, identity, house };
}
async function admit(host: VillageClient, guest: VillageClient): Promise<void> {
  await guest.joinVillage(host.view.invite!);
  await until(() => host.view.pendingJoins.length > 0, 'manual admission request');
  host.decideJoin(host.view.pendingJoins[0].requestId, true);
  await until(() => guest.view.phase === 'JOINED', `guest admission (${guest.view.error})`);
  await until(() => host.view.houses.length === host.view.members.length, 'signed house publication');
}

describe('session integration using a FAKE in-memory transport, real WebCrypto (not two computers)', () => {
  it('preserves the floating capture while house and workspace travel updates only the authenticated scene audience',async()=>{
    const network=new FakeNetwork(),clock=new ManualClock();network.recordMedia=true;
    const guest=await client(network,clock,'Camera guest'),identity=await generateIdentity('Camera host','#55aa88');
    const house={...houseFor(identity),floors:[{id:'ground',name:'Ground',rooms:[{id:'notes',name:'Notes',allowlist:[guest.identity.public.fingerprint]},{id:'quiet',name:'Quiet',allowlist:[guest.identity.public.fingerprint]}]}]};
    const track=Object.assign(new EventTarget(),{stopped:false,stop(){this.stopped=true;}}),stream={getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>[]} as unknown as MediaStream;let requests=0;
    const host=new VillageClient(identity,house,{transportFactory:network.create,clock,mediaDevices:{getUserMedia:async()=>{requests++;return stream;}}});clients.push(host);
    await host.openVillage();await admit(host,guest.instance);host.setCameraActivity('village');guest.instance.setCameraActivity('village');await host.toggleGameCamera();
    const calls=()=>network.mediaCalls.filter(item=>item.from===host.view.members.find(m=>m.identity.fingerprint===identity.public.fingerprint)!.endpoint);
    await until(()=>calls().length===1,'world camera viewer');
    host.visitHouse(identity.public.fingerprint);expect(host.view.gameCamera.local).toBe(stream);expect(calls().at(-1)!.call.closed).toBe(true);
    guest.instance.visitHouse(identity.public.fingerprint);await until(()=>calls().length===2&&!guest.instance.view.pendingAccess,'house camera viewer');
    for(const space of [{floorId:'ground',roomId:null},{floorId:'ground',roomId:'notes'},{floorId:'ground',roomId:'quiet'}]){
      const old=calls().at(-1)!,count=calls().length;host.workspaceCommand({action:'enter',owner:identity.public.fingerprint,space});
      expect(old.call.closed).toBe(true);expect(calls()).toHaveLength(count);expect(host.view.gameCamera.local).toBe(stream);expect(track.stopped).toBe(false);
      guest.instance.workspaceCommand({action:'enter',owner:identity.public.fingerprint,space});
      await until(()=>calls().length===count+1&&!guest.instance.view.pendingAccess,'same-space camera viewer');
      expect((calls().at(-1)!.call.metadata as {room:string}).room).toBe(`house:${identity.public.fingerprint}:space:ground:${space.roomId===null?'floor':`room:${space.roomId}`}:game:village`);
      expect(calls().at(-1)!.stream).toBe(stream);
    }
    host.leaveHouse();expect(calls().at(-1)!.call.closed).toBe(true);expect(host.view.gameCamera.local).toBe(stream);
    host.move({areaId:'study',x:200,y:200,direction:'right',moving:false});expect(host.view.gameCamera.local).toBe(stream);expect(requests).toBe(1);expect(track.stopped).toBe(false);
    const leaving=host.leave();clock.advance(100);await leaving;expect(track.stopped).toBe(true);expect(host.view.gameCamera.local).toBeNull();
  });
  it('relays stationary portal arrivals, isolates areas and media, and includes the area in late-join snapshots', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'Host'), guest = await client(network, clock, 'Guest');
    await host.instance.openVillage(); await admit(host.instance, guest.instance);
    const arrival = { areaId: 'community' as const, x: 72, y: 220, direction: 'right' as const, moving: false };
    guest.instance.move(arrival);
    await until(() => areaOf(host.instance.view.members.find(m => m.identity.fingerprint === guest.identity.public.fingerprint)!.position) === 'community');
    const remote = host.instance.view.members.find(m => m.identity.fingerprint === guest.identity.public.fingerprint)!;
    expect(remote.position).toEqual(arrival);
    expect(isInScene(remote, 'residential', null)).toBe(false);
    expect(isInScene(remote, 'community', null)).toBe(true);
    await until(() => host.instance.view.media.audience.startsWith('La aldea · 0'));
    await until(() => guest.instance.view.media.audience.startsWith('Plaza Comunitaria · 0'));

    host.instance.move({ ...arrival, x: 80 });
    await until(() => guest.instance.view.media.audience.startsWith('Plaza Comunitaria · 1'));
    const late = await client(network, clock, 'Late'); await admit(host.instance, late.instance);
    expect(late.instance.view.members.filter(m => areaOf(m.position) === 'community')).toHaveLength(2);
    expect(late.instance.view.media.audience).toMatch(/^La aldea · 0/);

    // A second transition at the exact same clock time must bypass movement throttling.
    guest.instance.move({ ...arrival, areaId: 'study', x: 696 });
    await until(() => late.instance.view.members.some(m => m.identity.fingerprint === guest.identity.public.fingerprint && areaOf(m.position) === 'study'));
    await until(() => host.instance.view.media.audience.startsWith('Plaza Comunitaria · 0'));
    await until(() => guest.instance.view.media.audience.startsWith('Biblioteca y Estudio · 0'));
    guest.instance.move({ ...arrival, areaId: 'residential', x: 690, y: 215 });
    await until(() => late.instance.view.media.audience.startsWith('La aldea · 1'));
    const back = late.instance.view.members.find(m => m.identity.fingerprint === guest.identity.public.fingerprint)!;
    expect(back.position).toMatchObject({ areaId: 'residential', x: 690, y: 215, moving: false });
  });

  it('does not connect at construction, requires manual admission, and creates authenticated mesh', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'Host'), b = await client(network, clock, 'B'), c = await client(network, clock, 'C');
    expect(network.endpoints.size).toBe(0);
    await host.instance.openVillage(); await b.instance.joinVillage(host.instance.view.invite!);
    await until(() => host.instance.view.pendingJoins.length === 1);
    await until(() => b.instance.view.phase === 'PENDING_APPROVAL');
    expect(b.instance.view.members).toHaveLength(0); expect(b.instance.view.houses).toHaveLength(0);
    expect(network.messages.some(item => item.to === [...network.endpoints.keys()][1] && item.message.kind === 'event' && item.message.payload.type === 'session.snapshot')).toBe(false);
    host.instance.decideJoin(host.instance.view.pendingJoins[0].requestId, true);
    await until(() => b.instance.view.phase === 'JOINED');
    await admit(host.instance, c.instance);
    await until(() => network.messages.some(item => item.message.kind === 'auth.hello' && item.message.intent === 'mesh'));
    await until(() => network.channels.filter(channel => channel.open).length === 6);
    expect(host.instance.view.members.map(member => member.slot)).toEqual([0, 1, 2]);
    expect(b.instance.view.members.map(member => member.slot)).toEqual([0, 1, 2]);
    expect(JSON.stringify(network.messages)).not.toMatch(/privateKey|filePath|sourceCode|sqlQuery/);
  });
  it('shares wardrobe looks both ways through the host', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'Host'), b = await client(network, clock, 'B');
    await host.instance.openVillage(); await admit(host.instance, b.instance);
    const seen = (viewer: VillageClient, who: LocalIdentity) => viewer.view.members.find(m => m.identity.fingerprint === who.public.fingerprint)?.appearance;
    await b.instance.updateAppearance(normalizeAppearance({ body: 'feminine', hairStyle: 'bun', headwear: 'crown', eyewear: 'sunglasses', outfit: 'suit', jacket: 'coat' }));
    await until(() => seen(host.instance, b.identity)?.headwear === 'crown', 'guest look reaches host');
    expect(seen(host.instance, b.identity)).toMatchObject({ body: 'feminine', hairStyle: 'bun', eyewear: 'sunglasses', outfit: 'suit', jacket: 'coat' });
    await host.instance.updateAppearance(normalizeAppearance({ headwear: 'beret', jacket: 'blazer' }));
    await until(() => seen(b.instance, host.identity)?.headwear === 'beret', 'host look reaches guest');
    expect(seen(b.instance, b.identity)?.headwear).toBe('crown');
  });
  it('routes shared-activity messages through the host and names the real sender', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'Host'), b = await client(network, clock, 'B'), c = await client(network, clock, 'C');
    await host.instance.openVillage(); await admit(host.instance, b.instance); await admit(host.instance, c.instance);
    const got = { host: [] as string[], b: [] as string[], c: [] as string[] };
    host.instance.onApp(m => got.host.push(`${m.channel}:${m.from === b.identity.public.fingerprint ? 'B' : m.from === c.identity.public.fingerprint ? 'C' : 'H'}:${m.data}`));
    b.instance.onApp(m => got.b.push(m.data));
    c.instance.onApp(m => got.c.push(`${m.from === b.identity.public.fingerprint ? 'B' : m.from === host.identity.public.fingerprint ? 'H' : '?'}:${m.data}`));
    expect(host.instance.view.hostId).toBe(host.identity.public.fingerprint);
    expect(b.instance.view.hostId).toBe(host.identity.public.fingerprint);

    expect(b.instance.sendApp('gartic', c.identity.public.fingerprint, '{"t":"x"}')).toBe(true);
    await until(() => got.c.length === 1, 'direct delivery via host');
    expect(got.c[0]).toBe('B:{"t":"x"}');
    expect(got.host).toHaveLength(0);

    b.instance.sendApp('projects', null, '{"t":"all"}');
    await until(() => got.host.length === 1 && got.c.length === 2, 'broadcast');
    expect(got.host[0]).toBe('projects:B:{"t":"all"}');
    expect(got.b).toHaveLength(0);

    host.instance.sendApp('werewolves', b.identity.public.fingerprint, '{"t":"view"}');
    await until(() => got.b.length === 1, 'host to member');

    // Too big, or to yourself, never leaves.
    expect(b.instance.sendApp('gartic', null, 'x'.repeat(60_000))).toBe(false);
    expect(b.instance.sendApp('gartic', b.identity.public.fingerprint, '{}{}')).toBe(false);
    // A member cannot pose as the host's relay.
    expect(network.messages.every(m => m.message.kind !== 'event' || m.message.payload.type !== 'app.relay' || m.from === [...network.endpoints.keys()][0])).toBe(true);
  });

  it('rotates invitations and rejects old generations without leaking roster', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const host = await client(network, clock, 'Host'), guest = await client(network, clock, 'Guest');
    await host.instance.openVillage(); const old = host.instance.view.invite!; host.instance.rotateInvite();
    expect(host.instance.view.invite).not.toBe(old);
    await guest.instance.joinVillage(old); await until(() => guest.instance.view.phase === 'NETWORK_FAILED');
    expect(host.instance.view.pendingJoins).toHaveLength(0); expect(guest.instance.view.members).toHaveLength(0);
  });
  it('rotation revokes a request already awaiting manual approval', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const host = await client(network, clock, 'Host'), guest = await client(network, clock, 'Guest');
    await host.instance.openVillage(); await guest.instance.joinVillage(host.instance.view.invite!);
    await until(() => host.instance.view.pendingJoins.length === 1); const request = host.instance.view.pendingJoins[0].requestId;
    host.instance.rotateInvite(); host.instance.decideJoin(request, true);
    await until(() => guest.instance.view.phase === 'DENIED');
    expect(host.instance.view.members).toHaveLength(1); expect(guest.instance.view.members).toHaveLength(0);
  });
  it('separates coordinator authority from house-owner visit approval and kicking', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B'), c = await client(network, clock, 'C');
    await a.instance.openVillage(); await admit(a.instance, b.instance); await admit(a.instance, c.instance);
    b.instance.publishHouse({ ...b.house, access: 'ask', revision: 2 });
    await until(() => a.instance.view.houses.find(house => house.ownerId === b.identity.public.fingerprint)?.access === 'ask');
    c.instance.visitHouse(b.identity.public.fingerprint);
    await until(() => b.instance.view.pendingVisits.length === 1);
    expect(a.instance.view.pendingVisits).toHaveLength(0);
    expect(c.instance.view.members.find(member => member.identity.fingerprint === c.identity.public.fingerprint)?.houseId).toBeNull();
    b.instance.decideVisit(b.instance.view.pendingVisits[0].requestId, true);
    await until(() => c.instance.view.members.find(member => member.identity.fingerprint === c.identity.public.fingerprint)?.houseId === b.identity.public.fingerprint);
    a.instance.kickVisitor(c.identity.public.fingerprint);
    expect(a.instance.view.members.find(member => member.identity.fingerprint === c.identity.public.fingerprint)?.houseId).toBe(b.identity.public.fingerprint);
    b.instance.kickVisitor(c.identity.public.fingerprint);
    await until(() => c.instance.view.members.find(member => member.identity.fingerprint === c.identity.public.fingerprint)?.houseId === null);
    b.instance.publishHouse({ ...a.house, revision: 3 });
    expect(b.instance.view.error).toContain('Solo puedes');
    expect(a.instance.view.houses.find(house => house.ownerId === a.identity.public.fingerprint)?.revision).toBe(1);
  });
  it('accepts at most six members, then reuses the first free slot on voluntary leave', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'); await a.instance.openVillage();
    const guests = [];
    for (let i = 0; i < 5; i++) { const guest = await client(network, clock, `G${i}`); guests.push(guest); await admit(a.instance, guest.instance); }
    expect(a.instance.view.members.map(member => member.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    const extra = await client(network, clock, 'Extra'); await extra.instance.joinVillage(a.instance.view.invite!);
    await until(() => a.instance.view.pendingJoins.length === 1);
    a.instance.decideJoin(a.instance.view.pendingJoins[0].requestId, true);
    await until(() => extra.instance.view.phase === 'DENIED'); expect(a.instance.view.members).toHaveLength(6);
    await guests[1].instance.leave();
    await until(() => a.instance.view.members.length === 5);
    await admit(a.instance, extra.instance);
    expect(a.instance.view.members.find(member => member.identity.fingerprint === extra.identity.public.fingerprint)?.slot).toBe(2);
  });
  it('bounds leave ACK wait even when every leave packet is dropped', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    network.drop = (_from, _to, message) => message.kind === 'event' && message.payload.type === 'session.leave';
    let complete = false; const leaving = b.instance.leave().then(() => { complete = true; });
    expect(complete).toBe(false); clock.advance(1499); await waitReal(2); expect(complete).toBe(false);
    clock.advance(1); await leaving; expect(b.instance.view.phase).toBe('CLOSED');
  });
  it('uses monotonic host grace and fresh signed authentication when links recover', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    const endpoint = a.instance.view.members[0].endpoint;
    const oldProofs = network.messages.filter(item => item.message.kind === 'auth.proof').length;
    network.sever(endpoint);
    expect(b.instance.view.phase).toBe('RECONNECTING'); expect(b.instance.view.hostGraceRemainingMs).toBe(60_000);
    clock.wall += 9_999_999_999; clock.advance(250);
    await until(() => b.instance.view.phase === 'JOINED', 'fresh recovery');
    expect(network.messages.filter(item => item.message.kind === 'auth.proof').length).toBeGreaterThan(oldProofs);
    expect(a.instance.view.members).toHaveLength(2); expect(b.instance.view.members[1].slot).toBe(1);
    network.blocked.add(endpoint); network.sever(endpoint);
    clock.advance(59_999); expect(b.instance.view.phase).toBe('RECONNECTING');
    clock.advance(1); expect(b.instance.view.phase).toBe('CLOSED');
  });
  it('keeps healthy P2P connections when only signaling is disconnected', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    for (const endpoint of network.endpoints.values()) for (const callback of endpoint.changes) callback(false);
    expect(a.instance.view.phase).toBe('JOINED'); expect(b.instance.view.phase).toBe('JOINED');
    expect(b.instance.view.hostGraceRemainingMs).toBeNull(); expect(network.channels.every(channel => channel.open)).toBe(true);
  });
  it('rejects spoofed sender identities and wrong-role session closing', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    const [host, guest] = a.instance.view.members;
    network.inject(guest.endpoint, host.endpoint, { v: 1, kind: 'event', sessionId: a.instance.view.sessionId, epoch: 1, sender: guest.identity.fingerprint, seq: 9999, payload: { type: 'session.closed' } });
    await until(() => !a.instance.view.members[1].connected);
    expect(a.instance.view.phase).toBe('JOINED'); expect(b.instance.view.phase).toBe('RECONNECTING');
    clock.advance(250); await until(() => b.instance.view.phase === 'JOINED');
    network.inject(guest.endpoint, host.endpoint, { v: 1, kind: 'event', sessionId: a.instance.view.sessionId, epoch: 1, sender: host.identity.fingerprint, seq: 9999, payload: { type: 'house.leave' } });
    await until(() => !a.instance.view.members[1].connected); expect(a.instance.view.members[0].connected).toBe(true);
  });
  it('lets players talk in the open village and opens private calls only by mutual choice', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'Host'), a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await host.instance.openVillage(); await admit(host.instance, a.instance); await admit(host.instance, b.instance);
    await until(() => network.channels.filter(channel => channel.open).length === 6, 'full mesh');
    const audience = (who: typeof host) => who.instance.view.media.audience;
    // Outside any house, everyone is in one public room: the village.
    await until(() => audience(host).startsWith('La aldea · 2'), `village audience (${audience(host)})`);
    await until(() => audience(a).startsWith('La aldea · 2'), 'village audience for A');

    // A asks B. Until B agrees nothing changes for anyone's audio.
    a.instance.requestPrivate(b.identity.public.fingerprint);
    await until(() => b.instance.view.privateCall.incoming.includes(a.identity.public.fingerprint), 'B sees the request');
    // A's own view updates on its next refresh, which can land just after B's.
    await until(() => a.instance.view.privateCall.with === b.identity.public.fingerprint, 'A sees its own request');
    expect(a.instance.view.privateCall).toMatchObject({ with: b.identity.public.fingerprint, active: false });
    expect(audience(a)).toMatch(/^La aldea · 2/);

    // B accepts: A and B hear only each other, and the host no longer hears either.
    b.instance.requestPrivate(a.identity.public.fingerprint);
    await until(() => a.instance.view.privateCall.active && b.instance.view.privateCall.active, 'call is mutual');
    await until(() => audience(a).startsWith('Privado con B · 1'), `A private audience (${audience(a)})`);
    await until(() => audience(b).startsWith('Privado con A · 1'), 'B private audience');
    await until(() => audience(host).startsWith('La aldea · 0'), `host loses both (${audience(host)})`);

    // Either side hanging up returns everyone to the public village.
    a.instance.requestPrivate(null);
    await until(() => audience(a).startsWith('La aldea · 2') && audience(host).startsWith('La aldea · 2'), 'back to public');
    expect(b.instance.view.privateCall.active).toBe(false);
  });

  it('keeps a house private from the village and refuses impossible private targets', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'Host'), a = await client(network, clock, 'A');
    await host.instance.openVillage(); await admit(host.instance, a.instance);
    await until(() => a.instance.view.media.audience.startsWith('La aldea · 1'), 'village');
    a.instance.visitHouse(a.identity.public.fingerprint);
    await until(() => a.instance.view.media.audience.startsWith('Casa: Casa A · 0'), `in own house (${a.instance.view.media.audience})`);
    await until(() => host.instance.view.media.audience.startsWith('La aldea · 0'), 'village no longer includes A');
    a.instance.requestPrivate(a.identity.public.fingerprint);
    expect(a.instance.view.privateCall.with).toBeNull();
    a.instance.requestPrivate('f'.repeat(64));
    expect(a.instance.view.privateCall.with).toBeNull();
  });

  it('synchronizes signed board strokes, deduplicates them, and preserves author tombstones', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    a.instance.visitHouse(a.identity.public.fingerprint); b.instance.visitHouse(a.identity.public.fingerprint);
    await until(() => b.instance.view.members.every(member => member.houseId === a.identity.public.fingerprint));
    const stroke = { id: 'stroke-one', boardId: a.identity.public.fingerprint, author: a.identity.public.fingerprint, seq: 1, color: '#112233', width: 3, tool: 'pen' as const, points: [{ x: 1, y: 1 }], deleted: false };
    a.instance.sendStroke(stroke); await until(() => b.instance.view.strokes.length === 1);
    a.instance.sendStroke(stroke); await waitReal(10); expect(b.instance.view.strokes).toHaveLength(1);
    b.instance.deleteStroke(stroke.id); await waitReal(10); expect(a.instance.view.strokes[0].deleted).toBe(false);
    a.instance.deleteStroke(stroke.id); await until(() => b.instance.view.strokes[0]?.deleted === true);
    a.instance.sendStroke({ ...stroke, seq: 100 }); await waitReal(10); expect(a.instance.view.strokes[0].deleted).toBe(true);
    const c = await client(network, clock, 'C'); await admit(a.instance, c.instance); c.instance.visitHouse(a.identity.public.fingerprint);
    await until(() => c.instance.view.strokes[0]?.deleted === true, 'late join board tombstone sync');
  });
  it('lets the house owner edit and delete anyone\'s layer on their own boards, and nobody else\'s', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    const owner = a.identity.public.fingerprint, guest = b.identity.public.fingerprint, ref = `house:${owner}:board`;
    a.instance.publishHouse({ ...a.house, revision: 2, furniture: [{ id: 'board', kind: 'board', x: 340, y: 95, publicAlias: '' }] });
    await until(() => !!b.instance.view.houses.find(h => h.ownerId === owner)?.furniture.length, 'guest sees the whiteboard');
    a.instance.visitHouse(owner); b.instance.visitHouse(owner);
    await until(() => b.instance.view.members.every(member => member.houseId === owner));
    a.instance.selectBoard(ref); b.instance.selectBoard(ref);
    const mine = { id: 'by-guest', boardId: ref, author: guest, seq: 1, color: '#112233', width: 3, tool: 'pen' as const, points: [{ x: 1, y: 1 }, { x: 9, y: 9 }], deleted: false };
    await b.instance.commitBoard(ref, [mine]);
    await until(() => a.instance.view.strokes.some(s => s.id === 'by-guest'));
    // The owner moves the guest's stroke: it stays the guest's layer, signed by the owner.
    await a.instance.commitBoard(ref, [{ ...mine, seq: 2, points: [{ x: 50, y: 50 }, { x: 60, y: 60 }] }]);
    await until(() => b.instance.view.strokes.find(s => s.id === 'by-guest')?.points[0].x === 50, 'guest sees the owner edit');
    expect(b.instance.view.strokes.find(s => s.id === 'by-guest')!.author).toBe(guest);
    // A guest cannot do the same to the owner's work.
    const ownerStroke = { ...mine, id: 'by-owner', author: owner };
    await a.instance.commitBoard(ref, [ownerStroke]);
    await until(() => b.instance.view.strokes.some(s => s.id === 'by-owner'));
    await expect(b.instance.commitBoard(ref, [{ ...ownerStroke, seq: 5, deleted: true }])).rejects.toThrow();
    // The owner deletes the guest's layer; someone arriving later receives it through sync.
    await a.instance.commitBoard(ref, [{ ...mine, seq: 3, deleted: true }]);
    await until(() => b.instance.view.strokes.find(s => s.id === 'by-guest')?.deleted === true, 'guest sees the deletion');
    const c = await client(network, clock, 'C'); await admit(a.instance, c.instance); c.instance.visitHouse(owner);
    await until(() => c.instance.view.members.find(m => m.identity.fingerprint === c.identity.public.fingerprint)?.houseId === owner);
    c.instance.selectBoard(ref);
    await until(() => c.instance.view.strokes.find(s => s.id === 'by-guest')?.deleted === true, 'late joiner accepts the owner-signed edit');
  });
  it('re-signs offline own drafts for a fresh session before synchronization', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
    a.instance.sendStroke({ id: 'offline', boardId: a.identity.public.fingerprint, author: a.identity.public.fingerprint, seq: 1, color: '#112233', width: 3, tool: 'pen', points: [{ x: 4, y: 5 }], deleted: false });
    await until(() => a.instance.view.strokes.length === 1);
    await a.instance.openVillage(); await admit(a.instance, b.instance);
    a.instance.visitHouse(a.identity.public.fingerprint); b.instance.visitHouse(a.identity.public.fingerprint);
    await until(() => b.instance.view.strokes[0]?.id === 'offline'); expect(b.instance.view.phase).toBe('JOINED');
  });
});

describe('bounded protocol and board unit tests', () => {
  it('has an explicit STUN-only configuration', () => {
    expect(JSON.stringify(STUN_ONLY_CONFIG)).not.toContain('turn:'); expect(STUN_ONLY_CONFIG.iceServers).toHaveLength(1);
    expect(STUN_ONLY_CONFIG.iceServers?.every(server => !server.username && !server.credential)).toBe(true);
  });
  it('rejects unknown keys, out-of-bounds layout, nonfinite coordinates, and oversized messages', () => {
    expect(() => parseWire('x'.repeat(65_537))).toThrow();
    expect(() => houseSchema.parse({ ownerId: 'a'.repeat(64), name: 'Home', revision: 1, theme: 'mint', access: 'open', furniture: [], privatePath: '/home/x' })).toThrow();
    expect(() => strokeSchema.parse({ id: 's', author: 'a'.repeat(64), boardId: 'b'.repeat(64), seq: 1, color: '#000000', width: 1, tool: 'pen', points: [{ x: Infinity, y: 0 }], deleted: false })).toThrow();
  });
  it('bounds outbound queues and coalesces ephemeral positions under pressure', () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const raw = new FakeChannel('other', 'self', network); raw.open = true; raw.bufferedAmount = 1_000_000;
    const errors: string[] = []; const channel = new BoundedChannel(raw, async () => {}, error => errors.push(error), clock);
    const message: WireMessage = { v: 1, kind: 'event', sessionId: 's', epoch: 1, sender: 'a'.repeat(64), seq: 1, payload: { type: 'session.heartbeat', reply: false } };
    for (let i = 0; i < 200; i++) channel.send({ ...message, seq: i + 1 }, 'position');
    expect(channel.pendingMessages).toBe(1);
    for (let i = 0; i < 200; i++) channel.send(message);
    expect(channel.pendingMessages).toBe(128); expect(channel.pendingBytes).toBeLessThanOrEqual(1_048_576); expect(errors.length).toBeGreaterThan(0); channel.close();
  });
  it('bounds the asynchronous input queue before expensive validation can complete', async () => {
    const network = new FakeNetwork(), clock = new ManualClock(); const raw = new FakeChannel('other', 'self', network); raw.open = true;
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const errors: string[] = []; const channel = new BoundedChannel(raw, async () => gate, error => errors.push(error), clock);
    const data = JSON.stringify({ v: 1, kind: 'event', sessionId: 's', epoch: 1, sender: 'a'.repeat(64), seq: 1, payload: { type: 'session.heartbeat', reply: false } });
    for (let i = 0; i < 10000; i++) for (const callback of raw.data) callback(data);
    expect(raw.closed).toBe(true); expect(errors).toHaveLength(1); release(); await gate; channel.close();
  });
  it('caps board operations at 2000 and forbids deleting a different author', () => {
    const board = new BoardStore();
    const stroke = { id: 's', author: 'a'.repeat(64), boardId: 'b'.repeat(64), seq: 1, color: '#000000', width: 1, tool: 'pen' as const, points: [{ x: 1, y: 1 }], deleted: false };
    expect(board.apply({ stroke, signature: '' })).toBe('applied');
    expect(board.apply({ stroke: { ...stroke, author: 'c'.repeat(64), seq: 2, deleted: true }, signature: '' })).toBe('forbidden');
    for (let seq = 2; seq <= 2000; seq++) expect(board.apply({ stroke: { ...stroke, seq }, signature: '' })).toBe('applied');
    expect(board.apply({ stroke: { ...stroke, seq: 2001 }, signature: '' })).toBe('full');
    expect(board.documents(stroke.boardId)).toHaveLength(1);
  });
});


describe('shared quiz with authenticated clients and simulated transport', () => {
  it('routes host and guest answers, hides solutions, handles leaving and ends for both clients', async () => {
    const network = new FakeNetwork(), clock = new ManualClock();
    const host = await client(network, clock, 'QuizHost'), guest = await client(network, clock, 'QuizGuest');
    await host.instance.openVillage(); await admit(host.instance, guest.instance);
    const hostId = host.identity.public.fingerprint, guestId = guest.identity.public.fingerprint;
    const room = (entry: typeof host) => new SharedRoom<QuizAction, QuizView, StudyQuiz>('study', {
      sendApp: (channel, to, data) => entry.instance.sendApp(channel, to, data), onApp: listener => entry.instance.onApp(listener),
    }, () => ({ selfId: entry.identity.public.fingerprint, hostId }), () => new StudyQuiz(hostId));
    const a = room(host), b = room(guest);
    try {
      a.sync(); b.sync();
      a.mutate(engine => { engine.setQuiz({ id:'quiz', title:'Concurso', updatedAt:0, questions:[{ id:'q',text:'Capital de Francia',choices:['París','Lyon'],correctChoice:0,explanation:'París es la capital.' }] }); return true; });
      a.act({kind:'join',name:'QuizHost'}); b.act({kind:'join',name:'QuizGuest'});
      await until(() => a.current()?.players.length === 2);
      a.act({kind:'start',seconds:0}); await until(() => b.current()?.phase === 'question');
      expect(b.current()?.solution).toBeNull(); expect(b.current()?.explanation).toBeNull();
      expect(JSON.stringify(b.current())).not.toContain('correctChoice');
      b.act({kind:'answer',questionId:b.current()!.question!.id,choice:0});
      await until(() => a.current()?.players.find(p=>p.id===guestId)?.answered === true);
      expect(b.current()?.solution).toBeNull();
      a.act({kind:'answer',questionId:a.current()!.question!.id,choice:1});
      await until(() => b.current()?.phase === 'results');
      expect(b.current()?.solution).toBe(0); expect(b.current()?.players.find(p=>p.id===guestId)?.score).toBe(1000);
      a.stop(); await until(() => b.current()?.stopped === true);
      a.act({kind:'start',seconds:0}); await until(() => b.current()?.phase === 'question');
      a.act({kind:'answer',questionId:a.current()!.question!.id,choice:0}); b.act({kind:'leave'});
      await until(() => a.current()?.phase === 'results');
      expect(a.current()?.players).toHaveLength(1);
    } finally { a.dispose(); b.dispose(); }
  });
});

it('keeps an invited party isolated when peers move between outdoor areas and houses', async () => {
  const network = new FakeNetwork(), clock = new ManualClock();
  const host = await client(network, clock, 'Host'), a = await client(network, clock, 'A'), b = await client(network, clock, 'B');
  await host.instance.openVillage(); await admit(host.instance, a.instance); await admit(host.instance, b.instance);
  a.instance.voiceCommand({ action: 'create', name: 'Friends' });
  await until(() => a.instance.view.voice?.selected?.kind === 'party');
  a.instance.voiceCommand({ action: 'invite', target: b.identity.public.fingerprint });
  await until(() => !!b.instance.view.voice?.invitations.length);
  expect(b.instance.view.voice?.selected).toBeNull();
  b.instance.voiceCommand({ action: 'respond', invitation: b.instance.view.voice!.invitations[0].id, accept: true });
  await until(() => b.instance.view.media.audience.startsWith('Friends · 1') && a.instance.view.media.audience.startsWith('Friends · 1'));
  const id = a.instance.view.voice!.selected!.id;
  a.instance.move({ areaId: 'study', x: 384, y: 200, direction: 'up', moving: false });
  b.instance.visitHouse(b.identity.public.fingerprint);
  await until(() => b.instance.view.members.find(m => m.identity.fingerprint === b.identity.public.fingerprint)?.houseId === b.identity.public.fingerprint);
  expect(a.instance.view.voice!.selected!.id).toBe(id); expect(b.instance.view.voice!.selected!.id).toBe(id);
  expect(host.instance.view.media.audience).toMatch(/^La aldea · 0/);
  a.instance.voiceCommand({ action: 'remove', target: b.identity.public.fingerprint });
  await until(() => b.instance.view.voice!.selected === null);
});

it('routes private room permissions and keeps room boards inaccessible from the lobby',async()=>{
 const network=new FakeNetwork(),clock=new ManualClock(),host=await client(network,clock,'Host'),guest=await client(network,clock,'Guest');
 await host.instance.openVillage();await admit(host.instance,guest.instance);
 host.instance.publishHouse({...host.house,revision:host.house.revision+1,access:'open',floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math'}]}]});
 await until(()=>guest.instance.view.houses.some(h=>h.ownerId===host.identity.public.fingerprint&&h.floors?.[0].rooms.length===1));
 host.instance.visitHouse(host.identity.public.fingerprint);guest.instance.visitHouse(host.identity.public.fingerprint);
 await until(()=>guest.instance.view.members.find(m=>m.identity.fingerprint===guest.identity.public.fingerprint)?.houseId===host.identity.public.fingerprint&&!guest.instance.view.pendingAccess);
 const corridor={floorId:'ground',roomId:null},room={floorId:'ground',roomId:'math'},enter=(space:typeof corridor|typeof room|null)=>guest.instance.workspaceCommand({action:'enter',owner:host.identity.public.fingerprint,space});
 enter(corridor);await until(()=>!!host.instance.view.workspace?.requests.length);
 host.instance.workspaceCommand({action:'decide',request:host.instance.view.workspace!.requests[0].id,accept:true});await until(()=>guest.instance.view.workspace?.space?.floorId==='ground'&&!guest.instance.view.pendingAccess);
 enter(room);await until(()=>!!host.instance.view.workspace?.requests.length);host.instance.workspaceCommand({action:'decide',request:host.instance.view.workspace!.requests[0].id,accept:true});await until(()=>guest.instance.view.workspace?.space?.roomId==='math'&&!guest.instance.view.pendingAccess);
 host.instance.workspaceCommand({action:'enter',owner:host.identity.public.fingerprint,space:room});
 const ref=`house:${host.identity.public.fingerprint}:space:ground:math:board`;
 expect(await guest.instance.commitBoard(ref,[makeStroke(ref,guest.identity.public.fingerprint,1,'pen','#123456',2,[{x:10,y:10}], 'room-stroke')])).toBe(true);
 enter(corridor);await until(()=>guest.instance.view.workspace?.space?.roomId===null&&!guest.instance.view.pendingAccess);
 await expect(guest.instance.commitBoard(ref,[makeStroke(ref,guest.identity.public.fingerprint,2,'pen','#123456',2,[{x:20,y:20}],'blocked')])).rejects.toThrow();
});

it('honors house and room allowlists in peer sessions and revokes private room access',async()=>{
 const network=new FakeNetwork(),clock=new ManualClock();
 const host=await client(network,clock,'Host'),guest=await client(network,clock,'Friend');
 await host.instance.openVillage();await admit(host.instance,guest.instance);
 const room={floorId:'ground',roomId:'math'};
 const layout:PublicHouse={...host.house,revision:2,access:'locked',floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math',allowlist:[guest.identity.public.fingerprint]}]}]};
 host.instance.publishHouse(layout);
 await until(()=>guest.instance.view.houses.some(h=>h.ownerId===host.identity.public.fingerprint&&h.revision===2));
 guest.instance.visitHouse(host.identity.public.fingerprint);
 await until(()=>guest.instance.view.members.find(m=>m.identity.fingerprint===guest.identity.public.fingerprint)?.houseId===host.identity.public.fingerprint&&!guest.instance.view.pendingAccess);
 guest.instance.workspaceCommand({action:'enter',owner:host.identity.public.fingerprint,space:room});
 await until(()=>guest.instance.view.workspace?.space?.roomId==='math'&&!guest.instance.view.pendingAccess);expect(host.instance.view.workspace?.requests).toEqual([]);
 expect(guest.instance.view.workspace?.document).not.toBeNull();
 host.instance.publishHouse({...layout,revision:3,allowlist:[guest.identity.public.fingerprint],floors:[{...layout.floors![0],rooms:[{id:'math',name:'Math',allowlist:[]}]}]});
 await until(()=>guest.instance.view.workspace?.space===null);expect(guest.instance.view.workspace?.document).toBeNull();
 expect(guest.instance.view.members.find(m=>m.identity.fingerprint===guest.identity.public.fingerprint)?.houseId).toBe(host.identity.public.fingerprint);
 host.instance.publishHouse({...layout,revision:4,floors:[{...layout.floors![0],rooms:[{id:'math',name:'Math'}]}]});
 await until(()=>guest.instance.view.members.find(m=>m.identity.fingerprint===guest.identity.public.fingerprint)?.houseId===null);
});

it('pairs host and guest tablets by private-key proof without duplicate people; routes requests and selects exactly one media endpoint',async()=>{
 const network=new FakeNetwork(),clock=new ManualClock();
 const host=await client(network,clock,'Laptop'),friend=await client(network,clock,'Friend');
 await host.instance.openVillage();await admit(host.instance,friend.instance);
 const paired=(identity:LocalIdentity)=>{const c=new VillageClient(identity,houseFor(identity),{transportFactory:network.create,clock});clients.push(c);return c;};
 const impostorKeys=await generateIdentity('Impostor','#223344');const impostor=paired({public:host.identity.public,privateKey:impostorKeys.privateKey});await impostor.joinVillage(host.instance.view.invite!);await until(()=>impostor.view.phase==='NETWORK_FAILED','public card cannot authorize pairing');expect(host.instance.view.pendingJoins).toHaveLength(0);
 const tablet=paired(host.identity);await admit(host.instance,tablet);
 expect(host.instance.view.members).toHaveLength(2);expect(host.instance.view.houses).toHaveLength(2);
 expect(tablet.view.isHost).toBe(false);expect(tablet.view.devices).toHaveLength(2);
 expect(tablet.view.devices?.find(d=>d.current)?.media).toBe(false);
 expect(()=>tablet.toggleMicrophone()).toThrow(/dispositivo/);
 const received:string[]=[];host.instance.onApp(m=>{if(m.channel==='ai') {received.push(m.data);host.instance.sendApp('ai',m.from,'{"reply":"tablet-only-request"}');}});
 const responses:string[]=[];tablet.onApp(m=>{if(m.channel==='ai')responses.push(m.data);});
 expect(tablet.sendApp('ai',host.identity.public.fingerprint,'{"request":"tablet-only-request"}')).toBe(true);
 await until(()=>received.length===1&&responses.length===1,'same person activity request/reply');
 tablet.move({x:321,y:200,direction:'left',moving:false});
 await until(()=>host.instance.view.members.find(m=>m.identity.fingerprint===host.identity.public.fingerprint)?.position.x===321,'paired position');
 const hostId=host.identity.public.fingerprint;
 const room=(instance:VillageClient)=>new SharedRoom<QuizAction,QuizView,StudyQuiz>('study',instance,()=>({selfId:hostId,hostId,authority:instance.view.isHost}),()=>new StudyQuiz(hostId));
 const hostRoom=room(host.instance),tabletRoom=room(tablet);
 try{
  hostRoom.sync();tabletRoom.sync();await until(()=>!!tabletRoom.current(),'tablet receives host activity');
  expect(tabletRoom.canLead()).toBe(false);
  hostRoom.mutate(engine=>{engine.setQuiz({id:'paired',title:'Shared',updatedAt:0,questions:[{id:'q',text:'Two plus two',choices:['4','5'],correctChoice:0,explanation:''}]});return true;});
  tabletRoom.act({kind:'join',name:'Laptop'});
  await until(()=>hostRoom.current()?.players.length===1&&tabletRoom.current()?.players.length===1,'paired game shares one player and receives updates');
  hostRoom.act({kind:'start',seconds:0});await until(()=>tabletRoom.current()?.phase==='question','paired authoritative game phase');
 }finally{hostRoom.dispose();tabletRoom.dispose();}
 const endpoint=tablet.view.devices!.find(d=>d.current)!.id;
 tablet.selectMediaDevice(endpoint);
 await until(()=>tablet.view.devices!.find(d=>d.current)!.media,'media endpoint selected');
 expect(host.instance.view.devices!.find(d=>d.current)!.media).toBe(false);
 expect(()=>host.instance.toggleMicrophone()).toThrow(/dispositivo/);
 friend.instance.selectMediaDevice(endpoint);await waitReal(15);
 expect(host.instance.view.devices!.filter(d=>d.media).map(d=>d.id)).toEqual([endpoint]);
 const third=paired(host.identity);await admit(host.instance,third);
 const fourth=paired(host.identity);await fourth.joinVillage(host.instance.view.invite!);
 await until(()=>fourth.view.phase==='NETWORK_FAILED'||fourth.view.phase==='DENIED','bounded endpoints');
 const guestTablet=paired(friend.identity);await admit(host.instance,guestTablet);
 expect(host.instance.view.members).toHaveLength(2);
 const leave=tablet.leave();await leave;
 await until(()=>host.instance.view.devices!.length===2,'one device leaves');
 expect(host.instance.view.phase).toBe('JOINED');expect(third.view.phase).toBe('JOINED');
 expect(host.instance.view.members.find(m=>m.identity.fingerprint===host.identity.public.fingerprint)?.connected).toBe(true);
 expect(host.instance.view.devices!.filter(d=>d.media)).toHaveLength(1);
});

it('replicates owner floor decoration only to admitted floor visitors and rejects guest edits',async()=>{
 const network=new FakeNetwork(),clock=new ManualClock(),host=await client(network,clock,'FloorHost'),guest=await client(network,clock,'FloorGuest');await host.instance.openVillage();await admit(host.instance,guest.instance);
 const owner=host.identity.public.fingerprint,floor={floorId:'ground',roomId:null},room={floorId:'ground',roomId:'math'};host.instance.publishHouse({...host.house,revision:2,access:'open',floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math'}]}]});await until(()=>guest.instance.view.houses.some(h=>h.ownerId===owner&&h.floors?.[0].rooms.length===1));host.instance.visitHouse(owner);guest.instance.visitHouse(owner);await until(()=>guest.instance.view.members.find(m=>m.identity.fingerprint===guest.identity.public.fingerprint)?.houseId===owner);
 host.instance.workspaceCommand({action:'enter',owner,space:floor});await until(()=>!!host.instance.view.workspace?.document);const empty=host.instance.view.workspace!.document!,palm={id:'palm',kind:'palm' as const,x:100,y:180,publicAlias:'Shared palm'};host.instance.workspaceCommand({action:'commit',base:0,document:{...empty,furniture:[palm]}});expect(guest.instance.view.workspace!.document).toBeNull();
 guest.instance.workspaceCommand({action:'enter',owner,space:floor});await until(()=>!!host.instance.view.workspace?.requests.length);host.instance.workspaceCommand({action:'decide',request:host.instance.view.workspace!.requests[0].id,accept:true});await until(()=>guest.instance.view.workspace?.document?.revision===1);expect(guest.instance.view.workspace!.document!.furniture).toEqual([palm]);
 guest.instance.workspaceCommand({action:'commit',base:1,document:{...guest.instance.view.workspace!.document!,furniture:[]}});await until(()=>guest.instance.view.error?.includes('Solo el propietario')??false);expect(host.instance.view.workspace!.document!.furniture).toEqual([palm]);
 host.instance.workspaceCommand({action:'commit',base:1,document:{...host.instance.view.workspace!.document!,furniture:[{...palm,x:220}]}});await until(()=>guest.instance.view.workspace?.document?.revision===2);expect(guest.instance.view.workspace!.document!.furniture[0].x).toBe(220);
 guest.instance.workspaceCommand({action:'enter',owner,space:room});await until(()=>!!host.instance.view.workspace?.requests.length);expect(guest.instance.view.workspace!.space).toEqual(floor);const ref=`house:${owner}:space:ground:math:board`;await expect(guest.instance.commitBoard(ref,[makeStroke(ref,guest.identity.public.fingerprint,1,'pen','#123456',2,[{x:10,y:10}],'floor-denied')])).rejects.toThrow();
});

it('routes private mailbox notes through authenticated P2P identities to a non-host owner',async()=>{
 const network=new FakeNetwork(),clock=new ManualClock(),host=await client(network,clock,'MailHost'),recipient=await client(network,clock,'Recipient'),sender=await client(network,clock,'Sender');
 await host.instance.openVillage();await admit(host.instance,recipient.instance);await admit(host.instance,sender.instance);
 const owner=recipient.identity.public.fingerprint,command=(id:string)=>({action:'post' as const,owner,id,text:'Private mailbox content'});
 for(let n=0;n<5;n++)expect((await sender.instance.mailboxCommand(command(`letter-${n}`))).ownCount).toBe(n+1);
 await expect(sender.instance.mailboxCommand(command('letter-six'))).rejects.toMatchObject({code:'limit'});
 const inbox=await recipient.instance.mailboxCommand({action:'list',owner});expect(inbox.notes).toHaveLength(5);expect(inbox.notes.every(n=>n.author===sender.identity.public.fingerprint)).toBe(true);
 expect(await host.instance.mailboxCommand({action:'list',owner})).toMatchObject({notes:[],total:0});
 await expect(host.instance.mailboxCommand({action:'remove',owner,id:'letter-0'})).rejects.toMatchObject({code:'forbidden'});
 await recipient.instance.mailboxCommand({action:'remove',owner,id:'letter-0'});expect((await sender.instance.mailboxCommand(command('replacement'))).ownCount).toBe(5);
 expect(JSON.stringify(host.instance.view)).not.toContain('Private mailbox content');
});

it('enforces a single cancellable access request across houses, floors and rooms at the P2P coordinator',async()=>{
 const network=new FakeNetwork(),clock=new ManualClock(),host=await client(network,clock,'Coordinator'),owner=await client(network,clock,'Owner'),guest=await client(network,clock,'Visitor');
 await host.instance.openVillage();await admit(host.instance,owner.instance);await admit(host.instance,guest.instance);
 const ownerId=owner.identity.public.fingerprint,guestId=guest.identity.public.fingerprint,floor={floorId:'ground',roomId:null},room={floorId:'ground',roomId:'math'};
 owner.instance.publishHouse({...owner.house,revision:2,access:'ask',floors:[{id:'ground',name:'Ground',rooms:[{id:'math',name:'Math'},{id:'code',name:'Code'}]}]});
 await until(()=>guest.instance.view.houses.find(h=>h.ownerId===ownerId)?.access==='ask');
 // Deliberately bypass the public client's convenience guard: authority must resist repeated wire requests too.
 const wire=(peer:VillageClient,event:unknown)=>(peer as unknown as {sendHost(event:unknown):void}).sendHost(event);
 guest.instance.visitHouse(ownerId);await until(()=>owner.instance.view.pendingVisits.length===1&&!!guest.instance.view.pendingAccess);
 const first=owner.instance.view.pendingVisits[0].requestId;
 guest.instance.visitHouse(host.identity.public.fingerprint);
 wire(guest.instance,{type:'house.visit',requestId:randomId(),ownerId});wire(guest.instance,{type:'house.visit',requestId:randomId(),ownerId:host.identity.public.fingerprint});
 wire(guest.instance,{type:'workspace.command',command:{action:'enter',requestId:'replacement',owner:ownerId,space:floor}});
 wire(owner.instance,{type:'access.cancel',requestId:first});await waitReal(30);
 expect(owner.instance.view.pendingVisits.map(r=>r.requestId)).toEqual([first]);expect(guest.instance.view.pendingAccess).toEqual({requestId:first,ownerId,kind:'house'});expect(host.instance.view.pendingVisits).toEqual([]);
 for(let second=0;second<65;second++){clock.advance(1000);await waitReal(2);}expect(owner.instance.view.pendingVisits.map(r=>r.requestId)).toEqual([first]);expect(guest.instance.view.pendingAccess?.requestId).toBe(first);
 guest.instance.cancelAccessRequest();await until(()=>!guest.instance.view.pendingAccess&&owner.instance.view.pendingVisits.length===0);
 guest.instance.visitHouse(ownerId);await until(()=>owner.instance.view.pendingVisits.length===1);owner.instance.decideVisit(owner.instance.view.pendingVisits[0].requestId,false);await until(()=>!guest.instance.view.pendingAccess);
 guest.instance.visitHouse(ownerId);await until(()=>owner.instance.view.pendingVisits.length===1);let resolvedHouse:string|null|undefined;const watch=guest.instance.subscribe(view=>{if(!view.pendingAccess)resolvedHouse=view.members.find(m=>m.identity.fingerprint===guestId)?.houseId;});owner.instance.decideVisit(owner.instance.view.pendingVisits[0].requestId,true);
 await until(()=>guest.instance.view.members.find(m=>m.identity.fingerprint===guestId)?.houseId===ownerId&&!guest.instance.view.pendingAccess);expect(resolvedHouse).toBe(ownerId);watch();
 guest.instance.workspaceCommand({action:'enter',owner:ownerId,space:floor});await until(()=>owner.instance.view.workspace!.requests.length===1&&guest.instance.view.pendingAccess?.kind==='floor');
 const floorId=owner.instance.view.workspace!.requests[0].id;
 wire(guest.instance,{type:'house.visit',requestId:randomId(),ownerId:host.identity.public.fingerprint});wire(guest.instance,{type:'workspace.command',command:{action:'enter',requestId:'otherdoor',owner:ownerId,space:room}});await waitReal(30);
 expect(owner.instance.view.workspace!.requests.map(r=>r.id)).toEqual([floorId]);expect(guest.instance.view.pendingAccess?.requestId).toBe(floorId);
 guest.instance.cancelAccessRequest();await until(()=>!guest.instance.view.pendingAccess&&owner.instance.view.workspace!.requests.length===0);
 guest.instance.workspaceCommand({action:'enter',owner:ownerId,space:floor});await until(()=>owner.instance.view.workspace!.requests.length===1);owner.instance.workspaceCommand({action:'decide',request:owner.instance.view.workspace!.requests[0].id,accept:true});await until(()=>!guest.instance.view.pendingAccess&&guest.instance.view.workspace?.space?.floorId==='ground');
 guest.instance.workspaceCommand({action:'enter',owner:ownerId,space:room});await until(()=>guest.instance.view.pendingAccess?.kind==='room');
 const pendingRoom=guest.instance.view.pendingAccess!;wire(guest.instance,{type:'access.cancel',requestId:floorId});await waitReal(20);expect(guest.instance.view.pendingAccess).toEqual(pendingRoom);
 network.sever(host.instance.view.members.find(m=>m.identity.fingerprint===ownerId)!.endpoint);await until(()=>!guest.instance.view.pendingAccess&&host.instance.view.workspace!.requests.length===0);
});

it('tracks a coordinator requester and cancels its pending house visit without notifying unrelated people',async()=>{
 const network=new FakeNetwork(),clock=new ManualClock(),host=await client(network,clock,'Host'),owner=await client(network,clock,'Owner');await host.instance.openVillage();await admit(host.instance,owner.instance);
 owner.instance.publishHouse({...owner.house,revision:2,access:'ask'});await until(()=>host.instance.view.houses.find(h=>h.ownerId===owner.identity.public.fingerprint)?.access==='ask');
 host.instance.visitHouse(owner.identity.public.fingerprint);await until(()=>owner.instance.view.pendingVisits.length===1);const pending=host.instance.view.pendingAccess!;expect(pending.kind).toBe('house');
 host.instance.visitHouse(host.identity.public.fingerprint);expect(host.instance.view.pendingAccess).toEqual(pending);host.instance.cancelAccessRequest();await until(()=>owner.instance.view.pendingVisits.length===0);expect(host.instance.view.pendingAccess).toBeNull();
});

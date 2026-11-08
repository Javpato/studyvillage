import {Friends} from '../../packages/core/src/social/friends';
import { InkAuthority } from '../../packages/documents/src/authority';
import {MailboxAuthority,MailboxError,mailboxResult} from '../../packages/core/src/house/mailbox';
import { hasHouseAccess, WorkspaceCoordinator, parseScopedBoard, sameSpace } from '../../packages/core/src/house/workspaces';
import { botDrawingPng } from './bot-image';
import type { GarticGame } from '../../packages/core/src/minigames/gartic-phone';
import { botResponse, AiError, aiWireSchema, type AiProvider, type AiReply } from '../../packages/runtime/src/ai/contracts';
import { VoiceHub } from '../../packages/runtime/src/media/voice';
/**
 * The authority of a self-hosted world. Administration (capacity, invitations)
 * is separate from authority (this process) and from organising activities
 * (the first present participant), so the administrator leaving never closes
 * the world or stops a game.
 */
import { randomBytes } from 'node:crypto';
import { validatePublicIdentity, verify } from '../../packages/core/src/identity';
import { boardCommitSchema, type SignedBoardCommit, type SignedHouse, type SignedStroke } from '../../packages/core/src/protocol/schema';
import { LIMITS, type Position, type PublicIdentity } from '../../packages/core/src/protocol/types';
import type { AvatarAppearance } from '../../packages/core/src/assets/appearance';
import {
  SERVER_AUTHORITY, SERVER_PROTOCOL, MAX_DEVICES_PER_PERSON, authStatementSchema, clampCapacity, clientMessageSchema, neighborhoodsFor, signingScope,
  type ErrorCode, type Operation, type PresenceView, type ResidentView, type Role, type ServerMessage,
} from '../../packages/runtime/src/server/contracts';
import { ACTIVITY_SCOPE, applyRoomCommand } from '../../packages/core/src/minigames/room';
import { StorageError, Store } from './store';
import type { Socket } from './ws';

export interface RoomEngine { apply(actor: string, action: unknown, now: number): void; tick(now: number): boolean; viewFor(viewer: string, now: number): unknown; audience(): string[]; cancel?(now: number): void; setController?(id:string|null):void; canBroadcastCamera?(id:string):boolean; canReceiveCamera?(viewerId:string,senderId:string):boolean }
export type EngineFactory = (organizer: () => string | null) => RoomEngine;
export interface WorldOptions { name: string; ai?:AiProvider; engines: Partial<Record<'werewolves' | 'tetris' | 'gartic' | 'study' | 'projects', EngineFactory>>; now?: () => number; log?: (line: string) => void }

/** People present in one neighbourhood at once; keeps each scene's media mesh small. */
export const NEIGHBORHOOD_PRESENCE = 12;
const MUTATING = new Set(['friend','house.publish', 'house.decide', 'house.kick', 'board.commit', 'import', 'admin.capacity', 'admin.invite.create', 'admin.invite.revoke', 'travel']);

class Reject extends Error { constructor(readonly code: ErrorCode) { super(code); } }

interface Connection {
  socket: Socket; id: string; deviceId:string; deviceName:string; endpoint: string; nonce: string; identity: PublicIdentity | null; saved: boolean;
  role: Role; neighborhood: number; houseId: string | null; position: Position; appearance?: AvatarAppearance;
  board: string | null; privateWith: string | null; mediaToken: string; allowedHouses: Set<string>;
  tokens: number; lastRefill: number; queue: Promise<void>;
}
interface Visit { requestId: string; visitor: string; owner: string; neighborhood: number }

const b64 = (n: number) => randomBytes(n).toString('base64url');
const areaOf = (p: Position) => p.areaId ?? 'residential';
const SPAWN: Position = { areaId: 'residential', x: 240, y: 215, direction: 'down', moving: false };

export class World {
  private mailbox:MailboxAuthority;
  private workspace: WorkspaceCoordinator;
  private ink:InkAuthority;
  private friends:Friends;
  private voice = new VoiceHub();
  private connections = new Map<string, Connection>();
  private mediaDevices = new Map<string,string>();
  private visits = new Map<string, Visit>();
  private rooms = new Map<string, ActivityRoom>();
  private revision = 0;
  private dirty = new Set<number>();
  private flushScheduled = false;
  private readonly now: () => number;
  private readonly prune: ReturnType<typeof setInterval>;
  constructor(readonly store: Store, private readonly options: WorldOptions) {
    this.friends=new Friends(JSON.parse(store.meta('friends-v1')??'[]'));
    this.now = options.now ?? Date.now;
    this.mailbox=new MailboxAuthority({load:owner=>this.store.mailbox(owner),save:(owner,notes)=>this.store.putMailbox(owner,notes)});
    this.workspace=new WorkspaceCoordinator(id=>{const c=this.byFingerprint(id);return c?.identity?{identity:c.identity,connected:true,houseId:c.houseId,position:c.position}:undefined;},
      owner=>(this.store.house(owner)?.document as SignedHouse|undefined)?.house,
      {get:(owner,space)=>this.store.workspace(owner,space),put:(owner,space,doc)=>this.store.putWorkspace(owner,space,doc),remove:(owner,space)=>this.store.removeWorkspace(owner,space)},
      (id,space)=>{for(const c of this.personDevices(id)){c.position={...c.position,x:384,y:344,moving:false,space:space??undefined};c.board=null;}});

    this.ink=new InkAuthority({
      load:key=>{const raw=this.store.meta('ink:'+key);return raw?JSON.parse(raw):null;},
      save:(key,state)=>{this.store.transaction(()=>this.store.setMeta('ink:'+key,JSON.stringify(state)));},
      allowed:(endpoint,namespace,scope)=>{const c=this.connections.get(endpoint);if(!c?.identity||String(c.neighborhood)!==namespace)return false;if(scope==='village')return true;const [,owner,floorId,roomId]=scope.split(':');return this.workspace.canRead(c.identity.fingerprint,owner,{floorId,roomId});},
      moderator:(person,scope)=>scope.startsWith('room:'+person+':'),
      send:(endpoint,data)=>{const c=this.connections.get(endpoint);if(!c)return false;this.send(c,{t:'app',channel:'ink',from:SERVER_AUTHORITY,data});return true;},
    });
    this.prune = setInterval(() => { try { this.store.pruneRequests(this.now() - 86_400_000); } catch { /* Retried later. */ } }, 3_600_000);
    this.prune.unref();
  }
  get online(): number { return new Set([...this.connections.values()].flatMap(c => c.identity?[c.identity.fingerprint]:[])).size; }
  dispose(): void { this.ink.dispose();clearInterval(this.prune); for (const room of this.rooms.values()) room.dispose(); for (const c of this.connections.values()) c.socket.close(1001, 'shutdown'); }

  attach(socket: Socket): void {
    const connection: Connection = {
      socket, id: socket.id, deviceId:'legacy',deviceName:'Dispositivo', endpoint: `c${socket.id}`, nonce: b64(32), identity: null, saved: false, role: 'visitor', neighborhood: 0,
      houseId: null, position: { ...SPAWN }, board: null, privateWith: null, mediaToken: b64(32), allowedHouses: new Set(),
      tokens: 200, lastRefill: this.now(), queue: Promise.resolve(),
    };
    this.connections.set(socket.id, connection);
    const deadline = setTimeout(() => { if (!connection.identity) socket.close(4001, 'auth timeout'); }, 20_000); deadline.unref();
    socket.onMessage(text => { connection.queue = connection.queue.then(() => this.receive(connection, text)).catch(() => socket.close(1011, 'error')); });
    socket.onClose(() => { clearTimeout(deadline); this.detach(connection); });
  }

  private send(c: Connection, message: ServerMessage): void { c.socket.send(JSON.stringify(message)); }

  private async receive(c: Connection, text: string): Promise<void> {
    const now = this.now();
    c.tokens = Math.min(200, c.tokens + (now - c.lastRefill) * 0.08); c.lastRefill = now;
    if (--c.tokens < 0) { c.socket.close(1008, 'rate'); return; }
    let parsed;
    try { const raw=JSON.parse(text);if(!c.identity&&raw?.t==='hello'&&Number.isInteger(raw.v)&&raw.v!==SERVER_PROTOCOL){this.send(c,{t:'denied',code:'version'});c.socket.close(1008,'version');return;}parsed = clientMessageSchema.parse(raw); }
    catch {
      if (!c.identity) { c.socket.close(1008, 'invalid'); return; }
      // Answer a malformed request instead of leaving the client waiting.
      let id: unknown; try { id = (JSON.parse(text) as { id?: unknown }).id; } catch { /* Not JSON. */ }
      if (typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id)) this.send(c, { t: 'ack', id, ok: false, code: 'invalid' });
      return;
    }
    if (parsed.t === 'hello') {
      this.send(c, { t: 'challenge', v: SERVER_PROTOCOL, worldId: this.store.worldId, name: this.options.name, nonce: c.nonce, needsClaim: !this.store.admin(), capacity: { maxOnline: this.store.maxOnline, online: this.online } });
      return;
    }
    if (parsed.t === 'auth') { await this.authenticate(c, parsed); return; }
    if (!c.identity) { c.socket.close(1008, 'unauthenticated'); return; }
    const { id, body } = parsed;
    if (MUTATING.has(body.op)) {
      const previous = this.store.request(c.identity.fingerprint, id);
      if (previous !== undefined) { this.send(c, previous as ServerMessage); return; }
    }
    let reply: ServerMessage;
    try { reply = { t: 'ack', id, ok: true, result: await this.operate(c, body) }; }
    catch (error) {
      const code: ErrorCode = error instanceof Reject ? error.code : error instanceof StorageError ? 'storage' : 'invalid';
      if (code === 'invalid' || code === 'storage') this.options.log?.(`${body.op} failed: ${error instanceof Error ? error.message : String(error)}`);
      reply = { t: 'ack', id, ok: false, code };
    }
    // A refused position (for example, entering a house you were removed from) resyncs that person.
    if (body.op === 'presence') { if (!reply.ok) this.changed(c.neighborhood); return; }
    // Remember the outcome so a retry after a lost acknowledgement never applies twice.
    if (MUTATING.has(body.op) && (reply.ok || reply.code !== 'storage')) try { this.store.rememberRequest(c.identity.fingerprint, id, reply, now); } catch { /* The retry is still safe: revisions and seq reject duplicates. */ }
    this.send(c, reply);
  }

  private async authenticate(c: Connection, auth: Extract<ReturnType<typeof clientMessageSchema.parse>, { t: 'auth' }>): Promise<void> {
    const deny = (code: ErrorCode) => { this.send(c, { t: 'denied', code }); c.socket.close(4003, code); };
    if (c.identity) return;
    let identity: PublicIdentity;
    try { identity = await validatePublicIdentity(auth.identity); } catch { deny('signature'); return; }
    const statement = authStatementSchema.parse({ worldId: this.store.worldId, nonce: c.nonce, fingerprint: identity.fingerprint, saved: auth.saved, ...(auth.deviceId?{deviceId:auth.deviceId}:{}) });
    if (!await verify(identity, 'server-auth', statement, auth.signature)) { deny('signature'); return; }
    // Possession of the private identity key authorizes another endpoint. Names/codes do not.
    const siblings=this.personDevices(identity.fingerprint),deviceId=auth.deviceId??'legacy';
    const older=siblings.find(o=>o.deviceId===deviceId);
    if(siblings.length-(older?1:0)>=MAX_DEVICES_PER_PERSON){deny('full');return;}
    if(!siblings.length&&this.online>=this.store.maxOnline){deny('full');return;}
    const now = this.now();
    let resident = this.store.resident(identity.fingerprint);
    try {
      if (auth.claim) {
        if (!auth.saved) { deny('unsaved'); return; }
        if (this.store.admin() || !this.store.claimMatches(auth.claim)) { deny('claim'); return; }
        resident = this.store.transaction(() => {
          if (this.store.resident(identity.fingerprint)) { this.store.db.prepare('UPDATE residents SET admin = 1 WHERE fingerprint = ?').run(identity.fingerprint); this.store.db.prepare("DELETE FROM meta WHERE key = 'claimHash'").run(); return this.store.resident(identity.fingerprint); }
          return this.store.addResident(identity, true, now);
        });
      } else if (!resident) {
        const invite = auth.invite ? this.store.invite(auth.invite) : null;
        if (!invite || invite.revoked || invite.expiresAt <= now || invite.used >= invite.uses) { deny('invite'); return; }
        // Temporary identities may visit but never keep a plot.
        if (auth.saved && this.store.freePlot()) resident = this.store.transaction(() => { this.store.useInvite(invite.id); return this.store.addResident(identity, false, now); });
      } else if (resident.identity.displayName !== identity.displayName || resident.identity.color !== identity.color) {
        this.store.transaction(() => this.store.updateIdentity(identity));
      }
    } catch (error) { this.options.log?.(`auth storage: ${String(error)}`); deny('storage'); return; }
    const shared=siblings[0];
    c.deviceId=deviceId;c.deviceName=auth.deviceName||`Dispositivo ${siblings.length+1}`;
    c.identity = identity; c.saved = auth.saved; c.appearance = auth.appearance;
    c.role = resident ? (resident.admin ? 'admin' : 'resident') : 'visitor';
    c.neighborhood = shared?.neighborhood??resident?.neighborhood ?? this.leastBusyNeighborhood();
    if(shared){c.position={...shared.position};c.houseId=shared.houseId;c.allowedHouses=new Set(shared.allowedHouses);}
    c.allowedHouses.add(identity.fingerprint);
    if(!this.mediaDevices.has(identity.fingerprint)||this.mediaDevices.get(identity.fingerprint)===older?.id)this.mediaDevices.set(identity.fingerprint,c.id);
    if(older)older.socket.close(4000,'reconnected');
    this.send(c, { t: 'welcome', role: c.role, neighborhood: c.neighborhood, scope: signingScope(this.store.worldId, c.neighborhood), epoch: this.store.epoch, connectionId: c.id, position:c.position,houseId:c.houseId });
    this.broadcastDevices(identity.fingerprint);
    this.changed(c.neighborhood); this.broadcastVoice(); this.broadcastWorkspaces();
  }

  private leastBusyNeighborhood(): number {
    let best = 0, count = Infinity;
    for (let n = 0; n < this.store.neighborhoods; n++) { const here = new Set(this.present(n).map(c=>c.identity!.fingerprint)).size; if (here < count) { best = n; count = here; } }
    return best;
  }
  private present(neighborhood: number): Connection[] { return [...this.connections.values()].filter(c => c.identity && c.neighborhood === neighborhood); }
  private personDevices(id:string):Connection[]{return [...this.connections.values()].filter(c=>c.identity?.fingerprint===id);}
  private byFingerprint(id:string):Connection|undefined {const list=this.personDevices(id);return list.find(c=>c.id===this.mediaDevices.get(id))??list[0];}
  private syncPerson(c:Connection):void {for(const sibling of this.personDevices(c.identity!.fingerprint))if(sibling!==c){sibling.position={...c.position};sibling.houseId=c.houseId;sibling.neighborhood=c.neighborhood;sibling.appearance=c.appearance;sibling.allowedHouses=new Set(c.allowedHouses);if(sibling.board&&!this.canAccessBoard(sibling,sibling.board))sibling.board=null;}}
  private broadcastDevices(id:string):void {const all=this.personDevices(id);if(!all.some(c=>c.id===this.mediaDevices.get(id))){if(all[0])this.mediaDevices.set(id,all[0].id);else this.mediaDevices.delete(id);}for(const c of all)this.send(c,{t:'devices',devices:all.map(d=>({id:d.deviceId,name:d.deviceName,current:d===c,media:d.id===this.mediaDevices.get(id)}))});}


  private detach(c: Connection): void {
    if (this.connections.get(c.id) !== c) return;
    this.ink.detach(c.id);
    this.connections.delete(c.id);
    if (!c.identity) return;
    const id = c.identity.fingerprint;
    if(this.personDevices(id).length){this.broadcastDevices(id);this.broadcastVoice();this.changed(c.neighborhood);return;}
    this.mediaDevices.delete(id);
    this.options.ai?.cancel(id);
    for (const [key, visit] of this.visits) if (visit.visitor === id || visit.owner === id) this.visits.delete(key);
    for (const room of this.rooms.values()) room.leave(id);
    this.workspace.disconnect(id); this.broadcastWorkspaces();
    this.voice.disconnect(id); this.broadcastVoice();
    // Guests in a house whose owner left stay; the house remains persistent.
    this.changed(c.neighborhood);
  }

  private async operate(c: Connection, body: Operation): Promise<unknown> {
    const me = c.identity!.fingerprint, now = this.now();
    const scope = signingScope(this.store.worldId, c.neighborhood), epoch = this.store.epoch;
    switch (body.op) {
      case 'mailbox': return mailboxResult(()=>{if(!this.store.resident(body.command.owner))throw new MailboxError('missing');return this.mailbox.execute(c.identity!,body.command,now);});
      case 'device.media': {const device=this.personDevices(me).find(d=>d.deviceId===body.deviceId);if(!device)throw new Reject('forbidden');this.mediaDevices.set(me,device.id);this.broadcastDevices(me);this.broadcastVoice();this.changed(c.neighborhood);return null;}
      case 'workspace': {
        if(body.command.action!=='enter'||!this.pendingAccess(me))this.workspace.apply(me,body.command);
        this.broadcastWorkspaces();this.changed(c.neighborhood);return {pendingAccess:this.pendingAccess(me)};
      }
      case 'access.cancel': this.cancelAccess(me,body.requestId);this.broadcastWorkspaces();this.changed(c.neighborhood);return {pendingAccess:this.pendingAccess(me)};
      case 'presence': {
        const houseChanged = body.houseId !== c.houseId;
        if(houseChanged&&this.pendingAccess(me))throw new Reject('conflict');
        if (body.houseId && !this.canEnter(c, body.houseId)) throw new Reject('forbidden');
        const areaChanged = areaOf(body.position) !== areaOf(c.position);
        if(houseChanged&&body.position.space)throw new Reject('forbidden');
        if(!sameSpace(c.position.space,body.position.space))throw new Reject('forbidden');
        if(!body.houseId&&body.position.space)throw new Reject('forbidden');
        c.position = body.position; c.houseId = body.houseId; this.syncPerson(c);
        if (houseChanged || areaChanged) { if (c.board && !this.canAccessBoard(c, c.board)) c.board = null; this.changed(c.neighborhood); this.broadcastWorkspaces(); }
        else for (const other of this.present(c.neighborhood)) if (other !== c) this.send(other, { t: 'position', id: me, position: c.position, houseId: c.houseId });
        return null;
      }
      case 'appearance': c.appearance = body.appearance; this.syncPerson(c); this.changed(c.neighborhood); return null;
      case 'house.publish': return this.withRequest(c, () => this.publishHouse(c, body.document, scope, epoch));
      case 'house.visit': {
        const pending=this.pendingAccess(me);if(pending)return {pending:true,requestId:pending.requestId,pendingAccess:pending};
        const owner = this.store.resident(body.ownerId);
        if (!owner || owner.neighborhood !== c.neighborhood) throw new Reject('not-found');
        if (this.canEnter(c, body.ownerId)) return { accepted: true,pendingAccess:null };
        const access = (this.store.house(body.ownerId)?.document as SignedHouse | undefined)?.house.access ?? 'ask';
        if (access === 'locked') throw new Reject('forbidden');
        const host = this.byFingerprint(body.ownerId);
        if (!host || host.neighborhood !== c.neighborhood) throw new Reject('forbidden');
        const requestId = body.requestId??b64(12);
        if(this.visits.has(requestId)||this.visits.size>=12)throw new Reject('conflict');
        this.visits.set(requestId, { requestId, visitor: me, owner: body.ownerId, neighborhood: c.neighborhood });
        this.changed(c.neighborhood);
        return { pending: true, requestId,pendingAccess:this.pendingAccess(me) };
      }
      case 'house.decide': return this.withRequest(c, () => {
        const visit = this.visits.get(body.requestId);
        if (!visit || visit.owner !== me) throw new Reject('not-found');
        this.visits.delete(body.requestId);
        const visitor = this.byFingerprint(visit.visitor);
        if (visitor) { if (body.accept) {visitor.allowedHouses.add(me);this.syncPerson(visitor);} for(const endpoint of this.personDevices(visit.visitor))this.send(endpoint, { t: 'visit.result', requestId: visit.requestId, ownerId: me, accepted: body.accept }); }
        this.changed(c.neighborhood); return null;
      });
      case 'house.leave': {const pending=this.pendingAccess(me);if(pending)this.cancelAccess(me,pending.requestId);c.houseId = null; c.position={...c.position,space:undefined}; this.syncPerson(c); this.broadcastWorkspaces(); if (c.board?.startsWith('house:')) c.board = null; this.changed(c.neighborhood); return null;}
      case 'house.kick': return this.withRequest(c, () => {
        const guest = this.byFingerprint(body.identityId);
        if (guest) { guest.allowedHouses.delete(me); if (guest.houseId === me) { guest.houseId = null; guest.position={...guest.position,space:undefined}; guest.board = null; } this.syncPerson(guest); }
        this.broadcastWorkspaces();
        this.changed(c.neighborhood); return null;
      });
      case 'board.select': {
        if (body.ref && !this.canAccessBoard(c, body.ref)) throw new Reject('forbidden');
        c.board = body.ref;
        if (body.ref) this.send(c, { t: 'board', ref: body.ref, documents: this.store.strokes(this.boardKey(c.neighborhood, body.ref)) as SignedStroke[], reset: true });
        return null;
      }
      case 'board.commit': return this.withRequest(c, async () => {
        if (!this.canAccessBoard(c, body.document.boardId)) throw new Reject('forbidden');
        const changed = await this.applyCommit(c, body.document, scope, epoch);
        return { applied: changed.length };
      });
      case 'app.send': if(body.channel==='mailbox')throw new Reject('forbidden');return this.relayApp(c, body.channel, body.to, body.data);
      case 'travel': return this.withRequest(c, () => {
        const target = body.neighborhood;
        if (target >= this.store.neighborhoods || Math.abs(target - c.neighborhood) !== 1) throw new Reject('forbidden');
        if (new Set(this.present(target).map(p=>p.identity!.fingerprint)).size >= NEIGHBORHOOD_PRESENCE) throw new Reject('full');
        const from = c.neighborhood;
        for (const room of this.rooms.values()) room.leave(me);
        c.neighborhood = target; c.houseId = null; c.board = null; this.workspace.disconnect(me);
        c.position = { areaId: 'residential', x: target > from ? 20 : 748, y: 215, direction: target > from ? 'right' : 'left', moving: false };
        this.syncPerson(c); this.broadcastWorkspaces();
        for(const endpoint of this.personDevices(me))this.send(endpoint, { t: 'welcome', role: c.role, neighborhood: target, scope: signingScope(this.store.worldId, target), epoch: this.store.epoch, connectionId: endpoint.id,position:c.position,houseId:c.houseId });
        this.changed(from); this.changed(target); return { neighborhood: target };
      });
      case 'media.private': this.voice.apply(me, { action: 'call', target: body.with }, this.onlineIds(), String(c.neighborhood)); this.broadcastVoice(); return null;
      case 'friend': {const next=new Friends(this.friends.records.map(r=>structuredClone(r)));next.apply(me,body.command,[...this.connections.values()].flatMap(c=>c.identity?[c.identity]:[]));this.store.transaction(()=>this.store.setMeta('friends-v1',JSON.stringify(next.records)));this.friends=next;this.broadcastVoice();return null;}
      case 'voice': if (body.command.action === 'game.end') throw new Reject('forbidden'); this.voice.apply(me, body.command, this.onlineIds(), body.command.action==='game'&&body.command.game==='tetris'?'forest':String(c.neighborhood)); this.broadcastVoice(); return null;
      case 'media.signal': {
        const peer = this.byFingerprint(body.to);
        if (this.byFingerprint(me)!==c || !peer || !this.canSignal(c, peer, body.data)) throw new Reject('forbidden');
        this.send(peer, { t: 'signal', from: me, data: body.data }); return null;
      }
      case 'import': return this.withRequest(c, async () => {
        if (c.role === 'visitor') throw new Reject('unsaved');
        for (const commit of body.boards) if (!commit.boardId.startsWith(`house:${me}:`)) throw new Reject('forbidden');
        // Verify everything first, then write in one transaction: all or nothing.
        await this.verifyHouse(c, body.house, scope, epoch);
        for (const commit of body.boards) await this.verifyCommit(c, commit, scope, epoch);
        let objects = 0;
        this.store.transaction(() => {
          this.writeHouse(me, body.house);
          for (const commit of body.boards) objects += this.writeCommit(c.neighborhood, commit).length;
        });
        this.changed(c.neighborhood);
        return { house: body.house.house.revision, objects };
      });
      case 'admin.capacity': return this.withRequest(c, () => {
        this.requireAdmin(c);
        const maxOnline = clampCapacity(body.maxOnline);
        this.store.transaction(() => this.store.setCapacity(maxOnline, neighborhoodsFor(maxOnline)));
        for (let n = 0; n < this.store.neighborhoods; n++) this.changed(n);
        return { maxOnline, neighborhoods: this.store.neighborhoods };
      });
      case 'admin.invite.create': return this.withRequest(c, () => {
        this.requireAdmin(c);
        const created = this.store.transaction(() => this.store.createInvite(body.label, body.uses, now + body.hours * 3_600_000, now));
        return { ...created, label: body.label, uses: body.uses, used: 0, expiresAt: now + body.hours * 3_600_000, revoked: false };
      });
      case 'admin.invite.revoke': return this.withRequest(c, () => {
        this.requireAdmin(c);
        if (!this.store.transaction(() => this.store.revokeInvite(body.id))) throw new Reject('not-found');
        return null;
      });
      case 'admin.invite.list': this.requireAdmin(c); return this.store.invites();
    }
  }

  /** Runs a mutation once; the same request id returns the stored reply. */
  private async withRequest<T>(c: Connection, work: () => T | Promise<T>): Promise<T> { return await work(); }

  private requireAdmin(c: Connection): void { if (c.role !== 'admin') throw new Reject('forbidden'); }

  private canEnter(c: Connection, owner: string): boolean {
    if(owner===c.identity!.fingerprint)return true;
    const resident = this.store.resident(owner);
    if (!resident || resident.neighborhood !== c.neighborhood) return false;
    const house=(this.store.house(owner)?.document as SignedHouse|undefined)?.house;
    if(house&&hasHouseAccess(house,c.identity!.fingerprint))return true;
    if(house?.access==='locked')return false;
    return c.allowedHouses.has(owner)||house?.access==='open';
  }
  private broadcastWorkspaces():void {
    this.workspace.reconcile(this.onlineIds());
    for(const c of this.connections.values())if(c.identity)this.send(c,{t:'workspace',workspace:this.workspace.view(c.identity.fingerprint)});
  }
  private pendingAccess(who:string):import('../../packages/core/src/protocol/types').AccessRequest|null {
    const visit=[...this.visits.values()].find(v=>v.visitor===who);
    if(visit)return {requestId:visit.requestId,ownerId:visit.owner,kind:'house'};
    const request=this.workspace.pending(who);return request?{requestId:request.id,ownerId:request.owner,kind:request.space.roomId===null?'floor':'room'}:null;
  }
  private cancelAccess(who:string,requestId:string):void {
    const visit=this.visits.get(requestId);if(visit?.visitor===who)this.visits.delete(requestId);
    this.workspace.cancel(who,requestId);
  }
  private canAccessBoard(c: Connection, ref: string): boolean {
    const scoped=parseScopedBoard(ref);
    if(scoped)return this.workspace.canRead(c.identity!.fingerprint,scoped.owner,scoped.space)&&!!this.store.workspace(scoped.owner,scoped.space)?.furniture.some(f=>f.kind==='board'&&f.id===scoped.furniture);
    const house = /^house:([a-f0-9]{64}):([A-Za-z0-9_-]+)$/.exec(ref);
    if (house) {
      if (c.position.space || c.houseId !== house[1]) return false;
      const document = this.store.house(house[1])?.document as SignedHouse | undefined;
      // Before the owner first publishes, their default board still exists.
      return document ? document.house.furniture.some(f => f.id === house[2] && f.kind === 'board') : house[2] === 'board';
    }
    const area = /^area:(residential|community|study):/.exec(ref);
    return !!area && c.houseId === null && areaOf(c.position) === area[1];
  }
  /** House boards are global (one owner); area boards belong to one neighbourhood. */
  private boardKey(neighborhood: number, ref: string): string { return ref.startsWith('house:') ? ref : `n${neighborhood}|${ref}`; }
  private onlineIds(): string[] { return [...new Set([...this.connections.values()].flatMap(c => c.identity ? [c.identity.fingerprint] : []))]; }
  private broadcastVoice(): void {
    for(const c of this.connections.values())if(c.identity)this.send(c,{t:'friends',friends:this.friends.view(c.identity.fingerprint)});
    this.voice.prune(this.onlineIds());
    const directory = this.onlineIds().flatMap(id=>{const c=this.byFingerprint(id);return c?.identity?[{identity:c.identity,endpoint:c.endpoint,mediaToken:c.mediaToken}]:[];});
    for (const c of this.connections.values()) if (c.identity) this.send(c, { t: 'voice', voice: this.voice.view(c.identity.fingerprint), directory, session: this.store.worldId });
  }
  private canSignal(a: Connection, b: Connection, data: string): boolean {
    const spatial = a.neighborhood === b.neighborhood && a.houseId === b.houseId && (a.houseId !== null ? sameSpace(a.position.space,b.position.space) : areaOf(a.position) === areaOf(b.position));
    try {
      const signal = JSON.parse(data) as { k?: string; meta?: { kind?: string;room?:string } };
      if (signal.k === 'close') return true;
      const forest=this.rooms.get('forest:tetris');const forestPair=!!forest&&forest.hasAudience(a.identity!.fingerprint)&&forest.hasAudience(b.identity!.fingerprint);
      if(signal.k==='offer'&&signal.meta?.kind==='camera'&&signal.meta.room==='village:game:tetris')return forestPair;
      if(forestPair&&['answer','ice'].includes(signal.k??''))return true;
      if (signal.k === 'offer') {
        if(signal.meta?.kind==='camera'&&signal.meta.room?.endsWith(':game:werewolves')&&!this.rooms.get(`${a.neighborhood}:werewolves`)?.cameraAllowed(a.identity!.fingerprint,b.identity!.fingerprint))return false;
        return signal.meta?.kind === 'camera' ? spatial : this.sameScene(a, b);
      }
      return this.sameScene(a, b) || (spatial && ['answer', 'ice'].includes(signal.k ?? ''));
    } catch { return false; }
  }
  private sameScene(a: Connection, b: Connection): boolean {
    if (this.voice.same(a.identity!.fingerprint, b.identity!.fingerprint)) return true;
    if (this.voice.selected(a.identity!.fingerprint) || this.voice.selected(b.identity!.fingerprint)) return false;
    return a.neighborhood === b.neighborhood && a.houseId === b.houseId && (a.houseId !== null ? sameSpace(a.position.space,b.position.space) : areaOf(a.position) === areaOf(b.position));
  }

  private async verifyHouse(c: Connection, document: SignedHouse, scope: string, epoch: number): Promise<void> {
    if (c.role === 'visitor') throw new Reject('unsaved');
    if (document.house.ownerId !== c.identity!.fingerprint) throw new Reject('forbidden');
    if (!await verify(c.identity!, 'house', { sessionId: scope, epoch, house: document.house }, document.signature)) throw new Reject('signature');
  }
  private writeHouse(owner: string, document: SignedHouse): void {
    const stored = this.store.house(owner);
    if (stored && document.house.revision <= stored.revision) throw new Reject('conflict');
    this.store.putHouse(owner, document.house.revision, document);
  }
  private async publishHouse(c: Connection, document: SignedHouse, scope: string, epoch: number): Promise<unknown> {
    await this.verifyHouse(c, document, scope, epoch);
    try { this.store.transaction(() => this.writeHouse(c.identity!.fingerprint, document)); }
    catch (error) { if (error instanceof Reject && error.code === 'conflict') return { conflict: true, revision: this.store.house(c.identity!.fingerprint)!.revision }; throw error; }
    const neighborhood=this.store.resident(c.identity!.fingerprint)?.neighborhood??c.neighborhood;
    // Guests who are no longer allowed by the new access rule leave the house.
    for (const guest of this.present(neighborhood)) if (guest !== c && guest.houseId === c.identity!.fingerprint && !this.canEnter(guest, guest.houseId)) { guest.houseId = null; guest.position={...guest.position,space:undefined}; guest.board = null; }
    this.broadcastWorkspaces();
    this.changed(neighborhood);
    return { revision: document.house.revision };
  }

  private async verifyCommit(c: Connection, raw: SignedBoardCommit, scope: string, epoch: number): Promise<SignedBoardCommit> {
    const document = boardCommitSchema.parse(raw);
    const me = c.identity!;
    // The owner of a house may edit anyone's layer on that house's boards; elsewhere only your own objects.
    const moderator = document.boardId.startsWith(`house:${me.fingerprint}:`);
    if (document.documents.some(d => d.stroke.author !== me.fingerprint && !moderator)) throw new Reject('forbidden');
    const { signature, ...unsigned } = document;
    if (!await verify(me, 'board-commit', { sessionId: scope, epoch, ...unsigned }, signature)) throw new Reject('signature');
    for (const d of document.documents) if (!await verify(me, 'board', { sessionId: scope, epoch, stroke: d.stroke }, d.signature)) throw new Reject('signature');
    return document;
  }
  /** Same rules as the P2P BoardStore: other authors are untouchable, tombstones never revive. */
  private writeCommit(neighborhood: number, document: SignedBoardCommit): SignedStroke[] {
    const key = this.boardKey(neighborhood, document.boardId);
    const changed: SignedStroke[] = [];
    for (const d of document.documents) {
      const previous = this.store.stroke(key, d.stroke.id)?.stroke;
      if (previous && previous.author !== d.stroke.author) throw new Reject('forbidden');
      if (previous && (previous.deleted || d.stroke.seq <= previous.seq)) continue;
      changed.push(d);
    }
    if (this.store.operations(key) + changed.length > LIMITS.boardOperations) throw new Reject('full');
    for (const d of changed) this.store.putStroke(key, d);
    return changed;
  }
  private async applyCommit(c: Connection, raw: SignedBoardCommit, scope: string, epoch: number): Promise<SignedStroke[]> {
    const document = await this.verifyCommit(c, raw, scope, epoch);
    const changed = this.store.transaction(() => this.writeCommit(c.neighborhood, document));
    if (changed.length) for (const other of this.present(c.neighborhood)) if (other !== c && other.board === document.boardId && this.canAccessBoard(other, document.boardId)) this.send(other, { t: 'board', ref: document.boardId, documents: changed, reset: false });
    return changed;
  }

  private relayApp(c: Connection, channel: 'werewolves' | 'tetris' | 'gartic' | 'projects' | 'study' | 'camera' | 'ai' | 'ink' | 'sprites', to: string | null, data: string): null {
    const me = c.identity!.fingerprint;
    if(channel==='camera'&&this.byFingerprint(me)!==c)throw new Reject('forbidden');
    if(channel==='ink'){if(to!==SERVER_AUTHORITY)throw new Reject('forbidden');void this.ink.receive(c.id,me,String(c.neighborhood),data);return null;}
    if(channel === 'ai') {
      if(to !== SERVER_AUTHORITY)throw new Reject('forbidden');
      void this.aiRequest(c, data); return null;
    }
    if (to === SERVER_AUTHORITY) {
      if (channel === 'camera'||channel==='sprites') throw new Reject('invalid');
      // A room of a house keeps its own copy of each activity, named by the wire's scope.
      let scope = '';
      try { const s = (JSON.parse(data) as { s?: unknown }).s; if (s !== undefined) scope = String(s); } catch { /* receive() ignores bad JSON */ }
      if (scope && !ACTIVITY_SCOPE.test(scope)) throw new Reject('invalid');
      if (scope) { const [, owner, floorId, roomId] = scope.split(':'); if (!this.workspace.canRead(me, owner, { floorId, roomId })) throw new Reject('forbidden'); }
      this.room(c.neighborhood, channel, scope).receive(me, data);
      return null;
    }
    let forestCamera=false;try{forestCamera=channel==='camera'&&JSON.parse(data).game==='tetris';}catch{}
    const targets = to ? this.personDevices(to) : (forestCamera?[...this.connections.values()].filter(o=>o.identity):this.present(c.neighborhood)).filter(o => o !== c);
    for (const target of targets) if (forestCamera||target.neighborhood === c.neighborhood) this.send(target, { t: 'app', channel, from: me, data });
    return null;
  }
  private async aiRequest(c:Connection, data:string):Promise<void> {
    let raw:unknown;try{raw=JSON.parse(data);}catch{return;}
    const parsed=aiWireSchema.safeParse(raw);if(!parsed.success)return;
    const request=parsed.data, person=c.identity!.fingerprint;
    if(request.t==='cancel'){this.options.ai?.cancel(person,request.id);return;}
    let reply:AiReply;
    try {
      const provider=this.options.ai;
      if(!provider)throw new AiError('ai-unavailable');
      const value=request.t==='status'?await provider.status():await provider.generate(person,request.id,request.input);
      reply={t:'result',id:request.id,value};
    }catch(error){reply={t:'error',id:request.id,code:error instanceof AiError?error.code:'ai-response'};}
    if(this.connections.get(c.id)===c)this.send(c,{t:'app',channel:'ai',from:SERVER_AUTHORITY,data:JSON.stringify(reply)});
  }
  private room(neighborhood: number, channel: 'werewolves' | 'tetris' | 'gartic' | 'projects' | 'study', scope = ''): ActivityRoom {
    const global=channel==='tetris'&&!scope;
    const key = `${global?'forest':neighborhood}:${channel}${scope ? `:${scope}` : ''}`;
    let room = this.rooms.get(key);
    if (!room) {
      const factory = this.options.engines[channel];
      if (!factory) throw new Reject('not-found');
      room = new ActivityRoom(channel, factory, (id, data) => { for(const target of this.personDevices(id)) if (global||target.neighborhood === neighborhood) this.send(target, { t: 'app', channel, from: SERVER_AUTHORITY, data: scope ? JSON.stringify({ ...JSON.parse(data), s: scope }) : data }); },
        id => global?!!this.byFingerprint(id):this.byFingerprint(id)?.neighborhood === neighborhood, this.now, this.store, neighborhood, () => { this.voice.endGame(global?'forest':String(neighborhood), channel); this.broadcastVoice(); }, scope, this.options.ai);
      this.rooms.set(key, room);
    }
    return room;
  }

  /** Coalesces state broadcasts per neighbourhood into one message per tick. */
  private changed(neighborhood: number): void {
    this.dirty.add(neighborhood);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => { this.flushScheduled = false; const list = [...this.dirty]; this.dirty.clear(); for (const n of list) this.broadcastState(n); });
  }
  private broadcastState(neighborhood: number): void {
    for(const [id,visit]of this.visits){const visitor=this.byFingerprint(visit.visitor),owner=this.byFingerprint(visit.owner),house=(this.store.house(visit.owner)?.document as SignedHouse|undefined)?.house;if(!visitor||!owner||visitor.neighborhood!==visit.neighborhood||owner.neighborhood!==visit.neighborhood||house?.access==='locked')this.visits.delete(id);}
    this.revision++;
    const people = this.present(neighborhood);
    const online = new Set(people.map(p => p.identity!.fingerprint));
    const residents: ResidentView[] = this.store.residents().filter(r => r.neighborhood === neighborhood).map(r => ({
      fingerprint: r.fingerprint, displayName: r.identity.displayName, color: r.identity.color, plot: r.plot, neighborhood: r.neighborhood,
      online: online.has(r.fingerprint), house: (this.store.house(r.fingerprint)?.document as SignedHouse | undefined) ?? null,
    }));
    const present: PresenceView[] = [...new Set(people.map(p=>p.identity!.fingerprint))].map(id=>this.byFingerprint(id)!).map(p => ({
      identity: p.identity!, endpoint: p.endpoint, role: p.role, plot: residents.find(r => r.fingerprint === p.identity!.fingerprint)?.plot ?? null,
      neighborhood, houseId: p.houseId, position: p.position, appearance: p.appearance, mediaToken: p.mediaToken, privateWith: p.privateWith,
    }));
    for (const person of people) {
      const me = person.identity!.fingerprint;
      const visits = [...this.visits.values()].filter(v => v.owner === me).map(v => ({ requestId: v.requestId, visitor: this.byFingerprint(v.visitor)!.identity!, houseId: me }));
      this.send(person, { t: 'state', revision: this.revision, neighborhood, neighborhoods: this.store.neighborhoods, scope: signingScope(this.store.worldId, neighborhood), epoch: this.store.epoch, role: person.role, maxOnline: this.store.maxOnline, online: this.online, residents, present, visits,pendingAccess:this.pendingAccess(me) });
    }
  }
}

/**
 * One shared activity in one neighbourhood, run here instead of in a browser.
 * Speaks SharedRoom's wire ({t:'hello'|'act'} in, {t:'view'|'error'} out) plus
 * organiser commands. The organiser is the first participant still present.
 */
class ActivityRoom {
  private engine: RoomEngine;
  private watchers: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private botsEnabled = false;
  private botBusy=false;
  private botTried=new Set<string>();
  constructor(private readonly channel: string, factory: EngineFactory, private readonly deliver: (id: string, data: string) => void,
    private readonly present: (id: string) => boolean, private readonly now: () => number, private readonly store: Store, private readonly neighborhood: number, private readonly onStop: () => void = () => {}, private readonly scope = '', private readonly ai?:AiProvider) {
    this.engine = factory(() => this.organizer());
    if(channel==='werewolves')this.engine.setController?.(store.admin()?.fingerprint??null);
    if (channel === 'projects') {
      const saved = store.meta(this.metaKey());
      if (saved) try { (this.engine as unknown as { projects: unknown }).projects = JSON.parse(saved); } catch { /* Start empty. */ }
    }
  }
  private metaKey(): string { return `projects:${this.neighborhood}${this.scope ? `:${this.scope}` : ''}`; }
  hasAudience(id:string):boolean{return this.engine.audience().includes(id);}
  cameraAllowed(from:string,to:string):boolean{return (this.engine.canBroadcastCamera?.(from)??true)&&(this.engine.canReceiveCamera?.(to,from)??true);}
  organizer(): string | null { return this.watchers.find(id => this.present(id)) ?? null; }
  private botOwner():string{return `bots:${this.neighborhood}:${this.channel}:${this.scope}`;}
  dispose(): void { this.ai?.cancel(this.botOwner()); if (this.timer) clearInterval(this.timer); this.timer = null; }

  receive(from: string, raw: string): void {
    let wire: { t?: string; a?: unknown; c?: string; d?: unknown };
    try { wire = JSON.parse(raw); } catch { return; }
    if (!this.watchers.includes(from)) this.watchers.push(from);
    const now = this.now();
    try {
      if (wire.t === 'hello') { this.sendView(from, now); this.ensureTimer(); return; }
      if (wire.t === 'act') { this.engine.apply(from, wire.a, now); this.afterChange(); this.publish(now); return; }
      if (wire.t === 'cmd') { void this.command(from, String(wire.c), wire.d, now).catch(error=>this.deliver(from,JSON.stringify({t:'error',m:error instanceof Error?error.message.slice(0,200):'No se pudo completar la acción. Vuelve a intentarlo.'}))); return; }
    } catch (error) { this.deliver(from, JSON.stringify({ t: 'error', m: error instanceof Error ? error.message.slice(0, 200) : 'Error' })); }
  }
  leave(id: string): void {
    const wasOrganizer = this.organizer() === id;
    this.watchers = this.watchers.filter(w => w !== id);
    if (wasOrganizer) {
      // AI belongs to the server and continues while other participants remain.
      this.publish(this.now());
    }
    if (!this.watchers.some(w => this.present(w))) this.dispose();
  }
  private async command(from:string,command:string,data:unknown,now:number):Promise<void> {
    if(from!==this.organizer())throw new Error('Solo quien organiza la actividad puede hacer eso.');
    if(command==='bots.jobs') {this.deliver(from,JSON.stringify({t:'jobs',jobs:[]}));return;}
    // Bot answers can only come from this server's own provider, never an organizer's computer.
    if(command==='bots.submit')throw new Error('No tienes permiso para hacer eso aquí.');
    if(command==='bots.enable') {
      if(this.channel!=='gartic'||!(await this.ai?.status())?.features.includes('gartic'))throw new Error('Los bots necesitan Ollama compatible.');
      if(from!==this.organizer())return;
      this.botsEnabled=true;
    }
    if(command==='bots.disable'||command==='stop'){this.botsEnabled=false;this.ai?.cancel(this.botOwner());}
    if(applyRoomCommand(this.engine,command,data,now)){if(command==='stop')this.onStop();this.afterChange();this.publish(now);}
  }
  private async pumpBots():Promise<void> {
    if(this.channel!=='gartic'||!this.botsEnabled||this.botBusy||!this.ai)return;
    const engine=this.engine as unknown as GarticGame,jobs=engine.botJobs(this.now());
    if(this.botTried.size>128)this.botTried=new Set([...this.botTried].filter(key=>jobs.some(j=>key===`${j.key}:${j.id}`)));
    const job=jobs.find(j=>!this.botTried.has(`${j.key}:${j.id}`));if(!job)return;
    const token=`${job.key}:${job.id}`;this.botTried.add(token);this.botBusy=true;
    const prompt=job.task.kind==='draw'?`Draw this phrase using JSON strokes on a 640x400 canvas: ${JSON.stringify(job.task.previous?.text||'')}. Return drawing.strokes with c (hex color), w (width), p (x,y pairs), at most 4000 points.`:job.task.kind==='guess'?'Describe the attached drawing. Return JSON text of at most 120 characters.':'Write an original short phrase for a drawing game. Return JSON text of at most 120 characters.';
    try {
      const answer=botResponse.parse(await this.ai.generate(this.botOwner(),token,{feature:'gartic',prompt,images:job.task.previous?.drawing?[botDrawingPng(job.task.previous.drawing)]:[]}));
      if(job.task.kind==='draw'&&!answer.drawing||job.task.kind!=='draw'&&!answer.text)return;
      if(answer.drawing&&answer.drawing.strokes.reduce((n,s)=>n+s.p.length/2,0)>4000)return;
      if(this.botsEnabled&&engine.submitBot(job.key,job.id,answer,this.now()))this.publish(this.now());
    }catch{/* The existing turn timer resolves failed AI. Never fabricate an answer. */}
    finally{this.botBusy=false;}
  }
  private afterChange(): void {
    if (this.channel === 'projects') try { this.store.transaction(() => this.store.setMeta(this.metaKey(), JSON.stringify((this.engine as unknown as { projects: unknown }).projects))); } catch { /* Kept in memory; next change retries. */ }
  }
  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { const now = this.now(); if (this.engine.tick(now)) this.publish(now); void this.pumpBots(); }, this.channel==='tetris'?50:400);
    this.timer.unref?.();
  }
  private sendView(id: string, now: number): void { this.deliver(id, JSON.stringify({ t: 'view', v: this.engine.viewFor(id, now), lead: id === this.organizer() })); }
  private lastTetrisPublish=0;
  private publish(now: number): void {
    if(this.channel==='tetris'&&(this.engine.viewFor('',now) as {phase:string}).phase==='playing'&&now-this.lastTetrisPublish<100)return;
    this.lastTetrisPublish=now;
    this.ensureTimer();
    const recipients = new Set([...this.engine.audience(), ...this.watchers]);
    for (const id of recipients) if (this.present(id)) this.sendView(id, now);
  }
}

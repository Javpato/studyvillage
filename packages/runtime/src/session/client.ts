import {LocalWorkspaces} from '../storage/workspaces';
import {LocalMailbox} from '../storage/mailbox';
import {PeerMailbox} from './mailbox';
import type {MailboxCommand,MailboxView} from '../../../core/src/house/mailbox';
import { hasHouseAccess, WorkspaceCoordinator, emptyWorkspace, sameSpace, spaceKey, parseScopedBoard, type WorkspaceCommand, type WorkspaceView } from '../../../core/src/house/workspaces';
import { t } from '../../../../app/src/i18n';
import { userError } from '../../../../app/src/errors/messages';
import { VoiceHub, emptyVoice, type VoiceCommand, type VoiceView } from '../media/voice';
import { appearanceSchema, normalizeAppearance, type AvatarAppearance } from '../../../core/src/assets/appearance';
import { GameCameraManager, cameraScene, type CameraPeer } from '../media/game-camera';
import { cameraMetadataSchema, cameraPresenceSchema } from '../../../core/src/protocol/schema';
import type { CameraActivity } from '../../../core/src/protocol/types';
import { AREA_NAMES, areaOf, isInScene } from '../../../../app/src/world/location';
import { canonical, randomId, sign, validatePublicIdentity, verify } from '../../../core/src/identity';
import { MediaManager, type MediaDevicesAdapter, type MediaPeer } from '../media/manager';
import { houseSchema, positionSchema, strokeSchema, type Hello, type Invite, type Payload, type SignedHouse, type SignedStroke, type SignedBoardCommit, type Transcript, type WireMessage } from '../../../core/src/protocol/schema';
import { LIMITS, type AccessRequest, type AppChannel, type GameCameraPolicy, type AppMessage, type BoardStroke, type LocalIdentity, type Member, type NetworkView, type Position, type PublicHouse, type PublicIdentity, type SessionPhase, type VillageActions, type VisitRequest } from '../../../core/src/protocol/types';
import { createInvite, encodeInvite, parseInvite } from '../signaling/invite';
import { createPeerEndpoint } from '../signaling/peerjs';
import { BoundedChannel } from '../transport/bounded-channel';
import { systemClock, type Clock, type DataChannel, type TransportEndpoint, type TransportFactory } from '../transport/types';
import { BoardStore } from './board';

/** The stages of opening or joining, in the order they run. */
type OpenStep = 'identity' | 'signaling' | 'session' | 'signing' | 'invite';

function describeOpenFailure(step: OpenStep, error: unknown): string {
  switch (step) {
    case 'identity':
      return `Tu identidad no se pudo verificar en este entorno. Falla la criptografía del navegador, no la red.`;
    case 'signaling':
      return `No se pudo abrir la señalización. Comprueba la red o vuelve a intentarlo; el servidor es gratuito y a veces rechaza conexiones.`;
    case 'signing':
      return `No se pudo firmar tu casa. Falla la criptografía del navegador, no la red.`;
    case 'invite':
      return `La señalización se abrió, pero no se pudo crear la invitación.`;
    default:
      return `La señalización se abrió, pero no se pudo preparar la sesión.`;
  }
}

function describeJoinFailure(step: OpenStep, error: unknown): string {
  switch (step) {
    case 'identity':
      return `Tu identidad no se pudo verificar en este entorno. Falla la criptografía del navegador, no la red.`;
    case 'signaling':
      return `No se pudo abrir la señalización. Comprueba la red y vuelve a intentarlo.`;
    default:
      return `No se pudo conectar con quien te invitó. Comprueba la invitación; algunas redes impiden WebRTC directo.`;
  }
}

export interface VillageClientOptions { transportFactory?: TransportFactory; clock?: Clock; mediaDevices?: MediaDevicesAdapter; appearance?: AvatarAppearance; mailboxLocalAlias?:boolean; mailboxPreviousOwner?:string }
type Intent = 'join' | 'resume' | 'mesh';
interface Link {
  raw: DataChannel; wire: BoundedChannel; initiator: boolean; intent?: Intent; expected?: PublicIdentity | string;
  hello?: Hello; transcript?: Transcript; identity?: PublicIdentity; step: 'hello' | 'challenge' | 'proof' | 'ok' | 'ready';
  authenticated: boolean; approved: boolean; closed: boolean; created: number; lastSeen: number; lastHeartbeat: number;
  sentSeq: number; receivedSeq: number; receiveToken: string; sendToken?: string; requestId?: string;
  syncRoom?: string; syncExpected?: number; syncExport?: { boardId: string; documents: SignedStroke[]; cursor: number };
  unsubscribe: (() => void)[];
}
interface PendingVisit extends VisitRequest { visitorId: string; created: number }
const initialPosition = (): Position => ({ areaId: 'residential', x: 384, y: 215, direction: 'down', moving: false });
const activePhases: SessionPhase[] = ['SIGNALING', 'CONNECTING', 'AUTHENTICATING', 'PENDING_APPROVAL', 'JOINED', 'RECONNECTING'];

/** Owner of a house board (`house:<owner>:<furniture>`), or null for area boards. */
export function boardOwner(boardId: string): string | null { return /^house:([a-f0-9]{64}):/.exec(boardId)?.[1] ?? null; }

export class VillageClient implements VillageActions {
  private ownHouse: PublicHouse;
  private ownAppearance: AvatarAppearance;
  private phase: SessionPhase = 'IDLE';
  private isHost = false;
  private sessionId: string | null = null;
  private epoch = 0;
  private hostId: string | null = null;
  private invite: Invite | null = null;
  private endpoint?: TransportEndpoint;
  private links = new Set<Link>();
  private members = new Map<string, Member>();
  private houses = new Map<string, SignedHouse>();
  private visits = new Map<string, PendingVisit>();
  private accessPending:AccessRequest|null=null;
  private accessAttempt:AccessRequest|null=null;
  private memberDeadlines = new Map<string, number>();
  private rosterRevision = 0;
  private hostDeadline: number | null = null;
  private lastReconnect = -Infinity;
  private error: string | null = null;
  private listeners = new Set<(view: NetworkView) => void>();
  private appListeners = new Set<(message: AppMessage) => void>();
  private media: MediaManager;
  private camera: GameCameraManager;
  private cameraActivity: CameraActivity | null = null;
  private cameraActivities = new Map<string, CameraActivity | null>();
  private board = new BoardStore();
  private selectedBoard: string | null = null;
  private boardCommits = new Map<string, SignedBoardCommit>();
  /** Who I want a private call with, and who every other member wants one with. */
  private workspaceState: WorkspaceView = emptyWorkspace();
  private workspace: WorkspaceCoordinator;
  private workspaceStorage: LocalWorkspaces;
  private mailbox:PeerMailbox;
  private offlinePosition: Position = {x:384,y:344,direction:'up',moving:false};
  private voiceHub = new VoiceHub();
  private voiceState: VoiceView = emptyVoice();
  private privateWith: string | null = null;
  private privateOf = new Map<string, string | null>();
  private boardRetries = new Map<string, SignedStroke>();
  private clock: Clock;
  private factory: TransportFactory;
  private tickTimer?: ReturnType<typeof setTimeout>;
  private moveTimer?: ReturnType<typeof setTimeout>;
  private pendingPosition?: Position;
  private lastPositionSent = -Infinity;
  private endpointUnsubscribe: (() => void)[] = [];
  private generation = 0;
  private disposed = false;
  private leaving = false;
  private leaveResolve?: () => void;
  private leaveRequest?: string;
  private localJobs: (() => Promise<void>)[] = [];
  private runningJob = false;

  constructor(private identity: LocalIdentity, ownHouse: PublicHouse, options: VillageClientOptions = {}) {
    this.ownAppearance = normalizeAppearance(options.appearance);
    this.camera = new GameCameraManager(() => this.notify(), options.mediaDevices);
    this.ownHouse = houseSchema.parse(ownHouse);
    if (ownHouse.ownerId !== identity.public.fingerprint) throw new Error('La casa debe pertenecer a la identidad local.');
    this.workspaceStorage = new LocalWorkspaces(this.id);
    this.mailbox=new PeerMailbox(this.identity.public,new LocalMailbox(options.mailboxLocalAlias?this.id:undefined,options.mailboxPreviousOwner),id=>id===this.id?this.identity.public:this.members.get(id)?.connected?this.members.get(id)!.identity:undefined,(to,data)=>this.sendApp('mailbox',to,data),()=>this.phase!=='JOINED'||this.members.get(this.id)?.endpoint===this.endpoint?.id);
    this.workspace = new WorkspaceCoordinator(id => this.members.get(id) ?? (id === this.id && this.phase !== 'JOINED' ? { identity:this.identity.public, connected:true, houseId:this.id, position:this.offlinePosition } : undefined),
      owner => this.houses.get(owner)?.house ?? (owner === this.id ? this.ownHouse : undefined), this.workspaceStorage,
      (id, space) => { const member=this.members.get(id); const position={...(member?.position??this.offlinePosition),x:384,y:344,moving:false,space:space??undefined}; if(member)member.position=position;else if(id===this.id)this.offlinePosition=position; });
    this.clock = options.clock ?? systemClock;
    this.factory = options.transportFactory ?? createPeerEndpoint;
    this.media = new MediaManager(() => this.notify(), options.mediaDevices, (id, kind) => { const link = this.mediaLink(id); if (link) this.send(link, { type: 'media.received', kind }); });
  }
  get view(): NetworkView {
    const room = this.selectedBoard ?? this.members.get(this.id)?.houseId ?? this.id;
    return {
      devices:this.members.get(this.id)?this.deviceEndpoints(this.members.get(this.id)!).map((id,i)=>({id,name:t('Dispositivo {n}',{n:i+1}),current:id===this.endpoint?.id,media:id===(this.members.get(this.id)?.mediaEndpoint??this.members.get(this.id)?.endpoint)})):[],
      phase: this.phase, isHost: this.isHost, hostId: this.hostId, sessionId: this.sessionId,
      invite: this.isHost && this.invite ? encodeInvite(this.invite) : null,
      members: structuredClone([...this.members.values()].sort((a, b) => a.slot - b.slot)),
      houses: structuredClone([...this.houses.values()].map(item => item.house)),
      pendingJoins: [...this.links].filter(link => link.authenticated && !link.approved && !!link.requestId && !link.closed).map(link => ({ requestId: link.requestId!, identity: structuredClone(link.identity!) })),
      pendingAccess:structuredClone(this.accessAttempt??(this.isHost?this.pendingAccess(this.id):this.accessPending)),
      pendingVisits: [...this.visits.values()].filter(request => request.houseId === this.id).map(({ requestId, identity, houseId }) => ({ requestId, identity: structuredClone(identity), houseId })),
      boardRef: room, strokes: structuredClone(this.board.documents(room).map(document => document.stroke)),
      hostGraceRemainingMs: this.hostDeadline === null ? null : Math.max(0, this.hostDeadline - this.clock.now()),
      error: this.error, media: this.media.view, gameCamera: this.camera.view,
      workspace: this.phase === 'JOINED' ? this.workspaceState : this.workspace.view(this.id),
      voice: this.voiceState,
      voiceDirectory: [...this.members.values()].filter(m => m.connected).map(m => m.identity),
      privateCall: this.privateCallView(),
    };
  }
  private get id(): string { return this.identity.public.fingerprint; }
  subscribe(listener: (view: NetworkView) => void): () => void { this.listeners.add(listener); listener(this.view); return () => this.listeners.delete(listener); }
  onApp(listener: (message: AppMessage) => void): () => void { this.appListeners.add(listener); return () => this.appListeners.delete(listener); }
  private deliverApp(message: AppMessage): void {
    if(message.channel==='mailbox'){this.mailbox.receive(message.from,message.data);return;}
    if(message.channel==='werewolves'&&message.from===this.hostId){try{const wire=JSON.parse(message.data);if(wire.t==='view'&&wire.v)this.camera.setPolicy({canSend:wire.v.canBroadcastCamera,canReceive:wire.v.canSeeCameras,audience:wire.v.cameraAudience,epoch:wire.v.cameraPhase});}catch{/* Ignore invalid authority policy. */}}

    if (message.channel === 'camera') {
      try {
        const presence = cameraPresenceSchema.parse(JSON.parse(message.data));
        if (!this.members.get(message.from)?.connected) return;
        this.cameraActivities.set(message.from, presence.game);
        this.syncCamera();
        if (presence.request) this.sendApp('camera', message.from, JSON.stringify({ game: this.cameraActivity, request: false }));
        this.notify();
      } catch { /* Invalid camera presence cannot affect other activities. */ }
      return;
    }
    for (const listener of this.appListeners) { try { listener(message); } catch { /* An activity must not disrupt the protocol. */ } }
  }
  /** Shared activities. The host routes; everyone else only ever talks to the host. */
  sendApp(channel: AppChannel, to: string | null, data: string): boolean {
    if (this.phase !== 'JOINED' || data.length < 2 || data.length > LIMITS.appData || (channel==='camera'&&!this.mediaActive())) return false;
    if(to===this.id&&this.hostId!==this.id&&(this.members.get(this.id)?.devices?.length??1)<2)return false;
    if (!this.isHost) return this.sendHost({ type: 'app.send', channel, to, data });
    if (to !== null) { const links=this.linksFor(to);return links.reduce((ok,link)=>this.send(link,{type:'app.relay',channel,from:this.id,data})||ok,false); }
    this.broadcast({ type: 'app.relay', channel, from: this.id, data });
    return true;
  }
  private notify(): void {
    if (this.disposed) return;
    const view = this.view;
    for (const listener of this.listeners) { try { listener(view); } catch { /* A view must not disrupt the protocol. */ } }
  }
  private setError(message: string): void { this.error = message; this.notify(); }
  private setPhase(phase: SessionPhase): void { this.phase = phase; this.notify(); }
  private queue(job: () => Promise<void>): void {
    if (this.disposed) return;
    if (this.localJobs.length >= LIMITS.queueMessages) { this.setError('Hay demasiados cambios pendientes. Espera antes de continuar.'); return; }
    this.localJobs.push(job); void this.runJobs();
  }
  private async runJobs(): Promise<void> {
    if (this.runningJob) return;
    this.runningJob = true;
    try { while (this.localJobs.length && !this.disposed) { const job = this.localJobs.shift()!; try { await job(); } catch { this.setError('No se pudo aplicar el cambio local.'); } } }
    finally { this.runningJob = false; }
  }
  async openVillage(): Promise<void> {
    if (this.disposed || activePhases.includes(this.phase)) { this.setError('Sal del vecindario actual antes de abrir otro.'); return; }
    this.reset(); const generation = this.generation;
    this.isHost = true; this.hostId = this.id; this.sessionId = randomId(); this.epoch = 1;
    this.setPhase('SIGNALING');
    // Each step is tagged so a failure names the step that actually broke.
    // A single catch here used to blame "la señalización o WebRTC" for any of
    // four unrelated failures, including WebCrypto, which made a working
    // network look like a dead one.
    let step: OpenStep = 'identity';
    try {
      await validatePublicIdentity(this.identity.public);
      if (generation !== this.generation || this.disposed) return;
      step = 'signaling';
      const endpoint = await this.factory();
      if (generation !== this.generation || this.disposed) { endpoint.destroy(); return; }
      step = 'session';
      this.attachEndpoint(endpoint);
      this.members.set(this.id, { identity: structuredClone(this.identity.public), endpoint: endpoint.id, devices:[endpoint.id], mediaEndpoint:endpoint.id, slot: 0, connected: true, houseId: null, position: initialPosition(), appearance: this.ownAppearance });
      step = 'signing';
      const ownDocument = await this.signHouse(this.ownHouse);
      if (generation !== this.generation) return;
      step = 'invite';
      this.houses.set(this.id, ownDocument);
      this.invite = createInvite(this.id, endpoint.id, this.sessionId!, this.epoch, 1, this.clock.wallNow());
      this.rosterRevision = 1; this.setPhase('JOINED'); this.startTick();
    } catch (error) {
      if (generation === this.generation) this.finish('NETWORK_FAILED', describeOpenFailure(step, error));
    }
  }
  async joinVillage(encodedInvite: string): Promise<void> {
    if (this.disposed || activePhases.includes(this.phase)) { this.setError('Sal del vecindario actual antes de unirte a otro.'); return; }
    this.reset(); const generation = this.generation;
    try { this.invite = parseInvite(encodedInvite, this.clock.wallNow()); }
    catch (error) { this.setPhase(error instanceof Error && error.message === 'EXPIRED_INVITE' ? 'EXPIRED_INVITE' : 'NETWORK_FAILED'); this.setError('La invitación no es válida o ha caducado.'); return; }
    this.hostId = this.invite.hostFingerprint; this.sessionId = this.invite.sessionId; this.epoch = this.invite.epoch;
    this.setPhase('SIGNALING');
    let step: OpenStep = 'identity';
    try {
      await validatePublicIdentity(this.identity.public);
      if (generation !== this.generation || this.disposed) return;
      step = 'signaling';
      const endpoint = await this.factory();
      if (generation !== this.generation || this.disposed) { endpoint.destroy(); return; }
      step = 'session';
      this.attachEndpoint(endpoint); this.setPhase('CONNECTING'); this.startTick();
      this.connect(this.invite.endpoint, 'join', this.hostId);
    } catch (error) {
      if (generation === this.generation) this.finish('NETWORK_FAILED', describeJoinFailure(step, error));
    }
  }
  private attachEndpoint(endpoint: TransportEndpoint): void {
    this.endpoint = endpoint; this.media.attach(endpoint); this.camera.attach(endpoint);
    this.endpointUnsubscribe.push(endpoint.onConnection(raw => this.attach(raw, false)), endpoint.onCall(call => { if (cameraMetadataSchema.safeParse(call.metadata).success) this.camera.receive(call); else this.media.receive(call); }), endpoint.onSignalingChange(connected => {
      if (!connected && this.phase === 'JOINED') this.setError('Se perdió la señalización; las conexiones P2P existentes siguen activas.');
    }));
  }
  private connect(endpoint: string, intent: Intent, expected: PublicIdentity | string): void {
    if (!this.endpoint || [...this.links].some(link => !link.closed && link.raw.endpoint === endpoint)) return;
    try { this.attach(this.endpoint.connect(endpoint), true, intent, expected); }
    catch { this.setError('No se pudo establecer una conexión directa.'); }
  }
  private attach(raw: DataChannel, initiator: boolean, intent?: Intent, expected?: PublicIdentity | string): void {
    if (!this.endpoint || !this.sessionId || this.links.size >= 24 || this.leaving) { raw.close(); return; }
    const now = this.clock.now();
    const link: Link = { raw, wire: undefined as unknown as BoundedChannel, initiator, intent, expected, step: initiator ? 'challenge' : 'hello', authenticated: false, approved: false, closed: false, created: now, lastSeen: now, lastHeartbeat: now, sentSeq: 0, receivedSeq: 0, receiveToken: randomId(32), unsubscribe: [] };
    link.wire = new BoundedChannel(raw, message => this.receive(link, message), reason => this.setError(reason), this.clock);
    this.links.add(link);
    link.unsubscribe.push(raw.onClose(() => this.linkClosed(link)));
    if (initiator) {
      const start = () => {
        if (link.closed || link.hello || !this.endpoint || !this.sessionId) return;
        link.hello = {
          v: 1, kind: 'auth.hello', sessionId: this.sessionId, epoch: this.epoch, intent: intent!,
          identity: structuredClone(this.identity.public), from: this.endpoint.id, to: raw.endpoint, nonce: randomId(32),
          generation: intent === 'join' ? this.invite!.generation : 0, secret: intent === 'join' ? this.invite!.secret : '',
        };
        link.wire.send(link.hello);
        if (intent === 'join') this.setPhase('AUTHENTICATING');
      };
      link.unsubscribe.push(raw.onOpen(start)); if (raw.open) start();
    }
  }
  private active(link: Link): boolean { return !link.closed && this.links.has(link) && !!this.endpoint && !this.disposed; }
  private async receive(link: Link, message: WireMessage): Promise<void> {
    if (!this.active(link)) return;
    link.lastSeen = this.clock.now();
    if (message.kind === 'auth.hello') {
      if (link.step !== 'hello' || !this.endpoint || message.sessionId !== this.sessionId || message.epoch !== this.epoch || message.from !== link.raw.endpoint || message.to !== this.endpoint.id) throw new Error('Unexpected hello');
      if ([...this.links].some(other => other !== link && !other.closed && other.raw.endpoint === message.from)) throw new Error('Duplicate identity');
      if (message.intent === 'join') {
        if (!this.isHost || this.phase !== 'JOINED' || !this.invite || this.invite.expiresAt <= this.clock.wallNow() || message.generation !== this.invite.generation || message.secret !== this.invite.secret || (this.members.get(message.identity.fingerprint)?.devices?.length ?? 0) >= 3 || [...this.links].filter(item => !item.approved).length > 12) throw new Error('Invalid invitation');
      } else {
        const member = this.members.get(message.identity.fingerprint);
        if (!member || (message.intent === 'mesh' && !this.deviceEndpoints(member).includes(message.from)) || member.identity.publicKey !== message.identity.publicKey || message.secret !== '' || message.generation !== 0) throw new Error('Not in roster');
        if (message.intent === 'resume' && (!this.isHost || (!this.deviceEndpoints(member).includes(message.from) && this.deviceEndpoints(member).length >= 3))) throw new Error('Invalid resume');
        if (message.intent === 'mesh' && (!member.connected || this.phase !== 'JOINED')) throw new Error('Invalid mesh');
      }
      link.identity = await validatePublicIdentity(message.identity);
      if (!this.active(link)) return;
      link.intent = message.intent; link.hello = message;
      link.transcript = { v: 1, sessionId: message.sessionId, epoch: message.epoch, intent: message.intent, initiator: message.identity.fingerprint, responder: this.id, from: message.from, to: message.to, initiatorNonce: message.nonce, responderNonce: randomId(32), generation: message.generation, secret: message.secret };
      link.step = 'proof';
      const signature = await sign(this.identity, 'auth-responder', link.transcript);
      if (this.active(link)) link.wire.send({ v: 1, kind: 'auth.challenge', identity: structuredClone(this.identity.public), transcript: link.transcript, signature });
      return;
    }
    if (message.kind === 'auth.challenge') {
      if (link.step !== 'challenge' || !link.hello) throw new Error('Unexpected challenge');
      const identity = await validatePublicIdentity(message.identity);
      const expected = typeof link.expected === 'string' ? link.expected : link.expected?.fingerprint;
      if (identity.fingerprint !== expected || (typeof link.expected !== 'string' && identity.publicKey !== link.expected?.publicKey)) throw new Error('Wrong identity');
      const expectedTranscript: Transcript = { v: 1, sessionId: link.hello.sessionId, epoch: link.hello.epoch, intent: link.hello.intent, initiator: this.id, responder: identity.fingerprint, from: link.hello.from, to: link.hello.to, initiatorNonce: link.hello.nonce, responderNonce: message.transcript.responderNonce, generation: link.hello.generation, secret: link.hello.secret };
      if (canonical(message.transcript) !== canonical(expectedTranscript) || !await verify(identity, 'auth-responder', message.transcript, message.signature)) throw new Error('Invalid challenge signature');
      if (!this.active(link)) return;
      link.identity = identity; link.transcript = message.transcript; link.step = 'ok';
      const signature = await sign(this.identity, 'auth-initiator', link.transcript);
      if (this.active(link)) link.wire.send({ v: 1, kind: 'auth.proof', signature });
      return;
    }
    if (message.kind === 'auth.proof') {
      if (link.step !== 'proof' || !link.identity || !link.transcript || !await verify(link.identity, 'auth-initiator', link.transcript, message.signature)) throw new Error('Invalid proof');
      const signature = await sign(this.identity, 'auth-accepted', link.transcript);
      if (!this.active(link)) return;
      link.wire.send({ v: 1, kind: 'auth.ok', signature }); this.authenticated(link); return;
    }
    if (message.kind === 'auth.ok') {
      if (link.step !== 'ok' || !link.identity || !link.transcript || !await verify(link.identity, 'auth-accepted', link.transcript, message.signature)) throw new Error('Invalid acknowledgement');
      if (this.active(link)) this.authenticated(link); return;
    }
    if (!link.authenticated || !link.identity || message.sender !== link.identity.fingerprint || message.sessionId !== this.sessionId || message.epoch !== this.epoch || message.seq <= link.receivedSeq) throw new Error('Unauthenticated or replayed event');
    link.receivedSeq = message.seq;
    const payload = message.payload;
    if (payload.type === 'session.heartbeat') { if (!payload.reply) this.send(link, { type: 'session.heartbeat', reply: true }); return; }
    if (payload.type === 'join.decision') {
      if (this.isHost || link.identity.fingerprint !== this.hostId || link.intent !== 'join' || this.phase !== 'PENDING_APPROVAL') throw new Error('Wrong admission role');
      if (!payload.accepted) this.finish('DENIED', 'El anfitrión no aceptó la solicitud.');
      else link.approved = true;
      return;
    }
    if (!link.approved) throw new Error('Approval required');
    await this.handle(link, payload);
  }
  private authenticated(link: Link): void {
    link.authenticated = true; link.step = 'ready'; link.lastSeen = this.clock.now();
    if (link.intent === 'join') {
      if (this.isHost) {
        if (!this.validJoin(link)) { this.send(link, { type: 'join.decision', accepted: false }); this.clock.setTimeout(() => this.closeLink(link, false), 100); return; }
        link.requestId = randomId(); this.notify();
      }
      else this.setPhase('PENDING_APPROVAL');
      return;
    }
    link.approved = true;
    if (link.intent === 'resume' && this.isHost) {
      const member = this.members.get(link.identity!.fingerprint)!;
      member.devices=[...new Set([...this.deviceEndpoints(member),link.raw.endpoint])]; member.connected = true; this.memberDeadlines.delete(member.identity.fingerprint); this.rosterChanged();
    }
    this.announceMedia(link); this.syncMedia();
  }
  private send(link: Link, payload: Payload, coalesce?: string): boolean {
    if (!this.active(link) || !link.authenticated || !this.sessionId) return false;
    return link.wire.send({ v: 1, kind: 'event', sessionId: this.sessionId, epoch: this.epoch, sender: this.id, seq: ++link.sentSeq, payload }, coalesce);
  }
  private validJoin(link: Link): boolean {
    return this.isHost && this.phase === 'JOINED' && !!this.invite && this.invite.expiresAt > this.clock.wallNow() && link.hello?.generation === this.invite.generation && link.hello.secret === this.invite.secret;
  }
  private linkFor(identityId: string): Link | undefined { return [...this.links].find(link => !link.closed && link.authenticated && link.approved && link.identity?.fingerprint === identityId); }
  private deviceEndpoints(member:Member):string[]{return member.devices??[member.endpoint];}
  private linksFor(id:string):Link[]{return [...this.links].filter(link=>!link.closed&&link.authenticated&&link.approved&&link.identity?.fingerprint===id);}
  private mediaLink(id:string):Link|undefined{const m=this.members.get(id);return this.linksFor(id).find(l=>l.raw.endpoint===(m?.mediaEndpoint??m?.endpoint));}
  private mediaActive():boolean{const m=this.members.get(this.id);return this.phase!=='JOINED'||(m?.mediaEndpoint??m?.endpoint)===this.endpoint?.id;}
  private hostLink(): Link | undefined { return [...this.links].find(link=>!link.closed&&link.authenticated&&link.approved&&link.raw.endpoint===this.invite?.endpoint&&link.identity?.fingerprint===this.hostId); }
  selectMediaDevice(endpoint:string):void{if(this.phase!=='JOINED')return;if(this.isHost)this.chooseMedia(this.id,endpoint);else this.sendHost({type:'device.media',endpoint});}
  private chooseMedia(person:string,endpoint:string):void{const member=this.members.get(person);if(!member||!this.deviceEndpoints(member).includes(endpoint))return;if(endpoint!==this.endpoint?.id&&!this.linksFor(person).some(l=>l.raw.endpoint===endpoint))return;member.mediaEndpoint=endpoint;this.rosterChanged();}
  private requireMedia():void{if(!this.mediaActive())throw userError(t('Selecciona este dispositivo para voz y cámara en Ajustes → Servidores.'));}
  private sendHost(payload: Payload, coalesce?: string): boolean { const link = this.hostLink(); return !!link && this.send(link, payload, coalesce); }
  private broadcast(payload: Payload, coalesce?: string): void { for (const link of this.links) if (link.approved) this.send(link, payload, coalesce); }
  decideJoin(requestId: string, accept: boolean): void {
    if (!this.isHost || this.phase !== 'JOINED') return;
    const link = [...this.links].find(item => item.requestId === requestId && item.authenticated && !item.approved && !item.closed);
    if (!link?.identity) return;
    const existing=this.members.get(link.identity.fingerprint);
    if (!accept || !this.validJoin(link) || (!existing&&this.members.size >= LIMITS.members) || (existing&&this.deviceEndpoints(existing).length>=3)) {
      this.send(link, { type: 'join.decision', accepted: false });
      link.requestId = undefined; this.clock.setTimeout(() => this.closeLink(link, false), 100); this.notify(); return;
    }
    if(existing){link.approved=true;link.requestId=undefined;existing.devices=[...this.deviceEndpoints(existing),link.raw.endpoint];existing.connected=true;this.memberDeadlines.delete(existing.identity.fingerprint);this.send(link,{type:'join.decision',accepted:true});this.announceMedia(link);this.rosterChanged();return;}
    const used = new Set([...this.members.values()].map(member => member.slot));
    let slot = 1; while (used.has(slot)) slot++;
    if (slot >= LIMITS.members) return;
    link.approved = true; link.requestId = undefined;
    this.members.set(link.identity.fingerprint, { identity: structuredClone(link.identity), endpoint: link.raw.endpoint, devices:[link.raw.endpoint], mediaEndpoint:link.raw.endpoint, slot, connected: true, houseId: null, position: initialPosition() });
    this.send(link, { type: 'join.decision', accepted: true });
    this.announceMedia(link); this.rosterChanged();
  }
  rotateInvite(): void {
    if (!this.isHost || this.phase !== 'JOINED' || !this.endpoint || !this.sessionId || !this.invite) return;
    this.invite = createInvite(this.id, this.endpoint.id, this.sessionId, this.epoch, this.invite.generation + 1, this.clock.wallNow());
    for (const link of this.links) if (!link.approved && link.intent === 'join') { link.requestId = undefined; if (link.authenticated) this.send(link, { type: 'join.decision', accepted: false }); this.clock.setTimeout(() => this.closeLink(link, false), 100); }
    this.notify();
  }
  private snapshot(): Extract<Payload, { type: 'session.snapshot' }> { return { type: 'session.snapshot', revision: this.rosterRevision, members: structuredClone([...this.members.values()]), houses: structuredClone([...this.houses.values()]) }; }
  private rosterChanged(): void { this.publishVoice(); this.publishWorkspaces(); this.rosterRevision++; this.broadcast(this.snapshot());this.publishAccessStates(); this.reconcileMesh(); this.syncMedia(); this.notify(); }
  private async signHouse(house: PublicHouse): Promise<SignedHouse> { return { house: structuredClone(house), signature: await sign(this.identity, 'house', { sessionId: this.sessionId, epoch: this.epoch, house }) }; }
  private async verifyHouse(document: SignedHouse, identity: PublicIdentity): Promise<boolean> { return document.house.ownerId === identity.fingerprint && await verify(identity, 'house', { sessionId: this.sessionId, epoch: this.epoch, house: document.house }, document.signature); }

  private async handle(link: Link, payload: Payload): Promise<void> {
    const sender = link.identity!.fingerprint;
    const fromHost = !this.isHost && link===this.hostLink();
    if(payload.type==='access.cancel'){
      if(!this.isHost)throw new Error('Coordinator only');
      this.cancelAccess(sender,payload.requestId);this.publishWorkspaces();this.publishAccessStates(sender,payload.requestId);this.notify();return;
    }
    if(payload.type==='access.state'){
      if(!fromHost)throw new Error('Coordinator only');
      this.accessPending=payload.pending;
      if(payload.replyTo===this.accessAttempt?.requestId)this.accessAttempt=null;
      this.visits.clear();for(const visit of payload.visits)this.visits.set(visit.requestId,{...visit,visitorId:visit.identity.fingerprint,created:this.clock.now()});
      this.notify();return;
    }
    if(payload.type==='device.media'){if(!this.isHost)throw new Error('Coordinator only');this.chooseMedia(sender,payload.endpoint);return;}
    if (payload.type === 'workspace.command') {
      if (!this.isHost) throw new Error('Only coordinator accepts workspace commands');
      this.applyWorkspace(sender, payload.command); return;
    }
    if (payload.type === 'workspace.state') {
      if (!fromHost || this.isHost) throw new Error('Only coordinator publishes workspaces');
      this.workspaceState=payload.workspace;
      const self=this.members.get(this.id);if(self&&!sameSpace(self.position.space,payload.workspace.space))self.position={...self.position,x:384,y:344,space:payload.workspace.space??undefined};
      const owner=this.members.get(this.id)?.houseId;
      if(owner===this.id&&payload.workspace.space&&payload.workspace.document)this.workspaceStorage.put(owner,payload.workspace.space,payload.workspace.document);
      this.syncMedia();this.notify();return;
    }
    if (payload.type === 'voice.command') {
      if (!this.isHost) throw new Error('Only coordinator accepts voice commands');
      this.applyVoice(sender, payload.command); return;
    }
    if (payload.type === 'voice.error') { if (fromHost) this.setError(t(payload.message)); return; }
    if (payload.type === 'voice.state') {
      if (!fromHost || this.isHost) throw new Error('Only coordinator publishes voice membership');
      this.voiceState = payload.voice; this.syncMedia(); this.notify(); return;
    }
    if (payload.type === 'session.snapshot') {
      if (this.isHost || !fromHost) throw new Error('Only coordinator publishes roster');
      if (payload.revision <= this.rosterRevision) return;
      const ids = new Set(payload.members.map(member => member.identity.fingerprint));
      if (ids.size !== payload.members.length || new Set(payload.members.map(member => member.slot)).size !== ids.size || new Set(payload.members.map(member => member.endpoint)).size !== ids.size || !ids.has(this.id)) throw new Error('Invalid roster');
      const host = payload.members.find(member => member.slot === 0);
      if (!host || host.identity.fingerprint !== this.hostId || host.endpoint !== link.raw.endpoint || !host.connected) throw new Error('Wrong coordinator');
      const self = payload.members.find(member => member.identity.fingerprint === this.id)!;
      if (!this.endpoint || !this.deviceEndpoints(self).includes(this.endpoint.id) || !self.connected) throw new Error('Wrong local endpoint');
      const endpoints=payload.members.flatMap(m=>this.deviceEndpoints(m));if(new Set(endpoints).size!==endpoints.length||payload.members.some(m=>!this.deviceEndpoints(m).includes(m.endpoint)||(m.mediaEndpoint&&!this.deviceEndpoints(m).includes(m.mediaEndpoint))))throw new Error('Invalid device roster');
      for (const member of payload.members) { await validatePublicIdentity(member.identity); if (member.houseId && !ids.has(member.houseId)) throw new Error('Unknown room'); }
      const houseOwners = new Set<string>();
      for (const document of payload.houses) {
        const owner = payload.members.find(member => member.identity.fingerprint === document.house.ownerId);
        if (!owner || houseOwners.has(document.house.ownerId) || !await this.verifyHouse(document, owner.identity)) throw new Error('Invalid house signature');
        const previous = this.houses.get(owner.identity.fingerprint);
        if (previous && (document.house.revision < previous.house.revision || (document.house.revision === previous.house.revision && canonical(document.house) !== canonical(previous.house)))) throw new Error('Layout rollback');
        houseOwners.add(document.house.ownerId);
      }
      if (!this.active(link)) return;
      const oldIds = [...this.members.keys()];
      this.members = new Map(payload.members.map(member => [member.identity.fingerprint, structuredClone(member)]));
      this.houses = new Map(payload.houses.map(document => [document.house.ownerId, structuredClone(document)]));
      for (const id of oldIds) if (!ids.has(id)) this.removeLocalMember(id);
      this.rosterRevision = payload.revision; this.hostDeadline = null; this.error = null;
      const firstJoin = this.phase !== 'JOINED'; this.phase = 'JOINED';
      if (firstJoin && !this.houses.has(this.id)) this.publishHouseDocument();
      if (firstJoin && self.endpoint===this.endpoint?.id && JSON.stringify(self.appearance) !== JSON.stringify(this.ownAppearance)) this.sendHost({ type: 'avatar.update', appearance: this.ownAppearance });
      if (firstJoin) this.announceMedia(link);
      this.reconcileMesh(); this.syncMedia(); this.notify(); return;
    }
    if (payload.type === 'avatar.update') {
      if (!this.isHost) throw new Error('Only the coordinator updates appearances');
      const member = this.members.get(sender);
      if (member?.connected && JSON.stringify(member.appearance) !== JSON.stringify(payload.appearance)) {
        member.appearance = payload.appearance; this.rosterChanged();
      }
      return;
    }
    if (payload.type === 'media.token') { link.sendToken = payload.token; this.syncMedia(); return; }
    if (payload.type === 'media.received') {
      // The manager only confirms when it really has an outgoing call to this
      // sender, so any authenticated member may report receipt, in any room.
      if (this.members.has(sender)) this.media.confirmReceiving(sender, payload.kind);
      return;
    }
    if (payload.type === 'media.private') {
      if (payload.with === sender) throw new Error('Self private call');
      this.privateOf.set(sender, payload.with);
      this.syncMedia(); this.notify(); return;
    }
    if (payload.type === 'session.closed') { if (!fromHost || this.isHost) throw new Error('Only coordinator closes'); this.finish('CLOSED', 'El anfitrión cerró el vecindario.'); return; }
    if (payload.type === 'session.kick') { if (!fromHost || this.isHost || payload.identityId !== this.id) throw new Error('Only coordinator kicks'); this.finish('KICKED', 'El anfitrión te retiró del vecindario.'); return; }
    if (payload.type === 'session.leaveAck') { if (!fromHost || payload.requestId !== this.leaveRequest) throw new Error('Unexpected leave ACK'); this.leaveResolve?.(); return; }
    if (payload.type === 'session.leave') {
      if (!this.isHost) throw new Error('Leave must go to coordinator');
      this.send(link, { type: 'session.leaveAck', requestId: payload.requestId }); link.approved = false; this.detachDevice(sender,link.raw.endpoint,false);
      this.clock.setTimeout(() => this.closeLink(link, false), 100); return;
    }
    if (this.leaving) return;
    if (payload.type === 'house.publish') {
      if (!this.isHost || payload.document.house.ownerId !== sender || !await this.verifyHouse(payload.document, link.identity!)) throw new Error('Owner-only house publication');
      if (!this.active(link)) return;
      const previous = this.houses.get(sender);
      if (previous && payload.document.house.revision <= previous.house.revision) return;
      this.houses.set(sender, structuredClone(payload.document));
      if (payload.document.house.access === 'locked') for (const member of this.members.values()) if (member.houseId === sender && member.identity.fingerprint !== sender && !hasHouseAccess(payload.document.house,member.identity.fingerprint)) {member.houseId = null;member.position={...member.position,space:undefined};}
      this.rosterChanged(); return;
    }
    if (payload.type === 'house.visit') { if (!this.isHost) throw new Error('Only coordinator routes visits'); this.requestVisit(sender, payload.ownerId, payload.requestId); return; }
    if (payload.type === 'house.visit.request') {
      if (!fromHost || payload.ownerId !== this.id) throw new Error('Invalid visit route');
      const visitor = this.members.get(payload.visitorId);
      if (!visitor?.connected || this.visits.size >= 12) return;
      this.visits.set(payload.requestId, { requestId: payload.requestId, visitorId: payload.visitorId, identity: visitor.identity, houseId: this.id, created: this.clock.now() }); this.notify(); return;
    }
    if (payload.type === 'house.visit.decision') { if (!this.isHost) throw new Error('Wrong visit role'); this.resolveVisit(payload.requestId, sender, payload.accepted); return; }
    if (payload.type === 'house.visit.result') { if (!fromHost) throw new Error('Wrong visit result role'); if (!payload.accepted) this.setError('La casa está cerrada, desconectada o no aceptó la visita.'); return; }
    if (payload.type === 'house.leave') { if (!this.isHost) throw new Error('Wrong leave route'); this.cancelVisits(sender); const member = this.members.get(sender); if (member) { member.houseId = null; member.position={...member.position,space:undefined}; this.rosterChanged(); } return; }
    if (payload.type === 'house.kick') { if (!this.isHost) throw new Error('Wrong owner kick route'); this.removeVisitor(sender, payload.identityId); return; }
    if (payload.type === 'player.position') {
      if (!this.isHost) throw new Error('Wrong position route'); const member = this.members.get(sender);
      if (member) {
        const changedArea = areaOf(member.position) !== areaOf(payload.position);
        if (!sameSpace(member.position.space, payload.position.space)) return;
        member.position = payload.position;
        this.broadcast({ type: 'player.relay', identityId: sender, position: payload.position }, `position/${sender}`);
        if (changedArea) this.rosterChanged(); else this.notify();
      } return;
    }
    if (payload.type === 'player.relay') { if (!fromHost || this.isHost) throw new Error('Wrong position relay'); const member = this.members.get(payload.identityId); if (member) { const changedArea = areaOf(member.position) !== areaOf(payload.position); member.position = payload.position; if (changedArea) this.syncMedia(); this.notify(); } return; }
    if (payload.type === 'board.commit') { await this.receiveBoardCommit(link, payload.document); return; }
    if (payload.type === 'board.stroke') { await this.receiveStroke(link, payload.document, false); return; }
    if (payload.type === 'board.sync.request') {
      if (!this.sameRoom(sender, payload.boardId)) throw new Error('Board outside authorized house');
      if (payload.cursor === 0) link.syncExport = { boardId: payload.boardId, documents: this.board.documents(payload.boardId), cursor: 0 };
      const sync = link.syncExport;
      if (!sync || sync.boardId !== payload.boardId || sync.cursor !== payload.cursor) throw new Error('Invalid board sync cursor');
      let document = sync.documents[payload.cursor] ?? null;
      // Offline own drafts are rebound to this session before sharing; old-session signatures never go on the wire.
      if (document && (document.stroke.author === this.id || boardOwner(document.stroke.boardId) === this.id)) document = { stroke: document.stroke, signature: await sign(this.identity, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke: document.stroke }) };
      if (!this.active(link) || !this.sameRoom(sender, payload.boardId)) return;
      const next = payload.cursor + 1 < sync.documents.length ? payload.cursor + 1 : null;
      this.send(link, { type: 'board.sync.response', boardId: payload.boardId, document, next });
      if (next === null) link.syncExport = undefined; else sync.cursor = next;
      return;
    }
    if (payload.type === 'board.sync.response') {
      if (!this.sameRoom(sender, payload.boardId) || link.syncRoom !== payload.boardId || link.syncExpected === undefined || (payload.next !== null && payload.next !== link.syncExpected + 1)) throw new Error('Unsolicited board sync');
      if (payload.document) { if (payload.document.stroke.boardId !== payload.boardId) throw new Error('Wrong board'); await this.receiveStroke(link, payload.document, true); }
      if (!this.active(link)) return;
      if (payload.next !== null) { link.syncExpected = payload.next; this.send(link, { type: 'board.sync.request', boardId: payload.boardId, cursor: payload.next }); } else link.syncExpected = undefined;
      return;
    }
    if (payload.type === 'app.send') {
      if (!this.isHost) throw new Error('Only the coordinator routes activities');
      if(payload.channel==='camera'&&link.raw.endpoint!==(this.members.get(sender)?.mediaEndpoint??this.members.get(sender)?.endpoint))return;
      const relay: Payload = { type: 'app.relay', channel: payload.channel, from: sender, data: payload.data };
      if (payload.to === null) {
        for (const other of this.links) if (other !== link && other.approved) this.send(other, relay);
        this.deliverApp({ channel: payload.channel, from: sender, data: payload.data });
      } else if (payload.to === this.id) this.deliverApp({ channel: payload.channel, from: sender, data: payload.data });
      else { for(const target of this.linksFor(payload.to))if(target!==link)this.send(target,relay); }
      return;
    }
    if (payload.type === 'app.relay') {
      if (!fromHost || this.isHost || (payload.from !== sender && !this.members.get(payload.from)?.connected)) throw new Error('Wrong activity relay');
      this.deliverApp({ channel: payload.channel, from: payload.from, data: payload.data }); return;
    }
    throw new Error('Unsupported event');
  }

  publishHouse(house: PublicHouse): void {
    const parsed = houseSchema.safeParse(house);
    if (!parsed.success || house.ownerId !== this.id || house.revision < this.ownHouse.revision || (house.revision === this.ownHouse.revision && canonical(house) !== canonical(this.ownHouse))) { this.setError('Solo puedes publicar tu casa con una revisión nueva y campos públicos válidos.'); return; }
    this.ownHouse = parsed.data;
    if(this.phase!=='JOINED')this.workspace.reconcile([this.id]);
    if (this.phase === 'JOINED') this.publishHouseDocument();
    this.notify();
  }
  private publishHouseDocument(): void {
    const generation = this.generation; const house = structuredClone(this.ownHouse);
    this.queue(async () => {
      const document = await this.signHouse(house);
      if (generation !== this.generation || this.phase !== 'JOINED') return;
      if (this.isHost) {
        this.houses.set(this.id, document);
        if (house.access === 'locked') for (const member of this.members.values()) if (member.houseId === this.id && member.identity.fingerprint !== this.id && !hasHouseAccess(house,member.identity.fingerprint)) {member.houseId = null;member.position={...member.position,space:undefined};}
        this.rosterChanged();
      } else this.sendHost({ type: 'house.publish', document });
    });
  }
  visitHouse(ownerId: string): void {
    if (this.phase !== 'JOINED') { this.setError('Abre o únete a un vecindario para visitar una casa.'); return; }
    if(this.view.pendingAccess)return;
    this.error=null;
    if (!this.voiceState.selected) this.media.suspend();
    if (this.cameraActivity !== 'village') this.camera.suspend();
    const requestId = randomId();this.accessAttempt={requestId,ownerId,kind:'house'};this.notify();
    if (this.isHost) this.requestVisit(this.id, ownerId, requestId); else this.sendHost({ type: 'house.visit', requestId, ownerId });
  }
  private requestVisit(visitorId: string, ownerId: string, requestId: string): void {
    try {
      if(this.pendingAccess(visitorId))return;
      const visitor=this.members.get(visitorId),owner=this.members.get(ownerId),house=this.houses.get(ownerId)?.house;
      const reject=()=>{for(const link of this.linksFor(visitorId))this.send(link,{type:'house.visit.result',requestId,accepted:false});if(visitorId===this.id)this.setError('La casa no está disponible.');};
      if(!visitor?.connected||!house||(house.access==='locked'&&visitorId!==ownerId&&!hasHouseAccess(house,visitorId))){reject();return;}
      if(visitorId===ownerId||house.access==='open'||hasHouseAccess(house,visitorId)){visitor.houseId=ownerId;visitor.position={...visitor.position,space:undefined};this.rosterChanged();return;}
      if(!owner?.connected||this.visits.size>=12||this.visits.has(requestId)){reject();return;}
      this.visits.set(requestId,{requestId,visitorId,identity:visitor.identity,houseId:ownerId,created:this.clock.now()});
    } finally {this.publishAccessStates(visitorId,requestId);this.notify();}
  }
  private pendingAccess(who:string):AccessRequest|null {
    const visit=[...this.visits.values()].find(v=>v.visitorId===who);
    if(visit)return{requestId:visit.requestId,ownerId:visit.houseId,kind:'house'};
    const request=this.workspace.pending(who);
    return request?{requestId:request.id,ownerId:request.owner,kind:request.space.roomId===null?'floor':'room'}:null;
  }
  private publishAccessStates(replyWho?:string,replyTo?:string):void {
    if(!this.isHost)return;
    for(const [id,visit]of this.visits)if(!this.members.get(visit.visitorId)?.connected||!this.members.get(visit.houseId)?.connected||this.houses.get(visit.houseId)?.house.access==='locked')this.visits.delete(id);
    const payload=(who:string):Extract<Payload,{type:'access.state'}>=>({type:'access.state',pending:this.pendingAccess(who),...(who===replyWho&&replyTo?{replyTo}:{}),visits:[...this.visits.values()].filter(v=>v.houseId===who).map(({requestId,identity,houseId})=>({requestId,identity,houseId}))});
    this.accessPending=this.pendingAccess(this.id);
    if(replyWho===this.id&&replyTo===this.accessAttempt?.requestId)this.accessAttempt=null;
    for(const link of this.links)if(link.approved&&!link.closed&&link.identity)this.send(link,payload(link.identity.fingerprint));
  }
  private cancelAccess(who:string,requestId:string):void {
    if(this.visits.get(requestId)?.visitorId===who)this.visits.delete(requestId);
    this.workspace.cancel(who,requestId);
  }
  cancelAccessRequest():void {
    const pending=this.view.pendingAccess;if(!pending)return;
    if(this.isHost){this.cancelAccess(this.id,pending.requestId);this.publishWorkspaces();this.publishAccessStates(this.id,pending.requestId);this.notify();}
    else this.sendHost({type:'access.cancel',requestId:pending.requestId});
  }
  decideVisit(requestId: string, accept: boolean): void {
    const request = this.visits.get(requestId);
    if (!request || request.houseId !== this.id || this.phase !== 'JOINED') return;
    if (this.isHost) this.resolveVisit(requestId, this.id, accept);
    else { this.sendHost({ type: 'house.visit.decision', requestId, accepted: accept }); this.visits.delete(requestId); this.notify(); }
  }
  private resolveVisit(requestId: string, ownerId: string, accept: boolean): void {
    const request = this.visits.get(requestId);
    if (!request || request.houseId !== ownerId) return;
    this.visits.delete(requestId);
    const visitor = this.members.get(request.visitorId); const owner = this.members.get(ownerId); const house = this.houses.get(ownerId)?.house;
    const accepted = !!(accept && visitor?.connected && owner?.connected && house && house.access !== 'locked');
    if (accepted) { visitor!.houseId = ownerId; visitor!.position={...visitor!.position,space:undefined}; this.rosterChanged(); }
    for(const link of this.linksFor(request.visitorId))this.send(link,{type:'house.visit.result',requestId,accepted});
    if(request.visitorId===this.id&&!accepted)this.setError('La visita no fue aceptada.');
    this.publishAccessStates();this.notify();
  }
  leaveHouse(): void {
    if (!this.voiceState.selected) this.media.suspend();
    if (this.cameraActivity !== 'village') this.camera.suspend();
    if (this.phase !== 'JOINED') return;
    if (this.isHost) { this.cancelVisits(this.id); const member = this.members.get(this.id); if (member) { member.houseId = null; member.position={...member.position,space:undefined}; } this.rosterChanged(); }
    else this.sendHost({ type: 'house.leave' });
  }
  private cancelVisits(visitorId:string):void {const pending=this.pendingAccess(visitorId);if(pending)this.cancelAccess(visitorId,pending.requestId);}
  kickVisitor(identityId: string): void { if (this.phase !== 'JOINED') return; if (this.isHost) this.removeVisitor(this.id, identityId); else this.sendHost({ type: 'house.kick', identityId }); }
  private removeVisitor(ownerId: string, visitorId: string): void {
    const visitor = this.members.get(visitorId);
    if (visitor && visitorId !== ownerId && visitor.houseId === ownerId) { visitor.houseId = null; visitor.position={...visitor.position,space:undefined}; this.rosterChanged(); }
  }
  kickMember(identityId: string): void {
    if (!this.isHost || identityId === this.id || this.phase !== 'JOINED') return;
    const links=this.linksFor(identityId);for(const link of links){this.send(link,{type:'session.kick',identityId});link.approved=false;}
    this.removeMember(identityId);for(const link of links)this.clock.setTimeout(()=>this.closeLink(link,false),100);
  }
  move(position: Position): void {
    const previous = this.members.get(this.id)?.position;
    const parsed = positionSchema.safeParse({ ...position, areaId: position.areaId ?? (previous ? areaOf(previous) : 'residential') });
    if (!parsed.success || this.phase !== 'JOINED') return;
    const self = this.members.get(this.id);
    const changedArea = !!self && areaOf(self.position) !== areaOf(parsed.data);
    if (self && !sameSpace(self.position.space, parsed.data.space)) return;
    if (self) self.position = parsed.data;
    this.pendingPosition = parsed.data;
    const elapsed = this.clock.now() - this.lastPositionSent;
    if (changedArea || elapsed >= 100) this.flushPosition();
    else if (!this.moveTimer) this.moveTimer = this.clock.setTimeout(() => { this.moveTimer = undefined; this.flushPosition(); }, 100 - elapsed);
    if (changedArea) { if (this.isHost) this.rosterChanged(); else this.syncMedia(); }
    this.notify();
  }
  private flushPosition(): void {
    if (!this.pendingPosition || this.phase !== 'JOINED') return;
    const position = this.pendingPosition; this.pendingPosition = undefined; this.lastPositionSent = this.clock.now();
    if (this.isHost) this.broadcast({ type: 'player.relay', identityId: this.id, position }, `position/${this.id}`);
    else this.sendHost({ type: 'player.position', position }, `position/${this.id}`);
  }
  sendStroke(stroke: BoardStroke): void {
    const parsed = strokeSchema.safeParse(stroke);
    const self = this.members.get(this.id);
    const localOnly = !activePhases.includes(this.phase);
    if (!parsed.success || stroke.author !== this.id || (localOnly ? stroke.boardId !== this.id : self?.houseId !== stroke.boardId)) { this.setError('Solo puedes dibujar tu propia capa en la casa actual.'); return; }
    const generation = this.generation;
    this.queue(async () => {
      const document: SignedStroke = { stroke: parsed.data, signature: await sign(this.identity, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke: parsed.data }) };
      if (generation !== this.generation) return;
      const result = this.board.apply(document);
      if (result === 'full') { this.setError('La pizarra alcanzó 2000 operaciones; exporta tus notas antes de continuar.'); return; }
      if (result === 'forbidden') { this.setError('No puedes modificar un trazo ajeno.'); return; }
      if (result === 'applied' && !localOnly) this.shareStroke(document);
      this.notify();
    });
  }
  deleteStroke(strokeId: string): void {
    const room = this.members.get(this.id)?.houseId ?? this.id;
    const document = this.board.find(room, strokeId);
    if (!document || document.stroke.author !== this.id || document.stroke.deleted) return;
    this.sendStroke({ ...document.stroke, seq: document.stroke.seq + 1, deleted: true });
  }
  private canAccessBoard(identityId: string, boardId: string): boolean {
    const member = this.members.get(identityId);
    if (!member?.connected) return false;
    const scoped=parseScopedBoard(boardId);
    if(scoped){const doc=this.isHost?this.workspaceStorage.get(scoped.owner,scoped.space):sameSpace(this.workspaceState.space,scoped.space)?this.workspaceState.document:null;return this.workspace.canRead(identityId,scoped.owner,scoped.space)&&!!doc?.furniture.some(f=>f.id===scoped.furniture&&f.kind==='board');}
    const match = /^house:([a-f0-9]{64}):([A-Za-z0-9_-]+)$/.exec(boardId);
    if (match) return !member.position.space && member.houseId === match[1] && !!this.houses.get(match[1])?.house.furniture.some(f => f.id === match[2] && f.kind === 'board');
    const area = /^area:(residential|community|study):/.exec(boardId);
    if (area) return member.houseId === null && areaOf(member.position) === area[1];
    return member.houseId === boardId;
  }
  private sameRoom(identityId: string, boardId: string): boolean {
    return this.phase === 'JOINED' && this.canAccessBoard(this.id, boardId) && this.canAccessBoard(identityId, boardId);
  }
  selectBoard(ref: string | null): void {
    if (ref === this.selectedBoard) return;
    this.selectedBoard = ref;
    for (const link of this.links) { link.syncRoom = undefined; link.syncExpected = undefined; }
    this.syncMedia(); this.notify();
  }
  commitBoard(boardId: string, changes: BoardStroke[]): Promise<boolean> {
    if (!changes.length) return Promise.resolve(true);
    const localOnly = !activePhases.includes(this.phase);
    // In my own house I may change anyone's layer; everywhere else only my own objects.
    const moderator = boardOwner(boardId) === this.id;
    if (changes.length > 128 || changes.some(s => (s.author !== this.id && !moderator) || s.boardId !== boardId || !strokeSchema.safeParse(s).success)
      || (!localOnly && !this.canAccessBoard(this.id, boardId))) return Promise.reject(new Error('No puedes modificar esta pizarra.'));
    if (this.localJobs.length >= LIMITS.queueMessages) return Promise.reject(new Error('Espera a que se guarden los cambios anteriores.'));
    return new Promise((resolve, reject) => { this.queue(async () => {
      try {
        const generation = this.generation;
        const documents: SignedStroke[] = [];
        for (const stroke of changes) documents.push({ stroke, signature: await sign(this.identity, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke }) });
        const unsigned = { id: randomId(), boardId, documents };
        const document: SignedBoardCommit = { ...unsigned, signature: await sign(this.identity, 'board-commit', { sessionId: this.sessionId, epoch: this.epoch, ...unsigned }) };
        if (generation !== this.generation || (!localOnly && !this.canAccessBoard(this.id, boardId))) throw new Error('La pizarra cambió antes de guardar.');
        if (new TextEncoder().encode(JSON.stringify({ type: 'board.commit', document })).byteLength > LIMITS.messageBytes - 1024) throw new Error('La selección es demasiado grande. Selecciona una zona más pequeña.');
        const result = this.board.applyBatch(documents);
        if (result === 'full') throw new Error('La pizarra alcanzó su capacidad. Exporta tu trabajo antes de continuar.');
        if (result === 'forbidden') throw new Error('Solo puedes cambiar tus propios objetos.');
        if (result === 'applied' && !localOnly) this.shareBoardCommit(document);
        this.notify(); resolve(true);
      } catch (error) { reject(error); }
    }); });
  }
  private async receiveBoardCommit(link: Link, document: SignedBoardCommit): Promise<void> {
    const author = link.identity!;
    const moderator = boardOwner(document.boardId) === author.fingerprint;
    if (!this.sameRoom(author.fingerprint, document.boardId) || document.documents.some(d => d.stroke.author !== author.fingerprint && !moderator)) throw new Error('Unauthorized board commit');
    const { signature, ...unsigned } = document;
    if (!await verify(author, 'board-commit', { sessionId: this.sessionId, epoch: this.epoch, ...unsigned }, signature)) throw new Error('Invalid board commit signature');
    for (const d of document.documents) if (!await verify(author, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke: d.stroke }, d.signature)) throw new Error('Invalid object signature');
    if (!this.active(link) || !this.sameRoom(author.fingerprint, document.boardId)) return;
    const result = this.board.applyBatch(document.documents);
    if (result === 'forbidden') throw new Error('Another author owns this object');
    if (result === 'full') this.setError('La pizarra alcanzó su capacidad; no se aplicó la selección.');
    else if (result === 'applied') this.notify();
  }
  private shareBoardCommit(document: SignedBoardCommit): void {
    let pending = false;
    for (const member of this.members.values()) if (this.sameRoom(member.identity.fingerprint, document.boardId)) {
      for(const endpoint of this.deviceEndpoints(member)){if(endpoint===this.endpoint?.id)continue;const link=this.linksFor(member.identity.fingerprint).find(l=>l.raw.endpoint===endpoint);if(!link||!this.send(link,{type:'board.commit',document}))pending=true;}
    }
    if (pending && this.boardCommits.size < LIMITS.queueMessages) this.boardCommits.set(document.id, document); else this.boardCommits.delete(document.id);
  }
  private async receiveStroke(link: Link, document: SignedStroke, sync: boolean): Promise<void> {
    const stroke = document.stroke; const author = this.members.get(stroke.author);
    const owner = boardOwner(stroke.boardId);
    if (!this.sameRoom(link.identity!.fingerprint, stroke.boardId) || (!sync && stroke.author !== link.identity!.fingerprint && owner !== link.identity!.fingerprint)) throw new Error('Unauthorized board author or house');
    // Departed authors' already-rendered work remains local, but is not newly imported without roster authorization.
    if (!author) return;
    // Signed by its author, or by the owner of the house whose board it is (the owner may edit any layer there).
    const ownerIdentity = owner ? this.members.get(owner)?.identity : undefined;
    const scope = { sessionId: this.sessionId, epoch: this.epoch, stroke };
    if (!await verify(author.identity, 'board', scope, document.signature) && !(ownerIdentity && await verify(ownerIdentity, 'board', scope, document.signature))) throw new Error('Invalid board signature');
    if (!this.active(link) || !this.sameRoom(link.identity!.fingerprint, stroke.boardId)) return;
    const result = this.board.apply(document);
    if (result === 'forbidden') throw new Error('Another author owns this stroke');
    if (result === 'full') this.setError('La pizarra alcanzó el límite de operaciones; hay cambios que no se importaron.');
    else if (result === 'applied') this.notify();
  }
  private shareStroke(document: SignedStroke): void {
    const recipients = [...this.members.values()].filter(member => this.sameRoom(member.identity.fingerprint, document.stroke.boardId));
    let pending = this.phase !== 'JOINED';
    for(const recipient of recipients)for(const endpoint of this.deviceEndpoints(recipient)){if(endpoint===this.endpoint?.id)continue;const link=this.linksFor(recipient.identity.fingerprint).find(l=>l.raw.endpoint===endpoint);if(!link||!this.send(link,{type:'board.stroke',document}))pending=true;}
    const key = `${document.stroke.boardId}/${document.stroke.id}`;
    if (pending) {
      const bytes = [...this.boardRetries.values()].reduce((total, item) => total + JSON.stringify(item).length, 0) + JSON.stringify(document).length;
      if ((!this.boardRetries.has(key) && this.boardRetries.size >= LIMITS.queueMessages) || bytes > LIMITS.queueBytes) this.setError('La cola de pizarra está llena. Conserva y exporta tus notas locales.');
      else { this.boardRetries.set(key, document); this.setError('Trabajas sin todos los enlaces; tus trazos pendientes todavía no se comparten con todos.'); }
    } else this.boardRetries.delete(key);
  }
  private reconcileMesh(): void {
    if (this.phase !== 'JOINED' || !this.endpoint) return;
    for (const link of [...this.links]) if (link.approved && link.identity && !this.members.has(link.identity.fingerprint)) this.closeLink(link, false);
    for (const link of [...this.links]) if(link.approved&&link.identity){const member=this.members.get(link.identity.fingerprint);if(member&&!this.deviceEndpoints(member).includes(link.raw.endpoint))this.closeLink(link,false);}
    for (const member of this.members.values()) {
      if(!member.connected)continue;
      for(const endpoint of this.deviceEndpoints(member)){
        if(endpoint===this.endpoint.id || endpoint===this.invite?.endpoint || this.endpoint.id>endpoint)continue;
        this.connect(endpoint,'mesh',member.identity);
      }
    }
  }
  /** Sends this link my media token and my current private-call intent. */
  private announceMedia(link: Link): void {
    this.send(link, { type: 'media.token', token: link.receiveToken });
    this.send(link, { type: 'media.private', with: this.privateWith });
  }

  private publishWorkspaces(): void {
    if(!this.isHost)return;
    this.workspace.reconcile([...this.members.keys()]);
    this.workspaceState=this.workspace.view(this.id);
    for(const link of this.links)if(link.approved&&!link.closed&&link.identity)this.send(link,{type:'workspace.state',workspace:this.workspace.view(link.identity.fingerprint)});
  }
  private applyWorkspace(who:string,command:WorkspaceCommand):void {
    try{if(command.action!=='enter'||!this.pendingAccess(who))this.workspace.apply(who,command);this.rosterChanged();}
    catch(error){const message=error instanceof Error?error.message:'Error';if(who===this.id)this.setError(message);else{const link=this.linkFor(who);if(link)this.send(link,{type:'voice.error',message:message.slice(0,200)});}}
    finally{this.publishAccessStates(who,command.action==='enter'?command.requestId:undefined);this.notify();}
  }
  workspaceCommand(command:WorkspaceCommand):void {
    if(command.action==='enter'&&this.view.pendingAccess)return;
    if(command.action==='enter'&&this.phase==='JOINED'){this.error=null;command={...command,requestId:randomId(12)};this.accessAttempt={requestId:command.requestId!,ownerId:command.owner,kind:command.space?.roomId?'room':'floor'};this.notify();}
    if(command.action==='enter'&&command.owner===this.id&&command.space){const seed=this.workspaceStorage.get(this.id,command.space);if(seed)command={...command,seed};}
    if(this.phase!=='JOINED'){
      try{this.workspace.apply(this.id,command);this.notify();}catch(error){this.setError(error instanceof Error?error.message:'Error');}return;
    }
    if(this.isHost)this.applyWorkspace(this.id,command);else this.sendHost({type:'workspace.command',command});
  }
  mailboxCommand(command:MailboxCommand):Promise<MailboxView>{return this.mailbox.command(command);}
  private privateCallView(): NetworkView['privateCall'] {
    const channel = this.voiceState.selected;
    const partner = channel?.kind === 'call' ? channel.members.find(id => id !== this.id) ?? null : null;
    return { with: partner ?? this.voiceState.outgoing.find(i => i.kind === 'call')?.to ?? null, active: !!partner,
      incoming: this.voiceState.invitations.filter(i => i.kind === 'call').map(i => i.from) };
  }
  private publishVoice(): void {
    if (!this.isHost) return;
    const online = [...this.members.values()].filter(m => m.connected).map(m => m.identity.fingerprint);
    this.voiceHub.prune(online);
    this.voiceState = this.voiceHub.view(this.id);
    for (const link of this.links) if (link.approved && !link.closed && link.identity) this.send(link, { type: 'voice.state', voice: this.voiceHub.view(link.identity.fingerprint) });
  }
  private applyVoice(who: string, command: VoiceCommand): void {
    try {
      if (command.action === 'game.end' && who !== this.id) return;
      this.voiceHub.apply(who, command, [...this.members.values()].filter(m => m.connected).map(m => m.identity.fingerprint), 'village');
      this.publishVoice(); this.syncMedia(); this.notify();
    } catch (error) { const message = error instanceof Error ? error.message : 'Error'; if (who === this.id) this.setError(message); else { const link = this.linkFor(who); if (link) this.send(link, { type: 'voice.error', message: message.slice(0, 200) }); } }
  }
  voiceCommand(command: VoiceCommand): void {
    if (this.phase !== 'JOINED') return;
    if (this.isHost) this.applyVoice(this.id, command);
    else this.sendHost({ type: 'voice.command', command });
  }
  requestPrivate(identityId: string | null): void {
    if (identityId && (identityId === this.id || !this.members.get(identityId)?.connected)) { this.setError('Esa persona ya no está en la aldea.'); return; }
    this.voiceCommand({ action: 'call', target: identityId });
  }

  private syncMedia(): void {
    this.syncCamera();
    const self = this.members.get(this.id);
    if (this.phase !== 'JOINED' || !self?.connected || this.leaving) { this.media.setContext(null); return; }

    // Board sync follows the house you are standing in, independent of voice.
    for (const link of this.links) {
      const peer = link.identity ? this.members.get(link.identity.fingerprint) : undefined;
      const boardId = this.selectedBoard ?? self.houseId;
      const together = !!boardId && !!peer?.connected && this.sameRoom(peer.identity.fingerprint, boardId);
      if (together && boardId && link.syncRoom !== boardId) {
        link.syncRoom = boardId; link.syncExpected = 0;
        this.send(link, { type: 'board.sync.request', boardId, cursor: 0 });
      } else if (!together) { link.syncRoom = undefined; link.syncExpected = undefined; link.syncExport = undefined; }
    }

    if(!this.mediaActive()){this.media.setContext(null);this.media.suspend();this.camera.suspend();return;}
    const channel = this.voiceState.selected;
    let room: string; let roomName: string; let audience: string[];
    if (channel) {
      room = `channel:${channel.id}`;
      const partner = channel.members.find(id => id !== this.id);
      roomName = channel.kind === 'call' ? t('Privado con {name}', { name: this.members.get(partner ?? '')?.identity.displayName ?? t('alguien') }) : channel.kind === 'game' ? t(channel.game === 'werewolves' ? 'Hombres lobo' : channel.game === 'tetris' ? 'Bloques del Bosque' : channel.game === 'gartic' ? 'Gartic Phone' : 'Quiz de estudio') : channel.name;
      audience = channel.members.filter(id => id !== this.id);
    } else {
      room = self.houseId ? `house:${self.houseId}${self.position.space ? `:space:${spaceKey(self.position.space)}` : ''}` : areaOf(self.position) === 'residential' ? 'village' : `area:${areaOf(self.position)}`;
      roomName = self.houseId ? t('Casa: {name}', { name: this.houses.get(self.houseId)?.house.name ?? t('Casa') }) : t(AREA_NAMES[areaOf(self.position)]);
      audience = [...this.members.values()]
        .filter(member => member.identity.fingerprint !== this.id && isInScene(member, areaOf(self.position), self.houseId, self.position.space) && !this.voiceState.busy.includes(member.identity.fingerprint))
        .map(member => member.identity.fingerprint);
    }
    const peers: MediaPeer[] = [];
    for (const id of audience) {
      const member = this.members.get(id); const link = this.mediaLink(id);
      if (!member || !link?.sendToken) continue;
      peers.push({ identityId: id, endpoint: member.mediaEndpoint??member.endpoint, sendToken: link.sendToken, receiveToken: link.receiveToken });
    }
    this.media.setContext({ sessionId: this.sessionId!, epoch: this.epoch, identityId: this.id, room, roomName, peers });
  }
  async updateAppearance(raw: AvatarAppearance): Promise<void> {
    this.ownAppearance = appearanceSchema.parse(raw);
    const self = this.members.get(this.id); if (self) self.appearance = this.ownAppearance;
    if (this.phase === 'JOINED') {
      if (this.isHost) this.rosterChanged();
      else this.sendHost({ type: 'avatar.update', appearance: this.ownAppearance });
    }
    this.notify();
  }
  setCameraActivity(activity: CameraActivity | null): void {
    if (activity === this.cameraActivity) return;
    this.cameraActivity = activity;
    this.syncCamera();
    if(this.mediaActive())this.sendApp('camera', null, JSON.stringify({ game: activity, request: true }));
    this.notify();
  }
  toggleGameCamera(): Promise<void> { this.requireMedia();return this.camera.toggle(); }
  setGameCameraPolicy(policy:GameCameraPolicy|null):void{this.camera.setPolicy(policy);}
  private syncCamera(): void {
    const game = this.cameraActivity;
    if (!game || this.leaving || this.disposed || !this.mediaActive()) { this.camera.setContext(null); return; }
    const self = this.members.get(this.id);
    const online = this.phase === 'JOINED' && !!self?.connected;
    const scene = cameraScene(self?.houseId??null,self?.position);
    const peers: CameraPeer[] = [];
    if (online) for (const member of this.members.values()) {
      const id = member.identity.fingerprint; const link = this.mediaLink(id);
      if (id === this.id || !link?.sendToken || !isInScene(member, areaOf(self!.position), self!.houseId, self!.position.space)) continue;
      peers.push({ identityId: id, endpoint: member.mediaEndpoint??member.endpoint, receiveToken: link.receiveToken, sendToken: link.sendToken, watching: this.cameraActivities.get(id) === game });
    }
    for (const id of this.cameraActivities.keys()) if (!this.members.get(id)?.connected) this.cameraActivities.delete(id);
    this.camera.setContext({ sessionId: online ? this.sessionId! : 'local', epoch: online ? this.epoch : 1,
      identityId: this.id, room: `${scene}:game:${game}`, roomName: game, peers });
  }
  toggleMicrophone(): Promise<void> { this.requireMedia();return this.media.toggleMicrophone(); }
  setMuted(value: boolean): void { this.media.setMuted(value); }
  setDeafened(value: boolean): void { this.media.setDeafened(value); }
  setPushToTalk(value: boolean): void { this.media.setPushToTalk(value); }
  setTalking(value: boolean): void { this.media.setTalking(value); }
  startScreen(): Promise<void> { this.requireMedia();return this.media.startScreen(); }
  stopScreen(): void { this.media.stopScreen(); }

  private linkClosed(link: Link): void {
    if (link.closed) return;
    link.closed = true; this.links.delete(link); link.wire.close(false);
    for (const unsubscribe of link.unsubscribe) unsubscribe();
    if (this.leaving || this.disposed) return;
    const id = link.identity?.fingerprint;
    if (link.approved && id && this.members.has(id)) {
      if (this.isHost) {
        this.detachDevice(id,link.raw.endpoint,true);
      } else if (link.raw.endpoint === this.invite?.endpoint && id === this.hostId) {
        this.hostDeadline ??= this.clock.now() + LIMITS.hostGraceMs;
        this.phase = 'RECONNECTING';this.accessAttempt=null;this.accessPending=null;this.visits.clear(); this.media.suspend(); this.camera.suspend();
        this.error = 'Se perdió el anfitrión. Se conserva la sesión durante 60 segundos y se exige autenticación al volver.';
      }
    } else if (!this.isHost && link.initiator && link.intent === 'join' && this.phase !== 'DENIED') this.finish('NETWORK_FAILED', 'La conexión no se autenticó o la invitación fue revocada.');
    this.syncMedia(); this.notify();
  }
  private closeLink(link: Link, unexpected: boolean): void {
    if (link.closed) return;
    if (unexpected) { link.wire.close(); this.linkClosed(link); return; }
    link.closed = true; this.links.delete(link); for (const unsubscribe of link.unsubscribe) unsubscribe(); link.wire.close();
  }
  private forgetPrivate(identityId: string): void {
    this.privateOf.delete(identityId);
    if (this.privateWith === identityId) this.privateWith = null;
  }
  private detachDevice(id:string,endpoint:string,unexpected:boolean):void{
    const member=this.members.get(id);if(!member)return;
    const remaining=this.deviceEndpoints(member).filter(e=>e!==endpoint);
    const live=remaining.filter(e=>e===this.endpoint?.id||this.linksFor(id).some(l=>l.raw.endpoint===e));
    if(live.length){member.devices=remaining;if(member.endpoint===endpoint)member.endpoint=live[0]!;if((member.mediaEndpoint??endpoint)===endpoint)member.mediaEndpoint=live[0]!;member.connected=true;this.rosterChanged();return;}
    if(unexpected){member.connected=false;this.memberDeadlines.set(id,this.clock.now()+LIMITS.hostGraceMs);this.rosterChanged();}else this.removeMember(id);
  }
  private removeLocalMember(identityId: string): void {
    this.forgetPrivate(identityId); this.workspace.disconnect(identityId);
    for(const link of this.linksFor(identityId))this.closeLink(link,false);
    this.houses.delete(identityId); this.memberDeadlines.delete(identityId);
    if (identityId !== this.id) this.board.removeBoard(identityId);
    for (const [id, visit] of this.visits) if (visit.houseId === identityId || visit.visitorId === identityId) this.visits.delete(id);
  }
  private removeMember(identityId: string): void {
    if (!this.members.has(identityId) || identityId === this.id) return;
    this.members.delete(identityId); this.houses.delete(identityId); this.memberDeadlines.delete(identityId);
    this.forgetPrivate(identityId); this.workspace.disconnect(identityId);
    for (const member of this.members.values()) if (member.houseId === identityId) member.houseId = null;
    for (const [id, visit] of this.visits) if (visit.houseId === identityId || visit.visitorId === identityId) this.visits.delete(id);
    this.board.removeBoard(identityId); this.rosterChanged();
  }
  private startTick(): void {
    if (this.tickTimer) this.clock.clearTimeout(this.tickTimer);
    const generation = this.generation;
    const tick = () => {
      if (generation !== this.generation || this.disposed) return;
      const now = this.clock.now();
      if (this.hostDeadline !== null && now >= this.hostDeadline) { this.finish('CLOSED', 'El anfitrión no regresó en 60 segundos. La sesión terminó.'); return; }
      for (const link of [...this.links]) {
        if ((!link.authenticated && now - link.created >= 15_000) || (link.authenticated && now - link.lastSeen >= 10_000) || (!link.approved && now - link.created >= 120_000)) { this.closeLink(link, true); continue; }
        if (link.authenticated && now - link.lastHeartbeat >= 2_000) { link.lastHeartbeat = now; this.send(link, { type: 'session.heartbeat', reply: false }); }
      }
      if (this.isHost) for (const [id, deadline] of [...this.memberDeadlines]) if (now >= deadline) this.removeMember(id);
      if (!this.isHost && this.phase === 'RECONNECTING' && this.invite && now - this.lastReconnect >= 2_000) { this.lastReconnect = now; this.connect(this.invite.endpoint, 'resume', this.hostId!); }
      if (this.phase === 'JOINED') {
        this.reconcileMesh();
        const commitRetry = this.boardCommits.values().next().value; if (commitRetry) this.shareBoardCommit(commitRetry);
        const retry = this.boardRetries.values().next().value; if (retry) this.shareStroke(retry);
      }
      if (this.hostDeadline !== null) this.notify();
      this.tickTimer = this.clock.setTimeout(tick, this.hostDeadline === null ? 250 : Math.min(250, Math.max(0, this.hostDeadline - this.clock.now())));
    };
    this.tickTimer = this.clock.setTimeout(tick, 250);
  }
  async leave(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true; this.media.suspend(); this.camera.suspend();
    if (this.isHost && this.phase === 'JOINED') {
      this.broadcast({ type: 'session.closed' });
      await new Promise<void>(resolve => this.clock.setTimeout(resolve, 100));
    } else if (this.hostLink() && this.phase === 'JOINED') {
      this.leaveRequest = randomId();
      await new Promise<void>(resolve => {
        let done = false;
        const complete = () => { if (done) return; done = true; this.clock.clearTimeout(timeout); this.leaveResolve = undefined; resolve(); };
        const timeout = this.clock.setTimeout(complete, LIMITS.leaveAckMs); this.leaveResolve = complete;
        this.sendHost({ type: 'session.leave', requestId: this.leaveRequest! });
      });
    }
    this.finish('CLOSED', null);
  }
  private finish(phase: SessionPhase, error: string | null): void { this.reset(); this.phase = phase; this.error = error; this.notify(); }
  private reset(): void {
    this.mailbox.cancel();
    this.generation++; this.leaving = true; this.media.suspend(); this.camera.suspend(); this.leaveResolve?.();
    for(const id of this.members.keys())this.workspace.disconnect(id);
    this.workspaceState=emptyWorkspace();this.offlinePosition={x:384,y:344,direction:'up',moving:false};
    this.voiceHub = new VoiceHub(); this.voiceState = emptyVoice();
    this.privateWith = null; this.privateOf.clear(); this.cameraActivity = null; this.cameraActivities.clear();
    if (this.tickTimer) this.clock.clearTimeout(this.tickTimer);
    if (this.moveTimer) this.clock.clearTimeout(this.moveTimer);
    this.tickTimer = undefined; this.moveTimer = undefined; this.pendingPosition = undefined;
    for (const link of [...this.links]) this.closeLink(link, false);
    for (const unsubscribe of this.endpointUnsubscribe) unsubscribe(); this.endpointUnsubscribe = [];
    this.endpoint?.destroy(); this.endpoint = undefined;
    this.accessPending=null;this.accessAttempt=null;
    this.members.clear(); this.houses.clear(); this.visits.clear(); this.memberDeadlines.clear(); this.boardRetries.clear();
    this.board.retainOwn(this.id); this.localJobs = [];
    this.isHost = false; this.hostId = null; this.sessionId = null; this.epoch = 0; this.invite = null;
    this.rosterRevision = 0; this.hostDeadline = null; this.error = null; this.leaveRequest = undefined; this.leaveResolve = undefined;
    this.leaving = false;
  }
  dispose(): void { if (this.disposed) return; this.reset(); this.media.dispose(); this.camera.dispose(); this.disposed = true; this.listeners.clear(); }
}

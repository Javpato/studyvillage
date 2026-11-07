import {LocalWorkspaces} from '../storage/workspaces';
import {unwrapMailboxResult,type MailboxCommand,type MailboxView} from '../../../core/src/house/mailbox';
import { floorsOf, emptyWorkspace, spaceKey, sameSpace, type WorkspaceCommand, type WorkspaceView } from '../../../core/src/house/workspaces';
import { emptyVoice, type VoiceCommand, type VoiceView } from '../media/voice';
import type { VoicePeerPresence } from './contracts';
/**
 * Server mode: the same VillageActions as the P2P VillageClient, backed by a
 * self-hosted StudyVillage server over WSS. The server is the authority for
 * membership, houses, boards and activities (it appears as the virtual host
 * SERVER_AUTHORITY, so SharedRoom talks to it unchanged). Voice, screen and
 * game cameras stay peer-to-peer WebRTC, signalled through the server and
 * limited to the caller's current scene, house or private call.
 */
import { randomId, sign } from '../../../core/src/identity';
import { GameCameraManager, cameraScene, type CameraPeer } from '../media/game-camera';
import { MediaManager, type MediaDevicesAdapter, type MediaPeer } from '../media/manager';
import { STUN_ONLY_CONFIG } from '../signaling/peerjs';
import { strokeSchema, type SignedBoardCommit, type SignedHouse, type SignedStroke } from '../../../core/src/protocol/schema';
import type { AccessRequest, GameCameraPolicy, ServerStatus, AppChannel, AppMessage, BoardStroke, CameraActivity, LocalIdentity, Member, NetworkView, Position, PublicHouse, SessionPhase, VillageActions } from '../../../core/src/protocol/types';
import type { AvatarAppearance } from '../../../core/src/assets/appearance';
import type { DataChannel, MediaCall, TransportEndpoint } from '../transport/types';
import { SERVER_AUTHORITY, SERVER_PROTOCOL, type ErrorCode, type InviteView, type PresenceView, type Role, type ServerMessage } from './contracts';
import { msg, t, type MessageRef } from '../../../../app/src/i18n';
import { userError } from '../../../../app/src/errors/messages';

export interface ServerConnectOptions { url: string; saved: boolean; deviceId?:string; deviceName?:string; invite?: string; claim?: string }
export type { ServerStatus } from '../../../core/src/protocol/types';

/** Turns what the owner typed into the WebSocket URL; plain ws:// is accepted only for this computer. */
export function serverSocketUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim().includes('://') ? input.trim() : `https://${input.trim()}`); } catch { throw userError(t('La dirección del servidor no es válida.')); }
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol === 'http:') url.protocol = 'ws:';
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) throw userError(t('Usa una dirección segura (https:// o wss://). Solo este mismo equipo puede usar http://.'));
  if (url.username || url.password) throw userError(t('La dirección no puede incluir usuario ni contraseña.'));
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/ws$/, '') + '/ws'; url.search = ''; url.hash = '';
  return url.toString();
}
export function serverHttpUrl(input: string): string {
  const ws = new URL(serverSocketUrl(input)); ws.protocol = ws.protocol === 'wss:' ? 'https:' : 'http:'; ws.pathname = ws.pathname.replace(/\/ws$/, '');
  return ws.toString().replace(/\/$/, '');
}
/**
 * Compatibility check before connecting: same app, same protocol. It reads the
 * server's challenge over the WebSocket itself, so it needs no extra CSP origin.
 */
export async function checkServer(input: string): Promise<{ name: string; version: string; maxOnline: number; online: number; needsClaim: boolean }> {
  const url = serverSocketUrl(input);
  const challenge = await new Promise<Record<string, unknown>>((resolve, reject) => {
    let socket: WebSocket;
    try { socket = new WebSocket(url); } catch { reject(userError(t('No se pudo contactar con el servidor. Comprueba la dirección y que esté en marcha.'))); return; }
    const timer = setTimeout(() => { socket.close(); reject(userError(t('El servidor no respondió a tiempo.'))); }, 8_000);
    socket.onopen = () => socket.send(JSON.stringify({ t: 'hello', v: SERVER_PROTOCOL }));
    socket.onerror = () => { clearTimeout(timer); reject(userError(t('No se pudo contactar con el servidor. Comprueba la dirección y que esté en marcha.'))); };
    socket.onmessage = event => { clearTimeout(timer); try { resolve(JSON.parse(String(event.data))); } catch { reject(userError(t('Esa dirección no es un servidor de StudyVillage.'))); } socket.close(); };
  });
  if (challenge.t !== 'challenge' || typeof challenge.worldId !== 'string') throw userError(t('Esa dirección no es un servidor de StudyVillage.'));
  if (challenge.v !== SERVER_PROTOCOL) throw userError(t('El servidor usa otra versión del protocolo ({version}). Actualiza la app o el servidor.', { version: String(challenge.v) }));
  const capacity = challenge.capacity as { maxOnline: number; online: number };
  return { name: String(challenge.name), version: String(challenge.v), maxOnline: capacity.maxOnline, online: capacity.online, needsClaim: !!challenge.needsClaim };
}

const ERRORS: Record<ErrorCode, MessageRef> = {
  version: msg('El servidor usa otra versión del protocolo. Actualiza la app o el servidor.'),
  full: msg('El servidor está lleno. Inténtalo cuando alguien salga o pide al administrador más capacidad.'),
  invite: msg('Necesitas una invitación válida. Puede haber caducado, agotado sus usos o sido revocada.'),
  signature: msg('El servidor no pudo verificar tu identidad.'),
  claim: msg('El secreto de instalación no es correcto o ya se usó.'),
  forbidden: msg('No tienes permiso para hacer eso aquí.'),
  invalid: msg('El servidor rechazó una petición no válida.'),
  conflict: msg('Otra versión llegó antes. Tu borrador se conserva; vuelve a intentarlo.'),
  storage: msg('El servidor no pudo guardar el cambio en disco. Tu borrador se conserva.'),
  'not-found': msg('Eso ya no existe en el servidor.'),
  rate: msg('Demasiadas peticiones seguidas. Espera un momento.'),
  unsaved: msg('Guarda tu identidad cifrada para administrar o conservar una parcela. Ahora entras como visitante.'),
};
export class ServerError extends Error { readonly userFacing = true; constructor(readonly code: ErrorCode) { super(t(ERRORS[code] ?? ERRORS.invalid)); } }

function defaultHouse(ownerId: string): PublicHouse {
  return { ownerId, revision: 1, name: 'Casa', access: 'ask', theme: 'mint', furniture: [
    { id: 'desk', kind: 'desk', x: 130, y: 150, publicAlias: '' }, { id: 'board', kind: 'board', x: 340, y: 95, publicAlias: '' },
    { id: 'table', kind: 'table', x: 430, y: 240, publicAlias: '' }, { id: 'plant', kind: 'plant', x: 660, y: 120, publicAlias: '' },
  ] };
}

interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }

export class ServerVillageClient implements VillageActions {
  private socket: WebSocket | null = null;
  private readonly deviceId:string;
  private devices:{id:string;name:string;current:boolean;media:boolean}[]=[];
  private mediaActive=false;
  private phase: SessionPhase = 'IDLE';
  private error: string | null = null;
  private role: Role | null = null;
  private scope = ''; private epoch = 1; private neighborhood = 0; private neighborhoods = 1; private maxOnline = 6; private online = 0; private name = '';
  private present = new Map<string, PresenceView>();
  private residents: { ownerId: string; slot: number; name: string }[] = [];
  private houses = new Map<string, SignedHouse | null>();
  private savedOwnHouse:PublicHouse|undefined;
  private accessPending:AccessRequest|null=null;
  private accessAttempt:AccessRequest|null=null;
  private visits: { requestId: string; identity: PresenceView['identity']; houseId: string }[] = [];
  private position: Position = { areaId: 'residential', x: 240, y: 215, direction: 'down', moving: false };
  private houseId: string | null = null;
  /** When I last chose to enter or leave a house; a state update older than that must not undo it. */
  private houseIntentAt = 0;
  private board: string | null = null;
  private strokes = new Map<string, SignedStroke>();
  private pending = new Map<string, Pending>();
  private listeners = new Set<(view: NetworkView) => void>();
  private appListeners = new Set<(message: AppMessage) => void>();
  private workspaceStorage:LocalWorkspaces;
  private workspaceState:WorkspaceView=emptyWorkspace();
  private voiceState: VoiceView = emptyVoice();
  private voiceDirectory = new Map<string, VoicePeerPresence>();
  private mediaSession = '';
  private privateWith: string | null = null;
  private established = false;
  private cameraActivity: CameraActivity | null = null;
  private cameraWatchers = new Map<string, CameraActivity | null>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private closedByUser = false;
  private disposed = false;
  private readonly media: MediaManager;
  private readonly camera: GameCameraManager;
  private readonly endpoint: WsMediaEndpoint;
  private lastPosition = 0;

  constructor(private identity: LocalIdentity, private ownHouse: PublicHouse, private readonly options: ServerConnectOptions & { appearance?: AvatarAppearance; mediaDevices?: MediaDevicesAdapter; onPhase?: (phase: SessionPhase) => void }) {
    this.deviceId=options.deviceId??randomId(12);
    this.workspaceStorage=new LocalWorkspaces(this.identity.public.fingerprint);
    this.media = new MediaManager(() => this.notify(), options.mediaDevices);
    this.camera = new GameCameraManager(() => this.notify(), options.mediaDevices);
    this.endpoint = new WsMediaEndpoint(this.identity.public.fingerprint, (to, data) => this.fire({ op: 'media.signal', to, data }), endpoint => this.fingerprintOf(endpoint));
    this.endpoint.setEndpointResolver(fingerprint => this.voiceDirectory.get(fingerprint)?.endpoint ?? this.present.get(fingerprint)?.endpoint ?? null);
    this.media.attach(this.endpoint); this.camera.attach(this.endpoint);
  }
  get id(): string { return this.identity.public.fingerprint; }

  get status(): ServerStatus {
    return { url: this.options.url, name: this.name, role: this.role, neighborhood: this.neighborhood, neighborhoods: this.neighborhoods, maxOnline: this.maxOnline, online: this.online,
      houseOnServer: !!this.houses.get(this.id), residentsHere: this.residents.length, devices:this.devices };
  }

  get view(): NetworkView {
    const members: Member[] = [...this.present.values()].map(p => ({
      identity: p.identity, endpoint: p.endpoint, slot: p.plot ?? -1, connected: true, houseId: p.identity.fingerprint === this.id ? this.houseId : p.houseId,
      position: p.identity.fingerprint === this.id ? { ...this.position } : p.position, ...(p.appearance ? { appearance: p.appearance } : {}),
    }));
    const houses: PublicHouse[] = [];
    for (const resident of this.residents) {
      if (resident.ownerId === this.id) continue;
      houses.push(this.houses.get(resident.ownerId)?.house ?? defaultHouse(resident.ownerId));
    }
    const partner = this.partner();
    return {
      serverHouse: this.savedOwnHouse,
      pendingAccess:structuredClone(this.accessAttempt??this.accessPending),
      phase: this.phase, isHost: this.role === 'admin', hostId: this.phase === 'JOINED' ? SERVER_AUTHORITY : null, sessionId: this.phase === 'JOINED' ? this.scope : null,
      invite: null, members, houses, residents: this.residents, pendingJoins: [],
      pendingVisits: this.visits.map(v => ({ requestId: v.requestId, identity: v.identity, houseId: v.houseId })),
      boardRef: this.board ?? undefined, strokes: [...this.strokes.values()].map(d => d.stroke),
      hostGraceRemainingMs: null, error: this.error, media: this.media.view, gameCamera: this.camera.view,
      workspace:this.workspaceState,
      voice: this.voiceState, voiceDirectory: [...this.voiceDirectory.values()].map(p => p.identity),
      privateCall: { with: partner ?? this.voiceState.outgoing.find(i => i.kind === 'call')?.to ?? null, active: !!partner, incoming: this.voiceState.invitations.filter(i => i.kind === 'call').map(i => i.from) },
      server: this.status,
    };
  }
  subscribe(listener: (view: NetworkView) => void): () => void { this.listeners.add(listener); listener(this.view); return () => { this.listeners.delete(listener); }; }
  onApp(listener: (message: AppMessage) => void): () => void { this.appListeners.add(listener); return () => { this.appListeners.delete(listener); }; }
  private notify(): void { if (this.disposed) return; const view = this.view; for (const listener of this.listeners) listener(view); }
  private setPhase(phase: SessionPhase): void { this.phase = phase; this.options.onPhase?.(phase); this.notify(); }

  // ------------------------------------------------------------ connection --
  async connect(): Promise<void> {
    if (this.socket) return;
    this.closedByUser = false; this.error = null;
    this.setPhase(this.attempts ? 'RECONNECTING' : 'CONNECTING');
    const socket = new WebSocket(serverSocketUrl(this.options.url));
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } };
      socket.onopen = () => { this.setPhase('AUTHENTICATING'); socket.send(JSON.stringify({ t: 'hello', v: SERVER_PROTOCOL })); };
      socket.onerror = () => fail(userError(t('No se pudo contactar con el servidor. Comprueba la dirección y que esté en marcha.')));
      socket.onclose = () => { fail(userError(t('El servidor cerró la conexión.'))); this.closed(socket); };
      socket.onmessage = event => {
        let message: ServerMessage; try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
        void this.receive(message).then(() => {
          if (message.t === 'welcome' && !settled) { this.established=true; settled = true; this.attempts = 0; resolve(); }
          if (message.t === 'denied') fail(new ServerError(message.code));
        }).catch(error => fail(error instanceof Error ? error : new Error(String(error))));
      };
    }).catch(error => { this.error = error instanceof Error ? error.message : String(error); if (this.phase !== 'DENIED' && this.phase !== 'EXPIRED_INVITE') this.setPhase('NETWORK_FAILED'); throw error; });
  }

  private closed(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    for (const [id, pending] of this.pending) { clearTimeout(pending.timer); pending.reject(userError(t('Se perdió la conexión con el servidor. Tu borrador se conserva.'))); this.pending.delete(id); }
    this.media.setContext(null); this.camera.setContext(null); this.endpoint.closeAll();
    this.accessAttempt=null;this.accessPending=null;this.visits=[];
    this.devices=[];this.mediaActive=false;this.present.clear(); this.voiceState = emptyVoice(); this.voiceDirectory.clear(); this.workspaceState=emptyWorkspace();
    if (this.closedByUser || this.disposed || this.phase === 'DENIED' || this.phase === 'EXPIRED_INVITE' || this.phase === 'KICKED') { if (this.phase === 'JOINED') this.setPhase('CLOSED'); else this.notify(); return; }
    if (this.established || this.phase === 'JOINED' || this.phase === 'RECONNECTING') {
      // Members and invited visitors come back on their own; the location is restored on the next presence update.
      this.setPhase('RECONNECTING');
      const delay = Math.min(30_000, 1_000 * 2 ** this.attempts++);
      this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; void this.connect().then(() => this.restore()).catch(() => { /* Next close schedules another try. */ }); }, delay);
    }
  }

  private async restore(): Promise<void> {
    this.voiceState = emptyVoice();
    this.sendPresence(true);
    if (this.board) { const ref = this.board; this.board = null; this.selectBoard(ref); }

  }

  private async receive(message: ServerMessage): Promise<void> {
    switch (message.t) {
      case 'devices': {this.devices=message.devices;this.mediaActive=message.devices.some(d=>d.current&&d.media);if(!this.mediaActive){this.media.suspend();this.camera.suspend();this.endpoint.closeAll();}this.syncMedia();this.notify();return;}
      case 'workspace': {this.houseId=message.workspace.houseId;const changed=!sameSpace(this.position.space,message.workspace.space);this.workspaceState=message.workspace;if(changed)this.position={...this.position,x:384,y:344,space:message.workspace.space??undefined};if(this.houseId===this.id&&message.workspace.space&&message.workspace.document)this.workspaceStorage.put(this.id,message.workspace.space,message.workspace.document);this.syncMedia();this.notify();return;}
      case 'voice': {
        this.voiceState = message.voice; this.voiceDirectory = new Map(message.directory.map(p => [p.identity.fingerprint, p])); this.mediaSession = message.session;
        this.syncMedia(); this.notify(); return;
      }
      case 'challenge': {
        this.name = message.name;
        const statement = { worldId: message.worldId, nonce: message.nonce, fingerprint: this.id, saved: this.options.saved,deviceId:this.deviceId };
        const signature = await sign(this.identity, 'server-auth', statement);
        this.socket?.send(JSON.stringify({ t: 'auth', identity: this.identity.public, saved: this.options.saved, signature,deviceId:this.deviceId,deviceName:this.options.deviceName||t('Dispositivo {n}',{n:this.deviceId.slice(0,4)}),
          ...(this.options.appearance ? { appearance: this.options.appearance } : {}), ...(this.options.invite ? { invite: this.options.invite } : {}), ...(this.options.claim ? { claim: this.options.claim } : {}) }));
        return;
      }
      case 'welcome': {
        const moved = this.phase === 'JOINED' && message.neighborhood !== this.neighborhood;
        this.role = message.role; this.neighborhood = message.neighborhood; this.scope = message.scope; this.epoch = message.epoch;
        // The claim secret is single use and a used invite is not needed again by a resident.
        if (message.role !== 'visitor') { this.options.claim = undefined; this.options.invite = undefined; }
        if (moved) { this.houseId = null; this.board = null; this.strokes.clear(); }
        if(message.position)this.position=message.position;if(message.houseId!==undefined)this.houseId=message.houseId;
        this.setPhase('JOINED');
        this.sendPresence(true);
        return;
      }
      case 'denied':
        this.error = t(ERRORS[message.code] ?? ERRORS.invalid);
        this.setPhase(message.code === 'invite' ? 'EXPIRED_INVITE' : message.code === 'full' ? 'NETWORK_FAILED' : 'DENIED');
        return;
      case 'state': {
        this.neighborhood = message.neighborhood; this.neighborhoods = message.neighborhoods; this.maxOnline = message.maxOnline; this.online = message.online; this.role = message.role; this.scope = message.scope; this.epoch = message.epoch;
        this.present = new Map(message.present.map(p => [p.identity.fingerprint, p]));
        this.residents = message.residents.map(r => ({ ownerId: r.fingerprint, slot: r.plot, name: r.displayName }));
        this.houses = new Map(message.residents.map(r => [r.fingerprint, r.house]));
        const own=this.houses.get(this.id)?.house;
        if(own)this.savedOwnHouse=own;
        this.accessPending=message.pendingAccess??null;
        this.visits = message.visits.map(v => ({ requestId: v.requestId, identity: v.visitor, houseId: v.houseId }));
        const self = this.present.get(this.id);
        if(self&&sameSpace(self.position.space,this.workspaceState.space))this.position={...this.position,space:self.position.space};
        if (self && self.houseId !== this.houseId && Date.now() - this.houseIntentAt > 3000) this.houseId = self.houseId;
        if (this.houseId && this.houseId !== this.id && !this.present.get(this.id)) this.houseId = null;
        for (const id of this.cameraWatchers.keys()) if (!this.present.has(id)) this.cameraWatchers.delete(id);
        this.syncMedia(); this.notify();
        return;
      }
      case 'position': {
        const person = this.present.get(message.id);
        if (person) { person.position = message.position; person.houseId = message.houseId;if(message.id===this.id){this.position={...message.position};this.houseId=message.houseId;}this.syncMedia(); this.notify(); }
        return;
      }
      case 'board': {
        if (message.ref !== this.board) return;
        if (message.reset) this.strokes.clear();
        for (const document of message.documents) {
          const old = this.strokes.get(document.stroke.id);
          if (!old || document.stroke.seq >= old.stroke.seq) this.strokes.set(document.stroke.id, document);
        }
        this.notify(); return;
      }
      case 'app': {
        if(message.channel==='werewolves'&&message.from===SERVER_AUTHORITY){try{const wire=JSON.parse(message.data);if(wire.t==='view'&&wire.v)this.camera.setPolicy({canSend:wire.v.canBroadcastCamera,canReceive:wire.v.canSeeCameras,audience:wire.v.cameraAudience,epoch:wire.v.cameraPhase});}catch{/* Invalid authority policy is ignored. */}}
        if (message.channel === 'camera') { try { const parsed = JSON.parse(message.data) as { game?: CameraActivity | null }; this.cameraWatchers.set(message.from, parsed.game ?? null); this.syncCamera(); } catch { /* Ignore. */ } }
        const app: AppMessage = { channel: message.channel, from: message.from, data: message.data };
        for (const listener of this.appListeners) listener(app);
        return;
      }
      case 'signal': this.endpoint.signal(message.from, message.data); return;
      case 'visit.result': {
        if(this.accessPending?.requestId===message.requestId)this.accessPending=null;
        if (message.accepted) { this.houseId = message.ownerId; this.position={...this.position,space:undefined}; this.houseIntentAt = Date.now(); this.sendPresence(true); }
        else { this.error = t('La visita no fue aceptada.'); }
        this.notify(); return;
      }
      case 'ack': {
        const pending = this.pending.get(message.id); if (!pending) return;
        this.pending.delete(message.id); clearTimeout(pending.timer);
        if (message.ok) pending.resolve(message.result); else pending.reject(new ServerError(message.code));
        return;
      }
    }
  }

  /** Sends one request and waits for the stored acknowledgement; the same id is reused on retry. */
  request<T = unknown>(body: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.phase !== 'JOINED') return Promise.reject(userError(t('No estás conectado al servidor.')));
    const id = randomId(12);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(userError(t('El servidor no respondió a tiempo. Tu borrador se conserva.'))); }, timeoutMs);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      socket.send(JSON.stringify({ t: 'req', id, body }));
    });
  }
  private fire(body: Record<string, unknown>): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.phase !== 'JOINED') return false;
    socket.send(JSON.stringify({ t: 'req', id: randomId(12), body })); return true;
  }

  // -------------------------------------------------------------- presence --
  move(position: Position): void { this.position = { ...position }; this.sendPresence(false); }
  private sendPresence(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastPosition < 60 && this.position.moving) return;
    this.lastPosition = now;
    const area = this.position.areaId; const self = this.present.get(this.id);
    if (self) { const sceneChanged = (self.position.areaId ?? 'residential') !== (area ?? 'residential') || self.houseId !== this.houseId; self.position = { ...this.position }; self.houseId = this.houseId; if (sceneChanged) this.syncMedia(); }
    this.fire({ op: 'presence', position: this.position, houseId: this.houseId });
  }
  async updateAppearance(appearance: AvatarAppearance): Promise<void> { this.options.appearance = appearance; this.fire({ op: 'appearance', appearance }); }

  // ---------------------------------------------------------------- houses --
  publishHouse(house: PublicHouse): void {
    this.ownHouse = house;
    // Automatic decoration updates only an existing server copy; layout saving is explicit.
    if (!this.houses.get(this.id) || this.role === 'visitor') return;
    void this.publishSigned(house).catch(error => { this.error = error instanceof Error ? error.message : String(error); this.notify(); });
  }
  /** Explicit layout/access save: ACK means SQLite has committed, even on a fresh home. */
  async saveHouseLayout(house:PublicHouse):Promise<PublicHouse> {
    if(this.phase!=='JOINED')throw userError(t('Conéctate primero a un servidor.'));
    if(this.role==='visitor')throw userError(t('Guarda tu identidad para tener una casa en el servidor.'));
    const document={house,signature:await sign(this.identity,'house',{sessionId:this.scope,epoch:this.epoch,house})};
    const result=await this.request<{conflict?:boolean;revision:number}>({op:'house.publish',document});
    if(result?.conflict)throw userError(t('La casa cambió en otro dispositivo. Revisa los permisos y vuelve a guardar.'));
    this.ownHouse=house;return house;
  }
  private async publishSigned(house: PublicHouse): Promise<void> {
    const document = { house, signature: await sign(this.identity, 'house', { sessionId: this.scope, epoch: this.epoch, house }) };
    const result = await this.request<{ conflict?: boolean; revision: number }>({ op: 'house.publish', document });
    // Retrying decoration must not restore an older device's permissions.
    if(result?.conflict){
      const latest=this.savedOwnHouse;
      if(!latest||latest.revision<result.revision)throw new ServerError('conflict');
      await this.publishSigned({...house,allowlist:latest.allowlist??[],floors:floorsOf(latest),doorPositions:latest.doorPositions??{},access:latest.access,revision:result.revision+1});
    }
  }
  visitHouse(ownerId: string): void {
    if(this.view.pendingAccess)return;
    this.error=null;const requestId=randomId(12);this.accessAttempt={requestId,ownerId,kind:'house'};this.notify();
    void this.request<{accepted?:boolean;pendingAccess:AccessRequest|null}>({op:'house.visit',ownerId,requestId}).then(result=>{
      this.accessPending=result.pendingAccess??null;
      if(result.accepted){this.houseId=ownerId;this.position={...this.position,space:undefined};this.houseIntentAt=Date.now();this.sendPresence(true);}
    }).catch(error=>{this.error=error instanceof Error?error.message:String(error);})
      .finally(()=>{if(this.accessAttempt?.requestId===requestId)this.accessAttempt=null;this.notify();});
  }
  cancelAccessRequest():void {
    const pending=this.view.pendingAccess;if(!pending)return;
    void this.request<{pendingAccess:AccessRequest|null}>({op:'access.cancel',requestId:pending.requestId}).then(result=>{
      this.accessPending=result.pendingAccess??null;if(this.accessAttempt?.requestId===pending.requestId)this.accessAttempt=null;
    }).catch(error=>{this.error=error instanceof Error?error.message:String(error);}).finally(()=>this.notify());
  }
  decideVisit(requestId: string, accept: boolean): void {
    this.visits = this.visits.filter(v => v.requestId !== requestId); this.notify();
    void this.request({ op: 'house.decide', requestId, accept }).catch(error => { this.error = String(error instanceof Error ? error.message : error); this.notify(); });
  }
  leaveHouse(): void { this.houseId = null; this.position={...this.position,space:undefined}; this.houseIntentAt = Date.now(); if (this.board?.startsWith('house:')) { this.board = null; this.strokes.clear(); } this.fire({ op: 'house.leave' }); this.sendPresence(true); this.syncMedia(); this.notify(); }
  kickVisitor(identityId: string): void { void this.request({ op: 'house.kick', identityId }).catch(() => { /* Already gone. */ }); }

  /** Explicit, all-or-nothing copy of this device's house and own boards. Local originals are untouched. */
  async importOwn(boards: { ref: string; strokes: BoardStroke[] }[]): Promise<{ house: number; objects: number }> {
    if (this.role === 'visitor') throw new ServerError('unsaved');
    const current = this.houses.get(this.id)?.house.revision ?? 0;
    const saved=this.savedOwnHouse;
    const house = { ...this.ownHouse, ...(saved?{allowlist:saved.allowlist??[],floors:floorsOf(saved),doorPositions:saved.doorPositions??{},access:saved.access}:{}), revision: Math.max(this.ownHouse.revision, current + 1) };
    const signedHouse = { house, signature: await sign(this.identity, 'house', { sessionId: this.scope, epoch: this.epoch, house }) };
    const commits: SignedBoardCommit[] = [];
    for (const board of boards) {
      const own = board.strokes.filter(s => s.author === this.id && !s.deleted).map(s => ({ ...s, boardId: board.ref, seq: Math.max(1, s.seq) }));
      for (let i = 0; i < own.length; i += 100) commits.push(await this.signCommit(board.ref, own.slice(i, i + 100)));
    }
    if (commits.length > 16) throw userError(t('Hay demasiados objetos para importarlos de una vez. Exporta primero alguna pizarra.'));
    const result = await this.request<{ house: number; objects: number }>({ op: 'import', house: signedHouse, boards: commits }, 60_000);
    this.ownHouse = house;
    return result;
  }

  // ---------------------------------------------------------------- boards --
  selectBoard(ref: string | null): void {
    if (ref === this.board) return;
    this.board = ref; this.strokes.clear(); this.notify();
    if (ref) void this.request({ op: 'board.select', ref }).catch(error => { if (this.board === ref) { this.error = error instanceof Error ? error.message : String(error); this.notify(); } });
    else this.fire({ op: 'board.select', ref: null });
  }
  private async signCommit(boardId: string, changes: BoardStroke[]): Promise<SignedBoardCommit> {
    const scope = { sessionId: this.scope, epoch: this.epoch };
    const documents: SignedStroke[] = [];
    for (const stroke of changes) documents.push({ stroke, signature: await sign(this.identity, 'board', { ...scope, stroke }) });
    const unsigned = { id: randomId(), boardId, documents };
    return { ...unsigned, signature: await sign(this.identity, 'board-commit', { ...scope, ...unsigned }) };
  }
  async commitBoard(boardId: string, changes: BoardStroke[]): Promise<boolean> {
    if (!changes.length) return true;
    const moderator = boardId.startsWith(`house:${this.id}:`);
    if (changes.length > 128 || changes.some(s => (s.author !== this.id && !moderator) || s.boardId !== boardId || !strokeSchema.safeParse(s).success)) throw userError(t('No puedes modificar esta pizarra.'));
    const document = await this.signCommit(boardId, changes);
    if (new TextEncoder().encode(JSON.stringify(document)).byteLength > 90_000) throw userError(t('La selección es demasiado grande. Selecciona una zona más pequeña.'));
    await this.request({ op: 'board.commit', document });
    if (this.board === boardId) for (const d of document.documents) this.strokes.set(d.stroke.id, d);
    this.notify();
    return true;
  }
  sendStroke(stroke: BoardStroke): void { void this.commitBoard(stroke.boardId, [stroke]).catch(error => { this.error = error instanceof Error ? error.message : String(error); this.notify(); }); }
  deleteStroke(strokeId: string): void {
    const document = this.strokes.get(strokeId);
    if (document && document.stroke.author === this.id && !document.stroke.deleted) this.sendStroke({ ...document.stroke, seq: document.stroke.seq + 1, deleted: true });
  }

  // ------------------------------------------------------------ activities --
  sendApp(channel: AppChannel, to: string | null, data: string): boolean { if(channel==='camera'&&!this.mediaActive)return false; return this.fire({ op: 'app.send', channel, to, data }); }

  async travel(neighborhood: number): Promise<void> {
    await this.request({ op: 'travel', neighborhood });
    this.houseId = null; this.board = null; this.strokes.clear();
    this.position = { areaId: 'residential', x: neighborhood > this.neighborhood ? 24 : 744, y: 215, direction: neighborhood > this.neighborhood ? 'right' : 'left', moving: false };
    this.notify();
  }

  // ----------------------------------------------------------------- media --
  private partner(): string | null {
    const channel = this.voiceState.selected;
    return channel?.kind === 'call' ? channel.members.find(id => id !== this.id) ?? null : null;
  }
  private inScene(p: PresenceView): boolean {
    const mine = this.present.get(this.id); if (!mine) return false;
    if (p.houseId !== this.houseId) return false;
    return this.houseId !== null ? sameSpace(p.position.space,this.position.space) : (p.position.areaId ?? 'residential') === (this.position.areaId ?? 'residential');
  }
  private fingerprintOf(endpoint: string): string | null { for (const p of this.voiceDirectory.values()) if (p.endpoint === endpoint) return p.identity.fingerprint; return null; }
  private peer(p: VoicePeerPresence): MediaPeer {
    const mine = this.voiceDirectory.get(this.id) ?? this.present.get(this.id)!;
    // Each person's token is what others must present to reach them.
    return { identityId: p.identity.fingerprint, endpoint: p.endpoint, sendToken: p.mediaToken, receiveToken: mine.mediaToken };
  }
  private syncMedia(): void {
    this.syncCamera();
    const mine = this.present.get(this.id);
    if (this.phase !== 'JOINED' || !mine || !this.mediaActive) { this.media.setContext(null); return; }
    const channel = this.voiceState.selected;
    const area = this.position.areaId ?? 'residential';
    let room: string, roomName: string, audience: VoicePeerPresence[];
    if (channel) {
      room = `channel:${channel.id}`;
      const partner = channel.members.find(id => id !== this.id);
      roomName = channel.kind === 'call' ? t('Privado con {name}', { name: this.voiceDirectory.get(partner ?? '')?.identity.displayName ?? '' }) : channel.kind === 'game' ? t(channel.game === 'werewolves' ? 'Hombres lobo' : channel.game === 'tetris' ? 'Bloques del Bosque' : channel.game === 'gartic' ? 'Gartic Phone' : 'Quiz de estudio') : channel.name;
      audience = channel.members.flatMap(id => id !== this.id && this.voiceDirectory.has(id) ? [this.voiceDirectory.get(id)!] : []);
    } else {
      room = this.houseId ? `house:${this.houseId}${this.position.space ? `:space:${spaceKey(this.position.space)}` : ''}` : area === 'residential' ? 'village' : `area:${area}`;
      roomName = this.houseId ? t('Casa') : area === 'residential' ? t('La aldea') : area === 'community' ? t('Plaza Comunitaria') : t('Biblioteca');
      audience = [...this.present.values()].filter(p => p.identity.fingerprint !== this.id && this.inScene(p) && !this.voiceState.busy.includes(p.identity.fingerprint));
      room = `channel:location:${this.neighborhood}:${room}`;
    }
    this.media.setContext({ sessionId: this.mediaSession || this.scope, epoch: this.epoch, identityId: this.id, room, roomName, peers: audience.map(p => this.peer(p)) });
  }

  private syncCamera(): void {
    const game = this.cameraActivity; const mine = this.present.get(this.id);
    if (!game || this.phase !== 'JOINED' || !mine || !this.mediaActive) { this.camera.setContext(null); return; }
    const scene = cameraScene(this.houseId,this.position);
    const peers: CameraPeer[] = [...this.present.values()].filter(p => p.identity.fingerprint !== this.id && this.inScene(p))
      .map(p => ({ ...this.peer(p), watching: this.cameraWatchers.get(p.identity.fingerprint) === game }));
    this.camera.setContext({ sessionId: this.scope, epoch: this.epoch, identityId: this.id, room: `${scene}:game:${game}`, roomName: game, peers });
  }
  requestPrivate(identityId: string | null): void { this.voiceCommand({ action: 'call', target: identityId }); }
  workspaceCommand(command:WorkspaceCommand):void {
    if(command.action!=='enter'){this.fire({op:'workspace',command});return;}
    if(this.view.pendingAccess)return;
    this.error=null;const requestId=randomId(12);command={...command,requestId};
    if(command.owner===this.id&&command.space?.roomId===null){const seed=this.workspaceStorage.get(this.id,command.space);if(seed)command={...command,seed};}
    this.accessAttempt={requestId,ownerId:command.owner,kind:command.space?.roomId?'room':'floor'};this.notify();
    const enter=command;
    const prepare=enter.owner===this.id&&enter.space&&!this.houses.get(this.id)&&this.role!=='visitor'?this.publishSigned(this.ownHouse):Promise.resolve();
    void prepare.then(()=>this.accessAttempt?.requestId===requestId?this.request<{pendingAccess:AccessRequest|null}>({op:'workspace',command:enter}):null).then(result=>{if(result)this.accessPending=result.pendingAccess??null;})
      .catch(error=>{this.error=error instanceof Error?error.message:String(error);})
      .finally(()=>{if(this.accessAttempt?.requestId===requestId)this.accessAttempt=null;this.notify();});
  }
  voiceCommand(command: VoiceCommand): void { this.fire({ op: 'voice', command }); }
  async mailboxCommand(command:MailboxCommand):Promise<MailboxView>{return unwrapMailboxResult(await this.request({op:'mailbox',command}));}
  setCameraActivity(activity: CameraActivity | null): void { if (activity === this.cameraActivity) return; this.cameraActivity = activity; this.syncCamera(); this.sendApp('camera', null, JSON.stringify({ game: activity, request: true })); this.notify(); }
  setGameCameraPolicy(policy:GameCameraPolicy|null):void{this.camera.setPolicy(policy);}
  selectMediaDevice(id:string):void{this.fire({op:'device.media',deviceId:id});}
  private requireMedia():void {if(!this.mediaActive)throw userError(t('Selecciona este dispositivo para voz y cámara en Ajustes → Servidores.'));}
  toggleGameCamera(): Promise<void> { this.requireMedia();return this.camera.toggle(); }
  toggleMicrophone(): Promise<void> { this.requireMedia();return this.media.toggleMicrophone(); }
  setMuted(value: boolean): void { this.media.setMuted(value); }
  setDeafened(value: boolean): void { this.media.setDeafened(value); }
  setPushToTalk(value: boolean): void { this.media.setPushToTalk(value); }
  setTalking(value: boolean): void { this.media.setTalking(value); }
  startScreen(): Promise<void> { this.requireMedia();return this.media.startScreen(); }
  stopScreen(): void { this.media.stopScreen(); }

  // ------------------------------------------------- not used in server mode --
  async openVillage(): Promise<void> { throw userError(t('Ya estás en un servidor. Sal para abrir una aldea entre pares.')); }
  async joinVillage(): Promise<void> { throw userError(t('Ya estás en un servidor. Sal para unirte a otra aldea.')); }
  decideJoin(): void { /* Server admission uses private invitations. */ }
  rotateInvite(): void { /* Invitations are managed in Ajustes → Servidores. */ }
  kickMember(): void { /* Residents keep their plots; revoke invitations instead. */ }

  async leave(): Promise<void> {
    this.closedByUser = true; this.established=false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.media.suspend(); this.camera.setContext(null); this.endpoint.closeAll();
    const socket = this.socket; this.socket = null;
    try { socket?.close(1000); } catch { /* Already closed. */ }
    this.accessAttempt=null;this.accessPending=null;this.visits=[];
    this.devices=[];this.mediaActive=false;this.present.clear(); this.voiceState = emptyVoice(); this.voiceDirectory.clear(); this.workspaceState=emptyWorkspace(); this.residents = []; this.strokes.clear(); this.board = null; this.houseId = null; this.role = null;
    this.setPhase('IDLE');
  }
  dispose(): void { if (this.disposed) return; void this.leave(); this.disposed = true; this.listeners.clear(); this.appListeners.clear(); this.endpoint.destroy(); }
}

/**
 * TransportEndpoint whose media calls are native RTCPeerConnections signalled
 * through the server. One connection per call and direction, as with PeerJS,
 * so MediaManager and GameCameraManager work unchanged.
 */
type Signal = { k: 'offer'; cid: string; meta: unknown; sdp: string } | { k: 'answer'; cid: string; sdp: string } | { k: 'ice'; cid: string; c: RTCIceCandidateInit } | { k: 'close'; cid: string };
class WsMediaEndpoint implements TransportEndpoint {
  readonly id: string;
  private calls = new Map<string, NativeCall>();
  private callListeners = new Set<(call: MediaCall) => void>();
  constructor(self: string, private readonly sendSignal: (to: string, data: string) => boolean, private readonly fingerprintOf: (endpoint: string) => string | null) { this.id = self; }
  connect(): DataChannel { throw new Error('Data channels are not used in server mode'); }
  onConnection(): () => void { return () => {}; }
  onSignalingChange(): () => void { return () => {}; }
  onCall(callback: (call: MediaCall) => void): () => void { this.callListeners.add(callback); return () => { this.callListeners.delete(callback); }; }
  call(endpoint: string, stream: MediaStream, metadata: unknown): MediaCall {
    const to = this.fingerprintOf(endpoint);
    const cid = randomId(12);
    const call = new NativeCall(cid, endpoint, metadata, to, this, () => this.calls.delete(cid));
    this.calls.set(cid, call);
    if (!to) { queueMicrotask(() => call.close()); return call; }
    void call.offer(stream);
    return call;
  }
  send(to: string | null, signal: Signal): void { if (to) this.sendSignal(to, JSON.stringify(signal)); }
  signal(from: string, raw: string): void {
    let signal: Signal; try { signal = JSON.parse(raw) as Signal; } catch { return; }
    if (!signal || typeof signal.cid !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(signal.cid)) return;
    const existing = this.calls.get(signal.cid);
    if (signal.k === 'offer') {
      if (existing || this.calls.size >= 96 || typeof signal.sdp !== 'string') return;
      const endpoint = this.endpointFor(from);
      if (!endpoint) return;
      const call = new NativeCall(signal.cid, endpoint, signal.meta, from, this, () => this.calls.delete(signal.cid));
      call.remoteOffer = signal.sdp;
      this.calls.set(signal.cid, call);
      for (const listener of this.callListeners) listener(call);
      return;
    }
    // Only the person on the other end of this call may continue it.
    if (!existing || existing.peer !== from) return;
    if (signal.k === 'answer') void existing.remoteAnswer(signal.sdp);
    else if (signal.k === 'ice') void existing.addIce(signal.c);
    else if (signal.k === 'close') existing.close(false);
  }
  private endpointResolver: ((fingerprint: string) => string | null) | null = null;
  setEndpointResolver(resolver: (fingerprint: string) => string | null): void { this.endpointResolver = resolver; }
  private endpointFor(fingerprint: string): string | null { return this.endpointResolver?.(fingerprint) ?? null; }
  closeAll(): void { for (const call of [...this.calls.values()]) call.close(); }
  destroy(): void { this.closeAll(); this.callListeners.clear(); }
}

class NativeCall implements MediaCall {
  private pc: RTCPeerConnection | null = new RTCPeerConnection(STUN_ONLY_CONFIG);
  private streamListeners = new Set<(stream: MediaStream) => void>();
  private closeListeners = new Set<() => void>();
  private ended = false;
  private queuedIce: RTCIceCandidateInit[] = [];
  private retry: ReturnType<typeof setTimeout> | undefined;
  remoteOffer: string | null = null;
  constructor(readonly cid: string, readonly endpoint: string, readonly metadata: unknown, readonly peer: string | null, private readonly owner: WsMediaEndpoint, private readonly forget: () => void) {
    const pc = this.pc!;
    pc.onicecandidate = event => { if (event.candidate) this.owner.send(this.peer, { k: 'ice', cid, c: event.candidate.toJSON() }); };
    pc.ontrack = event => { const stream = event.streams[0] ?? new MediaStream([event.track]); for (const listener of this.streamListeners) listener(stream); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.close(); };
  }
  async offer(stream: MediaStream): Promise<void> {
    try {
      const pc = this.pc; if (!pc) return;
      for (const track of stream.getTracks()) pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
      await pc.setLocalDescription(await pc.createOffer());
      this.owner.send(this.peer, { k: 'offer', cid: this.cid, meta: this.metadata, sdp: pc.localDescription!.sdp });
    } catch { this.close(); }
  }
  answer(): void {
    void (async () => {
      try {
        const pc = this.pc; if (!pc || !this.remoteOffer) return;
        await pc.setRemoteDescription({ type: 'offer', sdp: this.remoteOffer });
        for (const candidate of this.queuedIce.splice(0)) await pc.addIceCandidate(candidate);
        await pc.setLocalDescription(await pc.createAnswer());
        this.owner.send(this.peer, { k: 'answer', cid: this.cid, sdp: pc.localDescription!.sdp });
      } catch { this.close(); }
    })();
  }
  async remoteAnswer(sdp: string): Promise<void> {
    try { const pc = this.pc; if (!pc || typeof sdp !== 'string') return; await pc.setRemoteDescription({ type: 'answer', sdp }); for (const candidate of this.queuedIce.splice(0)) await pc.addIceCandidate(candidate); }
    catch { this.close(); }
  }
  async addIce(candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.pc; if (!pc || !candidate || typeof candidate !== 'object') return;
    if (!pc.remoteDescription) { if (this.queuedIce.length < 64) this.queuedIce.push(candidate); return; }
    try { await pc.addIceCandidate(candidate); } catch { /* A bad candidate is skipped. */ }
  }
  close(notifyPeer = true): void {
    if (this.ended) return;
    this.ended = true; if (this.retry) clearTimeout(this.retry);
    if (notifyPeer) this.owner.send(this.peer, { k: 'close', cid: this.cid });
    try { this.pc?.close(); } catch { /* Already closed. */ }
    this.pc = null; this.forget();
    for (const listener of [...this.closeListeners]) listener();
    this.closeListeners.clear(); this.streamListeners.clear();
  }
  onStream(callback: (stream: MediaStream) => void): () => void { this.streamListeners.add(callback); return () => { this.streamListeners.delete(callback); }; }
  onClose(callback: () => void): () => void { this.closeListeners.add(callback); return () => { this.closeListeners.delete(callback); }; }
  limitBitrate(kind: 'audio' | 'screen' | 'camera'): void {
    const apply = () => {
      for (const sender of this.pc?.getSenders() ?? []) {
        if (!sender.track) continue;
        const parameters = sender.getParameters(); if (!parameters.encodings?.length) continue;
        for (const encoding of parameters.encodings) { encoding.maxBitrate = kind === 'audio' ? 48_000 : kind === 'camera' ? 6_000_000 : 12_000_000; if (kind !== 'audio') encoding.maxFramerate = 30; }
        void sender.setParameters(parameters).catch(() => { /* Not supported everywhere. */ });
      }
    };
    apply(); this.retry = setTimeout(apply, 1_000);
  }
}

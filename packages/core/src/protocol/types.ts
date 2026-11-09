import type { FurnitureKind } from '../house/furniture';
export type { FurnitureKind } from '../house/furniture';
import type {PetConfig} from '../pets/model';
import type {FriendCommand,FriendView} from '../social/friends';
import type { GardenItem } from './garden';
import type {MailboxCommand,MailboxView} from '../house/mailbox';
export type { GardenItem } from './garden';
import type { HouseFloor, HouseSpace, WorkspaceCommand, WorkspaceView } from '../house/workspaces';
import type { VoiceCommand, VoiceView } from '../media/voice';
import type { AvatarAppearance } from '../assets/appearance';
/** Frozen cross-module API. Only the integrator changes this file. */
export const LIMITS = {
  members: 6, hostGraceMs: 60_000, leaveAckMs: 1_500,
  messageBytes: 65_536, queueMessages: 128, queueBytes: 1_048_576,
  strokePoints: 512, boardOperations: 2_000, furniture: 32,
  worldWidth: 768, worldHeight: 432,
  // Whiteboard: the board is unbounded in practice; coordinates are world
  // units within ±boardExtent, and a text note is at most boardText chars.
  boardExtent: 20_000, boardText: 280,
  // One shared-activity message (a game view, a drawing, the project list),
  // kept well under messageBytes once wrapped in its envelope.
  appData: 56_000,
} as const;

export type AppChannel = 'werewolves' | 'tetris' | 'gartic' | 'projects' | 'study' | 'camera' | 'ai' | 'ink' | 'pets' | 'pet-art' | 'sprites' | 'mailbox';
export type CameraActivity = 'werewolves' | 'tetris' | 'gartic' | 'village';
export interface GameCameraPolicy {canSend:boolean;canReceive:boolean;audience:string[]|null;receiveAudience?:string[];epoch?:string}
export interface GameCameraView {
  local: MediaStream | null; pending: boolean; error: string | null;
  remote: { identityId: IdentityId; stream: MediaStream }[];
}
export interface AppMessage { channel: AppChannel; from: IdentityId; data: string }

export type IdentityId = string;
export interface PublicIdentity { fingerprint: IdentityId; publicKey: string; displayName: string; color: string }
export interface LocalIdentity { public: PublicIdentity; privateKey: CryptoKey }
export interface EncryptedIdentity {
  v: 1; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string;
  ciphertext: string; publicIdentity: PublicIdentity;
}
export interface Contact { schemaVersion: 1; identity: PublicIdentity; friendCode?: string; nickname?: string }
export type HouseAccess = 'open' | 'ask' | 'locked';
export interface Furniture { pet?:PetConfig; guideText?: string; showFrame?: boolean; sprite?: string; color?: string; rotation?: 0 | 90 | 180 | 270; id: string; kind: FurnitureKind; x: number; y: number; publicAlias: string }
export interface PublicHouse { garden?:GardenItem[]; doorPositions?: Record<string,{x:number;y:number}>; allowlist?: IdentityId[]; floors?: HouseFloor[]; ownerId: IdentityId; revision: number; name: string; access: HouseAccess; theme: 'mint' | 'peach'; furniture: Furniture[] }
export interface Position { space?: HouseSpace; areaId?: 'residential' | 'community' | 'study'; x: number; y: number; direction: 'up' | 'down' | 'left' | 'right'; moving: boolean }
export interface Member { devices?:string[]; mediaEndpoint?:string; appearance?: AvatarAppearance; identity: PublicIdentity; endpoint: string; slot: number; connected: boolean; houseId: IdentityId | null; position: Position }
export interface JoinRequest { requestId: string; identity: PublicIdentity }
export interface VisitRequest { requestId: string; identity: PublicIdentity; houseId: IdentityId }
export interface AccessRequest { requestId:string; ownerId:IdentityId; kind:'house'|'floor'|'room' }
export type SessionPhase = 'IDLE' | 'SIGNALING' | 'CONNECTING' | 'AUTHENTICATING' | 'PENDING_APPROVAL' | 'JOINED' | 'RECONNECTING' | 'DENIED' | 'EXPIRED_INVITE' | 'NETWORK_FAILED' | 'KICKED' | 'CLOSED';
export type BoardRef = string;
export interface BoardTextStyle { fontSize: number; fontFamily: 'sans' | 'serif' | 'mono' | 'excalifont'; bold: boolean; italic: boolean; underline?: boolean; align: 'left' | 'center' | 'right'; boxWidth?: number }
export interface BoardPoint { x: number; y: number }
export interface BoardStroke { id: string; author: IdentityId; boardId: IdentityId; seq: number; color: string; width: number; tool: 'pen' | 'line' | 'rectangle' | 'circle' | 'arrow' | 'text'; points: BoardPoint[]; deleted: boolean; text?: string; textStyle?: BoardTextStyle }
export type ScreenPhase = 'OFF' | 'REQUESTING_OS_PERMISSION' | 'CAPTURING_LOCAL' | 'NEGOTIATING' | 'SENDING' | 'DENIED' | 'NOT_SUPPORTED' | 'SOURCE_ENDED' | 'NETWORK_FAILED';
export interface RemoteMedia { identityId: IdentityId; kind: 'audio' | 'screen'; stream: MediaStream }
export interface MediaView { screenAvailable?: boolean; micEnabled: boolean; muted: boolean; deafened: boolean; pushToTalk: boolean; talking: boolean; screenPhase: ScreenPhase; localScreen: MediaStream | null; remote: RemoteMedia[]; audience: string; error: string | null }
export interface NetworkView {
  friends?:FriendView;
  pendingAccess?:AccessRequest|null;
  devices?:{id:string;name:string;current:boolean;media:boolean}[];
  serverHouse?: PublicHouse;
  workspace?: WorkspaceView;
  voice?: VoiceView;
  voiceDirectory?: PublicIdentity[];
  phase: SessionPhase; isHost: boolean; hostId: IdentityId | null; sessionId: string | null; invite: string | null;
  members: Member[]; houses: PublicHouse[]; pendingJoins: JoinRequest[]; pendingVisits: VisitRequest[];
  boardRef?: BoardRef; strokes: BoardStroke[]; hostGraceRemainingMs: number | null; error: string | null; media: MediaView; gameCamera: GameCameraView;
  /** Private voice: who you asked, whether they asked you back, and who is asking you. */
  privateCall: { with: IdentityId | null; active: boolean; incoming: IdentityId[] };
  /** Server mode: residents keep their plots even while offline. Absent in P2P mode. */
  residents?: { ownerId: IdentityId; slot: number; name: string }[];
  /** Server mode only: where you are and what the server allows. */
  server?: ServerStatus;
}
export interface ServerStatus {
  url: string; name: string; role: 'admin' | 'resident' | 'visitor' | null; neighborhood: number; neighborhoods: number;
  maxOnline: number; online: number; houseOnServer: boolean; residentsHere: number;
  devices?: { id:string; name:string; current:boolean; media:boolean }[];
}
export interface VillageActions {
  friendCommand(command:FriendCommand):void;
  cancelAccessRequest():void;
  mailboxCommand(command:MailboxCommand):Promise<MailboxView>;
  selectMediaDevice?(id:string):void;
  openVillage(): Promise<void>; joinVillage(invite: string): Promise<void>;
  decideJoin(requestId: string, accept: boolean): void; rotateInvite(): void;
  leave(): Promise<void>; visitHouse(ownerId: IdentityId): void;
  decideVisit(requestId: string, accept: boolean): void; leaveHouse(): void;
  publishHouse(house: PublicHouse): void; move(position: Position): void;
  selectBoard(ref: BoardRef | null): void; commitBoard(ref: BoardRef, changes: BoardStroke[]): Promise<boolean>;
  sendStroke(stroke: BoardStroke): void; deleteStroke(strokeId: string): void;
  kickMember(identityId: IdentityId): void; kickVisitor(identityId: IdentityId): void;
  setCompanionMicrophone?(stream:MediaStream|null):void;setCompanionScreen?(stream:MediaStream|null):void;
  toggleMicrophone(): Promise<void>; setMuted(muted: boolean): void;
  setDeafened(deafened: boolean): void; setPushToTalk(enabled: boolean): void; setTalking(talking: boolean): void;
  startScreen(withAudio?: boolean): Promise<void>; stopScreen(): void;
  setCameraActivity(activity: CameraActivity | null): void;
  toggleGameCamera(): Promise<void>;
  setGameCameraPolicy?(policy:GameCameraPolicy|null):void;
  updateAppearance(appearance: AvatarAppearance): Promise<void>;
  /** Ask for (or accept) a private call with one person; null returns to public voice. */
  requestPrivate(identityId: IdentityId | null): void;
  voiceCommand(command: VoiceCommand): void;
  workspaceCommand(command: WorkspaceCommand): void;
  /** Send a shared-activity message to one member, or to everyone with `to: null`. */
  sendApp(channel: AppChannel, to: IdentityId | null, data: string): boolean;
  /** Receive shared-activity messages from other members; returns an unsubscribe. */
  onApp(listener: (message: AppMessage) => void): () => void;
}
export interface DiagnosticEntry { test: string; status: 'PASS' | 'FAIL' | 'UNVERIFIED' | 'UNSUPPORTED'; detail: string }
export interface AppView {
  identity: PublicIdentity; network: NetworkView; ownHouse: PublicHouse;
  contacts: Contact[]; friendCode: string; storage: 'sqlite' | 'indexeddb' | 'memory';
  identitySaved: boolean; lockedIdentity: boolean; notice: string | null;
  diagnostics: DiagnosticEntry[]; editorText: string;
}
export interface AppActions extends VillageActions {
  updateProfile(displayName: string, color: string): Promise<void>;
  saveHouseLayout(house: PublicHouse): Promise<void>;
  updateOwnHouse(house: PublicHouse): void; copyInvite(): Promise<void>;
  exportBackup():Promise<void>;inspectBackup(file:File):Promise<{profile:string;identity:string|null;keys:number;notebooks:number;pages:number;attachments:number;conflicts:number}>;restoreBackup(file:File):Promise<void>;exportRecoveryBackup():Promise<void>;
  exportIdentity():Promise<void>; importIdentity(file:File,passphrase:string):Promise<void>;
  saveIdentity(passphrase: string): Promise<void>; unlockIdentity(passphrase: string): Promise<void>;
  addSessionContact(identityId: IdentityId): Promise<void>; setContactNickname(identityId: IdentityId, nickname: string): Promise<void>;
  shareContact(): Promise<void>;
  exportContact(): void; importContact(file: File): Promise<void>; rotateFriendCode(): void;
  openLocalFile(furnitureId: string): Promise<void>; saveEditor(text: string): Promise<void>;
  exportEditor(text: string): void; exportBoard(canvas: HTMLCanvasElement): void;
  runDiagnostic(kind: 'capabilities' | 'microphone' | 'screen' | 'stop' | 'loopback'): Promise<void>;
  dismissNotice(): void;
  /** Self-hosted server mode. */
  checkServer(url: string): Promise<{ name: string; version: string; maxOnline: number; online: number; needsClaim: boolean }>;
  connectServer(url: string, options: { invite?: string; claim?: string }): Promise<void>;
  serverRequest(body: Record<string, unknown>): Promise<unknown>;
  travel(neighborhood: number): Promise<void>;
  importToServer(boards: { ref: string; strokes: BoardStroke[] }[]): Promise<{ house: number; objects: number }>;
}

import {friendCommandSchema,type FriendView} from '../../../core/src/social/friends';
import { workspaceCommandSchema, type WorkspaceView } from '../../../core/src/house/workspaces';
import { voiceCommandSchema, type VoiceView } from '../media/voice';
/**
 * Wire contract between the browser and a self-hosted StudyVillage server.
 * Shared by app/src/server/client.ts and server/src. Values are protocol
 * identifiers, never translated text: errors carry a stable `code` and the
 * client chooses the words in the current language.
 */
import { z } from 'zod';
import {mailboxCommandSchema} from '../../../core/src/house/mailbox';
import { appearanceSchema } from '../../../core/src/assets/appearance';
import { appChannelSchema, boardCommitSchema, boardRefSchema, fingerprintSchema, identitySchema, idSchema, positionSchema, signedHouseSchema, signedStrokeSchema } from '../../../core/src/protocol/schema';
import { LIMITS, type AccessRequest } from '../../../core/src/protocol/types';

export const SERVER_PROTOCOL = 8;
export const PLOTS_PER_NEIGHBORHOOD = 6;
export const MAX_NEIGHBORHOODS = 4;
export const MAX_ONLINE = 24;
export const MAX_DEVICES_PER_PERSON = 3;
export const P2P_MEMBERS = LIMITS.members;
/** Virtual "host" fingerprint: in server mode the server is the activity authority. */
export const SERVER_AUTHORITY = '0'.repeat(64);

/** Neighbourhoods needed for a capacity: ten people need two, never more than four. */
export function neighborhoodsFor(maxOnline: number): number {
  return Math.min(MAX_NEIGHBORHOODS, Math.max(1, Math.ceil(clampCapacity(maxOnline) / PLOTS_PER_NEIGHBORHOOD)));
}
export function clampCapacity(value: number): number { return Math.min(MAX_ONLINE, Math.max(1, Math.trunc(value))); }
/**
 * Signing scope for one neighbourhood. It is stable across restarts (worldId and
 * epoch live in SQLite) and differs between neighbourhoods, so identical area
 * board refs can never be replayed into a neighbour.
 */
export function signingScope(worldId: string, neighborhood: number): string { return `${worldId}-n${neighborhood}`; }

const nonce = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const signature = z.string().regex(/^[A-Za-z0-9_-]{86}$/);
const requestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const inviteCode = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
const neighborhood = z.number().int().min(0).max(MAX_NEIGHBORHOODS - 1);

export const authStatementSchema = z.strictObject({ worldId: idSchema, nonce, fingerprint: fingerprintSchema, saved: z.boolean(), deviceId:z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional() });
export type AuthStatement = z.infer<typeof authStatementSchema>;

export const clientHelloSchema = z.strictObject({ t: z.literal('hello'), v: z.literal(SERVER_PROTOCOL) });
export const clientAuthSchema = z.strictObject({
  t: z.literal('auth'), identity: identitySchema, saved: z.boolean(), signature,
  deviceId:z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(), deviceName:z.string().trim().min(1).max(48).optional(),
  appearance: appearanceSchema.optional(),
  invite: inviteCode.optional(),
  /** One-time installation secret that makes the first saved identity the administrator. */
  claim: z.string().min(16).max(128).optional(),
});

/** Every request that changes something carries an id: retrying it never applies twice. */
export const operationSchema = z.discriminatedUnion('op', [
  z.strictObject({op:z.literal('mailbox'),command:mailboxCommandSchema}),
  z.strictObject({op:z.literal('device.media'),deviceId:z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)}),
  z.strictObject({ op: z.literal('workspace'), command: workspaceCommandSchema }),
  z.strictObject({op:z.literal('friend'),command:friendCommandSchema}),
  z.strictObject({ op: z.literal('voice'), command: voiceCommandSchema }),
  z.strictObject({ op: z.literal('presence'), position: positionSchema, houseId: fingerprintSchema.nullable() }),
  z.strictObject({ op: z.literal('appearance'), appearance: appearanceSchema }),
  z.strictObject({ op: z.literal('house.publish'), document: signedHouseSchema }),
  z.strictObject({ op: z.literal('house.visit'), ownerId: fingerprintSchema, requestId:idSchema.optional() }),
  z.strictObject({op:z.literal('access.cancel'),requestId:idSchema}),
  z.strictObject({ op: z.literal('house.decide'), requestId: idSchema, accept: z.boolean() }),
  z.strictObject({ op: z.literal('house.leave') }),
  z.strictObject({ op: z.literal('house.kick'), identityId: fingerprintSchema }),
  z.strictObject({ op: z.literal('board.select'), ref: boardRefSchema.nullable() }),
  z.strictObject({ op: z.literal('board.commit'), document: boardCommitSchema }),
  z.strictObject({ op: z.literal('app.send'), channel: appChannelSchema, to: fingerprintSchema.nullable(), data: z.string().min(2).max(LIMITS.appData) }),
  z.strictObject({ op: z.literal('travel'), neighborhood }),
  z.strictObject({ op: z.literal('media.private'), with: fingerprintSchema.nullable() }),
  z.strictObject({ op: z.literal('media.signal'), to: fingerprintSchema, data: z.string().min(2).max(48_000) }),
  /** Explicit copy of my own house and boards into the server; the device keeps its originals. */
  z.strictObject({ op: z.literal('import'), house: signedHouseSchema, boards: z.array(boardCommitSchema).max(16) }),
  z.strictObject({ op: z.literal('admin.capacity'), maxOnline: z.number().int().min(1).max(MAX_ONLINE) }),
  z.strictObject({ op: z.literal('admin.invite.create'), label: z.string().trim().max(40), uses: z.number().int().min(1).max(100), hours: z.number().int().min(1).max(24 * 30) }),
  z.strictObject({ op: z.literal('admin.invite.revoke'), id: idSchema }),
  z.strictObject({ op: z.literal('admin.invite.list') }),
]);
export type Operation = z.infer<typeof operationSchema>;
export const clientRequestSchema = z.strictObject({ t: z.literal('req'), id: requestId, body: operationSchema });
export const clientMessageSchema = z.discriminatedUnion('t', [clientHelloSchema, clientAuthSchema, clientRequestSchema]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type Role = 'admin' | 'resident' | 'visitor';
export type ErrorCode = 'version' | 'full' | 'invite' | 'signature' | 'claim' | 'forbidden' | 'invalid' | 'conflict' | 'storage' | 'not-found' | 'rate' | 'unsaved';

export interface ResidentView { fingerprint: string; displayName: string; color: string; plot: number; neighborhood: number; online: boolean; house: z.infer<typeof signedHouseSchema> | null }
export interface PresenceView {
  identity: z.infer<typeof identitySchema>; endpoint: string; role: Role; plot: number | null;
  neighborhood: number; houseId: string | null; position: z.infer<typeof positionSchema>;
  appearance?: z.infer<typeof appearanceSchema>; mediaToken: string; privateWith: string | null;
}
export interface InviteView { id: string; label: string; code?: string; uses: number; used: number; expiresAt: number; revoked: boolean }

export type VoicePeerPresence = Pick<PresenceView, 'identity' | 'endpoint' | 'mediaToken'>;

export type ServerMessage =
  | {t:'friends';friends:FriendView}
  | { t:'devices'; devices:{id:string;name:string;current:boolean;media:boolean}[] }
  | { t:'workspace'; workspace:WorkspaceView }
  | { t: 'voice'; voice: VoiceView; directory: VoicePeerPresence[]; session: string }
  | { t: 'challenge'; v: number; worldId: string; name: string; nonce: string; needsClaim: boolean; capacity: { maxOnline: number; online: number } }
  | { t: 'welcome'; role: Role; neighborhood: number; scope: string; epoch: number; connectionId: string; position?:z.infer<typeof positionSchema>; houseId?:string|null }
  | { t: 'denied'; code: ErrorCode }
  | { t: 'state'; revision: number; neighborhood: number; neighborhoods: number; scope: string; epoch: number; role: Role; maxOnline: number; online: number; residents: ResidentView[]; present: PresenceView[]; pendingAccess?:AccessRequest|null; visits: { requestId: string; visitor: z.infer<typeof identitySchema>; houseId: string }[] }
  | { t: 'position'; id: string; position: z.infer<typeof positionSchema>; houseId: string | null }
  | { t: 'board'; ref: string; documents: z.infer<typeof signedStrokeSchema>[]; reset: boolean }
  | { t: 'app'; channel: z.infer<typeof appChannelSchema>; from: string; data: string }
  | { t: 'signal'; from: string; data: string }
  | { t: 'visit.result'; requestId: string; ownerId: string; accepted: boolean }
  | { t: 'ack'; id: string; ok: true; result?: unknown }
  | { t: 'ack'; id: string; ok: false; code: ErrorCode };

/** Activity wire in server mode, a superset of SharedRoom's peer-host wire. */
export type RoomCommand = 'stop' | 'study.setQuiz' | 'bots.enable' | 'bots.disable' | 'bots.jobs' | 'bots.submit';

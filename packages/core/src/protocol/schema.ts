import { gardenSchema } from './garden';
import { doorPositionsSchema, accessListSchema, floorsSchema, houseSpaceSchema, workspaceCommandSchema, workspaceViewSchema } from '../house/workspaces';
import { voiceCommandSchema, voiceViewSchema } from '../media/voice';
import { appearanceSchema } from '../assets/appearance';
import { z } from 'zod';
import { LIMITS } from './types';

export const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const endpointSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
export const accessRequestSchema = z.strictObject({requestId:idSchema,ownerId:fingerprintSchema,kind:z.enum(['house','floor','room'])});
const nonce = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const identitySchema = z.strictObject({
  fingerprint: fingerprintSchema, publicKey: z.string().min(100).max(256),
  displayName: z.string().trim().min(1).max(40), color,
});
export const positionSchema = z.strictObject({
  space: houseSpaceSchema.optional(),
  areaId: z.enum(['residential', 'community', 'study']).optional(),
  x: z.number().min(0).max(LIMITS.worldWidth), y: z.number().min(0).max(LIMITS.worldHeight),
  direction: z.enum(['up', 'down', 'left', 'right']), moving: z.boolean(),
});
export const houseSchema = z.strictObject({
  garden:gardenSchema.optional(),
  floors: floorsSchema.optional(), allowlist: accessListSchema.optional(), doorPositions: doorPositionsSchema.optional(),
  ownerId: fingerprintSchema, revision: integer, name: z.string().trim().min(1).max(60),
  access: z.enum(['open', 'ask', 'locked']), theme: z.enum(['mint', 'peach']),
  furniture: z.array(z.strictObject({
    guideText: z.string().max(320).optional(), showFrame: z.boolean().optional(),
    color: color.optional(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    id: idSchema, kind: z.enum(['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet', 'flashcards', 'oak', 'palm', 'cherry', 'flowerbed', 'lantern', 'fountain', 'picnic', 'hammock', 'mailbox', 'birdbath', 'mushrooms', 'stonepath', 'inkdesk', 'guide', 'sketchboard', 'clock', 'jukebox', 'vanity']),
    x: z.number().min(0).max(736), y: z.number().min(0).max(400), publicAlias: z.string().max(60),
  })).max(LIMITS.furniture),
}).refine(house => new Set(house.furniture.map(item => item.id)).size === house.furniture.length);
export const memberSchema = z.strictObject({
  devices:z.array(endpointSchema).min(1).max(3).optional(), mediaEndpoint:endpointSchema.optional(),
  identity: identitySchema, endpoint: endpointSchema, slot: z.number().int().min(0).max(5),
  appearance: appearanceSchema.optional(), connected: z.boolean(), houseId: fingerprintSchema.nullable(), position: positionSchema,
});
const boardCoordinate = z.number().min(-LIMITS.boardExtent).max(LIMITS.boardExtent);
export const boardRefSchema = z.string().max(200).regex(/^(?:[a-f0-9]{64}|house:[a-f0-9]{64}:(?:space:[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{1,32}:)?[A-Za-z0-9_-]{1,80}|area:(?:residential|community|study):[A-Za-z0-9:_-]{1,110})$/);
export const boardTextStyleSchema = z.strictObject({fontSize:z.number().min(8).max(160),fontFamily:z.enum(['sans','serif','mono','excalifont']),bold:z.boolean(),italic:z.boolean(),underline:z.boolean().optional(),align:z.enum(['left','center','right']),boxWidth:z.number().min(24).max(4000).optional()});
export const strokeSchema = z.strictObject({
  id: idSchema, author: fingerprintSchema, boardId: boardRefSchema, seq: integer,
  color, width: z.number().min(1).max(32), tool: z.enum(['pen', 'line', 'rectangle', 'circle', 'arrow', 'text']),
  points: z.array(z.strictObject({ x: boardCoordinate, y: boardCoordinate })).min(1).max(LIMITS.strokePoints),
  deleted: z.boolean(),
  // Only text notes carry text, and every text note must carry some.
  text: z.string().min(1).max(LIMITS.boardText).optional(), textStyle: boardTextStyleSchema.optional(),
}).refine((stroke) => (stroke.tool === 'text') === (stroke.text !== undefined) && (!stroke.textStyle || stroke.tool === 'text'), { message: 'text belongs to text notes only' });
const signature = z.string().regex(/^[A-Za-z0-9_-]{86}$/);
export const signedHouseSchema = z.strictObject({ house: houseSchema, signature });
export const signedStrokeSchema = z.strictObject({ stroke: strokeSchema, signature });
export const boardCommitSchema = z.strictObject({ id:idSchema,boardId:boardRefSchema,documents:z.array(signedStrokeSchema).min(1).max(128),signature }).refine(c=>new Set(c.documents.map(d=>d.stroke.id)).size===c.documents.length && c.documents.every(d=>d.stroke.boardId===c.boardId));
export type SignedBoardCommit = z.infer<typeof boardCommitSchema>;
export const appChannelSchema = z.enum(['werewolves', 'tetris', 'gartic', 'projects', 'study', 'camera', 'ai', 'ink', 'sprites', 'mailbox']);
const appDataSchema = z.string().min(2).max(LIMITS.appData);
export const inviteSchema = z.strictObject({
  v: z.literal(1), sessionId: idSchema, epoch: integer.min(1), hostFingerprint: fingerprintSchema,
  endpoint: endpointSchema, generation: integer.min(1), secret: nonce, expiresAt: integer,
});
export type Invite = z.infer<typeof inviteSchema>;
export type SignedHouse = z.infer<typeof signedHouseSchema>;
export type SignedStroke = z.infer<typeof signedStrokeSchema>;
const intent = z.enum(['join', 'resume', 'mesh']);
export const helloSchema = z.strictObject({
  v: z.literal(1), kind: z.literal('auth.hello'), sessionId: idSchema, epoch: integer.min(1),
  intent, identity: identitySchema, from: endpointSchema, to: endpointSchema, nonce,
  generation: integer, secret: z.union([nonce, z.literal('')]),
});
export const transcriptSchema = z.strictObject({
  v: z.literal(1), sessionId: idSchema, epoch: integer.min(1), intent,
  initiator: fingerprintSchema, responder: fingerprintSchema, from: endpointSchema, to: endpointSchema,
  initiatorNonce: nonce, responderNonce: nonce, generation: integer, secret: z.union([nonce, z.literal('')]),
});
export type Hello = z.infer<typeof helloSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export const payloadSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('workspace.command'), command: workspaceCommandSchema }),
  z.strictObject({ type: z.literal('workspace.state'), workspace: workspaceViewSchema }),
  z.strictObject({ type: z.literal('voice.command'), command: voiceCommandSchema }),
  z.strictObject({ type: z.literal('voice.state'), voice: voiceViewSchema }),
  z.strictObject({ type: z.literal('voice.error'), message: z.string().max(200) }),
  z.strictObject({ type: z.literal('join.decision'), accepted: z.boolean() }),
  z.strictObject({ type: z.literal('session.snapshot'), revision: integer, members: z.array(memberSchema).min(1).max(6), houses: z.array(signedHouseSchema).max(6) }),
  z.strictObject({ type: z.literal('session.heartbeat'), reply: z.boolean() }),
  z.strictObject({ type: z.literal('session.leave'), requestId: idSchema }),
  z.strictObject({ type: z.literal('session.leaveAck'), requestId: idSchema }),
  z.strictObject({ type: z.literal('session.closed') }),
  z.strictObject({ type: z.literal('session.kick'), identityId: fingerprintSchema }),
  z.strictObject({ type: z.literal('house.publish'), document: signedHouseSchema }),
  z.strictObject({ type: z.literal('house.visit'), requestId: idSchema, ownerId: fingerprintSchema }),
  z.strictObject({type:z.literal('access.cancel'),requestId:idSchema}),
  z.strictObject({type:z.literal('access.state'),pending:accessRequestSchema.nullable(),replyTo:idSchema.optional(),visits:z.array(z.strictObject({requestId:idSchema,identity:identitySchema,houseId:fingerprintSchema})).max(12)}),
  z.strictObject({ type: z.literal('house.visit.request'), requestId: idSchema, visitorId: fingerprintSchema, ownerId: fingerprintSchema }),
  z.strictObject({ type: z.literal('house.visit.decision'), requestId: idSchema, accepted: z.boolean() }),
  z.strictObject({ type: z.literal('house.visit.result'), requestId: idSchema, accepted: z.boolean() }),
  z.strictObject({ type: z.literal('house.leave') }),
  z.strictObject({ type: z.literal('house.kick'), identityId: fingerprintSchema }),
  z.strictObject({ type: z.literal('avatar.update'), appearance: appearanceSchema }),
  z.strictObject({ type: z.literal('player.position'), position: positionSchema }),
  z.strictObject({ type: z.literal('player.relay'), identityId: fingerprintSchema, position: positionSchema }),
  z.strictObject({ type: z.literal('board.stroke'), document: signedStrokeSchema }),
  z.strictObject({ type:z.literal('board.commit'),document:boardCommitSchema }),
  z.strictObject({ type: z.literal('board.sync.request'), boardId: boardRefSchema, cursor: integer.max(2000) }),
  z.strictObject({ type: z.literal('board.sync.response'), boardId: boardRefSchema, document: signedStrokeSchema.nullable(), next: integer.max(2000).nullable() }),
  z.strictObject({type:z.literal('device.media'),endpoint:endpointSchema}),
  z.strictObject({ type: z.literal('media.token'), token: nonce }),
  z.strictObject({ type: z.literal('media.received'), kind: z.enum(['audio', 'screen']) }),
  // Who the sender wants a private call with, or null for public. A private
  // call only opens when two players name each other.
  z.strictObject({ type: z.literal('media.private'), with: fingerprintSchema.nullable() }),
  // Shared activities (games, group projects). Members address the host,
  // which delivers to one member (`to`) or everyone (`to: null`) and names
  // the real sender, so a member can never speak for someone else.
  z.strictObject({ type: z.literal('app.send'), channel: appChannelSchema, to: fingerprintSchema.nullable(), data: appDataSchema }),
  z.strictObject({ type: z.literal('app.relay'), channel: appChannelSchema, from: fingerprintSchema, data: appDataSchema }),
]);
export type Payload = z.infer<typeof payloadSchema>;
export const eventSchema = z.strictObject({
  v: z.literal(1), kind: z.literal('event'), sessionId: idSchema, epoch: integer.min(1),
  sender: fingerprintSchema, seq: integer.min(1), payload: payloadSchema,
});
export const wireSchema = z.discriminatedUnion('kind', [
  helloSchema,
  z.strictObject({ v: z.literal(1), kind: z.literal('auth.challenge'), identity: identitySchema, transcript: transcriptSchema, signature }),
  z.strictObject({ v: z.literal(1), kind: z.literal('auth.proof'), signature }),
  z.strictObject({ v: z.literal(1), kind: z.literal('auth.ok'), signature }),
  eventSchema,
]);
export type WireMessage = z.infer<typeof wireSchema>;
/**
 * Where a media call belongs: an outdoor area, one house, or a private pair.
 * Receivers only accept calls tagged with the room they are in, so audio can
 * never leak from a house into the village or out of a private conversation.
 */
export const roomSchema = z.string().regex(/^(village|area:(?:residential|community|study)|house:[a-f0-9]{64}(?::space:[A-Za-z0-9:_-]{1,100})?|channel:[A-Za-z0-9:_-]{1,190}|pair:[a-f0-9]{64}:[a-f0-9]{64})$/);
export const mediaMetadataSchema = z.strictObject({
  v: z.literal(2), kind: z.enum(['audio', 'screen']), sessionId: idSchema,
  epoch: integer.min(1), room: roomSchema, identityId: fingerprintSchema, token: nonce,
});
export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;
export const cameraPresenceSchema = z.strictObject({ game: z.enum(['werewolves', 'tetris', 'gartic', 'village']).nullable(), request: z.boolean() });
export const cameraMetadataSchema = z.strictObject({
  v: z.literal(2), kind: z.literal('camera'), sessionId: idSchema, epoch: integer.min(1),
  room: z.string().regex(/^(village|area:(?:residential|community|study)|house:[a-f0-9]{64}(?::space:[A-Za-z0-9_-]{1,32}:(?:floor|room:[A-Za-z0-9_-]{1,32}))?):game:(werewolves|tetris|gartic|village)$/),
  identityId: fingerprintSchema, token: nonce,
});
export function parseWire(raw: unknown): WireMessage {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > LIMITS.messageBytes) throw new Error('Mensaje fuera de límites.');
  return wireSchema.parse(JSON.parse(raw));
}

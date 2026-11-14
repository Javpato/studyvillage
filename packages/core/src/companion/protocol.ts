import {z} from 'zod';
export const COMPANION_TOOLS=['notebook','whiteboard','avatar','animal','focus','media'] as const;
export const companionToolSchema=z.enum(COMPANION_TOOLS);
export type CompanionTool=typeof COMPANION_TOOLS[number];
export const PAIR_PROTOCOL=4;
export const PAIR_CONNECT_TIMEOUT=20000;
const id=z.string().uuid();
export const pairPacketSchema=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('hello'),version:z.number().int().optional(),name:z.string().min(1).max(60),nonce:id}),
 z.strictObject({type:z.literal('pending'),version:z.number().int(),nonce:id}),
 z.strictObject({type:z.literal('approved'),session:id,nonce:id,primary:z.enum(['creator','joiner']),tools:z.array(companionToolSchema).max(6),name:z.string().max(60)}),
 z.strictObject({type:z.literal('ready'),session:id}),
 z.strictObject({type:z.literal('request'),session:id,id,seq:z.number().int().positive(),tool:companionToolSchema,action:z.string().max(40),context:z.string().max(200).nullable(),value:z.unknown()}),
 z.strictObject({type:z.literal('reply'),session:id,id,ok:z.boolean(),value:z.unknown()}),
 z.strictObject({type:z.literal('view'),session:id,tool:companionToolSchema.nullable(),key:z.string().max(200)}),
 z.strictObject({type:z.literal('ping'),session:id}),
 z.strictObject({type:z.literal('bye')}),
]);
export type PairPacket=z.infer<typeof pairPacketSchema>;
export const PAIR_LIFETIME=5*60*1000;
export type PairRole='primary'|'companion';
export interface PairState {phase:'idle'|'preparing'|'inviting'|'connecting'|'waiting'|'approval'|'finalizing'|'linked'|'disconnected';code:string;expires:number;localName:string;remoteName:string;role:PairRole|null;tools:CompanionTool[];error:string;}

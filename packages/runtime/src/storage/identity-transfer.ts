import { AppError } from '../../../core/src/errors';
import { z } from 'zod';
import { decryptIdentity, validatePublicIdentity } from '../../../core/src/identity';
import type { EncryptedIdentity, LocalIdentity } from '../../../core/src/protocol/types';

const transferSchema=z.strictObject({format:z.literal('studyvillage-identity'),version:z.literal(1),identity:z.strictObject({
 v:z.literal(1),kdf:z.literal('PBKDF2-SHA256'),iterations:z.number().int().min(310000).max(1000000),salt:z.string().length(22),iv:z.string().length(16),ciphertext:z.string().min(100).max(4096),
 publicIdentity:z.strictObject({fingerprint:z.string().regex(/^[a-f0-9]{64}$/),publicKey:z.string().min(32).max(2048),displayName:z.string().min(1).max(32),color:z.string().regex(/^#[a-f0-9]{6}$/i)}),
})});
export function exportIdentityTransfer(identity:EncryptedIdentity):string{return JSON.stringify(transferSchema.parse({format:'studyvillage-identity',version:1,identity}),null,2);}
export async function inspectIdentityTransfer(text:string):Promise<EncryptedIdentity>{
 if(new TextEncoder().encode(text).length>16384)throw new AppError('invalid','La copia de identidad supera 16 KiB.');
 const {identity}=transferSchema.parse(JSON.parse(text));await validatePublicIdentity(identity.publicIdentity);return identity;
}
/** The encrypted private key must decrypt and sign a fresh challenge; a public card never suffices. */
export async function unlockIdentityTransfer(text:string,passphrase:string):Promise<{encrypted:EncryptedIdentity;identity:LocalIdentity}>{
 const encrypted=await inspectIdentityTransfer(text);return {encrypted,identity:await decryptIdentity(encrypted,passphrase)};
}

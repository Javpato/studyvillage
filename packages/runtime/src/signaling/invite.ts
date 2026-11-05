import { fromBase64, randomId, toBase64 } from '../../../core/src/identity';
import { inviteSchema, type Invite } from '../../../core/src/protocol/schema';

export function createInvite(hostFingerprint: string, endpoint: string, sessionId: string, epoch: number, generation: number, now = Date.now()): Invite {
  return inviteSchema.parse({ v: 1, hostFingerprint, endpoint, sessionId, epoch, generation, secret: randomId(32), expiresAt: now + 3_600_000 });
}
export function encodeInvite(invite: Invite): string { return toBase64(new TextEncoder().encode(JSON.stringify(inviteSchema.parse(invite)))); }
export function parseInvite(input: string, now = Date.now()): Invite {
  const value = input.trim();
  if (value.length > 4096) throw new Error('Invitación demasiado grande.');
  const json = value.startsWith('{') ? value : new TextDecoder('utf-8', { fatal: true }).decode(fromBase64(value));
  const invite = inviteSchema.parse(JSON.parse(json));
  if (invite.expiresAt <= now) throw new Error('EXPIRED_INVITE');
  return invite;
}

import { describe, expect, it } from 'vitest';
import { decryptIdentity, encryptIdentity, exportContact, generateIdentity, parseContact, randomId, sign, verify } from '../../packages/core/src/identity';
import { createInvite, encodeInvite, parseInvite } from '../../packages/runtime/src/signaling/invite';

describe('WebCrypto identity (real cryptographic implementation)', () => {
  it('encrypts keys with authenticated metadata and rejects wrong passphrases', async () => {
    const identity = await generateIdentity('Alicia', '#32a887');
    const encrypted = await encryptIdentity(identity, 'correct horse battery');
    expect(JSON.stringify(encrypted)).not.toContain('privateKey');
    const restored = await decryptIdentity(encrypted, 'correct horse battery');
    expect(restored.public).toEqual(identity.public);
    expect(await verify(identity.public, 'test', { nonce: randomId() }, await sign(restored, 'different', {}))).toBe(false);
    const signature = await sign(restored, 'test', { value: 1 });
    expect(await verify(identity.public, 'test', { value: 1 }, signature)).toBe(true);
    await expect(decryptIdentity(encrypted, 'incorrect password')).rejects.toThrow('desbloquear');
    await expect(decryptIdentity({ ...encrypted, publicIdentity: { ...encrypted.publicIdentity, displayName: 'Otro' } }, 'correct horse battery')).rejects.toThrow('desbloquear');
  });
  it('contacts contain public fields only and recompute their fingerprint', async () => {
    const identity = await generateIdentity('Duplicado', '#32a887');
    const json = exportContact(identity, randomId());
    expect(await parseContact(json)).toMatchObject({ identity: identity.public });
    expect(Object.keys(JSON.parse(json).identity).sort()).toEqual(['color', 'displayName', 'fingerprint', 'publicKey']);
    const forged = JSON.parse(json); forged.identity.fingerprint = '0'.repeat(64);
    await expect(parseContact(JSON.stringify(forged))).rejects.toThrow('huella');
    const extra = JSON.parse(json); extra.identity.privateKey = 'not-allowed';
    await expect(parseContact(JSON.stringify(extra))).rejects.toThrow();
  });
  it('binds signatures to roles, sessions, epochs, both endpoints and nonces', async () => {
    const identity = await generateIdentity('Alicia', '#32a887');
    const transcript = { sessionId: 'session', epoch: 1, from: 'first', to: 'second', initiatorNonce: randomId(32), responderNonce: randomId(32) };
    const signature = await sign(identity, 'auth-initiator', transcript);
    expect(await verify(identity.public, 'auth-initiator', transcript, signature)).toBe(true);
    for (const [key, value] of Object.entries({ sessionId: 'other', epoch: 2, from: 'impostor', to: 'impostor', initiatorNonce: randomId(32), responderNonce: randomId(32) })) {
      expect(await verify(identity.public, 'auth-initiator', { ...transcript, [key]: value }, signature)).toBe(false);
    }
    expect(await verify(identity.public, 'auth-responder', transcript, signature)).toBe(false);
    const sameName = await generateIdentity('Alicia', '#32a887');
    expect(await verify(sameName.public, 'auth-initiator', transcript, signature)).toBe(false);
  });
  it('accepts JSON/base64 invitations, rejects expiry and extra fields', () => {
    const invite = createInvite('a'.repeat(64), 'peer-id', 'session-id', 1, 1, 1000);
    expect(parseInvite(encodeInvite(invite), 1001)).toEqual(invite);
    expect(parseInvite(JSON.stringify(invite), 1001)).toEqual(invite);
    expect(() => parseInvite(encodeInvite(invite), invite.expiresAt)).toThrow('EXPIRED_INVITE');
    expect(() => parseInvite(JSON.stringify({ ...invite, filePath: '/private/file' }), 1001)).toThrow();
  });
});

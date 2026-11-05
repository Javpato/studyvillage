import { z } from 'zod';
import type { Contact, EncryptedIdentity, LocalIdentity, PublicIdentity } from '../protocol/types';
import { identitySchema } from '../protocol/schema';

const encoder = new TextEncoder();
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Codificación inválida.');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (toBase64(bytes) !== value) throw new Error('Codificación no canónica.');
  return bytes;
}
export function randomId(bytes = 24): string { return toBase64(crypto.getRandomValues(new Uint8Array(bytes))); }
export async function fingerprint(publicKey: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', fromBase64(publicKey));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function validatePublicIdentity(input: unknown): Promise<PublicIdentity> {
  const identity = identitySchema.parse(input);
  if (await fingerprint(identity.publicKey) !== identity.fingerprint) throw new Error('La huella no coincide con la clave.');
  await importPublicKey(identity.publicKey);
  return identity;
}
async function importPublicKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', fromBase64(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}
export async function generateIdentity(name: string, color: string): Promise<LocalIdentity> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = toBase64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
  return { public: identitySchema.parse({ publicKey, fingerprint: await fingerprint(publicKey), displayName: name, color }), privateKey: pair.privateKey };
}
/** Fixed ordering at every depth makes signatures independent of JSON key order. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export async function sign(identity: LocalIdentity, domain: string, value: unknown): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, identity.privateKey, encoder.encode(`StudyVillage/v1/${domain}\n${canonical(value)}`))));
}
export async function verify(identity: PublicIdentity, domain: string, value: unknown, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await importPublicKey(identity.publicKey), fromBase64(signature), encoder.encode(`StudyVillage/v1/${domain}\n${canonical(value)}`));
  } catch { return false; }
}
const encryptedSchema = z.strictObject({
  v: z.literal(1), kdf: z.literal('PBKDF2-SHA256'), iterations: z.number().int().min(310_000).max(1_000_000),
  salt: z.string().length(22), iv: z.string().length(16), ciphertext: z.string().min(100).max(4096), publicIdentity: identitySchema,
});
async function encryptionKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  if (passphrase.length < 10 || passphrase.length > 1024) throw new Error('Usa una contraseña de entre 10 y 1024 caracteres.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptIdentity(identity: LocalIdentity, passphrase: string): Promise<EncryptedIdentity> {
  const publicIdentity = await validatePublicIdentity(identity.public);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 600_000;
  const privateBytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', identity.privateKey));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(canonical(publicIdentity)) }, await encryptionKey(passphrase, salt, iterations), privateBytes);
    return { v: 1, kdf: 'PBKDF2-SHA256', iterations, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), publicIdentity };
  } finally { privateBytes.fill(0); }
}
export async function decryptIdentity(input: EncryptedIdentity, passphrase: string): Promise<LocalIdentity> {
  const encrypted = encryptedSchema.parse(input);
  const publicIdentity = await validatePublicIdentity(encrypted.publicIdentity);
  let privateBytes: Uint8Array<ArrayBuffer> | undefined;
  try {
    privateBytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(encrypted.iv), additionalData: encoder.encode(canonical(publicIdentity)) }, await encryptionKey(passphrase, fromBase64(encrypted.salt), encrypted.iterations), fromBase64(encrypted.ciphertext)));
    const privateKey = await crypto.subtle.importKey('pkcs8', privateBytes, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const identity = { public: publicIdentity, privateKey };
    const challenge = randomId(32);
    if (!await verify(publicIdentity, 'key-check', challenge, await sign(identity, 'key-check', challenge))) throw new Error('Clave incorrecta.');
    return identity;
  } catch { throw new Error('No se pudo desbloquear la identidad. Comprueba la contraseña y el archivo.'); }
  finally { privateBytes?.fill(0); }
}
const contactSchema = z.strictObject({ schemaVersion: z.literal(1), identity: identitySchema, friendCode: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/) });
export function exportContact(identity: LocalIdentity | PublicIdentity, friendCode: string): string {
  return JSON.stringify(contactSchema.parse({ schemaVersion: 1, identity: 'public' in identity ? identity.public : identity, friendCode }), null, 2);
}
export async function parseContact(json: string): Promise<Contact> {
  if (new TextEncoder().encode(json).byteLength > 8192) throw new Error('Contacto demasiado grande.');
  const contact = contactSchema.parse(JSON.parse(json));
  return { ...contact, identity: await validatePublicIdentity(contact.identity) };
}

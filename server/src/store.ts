import { parseWorkspaceForSpace, workspaceRoomStorageId, type HouseSpace, type WorkspaceDocument } from '../../packages/core/src/house/workspaces';
import {mailboxNotesSchema,type MailboxNote} from '../../packages/core/src/house/mailbox';
/**
 * Durable world state in SQLite (node:sqlite, built into Node 24).
 * Stores residents, plots, houses, access, boards, private inboxes and invitations.
 * Presence, calls and game rounds are transient. Inbox contents are never part of public house data.
 * Every mutation runs in one IMMEDIATE transaction before it is acknowledged.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PublicIdentity { fingerprint: string; publicKey: string; displayName: string; color: string }
export interface ResidentRow { fingerprint: string; identity: PublicIdentity; plot: number; neighborhood: number; admin: boolean; joinedAt: number }
export interface InviteRow { id: string; label: string; uses: number; used: number; expiresAt: number; revoked: boolean; createdAt: number }
export interface StoredStroke { stroke: { id: string; author: string; seq: number; deleted: boolean; boardId: string } & Record<string, unknown>; signature: string }

const b64 = (bytes: Buffer) => bytes.toString('base64url');
export const hashSecret = (secret: string) => createHash('sha256').update(`studyvillage-server/v1\n${secret}`).digest('hex');
export function sameHash(a: string, b: string): boolean { const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex'); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); }

export class StorageError extends Error { constructor(cause: unknown) { super('storage', { cause }); } }

export class Store {
  readonly db: DatabaseSync;
  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS residents (fingerprint TEXT PRIMARY KEY, identity TEXT NOT NULL, neighborhood INTEGER NOT NULL, plot INTEGER NOT NULL, admin INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL, UNIQUE (neighborhood, plot));
      CREATE TABLE IF NOT EXISTS houses (owner TEXT PRIMARY KEY REFERENCES residents(fingerprint), revision INTEGER NOT NULL, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces (owner TEXT NOT NULL REFERENCES residents(fingerprint), floor TEXT NOT NULL, room TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL, PRIMARY KEY(owner,floor,room));
      CREATE TABLE IF NOT EXISTS mailboxes (owner TEXT PRIMARY KEY REFERENCES residents(fingerprint), document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS strokes (board TEXT NOT NULL, id TEXT NOT NULL, author TEXT NOT NULL, seq INTEGER NOT NULL, deleted INTEGER NOT NULL, document TEXT NOT NULL, PRIMARY KEY (board, id));
      CREATE TABLE IF NOT EXISTS board_ops (board TEXT PRIMARY KEY, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, uses INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS requests (fingerprint TEXT NOT NULL, id TEXT NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (fingerprint, id));
    `);
    if (!this.meta('worldId')) this.transaction(() => {
      this.setMeta('worldId', b64(randomBytes(16)));
      this.setMeta('epoch', '1');
      this.setMeta('maxOnline', '6');
      this.setMeta('neighborhoods', '1');
      this.setMeta('schema', '1');
    });
  }
  close(): void { this.db.close(); }

  transaction<T>(work: () => T): T {
    try { this.db.exec('BEGIN IMMEDIATE'); } catch (error) { throw new StorageError(error); }
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { try { this.db.exec('ROLLBACK'); } catch { /* Already rolled back. */ } throw error instanceof StorageError || !(error instanceof Error && /SQLITE|disk|database/i.test(error.message)) ? error : new StorageError(error); }
  }

  meta(key: string): string | undefined { return (this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value; }
  setMeta(key: string, value: string): void { this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value); }
  get worldId(): string { return this.meta('worldId')!; }
  get epoch(): number { return Number(this.meta('epoch')); }
  get maxOnline(): number { return Number(this.meta('maxOnline')); }
  get neighborhoods(): number { return Number(this.meta('neighborhoods')); }

  /** Writes the one-time claim secret hash; returns false when an administrator already exists. */
  setClaimSecret(secret: string): boolean {
    if (this.admin()) return false;
    this.transaction(() => this.setMeta('claimHash', hashSecret(secret)));
    return true;
  }
  claimMatches(secret: string): boolean { const stored = this.meta('claimHash'); return !!stored && sameHash(stored, hashSecret(secret)); }

  admin(): ResidentRow | null { return this.residents().find(r => r.admin) ?? null; }
  resident(fingerprint: string): ResidentRow | null {
    const row = this.db.prepare('SELECT * FROM residents WHERE fingerprint = ?').get(fingerprint) as Record<string, unknown> | undefined;
    return row ? this.residentRow(row) : null;
  }
  residents(): ResidentRow[] { return (this.db.prepare('SELECT * FROM residents ORDER BY neighborhood, plot').all() as Record<string, unknown>[]).map(r => this.residentRow(r)); }
  private residentRow(row: Record<string, unknown>): ResidentRow {
    return { fingerprint: String(row.fingerprint), identity: JSON.parse(String(row.identity)), neighborhood: Number(row.neighborhood), plot: Number(row.plot), admin: Number(row.admin) === 1, joinedAt: Number(row.joined_at) };
  }
  /** First free plot, filling neighbourhood 0 before 1, and so on. */
  freePlot(): { neighborhood: number; plot: number } | null {
    const taken = new Set(this.residents().map(r => `${r.neighborhood}:${r.plot}`));
    for (let n = 0; n < this.neighborhoods; n++) for (let p = 0; p < 6; p++) if (!taken.has(`${n}:${p}`)) return { neighborhood: n, plot: p };
    return null;
  }
  addResident(identity: PublicIdentity, admin: boolean, now: number): ResidentRow {
    const place = this.freePlot();
    if (!place) throw new Error('no-plot');
    this.db.prepare('INSERT INTO residents (fingerprint, identity, neighborhood, plot, admin, joined_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(identity.fingerprint, JSON.stringify(identity), place.neighborhood, place.plot, admin ? 1 : 0, now);
    if (admin) this.db.prepare("DELETE FROM meta WHERE key = 'claimHash'").run();
    return this.resident(identity.fingerprint)!;
  }
  updateIdentity(identity: PublicIdentity): void { this.db.prepare('UPDATE residents SET identity = ? WHERE fingerprint = ?').run(JSON.stringify(identity), identity.fingerprint); }

  /** Raising capacity creates neighbourhoods; lowering never deletes them or their houses. */
  setCapacity(maxOnline: number, neighborhoods: number): void {
    this.setMeta('maxOnline', String(maxOnline));
    this.setMeta('neighborhoods', String(Math.max(this.neighborhoods, neighborhoods)));
  }

  house(owner: string): { revision: number; document: unknown } | null {
    const row = this.db.prepare('SELECT revision, document FROM houses WHERE owner = ?').get(owner) as { revision: number; document: string } | undefined;
    return row ? { revision: Number(row.revision), document: JSON.parse(row.document) } : null;
  }
  putHouse(owner: string, revision: number, document: unknown): void {
    this.db.prepare('INSERT INTO houses (owner, revision, document) VALUES (?, ?, ?) ON CONFLICT(owner) DO UPDATE SET revision = excluded.revision, document = excluded.document').run(owner, revision, JSON.stringify(document));
  }

  workspace(owner:string,space:HouseSpace):WorkspaceDocument|null {
    const row=this.db.prepare('SELECT document FROM workspaces WHERE owner=? AND floor=? AND room=?').get(owner,space.floorId,workspaceRoomStorageId(space)) as {document:string}|undefined;
    return row?parseWorkspaceForSpace(space,JSON.parse(row.document)):null;
  }
  mailbox(owner:string):MailboxNote[]{const row=this.db.prepare('SELECT document FROM mailboxes WHERE owner=?').get(owner) as {document:string}|undefined;return mailboxNotesSchema.parse(row?JSON.parse(row.document):[]);}
  putMailbox(owner:string,notes:MailboxNote[]):void{const parsed=mailboxNotesSchema.parse(notes);this.transaction(()=>this.db.prepare('INSERT INTO mailboxes(owner,document) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET document=excluded.document').run(owner,JSON.stringify(parsed)));}
  putWorkspace(owner:string,space:HouseSpace,doc:WorkspaceDocument):void {
    const parsed=parseWorkspaceForSpace(space,doc);this.transaction(()=>this.db.prepare('INSERT INTO workspaces(owner,floor,room,revision,document) VALUES(?,?,?,?,?) ON CONFLICT(owner,floor,room) DO UPDATE SET revision=excluded.revision,document=excluded.document').run(owner,space.floorId,workspaceRoomStorageId(space),parsed.revision,JSON.stringify(parsed)));
  }
  removeWorkspace(owner:string,space:HouseSpace):void { this.transaction(()=>{const room=workspaceRoomStorageId(space);this.db.prepare('DELETE FROM workspaces WHERE owner=? AND floor=? AND room=?').run(owner,space.floorId,room);const prefix=`house:${owner}:space:${space.floorId}:${room}:`;for(const table of ['strokes','board_ops'])this.db.prepare(`DELETE FROM ${table} WHERE substr(board,1,length(?))=?`).run(prefix,prefix);}); }
  strokes(board: string): StoredStroke[] { return (this.db.prepare('SELECT document FROM strokes WHERE board = ? ORDER BY id').all(board) as { document: string }[]).map(r => JSON.parse(r.document)); }
  stroke(board: string, id: string): StoredStroke | null { const row = this.db.prepare('SELECT document FROM strokes WHERE board = ? AND id = ?').get(board, id) as { document: string } | undefined; return row ? JSON.parse(row.document) : null; }
  operations(board: string): number { return Number((this.db.prepare('SELECT count FROM board_ops WHERE board = ?').get(board) as { count: number } | undefined)?.count ?? 0); }
  putStroke(board: string, document: StoredStroke): void {
    const s = document.stroke;
    this.db.prepare('INSERT INTO strokes (board, id, author, seq, deleted, document) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(board, id) DO UPDATE SET seq = excluded.seq, deleted = excluded.deleted, document = excluded.document')
      .run(board, s.id, s.author, s.seq, s.deleted ? 1 : 0, JSON.stringify(document));
    this.db.prepare('INSERT INTO board_ops (board, count) VALUES (?, 1) ON CONFLICT(board) DO UPDATE SET count = count + 1').run(board);
  }

  createInvite(label: string, uses: number, expiresAt: number, now: number): { id: string; code: string } {
    const id = b64(randomBytes(9)), code = b64(randomBytes(24));
    this.db.prepare('INSERT INTO invites (id, code_hash, label, uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, hashSecret(code), label, uses, expiresAt, now);
    return { id, code };
  }
  invite(code: string): InviteRow | null {
    const row = this.db.prepare('SELECT * FROM invites WHERE code_hash = ?').get(hashSecret(code)) as Record<string, unknown> | undefined;
    return row ? this.inviteRow(row) : null;
  }
  invites(): InviteRow[] { return (this.db.prepare('SELECT * FROM invites ORDER BY created_at DESC LIMIT 100').all() as Record<string, unknown>[]).map(r => this.inviteRow(r)); }
  private inviteRow(row: Record<string, unknown>): InviteRow {
    return { id: String(row.id), label: String(row.label), uses: Number(row.uses), used: Number(row.used), expiresAt: Number(row.expires_at), revoked: Number(row.revoked) === 1, createdAt: Number(row.created_at) };
  }
  useInvite(id: string): void { this.db.prepare('UPDATE invites SET used = used + 1 WHERE id = ?').run(id); }
  revokeInvite(id: string): boolean { return Number(this.db.prepare('UPDATE invites SET revoked = 1 WHERE id = ?').run(id).changes) > 0; }

  request(fingerprint: string, id: string): unknown | undefined {
    const row = this.db.prepare('SELECT result FROM requests WHERE fingerprint = ? AND id = ?').get(fingerprint, id) as { result: string } | undefined;
    return row ? JSON.parse(row.result) : undefined;
  }
  rememberRequest(fingerprint: string, id: string, result: unknown, now: number): void {
    this.db.prepare('INSERT OR REPLACE INTO requests (fingerprint, id, result, at) VALUES (?, ?, ?, ?)').run(fingerprint, id, JSON.stringify(result ?? null), now);
  }
  pruneRequests(before: number): void { this.db.prepare('DELETE FROM requests WHERE at < ?').run(before); }

  /** Consistent online copy (SQLite VACUUM INTO) while the server keeps running. */
  backup(target: string): void { mkdirSync(dirname(target), { recursive: true }); this.db.prepare('VACUUM INTO ?').run(target); }
}

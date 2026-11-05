const { DatabaseSync } = require('node:sqlite');
const { existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const MAX_BYTES = 2 * 1024 * 1024;
function validateDocument(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json) > MAX_BYTES) throw new Error('Invalid local document size');
  const value = JSON.parse(json);
  const keys = ['schemaVersion', 'profile', 'house', 'friendCode', 'contacts', 'encryptedIdentity', 'editor', 'projectLinks'];
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!object(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k)) || value.schemaVersion !== 1) throw new Error('Unsupported local document');
  if (!object(value.profile) || !(value.house === null || object(value.house)) || typeof value.friendCode !== 'string' || typeof value.editor !== 'string' || !Array.isArray(value.contacts) || value.contacts.length > 100 || !object(value.projectLinks) || Object.keys(value.projectLinks).length > 32) throw new Error('Invalid local fields');
  if (value.encryptedIdentity !== null) {
    const e = value.encryptedIdentity;
    const allowed = ['v', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext', 'publicIdentity'];
    if (!object(e) || Object.keys(e).length !== allowed.length || Object.keys(e).some(k => !allowed.includes(k)) || e.v !== 1 || e.kdf !== 'PBKDF2-SHA256' || typeof e.ciphertext !== 'string') throw new Error('Only encrypted identities may be saved');
  }
  return json;
}
function openStore(filename) {
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  try {
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Local database is damaged; original preserved');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('Newer database version; original preserved');
    if (version === 0) db.exec('BEGIN; CREATE TABLE IF NOT EXISTS local_state (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL); PRAGMA user_version = 1; COMMIT;');
    return {
      load() { const row = db.prepare('SELECT document FROM local_state WHERE id=1').get(); return row ? validateDocument(row.document) : null; },
      save(json) { validateDocument(json); db.prepare('INSERT INTO local_state (id,document) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(json); },
      close() { db.close(); },
    };
  } catch (e) { db.close(); throw e; }
}
function readLegacyStorage(dataDir) {
  const filename = path.join(dataDir, 'localstorage', 'tauri_localhost_0.localstorage');
  if (!existsSync(filename)) return {};
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const result = {};
    for (const row of db.prepare('SELECT key,value FROM ItemTable').all()) {
      if (typeof row.key === 'string' && row.key.startsWith('studyvillage-')) result[row.key] = Buffer.from(row.value).toString('utf16le');
    }
    return result;
  } finally { db.close(); }
}
module.exports = { openStore, validateDocument, readLegacyStorage };

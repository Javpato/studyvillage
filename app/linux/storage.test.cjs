const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openStore, readLegacyStorage } = require('./storage.cjs');
const document = JSON.stringify({ schemaVersion: 1, profile: { displayName: 'Test', color: '#123456' }, house: null, friendCode: 'test-code', contacts: [], encryptedIdentity: null, editor: 'keep my notes', projectLinks: {} });
function fixture(t) { const dir = mkdtempSync(path.join(tmpdir(), 'studyvillage-storage-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
test('reads existing Tauri SQLite, preserves invalid writes and persists valid updates', t => {
 const dir = fixture(t), filename = path.join(dir, 'studyvillage.sqlite3');
 const native = new DatabaseSync(filename); native.exec('CREATE TABLE local_state (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL); PRAGMA user_version=1;');native.prepare('INSERT INTO local_state VALUES(1,?)').run(document);native.close();
 const store = openStore(filename);assert.equal(store.load(), document);
 assert.throws(() => store.save(JSON.stringify({ ...JSON.parse(document), privateKey: 'secret' })));
 assert.equal(store.load(), document);const updated = JSON.stringify({ ...JSON.parse(document), editor: 'updated' });store.save(updated);store.close();
 const reopened = openStore(filename);assert.equal(reopened.load(), updated);reopened.close();
});
test('rejects newer versions without resetting or overwriting', t => {
 const filename = path.join(fixture(t), 'state.db');const db=new DatabaseSync(filename);db.exec('PRAGMA user_version=2');db.close();assert.throws(()=>openStore(filename));const read=new DatabaseSync(filename);assert.equal(read.prepare('PRAGMA user_version').get().user_version,2);read.close();
});
test('imports Unicode WebKit app storage read-only, excluding unrelated keys', t => {
 const dir=fixture(t);mkdirSync(path.join(dir,'localstorage'));const filename=path.join(dir,'localstorage/tauri_localhost_0.localstorage');const db=new DatabaseSync(filename);db.exec('CREATE TABLE ItemTable (key TEXT UNIQUE,value BLOB)');const put=db.prepare('INSERT INTO ItemTable VALUES(?,?)');put.run('studyvillage-notes',Buffer.from('¡Apuntes! 📝','utf16le'));put.run('other',Buffer.from('private','utf16le'));db.close();assert.deepEqual(readLegacyStorage(dir),{'studyvillage-notes':'¡Apuntes! 📝'});const read=new DatabaseSync(filename);assert.equal(read.prepare('SELECT count(*) AS n FROM ItemTable').get().n,2);read.close();
});

# Persistence, backups, and recovery

Source entry points: [packages/runtime/src/storage/local-store.ts](../packages/runtime/src/storage/local-store.ts), [packages/runtime/src/storage/backup.ts](../packages/runtime/src/storage/backup.ts), [packages/documents/src/repository.ts](../packages/documents/src/repository.ts), [server/src/store.ts](../server/src/store.ts).

## The storage layers

StudyVillage does not have one interchangeable database. Each layer has a different responsibility:

| Layer | Implementation | What it holds |
|---|---|---|
| Device profile | `packages/runtime/src/storage/local-store.ts` | Profile, encrypted identity, contacts, own house, local editor state |
| Browser profile database | IndexedDB `studyvillage-local`, store `own-data` | Canonical committed profile record named `state` |
| Desktop profile | `app/linux/storage.cjs` via preload | Desktop local-state persistence and controlled legacy migration |
| Small browser stores | Runtime key-value adapter and feature models | Settings, study libraries, workspaces, legacy boards and progress |
| Notebook database | `packages/documents/src/repository.ts` | Private notebooks, PDF attachments, durable shared states and outgoing operations |
| Persistent world | `server/src/store.ts` | Residents, houses, room workspaces, private mailboxes, strokes, invitations and request results |

`openLocalStore()` chooses the Electron bridge first, a Tauri invoke adapter when the retained native environment is detected, otherwise IndexedDB. The presence of `app/src-tauri` therefore still has code references; it is not disposable merely because current desktop packages use Electron.

The browser profile adopts `studyvillage-local-sync` only if no committed canonical profile exists. Invalid stored data produces an error and is preserved; startup must not quietly reset it. A new development origin has separate storage from the published app, even on the same machine.

## Notebook transactions and concurrent editing

The notebook repository uses database `studyvillage-notebooks-v1`, currently at IndexedDB version 3. Its stores are `notebooks`, `attachments`, `sharedStates` and `outbox`. On a version change it closes the connection; blocked upgrades ask the user to close other windows.

`save(notebook)` validates a new revision and performs a read/write transaction. If the stored revision differs from the caller's revision, it aborts rather than overwriting another window's changes. Success resolves on transaction completion, not merely after issuing a write. Preserve this distinction when adding save indicators.

Attachments have immutable IDs: reusing an ID with different bytes aborts. Each PDF attachment is limited to 20 MiB. Snapshot exports include only attachments referenced by notebook pages, base64 content, and a SHA-256 hash. Import validates notebook and attachment IDs, required references, hashes and size before replacing notebook/attachment stores in a transaction.

## Three different exports

1. A personal notebook export preserves editable page geometry; its model parser has a 25 MiB bound and rejects duplicate object/page IDs and notebooks without an undeleted page.
2. A full device backup includes the local profile, an allowlisted set of local-storage values, notebooks and attachments. It is parsed by `packages/runtime/src/storage/backup.ts`, with a 128 MiB outer bound and nested schema/complexity limits.
3. A server backup captures the authoritative SQLite world. It does not substitute for personal notebook exports on each device.

Never infer that a PNG or flattened PDF is an editable recovery file. Sharing one PDF page intentionally removes attachment bytes for privacy.

## Safe full-device restore

The application previews the incoming profile, identity, counts and conflicts. Before overwrite, `restoreBackup` captures the current state and writes both `pending` and `previous` entries to `studyvillage-backup-recovery`. It applies the new snapshot, then clears `pending`. If applying fails, it attempts rollback; if rollback also fails, the journal remains for the next startup. `recoverInterruptedRestore` runs before normal profile loading.

This journal matters because profile, settings and notebook stores do not all share a single transaction. Do not remove it in a cleanup or report success before the restore resolves. `previousBackup()` provides the preceding snapshot for recovery.

## Shared-page outbox

An edit is enqueued durably before sending. Each entry contains an ID, namespace, scope and operation. It belongs to its original session/room. Acknowledgement removes the entry; a lost acknowledgement resends the same operation ID. A conflict is recoverable work, not disposable cache. The UI can save a private draft before discarding pending sends. See [ink](INK.md) for author-specific undo and authority rules.

## Server recovery

The server uses WAL, `synchronous=FULL`, foreign keys and `BEGIN IMMEDIATE` transactions. `backup` uses SQLite `VACUUM INTO` to create a consistent online copy. Stop the server before `restore`; the CLI checks a StudyVillage world ID, preserves `world.sqlite.before-restore`, and handles WAL/SHM companions. Use the same explicit `DATA_DIR` for start, backup and restore. Never run a diagnostic restore against real data.

## Verification and troubleshooting

Run storage, document, identity-transfer and ink-recovery unit tests, then the backup and shared-notebook browser journeys when changing this area. Diagnose quota failures, blocked upgrades, cross-window revision conflicts, missing PDF attachments and mismatched hashes separately. Export recoverable work before repair. Deleting browser data is destructive to user content and is not a general troubleshooting step.

# Identity, permissions, and security boundaries

Source entry points: [packages/core/src/identity/index.ts](../packages/core/src/identity/index.ts), [packages/runtime/src/storage/identity-transfer.ts](../packages/runtime/src/storage/identity-transfer.ts), [app/tests/identity.test.ts](../app/tests/identity.test.ts).

## Identity is independent of a display name

The implementation lives in `packages/core/src/identity/index.ts`. An identity contains an ECDSA P-256 key pair. The public key is exported as SPKI and encoded with canonical URL-safe Base64; its SHA-256 digest is the fingerprint used for ownership. Changing a display name is not a transfer of ownership. A matching name alone cannot establish that a returning visitor owns a house or a stroke.

`generateIdentity(name, color)` creates an identity; `validatePublicIdentity(input)` checks the schema, recomputes the fingerprint, and imports the public key. `sign(identity, domain, value)` signs a canonical JSON representation prefixed with `StudyVillage/v1/` and a domain. Object keys are sorted recursively, while array order remains meaningful. Both domain separation and canonicalization must be retained when extending signed messages: the same object must not acquire different meanings in different protocols.

## Saving and unlocking

`encryptIdentity` wraps the private PKCS#8 key with AES-256-GCM. Its key comes from PBKDF2-SHA256 with 600,000 iterations, a random 16-byte salt, and a random 12-byte IV. The canonical public identity is authenticated additional data, tying the public metadata to the encrypted key. The accepted encrypted format is version 1; validation permits iteration counts from 310,000 to 1,000,000. Passphrases must contain 10–1,024 characters.

Decryption validates the public identity, decrypts the private key, then signs and verifies a fresh challenge to check the key pair. Temporary byte buffers are cleared in `finally`. This is protection for the stored private key, not a claim that every application database is encrypted or that JavaScript memory is immune to inspection.

`app/src/bootstrap.ts` opens local storage and recovers interrupted restores before loading the profile. It generates a fresh working identity even when an encrypted saved identity exists; the saved private key is not silently unlocked. Offline personal tools remain usable. Connecting as the saved person requires explicit unlock. Do not replace this flow with a compulsory account overlay.

## Contacts, transfers, and backups

A public contact export contains schema version 1, public identity and friend code. `parseContact` bounds the JSON to 8,192 bytes and validates both the structure and fingerprint. A contact file is not the private-key backup. Encrypted device transfer is handled separately by `packages/runtime/src/storage/identity-transfer.ts`. Whole-app backups include local state and notebook data; see [storage](STORAGE_BACKUPS.md).

The preserved private profile must not be used for automated tests. Synthetic identities exercise sign/verify, tampered fingerprints, wrong passphrases, malformed contacts and transfer handling in `app/tests/identity.test.ts` and `identity-transfer.test.ts`.

## Server and room permissions

Persistent servers authenticate a signed challenge and distinguish `admin`, `resident`, and `visitor`. The one-time setup claim assigns the first administrator; invitations are a separate entry mechanism. Requests remain subject to house, workspace, document-author and activity permissions after connection. Checking a button's visibility is not authorization. Access must also be checked at the authority before applying a mutation or delivering private state.

Shared notebooks accept author-specific operations with expected revisions. Personal PDF sharing creates a flattened copy of one selected page; it must not include the original attachment or neighboring private pages. Test this boundary whenever changing import, export or sharing.

## Platform and network boundaries

Electron's preload exposes fixed operations rather than generic IPC, SQL or arbitrary paths. Keep context isolation, sandboxing and disabled renderer Node integration. The browser should use the browser adapter, not simulate desktop privileges.

Peer connections expose network metadata; no anonymity or SFU-style concealment is claimed. Server origin controls require configuration, and wildcard development origins are not a production restriction. Local AI is explicitly enabled by an eligible host. Camera and microphone require separate consent. See [server](SERVER.md), [media](MEDIA.md), and [AI](AI.md) for the enforcement points.

## Change checklist

When changing identity or access logic, test wrong signatures, stale/replayed scope, unauthorized room access, duplicate request IDs, loss of permission during transfer, and locked-profile startup. Never publish private keys, claim secrets, invitations or backup contents in diagnostics. Retain stable error codes and translate their presentation at the client.

# Persistent server and wire API

Source entry points: [server/src/main.ts](../server/src/main.ts), [server/src/world.ts](../server/src/world.ts), [packages/runtime/src/server/contracts.ts](../packages/runtime/src/server/contracts.ts), [server/tests/server.test.ts](../server/tests/server.test.ts).

## Responsibilities and entry points

`server/src/main.ts` builds configuration, opens storage, constructs a `World`, exposes HTTP metadata and accepts WebSocket upgrades. `server/src/world.ts` owns authenticated connections, permissions, presence, activities and routing. `server/src/store.ts` owns SQLite persistence. `server/src/ws.ts` implements the bounded WebSocket transport. Browser integration lives in `packages/runtime/src/server/client.ts`; both sides use `contracts.ts` in that directory.

The server is a separate process from the static PWA. Publishing web assets does not provision persistent multiplayer, a TURN relay, or an AI provider.

## Start and configure

```sh
npm run server:build
DATA_DIR=./server/data HOST=127.0.0.1 PORT=8787 node server/dist/server.mjs
```

| Variable | Code default | Meaning |
|---|---|---|
| `PORT` | `8787` | Listening port |
| `HOST` | `0.0.0.0` | Bind interface; explicitly use loopback behind a local proxy |
| `DATA_DIR` | `./data` resolved from process cwd | Persistent world location |
| `WORLD_NAME` | `StudyVillage` | Display name, truncated to 48 characters |
| `ALLOWED_ORIGINS` | `*` | Comma-separated allowed origins; configure exact HTTPS origins for remote use |
| `TLS_CERT`, `TLS_KEY` | unset | Supply both for direct HTTPS, or terminate TLS at a reverse proxy |
| `CLAIM_SECRET` | generated | First-administrator setup secret |
| `OLLAMA_ENABLED` | false | Enables the server-owned optional provider |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Provider endpoint |
| `OLLAMA_MODEL` | empty | Explicit installed model |
| `OLLAMA_FEATURES` | six supported features | Feature allowlist; see [AI](AI.md) |

The `server:dev` shortcut deliberately uses wildcard origins. It is a development convenience. For internet access, use HTTPS/WSS, configure exact origins and forward WebSocket upgrades at the reverse proxy. Do not expose the one-time claim secret in an invitation or public logs.

## HTTP and WebSocket surfaces

`GET /health` and `GET /api/info` return app ID, server version, protocol, world name, online/capacity/neighborhood metadata and `needsClaim`. Responses disable caching and MIME sniffing. Other ordinary HTTP routes return 404. The upgrade path is `/ws`; the implementation checks a `/ws` prefix. Upgrade enforces origin policy, a 96 KiB message bound and a 4 MiB buffered-byte bound.

The wire protocol version is **7**; this is distinct from the package's development version and the server's `1.0.0` metadata string. A client starts with `hello`, receives a challenge, and sends `auth` with public identity and signature. The signed authentication statement includes world ID, nonce, fingerprint, saved-identity flag, and optional device ID. Welcome assigns role, neighborhood, scope, epoch and connection ID. A denial carries a stable error code.

## Request and response model

Mutating request envelopes use `{t: 'req', id, body}`; `body.op` selects a strict schema. The server records request results by fingerprint and ID for retry handling. Keep IDs stable for retries rather than treating a timeout as permission to issue a new mutation.

| Operation family | Purpose |
|---|---|
| `presence`, `appearance`, `travel` | Position, appearance and neighborhood changes |
| `house.publish`, `house.visit`, `house.decide`, `house.leave`, `house.kick`, `access.cancel` | House publishing and controlled access |
| `workspace`, `mailbox` | Typed room and private inbox commands |
| `board.select`, `board.commit` | Board subscriptions and signed mutations |
| `app.send` | Bounded, typed application channels |
| `voice`, `device.media`, `media.private`, `media.signal` | Media context, designated device and signaling |
| `import` | Explicit copy of the caller's house and boards |
| `admin.capacity`, `admin.invite.create/revoke/list` | Administrator controls |

An acknowledgement has `ok: true` with optional result, or `ok: false` with a code. Codes include version, full, invite, signature, claim, forbidden, invalid, conflict, storage, not-found, rate and unsaved. Translate these at the UI; never translate wire identifiers. Subscriptions deliver state, position, board, workspace, voice, device, application and signaling messages.

## Capacity and persistence

There are six plots per neighborhood, up to four neighborhoods and 24 online people, with up to three devices per person. New stores start with capacity six and one neighborhood. Raising capacity creates neighborhoods; lowering capacity does not delete existing neighborhoods or houses. Signing scopes contain world ID and neighborhood, preventing a signed board message from being silently reused in another neighborhood.

World SQLite tables include metadata, residents, houses, workspaces, mailboxes, strokes, board operation counts, invites and deduplicated requests. Presence, calls and game rounds are transient. Private mailboxes must not leak into public house views. See [storage](STORAGE_BACKUPS.md) for backup commands and transaction semantics.

## Development validation

Use `npm run server:test` for storage, authentication, permissions, lifecycle and provider fixtures. Use `app/tests/e2e/server.spec.ts` and `shared-notebook.spec.ts` for actual client/server journeys. Test reconnect and repeated request IDs, forbidden visitor mutations, exhausted invites, unauthorized claims and server restarts. A browser-only test that stubs a response does not prove SQLite durability or socket behavior.

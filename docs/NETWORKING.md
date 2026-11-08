# Sessions, transport, and synchronization

Source entry points: [packages/runtime/src/session/client.ts](../packages/runtime/src/session/client.ts), [packages/runtime/src/session/shared-room.ts](../packages/runtime/src/session/shared-room.ts), [packages/runtime/src/transport/bounded-channel.ts](../packages/runtime/src/transport/bounded-channel.ts), [packages/documents/src/packets.ts](../packages/documents/src/packets.ts).

## Choose the correct session model

The application supports offline personal work, a temporary village hosted by a participant, and a persistent world served by Node. `app/src/bootstrap.ts` composes either `VillageClient` from `packages/runtime/src/session/client.ts` or `ServerVillageClient` from `packages/runtime/src/server/client.ts`. UI listeners are deliberately kept above a particular connection so a client change need not destroy unrelated local work.

A temporary village depends on its original host. If the host leaves beyond the reconnect grace period, the session ends; it does not elect a replacement. Persistent activities instead run under server authority and can outlive the administrator's browser session. Do not describe a local temporary host as a deployed server.

## Signaling versus data versus media

`signaling/peerjs.ts` adapts PeerJS; `signaling/invite.ts` handles invitations; `signaling/config.ts` validates stored network preferences. Signaling coordinates endpoints. It is not the authoritative store for notebooks, nor a guarantee that every pair of networks can establish direct media.

The optional signaling override accepts HTTPS URLs without embedded credentials, query strings or fragments. TURN accepts a bounded `turn:` or `turns:` endpoint, with username and credential required. Relay-only mode requires TURN configuration. Invalid saved configuration falls back to the schema's defaults. `rtcConfiguration()` supplies Google STUN endpoints plus the configured TURN server, using `relay` or `all` as the ICE transport policy.

The `studyvillage-network-v1` setting contains these preferences. Treat TURN credentials as configuration data, not documentation examples to paste publicly. Keep microphone/camera signaling distinct from permission to receive private room information.

## Bounded transport

`transport/types.ts` defines adapters and clocks. `transport/bounded-channel.ts` queues and validates inbound messages, serializes asynchronous delivery and bounds outgoing work. Coalescing is appropriate for replaceable state such as newer positions; it must not erase distinct user edits. Overflow and transport failure close the channel and report a reason instead of growing memory indefinitely.

Notebook payloads have a separate chunking layer in `packages/documents/src/packets.ts`. Assemblies expire after 120 seconds. The receiver limits concurrent assemblies to 16 globally and two per sender, with a 25 MiB per-assembly limit and 32 MiB global accumulation limit. Changed scope/count or inconsistent repeated chunks invalidate an assembly. Packet reconstruction is followed by schema and authorization checks; transport assembly is not proof of trust.

## Shared activities

`session/shared-room.ts` wraps a domain engine, subscribes to application messages, routes actions and publishes per-person views. Its 400 ms tick supports time-based activity progress. It distinguishes local temporary authority from the server's virtual authority. `act`, `command`, `stop`, `subscribe`, `current` and `dispose` form the operational lifecycle.

Rules and private views belong in core game engines. Timers, message subscriptions and delivery belong in runtime. Presentation should not create an extra authority loop. Disposing a room must release subscriptions and timers; stopping an activity also reconciles its voice context.

## Shared documents and retries

The shared document client saves outgoing operations before transmission, retains the original namespace/scope, and retries the same operation ID if the response is lost. Authority applies expected-revision and authorship checks. Temporary hosts store acknowledged state in IndexedDB; persistent servers persist it through SQLite. A local pending indicator and a host-acknowledged indicator therefore communicate different guarantees.

Disconnecting is not grounds to discard edits or redirect the outbox into a newly joined village. Preserve conflicts as recoverable drafts. Full-page sharing is an explicit copy; it does not subscribe the private notebook to future shared changes.

## Diagnose in layers

Check invitation validity and identity unlock first, signaling reachability second, authenticated session state third, room permissions fourth, then media ICE/capture. A healthy data connection does not establish a working microphone; a camera permission denial does not prove the game engine failed. Diagnostics should retain the current session where supported.

Relevant evidence is in `network.test.ts`, `connection-config.test.ts`, `activity-scope.test.ts`, `ink-collaboration.test.ts`, the server tests and the two-client browser journeys. `scripts/verify-relay.mjs` exercises a configured relay fixture; it does not certify connectivity between every real NAT or mobile network.

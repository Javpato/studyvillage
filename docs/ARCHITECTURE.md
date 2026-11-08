# StudyVillage rebuild decisions

The user-selected destination is `../studyvillage`, an independent Git repository, overriding the brief’s suggested `remake/`. Original code and releases are read-only reference.

- Preserve the Canvas2D world and authored art: no WebGPU requirement or renderer conversion risk on older tablets.
- `packages/core`: schemas, identity, activity engines, permissions, geometry and document models. It imports neither `app` nor `runtime`. The dependency test parses all static and dynamic imports/exports; the only external dependency allowed here is Zod. The package performs no Canvas rendering or direct browser storage access.
- `packages/runtime`: transport, session authority, media, storage and platform adapters. `session/shared-room.ts` owns activity subscriptions, delivery, authority transitions and timers; the engine contracts and commands remain in core. `storage/workspaces.ts` owns browser persistence for house rooms. `storage/key-value.ts` implements the browser storage port; small legacy note, quiz, flashcard, project and whiteboard models receive it explicitly. Headless core instances without a port work in memory.
- `app/src`: presentation, world rendering, controls and composition. `whiteboard/draw.ts`, `math.ts` and `registry.ts` own Canvas/MathJax rasterisation and decoded sprite caches. Selection geometry receives a text-measurement function so the browser uses its exact rendering layout while headless consumers have a deterministic estimate. The pure TeX conversion remains in core. Compatibility exports in `app/src/house/workspaces.ts`, `assets/appearance.ts`, `errors/messages.ts` and `world/interactive-objects.ts` avoid duplicating contracts.
- `packages/documents`: independent notebook schema, subpixel ink geometry, rendering, IndexedDB repository and authoritative shared-page operations. The live editor in `app/src/notebooks` shares this engine across private notes and collaborative pages. `runtime/documents/client.ts` owns the durable outbox and reconnection; `documents/authority.ts` validates authorship, compare-and-set revisions and permissions, using IndexedDB for a peer host or SQLite for a server. Only an explicitly selected page is copied to a room; a PDF page is flattened before sharing. See [INK.md](INK.md) for protocol, recovery and measured limits.
- Existing imperative screens remain for parity while new document/input modules are independent. This is not completion of the entire architectural brief: `protocol/types.ts` still groups browser-facing ports (`MediaStream`, `File`, `HTMLCanvasElement`) with wire/domain types, and parts of runtime still use the app's error/translation presentation helpers. Legacy small stores retain their JSON persistence algorithms behind the injected key-value port; they have not all been migrated into the notebook transactional repository. These are explicit limits, not hidden circular imports from core.
- Browser development uses port 3100; desktop profile is `local.studyvillage.rebuild`; no production database is imported implicitly. Private notebooks use IndexedDB transactions independent of furniture and session identity. Shared-page acknowledgement follows durable authority storage; unacknowledged changes remain in the original room/session's outbox.
- No publication, deployment, paid services, asset relicensing or external account creation.
- French is a bundled static catalogue; live language changes never replace the transport. Domain errors use untranslated message keys; presentation translates them for the current user instead of baking an authority's language into shared state.
- Electron retains context isolation, disabled Node integration and sandboxing. See https://www.electronjs.org/docs/latest/tutorial/context-isolation .
- Pointer Events with feature detection are the common handwriting path (https://webkit.org/blog/9674/new-webkit-features-in-safari-13/). Physical stylus behavior remains unverified. PDF.js is loaded lazily so unsupported PDF rendering does not prevent village or plain notebook startup.


## Reading a change through the layers

A notebook edit begins in the canvas editor, becomes a validated document operation, is saved through the repository, and (only for a shared page) enters the runtime outbox and authority path. Rendering never establishes permission. A server acknowledgement is sent after authoritative persistence, not merely after a UI redraw. Read [storage](STORAGE_BACKUPS.md), [networking](NETWORKING.md) and [server](SERVER.md) together before changing this flow.

A furniture action begins with world hit testing and reach, resolves an interaction, opens a feature panel and addresses a room or personal model. The same tool opened from the phone should obey the same ownership and persistence rules. Furniture IDs do not own personal notebook data. Read [world](WORLD_ASSETS.md) and [study tools](STUDY_TOOLS.md) before coupling a tool to a room.

## Repository ownership

| Directory | Maintainer responsibility |
|---|---|
| `app/src` | Presentation, composition, Canvas rendering and browser input |
| `packages/core/src` | Domain schemas, identity, rules and pure algorithms |
| `packages/runtime/src` | Sessions, storage adapters, network/media and platform integration |
| `packages/documents/src` | Independent notebook, ink, repository and authority implementation |
| `server/src` | Persistent authority, bounded sockets, SQLite and optional local AI |
| `app/linux`, `app/src-tauri`, `android` | Platform code/configuration and retained compatibility |
| `scripts` | Build, package, asset and verification tooling |
| `docs` | Current handbook, specialist references and verification evidence |
| `deliverables` | Ignored current runnable/distributable packages and metadata |

Retain the current package boundaries. Moving a file requires checking imports, dynamic imports, script-relative URL resolution, Vite roots, native asset copies and test working directories. Cosmetic renaming is not sufficient reason to risk those interfaces.

## Adding behavior safely

Define the domain model and validation first, then the authority and persistence behavior, then presentation. For shared behavior, specify who may act, what each participant may see, what survives disconnect, and what retries mean. Add focused tests for those guarantees. Avoid introducing a second serializer, a second authority timer or a duplicated store when an existing layer already owns the responsibility.

## Compatibility boundaries

Legacy whiteboards and new notebook shared pages coexist. Core still includes some browser-facing port types; runtime still imports selected presentation helpers. These are documented architectural debt, not a reason to claim total isolation. `app/tests/architecture.test.ts` enforces the implemented core import boundary. Update a migration and its evidence before removing a compatibility export or native adapter.

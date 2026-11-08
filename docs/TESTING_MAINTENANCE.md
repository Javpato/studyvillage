# Testing, troubleshooting, and maintenance

Source entry points: [package.json](../package.json), [app/playwright.config.ts](../app/playwright.config.ts), [scripts/verify-pages.mjs](../scripts/verify-pages.mjs), [AGENTS.md](../AGENTS.md).

## Required baseline

From the repository root, run `npm run check`. It runs app/server type checks, app/server unit suites, translation consistency, the web/PWA build and server build. It does not run every browser suite, native package build or physical-device check. `npm run lint` currently aliases type checking; it is not a separate stylistic linter.

Use the existing tests appropriate to the changed behavior. Pure geometry, rule and serialization changes belong in unit suites. Cross-store recovery, multiple clients, media lifecycle and offline updates need integration/browser coverage. Avoid substituting a mocked view for an authoritative permission check.

## Command map

| Command | Evidence |
|---|---|
| `npm run typecheck` | Application/server TypeScript compatibility |
| `npm test` | Vitest application and server suites |
| `npm run i18n:check` | ES/EN/FR key and placeholder consistency |
| `npm run test:e2e -- <spec>` | Selected Playwright development journeys |
| `npm run test:pages` | Actual static package under its subpath, Chromium/WebKit and offline behavior |
| `npm run linux:test` | Desktop storage, migration and server-profile unit tests |
| `npm run linux:smoke` | Packaged desktop smoke journey with synthetic profiles |
| `node scripts/verify-packages.mjs` | Bundled-file consistency across existing target packages |

Inspect each Playwright configuration's web-server command and working directory when diagnosing startup failures. A duplicated `app/app` path is a runner configuration failure, not an application regression.

## Evidence quality

Record the command, date, source version, environment, result and limitations. Existing [verification history](VERIFICATION.md) includes substantial prior evidence but also superseded build hashes and earlier device feedback. Treat it as dated history, not a promise that every check was rerun after the latest change.

A Windows ZIP assembled on Linux is a build result; running it on Windows is separate evidence. A synthetic WebKit pointer is not a real Apple Pencil. A mocked Ollama endpoint proves request handling, not model quality. A passing local static bundle is not proof of successful hosting publication.

## Troubleshooting paths

- Startup graphics error: inspect manifest filenames/dimensions and loading requests; preserve saved data.
- Startup storage error: inspect IndexedDB access, blocked versions and data validation; export before repair.
- Shared edit pending: inspect original session/scope, connection and authority acknowledgement; preserve the outbox.
- Join failure: distinguish identity, invitation, capacity, origin, signaling and network reachability.
- PDF failure: check the lazy worker/render path and target browser support without disabling plain notebook access.
- Deployment failure: validate the actual uploaded bundle and hosting status before altering unrelated application code.
- Media failure: inspect secure context, consent, current room and ICE separately.

## Cleanup policy

Preserve source, assets and licenses, lockfiles, dependencies, references and user data. Retain one current package per target and their intended archives. Delete only positively identified obsolete generated candidates, superseded release copies and temporary output. Task-created Playwright reports and screenshots are disposable once needed evidence is captured; the curated `docs/verification` evidence is not a random cache.

Documentation cleanup should merge useful technical content first, repair links, then remove superseded guides. Keep README as the entry point, AGENTS as repository instructions, and ASSETS_LICENSES as provenance. Never put personal CVs, private backups, claim secrets or cleanup logs containing personal paths into the public repository.

## Documentation conventions

Explain observable behavior and its implementation together. Link to the responsible source and tests, state data ownership and failure behavior, and label historical or unverified claims. Update API/version/configuration tables when changing their source. Avoid promising complete platform support from a build-only check. Use the [handbook index](README.md) to discover the canonical guide before adding a new overlapping Markdown file.

## Amendment regressions

The disappearing-stroke report came from a Mac (browser, input device and OS version unknown); the Linux owner does not reproduce it. `amendments.spec.ts` reproduces rapid consecutive completions in the shared personal/library editor at DPR 1 and 2, outside release, duplicate lost capture, undo/redo and persistence. `board-pencil.spec.ts` covers cancellation, coalesced input, palm precedence and missing release. Do not infer original-device success from Linux tests or synthetic events. `.github/workflows/amendment-regressions.yml` checks Chromium and WebKit on Linux and macOS.

`pets.test.ts` includes complete Werewolves and Forest Blocks simulations, legal-view policy, house limits, collision recovery, follower slots, food and interrupted behaviors. Separate server clients test scene isolation, ownership, limits, cross-game reservations, reconnect and paired-device authority. These are local protocol tests, not an external-network session.

Use `wardrobe.spec.ts`, `npc-speech.spec.ts`, `study-desk.spec.ts`, `backup.spec.ts` and the amendment cases for UI/persistence checks. Keep the tested source steady: Vite reloads from concurrent implementation changes can detach controls mid-test. Rerun any affected case after edits stop and record the interrupted run separately.

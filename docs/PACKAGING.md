# Web, desktop, Android, and release artifacts

Source entry points: [package.json](../package.json), [app/vite.config.ts](../app/vite.config.ts), [scripts/build-pwa.mjs](../scripts/build-pwa.mjs), [app/linux/preload.cjs](../app/linux/preload.cjs).

## Build graph

The root `package.json` is the command entry point. `npm run build` typechecks both application and server, runs Vite with `app/vite.config.ts`, then creates the PWA service worker. `npm run server:build` separately bundles the Node service. Desktop scripts consume built web assets; Android synchronizes the web build into Capacitor before Gradle assembles an APK.

Keep package-lock.json with package.json. Generated output is replaceable; authored sources, native configuration, icons, migration code and signing material are not interchangeable build trash.

## PWA and updates

Vite uses the app directory as its root, relative asset base `./`, ES2022 target and `app/dist` output. `scripts/build-pwa.mjs` hashes emitted file contents and generates a cache name from that hash. It precaches local files, serves same-origin bundled assets from cache and falls back to cached index.html for offline navigation.

Registration happens only in production on HTTP(S). The worker intentionally does not force immediate takeover: updates wait for existing windows to close. This avoids reloading during handwriting. An offline shell is not a cloud backup; IndexedDB remains tied to origin and browser profile.

`scripts/verify-pages.mjs` serves the actual build under `/studyvillage/` and tests precached assets and offline behavior in Chromium/WebKit. Use `SV_BUILD_DIR` to inspect an extracted deployment artifact. A green build does not establish that a hosting deployment succeeded.

## Electron desktop

`app/linux/main.cjs` and `preload.cjs` supply the current desktop runtime, including Linux-named files shared by packaged targets. The preload exposes fixed local load/save and external-link operations. Desktop migration copies missing legacy keys without overwriting existing Chromium keys or deleting the original source. Saved server launch profiles are reviewed in Settings; command-line profile arguments do not automatically connect or claim administration.

Build commands and exact output paths are in [setup](SETUP.md). Public releases contain one installer per OS: EXE, AppImage, universal DMG and APK. The release workflow builds each desktop installer on its native OS and verifies the actual payload; the same universal DMG is tested on Apple Silicon and Intel. Desktop installers remain unsigned and unnotarized. Unpacked folders are build/test intermediates, not the public download. Do not remove the retained Tauri source: the local-store adapter still supports its bridge.

## Android

`capacitor.config.json` and `android` provide the wrapper. The documented command requires JDK 21 and SDK 36, builds the web app, runs Capacitor synchronization, assembles a debug APK and collects it under `deliverables/android-current`. The rebuild uses a separate application ID. Debug signing does not establish a long-term production signing/update policy.

Generated Gradle output and copied assets can be recreated, but preserve wrapper/configuration sources. Never discard an owner's signing keys as unused files. This cleanup does not modify signing or publish packages.

## Current artifact policy

`deliverables/release-current` contains only the current verified four installers, checksums and provenance. Platform `*-current` folders can hold the current build/test payload; do not retain superseded ZIP/tar releases beside the new installers. Replace old generated output only after validating the new delivery. Preserve source, dependencies, signing keys and user profiles.

`scripts/verify-packages.mjs` compares bundled web files and bridges. `verify-release.mjs` requires native verification receipts tied to the installer SHA-256, root package version and source commit. `publish-release.mjs` creates a development release from the immutable source commit only after all required jobs succeed.

A later web build can differ from a retained native package. Record this explicitly instead of silently updating BUILD_INFO or claiming that every current package includes the newest web change. The historical verification guide already documents this boundary.

## Safe release sequence

Run required checks, build the intended target, validate the packaged bundle, exercise it with synthetic profiles, and inspect the actual device where available. Update artifact metadata only for artifacts actually rebuilt. Preserve existing working packages until replacements pass. Remove obsolete generated candidates and task-created test output afterwards. Deploy only when publication is explicitly requested.

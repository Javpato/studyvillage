# Animal atelier placement correction — 9 November 2026

Reported: placing the animal atelier displays the generic “complete the texts and answers” validation message. Reproduced before the fix by serializing/projection of a placeable `pet-atelier`: the local-store furniture enum omitted it, although the catalogue and wire/room schemas accepted it. This is a validation mismatch, not a missing text field. The asset-pack validator had the same stale list.

Correction: one core furniture-kind registry now supplies placement, types, local persistence, public/room schemas and replaceable asset-pack validation. Existing saved-data validation and furniture eligibility rules remain in place. Regression tests roundtrip every placeable kind while preserving existing profile/notes, and place the atelier through the real decoration UI, reload it, retain the pre-existing furniture and open its editor.

Completed before candidate push: reproduced the failing storage case; 17 focused storage/assets/architecture tests passed after the fix; app/server types passed. Both Chromium custom-animal and atelier-placement journeys passed. Remaining: candidate push, full baseline/build and focused platform browser tests, publication confirmation, temporary-output cleanup. No physical-device check is claimed.

---

# Custom animals and linked devices — delivery verification, 9 November 2026

Candidate [`f664008`](https://github.com/Javpato/studyvillage/commit/f664008) is published by [Pages 42540176190](https://github.com/Javpato/studyvillage/actions/runs/42540176190). [Linux/macOS matrix 42540176394](https://github.com/Javpato/studyvillage/actions/runs/42540176394) passed: full baseline plus **152 browser executions** (35 Chromium, 33 WebKit, 2 live pairing and 6 controller cases per OS). The final media lifecycle correction is verified separately below.

Implemented: custom animal atelier/collection with independent artwork, existing ability and house choice; persistent stable individuals and assignments; shared character pixel tools; private device pairing with creator-selected roles/tool scopes; notebook, whiteboard, character/animal editors, focus clock and media ports; proximity microphone retention. See [feature, component and recovery documentation](CUSTOM-PETS-COMPANION.md). Reviewed views: [animal atelier](images/custom-pets-companion/animal-atelier.png), [companion desktop](images/custom-pets-companion/companion-desktop.png), [companion phone](images/custom-pets-companion/companion-phone.png).

Completed locally:

- Full baseline: 535 application + 37 server tests, types, 2,799 ES/EN/FR messages and web/PWA/server builds. A restricted run initially could not spawn git in installer fixtures; rerunning with normal subprocess access passed.
- Seven Chromium pet/character cases, then five rebuilt production WebKit cases. Custom art is asserted on the actual world canvas before and after reload.
- Real two-profile PeerJS/WebRTC in both role directions: timer start/pause; private notebook strokes from both devices and continued editing after closing the main view; whiteboard drawing/undo; remote character saving without changing the secondary profile; remote animal creation; disconnect cleanup.
- Synthetic audio/video sources over real WebRTC: linked microphone activation, main screen arriving at the companion video, microphone retention through room movement, mute, and capture termination on session exit. These are generated streams, not physical capture tests.
- That final media journey found a real host initialization bug: voice context was absent immediately after hosting until a later movement/roster event. Hosting now initializes it immediately. The new regression and existing network/media/pair cases passed **53 tests**. The final platform candidate adds this regression and clears ended screen/audio previews.

Final runtime [`a61562a`](https://github.com/Javpato/studyvillage/commit/a61562a) is pushed to `main` and **published to [StudyVillage](https://javpato.github.io/studyvillage/)**. [Focused companion matrix 42541458352](https://github.com/Javpato/studyvillage/actions/runs/42541458352) passed on **Ubuntu 24.04 and macOS 15**, including the full **536 application + 37 server tests**, types/catalogues/builds and both real pairing directions on each OS. The creator-main journey additionally checks synthetic microphone/screen delivery, room movement retaining capture, ended screen preview cleanup, mute and world-exit capture termination. Combined with the prior broad matrix, this is **156 platform browser executions across the two named revisions**; it is not a rerun of the entire broad suite on the final one-line host initialization change.

The current local production build is `studyvillage-9566685df0cce947` (176 local files plus the service worker). Both local browser engines passed packaged subpath/offline ink, palm rejection, pan/pinch and reload persistence, and both passed the legacy sprite-cache upgrade. [Pages 42541458716](https://github.com/Javpato/studyvillage/actions/runs/42541458716) initially failed because Chromium's fresh tab remained uncontrolled despite an activated worker and populated cache; the unchanged candidate passed on retry and **was published successfully**. The live HTTPS worker was checked against `studyvillage-9566685df0cce947`. Task-owned temporary logs, scripts and test output were removed; the current app/server builds, existing release packages and reviewed reference screenshots are retained.

Physical microphones, OS screen-selection permission UI, iPad/Apple Pencil and separate hardware/networks have not been tested. Forwarded audio output is implemented but has not been verified with an external human participant. A lost connection requires a new approved code; pending drafts can be exported, not automatically resumed. Existing native dev.8 installers were not rebuilt. Previous sections apply only to their named revisions.

---

# Pet expressions and default character — 8 November 2026

Final implementation [`f8a92ac`](https://github.com/Javpato/studyvillage/commit/f8a92ac) is pushed to `main` and **published to the web** by [Pages 42529789960](https://github.com/Javpato/studyvillage/actions/runs/42529789960). The [final focused platform check 42529804048](https://github.com/Javpato/studyvillage/actions/runs/42529804048) passed the full baseline and **20 browser executions**: six Chromium and four WebKit cases on each of Ubuntu 24.04 and macOS 15. No native installers were rebuilt. Current web build: `studyvillage-8f897d2944026bc3`, 173 packaged local files plus its worker.

| Delivered behavior | Components | Evidence already completed |
|---|---|---|
| Both eyes visible from the front and three-quarter sides; eyeless backs | `scripts/create-pet-sprites.py`, five pet-sheet PNGs, `app/src/assets/pet-assets.ts` | Reviewed [actual asset grid](images/pet-expressions/sprite-review.png); browser pixel checks on all five species/directions. Final revision also moves eyes inside the head and turns the parrot beak. Furniture art is unchanged. |
| Rabbit jump on **Hop here / Sauter ici**; ordinary walking unchanged | Core `pets/model.ts`, `app/src/pets/art.ts`, sprite manifest | 750 ms multi-waypoint landing, unreachable-target in-place fallback and interrupted room transfer in model tests; actual world-canvas lift/landing in Chromium and WebKit; reduced-motion renderer check. Height is 32 logical pixels with ground-shadow/depth preserved. |
| Hamster remains in its ball until **Remove the ball / Retirer la boule** | Pet config/snapshot schemas, controller, `pets/world.ts`, semantic `ballIdle` / `ballWalk` rendering and bot portraits | Real world-canvas frame, persistence/reload and explicit removal; model tests across following, petting, room changes and game reservation/release. Old configs without `ball` remain valid. |
| Smaller automatic parrot speech | Pet controller/world, shared `ui/npc-speech.ts` | Real configured-phrase approach flow; 330 px standard bubble with unchanged 16 px text and natural short-message height; visitor entry, scene filtering, 64/96 px hysteresis, 20 s cooldown and 8 s expiry in model tests. Source-component checks confirm attached movement, no stolen focus and intentional dialogue priority. [Reviewed compact bubble](images/pet-expressions/parrot-bubble.png). |
| Initial-character reset only in the sprite atelier | `ui/vanity-ui.ts`, existing `DEFAULT_APPEARANCE`, ES/EN/FR catalogues | Preview/undo/cancel/explicit save/reload in the actual atelier, including a late PNG import that must not overwrite reset. Restores the game's initial appearance, preserves identity/house and keeps the old PNG available. Existing static and 12-frame import/save flows also passed. |

Completed local verification:

- Full `npm run check`: **520 application tests + 37 server tests**, application/server types, **2,719 ES/EN/FR messages**, web/PWA/server builds. Two separate WebSocket clients verify optional jump/ball/speech fields, invalid values, scene routing and ownership; this is transport evidence, not an external-network play session.
- Six Chromium journeys/component checks and nine production WebKit journeys passed on the behavior revision (`275a956`), including existing guide-dialogue layouts at desktop/phone sizes and static/animated sprite editing. After the final artwork refinement, both source-rendering checks and typecheck/build passed again. The focused final CI run passed the final asset revision in both engines/OSes.
- `npm run test:pages` passed Chromium and WebKit offline ink/cache plus installed-old-worker sprite upgrade on behavior cache `356b8c273337e822`. The final Pages workflow passed these same checks on cache `8f897d2944026bc3` before deployment. The published service worker, manifest and all five pet sheets match the local build byte for byte.

The broad behavior matrix [42529439050](https://github.com/Javpato/studyvillage/actions/runs/42529439050) passed on revision `275a956`: 34 Chromium cases, 32 production WebKit cases and six controller cases per OS, **144 browser executions** across Ubuntu 24.04 and macOS 15. The subsequent final-artwork matrix above passed 20 focused executions and repeated the full baseline on both OSes. Earlier candidate matrix `42529174453` was canceled after being superseded. Both finished matrices are successful; no failed checks remain.

Four additional Chromium journeys passed directly on [the published site](https://javpato.github.io/studyvillage/) using isolated browser profiles: ball persistence/removal, visible jump, automatic compact speech and atelier reset/save/cancel/import race. Task-created scripts, logs, the temporary public-URL test and Playwright output were removed after recording results. Current app/server builds and existing release packages were retained; reviewed screenshots remain as reference material. Physical input devices and external-network multiplayer were not directly tested. Existing dev.8 native installers remain on their tagged source.

---

# Pets, folders, controllers and English/French corrections — 8 November 2026

Runtime source [`33d934b`](https://github.com/Javpato/studyvillage/commit/33d934b) is pushed to `main` and **published to the web** by [Pages workflow 42525586611](https://github.com/Javpato/studyvillage/actions/runs/42525586611). The current local build uses cache `studyvillage-70b2b5b3b5e10439`, with 173 packaged local files plus the worker and versioned sprite cache aliases. [Itemized delivery, components, limitations and reviewed screenshots](PETS-CONTROLS.md).

The [platform matrix 42525623227](https://github.com/Javpato/studyvillage/actions/runs/42525623227) passed the full baseline and **28 cases per engine/OS in Chromium/WebKit on Ubuntu 24.04 and macOS 15 (112 executions)**. Its final controller fixtures intermittently missed the synthetic 65 ms button sample on loaded runners. The fixture now keeps both press and release present for two animation frames, matching the application's Gamepad polling lifecycle, with unchanged game-state assertions. **All 12 controller executions passed** in [workflow 42526399839](https://github.com/Javpato/studyvillage/actions/runs/42526399839), test revision `c14d6c5`; runtime source remains `33d934b`. Together these runs verify **124 browser executions** on both platforms/engines. The six synchronized local cases also passed. [Pages workflow 42526384957](https://github.com/Javpato/studyvillage/actions/runs/42526384957) passed again with the identical runtime build.

Completed verification:

- Full baseline: **514 application tests, 37 server tests, application/server types, 2,716 ES/EN/FR messages and web/PWA/server builds**. Source-message scanning now supplements catalog/parameter parity. Five native bridge tests also passed.
- Local Chromium passed all 28 targeted pet/folder/language/amendment/drawing/wardrobe/dialogue journeys. After the close-event fix, the immediate-movement and block-controller cases passed again. Six complete controller journeys across Chromium/WebKit passed with the real application styles, panels and game engines.
- The final production WebKit rerun passed all **12 pet/folder/language cases**. Its earlier 28-case run found an untranslated touch-label reset and a fault-injection fixture bypassed by the valid service-worker cache. The label now stays localized, and only the injected-art-failure case blocks workers so it receives its deliberately invalid manifest. All other normal-art/offline cases retain workers.
- Both engines passed the production subpath/offline tests: exact cache membership, persisted notebook content, quick pen strokes, palm rejection, finger pan/pinch, and offline reload. Both also passed the old-worker fixture: current versioned images bypass the legacy unversioned manifest, with house and pet drawn on the stage canvas.
- A separate fresh-profile check on **the published GitHub Pages URL** placed all five species, observed their houses and pets on the world canvas, and verified reload persistence. Separate English and French profiles verified Ollama’s unavailable state. An earlier attempt to reuse the development test suite addressed the host root rather than the Pages subpath; it was replaced by this explicit-URL check and is not counted as product evidence.
- The exact final desktop payload passed **Linux sandbox/isolation, secure context/WebRTC availability, legacy import, saved server settings, real native file export, restart and notebook/phone persistence** using isolated temporary profiles. This checks the current Electron payload; it does not certify a newly packaged AppImage or update installers.
- Visual review covered five distinct world houses/pets, the compact mobile pet panel, folder appearance editor and actual Controls guide. Documentation links and Git whitespace checks passed.

Diagnosis and corrections: the pet invisibility mechanism was reproduced with new app code and a pre-pet manifest from an installed worker; published PNG bytes themselves were present and correct. Revisioned resource URLs and coherent per-worker navigation/resource caches prevent that mixture. Per-asset validation provides visible, species-specific recovery art and a useful warning. This reproduces a cause; the reporter’s cache contents were not directly inspected.

The CI movement test exposed native `close` delivery after a new movement key. Pet cleanup is synchronous and idempotent; cancel, close and controller back share the cleanup path without clearing subsequent input. Controller journey tests also exposed navigation into controls inside closed `details` elements; those controls are now excluded from focus traversal. The folder editor refreshes its controls when navigating into a folder during editing.

The first Pages candidates stopped at a strict service-worker controller assertion on a fresh Chromium tab. Diagnostic evidence showed an activated registration and populated cache, but the first new navigation was uncontrolled. The fixture now performs a normal reload when needed and retains its controller/cache/offline assertions. It does not force activation, claim open editors or reload the application during use. [Diagnostic run](https://github.com/Javpato/studyvillage/actions/runs/42525099368); [first successful follow-up](https://github.com/Javpato/studyvillage/actions/runs/42525375513). The superseded platform run on `90978b7` was canceled once the final matrix was running.

Gartic intentionally uses **mixed input selected by the owner**: controller menus/tools/submission/albums/replay, with keyboard/mouse/touch for writing and drawing. Controller samples are automated Gamepad API input, not physical USB/Bluetooth certification. The game fixtures submit legal actions through real engines but are not external-network multiplayer sessions. Existing separate-client and bot simulations remain documented in the earlier amendment delivery.

The original whiteboard report came from a **Mac with unknown browser, input device and OS version**; the owner uses **Linux and does not experience it**. Automated platform results must not be described as a retest of that original physical setup. No new Windows, macOS or Android installers were checked or published for this correction. Published dev.8 installers remain on their original tagged source. Current app/server builds and existing release packages are retained; task-owned temporary scripts, payload copies, logs and test output were removed after recording final results. Reviewed screenshots are retained as delivery reference material.

---

# Amendment implementation and verification — 8 November 2026

Final implementation: [`5f9d074`](https://github.com/Javpato/studyvillage/commit/5f9d074), pushed to `main` and published to the web by [Pages workflow 42512601173](https://github.com/Javpato/studyvillage/actions/runs/42512601173). [Platform workflow 42512623778](https://github.com/Javpato/studyvillage/actions/runs/42512623778) passed **Chromium and WebKit on Ubuntu 24.04 and macOS 15**: 16 targeted cases per engine/OS, 64 executions. The subsequent documentation commit records these results without changing runtime source.

The full local baseline passed: **508 application tests, 37 server tests, 2,665 ES/EN/FR messages**, application/server types and web/PWA/server builds. CI repeated the baseline successfully on both operating systems. The initial restricted local run could not spawn git for installer fixtures (EPERM); the authorized rerun passed with normal subprocess permissions. Current PWA cache: `studyvillage-dafe271302d4c601`, 173 local files. Local Markdown links and Git whitespace checks passed.

Three separate WebSocket-client pet tests cover scene routing, ownership, owner-wide capacity, cross-game reservations, disconnect/reconnect and paired-device authority. Eight complete seeded Werewolves simulations and one complete Forest Blocks match exercise validated bot actions. The final pet tests also cover species-aware collision footprints during unrestricted following and room transfer. Local WebKit passed 16 amendment/drawing/dialogue/wardrobe browser cases before the final platform CI pass.

The broad Chromium run finished with **195 passed, 13 failed, 14 intentionally skipped and one not run**. It ran during development-server reloads and is not reported as a clean full-suite pass. All 13 failures subsequently passed targeted reruns with stable source: backup preferences; two drawing cases; three garden cases; furniture rotation; identity mailbox; notebook persistence; guide dialogue; sprite vanity; server restart entry; and shared notebook. Old backup/count expectations were updated for the new controls. Shared notebook passed unchanged assertions in 59 seconds with a 90-second timeout; that case now declares the longer timeout. The unrun custom-avatar server case (skipped by its serial suite after a previous failure) subsequently passed independently, including actual rendering by the second client.

Additional direct browser checks passed: ten quick strokes on each of the two library boards persisted independently across reload; pet rename immediately followed by Follow and explicit saved parrot text persisted after reload; both games' pet selection/start/rendering worked, and Forest Blocks cancellation released world controls. Local visual review covered the desktop timer, five distinct houses/entities and the phone pet panel. See [itemized delivery and screenshots](AMENDMENT.md) for components, behavior and per-item evidence.

Platform boundary: the original disappearing-stroke report came from a **Mac with unknown browser, input device and OS version**. The owner uses **Linux and does not reproduce it**. Automated macOS Chromium/WebKit tests passed; the original physical configuration was **not directly retested**. Local separate-client tests do not certify an external-network multiplayer session. Optional external peer/media and native AI fixture checks remain skipped.

This is an implemented web update, not a new native release. Existing dev.8 installers below are unchanged. Current app/server builds and existing release packages are retained. Task-generated temporary scripts, logs and test output were removed after recording final results; source, dependencies, reference materials and user data were preserved.

---

# Published release — 8 November 2026

**[StudyVillage v1.0.0-dev.8](https://github.com/Javpato/studyvillage/releases/tag/v1.0.0-dev.8) is published**, with Windows EXE, Linux AppImage, universal macOS DMG and Android APK. Source: [`508e30d125528e5a82da976aaa0879b114996d70`](https://github.com/Javpato/studyvillage/commit/508e30d125528e5a82da976aaa0879b114996d70). [Release workflow 42498207603, attempt 2](https://github.com/Javpato/studyvillage/actions/runs/42498207603/attempts/2) completed successfully and published at 16:32 UTC. This is a development prerelease.

- Validation passed **483 application tests + 34 server tests**, application/server types, **2,610 ES/EN/FR messages**, web/server builds and **5 native bridge tests**.
- The complete Chromium run passed **205 scenarios**, with **14 intentionally skipped optional or fixture-dependent cases**. All **6 WebKit phone/house scenarios** passed. Both engines passed the packaged web/offline-cache/ink checks against all **163 shared web files**. Focused local clock/controller checks also passed in WebKit.
- The delivered Windows EXE passed installation, sandboxed startup, persistence, native file export and uninstall preserving existing player data. Linux passed its actual AppImage payload check with the sandbox enabled. The **identical universal DMG** passed on both Apple Silicon and Intel. The actual APK passed installation, startup, phone/house navigation and process restart in the Android API 35 emulator.
- All **six published assets were downloaded**. Their SHA-256 values match GitHub's asset digests; all five manifest entries match `SHA256SUMS`. Installer formats, source/version, native receipts and the shared web index hash were verified. Every package uses cache **`studyvillage-f29a1800aa311d31`**, matching the current local build.

The first Linux package check reached the loading screen but exceeded its five-second startup expectation. Repeating only failed/dependent jobs passed on the same source; the already approved browser validation and other packages were retained. No failed candidate or incomplete set of installers was published, and earlier release tags were not moved.

The release preparation also corrected the floating clock's competing position transforms and a fresh controller press lost during a menu/world transition. Regression tests reproduce those interactions and verify drag, custom scale, persistence and held-button behavior. Older backup/Android journeys were aligned with the current phone navigation; geometry checks now await native input/resize delivery while retaining their exact movement and containment assertions.

The README has direct links to the published installers, installation guidance, current features and a clear distinction between `main`, the web deployment and versioned releases. The handbook and the separately added self-hosting guide are preserved. Documentation-only follow-ups on `main` do not change the installer source above. The current web application was also successfully published by [Pages workflow 42497546825](https://github.com/Javpato/studyvillage/actions/runs/42497546825).

Current local delivery: **`deliverables/release-current/`**, containing only the four installers, `BUILD_INFO.json` and `SHA256SUMS`. The Linux AppImage is executable. Current `app/dist` and `server/dist` are retained. Obsolete platform packages, stale generated Android assets/build output, Playwright output and task-owned temporary files were removed. Source code, reference materials, development dependencies, signing files and user data were preserved.

These automated checks do not certify physical controller pairing, every iPad keyboard/Pencil configuration, external-network multimedia or universal system-audio capture. Desktop installers remain unsigned/not notarized development builds; Android uses development signing.

The entries below are historical checkpoints, including earlier candidates and their then-pending work. They do not supersede this published result.

---

# Single-file installers — 7 November 2026

Candidate **1.0.0-dev.7** replaces desktop ZIP/tar folders with one delivery per OS: Windows NSIS Setup EXE, Linux AppImage, universal macOS DMG (Intel and Apple Silicon), and the existing Android APK. The application keeps its current player-data paths.

- Local validation: application/server types, **458 app tests across 53 files**, **31 server tests**, translations and production builds pass. Six new installer checks reject missing Intel DMG verification, changed installer hashes, renamed ZIP executables, stale commits and missing Windows data-preservation checks.
- Windows Setup EXE built successfully. Its unpacked application matches all 163 shared web files and native bridges, and passes sandboxed startup, storage, restart, native file export and notebook persistence. Real install/uninstall runs only in disposable CI; it checks that an existing player-data sentinel survives uninstall.
- Release automation now tests the delivered EXE/AppImage/DMG payload, requires testing the identical universal DMG on both Mac architectures, and binds native-test receipts to the installer's hash, source and version. Only four installers, consolidated build metadata and checksums are published. The previous release remains available until the complete new pipeline succeeds.
- Pending: run the release workflow manually with tag input `v1.0.0-dev.7`; collect native installer tests and the Intel DMG result; inspect failures before rerunning; verify the published downloads and clean generated task output. Do not repoint old tags.

---

# Expanded platform audit — 7 November 2026

Version **1.0.0-dev.6**, source `519aa12`, includes the phone, starter house and mailbox changes described below. This audit also corrected the pending-access banner covering phone buttons on small screens and prevents editing or saving a sprite before its asynchronous PNG import finishes. Server action buttons now stay disabled until an operation is acknowledged, including after an intermediate house update.

- Local application/server types, **452 application tests across 52 files**, **31 server tests**, **2,483 ES/EN/FR entries**, production web/PWA and server builds pass. Syntax checks pass for 37 JavaScript build, server and native-bridge files.
- The eight Chromium garden/language/sprite regression cases pass. Fourteen applicable WebKit phone/house/garden/language/sprite cases pass; the CDP-only continuous-touch case runs in Chromium. Both engines pass production PWA installation, offline reopening, saved ink and finger navigation without writing or erasure.
- The rebuilt Windows application matches all **163 current web files** and native bridge files byte-for-byte. Its sandboxed startup, secure context/WebRTC API, synthetic legacy import, server configuration, native file export, restart, optional phone shortcut and private notebook persistence checks pass.
- Earlier verification-only [run 42377485242](https://github.com/Javpato/studyvillage/actions/runs/42377485242) passed all four desktop runners and installed/launched the APK in an Android API 35 emulator. It did not modify a Release. The expanded native checks now run on every release.
- Release validation runs the complete Chromium suite under Xvfb so its Electron-backed backup fixture has a display. Language preservation compares stored editable strokes rather than font-dependent PNG bytes. The raw-CDP garden case uses the mouse driver to finish saving; a separate touch-only case verifies tap placement and saving.

## Final release result

[Workflow 42381429243](https://github.com/Javpato/studyvillage/actions/runs/42381429243) completed successfully and published [v1.0.0-dev.6](https://github.com/Javpato/studyvillage/releases/tag/v1.0.0-dev.6) from source `519aa125f3cfc68f74d1279fccd707e4fbd48bc8` on 7 November 2026.

- Validation passed **483 application/server unit tests**, **5 native bridge tests**, **175 Chromium scenarios** and **7 WebKit phone/house scenarios**. Fourteen Chromium scenarios remain intentionally opt-in or require a separate native AI fixture.
- All four desktop runners passed sandboxed startup, secure-context/WebRTC availability, legacy import, saved server settings, native file export, restart and private notebook/optional phone-shortcut persistence.
- The actual Android APK passed installation, WebView startup, default phone folders, house navigation and process restart in the API 35 emulator.
- All five packages match the same **163 web files** byte-for-byte. Release PWA cache: `studyvillage-2c52fae4aaa3b96b`. Archive integrity and source/version agreement passed before publication.
- All **12 published asset URLs** returned HTTP 200. The **11 SHA-256 manifest entries** agree with GitHub's published asset digests. The manifest covers the five archives and six metadata files.
- The preceding complete Windows Chromium pass approved 174 scenarios with 14 intentional skips. After the server-action correction, 7 focused Chromium server/access scenarios, 6 production WebKit server/access scenarios and the delayed-acknowledgement fixture in both engines passed. The current local Windows executable and archive are version 1.0.0-dev.6; older local package versions were replaced.

## Workspace handoff

The owner's current rule is to commit only substantial changes or on explicit request. The owner requested saving the final verification report and instructions together after the recheck. The published version is available for manual testing; future long verification should continue from a pushed candidate and a saved checkpoint.

The current Windows executable is `deliverables/windows-current/StudyVillage-win32-x64/StudyVillage.exe`. Current production web/server builds, source, dependencies, reference images and user data are preserved.

Permanent cleanup had been rejected by automatic approval review. Cleanup is now complete using the safer, reversible Windows Recycle Bin operation: generated `deliverables/.audit` and `test-results` were removed from the workspace. The current executable/archive and production builds remain; source, reference images, dependencies and user data are preserved. The temporary GitHub helper and root debug log were also removed.

## Final local recheck

The owner's final requested recheck passed on 7 November 2026: application/server types, **483 unit tests**, **2,483 translations**, web/PWA and server builds, **18 Chromium scenarios**, **9 WebKit scenarios** and **5 native bridge tests**. Both production browser engines passed offline/cache/ink checks. The current Windows executable passed startup, storage, restart, native export and private notebook persistence. A read-only comparison confirms all **163 web files** and four native bridge files match the current build. No test failures were detected; Node experimental-storage and Vite bundle-size notices remain informational.

The phone layout and optional apps (including Focus), Settings protection and touch-control placement, removable starter mailbox, five starter furnishings plus room access, updated README and all five Release packages have been checked against the original request. Runtime source is unchanged from the successful Release; subsequent changes concern instructions and verification documentation. The recheck required no runtime source changes.

These checks cover automated execution on the named runners and emulator. Physical-device permissions, external-network multimedia, Apple Pencil and OS signing/notarization are not certified.

---

# Phone, starter house and release automation — 7 November 2026

Version **1.0.0-dev.3** adds the customizable phone, minimal new-house furniture and removable starter mailbox. Saved houses are preserved, including deleted wardrobes and mailboxes. The main README now describes the social-village vision.

- Local Windows checks: application/server types; **452 app tests in 52 files**, **31 server tests**; **2,483 ES/EN/FR catalogue entries**; production web/PWA and server builds passed.
- Chromium and WebKit each passed all **seven new phone/house journeys**: desktop/mobile defaults, folder edits/reordering/deletion with Settings retained, quota failure/cancel, full phone backup/restore, initial furniture/mailbox removal and preservation of saved layouts. Additional Chromium checks passed garden dragging, the outdoor mailbox interaction, Settings persistence, notebook ink persistence and French identity navigation.
- The packaged Pages application passed Chromium and WebKit offline/ink checks after the phone changes. Final release automation repeats these checks on its exact shared web artifact.
- The current Windows executable passed sandbox/context isolation, secure-context/WebRTC availability, synthetic legacy import, saved server settings, real native file export and reload. All **163 web files** and desktop bridge files match the current web bundle byte-for-byte.
- Initial native launch in the restricted workspace failed because its generated folder lacked Windows AppContainer read permission. Granting read/execute to the generated package folder allowed the same sandboxed executable to pass. The legacy-export unit fixture had the same local ACL restriction in Electron's dependency directory; the other four native unit checks passed. CI runs the full native suite on Linux outside that Windows workspace restriction.
- The Releases workflow builds the web client once, packages on the corresponding native OS runners, verifies embedded assets, runs desktop startup/storage/file smoke tests and only then publishes all five packages with build metadata and SHA-256 checksums. [Release workflow 42374211613](https://github.com/Javpato/studyvillage/actions/runs/42374211613) completed validation and all five package jobs, then published [v1.0.0-dev.3](https://github.com/Javpato/studyvillage/releases/tag/v1.0.0-dev.3) from commit `bf2b746`. The Linux native suite passed all five tests; all four desktop packages passed their native startup/storage/file smoke checks. ZIP/APK integrity, Linux archive listing, common web-build identity and SHA-256 generation passed. Every one of the 12 published asset download URLs returned HTTP 200.
- Release setup corrections are committed separately: configure the Linux SUID helper, install the Android SDK explicitly and use Windows' native tar executable instead of the Git Bash binary. Failed attempts did not publish partial releases. Manual runs can create a new tag after validation and refuse to reuse a tag belonging to a different commit.

Physical Android, Apple Pencil, OS signing/notarization and real-network multimedia are not certified by these checks. Earlier records below describe older builds.

---

# Verification and handoff — 5 November 2026

## Documentation and cleanup verification — 5 November 2026

The handbook was reorganized and expanded without changing application source or public interfaces. `npm run check` passed: 444 app tests, 31 server tests, translation coverage, TypeScript, web/PWA and server builds. `npm run linux:test` passed all 5 desktop unit tests. Local Markdown links and Git whitespace checks passed. Existing current native packages were retained; no native rebuild or publication was performed for documentation-only changes. Earlier sections below are dated historical evidence, including previous build identifiers and device limitations.


Current web build version: **1.0.0-dev.1**, PWA cache **studyvillage-7ee145a93f404960**. Pen mode reserves writing and erasure for the pen while allowing fingers to pan, pinch, select and move existing content. It preserves the original project/profile and records implementation/content limits in FEATURES.md, INK.md, ARCHITECTURE.md and WEREWOLVES.md. It is not a claim of physical-device certification or exact reproduction of every printed expansion event.

## Pen mode with ordinary touch navigation

The owner reported that ordinary mode already works well with the physical Pencil. Pen mode now prevents touch-created ink, shapes, canvas text and erasure instead of disabling finger interaction. One-finger pan, two-finger pinch, selection and moving selected content remain available. Hand no longer needs a temporary mode switch. Saved preferences, active-pen priority, quarantining contacts until release, and native long-press suppression are retained. Broad contacts no longer block intentional navigation. The updated help text is available in ES/EN/FR.

- TypeScript/PWA build, whitespace checks and 2,466 ES/EN/FR translations pass. **444 app tests** and **31 server tests** pass.
- **26 Chromium scenarios** (22 existing/updated plus 4 new cases) and **26 production WebKit scenarios** pass across `board-pencil`, `pencil-mode` and `hand-navigation`. They cover finger editing prevention for all writing/erasing tools, navigation, selection/movement, preference persistence, pen/palm ownership, cancellation and saved ink.
- The packaged Pages check passes in both engines with all 163 files, offline cache/reload, saved writing and finger navigation with Eraser, Pen and Hand while Pen mode remains checked.
- The production Chromium configuration now specifies the repository working directory; its first attempt exposed an invalid `app/app/vite.config.ts` path, and all focused cases passed after correcting the runner.
- The first PR CI run timed out waiting for a controlled page after reload. The package check now waits for the service worker’s `activated` state, not just a non-null `active` reference, before reloading. It passes with CI’s bundled Chromium, WebKit and a fixture with deliberately delayed activation; the intermittent CI failure was not reproduced locally.
- Pointer gestures are browser automation, not a physical iPad/Pencil certification. The current native release packages were not rebuilt for this web update.

## Pages deployment failure investigation

[Run 42098357886](https://github.com/Javpato/studyvillage/actions/runs/42098357886), commit `3df5aa03c05f99df37c40f509784b225f401fcad`, built and uploaded successfully. The first deployment stayed in `updating_pages`; the retry accepted the same artifact, repeatedly returned an empty status, and reached the 600,000 ms deployment timeout. This is a failure after artifact creation, not a TypeScript/build failure. Both environment deployment records have terminal failure/error states; there is no active review gate to approve.

The downloaded artifact `13448450665` contains 163 regular files totaling 6,126,307 bytes, with no symlinks, hard links or unsafe paths. All files match the local build byte-for-byte. The preceding successful package has the same file count and is only 1,838 bytes smaller. `scripts/verify-pages.mjs` passed against the actual failed artifact in Chromium and WebKit at the `/studyvillage/` path, including full offline-cache installation, saved writing, palm handling, Hand pinch and offline reload. A fixture with a missing cached asset is rejected before any browser or deployment starts.

The publishing workflow previously compiled the app without browser verification. It now runs the unit/server suites and the packaged-app check before artifact upload, and pull requests validate without deploying. This closes a verification gap; it does not claim to repair GitHub's Pages backend. No app input defect was reproduced in these checks, and no further publication was requested during this investigation. The published site was still serving `studyvillage-462ef152b1465a38` when inspected. Similar first-hand reports of accepted artifacts followed by empty-status timeouts exist in [GitHub Community](https://github.com/orgs/community/discussions/212117); those reports support a hosting-side explanation but are not an official root-cause determination.

The later fresh [run 42104557827](https://github.com/Javpato/studyvillage/actions/runs/42104557827) successfully published the same application package; no artifact splitting was needed. Public WebKit smoke checks passed. The physical-device feedback then prompted the revised Pen-mode behavior above.

## Previous Hand navigation — web update for iPad testing

Both the room board and notebook offer Hand navigation: two fresh fingers pan and pinch in Pencil mode, while pen/mouse dragging in Hand never edits ink. Switching tools cancels unfinished edits and excludes resting contacts; a third contact blocks navigation until all contacts lift. Writing-time zoom suppression, pen priority and native selection suppression are retained. The notebook pinch anchor accounts for centered/rotated paper and responds immediately when reversing at the zoom limits.

- TypeScript, web/PWA build, translation coverage and whitespace checks pass. **444 app tests**, **31 server tests**, **2,466 translations** pass.
- After integrating the device-neutral mode name, the final candidate passes **18 Chromium journeys** across `board-pencil`, `pencil-mode` and `hand-navigation`, plus all **7 Hand-navigation journeys in production WebKit**. The application/server suites and web build were rerun successfully on this candidate.
- **21 Chromium journeys** and **20 production WebKit journeys** pass across `board-pencil`, `pencil-mode`, `browser-gestures` and `hand-navigation`; WebKit skips the Chromium-only page-scale case. Counts combine the focused runs and final reruns. Two initial WebKit assertions read geometry during the entrance animation or pixels before the scheduled repaint; tests now await the animation/frame without loosening coordinate checks. The WebKit configuration also specifies the repository working directory so it can start its preview server independently.
- Local HTTPS worked from the development machine, but the owner could not access that address from the iPad. This update targets the hosted web app so the owner can try the gestures at the usual public URL.
- Native packages remain at the earlier Excalifont release; this update targets the hosted web app. Temporary test output is removed after verification, and the current web build is retained.

Synthetic pointer automation verifies application behavior, not physical iPadOS touch classification. The owner should try Hand panning/pinching and then return to writing with the palm resting on the iPad. Open StudyVillage online, allow the update to download, then close all its Safari/PWA windows and reopen the public site to activate the new offline build; clearing saved data is unnecessary.

## Excalidraw-style Pencil mode and Excalifont — published baseline

Reviewed Excalidraw commit `701b901a0f1ba3d0b390d9cdf63d112e25abac4b` and bundled its seven unmodified Excalifont subsets with OFL/MIT notices. Room-board text now offers Excalifont, with matching canvas/editor fonts, validated storage/clipboard/wire styles, offline loading and font-aware PNG export. The [WebKit tablet screenshot](verification/excalifont-webkit.png) was visually inspected along with the Chromium desktop rendering.

Pencil mode activates on the first pen contact, supports two-finger panning and keeps zoom fixed during freehand writing. Single touches cannot draw, pan or select in Pencil mode. Drawing surfaces cancel competing native touch/Scribble/selection gestures. Both editors recover from missing up/cancel events, failed capture and off-canvas release; notebook blur now rolls back unfinished edits. Native text-field selection remains available. See INK.md for deliberate differences from Excalidraw and the unchanged handwriting renderer.

- `npm run typecheck`, `npm test`, `npm run i18n:check`, `npm run build`, and `npm run server:build` pass: **442 app tests / 50 files**, **31 server tests / 2 files**, **2,466 translations**. Production PWA cache: `studyvillage-e56afdbbfe9c74f7`.
- **14 production Chromium journeys** and **13 production WebKit journeys** pass across `board-pencil`, `pencil-mode` and `browser-gestures`; WebKit skips the Chromium-only CDP page-scale case. Counts combine the focused run and the final font-test rerun after fixing ambiguous test selectors. Both engines verify that all seven font faces load after an offline reload and PNG export succeeds.
- The input regressions cover pen preemption, coalesced/final samples, palm quarantine across strokes, exactly two-finger navigation, stable writing-time zoom, intentional pinch in selection mode, rollback/undo, missing pointer-up, throwing capture, outside release, blur, opt-out, persistence and native text editing. Synthetic PointerEvents exercise application behavior; they cannot certify real Apple Pencil latency or iPadOS palm classification.
- The Linux package passes its isolated startup, sandbox, migration, persistence and file-download smoke checks. Packages are rebuilt in their existing `*-current` locations; all five packages match the 163 current web files byte-for-byte and contain no stale hashed assets. The SHA-256 manifest was regenerated. Temporary test reports are removed after verification.

The remaining hardware check is writing continuously with the palm resting on the owner's iPad, including lifting/replacing the Pencil, a long press, two-finger navigation and leaving/reopening Safari. No physical iPad was available in this environment.

## Earlier iPad Pencil, palm and browser gesture corrections

Following the owner's iPadOS **17.7.10** feedback, notebook and room-board input now share an optional Apple Pencil mode: the pen writes immediately, fingers pan/pinch, and palm contacts cannot finish or redirect a pen stroke. Light-pressure starts, coalesced samples and final pointer-up samples are retained. Room-board coordinates now preserve thousandths instead of rounding to whole pixels. The mode persists locally, synchronizes across tabs and participates in full backups.

- App/server TypeScript, web/PWA and server build pass. **439 application tests across 50 files** and **31 server tests across two files** pass. **2,464 ES/EN/FR strings** have matching keys and placeholders.
- **14 focused production Chromium journeys** cover board/notebook Pencil handling, fingers, cancelled erasure, capture loss, text preservation, persistence, browser selection policy, viewport recovery and Werewolves lobby/start/stop. **10 production WebKit journeys** cover ink and browser gestures; one CDP-only native page-scale test is skipped there and passes in Chromium. These counts aggregate the applicable runs; the five board journeys were rerun on the final bundle after review fixes.
- Six additional development Chromium game-control journeys verify stop-button phase/authority transitions, including a real temporary two-client village. The control is absent before a round and after it ends, and is only present for the authorized organizer during play.
- Interface long-press selection/callouts and double-tap zoom are suppressed, while inputs, notes, code and mailbox letters remain intentionally copyable. Native pinch zoom remains enabled outside owned drawing/game surfaces. HUD layout uses stable layout dimensions; dialogs track the visual viewport and recover when zoom/pan settles.
- The final Linux package passes the isolated startup/storage/import/native-file smoke checks. All five packages match 154 web files byte-for-byte; ZIP/APK CRCs, Linux tar contents and the current SHA-256 manifest pass. Older generated builds and temporary test output were removed.
- Final review separated pointer-gesture cancellation from text-editor cancellation and retained touch capture when a drawing turns into a pinch. Regression cases verify that pending text is saved when starting a second note and that the first finger remains captured.
- Initial automation exposed test setup issues: a Chromium-camera-only suite was mistakenly requested through WebKit, and a strict coordinate equality ignored WebKit's less-than-0.01-pixel layout rounding. The media suite passes in Chromium; the corrected subpixel assertions pass in both engines. No claim of WebKit fake-camera coverage is made.

The pen tests use deterministic synthetic PointerEvents, with capture stubs (including a capture-release regression), on Linux Chromium/WebKit. They verify application ordering and persistence, not physical Pencil latency or Safari 17's native palm classification. **The updated build needs the owner's physical iPad/Pencil retest.** Close old Safari/PWA windows before reopening the live link to allow the waiting offline update to activate; clearing storage is unnecessary.

## Previous camera travel, decoration, mailbox and access corrections

Ordinary scene changes retain the camera track; private floor corridors now accept decoration. The garden supports actual catalogue dragging and a larger protected yard around the house. Settings is simpler, Diagnostics has Back, furniture can be renamed, and whiteboards rotate as a complete object. Indoor/outdoor mailboxes provide private notes with five active notes per author. Access requests remain pending until a decision or explicit cancellation and cannot be duplicated across devices.

- App/server TypeScript, web/PWA and server build pass. **427 application tests across 48 files** and **31 server tests across two files** pass. **2,462 ES/EN/FR strings** have matching keys and placeholders.
- **15 production Chromium journeys** cover floor placement, doorway protection, touch controls, actual whiteboard/display pixels at each rotation, garden drag/cancellation/reload, mailbox limits/removal/reload/saved-identity isolation, Settings, Diagnostics Back/Escape and furniture renaming with undo/reload. The final mailbox-message journey was rerun after replacing a generic locked-identity error with a specific translated unlock instruction.
- **14 production WebKit journeys** pass for the same interfaces, persistence and identity flows. The CDP-only native touch-drag test is skipped in WebKit; it passed in Chromium. This is browser automation, not physical iPhone/iPad testing.
- The current Linux package passes isolated startup, storage/restart, import and native-file smoke checks. All five platform packages match **154 current web files** byte-for-byte. Final ZIP/APK CRC checks, the Linux tar bundle and SHA-256 archive manifests pass.
- **Four additional live Chromium access journeys** cover temporary P2P and persistent-server sessions, on desktop and phone-sized screens: duplicate requests, cancellation, rejection followed by acceptance, and floor/room decisions. Authority tests also cover paired devices, stale cancellation and disconnect cleanup. A pending request stays pending after 65 seconds while connected; it does not silently expire at 60 seconds.
- **Three live camera journeys** verify the same live capture through area/house/floor/room changes in both modes, plus two-person scene separation and reunion. Both single-camera journeys were repeated after the access-request changes. Captures are synthetic; physical cameras and external-network routing remain untested.
- Mailbox tests exercise authenticated P2P delivery, five-note limits, privacy, removal, escaped Unicode size bounds and temporary-identity migration. Real WebSocket/SQLite tests cover delivery with the owner offline and persistence after restart. Anonymous local notes survive reload and adoption by the same saved identity; unrelated saved identities remain separate. In P2P the recipient must be online and the inbox is stored on their primary device, without companion-device replication.
- Protocol 7 pairs the current client and server. Production screenshots include `garden-around-{desktop,phone}.png`, `floor-decoration-{desktop,phone}.png`, `whiteboard-rotation.png`, `display-board-rotated.png` and `mailbox-{desktop,phone}.png`.

## Previous compact dialogue and linked flashcards

The preceding pass (`studyvillage-6b36ee14bd7845c5`) adds small two-line NPC bubbles with progressive text, explicit next/close controls, outside-click dismissal and persistent opacity/text-size/page settings. Decorative items no longer offer empty interactions. Notes and their generated flashcard decks now have visible, scoped links in both directions, preserving drafts and review position. Guide settings are included in backup and recovery.

- App/server TypeScript and production build pass; **307 application tests across 42 files** and **27 server tests** pass. **2,425 ES/EN/FR strings** have matching keys and placeholders.
- **11 production Chromium journeys** pass: two NPC viewport/settings/pagination journeys, guide/frame persistence, five note/deck link/privacy/error/reload journeys, two furniture input journeys and backup/recovery with guide preferences.
- **8 production WebKit journeys** pass for NPC desktop/320px-phone pagination and preferences, guide/frame persistence, note/deck links, private/read-only permissions, saved drafts, deletion and failed saves. Browser automation does not certify physical iOS devices.
- The updated Linux package passes isolated startup, storage/restart, legacy import and native-file smoke checks. All five packages contain the same **154 web files**, byte-for-byte. Final ZIP/APK CRCs, Linux tar contents and SHA-256 archive manifests pass.
- Initial development UI runs were interrupted by concurrent Vite reloads; production reruns use stable assets. No slider defect remained after rerunning without HMR.

## Previous interface correction pass

The previous bundle (`studyvillage-9b6ff1e6b7936dcc`) includes the redesigned notebook, focus clock/jukebox, Werewolves interface, in-world garden placement, NPC speech/custom dialogue, finite display board, sharper wardrobe and sprite vanity. Design references and decisions are recorded in UI_INPUT_I18N.md.

- App/server TypeScript passes. **272 application tests across 39 files** and **27 server tests** pass; **2,406 ES/EN/FR strings** have matching coverage/placeholders.
- **20 production Chromium journeys** pass: avatar draft/save/discard, garden placement/drag/undo/cancel/reload, manual flashcard→quiz, guide/frame persistence, static and animated sprite workflows, finite display board, focus/HUD, jukebox/drop/playback, responsive layouts, English/French, Werewolves lobby/card flip/settings/mobile mosaic, and a live temporary village with simulated camera capture while walking.
- **4 production WebKit journeys** pass for garden, guide/frame and static/animated sprites. The notebook redesign separately passed **11 Chromium + 10 WebKit journeys**, covering persistence/PDF/backup/selected-page privacy/outbox/recovery. Focus/jukebox additionally passed 4 WebKit journeys. These are browser automation, not physical iOS/Pencil or real-camera certification.
- The source-level Werewolves camera-policy fixture passes against the Vite development module endpoints. Its initial production invocation could not import TypeScript fixtures; the test now identifies that environment requirement explicitly. No camera-policy product failure was observed.
- Final packaged Linux application starts with its sandbox and isolated synthetic profile; SQLite reload, legacy Unicode import, terminal server configuration and native file download pass.
- All five native packages match **154 current web files byte-for-byte**. ZIP/APK CRC checks, Linux tar content and SHA-256 archive checks pass. macOS/Windows/Android hardware execution remains unverified.
- A first final-browser attempt lost its local preview server after two passing cases. The preview was restarted and all applicable production cases passed; that connection refusal was an infrastructure failure.

Actual desktop/mobile screenshots are in `docs/verification`. No test writes to the user's running native profile.

## Earlier rebuild baseline

The following broader baseline was verified before this visual correction pass, on cache `studyvillage-2ced48526f57938a`; it is retained as a record, not presented as a new hardware test.

Environment: Linux 7.0.0-42 x64, Node 24.16.0, Chrome 157.0.8103.38, Playwright 1.64.1 with WebKit 27.2, Electron 45.2.1. All identities, notebooks, camera feeds and migration profiles used here were synthetic.

| Check | Observed result |
|---|---|
| `npm run check` | App/server TypeScript; **264 app tests across 37 files**, **27 server tests**; **2,292 ES/EN/FR catalogue keys** and placeholder coverage; web/PWA and server build all passed |
| Desktop unit checks | **5 passed**, covering terminal saved-server parsing, SQLite validation/recovery and read-only Unicode legacy import |
| Core architecture | Static/dynamic import guard passed: core imports neither app nor runtime; no direct DOM rendering or browser-storage access |
| Original visual fidelity | Original village/house captured in an isolated profile; current village/house inspected side by side. Layout, palette and familiar furniture retained; new furniture/guides and sheet-based artwork are visible. Labels shortened to avoid furniture overlap |
| Study and furniture | Manual cards/notes/solo quiz completed on phone/tablet/desktop; Finish editing and configurable quiz conversion; garden save/reload; custom character discard/save; timer and local audio playback/stop passed |
| Keyboard and touch | Fresh/locked identity movement, modal focus recovery, click/double-click/touch interaction, portrait/landscape room furniture and moved-door persistence passed |
| Legacy UI regression | **15 settings/notices/mobile-screen/portrait/HUD journeys** and **11 whiteboard/room journeys** passed on the final production bundle; no product changes were needed |
| Personal ink/PDF in WebKit | Eight general rebuild journeys passed: language/identity, notebook persistence/backup, multipage PDF, diagnostics, two-tab conflict, quota, jukebox and focus. WebKit automation is not iPadOS hardware validation |
| Final shared ink in WebKit | **3 passed**, including actual two-person authenticated server collaboration, selected-page privacy, author-only undo, failed durable outbox write with successful retry, recoverable copy edit/reload, pointer cancellation, lasso/copy/rotate/delete/undo |
| Persistent browser clients | Real claim/invite/capacity/restart and diagnostic-session retention; guest-layer permissions; friend access with owner offline after restart; custom avatar PNG delivered and rendered on another client's world canvas all passed |
| Temporary P2P clients | **5 live journeys passed** through actual PeerJS/WebRTC: public/private voice and hang-up, scene travel, shared quiz, administrator managing Werewolves without a seat, camera separation between games and cleanup. Two contexts on one Linux machine with synthetic media |
| Identity and migration | Up to3 signed endpoints/person, actual-host authority, one media endpoint, spoof rejection; encrypted identity export/import; complete backup recovery; original-format synthetic SQLite/WebKit→Electron export→restore/reopen twice passed. Real personal profiles were not read |
| Desktop AI setup | Two packaged Electron journeys passed with an intercepted Ollama protocol fixture: feature verification, draft review/save/reload, visual model check and actual Gartic bot turns. A browser-only journey proves local-provider controls are absent and no loopback AI request is sent |
| Host-only AI | Unsupported/unavailable model, strict output validation, queue/rate limits, cancellation and timeout; unauthorized provider denial; server-local mocked Ollama remains usable with administrator offline passed. Actual model inference quality/performance not measured |
| Werewolves | **58 Pact scenarios** include complete seeded games covering each hidden role, buildings, mayor succession, infection, compounds and decline/retry behavior. Four real WebSocket identities verify private roles, administrator-only start and video signaling restrictions while voice remains allowed |
| Camera lifecycle | Synthetic browser permissions, capture denial, game switch, sleeping/death transitions and late permission completion passed; no physical-camera claim |
| Relay | `verify-relay.mjs` exchanged real data through authenticated coturn 4.6.1 using the app's RTC configuration; selected candidates on both ends were relay. This was a localhost fixture, not separate NATs |
| PWA | Offline notebook reopen and a two-version service-worker update passed: update waits during writing, closing the old window activates it, and the saved notebook reopens offline |
| Packaged bundle consistency | `verify-packages.mjs` matched **152 web files byte-for-byte** across Linux, Windows, both Mac architectures and Android; desktop bridge files match source. Machine-readable record: `deliverables/BUILD_INFO.json` |
| Dependency audit | Runtime dependency audit: **0 findings**. Full build-tool audit: **5 moderate transitive findings** in Electron packaging's glob/minimatch chain; no high/critical findings. Packaging processes this repository's own files; no major-version override was applied blindly |

Integration journeys ran on production snapshots; the final change after snapshot 294f77 was confined to the maid's decline/inheritance rules, including Cupid's exception. Those final rules are covered by the final unit/server run and included in every package. Unrelated successful browser journeys were not rerun solely because asset hashes changed. Older tests expecting browser-local Ollama or reading the retired local-sync mirror were adapted to the new desktop-provider and IndexedDB contracts.

## Current deliverables

| Artifact | Build | Runtime verification |
|---|---|---|
| `app/dist` | Complete static HTTPS/PWA bundle | Chromium and WebKit on Linux; public HTTPS client on GitHub Pages |
| `server/dist/server.mjs` | Node 24 persistent server | Real WebSocket, restart, storage, ACL and local AI protocol-fixture tests |
| `deliverables/linux-current/StudyVillage-linux-x64.tar.gz` | Current x64 desktop folder/archive | Launched on this Linux machine: sandbox enabled, context isolation, no renderer Node access, WebRTC API, real file save, terminal server profile, SQLite/legacy import and reload passed |
| `deliverables/windows-current/StudyVillage-windows-x64.zip` | Current unsigned x64 application | Cross-built on Linux; Windows execution not tested |
| `deliverables/macos-current/StudyVillage-macos-intel.zip` | Current unsigned Intel app | Cross-built on Linux; Mac execution/Gatekeeper not tested |
| `deliverables/macos-current/StudyVillage-macos-arm64.zip` | Current unsigned Apple Silicon app | Cross-built on Linux; Mac execution/Gatekeeper not tested |
| `deliverables/android-current/StudyVillage-development.apk` | Debug APK, JDK21/SDK36 | APK assembled and bundled assets verified; device installation/media/stylus not tested |

Keep the entire unpacked desktop folder. macOS builds on Linux lack restored code signing/asar integrity enforcement; they are not notarized releases. Electron 45 requires macOS 13+, and PDF.js's supported legacy Safari baseline is 18+; the owner reports iPadOS 17.7.10; the Mac OS version is unknown. See SETUP.md and its primary-source links. No native iOS app is included or required.

Reproduce packaging after `npm run build` using `node scripts/build-linux.mjs`, `node scripts/package-platform.mjs win32 x64`, and the corresponding `darwin x64`/`darwin arm64` commands. `npm run android:apk` builds/collects Android. `node scripts/verify-packages.mjs` compares bundles; `sh scripts/archive-current.sh` produces the current archives on Linux. Archives replace their prior current version instead of accumulating releases.

## Performance fixture

`verification/ink-profile.json` records an isolated synthetic notebook: **2,001 objects, 52,000 samples**, one 12,000-sample stroke, 4,394,116-byte editable JSON. Linux Chrome measured 40.7ms cold redraw, 12.4/12.5ms warm redraw, 38.1ms serialization, 400.8ms IndexedDB save and 345.6ms read/validation during concurrent development work. Live pen preview draws separately; these are whole-page operations. They do not establish older-iPad latency, palm rejection or a universal frame-rate guarantee. Reproduce with `node scripts/profile-ink.mjs` against the dev server.

Current dialogue/link images: `verification/npc-speech.png`, `npc-speech-phone.png`, `npc-dialogue-settings.png`, `study-note-backlink-{desktop,phone}.png` and `study-deck-source-{desktop,phone}.png`.

Earlier reviewed images: `verification/original-{village,house}.png`, `rebuild-{village,house,notebook,phone-notebook}.png`, and `werewolves-{lobby,active}.png`. They contain only synthetic local state.

## Explicit limits and next device checks

- The 32 hidden character types and public offices are implemented, but only **five adapted events**, not all 36 official event cards; digital medium/actor/gesture rules are documented in WEREWOLVES.md.
- Shared ink currently uses one text layer per author; shared page organization is limited. Legacy boards/notes coexist with the independent new notebook system. See INK.md and ARCHITECTURE.md for precise boundaries.
- Direct WebRTC exposes connection timing/metadata to a modified client; no SFU-style concealment is claimed.
- Main/new French flows were reviewed and catalogue coverage is automated; a native-speaker pass over the inherited catalogue is still useful.
- Free hosting/signaling have quotas/availability limits. No paid component is mandatory; the public HTTPS client is hosted on GitHub Pages; no persistent multiplayer server or universal relay service has been provisioned.

The software is prepared for these short physical checks: install the HTTPS PWA on the actual iPad/iPhone; write with the actual Pencil, rest a palm, rotate and reopen offline; annotate a multipage PDF and share only one page. Install the Android APK and check its available pen, keyboard and permissions. On the Mac/Windows device, check OS compatibility, first launch and file export. Finally join from two different networks, test microphone/camera switching, background/resume and the chosen relay. Report the actual device/OS rather than inferring results from Linux automation.

## Public iPad test link — 5 November 2026

The client is published at **https://javpato.github.io/studyvillage/** through the repository's GitHub Pages workflow. Deployment of commit `9666500` passed. A clean WebKit tablet-sized browser checked HTTP 200, HTTPS secure context, relative sprite/asset URLs under `/studyvillage/`, touch navigation into the house and garden, notebook drawing/save/reload with exported stroke verification, and the correctly scoped service worker. No page errors or failed app-asset requests were observed. This verifies the deployed URL, not physical iPad hardware.

The owner's iPad reports iPadOS **17.7.10**. The owner reported Pencil/palm, long-press selection and zoom-layout problems during the first physical test; the correction above needs a new physical test. Media behavior remains unverified; the PDF.js legacy Safari18+ support boundary still applies. The initial deployment probe incorrectly expected a save-status message after reopening an existing notebook; it was corrected to verify the persisted ink through an editable export, which passed.

## Published iPad correction — 5 November 2026

Commit `5ac233f` deployed successfully through GitHub Pages. A fresh WebKit tablet browser checked the public URL's exact current cache (`studyvillage-6fc387a41ee85d65`), touch navigation, enabling and persisting Apple Pencil mode, synthetic low-pressure pen input over a held touch, saved ink after reload, the non-selectable control policy and the scoped HTTPS service worker. No page errors occurred. The first public probe used an ambiguous close-button selector; scoping it to the drawer header passed. This remains Linux browser automation; physical iPadOS 17.7.10 retesting is pending.


## Forest Blocks and direct phone editing candidate — 2026-11-07

Integrated upstream `2ac1bc1` (25 commits) and preserved the pre-existing handbook edits. Candidate changes cover inline phone gestures/folders/library, independent garden rendering and cancellation, desktop HUD editing with the clock, consolidated network settings, and the Tetris activity engine/UI/host/server/media contracts.

Completed before the candidate checkpoint: typecheck; 13 focused engine/layout tests; translation coverage; browser journeys at 390 and 1440 pixels for phone installation/removal, solo gameplay and garden cancellation, plus folder drag/rename. General unit run: 461 passed; five installer checks could not spawn Git inside the sandbox and require an unrestricted rerun.

Remaining at checkpoint: full unit/server rerun, delayed 16-client transport test, Chromium garden/HUD regression, WebKit journeys, current production build, and final cleanup. Physical cameras/microphones, WAN/NAT behavior and foreign native installers are not certified by these checks. This is a testable candidate, not a verified release.

### Candidate verification follow-up

- Initial candidate: `5f81052`; workflow https://github.com/Javpato/studyvillage/actions/runs/42393242811 failed because the newly added transport test lacked explicit generic types. Corrected locally before the final check.
- `npm run check`: PASS, 467 client tests and 32 server tests, ES/EN/FR coverage, typecheck, production web/PWA and server builds.
- A real server test authenticated 16 clients in multiple neighborhoods, started one shared round, reconciled a guest input and joined one shared game voice channel. Temporary peer villages retain their existing six-person capacity.
- Chromium: 10 garden/phone/HUD journeys passed; the additional long-press/desktop-clock journey passed separately after selecting the live HUD rather than its preview clone.
- WebKit: five garden/phone/game journeys passed. The sixth exposed clock overlap over the phone; corrected with a scoped visibility rule and awaiting targeted rerun.
- `npm run test:pages`: PASS in Chromium and WebKit, including packaged subpath assets, offline cache, persistent ink, palm rejection and finger navigation.
- Focused camera and game tests: 21 passed, including four-camera selection and track cleanup. No physical media hardware or WAN/NAT certification, and no new native installers or release tags. Existing native bundles predate this candidate; current working builds are `app/dist` and `server/dist`.

### Final local result

Final source candidate `09e77e6` is pushed to `origin/main`. WebKit's targeted long-press and clock persistence/cancel journey passed after the overlap correction (1/1). The current production PWA cache is `studyvillage-da53bb3380789ddf`. User-authored handbook changes remain uncommitted and preserved. Generated browser outputs and task scratch files were cleaned; current web and server builds are retained.

GitHub Actions run https://github.com/Javpato/studyvillage/actions/runs/42393927955 completed successfully for `09e77e6`: both build and deploy passed. The web candidate is published to GitHub Pages; native installers remain unchanged.


## Phone drag feedback — 2026-11-07

Added a noninteractive lifted icon following mouse/touch movement, a dimmed source, highlighted destination and a short settle animation (skipped for reduced motion). Long press can continue into dragging; cancellation, capture loss, blur, closing and disposal remove the preview without changing the layout.

Completed before push: source typecheck and four Chromium journeys (mouse grouping, native touch at 390/820 widths, cancellation and long-press/reduced-motion cleanup). Inspected the captured tablet drag preview. Remaining checkpoint: WebKit mouse/long-press journeys and the automatic Pages workflow. User handbook edits remain untouched and uncommitted.

The production build then caught an overly broad string type in the new CDP test helper; its event type was narrowed to the four supported touch events before rerunning the build.

Drag feedback final local results: production build PASS; Chromium 4/4 (including native touch at phone/tablet widths); WebKit 2/2 (drag/grouping and long-press/reduced-motion cleanup). Visual preview inspected. Source is pushed as `c04cc33`; publication workflow: https://github.com/Javpato/studyvillage/actions/runs/42413929362 . Browser scratch outputs removed, current build retained.

GitHub Pages build and deploy for `c04cc33` completed successfully (run 42413929362). Drag feedback is published.

## Forest, phone and sprite improvements — 2026-11-07

Candidate scope: typed app/folder drag destinations, packed insertion feedback and folder renaming; visible sprite descriptions/previews and transactional guide dialogue; mirrored arcade and new guide; one-piece preview, keyboard hints, dynamic controls, media sidebar, three difficulties and authoritative local/room NPC opponents. ES/EN/FR strings updated.

Completed before candidate push: app/server typecheck; 22 focused phone/engine tests including Settings folder collision, ordering, difficulty bags/gravity/attacks, bot permissions and legal play; 2586-message translation coverage. GitHub origin/main was checked and had no newer commits.

Remaining at this checkpoint: Chromium and WebKit interaction journeys, visual inspection, full client/server checks and current production builds, Pages deployment verification and generated-output cleanup. This is a testable candidate, not a verified release. Existing user handbook edits are preserved separately. Workflow: https://github.com/Javpato/studyvillage/actions/workflows/pages.yml

Candidate `e18c30e` is pushed to origin/main. Workflow: https://github.com/Javpato/studyvillage/actions/runs/42421943665 . Full checks and Chromium journeys are in progress; local logs/output are in `/tmp/sv-full-check.log` and `/tmp/sv-forest-chromium`.

Verification follow-up: full check passed (476 app + 32 server tests, ES/EN/FR, web/PWA/server builds). Candidate workflow succeeded and deployed. Browser checks exposed folder tap capture, native capture transfer, compact garden height and drag Escape routing; corrections are being verified. One first-pass desktop game failure was caused by Vite reloading during an edit, so later passes run against stable source/builds. Expanded checks now include guide undo/permissions, sprite import cancellation, all three languages and authenticated server NPC updates.

### Verified forest and phone refinements

- Full local check PASS: 477 client tests, 33 server tests, typecheck, 2589 ES/EN/FR messages, production web/PWA and server builds. The new server journey verifies a common hard difficulty, identical one-piece previews and authoritative NPC moves received by authenticated human clients.
- Chromium and WebKit journeys cover phone/folder insertion, Settings returning to its namesake folder, editable folder titles, cancellation, long press, solo/NPC controls, difficulty, media below cameras, all three languages, garden placement/cancellation, guide text save/cancel/undo and sprite import preview/cancel. Chromium additionally covers continuous native touch at 390/820 widths. The three CDP-only cases are intentionally skipped in WebKit.
- Browser findings corrected: capture begins on the tile so taps still open folders and a fast move outside the phone remains a drag; cancelled gestures suppress their trailing click; Escape also works after focus changes. Compact garden cards leave room for the yard. Mobile held/next pieces use readable labels. Grouping waits 400 ms with its target remaining under the pointer.
- Visual inspection: mobile/tablet/desktop game layouts, compact 320px garden, touch drag feedback, and rotated custom board artwork. Physical microphone/camera devices and WAN/NAT behavior were not exercised; native installers are unchanged. Current working builds remain app/dist and server/dist.
- Candidate e18c30e was published successfully by https://github.com/Javpato/studyvillage/actions/runs/42421943665 . Final refinements are ready for the next source commit; its Pages workflow still needs confirmation. User handbook changes remain local and unstaged.

Final source `faf77f5` is pushed to `origin/main`; the final production build passed (PWA cache `studyvillage-1e76a96ba9c0ce7c`). Final grouping/capture checks: Chromium 4/4 and WebKit 2/2; preceding long-press checks also passed in both. Publication workflow: https://github.com/Javpato/studyvillage/actions/runs/42423148192 . Awaiting deployment confirmation at this checkpoint.

Publication confirmed on 2026-11-08: workflow https://github.com/Javpato/studyvillage/actions/runs/42423148192 completed successfully for `faf77f5`; both build and deploy passed. The final web version is published at https://javpato.github.io/studyvillage/ . Task browser outputs and scratch files were removed, the task dev server was stopped, and current web/server builds were retained. Only the pre-existing handbook edits and local verification follow-up remain uncommitted.

## 2026-11-08 — social, controller and responsive candidate

Candidate: next commit on existing `main` (social requests, optional screen audio, viewer-local floating windows, controller settings/navigation, Forest Blocks layout, garden sizing and mobile containment). This is a test candidate, not a verified release.

Completed before extended verification: application/server TypeScript; 18 focused tests covering friendship privacy/restart state, media/audio lifecycle, window bounds and HUD storage. Browser review initially blocked by Chrome sandbox startup; retrying with approved execution outside the sandbox.

Remaining: server integration restart test; full unit suites; Chromium responsive/notice/game/controller journeys; build and translations; physical iPad keyboard/Safari, real controller and actual OS audio capture. Existing unrelated documentation changes are preserved, not included in the implementation commit.

Workflow list: https://github.com/Javpato/studyvillage/actions (exact candidate/run links will be recorded after push).

Candidate pushed: `d5ece97` — https://github.com/Javpato/studyvillage/commit/d5ece97 . Focused tests: 18 passed. Initial full unit run: 477 passed, 5 installer tests blocked by sandbox `spawnSync git EPERM`; retry approved outside sandbox. Initial visual review: phone world contained; iPad garden occupies about 76% of viewport height. Full browser journeys and build still running.

Verification follow-up: fixed duplicate controller initialization found by browser coverage; fixed the integration test to await recipient delivery (rather than assuming cross-socket ordering). All 482 application unit tests passed, all 34 server tests passed, and 15 focused tests passed after the final audio-track lifecycle correction (including one new regression). Browser coverage: 14/14 social/layout tests, 11 existing Forest Blocks/activity tests, and 6 existing garden/notice/mobile media checks passed. Garden sizes remained stable over 30 frames at effective 200%, 205% and 250% desktop viewport/DPR; this is not a physical browser-menu zoom certification. iPad keyboard tested with a simulated VisualViewport resize, not physical Safari.

Build, server build, types and ES/EN/FR catalogue checks passed. Compatibility: retain server protocol 7; friendship is additive and becomes available after the private friends state arrives. Older servers retain other functionality and display an update message for friend requests. No destructive database migration; friend state uses the existing SQLite metadata store.

Initial candidate workflow https://github.com/Javpato/studyvillage/actions/runs/42478313244 failed on the test delivery-order assumption corrected above. Next candidate includes these corrections. Remaining: packaged Pages checks/CI, final visual inspection, cleanup; physical controller, iPad Safari keyboard, browser-menu zoom and actual OS screen-audio capture remain hardware checks.

Final corrected candidate pushed: `496a8fd` — https://github.com/Javpato/studyvillage/commit/496a8fd . Workflow: https://github.com/Javpato/studyvillage/actions/runs/42478905490 (running at checkpoint). Packaged Pages checks passed in Chromium and WebKit, including offline cache and saved ink; current PWA cache is `studyvillage-652841334e7ffedb`. Final tablet/desktop Forest Blocks and phone world visuals inspected. No native installer or release tag was created. Current web/server builds retained.

Final WebKit targeted checks also passed (2/2): controller settings/local game stop and the iPad invitation field above the simulated keyboard. GitHub workflow 42478905490 has passed unit/server tests, translation checks, build and packaged browser checks; deployment confirmation is pending. Automated coverage does not certify physical Bluetooth pairing, OS audio availability or real iPad keyboard behavior.

Publication confirmed: workflow https://github.com/Javpato/studyvillage/actions/runs/42478905490 completed successfully for `496a8fd`; build and deploy both passed. Web app: https://javpato.github.io/studyvillage/ . Task scratch scripts/logs/screenshots and Playwright output were removed; the task Vite dev server was stopped. Current `app/dist` and `server/dist` retained. Existing user documentation edits remain uncommitted, together with this final verification follow-up; implementation files are committed and pushed. No claim of physical-device or universal system-audio certification.

## dev.8 release execution

Candidate `718cca1` is pushed to `origin/main`. Release workflow: https://github.com/Javpato/studyvillage/actions/runs/42494021822 . It will create `v1.0.0-dev.8` only after validation, all four installer checks and the second macOS architecture check pass. Local full Chromium suite is running with four workers; logs are `/tmp/sv-release-e2e.log`. Version/type and documentation-link checks passed; current web/server builds are being refreshed. No old release/tag was changed.

Full-suite follow-up: older backup/mailbox/language journeys still navigated to the removed standalone `phone-identity` tile. Updated those journeys to the existing shared phone navigation helper (Settings → Identity), preserving their backup/import assertions. Release candidate 718cca1 cannot pass these stale journeys; publication will resume from a corrected candidate without creating or moving a tag.

The three corrected backup journeys passed locally: encrypted identity round-trip, complete backup/recovery and repeated legacy migration. Mailbox and language journeys are continuing with the same corrected navigation. One initial keyboard-startup assertion exceeded five seconds during concurrent local runs; other keyboard scenarios passed, so it will be rerun in isolation rather than changing product behavior or weakening assertions.

Corrected release candidate `2e4cb49` is pushed. Workflow: https://github.com/Javpato/studyvillage/actions/runs/42494527334 . Initial workflow 42494021822 was cancelled before publication due to the obsolete test routes. Tag dev.8 remains uncreated until the release gates succeed. Local backup/migration reruns passed; full browser run is still in progress.

Native-check audit: Android still expected an Identity shortcut on the phone home, although the current default layout has Village, Contacts, Home and Settings and Identity lives within Settings. The APK smoke now checks all four current home entries; house navigation, installation, restart and crash checks remain intact. Desktop native checks already use the shared current phone-navigation helper. No application build changed in this follow-up. The corrected script is being saved before another release run.

Android smoke syntax and all eight phone-layout unit tests passed before pushing `508e30d`. The application build remains `studyvillage-f29a1800aa311d31`; only the native test and verification notes changed after `9996ded`.

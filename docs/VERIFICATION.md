# Verification and handoff — 5 November 2026

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

The previous bundle (`studyvillage-9b6ff1e6b7936dcc`) includes the redesigned notebook, focus clock/jukebox, Werewolves interface, in-world garden placement, NPC speech/custom dialogue, finite display board, sharper wardrobe and sprite vanity. Design references and decisions are recorded in VISUAL_DESIGN.md.

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

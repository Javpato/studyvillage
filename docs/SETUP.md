# Running and distributing StudyVillage

## Browser, iPhone and iPad

Live HTTPS app: **https://javpato.github.io/studyvillage/**. The `Publish StudyVillage` workflow tests, builds and verifies `app/dist` before publishing on pushes to `main`; it can also be run manually from GitHub Actions. Pull requests run the same checks without uploading or deploying a Pages artifact. The site hosts the web client; persistent multiplayer servers remain a separate service.

Run `npm ci` with Node 24, then `npm run dev` and open http://127.0.0.1:3100. `npm run build` produces the standalone `app/dist` bundle, including icons, PDF worker, web manifest and versioned offline cache.

Publish **the contents of app/dist** to a static HTTPS host. A free provider address is sufficient: no purchased domain is needed. One option is Cloudflare Pages → Create project → Direct Upload. Choose the build directory and use the assigned `*.pages.dev` address. The project uses GitHub Pages at the address above; the following is an alternative hosting route. The Free plan currently allows 500 builds/month, 20,000 files/site and 25 MiB/file; the app is static and does not need paid Functions. Check [current Pages limits](https://developers.cloudflare.com/pages/platform/limits/) before deploying.

On iPhone/iPad, open that HTTPS address in Safari → Share → Add to Home Screen. Finish the initial load online. Locally saved notebooks can then reopen offline at the same address. An update waits for old app windows to close; it does not force reload during writing. Changing host/origin creates a different browser storage space: export an editable backup before moving. Device loss or browser data removal can remove local files.

No native iOS app, Apple membership, Xcode or weekly signing is required. Physical Apple Pencil and Android stylus behavior remains untested. The editor uses Pointer Events, pressure where supplied and a constant-width fallback otherwise. PDF support loads separately; the installed PDF.js legacy build lists **Safari 18+** as mostly supported and Chrome 125+ as supported. Earlier iPadOS PDF compatibility is not certified ([PDF.js compatibility](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)). Opening the basic village does not eagerly load PDF.js.

For local production testing:

```sh
npm run build
npx playwright install --with-deps chromium webkit
npm run test:pages
```

The Pages check serves the built files under `/studyvillage/`, without a development-server fallback. It verifies every precached file, opens the packaged app in Chromium and WebKit, exercises writing and Hand navigation, and checks saved ink after an offline reload. `SV_BUILD_DIR=/path/to/extracted/site npm run test:pages` checks an extracted CI artifact without rebuilding it. `CHROME_PATH` can point to an installed Chromium executable; `SV_BROWSERS=chromium` or `webkit` limits a local diagnostic run. CI always runs both engines.

A successful build is distinct from a successful Pages publication. If `deploy-pages` accepts the artifact but repeatedly returns `updating_pages` or an empty status and times out, inspect the deployment logs and GitHub's service state before retrying. Validate the uploaded artifact with the command above. Increasing the timeout or changing handwriting code does not establish a fix for that failure. After the hosting problem is resolved, start a fresh workflow so the current validation steps run before publication.

An arbitrary HTTP LAN address is not a secure iPad camera/PWA route. Use HTTPS with a certificate trusted by the testing device; `npm run dev:lan` helps prepare local HTTPS. Do not disable browser security to make camera access work.

## Desktop and Android

Build and launch paths:

| Target | Command | Output |
|---|---|---|
| Linux x64 | `npm run linux:build` | `deliverables/linux-current/StudyVillage/studyvillage` |
| Windows x64 | `npm run windows:build` | `deliverables/windows-current/StudyVillage-win32-x64/StudyVillage.exe` |
| macOS Intel | `npm run mac:build` | `deliverables/macos-current/StudyVillage-darwin-x64/StudyVillage.app` |
| macOS Apple Silicon | `npm run build && node scripts/package-platform.mjs darwin arm64` | `deliverables/macos-current/StudyVillage-darwin-arm64/StudyVillage.app` |
| Android | `npm run android:apk` | `deliverables/android-current/StudyVillage-development.apk` |

Keep the complete desktop folder, including resources/DLLs. Windows/macOS packages are unsigned; OS execution policy may restrict them. Linux retains Chromium sandboxing and can use an installed root-owned Chrome sandbox helper. Wayland screen sharing requires a functioning system portal and actual-session testing. Electron 45 requires **macOS 13 Ventura or later**; the owner's older Mac version is unknown ([Electron support change](https://www.electronjs.org/docs/latest/breaking-changes#removed-macos-12-support)). See VERIFICATION.md for built versus runtime-tested targets.

Desktop data uses the separate `local.studyvillage.rebuild` profile (Linux: `$XDG_DATA_HOME`, falling back to `~/.local/share`; Windows/macOS: Electron's application-data location). The original profile is never imported automatically.

Android needs SDK 36 and a full JDK 21. In this workspace:

```sh
export JAVA_HOME="$HOME/.cache/studyvillage-toolchains/jdk21"
export ANDROID_HOME="$HOME/Android/Sdk"
npm run android:apk
```

The APK is debug signed, with a distinct `com.studyvillage.rebuild` application ID. Install it through Android's package installer after allowing the chosen file source. Existing original app data stays separate. Production signing and upgrade continuity need a stable owner-kept key before adoption; the development keystore is not committed.

## Hosting and joining

Use the phone to create a temporary village or join an invitation on any supported client. A temporary village belongs to its original host and ends after that host leaves or exhausts the reconnect grace period; there is no host election. Temporary hosting does not install a persistent server. PeerJS signaling is an external dependency by default; voice/camera connections use WebRTC.

For a persistent village, run the bundled Node 24 server on a computer you control, with a **new data directory**:

```sh
npm run server:build
DATA_DIR=./server/data PORT=8787 HOST=127.0.0.1 node server/dist/server.mjs
```

PowerShell: set `$env:DATA_DIR='.\server\data'`, `$env:PORT='8787'`, `$env:HOST='127.0.0.1'`, then `node server/dist/server.mjs`. The initial setup secret appears in the server terminal and in a restricted file. In the phone, save an encrypted Identity, open Settings → Servers, check the server address and claim it with that secret. Share an invitation instead of the administrator secret. Persistent worlds keep running when the administrator's app closes.

For remote access, configure HTTPS/WSS and `ALLOWED_ORIGINS` with the PWA's exact HTTPS origin. Either supply `TLS_CERT` and `TLS_KEY` to the server or use an HTTPS reverse proxy forwarding WebSocket upgrades to port 8787. `HOST=127.0.0.1` is appropriate behind a same-machine proxy. Do not expose a development wildcard-origin server as the final deployment.

Desktop terminal shortcuts save an address for review in Settings → Servers; they do not connect or claim administration automatically:

```sh
# Linux
./studyvillage --add-server=https://village.example.org --server-name=Friends
# macOS, from the containing directory
./StudyVillage.app/Contents/MacOS/StudyVillage --add-server=https://village.example.org --server-name=Friends
```

```powershell
# Windows
& '.\StudyVillage.exe' '--add-server=https://village.example.org' '--server-name=Friends'
```

Use the same `DATA_DIR` for server backup: `node server/dist/server.mjs backup ./village-backup.sqlite`. Stop the process before `node server/dist/server.mjs restore ./village-backup.sqlite`; restore preserves a `.before-restore` database. Personal device backups and server backups cover different data.

## Optional host AI

All manual tools work without AI. Only a packaged desktop temporary host can share its own explicitly enabled Ollama. Mobile/tablet temporary hosts and browser-only hosts have no local provider route; a desktop guest cannot take over. Offline desktop personal use is supported separately.

Persistent shared AI belongs to the server computer. Install a local model yourself, keep Ollama on loopback and start the server with:

```sh
OLLAMA_ENABLED=true OLLAMA_MODEL=your-installed-local-model \
OLLAMA_FEATURES=flashcards,quizzes,board,boardVision,sprites,gartic \
DATA_DIR=./server/data node server/dist/server.mjs
```

`OLLAMA_URL` defaults to `http://127.0.0.1:11434`. Select an actually installed local model; no model downloads or cloud fallback occur. Image tasks require declared vision capability. Requests reach the authenticated StudyVillage host, never a public Ollama port. The server processes one generation at a time, limits the queue and each person's request rate, validates returned structures and cancels timed-out work. Selected prompts/pages are sent only when the user requests a feature; private notebooks are not automatically uploaded. Tests use a deterministic local Ollama protocol fixture; actual model quality/performance is a separate check.

## Optional signaling and relay

Phone → Connection accepts an HTTPS signaling URL and an authenticated `turn:`/`turns:` relay with username/password. Saving applies to the next connection. Leave fields empty for default signaling/STUN. Force-relay is a diagnostic option and requires a configured relay. Credentials stay in device storage and are included in whole-device backups; treat those backups as private.

For self-hosted signaling on existing hardware, [PeerServer](https://github.com/peers/peerjs-server) documents `npx --package peer peerjs --port 9000 --key peerjs --path /peerjs --proxied true`. Put it behind a trusted HTTPS reverse proxy with WebSocket forwarding; enter `https://your-existing-address/peerjs` in Connection. This replaces signaling, not a TURN relay or persistent StudyVillage server.

For networks that require relaying, install [coturn](https://github.com/coturn/coturn) on reachable existing hardware. Use authenticated long-term credentials (`lt-cred-mech`, a realm and a unique user/password), a limited relay port range, appropriate firewall rules and correct public/external IP mapping. Share credentials only with intended participants; never operate an unauthenticated public relay. Enter the advertised TURN address in each client's Connection panel. TLS uses a trusted certificate. A machine behind CGNAT without a reachable path cannot become a universally reachable relay just through app configuration.

Connectivity troubleshooting: first check the HTTPS address and signaling availability; distinguish an expired invitation/authentication error from an ICE/media failure. Compare direct versus force-relay in Connection. A successful local test does not prove a route between two unrelated networks. No unlimited free relay service is promised: default free infrastructure has its own availability and policies, and self-hosted services use the owner's bandwidth/hardware.

## Writing, sharing and recovery

Phone → Ink notebook opens personal work. Use pen/highlighter, eraser, lasso, text and shapes; organize pages, undo/redo, pan/zoom and rotate. Notebook IDs are independent of furniture. Import PDFs locally and annotate the displayed page. A presentation PDF flattens each page for reading; editable backup retains document structure and original attachments.

Share only the selected page as a copy into the current permitted shared ink space. A selected PDF page is sanitized into a standalone PNG; other pages and the original multipage PDF are excluded. Shared changes pass through the actual host/server with author permissions. A personal copy is independent of future shared changes. Pending edits use a durable outbox and explicit recovery when a newer authoritative version conflicts.

Personal notebooks allow 500 pages, 20,000 objects/page and 200,000 samples/stroke. PDF imports: 20 MiB/500 pages. Editable notebook envelope: 32 MiB; document structure: 25 MiB. Attachments carry SHA-256 checks. Partial erasure preserves pressure/subpixel samples; no world-pixel rounding is applied. A failed save keeps the draft and exposes retry/export. Export before clearing browser data. See the backup/migration controls in Identity for moving a complete device archive; an encrypted identity alone does not contain notebook data.


## One identity on a computer and tablet

In Phone → Identity, save an encrypted identity with a password, then export its encrypted identity file. Transfer that file yourself, open Identity on the other device, preview its fingerprint and import it with the password. The import verifies the private signing key. Public contact cards, names and invitations alone cannot authorize another device. Browser keys are protected by password encryption at rest and exist in memory while unlocked; this is not a native hardware keychain. Keep the encrypted file and its password for recovery.

Join the same temporary or persistent village from both devices. Temporary invitations still require the actual host's admission. Up to three authenticated endpoints share one person, house, position and social slot. Settings → Servers lists them in either mode: choose “Use voice and camera here” on the desired device; the others stop their media tracks. The computer hosting a temporary village remains its authority even when its paired tablet joins. Closing that actual host still ends the temporary session; a paired device does not take over hosting. The two devices' private notebooks remain separate unless you deliberately copy/export them or use a shared ink space.

## Complete device backup and legacy migration

Identity → Back up all my data exports a versioned JSON archive (128 MiB limit): encrypted identity, house/floors/rooms, contacts, editor and file references, legacy notes/boards/study/projects, settings, asset packs, and private ink notebooks with original PDF attachments and integrity hashes. The identity is encrypted; the rest of this archive is readable private data. Referenced external desktop files and session-only jukebox audio are not embedded. Shared document state belongs to its host/server: save a personal copy of pending shared work first. Server SQLite backups are separate.

To restore, leave the village, select the archive and review its identity/counts and differing local entries. Close other app windows, confirm replacement and restore. Validation runs before writes; the importer records the previous state before replacing data and restores it after interruption or write failure. After a successful restore it restarts the app. The “Export backup from before restoration” button retains a portable copy of the previous state. Reimporting the same archive replaces the same IDs instead of duplicating documents. Close other windows as requested: restore cannot coordinate an older running app at a different origin.

To extract an original **desktop** profile explicitly, close the original app and run from this repository:

```sh
npx electron scripts/export-legacy-profile.cjs /absolute/path/to/original-profile /absolute/path/to/new-backup.json
```

Use the installed Chrome sandbox helper via `CHROME_DEVEL_SANDBOX` if your Linux environment requires it. The script reads `studyvillage.sqlite3` and legacy WebKit storage read-only. If Chromium storage exists, it opens only a temporary copy with networking disabled. The source and an existing output file are never overwritten; unknown legacy storage keys are retained under `references` in the archive and are **not activated** by the new app. Import the resulting archive through Identity in the rebuild. Browser/Android profiles need an explicit export from their own accessible storage; this desktop reader is not an automatic extractor for those platforms. Only synthetic profiles have been migrated and reopened in testing; no original personal profile was accessed. Preserve the old app/profile until you have checked your own archive and any retained references.

Current compressed desktop packages live beside their unpacked folders. `deliverables/SHA256SUMS` records hashes; `BUILD_INFO.json` records the shared PWA version. On Linux, `sh scripts/archive-current.sh` regenerates the current archives after packaging.

The current client and persistent server use protocol 7 for cancellable access requests and private mailbox commands. Update both together; incompatible older servers are rejected before joining.

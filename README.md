# StudyVillage

[Open StudyVillage in your browser](https://javpato.github.io/studyvillage/). On iPad, open this link in Safari and use Share → Add to Home Screen.

An independent reconstruction of the original cozy study village, preserving its Canvas world and artwork while rebuilding document editing, synchronization, identity/device handling and several game/tool interfaces. The original `../hackathon` project and data remain separate. This is the current **development candidate**; [verification](docs/VERIFICATION.md) distinguishes working tests, platform builds and remaining validation.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3100. WASD/arrows move, Shift runs, E interacts and M opens the phone. Identity unlock is optional for offline work. Choose Español / English / Français in Settings → Profile.

Use the phone for Identity, Ink notebook, Focus, Music, Garden, study tools, voice and connection settings. New houses include a notebook desk, a movable/removable guide, a study clock and a jukebox. Add furniture through Decorate; existing houses are not silently rearranged. Local music stays on your device and can continue with its panel closed; Stop music ends playback.

Personal notebooks have editable pressure-aware ink, partial erasure, selection, touch navigation, PDF annotation and portable backups. Explicitly share one page into the current shared board or save a personal copy. Notebooks have independent IDs and survive furniture changes. Export backups before clearing device data.

LoupGarou has selectable illustrated role cards, game settings, mayor elections and a camera-based table. Camera and microphone consent remain separate. Artwork is replaceable through PNGs with dimensions recorded in the [sprite catalogue](docs/SPRITES.md).

```sh
npm run check                 # Types, unit/server tests, translations, web/server builds
npm run test:e2e -- rebuild.spec.ts keyboard-movement.spec.ts
npm run linux:build           # Current Linux executable folder
npm run linux:smoke            # Isolated synthetic profiles
npm run windows:build         # Unsigned Windows folder
npm run mac:build             # Unsigned Intel Mac folder
npm run android:apk           # Requires JDK 21 and Android SDK
```

For Apple Silicon: `npm run build`, then `node scripts/package-platform.mjs darwin arm64`. iPhone/iPad use the HTTPS PWA and Safari's Add to Home Screen; no native signing or Apple membership is required. Hardware/OS requirements and unknown-device limits are in [setup](docs/SETUP.md).

Read the [feature inventory](docs/FEATURES.md), [architecture](docs/ARCHITECTURE.md), [ink behavior](docs/INK.md) and [current verification](docs/VERIFICATION.md). No mandatory paid runtime component, cloud AI API, purchased domain or subscription. Free services have quotas and self-hosting uses the owner's hardware/network. This repository is public. No open-source license has been selected; the project remains UNLICENSED and existing assets haven't been relicensed.

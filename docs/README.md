# StudyVillage technical handbook

Start with Features → Setup → Architecture. Then follow the subsystem you are changing. Paths in code spans are relative to the repository root unless stated otherwise. The source is authoritative; dated verification entries distinguish automated evidence from physical-device checks.

| Guide | Read it for |
|---|---|
| [Features](FEATURES.md) | Overview and current feature boundaries |
| [Setup](SETUP.md) | Install, develop, host and troubleshoot setup |
| [Architecture](ARCHITECTURE.md) | Layers, startup, ownership and compatibility |
| [World Assets](WORLD_ASSETS.md) | Canvas world, houses, furniture and garden geometry |
| [Sprites](SPRITES.md) | PNG catalogue, dimensions and artwork replacement |
| [Ui Input I18N](UI_INPUT_I18N.md) | UI composition, gestures, accessibility and languages |
| [Identity Security](IDENTITY_SECURITY.md) | Keys, saved identity, permissions and trust boundaries |
| [Storage Backups](STORAGE_BACKUPS.md) | Stores, concurrency, export, restore and recovery |
| [Networking](NETWORKING.md) | Temporary/persistent sessions, transport and synchronization |
| [Server](SERVER.md) | Server configuration, HTTP/WebSocket contracts and durability |
| [Ink](INK.md) | Notebooks, handwriting, PDF pages and collaboration |
| [Study Tools](STUDY_TOOLS.md) | Libraries, workspaces, focus, music, mailbox and guides |
| [Minigames](MINIGAMES.md) | Activity lifecycle, engines, bots and integration |
| [Werewolves](WEREWOLVES.md) | Detailed roles, offices and digital rule adaptations |
| [Media](MEDIA.md) | Voice, screens, cameras and consent lifecycle |
| [Ai](AI.md) | Provider ownership, bounded generation and draft review |
| [Packaging](PACKAGING.md) | PWA, desktop, Android and current artifacts |
| [Testing Maintenance](TESTING_MAINTENANCE.md) | Checks, troubleshooting, cleanup and contribution rules |
| [Verification](VERIFICATION.md) | Dated test/build evidence and unresolved physical checks |

## Follow a complete workflow

- **Private handwriting:** UI/input → Ink → Storage/backups → Testing.
- **Shared page:** Ink → Networking → Server → Identity/security.
- **New furniture:** World/assets → Sprites → Study tools → UI/input.
- **New game rule:** Minigames → Werewolves where applicable → Networking → Media.
- **Distribution:** Setup → Packaging → Testing → dated Verification.

## Supporting references

[Root quick start](../README.md), [asset licenses](../ASSETS_LICENSES.md), and [repository instructions](../AGENTS.md) remain at the root. Screenshots and machine-readable fixtures in `verification` are retained evidence. The former Garden and Visual Design guides have been incorporated into World/Assets and UI/Input; their standalone duplicates were removed.

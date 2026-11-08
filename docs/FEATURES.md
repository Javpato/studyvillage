# Feature and acceptance inventory

## Current phone and new-house defaults

The phone starts with Village, Contacts and Identity, plus Home (My house, Rooms, Decorate, My garden) and Settings (Settings, Connection, Voice, Edit controls on touch devices). Ink notebook, Music, Study, Projects and Focus are optional shortcuts. Settings → Phone manages folders, ordering and shortcuts; Settings cannot be removed. Removing a folder moves its shortcuts to the home screen. Layout is per device and included in full backups; removing shortcuts never removes tool data.

New houses contain only the board, desk, plant, wardrobe and guide, plus the existing private-floor portal. They start with a removable outdoor mailbox. Saved houses and deleted furnishings are not replenished or rearranged. These defaults supersede earlier initial-furniture descriptions below.


Original paths below are relative to `../hackathon`; replacement paths are in this independent repository. The original source, reference release and private profiles are preserved. This inventory records deliberate reuse and changed behavior; build/test evidence is in VERIFICATION.md. It is not a claim that every platform or physical pen has been tested.

| Original location and behavior | Rebuild decision / target | Acceptance evidence or remaining boundary |
|---|---|---|
| `app/src/ui/app.ts`, `bootstrap.ts`: coupled world/input/auth/document composition | Retain recognizable Canvas world and imperative presentation; extract shared contracts, workspace coordination, document engines, transport and storage adapters | Comparable original/rebuild screenshots; keyboard/movement regressions. Existing presentation classes remain large; reuse is explicit |
| `app/src/i18n`: ES/EN | Add bundled French, live translation bindings and locale formatting | Key/placeholder coverage; French browser switch; reviewed new guides/game/backup vocabulary. Older catalogue translations still need a fluent review |
| Diagnostic navigation | In-app diagnostics retains the active connection; standalone route opens separately | Authenticated persistent-server browser journey checks connection before/after diagnostics |
| Startup identity overlay | Start offline without a blocking identity form; explicit Identity phone entry and unlock | Fresh and encrypted-profile keyboard tests; no forced login for personal notebooks |
| HD voice bench | Remove obsolete object and collision; retain phone voice | Registry/world tests and visual baseline |
| `study` and `ui/study-ui.ts` | Reuse library/progress; Finish editing, shuffle/reverse/pending/hints; manual alternatives become a separate quiz; time, shuffling, scoring, streak and leaderboard controls | Study engine tests, phone/tablet/desktop manual journeys; no simulated AI content |
| `house`, `world`: furniture tools | Preserve original furniture; add 17 items, four area guides and removable/movable house guide; exterior garden placement | Garden save/reload and furniture interaction tests. Outdoor decorations stay in the owner's bounded yard around the house |
| New useful furniture | Automatically repeating focus/break clock with both durations configured in hours/minutes/seconds and a movable, optional persistent HUD; local-file jukebox with drop/picker upload and custom playback controls; notebook desk and drawing display | Timer deadline, pause/reload, HUD position/visibility and audio background/stop journeys; responsive phone/tablet/desktop layouts and EN/FR controls. Jukebox does not upload or broadcast local audio |
| `assets`, `ui/art.ts`: procedural avatar | Compose twelve-frame character sheets from wardrobe choices; preview/import/export exact 192×256 PNG and commit only on Save look | Discard/save browser test; authenticated bounded peer transfer test; owner sheet fallback when unavailable |
| Procedural world/item/card artwork | Owner PNG manifest covers furniture, guides, roles, bots, trees, terrain, houses, doors, portals, plots, stations and main phone/study icons | Manifest PNG-header/dimension validation. Dynamic text, weather and geometric UI effects remain drawn |
| `minigames/werewolves.ts`, old game panel | Reuse turn-based foundation, replace lobby/cards/settings/media UI; implement Pact characters/building offices, mayor succession and independent win conditions | Role mechanics/privacy/authority tests and seeded full games. Five curated event effects; this is not a reproduction of all 36 printed event cards |
| `media`: game cameras | Right-hand lobby camera column, active table, private wake/sleep policy, death capture stop,3-second closing countdown; voice retained | Unit/media tests, synthetic Chromium camera journeys. Direct WebRTC metadata remains observable to a modified client; no SFU claim |
| Village media | Floating camera squares above avatars, global/per-person hide and explicit capture from the world HUD. Ordinary travel between areas, houses, floors and rooms keeps the same capture while replacing scene subscriptions | Temporary and persistent-server browser journeys verify one camera request and one live track throughout travel, with capture stopped on session exit; two-person travel verifies remote cameras disappear across scenes and return together. Late permission results, game changes and death remain covered. Physical cameras and external-network routing remain separate validation |
| Old rounded whiteboard points | New `packages/documents` with subpixel pressure/tilt/time, immutable objects, partial erasure, lasso/transform/copy, shapes/text, undo/redo, pen/touch arbitration | Cancellation/geometry/ownership tests; editable reload/backup; synthetic stress profile. Physical Pencil feel unverified |
| Notes tied to world objects | Notebook/page IDs independent of furniture, organized pages and private offline persistence | Create/write/reopen/reload; quota failure, two-tab conflict recovery and editable round-trip |
| No independent PDF workflow | Lazy local PDF import, bounded current-page rendering, annotation transforms, readable flattened PDF and editable backup | Multipage browser import/export. Rasterized presentation PDF does not retain searchable text; PDF.js Safari18+ baseline |
| `whiteboard` collaborative drawings | Preserve legacy boards; add shared ink editor with stable author layers, revision checks, bounded chunks, durable outbox and host/server authority | Real authenticated two-person drawing/undo/copy, chunk/replay/revocation/save-failure tests. See INK.md for shared-metadata/text limits |
| Private notes and attachments | Sharing sends an explicit selected copy; selected PDF page becomes standalone PNG | Private appendix/original multipage PDF excluded from shared payload; copy does not track source edits |
| `storage` and local persistence | New transactional notebook store; recoverable saves; portable whole-device archive with preview/journal; original-profile export helper | Browser restore/reopen twice; synthetic original SQLite/Chromium migration preserving ownership/IDs/keys, no real data touched |
| One endpoint per identity | Up to 3 signed devices share one person/house/scene; selected media endpoint, actual-host authority | Persistent and temporary paired-device tests, unauthorized public-card spoof rejection; encrypted identity browser transfer |
| `session`, `transport`, `server` | Keep temporary host and persistent Node/SQLite modes; improve reconnect and paired endpoint routing | Real server restart/ACL journeys, temporary protocol tests and available live P2P journeys. No automatic host migration |
| Organizer-owned Ollama | Shared AI only from authorized packaged desktop temporary host or persistent-server machine | Provider matrix, unavailable/unsupported model, queue/cancel/timeout/schema tests; server fixture works with administrator offline. Actual model inference not yet measured |
| PWA and wrappers | Versioned offline bundle; isolated Electron profile; separate AndroidID; terminal saved-server shortcut | Offline/startup and waiting-update test; available desktop smoke/builds. Public HTTPS client on GitHub Pages; no native iOS route |
| Networking defaults | Default PeerJS/STUN plus explicit HTTPS signaling and authenticated TURN settings | Config validation and available direct/relay tests. No unlimited free infrastructure or guaranteed CGNAT traversal |

## Furniture additions

Oak, palm, cherry tree, flowerbed, lantern, fountain, picnic table, hammock, mailbox, birdbath, mushrooms, stone path, ink desk, guide, sketchboard, focus clock and jukebox. The sketchboard displays the drawing saved on that board. Garden items have an exterior placement tool; interactive tools remain available from familiar furniture and phone entries.

## Remaining external validation

Physical Apple Pencil/palm rejection, Android active pen, actual Windows/macOS execution, Android APK installation/media, Wayland portal behavior, external-network NAT/relay paths and genuine Ollama model behavior require suitable hardware or an explicitly configured service. Older Mac/iPad compatibility must be checked against their actual OS versions. Full French linguistic review and the printed 36-card event deck are known content limitations, not hardware blockers.

## Interface correction pass — November 2026

- NPC speech uses a larger Standard bubble by default, with Small/Standard/Large in Settings → Controls → Guide dialogues. Text wraps and scrolls within the viewport. Size, opacity, font size and progressive text persist, reset to defaults and are included in whole backups. The selected language is resolved before animation. House dialogue remains editable from Decorate.
- Pet houses create cats, dogs, parrots, hamsters or rabbits immediately, with no unlock progression. Five houses total per owner across rooms/garden; food bowls, roaming, following, petting and species abilities use the shared pet controller and replaceable sprites. Pet bots participate in Werewolves and Forest Blocks through normal game actions; one match per pet. See [amendment delivery](AMENDMENT.md) for implementation and verification boundaries.
- Decorative furniture has no Use action or interaction prompt. Ordinary clicks do not start an empty interaction; the same items remain selectable and movable in Decorate. Nearby useful furniture and guides retain their actions.
- Flashcard decks created from an apunte persist their source-note ID. The deck editor, deck list and review link back to that note; the note lists its linked decks. Links resolve only inside the same library scope and preserve note access permissions. Existing unlinked decks are not guessed from titles; deleting a source note leaves its deck available with a small unavailable-source label.
- Outdoor decoration uses the village canvas: choose, place, drag, undo, remove, cancel or finish. Items stay in the owner's bounded yard around the house and survive reload.
- The sprite vanity is available in the furniture catalogue. It supports drawing/erasing/undo, a wardrobe-derived starting point, static 64×64 or animated 192×256 PNG import/export, and an explicit Save. Existing animated sheets retain their frames on reopening.
- Display boards use a fixed16:9 drawing area, fit the preview inside the board surface, and support frame on/off in furniture options.
- The village HUD exposes camera immediately in a hosted session; the floating image follows the same interpolated position as the avatar.
- Library stations have distinct roles: Study table for notes/cards/quizzes, Focus clock for timed sessions, Resource library for documents/PDFs.
- Travel notices and location movement instructions are removed. Scrollbars, controls and focus styles follow the village materials; Werewolves uses a dark forest theme.

## Scene travel, floor decoration and the surrounding garden — 5 November 2026

- Floating camera capture continues during ordinary travel between village areas, houses, floors and rooms. Peer calls are re-established for the new scene; other rooms do not receive the feed. Explicit stop, session exit, media-endpoint loss and game privacy rules still stop capture.
- Private floor corridors use the same decoration workflow as rooms, with 14 furnishing kinds (including the now-functional mailbox), per-item appearance, undo and saved layouts. Every floor has its own workspace document; visitors can see the approved floor but only its owner can decorate it. Doorways and their walking approaches stay clear. Floor documents participate in local backup and durable server persistence.
- The garden catalogue supports dragging an item directly into the world, with a placement preview. Click/tap placement, moving existing objects, undo, cancel and Finish remain available. The yard extends around the house inside its own plot, excluding the house, doorway approach and main paths. Existing saved gardens retain their coordinates. The camera fits the yard above the catalogue so phone users can reach the full editing area.

## Furniture and access corrections — 5 November 2026

- Settings no longer contains avatar/asset customization. The wardrobe and sprite vanity remain the in-world character tools. Diagnostics has an explicit Back button and Escape returns to the previous view while preserving the session.
- Decorate exposes Change name for the selected item, with undo/redo and persistent aliases. Whiteboards and drawing displays rotate in actual quarter turns together with their artwork; their footprint and hit area follow the orientation.
- Indoor and outdoor mailboxes open the house owner's private inbox. Each person may keep five active notes in that inbox, up to 1,000 characters each. The author and recipient can see and remove their notes; the recipient sees all received notes. Multiple physical mailboxes in one house share the inbox. Persistent servers keep it in SQLite and accept delivery while the owner is offline. Temporary P2P villages require the recipient online; their inbox remains on their primary local device and is not yet replicated to companion devices.
- A pending access request blocks additional requests from that identity until accepted, declined or explicitly cancelled. The requester can cancel from the visible pending-request control; paired devices share the same pending state. Server/host authority also rejects duplicate protocol requests, rather than relying only on disabled buttons.

## iPad input corrections — 5 November 2026

- Room whiteboard → More and Notebook → Options → Ink and selection share Apple Pencil mode. When enabled, the pencil writes while fingers pan/zoom. The mode persists, synchronizes tabs and is backed up. Pen priority also protects writing when the mode is disabled; held palm contacts cannot finish or alter pen ink. Coalesced/final samples and light-pressure starts are accepted; legacy room boards retain subpixel coordinates.
- Long presses on game controls no longer select text or request Safari's callout. Editable text, document content and mailbox notes remain copyable. Rapid taps on controls suppress double-tap browser zoom; browser pinch remains available outside the game's own canvas gestures. HUD and dialogs recover after zooming and panning.
- End game appears only during an active round for its authorized organizer. Confirmation is cancelled if the phase or authority changes.
- These corrections pass synthetic Chromium/WebKit tests. The owner's iPadOS 17.7.10 and actual Apple Pencil need a physical retest.


## Direct editing and Forest Blocks

- The phone is organized directly: right click, or hold an icon for three seconds; drag to reorder/group, remove shortcuts with ×, rename open folders by their title, and add optional tools through the App library. Settings remains available; removing a shortcut preserves its data. Legacy layouts are normalized when loaded.
- Garden editing uses a separate high-density canvas, placement grid, invalid-zone outlines, zoom and pan. Opening, saving or canceling it preserves the player's actual location.
- Edit controls supports desktop and touch profiles, including clock placement, size and visibility. Identity stays in Settings; signaling/TURN configuration is under Servers → Advanced connection.
- Forest Blocks is available at the community arcade and as an optional phone shortcut. Solo play runs offline, with a separate optional power-practice mode and local records. Battles support up to 16 participants on a sufficiently sized persistent server, spanning neighborhoods; temporary villages retain their existing six-person capacity.
- The authority validates sequenced inputs, applies gravity, lock delay, line attacks, delayed stone rows and three energy powers. Stone rows require Moss; Shield cancels pending attacks; Roots sends two extra rows. Late joiners spectate until the next round. Leaving or a 15-second loss of contact eliminates a participant; changing temporary authority resets the round.
- Voice and video retain explicit, separate consent. Up to four remote cameras can be selected, with initials/name/board cards for everyone. Networked rounds do not pause when an application is backgrounded; solo rounds pause until resumed.

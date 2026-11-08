# Voice, screen sharing, and game cameras

Source entry points: [packages/runtime/src/media/manager.ts](../packages/runtime/src/media/manager.ts), [packages/runtime/src/media/game-camera.ts](../packages/runtime/src/media/game-camera.ts), [packages/core/src/media/voice.ts](../packages/core/src/media/voice.ts).

## Code ownership

`packages/runtime/src/media/manager.ts` manages microphone and screen calls. It accepts a `MediaDevicesAdapter`, allowing tests to provide synthetic streams. `game-camera.ts` handles the separate camera lifecycle. Voice command/view rules live in `packages/core/src/media/voice.ts`, re-exported by runtime. UI entry points include `voice-ui.ts`, `game-camera-ui.ts`, `head-cameras.ts` and the Werewolves panel.

The media context carries session ID, epoch, identity, room, room name and authorized peers. A peer includes endpoint plus send/receive tokens. Context is part of call acceptance: receiving a PeerJS call is not sufficient authorization to display its stream.

## Microphone flow

The user explicitly toggles the microphone. Capture uses the available browser device adapter; the resulting stream is reconciled against current room peers. Muting, deafening and push-to-talk have separate state. `setTalking` changes active push-to-talk behavior without creating a new identity or reconnecting the whole application. Keep user intent separate from stream availability so denial or device removal can be reported accurately.

`MediaManager` exposes `attach`, `setContext`, `toggleMicrophone`, `startScreen`, `stopScreen`, mute/deafen/push-to-talk controls, incoming-call handling and `dispose`. A context change reconciles active calls. `suspend` stops media and clears context. Disposal must stop tracks as well as close calls; otherwise a capture indicator can remain active after the UI disappears.

## Screen and camera consent

Screen sharing uses `getDisplayMedia` when supported and is explicitly started/stopped. A user-selected screen may contain private windows; the application must not automatically restart a previous capture after a session change.

Camera consent is separate from microphone consent. Werewolves changes which cameras should be active as game roles and phases change. Permission prompts can resolve late: if a user leaves a room while the OS prompt is open, a newly returned stream must not become active in the old context. The camera lifecycle tests cover this class of race.

The server provides signaling and permission context; this does not imply that it records media or acts as a media relay. The direct WebRTC architecture exposes connection metadata and does not claim concealment equivalent to a centralized forwarding unit.

## Multiple devices

Persistent-server contracts support a designated media device through `device.media` and report device state separately from identity. Several devices sharing an identity should not be treated as several independent people with unrestricted simultaneous media. Test device switching together with room changes and reconnect, rather than only toggling a local button.

## Failure cases and verification

Distinguish insecure-context unavailability, denied permission, missing input devices, capture stopped by the OS, lost signaling and failed ICE. Preserve manual stop and consent states when recovering. HTTPS is needed for reliable browser media access outside localhost; arbitrary LAN HTTP is not an equivalent test environment.

Unit coverage includes `media.test.ts`, `voice.test.ts` and `game-camera.test.ts`. Browser fixtures cover UI consent and lifecycle with synthetic devices. Physical microphones, cameras, Wayland portals, mobile background/resume and two real networks require separate checks. Run these checks with willing participants and record the actual device/OS and whether a relay candidate was selected.

## Social and media update (dev.8)

Friend requests are separate from voice invitations. The authority returns private incoming/outgoing requests and accepted identities; persistent servers store this state in SQLite metadata. Older servers continue using protocol 7 but do not expose the additive friendship capability. Screen capture accepts optional audio; missing audio is reported without blocking video. Viewer window positions/sizes never travel over the network. Hiding a camera changes only the viewer’s layout.

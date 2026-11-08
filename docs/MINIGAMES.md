# Activity engines and minigames

Source entry points: [packages/core/src/minigames/room.ts](../packages/core/src/minigames/room.ts), [packages/core/src/minigames/gartic-phone.ts](../packages/core/src/minigames/gartic-phone.ts), [packages/core/src/minigames/werewolves.ts](../packages/core/src/minigames/werewolves.ts), [packages/runtime/src/session/shared-room.ts](../packages/runtime/src/session/shared-room.ts).

## Shared lifecycle

Core engines live under `packages/core/src/minigames`; the generic activity contract is `room.ts`. `packages/runtime/src/session/shared-room.ts` owns subscriptions, message delivery, authority transitions and ticking. UI files draw each activity and send actions; they should not reproduce rule evaluation.

In a temporary session, the original host owns the engine. In persistent mode, `server/src/main.ts` registers Werewolves, Gartic, study quiz and group projects under server authority. A participant's role, current phase and room permissions determine whether an action is valid. Per-person views are essential for hidden information: sending a full secret state and hiding it with CSS is not equivalent.

Stopping an activity must release its running state and reconcile voice. Disposal releases timers and subscriptions. Reopening a panel should subscribe to the existing activity rather than create a second competing engine. Room/session scope prevents an action from one table being reused at another.

## Werewolves

Read [Werewolves rules and digital adaptations](WEREWOLVES.md) for the implemented characters, offices, victory conditions and deviations from the printed game. There are 32 hidden character types; Town Crier is a public office. The implemented event set is limited to five adapted events, not every printed event card.

The engine owns role assignment, phase transitions, elections, votes, action eligibility, deaths and victory. The UI supplies illustrated selection cards, quantity controls, settings and the camera table. Camera and voice behavior remain separate capabilities with their own consent and lifecycle; a role change can change permitted camera behavior without authorizing a microphone capture.

For rule changes, use deterministic seeded games and inspect views for several roles. Test declined abilities, succession, infection, linked roles and independent victories as well as a basic village/wolf outcome. UI card counts alone cannot prove a full game resolves correctly.

## Gartic

`gartic-phone.ts` owns the drawing/guessing game, and `gartic-ui.ts` presents it. Generated bot turns use `packages/runtime/src/ai/gartic-bots.ts`. The bot adapter obtains jobs and submits results through authorized room commands. A delayed provider result must still belong to the current job and game; it must not act as unrestricted engine access.

Drawing payloads are bounded and validated before use. A failed provider should produce an explicit unavailable/busy/cancelled path rather than fabricated content. Manual human play remains useful without AI. Test round progression, per-person visibility and late submissions independently from model quality.

## Study quiz and group projects

The quiz engine runs activity state derived from reusable quiz definitions. The projects board is registered through the same server activity abstraction even though it is not a hidden-role game. The common runtime wrapper supports organizer controls, stop behavior, views and scoped messages without forcing all activities to share identical rules.

When adding an activity, implement a pure domain engine, define bounded action/view contracts, register the authority-side factory, connect UI through SharedRoom and add lifecycle/permission tests. Avoid importing UI, Canvas or direct browser storage into core.

## Evidence

`minigames.test.ts`, `werewolves-pact.test.ts`, `activity-scope.test.ts` and server tests exercise rules and authorization. Browser journeys cover activity stop, Werewolves selection/play and multiple clients. The existing historical verification report records prior seeded scenarios; rerun the relevant suite after changing mechanics rather than treating old counts as current evidence.

## Controller input and help

`app/src/input/actions.ts` is the common source for semantic actions, keyboard/controller bindings, glyphs, stick dead zone and navigation repeat timing. `gamepad.ts` adapts these actions to the focused UI or the existing Forest Blocks action interface. The same definitions generate the contextual strip and Controls guide. There is no separate controller remapping editor; future remapping should update these resolved definitions rather than hard-code help text.

Forest Blocks supports movement, both rotations, hard drop, hold and its three power actions. Start/P opens its existing game menu (solo pause; multiplayer keeps normal room timing). View/F1 opens help. Werewolves and Quiz use focused buttons/seats, confirm and back. Left stick/D-pad navigates, shoulder buttons move focus, and right stick scrolls. Number/range/select fields retain their normal change handlers. Held confirm fires once; navigation repeats after a delay. Closing an activity releases world input ownership.

Gartic intentionally uses mixed input, as chosen by the owner: controller navigation, tools, submit, albums and replay; keyboard/mouse/touch for text and drawing. The guide states this requirement. Shared multiplayer rounds are not paused independently by a participant opening help.

Hints follow the last significant input, not just controller connection. Dead-zone noise is ignored; disconnect restores keyboard hints. Recognized PlayStation/Xbox IDs get family glyphs; unknown standard controllers get neutral positional symbols. Non-standard mappings show an unsupported-layout explanation. Automated browser tests inject Gamepad API samples; this does not certify physical USB/Bluetooth pairing.

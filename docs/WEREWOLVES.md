# Werewolves / Les Loups-Garous

StudyVillage implements the 32 hidden character types described in the publisher’s **Le Pacte** rulebook. The printed count of 33 also includes the **Garde Champêtre / Town Crier**, which is a public office appointed by the mayor, not an additional secret card. This is a digital adaptation with documented choices below, not a claim to reproduce every boxed event, variant or physical gesture.

Sources: [official French Le Pacte rules](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2023/07/WerewolvesThePact_FR_Rules.pdf), especially pp. 10–24, and the [publisher’s product contents](https://www.asmodee.fr/product/loups-garous-les-le-pacte/).

## Characters and offices

| Group | Implemented rules |
| --- | --- |
| Original characters | Wolf pack targeting, seer’s private card inspection, guard protection with consecutive-target exclusion, witch’s two single-use potions, ordinary villager, Cupid’s lovers and linked deaths, hunter’s final shot, little girl’s optional risky peek |
| New Moon characters | Elder survives first wolf attack and village powers disappear when the village kills him; village idiot survives a conviction but loses voting rights; scapegoat dies on a tied council and chooses the next council’s voters; piper charms players and has an individual victory; thief chooses between two spare cards |
| Village characters | Raven assigns two extra votes to a house; arsonist destroys one house, can save the wolf victim, and catches the nearest wolf to the right |
| Characters expansion | Public villager; two sisters and three brothers privately recognize their siblings; fox checks a living group of three and loses its power after a negative result; bear tamer announces nearby wolves; judge requests a second council; rusty knight infects a wolf to the left; actor uses a three-card repertoire once each; maid exchanges the condemned character before its reveal (declining preserves the power; Cupid’s spent power is not inherited); wild child follows a model and transforms on the model’s death; wolf-hound chooses a faction; angel wins by dying in the opening turn; cultist wins when the other group is gone; big bad wolf gets a second victim while the wolf family is intact; wolf father infects a victim while retaining its powers; white wolf kills another wolf on alternate nights and wins alone |
| Spirit medium | Five consultations, a choice among four digital questions, authority-verified public answers after there has been a death |
| Mayor | Optional election, double vote, tie-breaking preference, dying mayor chooses a living successor; an exposed idiot mayor abolishes the office |
| Town crier | Mayor appoints another player; that player may announce a remaining event from the next day onward |

The nine building types are farm, church, healer’s hut, school, bailiff’s house, manor, bakery, tavern and barber shop. Their powers include farmer-only mayor elections/succession, private confession, restoring a spent building power, denying up to two householders’ votes, offering vacant housing to a vagabond who may accept or decline, pardoning a condemned player, a brief camera opening after the wolves, conditional tavern immunity, and the barber’s risky elimination. Up to six farms and one of each other building are assigned in seating order; unassigned players are vagabonds. Farms elect their mayor from the second round. Raven and arsonist enable buildings; the medium enables events. Events enable a mayor so the office can actually be appointed.

## Explicit digital choices and remaining limits

- Tables support **4–24 seats**, including bots. Wolves/villagers have count controls; unique roles are singletons and siblings must be selected as two sisters or three brothers. This is not the physical box’s maximum player count.
- The original app’s wolf → seer → guard → witch order is preserved. New powers have explicit phases around that sequence. Deadlines and automated bots keep games moving.
- Little-girl gestures become a deliberate peek with a 1-in-3 exposure risk. The bakery’s physical glance becomes a three-second camera window. The actor’s initial repertoire is seer, guard and hunter. The cultist’s two groups use alternating seats, avoiding demographic attributes. Housing changes do not reorder digital seats.
- The rulebook describes a 36-card New Moon event deck but does not reproduce every event-card face. **The complete 36-card event deck is not implemented.** The UI calls the current selection “Selected events” and explicitly identifies five adapted effects: a peaceful council, persistent seer sleepwalking, one night of neighbour-limited pack targets, restoring the witch’s healing potion, and an additional council. These are a digital set, not a purported transcription of all official event cards.
- The spirit medium uses four explicit digital questions about the first dead player, the surviving seer, wolf count, and the medium’s neighbours. This replaces the physical five-card question selection and a player speaking on behalf of the first dead player. The answers come from the authority and are true at the time of the consultation.
- No secret card catalogue choices are inert placeholders. Character powers, deaths, transformations, votes and victories are implemented; the above choices define where this version differs from tabletop procedure.

## Cameras and authority

The lobby places the camera dock on the right and card selection on the left. During play, the camera mosaic spans the main stage, with role/actions below. Bots use a replaceable pixel-art camera tile. All capture is opt-in and video-only; joining voice remains a separate control.

The authority projects each viewer’s own receive/send permission. A sleeping player closes incoming video calls; a dead player’s outgoing calls and capture tracks stop. A three-second close-eyes cue accompanies the transition. Voice is not disabled by these game rules. A dead player may watch daytime video but cannot broadcast until the game has ended. Each live camera can be hidden and shown locally.

Persistent-server signaling checks the game’s camera permissions before forwarding offers. Runtime code also closes established calls when permissions change and rejects late camera permission results after death. It uses a public phase token to retry connections; private views do **not** contain a list of awake player identities. The audience marker is `null`, meaning the runtime’s already authenticated, same-scene game viewers; a spectator can therefore watch the lobby without taking a seat.

Media still uses direct WebRTC. A modified client can inspect connection timing/metadata; it is not equivalent to an SFU concealing all night-turn traffic. The server can reject offers but cannot revoke already delivered pixels from an adversarial endpoint. Physical iPhone/iPad camera permissions, device interruptions, background suspension and real network relay behaviour still need hardware testing. Camera grids and permission lifecycle tests use synthetic browser video, not a physical camera.

## Replacement art and translations

All 32 role illustrations and bot art are independent **48 × 48 PNG** entries named `role-*` in `app/public/sprites/manifest.json`. Replace the corresponding PNG at that size; no game logic edit is required. `scripts/generate-werewolves-art.py` reproduces the original new icons and can be left unused when supplying custom art. It requires Pillow only when regenerating art, not when building or running the app. The ES/EN/FR source-message additions are reviewable in `scripts/werewolves-messages.json` and merged into the normal language catalogues.

## Verification

- `app/tests/werewolves-pact.test.ts`: 58 scenarios, including one validated complete bot game per hidden character, private results, infection retaining powers, fox exhaustion, elder/idiot/scapegoat, maid exchange, angel expiry, mayor succession, judge, buildings, actor, wild child, knight, big wolf and arsonist.
- `server/tests/server.test.ts`: four real WebSocket identities verify administrator-only start, turn-specific camera offer authorization, dead-player video rejection, private card views, and continued voice authorization.
- `app/tests/game-camera.test.ts`: video-only capture, audience/token validation, stream closure, death while a permission prompt is unresolved, and sleeping/dead policy transitions.
- `app/tests/e2e/werewolves-pact.spec.ts`: desktop/phone catalogue, active mosaic, independent settings, and real browser camera-track lifecycle driven by authoritative engine views. Uses synthetic media.
- Current reviewed screenshots: [lobby](verification/werewolves-lobby.png), [active game](verification/werewolves-active.png). Synthetic green video is Chromium’s test-camera feed, not a user recording.
- The existing live two-client scenario now requires the village host to configure/start; the guest’s start button is disabled. The administrator can manage the table without taking a seat.

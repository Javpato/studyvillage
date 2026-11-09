# World, houses, furniture, and artwork

Source entry points: [app/src/world/model.ts](../app/src/world/model.ts), [packages/core/src/world/garden.ts](../packages/core/src/world/garden.ts), [app/src/assets/sprite-catalog.ts](../app/src/assets/sprite-catalog.ts), [app/src/house/decoration.ts](../app/src/house/decoration.ts).

## Rendering and interaction ownership

The world uses Canvas2D. `app/src/world/model.ts` defines the visual world model; `draw.ts`, `environment.ts` and `lights.ts` render scene and effects; `location.ts`, `areas.ts` and `interactions.ts` resolve location and interaction behavior. House presentation lives under `app/src/house`, with separate model, decoration, drawing, rotation, facing, room-space drawing and wardrobe code.

The interaction registry connects furniture to actions. A visible sprite, collision footprint and reachable action are related but distinct: changing artwork must not silently alter whether a doorway can be reached. Tests cover movement, reach, furniture details, rotation, doors and small-screen entry points.

## Startup and authored assets

`app/src/main.ts` loads the sprite catalogue before importing bootstrap. Graphics failure and local-storage failure produce distinct preserved-data messages. Do not replace a missing sprite with a database reset. `app/src/assets/sprite-catalog.ts` and the manifest define authored PNG requirements; [the sprite catalogue](SPRITES.md) records dimensions and replacement rules.

Wardrobe appearance is composed into an existing twelve-frame 192×256 character sheet. A static 64×64 vanity image can be repeated into that sheet. Drafting, previewing, saving and discarding are separate steps, and network transfer is bounded. Asset changes must preserve the expected dimensions and transfer format. Imported artwork does not change ownership or license of upstream assets.

## Houses and public data

`packages/core/src/house/furniture.ts` defines the shared furniture kinds used by placement, local persistence, public/room schemas and asset-pack validation. Add new indoor kinds there so catalogue entries cannot be rejected by a stale save validator. Outdoor eligibility remains defined by the garden model.

Bootstrap supplies useful furniture for a new house, including a focus clock, jukebox, guide and notebook desk. Existing houses are not rebuilt from the default layout on every launch. `publicHouse` projects explicitly allowed fields into the published representation rather than serializing the complete local profile.

House floors, rooms, door positions, garden placement and room workspaces have persistence and protocol consequences. Use validated model operations and update rendering, interaction and save/load tests together. Furniture deletion must not delete the independent personal notebook repository.

## Exterior geometry and editing


The exterior catalogue supports dragging an item onto the garden with mouse or touch, as well as selecting an item and tapping its destination. A preview marks valid and invalid positions. Existing items can be dragged, removed and undone. Pointer cancellation restores the draft; **Cancelar** discards the session and **Terminar** saves it. The garden still holds at most 16 items and uses the existing replaceable 32×32 artwork.

The garden now includes the sides and the available area behind the house. Each of the six plots has bounds clear of its neighbors, the horizontal road and the vertical street. New placements and movements check the complete sprite footprint against these bounds, the house's visible eaves/chimney/foundation and a 40px-wide path from the door. The editor fits the whole plot above its catalogue, including on small portrait screens.

Coordinates retain the original front-garden origin. Old items without a `plot` field load and render at their original pixels; they are never silently discarded because an older version allowed a position that is now protected. New or moved items record their source plot. If the owner changes plot, `resolveGardenItem` maps the sprite center into the destination garden, mirrors its vertical position between north/south rows, and finds the nearest valid 4px grid position when necessary. Rendering does not mutate stored data; opening the editor materializes the same arrangement, which is saved only on **Terminar**.

Geometry lives in `packages/core/src/world/garden.ts`; its shared parcel coordinates are also used by village rendering. The protocol continues to accept the previous item format and validates the optional plot index, finite coordinate limits, unique IDs and the sixteen-item limit.

Coverage includes all 36 source/destination plot combinations, boundary positions, old saves, local/public/network/backup serialization, live preview and blocked drops, persistence, undo/cancel, small-screen layout and native Chromium continuous touch input. WebKit automation covers pointer dragging and touch taps; it does not certify physical iPhone/iPad touch hardware.

## Maintenance and evidence

Use world, house, interaction-reach, garden-layout, garden-relocation, furniture-rotation and sprite-manifest unit tests. Browser coverage includes actual drag/tap decoration, cancellation, reload and portrait layout. For a new object, check the complete sprite footprint, doorway clearance, picking region, rendered orientation and exported public representation.

Retain [asset provenance](../ASSETS_LICENSES.md), source PNGs and reference material. Generated bundles contain copies of these assets by design; remove obsolete bundles rather than deleting a source PNG just because multiple distributions contain it.

## Pet expressions and character reset

Use the nearby pet interaction and its special ability to make a rabbit hop. Normal walking stays on the ground. A hamster's **Enter the ball** command is a saved toggle: **Remove the ball** is the only normal way to take it out, including after following, room changes or minigames.

A parrot with a saved phrase speaks when a player enters its nearby range in the active shared scene. Its compact bubble follows it for up to eight seconds, respects dialogue font settings and leaves an intentional guide conversation alone. Manual **Repeat phrase** remains available; automatic arrivals are rate-limited.

The sprite atelier's **Restore default character** restores the initial game appearance in a preview. Undo or closing discards it; **Save character** applies it. Name, house and identity color stay unchanged. This control belongs to the drawing atelier, not the wardrobe.

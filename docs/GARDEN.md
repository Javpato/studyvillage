# Exterior decoration

The exterior catalogue supports dragging an item onto the garden with mouse or touch, as well as selecting an item and tapping its destination. A preview marks valid and invalid positions. Existing items can be dragged, removed and undone. Pointer cancellation restores the draft; **Cancelar** discards the session and **Terminar** saves it. The garden still holds at most 16 items and uses the existing replaceable 32×32 artwork.

The garden now includes the sides and the available area behind the house. Each of the six plots has bounds clear of its neighbors, the horizontal road and the vertical street. New placements and movements check the complete sprite footprint against these bounds, the house's visible eaves/chimney/foundation and a 40px-wide path from the door. The editor fits the whole plot above its catalogue, including on small portrait screens.

Coordinates retain the original front-garden origin. Old items without a `plot` field load and render at their original pixels; they are never silently discarded because an older version allowed a position that is now protected. New or moved items record their source plot. If the owner changes plot, `resolveGardenItem` maps the sprite center into the destination garden, mirrors its vertical position between north/south rows, and finds the nearest valid 4px grid position when necessary. Rendering does not mutate stored data; opening the editor materializes the same arrangement, which is saved only on **Terminar**.

Geometry lives in `packages/core/src/world/garden.ts`; its shared parcel coordinates are also used by village rendering. The protocol continues to accept the previous item format and validates the optional plot index, finite coordinate limits, unique IDs and the sixteen-item limit.

Coverage includes all 36 source/destination plot combinations, boundary positions, old saves, local/public/network/backup serialization, live preview and blocked drops, persistence, undo/cancel, small-screen layout and native Chromium continuous touch input. WebKit automation covers pointer dragging and touch taps; it does not certify physical iPhone/iPad touch hardware.

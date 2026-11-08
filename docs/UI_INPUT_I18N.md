# UI composition, input, accessibility, and languages

Source entry points: [app/src/main.ts](../app/src/main.ts), [app/src/bootstrap.ts](../app/src/bootstrap.ts), [app/src/input/pencil-mode.ts](../app/src/input/pencil-mode.ts), [app/src/i18n.ts](../app/src/i18n.ts).

## Application composition

`app/src/main.ts` installs browser gesture handling, chooses diagnostic mode or normal startup, loads graphics, and registers the production service worker. `bootstrap.ts` opens/recover stores, prepares identity, composes the appropriate village client, connects actions and updates UI. `ui/app.ts` owns the imperative presentation shell and tool entry points. Feature panels keep their own lifecycle and styles.

Keep app-lifetime subscriptions distinct from connection-lifetime subscriptions. Changing a server should not erase a private notebook or duplicate a global keyboard listener. Returning a disposer is part of a feature's integration contract, not an optional convenience.

## Pointer and drawing behavior

Input modules under `app/src/input` separate viewport handling, gesture recognition, drawing surface behavior, Pencil preference and HUD layout. Notebook geometry is stored in document coordinates while zoom, rotation and scroll are view state. Reading screen coordinates as stored ink coordinates would corrupt content when the viewport changes.

Pen mode is a persistent device preference shared by notebook and room board. Fingers can navigate and select, while touch-created writing and erasure are restricted; pen and mouse editing remain available. Pen priority, fresh-contact rules, cancellation rollback and coalesced samples are described in [ink](INK.md). Browser long-press suppression is scoped to drawing surfaces; copyable notes and ordinary form controls should retain appropriate browser behavior.

Physical stylus behavior cannot be certified by synthetic pointer tests. Test state transitions, capture failure and saved geometry automatically, then validate pressure, palm rejection and device-specific navigation on hardware.

## Translation model

English, Spanish and French are bundled in `app/src/i18n`. `i18n.ts` and the catalogue provide runtime translation and live updates. Transport and domain errors carry stable keys; the client renders messages in its chosen language. Changing language should not restart transport or change permission decisions.

Run `npm run i18n:check` after changing labels or placeholders. Add corresponding entries in all three catalogues, check interpolation arguments, and inspect layout with long French labels. Static coverage proves key consistency, not fluency. Keep user-authored text and names separate from translated interface strings.

## Accessibility and keyboard behavior

Movement shortcuts should not intercept text editing in inputs. Escape should dismiss the nearest active drawer before closing the whole notebook. Controls need clear labels and visible focus; do not make icon artwork the only explanation of an action. Respect reduced motion and verify portrait layouts, touch targets, scrollability and zoom. These are implementation goals and test cases, not a claim of completed WCAG certification.

## Visual conventions


The November 2026 correction pass keeps the village, replaceable pixel art and furniture metaphor, while giving each tool a calmer, clearer surface.

- Warm paper, moss green, timber borders and restrained hard shadows connect everyday tools with the village. Werewolves uses its own dark forest palette throughout, including voice and session controls.
- Frequent actions stay visible. Notebook organization, export, collaboration and detailed settings live in named drawers. The drawing surface remains the main workspace.
- Controls have descriptive labels, visible focus, comfortable spacing and touch targets. The same action behaves consistently across phone and furniture entry points.
- Use restrained motion to explain state: selecting a Werewolves card flips it and reveals its selected quantity. Respect reduced motion.
- Edit the thing where it lives: outdoor furniture is placed and dragged on the actual village; NPC dialogue appears above its speaker; the focus clock can remain in a movable HUD.
- The vanity edits a reversible draft. Static 64×64 PNGs are repeated into the existing 192×256 network sheet when applied, preserving compatibility with avatar rendering and transfers. Export keeps the chosen static or animated format.
- The display board has a fixed 768×432 drawing area. Its preview fits inside the furniture's board surface without stretching; its frame can be hidden independently.

The shared palette is implemented in `app/src/ui/village-polish.css`. Notebook, Werewolves, focus/jukebox and vanity have local styles, so they can evolve without changing unrelated tools.

## References consulted

- [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/): prioritize common tasks and reveal secondary controls on demand.
- [Harvard Digital Accessibility: Clear and Concise UI](https://accessibility.huit.harvard.edu/ui-elements): recognizable controls, consistent visual language and adequate size/spacing.
- [Xbox Accessibility Guideline 112](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112): consistent game UI navigation and clear interaction behavior.
- [Nintendo: Create your getaway](https://animalcrossing.nintendo.com/new-horizons/create/): decoration remains part of the place, both indoors and outdoors. Reference for interaction and atmosphere; no Nintendo artwork is included.

These principles guide implementation; the screenshots in `docs/verification` document the actual running screens rather than design mockups.

## Evidence and changes

Use browser-viewport, gestures, pencil-input, HUD layout, mobile-controls, UI and i18n tests, plus targeted keyboard, notebook and mobile browser journeys. When changing global CSS, inspect more than the panel that motivated the change. When changing an input handler, test cancellation, focus loss and navigation as well as the successful pointer-up path.

## Controller and responsive surfaces (dev.8)

Settings → Controller guides OS pairing and tests standard Gamepad API devices. One app-lifetime controller routes menu focus, village movement and Forest Blocks actions; it releases held inputs on disconnect, blur and context changes. Text entry and drawing remain keyboard/pointer/touch operations. VisualViewport dimensions constrain phone dialogs and invitation fields above an onscreen keyboard. Garden layout measures a stable outer viewport rather than oscillating with scrollbar changes.

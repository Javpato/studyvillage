# StudyVillage interface direction

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

# Replacing artwork

`app/public/sprites/manifest.json` is the owner-editable catalogue. Replace a named PNG with the **exact width and height recorded in its entry**, retaining transparency. Rebuild the application. No TypeScript changes are required, and ordinary builds never regenerate your art. The loader rejects unknown/unsafe filenames and mismatched dimensions.

The catalogue covers furniture, guides, trees, world/community/study floors, house exteriors/interiors, activity stations, phone icons, role cards and the bot. Dynamic labels are drawn separately so translated names remain readable. Weather, highlighting and some geometric UI effects remain drawn shapes rather than image assets.

| Art | Layout |
|---|---|
| New furniture and guide | 64×64; see manifest for existing-item footprints |
| Role cards | 48×48 or 64×64 according to that entry; never assume one size |
| Ground/interior | 768×432 |
| Exterior house atlas | 640×160: four 160×160 frames |
| Character sheet | 192×256: three columns of 64×64, four rows |

Character rows are down, left, right, up; columns are standing, step A, step B. Keep feet near (32,52) within each cell. `avatar-template.png` is a downloadable editing template, not an override of everyone's wardrobe.

The wardrobe creates a sheet from body, hair, clothes, accessories and colors. **Import sprite 192 × 256** previews a local PNG; **Save look** commits it, while **Discard** leaves the previous sheet intact. PNG imports are limited to 512 KiB. Selecting ordinary wardrobe parts returns to the generated appearance. Export produces the chosen sheet. Only the player character has a user-provided whole-sheet route; other sprites are owner-controlled assets.

When a custom character is visible in a village, authenticated peers request its sheet from that player. Bounded chunks, exact image dimensions and SHA-256 validation protect transfer integrity. Sheets are cached in memory for the current session; no arbitrary remote asset URLs or executable packs are accepted. A changed owner sheet is announced to peers, and unavailable art falls back to the generated appearance.

Source-art tools: `scripts/export-base-sprites.mjs`, `scripts/export-world-sprites.mjs` and the role-art generator create PNGs from original drawing primitives. They are intentional regeneration tools and can overwrite replacements. Do not run them as part of normal packaging. Existing artwork remains subject to the original owner's rights; this rebuild does not relicense it.

### Vanity and camera artwork

`vanity.png` is an original 64×64 furniture sprite; its reproducible pixel source is `scripts/create-vanity-sprite.py`. `icon-camera.png` is a 24×24 replaceable HUD icon. Both are registered in `app/public/sprites/manifest.json`. See the manifest for the current catalogue.

The in-game vanity accepts a static 64×64 PNG or a 192×256 sheet with three animation columns and four direction rows. Static output is repeated into twelve cells only when applied to the avatar/network. Static export remains64×64.

### Companion pets

The five original sheets and six furniture PNGs are generated intentionally by `scripts/create-pet-sprites.py` (Pillow). Normal builds never run that generator. Pet entries in `app/public/sprites/manifest.json` specify `file`, sheet dimensions, `frameWidth`, `frameHeight`, `animations`, `directions`, `fps`, `scale`, `anchor`, `collisionRadius`, and optional `jumpHeight`. The runtime reads that same manifest; it does not bundle a second copy of these settings. `collisionRadius` is measured in logical world pixels.

The default sheets have seven 32×32 columns and four directional rows. Gameplay asks for semantic `idle`, `walk`, `eat`, `pet`, `rest`, `ability`, `jump`, `ballIdle`, and `ballWalk` animations. Missing jump/ball mappings fall back to `ability`, then `idle`; other optional mappings fall back to `idle`; keep `idle` and all four direction mappings present. Frame lists, speed, anchor, scale and footprint can change without editing behavior. House entries `pet-cat`, `pet-dog`, `pet-parrot`, `pet-hamster`, `pet-rabbit` and `pet-bowl` use the normal replaceable furniture catalogue. Hearts and the short-lived fetch toy are simple canvas feedback.

Builds fingerprint the manifest and PNG bytes (`scripts/sprite-revision.mjs`) and use that revision in every catalogue/image URL. A previously installed worker cannot substitute an unversioned catalogue from an older release. The PWA installs one coherent index/resources cache and serves its own cached navigation until the browser safely activates the next worker.

The loader validates each pet entry, sheet geometry, direction/frame ranges, scale and footprint. Missing files, bad dimensions or invalid metadata produce a warning identifying the asset and a visible procedural species/house/bowl fallback from `app/src/assets/pet-assets.ts`. This fallback is a recovery path; normal artwork remains entirely in the manifest. World rendering sorts pets with furniture and avatars by their ground baseline. Regression journeys assert actual stage-canvas rendering, not just menu portraits.

Pet expression update: side views are three-quarter views with two eyes; back views remain eyeless. `python3 scripts/create-pet-sprites.py --sheets-only` deliberately regenerates only pet sheets and their manifest entries, preserving furniture artwork. Rabbit `jump` frames omit a baked shadow; `jumpHeight` (logical pixels, default 32) lifts the sprite over its ground shadow, with reduced-motion support. `ballIdle` / `ballWalk` select hamster ball art independently of its behavior. Optional `jump` and ball mappings fall back to `ability`, then `idle`; recovery art includes the hamster ring. Normal builds never regenerate artwork.

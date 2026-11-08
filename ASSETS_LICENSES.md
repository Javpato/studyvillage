# Asset provenance — license decision pending

The bundled sprites and illustrations are drawn specifically for StudyVillage using Canvas primitives or the repository's `assets/app-icon.svg`. No assets were copied from the games mentioned as visual references. The PNG/ICO app icons are deterministic rasterizations of that SVG generated with the Tauri icon CLI.

## Excalifont and Pencil input reference

The seven unmodified Excalifont Regular WOFF2 subsets in `app/src/assets/fonts/excalifont/` come from [Excalidraw's font source at commit 701b901a0f1ba3d0b390d9cdf63d112e25abac4b](https://github.com/excalidraw/excalidraw/tree/701b901a0f1ba3d0b390d9cdf63d112e25abac4b/packages/excalidraw/fonts/Excalifont). Copyright (c) 2024 Excalidraw. Designers: Your Own Font Foundry (Virgil); Ján Filípek / DizajnDesign (Excalifont modifications). The font is distributed under the SIL Open Font License 1.1, reproduced beside the source files and in `app/public/licenses/Excalifont-OFL.txt` for every web/native bundle. It remains under that license independently of StudyVillage's project license. All subsets are local, including accented Latin, Greek, Cyrillic and combining marks; no third-party font service is contacted.

The Pencil interaction work references the same commit's `packages/excalidraw/components/App.tsx`: first-pen detection, `onTouchStart`'s iOS Scribble workaround, clearing native selection, two-pointer navigation, disabling pinch scale in freehand pen mode, and recovery from missing pointer-up. Excalidraw's MIT notice is retained in `app/public/licenses/Excalidraw-MIT.txt`. StudyVillage adapts these behaviors to its existing editors and storage; it does not embed Excalidraw or call a remote drawing API.

No final project or asset license is selected. The repository is published publicly at the owner's request; public visibility does not grant an open-source license. `package.json` remains private/UNLICENSED to prevent accidental publication to npm. Software and asset licensing remain separate decisions for the owner.

The intended official catalog policy is free downloads with explicit provenance and compatible licensing. Community packs, a catalog and executable plugins are not implemented in this slice.

## Companion pets

Cat, dog, parrot, hamster and rabbit sheets, their houses, and the food bowl are original StudyVillage pixel drawings made with Pillow primitives in `scripts/create-pet-sprites.py`. No third-party artwork or image service was used. The same pending project/asset license decision applies.

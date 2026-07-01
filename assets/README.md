# Redemption's Edge Assets

This folder is served directly by GitHub Pages from the project root. Use relative
runtime paths that start with `./assets/` or `assets/`.

## Naming

- Use lowercase snake_case file names.
- Keep character assets under `assets/characters/<character-name>/`.
- Keep sprite metadata in a manifest next to the image files.
- Use transparent PNG or WebP files for sprite sheets.

## Character Sprite Defaults

- Frame size: 128 x 128 pixels.
- Background: transparent.
- Anchor: character feet, defined in each manifest.
- Direction rows use this order:
  `south`, `southwest`, `west`, `northwest`, `north`, `northeast`, `east`, `southeast`.
- Sprite art is visual only. Gameplay collision stays defined in code.

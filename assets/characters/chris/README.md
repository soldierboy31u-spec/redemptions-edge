# Chris Sprite Assets

Expected first-pass files:

- `chris_idle.png`
- `chris_walk.png`
- `chris_aim.png`
- `chris_shoot.png`
- `chris_dash.png`
- `chris_hurt.png`
- `chris_mounted.png`
- `chris_manifest.json`

Sprite sheets should use transparent 128 x 128 frames. Each direction occupies one
row, using the shared direction order documented in `assets/README.md`. Keep
Chris's feet aligned to the same baseline in every frame so the renderer can keep
his world position stable.

Temporary art may omit optional sheets. The game must fall back to the existing
programmer-art renderer if required sprite assets are missing.

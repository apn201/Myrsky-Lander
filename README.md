# Myrsky Lander (working title)

An arcade lunar lander set at the real Apollo 12 site in the Ocean of Storms. The controls are as simple as the 1979 arcade games, but the ground, light, shadows, lander and physics are real.

Built on [Myrsky](https://github.com/apn201/Myrsky) ("Webcam: Ocean of Storms", NASA Space Apps 2026). The two repos are separate so the judged Myrsky site stays untouched. The code and assets here were copied from Myrsky's tag `spaceapps-2026-judging`.

## What came from Myrsky

| Here | What it is |
|---|---|
| `web/js/myrsky/terrain.js` | LROC height model terrain, ground texture, ray-marched terrain shadows |
| `web/js/myrsky/sky.js` | Sun, Earth and stars for any date (Astronomy Engine, IAU Moon rotation) |
| `web/js/myrsky/post.js` | exposure and camera-look post-process |
| `web/js/myrsky/data.js`, `models.js` | hardware positions and models (Surveyor 3, ALSEP, flag) |
| `web/assets/` | terrain height maps, orthophoto ground, star tiles, Earth, lander shadow mesh |
| `web/vendor/` | three.js and Astronomy Engine (no build step, no CDN) |
| `tools/` | data preparation scripts |
| `data/models/` | NASA 3D Resources lunar module (small glb) |

These files are a starting point. Change them freely: nothing here flows back to Myrsky.

## Rebuilding assets

The large NASA source files (653 MB) are not copied. The scripts in `tools/` read them from the sibling `../Myrsky` checkout, or from wherever `MYRSKY_SRC` points:

```bash
python tools/prepare.py
```

`source/3d/` holds the big lunar module models (not in git). Their origins are listed in `data/SOURCES.md`.

## Use of AI

Code written with an AI coding assistant, Claude Code (Anthropic), like Myrsky.

## Licence

Code: MIT (see `LICENSE`). NASA data and images follow NASA's media usage guidelines.

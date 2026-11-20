# Myrsky Lander (working title)

An arcade lunar lander set at the real Apollo 12 site in the Ocean of Storms. The controls are as simple as the 1979 arcade games, but the ground, light, shadows, lander and physics are real.

Built on [Myrsky](https://github.com/apn201/Myrsky) ("Webcam: Ocean of Storms", NASA Space Apps 2026). The two repos are separate so the judged Myrsky site stays untouched. The code and assets here were copied from Myrsky's tag `spaceapps-2026-judging`.

## Play

Serve `web/` from any static web server (it uses ES modules, so `file://` does not work), for example `python -m http.server -d web`, and open the page.

| Key | Does |
|---|---|
| ← → | lean the lander (RCS jets; let go and the attitude holds) |
| ↑ ↓ | P66: rate of descent, 1 ft/s per click. MANUAL: throttle |
| M | P66 auto-throttle or manual throttle |
| Space | descent engine stop (ascent engine on/off after staging) |
| Enter | abort stage in flight, liftoff after landing |
| A | acknowledge the master alarm |
| 1–4 | isolate RCS quad A–D |
| Z, C, G | zoom, window camera, picture look (TV, film, clean) |
| V, P, R, N | sound, pause, restart, scenario menu |

On a touch screen, put a finger anywhere and slide: sideways leans, up and down clicks the rate of descent. The on-screen buttons do the rest.

Scenarios: the Apollo 12 landing, the Apollo 11 program alarms, a stuck RCS jet, a lost landing radar, a stuck throttle and a descent engine failure. Keep the guidance dot in the crosshair, land softly on clear ground, and lift off again.

Physics tests: `node tools/test_physics.mjs`.

## Sound credits

- Real Apollo 11 landing audio: NASA (public domain), see `web/assets/audio/README.md`.
- Radio chatter: synthesized offline with [Piper](https://github.com/rhasspy/piper) by `tools/make_radio_chatter.py`. Crew voice `en_US-joe-medium`; Houston voice `en_US-arctic-medium`, speaker rms, from the CMU ARCTIC speech database (Carnegie Mellon University).

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

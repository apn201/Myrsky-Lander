# Lander photo for masking

- `lm_raw_fullres.png`: Intrepid from the Apollo 12 crew panorama (NASA, Al Bean's pan near the TV camera, 19 Nov 1969), untouched, at the panorama's full resolution (825 x 680 px). Al Bean is still in it.
- `current_mask_REFERENCE.png`: the automatic mask the game uses now (white = lander).

To replace the cut-out: make the background transparent in `lm_raw_fullres.png`, keep the size and framing, save it as `lm_masked.png` here, then run

```
python tools/make_lm_from_mask.py
```

It writes `web/assets/lm_photo_full.png` and `lm_photo_descent.png`. The descent-only version cuts at row 332 (the descent stage top deck).

Tips: leave the bent contact probe out (the game draws the probes itself), keep the footpads, and paint out Al Bean.

## Current cut-out (20 Nov 2026)

`lm_cutout_source.webp` (1448 x 1086, transparent background, supplied by the author) is the lander the game
uses now. Build the textures with

```
python tools/make_lm_from_cutout.py
```

It writes `web/assets/lm_photo_full.png`, `lm_photo_descent.png` and `lm_photo.json`. The scale comes from
the side footpads (9.45 m apart); the descent stage top deck (row 500) and stage bottom (row 830) are set
in the script. The game shades the evenly lit photo for the low eastern Sun.

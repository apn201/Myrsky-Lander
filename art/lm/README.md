# Lander photo for masking

- `lm_raw_fullres.png`: Intrepid from the Apollo 12 crew panorama (NASA, Al Bean's pan near the TV camera, 19 Nov 1969), untouched, at the panorama's full resolution (825 x 680 px). Al Bean is still in it.
- `current_mask_REFERENCE.png`: the automatic mask the game uses now (white = lander).

To replace the cut-out: make the background transparent in `lm_raw_fullres.png`, keep the size and framing, save it as `lm_masked.png` here, then run

```
python tools/make_lm_from_mask.py
```

It writes `web/assets/lm_photo_full.png` and `lm_photo_descent.png`. The descent-only version cuts at row 332 (the descent stage top deck).

Tips: leave the bent contact probe out (the game draws the probes itself), keep the footpads, and paint out Al Bean.

"""Build the lander photo textures from a hand-made mask.

Input:  art/lm/lm_masked.png  - art/lm/lm_raw_fullres.png with the background made transparent
                                 (825 x 680 px, same framing; paint out Al Bean if you like)
Output: web/assets/lm_photo_full.png     (whole lander)
        web/assets/lm_photo_descent.png  (descent stage only: everything above the top deck removed)

Keep the framing: the game places the photo by pixel position (lander axis at 54.5 % across,
footpad soles 630 px from the top, 0.010687 m per pixel). Run: python tools/make_lm_from_mask.py
Written with an AI assistant (Claude Code, Anthropic), Nov 2026.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = Image.open(os.path.join(ROOT, "art/lm/lm_masked.png")).convert("RGBA")
assert src.size == (825, 680), f"expected 825 x 680 px, got {src.size}"
out = os.path.join(ROOT, "web/assets")
src.save(os.path.join(out, "lm_photo_full.png"))

DECK = 332                     # top deck of the descent stage, rows from the top of the crop
al = np.asarray(src.getchannel("A")).copy()
al[:DECK, :] = 0
al[DECK:DECK + 6, :] = (al[DECK:DECK + 6, :] * np.linspace(0, 1, 6)[:, None]).astype(np.uint8)
desc = src.copy()
desc.putalpha(Image.fromarray(al))
desc.save(os.path.join(out, "lm_photo_descent.png"))
print("wrote lm_photo_full.png and lm_photo_descent.png at", src.size)

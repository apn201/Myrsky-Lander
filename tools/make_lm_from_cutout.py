"""Build the lander photo textures from a ready cut-out (transparent background).

Input:  art/lm/lm_cutout_source.webp (or the path given as argument)
Output: web/assets/lm_photo_full.png, lm_photo_descent.png and lm_photo.json (scale and anchor points)

The scale comes from the two side footpads, which are 9.45 m apart on the real LM. The footpad soles,
the lander axis, the bottom of the descent stage and the descent stage top deck are found from the
alpha channel (deck row is set by hand below if the automatic guess is off).
Run: python tools/make_lm_from_cutout.py [path]
Written with an AI assistant (Claude Code, Anthropic), Nov 2026.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "art/lm/lm_cutout_source.webp")
im = Image.open(src).convert("RGBA")
W, H = im.size
a = np.asarray(im)[..., 3] > 128

def pad(x0, x1):
    """lowest opaque row in a column band, and the centre of the footpad rim just above it"""
    sub = a[:, x0:x1]
    ys = np.nonzero(sub.any(axis=1))[0]
    yb = ys.max()
    xs = np.nonzero(sub[yb - 15])[0] + x0
    return yb, (xs.min() + xs.max()) / 2

yl, xl = pad(0, int(W * 0.25))
yr, xr = pad(int(W * 0.75), W)
mpp = 9.45 / (xr - xl)                  # metres per pixel from the side footpads
axis = (xl + xr) / 2
sole = (yl + yr) / 2                    # footpad soles of the side legs
DECK = 500                              # descent stage top deck row (checked by eye for this photo)
STAGE_BOTTOM = 830                      # bottom of the descent stage body (checked by eye)

out = os.path.join(ROOT, "web/assets")
im.save(os.path.join(out, "lm_photo_full.png"))
al = np.asarray(im.getchannel("A")).copy()
al[:DECK, :] = 0
al[DECK:DECK + 8, :] = (al[DECK:DECK + 8, :] * np.linspace(0, 1, 8)[:, None]).astype(np.uint8)
desc = im.copy(); desc.putalpha(Image.fromarray(al))
desc.save(os.path.join(out, "lm_photo_descent.png"))

meta = {
    "source": os.path.basename(src), "width": W, "height": H, "m_per_px": round(mpp, 6),
    "axis_u": round(axis / W, 4),                       # lander axis, fraction of width
    "sole_m": round((H - sole) * mpp, 3),               # footpad soles above the image bottom, m
    "stage_m": round((sole - STAGE_BOTTOM) * mpp, 3),   # descent stage bottom above the soles, m
    "side_pads_px": [round(xl, 1), round(xr, 1)], "sole_px": round(sole, 1), "deck_px": DECK,
}
json.dump(meta, open(os.path.join(out, "lm_photo.json"), "w"), indent=1)
print(meta)

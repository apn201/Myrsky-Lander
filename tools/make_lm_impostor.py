"""Cut the lunar module Intrepid out of the crew's own panorama (NASA, Apollo 12, assembled from
Al Bean's 74-ft-focus pan near the TV camera, 19 Nov 1969 ~14:55 UTC) for use as a camera-facing photo
in the scene. CAM 1 looks at the lander from almost the same direction.

Outputs web/assets/lm_photo_full.png (with ascent stage) and lm_photo_descent.png (after liftoff).
Al Bean is painted out (the page shows no astronauts). Run: python tools/make_lm_impostor.py
Written with an AI assistant (Claude Code, Anthropic), Nov 2026.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MYRSKY = os.environ.get("MYRSKY_SRC", os.path.join(os.path.dirname(ROOT), "Myrsky"))  # sibling checkout with the big NASA files
SRC = os.path.join(MYRSKY, "data/photos/cam1_framing/a12pan1183310HR.jpg")
pan = Image.open(SRC).convert("RGB")
X0 = int(pan.size[0] * 0.62)
crop = pan.crop((X0, 0, X0 + int(pan.size[0] * 0.14), pan.size[1]))  # same frame as the inspection crop
a = np.asarray(crop).astype(np.float32)
H, W, _ = a.shape

# paint out Al Bean: his suit becomes the dark shadowed equipment bay behind him
lum0 = a.mean(axis=2); sat0 = a.max(axis=2) - a.min(axis=2)
ys, xs = slice(528, 725), slice(880, 1003)
reg = a[ys, xs]
suit = (lum0[ys, xs] > 95) & (sat0[ys, xs] < 45)
rng = np.random.default_rng(1)
tex = a[560:757, 640:763].copy() * 0.35          # foil texture, darkened
reg[suit] = tex[suit] + rng.normal(0, 4, (suit.sum(), 3))
a[ys, xs] = reg

lum = a.mean(axis=2)
sat = a.max(axis=2) - a.min(axis=2)
yy, xx = np.mgrid[0:H, 0:W]
HORIZON = 562
sky = yy < HORIZON
up = (sky & (lum > 22) & (yy > 120) & ~(xx > 1003)).astype(np.uint8) * 255
upi = Image.fromarray(up).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
# fill holes: flood the background from the top-left corner, everything not reached is spacecraft
ff = upi.copy(); ImageDraw.floodfill(ff, (2, 2), 128)
upm = np.asarray(ff) != 128
hull = Image.new("L", (W, H), 0)
ImageDraw.Draw(hull).polygon([(245, 556), (1062, 556), (1062, 750), (770, 800), (615, 800), (245, 760)], fill=255)
hull = np.asarray(hull) > 0
# legs and footpads by colour (gold foil, bright metal), body by a drawn outline
low = (~sky) & hull & ((sat > 38) | (lum > 175))
low &= ~((xx > 945) & (yy > 648) & (sat <= 38))     # hand tool carrier (white frame on the ground)
low &= ~((xx > 1003) & (yy < 608))                  # dish fabric
lowi = Image.fromarray(low.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
lowi = lowi.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
body = Image.new("L", (W, H), 0)
bd = ImageDraw.Draw(body)
bd.polygon([(478, 556), (905, 556), (922, 650), (862, 700), (752, 703), (625, 703), (613, 628), (478, 628)], fill=255)
bd.polygon([(930, 515), (968, 510), (1052, 660), (1016, 668)], fill=255)      # east leg and ladder
bd.polygon([(412, 512), (446, 516), (292, 748), (262, 746)], fill=255)        # west leg
bd.ellipse((252, 736, 322, 754), fill=255)                                      # west footpad
bd.polygon([(668, 600), (704, 600), (712, 768), (680, 770)], fill=255)        # north leg, lower part
bd.ellipse((636, 762, 762, 790), fill=255)                                      # north footpad
bd.line([(500, 664), (640, 760)], fill=255, width=5)                            # bent contact probe
lowi = Image.fromarray(np.maximum(np.asarray(lowi), np.asarray(body) * (~sky)).astype(np.uint8))
mask = np.maximum(upm.astype(np.float32), np.asarray(lowi).astype(np.float32) / 255)
m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))

bx0, by0, bx1, by1 = 240, 120, 1065, 800
rgba = Image.fromarray(a.astype(np.uint8)).convert("RGBA")
rgba.putalpha(m)
full = rgba.crop((bx0, by0, bx1, by1))
full = full.resize((full.size[0] // 2, full.size[1] // 2), Image.LANCZOS)
out = os.path.join(ROOT, "web/assets")
full.save(os.path.join(out, "lm_photo_full.png"))
# descent stage only: remove everything above the descent stage's top deck
desc = rgba.copy()
al = np.asarray(desc.getchannel("A")).copy()
deck = 452
al[:deck, :] = 0
al[deck:deck + 6, :] = (al[deck:deck + 6, :] * np.linspace(0, 1, 6)[:, None]).astype(np.uint8)
desc.putalpha(Image.fromarray(al))
desc = desc.crop((bx0, by0, bx1, by1)).resize(full.size, Image.LANCZOS)
desc.save(os.path.join(out, "lm_photo_descent.png"))
print("size", full.size, "metres per pixel (full res)", 7.0 / (785 - 130))

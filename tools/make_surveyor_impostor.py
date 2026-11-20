"""Cut Surveyor 3 out of the crew photo AS12-48-7100 (NASA, 20 Nov 1969 ~06:27 UTC, before the crew
removed its TV camera and scoop). The photo looks at Surveyor with the lander on the rim behind it,
the same view as CAM 2. Three states: complete, without TV camera, without camera and scoop.
Run: python tools/make_surveyor_impostor.py
Written with an AI assistant (Claude Code, Anthropic), Nov 2026.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The large NASA source files stay in the sibling Myrsky checkout (653 MB, not in git).
# Override with MYRSKY_SRC=/path/to/Myrsky.
MYRSKY = os.environ.get("MYRSKY_SRC", os.path.join(os.path.dirname(ROOT), "Myrsky"))
img = Image.open(os.path.join(MYRSKY, "data/photos/surveyor/AS12-48-7100HR.jpg")).convert("RGB")
K = img.size[0] / 1000.0          # coordinates below are on a 1000 x 1000 scale
a = np.asarray(img).astype(np.float32)
H, W, _ = a.shape
lum = a.mean(axis=2)
s = lambda pts: [(x * K, y * K) for x, y in pts]

# bright metal against the ground: brighter than the local ground level
ground = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.BoxBlur(int(25 * K))))
bright = lum > ground.astype(np.float32) + 38
hull = Image.new("L", (W, H), 0)
ImageDraw.Draw(hull).polygon(s([(160, 595), (850, 595), (850, 892), (160, 892)]), fill=255)
mask = bright & (np.asarray(hull) > 0)
mi = Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))
# large parts by outline (they include shaded faces)
body = Image.new("L", (W, H), 0); d = ImageDraw.Draw(body)
d.polygon(s([(338, 545), (410, 456), (452, 438), (632, 516), (630, 524), (545, 503), (482, 556)]), fill=255)  # solar panel, antenna
d.line(s([(491, 480), (499, 692)]), fill=255, width=int(12 * K))                                            # mast
d.polygon(s([(336, 700), (468, 693), (471, 766), (338, 771)]), fill=255)                                     # thermal compartment
d.polygon(s([(332, 766), (600, 758), (636, 800), (522, 828), (332, 822)]), fill=255)                         # spaceframe, tanks
d.ellipse(s([(163, 805, 222, 829)][0:1][0]), fill=255) if False else d.ellipse(tuple(v * K for v in (163, 805, 222, 829)), fill=255)
d.ellipse(tuple(v * K for v in (600, 848, 666, 887)), fill=255)                                              # footpads
d.line(s([(200, 815), (335, 790)]), fill=255, width=int(7 * K)); d.line(s([(520, 790), (632, 862)]), fill=255, width=int(8 * K))  # legs
full = np.maximum(np.asarray(mi), np.asarray(body))
# bright pebbles on the ground: below the spaceframe keep bright pixels only near the drawn parts
small = Image.fromarray(np.asarray(body)).resize((W // 4, H // 4)).filter(ImageFilter.MaxFilter(9)).resize((W, H))
yy = np.mgrid[0:H, 0:W][0]
keep = (yy < 785 * K) | (np.asarray(small) > 0)
full = np.where(keep, full, 0).astype(np.uint8)
cam = Image.new("L", (W, H), 0); ImageDraw.Draw(cam).rectangle(tuple(v * K for v in (544, 596, 590, 700)), fill=255)
scoop = Image.new("L", (W, H), 0); ImageDraw.Draw(scoop).polygon(s([(590, 688), (848, 700), (848, 770), (590, 772)]), fill=255)
cam, scoop = np.asarray(cam) > 0, np.asarray(scoop) > 0

out = os.path.join(ROOT, "web/assets")
box = tuple(int(v * K) for v in (150, 430, 860, 900))
def save(m, name):
    al = Image.fromarray(m.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    rgba = img.convert("RGBA"); rgba.putalpha(al)
    c = rgba.crop(box); c = c.resize((c.size[0] // 3, c.size[1] // 3), Image.LANCZOS)
    c.save(os.path.join(out, name)); return c.size
print(save(full, "sv_photo_full.png"))
print(save(np.where(cam, 0, full), "sv_photo_nocam.png"))
print(save(np.where(cam | scoop, 0, full), "sv_photo_bare.png"))

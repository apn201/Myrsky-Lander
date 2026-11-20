"""Regolith detail tile from crew photo AS12-49-7284 (NASA): a patch of real soil between the reseau
crosses, large-scale shading removed (grain and pebble shadows kept), made tileable.
Run: python tools/make_regolith_tile.py   Written with an AI assistant (Claude Code), Nov 2026."""
import os
import numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The large NASA source files stay in the sibling Myrsky checkout (653 MB, not in git).
# Override with MYRSKY_SRC=/path/to/Myrsky.
MYRSKY = os.environ.get("MYRSKY_SRC", os.path.join(os.path.dirname(ROOT), "Myrsky"))
img = Image.open(os.path.join(MYRSKY, "data/photos/ground_rocks_boots/AS12-49-7284HR.jpg")).convert("L")
K = img.size[0] / 1000
p = img.crop(tuple(int(v * K) for v in (130, 520, 290, 690))).resize((256, 256), Image.LANCZOS)
a = np.asarray(p).astype(np.float32)
low = np.asarray(p.filter(ImageFilter.GaussianBlur(28))).astype(np.float32)
hp = a / np.maximum(low, 1)                    # ~1.0 average
s = np.roll(np.roll(hp, 128, 0), 128, 1)
y = np.abs(np.linspace(-1, 1, 256))[:, None]; x = np.abs(np.linspace(-1, 1, 256))[None, :]
m = np.clip(np.maximum(x, y) * 1.6 - 0.6, 0, 1)
t = hp * (1 - m) + s * m
Image.fromarray(np.clip(t * 128, 0, 255).astype(np.uint8)).save(os.path.join(ROOT, "web/assets/tex_regolith_AS12-49-7284.jpg"), quality=92)
print("mean", t.mean(), "std", t.std())

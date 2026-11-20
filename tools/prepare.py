"""Convert the downloaded NASA data in data/ into small files the web page reads.

Run from the repo root:  python tools/prepare.py
Writes into web/assets/.  Inputs (NASA LROC, Yale BSC5) are listed in data/SOURCES.md.

Code written with an AI assistant (Claude Code, Anthropic) on 14-15 Nov 2026.
"""
import json, math, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The large NASA source files stay in the sibling Myrsky checkout (653 MB, not in git).
# Override with MYRSKY_SRC=/path/to/Myrsky.
MYRSKY = os.environ.get("MYRSKY_SRC", os.path.join(os.path.dirname(ROOT), "Myrsky"))
OUT = os.path.join(ROOT, "web", "assets")
os.makedirs(OUT, exist_ok=True)

R = 1737400.0
CLAT = math.radians(-3.0)
LM_LAT, LM_LON = -3.0128, 336.5781  # LROC / Wagner et al. 2017
GRID_CENTRE = (60.0, -45.0)  # east, north metres from the lander: between CAM 1 and CAM 2
HALF = 1024.0  # metres each side


def lonlat_to_px(lat, lon, scale, lpo, spo):
    x = R * math.cos(CLAT) * math.radians(lon - 180.0)
    y = R * math.radians(lat)
    return lpo - y / scale, x / scale + spo  # row, col (0-based, pixel centre convention approx)


# ---------------------------------------------------------------- terrain
dtm = np.array(Image.open(os.path.join(MYRSKY, "data/lroc/NAC_DTM_APOLLO12.TIF")), dtype=np.float64)
dtm[dtm < -1e30] = np.nan
r0, c0 = lonlat_to_px(LM_LAT, LM_LON, 2.0, -44912.5, -2368825.5)
print("lander DTM pixel", r0, c0)


def bilinear(a, r, c):
    r0_ = np.clip(np.floor(r).astype(int), 0, a.shape[0] - 2)
    c0_ = np.clip(np.floor(c).astype(int), 0, a.shape[1] - 2)
    fr = r - r0_
    fc = c - c0_
    return (a[r0_, c0_] * (1 - fr) * (1 - fc) + a[r0_ + 1, c0_] * fr * (1 - fc)
            + a[r0_, c0_ + 1] * (1 - fr) * fc + a[r0_ + 1, c0_ + 1] * fr * fc)


h0 = float(bilinear(dtm, np.array([r0]), np.array([c0]))[0])
print("lander height vs 1737.4 km sphere", h0)

N = 1024  # 2 m cells
e = GRID_CENTRE[0] - HALF + (np.arange(N) + 0.5) * 2.0
n = GRID_CENTRE[1] + HALF - (np.arange(N) + 0.5) * 2.0  # row 0 = north
E, Nn = np.meshgrid(e, n)
rows = r0 - Nn / 2.0
cols = c0 + E / 2.0
H = bilinear(dtm, rows, cols) - h0
H = np.where(np.isnan(H), np.nanmean(H), H)
print("terrain range", H.min(), H.max())
np.round(H * 100).astype("<i2").tofile(os.path.join(OUT, "terrain_1024.i16"))

# ---------------------------------------------------------------- wide terrain from SLDEM2015 (59 m/px)
meta = json.load(open(os.path.join(MYRSKY, "data/sldem/sldem2015_apollo12_768.json")))
print("sldem meta", meta)
sl = np.array(Image.open(os.path.join(MYRSKY, "data/sldem/sldem2015_apollo12_768.tif")), dtype=np.float64)
if sl.max() < 100 and sl.min() > -100:  # km -> m if needed
    sl *= 1000
lat_n = meta.get("lat_max", meta.get("north", -2.2617))
lat_s = meta.get("lat_min", meta.get("south", -3.7617))
lon_w = meta.get("lon_min", meta.get("west", 335.8281))
lon_e = meta.get("lon_max", meta.get("east", 337.3281))
WN = 256
WHALF = 12000.0
we = (np.arange(WN) + 0.5) / WN * 2 * WHALF - WHALF
wn = WHALF - (np.arange(WN) + 0.5) / WN * 2 * WHALF
WE, WNn = np.meshgrid(we, wn)
lat = LM_LAT + np.degrees(WNn / R)
lon = LM_LON + np.degrees(WE / (R * math.cos(math.radians(LM_LAT))))
sr = (lat_n - lat) / (lat_n - lat_s) * sl.shape[0] - 0.5
sc = (lon - lon_w) / (lon_e - lon_w) * sl.shape[1] - 0.5
WH = bilinear(sl, sr, sc)
# tie SLDEM to the LROC DTM at the site
centre = bilinear(sl, np.array([(lat_n - LM_LAT) / (lat_n - lat_s) * sl.shape[0] - 0.5]),
                  np.array([(LM_LON - lon_w) / (lon_e - lon_w) * sl.shape[1] - 0.5]))[0]
WH = WH - centre
print("wide range", WH.min(), WH.max())
np.round(WH * 10).astype("<i2").tofile(os.path.join(OUT, "wide_256.i16"))  # decimetres

# ---------------------------------------------------------------- orthophoto -> albedo texture
ORTHO = os.path.join(MYRSKY, "data/lroc/NAC_DTM_APOLLO12_M120012135_50CM.IMG")
o = np.fromfile(ORTHO, dtype="<i2", offset=19746).reshape(5465, 9873).astype(np.float64)
o[o == -32768] = np.nan
orr, occ = lonlat_to_px(LM_LAT, LM_LON, 0.5, -179646.5, -9475298.5)
print("lander ortho pixel", orr, occ)

# sample ortho on a 0.5 m grid matching the terrain grid (4x)
M = N * 4
oe = GRID_CENTRE[0] - HALF + (np.arange(M) + 0.5) * 0.5
on = GRID_CENTRE[1] + HALF - (np.arange(M) + 0.5) * 0.5
ri = np.clip(np.round(orr - on / 0.5).astype(int), 0, o.shape[0] - 1)
ci = np.clip(np.round(occ + oe / 0.5).astype(int), 0, o.shape[1] - 1)
O = o[ri[:, None], ci[None, :]]
O = np.where(np.isnan(O), np.nanmedian(O), O)

# fit the 2010 Sun direction from the terrain shading, then divide it out
O2 = O.reshape(N, 4, N, 4).mean(axis=(1, 3))
gy, gx = np.gradient(H, 2.0)  # gy along rows (southward)
nx, ny, nz = -gx, gy, np.ones_like(H)  # east, north, up
nl = np.sqrt(nx * nx + ny * ny + nz * nz)
nx, ny, nz = nx / nl, ny / nl, nz / nl
best = None
for inc in range(30, 89, 2):
    for az in range(0, 360, 4):
        s = (math.sin(math.radians(inc)) * math.sin(math.radians(az)),
             math.sin(math.radians(inc)) * math.cos(math.radians(az)),
             math.cos(math.radians(inc)))
        sh = nx * s[0] + ny * s[1] + nz * s[2]
        c = np.corrcoef(sh[8:-8, 8:-8].ravel(), O2[8:-8, 8:-8].ravel())[0, 1]
        if best is None or c > best[0]:
            best = (c, inc, az, sh)
print("2010 sun fit: corr %.3f incidence %d azimuth %d" % best[:3])
_, inc, az, sh = best
A = np.vstack([sh.ravel(), np.ones(sh.size)]).T
a, b = np.linalg.lstsq(A, O2.ravel(), rcond=None)[0]
pred = np.maximum(a * sh + b, 0.15 * np.median(O2))
ratio = O2 / pred
ratio_up = np.kron(ratio, np.ones((4, 4)))
pred_up = np.kron(pred, np.ones((4, 4)))
# keep the sub-2 m texture: detail = O / smooth(O) at 0.5 m
def box(a_, k):
    p = np.pad(a_, k, mode="edge")
    cs = p.cumsum(0).cumsum(1)
    cs = np.pad(cs, ((1, 0), (1, 0)))
    s_ = cs[2 * k + 1:, 2 * k + 1:] - cs[:-2 * k - 1, 2 * k + 1:] - cs[2 * k + 1:, :-2 * k - 1] + cs[:-2 * k - 1, :-2 * k - 1]
    return s_ / (2 * k + 1) ** 2

albedo = O / pred_up
albedo = albedo / np.median(albedo)


def paint_out(img, ce, cn, rad):
    """Fill a disc (hardware and its shadow in the 2010 photo) with ground copied from 40 m west."""
    yy = ((GRID_CENTRE[1] + HALF - cn) / 0.5)
    xx = ((cn * 0 + ce - (GRID_CENTRE[0] - HALF)) / 0.5)
    r = int(rad / 0.5)
    y0, y1 = int(yy - r), int(yy + r)
    x0, x1 = int(xx - r), int(xx + r)
    Y, X = np.mgrid[y0:y1, x0:x1]
    d = np.sqrt((Y - yy) ** 2 + (X - xx) ** 2) / r
    w = np.clip((1 - d) * 3, 0, 1)
    src = img[y0:y1, x0 - 80:x1 - 80]
    patch = img[y0:y1, x0:x1]
    src = src / src.mean() * np.median(img[y0 - r:y1 + r, x0 - r:x1 + r])
    img[y0:y1, x0:x1] = patch * (1 - w) + src * w


# shadows in the 2010 photo point away from the 2010 Sun
sx, sy = -math.sin(math.radians(az)), -math.cos(math.radians(az))
for ce, cn, rad, slen in [(0, 0, 7, 9), (118.1, -103.1, 4, 4), (-87.8, 91.0, 3, 2), (-90.8, 92.6, 1.5, 1),
                         (-80, 77, 2, 1.5), (-103.6, 81.4, 1.5, 1), (-4.2, 14.6, 1.5, 4), (0.2, 8.5, 2.5, 3)]:
    for t in np.linspace(0, slen, 4):
        paint_out(albedo, ce + sx * t, cn + sy * t, rad)

albedo = np.clip(albedo, 0.35, 1.9)
img = np.clip(albedo / 1.9 * 255 * 1.0, 0, 255).astype(np.uint8)
# near texture: +-512 m at 0.5 m
q = M // 4
Image.fromarray(img[q:3 * q, q:3 * q]).save(os.path.join(OUT, "ground_near.jpg"), quality=88)
# wide texture: +-1024 m at 1 m
Image.fromarray(img).resize((2048, 2048), Image.LANCZOS).save(os.path.join(OUT, "ground_wide.jpg"), quality=88)

# ---------------------------------------------------------------- stars (Yale Bright Star Catalogue)
stars = []
for line in open(os.path.join(MYRSKY, "data/stars/bsc5_catalog.dat"), encoding="latin1"):
    try:
        rh, rm, rs = int(line[75:77]), int(line[77:79]), float(line[79:83])
        sign = -1 if line[83] == "-" else 1
        dd, dm, ds = int(line[84:86]), int(line[86:88]), int(line[88:90])
        vmag = float(line[102:107])
    except ValueError:
        continue
    bv = line[109:114].strip()
    bv = float(bv) if bv else 0.6
    ra = (rh + rm / 60 + rs / 3600) * 15
    dec = sign * (dd + dm / 60 + ds / 3600)
    if vmag <= 6.0:
        stars.append([round(ra, 3), round(dec, 3), vmag, round(bv, 2)])
json.dump(stars, open(os.path.join(OUT, "stars.json"), "w"), separators=(",", ":"))
print("stars", len(stars))

json.dump({"grid_centre_en": GRID_CENTRE, "half_m": HALF, "n": N, "cell_m": 2.0, "units": "cm, int16, row 0 north",
           "wide": {"n": WN, "half_m": WHALF, "units": "dm"},
           "ortho_2010_sun": {"incidence": inc, "azimuth": az, "corr": round(best[0], 3)},
           "lander_height_vs_sphere_m": h0},
          open(os.path.join(OUT, "terrain.json"), "w"), indent=1)
print("done")

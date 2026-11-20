# Data sources

One row per file in `data/`. Dates are when the file was downloaded.

## Terrain: `lroc/`

Product page: https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO12
Files from the LROC PDS archive, `LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO12/`. Downloaded 11 Oct 2026.

| File | What | Use |
|---|---|---|
| `NAC_DTM_APOLLO12.TIF` | Heights, 2 m/px, 2468 x 1367, 32-bit float GeoTIFF | ground mesh, shadows, line of sight |
| `NAC_DTM_APOLLO12.LBL` | label for the DTM | projection and offsets |
| `NAC_DTM_APOLLO12_CONF.IMG` | confidence map, 2 m/px, 8-bit PDS | check whether the crater rim is measured or interpolated |
| `NAC_DTM_APOLLO12_M120005333_50CM.IMG` | orthophoto, 0.5 m/px, 9873 x 5465, 16-bit PDS, taken 2010-02-05 10:34 UTC | footpath reference (tracks show best here) |
| `NAC_DTM_APOLLO12_M120012135_50CM.IMG` | orthophoto, same grid, taken 2010-02-05 12:27 UTC | ground texture (more even) |
| `NAC_DTM_APOLLO12_README.TXT` | product readme | accuracy, confidence values |
| `previews/*.png` | PNG previews made from the orthophotos | looking only |

Projection: equirectangular, sphere 1737.4 km, planetocentric, centre lat -3.0, centre lon 180.0.
Extent: lat -3.05227 to -2.96217, lon 336.45205 to 336.61506 E.
Accuracy: 0.8 m precision (SOCET SET), 1.31 m RMS against LOLA.
Orthophoto header: 19746 bytes, then int16 little-endian, null -32768.
Method reference: Henriksen, M.R., et al. (2016), Extracting accurate and precise topography from LROC narrow angle camera stereo observations, Icarus. doi:10.1016/j.icarus.2016.05.012
Credit line: NASA/GSFC/Arizona State University (standard LROC credit; confirm wording).

## Positions: `positions/`

Downloaded 19 Oct 2026.

| File | What | Use |
|---|---|---|
| `positions.csv` | our table: every object in metres east, north, up from the lander, with source and +/- | object placement |
| `ANTHROPOGENIC_OBJECTS_360.ZIP`, `shapefile_360/`, `ANTHROPOGENIC_OBJECTS_README.TXT` | LROC coordinates of man-made objects, last updated 2026-08-14. https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_ANTHROPOGENIC_OBJECTS | lander, central station, seismometer, Surveyor 3, retrorocket, ascent stage crash |
| `anthropogenic_objects_all.csv` | the shapefile's table as CSV, all 71 objects | |
| `2016_LROC_Coordinates_of_Human_Features.pdf` | older 2016 version of the same table | cross-check only |
| `reference/a12mrf3-6.jpg` | Apollo 12 Mission Report fig 3-6, ALSEP deployment configuration with cable lengths. NASA. https://apollojournals.org/alsj/a12/a12mrf3-6.jpg | instrument layout |
| `reference/A12_EVA_1_ALSEP_..._Jan_2018.jpg` | planimetric map on LROC image, 10 m grid. (c) 2018 Brian J. McInall, via the Apollo Lunar Surface Journal. REFERENCE ONLY, do not publish. | small object positions |
| `reference/a12_traverseM168353795R.jpg` | traverse map on LROC image, from the journal. Rights unchecked. Reference only. | |

Citation for LROC coordinates (asked for by the product): Wagner, R. V., Nelson, D. M., Plescia, J. B., Robinson, M. S., Speyerer, E. J., & Mazarico, E. (2017). Coordinates of anthropogenic features on the Moon. Icarus, 283, 92-103. doi:10.1016/j.icarus.2016.05.011

## Models: `models/` (and one file in `lroc/`)

| File | What | Licence | Verdict |
|---|---|---|---|
| `models/nasa_apollo_lunar_module.glb` (+ `.png` preview) | NASA 3D Resources "Apollo Lunar Module", 134 separate meshes, 6 images, bbox about 6.4 x 5.0 units (real LM 9.4 x 7.0 m, so scale about 1.4). https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Apollo%20Lunar%20Module . Downloaded 19 Oct 2026. | NASA 3D Resources: "free to download and use", NASA media guidelines | Stages can be split (separate meshes). Simple, cartoon-like: smooth yellow descent stage, no foil. Fine at a distance, toy-like at 1000 px. Base to improve, or keep looking. |
| `lroc/apollo_12.glb` | Sketchfab "Apollo 12" by pierre391: photogrammetry from Apollo 12 orbital Hasselblad scans. 11 meshes, 708k vertices, one 4.4 MB JPEG texture, arbitrary units, not georeferenced. https://sketchfab.com/3d-models/apollo-12-7e0b70aaa7314bf7bc40f30bd119c0f4 . Downloaded by Juha 19 Oct 2026. | CC BY 4.0, credit pierre391 | Regional terrain from orbit. Lower resolution than the LROC DTM at the site and has no coordinates. Possible use: distant scenery, if it can be placed. |

| `3d/apollo_lunar_excursion_module.glb` | Sketchfab "Apollo Lunar Excursion Module" by siotech2011. Apollo 13 LM (LM-7, near twin of Apollo 12's LM-6). Blender, 1.38 M triangles, 63 meshes with named parts (Descent_Module, CABIN, ladder, hatch, porch, dishes, RCS quads, legs), 13 plain materials, no textures, 58 MB. https://sketchfab.com/3d-models/apollo-lunar-excursion-module-5376aae0ac484d5f8afdcae0a0d052c7 . Added by Juha 19 Oct 2026. | CC BY 4.0, credit siotech2011 | **Best base.** Shapes and proportions right (octagonal descent stage, legs and struts, porch, ladder). Stages split by name. No foil: gold and black foil materials to add. Needs cutting down to about 100-200k triangles for the web. |
| `3d/apollo_11_lunar_module.glb` | Sketchfab "Apollo 11 Lunar Module" by CMFDesign. Made in Tinkercad, 450k triangles, merged into 13 meshes by colour, flat colours, no textures, 13 MB. https://sketchfab.com/3d-models/apollo-11-lunar-module-d5eea68f5d464515a6fb2d2aee7ac979 | CC BY 4.0, credit CMFDesign | Crinkled foil is modelled, but stylised: thin splayed legs, small footpads, big decals. Stages share meshes, so splitting needs a cut by height. Second choice. |

Checked and not downloaded:
- NASA "Apollo 12 - Landing Site" STL, 60 x 60 km, 50x vertical exaggeration, source not stated. Made for 3D printing. Not usable for the scene.
- data.nasa.gov "Apollo Lunar Module": the older 3DS version of the same NASA model (`lunarlandernofoil-c.zip`), "license not specified".
- Bootprint 3D models online are community-made (Whitney Potter's stereo model from Aldrin's photos, Thingiverse copies). Not NASA, licence unclear. Make footprints from NASA tread photos instead.
- Astromaterials 3D (ARES, JSC): 3D scans of returned Apollo 12 rocks. The catalogue page needs JavaScript; formats and terms still to check.
- Astronomy magazine "Apollo 12 in 3D" (Brian May, 2019): (c) Firecrown Media. Reference only.
- Smithsonian 3D: Apollo 11 command module Columbia is CC0. No lunar module scan found.

## Documents: `docs/`

| File | What |
|---|---|
| `A12_MissionReport_MSC-01855.pdf` | Apollo 12 Mission Report, March 1970, 332 pages. https://ntrs.nasa.gov/citations/19760072997 . Table 5-I events, 5-III trajectory (PDF p.95), 9.12.1 CSM sightings of the LM. |
| `A12_PressKit.pdf` | Apollo 12 Press Kit, NASA 1969. https://apollojournals.org/alsj/a12/a12prskit.html . LM sizes p.58-59, SNAP-27, TV camera, Surveyor crater. |
| `ALSEP-MT-03_FlightSystemFamManual_1969.pdf` | ALSEP Flight System Familiarization Manual, Rev B, April 1969 (covers the Apollo 12 package). https://apollojournals.org/alsj/ALSEPManual1969_FSFM_RevB.pdf . Leading-particulars tables for each instrument. |
| `Surveyor-III-MissionReport-1967.pdf` | Surveyor III Mission Report, JPL TR 32-1177. https://apollojournals.org/alsj/a12/Surveyor-III-MIssionRpt1967028267.pdf . Configuration drawings in Appendix B, PDF p.182-184. |
| `SP-235_Apollo12_Preliminary_Science_Report.pdf` | NASA SP-235, 1970, 240 pages, 100 MB. https://ntrs.nasa.gov/citations/19700025955 . Fig 10-1 traverse map p.114 (PDF p.127), fig 10-50 photo map with flag, TV, antenna p.158 (PDF p.171), SIDE distance p.85. |

## Wide terrain: `sldem/`

SLDEM2015 (LOLA laser altimetry co-registered with Kaguya Terrain Camera), 512 pixels per degree, about 59 m per pixel. PDS Geosciences Node, `LRO-L-LOLA-4-GDR-V1.0`, tile `SLDEM2015_512_30S_00S_315_360_FLOAT` (1.4 GB). Only rows 1158-1925 were downloaded (HTTP range request), then cropped. Downloaded 19 Oct 2026.
https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/sldem2015/tiles/float_img/

| File | What | Use |
|---|---|---|
| `sldem2015_apollo12_768.tif` | 768 x 768 float32 TIFF, metres relative to the 1737.4 km sphere. lat -2.2617 to -3.7617, lon 335.8281 to 337.3281 E (45 x 45 km centred on the site). | terrain from the edge of the LROC DTM out to the horizon and beyond |
| `sldem2015_apollo12_768.json` | edges, pixel registration, units | georeference |
| `sldem2015_apollo12_768_hillshade.png` | preview. Yellow: LROC DTM area. Red circle: CAM 1 horizon (1.9 km). | looking only |
| `sldem2015_512_30s_00s_315_360_float.lbl` | label of the full tile | |

Check against the LROC DTM (361 points): SLDEM is on average 0.4 m lower, spread 2.1 m. At the lander -1424.9 vs -1422.2 m. Same vertical reference, so the two join without a step.
Citation: Barker, M.K., et al. (2016), A new lunar digital elevation model from the Lunar Orbiter Laser Altimeter and SELENE Terrain Camera, Icarus 273, 346-355. doi:10.1016/j.icarus.2015.07.039

## CSM orbit: `orbit/`

Computed 19 Oct 2026 from the Apollo 12 Mission Report (MSC-01855, March 1970), table 5-III trajectory parameters, lunar orbit phase. Report in `docs/A12_MissionReport_MSC-01855.pdf`, from https://ntrs.nasa.gov/citations/19760072997 .

| File | What |
|---|---|
| `csm_passes_apollo12.csv` | 44 passes of Yankee Clipper above the site horizon, 18 Nov 08:11 (circularisation) to 21 Nov 20:49 UTC (transearth injection): rise, highest and set times in UTC and mission time, max elevation, azimuths, closest range, sunlit or not, docked or alone. |
| `csm_passes_method.py.txt` | the calculation, kept as a record (not project code) |

Method: only the positions in table 5-III are used. The table's headings are in Apollo's Earth-equator frame, which gave errors of hundreds of km. Two positions on the same coast between manoeuvres fix the plane and the mean rate. Orbits treated as circular (altitude 108-117 km). Periods come out 118.7-118.8 min, inclination about 15 deg, matching the table.
Check: the model puts near-overhead passes at 112:26 and 114:25. The Mission Report (9.12.1) says the CSM tracked the site on the first revolution after landing and Gordon saw the LM and Surveyor "as the command module passed through the zenith" on the next pass.
Expected error: timing within a minute or two, track within a few km. Sun position is simplified (subsolar point moving 12.19 deg/day from the touchdown Sun height), so "partly sunlit" on night passes before sunrise on 18 Nov is approximate.

## Rocks: `rocks/`

Astromaterials 3D, NASA JSC (ares.jsc.nasa.gov/astromaterials3d). Downloaded by Juha 19 Oct 2026. Photogrammetry of returned samples, units metres, OBJ + texture. "Web-Resolution" and "Full-Resolution" have the same mesh (12019,0: 122,102 faces); only the texture differs (6 MB JPG vs 203 MB TIFF). Web-Resolution is all we need.
Credit (from the parameter sheet): NASA Acquisition & Curation Office, Astromaterials 3D, Lunar Sample Laboratory Facility, NASA JSC. NASA media guidelines: not subject to US copyright, credit NASA, no endorsement implied.

| Sample | Size | Files |
|---|---|---|
| 12013,11 | 5.5 x 3.9 x 3.3 cm, angular, faceted (check for a sawn face) | web |
| 12019,0 | 8.7 x 7.2 x 5.5 cm, rounder, blocky | web |
| 12038,7 | 8.4 x 6.9 x 5.2 cm, angular, blocky | web |

## Reference photos: `photos/`

73 crew photographs and two Surveyor items from the Apollo 12 Image Library of the Apollo Lunar Surface Journal, https://apollojournals.org/alsj/a12/images12.html . High-resolution scans (about 2340 px square, 79 MB in all). Downloaded 19 Oct 2026. `photo_index.csv` lists topic, frame, file and the journal caption for each.
The photographs are NASA, public domain. The journal captions are (c) the journal and its contributors; use them for reading, not for the site.
Folders: `flag`, `sband_dish`, `tv_camera`, `swc`, `lander`, `alsep`, `surveyor`, `ground_rocks_boots`.

Key frames:
- Flag: AS12-47-6897 (flag spread out with ripples, early EVA 1), AS12-47-6954 (later, drooping more).
- TV camera on its pole tripod, burned out: AS12-46-6756. Camera height roughly chest height, 1.3-1.5 m.
- Dish upright: AS12-46-6739, 6749. No photo of the fallen dish exists; it fell during the thruster test with the crew inside. Window shots AS12-48-7160 to 7163 (after EVA 2) still show its upright shadow.
- CAM 2 framing check: AS12-48-7135, Al at Surveyor with the LM on the rim behind. Surveyor is visibly tan.
- Surveyor details: AS12-48-7104/7105 (TV camera and colour chart), 7110 (footpad), 7121 (whole spacecraft from 15 ft).
- Ground texture: AS12-57-8446 to 8455 are stereo close-up camera frames of 3-inch squares of soil, including a boot print (8447, 8448).
- CAM 1 framing check, `cam1_framing/`. Both "4 o'clock" pans were taken beside the burned-out TV camera, which is the CAM 1 spot (journal clock: 12 = west, 3 = north; the TV camera is at bearing 27 deg = 4 o'clock). The journal: "Pete took this pan from a spot close to the burned-out TV camera."
  - **AS12-46-6749**: Pete, 116:24:47 (19 Nov about 12:48 UTC, Sun 8.4 deg up). Whole LM, Al at the equipment bay, dish edge on the right. Best single CAM 1 reference. Slightly soft (taken at 15-ft focus).
  - AS12-46-6748, 6750: the frames either side.
  - **AS12-47-6988, 6990**: Al, 118:33:10 (about 14:55 UTC), sharp (74-ft focus). 6988: LM and open dish, Pete at the equipment bay. 6990: north and east footpads.
  - AS12-47-7000: same pan, TV camera on the left.
  - `a12pan1162447.jpg` (Pete) and `a12pan1183310HR.jpg` (Al): whole 4 o'clock pans, assembled by Dave Byrne and others for the journal. Reference only.
  - Geometry check: from the TV spot our positions put the dish 17 deg right of the LM and the flag 52 deg right, near down-Sun. The pans show the same order.
  - The Hasselblad 60 mm lens on the 55 mm square frame gives about a 49 deg view, close to the 50 deg used for CAM 1. Render CAM 1 at 49 deg, square, for 19 Nov 12:48 UTC and lay it over 6749.
- Surveyor 1967: `surveyor/NASA67-H-876-s.jpg`, Surveyor III's own photo mosaic (full 76 MB version at the same address without "-s"). `surveyor/survcrat.jpg`, contour map of Surveyor Crater.

## Science extras and generation rules (20 Oct 2026)

- `procedural-ground.md`: rock counts, rock shape, small craters, near-lander ground. From Surveyor 3 Preliminary Science Results (`docs/Surveyor3_Preliminary_Science_Results_1967.pdf`, JPL Project Document 125, 1967, https://ntrs.nasa.gov/citations/19690074497 ), Surveyor: Program Results pages 71-74 (`docs/SP-184_Surveyor3_pages71-74.pdf`), and the Preliminary Science Report.
- `science-extras.md`: ground temperature, eclipses, seismometer, what is visible in the sky.
- `seismic/`: Apollo 12 seismometer data, see its README.
- `sky/lunar_eclipses_1967-2035.csv`: NASA lunar eclipse catalogue (F. Espenak, NASA GSFC), 157 eclipses, UTC.

## Stars: `stars/`

Yale Bright Star Catalogue, 5th revised edition (Hoffleit and Warren 1991), CDS catalogue V/50.
https://cdsarc.cds.unistra.fr/ftp/V/50/ Downloaded 19 Oct 2026.

| File | What | Use |
|---|---|---|
| `bsc5_catalog.dat` | 9110 stars, fixed-width text, J2000 positions and V magnitude | star field |
| `bsc5_catalog.gz` | the same, as downloaded | |
| `bsc5_ReadMe.txt` | column layout | which bytes hold RA, Dec, Vmag, B-V |

## Earth: `earth/`

NASA Visible Earth. Downloaded 19 Oct 2026.

| File | What | Use |
|---|---|---|
| `bluemarble_2002_clouds_2048.jpg` | Blue Marble 2002, land, ocean, ice and clouds, 2048 x 1024. https://visibleearth.nasa.gov/images/57735 | fallback Earth texture, has clouds |
| `bmng_200411_topo_bathy_5400.jpg` | Blue Marble Next Generation, November 2004, cloud-free, 5400 x 2700. https://visibleearth.nasa.gov/images/73884 | November ground colour if clouds are layered separately |

Credit: NASA Earth Observatory / NASA Goddard Space Flight Center (confirm wording on each page).
GIBS daily images are fetched live and are not stored here.

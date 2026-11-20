# Lander shadow mesh (web/assets/lm_shadow.bin)

The lander on screen is the crew's photo; only its shadow is 3D. That shadow used to come from NASA 3D Resources'
"Apollo Lunar Module" (Draco-compressed glb, 0.7 MB, plus a 0.76 MB decoder that some browsers refused to run).
It was replaced on 15 Nov 2026 by a shadow-only copy of the same model:

- Source: the glb as it was in `web/assets/lm_nasa.glb` (git history before this change; also NASA 3D Resources).
- All meshes transformed to the model's own frame, every vertex snapped to a 0.03 model-unit grid (4.3 cm at the
  1.42 scale used in the scene), merged vertices, collapsed triangles dropped: 97,588 -> 19,790 triangles.
- Split into descent and ascent stage with the same bounding-box rule as before (`min.y > 2.18 && max.y > 2.55 || min.y > 2.43`).
- Baked in the browser on the dev server (decoded with three.js GLTFLoader + DRACOLoader) and saved through `/__shot`.

File format (little endian): uint32 magic 0x4C4D3031, uint32 vertex count, uint32 descent index count,
uint32 ascent index count, float32 grid step; int16 x y z per vertex in grid steps; padding to 4 bytes;
uint16 triangle indices, descent first. Read by `loadLM()` in `web/js/models.js`.

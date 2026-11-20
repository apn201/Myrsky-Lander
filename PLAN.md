# Plan

## Physics (all real, all simple)

- Gravity at the Apollo 12 site: about 1.62 m/s². No air: no drag, dust flies on ballistic paths.
- Rocket equation: mass falls as fuel burns. Engine figures now come from Luminary 131 where it has them (see Prototype status); the rest are marked VERIFY or ESTIMATE in `web/js/game/lm.js`.
- Attitude: RCS torque on a real moment of inertia. Optional assist mode holds the attitude you set.
- Touchdown: leg contact on the height map. Judge vertical and horizontal speed and tilt against LM landing limits.
- astropy does not run in the browser. Use it (and Astronomy Engine) in `tools/` to check constants and Sun/Earth positions; the game loop is plain JavaScript.

### Prototype status (20 Nov 2026)

6-DOF rigid body (`physics.js`), autopilot (`dap.js`), vehicle data (`lm.js`), checked by `node tools/test_physics.mjs` (23 checks, including a keyboard-style pilot that only follows the flight director, a too-fast start that needs manual full throttle, and an 8° slope).
- Real values from Luminary 131 (Apollo 13 LM software, in the Space pilot project): descent engine exhaust velocity 2,955.9 m/s and FTP thrust 43,455 N, throttle lag 0.2 s, ascent exhaust velocity 3,030 m/s, 14 ms minimum jet pulse, the jet table for U/V rotation and X translation.
- 16 RCS jets at their quads; torque about the moving centre of mass; inertia from the mass layout.
- Rate command / attitude hold, P66 rate of descent (1 ft/s per click) or manual throttle, trim gimbal.
- Legs: crushable stroke (no spring back), footpad friction, bottoming and failure; hull contacts damage the nozzle, descent stage, RCS quads, cabin; crew g-load. Result is a damage report, then liftoff with whatever survived.
- Played in the vertical plane: ←/→ tilt, ↑/↓ ROD clicks. Crew assist nulls cross-range drift with RCS translation.
- Real ground: Myrsky's LROC 2 m height model and orthophoto (SLDEM beyond), with terrain shadows; the legs land on the same heights and slopes. World axes are Myrsky's; you fly west toward Intrepid's spot as Apollo 12 did, with the Sun where it was at touchdown.
- Lander: the crew photo cut-out (AS12-48-7100), relit; NASA model casts the shadow. At liftoff the photo splits into descent and ascent stage. Leg compression and broken legs are not drawn yet (the photo is rigid).
- Guidance (`guidance.js`): flight director (keep the dot in the crosshair), advisories incl. "P66 cannot stop you — manual throttle", zoom levels (Z).

Simplifications and estimates still open: leg truss modelled as one vertical crush stroke per leg (crush load, break loads, ground stiffness are estimates); quad height, gimbal pivot and nozzle clearance are estimates; side-jet numbering is ours; TAUROD 1.5 s and ROD scale are pad-loaded values we have not found yet; Luminary's failure-reconfiguration jet logic is not modelled.

## Controls

- Four ways, like 1979: ←/→ tilt (hand controller), ↑/↓ descent rate clicks (P66) or throttle (manual). Physics is 3D, flying is in the vertical plane.
- Phone: one finger, slide sideways to tilt and up/down to click the descent rate.

## Look

- Myrsky's terrain, Sun, shadows and exposure (done).
- Photo cut-out lander (done). Next: draw leg compression and broken legs over the photo; descent stage damage.
- Camera option: view out the LM window in the style of the 16 mm Apollo film camera.
- Exhaust blowing dust sideways near the ground.

## Order

1. Physics and controls on flat ground with a placeholder box, until it's fun to fly.
2. Swap in the real terrain, Sun angle, shadows and camera look.
3. 3D lander, exhaust dust, landing and crash detection.
4. Mobile touch controls, then deploy.

Start around 500 m above Surveyor crater. Apollo's final approach began about 2 km up and 7 km out, but the 2 m height model only covers the area around the site.

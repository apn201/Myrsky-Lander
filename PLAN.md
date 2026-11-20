# Plan

## Physics (all real, all simple)

- Gravity at the Apollo 12 site: about 1.62 m/s². No air: no drag, dust flies on ballistic paths.
- Rocket equation: mass falls as fuel burns. LM descent engine: about 45 kN maximum thrust, throttle down to about 10 %, specific impulse about 311 s. Check every figure against the Apollo 12 Mission Report and LM documentation before using it.
- Attitude: RCS torque on a real moment of inertia. Optional assist mode holds the attitude you set.
- Touchdown: leg contact on the height map. Judge vertical and horizontal speed and tilt against LM landing limits.
- astropy does not run in the browser. Use it (and Astronomy Engine) in `tools/` to check constants and Sun/Earth positions; the game loop is plain JavaScript.

### Prototype status (20 Nov 2026)

Done: `web/js/game/physics.js`, checked by `node tools/test_physics.mjs` (gravity, hover, propellant flow from Isp, rotation, touchdown limits, a simple autopilot lands the default start with fuel to spare). Simplifications so far:
- throttle is continuous 10-100 % (the real engine throttled 10-60 % plus a fixed full-thrust setting)
- reaction-control propellant is not counted; moment of inertia does not change as fuel burns
- touchdown is judged at the first pad contact, then the lander settles; no rigid-body leg contact or tipping yet

## Controls

- Like 1979: throttle up/down, rotate left/right. Motion in a vertical plane first, rendered in full 3D.
- Keyboard: arrows or WASD. Phone: two thumb zones (throttle on one side, rotation on the other).

## Look

- Myrsky's terrain, Sun, shadows and exposure.
- Real 3D lander (NASA model in `data/models/`); Myrsky's photo cut-outs only work for a lander standing still.
- Camera option: view out the LM window in the style of the 16 mm Apollo film camera.
- Exhaust blowing dust sideways near the ground.

## Order

1. Physics and controls on flat ground with a placeholder box, until it's fun to fly.
2. Swap in the real terrain, Sun angle, shadows and camera look.
3. 3D lander, exhaust dust, landing and crash detection.
4. Mobile touch controls, then deploy.

Start around 500 m above Surveyor crater. Apollo's final approach began about 2 km up and 7 km out, but the 2 m height model only covers the area around the site.

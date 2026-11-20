// paste into the browser console on http://localhost:8137/?embed (dev server) to save a standard set of frames
window.oosViews = {
  flag: { t: '1969-11-19T12:45:00Z', cam: 1, yaw: 236, pitch: 3, fov: 50 },
  upsun: { t: '1969-11-19T12:45:00Z', cam: 1, yaw: 100, pitch: -2, fov: 60 },
  downsun: { t: '1969-11-19T12:45:00Z', cam: 1, yaw: 280, pitch: -2, fov: 60 },
  lm: { t: '1969-11-19T12:45:00Z', cam: 1, yaw: 207, pitch: 2, fov: 22 },
  surveyor67: { t: '1967-04-24T06:00:00Z', cam: 1, yaw: 137.5, pitch: -3, fov: 6 },
  cam2: { t: '1969-11-20T06:45:00Z', cam: 2, yaw: 311, pitch: 1, fov: 45 },
  night: { live: true, cam: 1, yaw: 197, pitch: 2, fov: 50 },
};
window.oosShoot = async (names) => {
  for (const n of names) {
    const v = oosViews[n]; const s = oosState;
    oosSetCam(v.cam, true); s.live = !!v.live; s.speed = 0; if (v.t) s.t = Date.parse(v.t);
    s.yaw = v.yaw; s.pitch = v.pitch; s.fov = v.fov;
    await new Promise((r) => setTimeout(r, 3500));
    await oosShot(n);
  }
  return 'done';
};

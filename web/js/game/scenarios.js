// Scenarios: the same landing with different things going wrong. Each sets up the start and lists
// events that fire during the descent (by height above the ground or by time).
// The failure modes are real kinds of trouble Apollo crews met or trained for; when a scenario is
// modelled on a real mission the text says so, otherwise it is a "what if".
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import { JETS } from './lm.js';
import { surface } from './guidance.js';

const log = (s, sev, text) => { s.events.push({ t: s.t, sev, text }); if (sev >= 1) s.alarmQuiet = false; };

// program alarms: bursts of 1202/1201, each one a short computer restart (guidance skipped,
// throttle held). Like Apollo 11, they come back every few seconds during the final descent.
function alarms(fromH, toH) {
  return {
    when: (s, g) => g.h < fromH && g.h > toH,
    every: (s) => 6 + 10 * s.rand(),
    do: (s) => {
      const code = s.rand() < 0.7 ? '1202' : '1201';
      s.alarm = { code, t: s.t, acked: false };
      s.restartUntil = s.t + 0.8 + s.rand() * 0.8;
      log(s, 1, `PROGRAM ALARM ${code} (executive overflow): computer restart`);
    },
  };
}

export const SCENARIOS = [
  {
    id: 'a12', title: 'Apollo 12: pinpoint landing',
    text: 'Pete Conrad set Intrepid down 163 m from Surveyor 3. Land on the green ring at Intrepid\'s spot.',
    events: [],
  },
  {
    id: 'a11', title: 'Apollo 11: alarms, boulders, low fuel',
    text: 'Like Eagle: 1202 and 1201 program alarms all the way down, the computer\'s target is in a boulder field, and propellant is short. Acknowledge the master alarm (A), fly past the rocks to clear ground.',
    setup(s, world) {
      s.dpsFuel = 470;
      // put the target where the rocks are
      for (let x = 60; x < 300; x += 2) if (world.maxRock && !surface(world, x, 0).ok) { s.target = x; break; }
    },
    events: [alarms(290, 25)],
  },
  {
    id: 'jet', title: 'Jet stuck on',
    text: 'What if: a reaction control jet fails on (Gemini 8 had one). The autopilot fights it and burns RCS propellant. Find the quad and isolate it with keys 1-4 (A-D).',
    events: [{
      when: (s, g) => g.h < 210, once: true,
      do: (s) => { s.fail.stuckJet = 6; log(s, 3, 'RCS JET 6 FAILED ON (quad B)'); },
    }],
  },
  {
    id: 'radar', title: 'Landing radar failure',
    text: 'What if: the landing radar drops out at 150 m (Apollo 14\'s came on late). The altimeter goes blank and the computer\'s idea of your descent rate drifts. Trust what you see out of the window: the ground and the shadow.',
    events: [{
      when: (s, g) => g.h < 150, once: true,
      do: (s) => { s.radarOut = true; log(s, 2, 'LANDING RADAR DATA LOST: altitude and rate from the computer\'s estimate'); },
    }],
  },
  {
    id: 'throttle', title: 'Throttle stuck',
    text: 'What if: the descent engine throttle sticks at 18 %, below hover. You can\'t hold height. Land as softly as you can, or ABORT STAGE (Enter) and fly the ascent stage away.',
    events: [{
      when: (s, g) => g.h < 130, once: true,
      do: (s) => { s.fail.throttleStuck = 0.18; log(s, 3, 'DESCENT ENGINE THROTTLE STUCK AT 18 %'); },
    }],
  },
  {
    id: 'dps', title: 'Engine failure: abort',
    text: 'What if: the descent engine quits at 160 m. Stage at once (Enter): the descent stage falls away and the ascent engine has to climb you out before you hit the ground.',
    events: [{
      when: (s, g) => g.h < 160, once: true,
      do: (s) => { s.dpsFailed = true; log(s, 4, 'DESCENT ENGINE FAILED'); },
    }],
  },
];

export function startScenario(sc, s, world) {
  let seed = [...sc.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647 || 1;
  s.rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  s.scenario = sc.id;
  sc.setup?.(s, world);
  return sc.events.map(e => ({ ...e, done: false, next: 0 }));
}

// call every frame
export function runEvents(evs, s, g) {
  for (const e of evs) {
    if (e.done || s.stage !== 'full' || s.phase !== 'flying') continue;
    if (!e.when(s, g)) continue;
    if (e.once) { e.done = true; e.do(s); continue; }
    if (s.t >= e.next) { e.do(s); e.next = s.t + e.every(s); }
  }
  s.restarting = s.restartUntil != null && s.t < s.restartUntil;
  if (s.radarOut) {
    // the computer's estimate drifts away from the truth: it thinks you are descending slower and
    // are higher than you are
    s.nav.vErr = Math.min(0.9, (s.nav.vErr || 0) + 0.02 / 60);
  }
}

export const quadOf = n => JETS[n - 1].quad;

// Every object, event and jump target on the page. Dates are UTC.
// Facts come from ocean-of-storms-objects.md (Apollo Lunar Surface Journal, Apollo 12 Mission Report,
// Preliminary Science Report SP-235, Press Kit, LROC). Positions: data/positions/positions.csv.
// Text drafted with an AI assistant (Claude Code, Anthropic) from those sourced notes, Nov 2026.

export const T = (s) => Date.parse(s);
// Where to check the facts. Every spec sheet, ticker line and story step links here.
const J = (ch) => 'https://apollojournals.org/alsj/a12/a12.' + ch + '.html';
export const SRC = {
  alsj: ['Apollo Lunar Surface Journal: Apollo 12', 'https://apollojournals.org/alsj/a12/a12.html'],
  eva1: ['Journal: EVA 1 begins', J('eva1prelim')], tv: ['Journal: TV troubles, flag, S-band dish', J('tvtrbls')],
  alsepoff: ['Journal: ALSEP off-load', J('alsepoff')], alsepdep: ['Journal: ALSEP deployment', J('alsepdep')],
  clsout1: ['Journal: EVA 1 close-out', J('clsout1')], eva2: ['Journal: EVA 2 preparations', J('eva2prep')],
  surveyor: ['Journal: at Surveyor 3', J('surveyor')], clsout2: ['Journal: EVA 2 close-out', J('clsout2')],
  launch: ['Journal: jettison, thruster test, liftoff', J('launch')],
  flag: ['Journal: the flag is still standing (LROC)', 'https://apollojournals.org/alsj/a12/a12FlagStillAloft.html'],
  nssdcLM: ['NSSDCA 1969-099C: Apollo 12 Lunar Module / ALSEP', 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-099C'],
  nssdcS3: ['NSSDCA 1967-035A: Surveyor 3', 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1967-035A'],
  nasaS3: ['NASA Science: Surveyor 3', 'https://science.nasa.gov/mission/surveyor-3/'],
  nasaA12: ['NASA: Apollo 12 mission page', 'https://www.nasa.gov/mission/apollo-12/'],
  pressKit: ['Apollo 12 Press Kit (1969)', 'https://apollojournals.org/alsj/a12/a12prskit.html'],
  missionRpt: ['Apollo 12 Mission Report (NTRS)', 'https://ntrs.nasa.gov/citations/19760072997'],
  psr: ['Apollo 12 Preliminary Science Report SP-235 (NTRS)', 'https://ntrs.nasa.gov/citations/19700025955'],
  alsepMan: ['ALSEP Flight System Familiarization Manual (1969)', 'https://apollojournals.org/alsj/ALSEPManual1969_FSFM_RevB.pdf'],
  s3Rpt: ['Surveyor III Mission Report, JPL TR 32-1177', 'https://apollojournals.org/alsj/a12/Surveyor-III-MIssionRpt1967028267.pdf'],
  fig36: ['Mission Report fig. 3-6: ALSEP layout', 'https://apollojournals.org/alsj/a12/a12mrf3-6.jpg'],
  lroc: ['LROC: Apollo 12 terrain model and orthophotos', 'https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO12'],
  lrocObj: ['LROC: coordinates of human-made objects', 'https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_ANTHROPOGENIC_OBJECTS'],
  eclipse: ['NASA lunar eclipse catalogue 1901-2000', 'https://eclipse.gsfc.nasa.gov/LEcat5/LE1901-2000.html'],
  images: ['Apollo 12 image library (all crew photos)', 'https://apollojournals.org/alsj/a12/images12.html'],
  p7100: ['Photo AS12-48-7100: Surveyor 3 and Intrepid (used for Surveyor)', 'https://apollojournals.org/alsj/a12/AS12-48-7100HR.jpg'],
  pPan: ['Panorama beside the TV camera (used for Intrepid)', 'https://apollojournals.org/alsj/a12/a12pan1183310HR.jpg'],
  p6988: ['Photo AS12-47-6988: lander foil, dish fabric', 'https://apollojournals.org/alsj/a12/AS12-47-6988HR.jpg'],
  p7317: ['Photo AS12-49-7317: Intrepid on the crater rim', 'https://apollojournals.org/alsj/a12/AS12-49-7317HR.jpg'],
  p6739: ['Photo AS12-46-6739: dish, looking into the Sun', 'https://apollojournals.org/alsj/a12/AS12-46-6739HR.jpg'],
  p6897: ['Photo AS12-47-6897: the flag', 'https://apollojournals.org/alsj/a12/AS12-47-6897HR.jpg'],
};

export const NOW = () => Date.now();

export const DATES = {
  surveyorLands: T('1967-04-20T00:04:53Z'),
  surveyorLastContact: T('1967-05-03T00:00:00Z'),
  launch: T('1969-11-14T16:22:00Z'),
  touchdown: T('1969-11-19T06:54:35Z'),
  firstStep: T('1969-11-19T11:44:24Z'),
  flagUp: T('1969-11-19T12:41:33Z'),
  alsepData: T('1969-11-19T14:21:41Z'),
  eva1End: T('1969-11-19T15:24:31Z'),
  eva2Start: T('1969-11-20T03:54:46Z'),
  atSurveyor: T('1969-11-20T06:20:28Z'),
  leaveSurveyor: T('1969-11-20T06:54:41Z'),
  eva2End: T('1969-11-20T07:41:45Z'),
  backpacks: T('1969-11-20T09:07:18Z'),
  dishFalls: T('1969-11-20T12:34:53Z'),
  liftoff: T('1969-11-20T14:25:47Z'),
  ascentCrash: T('1969-11-20T22:17:17Z'),
  alsepOff: T('1977-09-30T00:00:00Z'),
  rangeStart: T('1967-04-01T00:00:00Z'),
};

// positions in metres from the lander: east, north (LROC + McInall map + Mission Report fig 3-6)
export const POS = {
  lm: [0, 0], surveyor3: [118.1, -103.1], alsep_cs: [-87.8, 91.0], alsep_pse: [-85.2, 89.8],
  alsep_rtg: [-90.8, 92.6], alsep_sws: [-88.1, 86.3], alsep_lsm: [-80.0, 77.0], alsep_side: [-103.6, 81.4],
  pse_cover: [-82.3, 95.5], flag: [-4.2, 14.6], sband: [0.2, 8.5], tv_final: [8.6, 17.1], swc: [-8.4, 33.6],
  backpacks: [-3.2, 0.6],
};

export const CAMERAS = {
  1: { name: 'CAM 1', pos: [20, 40], h: 1.45, yaw: 212, pitch: -1, fov: 40,
       note: 'Stands 45 m north-north-east of the lander, looking back at it, the dish and the flag.' },
  2: { name: 'CAM 2', pos: [128.7, -112.3], h: 1.45, yaw: 311, pitch: 3, fov: 45, from: DATES.touchdown,
       note: 'On the inner slope of Surveyor crater, 14 m beyond Surveyor 3, looking back up at the lander on the rim.' },
};

// Spec sheets. Plain language for school-age readers. `src` names where the facts come from.
export const OBJECTS = [
  { id: 'surveyor3', links: ['surveyor', 'nssdcS3', 'nasaS3', 's3Rpt', 'p7100', 'lrocObj'], name: 'Surveyor 3', kind: 'REAL', from: DATES.surveyorLands, to: null,
    lines: [
      'A robot lander. It arrived on 20 April 1967, two and a half years before any people came.',
      'Its engines did not switch off at touchdown, so it bounced twice before it stopped.',
      'It took 6,315 pictures and dug in the soil with a little scoop to test whether the ground could hold a spacecraft.',
      'Last contact: 3 May 1967. Then the long lunar night froze it.',
      'In November 1969 two astronauts walked down the crater to visit it. They found its white paint turned light tan by dust.',
      'They cut off its TV camera and its scoop and took them home, so scientists could see what 31 months on the Moon does to metal, glass and paint.',
      'The camera is now in the Smithsonian National Air and Space Museum. Surveyor itself is still here, missing those pieces.',
    ],
    facts: [['Mass at landing', '296 kg'], ['Height', 'about 3 m'], ['Width across footpads', '4.3 m'], ['From the lander', '157 m, bearing 131, 10 m lower']],
    src: 'Apollo Lunar Surface Journal; Surveyor III Mission Report (JPL TR 32-1177); NSSDCA; LROC (Wagner et al. 2017)' },
  { id: 'lm', links: ['nssdcLM', 'pressKit', 'missionRpt', 'nasaA12', 'pPan', 'p7317', 'lrocObj'], name: 'Intrepid, the lunar module', kind: 'REAL', from: DATES.touchdown, to: null,
    lines: [
      'Pete Conrad and Alan Bean landed here on 19 November 1969, only about 160 m from Surveyor 3. It was the first pinpoint landing on the Moon.',
      'The Sun was just 5 degrees above the horizon, so every shadow was very long. Morning light was chosen on purpose: long shadows show the bumps in the ground.',
      'On 20 November the top half (the ascent stage) took off and the bottom half stayed behind as a launch pad.',
      'What you see now is the descent stage: legs, engine and gold-coloured foil. It has stood here ever since.',
    ],
    facts: [['Descent stage height', '3.23 m with legs'], ['Descent stage width', '4.29 m'], ['Across the landing legs', '9.45 m'], ['Time on the surface', '31 h 31 min']],
    src: 'Apollo 12 Press Kit p.58-59; Apollo 12 Mission Report; NSSDCA 1969-099C' },
  { id: 'flag', links: ['tv', 'flag', 'p6897'], name: 'US flag', kind: 'REAL', from: DATES.flagUp, to: null,
    lines: [
      'Put up during the first moonwalk, at 12:41 UTC on 19 November 1969.',
      'A latch on the top crossbar failed, so the cloth hangs with ripples and a drooping top edge.',
      'Orbiter photos from 2009-2011 show its shadow moving with the Sun, so it is still standing.',
      'Whether its colours have faded in 57 years of sunlight is not known. Here it keeps its colours.',
    ],
    facts: [['Cloth', 'nylon, 1.52 x 0.91 m'], ['Pole', 'aluminium tube, 2.5 cm']],
    src: 'Apollo Lunar Surface Journal (Flag still aloft); Lunar Flag Assembly history; LROC' },
  { id: 'sband', links: ['tv', 'launch', 'p6739', 'p6988'], name: 'S-band dish antenna', kind: 'REAL', from: T('1969-11-19T12:23:14Z'), to: null,
    lines: [
      'An umbrella-like dish, 3 m across, opened by Pete Conrad to send a stronger radio signal to Earth.',
      'It pointed at Earth, which hangs almost still in the sky here.',
      'About two hours before liftoff, a test firing of the thrusters blew it over. It has lain on the ground since.',
      'So here the flag stands and the antenna has fallen. Most people guess the opposite.',
    ],
    facts: [['Dish', '3 m'], ['Fell over', '20 Nov 1969, 12:34 UTC']],
    src: 'Apollo Lunar Surface Journal; IEEE Spectrum; Smithsonian' },
  { id: 'alsep', links: ['alsepoff', 'alsepdep', 'psr', 'fig36', 'nssdcLM', 'alsepMan'], name: 'ALSEP science station', kind: 'REAL', from: T('1969-11-19T13:34:29Z'), to: null,
    lines: [
      'The Apollo Lunar Surface Experiments Package: instruments left behind to keep doing science after the crew went home.',
      'A seismometer listened for moonquakes and impacts. A magnetometer measured the Moon\'s magnetic field. Other instruments caught the solar wind and the very thin gas above the surface.',
      'It sat 126 m north-west of the lander and sent data to Earth for almost eight years.',
      'Its seismometer even felt the crew\'s two backpacks land when they were thrown out of the lunar module.',
      'Switched off from Earth on 30 September 1977.',
    ],
    facts: [['First data', '19 Nov 1969, 14:21 UTC'], ['Switched off', '30 Sep 1977'], ['Weight', '250 lb on Earth, about 40 lb on the Moon']],
    src: 'Apollo 12 Preliminary Science Report SP-235; Mission Report fig 3-6; NSSDCA 1969-099C; LROC' },
  { id: 'rtg', links: ['alsepoff', 'alsepMan', 'pressKit'], name: 'SNAP-27 generator', kind: 'REAL', from: T('1969-11-19T13:34:29Z'), to: null,
    lines: [
      'A nuclear battery. 3.8 kg of plutonium-238 gave off about 1,250 W of heat, turned into 70-75 W of electricity for the science station.',
      'It works in the dark, which matters: a night here lasts about two weeks.',
      'Plutonium-238 loses half its heat every 87.7 years. The readout below is that physics, not a measurement.',
    ],
    facts: [['Height', '46 cm'], ['Heat at start', 'about 1,250 W']],
    src: 'Apollo 12 Press Kit; ALSEP Familiarization Manual table 2-2; Mission Report' , readout: 'rtg' },
  { id: 'swc', links: ['tv', 'clsout2', 'psr'], name: 'Solar wind collector', kind: 'REAL', from: T('1969-11-19T12:35:19Z'), to: T('1969-11-20T07:18:20Z'),
    lines: [
      'A sheet of aluminium foil on a pole, facing the Sun, to catch particles of the solar wind.',
      'After about 19 hours the crew rolled up the foil and took it home for analysis.',
    ],
    facts: [['Foil', '30 x 130 cm exposed']], src: 'Preliminary Science Report ch. 8; Apollo Lunar Surface Journal' },
  { id: 'backpacks', links: ['launch', 'clsout2'], name: 'Two backpacks and rubbish', kind: 'REAL', from: DATES.backpacks, to: null,
    lines: [
      'Before liftoff the crew threw out their life-support backpacks, rubbish bags and a scale to save weight.',
      'The seismometer 126 m away recorded both backpacks hitting the ground.',
      'Somewhere nearby also lie a roll of colour film that was never developed, a broken camera and a map.',
    ],
    facts: [['Thrown out', '20 Nov 1969, 09:07 UTC']], src: 'Apollo Lunar Surface Journal (launch chapter)' },
  { id: 'cam1', name: 'CAM 1', kind: 'INVENTED', from: null, to: null, links: ['tv', 'images'],
    lines: ['This camera does not exist. Nobody left a webcam on the Moon.', 'It stands 45 m north-north-east of the lander. Between it and the lander is the spot where the real Apollo 12 TV camera was left after it burned out by pointing at the Sun. That camera went home.'],
    facts: [], src: 'invented. See info page.' },
  { id: 'cam2', name: 'CAM 2', kind: 'INVENTED', from: DATES.touchdown, to: null, links: ['p7100', 'surveyor'],
    lines: ['This camera does not exist either.', 'It stands in Surveyor crater so you can see Surveyor 3 with the lander on the rim behind it, like in the crew\'s own photos.'],
    facts: [], src: 'invented. See info page.' },
];

// One list drives the jump links, the info page links and the ticker. Times are UTC.
export const JUMPS = [
  { id: 'surveyor', label: '1967: Surveyor 3 alone', t: T('1967-04-24T06:00:00Z'), cam: 1, yaw: 145.6, pitch: -3.3, fov: 6 },
  { id: 'eclipse', label: '1967: Earth eclipses the Sun', t: T('1967-04-24T12:06:26Z'), cam: 1, aimEarth: true, fov: 7 },
  { id: 'touchdown', label: '1969: Apollo 12 lands', t: DATES.touchdown + 30e3, cam: 1, yaw: 210, pitch: 0, fov: 36 },
  { id: 'flag', label: 'Flag up', t: DATES.flagUp + 60e3, cam: 1, yaw: 216, pitch: 0, fov: 30 },
  { id: 'alsep', label: 'Science station on', t: DATES.alsepData, cam: 1, yaw: 295.3, pitch: -0.8, fov: 7 },
  { id: 'visit', label: 'Crew visits Surveyor', t: DATES.atSurveyor + 25 * 60e3, cam: 2, yaw: 311, pitch: 2, fov: 40 },
  { id: 'liftoff', label: 'Liftoff', t: DATES.liftoff + 120e3, cam: 1, yaw: 210, pitch: 3, fov: 38 },
  { id: 'earth', label: 'Earth in the sky', t: T('1969-11-19T12:00:00Z'), cam: 1, aimEarth: true, fov: 8 },
  { id: 'off', label: '1977: switched off', t: DATES.alsepOff + 3600e3, cam: 1, yaw: 295.3, pitch: -0.8, fov: 10 },
  { id: 'live', label: 'LIVE', t: null, cam: 1 },
];

// "Did you know" ticker: shown while the date is inside [from, to).
export const TICKER = [
  { from: DATES.rangeStart, to: DATES.surveyorLands, text: 'Nothing made by people has touched this part of the Moon yet. Surveyor 3 is on its way.' , src: 'nssdcS3' },
  { from: DATES.surveyorLands, to: DATES.surveyorLands + 86400e3, text: '20 Apr 1967 00:04 UTC - Surveyor 3 lands. Its engines keep firing, so it bounces twice.' , src: 'nssdcS3' },
  { from: T('1967-04-24T10:00:00Z'), to: T('1967-04-24T14:10:00Z'), text: "24 Apr 1967 - From the Moon, Earth passes in front of the Sun: a lunar eclipse seen from the other side. Sunlight bent through Earth's air makes a red ring. Surveyor 3 photographed it." , src: 'eclipse' },
  { from: DATES.surveyorLands + 86400e3, to: DATES.surveyorLastContact, text: 'Surveyor 3 is taking pictures and digging trenches with its scoop. 6,315 pictures in two weeks.' , src: 's3Rpt' },
  { from: DATES.surveyorLastContact, to: DATES.launch, text: 'Surveyor 3 is silent. It waits on the crater slope for two and a half years.' , src: 'nasaS3' },
  { from: DATES.launch, to: DATES.touchdown, text: 'Apollo 12 is on its way. Lightning hit the rocket twice during launch, 36 and 52 seconds after liftoff.' , src: 'missionRpt' },
  { from: DATES.touchdown, to: DATES.firstStep, text: '06:54 UTC - Intrepid has landed, about 160 m from Surveyor 3. The Sun is only 5 degrees up.' , src: 'eva1' },
  { from: DATES.firstStep, to: T('1969-11-19T12:21:00Z'), text: 'First moonwalk. Crew not shown: objects appear at the moment the crew set them up.' , src: 'eva1' },
  { from: T('1969-11-19T12:20:41Z'), to: DATES.flagUp, text: '12:20 UTC - The TV camera is pointed at the Sun by mistake and burns out. Viewers on Earth see nothing more. (It was left between CAM 1 and the lander.)' , src: 'tv' },
  { from: DATES.flagUp, to: T('1969-11-19T13:34:00Z'), text: '12:41 UTC - Flag up. The crossbar latch failed, so it hangs with ripples.' , src: 'tv' },
  { from: T('1969-11-19T13:34:00Z'), to: DATES.eva1End, text: 'The science station is being set up 126 m to the north-west. 14:21 UTC: "We\'re getting data back."' , src: 'alsepdep' },
  { from: DATES.eva1End, to: DATES.eva2Start, text: 'The crew rests inside Intrepid. The seismometer listens.' , src: 'clsout1' },
  { from: DATES.eva2Start, to: DATES.atSurveyor, text: 'Second moonwalk. The crew walks a loop past Head, Sharp and Halo craters toward Surveyor 3.' , src: 'eva2' },
  { from: DATES.atSurveyor, to: DATES.leaveSurveyor, text: 'The crew is at Surveyor 3. Watch CAM 2: its TV camera and scoop disappear as they are cut off.' , src: 'surveyor' },
  { from: DATES.leaveSurveyor, to: DATES.backpacks, text: 'Back at the lander. A roll of colour film is left behind by mistake. It was never developed.' , src: 'clsout2' },
  { from: DATES.backpacks, to: DATES.dishFalls, text: '09:07 UTC - Backpacks thrown out. The seismometer records both of them landing.' , src: 'launch' },
  { from: DATES.dishFalls, to: DATES.liftoff, text: '12:34 UTC - A thruster test blows the dish antenna over.' , src: 'launch' },
  { from: DATES.liftoff, to: DATES.ascentCrash, text: '14:25 UTC - Liftoff. The bottom half of Intrepid stays as a launch pad.' , src: 'launch' },
  { from: DATES.ascentCrash, to: DATES.ascentCrash + 7200e3, text: 'The empty ascent stage is crashed on purpose 73 km away. The seismometer rings for about an hour.' , src: 'psr' },
  { from: DATES.ascentCrash + 7200e3, to: DATES.alsepOff, text: 'The science station sends data to Earth every day, through two-week days and two-week nights.' , src: 'psr' },
  { from: DATES.alsepOff, to: DATES.alsepOff + 86400e3 * 3, text: '30 Sep 1977 - The science station is switched off from Earth.' , src: 'nssdcLM' },
  { from: DATES.alsepOff + 86400e3 * 3, to: T('2009-06-18T00:00:00Z'), text: 'Silence. Nothing changes here except the light.' , src: 'alsj' },
  { from: T('2009-06-18T00:00:00Z'), to: Infinity, text: 'NASA\'s Lunar Reconnaissance Orbiter photographs this site from orbit. Footpaths and the flag\'s shadow are still visible. The ground on this page comes from those photos.' , src: 'lroc' },
];

// Fixed facts shown by the generator readout
export const PU238_HALF_LIFE_Y = 87.7;
export const RTG_HEAT0_W = 1250;

// "Tell me the story": a guided tour. Each step sets a date and a view, then lets time run at `speed`.
export const TOUR = [
  { live: true, cam: 1, yaw: 212, pitch: -1, fov: 40, dur: 8,
    text: 'This is a webcam on the Moon. It is night here right now. The blue-grey light is sunlight bounced off Earth.' , src: 'lroc' },
  { live: true, cam: 1, aimEarth: true, fov: 14, dur: 6,
    text: 'There is Earth, high in the sky. From here it never rises or sets.' , src: 'alsj' },
  { rew: true, t: Date.parse('1967-04-24T06:00:00Z'), cam: 1, yaw: 145.6, pitch: -3.3, fov: 6, dur: 9, label: 'REWIND 59 YEARS',
    text: 'April 1967. Nobody has ever been here. A robot called Surveyor 3 has just landed in this crater. It digs the soil and takes 6,315 pictures.' , src: 'nssdcS3' },
  { t: Date.parse('1969-11-19T06:54:31Z'), cam: 1, yaw: 210, pitch: 0, fov: 36, speed: 1, dur: 9, label: '19 NOVEMBER 1969',
    text: 'Two and a half years later. Apollo 12 lands, only 160 m from Surveyor. The Sun is just 5 degrees up, so every shadow is long.' , src: 'eva1' },
  { t: Date.parse('1969-11-19T12:41:20Z'), cam: 1, yaw: 216, pitch: 0, fov: 32, speed: 20, dur: 8,
    text: 'Pete Conrad and Alan Bean put up the flag and a dish antenna that points at Earth. (We do not show the astronauts: things appear when they set them up.)' , src: 'tv' },
  { t: Date.parse('1969-11-19T13:33:40Z'), cam: 1, yaw: 295.3, pitch: -0.8, fov: 7, speed: 120, dur: 9,
    text: '126 m away they set up a science station. A seismometer will listen for moonquakes. A small nuclear generator will keep it running through the two-week nights.' , src: 'alsepdep' },
  { t: Date.parse('1969-11-20T06:47:40Z'), cam: 2, yaw: 311, pitch: -6, fov: 26, speed: 15, dur: 9, label: '20 NOVEMBER 1969 - CAM 2',
    text: 'Next day they walk down to Surveyor 3. Watch closely: they cut off its TV camera and its scoop, to find out what 31 months on the Moon did to them.' , src: 'surveyor' },
  { t: Date.parse('1969-11-20T14:25:30Z'), cam: 1, yaw: 210, pitch: 3, fov: 38, speed: 2, dur: 8,
    text: 'Liftoff. The top half of the lunar module flies back to orbit. The bottom half stays behind as a launch pad. The dish was blown over by a thruster test.' , src: 'launch' },
  { t: Date.parse('1977-09-30T12:00:00Z'), cam: 1, yaw: 295.3, pitch: -0.8, fov: 7, dur: 7, label: '30 SEPTEMBER 1977',
    text: 'For almost eight years the science station sends data to Earth. Then it is switched off.' , src: 'nssdcLM' },
  { ff: true, live: true, cam: 1, yaw: 212, pitch: -1, fov: 40, dur: 10, label: 'BACK TO LIVE',
    text: 'Today. Everything is still here, abandoned but not forgotten. Except one thing. There is no camera. (Read "info" to find out how this picture is made.)' , src: 'images' },
];

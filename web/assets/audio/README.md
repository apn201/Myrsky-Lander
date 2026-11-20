# Apollo 11 landing audio

`a11_landing.wav`: NASA recording of the Apollo 11 final descent and landing, 113.9 s, 8-bit mono 11025 Hz,
from the NASA Kennedy Space Center history site (science.ksc.nasa.gov/history/apollo/apollo-11/sounds/a11lndng.wav),
retrieved 20 Nov 2026 from the Internet Archive Wayback Machine copy of 9 Mar 2021, SHA-256
7cdbcf542b94f190a77c0f92c39a9ec6c749b147d1121d3075c6b60fb85b55a0. NASA audio, not copyrighted in the US.

The game plays short segments of it (offsets in `web/js/game/sound.js`). Segment boundaries were found with a
local speech recognizer (faster-whisper base.en) and checked against the words; who speaks follows the NASA
air-to-ground transcript.

Other downloads kept for reference in `art/audio-src/` (not used in the game): NASA Historical Sounds
`569462main_eagle_has_landed.mp3` and `590333main_ringtone_eagleHasLanded_extended.mp3`, and `a11beep.wav`
from the same KSC page (a 171 Hz tone, not a quindar tone).

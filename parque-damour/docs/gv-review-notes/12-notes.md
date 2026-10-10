# Gnome Village review — section 12: Audio, cue rate limiting, birdsong (lines 6050–6329)

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 6050–6329 (280 lines). Peeks outside the range are marked "(outside)".

---

## 1. Purpose

This block is the game's entire sound engine. There are no audio files: every sound is a procedurally scheduled sine oscillator (`tone`) with an exponential envelope, optional pitch glide and optional LFO wobble, sent through a shared master chain (low-pass → high-shelf → compressor) and a shared synthetic convolution reverb. The design brief is stated in the header comment (6050–6054): "Nothing here is noise... never a hiss or a rush."

Four sub-systems:

1. **Audio graph + primitives** (6055–6120): `initAudio`, `makeIR`, `panOf`, `audibleGain`, `tone`, `gtone`.
2. **Cue rate limiting** (6121–6137): `AGAP` + `aOK(kind, baseGapMs, soft)` — each kind of cue keeps a minimum real-time gap that widens with the sim speed dial so 20x does not become a rattle.
3. **Named sound effects** (6138–6207): 27 `sfx*` cue functions, each a tiny 1–12 note composition, called from the simulation elsewhere in the file.
4. **Birdsong + ambience scheduler** (6208–6329): six procedural bird "voices", a tree picker, crickets, stream burbles, rain plips, fire pops, owl and dove, all driven from `updateAudio(dt)` on real frame time.

The audio is deliberately decoupled from the simulation: it reads sim state but writes none of it (the one visual side effect, `landBird`, is on the visual RNG stream, see §9), so the sim stays deterministic whether sound is on or off.

---

## 2. Global / state variables defined or mutated here

| Name | Type / shape | Line | Notes |
|---|---|---|---|
| `AC` | `AudioContext \| null` | 6055 | Created lazily in `initAudio`. |
| `master` | `GainNode \| null` | 6055 | Master bus, gain 0.84. |
| `verb` | `ConvolverNode \| null` | 6055 | Shared reverb. |
| `verbGain` | `GainNode \| null` | 6055 | Reverb return level 0.36. |
| `audioOn` | `boolean` | 6055 | True once the graph is built (6071). |
| `muted` | `boolean` | 6055 | Toggled by `#bMute` click (outside, 12163). Soft gate only: `tone`/`aOK`/`updateAudio` early-return. Not persisted. |
| `AGAP` | `{ [kind:string]: number }` | 6130 | Last fire time (ms, from `now`) per cue kind. Written only in `aOK` (6136). |
| `VOICES` | `Array<(pan:number, vol:number)=>number>` | 6220 | Six bird phrase generators; each returns phrase length in seconds. |
| `birdT` | `number` (s) | 6281 | Countdown to next birdsong. |
| `ambT` | `number` (s) | 6281 | Countdown to next owl/dove. |
| `cricketT` | `number` (s) | 6281 | Countdown to next cricket burst. |
| `streamAcc` | `number` | 6281 | Fractional accumulator for burbles. |
| `rainAcc` | `number` | 6281 | Fractional accumulator for plips. |
| `fireAcc` | `number` (s) | 6281 | Timer for fire pops (every 0.3 s). |
| `waterScanT` | `number` (s) | 6281 | Timer for `scanWater` (every 0.6 s). |
| `visibleFlow` | `number` | 6281 | Sum of audibility weights of on-screen running water tiles. |
| `flowSpots` | `Array<[x,y,a]>` (≤40) | 6281 | Candidate burble positions, tile coords + audibility. |

External state **read** (not written) by this section: `T.speed`, `T.f`, `T.light`, `T.season` (defined 814, outside); `W.rain`, `W.snow` (845); `cam.z` (6333); `cw`, `chh`, `now` (6331, `now=ts` set at 12073); `trees`, `birds`, `builds` (1690); `FLOW`, `WD`, `DAM` (616/614/629); `FLOW_STREAM=0.5` (1349); `N=72` (568), `S=2` (567); `SEAS` (571); `vrng/vrnd/vrint/vchance` (594–598); `screenOf` (6384); `villagePos` (2493); `landBird` (2293); `clamp/clamp01` (578–579).

Note `gtone` (6116) mutates the caller's options object (`o.pan`, `o.gain`). All callers pass fresh literals so this is safe, but a shared options constant would be corrupted.

---

## 3. Functions (every one in range)

### Audio graph + primitives

**`initAudio()`** — 6056–6072. No args. Idempotent (`if(AC) return`). Picks `AudioContext||webkitAudioContext` (6058), bails silently if absent or constructor throws (6059–6060). Builds:
- `master` gain 0.84 (6061)
- `lp` lowpass 2100 Hz, Q 0.3 (6062)
- `hs` highshelf 1100 Hz, −6 dB (6063)
- `cp` compressor threshold −24 dB, knee 28, ratio 3.0, attack 0.03 s, release 0.45 s (6064–6065)
- chain `master → lp → hs → cp → destination` (6066)
- `verb` convolver with `makeIR(2.2, 2.8)` (6067); `verbGain` 0.36 (6068); `vlp` lowpass 1600 Hz Q 0.2 (6069); `verb → vlp → verbGain → master` (6070)
- sets `audioOn=true` (6071).
Callers (outside): Begin button (12217), each sound-check button (10788). Both also `AC.resume()` if suspended.

**`makeIR(sec, decay)`** — 6073–6080. Builds a 2-channel noise impulse response of `sampleRate*sec` samples. Per sample: white noise × `(1−t)^decay`, through a one-pole lowpass `lp = lp*0.74 + w*0.26`, scaled 0.9 (6077). Called once from `initAudio`.

**`panOf(x, y)`** — 6081–6084. World tile → stereo pan. `screenOf(x, y??0, SEAS)` then `clamp((p.x − cw/2)/(cw*0.55), −1, 1)`. Full pan is reached ~5% beyond the screen edge. The `y===undefined?0:y` guard (6082) is never exercised; every caller passes y. Also used outside at 11584 (`sfxBurner`).

**`audibleGain(x, y)`** — 6085–6089. Distance-from-view-centre attenuation, 0..1: `dx=|p.x−cw/2|/(cw*0.85)`, `dy=|p.y−chh/2|/(chh*0.85)`, `1 − max(dx,dy)` clamped. At the screen edge gain ≈ 0.41; reaches 0 at 0.85 screen-widths from centre (0.35 widths past the edge). Square (Chebyshev) falloff, not circular. Used by `gtone`, several `sfx*`, `singFrom`, `aTreeNearView` (indirectly), `scanWater`, `firePop`, and outside at 11584.

**`tone(freq, dur, o)`** — 6090–6114. The single synth voice. Options object `o`:
- `delay` (s, default 0) — scheduled from `AC.currentTime` (6093)
- `type` oscillator type, default `'sine'` (6094)
- `to` glide target Hz (min 30), exponential ramp ending at `t + dur*(o.toAt||0.92)` (6096)
- `gain` peak, default 0.08, floor 0.0008 (6098)
- `att` attack seconds, default 0.045 (6100)
- `hold` seconds of sustain before release (6101) — **never used by any caller in the file** (grep `hold:` finds nothing); dead option
- envelope: 0.0001 → gain (exp) over `att`, → 0.0001 (exp) at `dur` (6099–6102)
- `pan` −1..1 via `StereoPannerNode` when available (6104–6106); falls back to direct connect
- `dry` — if true, skip the reverb send (6105–6106)
- `wob` LFO Hz, `wobd` LFO depth as a fraction of `freq` (default 0.05) modulating `osc.frequency` (6107–6111)
- oscillator stopped at `t+dur+0.05` (6113)
Early-return when `!audioOn||muted||!AC` (6092). Every call allocates 2–5 nodes (osc, gain, panner, optional LFO osc + LFO gain); nothing is pooled. Outside callers: 11585 (`sfxBurner`).

**`gtone(g, freq, dur, o)`** — 6115–6120. Positional wrapper for a gnome/critter/anything with `.x/.y`: sets `o.pan=panOf`, bails if `audibleGain ≤ 0.02`, multiplies `o.gain` (default 0.08) by audibility, then `tone`. Used by all gnome-voiced `sfx*`.

### Cue rate limiting (v9.11 comment 6121–6129)

**`aOK(k, base, soft)`** — 6131–6137. Returns `true` and stamps `AGAP[k]=now` if at least `gap` ms have elapsed since the last cue of kind `k`; otherwise `false`. Also `false` when `!audioOn||muted` (6132).
- `sp = clamp(T.speed||1, 1, 20)` (6133) — speed 0 (paused) is treated as 1.
- hard scaling: `sc = sp` → at 20x gap is 20× the base ("one chop of the twenty").
- soft scaling (`soft` truthy): `sc = 1 + (sp−1)*0.45` → at 20x gap is 9.55× base. Used for "voice-like" cues (moan, yell, panic, help, comfort, fall, crash, rumble, built, baby, tune, leave).
- `gap = base*sc`; `now` is the rAF timestamp in ms (12073 outside), so `base` is **milliseconds**.
- First cue of any kind always passes (`AGAP[k]||-1e9`).

### Sound effects (callers are outside the range; line numbers from grep)

All `g`-taking cues use `gtone` (pan + distance attenuation). Gains are tiny by design (0.014–0.060). `→` = glide target. Times in seconds.

| Function | Line | Gap (ms) | Soft? | Notes / callers |
|---|---|---|---|---|
| `sfxChop(g)` | 6139 | 90 | no | 138→104 Hz 0.30 s g.050; 92 Hz 0.42 s g.036 delay .02. Caller 5121 (felling). |
| `sfxKnock(g)` | 6140 | 90 | no | 176→140 .26 g.038; 262 .18 g.016. Callers 4167, 5090, 5136. |
| `sfxTap(g)` | 6141 | 90 | no | 262→220 .22 g.026; 196 .28 g.020 d.03. Callers 2092, 5175, 5184, 5440. |
| `sfxDrop(g)` | 6142 | 120 | no | 118→92 .30 g.032. Callers 4154, 4581, 4988, 5442, 5459, 5462. |
| `sfxEat(g)` | 6143 | 220 | no | 208→156 .26 g.032. Caller 4583. |
| `sfxMoan(g)` | 6144 | 500 | yes | 224→158 .90 g.052 att.10 wob 4.4/0.035. Callers 4648, 4651. |
| `sfxHup(g)` | 6145 | 250 | no | 262→349 .30 g.040 (a lift). Callers 1628, 4674, 5035, 5214, 5286, 5419. |
| `sfxSplash(g)` | 6146 | 150 | no | 392→262 .26 g.026; 294→196 .34 g.020 d.05. 14 callers incl. 1653, 2218, 3535, 4479…11744. |
| `sfxYell(g)` | 6147–6150 | 420 | yes | 294→392 .18 g.048; 392→294 .40 g.044 d.14 wob 6. Callers 4654, 4673, 5235. |
| `sfxPanic(g)` | 6152–6155 | 500 | yes | "oh-oh": 330→392 .22; 392→466 .32 d.25 wob 5. Callers 4664, 5337. |
| `sfxHelp(g)` | 6157–6161 | 600 | yes | three falling notes 440→415, 392→370 d.30, 349→311 .55 d.56 wob 5.5. Caller 5369. |
| `sfxCreak(x,y)` | 6162 | 450 | no | coords not gnome; bails a<0.05; 118→72 .7 g.024·a att.12 wob 7; 86→60 .5 d.35. Caller 1123 (ice melting). |
| `sfxGiggle(g)` | 6163 | 450 | no | 523→659 .10; 622→784 .12 d.12; 587→740 .14 d.25. 9 callers (5029…5314). |
| `sfxSnicker(g)` | 6164 | 600 | no | v9.19 fox: 466→415, 415→370 d.11, 370→330 d.22, 523→587 d.36. Callers 2218, 2220. |
| `sfxMurmur(g)` | 6165 | 700 | no | base 180+vrng·40 Hz, 4 notes ×[1,1.12,0.94,1.06] .42 s each d i·.38 wob 4. Callers 5029, 5059, 5254, 5488. |
| `sfxComfort(g)` | 6166 | 600 | yes | 262→294 .34; 330 .55 d.30. Caller 5388. |
| `sfxFall(t)` | 6167–6172 | 450 | yes | tree falls: bails a<0.03; 196→82 1.30 g.038·a; thump 65 Hz .70 g.058·a d.95. Caller 5123. |
| `sfxThud(b)` | 6173–6176 | 300 | no | 62→44 .55 g.060·a. **No sim caller** — only the sound check (10780). Dead in-game. |
| `sfxCrash(x,y)` | 6178–6182 | 500 | yes | spate takes a bridge: 110→58 1.1 wob 6; 52 Hz .8 d.6. Callers 3540, 3573. |
| `sfxRumble()` | 6184–6187 | 2500 | yes | v9.15 thunder, **unpositioned**: 46→27 2.8 s g.040 att.55 wob 3.5; 34 Hz 2.2 d.45. Caller 8838 (`W.rumble` countdown after flash). |
| `sfxBuilt(b)` | 6188–6191 | 500 | yes | chord 349/392/523, .95 s each, d i·.20; `a=max(0.4, audible)` so always ≥40 %. Callers 3688, 11369. |
| `sfxYip(c)` | 6192 | 900 | no | v9.17 dog: bails a<.05; 640→920 .09; 720→1000 .08 d.14. Callers 1874, 1883. |
| `sfxBaby()` | 6193 | 900 | yes | **unpositioned** 392/523/587 1.10 s d i·.22. Caller 5525. |
| `sfxTune(b)` | 6195–6196 | 9000 | yes | v9.17 music box: 12-note pentatonic phrase [523,659,784,880,784,659,587,523,587,659,784,1047], .9 s, att .008 (bell), d i·.26, g .016·a; `b` optional (pan 0, a=1). Callers 4999, 5008, 5029, 11541; exported 12234. |
| `sfxLeave()` | 6197 | 900 | yes | **unpositioned** 294, 247 1.10 s d i·.30. Callers 5504, 5511. |
| `sfxOwl(x,y)` | 6198–6202 | — | — | **no `aOK`, no `audibleGain`**: 262→233 .70 g.026 att.14; 233 .85 d.55 att.16. Caller: `updateAudio` 6325 only. |
| `sfxDove(x,y)` | 6203–6207 | — | — | **no `aOK`, no `audibleGain`**: 330→294 .45 g.020; 294 .75 d.34 wob 3.4. Caller: `updateAudio` 6326 only. |

### Birdsong (header 6208–6211)

**`noteRun(notes, pan, vol)`** — 6212–6219. Sequentially schedules a phrase. Each note `{f, d, g?, a?, to?, w?, wd?, gap?}`: gain `vol*(g||1)`, attack `a||0.028`, glide `to||f*1.02` with `toAt 0.85`, LFO `w/wd`, inter-note gap `gap ?? 0.07`. Returns total phrase length in seconds.

**`VOICES[0] robin(pan,vol)`** — 6221–6225. Base 700–880 Hz, 3–5 notes alternating up/down (down = ×0.84), each ×(1+0..0.05) jitter, d 0.13–0.19, glide ±6 %, gap 0.06–0.11.
**`VOICES[1] warbler`** — 6226–6230. Base 880–1120 Hz, 5–8 notes on a sine arch (+18 % at the middle), d 0.07, glide ×0.97, gap 0.035, att 0.018; vol ×0.85.
**`VOICES[2] thrush`** — 6231–6235. "tu-wee" base 500–620 Hz, 2–3 reps: b .11 →×1.03 gap .03, then b×1.42 .20 →×1.60 gap .28 att .035.
**`VOICES[3] chiffchaff`** — 6236–6240. hi 800–890 Hz, lo = hi×0.86, 4–6 alternating notes d .10 glide ×0.98 gap .09; vol ×0.9.
**`VOICES[4] blackbird`** — 6241–6245. Base 460–600 Hz, 3–4 notes over ratios [1,1.25,1.12,1.5] with 3 % jitter, d 0.22–0.32, glide ×1.08 or ×0.93 (50/50), gap .10, att .05, LFO 5.5 Hz depth 0.012; vol ×1.05 ("the soothing one").
**`VOICES[5] wren`** — 6246–6250. Base 760–920 Hz, 6–9 notes descending (1.22 → 0.90) with alternate +6 %, d 0.06–0.08, glide ×0.95, gap .03, att .016; vol ×0.8.

**`singFrom(x, y, far)`** — 6251–6257. Picks a random voice and sings from a tile. If `!far` and `audibleGain<0.05` → returns 0. Pan ×0.7 when far. Volume: far → 0.011; near → `0.024*(0.55+0.45*a)`. Returns phrase length.

**`aTreeNearView()`** — 6258–6269. Samples 24 random trees (not exhaustive), scores each by normalised screen distance from centre + 0..0.25 jitter, −0.18 if a perched (non-flying) bird is already on it (favouring continuity), returns the best or `null` if no trees.

**`sfxCricket(x, y)`** — 6270–6273. 6–11 chirps at 1180–1340 Hz, 0.045 s, gain 0.0055, att .012, spaced 0.085 s, `dry` (no reverb). No distance attenuation (positioned near the village by the caller).

**`burble(x, y, strength)`** — 6274–6277. One water bubble: f 150–380 Hz, d 0.12–0.22, gain 0.0042×strength, glide to f×(0.72..0.92) at toAt 0.9.

**`plip()`** — 6278. Rain drop: f 420–840 Hz, 0.07 s, gain 0.0032, random pan ±0.8, glide ×0.8.

**`firePop(b)`** — 6279. Bails a<0.05; f 88–148 Hz, 0.10 s, gain 0.012·a, glide ×0.7.

**`scanWater()`** — 6282–6290. Every 0.6 s (from `updateAudio`). Walks the whole interior grid (x,y in 1..N−2, 70×70=4900 tiles). Keeps a tile if `FLOW[i] ≥ FLOW_STREAM*1.4 (=0.7)` OR it is a dam tile holding `WD>0.05` of water; then requires `audibleGain ≥ 0.05`. Accumulates `visibleFlow += a`, pushes up to 40 `[x,y,a]` into `flowSpots`.

**`updateAudio(dt)`** — 6292–6329. The ambience scheduler, called once per frame with **real** seconds (`dtr`, capped 0.05) from the main loop at 12088 (outside) when `T.speed>0||ns>0`. Bails if `!audioOn||muted`. Details in §4.

---

## 4. Concrete rules and tuning numbers

### Mix bus
- Master 0.84; mix low-passed at 2100 Hz (Q 0.3) and shelved −6 dB above 1100 Hz; compressor −24 dB / knee 28 / 3:1 / 30 ms / 450 ms (6061–6066).
- Reverb: 2.2 s noise IR with (1−t)^2.8 decay, one-pole smoothed; return 0.36, low-passed at 1600 Hz (6067–6070).
- Per-note gains 0.003–0.06 (default 0.08 in `tone` is never reached by in-game cues).

### Spatialisation
- Pan: linear in screen x, full at 0.55×cw from centre (6083).
- Distance: 1 − max(|dx|/0.85cw, |dy|/0.85chh); audible threshold varies per cue (0.02 in `gtone`, 0.03 fall/thud/crash, 0.04 burner (outside), 0.05 creak/yip/tune/birds/fire/water).
- `sfxBuilt` floor 0.4 (6189); `sfxRumble`, `sfxBaby`, `sfxLeave`, `sfxTune(no b)` are unpositioned.

### Rate limiting (`aOK`)
- Base gaps (ms): chop/knock/tap 90; drop 120; splash 150; eat 220; hup 250; thud 300; yell 420; creak/giggle/fall 450; moan/panic/crash/built 500; help/snicker/comfort 600; murmur 700; yip/baby/leave 900; burner 1800 (outside); rumble 2500; tune 9000.
- Hard scale × speed (1–20); soft scale × (1 + 0.45·(speed−1)) → ×9.55 at 20x.
- At 20x: chop every 1.8 s, music box every 86 s, thunder every 24 s.

### Birdsong schedule (`updateAudio`)
- Day-phase windows on `T.f` (fraction of day): dawn 0.20–0.36, dusk 0.66–0.81; day = `T.light>0.22` (6295). (`T.light = clamp01(−cos(2πf)·0.86+0.42)`, outside 820.)
- Interval to next song: night 20–40 s; dawn 0.9–2.2 s; dusk 1.6–3.4 s; day 2.2–5.0 s (6299).
- Song happens only if `day && trees.length && chance(weather)` where `weather = (1−0.7·rain)(1−0.6·snow)(winter ? 0.55 : 1)` (6296, 6300).
- Perch: a real tree (has `.blobs`) gets `landBird(t, len+2.5..5.5 s)` (6304) — purely visual, up to 6 birds (outside 2293–2297).
- Reply: with chance 0.6 (dawn) / 0.35 (else) a second tree sings after `len+0.4..1.3 s` via `setTimeout`, 50 % "far" (quieter, narrower pan), offset ±3·S tiles (6305–6307).

### Water, rain, fire, crickets, owl/dove
- Stream: when `visibleFlow>0.05`, burbles per second = clamp(1.6·visibleFlow, 1, 6) × clamp01(cam.z/0.9) (6311–6313). Zoomed out (<0.9) is quieter.
- Rain: when `W.rain>0.25`, plips per second = 9·rain (6315).
- Fire: every 0.3 s each finished `fire` build pops with 50 % chance (6316–6317).
- Crickets: every 2.5–6 s when `T.light<0.2`, not winter, rain<0.3, snow<0.3, placed at village ±8·S tiles (6318–6322).
- Owl/dove: every 11–26 s; owl 45 % when `T.light<0.18`; dove 50 % when `0.62<T.f<0.86` (evening) (6323–6328). Positioned at village ±6·S tiles.

---

## 5. UI elements, controls, input (all outside the range but wired to it)

- `#bMute` button (DOM 286, class `gb`, aria-label "Mute sound", text "Sound"). Handler 12155–12167: a tap toggles `muted`, sets text "Muted"/"Sound" and `aria-pressed`; un-muting resumes a suspended context. A **long press (600 ms, `pointerdown` → `setTimeout`)** opens the sound check instead; the following `click` is swallowed via `held`.
- `#snd` sound-check dialog (DOM 257, CSS 65–72: fixed, centred, 112 px above safe-area bottom, glass panel, pill buttons). `openSoundCheck()` 10786–10790 lazily builds one button per entry in `SND_CUES` (10777–10784): 38 cues — every `sfx*` plus stream/rain/fire bursts and the six bird voices at pan 0 vol 0.024. `midG()` (10785) places a cue at the tile under the screen point (cw/2, 0.45·chh) or the village. Each button calls `initAudio()`, resumes, and toasts "Sound is muted" if muted. `#sndX` closes (12168).
- Begin button (12216–12217) is the first-gesture unlock: `initAudio()` + `AC.resume()`.
- `visibilitychange` (12199): `AC.suspend()` when hidden, `AC.resume()` when shown unless muted.
- Debug/harness export (12236): `SND_CUES, openSoundCheck, getAC`, and `sfxTune` (12234).
- No keyboard shortcuts for audio.

---

## 6. MODE 'creator' vs 'gnome'

Nothing in this range references `MODE` or `PLAYER`. Audio is mode-agnostic: cues are positioned relative to the camera, not the player's gnome. In gnome mode the `body.gnome` CSS (169) hides `#tools`, `#sizerow`, `#bUndo` only — the mute button and sound check remain available. There is no "closer mix" when following your own gnome; the follow camera (`cam.follow`) indirectly centres the player so their cues are loudest.

---

## 7. Progression / unlock / economy

None. No cue is gated by progression; no resource costs. (The music box `sfxTune` fires on gatherings/festivals, which are progression events elsewhere, but the audio layer itself has no unlock state.)

---

## 8. Persistence

None. `muted` is session-only (no `localStorage` anywhere in the file). `AGAP` and the ambience timers reset on reload. Audio state is not part of any save/share payload.

---

## 9. Mobile / touch / performance

- AudioContext is created only on a user gesture (Begin / sound check), with `webkitAudioContext` fallback (6058) and silent bail if unavailable — satisfies iOS/Chrome autoplay policy. `AC.resume()` is called wherever a suspended state is possible.
- Tab hidden → `AC.suspend()` (12199) saves battery.
- `StereoPannerNode` feature-checked (6104).
- Ambience uses real frame `dt` (capped 0.05 s at 12073), so speed-up never multiplies node creation; sim cues are throttled by `aOK` scaled by speed — this is the v9.11 fix against the "rattle" at 20x.
- Off-screen culling: `gtone` and most cues bail below an audibility threshold before allocating nodes.
- `scanWater` is throttled to 0.6 s and caps at 40 spots; `aTreeNearView` samples 24 trees rather than scanning all.
- Crickets are `dry` (skip the convolver) — the highest-count cue avoids reverb cost.
- All randomness uses the **visual RNG** `vrng` (seed 7, reseeded from `world.seed ^ 0x9E3779B9` at 887), never the sim `rng`, so toggling sound cannot change the simulation — crucial for the deterministic harness (`rngN` counter at 589). `landBird` is also on the visual stream (comment at 2296).
- IR generation: 2 × sampleRate × 2.2 samples (~211k at 48 kHz) computed synchronously on first tap — a few ms, fine.

---

## 10. i18n (en/es)

Nothing in range. The `langs` table (12200–12205) covers only the intro (h/p/b). All audio UI strings are **English-only and untranslated**: "Sound"/"Muted" (12164), aria-label "Mute sound" (286), "Sound check"/"Close" (257), toast "Sound is muted" (10788), and the 38 cue names in `SND_CUES` (10777–10784, e.g. 'tree falls', 'bridge goes', 'music box'). i18n gap to close in the port.

---

## 11. Oddities, bugs, dead code, TODOs

1. **Rate-limit slot consumed by inaudible events** (pattern at 6139–6197): `aOK` is checked *before* audibility, and `gtone` then bails at `a≤0.02`. An off-screen gnome chopping stamps `AGAP.chop` and silences an on-screen chop for the next gap (1.8 s at 20x). Fix: test audibility first, or only stamp `AGAP` when a note is actually emitted.
2. **`sfxOwl`/`sfxDove` have no distance attenuation** (6198–6207) while every other positioned cue does. The village centre may be off-screen; they still play at full gain, only panned. Inconsistent with `sfxCricket`'s caller too (also no attenuation, but gain is tiny).
3. **`sfxThud` is dead in-game** (6173): only the sound check calls it (10780).
4. **`tone`'s `hold` option is dead** (6101): no caller passes `hold:`. If ever used with `att+hold > dur` the release ramp would be scheduled before the hold point.
5. `panOf`'s `y===undefined?0:y` guard (6082) is unreachable in practice.
6. `sfxTune` passes `to:f` (6196) — a no-op glide to the same frequency; harmless.
7. `gtone` mutates the caller's options object (6116–6118).
8. **Pause = total silence**: `updateAudio` runs only when `T.speed>0||ns>0` (12088), so pausing stops birds/stream too; `aOK` treats speed 0 as 1 (6133), which is fine but moot.
9. The reply bird (6306–6307) is a wall-clock `setTimeout`, so it ignores camera moves and may sing from an off-screen tree when `far` is true (which skips the audibility test).
10. `aTreeNearView` has no on-screen cutoff; `singFrom` returns 0 if inaudible but `landBird` is still called with a 2.5–5.5 s perch (6304) on an unseen tree — harmless.
11. `scanWater` treats a dammed *still* pool (`DAM && WD>0.05`) as "running water" (6286) so a pond burbles like a stream — probably intended for spillways, but worth confirming.
12. Mute is a soft gate: notes already scheduled keep playing (up to ~3.1 s for the music box, 2.8 s for thunder). A gain ramp on `master` would cut cleanly.
13. `sfxBurner` (11584, outside) is an `sfx*` cue that lives with the flyer code, not here, yet `SND_CUES` (10781) references it — organisational drift.
14. Version-note comments (v9.11, v9.15, v9.17, v9.19) are the changelog style used throughout the file; no TODOs in the range.
15. Pan curve uses a hard `clamp` at ±1 (6083): sources slightly beyond the screen edge pin to full pan rather than fading — acceptable since `audibleGain` fades them.

---

## 12. Reusable engine vs gnome-specific content

### Reusable as-is (engine/shell)
- `initAudio`/`makeIR` master chain + synthetic reverb (6056–6080): a complete zero-asset "soft" audio bus.
- `tone` and `gtone` (6090–6120): the whole synth voice with glide/wobble/pan/dry, needs only `screenOf`, `cw`, `chh`.
- `panOf`/`audibleGain` (6081–6089): camera-relative spatialisation; constants 0.55/0.85 are layout-tunable.
- `AGAP`/`aOK` (6130–6137): per-kind real-time rate limiter with speed scaling and the hard/soft split.
- `noteRun` + `VOICES` + `singFrom` + `aTreeNearView` (6212–6269): a procedural birdsong system — directly fitting for a French park (blackbird, robin, wren, chiffchaff, thrush are all European park birds).
- Ambience primitives `burble`, `plip`, `firePop`, `sfxCricket`, `sfxOwl`, `sfxDove` (6198–6279): park-appropriate (fountain, rain, brazier/café, crickets, owl, pigeon/dove).
- `updateAudio` skeleton (6292–6329): timers + accumulators + dawn/dusk/night/weather gating.
- Shell wiring (outside): first-gesture unlock, visibility suspend/resume, mute button with long-press sound check, `SND_CUES` debug panel, visual-RNG separation.

### Gnome-specific (replace)
- The cue vocabulary and its tuning: chop/knock/tap/drop/eat/moan/hup/splash/yell/panic/help/giggle/snicker/murmur/comfort/fall/thud/crash/built/yip/baby/tune/leave (6139–6197) and `sfxBurner` (outside).
- The event→cue mapping in the sim (callers listed in §3).
- Village-centred ambience placement via `villagePos()` (6303, 6321, 6324).
- `scanWater` reliance on the `FLOW`/`DAM`/`WD` terrain water model (6282–6290).
- Fire-build pops keyed on `b.type==='fire'&&b.done` (6317).
- Season rules (winter halves birds, kills crickets) and the 1–20x speed dial assumptions in `aOK`.

---

## 13. Design questions for the Parque D'Amour port

1. **Cue vocabulary**: what are the romance beats to voice (sigh, laugh, gasp, huff, kiss, footsteps on gravel, bench creak, café clink, bicycle bell, pigeon flutter, dog bark)? Which are "voice-like" (soft gap) vs "mechanical" (hard gap)? What base gaps?
2. **Speed dial**: does the park have a 1–20x dial? If not, `aOK` collapses to fixed gaps; if yes, what range and should soft/hard scaling be kept?
3. **Ambience centre**: what replaces `villagePos()` for unpositioned/near-centre sounds — the couple, the fountain, the bandstand, or the camera centre?
4. **Avatar mode mix**: should the player's avatar bypass distance attenuation and rate limiting (always hear your own footsteps/voice)? Should creator (god view) and avatar (follow cam) have different reverb/low-pass settings?
5. **Assist vs sabotage tone**: should the mix or motif shift with the romance state (major/minor music-box phrase, brighter birds when love blooms, crows/rain when sabotaged)? Does the game want a leitmotif (accordion waltz) beyond GV's single 12-note pentatonic box — and would that need richer waveforms (triangle/harmonics) than pure sines?
6. **Time and seasons**: is the romance a single afternoon, a day, or many days? Does the park have seasons (GV halves birdsong in winter, silences crickets)? Dawn/dusk windows (0.20–0.36 / 0.66–0.81 of `T.f`) assume a full day cycle.
7. **Water model**: a fountain is a point source — replace `scanWater` with a list of fountain/pond tiles? Should a still pond be silent (GV burbles dammed water)?
8. **Perches**: does the park map keep a `trees` array with `.blobs`-style flags for `landBird`? Should statues, benches and lamp posts be perches for pigeons?
9. **Urban hum**: the "never a hiss" rule rejects noise sources — does a Parisian park allow distant traffic, church bells on the hour, children, or café chatter as additional ambience layers, and do they count as "rounded"?
10. **Weather**: does the park have rain, thunder (`W.rumble` coupling) and snow? Which cues drop out in rain?
11. **Mute persistence & settings**: persist `muted` in `localStorage`? Keep the hidden long-press sound check, or promote it to a settings sheet?
12. **i18n**: translate the audio UI strings (Sound/Muted/Sound check/toast/cue names) into the port's language set (fr/en/es?).
13. **Spatial constants**: keep pan 0.55 / falloff 0.85 for a park map that may be smaller or more top-down? Should attenuation be circular rather than square?
14. **Audibility-before-gate**: adopt the fix for oddity #1 so off-screen couples do not starve on-screen cues?
15. **Mute behaviour**: hard-cut via a master gain ramp, or let tails ring as now?
16. **Per-source gating**: romance dialogue may need per-character rate limits (so two lovers can "speak" in turn) instead of GV's per-kind gating.

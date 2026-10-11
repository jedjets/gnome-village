# Parque D'Amour: Audio and Music Design

Version 1 · 2026-10-10 · Owner: Jeduthun Oosthuis · Author: Claude (design session)

**How to use this document.** This is the sound bible for every model that writes or tunes anything under `src/audio/`, the sound check sheet, or `music-board.html`. Read `01-Decision-Register.md` (the register) and `00-Product-Brief.md` (the brief) first; every number, name and id here matches them, and where this document defines a value they do not, that value is listed in section 9 so the owner can object. "GV 6131" means line 6131 of the Gnome Village HTML file as indexed in `10-Gnome-Village-HTML-Architecture-Review.md` (the review). Section 1 gives the rules that never bend. Section 2 says exactly what to port from GV and what to change. Section 3 is the cue table: a cue that is not in it does not exist. Section 4 is the ambience scheduler, section 5 the waltz, section 6 the Music Gate board, section 7 the mix, section 8 the tests. Rules marked "Do not" are hard limits. "Done when" lines are acceptance tests. No model tunes music or cues from Slice 8 on before the owner's Music Gate pick is recorded in the register §4 (brief 4.2 rule 4); until then only the engine port (section 2) and the board (section 6) may be built.

---

## 1. Principles

1. **Zero assets.** No audio files, no fetched samples, no `AudioBuffer` other than the synthetic reverb impulse (GV `makeIR` 6073–6080) and the short `grain()` bursts of 2.3 item 6. Everything is scheduled oscillators (register 25, brief 4.1 item 1).
2. **Never a hiss.** No continuous noise, no white-noise beds, no "rush", no wind layer, no traffic drone. Every ambience layer is a sequence of discrete, enveloped events (GV header comment 6050–6054). The only noise source is `grain()`; it can last at most 0.12 s, never loops, and ambience may call it at most 6 times per real second.
3. **Sound keeps its own pace at any speed.** Cue gaps are measured in **real** milliseconds and widen with the speed dial (GV `aOK` 6131–6137, comment 6121–6129). Ambience and music run on real frame time (GV 12088: `updateAudio(dtr)`), so at 8× the birds, the fountain and the waltz sound exactly as at 1×. The register fixes this in §3.2 ("audio gaps are in real time as in GV") and the speed dial at 1–8× plus pause (register 20).
4. **Audibility before gating.** A cue tests whether it can be heard before it touches the rate limiter, so an off-screen cue never silences an on-screen cue of the same kind (review §8 known flaw; brief 4.1 item 2).
5. **Audio reads the simulation and writes nothing.** No module under `src/audio/` may assign to any object owned by `src/world`, `src/entities`, `src/play` or `src/core` except `src/core/events.ts` subscriptions. The simulation never imports `src/audio/`; it emits events on the bus and `cues.ts` listens.
6. **Visual RNG only.** Every random number in `src/audio/` comes from the visual stream of `src/core/rng.ts` (GV `vrng` 594–598), never from the sim stream and never from `Math.random()` (brief 8.2 item 10). The reverb impulse and the grain buffer are filled once at `initAudio()` from a private `mulberry32(0xA0D10)` instance inside `engine.ts`, so neither the sim stream nor the visual stream is touched (GV used `Math.random()` at 6077). Muting, un-muting or changing the music must leave `rngN` and the state hash unchanged (brief 9 row 5).
7. **Small gains.** Cue peaks stay between 0.003 and 0.060 as GV (review §8); the mix is quiet by design and the compressor is a safety net, not a loudness tool.
8. **Slapstick, never alarm.** No siren, no scream, no crash, no thunder (Parque has no storm weather, 02 §3.3). Mischief cues are comic: a splat, a yap, a slip, a buzz, a "hmm?".

Do not: add a noise generator for wind, rain or traffic; scale music tempo with the speed dial; read `MODE` or `PLAYER` to change what the simulation emits; call the sim RNG; keep any audio timer in sim seconds.

---

## 2. Engine port from Gnome Village

### 2.1 What to port, line by line

| Parque module | GV source | Lines | Port verdict |
|---|---|---|---|
| `src/audio/engine.ts` | `initAudio` master chain | 6056–6072 | port as is; add the three sub-buses of 7.1 |
| `src/audio/engine.ts` | `makeIR(sec, decay)` | 6073–6080 | port (2.2 s, decay 2.8, one-pole 0.74/0.26, ×0.9); replace `Math.random()` at 6077 with the private stream of 1 item 6 |
| `src/audio/engine.ts` | `panOf(x, y)` | 6081–6084 | port; `screenOf` comes from `src/render/project.ts`; constant 0.55 kept |
| `src/audio/engine.ts` | `audibleGain(x, y)` | 6085–6089 | port; constant 0.85 kept; square falloff kept |
| `src/audio/engine.ts` | `tone(freq, dur, o)` | 6090–6113 | port; add `type` values `triangle`, `sawtooth`, `square` (sawtooth and square only for `music.ts`), add `bus`, keep `hold` and make it work (review note 12 §11 item 4) |
| `src/audio/engine.ts` | `gtone(g, freq, dur, o)` | 6114–6119 | port as `toneAt(x, y, freq, dur, o)`; never mutate the caller's options (review note 12 §11 item 7): copy `o` first |
| `src/audio/limiter.ts` | `AGAP`, `aOK(k, base, soft)` | 6130–6137 | port with the speed clamp changed from 1–20 to 1–8 and the audibility-first order of 2.4 |
| `src/audio/cues.ts` | the 27 `sfx*` cues | 6139–6207 | **replace** with section 3; keep as recipes: creak 6162, giggle 6163, murmur 6165, built chord 6188–6191, yip 6192, leave 6197, dove 6203–6207 |
| `src/audio/birds.ts` | `noteRun`, `VOICES`, `singFrom`, `aTreeNearView` | 6212–6270 | port verbatim; trees come from the `Prop` list (`kind == 'tree'`) instead of `trees` |
| `src/audio/ambience.ts` | `sfxCricket`, `burble`, `plip`, `updateAudio` | 6270–6329 | reshape as section 4; drop `scanWater` 6283–6291, `firePop` 6280 and `FLOW/DAM/WD` |
| `src/audio/cues.ts` | `sfxTune` music box | 6195–6196 | not ported into the game; its recipe seeds motif B on the board (6.3) |
| `src/ui/sheets.ts` | `SND_CUES`, `midG`, `openSoundCheck` | 10777–10790 | port as the Sound check sheet of 2.6; `midG` becomes `viewCentreTile()` in `src/render/camera.ts` |
| `src/ui/rail.ts` | `#bMute` tap toggles mute | 12155–12167 | port the tap; **do not port the 600 ms long-press** (the sheet is reached from Options, 02 §12.4) |
| `src/main.ts` | `visibilitychange` suspend/resume; Begin unlock | 12199; 12216–12217 | port as is; also call `resume()` on Continue |
| `src/debug/harness.ts` | `SND_CUES, openSoundCheck, getAC` exports | 12223–12241 | port as `window.__PD.audio` (8.3) |
| dropped | `sfxRumble` thunder, `sfxFall`, `sfxCrash`, `sfxThud`, `sfxBurner` | 6167–6187, 11584 | no storms, no trees falling, no bridges breaking, no balloon |

### 2.2 The master chain (GV 6061–6070, numbers locked)
1. `master` gain 0.84 → lowpass 2100 Hz Q 0.3 → highshelf 1100 Hz −6 dB → `DynamicsCompressor` threshold −24 dB, knee 28, ratio 3, attack 0.03 s, release 0.45 s → `destination`.
2. Reverb: `ConvolverNode` with `makeIR(2.2, 2.8)` → lowpass 1600 Hz Q 0.2 → `verbGain` 0.36 → `master`. Every voice connects to its bus and, unless `dry`, also to the convolver (GV 6105–6106).
3. New in Parque (7.1): three `GainNode` buses between the voices and `master`: `cueBus` 1.0, `ambBus` 0.85, `musicBus` 0.50 × duck (5.7). `tone()` picks the bus from `o.bus` (default `'cue'`).
4. The master lowpass and `verbGain` are the only two parameters the ambience may automate (snow hush and mist, 4.10 and 4.11). Use `setTargetAtTime` with a 2 s time constant; never `value =` jumps while sound plays.

### 2.3 `tone()` and the two primitives
1. Signature: `tone(freq: number, dur: number, o?: ToneOpts): void` with

```ts
export interface ToneOpts {
  delay?: number; type?: 'sine' | 'triangle' | 'sawtooth' | 'square';
  to?: number; toAt?: number;      // glide target Hz (min 30) reached at dur*toAt (default 0.92)
  gain?: number; att?: number; hold?: number;   // peak (default 0.08 as GV; cues always pass one), attack s (default 0.045)
  pan?: number; dry?: boolean; wob?: number; wobd?: number;   // LFO Hz and depth as a fraction of freq (default 0.05)
  bus?: 'cue' | 'amb' | 'music';
}
```
2. Envelope exactly GV 6099–6102: 0.0001 → gain over `att` (exponential), optional hold, → 0.0001 at `dur`. Oscillator stops at `t + dur + 0.05` (GV 6112).
3. `toneAt(x, y, freq, dur, o)` returns `false` and plays nothing when `audibleGain(x, y) <= 0.02` (GV 6116), else multiplies `gain` by the audibility, sets `pan = panOf(x, y)`, and returns `true`.
4. Guard: `tone()` returns at once when `!audioOn || muted || !AC` (GV 6092).
5. `grain(dur, o: { f0: number; f1: number; gain: number; pan?: number; delay?: number; bus?: ToneOpts['bus'] })`: one `AudioBufferSourceNode` over a 0.12 s buffer of noise made once at `initAudio` from the private stream of 1 item 6, through a bandpass whose centre glides `f0 → f1` over `dur` (Q 1.2), the GV envelope with `att = 0.004`, always `dry`. `dur` is clamped to 0.12 s. This is the only noise path; it exists for gravel, splat, flutter and fireworks bursts.
6. A `tone()` or `grain()` call allocates nodes and nothing is pooled (review note 12 §3). Budget: at most 40 `tone()` calls per real second from cues and ambience together; the limiter guarantees it when the gaps in section 3 are respected.

### 2.4 The limiter (`src/audio/limiter.ts`)
1. State: `const GAP = new Map<string, number>()` keyed by a string, holding the last real-time stamp in ms. `now` is the `requestAnimationFrame` timestamp that `src/core/loop.ts` stores once per frame (GV `now = ts` 12073); `src/audio/` never calls `performance.now()` or `Date.now()` itself.
2. `gate(key, baseMs, soft, unscaled = false)`: `sp = clamp(T.speed || 1, 1, 8)`; `scale = unscaled ? 1 : soft ? 1 + (sp − 1) × 0.45 : sp`; `gap = baseMs × scale`; return `false` if `now − (GAP.get(key) ?? −1e9) < gap`, else stamp `now` and return `true` (GV 6133–6136). At 8×: hard ×8, soft ×4.15. Paused (`speed 0`) counts as 1× (GV 6133). `unscaled` exists only for `foghorn` (3.2 row 23) and the bells (4.12), which are ambience and keep real time whatever the dial.
3. **Order inside `cue()`** (the fix): (a) if `!audioOn || muted` return without stamping; (b) `a = audibleGain(x, y)`; if `a < def.thresh` return without stamping; (c) if `!gate(...)` return; (d) play. An inaudible event never consumes a slot.
4. **Scope**: a cue row with scope `kind` uses `key = id`. A row with scope `actor` uses `key = id + ':' + actorId` **and** must also pass the shared gate `gate('voice', 110, false)` so two lovers can speak in turn but never at once (review §15 J57). Events for `actor` cues must carry `actor` (a visitor or creature id); if it is missing, fall back to scope `kind`.
5. Unpositioned cues (position "none" in section 3) skip step (b) with `a = 1`.

### 2.5 The cue registry (`src/audio/cues.ts`)

```ts
export type CueId = 'step_gravel' | 'step_lawn' | /* every id of table 3.2 */ 'refuse';
export interface CueDef { id: CueId; gap: number; soft: boolean; unscaled?: boolean; scope: 'kind' | 'actor'; thresh: number;
  play(x: number, y: number, a: number, pan: number, p: CueParams): void; }
export interface CueParams { actor?: number; voice?: 'f' | 'm'; n?: number }
export const CUES: Record<CueId, CueDef>;
export function cue(id: CueId, x: number, y: number, p?: CueParams): boolean;   // true when a note was scheduled
export function bindCues(bus: EventBus): void;   // subscribes every trigger of table 3.2
```
`thresh` is 0.02 for positioned cues and 0 for unpositioned ones. `voice` scales every frequency of a voice-like cue: `'f'` ×1.19, `'m'` ×0.84 (one semitone band apart; GV used one pitch for all gnomes). `a` is passed to `play` already computed; `play` must multiply its gains by `a` (GV 6119) except where a row says "floor 0.4" (GV `sfxBuilt` 6189 pattern: `a = max(0.4, a)`).

### 2.6 The Sound check sheet (port of `SND_CUES` 10777–10790)
1. It is the sheet `#snd` of 03 §10.1 (the same recipe as the other sheets, stacked by `layoutOverlays`), named **Sound check**, opened only from the Options sheet when the dev flag is on (02 §12.4, register 3.10). There is no long press.
2. Content: one pill button per `CueId` in table order, labelled with the id (a code identifier, not translated); then the ambience bursts **fountain ×6**, **rain ×10**, **crickets**, **owl**, **bells**, **boulevard**; then the six bird voices by name; then **waltz rising**, **waltz parted**, **stop music**. Titles and the toast go through `t()`: `sheet.sound.title`, `sheet.sound.muted` ("Sound is muted", GV 10788).
3. Every button calls `initAudio()`, resumes a suspended context, and plays at `viewCentreTile()` (GV `midG` 10785: the tile under screen point `(cw/2, 0.45·chh)`), so `a` is 1 or near it.
4. Done when: every id of table 3.2 has a button, every button makes a sound with the sheet open at 1× and at 8×, and the harness log (8.3) records each press.

Do not: port `sfxThud`, `sfxRumble`, `sfxFall`, `sfxCrash`, `sfxBurner`; port the `villagePos()` centre (GV 2493); port `scanWater`; keep `muted` session-only (it lives in the profile, register 3.11); let any cue call `rng()`.

---

## 3. Cue vocabulary

### 3.1 Recipe notation
`f→to ·dur a=att d=delay w=hz/depth` means one `tone(f, dur, { to, att, delay, wob: hz, wobd: depth })`. Semicolons separate notes of one cue. `tri` = `type: 'triangle'`, `dry` = no reverb, `grain(dur f0→f1)` = 2.3 item 5. Gains in the Gain column are the cue's peak before `a`; a note marked `×0.5` plays at half the row's gain. Frequencies in Hz, times in seconds. Gap in real ms (2.4); "unscaled" = `unscaled: true` (2.4 item 2). Position says which `(x, y)` the emitter puts in the event; "none" = unpositioned, `pan 0`, `a = 1`.

### 3.2 The cues (38; the registry must contain exactly these ids)

| # | id | Trigger: event (emitting module) | Recipe | Gain | Gap | Soft | Scope | Position |
|---|---|---|---|---|---|---|---|---|
| 1 | `step_gravel` | `step` every 0.55 tile of travel on gravel or flagstone (`move.ts`) | grain(0.05 900→400); grain(0.04 700→350) d=0.03 ×0.6 | 0.012 | 70 | no | actor | the walker |
| 2 | `step_lawn` | `step` on lawn, mulch or bridge (`move.ts`) | 150→95 ·0.09 a=0.01 | 0.008 | 70 | no | actor | the walker |
| 3 | `bench_creak` | `sit`, `stand` (`act.ts`) | 118→72 ·0.7 a=0.12 w=7/0.03; 86→60 ·0.5 d=0.35 ×0.7 (GV 6162) | 0.012 | 450 | no | kind | the bench |
| 4 | `murmur` | `chat` every 3 s at stage 2, speaker alternates (`romance.ts`) | base b = 190 (m) or 260 (f), ±10 %; 4 notes b×[1, 1.12, 0.94, 1.06] ·0.42 d=i×0.38 a=0.10 w=4/0.02 (GV 6165) | 0.017 | 700 | yes | actor | the speaker |
| 5 | `laugh` | `laugh`: `backfired`, Picnic hearts 30 %, family play, `a_pomeranian` play (`embarrass.ts`, `romance.ts`, `brain.ts`) | 523→659 ·0.10 a=0.02; 622→784 ·0.12 d=0.12; 587→740 ·0.14 d=0.25 (GV 6163), `voice` scaled | 0.022 | 450 | yes | actor | the laugher |
| 6 | `sigh` | `stage` Notice complete; `linger` every 20 s (`romance.ts`) | 392→294 ·0.55 a=0.14 w=4/0.02, `voice` scaled | 0.020 | 600 | yes | actor | the sigher |
| 7 | `gasp` | `embarrassed` landed, on the victim; `watch` start at fireworks (`embarrass.ts`, `abilities.ts`) | 330→523 ·0.12 a=0.02; 494 ·0.25 d=0.13 a=0.03, `voice` scaled | 0.026 | 500 | yes | actor | the victim |
| 8 | `kiss` | `stage` Kiss complete (`romance.ts`) | 784 ·0.08 a=0.005 dry; 1046→880 ·0.30 d=0.10 a=0.02 | 0.018 | 2000 | yes | kind | pair midpoint |
| 9 | `ring` | `proposal` sparkle at t+8 s (`romance.ts`) | tri 1568 ·1.2 a=0.005 w=6/0.004; tri 2349 ·0.9 d=0.02 ×0.4 | 0.020 | 3000 | yes | kind | the kneeler |
| 10 | `happily` | `happily` (`romance.ts`) | 392, 494, 587, 784 each ·1.4 d=i×0.12 a=0.06; 988 ·0.9 d=0.6 ×0.6; floor 0.4 (GV 6189) | 0.030 | 4000 | yes | kind | pair midpoint |
| 11 | `parted` | `parted` (`romance.ts`) | 294→277 ·0.7 a=0.10; 247 ·1.2 d=0.55 a=0.14 w=3/0.015 (GV 6197); floor 0.4 | 0.028 | 4000 | yes | kind | pair midpoint |
| 12 | `bouquet` | `bouquet` handed: `c_bouquet` cameo, `a_florist` hand (`abilities.ts`, `avatar.ts`) | 659 ·0.18 a=0.02; 880 ·0.35 d=0.16 a=0.03 | 0.018 | 900 | yes | kind | the receiver |
| 13 | `coo` | ambience 4.4; `peck` start (`creatures.ts`) | 330→294 ·0.45 a=0.12; 294 ·0.75 d=0.34 a=0.14 w=3.4/0.02 (GV 6203–6207) | 0.016 | 900 | no | kind | the pigeon |
| 14 | `flutter` | `scatter`, `fly`, `swoop` start (`creatures.ts`) | 6 × grain(0.03 500→300) d=i×0.055, gain falling 1.0→0.4 | 0.014 | 180 | no | kind | the pigeon |
| 15 | `splat` | `embarrassed` poop landed (`embarrass.ts`) | 170→60 ·0.10 a=0.004; grain(0.04 1100→500) d=0.01 ×0.6 | 0.030 | 300 | no | kind | the victim |
| 16 | `yap` | `bark` dog sees the pomeranian; pomeranian `snatch` start at ×1.25 pitch (`creatures.ts`) | 640→920 ·0.09 a=0.01; 720→1000 ·0.08 d=0.14 a=0.01 (GV 6192) | 0.020 | 900 | no | actor | the dog |
| 17 | `snatch` | `embarrassed` snatched landed (`embarrass.ts`) | grain(0.08 700→250); 196→262 ·0.12 d=0.06 a=0.01 ×0.8 (the "hey") | 0.024 | 600 | no | kind | the victim |
| 18 | `wasp` | `m_wasp` t0 to t2, one event per 0.5 s (`abilities.ts`) | 220 ·0.45 a=0.03 w=28/0.08; tri 440 ·0.45 ×0.3 | 0.010 | 400 | no | kind | the table |
| 19 | `sprinkler` | `m_sprinkler` t0 and every 1 s while up (`abilities.ts`) | 6 × grain(0.03 1800→900) d=i×0.09 ×0.7; 90→70 ·0.3 a=0.05 | 0.012 | 900 | no | kind | the sprinkler |
| 20 | `slip` | `embarrassed` trip landed (`embarrass.ts`) | 523→262 ·0.18 a=0.01; 98→70 ·0.12 d=0.20 a=0.01 | 0.030 | 450 | no | kind | the victim |
| 21 | `mime` | `embarrassed` mime landed; `wall` start (`embarrass.ts`, `avatar.ts`) | no tone first: `duck(−18 dB, 0.6 s)` on `ambBus` and `musicBus` (5.7); then tri 880 ·0.05 a=0.004 dry d=0.6 | 0.012 | 1200 | yes | kind | the mime |
| 22 | `rival_hmm` | `m_rival` arrival; every 10 s of `distracted` (`abilities.ts`) | 196→208 ·0.5 a=0.12 w=5/0.02; 233 ·0.3 d=0.45 ×0.8 ("hmm?"), `voice` of the stranger | 0.018 | 1500 | yes | kind | the stranger |
| 23 | `foghorn` | ambience 4.11 | 65→62 ·1.8 a=0.5; 130 ·1.6 d=0.05 ×0.4 | 0.022 | 20000 unscaled | no | kind | fixed `panOf(24, −4)`, `a` floor 0.6 |
| 24 | `fireworks` | `c_fireworks` launches paced by 4.9; Happily burst ×3 (`ambience.ts`) | launch 220→880 ·0.5 a=0.3 ×0.5; burst d=0.55: 70→40 ·0.45 a=0.005; 3 × grain(0.06 1500→400) d=0.55+i×0.07 ×0.6 | 0.040 | 350 | no | kind | fountain or park centre, pan ±0.5 random |
| 25 | `clink` | ambience 4.6; `eat` start at a café table (`act.ts`) | tri 2637 ·0.12 a=0.003 dry; tri 3520 ·0.08 d=0.02 ×0.5 | 0.010 | 700 | no | kind | the table |
| 26 | `bell_bike` | ambience 4.7 | tri 2093 ·0.25 a=0.004 w=9/0.008; same d=0.18 ×0.8 | 0.012 | 6000 | no | kind | beyond the south railings, pan −0.7→0.7 sweep |
| 27 | `gate_hinge` | `arrive`, `leave` through a gate (`visitor.ts`) | tri 392→330 ·0.35 a=0.15 w=6/0.03; 294 ·0.2 d=0.3 ×0.6 | 0.010 | 1200 | no | kind | the gate tile |
| 28 | `fountain` | ambience point source 4.5 | one burble: f = 300–700 ·0.10–0.18 →f×(0.72–0.92) toAt=0.9 a=0.03 (GV 6275–6278) | 0.0045 | none (rate 4.5) | no | kind | each fountain |
| 29 | `plip` | ambience rain 4.8 | f = 420–840 ·0.07 a=0.012 →f×0.8 (GV 6279) | 0.0032 | none (rate 4.8) | no | kind | random pan ±0.8 |
| 30 | `hush` | ambience state 4.10, snow > 0.5 | no tone: master lowpass 2100→1500 Hz, `verbGain` 0.36→0.46, 2 s time constant | n/a | n/a | n/a | n/a | n/a |
| 31 | `lamp_hum` | `lampsLit` when `f` crosses 0.80; `c_lamplight` t0; per lamp in view, stagger 0.3–1.5 s, max 6 (`ambience.ts` watching `clock.ts`) | 200 ·1.0 a=0.4 w=0.8/0.01; 400 ·1.0 ×0.25 | 0.010 | 3000 | no | kind | each lamp |
| 32 | `petals` | `c_petals` t0; `a_florist` scatter (`abilities.ts`, `avatar.ts`) | tri 1568, 1760, 2093, 2349, 2637 each ·0.35 a=0.01 d=i×0.07, gain 1.0→0.5 | 0.012 | 1500 | yes | kind | area centre |
| 33 | `sunbeam` | `c_sunbeam` t0 (`abilities.ts`) | tri 262, 330, 392 each ·2.2 a=0.9 w=5/0.004 (a swell) | 0.014 | 3000 | yes | kind | area centre |
| 34 | `ready` | a cooldown reaches 0; charges reset at `f = 0` (`abilities.ts`) | tri 1319 ·0.12 a=0.004 dry; tri 1760 ·0.10 d=0.09 ×0.8 | 0.014 | 500 | no | kind | none |
| 35 | `unlock` | a tier is reached (`progression.ts`) | tri 523, 659, 784, 1047 each ·0.9 d=i×0.14 a=0.02; tri 1319 ·1.3 d=0.56 | 0.030 | 4000 | yes | kind | none |
| 36 | `ui_tap` | any rail or sheet button press (`dom.ts`) | tri 1047 ·0.045 a=0.003 dry | 0.010 | 60 | no | kind | none |
| 37 | `place` | tool commit: stamp, run Place, brush stroke end (`tools.ts`); any ability cast that passes validation, at its target (`abilities.ts`) | 262→196 ·0.16 a=0.02; 392 ·0.12 d=0.05 ×0.5 (GV 6141) | 0.022 | 120 | no | kind | the tile |
| 38 | `refuse` | tool or ability validation fails with a toast (`tools.ts`, `abilities.ts`) | 330→294 ·0.18 a=0.03; 277 ·0.25 d=0.16 ×0.8 | 0.016 | 400 | no | kind | none |

### 3.3 Rules for the table
1. Voice-like cues (Soft = yes) use the soft speed scale; mechanical ones the hard scale (2.4 item 2).
2. `voice` comes from the visitor's `sex` field (02 §4.1); creatures and the stranger pass none.
3. Children laugh (`laugh` with `voice 'f'` ×1.3) and gasp at fireworks; no other cue is ever emitted for a child, because no embarrassment ever lands on one (02 §13 T3).
4. Every `embarrassed` event emits `gasp` on the victim **and** the kind's own cue by this mapping (register §5 kinds): poop → `splat`, soaked → `sprinkler`, trip → `slip`, snatched → `snatch`, wasp → `wasp`, rival → `rival_hmm`, mime → `mime`, drenched → `plip` ×6 at the victim, fog → `foghorn`, flock → `flutter` ×4 across the area.
5. Backfire emits `laugh` on both members 0.4 s apart and no `gasp`.
6. `step_*` events carry `actor`; at 8× the actor gate (70 ms × 8 = 560 ms) plus the `voice`-free kind gate make footsteps a light patter, never a rattle.
7. Abilities without a cue of their own sound through `place` on cast and through the events they cause: `c_musician` and `a_busker` through the music itself (5.6 busker rule), `c_umbrella` and `c_picnic` through `place` only, `c_rowboat` through `fountain` ×0.5 at the boat (4.5), `m_pigeon` through `flutter` and `splat`, `m_peel` through `slip`, `m_pomeranian` through `yap` and `snatch`, `m_raincloud` through `plip`, `m_mime` through `mime`, `m_fog` through `foghorn`, `m_flock` through `flutter` and `gasp`. No model adds a cue for them.
8. Done when: `Object.keys(CUES).length === 38`, every id in the table plays from the Sound check sheet, and no `CueDef` has a gain above 0.060.

Do not: add a cue without adding a row here and in `06-Content-Tables.md`; emit any cue from the UI thread except `ui_tap`, `place`, `refuse` and `ready`; give a cue a gap below 60 ms; use `sawtooth` or `square` in a cue (music only).

---

## 4. Ambience scheduler (`src/audio/ambience.ts`)

### 4.1 Entry point and centre
1. `updateAmbience(dt: number)` is called once per frame by `src/core/loop.ts` with **real** seconds capped at 0.05 (GV 12073, 12088). Parque calls it whether the sim is paused or not (section 9 item 4); GV's silence on pause (review note 12 §11 item 8) is not ported. It returns at once when `!audioOn || muted`.
2. `centre()` replaces GV `villagePos()` (2493; used at 6301, 6319, 6324): if a featured pair exists and `audibleGain(midpoint) >= 0.2`, the pair's midpoint; else `viewCentreTile()` (2.6 item 3). Crickets and the owl are placed around `centre()`.
3. Every timer below is a countdown in real seconds held in module state, reset on `initAudio()` and on New.

### 4.2 Songbirds (`src/audio/birds.ts`, GV 6292–6308)
| Item | Value |
|---|---|
| Windows (day fraction `f`, 02 §3.2) | chorus `[0.20, 0.32)`; vespers `[0.76, 0.87)`; `day = T.light > 0.22`; night otherwise |
| Interval to the next song | night `vrnd(20, 40)`; chorus `vrnd(0.9, 2.2)`; vespers `vrnd(1.6, 3.4)`; day `vrnd(2.2, 5.0)` (GV 6299) |
| Probability a song happens | `(1 − 0.7·rain)(1 − 0.6·snow)(1 − 0.4·mist)(winter ? 0.55 : 1)` (GV 6296 plus the mist factor) |
| Where | `aTreeNearView()` (GV 6259–6270) over the tree props; none → `centre()` |
| Voice | one of `VOICES` 6220–6250 picked on the visual RNG; `singFrom` 6252–6258 volumes 0.024 near, 0.011 far |
| Reply | chance 0.6 in chorus, 0.35 otherwise; a second tree sings after `len + vrnd(0.4, 1.3)` s, 50 % far (GV 6305–6307); schedule it on the ambience timer, not `setTimeout` (review note 12 §11 item 9) |
| Perch | `birds.ts` emits `sing { treeId, len }`; `src/render/effects.ts` may draw a decorative songbird perched (an `fx` event, 09 §6 item 5) for `len + vrnd(2.5, 5.5)` s on the visual RNG (GV `landBird` 2293) |
| Romance colour (review §15 J59) | while the featured pair is at stage ≥ 5, the interval is ×0.8 and `blackbird` (voice 4) is picked twice as often |

### 4.3 Owl (kept, far and rare)
Every `vrnd(11, 26)` s when `T.light < 0.18`: 25 % chance, placed at a tree with `y < 0` (the far bank) if any, else at `centre() ± 6` tiles. Recipe GV `sfxOwl` 6198–6202 at gain 0.020 **with** `audibleGain` applied (fix for review note 12 §11 item 2). GV's dove is not an ambience layer; its recipe became `coo` (3.2 row 13).

### 4.4 Pigeons
Every `vrnd(4, 9)` s, 40 %: pick one pigeon in state `walk`, `peck` or `perch` with `audibleGain >= 0.1` (sample 8 on the visual RNG, keep the most audible) and play `coo` there. Fog (mist > 0.6): the interval doubles. Flutters are sim cues (3.2 row 14).

### 4.5 Fountains as point sources
For every fountain prop with `audibleGain(x + 1, y + 1) >= 0.05` (the 2×2 centre), accumulate `acc += dt × clamp(1.5 + 2a, 1, 4) × clamp01(cam.z / 0.9)` and play one `fountain` burble per unit of `acc` (GV 6311–6313 shape). The rowboat ride adds `fountain` ×0.5 at the boat. Ponds and canals are silent; a fountain on a tile with `ICE = 1` is silent.

### 4.6 Café
For every kiosk with a vendor: if at least one visitor is eating at the serving tile or a table, every `vrnd(4, 9)` s play `clink` at a table (50 %) or a far `murmur` (volume ×0.6, `voice` random) at a table (50 %). Idle kiosk: silent.

### 4.7 Boulevard (beyond the south railings)
When `viewCentreTile().y >= 36` and `T.light > 0.22`: every `vrnd(7, 15)` s a passing car: one `tone(90, 1.6, { to: 60, att: 0.5, gain: 0.010, bus: 'amb' })` with `pan` automated from −0.8 to 0.8 across the 1.6 s (`StereoPannerNode.pan.linearRampToValueAtTime`), plus `tone(180, 1.6, ...)` at ×0.4 for phones (7.5). With 15 % chance a `bell_bike` follows at d=0.4. No other traffic layer exists.

### 4.8 Rain
`rainAcc += dt × rain × 9`; one `plip` per unit (GV 6313). When `viewCentreTile()` is a gravel or flagstone tile the plip glide is `f×0.7` (a harder patter), else `f×0.8`. Under a kiosk awning (centre within 2 of a kiosk) add a second plip at d=0.02, 1 octave down, ×0.6.

### 4.9 Fireworks pacing
While `c_fireworks` is active (an `Effect` with `ability === 'c_fireworks'` is present in `abilities.effects()`, 03 §2.6), launch `fireworks` every `vrnd(1.2, 2.0)` **real** seconds at the fountain (or park centre (23.5, 23.5)) with pan `vrnd(−0.5, 0.5)`. Happily plays 3 launches at d=0, 0.9, 1.7 at the pair.

### 4.10 Crickets and the snow hush
1. Crickets: every `vrnd(2.5, 6)` s when `T.light < 0.2`, season is summer (1) or autumn (2), rain < 0.3 and snow < 0.3: GV `sfxCricket` 6271–6274 at `centre() ± 8` tiles.
2. Hush (3.2 row 30): when `W.snow > 0.5` ease the master lowpass to 1500 Hz and `verbGain` to 0.46; when snow ≤ 0.5 ease back to 2100 Hz and 0.36. Birds are already thinned by the probability; fountains on ice are silent (4.5).

### 4.11 Mist and the foghorn
When `mist > 0.6` (weather `mist` or `m_fog`): every `vrnd(20, 40)` s, 35 %: `foghorn` (3.2 row 23). Ease the master lowpass to 1700 Hz while mist > 0.6 (hush wins if both apply).

### 4.12 Bells
Distant church bells ring when `f` crosses one of `{0.28, 0.45, 0.58, 0.72, 0.80, 0.87}` (the daytime phase boundaries of 02 §3.2): 3 strokes 1.1 s apart, 6 strokes at 0.45. Stroke: `tone(196, 2.6, { att: 0.008, gain: 0.012, pan: −0.6, bus: 'amb' })` + `tone(392, 2.0, { att: 0.008, gain: 0.005, pan: −0.6 })` + `tone(523, 0.9, { gain: 0.003 })`. The whole peal is gated by `gate('bells', 20000, false, true)` (unscaled), so at 8× some crossings ring and others are skipped. No bells for night or dawn crossings.

### 4.13 What is not in the ambience
No stream burbles (no flow), no fire pops, no thunder, no wind, no chatter bed, no children's playground loop. Done when: with the park at `f = 0.50`, clear, 1×, the harness log over 30 real seconds contains songbird, fountain and pigeon decisions and nothing else; at `f = 0.05` in summer it contains crickets, at most one owl, and no songbird.

---

## 5. Music: the procedural musette waltz (`src/audio/music.ts`)

### 5.1 Form
1. Time signature 3/4. Tempo by state (5.6), base 164 BPM; range 120–176. Key G major; parted variant E minor (relative). A loop is 16 bars, four phrases of 4 bars.
2. All music timing is real time from `AC.currentTime`; the speed dial never changes it (section 1 item 3).
3. Frequencies from MIDI: `f = 440 × 2^((n − 69) / 12)`. Melody range G4 (67) to D6 (86). Bass octave 2 and 3.

### 5.2 Chord loop (bar: chord), seamless because bar 16 is V7 and bar 1 resolves
| Bar | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G major (rising, stroll) | G | G | D7 | D7 | D7 | D7 | G | G | G | G7 | C | C | G | D7 | G | D7 |
| E minor (parted) | Em | Em | B7 | B7 | B7 | B7 | Em | Em | Em | E7 | Am | Am | Em | B7 | Em | B7 |

### 5.3 Bass: oom-pah-pah
1. Beat 1: the chord root in octave 2 (G2 = MIDI 43), alternating with the fifth in octave 3 on even bars (D3 = 50). `tone(f, 0.55 × beat, { type: 'triangle', att: 0.01, gain: 0.034, bus: 'music' })` plus the octave above at ×0.4 for phone speakers (7.5).
2. Beats 2 and 3: the triad in octave 4 (root, third, fifth), three `tone()` calls of `0.42 × beat`, `type: 'sawtooth'` through the chord lowpass (5.5 item 4), gain 0.012 each, `att: 0.012`.
3. `beat = 60 / tempo` seconds.

### 5.4 Melody generator rules (visual RNG; one phrase planned at a time)
1. Scale: G major (G A B C D E F#). Chord tones of the current bar are preferred; C and F# are passing tones and may not start or end a phrase.
2. Phrase = 4 bars = 12 beats. The phrase starts on a chord tone of bar 1 within a fifth of the previous phrase's last note.
3. Rhythm: each bar takes one pattern from `[1,1,1]`, `[2,1]`, `[1,2]`, `[3]`, `[1,0.5,0.5,1]`, `[0.5,0.5,1,1]` by weights 30, 20, 15, 10, 15, 10. The 4th bar of a phrase is always `[2,1]` or `[3]` (the cadence); bar 16 is always `[3]` on the tonic (G5 or G4; E5 in minor) and that note is held through to beat 1 of bar 1 of the next loop (a tie, no rest at the seam), so bar 1 of every loop after the first uses a pattern starting on beat 2 (`[1,1]` or `[2]` over beats 2–3).
4. Intervals: next note by step 70 %, third 20 %, fourth to sixth 10 %; direction follows an arc: rising in bars 1–2, falling in bars 3–4 (60 % bias). A leap is followed by a step in the opposite direction. Never two leaps the same way.
5. Chord fit: on beat 1 of every bar the note must be a chord tone (move to the nearest one if the rule above lands on a passing tone). On beats 2–3 any scale tone.
6. Ornaments: a note of 2 beats or more gets vibrato (5.5 item 3) always, and a grace note (upper scale neighbour, 60 ms, ×0.7 gain) with 25 % chance. Half-beat pairs get no vibrato.
7. Density: a note is replaced by a rest with probability `1 − density` (5.6) except on beat 1 and at cadences.
8. Counter-line (rising state only): in phrases 2 and 4 a second voice plays the melody of the previous phrase a sixth below, ×0.5 gain, no ornaments.
9. Determinism: the generator takes `vrng` only; the melody of a new park is not reproducible from the seed and does not need to be (section 1 item 6).

### 5.5 The accordion voice
1. Per note: two `sawtooth` oscillators detuned −7 and +7 cents (the musette "wet" tuning), plus one `sawtooth` an octave up at ×0.35 (the piccolo reed). All three into one `GainNode` with the GV envelope: `att 0.03`, hold to `dur − 0.08`, release 0.08 (`hold` is used here, 2.1).
2. Per note: one lowpass 1900 Hz Q 0.7 after the gain (the bellows softness), then `musicBus`, with a reverb send of 0.6 (a separate `GainNode` into the convolver).
3. Vibrato: an LFO at 5.5 Hz, depth 0.3 % of `freq`, whose gain ramps from 0 to full between 0.15 s and 0.35 s after the note starts.
4. Chord voices (5.3 item 2): sawtooth, lowpass 1400 Hz, no vibrato. Bass: triangle, lowpass 600 Hz.
5. Melody gain 0.040, counter-line 0.020, chords 0.012 each, bass 0.034. The sum through `musicBus` 0.50 lands near −20 dBFS at the compressor input.
6. Do not use `square` for the melody; use it only in motif B's tines if the board needs it. Do not add a noise "breath".

### 5.6 Dynamics by game state (read once per bar from the simulation; applied at the next bar boundary)
| State (first match wins) | Condition | Tempo | Key | Layers | Density | Lowpass |
|---|---|---|---|---|---|---|
| flourish | `c_fireworks` active | 176 | G | all + counter-line every phrase; a 4-bar scale run up to D6 at entry | 1.0 | 2400 |
| parted | a Parted ending in the last 24 bars | 120 | Em | bass beat 1 only, melody; no chords, no counter-line | 0.45 | 1500 |
| happily | a Happily ending in the last 8 bars | 168 | G | all + counter-line | 1.0 | 2200 |
| night | `T.light < 0.22` | 140 | G | bass, melody | 0.55 | 1500 |
| rising | featured pair exists, stage ≥ 3, affinity now > affinity 30 sim s ago | 164 | G | all + counter-line (5.4 item 8) | 0.85 | 1900 |
| stroll | otherwise | 156 | G | bass, chords, melody | 0.70 | 1900 |
Rules: tempo changes only at a bar boundary, by at most 8 BPM per bar (so a jump from 120 to 176 takes 7 bars); key changes only at a phrase boundary (bars 4, 8, 12, 16); the lowpass eases with a 1 s time constant. For the `rising` test `music.ts` samples `(T.abs, affinity)` of the featured pair once per bar into a ring of 16 and compares against the sample nearest 30 sim s back; it writes nothing to the pair. **Busker rule**: while any busker (AI, `c_musician` or `a_busker`) is in state `play` with `audibleGain >= 0.05`, the melody and counter-line voices take `pan = panOf(busker)` and `musicBus` is scaled by `0.7 + 0.3a`, so the waltz seems to come from them; with no audible busker the pan is 0 and the scale 1. The change eases over 1 s; the music itself does not change. `avatar` mode: `musicBus` ×0.8 (default pending the Music Gate, brief 11 item 8).

### 5.7 Ducking (`duck(db, holdS)` on `musicBus`, and on `ambBus` for `mime`)
`musicBus.gain` = 0.50 × 10^(duck/20). A duck sets the target at once (`setTargetAtTime`, time constant 0.03 s), holds `holdS`, then recovers with a 0.25 s time constant. Triggers: `laugh`, `gasp`, `kiss`, `ring`, `happily`, `parted`, `unlock`: −6 dB for 0.6 s; `mime`: −18 dB for 0.6 s on both buses; `fireworks` launch: −3 dB for 0.3 s. Ducks do not stack; the deepest current value wins.

### 5.8 Start, scheduling, loop
1. The context is created on the Begin or Continue tap (GV 12216–12217). `startMusic()` is called 1.5 s later; `musicBus` fades from 0 to 0.50 over 4 s. Music is silent while the intro is up and while the Options sound setting is off (7.3).
2. Scheduler: `updateMusic(dt)` runs every frame and schedules every note whose start falls in `[AC.currentTime, AC.currentTime + 0.35 s)`; it keeps `barStart` (absolute context time of the current bar), `bar` (1–16) and `beat`. This look-ahead makes the loop gapless and immune to frame drops (the "two clocks" pattern).
3. The loop never fades: bar 16 ties into bar 1 (5.4 item 3) and the V7 resolves (5.2). A state change never restarts the loop; it changes tables for the next bar.
4. Hidden tab: `AC.suspend()` pauses the context clock, so the scheduler resumes exactly where it was (GV 12199). Mute: 7.3.
5. `stopMusic()` fades `musicBus` to 0 over 0.3 s and stops scheduling; used by New, by the board's Stop and by the sound-off option.

Do not: compute tempo from `T.speed`; read the sim RNG; schedule more than 0.35 s ahead; start a new loop on a state change; use `setTimeout` or `setInterval` for notes.

---

## 6. Music Gate specification (`music-board.html`)

### 6.1 Purpose and placement
1. One HTML page that plays the three motifs with the real engine (`src/audio/engine.ts`, `limiter.ts`, `music.ts`), so the owner picks on what the game will play (register §4 Music Gate; brief 4.2).
2. Source: `music-board.html` at the app root with its script in `src/debug/music-board.ts`; built by Vite as the third entry (after `style-board.html`) to `dist/music-board.html`, single file, the same arrangement as `style-board.html` (04 §4.1). Motifs B and C live in `src/debug/motifs.ts` and are never imported by `src/main.ts`.
3. It is built in Slice 1 and blocks music and cue tuning from Slice 8 on (register §4).
4. The page needs a first gesture: a banner **Tap to enable sound** that calls `initAudio()` and `resume()` on `pointerdown` (GV 12216–12217), then hides.

### 6.2 The three motifs
Each motif implements
```ts
export interface Motif { id: 'A' | 'B' | 'C'; name: string; play(variant: 'rising' | 'parted'): void; stop(): void;
  knobs: Record<string, { min: number; max: number; value: number }>; set(knob: string, v: number): void; }
```
| Motif | Name | Engine | Rising variant | Parted variant |
|---|---|---|---|---|
| A | Musette waltz | `music.ts` exactly as section 5 | state `rising` (5.6) | state `parted` |
| B | Music-box lullaby | kin of GV `sfxTune` 6195–6196: 3/4 at 84 BPM, C major pentatonic (C D E G A) over octaves 5–6; a tine = `sine` with `att 0.008` and a second `sine` at ×2.76 (the inharmonic partial) ×0.25 decaying in 0.25 s, note length 0.9 s regardless of beat (GV 6196); left hand: C4 G4 E5 on the three beats of every bar; melody: 12-note phrases drawn like GV's `[523, 659, 784, 880, 784, 659, 587, 523, 587, 659, 784, 1047]` by step and third, cadence on C; gains 0.016 as GV | C major pentatonic, 84 BPM, both hands | A minor pentatonic (A C D E G), 66 BPM, left hand on beat 1 only, melody density 0.5 |
| C | Café swing | 4/4 at 120 BPM, swing 2:1 on quavers, key F; chords per bar: F6 · Gm7 C7 · F6 · Gm7 C7 · B♭6 · B♭m6 · F6 D7 · Gm7 C7; walking bass on crotchets (`triangle`, lowpass 500, root, third, fifth, chromatic approach); "guitar" comp on beats 2 and 4 (three `triangle` notes, lowpass 1200, 0.15 s); melody on a clarinet voice (`sine` + `triangle` ×0.3 + `sine` at ×3 ×0.08, vibrato 6 Hz 0.5 % from 0.2 s), phrases of 2 bars with a rest in bar 2 | F major, full | D minor (Dm6 · Em7♭5 A7 · Dm6 · Em7♭5 A7 · Gm6 · Gm6 · Dm6 B♭7 · Em7♭5 A7), 96 BPM, bass on beats 1 and 3, no comp, density 0.5 |

### 6.3 Knobs (sliders; every motif exposes all of them, a motif may ignore one and say so in its caption)
| Knob | Range | Default A | Default B | Default C | What it drives |
|---|---|---|---|---|---|
| `tempo` | 0.8–1.2 × base | 1.0 | 1.0 | 1.0 | 5.1 base tempo; the state table scales with it |
| `detune` | 0–20 cents | 7 | 0 | 0 | 5.5 item 1 reed spread |
| `brightness` | 1200–3200 Hz | 1900 | 2600 | 1800 | per-voice lowpass |
| `reverb` | 0–0.6 | 0.36 | 0.45 | 0.30 | `verbGain` |
| `density` | 0.3–1.0 | 0.85 | 0.8 | 0.7 | 5.4 item 7 |
| `bass` | 0–0.06 | 0.034 | 0.016 | 0.030 | bass gain |
| `chords` | 0–0.03 | 0.012 | 0.012 | 0.010 | chord or comp gain |
| `vibrato` | 0–1 % | 0.3 | 0 | 0.5 | LFO depth |
| `level` | 0.2–0.8 | 0.50 | 0.50 | 0.50 | `musicBus` |

### 6.4 Layout and controls
1. Phone (width < 900 px): a sticky header with the title **Music Gate** and a segmented switch **A | B | C** (the `.grp` recipe, 04 §1.10); below it the chosen motif's panel. Desktop (≥ 900 px): three columns of 400 px, one per motif, headers "A Musette waltz", "B Music-box lullaby", "C Café swing". Safe areas and 16 px gutters as the shell.
2. Panel, top to bottom: a two-line caption of the motif; buttons **Play rising**, **Play parted**, **Stop** (`.gb` recipe); the nine knobs as labelled range inputs with their value; a `<pre id="readout-X">` showing the knob values as JSON, updated on every change; the button **Choose A** / **B** / **C** in the Begin-button recipe.
3. **Stop all** in the header. Playing a variant stops any other motif first (one context, one `musicBus`).
4. Under the panels a small **Cue bed** row: buttons `laugh`, `kiss`, `gasp`, `fireworks`, `splat` that play the real cues at `pan 0` over the music, so the owner hears the ducking (5.7).

### 6.5 Recording the pick
1. **Choose X** writes `profile.musicPick = 'A' | 'B' | 'C'` into `parque:profile-v1` through `src/save/store.ts` (register 3.11 names the field "music pick"; the TypeScript name is `musicPick`, section 9), shows the toast "Picked: Musette waltz" (through `t()`), and marks the button pressed.
2. The owner also tells the model which letter was picked and pastes the readout JSON; the model records the pick, the date and the knob values in the register §4 row (brief 10.2 rule 4). The profile field alone is not the record.
3. Until a pick exists the game plays motif A with the defaults of 6.3 (brief 4.2 item 2). If B or C is picked, the picked motif moves from `src/debug/motifs.ts` into `src/audio/music.ts` in Slice 8 and sections 5.1 to 5.6 are rewritten for it; sections 5.7 and 5.8 hold for every motif.
4. Done when: all six Play buttons make sound with no console error on desktop Chromium and on a 390×844 phone viewport, Stop silences within 0.3 s, every knob audibly changes its motif, Choose writes the profile, and the readout JSON parses.

---

## 7. Mixing plan

### 7.1 Buses and gains
| Node | Gain | Feeds |
|---|---|---|
| `cueBus` | 1.00 | `master` |
| `ambBus` | 0.85 (× duck for `mime`) | `master` |
| `musicBus` | 0.50 × duck (5.7); 0.40 in avatar mode pending the gate | `master` |
| reverb send | cues and ambience 1:1 unless `dry` (GV 6105); music 0.6 (5.5 item 2) | convolver → lowpass 1600 → `verbGain` 0.36 → `master` |
| `master` | 0.84 → lowpass 2100 → highshelf −6 dB @ 1100 → compressor → out | GV 6061–6066 |

### 7.2 Level ranges
1. Cues 0.003–0.060 peak (section 3). Ambience 0.003–0.024. Music voices as 5.5 item 5.
2. Worst case: five music voices + three cues + a bird + fountain at once sum below 0.3 at `master` input, which the compressor (−24 dB threshold, 3:1) holds under −10 dBFS at the output. No extra limiter is added; if a measured peak exceeds −6 dBFS (8.2 test 6) lower `musicBus`, not the chain.

### 7.3 Mute and sound off
1. `muted` is a profile setting (`parque:profile-v1` settings `muted`, register 3.11) restored at boot before `initAudio()`.
2. Mute: `master.gain.setTargetAtTime(0.0001, now, 0.02)` (a hard cut, fixing review note 12 §11 item 12), then `muted = true` so `tone()`, `cue()`, ambience and the music scheduler stop scheduling; the context stays running for 2 s then `suspend()`.
3. Unmute: `resume()`, `master.gain.setTargetAtTime(0.84, now, 0.04)`, `muted = false`; music resumes at the next bar.
4. The Sound button (rail row 3) reads "Sound" / "Muted" through `t()` with `aria-pressed` (GV 12164–12165); the Options sheet's sound on/off is the same setting.

### 7.4 Speed and pause
Cue gaps scale with `clamp(speed, 1, 8)` (2.4). Ambience and music ignore speed. On pause the sim emits nothing, so cues stop by themselves; ambience and music continue (section 9 item 4).

### 7.5 Phone speaker
1. A phone speaker rolls off below about 300 Hz: every cue or voice whose identity sits below 200 Hz carries a partial one octave up at 0.25–0.4 gain (bass 5.3, boulevard 4.7, bells 4.12, `lamp_hum`, `foghorn`). Nothing essential lives below 80 Hz.
2. The −6 dB shelf above 1100 Hz (GV 6063) protects small speakers from the grains and tines; do not raise it.
3. Pan is decoration, never information: a phone is mono. No cue depends on left/right to be understood.
4. iOS: `webkitAudioContext` fallback (GV 6058); call `resume()` on every `pointerdown` on the canvas while `AC.state !== 'running'`, not only on Begin; after a route change (headphones unplugged) the context may suspend, so the same rule recovers it. The ringer switch silences Web Audio on iOS in a plain web page; the Capacitor slice sets the playback session category (out of scope for v1).
5. Test every cue at 50 % phone volume: a cue that cannot be heard there is raised within the 0.060 ceiling or given a higher partial, never pushed through the compressor.

---

## 8. Testing

### 8.1 Manual, in Chrome (desktop, then a phone over USB)
1. Open the game with the dev flag; Begin; wait 2 s. Expect: the waltz fades in over 4 s; birdsong within 5 s at `f = 0.30` in spring.
2. Options → Sound check. Press every button in order. Expect: a sound for each; `happily`, `parted` and `unlock` duck the waltz audibly; `mime` makes a 0.6 s hole in everything.
3. Set 8×. Press `step_gravel` ten times quickly. Expect: at most one step per 0.56 s; the waltz tempo unchanged.
4. Pan the camera so the fountain is off screen left, then press nothing and listen 10 s. Expect: burbles move left and fade as the fountain leaves the 0.85-width window; no burble when it is fully out.
5. Let a pair reach Chat on screen. Expect: `murmur` alternates between two pitches (m and f) and never overlaps (the `voice` gate).
6. Cast `m_fog`; wait 20 s. Expect: a foghorn from the river side within 40 s; the mix is darker (lowpass 1700).
7. Advance to snow in winter. Expect: the hush (duller, more reverb); fountain silent once `ICE = 1`; no crickets.
8. Mute during a Happily chord. Expect: silence within 50 ms, not a ringing tail. Unmute: the waltz returns on the next bar.
9. Background the tab 10 s, return. Expect: the waltz continues from where it was, no doubled notes.
10. Trigger Parted. Expect: the key drops to E minor at the next phrase boundary, the tempo falls 8 BPM per bar to 120, chords vanish, and after 24 bars it rises back.

### 8.2 Automated (Vitest, no AudioContext)
1. `limiter.test.ts`: `gate('x', 100, false)` at 8× refuses until 800 ms; soft refuses until 415 ms; a call with `a < thresh` leaves `GAP` unchanged (the audibility-before-gate fix).
2. `cues.test.ts`: `Object.keys(CUES)` equals the 38 ids of 3.2 in order; no gain > 0.060; every `scope: 'actor'` row is a voice or step cue; every trigger event name in 3.2 is emitted at least once by a 3-day seeded run (the determinism fixture) captured through the bus.
3. `melody.test.ts`: with `vrng` seeded, `planPhrase()` is reproducible; every beat-1 note is a chord tone; no two leaps the same way; bar 16 is the tonic held 3 beats; range within 67–86.
4. `musicState.test.ts`: the table of 5.6 picks `flourish` over `parted` over `happily` over `night` over `rising` over `stroll`; tempo steps by at most 8 per bar.
5. `scheduler.test.ts`: `updateAmbience` driven by a fake clock and a fake `audibleGain` logs the expected decisions for the three fixtures of 4.13; `rngN` of the sim stream is unchanged across the run.
6. `peak.test.ts` (optional, runs under Chromium via puppeteer-core with `--autoplay-policy=no-user-gesture-required`): an `AnalyserNode` on the compressor output over 20 s of the sound check at 8× reports a peak ≤ −6 dBFS.

### 8.3 Harness (`src/debug/harness.ts`, `window.__PD.audio`)
```ts
__PD.audio = {
  cues: CueId[]; play(id: CueId, x?: number, y?: number): boolean;
  log: { t: number; id: string; x: number; y: number; a: number; played: boolean; why: 'muted' | 'inaudible' | 'gated' | 'ok' }[];  // last 200
  dryRun(on: boolean): void;   // tone() and grain() record to log instead of creating nodes
  state(): { on: boolean; muted: boolean; ctx: AudioContextState | 'none'; lowpass: number; verb: number };
  music: { state(): string; bar: number; tempo: number; key: 'G' | 'Em'; duck: number; start(): void; stop(): void };
  ambience: { centre(): { x: number; y: number }; timers(): Record<string, number> };
};
```
Headless scripts set `dryRun(true)` right after Begin, run 3 sim days at 8×, and assert on `log` and `music.state()` without any audio device. Done when: the 3-day screenshot run (brief 9 row 2) ends with `log.length === 200`, zero console errors and `rngN` equal to the silent run's.

---

## 9. Assumptions and open points

Values this document defines that the register does not (the owner can object to any; `06-Content-Tables.md` must copy them):
1. The 38 cue ids, triggers, recipes, gains, gaps, soft flags and scopes of 3.2; the `voice` pitch factors 1.19 and 0.84; the shared `voice` gate of 110 ms; the stride length 0.55 tile for `step_*`.
2. `grain()` as the one permitted noise primitive with its 0.12 s cap and 6-per-second ambience budget (1.2, 2.3 item 5). GV had no noise at all; the brief's cue list (gravel, splat, flutter) is the reason.
3. The three buses and their gains (7.1); `musicBus` 0.50 and the avatar-mode 0.40 pending the Music Gate (brief 11 item 8).
4. Ambience and music keep playing while paused; GV went silent (review note 12 §11 item 8). The park is still there when the clock stops.
5. Bird windows chorus `[0.20, 0.32)` and vespers `[0.76, 0.87)` (wider than 02 §3.2's dawn and dusk phases, which are too short for a chorus), the mist factor 0.4, the stage ≥ 5 bird colour (4.2); owl kept at 25 % on the far bank (4.3); no dove.
6. Fountain burble rate `clamp(1.5 + 2a, 1, 4)` (4.5); café, boulevard, rain, fireworks pacing, crickets in summer and autumn only, hush and mist filter targets, bells at the six phase boundaries with a 20 s unscaled gate (4.6–4.12).
7. The waltz: G major and E minor, the 16-bar loop, base 164 BPM, the rhythm pattern weights, the interval and ornament rules, the accordion recipe (±7 cents, piccolo reed ×0.35, lowpass 1900), the state table and its priorities, the ducking depths (5.1–5.7).
8. Motif B and C recipes and the nine knobs with their defaults (6.2, 6.3); the board file paths `music-board.html`, `src/debug/music-board.ts` and `src/debug/motifs.ts`, mirroring 04 §4.1 (03 §2.10 lists them; 07 S1.5 names the files).
9. The TypeScript field name `musicPick` for the register's "music pick" (6.5), following 04 §4.4's `stylePick`.
10. `muted` persisted in the profile settings and the hard-cut mute (7.3); `resume()` on every canvas `pointerdown` until running (7.5 item 4).
11. The dev flag that reveals the Sound check sheet is defined in `03-Technical-Architecture.md`; this document assumes the URL hash `#dev`.
12. Sound check button labels are the cue ids untranslated (code identifiers); the sheet title and the muted toast go through `t()` with the keys `sheet.sound.title` and `sheet.sound.muted` (2.6 item 2; `06-Content-Tables.md` owns the final key names). Brief 8.2 item 8 forbids inline UI text; ids are treated as data, not prose.
13. Children emit `laugh` and `gasp` only (3.3 item 3); the register's tone rule is about targeting, not about children making sounds.

Open points for the owner:
1. Music Gate: A, B or C, and the knob readout (6.5). Until recorded, Slice 8 does not start.
2. Should the waltz keep playing on pause (item 4), or should pause silence music and keep only ambience?
3. Avatar mode mix: `musicBus` 0.40 and the avatar's own cues at `a = 1` (always audible) are proposed; confirm at the Music Gate (brief 11 item 8).
4. Should bells ring at night crossings too (0.00, 0.20)? This document says no.
5. The review's question J59 asks for "richer waveforms than sines"; cues here stay sine and triangle, and only music uses sawtooth. Confirm, or allow triangle-plus-partial voices for `murmur` and `laugh`.
6. Register row 25 says "GV's tone engine ported"; this document changes `aOK`'s order (2.4 item 3) and makes mute a hard cut (7.3). Both are fixes the review recommended; confirm they count as "ported".

# Parque D'Amour: Technical Architecture

Version 1 · 2026-10-10 · Owner: Jeduthun Oosthuis · Author: Claude (design session)

**How to use this document.** This is the engineering contract for every code slice. Read `01-Decision-Register.md` (the register) and `00-Product-Brief.md` first, then this file, then `02-Game-Design.md` for the rules you are implementing. Every number, id and name here matches the register; where this document needed a value the register does not define, the value is defined here and listed in section 17 so the owner can see it. Section 2 is the module map: before you write a file, find its row, and write only what that row allows. "GV" is the owner's Gnome Village HTML (12,246 lines); "GV 1234" is an absolute line of that file as indexed in `10-Gnome-Village-HTML-Architecture-Review.md` (the review). PORT means copy the GV code and rename; ADAPT means keep the shape and change the rules; NEW means there is nothing in GV to copy. Code fragments show types and signatures only; they are not implementations.

---

## 1. Principles

Every rule below is a hard rule. A pull request that breaks one is wrong even if the game runs.

| # | Principle | Rule | Checked by |
|---|---|---|---|
| P1 | Deterministic fixed-step simulation | The simulation advances only in `simulate(SIM_DT = 1/60)` steps (GV `SIM_DT` 12054). The same seed and the same command log give the same state hash on any device at any speed (brief §9 row 5: 3 days = 64,800 steps). | `determinism.test.ts` |
| P2 | Commands only | The UI never writes simulation state. Every player action is a `Command { tick, side, kind, payload }` enqueued by the shell and applied by the loop at the start of a step (register 2.9; design §14). | grep: no import of `world/`, `entities/`, `play/` setters from `ui/` |
| P3 | The sim never reads the renderer | No file under `core/`, `world/`, `entities/`, `play/`, `save/` imports from `render/`, `audio/`, `ui/`, `debug/`. The sim never reads `cam`, screen size, `performance.now()`, `Date.now()` or `Math.random()`. The one exception is `core/loop.ts`, which reads the wall clock for the budget and never puts that value into a sim field. | oxlint `no-restricted-imports`; `strings.test.ts` greps |
| P4 | The renderer never writes the sim | `render/`, `audio/`, `ui/` read sim state and write nothing into it. Caches live on the render side in their own arrays (GV comment 771–779, 8172). | review of each render module |
| P5 | Ids, not references | Every cross-entity link in a record is a numeric id (`VisitorId`, `PairId`, `PropId`, `CreatureId`); 0 means none. No record holds another record (register 3.3; review §11 names the GV fields that would break a save). | `save.test.ts` round trip |
| P6 | Typed arrays for tiles | Per-tile data is a typed array of length `NC = 2304` indexed by `I(x, y) = y * N + x` (GV 612–673 pattern). No per-tile objects. | code review |
| P7 | Strings through `t()` | Every user-facing string, including `aria-label`, toast, feed, card, rail and status strings returned by the avatar cascade, is a key resolved by `ui/i18n.ts: t(key, params)` (register 3.12). | `strings.test.ts` |
| P8 | No framework | Plain DOM, one `<canvas>`, Canvas 2D, Web Audio. No React, no state library, no CSS framework (register 0, 3). | `package.json` dependencies: none at runtime |
| P9 | Zero image assets | No `<img>`, no `drawImage` from a file, no sprite sheet, no audio file, no runtime fetch. Fonts are bundled woff2 (brief §2). Offscreen canvases drawn by code are allowed (GV `treeSprite` 6782, `drawSky` 6525). | DevTools network tab after load: 0 requests |
| P10 | Two RNG streams | `rng()` (sim) decides what happens; `vrng()` (visual) decides only how it looks: particles, sky, sound, name of a passer-by's coat. Audio, render and UI never call `rng()` (GV 583–598). | `rngN` equality in the determinism test |

Do not:
1. Do not port GV terrain, water flow, erosion, sea, flood, construction or household code (review §14 right-hand column; brief §8.2). The ground is flat and water is static.
2. Do not keep a timer in real seconds inside the simulation. Audio gaps are the only real-time timers (GV `aOK` 6131).
3. Do not read `MODE` or `PLAYER` inside `entities/romance.ts`, `entities/needs.ts` or `core/weather.ts` (design §14.7).
4. Do not write a string literal that a player can see outside `src/ui/strings/`.
5. Do not call `Math.random()` anywhere, including tests; use `rng()`/`vrng()` or a seeded helper.

---

## 2. Module map

### 2.1 Dependency direction

Imports flow downward only. A module may import from its own row or any row above it. A module never imports from a row below it.

| Layer | Directories | May import |
|---|---|---|
| L0 | `core/` (rng, math, ids, clock, weather, events, commands) | `core/` only, with two named exceptions: `core/weather.ts` imports `world/grid.ts` for the `WET` layer it writes (section 3.2, 6.2 item 3), and `core/commands.ts` imports `play/mode.ts` (a leaf with no imports, section 2.6) for the mode rules of section 5.3 |
| L1 | `world/` | `core/` |
| L2 | `entities/` | `core/`, `world/`, `play/mode.ts` (a leaf, section 2.6) |
| L3 | `play/` | `core/`, `world/`, `entities/` |
| L4 | `core/loop.ts` | L0–L3 (it is the one `core/` file that imports upward; it is the conductor) |
| L5 | `save/` | L0–L3 types and state |
| L6 | `render/`, `audio/` | L0–L5 read only |
| L7 | `ui/` | L0–L6 read only, plus `core/commands.ts: enqueue` |
| L8 | `debug/`, `main.ts` | everything |

`styles/` is CSS, linked from `index.html` and inlined by the build.

### 2.2 `src/main.ts` (NEW; wiring pattern GV `boot` 12127–12222)

Responsibility: boot order and wiring only; no rules. Order: `setLang(profile.settings.lang)` → `applyDom()` → `showIntro(hasPark, onBegin, onContinue)` → on Begin: `initAudio()` (the autoplay unlock, GV 12216–12217), `genPark(seed)` through the `park.new` command, `centreOn(23.5, 23.5); cam.z = ZOOM_START (1.3)` (04 §5.1); on Continue: `initAudio()`, `restore(migratePark(loadPark()))`, `fitCam()` (section 11); then `initRender(canvas)`, `setupInput(canvas, handlers)`, `buildRail()`, `initHud()`, `start()`. Wires every DOM control to `enqueue(cmd)` or to a UI-only function (rotate, Fit, photo, sheets, language, mute). Registers `visibilitychange` and `pagehide` for autosave and audio suspend (GV 12199). Reads `#s=<seed>&halt` from the hash (GV 12097, 814) and writes `#s=<seed>` on a new park (GV 12115). Installs `debug/harness.ts` only when `import.meta.env.DEV`.

### 2.3 `src/core/`

| Module | Status | GV lines | Responsibility | Public API |
|---|---|---|---|---|
| `rng.ts` | PORT | 583–598 | Two mulberry32 streams with a draw counter. `rng` is the sim stream, `vrng` the visual stream. State is readable and settable for save and tests. | `seedSim(seed: number): void; seedVisual(seed: number): void; rng(): number; rnd(a?: number, b?: number): number; rint(a: number, b: number): number; pick<T>(arr: readonly T[]): T; chance(p: number): boolean; rngN(): number; simState(): number; setSimState(state: number, n: number): void; vrng(): number; vrnd(a?, b?): number; vrint(a, b): number; vpick<T>(arr: readonly T[]): T; vchance(p): boolean`; also `mulberry32(seed: number): () => number; visState(): number; setVisState(state: number): void` |
| `math.ts` | PORT | 578–582, 599–609 | `clamp, clamp01, lerp, smooth, TAU`, `noise2(seed)`, `fbm2`, `hx(hex)` (fixed for 3-digit hex), `mixc`, `css(rgb, alpha?)`, `cheb(ax, ay, bx, by)` (Chebyshev tile distance), `fnv1a(bytes): number`. | as named, plus `type XY = { x: number; y: number }; type RGB = [number, number, number]; fnvStep(h: number, input: string \| Uint8Array): number` (one FNV-1a step over a running hash: `fnv1a(input: string \| Uint8Array): number` is one step from `FNV_SEED`, and `store.ts`'s hasher chains `fnvStep` over its parts); constants `FNV_SEED` |
| `ids.ts` | NEW | (GV holds references, review §11) | One allocator per record type. Counters start at 1; 0 is "none". `PropId` is recycled through a free list so it always fits `OCC` (Uint16, max 65535). Counters are part of the park save. | `nextVisitorId(): VisitorId; nextPairId(): PairId; nextCreatureId(): CreatureId; nextPropId(): PropId; freePropId(id, reserve = false): void; releasePropId(id): void; reclaimPropId(id): boolean; nextEffectId(): EffectId; idsState(): IdsState; setIdsState(s): void` (an id freed with `reserve` is held for its undo entry, section 5.6 item 3, until `releasePropId` or `reclaimPropId`; `IdsState` keeps the counters, the free queue and the reserved ids); also `unallocPropId(id: PropId, recycled: boolean): void; propIdRecycles(): boolean; resetIds(): void; type GateId = 'g_south_w' \| 'g_south_e' \| 'g_west' \| 'g_east' \| 'g_north'; type Side = 'park' \| 'cupid' \| 'mischief'`; constants `PROP_ID_MAX` |
| `clock.ts` | ADAPT | 814–828 | `T` and the day bands of the register 3.2. `T.abs` is recomputed from the integer `tick` every step (no float drift). `light` is the piecewise-linear table of design §3.2, not GV's cosine. No `cold`, `thaw`, `ds`. | `const DAYLEN = 360; const SEASON_DAYS = 3; const START_ABS = 0.30; type Phase = 'night'\|'dawn'\|'morning'\|'midday'\|'afternoon'\|'golden'\|'dusk'\|'evening'; const T: { abs: number; f: number; day: number; season: 0\|1\|2\|3; light: number; speed: number; phase: Phase; lamps: boolean }; stepClock(tick: number): void; phaseOf(f: number): Phase; isNewDay(): boolean`; also `lightOf(f: number): number; lampsAt(f: number): boolean; seasonOf(day: number): Season; syncClock(tick: number): void; type Season = 0 \| 1 \| 2 \| 3`; constants `STEPS_PER_DAY, SEASON_KEYS, BANDS` |
| `weather.ts` | ADAPT | 829–881 | Global weather state machine with eased targets, plus the override list of design §3.5. Kinds exactly `clear, fair, cloudy, breeze, rain, shower, mist, snow`. Picks on the sim RNG by the per-season weight table of design §3.3. No storm front, no spate, no `tookBridge`. | `type WeatherKind = ...; const W: { kind: WeatherKind; next: number; cloud: number; rain: number; mist: number; snow: number; wind: number; windP: number; drift: number; wet: number }; stepWeather(dt: number, tick: number): void` (an override holds through `tick === until` and is removed on the first step with `tick > until`); `stepWet(dt: number): void; weatherAt(x: number, y: number): Readonly<{ kind: WeatherKind; cloud; rain; mist; snow; wind; light: number }>; addOverride(o: Override): EffectId; removeOverride(id): void; overrides(): readonly Override[]`; also `overridesState(): Override[]; setOverridesState(s: readonly Override[]): void; resetWeather(): void; kindForRoll(u: number, season: number): WeatherKind; forceWeather(kind: WeatherKind): void; markWetUnknown(): void; type OverrideKind = 'sunbeam' \| 'raincloud' \| 'fog'; type OverrideTargets`; constants `WEATHER_KINDS, WK, WEIGHTS, FIRST_CHANGE, CAP_OVERRIDES, WET_RISE, WET_FALL, WET_RAIN_MIN, WET_SNAP, OVERRIDE_TARGETS` |
| `events.ts` | NEW | (GV `logEv` 10717 is the nearest thing) | The event bus. `emit` delivers at once to sim listeners (`on`) and queues for frame listeners (`watch`); `drain(lite)` delivers the queue after the frame's sim steps. Event payloads carry ids and i18n params, never records. | `type EventKind = 'newday'\|'season'\|'formed'\|'stage'\|'happily'\|'parted'\|'embarrassed'\|'backfired'\|'cast'\|'unlock'\|'fx'\|'cue'\|'rejected'\|'applied'\|'avatarStatus'\|'mode'\|'warn'\|'step'\|'sit'\|'stand'\|'chat'\|'laugh'\|'linger'\|'watch'\|'proposal'\|'bouquet'\|'peck'\|'scatter'\|'fly'\|'swoop'\|'bark'\|'snatch'\|'wall'\|'eat'\|'arrive'\|'leave'\|'lampsLit'\|'sing'` (the triggers of 05 §3.2, §4 and 06 §17 are drawn from these and use these spellings); `type GameEvent = { kind: EventKind; tick: number; x?: number; y?: number; params?: Params; ids?: number[] }; on(kind, fn): void; watch(kind, fn): void; emit(ev): void; drain(lite: number): void`; also `markStep(): void; clearEvents(): void; queued(): number; clearListeners(): void; type EventFn = (ev: GameEvent) => void`; constants `QUEUE_CAP, LITE_FREE_STEPS` |
| `commands.ts` | NEW | (GV applies from the UI directly; review §4) | The `Command` union (section 5), `enqueue`, `applyCommand`, the log, rejection reasons, replay. Being core, it cannot import the conductor or the tools: `loop.ts` hands in the tick it stamps (`setTickSource`) and the step `replay` drives (`setStepper`), and each layer registers the handlers of its own kinds (`speed`, `park.new` and `debug.weather` from `loop.ts`; `tool` from `play/tools.ts`; `undo` from `play/undo.ts`; `visitor.call` from `entities/visitor.ts`, S4); a kind with no handler yet is `reason.not_here`. | `enqueue(c: CommandInput): Command; applyPending(tick: number, only?: ReadonlySet<CommandKind>): void; applyNow(c: CommandInput): Result; applyCommand(c: Command): Result; log(): readonly Command[]; setLog(cmds: readonly Command[]): void; replay(cmds: readonly Command[], upToTick: number): void; registerHandler<K extends CommandKind>(kind: K, fn: (c: Extract<Command, { kind: K }>) => Result): void; onResetCommands(fn: () => void): void; onRestoreCommands(fn: () => void): void; resetCommands(): void; clearPending(): void; pendingCount(): number; setTickSource(fn: () => number): void; setStepper(fn: () => void): void; fail(reason: ReasonKey): Result; type Result = { ok: true } \| { ok: false; reason: ReasonKey }; type Command; type CommandKind = Command['kind']; type CommandInput; type ReasonKey; type Hit; type Target; type ToolPayload; type AbilityId = (typeof ABILITY_IDS)[number]` (`CommandInput` is a `Command` without `tick` and `seq`; `ReasonKey` is any `reason.*` key; `Hit` has the shape of `render/project.ts`'s `Hit`, which core cannot import); constants `LOG_CAP, OK, ABILITY_IDS, AVATAR_SIDE` |
| `loop.ts` | PORT | 12013–12096 | `frame` and `simulate`: fixed step, speed dial, `nsMax`, wall budget, lite bits, perf laps. Section 4. Stores the rAF timestamp once per frame as `now()` for `audio/limiter.ts` and `debug/perf.ts`; it is the only file that reads `performance.now()`, `Date.now()` or the rAF `ts`. Registers the `speed`, `park.new` and `debug.weather` handlers; `newPark` is the one sim reset (section 2.2). Since S4 the step runs phases 5 (the regulars' day), 7, 8 and 9 and the planning tick of section 4.3 every `PLAN_STEPS`, counted in whole ticks; a new park also clears the staff and seeds its creatures; it imports `entities/brain.ts` once so the brain hands itself to `visitor.ts` (`setBrain`). | `const SIM_DT = 1/60; PLAN_STEPS` (the 1.2 s planning tick in steps, section 4.3); `PAUSED_KINDS: ReadonlySet<CommandKind>` (`speed` and `park.new`: what a paused frame applies, 4.6; owner 2026-10-13); `start(): void; simulate(dt: number, lite: number): void` (the code names it `_lite`: the lite bits act only in `events.drain`, 4.5); `tick(): number; setTick(n: number): void; now(): number; newPark(seed: number): void; setSpeed(v: number): void; nsMax(speed: number): number; budgetMs(speed: number): number; liteFor(speed: number): number; onFrame(fn: FrameFn): void; onFrameEnd(fn: FrameEndFn): void; type FrameFn = (dtr: number, steps: number) => void; type FrameEndFn = (simMs: number, restMs: number, totalMs: number, ts: number) => void; SP: Record<string, number>` |

### 2.4 `src/world/`

| Module | Status | GV lines | Responsibility | Public API |
|---|---|---|---|---|
| `grid.ts` | ADAPT | 567–568, 612–673 | Constants and the tile layers (section 3.2). `E` exists and is all zero. Derived `BLOCK` for pathing. | `const N = 48, S = 1, NC = 2304; I(x, y): number; inB(x, y): boolean; const KIND, WEAR, OCC, WATER, ICE, WET, PETALS, BEDC, PAVEDAY, E; const BLOCK: Uint8Array; markBlockDirty(): void; rebuildBlock(): void; enum Kind { lawn = 0, gravel, flagstone, bed, mulch, pond, canal }; layersState(): LayersState; setLayersState(s): void`; also `worldVersion(): number; propById(id: PropId): Prop \| undefined; addProp(spec: NewProp): Prop; putProp(p: Prop): boolean; removeProp(id: PropId, idTo: 'free' \| 'reserve' \| 'keep' = 'free'): Prop \| undefined; propsState(): Prop[]; setPropsState(list: readonly Prop[]): void; clearLayers(): void; type PropKind; type PropData; type Prop; type NewProp`; constants `KIND_KEYS, props` |
| `park.ts` | NEW | (GV island edges 642, 674) | Park bounds, apron size, gates, the backdrop specification (where the quay, river, boulevard bands, railings, street trees, facade blocks and skyline band sit, in world coordinates; section 7.4); none of it but `GATES` reaches the simulation. | `const APRON = 8; const GATES: readonly Gate[]; gateById(id: GateId): Gate; nearestGate(x, y, exclude?: GateId): Gate; isBoundary(x, y): boolean; isGateTile(x, y): GateId \| null; BACKDROP: BackdropSpec; bandRects(from, to); railPieces(); streetTrees(); facadeBlocks()`; also `streetLamps(): readonly StreetLamp[]; type Side4 = 'north' \| 'south' \| 'west' \| 'east'; type RailPiece = { id: number; side: Side4; x: number; y: number }; type StreetTree = { id: number; side: Side4; x: number; y: number }; type StreetLamp = { id: number; side: Side4; x: number; y: number }; type FacadeBlock`; constants `SKYLINE` |
| `gen.ts` | ADAPT | 885–911 (seed and reseed), 1022–1035 (site scoring loop shape) | The seeded starter park of design §2.5. Writes layers and props, nothing else. | `genPark(seed: number): void`; also `parkSeed(): number; setParkSeed(seed: number): void`; constants `POND_MIN` |
| `water.ts` | NEW | (not GV `waterStep`; see Do not) | Static bodies: pond/canal tile sets, connected-component size (for `c_rowboat`), bridge crossing search for the `bridge` tool, winter ice flag timing of design §3.3. | `waterBodies(): readonly Body[]; bodyAt(x, y): Body \| null; findCrossing(x, y): Crossing \| null; stepIce(dt): void`; also `syncIce(): void; resetIce(): void; iceState(): IceState; setIceState(s: IceState): void; type IceState = { on: 0 \| 1; snowT: number; dryT: number }`; constants `BRIDGE_MAX, ICE_ON_T, ICE_OFF_T, SNOW_MIN` |
| `wear.ts` | PORT | 1674–1687 | Desire paths: `wearStep(v, dt)` on lawn while moving, `decayWear()` once a sim second, the paving search of design §11.1 (adapted from GV 3366–3395). | `wearAt(v: Visitor, dt): void; decayWear(): void; findPavingRun(day): XY[] \| null; markPaved(i, day): void`; also constants `WEAR_MAX, WEAR_RATE, WEAR_WET_MAX, PAVE_SEED, PAVE_FOLLOW_WEAR, PAVE_FOLLOW, PAVE_MIN_RUN` |
| `charm.ts` | NEW | (nothing in GV) | The charm field (section 6.7): a base array rebuilt on a prop epoch, dynamic sources at query time, `{ total, player }` capped 6. | `charmAt(x, y, pairId = 0): CharmValue; markCharmDirty(): void; rebuildCharm(props, lampsLit): void; addSource(s: CharmSource): EffectId; removeSource(id): void; setPairCharm(pairId, kind, until): void; clearPairCharm(pairId, kind): void`; also `charmDirty(): boolean; type CharmValue = { total: number; player: number }`; constants `CHARM_CAP` |

### 2.5 `src/entities/`

| Module | Status | GV lines | Responsibility | Public API |
|---|---|---|---|---|
| `visitor.ts` | ADAPT | 1387–1399 (factory), 5689–5716 (`updateGnomes`), 4472–4504 (newcomer with cap and complementary rule) | The `Visitor` record, factory, arrivals scheduler, `stepVisitors` (spaceOut, needs, decide cadence, act, move), removal at a gate, caps. Holds the one mode branch (section 2.6). Registers the `visitor.call` command (S4). `brain.ts` hands it `decide`, `act` and `BUSY` through `setBrain` when it loads, so this file never imports the brain; the S3 tool hooks `standUpFrom`, `moveOffBlocked` and `someoneOn`; re-exports the `Prop`, `PropKind`, `Seeks` and `Sex` types (3.6). | `visitors: Visitor[]; byId(id: VisitorId): Visitor \| undefined; people(): number` (the people in the park, cameos excluded, 3.11); `spawnVisitor(arch: Archetype, gate: GateId, opts: SpawnOpts = {}): Visitor \| null` (null at the cap); `arriveGroup(arch: Archetype, gate: GateId): Visitor[]; stepArrivals(dt: number): void; callVisitor(gate?: GateId \| null): Result; removeVisitor(id: VisitorId): void; leaveIfOutside(v: Visitor): boolean; stepVisitors(dt: number): void; setAvatarDecide(fn: (v: Visitor) => void): void; setBrain(fns: BrainFns): void; decideCadence(v: Visitor, dt: number, decide: (v: Visitor) => void, busy: Readonly<Record<string, true>>): void; standUpFrom(propId: PropId): void; moveOffBlocked(tiles: readonly number[]): void; someoneOn(tiles: readonly XY[]): boolean; putVisitor(rec: Visitor): boolean; signatureOf(lookSeed: number): number; nowTick(): number; gateForRoll(u: number): GateId; archetypeForRoll(u: number): Archetype; capArchetype(a: Archetype): Archetype; targetPeople(phase: Phase, kind: WeatherKind, season: number): number; currentTarget(): number; compatible(a: { sex: Sex; seeks: Seeks }, b: { sex: Sex; seeks: Seeks }): boolean; needsReroll(sex: Sex, seeks: Seeks): boolean; visitorsState(): Visitor[]; setVisitorsState(list: readonly Visitor[]): void; arrivalsState(): ArrivalsState; setArrivalsState(s: ArrivalsState): void; resetVisitors(): void; type Archetype; type Visitor; type AgeWord = 'young' \| 'grown' \| 'elder'; type EmbKind; type Job; type Items; type SpawnOpts; type BrainFns; type ArrivalsState = { arrivalT: number }`; re-exports `type Prop, PropKind` (from `world/grid.ts`) and `type Seeks, Sex` (from `names.ts`); constants `CAP_PEOPLE, CAP_ARTISTS, CAP_AI_BUSKERS, CAP_DOGWALKERS, ARRIVAL_GAP_MIN, ARRIVAL_GAP_MAX, VISIT_MIN, VISIT_MAX, VISIT_TOURIST, CALL_SINGLE, TOURIST_PAIR, DECIDE_MIN, DECIDE_MAX, COMFORT_START, SIGNATURES, NEVER, PHASE_TARGET, WEATHER_ARRIVALS, SEASON_ARRIVALS, ARCHETYPE_WEIGHTS, SEEKS_WEIGHTS, PARENT_WAIT` |
| `needs.ts` | ADAPT | 5552–5590 | Needs rates and the comfort target of design §4.4. Reads `weatherAt`, lamps, time. | `stepNeeds(v: Visitor, dt: number): void; comfortTarget(v: Visitor): number; seasonTerm(season: number, phase: string): number; SHELTERED: Readonly<Record<string, true>>` (the states in which rain lowers nothing, design §5.3); constants `HUNGER_DAY, ENERGY_AWAKE_DAY, ENERGY_BENCH_DAY, SOCIAL_DAY, COMFORT_EASE, COMFORT_BASE, LAMP_NEAR, LAMP_NIGHT, RAIN_K, SNOW_K, MIST_K, SUNBEAM_K, WEATHER_TERM` |
| `brain.ts` | ADAPT | 4809–4945 (ladder shape), 4742 (child play) | The decide ladder of design §5.2 and the archetype routines of design §4.3. Returns nothing; sets `v.st` and `v.job`. Rung 6 calls `romance.ts` `romanceStep` (S5 fills it); the reaction table of design §6.4 (`REACTION`); hands `decide`, `act` and `BUSY` to `visitor.ts` through `setBrain` when it loads (`loop.ts` imports it for that). | `decide(v: Visitor): void; const BUSY, CAN_INTERRUPT, NO_SPACE, SHELTERED: Readonly<Record<string, true>>` (`NO_SPACE` re-exported from `move.ts`, `SHELTERED` from `needs.ts`); `REACTION: Readonly<Record<EmbKind, readonly [string, number]>>`; constants `RAIN_SHELTER, COMFORT_SHELTER, COMFORT_LEAVE, HUNGER_EAT, ENERGY_REST, R_SHELTER, R_KIOSK, R_REST_BENCH, R_WANDER, R_CHILD_CHASE_PIGEON, CHILD_CHASE, KIOSK_QUEUE` |
| `act.ts` | ADAPT | 4968–5516 (the `goX → X (timer) → idle` idiom), 4548–4556 (`swingStep`, `LAY_T`) | The state machine: every `st` string, its timer, and what it does when the timer ends. Has a `default` case that logs once and sets `idle`. Since S4: a seat promised in its prop's `sitters` when the walk starts, the kiosk's one eater and its queue, the feeder's crumbs, the artist's easel, busking, the gardener's paving and tidying, and the helpers `brain.ts` starts each errand with; the reaction states and backfire scenes are S5's. | `act(v: Visitor, dt: number): void; DOING` (a readonly tuple of the state names, for `t('doing.' + st)`); `finish(v: Visitor, idle = rnd(IDLE_MIN, IDLE_MAX)): void; standUp(v: Visitor): void; release(v: Visitor): void; startWalk(v: Visitor, st: string, job: Job, x: number, y: number, t = 0): void; startSeat(v: Visitor, p: Prop, st: string, kind: string, t: number, partner = 0): boolean; startKiosk(v: Visitor, k: Prop, st: 'goKiosk' \| 'goEat'): boolean; startLoop(v: Visitor, loop: number): void; startLeave(v: Visitor, gate: GateId): void; startLeaveNearest(v: Visitor, avoid: (g: GateId) => boolean = () => false): void; startShelter(v: Visitor, x: number, y: number): void; lapsOf(v: Visitor): number; dropStrayEasels(): void` (the planning tick's easel check, section 4.3); `resetActWarnings(): void`; constants `IDLE_MIN, IDLE_MAX, KIOSK_EAT_T, KIOSK_HUNGER, SNACK, QUEUE_WAIT, REST_UNTIL, REST_MAX, SHELTER_MAX, SHELTER_END_RAIN, FEED_T, CRUMBS_EVERY, PHOTO_T, PAINT_DAYS, BUSK_T, BUSK_T_SUMMONED, CHESS_T, POND_T, CHILD_NEAR, CHILD_PLAY_R, SPD_CHILD` |
| `move.ts` | PORT | 1569–1598 (`goTo`, route reuse, `openNear`), 1600–1673 (`moveGnome` skeleton), 5593–5621 (`nudge`, `spaceOut`) | Walking along a path at the speeds of design §5.4; arrival and waypoint radii; replan cooldown; blocked memory; crowd separation in screen space at zoom 1 (10 × 8 px, computed with `TW/2, TH/2`, never with `cam`). | `goTo(v: Visitor, tx: number, ty: number, force = false): boolean` (false: the path is partial, which does not prove the target unreachable); `moveStep(v: Visitor, dt: number): boolean` (true when the walker moved); `openNear(x: number, y: number, r: number = R_OPEN_NEAR): XY \| null; spaceOut(list: readonly Visitor[], dt: number): void; nudge(v: Visitor, dx: number, dy: number): boolean; speedOf(v: Visitor): number; blockTarget(v: Visitor, x: number, y: number): void; blockedFor(v: Visitor, x: number, y: number): boolean; giveUp(v: Visitor): void; NO_SPACE: Readonly<Record<string, true>>`; constants `SPD_ADULT, SPD_CHILD, SPD_ELDER, SPD_JOGGER, SPD_PAIR, SPD_CHASE, R_ARRIVE, R_WAYPOINT, REPLAN_T, GIVE_UP_STEPS, BLOCKED_MEMORY_T, CAP_BLOCKED_MEMORY, R_OPEN_NEAR, BLOCKED_NEAR, GIVE_UP_FAR, OPEN_NEAR_JITTER, NO_TARGET, SEP_RX, SEP_RY, ISO_TW, ISO_TH` |
| `astar.ts` | PORT | 1412–1416 (scratch), 1427–1465 (`stepCost` reduced), 1466–1510 (`findPath`) | 8-connected A* with preallocated typed scratch, octile heuristic, node budget 2600, partial path, no corner cutting. Costs from design §5.5. | `findPath(sx: number, sy: number, tx: number, ty: number, who: PathWho = {}): PathResult` (`partial`: the path ends at the reachable tile closest to the target, also when the node budget ran out on a reachable one); `stepCost(j: number): number; walkable(x: number, y: number, who: PathWho): boolean; ownOutside(x: number, y: number, who: PathWho): Gate \| null; pathCost(from: XY, path: readonly XY[]): number; PFSTAT; type PathWho = { gateIn?: GateId \| null; gateOut?: GateId \| null }; type PathResult = { path: XY[]; partial: boolean }`; constants `ASTAR_NODES, STEP_COST, BRIDGE_COST, H_SCALE, DIAG` |
| `romance.ts` | NEW | 4338 and 5483–5491 (the `court` rendezvous shape only) | Pairs, stages, prerequisites, affinity, charm conversion, decay, endings, featured pair (design §6). | `pairs: Pair[]; pairById(id): Pair \| undefined; tryForm(a: Visitor, b: Visitor, skipRoll?: boolean): Pair \| null; nextStageReady(p): boolean; startStage(p): void; completeStage(p): void; interruptStage(p, retry: number): void; stepRomance(dt): void; featured(): Pair \| null; setPin(id: PairId \| 0): void; dissolve(p, ending: 'happily'\|'parted'\|'left'): void` Until S5 the file exports only the placeholder `SLICE` and `romanceStep(_v: { id: number; pairId: number }): boolean`, rung 6 of the decide ladder, which `brain.ts` calls and which returns false while there are no pairs (S4). |
| `creatures.ts` | ADAPT | 1753–1935 (critter framework, `dogStep` companion idiom), 2286 (`landBird` perch idiom), 8569–8598 (bird flight shape for the renderer) | Pigeons, dogs on leads, the pomeranian; crumbs behaviour (design §11.2–11.4). Since S4: pigeons in the states `walk, peck, perch, fly, scatter`, seeded at a new park and topped up by the planning tick; a gathering at crumbs announced once per crumbs prop (`gatheredState`, saved in `sched`); a walker's dog; the pomeranian's record waits outside until S6. | `creatures: Creature[]; creatureById(id: CreatureId): Creature \| undefined; count(kind: CreatureKind): number; dogCount(): number; spawnPigeon(): Creature \| null; spawnPigeonAt(x: number, y: number): Creature \| null; spawnDog(ownerId: VisitorId): Creature \| null; thePomeranian(): Creature; seedCreatures(): void; topUpPigeons(tick: number): void; dropCrumbs(x: number, y: number, ownerId: VisitorId): void; stepCreatures(dt: number): void; scatterNear(x: number, y: number, r: number): void; perchAll(until: number): void; creaturesState(): Creature[]; setCreaturesState(list: readonly Creature[]): void; gatheredState(): number[]; setGatheredState(s: readonly number[]): void; resetCreatures(): void; type Creature; type CreatureKind = 'pigeon' \| 'dog' \| 'pomeranian'`; constants `CAP_PIGEONS, CAP_DOGS, PIGEONS_START, PIGEON_TOPUP_STEPS, SPD_PIGEON_WALK, SPD_PIGEON_FLY, SPD_DOG, R_SCATTER_JOGGER, R_SCATTER_DOG, R_SCATTER_POM, R_SCATTER_CHILD, SCATTER_T, SCATTER_D, R_CRUMBS_ATTRACT, CAP_PIGEONS_PER_CRUMBS, PECK_T, CRUMBS_LIFE_STEPS, GATHERING_N, DOG_LEAD` |
| `staff.ts` | NEW | (GV paving plan 3393–3395 for the idea) | Gardener and vendor routines of design §4.3; paving job execution. Since S4 also the facility index of the planning tick (section 4.3 item 1), the seats a prop promises in its `sitters`, and the S3 tool hooks `vendorArrive`, `vendorLeave` and `vendorReturn`; the undo of a kiosk placement hands its vendor's `VisitorId` back, the one exception to 3.1's no-recycling rule. | `ensureGardener(tick: number): void; gardener(): Visitor \| undefined; vendorFor(kioskId: PropId): VisitorId; spawnVendor(kioskId: PropId): Visitor \| null; ensureVendors(): void; vendorArrive(kioskId: PropId): void; vendorLeave(kioskId: PropId, handBack = false): VendorRecord \| null; vendorReturn(kioskId: PropId, rec: VendorRecord \| null): void; stepStaffPlanning(tick: number): void; paveNext(): XY \| null; paveAdvance(): void; paveStarted(x: number, y: number): boolean; pavingState(): PavingState; setPavingState(s: Partial<PavingState> & { runsToday: number; day: number }): void; facilities(): Facilities; servingTile(k: Pick<Prop, 'x' \| 'y' \| 'h'>): XY; approachOf(p: Prop): XY \| null; seatPos(p: Prop, k: number): XY; holdsSeat(p: Prop, id: VisitorId): boolean; liveSitters(p: Prop): VisitorId[]; freeSeats(p: Prop): number; ringOf(x: number, y: number): number; tileXY(i: number): XY; nearestTile(list: readonly number[], x: number, y: number, r = Infinity): number; resetStaff(): void; type Facilities; type VendorRecord = Visitor & { heldAt?: number }; type PavingState = { runsToday: number; day: number; run: XY[]; at: number }` (the save's `paving`, 3.10); constants `GARDENER_ENTER_STEPS, PAVE_STEPS, CAP_PAVING_RUNS_DAY, LAY_T, TIDY_T, TIDY_EVERY, SEATS, LOOP_CORNERS, LOOP_MIN_TILES, R_FAMILY_LAWN` |
| `embarrass.ts` | NEW | 4640 (`jostle`: the creator never hurts), 4658–4701 (mishap transition framework) | Landing an embarrassment: refusals (child, cap 3, staff), backfire roll, cost table, reaction state, feed and points events (design §6.4). Exports exactly the ten kinds. | `const EMB_KINDS = ['poop','soaked','trip','snatched','wasp','drenched','rival','mime','fog','flock'] as const; land(kind: EmbKind, victim: VisitorId, source: Side): LandResult; canTarget(v): Result; resetDay(): void` Until S5 the file exports only the placeholder `SLICE`. |
| `names.ts` | NEW | 1360 (`NAMES` idea only) | French first names (40 per sex), the eight regulars with `seeks`, name reservation, regular memory and return scheduling (design §4.5). | `REGULARS: readonly RegularDef[]; takeName(sex: Sex): string; releaseName(name: string): void; namesHeld(): string[]; regularDef(regularId: number): RegularDef \| undefined; regularDue(day: number, f: number): RegularDef \| null; regularArrived(regularId: number, visitorId: VisitorId, day: number): void; regularLeft(regularId: number, day: number): void; rememberPair(regularId: number, m: RegularMemory): void; stepRegularReturns(): void; regularsState(): RegularState[]; namesState(): NamesState; setNamesState(s: NamesState): void; resetNames(): void; type Sex = 'f' \| 'm'; type Seeks = 'f' \| 'm' \| 'any'; type RegularDef; type RegularMemory = { partnerId: number; affinity: number; stage: number; lastDay: number }; type RegularState; type NamesState = { held: string[]; regulars: RegularState[]; arrivedDay: number; arrivedToday: number }` (the save's `regulars` are `regularsState()`; `held`, `arrivedDay` and `arrivedToday` go into its `sched`, 3.10); constants `NAMES_F, NAMES_M, GARDENER_NAME, CAP_REGULARS_DAY, RETURN_DAYS_MIN, RETURN_DAYS_MAX, ARRIVE_F_MIN, ARRIVE_F_MAX, AFF_DECAY_DAY, FIRST_VISIT` |

### 2.6 `src/play/`

| Module | Status | GV lines | Responsibility | Public API |
|---|---|---|---|---|
| `mode.ts` | PORT | 5630 (`PLAYER`, `MODE`), 11252–11269 (`setMode`), 12107 (reset on new) | A leaf with no imports. Holds `MODE` and `PLAYER`. `PLAYER` is the possessed actor's id, or 0 where the register says "null" (P5: 0 is none). `setMode` is called only by `applyCommand` (`avatar.enter`, `avatar.leave`, and `park.new` through `loop.newPark`, which returns to `'creator'` with `PLAYER` 0) and by `store.restore` (the saved `mode`). The body class and button text are applied by `ui/hud.ts` from a `mode` event, not here. | `type Mode = 'creator'\|'avatar'; getMode(): Mode; getPlayer(): number` (a `VisitorId` or `CreatureId`, 0 for none); `getAvatar(): AvatarId \| null; setMode(m: Mode, avatar?: AvatarId, actor?: number): void; PLAYER_HOLD: Record<AvatarId, Record<string, true>>` (`PLAYER_HOLD` comes with S7); `type AvatarId` |
| `avatar.ts` | ADAPT | 5632–5641 (`playerArrive`), 5642–5651 (`playerDecide`), 5653–5688 (`playerTap` cascade), 11270–11279 (`playerCommand`) | Per-avatar actor lookup or spawn, `avatarDecide` (registered into `visitor.ts` at boot), the six tap cascades of design §10.4–10.9 returning a status key. | `AVATARS: readonly AvatarDef[]; enterAvatar(id: AvatarId): Result; leaveAvatar(): void; avatarTap(tile: XY, hit: Hit): StatusKey; avatarDecide(actor): void` Until S7 the file exports only the placeholder `SLICE`. |
| `abilities.ts` | NEW | 5840–5989 (ghost `{ ok, msg }` validation shape), 2386 (`P` cap idea for effect lists) | The registry of 19 abilities with tier, cooldown, charges, target type; per-side cooldowns and charges; validation; the active effect list and its timelines (design §9). | `ABILITIES: readonly AbilityDef[]; abilityById(id): AbilityDef; canCast(side, id, target): Result; cast(side, id, target): Result; cooldownLeft(side, id): number; chargesLeft(side, id): number; stepAbilities(dt): void; effects(): readonly Effect[]; resetCharges(): void` Until S6 the file exports only the placeholder `SLICE`. |
| `tools.ts` | ADAPT | 11118–11126 (brush kernel), 5840–5989 (`pbGhost` ranked reasons), 5991 (`pbTap` runs), 6005 (`pbPlace`) | The 16 park tools: validation with ranked reasons, ghost computation (pure, no side effects), commit, run building. | `TOOL_IDS; type ToolId; type ToolClass = 'brush'\|'stamp1'\|'stampBig'\|'run'\|'none'; type Footprint; type ToolDef = { id; class; footprint; labelKey; hintKey; icon; col }; TOOLS: readonly ToolDef[]; toolById(id: ToolId): ToolDef; CAP_PROPS_SOFT = 600; CAP_KIOSKS = 3; CAP_BANDSTANDS = 1; CAP_RUN_TILES = 14; BRUSH_SIZES = [1, 2, 3]; footprint(x, y, w, h): XY[]; propAt(x, y): Prop \| undefined; type GhostOpts = { size?: number; run?: readonly XY[] }; ghost(tool: ToolId, at: XY, opts?: GhostOpts): Ghost; servingTile(kiosk): XY; nextSpecies(): 0\|1\|2; setNextSpecies(s: number): void; applyTool(p: ToolPayload): Result; type Ghost = { ok: boolean; tiles: XY[]; reason?: ReasonKey }` |
| `undo.ts` | ADAPT | 11086–11116 (stack of 10, `beginStroke`, restore, `showUndo`) | Inverse records per park command, grouped by stroke, 10 deep. Section 5.6. | `UNDO_DEPTH = 10; type TileBefore = { i; KIND; WEAR; WATER; OCC; BEDC }; type Inverse` (5.6 item 2); `newInverse(strokeId: number): Inverse; keepTile(inv: Inverse, i: number): void; record(inv: Inverse, strokeId: number): void; canUndo(): boolean; depth(): number; undoTop(): Inverse[] \| null; clearUndo(releaseIds = true): void; settle(touched: readonly number[], kinds: boolean): void; onRevert(fn: (inv: Inverse) => void): void` |
| `progression.ts` | NEW | (GV has none, review §10) | CP and MP, tiers, unlock checks, day tally; subscribes to `stage`, `happily`, `embarrassed`, `parted` events. Writes the profile points through `save/store.ts`'s in-memory profile, never localStorage directly. | `TIERS = [0, 8, 20, 40, 70]; points(): { cp: number; mp: number }; tier(side): 0\|1\|2\|3\|4; isUnlocked(id: AbilityId \| AvatarId): boolean; nextUnlock(side): UnlockInfo \| null; dayTally(): { cp; mp }; stepProgression(): void` Until S6 the file exports only the placeholder `SLICE`. |

### 2.7 `src/render/`

| Module | Status | GV lines | Responsibility | Public API |
|---|---|---|---|---|
| `camera.ts` | PORT | 6331–6358 (`cam`, `resize`, `setAngle`, `rotXY`, `turnStep`), 6400–6416 (`fitCam`, `clampCam`), 11168–11230 (`setupInput`), 11280–11322 (follow, `focusY`, `keepCentre`, `centreOn`), 12142–12154 (quarter turns, Fit) | Camera state, gestures, follow. Taps and paints are delegated to handlers, never interpreted here; a drag sample more than one tile (Chebyshev) from the gesture's last sample, under the same camera, paints every park centre of `lineTiles` to it, one `onPaint` each (owner 2026-10-13: a drag fills its gaps; section 8.1 item 4). Section 8. | `cam: Cam; resize(canvas?: HTMLCanvasElement): void; fitCam(): void; clampCam(): void; turn(dir: -1\|1): void; setupInput(canvas, h: InputHandlers): void; followStep(dt): void; turnStep(dt): void; keepCentre(): void; centreOn(x, y): void; follow(target: FollowTarget \| null): void; viewCentreTile(): XY` (the tile under screen point `(cw/2, 0.45 * chh)`; GV `midG` 10785; 05 §2.6 item 3); `lineTiles(a: XY, b: XY): XY[]` (the Bresenham centres from a to b, a left out; owner 2026-10-13); also `setAngle(a: number): void; rotXY(x: number, y: number): XY; rotInto(x: number, y: number, out: XY): XY; invRot(rx: number, ry: number): XY; rotVec(gx: number, gy: number): XY; sxOf(rx: number, ry: number): number; syOf(rx: number, ry: number, e = 0): number; screenToWorld(sx: number, sy: number, out: XY = { x: 0, y: 0 }): XY; setViewport(cw: number, chh: number, dpr: number): void; apronBox(): { a: number; b: number; c: number; d: number }; fitToggle(): 'whole' \| 'start'; setFollowLookup(fn: FollowLookup): void; followed(): FollowTarget \| null; focusY(): number; viewCentreWorld(): XY; stepCamera(dt: number): void; pinching(): boolean; type TurnKeep = { x: number; y: number; sx?: number; sy?: number; pinch: boolean }; type FollowPos = { x: number; y: number; e: number }; type FollowLookup = (kind: 'visitor' \| 'creature', id: number, out: FollowPos) => boolean; type ToolClass = 'hand' \| 'brush' \| 'other'`; constants `TW, TH, EH, VANCH, CTR, ZMIN, ZMAX, ZOOM_START, BOX, view, TAP_PX, TAP_MS, PAINT_FIRST_MS, PAINT_EVERY_MS, TWIST_DEAD` |
| `project.ts` | PORT | 6382–6384 (`sxOf`, `syOf`, `screenOf`), 6423–6443 (`screenToTile`, `ptInQuad` without allocation), 11231–11250 (`tapSelect` hit test) | World to screen, screen to tile, the hit test with priority people > creatures > props > tile. Since S4 the people and creature branches read the lists `render/people.ts` builds each frame (`main.ts` hands them in): a visitor by its head point, a sitter at its seat. | `screenOf(x: number, y: number, e = 0): XY; screenInto(x: number, y: number, e: number, out: XY): XY` (the same, without allocation); `screenToTile(sx: number, sy: number, allowApron = false): XY \| null; pickAt(sx: number, sy: number, people?: readonly PickPerson[], creatures?: readonly PickCreature[]): Hit; type Hit = { kind: 'visitor'\|'creature'\|'prop'\|'tile'\|'none'; id: number; tile: XY \| null }; type PickPerson = { readonly id: number; readonly x: number; readonly y: number; readonly e?: number }; type PickCreature`; re-exports `sxOf, syOf` (from `camera.ts`); constants `PICK_PERSON_PX, PICK_PERSON_BIAS, PICK_HEAD, PICK_CREATURE_PX, PICK_CREATURE_HEAD, PICK_PROP_BOX` |
| `order.ts` | PORT | 6359–6381 (`orderBy` counting sort) | Depth sort of the entity list each frame (ground needs no sort: it is flat). | `sortByDepth(items: Drawable[]): void; depthOf(x, y): number`; `footprintDepth(x: number, y: number, w: number, h: number): number; type Drawable` (a multi-tile prop at the largest depth of its footprint, GV `frontKey` 9634); constants `DEPTH_BUCKETS` |
| `ambient.ts` | PORT | 6445–6478 | Palette constants: the three palettes and treatments of 04 §3.1, §3.2 and §4.5, here and nowhere else. The Style Gate passed on 2026-10-12 with **A Storybook** (register row 1 and §4), so `DEFAULT_STYLE = 'A'` and `style()` returns direction A, the picked default; the B and C entries stay only so `style-board.html` still renders (04 §3.4). `computeAmbient`, `lit`, `GC` memo (900 keys), season tint. | `PALETTES; STYLES; DEFAULT_STYLE = 'A'; style(): StyleSpec; computeAmbient(): void; lit(c: RGB): RGB; GC(h: string, a?: number): string; AM, AA, AT, FOGA` (`style()` returns `STYLES.A`; `PAL` in this document means `style().palette`); also `isStyleId(v: unknown): v is StyleId; seasonMix(abs: number = T.abs): SeasonMix; seasonHex(bySeason: (s: Season) => string, abs: number = T.abs): string; computeAmbientAt(f: number, light: number, cloud = 0, mist = 0, rain = 0, snow = 0): void; lampGlow(f: number = T.f): number; shade(h: string, L: number, a?: number): string; toHex(c: RGB): string; nightW(c: RGB, spec: StyleSpec = style()): RGB; mix(a: string, b: string, t: number): string; scaleHex(h: string, k: RGB): string; faceLight(nx: number, ny: number): number; skyRamp(spec: StyleSpec, f: number): [RGB, RGB]; nzAt(u: number, v: number): number; grain(x: number, y: number): number; h01(a: number, b: number, c = 0): number; ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 20, rot = 0): Pt[]; inkWidth(pen: Pen): number; inkLine(pen: Pen, pts: Pt[], o: ShapeOpts = {}): void; fillPoly(pen: Pen, pts: Pt[], hex: string, o: ShapeOpts = {}): void; strokeLine(pen: Pen, pts: Pt[], hex: string, width: number, o: ShapeOpts = {}): void; fillEllipse(pen: Pen, cx: number, cy: number, rx: number, ry: number, hex: string, o: ShapeOpts = {}): void; type StyleId = 'A' \| 'B' \| 'C'; type Palette; type SeasonMix = { from: Season; to: Season; k: number }; type SkyKey = { f: number; t: string; b: string }; type Pt = { x: number; y: number }; type Pen = { ctx: CanvasRenderingContext2D; spec: StyleSpec; z: number }; type Proj = (x: number, y: number, e?: number) => Pt; type ShapeOpts`; constants `SUNL, STYLE_IDS, PRIMARY_KEYS, CROWD_BRETON, SEASON_BLEND, SKYR, SUN, MOON, WCOLD, WHITE, SKY_GREY` |
| `backdrop.ts` | ADAPT | 6480–6618 (sky ramp, stars, sun and moon, clouds, offscreen cache 6525–6534), 6953–6965 (`faceVis, faceLight, shade, h01`) | Sky (offscreen, 260 ms), skyline band by angle, then the apron ground (quay, river, the street the boulevard is painted on, far bank); the apron edges and the wall and prism helpers `apron.ts` shares; the péniche and the sailboat that `apron.ts` lists as drawables. | `drawSky(c?: CanvasRenderingContext2D): void; apronGround(c?: CanvasRenderingContext2D): void`; also `paintSkyBand(pen: Pen, f: number, light: number, x: number, y: number, w: number, h: number, cloud = 0.3): void; horizonY(): number; vis(nx: number, ny: number, nz = 0): boolean; wall(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, e0: number, e1: number, hex: string, k = 1, a?: number): void; xy(p: XY): [number, number]; prism(ctx: CanvasRenderingContext2D, pts: readonly number[], e0: number, e1: number, hex: string, top = hex, a?: number): void; sq(x: number, y: number, r: number, ry = r): number[]; sailX(): number \| null; drawBarge(_d: Drawable, ctx: CanvasRenderingContext2D): void; drawSail(d: Drawable, ctx: CanvasRenderingContext2D): void`; constants `LO, RIVER_DROP, SKYLINE_VIEW` |
| `apron.ts` | ADAPT | 6953–7035 (iso box kit `wp, poly, faceVis, faceLight, shade, h01`), 7509–7547 (`fencePieces` idea) | The apron props as world-space drawables: railings, gates, facade blocks (full on the far sides, the opaque ground floor on the near sides) and the cafés, the street trees of `boulevard.ts`, the péniche and the sailboat (split out of `backdrop.ts`, AGENTS rule 9). | `apronDrawables(): Drawable[]` |
| `boulevard.ts` | NEW | 6837–6848 (`drawTree` sprite blit, through `flora.treeSpriteOf`) | The boulevard on E, S and W (register 3.1, variant 1 of the boulevard gate, section 7.4 items 3 and 5): its ground painted inside `apronGround` (tree pavement, cobbled road with the dashed centre line, kerbs, far and back pavements, the back street on the near sides, tree grates) and the street trees as apron drawables with the see-through crown over the park; `BOULEVARD` holds the variant's knobs (split out of `backdrop.ts` and `apron.ts`, AGENTS rule 9). The street lamps on the tree pavement's kerb (register section 4 row Street lamps; 04 6.4) as apron drawables blitted from one lamp sprite a frame, repainted when its form moves or, once a colour epoch has passed, its light (`lampSpriteDue`); their lit globes untinted (04 6.2 item 3; owner 2026-10-13). | `BOULEVARD; boulevardGround(ctx): void; streetTreeDrawables(out: Drawable[]): void; streetLampDrawables(out: Drawable[]): void; lampSpriteDue(t: number): boolean` |
| `ground.ts` | ADAPT | 6665–6741 (`groundCol` rule stack, reduced), 6631 (`nzAt` grain), 9449–9465 (`TILE_COL`/`TILE_EP` epoch cache), 9586–9587 (epoch cadence), 8628–8776 (ways: ribbons for worn lawn) | Tile colours with epoch caches, the tile pass, desire-path ribbons, petals and wet sheen. | `drawGround(c?: CanvasRenderingContext2D): void; groundCol(i): RGB; tileCol(i): string; bumpEpoch(): void; colEpoch: number; setGroundQuality(q: number): void; groundQuality(): number` (the perf quality level `main.ts` hands in; render may not import debug, 2.1); `type Season = 0\|1\|2\|3; lawnHex(spec, season): string; kindHex(spec, kind, season): string; tileRGB(spec, kind, x, y, season, wet?): RGB` (the season's base colours and the unlit tile colour, shared with the style board); `ctxOf(c?): CanvasRenderingContext2D; setWorldTransform(c, e?): void; resetTransform(c): void; viewBounds(m?): { x0, y0, x1, y1 }` (the canvas, the world transform and the world box on screen, for the other passes) |
| `board-ground.ts` | ADAPT | 8703–8716 (`ribbonPts`), 8720–8735 (`drawSlab`), 9809–9811 (puddles), 6923 (cover) | The Style Gate board's tile sampler in the three treatments, frozen as the record of the gate (04 §3.4); imported only by `debug/style-board.ts` (split out of `ground.ts`, AGENTS rule 9). | `drawTilePatch(pen, proj, patch: Patch): void; type Patch, TileSample, WornPath` |
| `water.ts` | ADAPT | 9034–9177 (`buildWV` field, `fsPoly`, `waterPath` Catmull-Rom), 9260 (`strokeBanks`), 9981 (ripples only) | Pond and canal outlines as cached paths rebuilt on a water epoch (only tools change water), fill, rim, ice, ripples. | `drawWater(c?: CanvasRenderingContext2D): void; markWaterDirty(): void`; also `waterOutline(): Path2D \| null; drawRiver(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, e: number): void`; constants `WR` |
| `props.ts` | ADAPT | 6837–6944 (`drawTree`, bushes, flowers idioms), 7978 (`drawLantern`), 9540 (`drawProp` dispatcher), 6782–6835 (sprite cache pattern) | One `drawProp` per prop kind; tree sprite cache keyed by species, zoom bucket, season, phase, light, snow (1400 entries). Since S4 a café table is two drawables like a bandstand or a bridge, so its sitters paint between its halves (7.2), and the artist's easel draws through `figure-props.ts` `drawEasel`. | `drawProp(p: Prop, s: XY, c?, part?: 0\|1\|2): void` (s the north-west tile's centre on screen; part 1 or 2 the back or front half of a bandstand, a bridge or a café table); `propDrawables(): Drawable[]`; re-exports `treeSprite(p: Prop): TreeSprite` (from `flora.ts`) and `drawBench` (from `props-park.ts`); `drawFountain(pen, proj, x, y, o?: FountainOpts): void; type FountainOpts = { frozen?; phase?; fx? }; drawBistroTable(pen, proj, x, y, part: 0\|1\|2 = 0): void; drawFacadeBay(pen, proj, x0, y0, o: FacadeOpts): void; type FacadeOpts = { f; cutaway?; cafe?; seed?; tables? }` (the pen primitives `apron.ts` and the style board share); `drawLamp(pen, p, o: LampOpts): void; drawLampPool(pen, p, o: LampOpts): void; type LampOpts = { lit; charm?; breath?; glow?; bright? }` (`bright`: the game's lamps draw their lit globes untinted, owner 2026-10-13); `lampOn(p: Prop): number` (how far a park lamp is on: the lamps' hours with their fade, or a `litUntil` ahead); `LAMP_H = 1.75` (the lamp's drawn height in EH, the park's and the street's) |
| `props-park.ts` | ADAPT | 6953–6960 (box primitives), 7046–7056 (`houseFrame` idea), 10294 (`archVoid`), 8871 (`frontFix` idea) | The larger park props `props.ts` dispatches to: kiosk 2×2 with its awning, bandstand 3×3, picnic blanket 2×2, bridge 1 to 4, each in a back and a front half where people stand inside (split out of `props.ts`, AGENTS rule 9). | `drawKiosk(pen, proj, x, y, rot, night): void; drawBandstand(pen, proj, x, y, part): void; drawPicnic(pen, proj, x, y): void; drawBridge(pen, proj, p: Prop, part, wet): void`; also `drawBench(pen: Pen, proj: Proj, x: number, y: number, rot = 0, wet = 0): void; type KioskSpec; type BandstandSpec; type PicnicSpec; type BridgeSpec`; constants `KIOSK, BANDSTAND, PICNIC, BRIDGE` |
| `flora.ts` | ADAPT | 1692–1728 (`buildTreeShape`), 6749–6781 (`crownPhase`, `foliageCol`) | Tree shapes for three species, crown phase by season (design §3.4), the tree sprite cache (a park tree's, or a street tree's whole, trunk or crown layer), bed flower drawing by `BEDC`, hedge pieces. | `treeShape(species: Species, seed: number): TreeShape; treeSpriteOf(sp: Species, seed: number, layer: SpriteLayer = 'tree'): TreeSprite; crownPhase(season: number, dayInSeason: number): { ph: Phase; f: number }; drawBedTile(i: number, _s: XY, c?: CanvasRenderingContext2D): void; drawHedge(p: Prop, _s: XY, c?: CanvasRenderingContext2D): void`; also `crownHex(spec: StyleSpec, species: Species, season: number, ph: Phase, f = 1): string; drawTree(pen: Pen, p: Pt, t: TreeShape, season: number, dayInSeason: number, o: TreeOpts = {}): void; renderCtx(c?: CanvasRenderingContext2D): CanvasRenderingContext2D; gamePen(ctx: CanvasRenderingContext2D): Pen; faceVis(nx: number, ny: number, nz = 0): boolean; zoomBucket(z: number = cam.z): number; treeSeed(p: Prop): number; seasonDay(abs: number = T.abs): number; treeSprite(p: Prop): TreeSprite; drawTreeProp(p: Prop, s: XY, c?: CanvasRenderingContext2D): void; type Species = 0 \| 1 \| 2; type Blob = { x: number; y: number; r: number }; type Branch = { y: number; len: number; a: number }; type Twig = { x: number; y: number; len: number; a: number }; type TreeShape; type TreeOpts; type HexKey = { [K in keyof Palette]: Palette[K] extends string ? K : never }[keyof Palette]; type SpriteLayer = 'tree' \| 'street' \| 'trunk' \| 'crown'; type BedSpec; type HedgeSpec`; constants `gameProj, SPECIES_HEIGHT, SPRITE_CAP, BED, HEDGE` |
| `figures.ts` | ADAPT | 8045–8047 (`SKIN`, `LINE`, `GH` idea), 8050–8075 (`toolFor`: one held thing per state), 8169–8260 (`drawGnome`: the lean, bob and crouch frame, the sitting legs, the walk swing, the body line), 8331–8340 (arm angles, the back arm first), 8395–8414 (fringe, eyes, nose, cheeks) | The visitor rig's entry (section 7.6): the `Visitor` record to the picked rig **2 Tailored** (register section 4, rows Figure rig and Crowd palette, 2026-10-13), drawn by `figure-rig.ts`, `figure-garments.ts` and `figure-props.ts` and dressed by `figure-look.ts`. Here: the drawn scale (04 §7.1 rule 1), the body-language table that maps every `act.ts` state onto the 14 states (`stateOf`), the expression of 04 §7.5 (`exprOf`), `itemFor` (7.6 item 4), the walk phase from sim seconds, the idle breath and a glance from a hash of `lookSeed` and sim time (never `rng()`), and the hand a walker's lead hangs from. Also, frozen for `style-board.html` (04 §3.4): `drawFigure`, the S1 stick rig in the three treatments, with its own `Look`, `Pose`, `Hat` and `Expr`. | `FH` (re-exported from `figure-rig.ts`); `drawVisitor(c: Ink, p: Pt, look: RigLook, o: Opts): Skel \| null; stateOf(v: Visitor): State; exprOf(v: Visitor): Expr` (the rig's `Expr`); `itemFor(v: Visitor, P: Palette = style().palette): Item; poseOf(v: Visitor, face: 1 \| -1, tSim: number, out: Opts): Opts; handOf(p: Pt, look: RigLook, o: Opts, z: number, front: boolean, out: Pt): Pt; figureScale(v: Pick<Visitor, 'archetype' \| 'ageWord'>): number; headRise(h: number, sitting: boolean): number`; the board's `drawFigure(pen: Pen, p: Pt, look: Look, pose: Pose): void; type Look; type Pose; type Hat = 'none' \| 'beret' \| 'cap' \| 'sunhat'; type Expr = 'idle' \| 'chat' \| 'bench' \| 'kiss' \| 'huff' \| 'laugh'`; constants `SCALE_CHILD, SCALE_ELDER, WALK_K, BREATH_RAD, BREATH_HZ, GLANCE_MIN, GLANCE_SPAN, GLANCE_T` |
| `figure-rig.ts` | ADAPT | 8169–8260 (`drawGnome`: the facing frame, the lean, bob and crouch, the sitting legs, the walk swing), 8331–8340 (the arm angles, the back arm first) | The skeleton of the Tailored rig: `FH` and the 04 §7.1 proportions, the LOD tiers by drawn height (7.1 item 5), the walk (item 3), the idle weight shift and breathing (item 4), the sitting pose keyed to the seat (item 6) and the body language of the 14 states (07 S4.6 step 12), solved once per figure into a `Skel`; the shape list that `figure-garments.ts` and `figure-props.ts` draw through, with the soft ink rim behind each piece; colours through the palette and the lamp warmth (7.3 item 5). Split out of `figures.ts` (AGENTS rule 9). | `FH; LOD; tierOf(h: number): 0 \| 1 \| 2 \| 3 \| 4 \| 5; STATES: readonly State[]; solveH(look: RigLook, o: Opts, h: number): Skel; opts(o: Partial<Opts> = {}): Opts; ik(root: Pt, tip: Pt, l1: number, l2: number, hint: Pt): { joint: Pt; tip: Pt }; P2(x: number, y: number): Pt; lerpP(a: Pt, b: Pt, t: number): Pt; rotAbout(c: Pt, q: Pt, a: number): Pt; tint(c: Ink, hex: string): string; fillOf(c: Ink, hex: string, k = 1, a?: number): string; inkOf(c: Ink, hex: string, a?: number): string; drawShapes(c: Ink, shapes: readonly Shape[]): void; polyPath(pts: readonly Pt[], close = true): Path2D; softPath(pts: readonly Pt[]): Path2D; linePath(pts: readonly Pt[]): Path2D; ellPath(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D; taperPath(pts: readonly Pt[], w0: number, w1: number, roundEnds = true): Path2D; type Arche; type State; type Hat = 'none' \| 'beret' \| 'cap' \| 'sunhat' \| 'floppy' \| 'headband'; type HairStyle; type Lower = 'trousers' \| 'skirt' \| 'shorts' \| 'cropped'; type Expr; type Item; type RigLook; type Opts; type Skel; type Ink = { pen: Pen; warm: number }; type Grad; type Shape` |
| `figure-garments.ts` | ADAPT | 8395–8414 (fringe, eyes, nose and cheeks), 8435–8440 (the soft contact shadow) | The Tailored rig dressed: filled garments after ref2, the fine ink rim behind every piece, hair, the hats of 04 §7.1 rule 10, the faces of 04 §7.5, and the scarves: a single's signature scarf drawn larger with a light `paper` rim that fades as the zoom grows, a couple's matching scarf in its crowd hue with no rim (register section 4, Crowd palette); a Breton's stripes at the close tier. Split out of `figures.ts` (AGENTS rule 9). | `drawRigPerson(c: Ink, p: Pt, look: RigLook, o: Opts): Skel \| null; hairPath(S: Skel, style: string): Path2D; rimAlpha(z: number): number` (the paper rim's alpha by zoom); constants `SCARF_CUE` |
| `figure-look.ts` | NEW | (GV coloured gnomes by village, `hatFor` 4284, which Parque does not have) | A visitor's look from its `lookSeed` alone (04 §7.1 rule 8): skin, hair, cut, lower garment, top and hat colour from the crowd palette **A Parisian chic** (register section 4, Crowd palette); the archetype signifiers of 04 §7.2; a single never wears a top within `SIG_NEAR` of its own signature colour (`ALLOWED_TOPS`, precomputed, re-rolled from `lookSeed`); a couple's scarf in one of the crowd hues by the lead member's `lookSeed`; a walker's dog breed. Split out of `figures.ts` (AGENTS rule 9). | `lookOf(v: Visitor, P: Palette, scale: number, out: RigLook): RigLook; newLook(): RigLook; topOf(seed: number, arche: Archetype, sex: 'f' \| 'm', pair: string, partnerTop: number, P: Palette): number; carryOf(v: Visitor): Item; breedOf(walkerSeed: number): 'terrier' \| 'poodle'; hash(n: number, k: number): number; pick(seed: number, k: number, n: number): number`; constants `SIG_NEAR, ALLOWED_TOPS` |
| `figure-props.ts` | ADAPT | 8050–8160 (`toolFor`, `drawTool`: one held thing per state, drawn at the hand along the forearm) | The archetype signifiers of 04 §7.2 and the held items of 7.6 item 4 as shapes in the figure's facing frame, the artist's easel (drawn by `props.ts` `drawProp`), the aprons and the stranger's coat; colours only from `style().palette`. Split out of `figures.ts` (AGENTS rule 9). | `itemShapes(pen: Pen, S: Skel, item: Item, hand: Pt, elbow: Pt, front: boolean, balloon: string): { back: Shape[]; fore: Shape[] }; easelShapes(pen: Pen, base: Pt, h: number, lw: number): Shape[]; drawEasel(pen: Pen, s: Pt): void; apronHex(pen: Pen, arche: string): string \| null; strangerCoat(pen: Pen): string` |
| `figure-sprites.ts` | NEW | (the tree sprite cache's idiom, GV 6782–6790) | The sprite cache of the figures and the creatures (section 15.2; the budget of 7.9): a drawing made once into its own canvas at the zoom and `dpr`, keyed by everything it reads (`people.ts` builds the keys), blitted 1:1 on the device pixel grid; past a pixel budget the oldest go first; each sprite remembers the light it was painted in and is repainted in place when the light moves, at most `SPRITE_REPAINTS` a frame for sprites one light step off. | `spriteFor(key: string, L: SpriteLight, zq: number, dpr: number, w: number, hh: number, ax: number, ay: number, paint: (g: CanvasRenderingContext2D, at: Pt) => Pt \| null): Sprite; blit(c: CanvasRenderingContext2D, sp: Sprite, x: number, y: number, z: number, dpr: number): void; spriteFrame(n = SPRITE_REPAINTS): void; type Sprite; type SpriteLight = { l: number; a: number; t: number }`; constants `SPRITE_REPAINTS` |
| `creatures.ts` | ADAPT | 8575–8598 (`drawBirdAt`, `drawBirdFlying`: body, sheen, head, tail, beak, two-stroke wings, the flight arc), 8506–8530 (`drawFox`: legs as short strokes, ears, a collar) | For the game (direction A): the pigeon in its five sim states `walk, peck, perch, fly, scatter`, and the walkers' two dogs, the white terrier and the black poodle, one per dog walker by its `lookSeed` (register section 4, Figure rig: "both dogs"), on a 1 px `ink` lead, through the figures' lamp warmth; `people.ts` places them. Frozen for `style-board.html` (04 §3.4): `drawPigeon` and `drawPomeranian` in the three treatments. The pomeranian in the park is S6's. | `drawPigeonOf(c: Ink, p: Pt, st: string, face: 1 \| -1, id: number, tSim: number): void; drawDogOf(c: Ink, p: Pt, face: 1 \| -1, breed: Breed, running: boolean, id: number, tSim: number): Pt` (the collar point the lead starts from); `drawPigeonState(c: Ink, p: Pt, f: 1 \| -1, st: PigeonState, phase: number, s = 0.18 * EH * c.pen.z): void; drawDog(c: Ink, p: Pt, f: 1 \| -1, breed: Breed, trot: boolean, phase: number, s = DOG_EH * EH * c.pen.z): Pt; drawLead(c: Ink, a: Pt, b: Pt, sag: number): void; pigeonStateOf(st: string): PigeonState; type PigeonState = 'walk' \| 'peck' \| 'perch' \| 'fly' \| 'scatter'; type Breed = 'terrier' \| 'poodle'`; the board's `drawPigeon(pen: Pen, p: Pt, o: PigeonOpts, s = 0.18 * EH * pen.z): void; drawPomeranian(pen: Pen, p: Pt, o: PomOpts, s = 0.3 * EH * pen.z): void; type PigeonOpts; type PomOpts`; constants `PIGEON_WALK_HZ, PIGEON_FLAP_HZ, DOG_EH, DOG_TROT_HZ` |
| `people.ts` | ADAPT | 1641–1642 (the facing: the sign of the heading's screen x), 8169–8175 (`drawGnome` at `screenOf` of the feet), 9578–9600 (people and critters sorted with the props by depth) | The people and the creatures as phase 6 drawables (section 7.9): where each is drawn (the anchor the hit test, the follow and the selection ring share); its facing on screen at any camera angle, worked out here from the world heading because the sim never reads the camera (7.6 item 7, A5); its depth in the painter order (7.2: a sitter after its bench or blanket, at a café table at its own depth, a perched pigeon after its perch); the lamp warmth on figures (7.3 item 5); a walker's dog on its lead from the walker's hand; static or small figures, pigeons and dogs blitted from `figure-sprites.ts`; the lists `pickAt` reads (8.2). NEW in S4 beside `figures.ts` and `creatures.ts`, which keep the drawing, and `props.ts` (AGENTS rule 9). | `peopleDrawables(): Drawable[]; anchorOf(v: Visitor, out: Anchor): Anchor; followPos(kind: 'visitor' \| 'creature', id: number, out: FollowPos): boolean` (`main.ts` hands it to `camera.ts` `setFollowLookup`); `pickPeople(): readonly PickPerson[]; pickCreatures(): readonly PickCreature[]; warmthAt(x: number, y: number): number; type Anchor = { x: number; y: number; gx: number; gy: number; h: number; e: number; sit: boolean }`; constants `SEAT_E, SPRITE_H` |
| `effects.ts` | PORT | 2386–2408 (`P`, spawners, `updateParts`), 8609 (`drawPart`), 10062–10105 (`drawWeather`), 8820–8847 (`ambientFx` skeleton) | Particles (cap 220) on the visual stream, screen-space rain and snow, fog wash, lamp halos, fireworks; subscribes to fx events. | `spawn(kind: FxKind, x, y, n?): void; stepParticles(dt): void; particleDrawables(): Drawable[]; drawWeatherOverlay(): void; ambientFx(dt): void`; also `drawHeart(pen: Pen, x: number, y: number, s: number, alpha: number, hexL: string, hexR = hexL): void; drawSprayDot(pen: Pen, x: number, y: number, s: number, alpha = 0.7): void; drawRipple(pen: Pen, x: number, y: number, rx: number, ry: number, alpha: number): void; drawChatBubble(pen: Pen, x: number, y: number, hr: number, face: number): void; paperGrain(ctx: CanvasRenderingContext2D, spec: StyleSpec, w: number, h: number, alpha = 0.06): void; particles(): readonly Part[]; clearParticles(): void; addPart(o: Omit<Part, 'n'>): void; fxStep(dt: number, n = 1): void; drawPart(p: Part, ctx: CanvasRenderingContext2D): void; type Part`; constants `FX_KINDS, PARTS_CAP, GRAVITY, WIND_LEAN, SPRAY` |
| `ghost.ts` | PORT | 6037–6049 (`drawGhost` panes), 8435–8440 (the selection ring), 10764 (`drawFocusMark`) | Green/red tile panes for an armed stamp or run, the ability target square, the selection ring, the focus pin. The ring (S4) is drawn in phase 7 at the feet of the visitor `card.ts` selected, whose id `main.ts` hands in through `draw` (render cannot import ui, 2.1), in `paper` unlit, pulsing on sim seconds. | `drawGhost(c: CanvasRenderingContext2D, g: Ghost \| null): void; drawSelection(c: CanvasRenderingContext2D, id: number): void` (0, or a visitor who has left, draws nothing); `drawFocusMark(): void; type Ghost` (re-exported from `play/tools.ts`) |
| `draw.ts` | PORT | 12042–12053 (`draw`), 9578–9600 (pipeline head), 9634 (`frontKey` for multi-tile props) | The pipeline of section 7.9. Owns the canvas context the passes fall back to; the canvas size and `dpr` live in `camera.ts` `view`. Since S4 the people and creatures of `people.ts` join phase 6's depth-sorted drawables, and phase 7 draws the ghost and the selection ring it is handed. | `initRender(canvas: HTMLCanvasElement): void; draw(ghost: Ghost \| null = null, sel = 0): void` (the rail's armed ghost and the selected visitor's id, handed in by `main.ts`); `ctx: CanvasRenderingContext2D \| null; getCtx(): CanvasRenderingContext2D` |

### 2.8 `src/audio/`

| Module | Status | GV lines | Responsibility | Public API |
|---|---|---|---|---|
| `engine.ts` | PORT | 6056–6120 | Master chain and the three buses of 05 §7.1, synthetic reverb, `tone`, `grain`, `panOf`, `audibleGain`, `toneAt` (GV `gtone`, audibility first), `duck`. Context on first gesture; suspend on hidden. Names as 05 §2. | `initAudio(): void; tone(freq, dur, o?: ToneOpts): void; toneAt(x, y, freq, dur, o?): boolean; grain(dur, o): void; duck(db: number, holdS: number, bus: 'music' \| 'amb' = 'music'): void; setMuted(m): void; isMuted(): boolean; suspend(): void; resume(): void`; also `getAC(): AudioContext \| null; isOn(): boolean; ctxState(): AudioContextState \| 'none'; busOf(name: BusName): GainNode \| null; verbIn(): AudioNode \| null; masterNode(): AudioNode \| null; outputNode(): AudioNode \| null; panOf(x: number, y: number): number; audibleGain(x: number, y: number): number; envelope(g: AudioParam, t: number, vol: number, att: number, dur: number, hold = 0): void; connectVoice(src: AudioNode, bus: BusName, pan: number, dry: boolean): void; duckDb(bus: 'music' \| 'amb' = 'music'): number; setVerb(g: number, tc = 0.05): void; setMasterLowpass(hz: number, tc = 2): void; setMusicLevel(v: number): void; getMusicLevel(): number; fadeMusic(target: number, secs: number): void; type Wave = 'sine' \| 'triangle' \| 'sawtooth' \| 'square'; type BusName = 'cue' \| 'amb' \| 'music'; type GrainOpts`; constants `MASTER_GAIN, MASTER_LP, VERB_GAIN, VERB_LP, IR_SEC, IR_DECAY, BUS_GAIN, MUSIC_VERB_SEND, GRAIN_MAX` |
| `limiter.ts` | PORT | 6130–6137 | `gate(key, baseMs, soft, unscaled)` (GV `aOK`): per-key real-time gap scaled by `T.speed` (1–8), read from `loop.now()`. | `gate(key: string, baseMs: number, soft?: boolean, unscaled?: boolean): boolean; resetGaps(): void`; also `setNow(ms: number): void; now(): number; gapMs(baseMs: number, soft = false, unscaled = false): number; canPass(key: string, baseMs: number, soft = false, unscaled = false): boolean; stamp(key: string): void; lastStamp(key: string): number \| undefined` |
| `cues.ts` | NEW | 6139–6207 (shape of a cue: two or three `tone` calls) | The cue vocabulary of `05-Audio-and-Music-Design.md`; `bindCues(bus)` subscribes to events with `watch`. | `cue(id: CueId, x, y, p?: CueParams): boolean; bindCues(bus): void; CUES: Record<CueId, CueDef>` (`bindCues` comes with S8); also `admit(def: CueDef, a: number, p: CueParams = {}): boolean`; constants `VOICE_GATE_MS, CUE_IDS` |
| `ambience.ts` | ADAPT | 6292–6329 (`updateAudio` scheduler), 6273–6279 (rain plips, crickets, owl idiom) | Fountain point source, kiosk chatter, distant bells and traffic, rain on gravel, pigeon wings; real-time intervals. | `updateAmbience(dtr: number): void` Until S8 the file exports only the placeholder `SLICE`. |
| `birds.ts` | PORT | 6212–6269 | `noteRun`, six voices, `singFrom` from a tree near the view, dawn and dusk windows. | `updateBirds(dtr): void` Until S8 the file exports only the placeholder `SLICE`. |
| `music.ts` | NEW | 6195 (`sfxTune`; motif B is its kin and opens with its 12-note phrase, GV 6196, 05 §5.2 item 5) | The game music picked at the Music Gate (register row 25, §3.13, §4): motifs **B Music-box lullaby** (dusk to dawn) and **C Café swing** (dawn to the end of golden hour, `f` in [0.20, 0.80)), each in its `rising` or `parted` variant by the romance state, a switch between them at a phrase start with a 2 s crossfade (05 §5). `MUSIC_PICK = { day: 'C', night: 'B' }` and `DEFAULT_MOTIF = MUSIC_PICK.day` name the pick. Motif A, the musette waltz, is retired (05 §5.9). Slice 8 moves B and C here from `src/debug/motifs.ts` and moves the waltz code out of this file into `src/debug/motifs.ts` (05 §6.5 item 3); until then this file still holds the waltz. Imports nothing from `src/debug/`. Section 9.3. | `MUSIC_PICK; DEFAULT_MOTIF; startMusic(fadeS = 4): void; stopMusic(): void; updateMusic(): void; musicState(): { state: StateName; bar: number; tempo: number; key: Key; duck: number; level: number; playing: boolean }`; also `freqOf(midi: number): number; scalePitches(key: Key, lo = MEL_LO, hi = MEL_HI): number[]; chordPitches(chord: string, lo = MEL_LO, hi = MEL_HI): number[]; isChordTone(midi: number, chord: string): boolean; planPhrase(ctx: PlanCtx, rand: () => number = vrng): PhrasePlan; planRun(ctx: PlanCtx, rand: () => number = vrng): PhrasePlan; resolveState(s: MusicInput): StateName; stepTempo(cur: number, target: number): number; setMusicKnob(k: KnobName, v: number): void; isPlaying(): boolean; type Key = 'G' \| 'Em'; type StateName = 'flourish' \| 'parted' \| 'happily' \| 'night' \| 'rising' \| 'stroll'; type MotifLetter = 'A' \| 'B' \| 'C'; type MusicInput; type Note; type PhrasePlan; type PlanCtx; type StateRow; type KnobName`; constants `musicInput, BASE_TEMPO, TEMPO_MIN, TEMPO_MAX, TEMPO_STEP, MEL_LO, MEL_HI, LOOKAHEAD, CHORDS, CHORD_TONES, PASSING_PC, TONIC, STATES, MUSIC_KNOBS, MUSIC_MAKEUP` |

### 2.9 `src/ui/`

| Module | Status | GV lines | Responsibility | Public API |
|---|---|---|---|---|
| `dom.ts` | PORT | 10684–10699 (`$`, `toast`, `layoutOverlays`), 10865 (`esc`) | DOM helpers, toast (3.4 s, 6 s option), overlay stacking from the measured rail height, body classes. | `$(id): HTMLElement; toast(key: string, params?, secs?): void; TOAST_S = 3.4; TOAST_LONG_S = 6; ageToast(dtr): void; toastOn(): boolean; layoutOverlays(): void; setBodyClass(cls: 'avatar'\|'photo'\|'sheet'\|'dev', on: boolean): void; applyDom(root?: ParentNode): void; anySheetOpen(): boolean; SHEET_IDS; type SheetId; openConfirm(key: string, onYes: () => void, onNo?: () => void): void; confirmOpen(): boolean; closeConfirm(): void` (the New confirm, the centred paper card: owner's pick 1, 2026-10-13) |
| `hud.ts` | ADAPT | 10839–10866 (`updateHUD` 0.35 s cadence), 12181 (clock double tap) | The four chips, photo mode, the mode button text and body class from the `mode` event. Since S4 the Visitors chip shows `plural('hud.visitors', n)` of the people in the park and its "+" enqueues `visitor.call` (stopping the click's propagation, GV 12171); the frame call also ages the feed and repaints an open census, and the 0.35 s repaint refreshes the card. | `initHud(h: HudHooks = {}): void; updateHud(dtr): void; type HudHooks = { onClockDoubleTap? }` (the clock chip's double tap, the perf overlay under `body.dev`); `SINGLE_MS = 400; DOUBLE_MS = 380` (a single tap waits `SINGLE_MS` for a second; two taps closer than `DOUBLE_MS` are a double tap; GV 12181) |
| `rail.ts` | ADAPT | 11029–11072 (`TOOL_ICON`, `TOOLS`, `buildTools`, `setTool`, `showDepth`), 10995–11033 (`updateGrow` contextual row) | Three groups, scrolling strip, row 2 context, row 3 controls, locked items dimmed with tier, cooldown chips. | `buildRail(h: RailHandlers): void; type RailHandlers = { onNew: () => void }; setGroup(g: 'park'\|'cupid'\|'mischief'): void; activeGroup(): Group; setTool(id: ToolId): void; activeTool(): ToolId; toolClass(): ToolClass; brushSize(): 1\|2\|3; toolIcon(id: ToolId): string` (icon set 3, owner 2026-10-13: lines in `currentColor`, small fills from the `tokens.css` accents); `armedGhost(): Ghost \| null; tapGhost(tile: XY): void; placeGhost(): void; cancelGhost(): void; syncSpeed(): void; updateRail(dtr): void; armAbility(id: AbilityId \| null): void; armedAbility(): AbilityId \| null` (the last two from S6) |
| `card.ts` | ADAPT | 10809–10838 (`relText`, `updateCard`), 10867–10880 (`selectGnome`, `clearSel`) | Single card, pair card, avatar strip; selection and follow. Since S4 the single card: name, archetype and age, the relationship line, the bars Mood, Rested and Full (04 §5.5) and the doing line `t('doing.' + st)`; `select` zooms in to at least `ZOOM_SELECT` and follows; arming any tool but the hand ends the selection (`initCard` listens on the Park strip, since `rail.ts` may not import this module). The pair card is S5's, the avatar strip S7's. | `select(hit: Hit): void; clearSel(): void; selected(): Hit; selectedVisitor(): number` (the selected visitor's id, 0 for none; `main.ts` hands it to `draw`); `updateCard(): void; relText(v: Visitor): string; initCard(): void`; constants `ZOOM_SELECT, LOW_MOOD, LOW_RESTED, LOW_FULL` |
| `sheets.ts` | ADAPT | 10743–10773 (events sheet, `goToEvent`), 10973–10992 (census), 10777–10790 (sound check, dev) | Census, Romances, Progress, Events (last 40), Avatar picker, Options; mutual exclusion of Census and Events. Since S4 the Census: one row per person in the park (name · archetype · doing · partner), the summary through `plural`, a row tap selects and follows, a repaint every `CENSUS_S` while open. | `openSheet(id: SheetId): void; closeSheets(): void; sheetOpen(): SheetId \| null; renderSheet(id): void; toggleSheet(id: SheetId): void` (open, or close when open); `initSheets(): void` (wires each sheet's close button); `updateSheets(dtr: number): void` (the census repaint, from `hud.ts`'s frame call); `renderCensus(): void`; constants `CENSUS_S` |
| `feed.ts` | PORT | 10700–10742 (`logEv`, `ageFeed`, `feedEv` cap 40, `todName` use) | The one-line feed with 14 s fade, the event list of 40 `{ key, params, abs, x, y, ids }` entries rendered through `t()` at display time. Since S4 the lines of the gardener gravelling a worn track, a gathering of pigeons and a regular's return, read from the sim's `step`, `peck` and `arrive` events by the frame listeners `initFeed` registers. | `pushFeed(ev: FeedEntry): void; ageFeed(dtr): void; feedEntries(): readonly FeedEntry[]; feedState(): FeedEntry[]; setFeedState(s): void`; `clearFeed(): void; initFeed(): void; type FeedEntry`; constants `FEED_CAP, FEED_FADE_S` |
| `intro.ts` | ADAPT | 12200–12217 (`langs`, `paintIntro`, Begin) | Title, paragraphs, Begin, Continue (shown when a park save exists), EN/ES toggle. | `showIntro(hasPark: boolean, onBegin, onContinue): void; hideIntro(): void; startLang(browser: string): Lang` (the profile's language once written, else the browser's); `chooseLang(l: Lang): void` |
| `i18n.ts` | NEW | (GV has `langs` for the intro only, 12200–12213) | `t`, `plural`, `gender`, language switch, `<html lang>`. Section 12. | `t(key: string, params?: Params): string; plural(key, n: number, params?): string; gender(key, sex: 'f'\|'m', params?): string; setLang(l: Lang): void; lang(): Lang; hasKey(key): boolean; onLang(fn: () => void): void` (called after every `setLang`, so static text repaints); `type Lang = 'en'\|'es'; type Params = Record<string, string \| number>` |
| `strings/en.ts`, `strings/es.ts` | NEW | | `export const en: Record<string, string>` and `es` with identical key sets. | as named |

### 2.10 `src/save/`, `src/debug/`, `src/styles/`, `src/fonts/`

| Module | Status | GV lines | Responsibility | Public API |
|---|---|---|---|---|
| `save/schema.ts` | NEW | (GV has no save, review §11) | Versioned TypeScript types `ProfileV1`, `ParkSaveV1` (section 3.9–3.10), `SCHEMA_VERSION = 1`. Since S4 `ParkSaveV1` holds `Visitor`, `Creature` and `RegularState` records, the paving job's `run` and `at`, and `SchedSave`, the schedulers' counters (3.10); the lists later slices own (`pairs`, `effects`) are typed `SaveRec` until their slice. | `SCHEMA_VERSION; type ProfileV1; type ParkSaveV1; type SchedSave; type LayersSave; type WeatherSave; type SaveRec = { id: number } & Record<string, unknown>; type Lang = 'en' \| 'es'; type Tier = 0 \| 1 \| 2 \| 3 \| 4` |
| `save/store.ts` | NEW |  | Keys `parque:profile-v1`, `parque:park-v1`; serialise and parse; `try/catch` on every storage call; in-memory profile the game edits; autosave triggers; state hash. Since S4 the snapshot and `stateHash()` hold the visitors, the creatures, the regulars, the paving job (`paving.run`, `paving.at`) and the schedulers' counters (`sched`, section 3.10). A profile read that failed (the storage threw, or the text did not parse or migrate) holds every profile write back until a later read succeeds; the park key is still written (owner 2026-10-13; section 11). | `PROFILE_KEY; PARK_KEY; AUTOSAVE_S = 30; loadProfile(): ProfileV1; getProfile(): ProfileV1` (the in-memory profile; `profile()` in earlier drafts); `saveProfile(): boolean; setStylePick(pick): void; setMusicPick(pick): void; loadPark(): ParkSaveV1 \| null; hasPark(): boolean; savePark(): boolean; saveBeforeNew(): boolean; clearPark(): boolean; clearAll(): boolean; stepAutosave(ns: number): boolean; resetAutosave(): void; snapshot(): ParkSaveV1; restore(s: ParkSaveV1): void; stateHash(): number; worldHash(): number` |
| `save/migrate.ts` | NEW |  | `migrateProfile(raw: unknown): ProfileV1 \| null`, `migratePark(raw: unknown): ParkSaveV1 \| null`; one function per version step. | `migrateProfile(raw: unknown): ProfileV1 \| null; migratePark(raw: unknown): ParkSaveV1 \| null; profileV0toV1(o): object; parkV0toV1(o): object; defaultProfile(): ProfileV1` (the defaults of 08 2.6) |
| `debug/harness.ts` | ADAPT | 12223–12241 (`window.__GV`) | `window.__PD` (section 13); installed only in DEV. | `installHarness(api: HarnessApi): void`; also `buildHarness(api: HarnessApi): Harness; type HarnessApi = { newPark: (seed: number) => void }; type Harness = ReturnType<typeof buildHarness>` |
| `debug/perf.ts` | PORT | 12056–12069 (`FT`, `ftNote`), 259 and CSS 157 (`#perf`) | Frame, sim and draw EMA with one-second peaks; auto quality step-down; the overlay text. | `ftNote(sim, drw, total, ts): void; FT; qualityLevel(): 0\|1\|2`; also `setPerfCounts(fn: () => PerfCounts): void; perfText(): string; setPerfOn(on: boolean): void; resetPerf(): void; type PerfCounts = { people: number; creatures: number; props: number; particles?: number; zoom: number }`; constants `EMA_K, SLOW_MS, SLOW_FRAMES, QUALITY_MAX, WARMUP_MS` |
| `debug/style-board.ts` | NEW | | Script of `style-board.html` (04 §4): renders the 13 tiles of the three directions with the real `render/*` primitives; second Vite entry; never imported by `main.ts`. It stays unchanged as the record of the Style Gate (A Storybook picked on 2026-10-12); the B and C branches it draws are frozen (04 §3.4) | `renderTile(n, spec, canvas): void` |
| `debug/music-board.ts` | NEW | | Script of `music-board.html` (05 §6); third Vite entry; never imported by `main.ts`. It stays as the record of the Music Gate (B and C kept, A retired, 2026-10-12) and plays all three motifs: until Slice 8, A from `src/audio/music.ts` and B and C from `src/debug/motifs.ts`; from Slice 8, B and C from `src/audio/music.ts` and A from `src/debug/motifs.ts` | as 05 §6.4 |
| `debug/motifs.ts` | NEW | | Until Slice 8: motifs B and C implementing 05 §6.2 `Motif`. From Slice 8: only the retired motif A (the musette waltz, 05 §5.9) wrapped as a `Motif` with id `'A'`, because B and C move to `src/audio/music.ts` (05 §6.5 item 3). Imported only by `music-board.ts` (and the tests) | `MOTIFS: Record<'B'\|'C', Motif>` until Slice 8; then the waltz as motif `'A'` (07 S8.6 step 6); also `type Variant = 'rising' \| 'parted'; type Knob = { min: number; max: number; value: number }` |
| `styles/tokens.css` | PORT | CSS 16–23 | The tokens of brief §3.2, exactly, plus the values written at the Style Gate (direction A): `--theme-color` and `--body-bg` `#DCE6EC` and the direction A scene accents for HUD use `--rose`, `--lawn`, `--gravel`, `--water`, `--awning` (04 §3.4 item 5, §13). | |
| `styles/shell.css` | PORT | CSS 24–230 | HUD, chips, rail, tools, size row, card (and strip variant 173–178), sheets, toast, feed, photo mode, intro, perf, safe areas, reduced motion; minimum font 11 px (brief §3.1 item 5). | |
| `fonts/*.woff2` | NEW | | Fraunces and Figtree subsets (Latin plus Latin Extended), under 400 KB together, referenced by `@font-face` in `tokens.css` and inlined by the build (07 S0.6 row 19) | |

---

## 3. Data model

All types live in the module that owns the record; `save/schema.ts` re-exports the saved shapes. `XY = { x: number; y: number }` in tiles (floats for actors, integers for tiles). Angles and facings are integers 0–3 (quarter turns).

### 3.1 Ids

```ts
type VisitorId = number;  type PairId = number;  type CreatureId = number;
type PropId = number;     type EffectId = number; type GateId = 'g_south_w'|'g_south_e'|'g_west'|'g_east'|'g_north';
type Side = 'park' | 'cupid' | 'mischief';
```
0 is "none" for every id. `PropId` values are 1–65535 and are recycled (section 2.3 `ids.ts`). All other ids grow without recycling for the life of a park.

### 3.2 Tile layers (`world/grid.ts`)

| Array | Type | Values | Saved | Written by |
|---|---|---|---|---|
| `KIND` | `Uint8Array(NC)` | `Kind` enum 0 lawn, 1 gravel, 2 flagstone, 3 bed, 4 mulch, 5 pond, 6 canal | yes | gen, tools, gardener |
| `WEAR` | `Float32Array(NC)` | 0–4 | yes | `wear.ts` |
| `OCC` | `Uint16Array(NC)` | 0 or `PropId` of a non-passable prop | yes | tools, gen, abilities (easel, sprinkler), staff |
| `WATER` | `Float32Array(NC)` | 0 or 0.6 | yes | gen, tools |
| `ICE` | `Uint8Array(NC)` | 0/1 | yes | `water.ts` |
| `WET` | `Float32Array(NC)` | 0–1 | yes | `weather.ts` (rain), abilities |
| `PETALS` | `Float32Array(NC)` | 0–1 | yes | abilities, avatar florist |
| `BEDC` | `Uint8Array(NC)` | bed colour 0 rose, 1 lavender, 2 marigold, 3 white | yes | tools, gen (assumption A1) |
| `PAVEDAY` | `Int16Array(NC)` | day the gardener last paved the tile, 0 never | yes | `wear.ts` (assumption A2) |
| `E` | `Float32Array(NC)` | always 0 | no (regenerated) | nobody in v1 |
| `BLOCK` | `Uint8Array(NC)` | derived: 1 blocked for walking | no | `rebuildBlock()` when `KIND`, `OCC` or a passable prop changes |

Saved typed arrays are stored as base64 of their raw bytes (little-endian).

### 3.3 Visitor (`entities/visitor.ts`)

```ts
type Archetype = 'single'|'couple'|'family'|'child'|'elder'|'tourist'|'jogger'|'artist'|'busker'|'dogwalker'|'gardener'|'vendor'|'cameo';
type Visitor = {
  id: VisitorId; name: string; sex: 'f'|'m'; archetype: Archetype; ageWord: 'young'|'grown'|'elder';
  seeks: 'f'|'m'|'any'; lookSeed: number;                      // lookSeed drives hair, coat and hat colours in the renderer
  x: number; y: number; face: -1|1; st: string; t: number;     // state and its timer in sim seconds
  path: XY[] | null; pi: number; ptx: number; pty: number; replanT: number; blocked: number; blockedList: number[];
  job: Job;                                                     // { propId?, tile?, pairId?, visitorId?, creatureId?, kind? }
  hunger: number; energy: number; comfort: number; social: number;
  arrivedAt: number; leaveAt: number; gateIn: GateId; gateOut: GateId | null;
  pairId: PairId; coupleOf: VisitorId; parentOf: VisitorId; childOf: VisitorId;
  items: { hat: boolean; purse: boolean; baguette: boolean; iceCream: boolean };
  embToday: number; embDay: number; pendingEmb: EmbKind | null; regularId: number; decideT: number;
  sitPropId: PropId; basket: number; shares: number; cdUntil: number; spawnedForPlayer: boolean;
};
```
`child` is the archetype of a family's child record (the register's family archetype arrives as a `family` parent plus a `child`). `cameo` is the flower seller of `c_bouquet`, the rival stranger and the mime of `m_mime`; cameos never pair and never count toward the 30 cap.

### 3.4 Pair (`entities/romance.ts`)

```ts
type Pair = {
  id: PairId; a: VisitorId; b: VisitorId;                      // a < b; a is the initiator
  stage: 0|1|2|3|4|5|6|7; affinity: number; retryT: number; togetherT: number; charmT: number;
  embToday: number; embDay: number; formedDay: number; formedAbs: number;
  lastCupidAt: number; lastTogetherAbs: number; umbrellaUntil: number; boatUntil: number;
  spotPropId: PropId; stageT: number;                           // the bench, table, blanket or spot in use; time left in the stage
};
```

### 3.5 Creature (`entities/creatures.ts`)

```ts
type Creature = {
  id: CreatureId; kind: 'pigeon'|'dog'|'pomeranian'; x: number; y: number; z: number; face: -1|1;
  st: string; t: number; tx: number; ty: number; ownerId: VisitorId; targetId: number;
  perchPropId: PropId; carry: 'hat'|'purse'|'baguette'|'iceCream'|null; cdUntil: number; outside: boolean;
};
```

### 3.6 Prop (`entities/visitor.ts` re-exported; owned by `play/tools.ts` and `world/gen.ts`)

```ts
type PropKind = 'bench'|'lamp'|'fountain'|'kiosk'|'table'|'bandstand'|'picnic'|'bridge'|'hedge'|'tree'|'easel'|'crumbs'|'peel'|'sprinkler'|'basket'|'rowboat'|'umbrella'|'railing'|'gate'|'facade'|'quay';
type Prop = {
  id: PropId; kind: PropKind; x: number; y: number; w: number; h: number; rot: 0|1|2|3;
  placedBy: 'gen'|'player'|'sim'; passable: boolean; untilTick: number;        // 0 = permanent
  data: { species?: 0|1|2; stock?: number; sitters?: VisitorId[]; vendorId?: VisitorId; tableIds?: PropId[]; ownerId?: number; litUntil?: number; span?: number; dir?: 0|1; pairId?: PairId };
};
```
`railing`, `gate`, `facade` and `quay` are apron props generated by `park.ts`'s `BACKDROP`; they are never saved (regenerated) and never in `OCC` (the apron is blocked by `inB`).

### 3.7 Command (`core/commands.ts`): section 5.

### 3.8 Effect (`play/abilities.ts`)

```ts
type Effect = { id: EffectId; ability: AbilityId; side: Side; x: number; y: number; r: number; startTick: number; until: number;
  phase: number; pairId: PairId; targetId: number; actorId: number; propId: PropId; overrideId: EffectId; data: Record<string, number> };
```

### 3.9 Profile (`save/schema.ts`)

```ts
type ProfileV1 = { v: 1; cp: number; mp: number; tierC: 0|1|2|3|4; tierM: 0|1|2|3|4; unlocked: string[];
  settings: { lang: 'en'|'es'; muted: boolean; speed: number }; stylePick: 'A'|'B'|'C'|null; musicPick: 'A'|'B'|'C'|null;
  parksPlayed: number; updatedAt: number };
```
`unlocked` is derivable from the tiers; it is stored so the "Unlocked" toast fires exactly once per id.
`stylePick` and `musicPick` are written only by the **Choose** buttons of the two boards (04 §4.4, 05 §6.5 item 1); the register §4 is the record of both picks, not these fields. The game draws direction A (`style()`, section 2.7) and never reads `musicPick`: one letter cannot hold the two kept motifs, so `MUSIC_PICK` in `audio/music.ts` carries the music pick (section 9.3).

### 3.10 ParkSave (`save/schema.ts`)

```ts
type ParkSaveV1 = { v: 1; seed: number; tick: number;
  rng: { sim: number; simN: number; vis: number };
  weather: { kind: WeatherKind; next: number; cloud: number; rain: number; mist: number; snow: number; wind: number; windP: number; wet: number; overrides: Override[];
             ice: { on: 0|1; snowT: number; dryT: number } };   // the ice timers of 6.2 item 4, so a restore freezes and thaws on the same step
  layers: { KIND: string; WEAR: string; OCC: string; WATER: string; ICE: string; WET: string; PETALS: string; BEDC: string; PAVEDAY: string };   // base64
  ids: IdsState; props: Prop[]; visitors: Visitor[]; pairs: Pair[]; creatures: Creature[]; effects: Effect[];
  sides: { cooldowns: Record<Side, Record<string, number>>; charges: Record<Side, Record<string, number>> };
  regulars: RegularState[]; alumni: Alumni[]; pinnedPair: PairId;   // RegularState (names.ts): a regular's RegularMemory with its id, visitor id, next visit day and arrival f
  paving: { runsToday: number; day: number; run?: XY[]; at?: number };   // run, at (S4): the run waiting for the gardener or being laid, and the index of its next tile
  sched?: SchedSave;                   // S4: { arrivalT: number; held: string[]; arrivedDay: number; arrivedToday: number; gathered: number[] }
  mode: { mode: Mode; player: number; avatar: AvatarId | null };
  tally: { day: number; cp: number; mp: number };
  feed: FeedEntry[];                   // last 40
  log: Command[];                      // last 600
  treeTurn: number;                    // 0 | 1 | 2: the species the tree tool plants next (02 8.3; tools.ts nextSpecies): saved, not in stateHash
};
```
`treeTurn` is saved so a restored park plants the same next species (S3); it is not part of `stateHash()` (section 11). S4 added two fields, both saved and hashed so a restored park reaches the same hash (08 3.2 run 6): `paving.run` and `paving.at`, the gardener's pending run and the index of its next tile (`staff.ts` `PavingState`; `stateHash()` hashes the whole `paving` block, the day's tally included), and `sched` (`SchedSave`), the schedulers' counters between steps: `arrivalT` the time until the next arrival may come (`visitor.ts`), `held` the generated names in use, `arrivedDay` and `arrivedToday` the regulars arrived that day (`names.ts`), `gathered` the crumbs props whose gathering of pigeons was announced (`creatures.ts`); `stateHash()` hashes the whole `sched` block. Both are optional in a save: one written before S4 restores them to the empty values. Until their slices fill them, `schema.ts` types `pairs` and `effects` as `SaveRec[]` and `alumni` and `feed` as plain records, and the engine saves them empty. Excluded from the save: the undo stack (register 3.11 "undo-irrelevant"), camera, selection, armed tool or ability, toast, sheet state, particles, caches, `T.speed` (lives in the profile settings).

### 3.11 Caps

| Cap | Value | Enforced in |
|---|---|---|
| People in the park (cameos excluded) | 30 | `visitor.ts: spawnVisitor` and `callVisitor` |
| Pigeons | 12 | `creatures.ts` |
| Dogs including the pomeranian | 4 | `creatures.ts` |
| Particles | 220 | `effects.ts: spawn` (GV `P` 2386) |
| Active effects | 64 | `abilities.ts` |
| Weather overrides | 16 | `weather.ts` |
| Props | 65535 by id; soft cap 600 | `ids.ts`; `tools.ts` toasts `reason.park_full_props` at 600 |
| Feed entries | 40 | `feed.ts` (GV 10723) |
| Command log | 600 | `commands.ts` (design §14.5) |
| Undo depth | 10 | `undo.ts` (GV 11091) |
| Blocked-target memory | 8 per visitor | `move.ts` |
| A* nodes | 2600 per call | `astar.ts` |

---

## 4. The loop (`core/loop.ts`, PORT of GV 12024–12096)

### 4.1 Frame (GV `frame` 12070–12096)

1. `requestAnimationFrame(frame)` first, so a thrown error never stops the loop.
2. `dtr = min(0.05, (ts - last) / 1000)` real seconds (GV 12073).
3. `simAcc += dtr * T.speed`. `nsMax = clamp(ceil(T.speed * 2.2) + 4, 8, 48)` (at 8× this is 22). Wall budget `tBudget = f0 + (T.speed > 6 ? 26 : T.speed > 3 ? 13 : 9)` ms (GV 12082). `lite = T.speed > 6 ? 3 : 1` (GV 12083).
4. `while (simAcc >= SIM_DT && ns < nsMax) { simulate(SIM_DT, lite); simAcc -= SIM_DT; ns++; if (ns >= 8 && performance.now() > tBudget) break; }`.
5. `if (ns >= nsMax || simAcc > SIM_DT * nsMax) simAcc = 0` (drop the backlog, GV 12086).
6. `events.drain(lite)` delivers the steps' events to frame listeners (ui, audio, effects).
7. `effects.stepParticles(min(0.05, dtr) * T.speed)` (visual stream; replaces GV `updateParts` inside `simulate`, which is moved out because particles are not sim state).
8. `audio.updateAmbience(dtr); audio.updateBirds(dtr); audio.updateMusic(dtr)` every frame in real seconds, paused or not (05 §4.1 item 1; GV 12088 gated on speed, not ported).
9. `camera.turnStep(dtr); camera.keepCentre(); camera.followStep(dtr); effects.ambientFx(dtr)`.
10. `draw()`.
11. `hud.updateHud(dtr); rail.updateRail(dtr); feed.ageFeed(dtr); store.stepAutosave(ns * SIM_DT)`.
12. `perf.ftNote(simMs, drawMs, totalMs, ts)`.

### 4.2 Step (GV `simulate` 12024–12040, re-ordered for the park)

`simulate(dt, lite)` runs these in this order and laps each into `SP` (GV 12014):

| # | Phase | Call | Notes |
|---|---|---|---|
| 1 | tick | `tick++` | `tick` is the integer step count since the park began; saved |
| 2 | commands | `applyPending(tick)` | all commands with `cmd.tick <= tick`, in `(tick, side, seq)` order |
| 3 | time | `stepClock(tick)` | `T.abs = START_ABS + tick / (60 * DAYLEN)`; sets `f, day, season, light, phase, lamps`; emits `newday` when `day` changes |
| 4 | weather | `stepWeather(dt, tick); stepWet(dt); stepIce(dt)` | global machine, override expiry, `WET` rise and fall |
| 5 | day reset | on `newday`: `abilities.resetCharges(); embarrass.resetDay(); names.stepRegularReturns(); progression tally event` | only on the step where `day` changed |
| 6 | abilities | `stepAbilities(dt)` | cooldowns, effect timelines (cameo spawn, sprinkler soak, cloud, fog, boat, fireworks) |
| 7 | arrivals | `stepArrivals(dt)` | target by phase × weather × season (design §4.2) |
| 8 | visitors | `stepVisitors(dt)` | `spaceOut`, then per visitor: `stepNeeds`, decide cadence (section 4.4), `act`, `moveStep`, `wearAt` |
| 9 | creatures | `stepCreatures(dt)` | pigeons, dogs, pomeranian |
| 10 | romance | `stepRomance(dt)` | `togetherT`, charm conversion every 10 s, retry timers, endings, featured recompute when a stage changes |
| 11 | wear | once per sim second: `decayWear()` | an accumulator in the loop, not a real-time timer |
| 12 | planning | every 1.2 s: section 4.3 | GV 12038 `planT` pattern |
| 13 | charm | `if (charmDirty) rebuildCharm(...)` | after any prop or lamp change in this step |

Phases 6–10 call `emit()`; sim listeners (`progression.ts`, `feed` state) run inside the step; frame listeners wait for `drain`.

### 4.3 The 1.2 s planning tick

Runs in order: (1) rebuild the facility index (free benches, free tables, picnic spots, shelter tiles, path loops of ≥ 12 tiles, viewpoints) as flat id lists; (2) `staff.stepStaffPlanning()` which every 60 s of its own accumulator calls `wear.findPavingRun(day)` (design §11.1) and assigns the gardener; (3) kiosk vendor check (one per kiosk); (4) pigeon top-up (+1 per 90 s, design §11.2); (5) alumni return roll once per day; (6) `romance.featured()` recompute (cheap, but also done on stage change). Pair formation is not here: it runs inside `decide` (design §6.1).

### 4.4 Per-visitor cadence (GV 5696)

`v.decideT -= dt; if (v.decideT <= 0) { v.decideT = rnd(0.5, 1.3); if (!BUSY[v.st]) { if (v.id === PLAYER && MODE === 'avatar') avatarDecide(v); else decide(v); } }`. This is the only `MODE` read in `entities/`. `avatarDecide` is injected by `play/avatar.ts` through `setAvatarDecide` at boot so that `entities/` never imports `play/avatar.ts`.

### 4.5 Lite bits

GV's bits skip the drawn-surface rebuild and batch the water solver (12028–12030), both absent here. Parque redefines them so that **no bit ever changes a value covered by the state hash**:

| Bit | Value | Effect |
|---|---|---|
| 1 | `lite & 1` | `events.drain` drops `fx` events (particle spawns) queued by this frame's steps beyond the first 8 steps |
| 2 | `lite & 2` | `events.drain` drops `cue` events beyond the first 8 steps (the limiter would drop most of them anyway) |

Done when: running 3 days at 1× and at 8× from the same seed and log gives the same `stateHash()`.

### 4.6 Speed dial

`setSpeed(v)`: `v` is 0 (pause) or an integer 1–8. Applied by the `speed` command (section 5). The dial's value is stored in `profile.settings.speed`; pause is never stored (a reload resumes at the stored dial). `#s=<seed>&halt` starts paused (GV 814).

While `T.speed` is 0, `frame()` calls `applyPending(tick() + 1, PAUSED_KINDS)` after its (empty) step loop, which applies only pending `speed` and `park.new` commands (`loop.PAUSED_KINDS`): `speed`, so the dial can unpause, and `park.new` (owner 2026-10-13), so a New confirmed while paused gives the fresh park at once; the pause is kept (`newPark` leaves `T.speed` alone), so the fresh park shows at tick 0, still paused. Every other command stays pending until the first step after the unpause, so the live order always equals the replay order of 5.2 (a tool, ability or avatar command sent while paused takes effect on that first step; one queued before a New belongs to the old park and is dropped with it, as `newPark` clears `pending`). A `park.new` starts a new log and is never logged, so applying it in a paused frame changes no replay.

---

## 5. Commands (`core/commands.ts`)

### 5.1 The union

```ts
type CommandInput = Omit<Command, 'tick' | 'seq'>;
type Command = { tick: number; seq: number } & (
  | { side: 'park'; kind: 'tool';         payload: ToolPayload }
  | { side: 'park'; kind: 'undo';         payload: {} }
  | { side: 'cupid' | 'mischief'; kind: 'ability'; payload: { id: AbilityId; target: Target } }
  | { side: 'cupid' | 'mischief'; kind: 'avatar.enter'; payload: { avatar: AvatarId } }
  | { side: 'cupid' | 'mischief'; kind: 'avatar.leave'; payload: {} }
  | { side: 'cupid' | 'mischief'; kind: 'avatar.tap';   payload: { tile: XY; hit: Hit } }
  | { side: 'park'; kind: 'speed';        payload: { speed: 0|1|2|3|4|5|6|7|8 } }
  | { side: 'park'; kind: 'park.new';     payload: { seed: number } }
  | { side: 'park'; kind: 'visitor.call'; payload: { gate: GateId | null } }
  | { side: 'park'; kind: 'debug.weather'; payload: { kind: WeatherKind } }   // DEV builds and tests only; sets W.kind to the payload kind and W.next to that kind's mean duration ((durMin + durMax) / 2, design §3.3); makes no rng() draw
);
type ToolPayload =
  | { tool: 'path'|'lawn'|'pond'; at: XY; size: 1|2|3; stroke: number }          // one command per painted centre; stroke groups them for undo
  | { tool: 'bed'|'tree'|'bench'|'lamp'|'remove'; at: XY }
  | { tool: 'picnic'|'fountain'|'kiosk'|'bandstand'; at: XY }                        // at = north-west tile
  | { tool: 'bridge'; at: XY }                                                      // a water tile; the sim finds the crossing
  | { tool: 'hedge'|'canal'; tiles: XY[] };                                         // the finished run, max 14 tiles
type Target = { kind: 'tile'; x: number; y: number } | { kind: 'visitor'; id: VisitorId } | { kind: 'pair'; id: PairId } | { kind: 'park' };
```
`hand` is not a command (it only selects). Camera moves, Fit, rotate, photo mode, sheets, language, mute, pin and dev toggles are UI-only and never enter the log (design §14.3).

### 5.2 Enqueue and apply

1. `enqueue(c)` stamps `tick = loop.tick() + 1` and `seq = ++seqCounter`, pushes to `pending`. The UI calls `enqueue` and nothing else.
2. `applyPending(tick, only?)` sorts `pending` by `(tick, side order park < cupid < mischief, seq)`, applies every command with `cmd.tick <= tick` (only those whose kind is in the set `only` when it is given: the paused frame of 4.6 passes `speed` and `park.new`), removes them.
3. `applyCommand(c)` is the only writer: validate (section 5.4) → on failure emit `rejected { reason, side }` and return; on success mutate, push to `log` (keep the last 600), emit `applied`.
4. `applyCommand` never reads the camera, the DOM or real time. A `hit` inside `avatar.tap` was resolved by the UI against the camera at tap time; the sim re-validates that the hit id still exists and is within the cascade radius in tiles (0.75-tile box for props, 1.2 tiles for people) and otherwise falls through to the tile step of the cascade.
5. `replay(cmds, upToTick)` runs `simulate` with the given commands re-enqueued at their original ticks; used by tests and the harness.

### 5.3 Side rules

| Kind | Allowed side | In avatar mode |
|---|---|---|
| `tool`, `undo` | `park` | rejected `reason.not_in_avatar` (the strip is hidden anyway) |
| `ability` | the ability's own side (`c_*` cupid, `m_*` mischief) | rejected `reason.not_in_avatar` |
| `avatar.enter` | the avatar's side | rejected `reason.wrong_mode` if already in avatar mode |
| `avatar.leave`, `avatar.tap` | `PLAYER`'s side | only in avatar mode, else rejected `reason.wrong_mode` |
| `speed`, `park.new`, `visitor.call` | `park` | allowed |
| `debug.weather` | `park` | allowed; rejected in a production build |

A command whose `side` is not in the Allowed column is rejected with `reason.wrong_side` (section 5.4).

### 5.4 Validation and rejection reasons

Every reason is an i18n key under `reason.`; the shell toasts `t(reason)`. Tools use the ranked order of design §8.4; this table maps them to keys.

| Key | When | Source rule |
|---|---|---|
| `reason.outside` | any footprint tile not `inB` | design §8.4 (1) |
| `reason.gateway` | a gate tile | §8.4 (2) |
| `reason.on_water` | `WATER > 0` for a land stamp | §8.4 (3) |
| `reason.taken` | `OCC != 0` | §8.4 (4) |
| `reason.on_flowers` | `KIND == bed` | §8.4 (5) |
| `reason.near_railings` | margin rule of fountain, kiosk, bandstand | §8.4 (6) |
| `reason.lawn_only`, `reason.not_here` | tool kind rule | §8.4 (7) |
| `reason.has_bandstand`, `reason.enough_kiosks` | caps 1 and 3 | §8.4 (8) |
| `reason.not_on_water`, `reason.someone_on_it`, `reason.too_wide` | bridge | §8.4 water list |
| `reason.straight_line`, `reason.run_too_long` | run tap not in line; > 14 tiles | design §8.2 |
| `reason.nothing_to_undo` | empty stack (in a replay from a snapshot, also an undo of an entry recorded before it, 5.5 item 2) | |
| `reason.locked` | ability or avatar above the side's tier | design §7.4 |
| `reason.cooldown`, `reason.no_charges` | | design §9.1 |
| `reason.not_children` | child target | design §13 T3 |
| `reason.enough_today` | `embToday >= 3` | design §6.4 rule 2 |
| `reason.not_courting`, `reason.apart`, `reason.on_the_water`, `reason.no_lamp`, `reason.not_raining`, `reason.raining`, `reason.not_evening`, `reason.pond_small`, `reason.iced`, `reason.slippery`, `reason.busker_near`, `reason.dog_saw_it`, `reason.no_wasps_rain`, `reason.in_sunbeam`, `reason.already_misty`, `reason.nobody_inside`, `reason.not_at_picnic`, `reason.no_item`, `reason.peel_here` | per-ability failures of design §9.2–9.3, one key each | |
| `reason.park_full` | `visitor.call` at 30 (GV 4489) | design §12.2 |
| `reason.park_full_props` | 600 props | section 3.11 |
| `reason.too_many_effects` | a cast while 64 effects are active (section 3.11) | 08 §2.5 |
| `reason.not_in_avatar`, `reason.busy` | mode and hold | |
| `reason.startled`, `reason.big_dog`, `reason.basket_empty`, `reason.nobody_for_them`, `reason.had_to_go` | avatar cascade refusals of design §10.4–10.9 | 06 §12 |
| `reason.wrong_side` | a command whose `side` is not allowed for its kind (section 5.3) | |
| `reason.wrong_mode` | `avatar.enter` while already in avatar mode; `avatar.leave` or `avatar.tap` in creator mode | section 5.3 |

Do not: do not toast from inside `applyCommand`; emit `rejected` and let `ui/hud.ts` toast it. Do not spend a cooldown or a charge before validation passes.

### 5.5 The log and a future two-player transport

1. `log` holds the last 600 applied commands with their ticks; it is saved in `ParkSaveV1.log`.
2. Replay test: snapshot, run 1,000 ticks, snapshot again; restore the first snapshot, re-enqueue the logged commands at their ticks, run 1,000 ticks; compare `stateHash()`, `rngN`, visitor positions and affinities (design §14.5). The undo stack is not saved (register 3.11), so a replay that starts from a snapshot reproduces only the undos of entries recorded after that snapshot; an undo of an earlier entry is `reason.nothing_to_undo` in the replay (owner 2026-10-13; pinned in `tests/undo.test.ts`).
3. A later two-player transport is a module that (a) tags each local `enqueue` with `tick = loop.tick() + LEAD` (LEAD agreed, for example 6 ticks), (b) sends it to the peer, (c) injects the peer's commands into `pending`, and (d) stalls `simulate` when a tick arrives whose peer commands have not. Hot-seat alternates the `side` allowed in `enqueue`. Nothing in the sim changes (register 2.9).
4. Side-scoped state already exists: `sides.cooldowns[side][id]`, `sides.charges[side][id]`, and `PLAYER` becomes `PLAYER[side]` by changing `mode.ts` only.

### 5.6 Undo (`play/undo.ts`)

1. Undo covers park tools only, 10 deep (register 3.7).
2. `applyTool` builds an `Inverse` while it mutates: `{ tiles: { i, KIND, WEAR, WATER, OCC, BEDC }[], propsAdded: PropId[], propsRemoved: Prop[], vendorRemoved: Visitor | null, strokeId }`, then `undo.record(inv, strokeId)`. Brush commands of one pointer stroke share `strokeId` and form one entry (GV `beginStroke` 11091); every other tool command is its own entry. Three more fields (S3):
   - `recycled: PropId[]`: which ids of `propsAdded` came from the free queue, so the undo hands each back where it came from (`ids.unallocPropId`).
   - `propsChanged: Prop[]`: copies of the props a command changed in place (a bench turned, a kiosk's table list) as they were before it.
   - `treeTurn: number | null`: the tree cycle before a planting (`tools.nextSpecies`), so an undone tree hands its species back (02 8.3); null for every other command.
3. The `undo` command pops the top entry and applies every inverse in reverse order: restore the tile fields, remove `propsAdded`, re-add `propsRemoved` with their old ids (the free list guarantees the id is still free because ids freed by that entry are reserved until the entry leaves the stack), re-spawn a removed kiosk's vendor, `markBlockDirty`, `markCharmDirty`, `markWaterDirty`. A visitor standing on a tile that became water or `OCC` is moved by `openNear` (GV 1559).
4. The `undo` command is logged like any other, so a replay reproduces it, with one limit: a replay that starts from a snapshot reproduces only the undos of entries recorded after that snapshot (the restore empties the stack, register 3.11); an undo of an earlier entry is `reason.nothing_to_undo` there and changes nothing (owner 2026-10-13; `tests/undo.test.ts`). Redo does not exist.
5. `clearUndo()` on `park.new` and on `avatar.enter` (undo is hidden in avatar mode, design §8.5).

---

## 6. Simulation subsystems

### 6.1 Clock (`core/clock.ts`, ADAPT of GV 814–828)

1. `stepClock(tick)`: `abs = 0.30 + tick / 21600` (60 steps × 360 s); `f = abs % 1`; `day = floor(abs) + 1`; `season = floor((day - 1) / 3) % 4`; `phase = phaseOf(f)` by the register 3.2 bands; `light` by linear interpolation of design §3.2; `lamps = f >= 0.80 || f < 0.28`.
2. Emit `lampsLit` on the step where `T.lamps` turns from false to true (`f` reaches 0.80; tick 10,800 on day 1), `season` when `season` changes and `day > 1` (params `{ season: <key> }`, rendered as `feed.season.<key>`, GV 818 pattern), and `newday` when `day` changes (tick 15,120 is the first step of day 2, because a park starts at `f` 0.30). A change of `T.lamps` either way also marks the charm field dirty (4.2 phase 13).
3. Drop `T.cold`, `T.thaw`, `T.ds`, the cosine light and the `#halt` read (the loop reads the hash, not the clock).

### 6.2 Weather (`core/weather.ts`, ADAPT of GV 829–881)

1. Keep: `W.next` countdown; on expiry pick the next kind on `rng()` by the per-season weights of design §3.3 (the same kind may repeat); durations from design §3.3; eased targets `rs = 1 - 0.5^(dt/2.6)` for cloud, rain, mist, snow (GV 868); wind with `rw = 1 - 0.06^dt`, `windP += dt * 0.21`, `gust = 0.55 + 0.45 * sin(windP*0.7) * sin(windP*0.23 + 1.3)` (GV 872–875); `drift += wind * dt * 22`; `wet` chasing rain with half-lives 4 s up and 150 s down (GV 880).
2. Drop: storm, `front`, `STORM_LEAD`, `spate`, `tookBridge`, `flash`, `rumble`.
3. Add: the override list `{ id, kind, x, y, r, until, targets }`; `weatherAt(x, y)` returns the override's targets inside the square of half-width `r` (whole park when `r = 99`), else the global values; `WET` per tile (`stepWet(dt)`): `+0.2 * dt` while `weatherAt(tile).rain > 0.3`, else `-0.01 * dt`, clamped to 0–1 (design §2.2); a rise that lands within 1e-6 of 1 is stored as 1, because the float32 sum of 300 steps of 0.2/60 stops at 0.9999992 and 5 s of rain must read exactly 1. The per-tile `WET` pass runs every step over all 2304 tiles (two multiplies per tile; under 0.05 ms).
4. `stepIce`: pond and canal tiles set `ICE = 1` after 60 s of global snow > 0.3, back to 0 after 120 s without (design §3.3).
5. A new park starts `fair`, `next = 40` (GV 845).

### 6.3 Visitors (`entities/visitor.ts`, `needs.ts`, `brain.ts`, `act.ts`, `move.ts`, `astar.ts`)

1. Arrivals (design §4.2): the scheduler keeps `nextArrivalT`; when `people < target && people < 30` and the timer expires, pick an archetype by weight, a gate by weight, create the record on the gate's `outside` tile, path to the gate tile. Regulars replace generated singles by `names.stepRegularReturns()`.
2. Needs: port the easing idiom of GV 5579 for comfort; rates per sim day from design §4.4 (`hunger += 0.5 * dt / DAYLEN`, and so on).
3. Brain: port the shape of GV `decide` 4809 (each rung returns on dispatch); rungs exactly design §5.2; routines exactly design §4.3. Weights are picked with `rng()`.
4. Act: port the idiom of GV `act` 4968: `switch (v.st)` with `goX` states that arrive and switch to `X`, `X` states that count `v.t` down and finish. Add a `default` branch that sets `idle` and emits one `warn` event (GV has none, review §6.3).
5. Move and A*: port GV 1569–1673 and 1412–1510 minus terrain terms; costs from design §5.5; speeds from design §5.4. `spaceOut` uses `TW/2` and `TH/2` constants, not `cam.z`, so the sim stays camera-free (GV 5599 uses screen-space ellipses; here the ellipse is in world units equivalent to 10 × 8 px at zoom 1: `rx = 10 / (TW/2) = 0.77`, `ry = 8 / (TH/2) = 1.23` tiles along the two iso axes at angle 0; rotation is ignored, assumption A5).

### 6.4 Romance (`entities/romance.ts`)

1. `tryForm` is called from `decide` rung 7 (single routine) and from `a_matchmaker` with `skipRoll`.
2. Stage start sets both members' `st` and `job` in the same tick (design §6.2 rule 6); the stage's duration lives in `pair.stageT`; `act` reports completion by calling `completeStage` when the initiator's timer ends.
3. `stepRomance`: for each pair compute `together` (both within 4 tiles, neither in a reaction state); `togetherT += dt`; `charmT += dt`, and every 10 s together add `0.004 * charmAt(midpoint).total`; apart: on `newday` subtract 0.1 per day apart (`lastTogetherAbs`); endings per design §6.5; emit `stage`, `happily`, `parted`, `formed` with `contributed` computed at completion (design §7.1).
4. Featured: highest stage, tie earliest `formedDay` then lowest id; a pin overrides (design §6.6).

### 6.5 Abilities (`play/abilities.ts`)

1. `cast(side, id, target)`: `isUnlocked` → cooldown → charges → target type → ability-specific `fails when` (design §9.2–9.3) → create an `Effect` with `phase = 0` → start the cooldown → emit `cast`.
2. `stepAbilities(dt)` advances each effect's timeline by `phase` and `tick` comparisons (`t0`, `t+2`, `t+90`...), spawns cameos through `spawnVisitor('cameo', ...)`, creatures through `creatures.ts`, overrides through `weather.ts`, charm through `charm.ts`, and lands embarrassments through `embarrass.land`. Effects end at `until` and clean up what they made.
3. Cooldowns count down in sim seconds per side; charges reset on `newday`.
4. Scoring hooks: a Cupid cast sets `pair.lastCupidAt = T.abs` for every pair within 6 tiles of the target or targeted directly (design §9.1 rule 7).

### 6.6 Creatures and wear

Creatures per design §11.2–11.4, with the GV companion idiom (`dogStep` 1863) for dogs on leads: the dog targets a point 1 tile behind its walker. Wear per design §11.1 (PORT of GV 1674–1687 with `S = 1`).

### 6.7 The charm field (`world/charm.ts`)

1. Two base arrays `CB_TOTAL: Float32Array(NC)` and `CB_PLAYER: Float32Array(NC)` plus a mask `CB_MASK: Uint8Array(NC)` with one bit per static source kind (bed 1, fountain 2, bandstand 4, river 8), so each kind counts once per tile.
2. `rebuildCharm(props, lampsLit)` clears the arrays, then stamps every static source: bed tiles +1 within Chebyshev 3; fountain +2 within 5; bandstand +2 within 4; river view +1 for `y <= 5`. The `player` array gets the same stamps only from props with `placedBy == 'player'` (river never). Cost: at most ~200 sources × 121 tiles; it runs only when `charmDirty` (prop added or removed, bed painted) and is finished inside the step that dirtied it.
3. Lit lamps are stamped in the same rebuild (+1 within 3), and the rebuild is also triggered when `T.lamps` flips (twice a day) and when a `c_lamplight` effect starts or ends.
4. Dynamic sources at query time: buskers in `st == 'play'` (+3 within 8, iterate the busker list, ≤ 3 entries); `PETALS[i] > 0.2` on the tile (+2); inside a `c_sunbeam` override (+1); pair bonuses from `setPairCharm` (umbrella +2, boat +4, fireworks +4) when `charmAt` is called with a `pairId`.
5. `charmAt(x, y, pairId?)` returns `{ total: min(6, base + dynamic), player: min(6, basePlayer + dynamicPlayer) }`. Dynamic sources count as player charm by the table in design §6.3.

Done when: a unit test places one player bed and one gen fountain and reads `charmAt` = `{ total: 3, player: 1 }` on a tile within both radii.

---

## 7. Rendering

### 7.1 Camera and projection (`render/camera.ts`, `project.ts`; PORT of GV 6331–6443)

1. Constants: `TW = 26`, `TH = 13`, `EH = 26`, `VANCH = 0.46`, `CTR = (N - 1) / 2 = 23.5`.
2. `sxOf(rx, ry) = cw/2 + (rx - ry) * (TW/2) * cam.z + cam.ox`; `syOf(rx, ry, e) = chh * VANCH + ((rx + ry) - (N - 1)) * (TH/2) * cam.z - e * EH * cam.z + cam.oy`. The `SEAS` term of GV 6383 is removed: heights are measured from the flat ground (`e = 0`).
3. `rotXY`, `rotVec`, `setAngle`, `turnStep` as GV 6345–6358 (button turn eases with `1 - 0.0008^dt`, pinch with `1 - 0.00002^dt`, snap below 0.0015 rad).
4. `fitCam()`: the box is the park plus apron, 64 × 64 tiles rotated by `cam.ang`, projected at zoom 1; `z = clamp(min((cw - 18) * 1.16 / boxW, chh * 0.58 / boxH), 0.30, 3.0)`; centre on `(CTR, CTR)`; then, when the box is shorter than the clear band, lower it until its near corner sits 12 px above the highest bottom overlay (the rail), so the park sits low with the sky and skyline above it (added 2026-10-13 after the S2 review). The register's zoom floor 0.30 wins over GV's `min(0.30, fitZ * 0.85)` (GV 6410); on a 390 px phone at a quarter turn the apron's two side corners are cropped (assumption A6).
5. `clampCam()`: `z ∈ [0.30, 3.0]`, pan limit `max(240, 64 * TW * z * 0.56)` px (GV 6411 with the apron box).
6. `screenToTile(sx, sy)`: with flat ground the inverse projection is closed-form: `u = (sx - cw/2 - ox) / (TW/2 * z)`, `v = (sy - chh*VANCH - oy) / (TH/2 * z) + (N - 1)`, `rx = (u + v) / 2`, `ry = (v - u) / 2`, then `invRot` (GV 6347) and `floor`. Returns `null` outside `inB` unless the caller passes `allowApron` (for gate `outside` tiles and avatar flight). GV's nearest-first quad walk (6423–6442) is not needed and is not ported.
7. `pickAt(sx, sy)` (section 8.2).

### 7.2 Painter order (`render/order.ts`; PORT of GV 6359–6381 at S = 1)

1. Ground is flat, so ground tiles never overlap and need no order: the tile pass paints in index order with a bounding-box cull.
2. Everything that stands on the ground is a `Drawable { depth, kind, id, x, y, z, draw }`. `depth = rx + ry` after `rotXY`; a multi-tile prop uses the maximum depth of its footprint tiles (GV `frontKey` ~9634); a flying pigeon uses its ground point; a particle uses its ground point.
3. `sortByDepth` is GV `orderBy` (6367–6373): a counting sort into 1/64-tile buckets over the drawable list, rebuilt every frame because actors move (GV rebuilt only on angle change because it sorted tiles). List size at the caps: ≤ 30 figures + 16 creatures + ~150 props + ~80 facade blocks + 64 street trees + 220 particles ≈ 560, plus the railing pieces and gate pillars near the screen.
4. No coarse 2 × 2 LOD lattice (GV `lodCS` 6364): 2304 tiles are affordable at every zoom.
5. Stable ties: when two drawables share a bucket, the one with the lower `id` paints first, so a pair sitting on one bench never flickers.

### 7.3 Ambient light (`render/ambient.ts`; PORT of GV 6450–6478)

1. `k = clamp01((light - 0.06) / 0.69)^0.7`; `AM = mixc([0.535, 0.570, 0.759], [1, 1, 1], k)`, so night keeps GV's cool mix and every daytime phase from light 0.75 draws the palette exactly as the Style Gate board showed it (changed 2026-10-13 after the S2 review: GV's `mixc([0.46, 0.50, 0.72], [1, 1, 1], light^0.7)` greyed the start view to a dim morning). Cloud dim `max(0, W.cloud - 0.34) * 0.18`, so fair weather is not dimmed (cloudy 7 %, rain 10 %; 04 §10.5) (GV 6456–6459 without the storm cover). The style board keeps its own explicit light.
2. Golden hour: `warm = clamp01(1 - |f - 0.76| / 0.10) + clamp01(1 - |f - 0.24| / 0.08)` (04 §10.1 item 1); `AA = warm * 0.22 * max(0.25, light)`; `AT = f < 0.5 ? [255, 204, 162] : [255, 186, 158]`. The window centres and half-widths follow the register's golden hour 0.72–0.80 instead of GV's 0.74 ± 0.11 (GV 6460–6462).
3. `FOGA = clamp01(mist * 0.30 + rain * 0.03 + snow * 0.14)` (GV 6463). A `c_sunbeam` adds `light + 0.15` only for drawables inside its square (the renderer asks `weatherAt`).
4. `lit(c)` and `GC(hex, alpha)` exactly as GV 6465–6478 (memo flushed at 900 keys).
5. Lamp light is local and new: for each lit lamp the entity pass draws the 04 §6.1 lamp glow: a head halo r 0.9 tile and a ground pool ellipse 1.6 × 0.8 tiles at alpha 0.16 fading to 0 at 3 tiles, in the ground pass after tiles, and `figures.ts` mixes a figure's colours toward `AT` by `0.18 * (1 - d/3)` for the nearest lit lamp within 3 tiles.
6. Season tint: the palette has per-season lawn and foliage triples (the values are direction A's, picked at the Style Gate: 04 §3.1 column A and §10.3); `ground.ts` picks by `T.season` and blends 0.5 day across a season change.

### 7.4 Backdrop (`render/backdrop.ts`)

1. Sky: GV `SKYR` ramp, stars, sun or moon, clouds, painted to an offscreen canvas at most every 260 ms or on resize (GV 6525–6534). The sun path is corrected: an arc across the top from left at f = 0.25 to right at f = 0.80 (review §16 notes GV's path is off).
2. Skyline band: painted into the same offscreen canvas under the sky key plus `round(cam.ang / 0.02)`; a strip of rooftop silhouettes and the Eiffel Tower whose horizontal offset is `-(cam.ang / TAU) * stripWidth`, so it turns with the camera like GV's far shore bands (6574–6579, inside the sea block 6565–6581 of `paintSky`).
3. Apron ground: flat polygons in world space, projected with the world transform and painted before the tiles: the street east, south and west, the quay y = −1, the river y = −2…−8 (0.3 EH down), the far bank y < −8; on the street the boulevard (register 3.1, the owner on 2026-10-13: "some trees as a border, then a road, then buildings"; `park.ts: BACKDROP, bandRects`, `boulevard.ts`), counted in rings of tiles out from the boundary row or column and turning the two southern corners as square Ls (the east and west bands run north to the quay): rings 1–2 the tree pavement (pale stone, joints from zoom 0.7, a kerb on the road side, an iron grate round each street tree from zoom 0.45); rings 3–4 the road (two lanes, warm-grey cobbles with lighter dabs from zoom 1, a faint dashed centre line, a kerb and gutter on each side); ring 5 the far pavement; rings 6–7 the facade blocks; ring 8 the back pavement, the apron's edge; past it, on the sides that face the camera, a cobbled back street in rings 9–10 and the street run on 120 tiles, so no apron edge shows below the park. The gates' `outside` tiles lie in ring 1, on the tree pavement.
4. Apron drawables, generated once from `park.ts: BACKDROP`: railings (one piece per boundary tile except gate tiles, 0.5 EH high, from GV `fencePieces` 7509–7547 idea), five gates, the street trees (item 5), the street lamps (`park.ts: streetLamps`, drawn by `boulevard.ts`: the park's three-globe lamp of 04 §6.2 at its foot's depth, 32 on the tree pavement's kerb, one per 4 tiles midway between two street trees, one on each southern corner's kerb diagonal, none within 2 tiles of a gate; lit by the lamps' hours with its halo, its ground pool drawn after the tiles under every drawable; register section 4 row Street lamps), facade blocks (6.0 EH high, as 04 §6.4; iso boxes from GV 6953–7035 with windows and balconies) in rings 6–7: the south row from corner to corner (x −7…54 at y 53–54), the east and west rows from the quay to the corner squares (y 0…52), 3 tiles along the street × 2 deep with a 2 × 2 block on each corner square and a 2-long block where 3 does not divide a run, and one far-bank row at y = −10 to −9; café awnings with three bistro tables, one café a side; the péniche and the sailboat. Near-side rule (variant 1 of the boulevard gate, register section 4; it replaces the cutaway of A7): a block whose centre's depth is greater than the park centre's (it stands between the camera and the park) is drawn as its opaque ground floor only, `BOULEVARD.floor` = 1.2 EH: shop windows in painted surrounds on every face toward the camera (half of them lit at night), a stone coping, a flat zinc roof, and its café's awning and tables turned to the camera onto the back pavement; the change eases over 0.4 s after a turn. Far-side facades draw in full.
5. Street trees (`park.ts: streetTrees`, drawn by `boulevard.ts`): plane trees every 2 tiles on the seam of the tree pavement's two rings (x or y = −1.5 or 48.5), one on each southern corner so the rows turn it, none within 2 tiles of a gate's centre along its street (64 in all); four shapes of the plane (dome and tall oval forms, `BOULEVARD.seeds`) placed by `h01`, in season with the park's trees (spring buds on day 1). Each is one apron drawable at its trunk's depth, blitted from the tree sprite cache (section 7.7 item 2, keyed also by layer), so it sorts with the props. A tree whose crown would cover park tiles (nine crown points taken back to the ground they hide, recomputed when the angle moves) draws its trunk and a bare tree's limbs solid and its crown at alpha `BOULEVARD.nearCrown` = 0.35, easing over 0.4 s (GV's see-through canopy, 333–334), so the park stays in view.

### 7.5 Ground (`render/ground.ts`; ADAPT of GV 9449–9525 caches, 6665–6741 colour)

1. Epoch: `colEpoch++` when `now - colAt > 220` ms, or `> 110` ms while turning (GV 9586–9587), or when `T.season`, `T.lamps` or the quality level changes.
2. `TILE_COL: string[NC]`, `TILE_EP: Int32Array(NC)`: `tileCol(i)` returns the cached CSS string when `TILE_EP[i] == colEpoch`, else computes `groundCol(i)` → `lit` → `css` and stores it (GV `TILE_COL`/`TILE_EP` 9449).
3. `groundCol(i)`: base by `KIND` from `PAL` (season variant for lawn and mulch); `WEAR` darkens lawn toward earth (`>= 1.6` trodden, `>= 2.6` bare, hysteresis 2.1, GV `WORN_T` 8637); `WET[i]` darkens 14 % and adds sheen (GV `drawSlab` 8720 idea); `ICE` whitens water tiles; `PETALS` tints toward rose by `PETALS * 0.5`; value-noise grain ±7.5 % (GV `nzAt` 6631, LCG seed 1337). No slope, AO, gradient fitting or sub-quads (GV `fitTileGrad` 9471, `vertGrads` 8923, `valleyShade` 8943 are not ported).
4. The tile pass: for each tile in the visible range (bbox cull per tile using the projected centre ± `TW * z`), `fillStyle = tileCol(i)`, one diamond path, `fill`. Tiles are grouped by colour string in runs where neighbours share a colour to cut `fillStyle` changes.
5. Ribbons: worn-lawn ribbons from GV `buildPieces` 8654 and `ribbonPts` 8703, rebuilt per epoch, half-width 0.15–0.29, drawn only at `z >= 0.45` (GV threshold 0.35/0.45/0.7).
6. Bed tiles draw flowers by `BEDC` at `z > 0.8` (GV flowers rule 6907).

### 7.6 Figures (`render/figures.ts`; ADAPT of GV 8169–8442)

1. `FH = 22` px at zoom 1 for a grown visitor (0.85 EH); child 0.65 FH, elder 0.95 FH; drawn `h = FH * z * scale` (assumption A8).
2. LOD by `h`: < 3 nothing; ≥ 3 body; ≥ 4 signifier; ≥ 8 eyes; ≥ 12 expression; ≥ 18 close detail (04 §7.1 item 5).
3. Proportions after ref2 as 04 §7.1 item 2 (hip −0.38h, shoulder −0.66h, head −0.82h, head radius 0.10h); GV's anchors at 8240 are the shape to port, not the numbers.
4. `itemFor(v)` (GV `toolFor` 8050): book (`read`), baguette (`items.baguette` or `shares > 0`), bouquet (`basket > 0` florist; `hand` state), umbrella (pair with `umbrellaUntil > tick`), camera (`photo`), brush (`paint`), ice cream (`items.iceCream`), lead (dog walker), hat in hand (`duck`, `wipe`).
5. Colours from `lookSeed` through the palette's coat, hair and hat sets; the `a_matchmaker` look is fixed (beret, red ribbon, striped top, white trousers, basket with two baguettes; brief §3.3 ref2).
6. Facing: `v.face` is set by the sim from movement; the renderer may flip the face toward a partner during `chat`, `kiss`, `proposal` using screen positions (GV 8172 comment: a drawing choice never written back).
7. Expressions: hearts, blush and talk bubbles are particles and small overlays, never text (brief §8.2 item 15).

### 7.7 Props, flora, creatures

1. `drawProp` dispatches by `kind`; multi-tile props draw from their north-west tile with `w, h`; benches by `rot`.
2. Trees: species shapes from GV `buildTreeShape` 1692–1728 (plane, chestnut, lime replacing GV's three), crown phase by design §3.4, sprite cache keyed `species|zoomBucket|season|phase|round(light*8)|round(AA*8)|snow` (GV 6782–6790), cleared at 1400 entries, culled below 2.5 px.
3. Lamps: GV `drawLantern` 7978 silhouette replaced by the three-globe Paris lamp (brief §3.3 ref3); lit when `T.lamps` or `data.litUntil > tick`.
4. Fountain: iso basin from the box kit with spray particles spawned by `effects.ambientFx`, never by `drawProp` (review §2.5 flags GV `drawSpring` 8602 as the thing not to repeat).
5. Creatures: pigeon 0.18 EH (4.7·z px), pomeranian 0.3 EH (7.8·z), dog 0.45 EH (11.7·z), per 04 §7.4; GV's bird at 8569 and fox at 8506 are the shapes.

### 7.8 Effects, ghost, overlays (`render/effects.ts`, `ghost.ts`)

1. Particles: `P(o)` with the 220 cap (GV 2386), fields `{ k, x, y, z, vx, vy, vz, l, m, ph }`, gravity −2.6/s², wind lean from `W.wind` (GV `updateParts` 2396). Kinds: `heart, petal, leaf, drop, splash, ring, dust, spark, note, flash, firework, wasp, poopDot, bubble, hat` (04 §8; rain, snow, fog, the rain-cloud sprite and the sunbeam pool are screen- or world-space overlays, not particles). Spawners subscribe to `fx` events.
2. Weather overlay: screen-space rain (95 drops per unit of rain normalised to 390 × 800, two layers, none above the horizon) and snow (120 flakes) from GV 10062–10105; no lightning. Fog: a full-canvas wash of `PAL.fog` at `FOGA * 0.55` after the entity pass. The time term is sim time, `T.abs * DAYLEN`, never `performance.now()` or `loop.now()` (GV 10072 used wall time; 08 §4.5 item 1).
3. Ghost: GV `drawGhost` 6037 panes (green `ok`, red otherwise) for armed stamps and runs; an armed area ability shows its square at alpha 0.25 in the side's accent.
4. Selection ring (GV 8435) under the selected figure; focus pin (GV `drawFocusMark` 10764) for 5.2 s after `goToEvent`.

### 7.9 The pipeline (`render/draw.ts`; PORT of GV 12042–12053)

| # | Phase | Budget at 390 × 844, dpr 2, zoom 1 (ms) |
|---|---|---|
| 1 | `computeAmbient()`; `setTransform(dpr)`; `imageSmoothingEnabled = false` (GV 12044) | 0.1 |
| 2 | `drawSky()` (offscreen blit) | 0.3 |
| 3 | `apronGround()` | 0.3 |
| 4 | `drawGround()` tiles, ribbons, lamp halos | 2.5 |
| 5 | `drawWater()` cached outlines | 0.4 |
| 6 | collect drawables (apron props, props, figures, creatures, particles), `sortByDepth`, draw each | 4.0 |
| 7 | `drawGhost`, `drawSelection`, `drawFocusMark` | 0.2 |
| 8 | `drawWeatherOverlay()` and fog wash | 0.8 |
| | Total draw | ≤ 8.6 |

Sim budget per frame at 1×: ≤ 2.5 ms (one step). Brief §9 row 3 requires sim + draw ≤ 12 ms at the caps on desktop; the phone target is 60 fps with a 50 fps floor.

Do not: do not draw the HUD on the canvas; do not call `rng()` from any render file; do not spawn particles from a `draw*` function (only from event listeners and `ambientFx`).

---

## 8. Input

### 8.1 Gestures (`render/camera.ts: setupInput`; PORT of GV 11168–11230)

1. Pointer Events on the canvas with `setPointerCapture`; all listeners passive except `wheel` (`preventDefault`).
2. One pointer: `downInfo = { x, y, t, moved }`; with the `hand` tool `dragging = true`; with a brush tool `handlers.onStrokeStart()` then `handlers.onPaint(tile)`; with any other tool nothing until pointerup.
3. Two pointers: pinch `{ d, z, mx, my, ox, oy, a0, ang0, twist }`; the world tile under the midpoint is pinned (`cam.turnKeep`, `keepCentre`); zoom `clamp(z0 * d / d0, 0.30, 3.0)`; rotation after a 0.06 rad dead zone, eased by `turnStep`.
4. Move: pinch, pan (`cam.follow = null; cam.free = true`), or throttled drag paint (first at once, then 0.14 s, then every 0.10 s; GV 11176, 11215–11217). A drag sample more than one tile (Chebyshev) from the gesture's last sample paints every tile centre on the straight line between them (`lineTiles`, Bresenham order, the start left out), one `onPaint` each and so one `tool` command per centre with the stroke's id, so a fast drag leaves no gap (owner 2026-10-13; UI side only, the sim is unchanged). The last sample is kept unclamped, on or off the park, and only the line's park centres are painted: a drag out over the railings paints up to them, and a drag that runs along the apron and comes back in paints only where its last line enters, never a stripe along the edge (02 8.4 item 1). A sample paints alone, as in GV, when a second finger touched since the last sample, or when the camera or the viewport changed (a pinch, the wheel, a quarter turn, a follow, a resize), because the ground then moved under the finger and the finger never swept that line. Stamps and runs never drag-paint.
5. Up: when all pointers are up and `moved < 9 px` and `< 420 ms`: `handlers.onTap(sx, sy)` (GV 11223). A tap with a brush tool paints once (already done on down). A tap outside the canvas (DOM controls) never reaches here because overlays stop propagation.
6. Wheel: `cam.z *= deltaY < 0 ? 1.12 : 0.89` (GV 11229).
7. Quarter turns and Fit from the rail: GV 12142–12154 (`turnKeep` the screen-centre world point).

### 8.2 Tap routing (`main.ts` handler) and the hit test (`render/project.ts: pickAt`; PORT of GV 11231–11250)

`onTap(sx, sy)` in order:
1. Avatar mode: `hit = pickAt(sx, sy)`, `tile = screenToTile(sx, sy, allowApron)`; enqueue `avatar.tap { tile, hit }`; the status key returned by the cascade comes back as an `avatarStatus` event that `hud.ts` toasts (`'busy'` → `t('avatar.busy', { name })`; `'walking'` and `'flying'` silent; GV 11276–11277).
2. Creator mode with an armed ability: resolve the target by the ability's target type (`visitor` or `pair` from `pickAt`, `tile`/`area` from `screenToTile`, `park` fires on arming); enqueue `ability`; keep the ability armed.
3. Creator mode with a stamp or run tool: compute `tools.ghost(...)` (pure); for 1 × 1 stamps enqueue at once; for big stamps and runs update the ghost and the Place button (GV `updateGbar` 11018); a second tap on the same tile or Place enqueues.
4. Creator mode with `hand`: `card.select(pickAt(sx, sy))`; `none` clears selection and follow (GV `clearSel`).

`pickAt(sx, sy)` priority (GV 11231–11250 extended with props and tile):
1. Visitors: nearest within 34 px of `(sx, sy)` using the head point `screenOf(x, y).y - 8 * z`, with a 4 px bias (GV 11234–11236).
2. Creatures: nearest within 30 px; head heights pigeon 3, dog 6, pomeranian 5 px × z; a pigeon's drawn point includes its flight `z`.
3. Props: `screenToTile` then the prop in `OCC` on that tile, else a passable prop on that tile; also the 0.75-tile box around the tile centre for props with footprints larger than a tile (GV 5658 box).
4. Tile: `{ kind: 'tile', tile }`.
5. Else `{ kind: 'none' }`.

The hit test allocates nothing per call (GV `ptInQuad` allocated two arrays, 6438; not needed with the closed-form inverse).

### 8.3 Other gestures (PORT)

Clock chip single tap after 400 ms opens Events, double tap under 380 ms toggles the perf overlay in dev (GV 12181); `#bAdd` uses `stopPropagation` (GV 12171); New opens a confirm (register Q21; GV 12169 had none). The sound check is opened from the Options sheet under the dev flag (05 §2.6); GV's 600 ms long press at 12158 is not ported.

---

## 9. Audio

### 9.1 Engine (`audio/engine.ts`; PORT of GV 6056–6120)

1. Graph exactly GV 6061–6072: master 0.84 → lowpass 2100 Hz Q 0.3 → highshelf −6 dB above 1100 Hz → compressor (−24 dB, knee 28, 3:1, 30/450 ms) → destination; convolver with `makeIR(2.2, 2.8)` → lowpass 1600 → return 0.36. `makeIR` and the `grain()` buffer are filled once from a private `mulberry32(0xA0D10)` inside `engine.ts` (05 §1 item 6), so neither `rng` nor `vrng` moves (GV 6077 used `Math.random`).
2. `tone(freq, dur, o)` as GV 6090–6113 (envelope, glide to 92 %, LFO, panner, `dry`).
3. `panOf(x, y)` and `audibleGain(x, y)` as GV 6081–6089 using `screenOf(x, y, 0)`.
4. **Audibility before the gate**: `toneAt(x, y, freq, dur, o)` returns `false` and plays nothing when `audibleGain(x, y) <= 0.02`, else multiplies `gain` by the audibility, sets `pan = panOf(x, y)` and returns `true` (05 §2.3 item 3). `cue(id, x, y, p)` in `cues.ts` runs in the order of 05 §2.4 item 3: (a) `!audioOn || muted` → return `false` without stamping; (b) `a = audibleGain(x, y)`; `a < def.thresh` → return `false` without stamping (unpositioned cues use `a = 1`); (c) `!gate(key, def.gap, def.soft, def.unscaled)` → return `false`; (d) `def.play(x, y, a, panOf(x, y), p)`; return `true`. GV `aOK` 6131 ran first, so an off-screen cue consumed the gap (review §8).
5. Context created on Begin or Continue; `suspend()` on `visibilitychange` hidden, `resume()` when visible and not muted (GV 12199).

### 9.2 Limiter (`audio/limiter.ts`; PORT of GV 6130–6137)

`gate(key, baseMs, soft, unscaled = false)`: `sp = clamp(T.speed || 1, 1, 8)`; `scale = unscaled ? 1 : soft ? 1 + (sp - 1) * 0.45 : sp`; `gap = baseMs * scale`; compare against `loop.now()` per key in `GAP: Map<string, number>`; return `false` while `now - (GAP.get(key) ?? -1e9) < gap`, else stamp `now` and return `true` (05 §2.4 items 1–2). `src/audio/` never calls `performance.now()` or `Date.now()`. Real time by design (register 3.2).

### 9.3 Music (`audio/music.ts`, NEW)

1. The game music is motifs **B Music-box lullaby** and **C Café swing**, picked at the Music Gate on 2026-10-12 (register row 25, §3.13, §4); motif A, the musette waltz, is retired and never plays in the game (05 §5.9). 05 §5 specifies B and C (form and timing 5.1, B 5.2, C 5.3, which motif plays 5.4, voices and the gate mix 5.5, state table 5.6, ducking 5.7, scheduler 5.8). This document fixes only the contract: real-time look-ahead scheduling on `AC.currentTime`, tempo and pitch never depend on the frame rate or `T.speed`, state read once per bar from `romance.featured()` and the bus, nothing written to the sim, `vrng` only.
2. Music reads `romance.featured()` and events; it writes nothing. Randomness is `vrng`.
3. Which motif plays (ADVISED, the owner may change it; 05 §5.4): C while `f` is in [0.20, 0.80), B from dusk to dawn. Each plays its `rising` or `parted` variant by the romance state (05 §5.6). A switch between B and C waits for the playing motif's next phrase start and crossfades over 2 s. `MUSIC_PICK = { day: 'C', night: 'B' }` and `DEFAULT_MOTIF = MUSIC_PICK.day` in `music.ts` hold the pick.
4. Where the code lives: until Slice 8, B and C are in `src/debug/motifs.ts` and `music.ts` holds the retired waltz. Slice 8 moves B and C into `music.ts` without changing a number, and moves the waltz into `src/debug/motifs.ts`, so `music-board.html` still plays all three as the record of the gate (05 §6.5 item 3).

### 9.4 Cues, ambience, birds

`cues.ts` (`bindCues(bus)`) subscribes with `watch` to every event kind named in the Trigger column of 05 §3.2 (copied in 06 §17): `step`, `sit`, `stand`, `chat`, `laugh`, `stage`, `linger`, `embarrassed`, `backfired`, `watch`, `proposal`, `happily`, `parted`, `bouquet`, `peck`, `scatter`, `fly`, `swoop`, `bark`, `snatch`, `wall`, `eat`, `arrive`, `leave`, `lampsLit`, `cast`, `unlock`, `applied`, `rejected`, `cue`; each cue is two or three `tone` calls as GV 6139–6207; gains 0.014–0.060. `ambience.ts` replaces `villagePos()` centring with point sources (fountains, kiosks) and the screen centre (GV 6292 skeleton). `birds.ts` is GV 6212–6269 as is, sampling trees from `props` with `kind == 'tree'` near the view.

---

## 10. UI shell

### 10.1 DOM ids (fixed; `index.html`)

| Area | Ids |
|---|---|
| Stage | `#stage`, `#cv` |
| HUD chips | `#hudClock` (`#wdot`, `#tPhase`, `#tDay`), `#hudVisitorsWrap` holding the `<button id="hudVisitors">` (`#tPop`) and its sibling `<button id="bAdd">`, `#hudRomance` (`#tRom`), `#hudPoints` (`#tCP`, `#tMP`) |
| Card | `#card` (`#cName`, `#cSub`, `#cRel`, `#cBars` with `.bar[data-need]`, `#cDo`, `#cPin`), `#card.pair` variant |
| Rail | `#rail`; row 1 `#groups` (`button[data-group]` × 3), `#tools` (`.tool[data-id]`); row 2 `#row2` (`#sizewrap`, `#size`, `#depth`, `#bPlace`, `#bCancel`, `#bUndo`, `#cdChip`); row 3 `#row3` (`#bHalt`, `#spdR`, `#spdLbl`, `#bRotL`, `#bRotR`, `#bFit`, `#bMute`, `#bMode`, `#bPhoto`, `#bNew`) |
| Sheets | `#census`, `#romances`, `#progress`, `#evlog`, `#picker`, `#options`; `#snd` and `#perf` (dev) |
| Text | `#hint` (toast), `#feed` |
| Intro | `#intro` (`#iTitle`, `#iP`, `#begin`, `#bContinue`, `#lang button[data-l]`) |
| Photo | `#photoX` |
| Confirm | `#confirm` (`#confirmText`, `#confirmYes`, `#confirmNo`) |

`#depth` is the row-2 text line: the active tool's `tool.<id>.label` and, for a refused ghost, the ranked reason through `t()` (04 §5.4 item 4); it never shows a depth.

### 10.2 Body classes

| Class | Set by | Effect (CSS) |
|---|---|---|
| `avatar` | `hud.ts` on the `mode` event | hides `#tools` group Park strip, `#row2` Park controls, `#bUndo`; shows the hint strip; card becomes the compact strip (GV 169, 173–178, 183) |
| `photo` | `hud.ts` | hides HUD, rail, card, hint, feed, sheets; shows `#photoX` (GV 164–168, 63) |
| `sheet` | `dom.ts: layoutOverlays` | hides the card while a sheet is open (GV 226) |
| `dev` | `main.ts` when `#dev` is in the hash or `import.meta.env.DEV` | reveals the sound check and perf entries in Options |
| `winter` | not used (GV 64 dropped) | |

### 10.3 `layoutOverlays` (PORT of GV 10689–10699)

Measures `#rail` height once per call; sets `bottom = height + 8` on `#card`, `#census`, `#romances`, `#progress`, `#evlog`, `#picker`, `#options`, `#snd`; toggles `body.sheet`; puts `#hint` above the card when the card is on (`+10`). Called by `toast`, `updateHud` every 0.35 s, on resize and 220 ms after `orientationchange` (GV 12132). `focusY` (GV 11282) uses the same measurements for camera follow.

### 10.4 Data-driven rail (ADAPT of GV 11038–11061)

```ts
type RailItem = { id: ToolId | AbilityId; group: 'park'|'cupid'|'mischief'; labelKey: string; icon: string; col: string; tier?: 0|1|2|3|4 };
const RAIL: RailItem[] = [...16 tools, ...9 cupid, ...10 mischief];
```
`buildRail` renders `.tool` buttons for the active group only, `aria-pressed`, `data-id`, locked items with `.locked` and the tier word; the `.more/.before` edge masks from GV 11059. Row 2 shows by context: brush size 1–3 (`#size max=3`) for brushes, Place/Cancel for a live ghost, Undo (disabled when `depth() == 0`, GV `showUndo` 11116), or the armed ability's cooldown ring and charges. Row 3 wiring as GV 12134–12198 with the mode button reading `t('rail.be_someone')` / `t('rail.creator')` (GV 11267).

### 10.5 i18n at the DOM level

Static elements carry `data-t="key"` (text) or `data-t-aria="key"` (aria-label). `applyDom()` fills them on boot and on language change. Dynamic text is written through `t()` by the owning module. `<html lang>` follows the choice (register 3.12).

---

## 11. Persistence (`save/`)

| Item | Rule |
|---|---|
| Keys | `parque:profile-v1`, `parque:park-v1` (register 3.11) |
| Format | JSON; typed arrays as base64; numbers unrounded |
| Autosave triggers | `visibilitychange` to hidden, `pagehide`, and every 30 sim seconds (`stepAutosave` accumulates `ns * SIM_DT`) (register 3.11); the profile is written together with the park on each trigger; one extra park write on `park.new` (assumption A24) |
| Continue | `migratePark(JSON.parse(raw))` → `restore(s)`; silent (no toast); `MODE`/`PLAYER` restored; the camera does `fitCam` |
| New | confirm dialog `#confirm` (design §12.5); `park.new` clears the park key, `parksPlayed++` |
| Exclusions | section 3.10 |
| Failure handling | every `localStorage` access in `try/catch`; a parse or migration failure logs a `warn` event, discards the park and shows Begin without Continue; the profile falls back to defaults, and after a failed profile read (the storage threw, or the text did not parse or migrate) no call writes `parque:profile-v1` until a later read succeeds, so a passing read error never overwrites the stored Cupid and Mischief points; the park key is still written, and the read's one `warn` is the only one (owner 2026-10-13) |
| Migration | `migrate.ts` holds `profileV0toV1`, `parkV0toV1` placeholders now; each future version adds one function and a test fixture |
| State hash | `stateHash()`: FNV-1a over `tick`, `rng.sim`, `rng.simN`, the full `weather` block including `ice`, `ids` (`IdsState`), `paving`, the nine saved layers' bytes, and the canonical JSON of `props`, `visitors`, `pairs`, `creatures`, `effects`, `sides`, `regulars`, `alumni`, `tally`, `mode` and the profile's `cp`/`mp`, each array sorted by id. Excluded: `seed`, `feed`, `log`, `pinnedPair`, `rng.vis`, `treeTurn`, `T.speed`. |
| Size estimate | layers 53 KB raw → 71 KB base64; 30 visitors ≈ 12 KB; 150 props ≈ 18 KB; pairs and creatures ≈ 4 KB; feed 40 × 100 B = 4 KB; log 600 × 80 B = 48 KB; total ≈ 160 KB, under the brief's 1 MB (brief §9 row 6) |

Do not: do not save object references; do not save the undo stack; do not write to `localStorage` from any module but `store.ts`.

---

## 12. i18n (`ui/i18n.ts`)

1. `t(key, params?)`: looks up `key` in the active table; replaces `{name}`-style placeholders from `params` (values are strings or numbers; a number is formatted with the locale's decimal rules, no thousands separators needed); a missing key returns the key itself and emits one `warn` event per key in dev.
2. Key naming: lowercase, dot-separated, `area.item[.detail]`: `hud.phase.golden`, `tool.path.label`, `tool.path.hint`, `ability.c_petals.name`, `avatar.a_pigeon.hint1`, `reason.outside`, `feed.pair.formed`, `feed.stage.bench`, `feed.emb.poop`, `feed.emb.backfire.poop`, `doing.sit`, `card.rel.courting`, `sheet.census.summary`, `rail.be_someone`, `intro.p1`, `aria.rotate_left`, `confirm.new_park`.
3. Plural: `plural(key, n, params)` picks `key.one` when `n == 1` else `key.other` (EN and ES share this rule); the chosen string gets `{n}` filled. Example: `sheet.census.room.one = "room for {n} more"`.
4. Gender: `gender(key, sex, params)` picks `key.f` or `key.m`; both tables must have both. Used for pronouns and for ES adjective agreement (`card.rel.single.f = "soltera, buscando"`).
5. French flavour words appear inside the strings of both tables (`"Bonjour"`, `"la baguette"`); they are not a third table.
6. Dynamic feed lines: the sim emits `{ key, params: { a: 'Amélie', b: 'Théo', stage: 'bench' } }`; nested keys are resolved at render time: a param value starting with `@` is itself a key (`stage: '@stage.bench'`), so a stored feed line re-renders correctly after a language switch.
7. Avatar cascade status strings are keys (`avatar.status.swooping`), toasted as `t('avatar.says', { name, what: t(status) })`.
8. Test: `Object.keys(en)` equals `Object.keys(es)`; every `t('...')` literal in `src/` exists in `en`; no `textContent =` or `toast(` call receives a non-key literal (brief §9 row 9).

---

## 13. Debug harness (`debug/harness.ts`, `perf.ts`)

`window.__PD` is installed only when `import.meta.env.DEV` is true (Vite removes the call from the production bundle). It exposes these ten groups, and nothing more (this table is the single list; 05 §8.3, 08 §3.1 and 09 §5.2 follow it):

| Group | Members | Why |
|---|---|---|
| State (read) | `T, W, layers { KIND, WEAR, OCC, WATER, ICE, WET, PETALS, BEDC, PAVEDAY }, visitors, pairs, creatures, props, effects, cam, feed()` | inspection in the console and in tests |
| Stepping | `simulate(n = 1)`, `tick()`, `rngN()`, `hash()`, `worldHash()`, `setSpeed(v)`, `SP` | determinism runs like GV's `det.js` (GV 12022, 12232); `worldHash()` hashes the nine layers and `props` only (07 S2.6 item 14); `SP` is the per-phase lap table of section 4.2 |
| Commands | `enqueue(cmd)`, `apply(cmd)`, `log()`, `replay(cmds)` | scripted play |
| Picking | `tap(sx, sy)`, `pick(sx, sy)`, `screenOf(x, y)`, `screenToTile(sx, sy)` | input tests |
| Save | `snapshot()`, `restore(s)`, `savePark()`, `loadPark()`, `clearAll()` | round-trip tests |
| Park | `newPark(seed)`, `callVisitor()`, `setWeather(kind)` (enqueues the `debug.weather` command of section 5.1, which writes `W.kind` and `W.next` = that kind's mean duration sim-side with no draw, so the log stays complete) | reproducing scenes |
| Render | `draw()`, `pix(x, y, w, h)`, `dpr()`, `FT`, `DBG` (quality flags), `qualityLevel()` | screenshot assertions (GV `pix` 12227) |
| Audio | `audio` object of 05 §8.3 (`cues`, `play`, `log`, `dryRun`, `state`, `music`, `ambience`) | the sound check and the dry-run determinism check |
| Screenshots | `seedVisual(seed)`, `fxStep(dt, n)` | reproducible particles for `tools/shot.mjs` (08 §4.1); visual stream only |
| Meta | `version`, `schemaVersion` | fixtures |

The perf overlay `#perf` (`perf.ts`, GV 12057–12069) shows frame, sim and draw EMA with one-second peaks and the entity counts; toggled by the clock chip double tap under `body.dev`. The auto quality step-down (GV `DBG.smooth`) becomes `qualityLevel()` 0 → 1 → 2: level 1 drops lamp halos and ribbons, level 2 drops tree sway and petals; it steps when draw EMA > 22 ms for 180 frames and never steps up in a session, disabled under WebDriver (GV 12064).

---

## 14. Build and tooling

| Item | Decision |
|---|---|
| `package.json` scripts | `dev` (vite), `build` (tsc -b && vite build), `preview`, `test` (vitest run), `test:watch`, `lint` (oxlint src tests tools vite.config.ts), `typecheck` (tsc -b; every tsconfig sets noEmit), `shot` (node tools/shot.mjs), `check` (typecheck && lint && test && build), `det` (node tools/det.mjs), `perf` (node tools/perf.mjs); both take `--url <dev server url>`, default `http://localhost:5173/` |
| Runtime dependencies | none |
| Dev dependencies | `vite`, `typescript`, `vitest`, `oxlint`, `vite-plugin-singlefile`, `puppeteer-core`, `jsdom` (for `ui/` tests) |
| `vite.config.ts` | `plugins: [viteSingleFile()]`; `base: './'` (relative, so `dist/index.html` opens from disk and from any sub-path; a separate repository with its own `base` is optional and not planned, register §7); `build.target: 'es2022'`; `build.assetsInlineLimit: 1_000_000` so the woff2 fonts inline; `build.cssCodeSplit: false`; the harness and dev UI are gated by `import.meta.env.DEV` alone, no extra `define` |
| `tsconfig.json` | project references to `tsconfig.app.json` (src), `tsconfig.test.json` (tests) and `tsconfig.node.json` (vite.config.ts, tools); `tsconfig.app.json` holds `strict: true`, `noUncheckedIndexedAccess`, `target: es2022`, `module: esnext`, `moduleResolution: bundler`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `isolatedModules`, `noEmit`, `types: ['vite/client']` |
| oxlint | default rules plus `no-restricted-imports` for the layer rule of section 2.1 (`render/*`, `audio/*`, `ui/*`, `debug/*` forbidden in `core/`, `world/`, `entities/`, `play/`, `save/`), `no-restricted-globals` for `Math.random` (allowed only in `core/rng.ts` tests' fixtures: none) |
| Single-file build | `dist/index.html` with all JS, CSS and fonts inline, plus `dist/style-board.html` and `dist/music-board.html`, each one file (07 §0.5 row 4); no `dist/assets/` directory left over; verified by the `check` script (`ls dist` must show only these files: `index.html` alone before S1, the three from S1 on) |
| Tests (`tests/`) | `tests/` holds the Vitest files of 08 §2 (one per module plus `determinism`, `save`, `migrate`, `strings`, `content`, `colour-literals` and the jsdom files under `tests/ui/`); 07 names the slice that creates each |
| Screenshot script | `tools/shot.mjs`: launches `/opt/pw-browsers/chromium` with `puppeteer-core`, viewport 390 × 844, `deviceScaleFactor: 3`, opens `dist/index.html` (or the preview URL), clicks `#begin`, sets `#spdR` to 8, waits 3 sim days by polling `document.title` suffix or a `data-day` attribute on `body` (the harness is absent in production), captures `shots/<slice>-<name>.png`, fails on any console error |
| Pages deploy | Deferred: the app stays in `gnome-village` (register row 4, 2026-10-11) and `parque-damour/.github/workflows/pages.yml` stays inert (it is not at the repository root, so GitHub never runs it). It holds the recipe (`npm ci`, `npm run check`, upload `dist/` as the Pages artifact) for the optional separate repository of register §7 and `07-Build-Plan.md` Slice 0 |
| Capacitor readiness checklist | (1) no runtime fetch; (2) fonts bundled; (3) `env(safe-area-inset-*)` on every fixed overlay (GV 32, 77, 157–165); (4) `viewport-fit=cover`, `maximum-scale=1` (GV 5); (5) `localStorage` only through `store.ts` so a native storage plugin can replace it in one file; (6) audio context created on a user gesture and resumed on `visibilitychange`; (7) 60 fps at the caps on a mid phone with the quality step-down; (8) no `window.open`, no external links; (9) `theme-color` meta present; (10) a `dist/index.html` that works from `file://` (relative `base`) |

---

## 15. Performance plan

### 15.1 Budgets (390 × 844, dpr 2, zoom 1, caps reached)

| Phase | Budget | Measured by |
|---|---|---|
| One sim step | ≤ 2.5 ms (visitors 1.2, creatures 0.3, romance and abilities 0.3, weather and wear 0.3, commands 0.1) | `SP` laps |
| Draw | ≤ 8.6 ms (section 7.9) | `FT.draw` |
| HUD DOM | ≤ 0.4 ms per 0.35 s refresh | `FT.frame - FT.sim - FT.draw` |
| Frame at 1× | ≤ 12 ms sim + draw (brief §9 row 3), EMA ≤ 16.7 ms | `#perf` |
| Frame at 8× | 8 steps (≤ 20 ms sim) under the 26 ms budget; the loop runs behind the dial rather than dropping frames (GV 12076–12086) | `#perf` |
| Memory | layers 64 KB; caches: tree sprites ≤ 1400 canvases (cleared), `GC` memo 900, tile colours 2304 strings | DevTools |

### 15.2 GV tricks to keep (review §13)

1. `dpr` capped at 2, one `setTransform` per frame, `imageSmoothingEnabled = false` (GV 6336, 12044).
2. Offscreen sky at ≤ 4 Hz (6525–6534).
3. Counting-sort painter order (6367–6373), now over drawables.
4. Colour epoch 220 ms / 110 ms while turning gating every per-tile colour (9586–9587).
5. Tree sprite cache with a zoom bucket (6782), `GC` memo (6471).
6. Pixel culls: trees < 2.5 px, props < 1.5–3 px, flowers z < 0.8, ribbons z < 0.45, figures h < 3 px (review §13).
7. Particle cap 220; weather particle counts normalised to 390 × 800 (10072, 10091).
8. Line widths floored at `max(0.5, k * z)`.
9. Preallocated typed scratch for A* (1412–1413); route cache and replan cooldown (1569–1597); blocked-target memory.
10. Throttled passes: HUD 0.35 s, census 1.2 s, planning 1.2 s, wear decay 1 s, decision cadence 0.5–1.3 s.
11. The loop governor: `nsMax`, wall budget, backlog drop, 50 ms frame clamp (12073–12086).
12. Auto quality step-down (`ftNote`, 12064) adapted to `qualityLevel()`.
13. `layoutOverlays` reads `getBoundingClientRect` only on its 0.35 s cadence and on events, never per frame (review §13 flags `focusY` per frame while following: cache the band and refresh it with the same cadence).

### 15.3 What to drop

The coarse 2 × 2 lattice and shore promotion (6364, 9937–9944); per-frame vertex projection (6417) and the drawn surface (713–812); `fitTileGrad`, sub-quads, `vertGrads`, `valleyShade` (8923–8961, 9471–9527); the sea sheet and marching-squares sea (9282–9337); the water solver and its sub-steps (1151–1298, 12028); the per-house full redraw (7080) is replaced by few, simple props; `laidOn` plan scans (4172); `ptInQuad` allocation (6438); unbatched snow (10098) is batched into one path per layer.

---

## 16. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | A determinism leak: `Math.random`, `Date.now`, `performance.now`, object key order, `Set` iteration order, a camera read inside the sim | oxlint globals rule; the layer import rule; arrays not `Set`s for sim collections; `determinism.test.ts` in CI from Slice 2 on; the harness `rngN` to find where two runs part (GV 588 comment) |
| 2 | Float results differing across JS engines (`Math.sin`, `pow`) | the determinism criterion is "same device, same build"; the two-player mode would need lockstep validation by hash, which the command log already supports |
| 3 | A weaker model ports terrain, water flow or construction code because it is next to what it was asked to port | the Do-not lists in sections 1, 7.9, 11; `09-Porting-Map-from-Gnome-Village.md` names drop ranges; the module map says PORT ranges exactly |
| 4 | Strings leak into code | `strings.test.ts` greps `src/` for quoted sentences outside `strings/`; review rule P7 |
| 5 | `OCC` overflow at 65535 prop ids | recycled `PropId` free list; soft cap 600 with a reason key |
| 6 | Save bloat or quota errors in private mode | 160 KB estimate; `try/catch`; the game runs without storage and says so once |
| 7 | The 2304-tile pass too slow on a weak phone at zoom 0.3 (every tile visible) | colour runs grouped per `fillStyle`; epoch cache; quality step-down; measured in Slice 2 before any prop work |
| 8 | Painter errors: a figure drawn under a bench or behind a facade | the near-side cutaway rule (7.4); stable tie order; a screenshot test with a pair on a bench at four quarter turns |
| 9 | Audio autoplay refused or the context lost on iOS | create on Begin/Continue; resume on every pointerdown while `state == 'suspended'`; mute is a hard cut on `master.gain` followed by a scheduling gate and a 2 s `suspend()` (05 §7.3) |
| 10 | GV line numbers drift when someone re-saves the HTML | all citations are to the uploaded file named in the review §1; the review §16 lists known drift; never re-format the GV file |
| 11 | Art or music drifts away from the gate picks (both gates passed on 2026-10-12, register §4) | draw direction **A Storybook** only and never extend the frozen B and C branches (04 §3.4); the game plays only motifs **B** and **C** by the clock rule of 05 §5.4 and never motif A (05 §5.9); both boards stay unchanged as the record of the gates |
| 12 | Events delivered twice (sim listener and frame listener both toast) | only `ui/hud.ts` toasts; sim listeners never touch the DOM; `drain` runs once per frame |
| 13 | A command applied in the wrong tick after a stall (backlog drop) | commands are stamped `tick + 1` and applied by `<=`, so a dropped backlog still applies them on the next step that runs |
| 14 | The avatar's hit resolved against a stale camera (the actor moved between tap and apply) | the sim re-validates the hit by tile distance (5.2 item 4) and falls through to walking |
| 15 | i18n plural and gender rules diverging between EN and ES | one helper pair with two forms each; the parity test covers `.one/.other` and `.f/.m` suffixes |

---

## 17. Assumptions and open points

Values this document defines that the register does not (the owner may object; on change, update `06-Content-Tables.md`, `07-Build-Plan.md` and `08-Test-Plan.md` to match):

| # | Assumption | Where |
|---|---|---|
| A1 | A `BEDC` Uint8 tile layer for flowerbed colour (design §8.3 cycles four colours but the register lists seven layers) | 3.2 |
| A2 | A `PAVEDAY` Int16 tile layer so the gardener does not redo a tile the same day (design §11.1 rule 6) | 3.2 |
| A3 | The `child` and `cameo` archetype values on the `Visitor` record (the register's eleven archetypes are the arrival types; a family's child and the ability cameos need their own `archetype` for routines). Archetype ids are the register's names with the space removed (`dogwalker`); the displayed name is `t('archetype.dogwalker')` and the content test compares the displayed names with the register's spellings | 3.3 |
| A4 | Caps not in the register: active effects 64, overrides 16, props soft cap 600, blocked memory 8, A* nodes 2600 (design §5.5), command log 600 (design §14.5) | 3.11 |
| A5 | `spaceOut` works in world units equivalent to 10 × 8 px at zoom 1 along the unrotated iso axes, so the sim never reads the camera angle | 6.3 |
| A6 | Fit clamps to the register's zoom floor 0.30, cropping the apron's side corners on a 390 px phone at quarter turns | 7.1 |
| A7 | Near-side facades (between the camera and the park) are drawn as their opaque ground floor, 1.2 EH, with a flat zinc roof, so they never hide the park (variant 1 of the boulevard gate; it replaced the 0.6-unit cutaway at alpha 0.35 on 2026-10-13) | 7.4 |
| A8 | Figure height `FH = 22` px at zoom 1 (GV 14.3) and the LOD thresholds; `FH` 22 stands: the owner saw it on board tile 7 at zoom 1.3 and picked A without objection (04 §13); changing it still needs the owner | 7.6 |
| A9 | Lamp light is local: the 04 §6.1 halo and pool (full alpha to 1.6 tiles, 0 at 3) and an 18 % warm mix on figures within 3 tiles | 7.3 |
| A10 | The sun arc is corrected to left-to-right across the top (review §16 flags GV's path) | 7.4 |
| A11 | Particles step on the frame with `dtr × speed`, not inside `simulate` (GV 12037 had them in the sim) | 4.1 |
| A12 | Lite bits are redefined to drop fx and cue events only, never sim work | 4.5 |
| A13 | `T.abs` is derived from the integer `tick` (no float accumulation) | 6.1 |
| A14 | Commands carry a `seq` field beyond the register's four (`tick, side, kind, payload`); they are stamped `tick + 1`; sides order park < cupid < mischief within a tick | 5.1, 5.2 |
| A15 | `speed` is a command (so a hot-seat or online mode can agree on it) but is excluded from the state hash and stored in the profile | 4.6 |
| A16 | `pinnedPair` is saved in the park but excluded from the state hash (design §14.3 calls it client state) | 3.10, 11 |
| A17 | Music numbers live in 05 §5 and §9 item 7; the Music Gate passed on 2026-10-12 with B and C at the board defaults of 05 §6.3 and the gate mix (`MUSIC_MAKEUP` 4.5, B `TINE_MAKEUP` 2); the clock rule of 05 §5.4 is ADVISED | 9.3 |
| A18 | The weather `WET` rise and fall per tile are applied every step across all tiles (cheap) rather than per visitor tile | 6.2 |
| A19 | `makeIR` and the `grain()` buffer are filled once from a private `mulberry32(0xA0D10)` inside `engine.ts` (05 §1 item 6), so neither `rng` nor `vrng` moves (GV 6077 used `Math.random`) | 9.1 |
| A20 | The perf overlay and sound check are revealed by `body.dev`, set from `#dev` in the hash or a dev build; the `__PD` harness is dev-build only | 10.2, 13 |
| A21 | Build details: `vite-plugin-singlefile`, `es2022`, inline limit 1 MB, `jsdom` for UI tests, the screenshot script's wait strategy (`data-day` on `body`) | 14 |
| A22 | Phase budgets of section 7.9 and 15.1 are targets to measure against, not gates until the brief's success criteria apply (brief §9 rows 3–4) | 7.9, 15.1 |
| A23 | Prop kinds beyond design §2.6: `umbrella` (the shared umbrella of `c_umbrella`, drawn over the pair) and the apron kinds `railing`, `gate`, `facade`, `quay` and the street lamps (`park.ts: streetLamps`, drawn with the kind `lamp`; no charm), which are regenerated and never saved | 3.6 |
| A24 | An extra autosave of the park on `park.new` (after the confirm, before the old park is cleared) so Continue never finds a half-written key | 11 |

Open points for the owner:
1. Whether a two-player mode should stamp commands with a fixed `LEAD` or use a lockstep "wait for the peer" rule is left to the transport slice; both work with section 5.
2. Whether `#s=<seed>` in the URL should survive a Continue (GV wrote it on every new island) or be dropped once a save exists. This document writes it only on `park.new`.
3. Closed 2026-10-13: the owner picked boulevard variant 1 (register section 4): natural plane trees whose crowns go see-through over the park, a cobbled road, near-side blocks as opaque ground floors (A7), as built. The style board keeps its cutaway tile (04 §4.2 tile 11) as the record of the gate.
4. Known limitation, kept by the owner on 2026-10-13 (Slice 3 hand-back question 10, "N"): reserved-id drift after a Continue. A restore empties the undo stack (register 3.11) but keeps the ids the snapshot holds reserved, so the round trip keeps `stateHash()`; on the restored path no entry will ever release them, while the live path releases each when its entry leaves the stack (5.6 item 3: ten more entries, or a `clearUndo` such as `avatar.enter`). From then on the two paths hand out different `PropId`s for new props and their state hashes part, which shows only when a test compares a live run with its restored twin. The player sees no difference: the same props stand in the same places, only their ids differ. `tests/save.test.ts` keeps the gap pinned with `it.fails`.
5. Open after Slice 4, pending the owner (from the Slice 4 hand-backs; each is built as described and pinned by its test, and changes only on the owner's word):
   1. The arrivals counts. 07 S4.7 item 2 (and the `arrivals.test.ts` row of 08 §2.3) asks for 16 ± 3 people by f 0.45 and 24 ± 3 by f 0.70 at 8× on seed 101, which the arrival rules cannot reach: one arrival every 6 to 14 s (design §4.2 item 2, 06 §1.8) and a visit of 0.25 to 0.5 day (register 3.4). `tests/arrivals.test.ts` pins what the rules give, 10 ± 3 and 17 ± 3 (seed 101 gives 9 and 17). The owner chooses: keep the gap and take the lower counts into 07 and 08, or shorten the gap (a change to design §4.2 and 06 §1.8).
   2. The starter kiosk's vendor comes at the first planning tick (step 72), not at step 0 as design §4.2 item 8 reads ("when the kiosk is placed"). Seating it in `newPark` re-rolls every seeded day (on seed 101 the rain then falls at midday and 10 people are in the park at f 0.70, outside item 1's pinned 17 ± 3), so it waits on item 1 (`core/loop.ts` header).
   3. `SIG_NEAR` 20 (CIEDE2000), the distance under which a top counts as close to a single's own signature colour and is re-rolled (register section 4, Crowd palette: a single "never wears a top close to its own signature colour"); no document gives the number (`render/figure-look.ts`).
   4. The Tailored rig's neck measures 0.03 h where 04 §7.1 item 2 gives 0.04; the rig's proportions change only with the owner (07 S4.10).

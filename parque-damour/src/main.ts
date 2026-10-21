// src/main.ts
// Boot order and wiring only, no rules (03 2.2): language, intro, then on Begin or Continue: renderer, park, input, rail, HUD, the frame,
// the loop.
// Ported from GV 12127-12222 (boot) and 12101-12124 (newIsland: the hash and the start view) as a wiring pattern. ADAPT: modules instead
// of closures; styles are linked from index.html; the frame runs 03 4.1 items 7 to 12 through loop.onFrame and loop.onFrameEnd.
// S3: the creator-mode tap routing of 03 8.2 items 3 and 4 (1 x 1 stamps enqueue at once; big stamps and runs show a ghost the rail
// holds and enqueue on Place or a second tap on the same tile; brushes paint on down and on the throttled drag of camera.ts, which
// fills the gaps of a fast drag along a straight line (owner 2026-10-13), one `tool` command per centre and one stroke id per pointer
// stroke, which ends when the last pointer leaves, and a stroke that would change no tile toasts its first centre's reason, "outside
// the railings" when no park tile was reached, 02 8.2 and 8.4); the autosave on visibilitychange to hidden, pagehide and every 30 sim
// seconds (store.stepAutosave from the frame-end hook); Continue restores the save silently and fits the camera (03 11); New asks the
// confirm, then writes the park once more (03 17 A24) and enqueues `park.new` with a fresh seed (applied at once even while paused,
// which stays paused: 03 4.6, owner 2026-10-13); when it applies, the park key goes, parksPlayed counts one more (store.clearPark), the
// hash names the new seed and the view starts over. The language is the profile's once a profile was written, else the browser's.
// S4 part C: a tap with the hand selects (card.select of pickAt over render/people.ts's people and creatures, 03 8.2 item 4), the camera
// follows through people.ts followPos (a sitter at its seat, a pigeon at its flight height), draw gets the selected visitor for the ring,
// the feed's listeners are wired, a Park tool other than the hand clears the selection (card.initCard), and a new park clears the
// selection and the feed.
// Park pace and Options (owner 2026-10-14, register section 4): every new park the shell starts gets the profile's pace through
// store.enqueueProfilePace, right after Begin's newPark, after the fresh park of a Continue whose restore threw, and after New's
// `park.new` (never inside newPark or afterNewPark: the harness's newPark runs both, and the det runs must not gain a command); a
// Continue that restores keeps the saved park's pace. Begin's pace shows pressed in the Options sheet while its first step waits
// (sheets.paceQueued; a park started paused). The Options sheet gets the dev perf overlay's state and switch as hooks.
// S6 (03 8.2 item 2): with an ability armed (ui/ability-strip.ts) a tap on the world is its target: ability-strip.tapAbility resolves it by
// the ability's type from pickAt and the tile, enqueues the logged `ability` command and leaves the ability armed (the sim validates
// again; a refusal comes back as `rejected` and hud.ts toasts it).
// S7 (03 8.2 item 1; 07 S7.6 step 6): in the avatar mode a tap on the world is the logged `avatar.tap` on the possessed avatar's side, with the
// tile (an apron tile goes on: the sim says `reason.outside`) and the hit pickAt resolved, the avatar itself left out of the candidates so a
// tap beside it reaches what is there; the camera follows the actor again (GV playerCommand 11278); hud.ts toasts what comes back. A Continue
// that restored the avatar mode shows it at once (hud.initHud calls applyMode).
// S8 part A (05 7.3, 7.5; 07 S8.6 steps 10 and 11): the profile's muted setting is restored at boot before any context exists; Begin and
// Continue (the first gesture) unlock the audio context and bind the cues to the event bus; every frame hands the limiter the frame stamp and
// runs the cue sources, the ambience and the songbirds in real seconds, paused or not (03 4.1 item 8); a pointerdown on the canvas resumes a
// suspended context; visibilitychange suspends on hidden and resumes on shown unless muted (GV 12199); any button press sounds ui_tap; a New
// resets the ambience's timers.
// S8 part B (05 5.4, 5.8; 07 S8.6 steps 7 to 9): once the park is up (a new one or the saved one, so the clock rule sees its f) startMusic starts the
// wanted motif with its first bar 1.5 s after the tap; every frame updateMusic schedules the look-ahead, paused or not; a New park restarts it; the
// Sound check's music buttons play the game's own B and C in a fixed variant. The retired waltz is the board's and never reaches this file.
import { newPark as loopNewPark, now as frameNow, onFrame, onFrameEnd, setSpeed, start } from './core/loop.ts';
import { T } from './core/clock.ts';
import { AVATAR_SIDE, enqueue } from './core/commands.ts';
import { watch } from './core/events.ts';
import type { XY } from './core/math.ts';
import { I, props } from './world/grid.ts';
import { parkSeed } from './world/gen.ts';
import { ghost } from './play/tools.ts';
import { getAvatar, getMode, getPlayer } from './play/mode.ts';
import { CTR, ZOOM_START, cam, centreOn, fitCam, resize, setAngle, setFollowLookup, setupInput, stepCamera, type ToolClass as Gesture } from './render/camera.ts';
import { pickAt, screenToTile } from './render/project.ts';
import { followPos, pickCreatures, pickPeople } from './render/people.ts';
import { people } from './entities/visitor.ts';
import { creatures } from './entities/creatures.ts';
import { initRender, draw } from './render/draw.ts';
import { setGroundQuality } from './render/ground.ts';
import { ambientFx, clearParticles, particles, stepParticles } from './render/effects.ts';
import { $, applyDom, layoutOverlays, openConfirm, toast } from './ui/dom.ts';
import { showIntro, startLang } from './ui/intro.ts';
import { activeTool, armedGhost, brushSize, buildRail, cancelGhost, syncSpeed, tapGhost, toolClass, updateRail } from './ui/rail.ts';
import { armedAbility, tapAbility } from './ui/ability-strip.ts';
import { initHud, noteAvatarTap, updateHud } from './ui/hud.ts';
import { initSheets, paceQueued } from './ui/sheets.ts';
import type { MusicHooks } from './ui/soundcheck.ts';
import { clearSel, followActor, initCard, select, selectedVisitor } from './ui/card.ts';
import { clearFeed, feedState, initFeed, setFeedState, type FeedEntry } from './ui/feed.ts';
import {
  clearPark, enqueueProfilePace, getProfile, loadPark, profileMuted, profilePace, resetAutosave, restore, saveBeforeNew, savePark, setFeedIO, stepAutosave,
} from './save/store.ts';
import type { ParkSaveV1 } from './save/schema.ts';
import { ctxState, isMuted, resume, setMuted, suspend, unlockAudio } from './audio/engine.ts';
import { setNow } from './audio/limiter.ts';
import { cue } from './audio/cues.ts';
import { bindCues, resetCueSources, updateCueSources } from './audio/cues-bind.ts';
import { resetAmbience, updateAmbience } from './audio/ambience.ts';
import { resetBirds, updateBirds } from './audio/birds.ts';
import { previewMusic, restartMusic, startMusic, stopMusic, updateMusic } from './audio/music.ts';

// the park save keeps the feed's 40 lines (register 3.11); save/ may not import ui/, so the shell hands it the reader and the writer (S5)
setFeedIO({ get: () => feedState() as unknown as Array<Record<string, unknown>>, set: (s) => setFeedState(s as unknown as FeedEntry[]) });
import { installHarness } from './debug/harness.ts';
import { FT, ftNote, qualityLevel, setPerfCounts, setPerfOn } from './debug/perf.ts';

function freshSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] ?? 1) >>> 0 || 1;
}

/** `#dev` (or `&dev` after the seed) is the dev flag that sets `body.dev` (03 10.2); it never installs the harness (03 section 13). */
function hasDevHash(): boolean {
  return /(^#|&)dev(&|$)/.test(location.hash || '');
}

/** `#s=<seed>&halt` picks the seed and starts paused (GV 12097, 814); `&dev` sets `body.dev`. */
function readHash(): { seed: number; halt: boolean; dev: boolean } {
  const h = location.hash || '';
  const m = /s=(\d+)/.exec(h);
  return { seed: m ? parseInt(m[1] as string, 10) >>> 0 : freshSeed(), halt: /halt/.test(h), dev: hasDevHash() };
}

/** The hash names the park's seed (GV 12115), keeping the dev flag. */
function writeHash(seed: number): void {
  history.replaceState(null, '', '#s=' + seed + (hasDevHash() ? '&dev' : ''));
}

/** Angle 0, no follow, no pivot, the fit view measured (cam.fitZ). */
function resetCamera(): void {
  setAngle(0);
  cam.angT = 0;
  cam.turnKeep = null;
  cam.free = false;
  cam.follow = 0;
  fitCam();
}

/**
 * After a new park, from the sim's newPark or an applied `park.new`: the particles of the old scene go, the hash names the seed, a
 * ghost of the old park goes, the 30-second count starts over, and the view is the start view of 04 5.1 (zoom 1.3 centred on the
 * fountain) with the whole park one press of Fit away (GV newIsland 12115-12123).
 */
function afterNewPark(seed: number): void {
  resetAmbience(); // the countdowns belong to the old park (05 4.1 item 3)
  resetBirds();
  resetCueSources();
  clearParticles();
  clearSel();
  clearFeed();
  writeHash(seed);
  cancelGhost();
  resetAutosave();
  resetCamera();
  cam.z = ZOOM_START;
  cam.free = true;
  centreOn(CTR, CTR);
}

/** The sim's newPark (world, creator mode, empty log and sequence, tick 0; core/loop.ts) at boot and for the harness, then the view. */
function newPark(seed: number): void {
  loopNewPark(seed);
  afterNewPark(seed);
}

/* ---------- the tap routing of creator mode (03 8.2 items 3 and 4; 02 8.2) ---------- */

/** camera.ts's one-finger gesture by tool class (03 8.1 item 2): the hand pans, a brush paints, a stamp or run waits for the tap. */
function gesture(): Gesture {
  const c = toolClass();
  return c === 'none' ? 'hand' : c === 'brush' ? 'brush' : 'other';
}

/**
 * 03 8.2 item 1: a tap on the world in the avatar mode. The people and creatures pickAt may choose from leave out the actor itself (the
 * sim ignores a hit on it as well, avatar-pick.ts); the tile is the tapped one, apron included; the answer is a `rejected` or an
 * `avatarStatus` event hud.ts toasts. The camera follows the actor again (a drag had let it go: 02 10.2).
 */
function onAvatarTap(sx: number, sy: number): void {
  const a = getAvatar();
  if (!a) return;
  const tile = screenToTile(sx, sy, true);
  if (!tile) {
    toast('reason.outside');
    return;
  }
  const self = getPlayer(), creature = a === 'a_pigeon' || a === 'a_pomeranian';
  const hit = pickAt(
    sx,
    sy,
    pickPeople().filter((p) => creature || p.id !== self),
    pickCreatures().filter((c) => !creature || c.id !== self),
  );
  noteAvatarTap(hit);
  enqueue({ side: AVATAR_SIDE[a], kind: 'avatar.tap', payload: { tile: { x: tile.x, y: tile.y }, hit } });
  followActor();
}

function onTap(sx: number, sy: number): void {
  if (getMode() === 'avatar') {
    onAvatarTap(sx, sy);
    return;
  }
  if (armedAbility() !== null) {
    tapAbility(pickAt(sx, sy, pickPeople(), pickCreatures()), screenToTile(sx, sy, true)); // 03 8.2 item 2: the target by the ability's type
    return;
  }
  const cls = toolClass();
  if (cls === 'none') {
    select(pickAt(sx, sy, pickPeople(), pickCreatures())); // the hand: a person is selected and followed, anything else clears (03 8.2 item 4)
    return;
  }
  if (cls === 'brush') return; // a brush painted on down
  const tile = screenToTile(sx, sy, true); // an apron tile goes on, so the sim answers with reason.outside
  if (!tile) {
    toast('reason.outside');
    return;
  }
  if (cls === 'stamp1') {
    const tool = activeTool() as 'bed' | 'tree' | 'bench' | 'lamp' | 'remove';
    enqueue({ side: 'park', kind: 'tool', payload: { tool, at: { x: tile.x, y: tile.y } } }); // a refusal comes back as `rejected`
    return;
  }
  tapGhost(tile);
}

/** One pointer stroke of a brush: its id (one undo entry, 03 5.6 item 2), the tiles it queued, and the first centre's refusal. */
const stroke = { id: 0, seq: 0, tiles: new Set<number>(), painted: false, reason: '' };

function onStrokeStart(): void {
  stroke.id = ++stroke.seq;
  stroke.tiles.clear();
  stroke.painted = false;
  stroke.reason = '';
}

/**
 * Paint one centre (02 8.2 brush row): the ghost says which tiles would change; a centre whose tiles this stroke already queued sends
 * nothing (the commands wait for the next step, or for the unpause), any other good centre is one `tool` command of the stroke.
 */
function onPaint(tile: XY): void {
  const tool = activeTool();
  if (tool !== 'path' && tool !== 'lawn' && tool !== 'pond') return;
  if (stroke.id === 0) onStrokeStart(); // a drag that began on the apron reaches the park: the stroke starts here
  const size = brushSize();
  const g = ghost(tool, tile, { size });
  if (!g.ok) {
    if (!stroke.reason) stroke.reason = g.reason ?? 'reason.not_here';
    return;
  }
  let fresh = false;
  for (const t of g.tiles) {
    const i = I(t.x, t.y);
    if (!stroke.tiles.has(i)) {
      stroke.tiles.add(i);
      fresh = true;
    }
  }
  if (!fresh) return;
  stroke.painted = true;
  enqueue({ side: 'park', kind: 'tool', payload: { tool, at: { x: tile.x, y: tile.y }, size, stroke: stroke.id } });
}

/**
 * The pointer stroke ended (the last pointer left the canvas): a stroke that changed no tile toasts its first centre's reason (02 8.2,
 * 8.4 last line). A brush gesture that never reached a park tile had its centre outside the railings (02 8.4 item 1): camera.ts paints
 * only park tiles, so it says so here, as a 1 x 1 stamp's tap there does.
 */
function onStrokeEnd(): void {
  if (stroke.id === 0) {
    if (held.brush) toast('reason.outside');
    return;
  }
  if (!stroke.painted && stroke.reason) toast(stroke.reason);
  stroke.id = 0;
}

/**
 * The pointers down on the canvas, so a stroke ends only when the last one leaves: a second finger touching and lifting (a pinch begun
 * and given up) does not split the stroke, as camera.ts paints on with the finger still down (one undo entry per stroke, 02 8.2).
 * `brush`: the gesture began with a brush armed.
 */
const held = { ids: new Set<number>(), brush: false };

function onPointerDown(e: PointerEvent): void {
  if (!isMuted() && ctxState() !== 'running' && ctxState() !== 'none') resume(); // iOS and a route change suspend the context (05 7.5 item 4)
  if (held.ids.size === 0) held.brush = gesture() === 'brush';
  held.ids.add(e.pointerId);
}

function onPointerUp(e: PointerEvent): void {
  if (!held.ids.delete(e.pointerId) || held.ids.size > 0) return;
  onStrokeEnd();
  held.brush = false;
}

/* ---------- New (02 12.5 item 4; 03 11) ---------- */

/** Row 3 New: the confirm; Yes writes the park whole once more (A24), enqueues `park.new` with a fresh seed and the profile's pace. */
function askNew(): void {
  openConfirm('confirm.new_park', () => {
    saveBeforeNew();
    enqueue({ side: 'park', kind: 'park.new', payload: { seed: freshSeed() } });
    enqueueProfilePace(); // carried with the New: the new park's tick 0 (commands.ts enqueueAfterNew)
  });
}

/* ---------- boot ---------- */

/**
 * The profile's pace for the park Begin just started (store.enqueueProfilePace; register section 4, Park pace and Options): it applies
 * at the new park's first step (tick 1), and the Options sheet shows it pressed while that step waits (a park started paused, `#halt`).
 */
function beginPace(): void {
  enqueueProfilePace();
  paceQueued(profilePace());
}

let live = false; // a park is on screen: the autosave may write (never from the intro, which would save an empty world)

type Start = { kind: 'new'; seed: number } | { kind: 'load'; save: ParkSaveV1 };

/** The Sound check's music buttons: the game's own B and C in a fixed variant, and stop (05 2.6 item 2). */
const soundCheckMusic = (): MusicHooks => ({ play: previewMusic, stop: stopMusic });

function begin(canvas: HTMLCanvasElement, from: Start, halt: boolean): void {
  if (live) return; // one start per page: the rail, the HUD and the watchers are wired once (intro.ts answers once as well)
  unlockAudio(); // the Begin or Continue tap is the gesture that lets the context start (GV 12216-12217; muted: built and closed)
  resetAmbience();
  resetBirds();
  bindCues(); // every trigger of 05 3.2 on the event bus, once
  initRender(canvas);
  resize(canvas);
  if (from.kind === 'load') {
    try {
      restore(from.save); // Continue is silent (03 11): no toast
      clearParticles();
      writeHash(from.save.seed);
      resetCamera();
      resetAutosave();
    } catch {
      newPark(freshSeed()); // migrate.ts checked the save, so this is a damaged layer: start fresh and say so
      beginPace();
      toast('toast.load_failed');
    }
  } else {
    newPark(from.seed);
    beginPace();
  }
  live = true;
  startMusic({ delayS: 1.5 }); // the wanted motif of this park's clock, 1.5 s after the tap, fading in over 4 s (05 5.8 item 1)
  setupInput(canvas, { onTap, toolClass: gesture, onStrokeStart, onPaint });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  canvas.addEventListener('pointerup', onPointerUp, { passive: true });
  canvas.addEventListener('pointercancel', onPointerUp, { passive: true });
  initSheets({ perfOn: () => FT.on, setPerf: setPerfOn, music: soundCheckMusic }); // the Options sheet's dev perf entry (03 2.1: ui/ may not import debug/)
  initFeed();
  setFollowLookup(followPos);
  buildRail({ onNew: askNew });
  initCard(); // a Park tool other than the hand ends the selection (GV setTool 11070)
  initHud({
    onClockDoubleTap: () => {
      if (document.body.classList.contains('dev')) setPerfOn(!FT.on); // the perf overlay is a dev entry (03 8.3, 13)
    },
  });
  // an applied `park.new` (New's Yes): the old park's key goes and parksPlayed counts it (03 11), then the hash and the start view
  watch('applied', (ev) => {
    if (ev.params?.kind !== 'park.new') return;
    clearPark();
    afterNewPark(parkSeed());
    restartMusic(); // 05 5.8 item 5: New stops the music; the new park (f 0.30) starts it again
    toast('toast.new_park');
  });
  setPerfCounts(() => ({
    people: people(),
    creatures: creatures.filter((c) => !c.outside).length,
    props: props.length,
    particles: particles().length,
    zoom: cam.z,
  }));
  const relayout = (): void => {
    resize(canvas);
    layoutOverlays();
  };
  window.addEventListener('resize', relayout, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(relayout, 220), { passive: true });
  // the autosave triggers of register 3.11 besides the 30 sim seconds (GV 12199 pattern)
  document.addEventListener('visibilitychange', () => {
    if (live && document.visibilityState === 'hidden') savePark();
    if (document.visibilityState === 'hidden') suspend();
    else if (!isMuted()) resume();
  });
  document.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest?.('button');
    if (b && !b.closest('#snd')) cue('ui_tap', NaN, NaN); // any rail or sheet button press (05 3.2 row 36); the Sound check buttons sound their own cue
  }, { passive: true });
  window.addEventListener('pagehide', () => {
    if (live) savePark();
  });
  let shownSpeed = -1;
  let steps = 0;
  // 03 4.1 items 7 to 11, after the loop's steps and drain: particles, the camera and the ambient spray, the draw, the HUD and the rail
  onFrame((dtr, ns) => {
    steps = ns;
    setNow(frameNow()); // the limiter's real-time stamp for this frame's cues (05 2.4 item 1)
    updateCueSources(dtr); // 03 4.1 item 8: the triggers read from state, the ambience, the songbirds; real seconds, paused or not
    updateAmbience(dtr);
    updateBirds(dtr);
    updateMusic(dtr); // 05 5.8 item 2: the look-ahead of the playing motif (both while they cross); real seconds, paused or not
    stepParticles(Math.min(0.05, dtr) * T.speed); // item 7: visual stream, sim seconds
    stepCamera(dtr); // item 9: turnStep, keepCentre, followStep
    ambientFx(dtr); // item 9: the fountains' spray and rings; nothing while paused
    setGroundQuality(qualityLevel()); // render may not import debug (03 2.1)
    draw(armedGhost(), selectedVisitor()); // item 10, with the rail's live ghost and the selection ring (phase 7)
    if (T.speed !== shownSpeed) {
      shownSpeed = T.speed; // a `speed` command applied: the dial follows
      syncSpeed();
    }
    updateHud(dtr); // item 11
    updateRail(dtr);
  });
  onFrameEnd((simMs, restMs, totalMs, ts) => {
    ftNote(simMs, restMs, totalMs, ts); // item 12: draw and the rest of the frame
    stepAutosave(steps); // item 11's autosave, after the frame is measured: a write lands outside the perf numbers
  });
  setSpeed(halt ? 0 : getProfile().settings.speed); // the stored dial; the pause is never stored (03 4.6)
  syncSpeed();
  start();
}

function boot(): void {
  startLang(navigator.language); // the profile's choice once written, else the browser's; the profile holds it either way (register 3.12)
  setMuted(profileMuted()); // the sound setting before any context exists (05 7.3 item 1)
  applyDom();
  const canvas = $('cv') as HTMLCanvasElement;
  const { seed, halt, dev } = readHash();
  // 03 10.2: `body.dev` from `#dev` in the hash or a DEV build; it reveals the dev entries (S11), nothing more.
  document.body.classList.toggle('dev', import.meta.env.DEV || dev);
  const saved = loadPark(); // the migrated save or null (03 11); Continue shows only with one
  showIntro(
    saved !== null,
    () => {
      // Begin; with a save present the intro asked the confirm first, so that park is given up: its key goes, a fresh seed begins
      if (saved !== null) clearPark();
      begin(canvas, { kind: 'new', seed: saved !== null ? freshSeed() : seed }, halt);
    },
    () => {
      if (saved) begin(canvas, { kind: 'load', save: saved }, halt);
    },
  );
  // 03 section 13: the harness is installed only in a DEV build; a production build never installs it, hash or not.
  if (import.meta.env.DEV) installHarness({ newPark });
}

boot();

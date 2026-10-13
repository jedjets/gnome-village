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
// TODO(S4): taps with the hand select (card.select(pickAt)); TODO(S6): an armed ability's target; TODO(S7): avatar.tap; TODO(S8):
// initAudio on Begin and Continue.
import { newPark as loopNewPark, onFrame, onFrameEnd, setSpeed, start } from './core/loop.ts';
import { T } from './core/clock.ts';
import { enqueue } from './core/commands.ts';
import { watch } from './core/events.ts';
import type { XY } from './core/math.ts';
import { I, props } from './world/grid.ts';
import { parkSeed } from './world/gen.ts';
import { ghost } from './play/tools.ts';
import { getMode } from './play/mode.ts';
import { CTR, ZOOM_START, cam, centreOn, fitCam, resize, setAngle, setupInput, stepCamera, type ToolClass as Gesture } from './render/camera.ts';
import { screenToTile } from './render/project.ts';
import { initRender, draw } from './render/draw.ts';
import { setGroundQuality } from './render/ground.ts';
import { ambientFx, clearParticles, particles, stepParticles } from './render/effects.ts';
import { $, applyDom, layoutOverlays, openConfirm, toast } from './ui/dom.ts';
import { showIntro, startLang } from './ui/intro.ts';
import { activeTool, armedGhost, brushSize, buildRail, cancelGhost, syncSpeed, tapGhost, toolClass, updateRail } from './ui/rail.ts';
import { initHud, updateHud } from './ui/hud.ts';
import { initSheets } from './ui/sheets.ts';
import { clearPark, getProfile, loadPark, resetAutosave, restore, saveBeforeNew, savePark, stepAutosave } from './save/store.ts';
import type { ParkSaveV1 } from './save/schema.ts';
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
  clearParticles();
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

function onTap(sx: number, sy: number): void {
  if (getMode() === 'avatar') return; // TODO(S7): avatar.tap with pickAt and screenToTile(allowApron)
  const cls = toolClass();
  if (cls === 'none' || cls === 'brush') return; // TODO(S4): the hand selects; a brush painted on down
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
  if (held.ids.size === 0) held.brush = gesture() === 'brush';
  held.ids.add(e.pointerId);
}

function onPointerUp(e: PointerEvent): void {
  if (!held.ids.delete(e.pointerId) || held.ids.size > 0) return;
  onStrokeEnd();
  held.brush = false;
}

/* ---------- New (02 12.5 item 4; 03 11) ---------- */

/** Row 3 New: the confirm; Yes writes the park whole once more (A24) and enqueues `park.new` with a fresh seed. */
function askNew(): void {
  openConfirm('confirm.new_park', () => {
    saveBeforeNew();
    enqueue({ side: 'park', kind: 'park.new', payload: { seed: freshSeed() } });
  });
}

/* ---------- boot ---------- */

let live = false; // a park is on screen: the autosave may write (never from the intro, which would save an empty world)

type Start = { kind: 'new'; seed: number } | { kind: 'load'; save: ParkSaveV1 };

function begin(canvas: HTMLCanvasElement, from: Start, halt: boolean): void {
  if (live) return; // one start per page: the rail, the HUD and the watchers are wired once (intro.ts answers once as well)
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
      toast('toast.load_failed');
    }
  } else newPark(from.seed);
  live = true;
  setupInput(canvas, { onTap, toolClass: gesture, onStrokeStart, onPaint });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  canvas.addEventListener('pointerup', onPointerUp, { passive: true });
  canvas.addEventListener('pointercancel', onPointerUp, { passive: true });
  initSheets();
  buildRail({ onNew: askNew });
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
    toast('toast.new_park');
  });
  setPerfCounts(() => ({ people: 0, creatures: 0, props: props.length, particles: particles().length, zoom: cam.z }));
  const relayout = (): void => {
    resize(canvas);
    layoutOverlays();
  };
  window.addEventListener('resize', relayout, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(relayout, 220), { passive: true });
  // the autosave triggers of register 3.11 besides the 30 sim seconds (GV 12199 pattern)
  document.addEventListener('visibilitychange', () => {
    if (live && document.visibilityState === 'hidden') savePark();
  });
  window.addEventListener('pagehide', () => {
    if (live) savePark();
  });
  let shownSpeed = -1;
  let steps = 0;
  // 03 4.1 items 7 to 11, after the loop's steps and drain: particles, the camera and the ambient spray, the draw, the HUD and the rail
  onFrame((dtr, ns) => {
    steps = ns;
    stepParticles(Math.min(0.05, dtr) * T.speed); // item 7: visual stream, sim seconds
    stepCamera(dtr); // item 9: turnStep, keepCentre, followStep
    ambientFx(dtr); // item 9: the fountains' spray and rings; nothing while paused
    setGroundQuality(qualityLevel()); // render may not import debug (03 2.1)
    draw(armedGhost()); // item 10, with the rail's live ghost (phase 7)
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

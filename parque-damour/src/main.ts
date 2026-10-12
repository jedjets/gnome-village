// src/main.ts
// Boot order and wiring only, no rules (03 2.2): language, intro, then on Begin: renderer, park, input, rail, HUD, the frame, the loop.
// Ported from GV 12127-12222 (boot) and 12101-12124 (newIsland: the hash and the start view) as a wiring pattern. ADAPT: modules instead
// of closures; styles are linked from index.html; the frame runs 03 4.1 items 7 to 12 through loop.onFrame and loop.onFrameEnd.
// The rail's speed dial, pause and Fit are taken over here in the capture phase (03 2.2: main wires every control to enqueue or a UI-only
// function), so a running dial and the pause go through the `speed` command (03 5.1, 4.6) and Fit toggles the whole park and the start
// view (GV 12151-12154); rail.ts keeps the turns and the dial's label.
// TODO(S3): Continue restores the save, autosave on visibilitychange and pagehide, New asks to confirm and goes through `park.new`, the
// tap handler routes to tools and the card; TODO(S8): initAudio on Begin.
import { newPark as loopNewPark, onFrame, onFrameEnd, setSpeed, start } from './core/loop.ts';
import { T } from './core/clock.ts';
import { enqueue } from './core/commands.ts';
import { props } from './world/grid.ts';
import { CTR, ZOOM_START, cam, centreOn, fitCam, fitToggle, resize, setAngle, setupInput, stepCamera } from './render/camera.ts';
import { initRender, draw } from './render/draw.ts';
import { setGroundQuality } from './render/ground.ts';
import { ambientFx, clearParticles, particles, stepParticles } from './render/effects.ts';
import { $, applyDom, layoutOverlays, toast } from './ui/dom.ts';
import { setLang, type Lang } from './ui/i18n.ts';
import { showIntro } from './ui/intro.ts';
import { buildRail, syncSpeed, updateRail } from './ui/rail.ts';
import { initHud, updateHud } from './ui/hud.ts';
import { initSheets } from './ui/sheets.ts';
import { hasPark } from './save/store.ts';
import { installHarness } from './debug/harness.ts';
import { FT, ftNote, qualityLevel, setPerfCounts, setPerfOn } from './debug/perf.ts';

type Dial = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

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

function detectLang(): Lang {
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

/**
 * The sim's newPark (world, creator mode, empty log and sequence, tick 0; core/loop.ts), the particles of the old scene dropped, then the
 * hash and the camera: angle 0, the fit view measured (cam.fitZ), then the start view of 04 5.1, zoom 1.3 centred on the fountain, with
 * the whole park one press of Fit away (GV newIsland 12115-12123).
 */
function newPark(seed: number): void {
  loopNewPark(seed);
  clearParticles();
  history.replaceState(null, '', '#s=' + seed + (hasDevHash() ? '&dev' : ''));
  setAngle(0);
  cam.angT = 0;
  cam.turnKeep = null;
  cam.free = false;
  cam.follow = 0;
  fitCam();
  cam.z = ZOOM_START;
  cam.free = true;
  centreOn(CTR, CTR);
}

/** The dial's value as the `speed` command's payload (1-8). */
function dialOf(v: string): Dial {
  return Math.min(8, Math.max(1, parseInt(v, 10) || 1)) as Dial;
}

/**
 * The speed dial, the pause and Fit. A capture listener on the document runs before rail.ts's own listeners on these elements and stops
 * the event there: a moved dial while running and the pause both enqueue `speed` (applied at the next step, or by the paused frame, 03
 * 4.6); a dial moved while paused still reaches rail.ts, which only moves its label. Fit is the camera's two-way toggle with its toast.
 */
function wireControls(): void {
  const sr = $('spdR') as HTMLInputElement;
  document.addEventListener(
    'input',
    (e) => {
      if (e.target !== sr || T.speed === 0) return;
      e.stopPropagation();
      enqueue({ side: 'park', kind: 'speed', payload: { speed: dialOf(sr.value) } });
    },
    true,
  );
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target instanceof Element ? e.target.closest('#bHalt, #bFit') : null;
      if (!el) return;
      e.stopPropagation();
      if (el.id === 'bHalt') enqueue({ side: 'park', kind: 'speed', payload: { speed: T.speed > 0 ? 0 : dialOf(sr.value) } });
      else toast(fitToggle() === 'whole' ? 'toast.fit' : 'toast.start');
    },
    true,
  );
}

function begin(canvas: HTMLCanvasElement, seed: number, halt: boolean): void {
  initRender(canvas);
  resize(canvas);
  newPark(seed);
  setupInput(canvas, { onTap: () => {} }); // pan, pinch, twist and wheel; taps route to tools and the card from S3 and S4
  initSheets();
  wireControls();
  buildRail({
    onNew: () => {
      newPark(freshSeed()); // TODO(S3): confirm, then the `park.new` command
      toast('toast.new_park');
    },
  });
  initHud({
    onClockDoubleTap: () => {
      if (document.body.classList.contains('dev')) setPerfOn(!FT.on); // the perf overlay is a dev entry (03 8.3, 13)
    },
  });
  setPerfCounts(() => ({ people: 0, creatures: 0, props: props.length, particles: particles().length, zoom: cam.z }));
  window.addEventListener(
    'resize',
    () => {
      resize(canvas);
      layoutOverlays();
    },
    { passive: true },
  );
  window.addEventListener(
    'orientationchange',
    () =>
      setTimeout(() => {
        resize(canvas);
        layoutOverlays();
      }, 220),
    { passive: true },
  );
  let shownSpeed = -1;
  // 03 4.1 items 7 to 11, after the loop's steps and drain: particles, the camera and the ambient spray, the draw, the HUD and the rail
  onFrame((dtr) => {
    stepParticles(Math.min(0.05, dtr) * T.speed); // item 7: visual stream, sim seconds
    stepCamera(dtr); // item 9: turnStep, keepCentre, followStep
    ambientFx(dtr); // item 9: the fountains' spray and rings; nothing while paused
    setGroundQuality(qualityLevel()); // render may not import debug (03 2.1)
    draw(); // item 10
    if (T.speed !== shownSpeed) {
      shownSpeed = T.speed; // a `speed` command applied: the dial follows
      syncSpeed();
    }
    updateHud(dtr); // item 11
    updateRail(dtr);
  });
  onFrameEnd((simMs, restMs, totalMs, ts) => ftNote(simMs, restMs, totalMs, ts)); // item 12: draw and the rest of the frame
  if (halt) setSpeed(0);
  syncSpeed();
  start();
}

function boot(): void {
  setLang(detectLang());
  applyDom();
  const canvas = $('cv') as HTMLCanvasElement;
  const { seed, halt, dev } = readHash();
  // 03 10.2: `body.dev` from `#dev` in the hash or a DEV build; it reveals the dev entries (S11), nothing more.
  document.body.classList.toggle('dev', import.meta.env.DEV || dev);
  showIntro(
    hasPark(),
    () => begin(canvas, seed, halt),
    () => begin(canvas, seed, halt), // TODO(S3): loadPark
  );
  // 03 section 13: the harness is installed only in a DEV build; a production build never installs it, hash or not.
  if (import.meta.env.DEV) installHarness({ newPark });
}

boot();

// src/main.ts
// Boot order and wiring only, no rules (03 2.2): language, intro, then on Begin: park, renderer, rail, HUD, loop.
// Ported from GV 12127-12222 (boot) as a wiring pattern. ADAPT: modules instead of closures; styles are linked from index.html.
// TODO(S2): camera.setupInput, the tap handler; TODO(S3): Continue, autosave on visibilitychange and pagehide, park.new as a command; TODO(S8): audio.init on Begin.
import { stepClock } from './core/clock.ts';
import { onFrame, setSpeed, setTick, start } from './core/loop.ts';
import { genPark } from './world/gen.ts';
import { cam, fitCam, resize, turnStep } from './render/camera.ts';
import { initRender, draw } from './render/draw.ts';
import { $, applyDom, layoutOverlays, toast } from './ui/dom.ts';
import { setLang, type Lang } from './ui/i18n.ts';
import { showIntro } from './ui/intro.ts';
import { buildRail, syncSpeed, updateRail } from './ui/rail.ts';
import { initHud, updateHud } from './ui/hud.ts';
import { initSheets } from './ui/sheets.ts';
import { hasPark } from './save/store.ts';
import { installHarness } from './debug/harness.ts';

function freshSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] ?? 1) >>> 0 || 1;
}

/** `#s=<seed>&halt` picks the seed and starts paused (GV 12097, 814). */
function readHash(): { seed: number; halt: boolean } {
  const h = location.hash || '';
  const m = /s=(\d+)/.exec(h);
  return { seed: m ? parseInt(m[1] as string, 10) >>> 0 : freshSeed(), halt: /halt/.test(h) };
}

function detectLang(): Lang {
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

function newPark(seed: number): void {
  genPark(seed);
  setTick(0);
  stepClock(0);
  history.replaceState(null, '', '#s=' + seed + (/debug/.test(location.hash) ? '&debug' : ''));
  cam.free = false;
  cam.follow = 0;
  fitCam();
}

function begin(canvas: HTMLCanvasElement, seed: number, halt: boolean): void {
  newPark(seed);
  initRender(canvas);
  resize(canvas);
  initSheets();
  buildRail({
    onNew: () => {
      newPark(freshSeed()); // TODO(S3): confirm, then the `park.new` command
      toast('toast.new_park');
    },
  });
  initHud();
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
  onFrame((dtr) => {
    turnStep(dtr);
    draw();
    updateHud(dtr);
    updateRail(dtr);
  });
  if (halt) setSpeed(0);
  syncSpeed();
  start();
}

function boot(): void {
  setLang(detectLang());
  applyDom();
  const canvas = $('cv') as HTMLCanvasElement;
  const { seed, halt } = readHash();
  showIntro(
    hasPark(),
    () => begin(canvas, seed, halt),
    () => begin(canvas, seed, halt), // TODO(S3): loadPark
  );
  if (import.meta.env.DEV || /debug/.test(location.hash)) installHarness({ newPark });
}

boot();

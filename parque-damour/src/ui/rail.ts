// src/ui/rail.ts
// The three-row rail: the Park | Cupid | Mischief switch and strip, the contextual row, the controls row (register 3.9, 03 10.4).
// Ported from GV 11029-11072 (buildTools, the .more/.before edge masks) and 12134-12198 (speed, halt, turns, Fit, mute, photo wiring).
// ADAPT: groups, t() labels, setSpeed through core/loop.ts. S0 keeps the strip empty and the mode button cosmetic.
// TODO(S3): Park tools, brush row, Undo; TODO(S6): abilities, cooldown chip, locked pills; TODO(S7): mode through the `mode` event; TODO(S8): mute through audio.
import { T } from '../core/clock.ts';
import { setSpeed } from '../core/loop.ts';
import { cam, fitCam, turn } from '../render/camera.ts';
import { $, setBodyClass, toast, layoutOverlays } from './dom.ts';
import { t, onLang } from './i18n.ts';
import { closeSheets } from './sheets.ts';

export type Group = 'park' | 'cupid' | 'mischief';
let group: Group = 'park';
let want = 1; // the dial's value while paused
let muted = false;

export type RailHandlers = { onNew: () => void };

export function setGroup(g: Group): void {
  group = g;
  document.querySelectorAll<HTMLButtonElement>('#groups button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.group === g ? 'true' : 'false');
  });
  // TODO(S3/S6): rebuild #tools for the group
}

export function activeGroup(): Group {
  return group;
}

function showSpeed(): void {
  $('spdLbl').textContent = T.speed > 0 ? t('rail.speed', { n: want }) : t('rail.paused');
  $('bHalt').setAttribute('aria-pressed', T.speed > 0 ? 'false' : 'true');
}

/** Re-read T.speed into the dial (after a `#halt` start or a restore). */
export function syncSpeed(): void {
  const sr = $('spdR') as HTMLInputElement;
  if (T.speed > 0) want = T.speed;
  sr.value = String(want);
  showSpeed();
}

function paintLabels(): void {
  $('bMute').textContent = t(muted ? 'rail.muted' : 'rail.sound');
  const avatar = document.body.classList.contains('avatar');
  $('bMode').textContent = t(avatar ? 'rail.creator' : 'rail.be_someone');
  showSpeed();
}

export function buildRail(h: RailHandlers): void {
  document.querySelectorAll<HTMLButtonElement>('#groups button').forEach((b) => {
    b.addEventListener('click', () => setGroup((b.dataset.group as Group) || 'park'));
  });
  setGroup('park');

  // the strip's edge masks (GV 11059-11061)
  const wrap = $('tools');
  const more = (): void => {
    wrap.classList.toggle('more', wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 6);
    wrap.classList.toggle('before', wrap.scrollLeft > 6);
  };
  wrap.addEventListener('scroll', more, { passive: true });
  window.addEventListener('resize', more);
  setTimeout(more, 50);

  const size = $('size') as HTMLInputElement;
  size.addEventListener('input', () => {
    $('depth').textContent = size.value;
  });

  // the speed: a dial from 1x to 8x, and a pause that remembers where the dial was (GV 12134-12140)
  const sr = $('spdR') as HTMLInputElement;
  sr.addEventListener('input', () => {
    want = parseInt(sr.value, 10) || 1;
    if (T.speed > 0) setSpeed(want);
    showSpeed();
  });
  $('bHalt').addEventListener('click', () => {
    setSpeed(T.speed > 0 ? 0 : want);
    showSpeed();
  });

  $('bRotL').addEventListener('click', () => turn(-1));
  $('bRotR').addEventListener('click', () => turn(1));
  $('bFit').addEventListener('click', () => {
    cam.follow = 0;
    cam.free = false;
    fitCam();
    toast('toast.whole_park');
  });

  const bm = $('bMute');
  bm.addEventListener('click', () => {
    muted = !muted;
    bm.setAttribute('aria-pressed', muted ? 'true' : 'false');
    paintLabels();
  });

  const bMode = $('bMode');
  bMode.addEventListener('click', () => {
    const on = !document.body.classList.contains('avatar');
    setBodyClass('avatar', on);
    bMode.setAttribute('aria-pressed', on ? 'true' : 'false');
    paintLabels();
    layoutOverlays();
  });

  $('bPhoto').addEventListener('click', () => {
    closeSheets();
    setBodyClass('photo', true);
  });
  $('photoX').addEventListener('click', () => setBodyClass('photo', false));
  $('bNew').addEventListener('click', h.onNew);

  onLang(paintLabels);
  syncSpeed();
  paintLabels();
}

export function updateRail(_dtr: number): void {
  // TODO(S6): cooldown chip and charges.
}

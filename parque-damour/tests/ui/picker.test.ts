// @vitest-environment jsdom
// tests/ui/picker.test.ts
// Locks the UI stage of S7 (07 S7.6 steps 6 and 7, S7.8; 02 10.1, 12.3 item 4, 12.4; 03 8.2 item 1, 10.2; 04 5.4 item 6, 5.5 item 3, 5.6):
// "Be someone" opens the Avatar picker with the six cards (the side stripe's side, the tier, the lock state; the S10 three "Coming soon"),
// a locked card toasts its tier and sends nothing, an unlocked one sends `avatar.enter`; the sim's `mode` event puts body.avatar on, hides
// the Park strip, the switch, the size row and Undo, shows three hint chips and the strip "Pigeon · you" with "waiting for your tap", sets the
// mode button to Creator, zooms to 1.5 and follows the actor, toasts the 6 s intro; the cascade's answers are toasted (a status as
// "Pigeon: swooping", walking and flying silent, busy as "Pigeon: busy", any refusal after the name); Creator sends `avatar.leave` and the
// strips come back with "goes on alone"; the player's ring is a drawable under the actor and replaces the selection ring; the possessed
// creatures' states read as the drawn ones. jsdom, index.html with shell.css; the canvas has no 2d context there, so the portraits only
// exist as empty canvases (their drawing is looked at in `npm run shot -- s7`).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T } from '../../src/core/clock.ts';
import { PAUSED_KINDS, SIM_DT, newPark, simulate, tick } from '../../src/core/loop.ts';
import { AVATAR_SIDE, applyPending, clearPending, enqueue, log, pendingCount } from '../../src/core/commands.ts';
import { drain, emit } from '../../src/core/events.ts';
import { css, hx } from '../../src/core/math.ts';
import { getAvatar, getMode, getPlayer, setMode, type AvatarId } from '../../src/play/mode.ts';
import { AVATARS } from '../../src/play/avatar.ts';
import { cooldownLeft, startCooldown } from '../../src/play/abilities.ts';
import { resetProgress, setProgress } from '../../src/play/progression.ts';
import { creatureById } from '../../src/entities/creatures.ts';
import { setArrivalsState, spawnVisitor, resetVisitors, type Visitor } from '../../src/entities/visitor.ts';
import { cam, followed } from '../../src/render/camera.ts';
import { style } from '../../src/render/ambient.ts';
import { avatarRingOn, playerDrawables, playerVisitorId } from '../../src/render/ghost.ts';
import { pigeonStateOf, pomRuns } from '../../src/render/creatures.ts';
import { $ } from '../../src/ui/dom.ts';
import { setLang } from '../../src/ui/i18n.ts';
import { chooseAvatar, pickerKey } from '../../src/ui/picker.ts';
import { clearSel, initCard, selected, select } from '../../src/ui/card.ts';
import { closeSheets, initSheets, openSheet, sheetOpen, updateSheets } from '../../src/ui/sheets.ts';
import { applyMode, initHud, noteAvatarTap, updateHud } from '../../src/ui/hud.ts';
import { buildRail, setGroup, setTool } from '../../src/ui/rail.ts';
import { en } from '../../src/ui/strings/en.ts';
import { es } from '../../src/ui/strings/es.ts';

const ROOT = join(import.meta.dirname, '..', '..');

beforeAll(() => {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML; // the module script does not run from innerHTML
  const style = document.createElement('style');
  style.textContent = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
  document.head.appendChild(style);
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']; // jsdom has no canvas
  setLang('en');
  initSheets();
  initHud();
  buildRail({ onNew: () => undefined });
  initCard();
});

beforeEach(() => {
  newPark(101);
  setArrivalsState({ arrivalT: 1e9, pace: 'calm' });
  resetProgress();
  resetVisitors();
  clearPending();
  setLang('en');
  setMode('creator');
  closeSheets();
  clearSel();
  setGroup('park');
  setTool('hand');
  applyMode();
  cam.z = 1.0;
  cam.follow = 0;
  $('hint').classList.remove('on');
  $('hint').textContent = '';
});

const shown = (id: string): boolean => getComputedStyle($(id)).display !== 'none';
const cards = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('#pickerList .pk')];
const card = (id: string): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`#pickerList .pk[data-id="${id}"]`) as HTMLButtonElement;
const hint = (): string => $('hint').textContent ?? '';
/** One sim step (the pending commands apply at its start), then the frame: the events reach the shell and the chips and the card repaint. */
function step(n = 1): void {
  for (let i = 0; i < n; i++) simulate(SIM_DT, 0);
  drain(0);
  updateHud(0.4);
}
/** A paused frame (loop.frame at speed 0): the paused kinds apply with no step, then the events reach the shell. */
function pausedFrame(): void {
  applyPending(tick() + 1, PAUSED_KINDS);
  drain(0);
  updateHud(0.4);
}
/** The picker, a tap on `id`'s card, a step: the avatar is possessed and the shell has followed. */
function enter(id: AvatarId): void {
  $('bMode').click();
  card(id).click();
  step();
}
const leave = (): void => {
  $('bMode').click();
  step();
};
const adult = (x: number, y: number): Visitor => {
  const v = spawnVisitor('single', 'g_west', { sex: 'f', seeks: 'm' }) as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0, leaveAt: 99, decideT: 9999, job: {} });
  v.items = { hat: false, purse: false, baguette: false, iceCream: false };
  return v;
};

describe('07 S7.6 step 7, 02 12.4, 04 5.6: "Be someone" opens the Avatar picker with six cards', () => {
  it('the mode button opens #picker; its six cards are AVATARS in order with their side (the stripe), name, tier and state; a second press closes it', () => {
    expect($('bMode').textContent).toBe('Be someone');
    $('bMode').click();
    expect(sheetOpen()).toBe('picker');
    expect($('bMode').getAttribute('aria-expanded')).toBe('true');
    expect(cards().map((c) => c.dataset.id)).toEqual(AVATARS.map((a) => a.id));
    expect(cards().map((c) => c.dataset.side)).toEqual(['mischief', 'mischief', 'mischief', 'cupid', 'cupid', 'cupid']);
    expect(cards().map((c) => c.querySelector('b')?.textContent)).toEqual(['Pigeon', 'Pomeranian', 'Mime', 'Flower seller', 'Busker', 'Matchmaker']);
    expect(card('a_pigeon').querySelector('small')?.textContent).toBe('Mischief · T0');
    expect(card('a_matchmaker').querySelector('small')?.textContent).toBe('Cupid · T3');
    expect(cards().every((c) => c.querySelector('canvas'))).toBe(true); // a portrait each (drawn where the browser has a canvas)
    expect($('pickerSum').textContent).toBe(en['sheet.picker.sum']);
    $('bMode').click();
    expect(sheetOpen()).toBeNull();
  });
  it('the cards by the test profile: a_pigeon open at 0 points, the rest locked (a lock glyph and "Locked · Mischief T1"); the three of S10 dimmed "Coming soon" whatever their tier', () => {
    openSheet('picker');
    expect(card('a_pigeon').className).toBe('pk');
    expect(card('a_pigeon').getAttribute('aria-disabled')).toBe('false');
    for (const id of ['a_pomeranian', 'a_florist']) {
      expect(card(id).classList.contains('locked'), id).toBe(true);
      expect(card(id).getAttribute('aria-disabled'), id).toBe('true');
      expect(card(id).querySelector('svg'), id).not.toBeNull();
    }
    expect(card('a_pomeranian').querySelector('small')?.textContent).toBe('Locked\u00a0· Mischief\u00a0T1');
    expect(card('a_florist').querySelector('small')?.textContent).toBe('Locked\u00a0· Cupid\u00a0T1');
    for (const id of ['a_mime', 'a_busker', 'a_matchmaker']) {
      expect(card(id).classList.contains('soon'), id).toBe(true);
      expect(card(id).querySelector('small.st')?.textContent, id).toBe('Coming soon');
    }
    // Mischief T1 and Cupid T2: the Pomeranian, the Flower seller and the Busker open, the busker still "Coming soon"
    setProgress({ cp: 20, mp: 8 });
    expect(pickerKey()).not.toBe('');
    updateSheets(0.1); // the frame repaints the open sheet when a tier was reached
    expect(card('a_pomeranian').className).toBe('pk');
    expect(card('a_florist').className).toBe('pk');
    expect(card('a_busker').className).toBe('pk soon');
    expect(card('a_mime').className).toBe('pk soon');
  });
  it('a tap on a locked card toasts "Unlocks at Cupid T1" and sends nothing; on an S10 card "Coming soon"; on an open one it sends avatar.enter on its side and closes the sheet', () => {
    $('bMode').click();
    card('a_florist').click();
    expect(hint()).toBe('Unlocks at Cupid T1');
    expect(pendingCount()).toBe(0);
    expect(sheetOpen()).toBe('picker');
    card('a_mime').click();
    expect(hint()).toBe('Coming soon');
    expect(pendingCount()).toBe(0);
    expect(chooseAvatar('a_nobody')).toBe(false);
    card('a_pigeon').click();
    expect(pendingCount()).toBe(1);
    expect(sheetOpen()).toBeNull();
    step();
    const c = log().find((o) => o.kind === 'avatar.enter');
    expect(c?.side).toBe(AVATAR_SIDE.a_pigeon);
    expect(c?.payload).toEqual({ avatar: 'a_pigeon' });
  });
  it('Spanish: the names and the lines through t(); the picker repaints on the language change', () => {
    $('bMode').click();
    setLang('es');
    expect(cards().map((c) => c.querySelector('b')?.textContent)).toEqual(['Paloma', 'Pomerania', 'Mimo', 'Florista', 'Músico callejero', 'Casamentera']);
    expect(card('a_pomeranian').querySelector('small')?.textContent).toBe('Bloqueado\u00a0· Travesura\u00a0T1');
    expect(card('a_mime').querySelector('small.st')?.textContent).toBe(es['rail.soon']);
    expect($('pickerSum').textContent).toBe(es['sheet.picker.sum']);
  });
});

describe('07 S7.6 step 7, 03 10.2, 04 5.4 item 6, 5.5 item 3: entering the avatar mode', () => {
  it('body.avatar on: the Park strip, the switch, the size row, Undo and the ability strips hidden, three hint chips in row 1, the button reads Creator', () => {
    setTool('path');
    setGroup('mischief');
    expect(shown('tools') && shown('groups')).toBe(true);
    expect(shown('hints')).toBe(false);
    enter('a_pigeon');
    expect(getMode()).toBe('avatar');
    expect(getAvatar()).toBe('a_pigeon');
    expect(document.body.classList.contains('avatar')).toBe(true);
    for (const id of ['tools', 'groups', 'sizewrap', 'bUndo', 'cdChip']) expect(shown(id), id).toBe(false);
    expect(shown('hints')).toBe(true);
    expect([...document.querySelectorAll('#hints .hc')].map((c) => c.textContent)).toEqual([
      'Tap someone: swoop', 'Tap crumbs: peck', 'Tap a lamp or bench: perch',
    ]);
    expect($('hints').dataset.side).toBe('mischief');
    expect($('bMode').textContent).toBe('Creator');
    expect($('bMode').getAttribute('aria-pressed')).toBe('true');
    expect($('bMode').getAttribute('aria-expanded')).toBe('false');
  });
  it('the strip: "Pigeon · you", "Mischief · T0", "waiting for your tap", the three bars Mood, Rested and Full (tests/ui/strip.test.ts); the card is on', () => {
    enter('a_pigeon');
    (creatureById(getPlayer()) as NonNullable<ReturnType<typeof creatureById>>).st = 'wait'; // a bird that was pecking goes on pecking until told (avatar-pigeon.ts)
    updateHud(0.4);
    expect($('card').classList.contains('on')).toBe(true);
    expect($('cName').textContent).toBe('Pigeon · you');
    expect($('cSub').textContent).toBe('Mischief · T0');
    expect($('cDo').textContent).toBe('waiting for your tap');
    expect(shown('cBars')).toBe(true);
    expect([...document.querySelectorAll<HTMLElement>('#cBars .bar')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.querySelector('span')?.textContent)).toEqual(['Mood', 'Rested', 'Full']);
    expect($('cRel').hidden).toBe(true);
    setLang('es');
    updateHud(0.4);
    expect($('cName').textContent).toBe('Paloma · tú');
    expect($('cDo').textContent).toBe('esperando tu toque');
    expect($('bMode').textContent).toBe('Creador');
    expect([...document.querySelectorAll('#hints .hc')].map((c) => c.textContent)[0]).toBe(es['avatar.a_pigeon.hint1']);
  });
  it('the strip names what the actor is doing (the avatar.status words), the flower seller by her own name; her chips take the Cupid side', () => {
    enter('a_pigeon');
    const c = creatureById(getPlayer());
    expect(c).toBeDefined();
    if (!c) return;
    for (const [st, line] of [['fly', 'flying'], ['peck', 'pecking'], ['perch', 'perching'], ['drink', 'drinking'], ['swoop', 'swooping'], ['startled', 'ruffled, give it a moment']] as const) {
      c.st = st;
      updateHud(0.4);
      expect($('cDo').textContent, st).toBe(line);
    }
    leave();
    setProgress({ cp: 8, mp: 0 });
    enter('a_florist');
    expect($('cName').textContent).toBe('Violette · you');
    expect($('cSub').textContent).toBe('Cupid · T1');
    expect($('hints').dataset.side).toBe('cupid');
    expect($('hints').children).toHaveLength(3);
    expect(document.querySelectorAll('#hints .hc')[0]?.textContent).toBe('Tap a courting visitor: bouquet');
  });
  it('zooms to 1.5 below 1.3 (GV 11257) and follows the actor; at 1.3 or more the zoom stays; the 6 s toast reads "Playing as Pigeon. Tap someone: swoop"', () => {
    cam.z = 1.0;
    enter('a_pigeon');
    expect(cam.z).toBe(1.5);
    expect(followed()).toEqual({ kind: 'creature', id: getPlayer() });
    expect(hint()).toBe('Playing as Pigeon. Tap someone: swoop');
    expect($('hint').classList.contains('on')).toBe(true);
    leave();
    cam.z = 2.2;
    enter('a_pigeon');
    expect(cam.z).toBe(2.2);
  });
  it('entering ends the armed Park tool and the armed ability; a census row selects no one while the strip is up', () => {
    setTool('lamp');
    enter('a_pigeon');
    expect(document.querySelector('#tools .tool[aria-pressed="true"]')?.getAttribute('data-id')).toBe('hand');
    const v = adult(20, 20);
    select({ kind: 'visitor', id: v.id, tile: { x: 20, y: 20 } });
    expect(selected().kind).toBe('none');
    expect($('cName').textContent).toBe('Pigeon · you');
  });
});

describe('03 8.2 item 1, 07 S7.6 step 6: what the cascade answers is toasted (GV 11276-11277)', () => {
  it('a status toasts "Pigeon: swooping"; walking and flying are silent; busy is "Pigeon: busy"; a refusal comes after the name', () => {
    enter('a_pigeon');
    $('hint').textContent = '';
    const me = creatureById(getPlayer());
    expect(me).toBeDefined();
    if (!me) return;
    // a real tap on a lawn tile: the pigeon flies, nothing is said
    const to = { x: Math.round(me.x) + 5, y: Math.round(me.y) };
    enqueue({ side: 'mischief', kind: 'avatar.tap', payload: { tile: to, hit: { kind: 'tile', id: 0, tile: to } } });
    step();
    expect(['fly', 'walk']).toContain(me.st);
    expect(hint()).toBe(''); // walking and flying are silent
    emit({ kind: 'avatarStatus', tick: 0, params: { status: 'avatar.status.flying', what: '@avatar.status.flying', name: '@avatar.a_pigeon.name', avatar: 'a_pigeon' } });
    emit({ kind: 'avatarStatus', tick: 0, params: { status: 'avatar.status.walking', what: '@avatar.status.walking', name: '@avatar.a_pigeon.name', avatar: 'a_pigeon' } });
    drain(0);
    expect(hint()).toBe('');
    // a person: the swoop
    me.st = 'wait';
    me.x = 20;
    me.y = 20;
    const w = adult(21, 20);
    const t = { x: 21, y: 20 };
    enqueue({ side: 'mischief', kind: 'avatar.tap', payload: { tile: t, hit: { kind: 'visitor', id: w.id, tile: t } } });
    step();
    expect(hint()).toBe('Pigeon: swooping');
    // busy: the swoop is running
    expect(me.st).toBe('swoop');
    enqueue({ side: 'mischief', kind: 'avatar.tap', payload: { tile: to, hit: { kind: 'tile', id: 0, tile: to } } });
    step();
    expect(hint()).toBe('Pigeon: busy');
    // a refusal: a child is not for the pigeon (the sim's reason, after the name)
    emit({ kind: 'rejected', tick: 0, params: { reason: 'reason.not_children', side: 'mischief', kind: 'avatar.tap' } });
    drain(0);
    expect(hint()).toBe('Pigeon: not the children');
    emit({ kind: 'rejected', tick: 0, params: { reason: 'reason.startled', side: 'mischief', kind: 'avatar.tap' } });
    drain(0);
    expect(hint()).toBe('Pigeon: startled by a dog');
  });
  it('a refusal of another command is the plain reason; the florist\'s cooldown names its seconds and a victim at his limit his name', () => {
    emit({ kind: 'rejected', tick: 0, params: { reason: 'reason.outside', side: 'park', kind: 'tool' } });
    drain(0);
    expect(hint()).toBe('outside the railings');
    setProgress({ cp: 8, mp: 0 });
    enter('a_florist');
    startCooldown('cupid', 'c_petals');
    noteAvatarTap({ kind: 'tile', id: 0, tile: { x: 5, y: 5 } });
    emit({ kind: 'rejected', tick: 0, params: { reason: 'reason.cooldown', side: 'cupid', kind: 'avatar.tap' } });
    drain(0);
    expect(hint()).toBe(`Violette: not yet (${Math.ceil(cooldownLeft('cupid', 'c_petals'))} s)`);
    expect(hint()).toBe('Violette: not yet (30 s)');
    const w = adult(10, 10);
    noteAvatarTap({ kind: 'visitor', id: w.id, tile: { x: 10, y: 10 } });
    emit({ kind: 'rejected', tick: 0, params: { reason: 'reason.enough_today', side: 'cupid', kind: 'avatar.tap' } });
    drain(0);
    expect(hint()).toBe(`Violette: ${w.name} has had enough for one day`);
  });
});

describe('07 S7.6 step 2, 02 10.1 item 4: Creator hands the actor back', () => {
  it('the mode button sends avatar.leave on the avatar\'s side; the strips come back, the chips and the card go, the follow ends, "Pigeon goes on alone"', () => {
    enter('a_pigeon');
    $('bMode').click();
    expect(pendingCount()).toBe(1);
    step();
    expect(log().filter((c) => c.kind === 'avatar.leave').map((c) => c.side)).toEqual(['mischief']);
    expect(getMode()).toBe('creator');
    expect(document.body.classList.contains('avatar')).toBe(false);
    for (const id of ['tools', 'groups', 'bUndo']) expect(shown(id), id).toBe(true);
    expect(shown('hints')).toBe(false);
    expect($('hints').children).toHaveLength(0);
    expect($('bMode').textContent).toBe('Be someone');
    expect($('bMode').getAttribute('aria-pressed')).toBe('false');
    expect($('card').classList.contains('on')).toBe(false);
    expect(followed()).toBeNull();
    expect(hint()).toBe('Pigeon goes on alone');
  });
  it('a New in the avatar mode returns the shell to creator without a toast of its own (the mode event carries none)', () => {
    enter('a_pigeon');
    $('hint').textContent = '';
    setMode('creator');
    emit({ kind: 'mode', tick: 0, params: { mode: 'creator' } });
    drain(0);
    expect(document.body.classList.contains('avatar')).toBe(false);
    expect(hint()).toBe('');
  });
  it('boot (Continue) with the avatar mode restored shows it at once and silently', () => {
    enter('a_pigeon');
    $('hint').textContent = '';
    document.body.classList.remove('avatar');
    applyMode();
    expect(document.body.classList.contains('avatar')).toBe(true);
    expect($('bMode').textContent).toBe('Creator');
    expect($('cName').textContent).toBe('Pigeon · you');
    expect(hint()).toBe('');
  });
});

describe('04 7.4, 07 S7.6 step 7: the player ring and the possessed look', () => {
  it('the ring is a drawable under the possessed actor (a creature or the flower seller), none in the creator mode; the avatar mode drops the selection ring', () => {
    expect(avatarRingOn()).toBe(false);
    expect(playerDrawables()).toHaveLength(0);
    enter('a_pigeon');
    const c = creatureById(getPlayer());
    expect(avatarRingOn()).toBe(true);
    expect(playerVisitorId()).toBe(0);
    expect(c).toBeDefined();
    if (c) {
      c.x = 23.5;
      c.y = 23.5;
      c.z = 1.2; // in the air: the ring stays on the ground
    }
    const ring = playerDrawables();
    expect(ring).toHaveLength(1);
    expect(ring[0]?.kind).toBe('ring');
    leave();
    expect(playerDrawables()).toHaveLength(0);
    setProgress({ cp: 8, mp: 0 });
    enter('a_florist');
    expect(playerVisitorId()).toBe(getPlayer());
  });
  it('the ring strokes `paper` at alpha 0.75 over a hairline of `ink`, with a fill, and does not need the featured glow', () => {
    enter('a_pigeon');
    const c = creatureById(getPlayer());
    if (c) {
      c.x = 23.5;
      c.y = 23.5;
    }
    const strokes: string[] = [], fills: string[] = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {}, set lineJoin(_v: string) {}, set lineWidth(_v: number) {},
      set fillStyle(v: string) { fills.push(v); },
      set strokeStyle(v: string) { strokes.push(v); },
      stroke() {},
    } as unknown as CanvasRenderingContext2D;
    const d = playerDrawables()[0];
    expect(d).toBeDefined();
    d?.draw(d, ctx);
    const P = style().palette;
    expect(strokes).toContain(css(hx(P.paper), 0.75));
    expect(strokes).toContain(css(hx(P.ink), 0.22));
    expect(fills.length).toBeGreaterThan(0);
  });
  it('the possessed pigeon\'s states read as the drawn ones, Pompon stands while he waits and runs when he moves (render/creatures.ts)', () => {
    expect(pigeonStateOf('flyDrink')).toBe('fly');
    for (const st of ['startled', 'drink', 'wait', 'poop']) expect(pigeonStateOf(st), st).toBe(st); // their own poses since 2026-10-22 (tests/pigeon-poses.test.ts)
    for (const st of ['peck', 'perch', 'fly', 'scatter', 'walk']) expect(pigeonStateOf(st)).toBe(st);
    for (const st of ['wait', 'idle', 'dig', 'paddle', 'shakeOff']) expect(pomRuns(st), st).toBe(false);
    for (const st of ['run', 'carry', 'home', 'walk', 'chase', 'play', 'snatch', 'goDig', 'goPaddle']) expect(pomRuns(st), st).toBe(true);
  });
});

describe('S7 UI fixes: a refusal after the mode ended, a command waiting on a paused park, the toast over the sheet, the six cards at 320 px', () => {
  it('an avatar.tap queued behind Creator is refused as wrong_mode and toasts nothing: "Pigeon goes on alone" stays, no ": not in this mode"', () => {
    enter('a_pigeon');
    const to = { x: 30, y: 30 };
    enqueue({ side: 'mischief', kind: 'avatar.leave', payload: {} });
    enqueue({ side: 'mischief', kind: 'avatar.tap', payload: { tile: to, hit: { kind: 'tile', id: 0, tile: to } } });
    step();
    expect(getMode()).toBe('creator');
    expect(document.body.classList.contains('avatar')).toBe(false);
    expect(hint()).toBe('Pigeon goes on alone');
    // the plain rejected event of a creator-mode tap says nothing either, and another command's wrong mode still does
    emit({ kind: 'rejected', tick: 0, params: { reason: 'reason.wrong_mode', side: 'mischief', kind: 'avatar.tap' } });
    drain(0);
    expect(hint()).toBe('Pigeon goes on alone');
    emit({ kind: 'rejected', tick: 0, params: { reason: 'reason.wrong_mode', side: 'park', kind: 'tool' } });
    drain(0);
    expect(hint()).toBe('not in this mode');
  });
  it('Be someone on a paused park answers at once (owner 2026-10-22): the one command applies in the paused frame, "Playing as Pigeon" shows, the park stays paused and nothing says it is', () => {
    setProgress({ cp: 0, mp: 8 });
    T.speed = 0;
    try {
      $('bMode').click();
      card('a_pigeon').click();
      expect(hint()).toBe(''); // no "park paused" toast any more
      expect(pendingCount()).toBe(1);
      expect(getMode()).toBe('creator'); // until the frame runs
      pausedFrame();
      expect([getMode(), getAvatar(), pendingCount(), T.speed]).toEqual(['avatar', 'a_pigeon', 0, 0]);
      expect(document.body.classList.contains('avatar')).toBe(true);
      expect($('bMode').textContent).toBe('Creator');
      expect(hint()).toBe('Playing as Pigeon. Tap someone: swoop');
    } finally {
      T.speed = 1;
    }
  });
  it('Creator on a paused park answers at once too: "Pigeon goes on alone", the strips back; and the key avatar.paused is gone from both tables', () => {
    enter('a_pigeon');
    $('hint').textContent = '';
    T.speed = 0;
    try {
      $('bMode').click();
      expect(hint()).toBe('');
      expect(pendingCount()).toBe(1);
      pausedFrame();
      expect([getMode(), getPlayer(), pendingCount()]).toEqual(['creator', 0, 0]);
      expect(document.body.classList.contains('avatar')).toBe(false);
      expect(hint()).toBe('Pigeon goes on alone');
    } finally {
      T.speed = 1;
    }
    expect('avatar.paused' in en).toBe(false);
    expect('avatar.paused' in es).toBe(false);
  });
  it('shell.css: the toast (z 9) sits over the sheets (z 8), the intro (20) and the confirm (25) over both', () => {
    const css = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    const z = (sel: string): number => Number(new RegExp(`${sel.replace(/[.#]/g, '\\$&')}\\{[^}]*?z-index:(\\d+)`).exec(css)?.[1]);
    expect(z('div.sheet')).toBe(8);
    expect(z('#hint')).toBeGreaterThan(z('div.sheet'));
    expect(z('#intro')).toBeGreaterThan(z('#hint'));
    expect(z('#confirm')).toBeGreaterThan(z('#intro'));
  });
  it('the padlock is a badge on the locked portrait (never in the words, never a loose corner glyph over the name), and the 320 px rules are in shell.css', () => {
    openSheet('picker');
    const pt = card('a_florist').querySelector(':scope > .pt') as HTMLElement;
    expect(pt.querySelector('canvas')).not.toBeNull();
    expect(pt.querySelector('svg')).not.toBeNull();
    expect(card('a_florist').querySelector('.tx svg')).toBeNull();
    expect(card('a_florist').querySelector(':scope > svg')).toBeNull();
    expect(card('a_florist').querySelector('small.st')?.textContent).toBe('Locked\u00a0· Cupid\u00a0T1');
    expect(card('a_pigeon').querySelector('svg')).toBeNull();
    const css = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width:340px\)\{[^@]*#pickerList \.pk \.pt\{[^}]*32px/);
    expect(css).toMatch(/@media \(max-height:620px\)\{[^@]*#pickerList \.pk\{min-height:44px/);
    expect(css).toMatch(/#pickerList \.pk \.pt\{position:relative/); // the badge's anchor
  });
  it('320 px (owner 2026-10-22): the picker leaves the feed line its room (the sheet cap less one 26 px line) and the locked words wrap only after the dot, never between a side and its tier', () => {
    const css = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width:339px\)\{#picker\{max-height:min\(52vh,calc\(var\(--sheet-cap,52vh\) - 26px\)\)\}\}/);
    expect(css).toMatch(/@media \(max-width:339px\)\{#feed\{top:calc\(env\(safe-area-inset-top,0px\) \+ 140px\)/); // the line it leaves room for
    for (const [lang, tbl] of [['en', en], ['es', es]] as const) {
      const w = tbl['sheet.picker.locked'] ?? '';
      expect(w, lang).toMatch(/^\S+\u00a0· \{side\}\u00a0T\{tier\}$/); // one ordinary space, after the dot; everything else glued
      expect(w.split(' ').length, lang).toBe(2);
    }
    expect(card('a_florist')).toBeDefined();
  });
});

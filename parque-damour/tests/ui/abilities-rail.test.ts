// @vitest-environment jsdom
// tests/ui/abilities-rail.test.ts
// Locks 07 S6.6 steps 6 and 7 (S6.8 tests/ui/rail.test.ts rows; 08 2.9) for the UI stage of S6: the Cupid and Mischief strips are built from
// ABILITIES (03 10.4), a locked pill is dimmed with its tier badge and toasts rail.locked_at once per tap (04 5.4 item 3), arming and
// disarming (02 9.1 item 1), the tap on the world is routed by the ability's target type and enqueues the logged `ability` command with
// the ability left armed (03 8.2 item 2), row 2 holds the cooldown chip (04 5.4 item 4: the ring, the seconds, the charges), and the armed
// area ability's square is drawn at alpha 0.25 in the side's accent (03 7.8 item 3). jsdom, on index.html with shell.css.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT, newPark, simulate } from '../../src/core/loop.ts';
import { clearPending, log, pendingCount } from '../../src/core/commands.ts';
import { clearListeners } from '../../src/core/events.ts';
import { I, PETALS } from '../../src/world/grid.ts';
import { setMode } from '../../src/play/mode.ts';
import { ABILITIES, abilityById, cooldownLeft } from '../../src/play/abilities.ts';
import { bindProgression, resetProgress, setProgress } from '../../src/play/progression.ts';
import { aimMark, drawAimMark, setAimMark, clearAimMark } from '../../src/render/ghost.ts';
import { screenInto } from '../../src/render/project.ts';
import { $ } from '../../src/ui/dom.ts';
import { setLang } from '../../src/ui/i18n.ts';
import { armAbility, armedAbility, buildRail, setGroup, setTool, updateRail } from '../../src/ui/rail.ts';
import { abilityTarget, paintChip, refusalParams, setArmed, tapAbility } from '../../src/ui/ability-strip.ts';
import { en } from '../../src/ui/strings/en.ts';
import { es } from '../../src/ui/strings/es.ts';

const ROOT = join(import.meta.dirname, '..', '..');

beforeAll(() => {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  const style = document.createElement('style');
  style.textContent = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
  document.head.appendChild(style);
  setLang('en');
  buildRail({ onNew: () => {} });
});

beforeEach(() => {
  clearListeners();
  bindProgression();
  newPark(101);
  resetProgress();
  setMode('creator');
  document.body.classList.remove('avatar');
  setLang('en');
  setGroup('park');
  setTool('hand');
  clearAimMark();
  clearPending();
});

const pills = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('#tools .tool')];
const pill = (id: string): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`#tools .tool[data-id="${id}"]`) as HTMLButtonElement;
const hidden = (id: string): boolean => $(id).hidden === true;
/** A tap on the ground tile (x, y) with no one there. */
const tileHit = (x: number, y: number) => ({ kind: 'tile' as const, id: 0, tile: { x, y } });
const cmds = () => log().filter((c) => c.kind === 'ability');
const def = (id: string) => abilityById(id) as NonNullable<ReturnType<typeof abilityById>>;
const chip = () => ({
  nm: $('cdChip').querySelector('.nm')?.textContent,
  cd: $('cdChip').querySelector('.cd')?.textContent,
  ch: $('cdChip').querySelector<HTMLElement>('.ch'),
  off: parseFloat($('cdChip').querySelector('.arc')?.getAttribute('stroke-dashoffset') ?? 'NaN'),
  dash: parseFloat($('cdChip').querySelector('.arc')?.getAttribute('stroke-dasharray') ?? 'NaN'),
});
const alpha = (s: string | undefined): number => Number(/,([\d.]+)\)$/.exec(s ?? '')?.[1]);
const corner = (x: number, y: number) => {
  const o = { x: 0, y: 0 };
  screenInto(x, y, 0, o);
  return o;
};

describe('07 S6.6 step 6, 03 10.4: the Cupid and Mischief strips are built from ABILITIES', () => {
  it('Cupid: the 9 Cupid rows in order, Mischief: the 10 Mischief rows, each a .tool pill with the name; nothing of the Park strip is left', () => {
    setGroup('cupid');
    const c = ABILITIES.filter((a) => a.side === 'cupid');
    expect(pills().map((b) => b.dataset.id)).toEqual(c.map((a) => a.id));
    expect(pills()).toHaveLength(9);
    for (const [k, b] of pills().entries()) {
      expect(b.querySelector('.lb')?.textContent).toBe(en[(c[k] as { nameKey: string }).nameKey]);
      expect(b.classList.contains('cupid')).toBe(true);
    }
    setGroup('mischief');
    const m = ABILITIES.filter((a) => a.side === 'mischief');
    expect(pills().map((b) => b.dataset.id)).toEqual(m.map((a) => a.id));
    expect(pills()).toHaveLength(10);
    expect(pills().every((b) => b.classList.contains('mischief'))).toBe(true);
    setGroup('park');
    expect(pills()).toHaveLength(16);
  });
  it('the open pills have a swatch in the side\'s accent, --berry and --ember (04 5.4 item 2), and no colour literal of their own', () => {
    const shell = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    expect(shell).toContain('.tool.cupid .sw{background:var(--berry);border-color:var(--berry)}');
    expect(shell).toContain('.tool.mischief .sw{background:var(--ember);border-color:var(--ember)}');
    setGroup('cupid');
    expect(pill('c_petals').querySelector('.sw')).not.toBeNull();
    expect(pill('c_petals').querySelector('.tier')).toBeNull();
    expect($('tools').innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,6}\b|rgba?\(/);
  });
  it('at 0 points only tier 0 is open: T1 to T4 are .locked at opacity .45 with the tier badge in the swatch\'s place (04 5.4 item 3)', () => {
    setGroup('cupid');
    for (const a of ABILITIES.filter((x) => x.side === 'cupid')) {
      const b = pill(a.id);
      const open = a.tier === 0;
      expect(b.classList.contains('locked'), a.id).toBe(!open);
      expect(b.getAttribute('aria-disabled'), a.id).toBe(open ? null : 'true');
      expect(b.querySelector('.sw') !== null, a.id).toBe(open);
      expect(b.querySelector('.tier')?.textContent ?? null, a.id).toBe(open ? null : `T${a.tier}`);
      expect(getComputedStyle(b).opacity, a.id).toBe(open ? '1' : '0.45');
    }
    setGroup('mischief');
    expect(pills().filter((b) => !b.classList.contains('locked')).map((b) => b.dataset.id)).toEqual(['m_pigeon', 'm_sprinkler']);
  });
  it('a tier reached opens the pills of the rows the sim has rules for; the eleven of S10 stay dimmed ("Coming soon") even unlocked', () => {
    setGroup('cupid');
    setProgress({ cp: 8, mp: 0 });
    updateRail(0);
    expect(pill('c_musician').classList.contains('locked')).toBe(false);
    expect(pill('c_sunbeam').classList.contains('locked')).toBe(false);
    expect(pill('c_umbrella').classList.contains('locked')).toBe(true);
    setProgress({ cp: 70, mp: 70 });
    updateRail(0);
    const dim = ABILITIES.filter((a) => a.tier >= 2);
    expect(dim).toHaveLength(11);
    for (const a of dim) {
      expect(pill(a.id)?.classList.contains('locked') ?? true, a.id).toBe(true);
    }
    expect(pill('c_umbrella').classList.contains('soon')).toBe(true);
    $('hint').textContent = '';
    pill('c_umbrella').click();
    expect($('hint').textContent).toBe(en['rail.soon']);
    expect(armedAbility()).toBeNull();
    expect(pendingCount()).toBe(0);
    setGroup('mischief');
    expect(pills().filter((b) => !b.classList.contains('locked')).map((b) => b.dataset.id)).toEqual(['m_pigeon', 'm_sprinkler', 'm_peel', 'm_pomeranian']);
  });
  it('Spanish: the pills read in Spanish and the strip repaints when the language changes', () => {
    setGroup('cupid');
    setLang('es');
    expect(pill('c_petals').querySelector('.lb')?.textContent).toBe(es['ability.c_petals.name']);
    expect(pill('c_musician').querySelector('.tier')?.textContent).toBe('T1');
    setLang('en');
    expect(pill('c_petals').querySelector('.lb')?.textContent).toBe(en['ability.c_petals.name']);
  });
});

describe('04 5.4 item 3: a locked pill toasts "Unlocks at Cupid T2" once per tap and does nothing else', () => {
  it('each tap on a locked pill writes the toast again; nothing is armed and no command is queued', () => {
    setGroup('cupid');
    for (const id of ['c_musician', 'c_lamplight', 'c_fireworks']) {
      const a = abilityById(id);
      for (let k = 0; k < 2; k++) {
        $('hint').textContent = 'x';
        $('hint').classList.remove('on');
        pill(id).click();
        expect($('hint').textContent, id).toBe(`Unlocks at Cupid T${a?.tier}`);
        expect($('hint').classList.contains('on'), id).toBe(true);
      }
      expect(armedAbility()).toBeNull();
    }
    expect(pendingCount()).toBe(0);
    setGroup('mischief');
    $('hint').textContent = 'x';
    pill('m_wasp').click();
    expect($('hint').textContent).toBe('Unlocks at Mischief T2');
  });
  it('Spanish: Se abre en Cupido T1', () => {
    setGroup('cupid');
    setLang('es');
    pill('c_musician').click();
    expect($('hint').textContent).toBe('Se abre en Cupido T1');
    setLang('en');
  });
});

describe('02 9.1 item 1, 04 5.4 item 1: arming', () => {
  it('a tap arms (aria-pressed, the hint toasted), a second tap on the same pill disarms, a tap on another moves the arming', () => {
    setGroup('cupid');
    pill('c_petals').click();
    expect(armedAbility()).toBe('c_petals');
    expect(pill('c_petals').getAttribute('aria-pressed')).toBe('true');
    expect($('hint').textContent).toBe(en['ability.c_petals.hint']);
    pill('c_bouquet').click();
    expect(armedAbility()).toBe('c_bouquet');
    expect(pill('c_petals').getAttribute('aria-pressed')).toBe('false');
    expect(pill('c_bouquet').getAttribute('aria-pressed')).toBe('true');
    pill('c_bouquet').click();
    expect(armedAbility()).toBeNull();
    expect(pills().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
  it('it stays armed across a tap on the world, a camera move and a rebuild of the strip, and ends with the group switch, a Park tool or the avatar mode', () => {
    setGroup('mischief');
    pill('m_sprinkler').click();
    tapAbility(tileHit(4, 4), { x: 4, y: 4 });
    expect(armedAbility()).toBe('m_sprinkler');
    setProgress({ cp: 0, mp: 8 });
    updateRail(0); // a tier reached rebuilds the pills in place
    expect(pill('m_sprinkler').getAttribute('aria-pressed')).toBe('true');
    expect(armedAbility()).toBe('m_sprinkler');
    setGroup('cupid');
    expect(armedAbility()).toBeNull();
    pill('c_petals').click();
    setGroup('park');
    expect(armedAbility()).toBeNull();
    setGroup('cupid');
    armAbility('c_petals');
    setTool('lamp');
    expect(armedAbility()).toBeNull();
    setGroup('mischief');
    pill('m_pigeon').click();
    $('bMode').click(); // Be someone: the strips are hidden in avatar mode
    expect(armedAbility()).toBeNull();
    expect(getComputedStyle($('tools')).display).toBe('none');
    $('bMode').click();
  });
  it('row 2: a Park hand shows Undo; an ability group shows the chip alone, "Pick an ability" with nothing armed, so the row never changes height (one contextual bar)', () => {
    expect(hidden('row2')).toBe(false);
    expect(hidden('bUndo')).toBe(false);
    expect(hidden('cdChip')).toBe(true);
    setGroup('cupid');
    expect(hidden('row2')).toBe(false);
    expect(hidden('cdChip')).toBe(false);
    expect($('cdChip').classList.contains('idle')).toBe(true);
    expect($('cdChip').querySelector('.nm')?.textContent).toBe('Pick an ability');
    expect(getComputedStyle($('cdChip').querySelector('svg') as Element).display).toBe('none');
    expect(hidden('bUndo')).toBe(true);
    expect(($('row2').querySelector('.ctx') as HTMLElement).hidden).toBe(true);
    pill('c_petals').click();
    expect(hidden('cdChip')).toBe(false);
    expect($('cdChip').classList.contains('idle')).toBe(false);
    expect($('cdChip').querySelector('.nm')?.textContent).toBe('Petals');
    expect(getComputedStyle($('cdChip').querySelector('svg') as Element).display).not.toBe('none');
    pill('c_petals').click();
    expect($('cdChip').classList.contains('idle')).toBe(true);
    setGroup('mischief');
    expect($('cdChip').classList.contains('mischief')).toBe(true);
    setGroup('park');
    expect(hidden('cdChip')).toBe(true);
    expect(hidden('bUndo')).toBe(false);
    const shell = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    expect(shell).toContain('pointer-events:none;min-height:44px}'); // row 2 is as tall as Undo, in every group
  });
  it('the avatar mode hides everything in row 2, and the row then keeps no height (the 44 px floor is for the Park and ability groups only)', () => {
    setGroup('cupid');
    expect(getComputedStyle($('row2')).minHeight).toBe('44px');
    document.body.classList.add('avatar');
    try {
      expect(getComputedStyle($('row2')).minHeight).toMatch(/^0(px)?$/);
      expect(getComputedStyle($('cdChip')).display).toBe('none');
      expect(getComputedStyle($('bUndo')).display).toBe('none');
    } finally {
      document.body.classList.remove('avatar');
    }
  });
});

describe('03 8.2 item 2: the tap on the world resolves the target by the ability\'s type, enqueues `ability` and keeps it armed', () => {
  it('abilityTarget: visitor and pair take the person under the tap, tile and area the tile (or the person there), park needs no tap', () => {
    const person = { kind: 'visitor' as const, id: 7, tile: { x: 5, y: 5 } };
    expect(abilityTarget(def('m_pigeon'), person, { x: 5, y: 5 })).toEqual({ kind: 'visitor', id: 7 });
    expect(abilityTarget(def('c_bouquet'), person, { x: 5, y: 5 })).toEqual({ kind: 'visitor', id: 7 });
    expect(abilityTarget(def('m_pigeon'), tileHit(5, 5), { x: 5, y: 5 })).toBeNull();
    expect(abilityTarget(def('c_bouquet'), tileHit(5, 5), { x: 5, y: 5 })).toBeNull();
    expect(abilityTarget(def('c_petals'), tileHit(5, 5), { x: 5, y: 5 })).toEqual({ kind: 'tile', x: 5, y: 5 });
    expect(abilityTarget(def('m_peel'), tileHit(5, 5), { x: 5, y: 5 })).toEqual({ kind: 'tile', x: 5, y: 5 });
    expect(abilityTarget(def('c_sunbeam'), person, { x: 5, y: 5 })).toEqual({ kind: 'visitor', id: 7 }); // a child there is refused by the sim
    expect(abilityTarget(def('c_petals'), { kind: 'none', id: 0, tile: null }, null)).toBeNull();
    expect(abilityTarget(def('c_fireworks'), tileHit(5, 5), null)).toEqual({ kind: 'park' });
  });
  it('a tap with c_petals armed queues one command with the tile; the step applies it (the cooldown starts, PETALS on the 3 x 3) and it stays armed', () => {
    setGroup('cupid');
    pill('c_petals').click();
    expect(tapAbility(tileHit(4, 4), { x: 4, y: 4 })).toBe(true);
    expect(pendingCount()).toBe(1);
    simulate(SIM_DT, 0);
    const c = cmds().at(-1);
    expect(c?.side).toBe('cupid');
    expect(c).toMatchObject({ kind: 'ability', payload: { id: 'c_petals', target: { kind: 'tile', x: 4, y: 4 } } });
    expect(cooldownLeft('cupid', 'c_petals')).toBeGreaterThan(29);
    expect(PETALS[I(4, 4)]).toBeGreaterThan(0.5);
    expect(PETALS[I(3, 5)]).toBeGreaterThan(0.5);
    expect(armedAbility()).toBe('c_petals');
  });
  it('a tap that is no target for the type (the ground for a visitor ability) toasts the hint, queues nothing and stays armed', () => {
    setGroup('mischief');
    pill('m_pigeon').click();
    $('hint').textContent = '';
    tapAbility(tileHit(4, 4), { x: 4, y: 4 });
    expect($('hint').textContent).toBe(en['ability.m_pigeon.hint']);
    expect(pendingCount()).toBe(0);
    expect(armedAbility()).toBe('m_pigeon');
    expect(tapAbility(tileHit(4, 4), null)).toBe(true);
  });
  it('with nothing armed tapAbility does nothing', () => {
    expect(tapAbility(tileHit(4, 4), { x: 4, y: 4 })).toBe(false);
    expect(pendingCount()).toBe(0);
  });
  it('the area ability marks its square: c_petals r 1 at the tapped tile, in the side\'s accent; a tile ability marks none; disarming clears it', () => {
    setGroup('cupid');
    pill('c_petals').click();
    tapAbility(tileHit(10, 12), { x: 10, y: 12 });
    expect(aimMark()).toMatchObject({ x: 10, y: 12, r: 1, side: 'cupid' });
    setGroup('mischief');
    expect(aimMark()).toBeNull();
    pill('m_sprinkler').click();
    tapAbility(tileHit(10, 12), { x: 10, y: 12 });
    expect(aimMark()).toBeNull();
    setProgress({ cp: 8, mp: 8 });
    setGroup('cupid');
    pill('c_sunbeam').click();
    tapAbility(tileHit(20, 30), { x: 20, y: 30 });
    expect(aimMark()).toMatchObject({ x: 20, y: 30, r: 3, side: 'cupid' });
    pill('c_sunbeam').click();
    expect(aimMark()).toBeNull();
  });
  it('a tap the sim would refuse draws no square (02 9.1 item 3: nothing happened): c_petals inside its cooldown still sends the command, and the sim answers it', () => {
    setGroup('cupid');
    pill('c_petals').click();
    tapAbility(tileHit(10, 12), { x: 10, y: 12 });
    expect(aimMark()).toMatchObject({ x: 10, y: 12 });
    simulate(SIM_DT, 0); // the cast: the cooldown is running
    clearAimMark();
    expect(tapAbility(tileHit(14, 12), { x: 14, y: 12 })).toBe(true);
    expect(aimMark()).toBeNull();
    expect(pendingCount()).toBe(1);
    simulate(SIM_DT, 0);
    expect(cmds()).toHaveLength(1); // refused, so it is not in the log of applied commands
    expect(PETALS[I(14, 12)]).toBe(0);
  });
});

describe('04 5.4 item 4: row 2\'s cooldown chip: the ring, the seconds left, the charges', () => {
  it('an armed ability that is ready shows its name, "Ready" and an empty ring', () => {
    setGroup('mischief');
    pill('m_sprinkler').click();
    const c = chip();
    expect(c.nm).toBe('Sprinkler');
    expect(c.cd).toBe('Ready');
    expect(c.ch?.hidden).toBe(true);
    expect(c.dash).toBeCloseTo(2 * Math.PI * 9, 3);
    expect(c.off).toBeCloseTo(c.dash, 3);
    expect($('cdChip').classList.contains('mischief')).toBe(true);
    expect($('cdChip').querySelector('.trk')).not.toBeNull();
  });
  it('after the cast the ring is full and the seconds read the cooldown; it shrinks with sim seconds and is empty again at Ready', () => {
    setGroup('mischief');
    pill('m_sprinkler').click();
    tapAbility(tileHit(4, 4), { x: 4, y: 4 });
    simulate(SIM_DT, 0);
    updateRail(0);
    let c = chip();
    expect(c.cd).toBe('45 s');
    expect(c.off).toBeLessThan(0.5); // full
    for (let s = 0; s < 900; s++) simulate(SIM_DT, 0); // 15 sim seconds
    updateRail(0);
    c = chip();
    expect(c.cd).toBe('30 s');
    expect(c.off).toBeGreaterThan(18);
    expect(c.off).toBeLessThan(19.5); // a third of the ring gone... two thirds are left: 56.5 x (1 - 30 / 45)
    for (let s = 0; s < 1800; s++) simulate(SIM_DT, 0);
    updateRail(0);
    c = chip();
    expect(c.cd).toBe('Ready');
    expect(c.off).toBeCloseTo(c.dash, 3);
  });
  it('the cooldown holds still while the park is paused (it is read in sim seconds)', () => {
    setGroup('mischief');
    pill('m_sprinkler').click();
    tapAbility(tileHit(4, 4), { x: 4, y: 4 });
    simulate(SIM_DT, 0);
    updateRail(0);
    const before = chip();
    updateRail(5); // five real seconds, no step
    expect(chip()).toEqual(before);
  });
  it('an ability with charges shows "1/1" (c_fireworks, m_flock) and the cooldown seconds when it has been used', () => {
    setGroup('cupid');
    setArmed('c_fireworks');
    paintChip();
    expect(chip().ch?.hidden).toBe(false);
    expect(chip().ch?.textContent).toBe('1/1');
    expect(chip().nm).toBe('Fireworks');
    setArmed(null);
    expect($('cdChip').classList.contains('idle')).toBe(true);
  });
  it('Spanish: the chip reads in Spanish after a language change, idle or armed', () => {
    setGroup('mischief');
    setLang('es');
    updateRail(0);
    expect($('cdChip').querySelector('.nm')?.textContent).toBe(es['rail.pick']);
    setLang('en');
    pill('m_sprinkler').click();
    setLang('es');
    updateRail(0);
    expect(chip().nm).toBe(es['ability.m_sprinkler.name']);
    expect(chip().cd).toBe(es['rail.ready']);
    setLang('en');
  });
  it('a refusal that needs a number gets it: the seconds left of the armed ability, or its tier', () => {
    setGroup('mischief');
    pill('m_sprinkler').click();
    tapAbility(tileHit(4, 4), { x: 4, y: 4 });
    simulate(SIM_DT, 0);
    expect(refusalParams('reason.cooldown')).toEqual({ s: 45 });
    expect(refusalParams('reason.locked')).toEqual({ side: '@rail.mischief', tier: 0 });
    expect(refusalParams('reason.not_here')).toBeUndefined();
    setArmed(null);
    expect(refusalParams('reason.cooldown')).toEqual({ s: 45 }); // the ability last sent, though it is no longer armed (the park may be paused)
  });
});

describe('03 7.8 item 3: the armed area ability\'s square is drawn at alpha 0.25 in the side\'s accent', () => {
  type Rec = { path: Array<[string, number, number]>; fill: string[]; stroke: string[] };
  function fake(): { c: CanvasRenderingContext2D; rec: Rec } {
    const rec: Rec = { path: [], fill: [], stroke: [] };
    const c = {
      fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '',
      beginPath: () => rec.path.push(['begin', 0, 0]),
      moveTo: (x: number, y: number) => rec.path.push(['move', x, y]),
      lineTo: (x: number, y: number) => rec.path.push(['line', x, y]),
      closePath: () => rec.path.push(['close', 0, 0]),
      fill: () => rec.fill.push(c.fillStyle),
      stroke: () => rec.stroke.push(c.strokeStyle),
    };
    return { c: c as unknown as CanvasRenderingContext2D, rec };
  }
  it('Cupid: the palette\'s rose (the --berry), a square over the 3 x 3 tiles, fill alpha .25 and a hairline of the same colour', () => {
    const { c, rec } = fake();
    drawAimMark(c); // nothing marked: nothing drawn
    expect(rec.path).toHaveLength(0);
    setAimMark(10, 12, 1, 'cupid');
    drawAimMark(c);
    expect(rec.fill).toHaveLength(1);
    expect(rec.fill[0]).toMatch(/^rgba\(237,169,196,/);
    expect(alpha(rec.fill[0])).toBeCloseTo(0.25, 5);
    expect(rec.stroke[0]).toMatch(/^rgba\(237,169,196,/);
    expect(alpha(rec.stroke[0])).toBeGreaterThan(0.25);
    expect(rec.path.map((p) => p[0])).toEqual(['begin', 'move', 'line', 'line', 'line', 'close']);
    const a = corner(10 - 1.5, 12 - 1.5), cc = corner(10 + 1.5, 12 + 1.5);
    expect(rec.path[1]?.slice(1)).toEqual([a.x, a.y]);
    expect(rec.path[3]?.slice(1)).toEqual([cc.x, cc.y]);
  });
  it('Mischief: lamp amber (the --ember); a bigger area is a bigger square', () => {
    const { c, rec } = fake();
    setAimMark(20, 20, 3, 'mischief');
    drawAimMark(c);
    expect(rec.fill[0]).toMatch(/^rgba\(240,190,106,/);
    const lo = { x: 0, y: 0 }, hi = { x: 0, y: 0 };
    screenInto(20 - 3.5, 20 - 3.5, 0, lo);
    screenInto(20 + 3.5, 20 - 3.5, 0, hi);
    expect(rec.path[1]?.slice(1)).toEqual([lo.x, lo.y]);
    expect(rec.path[2]?.slice(1)).toEqual([hi.x, hi.y]);
    clearAimMark();
    const after = fake();
    drawAimMark(after.c);
    expect(after.rec.path).toHaveLength(0);
  });
});

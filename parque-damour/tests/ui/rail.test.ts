// @vitest-environment jsdom
// tests/ui/rail.test.ts
// Locks the S3 rows of 08 2.9 rail.test.ts (the Park strip is data driven: 16 pills from TOOLS, #size max 3; body.avatar hides the Park
// strip, the size row and Undo) and the rail's row 2 of 02 8.1-8.2 and 04 5.4 item 4 (the tool's label or the ranked reason, the brush
// size, Place disabled while the ghost is red, Undo disabled at undo depth 0, GV 11018 and 11116), and hard rule 2 / 03 4.6 for row 3
// (the pause and Undo enqueue commands, they write no sim state). jsdom, on index.html with shell.css.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T } from '../../src/core/clock.ts';
import { SIM_DT, newPark, simulate } from '../../src/core/loop.ts';
import { applyNow, clearPending, pendingCount } from '../../src/core/commands.ts';
import { clearListeners } from '../../src/core/events.ts';
import { TOOLS } from '../../src/play/tools.ts';
import { depth } from '../../src/play/undo.ts';
import { setMode } from '../../src/play/mode.ts';
import { $ } from '../../src/ui/dom.ts';
import { setLang } from '../../src/ui/i18n.ts';
import { activeTool, armedGhost, brushSize, buildRail, cancelGhost, placeGhost, setGroup, setTool, tapGhost, updateRail } from '../../src/ui/rail.ts';
import { en } from '../../src/ui/strings/en.ts';

const ROOT = join(import.meta.dirname, '..', '..');
let news = 0;

beforeAll(() => {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML; // the module script does not run from innerHTML
  const style = document.createElement('style');
  style.textContent = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
  document.head.appendChild(style);
  setLang('en');
  buildRail({ onNew: () => news++ });
});

beforeEach(() => {
  clearListeners();
  newPark(101);
  setMode('creator');
  document.body.classList.remove('avatar');
  setGroup('park');
  setTool('hand');
});

const shown = (id: string): boolean => getComputedStyle($(id)).display !== 'none' && !$(id).closest('[hidden]');

describe('08 2.9 rail.test.ts: the rail is data driven (03 10.4; GV buildTools 11048)', () => {
  it('the Park strip renders the 16 tools of TOOLS in order with an icon and a label; #size max is 3', () => {
    expect(Object.keys(en).length).toBeGreaterThan(0);
    const pills = [...document.querySelectorAll<HTMLButtonElement>('#tools .tool')];
    expect(pills).toHaveLength(16);
    expect(pills.map((b) => b.dataset.id)).toEqual(TOOLS.map((d) => d.id));
    for (const [k, b] of pills.entries()) {
      const d = TOOLS[k];
      expect(b.querySelector('.sw svg'), d?.id).not.toBeNull();
      expect(b.querySelector('.lb')?.textContent).toBe(en[d?.labelKey as string]);
      expect(b.getAttribute('aria-pressed')).toBe(d?.id === 'hand' ? 'true' : 'false');
    }
    expect(($('size') as HTMLInputElement).max).toBe('3');
    expect(($('size') as HTMLInputElement).min).toBe('1');
  });
  it('the icons are inline SVG in currentColor: no colour of their own (04 4.5, 12 item 12)', () => {
    const html = $('tools').innerHTML;
    expect(html).not.toMatch(/#[0-9A-Fa-f]{3,6}\b|rgba?\(/);
    expect(html).toContain('stroke="currentColor"');
  });
  it('a tap on a pill arms it (aria-pressed); the Cupid group empties the strip and disarms the park tool', () => {
    document.querySelector<HTMLButtonElement>('#tools .tool[data-id="lamp"]')?.click();
    expect(activeTool()).toBe('lamp');
    expect(document.querySelector('#tools .tool[data-id="lamp"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('#tools .tool[data-id="hand"]')?.getAttribute('aria-pressed')).toBe('false');
    setGroup('cupid');
    expect(document.querySelectorAll('#tools .tool')).toHaveLength(0); // TODO(S6) fills the Cupid strip
    expect(activeTool()).toBe('hand');
    setGroup('park');
    expect(document.querySelectorAll('#tools .tool')).toHaveLength(16);
  });
  it.todo('Cupid 9 and Mischief 10 pills from RAIL; locked pills carry .locked and the tier word (S6)');
});

describe('08 2.9 rail.test.ts: body.avatar hides the park strip (03 10.2; GV CSS 169)', () => {
  it('body.avatar: #tools, #sizewrap, row 2 and #bUndo hidden', () => {
    setTool('path');
    expect(shown('tools')).toBe(true);
    expect(shown('sizewrap')).toBe(true);
    expect(shown('bUndo')).toBe(true);
    document.body.classList.add('avatar');
    for (const id of ['tools', 'sizewrap', 'bUndo', 'bPlace', 'bCancel']) expect(getComputedStyle($(id)).display, id).toBe('none');
    expect(getComputedStyle(document.querySelector('#row2 .ctx') as HTMLElement).display).toBe('none');
  });
  it.todo('the avatar hint strip shows in avatar mode (S7)');
});

describe('02 8.2, 04 5.4 item 4: row 2 by context (GV updateGbar 11018, showUndo 11116)', () => {
  it('the hand shows only Undo; a brush shows its label and the size 1-3; a 1 x 1 stamp its label alone', () => {
    expect($('row2').querySelector<HTMLElement>('.ctx')?.hidden).toBe(true);
    expect($('bUndo').hidden).toBe(false);
    setTool('path');
    expect($('row2').querySelector<HTMLElement>('.ctx')?.hidden).toBe(false);
    expect($('depth').textContent).toBe(en['tool.path.label']);
    expect($('sizewrap').hidden).toBe(false);
    ($('size') as HTMLInputElement).value = '3';
    expect(brushSize()).toBe(3);
    ($('size') as HTMLInputElement).value = '1';
    setTool('lamp');
    expect($('depth').textContent).toBe(en['tool.lamp.label']);
    expect($('sizewrap').hidden).toBe(true);
    expect($('bPlace').hidden).toBe(true);
  });
  it('a big stamp on open lawn: a green 3 x 3 ghost centred on the tap, Place enabled; Place enqueues one tool command', () => {
    setTool('bandstand');
    tapGhost({ x: 4, y: 4 }); // the footprint (3..5, 3..5): open lawn on seed 101 (tools.test.ts VALID)
    const g = armedGhost();
    expect(g?.ok).toBe(true);
    expect(g?.tiles).toHaveLength(9);
    expect(g?.tiles[0]).toEqual({ x: 3, y: 3 });
    expect($('bPlace').hidden).toBe(false);
    expect(($('bPlace') as HTMLButtonElement).disabled).toBe(false);
    expect($('depth').textContent).toBe(en['tool.bandstand.label']);
    expect($('depth').classList.contains('no')).toBe(false);
    clearPending();
    $('bPlace').click();
    expect(pendingCount()).toBe(1);
    expect(armedGhost()).toBeNull();
    expect($('bPlace').hidden).toBe(true);
    clearPending();
  });
  it('a big stamp over the pond: a red ghost, row 2 reads "not on the water", Place disabled; Cancel drops it', () => {
    setTool('bandstand');
    tapGhost({ x: 31, y: 12 }); // a pond tile of seed 101
    const g = armedGhost();
    expect(g?.ok).toBe(false);
    expect(g?.reason).toBe('reason.on_water');
    expect($('depth').textContent).toBe(en['reason.on_water']);
    expect($('depth').classList.contains('no')).toBe(true);
    expect(($('bPlace') as HTMLButtonElement).disabled).toBe(true);
    clearPending();
    placeGhost(); // a refused ghost enqueues nothing
    expect(pendingCount()).toBe(0);
    $('bCancel').click();
    expect(armedGhost()).toBeNull();
    expect($('bCancel').hidden).toBe(true);
  });
  it('the longest reason, a bridge over water 5 wide, reads whole: row 2 wraps it and keeps Place and Cancel (02 8.3 bridge, 8.4)', () => {
    expect(applyNow({ side: 'park', kind: 'tool', payload: { tool: 'pond', at: { x: 30, y: 33 }, size: 3, stroke: 1 } }).ok).toBe(true);
    setTool('bridge');
    tapGhost({ x: 30, y: 33 });
    expect(armedGhost()?.reason).toBe('reason.too_wide');
    expect($('depth').textContent).toBe(en['reason.too_wide']); // "the water is too wide here (4 at most)", not cut in the text
    expect($('depth').classList.contains('no')).toBe(true);
    const d = getComputedStyle($('depth'));
    expect(d.whiteSpace).toBe('normal'); // a refused reason wraps instead of an ellipsis (tools/shot.mjs s3-bridge-wide measures it)
    expect(d.textOverflow).not.toBe('ellipsis');
    for (const id of ['bPlace', 'bCancel']) expect(getComputedStyle($(id)).flexShrink, id).toBe('0');
    expect(($('bPlace') as HTMLButtonElement).disabled).toBe(true);
    cancelGhost();
  });
  it('a second tap on the same tile places (03 8.2 item 3); a run grows by straight segments and refuses a tap off the line', () => {
    setTool('fountain');
    clearPending();
    tapGhost({ x: 5, y: 5 });
    tapGhost({ x: 5, y: 5 });
    expect(pendingCount()).toBe(1);
    expect(armedGhost()).toBeNull();
    clearPending();
    setTool('hedge');
    tapGhost({ x: 5, y: 5 });
    tapGhost({ x: 8, y: 5 });
    expect(armedGhost()?.tiles).toHaveLength(4);
    tapGhost({ x: 6, y: 9 }); // not in line with (8, 5): toasted, the run stays
    expect(armedGhost()?.tiles).toHaveLength(4);
    expect(armedGhost()?.ok).toBe(true);
    expect($('hint').textContent).toBe(en['reason.straight_line']);
    cancelGhost();
  });
  it('Undo is disabled at depth 0 and enabled once a tool command applied; it enqueues `undo`', () => {
    updateRail(0);
    expect(depth()).toBe(0);
    expect(($('bUndo') as HTMLButtonElement).disabled).toBe(true);
    expect(applyNow({ side: 'park', kind: 'tool', payload: { tool: 'lamp', at: { x: 5, y: 5 } } }).ok).toBe(true);
    updateRail(0);
    expect(($('bUndo') as HTMLButtonElement).disabled).toBe(false);
    clearPending();
    $('bUndo').click();
    expect(pendingCount()).toBe(1);
    simulate(SIM_DT, 0);
    expect(depth()).toBe(0);
    updateRail(0);
    expect(($('bUndo') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('hard rule 2, 03 4.6: row 3 enqueues commands', () => {
  it('the pause enqueues `speed` and leaves T.speed to the command; New calls the handler (the confirm, in main.ts)', () => {
    const before = T.speed;
    clearPending();
    $('bHalt').click();
    expect(T.speed).toBe(before);
    expect(pendingCount()).toBe(1);
    simulate(SIM_DT, 0);
    expect(T.speed).toBe(before > 0 ? 0 : 1);
    T.speed = 1;
    const n = news;
    $('bNew').click();
    expect(news).toBe(n + 1);
  });
});

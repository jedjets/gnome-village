// tests/rig.test.ts
// Locks the picked figure rig 2 Tailored and the crowd palette A Parisian chic (register section 4, rows Figure rig and Crowd palette,
// 2026-10-13; 07 S4.6 steps 12 and 13): the 04 7.1 item 2 proportions measured from the rig's skeleton (figure-rig.ts solveH), the LOD tier
// by drawn height at the tier edges (04 7.1 item 5), the singles' top rule over 10,000 lookSeeds (no single's top within SIG_NEAR, CIEDE2000,
// of its own signature colour; never a Breton under a beret; a couple never in its own scarf hue), both walker's dogs across seeds, every
// state the sim uses mapped onto the 14 body-language states, and the chat bubble's tail on the lower edge (04 7.5 item 4). The S4 rig
// review: itemFor is the item the rig draws (one source), and the sprite cache repaints a light step a few a frame (03 7.9).
import { describe, it, expect } from 'vitest';
import { CROWD_BRETON, PALETTES, STYLES, type Pen } from '../src/render/ambient.ts';
import { FH, LOD, STATES, opts, solveH, tierOf, type Item, type RigLook, type Skel } from '../src/render/figure-rig.ts';
import { ALLOWED_TOPS, SIG_NEAR, breedOf, lookOf, newLook, pick, topOf } from '../src/render/figure-look.ts';
import { SCALE_CHILD, SCALE_ELDER, figureScale, itemFor, poseOf, stateOf } from '../src/render/figures.ts';
import { SPRITE_REPAINTS, spriteFor, spriteFrame, type SpriteLight } from '../src/render/figure-sprites.ts';
import { DOING } from '../src/entities/act.ts';
import { signatureOf, type Visitor } from '../src/entities/visitor.ts';
import { drawChatBubble } from '../src/render/effects.ts';
import { mulberry32 } from '../src/core/rng.ts';

const P = PALETTES.A;

/* ---------- CIEDE2000 (as the crowd palette page measured, scratch/s4-crowd-palettes.ts) ---------- */
const hx = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fLab = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
const hp = (x: number, y: number): number => {
  if (x === 0 && y === 0) return 0;
  const h = (Math.atan2(y, x) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
};
const rad = (d: number): number => (d * Math.PI) / 180;
function lab(h: string): [number, number, number] {
  const [r, g, b] = hx(h).map(lin) as [number, number, number];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * fLab(Y) - 16, 500 * (fLab(X) - fLab(Y)), 200 * (fLab(Y) - fLab(Z))];
}
function dE(a: string, b: string): number {
  const [L1, a1, b1] = lab(a), [L2, a2, b2] = lab(b);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G);
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const h1 = hp(ap1, b1), h2 = hp(ap2, b2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * Math.PI) / 360);
  const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
  let hm = h1 + h2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(h1 - h2) > 180) hm += h1 + h2 < 360 ? 360 : -360;
    hm /= 2;
  }
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63));
  const dTh = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(rad(2 * dTh)) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

const look = (o: Partial<RigLook> = {}): RigLook => ({ ...newLook(), arche: 'single', sex: 'm', hairStyle: 'short', top: P.crowdTop[0] as string, low: P.crowdLow[0] as string, ...o });
const d = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
/** A visitor record with only what the look reads (lookOf, stateOf, itemFor), the rest left out. */
function vis(o: Partial<Visitor>): Visitor {
  return {
    id: 1, sex: 'f', archetype: 'single', ageWord: 'grown', lookSeed: 0, st: 'idle', path: null, sitPropId: 0, coupleOf: 0, job: {},
    items: { hat: false, purse: false, baguette: false, iceCream: false }, ...o,
  } as unknown as Visitor;
}

describe('04 7.1 item 2: the Tailored rig\'s proportions, measured from its skeleton (register section 4, Figure rig)', () => {
  const h = FH * 1.3; // 28.6 px, the default zoom
  const S: Skel = solveH(look(), opts({ neutral: true }), h);
  it('FH is 22 px at zoom 1 (04 7.1 rule 1); child 0.65 FH, elder 0.95 FH', () => {
    expect(FH).toBe(22);
    expect(SCALE_CHILD).toBe(0.65);
    expect(SCALE_ELDER).toBe(0.95);
    expect(figureScale({ archetype: 'child', ageWord: 'young' })).toBe(0.65);
    expect(figureScale({ archetype: 'single', ageWord: 'elder' })).toBe(0.95);
    expect(figureScale({ archetype: 'single', ageWord: 'grown' })).toBe(1);
  });
  it('hip -0.38 h, shoulder -0.66 h, head centre -0.82 h, head radius 0.10 h', () => {
    expect(-S.pelvis.y / h).toBeCloseTo(0.38, 3);
    expect(-S.shoulder.y / h).toBeCloseTo(0.66, 3);
    expect(-S.head.y / h).toBeCloseTo(0.82, 3);
    expect(S.hr / h).toBeCloseTo(0.1, 6);
  });
  it('shoulder width 0.16 h; upper arm 0.16 h and forearm 0.14 h (arm 0.30); leg 0.38 h as thigh and shin 0.19', () => {
    expect(d(S.shoulderL, S.shoulderR) / h).toBeCloseTo(0.16, 6);
    expect(d(S.shF, S.elF) / h).toBeCloseTo(0.16, 6);
    expect(d(S.elF, S.haF) / h).toBeCloseTo(0.14, 6);
    expect(d(S.shB, S.elB) / h + d(S.elB, S.haB) / h).toBeCloseTo(0.3, 6);
    expect(d(S.hipF, S.kneeF) / h).toBeCloseTo(0.19, 6);
    expect(d(S.kneeF, S.footF) / h).toBeCloseTo(0.19, 6);
    expect((d(S.hipB, S.kneeB) + d(S.kneeB, S.footB)) / h).toBeCloseTo(0.38, 6);
  });
  it('the line is max(0.9, 0.06 h); the feet stand on the anchor', () => {
    expect(S.lw).toBeCloseTo(Math.max(0.9, 0.06 * h), 9);
    expect(solveH(look(), opts({ neutral: true }), 6.6).lw).toBe(0.9);
    expect(Math.abs(S.footF.y)).toBeLessThan(0.01 * h);
    expect(Math.abs(S.footB.y)).toBeLessThan(0.01 * h);
  });
  it('the walk swings the legs 0.15 h either way and bobs 0.02 h (04 7.1 rule 3); sitting crouches 0.24 h (rule 6)', () => {
    const mid = solveH(look(), opts({ state: 'walk', ph: Math.PI / 2 }), h);
    expect(mid.footF.x - mid.footB.x).toBeGreaterThan(0.25 * h); // 2 x 0.9 x 0.15 h apart, the heel and toe aside
    const sit = solveH(look(), opts({ state: 'sit', seatPx: 0.2 * 26 * 1.3 }), h);
    expect(sit.sitting).toBe(true);
    expect(-sit.pelvis.y / h).toBeCloseTo(0.38 - 0.24, 6);
  });
});

describe('04 7.1 item 5: the LOD tier by drawn height, at the tier edges', () => {
  it('nothing under 3 px; body from 3, signifier from 4, eyes from 8, expression from 12, close from 18', () => {
    expect(LOD).toEqual({ body: 3, signifier: 4, eyes: 8, expression: 12, close: 18 });
    const cases: Array<[number, number]> = [
      [0, 0], [2.999, 0], [3, 1], [3.999, 1], [4, 2], [7.999, 2], [8, 3], [11.999, 3], [12, 4], [17.999, 4], [18, 5], [100, 5],
    ];
    for (const [h, t] of cases) expect(tierOf(h), 'h ' + h).toBe(t);
  });
  it('at the default zoom 1.3 every tier shows (h 28.6); at Fit 0.30 body and signifier only (h 6.6)', () => {
    expect(tierOf(FH * 1.3)).toBe(5);
    expect(tierOf(FH * 0.3)).toBe(2);
    expect(tierOf(FH * 0.82)).toBe(5); // 04 7.1 item 5: close from zoom 0.82
    expect(tierOf(FH * 0.13)).toBe(0);
  });
});

describe('register section 4, Crowd palette: the singles\' tops, the couples\' scarves, the Breton', () => {
  it('ALLOWED_TOPS holds exactly the tops at least SIG_NEAR (CIEDE2000) from each signature', () => {
    expect(P.signature.length).toBe(ALLOWED_TOPS.length);
    P.signature.forEach((sig, s) => {
      const want = P.crowdTop.map((t, i) => (dE(t, sig) >= SIG_NEAR ? i : -1)).filter((i) => i >= 0);
      expect(ALLOWED_TOPS[s], 'signature ' + s).toEqual(want);
    });
  });
  it('over 10,000 lookSeeds no single wears a top within SIG_NEAR of its own signature colour, and every top is still worn', () => {
    const r = mulberry32(4242);
    const worn = new Set<number>();
    let rerolled = 0;
    for (let k = 0; k < 10_000; k++) {
      const seed = Math.floor(r() * 4294967296), sex = k % 2 ? 'f' : 'm';
      const top = topOf(seed, 'single', sex, '', -1, P);
      const sig = P.signature[signatureOf(seed)] as string;
      expect(dE(P.crowdTop[top] as string, sig), 'seed ' + seed).toBeGreaterThanOrEqual(SIG_NEAR);
      if (top !== pick(seed, 6, P.crowdTop.length)) rerolled++;
      worn.add(top);
      const out = lookOf(vis({ lookSeed: seed, sex, archetype: 'single' }), P, 1, newLook());
      expect(out.top).toBe(P.crowdTop[top]);
      expect(out.sig).toBe(signatureOf(seed));
    }
    expect(worn.size).toBe(P.crowdTop.length);
    expect(rerolled).toBeGreaterThan(0); // the rule bites: some seeds are re-rolled
  });
  it('never a Breton under a beret, never a couple member in its own scarf hue; a couple shares one crowd hue, with no signature', () => {
    const r = mulberry32(77);
    for (let k = 0; k < 10_000; k++) {
      const seed = Math.floor(r() * 4294967296);
      const f = lookOf(vis({ lookSeed: seed, sex: 'f', archetype: 'single', items: { hat: ((seed >>> 3) & 1) === 1, purse: false, baguette: false, iceCream: false } }), P, 1, newLook());
      if (f.hat === 'beret') expect(f.stripe, 'seed ' + seed).toBe('');
      const c = lookOf(vis({ lookSeed: seed, sex: 'm', archetype: 'couple' }), P, 1, newLook());
      expect(P.crowdPair).toContain(c.pairScarf);
      expect(c.top).not.toBe(c.pairScarf);
      if (c.stripe) expect(c.stripe).not.toBe(c.pairScarf);
      expect(c.sig).toBe(-1);
    }
  });
  it('the Breton is burgundy on cream: crowdTop[CROWD_BRETON] striped with crowdStripe', () => {
    expect(P.crowdTop[CROWD_BRETON]).toBe('#F1EADB');
    expect(P.crowdStripe).toBe('#7E2F45');
    const breton = Array.from({ length: 4000 }, (_, k) => lookOf(vis({ lookSeed: k * 7919, sex: 'm', archetype: 'tourist', items: { hat: true, purse: false, baguette: false, iceCream: false } }), P, 1, newLook())).find((l) => l.stripe);
    expect(breton?.top).toBe('#F1EADB');
    expect(breton?.stripe).toBe(P.crowdStripe);
  });
});

describe('register section 4, Figure rig: both walker\'s dogs, one per dog walker by lookSeed; the child\'s balloon or ice cream', () => {
  it('the terrier and the poodle both appear across lookSeeds, about half each', () => {
    let t = 0;
    for (let s = 0; s < 2000; s++) if (breedOf(s * 2654435761) === 'terrier') t++;
    expect(t).toBeGreaterThan(800);
    expect(t).toBeLessThan(1200);
    expect(breedOf(12345)).toBe(breedOf(12345));
  });
});

/** The items the rig draws for a visitor: solveH for its look and pose, as figure-garments.ts dresses them. */
const drawn = (v: Visitor): { F: Item; B: Item } => solveH(lookOf(v, P, figureScale(v), newLook()), poseOf(v, v.face, 0, opts()), FH).items;

describe('03 7.6 item 4: itemFor is the thing the rig draws in the hand, read from the same solve (the S4 rig review)', () => {
  const ice = { hat: false, purse: false, baguette: false, iceCream: true };
  const cases: Array<[string, Partial<Visitor>, Item]> = [
    ['an idle family child holds its balloon (04 7.2 over 7.1 rule 10)', { archetype: 'child', ageWord: 'young' }, 'balloon'],
    ['the child with its ice cream once bought', { archetype: 'child', ageWord: 'young', items: ice }, 'icecream'],
    ['a child skipping in play flings both arms out, empty (the picked page)', { archetype: 'child', ageWord: 'young', st: 'play' }, 'none'],
    ['a child chasing pigeons, arms out, empty', { archetype: 'child', ageWord: 'young', st: 'play', job: { creatureId: 9 } }, 'none'],
    ['an elder feeding on a bench: the crumbs in the back hand', { archetype: 'elder', ageWord: 'elder', st: 'feed', sitPropId: 3 }, 'crumbs'],
    ['a reader on a bench: the book', { st: 'read', sitPropId: 3 }, 'book'],
    ['a dog walker walking: the lead', { archetype: 'dogwalker', st: 'wander', path: [{ x: 1, y: 1 }] }, 'lead'],
    ['a dog walker sitting still holds the lead (people.ts draws it to the hand)', { archetype: 'dogwalker', st: 'sit', sitPropId: 3 }, 'lead'],
    ['an idle artist: the brush, the palette in the back hand', { archetype: 'artist' }, 'brush'],
    ['the busker playing: the accordion', { archetype: 'busker', st: 'play' }, 'accordion'],
    ['the tourist taking a photo: the camera up', { archetype: 'tourist', st: 'photo' }, 'camera-up'],
    ['a vendor serving: the cone', { archetype: 'vendor', st: 'serve' }, 'cone-serve'],
    ['a plain single standing: nothing', { archetype: 'single' }, 'none'],
  ];
  it('each case: itemFor equals the drawn front item, else the drawn back item', () => {
    for (const [what, o, item] of cases) {
      const v = vis(o), held = drawn(v);
      expect(held.F !== 'none' ? held.F : held.B, what).toBe(item);
      expect(itemFor(v, P), what).toBe(item);
    }
    expect(drawn(vis({ archetype: 'artist' })).B).toBe('palette');
  });
});

describe('07 S4.6 step 12: every state the sim uses draws as one of the 14 body-language states', () => {
  it('each act.ts DOING state, walking or not, seated or not, maps into STATES', () => {
    expect(STATES.length).toBe(14);
    for (const st of DOING) {
      for (const moving of [false, true]) {
        for (const seated of [0, 5]) {
          const s = stateOf(vis({ st, path: moving ? [{ x: 1, y: 1 }] : null, sitPropId: seated }));
          expect(STATES, st).toContain(s);
        }
      }
    }
  });
  it('the nearest states: chess and picnic sit, the busker plays standing, a child after a pigeon chases, a walk with a path walks', () => {
    expect(stateOf(vis({ st: 'chess', sitPropId: 4 }))).toBe('sit');
    expect(stateOf(vis({ st: 'picnic', sitPropId: 4 }))).toBe('sit');
    expect(stateOf(vis({ st: 'play', archetype: 'busker' }))).toBe('idle');
    expect(stateOf(vis({ st: 'play', archetype: 'child', job: { creatureId: 9 } }))).toBe('chase');
    expect(stateOf(vis({ st: 'play', archetype: 'child' }))).toBe('play');
    expect(stateOf(vis({ st: 'strollLoop', path: [{ x: 2, y: 2 }] }))).toBe('walk');
    expect(stateOf(vis({ st: 'watch' }))).toBe('idle');
    expect(stateOf(vis({ st: 'pave', path: [{ x: 2, y: 2 }] }))).toBe('walk');
    expect(stateOf(vis({ st: 'pave' }))).toBe('pave');
    expect(stateOf(vis({ st: 'huddle' }))).toBe('shelter');
  });
});

describe('04 7.5 item 4: the chat bubble\'s tail joins the lower edge (the S4 rig stage fix)', () => {
  it('the outline goes round the ellipse and out to the tail below it, never across the bubble', () => {
    const pts: Array<{ x: number; y: number }> = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (k === 'moveTo' || k === 'lineTo' ? (x: number, y: number): void => void pts.push({ x, y }) : (): void => undefined),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const pen: Pen = { ctx, spec: STYLES.A, z: 1.3 };
    drawChatBubble(pen, 100, 50, 4, 1);
    const ring = pts.slice(0, 19); // the fill's path: 18 ellipse points and the tail
    const tail = ring.reduce((a, p) => (p.y > a.y ? p : a));
    const i = ring.indexOf(tail);
    const before = ring[(i + ring.length - 1) % ring.length] as { y: number }, after = ring[(i + 1) % ring.length] as { y: number };
    expect(tail.y).toBeGreaterThan(50 + 4 * 0.8); // below the ellipse
    expect(before.y).toBeGreaterThan(50); // both its neighbours on the lower half
    expect(after.y).toBeGreaterThan(50);
    expect(tail.x).toBeLessThan(100); // on the speaker's side (facing +1)
  });
});

const noop = (): void => undefined;

describe('03 7.9 and the S4 rig review: the figure sprites repaint a light step a few a frame, not all in one frame', () => {
  type FakeCanvas = { width: number; height: number; paints: number; getContext: () => unknown };
  let made = 0;
  const g = globalThis as unknown as { document?: unknown };
  const had = 'document' in g, old = g.document;
  const ctx2d = { setTransform: noop, clearRect: noop, save: noop, restore: noop, scale: noop };
  /** A sprite for key k in light L at zoom 1.3, dpr 2, 52 x 56 CSS px; each paint counts on its canvas. */
  const get = (k: string, L: SpriteLight): FakeCanvas => {
    const sp = spriteFor('rig-test|' + k, L, 1.3, 2, 52, 56, 26, 42, (gc) => {
      (gc as unknown as { cv: FakeCanvas }).cv.paints++;
      return null;
    });
    return sp.c as unknown as FakeCanvas;
  };
  it('a hit paints nothing; a one-step light change repaints at most SPRITE_REPAINTS a frame in place, the rest blitted a step off', () => {
    g.document = {
      createElement: (): FakeCanvas => {
        made++;
        const cv: FakeCanvas = { width: 0, height: 0, paints: 0, getContext: () => ({ ...ctx2d, cv }) };
        return cv;
      },
    };
    try {
      const day: SpriteLight = { l: 24, a: 0, t: 204 }, step: SpriteLight = { l: 23, a: 0, t: 204 }, far: SpriteLight = { l: 21, a: 0, t: 204 };
      const N = 30;
      spriteFrame(1000);
      const first = Array.from({ length: N }, (_, i) => get('f' + i, day));
      expect(made).toBe(N);
      expect(first.every((c) => c.paints === 1)).toBe(true);
      spriteFrame();
      for (let i = 0; i < N; i++) expect(get('f' + i, day)).toBe(first[i]); // hits
      expect(first.every((c) => c.paints === 1)).toBe(true);
      // the light steps: frame by frame, at most SPRITE_REPAINTS repaints, on the same canvases (no new canvas)
      let frames = 0;
      while (first.some((c) => c.paints < 2)) {
        spriteFrame();
        const before = first.reduce((s, c) => s + c.paints, 0);
        for (let i = 0; i < N; i++) expect(get('f' + i, step)).toBe(first[i]);
        expect(first.reduce((s, c) => s + c.paints, 0) - before).toBeLessThanOrEqual(SPRITE_REPAINTS);
        frames++;
        expect(frames).toBeLessThan(N);
      }
      expect(frames).toBe(Math.ceil(N / SPRITE_REPAINTS));
      expect(made).toBe(N);
      // two steps off (a jump of the clock): repainted at once, budget or not; a new key is painted at once
      spriteFrame(0);
      for (let i = 0; i < N; i++) get('f' + i, far);
      expect(first.every((c) => c.paints === 3)).toBe(true);
      get('new', far);
      expect(made).toBe(N + 1);
    } finally {
      if (had) g.document = old;
      else delete g.document;
    }
  });
});

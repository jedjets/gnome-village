// tests/palette.test.ts
// Locks 04 section 4.5 item 1 and 3.1: every key of Palette exists in all three palettes; a string value is a 7-character hex,
// an array value holds only such strings; the 16 primary tokens are present; the three StyleSpecs carry the treatment table.
import { describe, it, expect } from 'vitest';
import { PALETTES, PRIMARY_KEYS, STYLES, STYLE_IDS, mix, shade, toHex, computeAmbientAt, lit, skyRamp } from '../src/render/ambient.ts';

const HEX = /^#[0-9A-F]{6}$/;

function check(v: unknown, path: string, bad: string[]): void {
  if (typeof v === 'string') {
    if (!HEX.test(v)) bad.push(path + '=' + v);
  } else if (Array.isArray(v)) {
    if (v.length === 0) bad.push(path + ' is empty');
    for (const [i, s] of v.entries()) if (typeof s !== 'string' || !HEX.test(s)) bad.push(path + '[' + i + ']=' + String(s));
  } else bad.push(path + ' is not a string or an array');
}

describe('04 4.5 item 1: the three palettes', () => {
  it('A, B and C hold the same keys', () => {
    const keysA = Object.keys(PALETTES.A).sort();
    expect(Object.keys(PALETTES.B).sort()).toEqual(keysA);
    expect(Object.keys(PALETTES.C).sort()).toEqual(keysA);
  });
  it('every value is a 7-character hex or an array of them', () => {
    const bad: string[] = [];
    for (const id of STYLE_IDS) for (const [k, v] of Object.entries(PALETTES[id])) check(v, id + '.' + k, bad);
    expect(bad).toEqual([]);
  });
  it('the 16 primary tokens of 04 3.1 exist (the palette strip, tile 1)', () => {
    expect(PRIMARY_KEYS.length).toBe(16);
    for (const id of STYLE_IDS) for (const k of PRIMARY_KEYS) expect(typeof PALETTES[id][k], id + '.' + k).toBe('string');
  });
  it('the arrays have the counts of 04 3.1: skin 4, hair 6, coat 8, signature 8, trunk 3, pomeranian 3', () => {
    for (const id of STYLE_IDS) {
      const P = PALETTES[id];
      expect(P.skin.length).toBe(4);
      expect(P.hair.length).toBe(6);
      expect(P.coat.length).toBe(8);
      expect(P.signature.length).toBe(8);
      expect(P.trunk.length).toBe(3);
      expect(P.pomeranian.length).toBe(3);
    }
  });
  it('direction A keeps the GV constants it cites (04 3.1)', () => {
    expect(PALETTES.A.lawn).toBe('#9CCB92');
    expect(PALETTES.A.water).toBe('#6FB8DC');
    expect(PALETTES.A.ink).toBe('#736C82');
    expect(PALETTES.A.rose).toBe('#EDA9C4');
    expect(PALETTES.A.lamp).toBe('#F0BE6A');
    expect(PALETTES.A.skin[0]).toBe('#F0DCCB');
  });
});

describe('04 3.2 and 4.5 item 4: the StyleSpecs', () => {
  it('A soft/gradient/gv, B none/flat/none, C ink/wash/paper, with the theme colours of 04 3.2', () => {
    expect(STYLES.A).toMatchObject({ id: 'A', line: 'soft', shading: 'gradient', grain: 'gv', themeColor: '#DCE6EC' });
    expect(STYLES.B).toMatchObject({ id: 'B', line: 'none', shading: 'flat', grain: 'none', themeColor: '#C2E2F3' });
    expect(STYLES.C).toMatchObject({ id: 'C', line: 'ink', shading: 'wash', grain: 'paper', themeColor: '#F7F3EA' });
    for (const id of STYLE_IDS) expect(STYLES[id].palette).toBe(PALETTES[id]);
  });
  it('mix, shade and toHex keep the hex shape and the light pipeline is neutral at midday', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(toHex([255, 0, 16])).toBe('#FF0010');
    computeAmbientAt(0.5, 1);
    expect(lit([100, 150, 200])).toEqual([100, 150, 200]);
    expect(shade('#FFFFFF', 0.5)).toBe('rgb(127,127,127)');
    const [top] = skyRamp(STYLES.A, 0.5);
    expect(toHex(top)).toBe(PALETTES.A.sky);
  });
  it('night keeps 72 % of the blue and 46 % of the red (04 1.7 item 2)', () => {
    computeAmbientAt(0.05, 0);
    const c = lit([100, 100, 100]);
    expect(c[0]).toBeCloseTo(46, 5);
    expect(c[2]).toBeCloseTo(72, 5);
    computeAmbientAt(0.5, 1);
  });
});

describe('register section 4, Crowd palette: palette A Parisian chic as named tokens (04 4.5, 7.1 rule 8)', () => {
  it('10 tops, a stripe, 5 lowers, 4 hats and 2 couple hues, the same in every direction (the style board keeps its coat)', () => {
    for (const id of STYLE_IDS) {
      const P = PALETTES[id];
      expect(P.crowdTop.length).toBe(10);
      expect(P.crowdLow.length).toBe(5);
      expect(P.crowdHat.length).toBe(4);
      expect(P.crowdPair.length).toBe(2);
      expect(P.crowdTop).toEqual(PALETTES.A.crowdTop);
      expect(P.coat.length).toBe(8);
    }
  });
  it('the picked hexes: navy, camel, cream, black, burgundy, bottle green, grey marl, the Breton, trench, cognac', () => {
    const P = PALETTES.A;
    expect(P.crowdTop).toEqual(['#2E4170', '#C29A6B', '#EFE6D2', '#3B3533', '#7E2F45', '#2F5B47', '#A9A6AE', '#F1EADB', '#CDB58E', '#8B5A3C']);
    expect(P.crowdStripe).toBe('#7E2F45'); // burgundy on cream, never navy and white (04 7.4)
    expect(P.crowdLow).toEqual(['#2A3A60', '#3B3533', '#8A8790', '#B48A5E', '#E9E0CC']);
    expect(P.crowdHat).toEqual(['#2A3A60', '#7E2F45', '#B48A5E', '#2F5B47']); // no black beret: the avatars' (04 7.4)
    expect(P.crowdPair).toEqual(['#7E2F45', '#C29A6B']);
    expect(P.matchmakerBlue).not.toBe(P.crowdStripe);
  });
});

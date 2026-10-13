// tests/strings.test.ts
// Locks register 3.12 and 03 section 12 item 8: EN and ES hold the same keys; every key the code and the DOM ask for exists; the park tools'
// keys of S3 (06 16.5, 16.12, 16.13) with 06's English copied exactly.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../src/ui/strings/en.ts';
import { es } from '../src/ui/strings/es.ts';
import { gender, t, plural, setLang } from '../src/ui/i18n.ts';
import { TOOLS } from '../src/play/tools.ts';
import { DOING } from '../src/entities/act.ts';

const ROOT = join(import.meta.dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('string tables', () => {
  it('en and es have identical key sets', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it('no empty values', () => {
    for (const [k, v] of Object.entries(en)) expect(v.length, k).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(es)) expect(v.length, k).toBeGreaterThan(0);
  });
  it('every t(\'literal\') and plural(\'literal\') in src/ and every data-t in index.html exists in en', () => {
    const missing: string[] = [];
    for (const f of walk(join(ROOT, 'src'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([^']+)'[,)]/g)) if (!(m[1] as string in en)) missing.push(m[1] as string);
      for (const m of src.matchAll(/\bplural\('([^']+)'/g)) {
        for (const suffix of ['.one', '.other']) if (!(m[1] + suffix in en)) missing.push(m[1] + suffix);
      }
    }
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    for (const m of html.matchAll(/data-t(?:-aria)?="([^"]+)"/g)) if (!(m[1] as string in en)) missing.push(m[1] as string);
    expect(missing).toEqual([]);
  });
  it('t fills params, formats numbers per language, resolves @keys, returns the key when missing', () => {
    setLang('en');
    expect(t('hud.day', { n: 3, season: '@hud.season.autumn' })).toBe('Day 3 · Autumn');
    expect(plural('sheet.census.room', 1)).toBe('room for 1 more');
    expect(plural('sheet.census.room', 2)).toBe('room for 2 more');
    expect(t('nope.missing')).toBe('nope.missing');
    setLang('es');
    expect(t('hud.day', { n: 3, season: '@hud.season.autumn' })).toBe('Día 3 · Otoño');
    expect(t('rail.speed', { n: 2.5 })).toBe('2,5×');
    setLang('en');
  });
});

/** The EN column of the 06 section 16 tables, by key (`| \`key\` | EN | ES |`). */
function table06(): Map<string, string> {
  const out = new Map<string, string>();
  const md = readFileSync(join(ROOT, 'docs', '06-Content-Tables.md'), 'utf8');
  for (const m of md.matchAll(/^\| `([a-zA-Z0-9_.]+)` \| (.*?) \| (.*?) \|$/gm)) out.set(m[1] as string, m[2] as string);
  return out;
}

// The reason keys of the 03 5.4 tools block (02 8.4, 8.2, 8.5); 06 16.13 holds their wording.
const TOOL_REASONS = [
  'outside', 'gateway', 'on_water', 'taken', 'on_flowers', 'near_railings', 'lawn_only', 'not_here', 'has_bandstand', 'enough_kiosks',
  'not_on_water', 'someone_on_it', 'too_wide', 'straight_line', 'run_too_long', 'nothing_to_undo', 'park_full_props',
].map((k) => 'reason.' + k);

describe('the park tools\' strings (03 5.4 tools block; 06 16.5, 16.12, 16.13; 07 S3.6 item 12; 08 2.7)', () => {
  it('every tool has its label and hint, every tools reason, toast.undone, the New confirm and Continue, in both tables', () => {
    expect(TOOLS).toHaveLength(16);
    const keys = [
      ...TOOLS.flatMap((d) => [d.labelKey, d.hintKey]), ...TOOL_REASONS, 'toast.undone', 'confirm.new_park', 'confirm.yes', 'confirm.no', 'intro.continue',
    ];
    expect(keys).toHaveLength(54);
    for (const k of keys) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
    }
  });
  it('the English wording is 06\'s, copied exactly', () => {
    const doc = table06();
    const keys = [...TOOLS.flatMap((d) => [d.labelKey, d.hintKey]), ...TOOL_REASONS, 'toast.undone', 'confirm.new_park', 'confirm.yes', 'confirm.no', 'intro.continue'];
    for (const k of keys) expect(en[k], k).toBe(doc.get(k));
  });
  it('every reason key written in src/ exists in en', () => {
    const missing: string[] = [];
    for (const f of walk(join(ROOT, 'src'))) {
      if (f.includes(join('ui', 'strings'))) continue;
      for (const m of readFileSync(f, 'utf8').matchAll(/'(reason\.[a-z_]+)'/g)) if (!(m[1] as string in en)) missing.push(m[1] as string);
    }
    expect(missing).toEqual([]);
  });
});

describe('the doing lines and the park\'s feed lines (06 16.9, 16.11; 03 2.5 act.ts DOING; S4 part B)', () => {
  const keys = [
    ...DOING.map((st) => 'doing.' + st), 'doing.perch', 'doing.peck', 'doing.scatter', 'feed.gardener', 'feed.pigeons', 'feed.regular_return',
  ];
  it('every state act.ts runs, the pigeon\'s states and the three feed lines have a key in both tables', () => {
    expect(keys).toHaveLength(DOING.length + 6);
    for (const k of keys) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
    }
  });
  it('the English wording is 06\'s, copied exactly', () => {
    const doc = table06();
    for (const k of keys) expect(en[k], k).toBe(doc.get(k));
  });
});

describe('the visitors on screen: card, census, archetypes and ages (06 16.3, 16.4, 16.8, 16.10; 08 2.7; S4 part C)', () => {
  const ARCH = ['single', 'couple', 'family', 'child', 'elder', 'tourist', 'jogger', 'artist', 'busker', 'dogwalker', 'gardener', 'vendor', 'cameo'];
  const keys = [
    ...ARCH.map((a) => 'archetype.' + a), 'age.young', 'age.grown', 'age.elder', 'card.sub', 'card.rel.single.f', 'card.rel.single.m',
    'card.rel.with', 'card.rel.family', 'card.rel.child', 'card.rel.staff', 'card.rel.visiting', 'sheet.census.summary', 'sheet.census.row',
    'sheet.census.partner',
  ];
  it('every key the card, the census and the chip use is in both tables, the chip\'s count in its two plural forms', () => {
    for (const k of [...keys, 'hud.visitors.one', 'hud.visitors.other', 'sheet.census.room.one', 'sheet.census.room.other']) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
    }
  });
  it('the English wording is 06\'s, copied exactly', () => {
    const doc = table06();
    for (const k of keys) expect(en[k], k).toBe(doc.get(k));
  });
  it('plural and gender pick their forms (08 2.7: sheet.census.room, card.rel.single)', () => {
    setLang('en');
    expect(plural('hud.visitors', 1)).toBe('1 visitor');
    expect(plural('hud.visitors', 30)).toBe('30 visitors');
    expect(gender('card.rel.single', 'f')).toBe(en['card.rel.single.f']);
    setLang('es');
    expect(gender('card.rel.single', 'f')).toBe('soltera, buscando');
    expect(gender('card.rel.single', 'm')).toBe('soltero, buscando');
    expect(t('card.sub', { archetype: '@archetype.elder', age: '@age.elder' })).toBe('mayor · mayor');
    setLang('en');
  });
});

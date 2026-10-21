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
import { ABILITIES } from '../src/play/abilities.ts';
import { AVATAR_SIDE } from '../src/core/commands.ts';

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

/** The ES column of the 06 section 16 tables, by key; a TODO cell is not a wording yet. */
function table06es(): Map<string, string> {
  const out = new Map<string, string>();
  const md = readFileSync(join(ROOT, 'docs', '06-Content-Tables.md'), 'utf8');
  for (const m of md.matchAll(/^\| `([a-zA-Z0-9_.]+)` \| (.*?) \| (.*?) \|$/gm)) if (m[3] !== 'TODO') out.set(m[1] as string, m[3] as string);
  return out;
}

describe('the Options sheet and rail row 3\'s Options (register 3.10 and section 4 "Park pace and Options"; 06 16.10; 02 12.4)', () => {
  // the keys of 06 16.10's Options rows, which the sheet uses
  const SHEET = [
    'sheet.options.title', 'sheet.options.pace', 'sheet.options.pace.calm', 'sheet.options.pace.calm_hint', 'sheet.options.pace.lively',
    'sheet.options.pace.lively_hint', 'sheet.options.language', 'sheet.options.sound', 'sheet.options.speed', 'sheet.options.seed',
    'sheet.options.sound_check', 'sheet.options.perf', 'sheet.options.on', 'sheet.options.off',
  ];
  // the keys this stage defines that 06 has no row for yet (hand-back: Assumptions)
  const NEW = ['rail.options', 'aria.options', 'sheet.options.lang_en', 'sheet.options.lang_es', 'sheet.options.speed_hint', 'toast.sound_check_later'];
  it('every key of the sheet, the button and its aria-label is in both tables, with the same {params}', () => {
    for (const k of [...SHEET, ...NEW, 'aria.sheet_options']) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
      expect([...(es[k] as string).matchAll(/\{(\w+)\}/g)].map((m) => m[1]), k).toEqual([...(en[k] as string).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    }
  });
  it('the English wording is 06\'s, copied exactly, and so is the Spanish of the five pace rows the Pace stage wrote', () => {
    const doc = table06(), docEs = table06es();
    for (const k of SHEET) expect(en[k], k).toBe(doc.get(k));
    const pace = SHEET.filter((k) => k.startsWith('sheet.options.pace'));
    expect(pace).toHaveLength(5);
    for (const k of pace) expect(es[k], k).toBe(docEs.get(k));
  });
  it('the seed fills in both languages', () => {
    setLang('es');
    expect(t('sheet.options.seed', { seed: '101' })).toBe('Semilla del parque 101');
    setLang('en');
    expect(t('sheet.options.seed', { seed: '101' })).toBe('Park seed 101');
  });
});

describe('the abilities, the unlocks and the Progress sheet (06 16.2, 16.6, 16.10-16.13; 07 S6.6 step 11; S6)', () => {
  // the reason keys of 03 5.4's ability block, as 06 16.13 words them
  const REASONS = [
    'locked', 'cooldown', 'no_charges', 'apart', 'on_the_water', 'no_lamp', 'not_raining', 'raining', 'not_evening', 'pond_small', 'iced', 'slippery',
    'busker_near', 'dog_saw_it', 'no_wasps_rain', 'in_sunbeam', 'already_misty', 'nobody_inside', 'not_at_picnic', 'no_item', 'peel_here', 'busy',
    'too_many_effects', 'not_children', 'enough_today', 'not_courting',
  ].map((k) => 'reason.' + k);
  const KEYS = [
    ...ABILITIES.flatMap((a) => [a.nameKey, a.hintKey, 'feed.cast.' + a.id]), ...Object.keys(AVATAR_SIDE).map((id) => 'avatar.' + id + '.name'),
    ...['fountain', 'pond', 'bandstand', 'bridge', 'lawn', 'path'].map((k) => 'spot.' + k), ...REASONS,
    'rail.locked_at', 'rail.tier', 'rail.cooldown', 'rail.charges', 'rail.ready', 'sheet.progress.title', 'sheet.progress.cupid', 'sheet.progress.mischief',
    'sheet.progress.points', 'sheet.progress.next', 'sheet.progress.done', 'feed.unlock', 'toast.unlocked',
  ];
  const params = (v: string): string[] => [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
  it('every ability has its name, hint and cast line, every avatar its name, every refusal its words, in both tables with the same {params}', () => {
    expect(KEYS.length).toBe(19 * 3 + 6 + 6 + REASONS.length + 13);
    for (const k of KEYS) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
      expect(params(es[k] as string), k).toEqual(params(en[k] as string));
    }
  });
  it('the English wording is 06\'s, copied exactly, and so is the Spanish the stage wrote into 06', () => {
    const doc = table06(), docEs = table06es();
    for (const k of KEYS) {
      if (doc.has(k)) expect(en[k], k).toBe(doc.get(k));
      if (docEs.has(k)) expect(es[k], k).toBe(docEs.get(k));
    }
    for (const k of KEYS.filter((x) => x.startsWith('ability.') || x.startsWith('feed.cast.'))) expect(docEs.get(k), k).toBeTruthy();
  });
  it('the unlock toast and the feed line fill in the item, the side and the tier, the item and the side being keys of their own (03 12 item 6)', () => {
    setLang('en');
    expect(t('toast.unlocked', { item: '@ability.c_musician.name', side: '@hud.cupid', tier: 1 })).toBe('Unlocked: Musician (Cupid T1)');
    expect(t('feed.unlock', { item: '@avatar.a_florist.name', side: '@hud.cupid', tier: 1 })).toBe('Unlocked: Flower seller (Cupid T1)');
    expect(t('reason.locked', { side: '@hud.mischief', tier: 1 })).toBe('Unlocks at Mischief T1');
    setLang('es');
    expect(t('toast.unlocked', { item: '@ability.m_peel.name', side: '@hud.mischief', tier: 1 })).toBe('Desbloqueado: Cáscara de plátano (Travesura T1)');
    expect(t('feed.cast.c_petals', { spot: '@spot.fountain' })).toBe('Cayeron pétalos por la fuente');
    setLang('en');
  });
  it('the UI stage\'s strings (07 S6.6 steps 6-9): the strips, the locked toast, the chip, the Progress sheet, in both tables with the same {params}', () => {
    const ui = [
      'rail.locked_at', 'rail.tier', 'rail.cooldown', 'rail.charges', 'rail.ready', 'rail.soon', 'rail.pick', 'rail.cupid', 'rail.mischief', 'hud.cupid', 'hud.mischief',
      'sheet.progress.title', 'sheet.progress.cupid', 'sheet.progress.mischief', 'sheet.progress.points', 'sheet.progress.points.one',
      'sheet.progress.points.other', 'sheet.progress.next', 'sheet.progress.done', 'sheet.progress.unlocks', 'sheet.progress.avatar', 'feed.tally', 'feed.unlock', 'toast.unlocked', 'reason.cooldown', 'reason.locked', 'aria.points',
      'aria.sheet_progress', 'aria.group_cupid', 'aria.group_mischief',
    ];
    for (const k of ui) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
      expect(params(es[k] as string), k).toEqual(params(en[k] as string));
    }
    setLang('en');
    expect(t('rail.locked_at', { side: '@rail.cupid', tier: 2 })).toBe('Unlocks at Cupid T2');
    expect(t('sheet.progress.next', { item: '@ability.c_umbrella.name', n: 20 })).toBe('Next: Umbrella at 20');
    expect(t('sheet.progress.avatar', { name: '@avatar.a_pigeon.name' })).toBe('Avatar: Pigeon');
    expect(t('reason.cooldown', { s: 12 })).toBe('not yet (12 s)');
    expect(plural('sheet.progress.points', 1, { tier: 0 })).toBe('1 point · T0');
    expect(plural('sheet.progress.points', 12, { tier: 1 })).toBe('12 points · T1');
    setLang('es');
    expect(plural('sheet.progress.points', 1, { tier: 0 })).toBe('1 punto · T0');
    expect(plural('sheet.progress.points', 0, { tier: 0 })).toBe('0 puntos · T0');
    expect(t('rail.locked_at', { side: '@rail.mischief', tier: 3 })).toBe('Se abre en Travesura T3');
    expect(t('sheet.progress.next', { item: '@ability.c_umbrella.name', n: 20 })).toBe(`Siguiente: ${es['ability.c_umbrella.name']} a los 20`);
    expect(t('feed.tally', { cp: 3, mp: 1 })).toBe('Hoy: Cupido 3 · Travesura 1');
    setLang('en');
  });
});

describe('the avatar mode\'s UI strings (07 S7.6 steps 6-7; 02 10.1, 12.3 item 4, 12.4; 04 5.4 item 6, 5.6; S7 UI stage)', () => {
  // every key the picker, the hint chips, the strip and the toasts of the avatar mode ask for: names, hints, statuses, the mode words
  const params = (v: string): string[] => [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
  const ids = Object.keys(AVATAR_SIDE);
  const keys = [
    ...ids.flatMap((id) => [`avatar.${id}.name`, `avatar.${id}.hint1`, `avatar.${id}.hint2`, `avatar.${id}.hint3`]),
    'avatar.side_tier', 'avatar.says', 'avatar.busy', 'avatar.goes_on', 'avatar.you', 'avatar.waiting', 'avatar.intro', 'sheet.picker.title',
    'sheet.picker.sum', 'sheet.picker.locked', 'rail.be_someone', 'rail.creator', 'rail.soon', 'rail.locked_at', 'aria.mode', 'aria.sheet_picker',
    'aria.avatar_hints', 'reason.busy', 'reason.startled', 'reason.not_children', 'reason.basket_empty', 'reason.not_courting', 'reason.no_item',
    'reason.cooldown', 'reason.enough_today',
  ];
  it('every one is in both tables with the same {params}, and the cascade statuses of 06 16.7 as well', () => {
    const statuses = Object.keys(en).filter((k) => k.startsWith('avatar.status.'));
    expect(statuses.length).toBeGreaterThanOrEqual(24);
    for (const k of [...keys, ...statuses]) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
      expect(params(es[k] as string), k).toEqual(params(en[k] as string));
    }
  });
  it('the toasts and the strip read as the owner\'s design says, in English and in Spanish', () => {
    setLang('en');
    expect(t('avatar.intro', { name: '@avatar.a_pigeon.name', hint: '@avatar.a_pigeon.hint1' })).toBe('Playing as Pigeon. Tap someone: swoop');
    expect(t('avatar.says', { name: '@avatar.a_pigeon.name', what: '@avatar.status.swooping' })).toBe('Pigeon: swooping');
    expect(t('avatar.busy', { name: '@avatar.a_pigeon.name' })).toBe('Pigeon: busy');
    expect(t('avatar.goes_on', { name: '@avatar.a_pomeranian.name' })).toBe('Pomeranian goes on alone');
    expect(t('avatar.you', { name: 'Violette' })).toBe('Violette · you');
    expect(t('avatar.side_tier', { side: '@rail.cupid', tier: 1 })).toBe('Cupid · T1');
    expect(t('sheet.picker.locked', { side: '@rail.cupid', tier: 1 })).toBe('Locked\u00a0· Cupid\u00a0T1');
    expect(en['avatar.waiting']).toBe('waiting for your tap');
    setLang('es');
    expect(t('avatar.intro', { name: '@avatar.a_pigeon.name', hint: '@avatar.a_pigeon.hint1' })).toBe('Juegas como Paloma. Toca a alguien: en picado');
    expect(t('avatar.says', { name: '@avatar.a_pigeon.name', what: '@avatar.status.swooping' })).toBe('Paloma: en picado');
    expect(t('avatar.busy', { name: '@avatar.a_pigeon.name' })).toBe('Paloma: ocupado');
    expect(t('avatar.you', { name: '@avatar.a_pigeon.name' })).toBe('Paloma · tú');
    expect(t('sheet.picker.locked', { side: '@rail.mischief', tier: 1 })).toBe('Bloqueado\u00a0· Travesura\u00a0T1');
    expect(es['avatar.waiting']).toBe('esperando tu toque');
    setLang('en');
  });
});

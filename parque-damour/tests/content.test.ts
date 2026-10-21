// tests/content.test.ts
// Locks the register's spellings, section 3 and section 5, to the code (08 2.7 content.test.ts rows; 07 S6.7 item 4; brief 9 row 11): the 16
// tool ids, the 19 ability ids, the 6 avatar ids, the 7 stage names, the 10 embarrassment kinds, the 8 weather kinds, the 11 displayed
// archetype names, the sides, the endings and the game's name; TIERS and the caps of 06 1.4 equal their values.
import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLang } from '../src/ui/i18n.ts';
import { en } from '../src/ui/strings/en.ts';
import { es } from '../src/ui/strings/es.ts';
import { ABILITY_IDS, AVATAR_SIDE, LOG_CAP } from '../src/core/commands.ts';
import { WEATHER_KINDS, CAP_OVERRIDES } from '../src/core/weather.ts';
import { ABILITIES, CAP_EFFECTS } from '../src/play/abilities.ts';
import { TIERS, UNLOCKS } from '../src/play/progression.ts';
import { CAP_BANDSTANDS, CAP_KIOSKS, CAP_PROPS_SOFT, CAP_RUN_TILES, TOOLS, TOOL_IDS } from '../src/play/tools.ts';
import { UNDO_DEPTH } from '../src/play/undo.ts';
import { EMB_CAP_DAY, EMB_KINDS } from '../src/entities/embarrass.ts';
import { CAP_ARTISTS, CAP_AI_BUSKERS, CAP_DOGWALKERS, CAP_PEOPLE } from '../src/entities/visitor.ts';
import { CAP_DOGS, CAP_PIGEONS, CAP_PIGEONS_PER_CRUMBS } from '../src/entities/creatures.ts';
import { CAP_BLOCKED_MEMORY } from '../src/entities/move.ts';
import { ASTAR_NODES } from '../src/entities/astar.ts';
import { FEED_CAP } from '../src/ui/feed.ts';
import { STAGE_IDS } from '../src/entities/romance.ts';

beforeEach(() => setLang('en'));

describe('the register\'s ids, exactly as spelled (register 3.7, 3.8, 5; brief 9 row 11)', () => {
  it('16 tool ids, in the order of register 3.7', () => {
    const ids = ['hand', 'path', 'lawn', 'bed', 'hedge', 'tree', 'pond', 'canal', 'bridge', 'bench', 'picnic', 'lamp', 'fountain', 'kiosk', 'bandstand', 'remove'];
    expect([...TOOL_IDS]).toEqual(ids);
    expect(TOOLS.map((d) => d.id)).toEqual(ids);
    expect(TOOL_IDS).not.toContain('statue' as never); // a tool nobody may add (AGENTS 5 item 7)
  });
  it('19 ability ids, 9 Cupid then 10 Mischief, in the order of register 3.8', () => {
    const ids = [
      'c_petals', 'c_bouquet', 'c_musician', 'c_sunbeam', 'c_umbrella', 'c_lamplight', 'c_picnic', 'c_rowboat', 'c_fireworks',
      'm_pigeon', 'm_sprinkler', 'm_peel', 'm_pomeranian', 'm_wasp', 'm_raincloud', 'm_rival', 'm_mime', 'm_fog', 'm_flock',
    ];
    expect([...ABILITY_IDS]).toEqual(ids);
    expect(ABILITIES.map((a) => a.id)).toEqual(ids);
    expect(UNLOCKS.cupid.flatMap((r) => r.abilities).concat(UNLOCKS.mischief.flatMap((r) => r.abilities)).sort()).toEqual([...ids].sort());
  });
  it('6 avatar ids and the side each plays for (register 3.8)', () => {
    expect(Object.keys(AVATAR_SIDE)).toEqual(['a_pigeon', 'a_pomeranian', 'a_mime', 'a_florist', 'a_busker', 'a_matchmaker']);
    expect(Object.values(AVATAR_SIDE)).toEqual(['mischief', 'mischief', 'mischief', 'cupid', 'cupid', 'cupid']);
    expect(UNLOCKS.cupid.map((r) => r.avatar)).toEqual([null, 'a_florist', 'a_busker', 'a_matchmaker', null]);
    expect(UNLOCKS.mischief.map((r) => r.avatar)).toEqual(['a_pigeon', 'a_pomeranian', null, 'a_mime', null]);
  });
  it('7 stage names, through t(\'stage.*\') in English', () => {
    expect(STAGE_IDS.slice(1)).toEqual(['notice', 'chat', 'bench', 'stroll', 'picnic', 'kiss', 'proposal']);
    expect(STAGE_IDS.slice(2).map((id) => t('stage.' + id))).toEqual(['Chat', 'Bench', 'Stroll', 'Picnic', 'Kiss', 'Proposal']);
    expect(['notice', 'chat', 'bench', 'stroll', 'picnic', 'kiss', 'proposal'].map((id) => t('stage.' + id))).toEqual([
      'Notice', 'Chat', 'Bench', 'Stroll', 'Picnic', 'Kiss', 'Proposal',
    ]);
  });
  it('10 embarrassment kinds (register 5) and 8 weather kinds (register 3.2)', () => {
    expect([...EMB_KINDS]).toEqual(['poop', 'soaked', 'trip', 'snatched', 'wasp', 'drenched', 'rival', 'mime', 'fog', 'flock']);
    expect([...WEATHER_KINDS]).toEqual(['clear', 'fair', 'cloudy', 'breeze', 'rain', 'shower', 'mist', 'snow']);
  });
  it('11 displayed archetype names in English (register 3.4), and the endings, modes and title (register 5)', () => {
    const ids = ['single', 'couple', 'family', 'elder', 'tourist', 'jogger', 'artist', 'busker', 'dogwalker', 'gardener', 'vendor'];
    expect(ids.map((id) => t('archetype.' + id))).toEqual([
      'single', 'couple', 'family', 'elder', 'tourist', 'jogger', 'artist', 'busker', 'dog walker', 'gardener', 'vendor',
    ]);
    expect([t('ending.happily'), t('ending.parted')]).toEqual(['Happily', 'Parted']);
    expect([t('hud.cupid'), t('hud.mischief'), t('rail.cupid'), t('rail.mischief')]).toEqual(['Cupid', 'Mischief', 'Cupid', 'Mischief']);
    expect([t('rail.creator'), t('rail.be_someone'), t('intro.title')]).toEqual(['Creator', 'Be someone', "Parque D'Amour"]);
  });
  it('the 19 abilities and 6 avatars have their names in both languages, none left as a key', () => {
    for (const a of ABILITIES) for (const k of [a.nameKey, a.hintKey, 'feed.cast.' + a.id]) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
      if (k !== 'ability.m_rival.name') expect(es[k], k).not.toBe(en[k]); // translated, not copied ("Rival" is the same word in Spanish)
    }
    for (const id of Object.keys(AVATAR_SIDE)) expect(es['avatar.' + id + '.name'], id).toBeTruthy();
    expect(t('ability.m_pigeon.name')).toBe('Pigeon');
    setLang('es');
    expect(t('ability.c_petals.name')).toBe('Pétalos');
  });
});

describe('the tiers and the caps (06 1.4, 1.7; register 3.3, 3.6; 03 3.11)', () => {
  it('TIERS equals 0, 8, 20, 40, 70', () => {
    expect([...TIERS]).toEqual([0, 8, 20, 40, 70]);
  });
  it('the cap constants equal their values', () => {
    expect([CAP_PEOPLE, CAP_PIGEONS, CAP_DOGS, CAP_EFFECTS, CAP_OVERRIDES, CAP_PROPS_SOFT, FEED_CAP, LOG_CAP, UNDO_DEPTH]).toEqual([30, 12, 4, 64, 16, 600, 40, 600, 10]);
    expect([CAP_KIOSKS, CAP_BANDSTANDS, CAP_RUN_TILES, EMB_CAP_DAY]).toEqual([3, 1, 14, 3]);
    expect([CAP_ARTISTS, CAP_AI_BUSKERS, CAP_DOGWALKERS, CAP_PIGEONS_PER_CRUMBS, CAP_BLOCKED_MEMORY, ASTAR_NODES]).toEqual([1, 1, 2, 5, 8, 2600]);
  });
});

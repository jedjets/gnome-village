// tools/shot-s6.mjs
// The 's6' scene set of tools/shot.mjs (07 S6.7 item 5; the UI stage of S6), split out so shot.mjs does not grow past its 771 lines. Every
// step is a real tap or click (puppeteer's mouse at __PD.screenOf of a tile or a head point, the rail's and the chip's buttons); the
// harness is read, and sets only the two things a player earns by playing: the visitors' time of day (simulate) and the points of the
// Progress shot (setProgress, as the det-s6 fixture does).
//   cupid-strip      the Cupid group at the start: c_petals and c_bouquet open (a swatch in --berry), nothing armed, row 2 "Pick an ability"
//   cupid-strip-mid  the same strip scrolled 150 px: the T1 and T2 pills dimmed with their tier badges
//   locked           a tap on the locked Musician pill: the toast "Unlocks at Cupid T1" (the one shot with #hint shown)
//   cupid-strip-end  the strip scrolled to its end: the T3 and T4 badges
//   cooldown         day 1 at midday with the 22 visitors of the s4 crowd: the Mischief group, m_pigeon armed and tapped on an adult, applied by
//                    a real unpause, five sim seconds on: the chip with its name, the ring a fifth gone and the seconds left
//   petals           the Cupid group, c_petals armed and tapped on a free lawn tile, applied by a real unpause: PETALS = 1 on the 3 x 3 tints the
//                    ground, the aim square (alpha 0.25, rose) stands over it, and the sparkle flurry (the S6 art: soft round petals, gold twinkles,
//                    the dashed rose outline) is falling and lying 1.1 s after the cast
//   sprinkler        (S6 art) m_sprinkler on a lawn tile with a woman in the 3 x 3: the pop-up rotary and its spray 2 s in, her dog shake (soaked 3)
//   peel             a woman plopping on the half-peeled banana (fall 3, the dust poof) with a second peel ahead on the west spoke
//   pigeon           two women: one with the pigeon diving at her (swoop 1) and one a moment after the landing, the paper dollop on her beret (splat 3)
//   pomeranian       Pompon running for the west gate in his dust cloud with a baguette in his mouth, the owner chasing with both arms up
//   florist          the flower seller (the basket) handing a bouquet to a pair on the north loop (c_bouquet)
//   busker           the busker standing with his accordion, his cap with coins on the path and his notes rising (c_musician)
//   progress         the Points chip at 14 | 23 and the Progress sheet: both ladders, the ticks, the next unlock
//   progress-table   the same sheet scrolled to the unlock table
//   rail-320, progress-320   a 320 x 568 phone: the Mischief group with m_pigeon armed (the tallest rail), then the Progress sheet capped between
//                    the chips and the rail
//   rail-320-es, progress-320-es   the same two in Spanish (ES tapped in the Options sheet): "En pausa" is wider than "Paused", and the rail
//                    must still be two lines in row 3 and under 40 % of the screen (the layout check of shot.mjs fails the run otherwise)
export const S6_SCENES = [
  { name: 'cupid-strip', turn: 0, z: 1.3, act: 's6Cupid' },
  { name: 'cupid-strip-mid', keep: true, act: 's6StripMid' },
  { name: 'locked', keep: true, act: 's6Locked' },
  { name: 'cupid-strip-end', keep: true, act: 's6StripEnd' },
  { name: 'cooldown', turn: 0, z: 1.8, at: [22.5, 25.2], abs: 0.552, pre: 'callCrowd', act: 's6Pigeon' },
  { name: 'petals', turn: 0, z: 2.8, at: [25, 33], act: 's6Petals', fx: 66 },
  { name: 'sprinkler', turn: 0, z: 3.0, at: [14.4, 26.4], act: 's6Sprinkler', fx: 1 },
  { name: 'peel', turn: 0, z: 3.0, at: [5.5, 23], act: 's6Peel', fx: 1 },
  { name: 'pigeon', turn: 0, z: 3.2, at: [23.2, 28.2], act: 's6PigeonArt', fx: 1 },
  { name: 'pomeranian', turn: 0, z: 3.0, at: [5.2, 25], act: 's6Pom', fx: 1 },
  { name: 'florist', turn: 0, z: 3.4, at: [25.6, 17.6], act: 's6Florist', fx: 1 },
  { name: 'busker', turn: 0, z: 3.0, at: [25, 17], act: 's6Busker', fx: 1 },
  { name: 'progress', keep: true, act: 's6Progress' },
  { name: 'progress-table', keep: true, act: 's6ProgressTable' },
  { name: 'rail-320', vp: [320, 568], turn: 0, z: 1.3, act: 's6Small' },
  { name: 'progress-320', keep: true, act: 's6SmallProgress' },
  { name: 'rail-320-es', keep: true, act: 's6SmallEs' },
  { name: 'progress-320-es', keep: true, act: 's6SmallProgress' },
];

/** The S5 art scenes (register section 4 "S6 art and S5 poses": Notice 2, Bench 2, the featured pair's ring 3), appended to the s5 set. */
export const S5_ART_SCENES = [
  { name: 'notice', turn: 0, z: 3.0, at: [26, 17.5], abs: 0.58, act: 's5Notice', fx: 30 },
  { name: 'bench', turn: 0, z: 3.0, at: [20, 27.2], act: 's5BenchArt', fx: 30 },
  { name: 'ring', turn: 0, z: 1.3, at: [24, 21], abs: 0.78, pre: 'callCrowd', act: 's5Ring', fx: 30 },
  { name: 'ring-fit', turn: 0, fit: true, fx: 30 },
  { name: 'ring-night', turn: 0, z: 1.3, at: [24, 21], abs: 0.9, fx: 30 },
];

/** `h`: the helpers shot.mjs owns (tapTile, runBriefly, sleep, s5Pair, s5Until). Returns the scene actions of the set. */
export function s6Actions(h) {
  const { tapTile, runBriefly, sleep, s5Pair, s5Until } = h;
  /** In the page: a visitor of `arch` standing at (x, y) (a woman or a man), idle and untroubled; returns its id. */
  const place = (page, arch, sex, x, y, items = {}) =>
    page.evaluate(async (arch, sex, x, y, items) => {
      const V = await import('/src/entities/visitor.ts');
      const v = V.spawnVisitor(arch, 'g_west', { sex, seeks: sex === 'f' ? 'm' : 'f' });
      Object.assign(v, { x, y, path: null, st: 'idle', t: 0, hunger: 0.2, energy: 0.9, comfort: 0.9, leaveAt: 99, decideT: 9999, job: {} });
      Object.assign(v.items, { hat: false, purse: false, baguette: false, iceCream: false }, items);
      return v.id;
    }, arch, sex, x, y, items);
  /** The abilities' cooldowns back to ready, as a restore with none saved does (the casts of earlier shots must not hold the next one off);
   *  `clear` also ends every effect of an earlier shot (its sprinkler, its peel), the props of which the next step sweeps. */
  const ready = (page, clear = true) =>
    page.evaluate(async (clear) => {
      const A = await import('/src/play/abilities.ts');
      A.setAbilitiesState(clear ? [] : A.effectsState(), { ...A.sidesState(), cooldowns: { park: {}, cupid: {}, mischief: {} } });
      if (clear) window.__PD.simulate(1);
    }, clear);
  /** The camera (quarter turn 0, the scene's zoom) on the world point (x, y). */
  const focus = (page, x, y) =>
    page.evaluate((x, y) => {
      const c = window.__PD.cam;
      c.ox = -((x - 23.5) - (y - 23.5)) * 13 * c.z;
      c.oy = -((x - 23.5) + (y - 23.5)) * 6.5 * c.z;
      c.free = true;
    }, x, y);
  const group = async (page, g) => {
    await page.click(`#groups [data-group="${g}"]`);
    await page.waitForFunction((k) => document.querySelector(`#groups [data-group="${k}"]`)?.getAttribute('aria-pressed') === 'true', { timeout: 5_000 }, g);
  };
  const hideHint = (page) => page.evaluate(() => (document.getElementById('hint').style.visibility = 'hidden'));
  const closeSheet = async (page, id) => {
    if (await page.$eval('#' + id, (el) => el.classList.contains('on'))) await page.click(`#${id} .x`);
  };
  return {
    /** The player's view (body.dev off), the Cupid group: 9 pills, the first two open and the rest locked. */
    async s6Cupid(page) {
      await page.evaluate(() => document.body.classList.remove('dev'));
      await group(page, 'cupid');
      const st = await page.$$eval('#tools .tool', (els) => els.map((b) => b.dataset.id + (b.classList.contains('locked') ? ':locked' : '')));
      const want = ['c_petals', 'c_bouquet', 'c_musician:locked', 'c_sunbeam:locked', 'c_umbrella:locked', 'c_lamplight:locked', 'c_picnic:locked', 'c_rowboat:locked', 'c_fireworks:locked'];
      if (JSON.stringify(st) !== JSON.stringify(want)) throw new Error(`s6 cupid strip: want ${JSON.stringify(want)}, got ${JSON.stringify(st)}`);
    },
    async s6StripMid(page) {
      await page.$eval('#tools', (el) => {
        el.scrollLeft = 150;
        el.dispatchEvent(new Event('scroll'));
      });
      await sleep(300);
    },
    async s6StripEnd(page) {
      await hideHint(page);
      await page.$eval('#tools', (el) => {
        el.scrollLeft = el.scrollWidth;
        el.dispatchEvent(new Event('scroll'));
      });
      await sleep(300);
    },
    /** A real tap on the locked Musician pill: the toast, nothing armed. */
    async s6Locked(page) {
      await page.evaluate(() => (document.getElementById('hint').style.visibility = ''));
      await page.click('.tool[data-id="c_musician"]');
      await page.waitForFunction(() => document.getElementById('hint').textContent === 'Unlocks at Cupid T1' && document.getElementById('hint').classList.contains('on'), { timeout: 5_000 });
      if (await page.evaluate(() => document.querySelector('#tools .tool[aria-pressed="true"]') !== null)) throw new Error('s6 locked: a locked pill armed');
      await sleep(400); // the toast fades in over .3 s
    },
    /** m_pigeon armed, a real tap on an adult with no one close by, applied by a real unpause, five sim seconds on: the chip counts down. */
    async s6Pigeon(page) {
      await hideHint(page);
      await group(page, 'mischief');
      await page.click('.tool[data-id="m_pigeon"]');
      const p = await page.evaluate(() => {
        const pd = window.__PD, z = pd.cam.z;
        const pts = pd.visitors
          .filter((v) => v.archetype !== 'child' && v.archetype !== 'cameo')
          .map((v) => {
            const seat = v.sitPropId ? pd.props.find((q) => q.id === v.sitPropId) : null;
            const e = seat ? ({ bench: 0.2, table: 0.3 })[seat.kind] ?? 0 : 0;
            const s = pd.screenOf(v.x, v.y, e);
            return { x: s.x, y: s.y - 8 * z, id: v.id };
          })
          .filter((s) => s.y > 190 && s.y < 540 && s.x > 50 && s.x < 340);
        let best = null, bd = Infinity;
        for (const s of pts) {
          const alone = pd.visitors.every((v) => {
            if (v.id === s.id) return true;
            const o = pd.screenOf(v.x, v.y);
            return Math.hypot(o.x - s.x, o.y + 8 * z - s.y) > 70;
          });
          const d = Math.hypot(s.x - 195, s.y - 380);
          if (alone && d < bd) {
            bd = d;
            best = s;
          }
        }
        return best;
      });
      if (!p) throw new Error('s6 cooldown: no adult alone on screen to tap');
      await page.mouse.click(p.x, p.y);
      await runBriefly(page, 300);
      await page.evaluate(() => window.__PD.simulate(300)); // five sim seconds on, paused again
      await page.waitForFunction(() => /^\d+ s$/.test(document.querySelector('#cdChip .cd')?.textContent ?? ''), { timeout: 5_000 });
      const chip = await page.evaluate(() => ({ nm: document.querySelector('#cdChip .nm').textContent, cd: document.querySelector('#cdChip .cd').textContent }));
      if (chip.nm !== 'Pigeon') throw new Error('s6 cooldown: the chip names ' + chip.nm);
      await sleep(300);
    },
    /** c_petals armed and tapped on a free lawn tile near (25, 33), applied by a real unpause: PETALS on the 3 x 3 and the rose square. */
    async s6Petals(page) {
      await group(page, 'cupid');
      await page.click('.tool[data-id="c_petals"]');
      const t = await page.evaluate(async () => {
        const pd = window.__PD, G = await import('/src/world/grid.ts');
        for (const [x, y] of [[25, 33], [26, 33], [24, 33], [25, 34], [27, 34], [23, 34], [28, 33]]) {
          if (G.KIND[G.I(x, y)] !== G.Kind.lawn) continue;
          const clear = pd.visitors.every((v) => Math.hypot(v.x - x, v.y - y) > 3);
          if (clear) return { x, y };
        }
        return null;
      });
      if (!t) throw new Error('s6 petals: no free lawn tile near (25, 33)');
      await tapTile(page, t.x, t.y);
      await runBriefly(page, 300);
      await page.waitForFunction((x, y) => window.__PD.layers.PETALS[y * 48 + x] > 0.5, { timeout: 5_000 }, t.x, t.y);
      const aim = await page.evaluate(async () => {
        const m = (await import('/src/render/ghost.ts')).aimMark();
        return m ? { x: m.x, y: m.y, r: m.r, side: m.side } : null;
      });
      if (!aim || aim.r !== 1 || aim.side !== 'cupid') throw new Error('s6 petals: no rose square ' + JSON.stringify(aim));
    },
    /** The sprinkler: a woman with a beret stands in the 3 x 3 of a lawn tile; the cast lands, the spray runs 2 s, she is soaked and shaking. */
    async s6Sprinkler(page) {
      await hideHint(page);
      await ready(page);
      const t = await page.evaluate(async () => {
        const pd = window.__PD, G = await import('/src/world/grid.ts');
        pd.setProgress(8, 8);
        for (let y = 24; y <= 28; y++)
          for (let x = 11; x <= 17; x++) {
            let ok = true;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) ok = ok && G.KIND[G.I(x + i, y + j)] === G.Kind.lawn && G.OCC[G.I(x + i, y + j)] === 0;
            if (ok) return { x, y };
          }
        return null;
      });
      if (!t) throw new Error('s6 sprinkler: no free lawn 3 x 3 near (14, 26)');
      const id = await place(page, 'single', 'f', t.x + 0.3, t.y + 0.7, { hat: true });
      await page.evaluate((t, id) => {
        const pd = window.__PD;
        const v = pd.visitors.find((q) => q.id === id);
        Object.assign(v, { x: t.x + 0.3, y: t.y + 0.7, path: null, st: 'idle', job: {}, decideT: 0 });
        pd.ability('m_sprinkler', { kind: 'tile', x: t.x, y: t.y });
        pd.simulate(150);
        pd.cam.ox -= 0; // the camera stays on the scene's `at`
      }, t, id);
      const st = await page.evaluate((id) => window.__PD.visitors.find((q) => q.id === id)?.st, id);
      if (st !== 'shake') throw new Error('s6 sprinkler: the woman in the spray is ' + st + ', not shaking');
      await focus(page, t.x + 0.2, t.y + 0.3);
    },
    /** The peel: a woman walking west along row 23 steps on the peel at (6, 23) and plops (0.9 s in); an earlier peel waits at (4, 23). */
    async s6Peel(page) {
      await hideHint(page);
      await ready(page);
      const id = await place(page, 'single', 'f', 7.4, 23);
      await page.evaluate(() => {
        const pd = window.__PD;
        pd.setProgress(8, 8);
        pd.simulate(60);
        pd.ability('m_peel', { kind: 'tile', x: 4, y: 23 }); // the first peel
        pd.simulate(2);
      });
      await ready(page, false);
      const left = await page.evaluate(async (id) => {
        const pd = window.__PD, A = await import('/src/entities/act.ts');
        const v = pd.visitors.find((q) => q.id === id);
        Object.assign(v, { x: 7.4, y: 23, path: null, st: 'idle', job: {}, decideT: 0 });
        pd.ability('m_peel', { kind: 'tile', x: 6, y: 23 });
        pd.simulate(2);
        A.startWalk(v, 'wander', { kind: 'peel' }, 2, 23);
        for (let i = 0; i < 400 && v.st !== 'stumble'; i++) pd.simulate(1);
        pd.simulate(54); // 0.9 s into the fall: down, the dust poof
        const peels = pd.props.filter((q) => q.kind === 'peel').map((q) => q.x + ',' + q.y);
        return v.st === 'stumble' ? peels : ['fell:no'];
      }, id);
      if (left.length !== 1 || left[0] !== '4,23') throw new Error('s6 peel: want the walker tripped and the first peel left, got ' + JSON.stringify(left));
      await focus(page, 5.6, 23);
    },
    /** The pigeon: a woman a moment after the landing (the dollop on her beret) and another with the pigeon diving at her. */
    async s6PigeonArt(page) {
      await hideHint(page);
      await ready(page);
      const a = await place(page, 'single', 'f', 22.2, 27.4, { hat: true }), b = await place(page, 'single', 'f', 24.4, 28.8, { hat: true });
      const ok = await page.evaluate(async (a, b) => {
        const pd = window.__PD, C = await import('/src/entities/creatures.ts');
        pd.setProgress(8, 8);
        const A = pd.visitors.find((q) => q.id === a), B = pd.visitors.find((q) => q.id === b);
        Object.assign(A, { x: 22.2, y: 27.4, path: null, st: 'idle', job: {}, decideT: 9999 });
        Object.assign(B, { x: 24.4, y: 28.8, path: null, st: 'idle', job: {}, decideT: 0 });
        for (const c of pd.creatures) if (c.kind === 'pigeon') Object.assign(c, { x: 3, y: 44, tx: 3, ty: 44, st: 'peck' }); // every other pigeon far off
        const bird = C.spawnPigeonAt(17, 22); // 7.5 tiles from her: the dive shows
        Object.assign(bird, { x: 17, y: 22, tx: 17, ty: 22, st: 'peck' });
        pd.ability('m_pigeon', { kind: 'visitor', id: a });
        pd.simulate(1);
        pd.land('poop', b);
        const far = () => (bird.st === 'swoop' ? Math.hypot(bird.x - A.x, bird.y - A.y) : 99);
        for (let i = 0; i < 400 && far() > 1.25; i++) pd.simulate(1);
        return bird.st === 'swoop' && far() <= 1.25 && B.st === 'wipe';
      }, a, b);
      if (!ok) throw new Error('s6 pigeon: no pigeon in its dive, or no wipe');
      await focus(page, 23.2, 27.6);
    },
    /** Pompon: a woman by the west gate with a baguette; he runs in, takes it and carries it off, she chases a second later. */
    async s6Pom(page) {
      await hideHint(page);
      await ready(page);
      const id = await place(page, 'single', 'f', 7, 25, { baguette: true });
      const ok = await page.evaluate(async (id) => {
        const pd = window.__PD;
        pd.setProgress(8, 8);
        pd.simulate(30);
        const v = pd.visitors.find((q) => q.id === id), c = pd.creatures.find((q) => q.kind === 'pomeranian');
        Object.assign(v, { x: 7, y: 25, path: null, st: 'idle', job: {}, decideT: 0 });
        c.cdUntil = 0;
        pd.ability('m_pomeranian', { kind: 'visitor', id });
        for (let i = 0; i < 900 && c.st !== 'carry'; i++) pd.simulate(1);
        pd.simulate(12);
        return c.st === 'carry' && !c.outside ? [(c.x + v.x) / 2, (c.y + v.y) / 2] : null;
      }, id);
      if (!ok) throw new Error('s6 pomeranian: Pompon never carried the baguette');
      await focus(page, ok[0], ok[1]);
    },
    /** The flower seller: a pair on the north loop, c_bouquet cast; 2.6 s on she is at them with the bouquet held out. */
    async s6Florist(page) {
      await hideHint(page);
      await ready(page);
      const ok = await page.evaluate(async () => {
        const pd = window.__PD, V = await import('/src/entities/visitor.ts'), R = await import('/src/entities/romance.ts');
        pd.setProgress(8, 8);
        const mk = (sex, x, y) => {
          const v = V.spawnVisitor('single', 'g_west', { sex, seeks: sex === 'f' ? 'm' : 'f' });
          Object.assign(v, { x, y, path: null, st: 'idle', t: 0, hunger: 0.2, energy: 0.9, comfort: 0.9, leaveAt: 99, decideT: 9999, job: {} });
          return v;
        };
        const a = mk('f', 25.2, 17.6), b = mk('m', 26.2, 17.6);
        const p = R.tryForm(a, b, true);
        Object.assign(p, { stage: 3, affinity: 0.5, doing: 0, formedDay: 0 });
        pd.setPin(p.id);
        pd.simulate(60);
        pd.ability('c_bouquet', { kind: 'pair', id: p.id });
        pd.simulate(4);
        const e = () => pd.effects.find((q) => q.ability === 'c_bouquet');
        for (let i = 0; i < 900 && !(e() && pd.tick() - e().startTick >= 150); i++) pd.simulate(1);
        return !!e();
      });
      if (!ok) throw new Error('s6 florist: c_bouquet never ran');
    },
    /** The busker: c_musician at (25, 17); 0 to 600 steps until he plays. */
    async s6Busker(page) {
      await hideHint(page);
      await ready(page);
      const ok = await page.evaluate(async () => {
        const pd = window.__PD;
        pd.setProgress(8, 8);
        for (const v of pd.visitors) if (Math.hypot(v.x - 25, v.y - 17) < 6) Object.assign(v, { x: 44, y: 44, path: null, st: 'idle', job: {}, decideT: 9999 }); // the florist's pair and their company step aside
        pd.simulate(60);
        pd.ability('c_musician', { kind: 'tile', x: 25, y: 17 });
        for (let i = 0; i < 6000 && !pd.visitors.some((v) => v.archetype === 'busker' && v.st === 'play' && v.spawnedForPlayer); i++) pd.simulate(1);
        pd.simulate(40);
        return pd.visitors.some((v) => v.archetype === 'busker' && v.st === 'play');
      });
      if (!ok) throw new Error('s6 busker: no busker playing');
    },
    /** S5 art, Notice 2 (the shy glance): a new pair at (26, 17.5) on the north loop, 1 s into their Notice, both standing. */
    async s5Notice(page) {
      await hideHint(page);
      const id = await s5Pair(page, 26, 17.5, 0, 0.2, 1, true);
      const ok = await page.evaluate((id) => {
        const pd = window.__PD, p = pd.pairs.find((q) => q.id === id), a = pd.visitors.find((v) => v.id === p.a), b = pd.visitors.find((v) => v.id === p.b);
        for (let i = 0; i < 900 && !(a.st === 'notice' && b.st === 'notice' && !a.path && !b.path); i++) pd.simulate(1);
        pd.simulate(30);
        pd.setSpeed(0);
        return a.st === 'notice' && b.st === 'notice';
      }, id);
      if (!ok) throw new Error('s5 notice: the pair never stopped to notice each other');
      await page.evaluate(() => (window.__PD.cam.follow = 0));
    },
    /** S5 art, Bench 2 (head on the shoulder): the pair seated on the inner loop's bench, no card. */
    async s5BenchArt(page) {
      await hideHint(page);
      if (await page.$eval('#romances', (el) => el.classList.contains('on'))) await page.click('#romances .x');
      await page.evaluate(async () => (await import('/src/ui/card.ts')).clearSel());
      const id = await s5Pair(page, 20, 27, 2, 0.5, 3, true);
      await s5Until(page, id, 'bench');
      const at = await page.evaluate((id) => {
        const pd = window.__PD, p = pd.pairs.find((q) => q.id === id), a = pd.visitors.find((v) => v.id === p.a), b = pd.visitors.find((v) => v.id === p.b);
        pd.cam.follow = 0;
        return [(a.x + b.x) / 2, (a.y + b.y) / 2];
      }, id);
      await focus(page, at[0], at[1]);
    },
    /** S5 art, the featured pair's rose glow (ring 3): the pinned pair standing by the fountain among the crowd. */
    async s5Ring(page) {
      await hideHint(page);
      await page.evaluate(async () => (await import('/src/ui/card.ts')).clearSel());
      await s5Pair(page, 23.5, 21, 3, 0.6, 0, true);
      await page.evaluate(() => {
        const pd = window.__PD;
        pd.simulate(10);
        pd.setSpeed(0);
        pd.cam.follow = 0;
      });
    },
    /** The Points chip at 14 | 23 (a fixture, as det-s6 sets them), then the chip is tapped: the Progress sheet. */
    async s6Progress(page) {
      await page.evaluate(() => window.__PD.setProgress(14, 23));
      await page.waitForFunction(() => document.getElementById('tCP').textContent === '14' && document.getElementById('tMP').textContent === '23', { timeout: 5_000 });
      await page.click('#hudPoints');
      await page.waitForFunction(
        () => document.getElementById('progress').classList.contains('on') && document.querySelectorAll('#progressList .ladder').length === 2,
        { timeout: 5_000 },
      );
      await sleep(500); // the Points chip's flash is over
    },
    async s6ProgressTable(page) {
      await page.$eval('#progress', (el) => (el.scrollTop = el.scrollHeight));
      await sleep(300);
    },
    /** 320 x 568: the sheet closed, the Mischief group with m_pigeon armed: row 2 holds the chip, the tallest rail. */
    async s6Small(page) {
      await closeSheet(page, 'progress');
      await hideHint(page);
      await group(page, 'mischief');
      await page.click('.tool[data-id="m_pigeon"]');
      await page.waitForFunction(() => !document.getElementById('cdChip').hidden, { timeout: 5_000 });
    },
    /** Spanish by a real tap in the Options sheet, then the same Mischief group with m_pigeon armed. */
    async s6SmallEs(page) {
      await closeSheet(page, 'progress');
      await hideHint(page);
      await page.click('#bOptions');
      await page.waitForFunction(() => document.getElementById('options').classList.contains('on'), { timeout: 5_000 });
      await page.click('#optionsList [data-k="lang:es"]');
      await page.waitForFunction(() => document.documentElement.lang === 'es' && document.getElementById('bOptions').textContent === 'Opciones', { timeout: 5_000 });
      await closeSheet(page, 'options');
      await group(page, 'mischief');
      // the pigeon is still armed from rail-320 (a second tap would disarm it): tap it only when it is not
      if (await page.$eval('.tool[data-id="m_pigeon"]', (b) => b.getAttribute('aria-pressed') !== 'true')) await page.click('.tool[data-id="m_pigeon"]');
      await page.waitForFunction(() => !document.getElementById('cdChip').hidden && document.querySelector('#cdChip .nm').textContent === 'Paloma', { timeout: 5_000 });
    },
    async s6SmallProgress(page) {
      await page.click('#hudPoints');
      await page.waitForFunction(() => document.getElementById('progress').classList.contains('on'), { timeout: 5_000 });
    },
  };
}

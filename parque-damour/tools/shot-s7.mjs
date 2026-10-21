// tools/shot-s7.mjs
// The 's7' scene set of tools/shot.mjs (07 S7.7 item 3, S7.6 steps 6 and 7; the UI stage of S7). Every step is a real tap or click (puppeteer's
// mouse at __PD.screenOf of a tile, the rail's mode button, the picker's cards); the harness is read, and sets only what a player earns by
// playing: the visitors' time of day (the shot runner's `abs`), the crowd (`callCrowd`, the "+" chip) and the points of the picker's test
// profile (setProgress, as the det-s6 and s6 shots do). The park stays paused: Be someone and Creator apply in the paused frame (03 4.6, owner
// 2026-10-22), which `enter` and `leave` check (the park is still paused after them), and the sim is stepped with __PD.simulate, which also
// applies the tap that waits for the first step (an avatar.tap is not a paused kind).
//   picker           Mischief T1 and Cupid T0 (the test profile): a_pigeon and a_pomeranian open, a_florist locked (the lock glyph, "Locked · Cupid T1"),
//                    the three S10 avatars dimmed "Coming soon"; the six cards at 390 x 844 with their portraits and side stripes
//   pigeon           a tap on the Pigeon card: possessed, the camera followed to zoom 1.5 (entered from 1.0), the strip "Pigeon · you" with "waiting for your
//                    tap", the three hint chips in row 1, the Park strip and the switch hidden, the mode button "Creator", the 6 s toast "Playing as Pigeon", the ring
//   pigeon-fly       a real tap on a lawn tile some tiles away, one sim step: the pigeon in the air, the strip "flying", the ring on the ground below it
//   pomeranian       Creator (the actor goes on alone), then the Pomeranian card: Pompon in from the gate, standing (no dust) at the first tile, his ring, his hints
//   florist          Cupid T1 earned; the Flower seller card: Violette in from the south-west gate with her basket, the Cupid accent on the chips and the stripe
//   florist-close    the same, the camera pinched in to 3.4 to see the basket and the apron
//   florist-pick     a real tap on a flowerbed (the camera pinched out to reach it), one sim step: she walks there and stoops among the flowers, pinched in to 3.4
//   florist-petals   a real tap on a lawn tile near her, one sim step: she throws petals, the flurry drifting from her hand, pinched in to 3.4
//   320              a 320 x 568 phone back in the Creator mode, the first-launch profile (no points): the picker between the chips and the rail, the
//                    six cards whole (the sheet does not scroll, no card cut, no words out of a card, checked)
//   320-es           the same in Spanish (ES tapped in the Options sheet), where the lines are longer
//   avatar-320-es    the Pomeranian (the longest hints) on that phone in Spanish: the rail with three chips, under 40 % of the screen
export const S7_SCENES = [
  { name: 'picker', turn: 0, z: 1.0, abs: 0.552, pre: 'callCrowd', act: 's7Picker' },
  { name: 'pigeon', keep: true, act: 's7Pigeon' },
  { name: 'pigeon-fly', keep: true, act: 's7PigeonFly' },
  { name: 'pomeranian', keep: true, act: 's7Pom' },
  { name: 'florist', keep: true, act: 's7Florist' },
  { name: 'florist-close', keep: true, act: 's7FloristClose' },
  { name: 'florist-pick', keep: true, act: 's7FloristPick' },
  { name: 'florist-petals', keep: true, act: 's7FloristPetals' },
  { name: '320', vp: [320, 568], keep: true, act: 's7Small' },
  { name: '320-es', keep: true, act: 's7SmallEs' },
  { name: 'avatar-320-es', keep: true, act: 's7SmallAvatarEs' },
];

/** `h`: the helpers shot.mjs owns (tapTile, sleep). Returns the scene actions of the set. */
export function s7Actions(h) {
  const { tapTile, sleep } = h;
  const hideHint = (page, hide) => page.evaluate((hide) => (document.getElementById('hint').style.visibility = hide ? 'hidden' : ''), hide);
  const sheetOn = (page, id) => page.$eval('#' + id, (el) => el.classList.contains('on'));
  const closeSheet = async (page, id) => {
    if (await sheetOn(page, id)) await page.click(`#${id} .x`);
  };
  /** The Be someone button opens the picker; waits for its six cards. */
  const openPicker = async (page) => {
    if (!(await sheetOn(page, 'picker'))) await page.click('#bMode');
    await page.waitForFunction(() => document.getElementById('picker').classList.contains('on') && document.querySelectorAll('#pickerList .pk').length === 6, { timeout: 5_000 });
  };
  /**
   * The six cards fit the sheet (07 S7.7 item 3: nothing cut, no overlap): the sheet does not scroll, no card is cut by its edge and no words
   * poke out of their card (a 320 px phone, either language, whichever cards are locked: S7 UI fix).
   */
  const checkPickerFit = (page, who) =>
    page.evaluate((who) => {
      const sh = document.getElementById('picker'), sr = sh.getBoundingClientRect(), bad = [];
      if (sh.scrollHeight > sh.clientHeight + 1) bad.push(`the sheet scrolls (${sh.scrollHeight} > ${sh.clientHeight})`);
      for (const b of document.querySelectorAll('#pickerList .pk')) {
        const r = b.getBoundingClientRect();
        if (r.bottom > sr.bottom - 1 || r.top < sr.top || r.right > sr.right || r.left < sr.left) bad.push(`${b.dataset.id} is cut by the sheet`);
        for (const e of b.querySelectorAll('.tx > *'))
          for (const n of e.childNodes) {
            if (n.nodeType !== 3) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const q of range.getClientRects()) if (q.right > r.right - 1 || q.bottom > r.bottom) bad.push(`${b.dataset.id}: "${e.textContent}" pokes out of its card`);
          }
      }
      if (bad.length) throw new Error(`s7 ${who}: ${bad.join('; ')}`);
    }, who);
  /** A real tap on `id`'s card, no unpause: the actor is possessed at once, body.avatar is on, the picker has closed, the park is still paused. */
  const enter = async (page, id) => {
    await openPicker(page);
    await page.click(`#pickerList .pk[data-id="${id}"]`);
    await page.waitForFunction((id) => document.body.classList.contains('avatar') && window.__PD.mode().avatar === id, { timeout: 5_000 }, id);
    if (await sheetOn(page, 'picker')) throw new Error('s7 enter: the picker is still open');
    if (await page.evaluate(() => window.__PD.T.speed !== 0)) throw new Error('s7 enter: the park ran; it must stay paused (03 4.6)');
  };
  /** The mode button (it reads Creator now), no unpause: the actor goes on alone at once, the strips are back, the park is still paused. */
  const leave = async (page) => {
    await page.click('#bMode');
    await page.waitForFunction(() => !document.body.classList.contains('avatar') && window.__PD.mode().mode === 'creator', { timeout: 5_000 });
    if (await page.evaluate(() => window.__PD.T.speed !== 0)) throw new Error('s7 leave: the park ran; it must stay paused (03 4.6)');
  };
  const text = (page, sel) => page.$eval(sel, (el) => el.textContent);
  /** What the avatar mode must look like on screen, or it throws (the done-when of 07 S7.7 item 3). */
  const checkAvatarUi = async (page, who) => {
    const r = await page.evaluate(() => {
      const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
      return {
        hints: [...document.querySelectorAll('#hints .hc')].map((c) => c.textContent),
        hintsShown: shown('hints'),
        tools: shown('tools'), groups: shown('groups'), undo: shown('bUndo'), size: shown('sizewrap'),
        mode: document.getElementById('bMode').textContent,
        name: document.getElementById('cName').textContent,
        cardOn: document.getElementById('card').classList.contains('on'),
        z: window.__PD.cam.z,
      };
    });
    if (r.hints.length !== 3 || !r.hintsShown) throw new Error(`s7 ${who}: want three hint chips in row 1, got ${JSON.stringify(r.hints)} (shown ${r.hintsShown})`);
    if (r.tools || r.groups || r.undo || r.size) throw new Error(`s7 ${who}: the Park strip, the switch, Undo or the size row still show ${JSON.stringify(r)}`);
    if (!/ · (you|tú)$/.test(r.name) || !r.cardOn) throw new Error(`s7 ${who}: the strip reads "${r.name}" (card on: ${r.cardOn})`);
    if (!['Creator', 'Creador'].includes(r.mode)) throw new Error(`s7 ${who}: the mode button reads "${r.mode}"`);
    return r;
  };
  /** Pinch-free zoom to `z` on the followed actor: the camera's own zoom, as a pinch sets it; the follow keeps the actor in the clear band. */
  const zoomTo = (page, z) => page.evaluate((z) => (window.__PD.cam.z = z), z);
  const chooseEs = async (page) => {
    await closeSheet(page, 'picker');
    await page.click('#bOptions');
    await page.waitForFunction(() => document.getElementById('options').classList.contains('on'), { timeout: 5_000 });
    await page.click('#optionsList [data-k="lang:es"]');
    await page.waitForFunction(() => document.documentElement.lang === 'es' && document.getElementById('bMode').textContent === 'Ser alguien', { timeout: 5_000 });
    await closeSheet(page, 'options');
  };
  return {
    /** The player's view (body.dev off), Mischief T1, Cupid T0: the picker with its six cards in the states the test profile gives. */
    async s7Picker(page) {
      await page.evaluate(() => {
        document.body.classList.remove('dev');
        window.__PD.setProgress(0, 8);
      });
      await hideHint(page, true);
      await openPicker(page);
      // a locked card answers a tap with "Unlocks at Cupid T1", and that toast must sit above the sheet (z-index), or the tap looks dead
      await page.click('#pickerList .pk[data-id="a_florist"]');
      const lock = await page.evaluate(() => {
        const h = document.getElementById('hint');
        return { on: h.classList.contains('on'), text: h.textContent, zHint: Number(getComputedStyle(h).zIndex), zSheet: Number(getComputedStyle(document.getElementById('picker')).zIndex) };
      });
      if (!lock.on || lock.text !== 'Unlocks at Cupid T1' || !(lock.zHint > lock.zSheet)) throw new Error(`s7 picker: the locked card's toast is ${JSON.stringify(lock)}`);
      await checkPickerFit(page, 'picker');
      const st = await page.$$eval('#pickerList .pk', (els) => els.map((b) => b.dataset.id + (b.classList.contains('locked') ? ':locked' : b.classList.contains('soon') ? ':soon' : '')));
      const want = ['a_pigeon', 'a_pomeranian', 'a_mime:soon', 'a_florist:locked', 'a_busker:soon', 'a_matchmaker:soon'];
      if (JSON.stringify(st) !== JSON.stringify(want)) throw new Error(`s7 picker: want ${JSON.stringify(want)}, got ${JSON.stringify(st)}`);
      await sleep(200);
    },
    /** A real tap on the Pigeon card: the possessed pigeon followed at zoom 1.5, the strip, the chips, the ring and the 6 s toast. */
    async s7Pigeon(page) {
      await enter(page, 'a_pigeon');
      await hideHint(page, false);
      await sleep(2000); // the follow eases in (k = 1 - 0.02^dt): a second and a half; the zoom went to 1.5 at once
      const r = await checkAvatarUi(page, 'pigeon');
      if (r.z !== 1.5) throw new Error(`s7 pigeon: the zoom is ${r.z}, not 1.5`);
      const doing = await text(page, '#cDo');
      if (doing !== 'waiting for your tap') throw new Error(`s7 pigeon: the strip's doing line is "${doing}"`);
      const hint = await page.evaluate(() => ({ on: document.getElementById('hint').classList.contains('on'), text: document.getElementById('hint').textContent }));
      if (!hint.on || !hint.text.startsWith('Playing as Pigeon.')) throw new Error(`s7 pigeon: the toast is ${JSON.stringify(hint)}`);
    },
    /** A real tap on a lawn tile five or six tiles from the pigeon, one sim step: it is in the air, the strip says flying. */
    async s7PigeonFly(page) {
      await hideHint(page, true);
      const t = await page.evaluate(async () => {
        const pd = window.__PD, G = await import('/src/world/grid.ts');
        const me = pd.creatures.find((c) => c.id === pd.mode().player);
        let best = null, bd = Infinity;
        for (let y = 6; y < 42; y++)
          for (let x = 6; x < 42; x++) {
            if (G.KIND[G.I(x, y)] !== G.Kind.lawn || G.OCC[G.I(x, y)] !== 0) continue;
            const d = Math.hypot(x - me.x, y - me.y);
            const s = pd.screenOf(x, y);
            if (d < 4.5 || d > 7 || s.x < 40 || s.x > 350 || s.y < 200 || s.y > 470) continue;
            const clear = pd.visitors.every((v) => Math.hypot(v.x - x, v.y - y) > 1.6) && pd.creatures.every((c) => c.id === me.id || Math.hypot(c.x - x, c.y - y) > 1.6);
            if (clear && Math.abs(d - 5.5) < bd) {
              bd = Math.abs(d - 5.5);
              best = { x, y };
            }
          }
        return best;
      });
      if (!t) throw new Error('s7 pigeon-fly: no lawn tile five or six tiles from the pigeon in view');
      await tapTile(page, t.x, t.y);
      await page.evaluate(() => window.__PD.simulate(1)); // the tap waits for the first step (03 4.6): one step applies it, the flight is then stepped, not timed
      await page.evaluate(() => {
        const pd = window.__PD, me = pd.creatures.find((c) => c.id === pd.mode().player);
        for (let i = 0; i < 600 && me.st !== 'fly'; i++) pd.simulate(1);
        pd.simulate(12); // a fifth of a second into the flight
      });
      await sleep(1100); // the camera follows the bird in the air
      const st = await page.evaluate(() => ({ st: window.__PD.creatures.find((c) => c.id === window.__PD.mode().player)?.st, doing: document.getElementById('cDo').textContent }));
      if (st.st !== 'fly' || st.doing !== 'flying') {
        const dbg = await page.evaluate(() => ({ hint: document.getElementById('hint').textContent, log: window.__PD.log().slice(-3), me: window.__PD.creatures.find((c) => c.id === window.__PD.mode().player) }));
        throw new Error(`s7 pigeon-fly: the pigeon is ${JSON.stringify(st)}, want fly and "flying"; tapped ${JSON.stringify(t)}; ${JSON.stringify(dbg)}`);
      }
    },
    /** Creator, then the Pomeranian card (Mischief T1): Pompon from the gate to its first tile, standing at rest. */
    async s7Pom(page) {
      await leave(page);
      await enter(page, 'a_pomeranian');
      await hideHint(page, false);
      await page.evaluate(() => window.__PD.simulate(240)); // four sim seconds: he is through the gate and waiting
      await sleep(2000);
      const r = await checkAvatarUi(page, 'pomeranian');
      const st = await page.evaluate(() => window.__PD.creatures.find((c) => c.id === window.__PD.mode().player)?.st);
      if (st !== 'wait') throw new Error(`s7 pomeranian: Pompon is ${st}, not waiting`);
      if (r.z < 1.5) throw new Error(`s7 pomeranian: the zoom is ${r.z}`);
    },
    /** Creator, Cupid T1 earned (8 points), then the Flower seller card: she walks in by the south-west gate; her basket and the Cupid accent. */
    async s7Florist(page) {
      await leave(page);
      await page.evaluate(() => window.__PD.setProgress(8, 8));
      await enter(page, 'a_florist');
      await hideHint(page, true);
      await page.evaluate(() => window.__PD.simulate(900)); // fifteen sim seconds: in from the gate and at rest
      await sleep(2000);
      await checkAvatarUi(page, 'florist');
      const side = await page.$eval('#hints', (el) => el.dataset.side);
      if (side !== 'cupid') throw new Error(`s7 florist: the chips' side is ${side}`);
      const v = await page.evaluate(() => {
        const pd = window.__PD, f = pd.visitors.find((q) => q.id === pd.mode().player);
        return { st: f.st, basket: f.basket, doing: document.getElementById('cDo').textContent, name: document.getElementById('cName').textContent };
      });
      if (v.basket !== 3 || v.name !== 'Violette · you') throw new Error(`s7 florist: ${JSON.stringify(v)}`);
    },
    /** The camera pinched in on her (the follow keeps her in the clear band): the basket on her arm, the bun and the sunhat. */
    async s7FloristClose(page) {
      await zoomTo(page, 3.4);
      await sleep(1800);
    },
    /** A real tap on a flowerbed tile in view (the camera pinched out to 0.3 to reach one), one sim step, then she is stepped to the bed and stoops. */
    async s7FloristPick(page) {
      await zoomTo(page, 0.3);
      await sleep(1500);
      const t = await page.evaluate(async () => {
        const pd = window.__PD, G = await import('/src/world/grid.ts');
        const me = pd.visitors.find((v) => v.id === pd.mode().player);
        let best = null, bd = Infinity;
        for (let y = 4; y < 44; y++)
          for (let x = 4; x < 44; x++) {
            if (G.KIND[G.I(x, y)] !== G.Kind.bed) continue;
            const s = pd.screenOf(x, y);
            const d = Math.hypot(x - me.x, y - me.y);
            if (s.x > 40 && s.x < 360 && s.y > 190 && s.y < 480 && d < bd) {
              bd = d;
              best = { x, y };
            }
          }
        return best;
      });
      if (!t) {
        const dbg = await page.evaluate(async () => {
          const pd = window.__PD, G = await import('/src/world/grid.ts');
          const out = [];
          for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (G.KIND[G.I(x, y)] === G.Kind.bed) out.push([x, y, Math.round(pd.screenOf(x, y).x), Math.round(pd.screenOf(x, y).y)]);
          const me = pd.visitors.find((v) => v.id === pd.mode().player);
          return { n: out.length, sample: out.slice(0, 6), me: [me.x, me.y], z: pd.cam.z };
        });
        throw new Error('s7 florist-pick: no flowerbed tile in view at zoom 0.3 ' + JSON.stringify(dbg));
      }
      await tapTile(page, t.x, t.y);
      await page.evaluate(() => window.__PD.simulate(1)); // the tap waits for the first step: one step applies it
      const st = await page.evaluate(() => {
        const pd = window.__PD, me = pd.visitors.find((v) => v.id === pd.mode().player);
        for (let i = 0; i < 3000 && me.st !== 'pick'; i++) pd.simulate(10);
        pd.simulate(20); // a third of a second into the stoop
        return me.st;
      });
      if (st !== 'pick') throw new Error(`s7 florist-pick: she is ${st}, not picking`);
      await zoomTo(page, 3.4);
      await sleep(2200);
      const doing = await text(page, '#cDo');
      if (doing !== 'picking flowers') throw new Error(`s7 florist-pick: the strip says "${doing}"`);
    },
    /** A real tap on a lawn tile three or four tiles from her, one sim step, then she is stepped to the tile and the petals are in the air. */
    async s7FloristPetals(page) {
      await page.evaluate(() => window.__PD.simulate(300)); // the pick is over; the basket is full again
      await zoomTo(page, 1.5);
      await sleep(1600);
      const t = await page.evaluate(async () => {
        const pd = window.__PD, G = await import('/src/world/grid.ts');
        const me = pd.visitors.find((v) => v.id === pd.mode().player);
        let best = null, bd = Infinity;
        for (let y = 4; y < 44; y++)
          for (let x = 4; x < 44; x++) {
            if (G.KIND[G.I(x, y)] !== G.Kind.lawn || G.OCC[G.I(x, y)] !== 0) continue;
            const s = pd.screenOf(x, y), d = Math.hypot(x - me.x, y - me.y);
            const clear = pd.visitors.every((v) => v.id === me.id || Math.hypot(v.x - x, v.y - y) > 2);
            if (clear && d > 2.5 && d < 5 && s.x > 40 && s.x < 350 && s.y > 190 && s.y < 480 && Math.abs(d - 3.5) < bd) {
              bd = Math.abs(d - 3.5);
              best = { x, y };
            }
          }
        return best;
      });
      if (!t) throw new Error('s7 florist-petals: no free lawn tile three or four tiles from her in view');
      await tapTile(page, t.x, t.y);
      await page.evaluate(() => window.__PD.simulate(1)); // the tap waits for the first step: one step applies it
      const st = await page.evaluate(() => {
        const pd = window.__PD, me = pd.visitors.find((v) => v.id === pd.mode().player);
        for (let i = 0; i < 3000 && me.st !== 'scatter'; i++) pd.simulate(10);
        pd.simulate(30); // half a second into the throw
        return me.st;
      });
      if (st !== 'scatter') throw new Error(`s7 florist-petals: she is ${st}, not scattering`);
      await zoomTo(page, 3.4);
      await sleep(2200);
    },
    /** Creator, a 320 x 568 phone (the runner resized it): the picker open, capped between the chips and the rail. */
    async s7Small(page) {
      await leave(page);
      // the first-launch profile (no points): the Pomeranian and the Flower seller locked, the longest set of lines
      await page.evaluate(() => {
        window.__PD.cam.z = 1.0;
        window.__PD.setProgress(0, 0);
      });
      await hideHint(page, true);
      await openPicker(page);
      await sleep(300);
      await checkPickerFit(page, '320');
    },
    /** ES tapped in the Options sheet, the picker open again: the Spanish names and lines. */
    async s7SmallEs(page) {
      await chooseEs(page);
      await openPicker(page);
      await sleep(300);
      await checkPickerFit(page, '320-es');
    },
    /** The Pomeranian in Spanish on the small phone: three chips ("Toca a alguien con sombrero o bolso: arrebatar" is the longest). */
    async s7SmallAvatarEs(page) {
      await page.evaluate(() => window.__PD.setProgress(8, 8)); // the Pomeranian is open again
      await enter(page, 'a_pomeranian');
      await page.evaluate(() => window.__PD.simulate(240));
      await sleep(1800);
      await checkAvatarUi(page, 'pomeranian es');
    },
  };
}

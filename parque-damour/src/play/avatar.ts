// src/play/avatar.ts
// Avatar mode (02 10; register rows 12-14, 3.8, 3.9): the six avatars (AVATARS), entering and leaving, the cascade a tap runs, avatarDecide
// and the three commands avatar.enter, avatar.leave and avatar.tap (03 5.1-5.3).
// Ported from GV 5632-5641 (playerArrive: find or spawn the actor), 5642-5651 (playerDecide: injected at boot into the decide cadence, 03 4.4),
// 5653-5688 (playerTap: the cascade order) and 11252-11279 (setMode, playerCommand). Verdict: ADAPT. Changes: six actors instead of the
// gnome (a pigeon and Pompon are Creatures with `driven`; the florist a `cameo` Visitor with `spawnedForPlayer`; the other three are S10's and
// answer `reason.not_here`); the cascade returns an `avatar.status.<status>` key, or a `reason.<key>` refusal that rejects the command (the
// shell toasts it); the camera, the card, the zoom to 1.5 and the 6 s hint toast are the UI's, they act on the `mode` event (entering:
// params mode 'avatar', avatar, name, hint; leaving: mode 'creator', name, toast 'avatar.goes_on') and the tap's status is the `avatarStatus` event.
// The tap, in order (02 10.3, GV 5653-5688): the hold check (PLAYER_HOLD, and a visitor in a reaction), then the avatar's own cascade (the hit
// the UI resolved is re-validated first, avatar-pick.ts, and a stale one falls through to the tile steps): nearest interactable, tile steps,
// default walk or fly. Every refusal is decided before anything is changed, so a rejected command, which is not logged, leaves no trace.
// The possessed actor never leaves: a visitor's leaveAt is NEVER (visitor.ts, the JSON-safe +Infinity of 07 S7.5) and a creature has none;
// leaving makes it finite again (a fresh visit, one draw) and the actor decides at its next cadence. Points and cooldowns are the equivalent
// ability's (07 S7.6 step 9): the swoop is m_pigeon, the snatch m_pomeranian, the bouquet and the petals c_bouquet and c_petals, through
// embarrass.land (the paired victim scores 1 MP) and abilities.ts startCooldown, markCupid and cast. The avatar is never a Pair member (cameos
// never pair, creatures are no visitors). Undo is cleared on entering and the tool and undo commands are rejected while it lasts (commands.ts).
import { T } from '../core/clock.ts';
import { rnd } from '../core/rng.ts';
import { emit } from '../core/events.ts';
import { OK, fail, registerHandler, type Hit, type Result } from '../core/commands.ts';
import type { GateId } from '../core/ids.ts';
import type { XY } from '../core/math.ts';
import { inB } from '../world/grid.ts';
import { reactionRung } from '../entities/brain.ts';
import { creatureById, type Creature } from '../entities/creatures.ts';
import { REACTION_STATES } from '../entities/romance-stages.ts';
import { VISIT_MAX, VISIT_MIN, byId, nowTick, setAvatarDecide, type Visitor } from '../entities/visitor.ts';
import { commandTick } from './abilities.ts';
import { pickHit, isRefusal, type StatusKey } from './avatar-pick.ts';
import { floristEnter, floristTap } from './avatar-florist.ts';
import { pigeonEnter, pigeonTap } from './avatar-pigeon.ts';
import { pomEnter, pomTap } from './avatar-pomeranian.ts';
import { AVATAR_IDS, PLAYER_HOLD, getAvatar, getMode, getPlayer, setMode, type AvatarId } from './mode.ts';
import { isUnlocked, type Tier } from './progression.ts';
import { clearUndo } from './undo.ts';

export type { StatusKey };

/** One row of 02 10.2 / 06 12: who the avatar is, where it comes from, how fast it moves and its three hint keys. */
export type AvatarDef = {
  id: AvatarId; side: 'cupid' | 'mischief'; tier: Tier;
  actor: 'existing_pigeon' | 'pompon' | 'new_mime' | 'violette' | 'ai_busker_or_new' | 'marguerite'; // the actor rule
  spawn: GateId | 'north_edge' | 'nearest_gate'; // where it enters when it is absent
  speed: number; // tiles per second (the pigeon's is its flight; it walks at 1.2)
  playable: boolean; // S7 builds the first three; a_mime, a_busker and a_matchmaker answer reason.not_here until S10
  hints: readonly [string, string, string];
};
const hints = (id: AvatarId): AvatarDef['hints'] => [`avatar.${id}.hint1`, `avatar.${id}.hint2`, `avatar.${id}.hint3`];

export const AVATARS: readonly AvatarDef[] = [
  { id: 'a_pigeon', side: 'mischief', tier: 0, actor: 'existing_pigeon', spawn: 'north_edge', speed: 6.0, playable: true, hints: hints('a_pigeon') },
  { id: 'a_pomeranian', side: 'mischief', tier: 1, actor: 'pompon', spawn: 'nearest_gate', speed: 4.5, playable: true, hints: hints('a_pomeranian') },
  { id: 'a_mime', side: 'mischief', tier: 3, actor: 'new_mime', spawn: 'nearest_gate', speed: 3.0, playable: false, hints: hints('a_mime') },
  { id: 'a_florist', side: 'cupid', tier: 1, actor: 'violette', spawn: 'g_south_w', speed: 3.0, playable: true, hints: hints('a_florist') },
  { id: 'a_busker', side: 'cupid', tier: 2, actor: 'ai_busker_or_new', spawn: 'nearest_gate', speed: 3.0, playable: false, hints: hints('a_busker') },
  { id: 'a_matchmaker', side: 'cupid', tier: 3, actor: 'marguerite', spawn: 'g_north', speed: 3.0, playable: false, hints: hints('a_matchmaker') },
];
export function avatarById(id: string): AvatarDef | undefined {
  return AVATARS.find((a) => a.id === id);
}

/* ---------- the actor ---------- */

/** The possessed actor: a creature for the pigeon and Pompon, a visitor for the others; neither when it is gone. */
function actorOf(): { v?: Visitor; c?: Creature } {
  const a = getAvatar(), id = getPlayer();
  if (!a || id === 0) return {};
  return a === 'a_pigeon' || a === 'a_pomeranian' ? { c: creatureById(id) } : { v: byId(id) };
}
function nameOf(a: AvatarId, v?: Visitor): string {
  return v ? v.name : '@avatar.' + a + '.name';
}

/* ---------- entering and leaving (02 10.1) ---------- */

/** `setMode('avatar', id)`: find or spawn the actor, PLAYER, the undo stack cleared. Locked: `reason.locked`; S10's three: `reason.not_here`. */
export function enterAvatar(id: AvatarId): Result {
  const d = avatarById(id);
  if (!d) return fail('reason.not_here');
  if (!isUnlocked(id)) return fail('reason.locked');
  if (!d.playable) return fail('reason.not_here');
  const r = id === 'a_pigeon' ? pigeonEnter() : id === 'a_pomeranian' ? pomEnter() : floristEnter();
  if (typeof r === 'string') return fail(r);
  setMode('avatar', id, r);
  clearUndo();
  const v = id === 'a_florist' ? byId(r) : undefined;
  emit({ kind: 'mode', tick: nowTick(), ids: [r], params: { mode: 'avatar', avatar: id, name: nameOf(id, v), hint: '@' + d.hints[0] } });
  return OK;
}

/**
 * `setMode('creator')`: the actor goes back to its own AI at once (register row 14; GV 5626-5629: what it is doing finishes under the AI). A
 * creature loses `driven` (and Pompon his destination); a visitor gets a finite leaveAt (a fresh visit, 02 4.2 item 5: one draw), a sitting
 * one stands up, and it decides at its next step. The toast is `avatar.goes_on` (06 16.7).
 */
export function leaveAvatar(): Result {
  const a = getAvatar();
  const { v, c } = actorOf();
  const id = v?.id ?? c?.id ?? 0;
  if (c) {
    delete c.driven;
    delete c.dest;
  }
  if (v) {
    v.leaveAt = T.abs + rnd(VISIT_MIN, VISIT_MAX);
    v.decideT = 0;
    if (v.st === 'sit') v.t = 0;
  }
  setMode('creator');
  if (a) emit({ kind: 'mode', tick: nowTick(), ids: [id], params: { mode: 'creator', avatar: a, name: nameOf(a, v), toast: 'avatar.goes_on' } });
  return OK;
}

/* ---------- the decide cadence (GV 5642-5651; 03 4.4) ---------- */

/**
 * The possessed visitor's decision, injected into visitors.ts at boot: orders are never pre-empted and needs never rule (02 10.3 item 6), so
 * all it does is react to an embarrassment that landed on it (a pigeon can poop on the florist, 02 10.10 item 2); it waits for the tap.
 */
export function avatarDecide(v: Visitor): void {
  if (v.pendingEmb) reactionRung(v);
}
setAvatarDecide(avatarDecide);

/* ---------- the tap (02 10.3) ---------- */

/**
 * The cascade for a tap on `tile` that the UI resolved to `hit` (re-validated here): an `avatar.status.<status>` key when it did something
 * (`walking` and `flying` are the silent ones), a `reason.<key>` when it refused (nothing changed). `at` is the command's tick.
 */
export function avatarTap(tile: XY, hit: Hit, at: number = commandTick()): StatusKey {
  const a = getAvatar();
  const { v, c } = actorOf();
  const actor = v ?? c;
  if (!a || !actor) return 'reason.not_here';
  if (PLAYER_HOLD[a][actor.st] || (v && (REACTION_STATES[v.st] || v.st === 'laugh'))) return actor.st === 'startled' ? 'reason.startled' : 'reason.busy';
  const p = pickHit(hit, tile, v?.id ?? 0, c?.id ?? 0);
  switch (a) {
    case 'a_pigeon':
      return c ? pigeonTap(c, tile, p, at) : 'reason.not_here';
    case 'a_pomeranian':
      return c ? pomTap(c, tile, p, at) : 'reason.not_here';
    case 'a_florist':
      return v ? floristTap(v, tile, p, at) : 'reason.not_here';
    default:
      return 'reason.not_here'; // a_mime, a_busker, a_matchmaker: S10
  }
}

/* ---------- the commands (03 5.1-5.3: commands.ts has checked the side and the mode) ---------- */

registerHandler('avatar.enter', (c) => (AVATAR_IDS.includes(c.payload.avatar) ? enterAvatar(c.payload.avatar) : fail('reason.not_here')));
registerHandler('avatar.leave', () => leaveAvatar());
registerHandler('avatar.tap', (c) => {
  const a = getAvatar();
  const { v, c: cr } = actorOf();
  if (getMode() !== 'avatar' || !a) return fail('reason.wrong_mode');
  if (!v && !cr) return leaveAvatar(); // the actor is gone: back to the creator, as GV playerCommand does (11271)
  const t = c.payload.tile;
  if (!t || typeof t.x !== 'number' || typeof t.y !== 'number') return fail('reason.not_here');
  const x = Math.round(t.x), y = Math.round(t.y);
  if (!inB(x, y)) return fail('reason.outside');
  const s = avatarTap({ x, y }, c.payload.hit, c.tick);
  if (isRefusal(s)) return fail(s);
  emit({ kind: 'avatarStatus', tick: c.tick, ids: [v?.id ?? cr?.id ?? 0], params: { status: s, what: '@' + s, name: nameOf(a, v), avatar: a } });
  return OK;
});

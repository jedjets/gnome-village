// src/play/mode.ts
// A leaf with no imports: MODE and PLAYER (register 3.9), the possessed avatar, and PLAYER_HOLD (02 10.2). PLAYER is the possessed actor's id,
// 0 when none (03 P5). MODE is read by one branch of the simulation, the decide cadence of entities/visitor.ts (03 4.4), and by core/commands.ts
// for the side and mode rules of 03 5.3.
// Ported from GV 5630-5631 (PLAYER, MODE, PLAYER_HOLD) and 11252-11269 (setMode). ADAPT: only the state and the hold table; the body class,
// the button text and the camera follow live in ui/hud.ts and main.ts (they act on the `mode` event avatar.ts emits). setMode is called only
// by applyCommand's handlers (avatar.enter, avatar.leave: play/avatar.ts), by loop.newPark (park.new: back to creator, PLAYER 0, which also
// discards an actor spawned for the player, since a new park empties the lists) and by store.restore (the saved `mode` block).

export type Mode = 'creator' | 'avatar';
export type AvatarId = 'a_pigeon' | 'a_pomeranian' | 'a_florist' | 'a_mime' | 'a_busker' | 'a_matchmaker';

/** The six avatars of register 3.8, in the order of the picker. */
export const AVATAR_IDS: readonly AvatarId[] = ['a_pigeon', 'a_pomeranian', 'a_mime', 'a_florist', 'a_busker', 'a_matchmaker'];

/**
 * The states during which a tap is refused as busy (GV PLAYER_HOLD 5631; 02 10.2, 06 12): the action in progress finishes before the next
 * order. The pigeon's `startled` answers `reason.startled` (avatar.ts hold check).
 */
export const PLAYER_HOLD: Readonly<Record<AvatarId, Readonly<Record<string, true>>>> = {
  a_pigeon: { swoop: true, poop: true, startled: true },
  a_pomeranian: { snatch: true, carry: true, shakeOff: true },
  a_mime: { wall: true, mimicStart: true },
  a_florist: { hand: true, pick: true, scatter: true },
  a_busker: { setUp: true, pack: true },
  a_matchmaker: { lead: true, encourage: true, buy: true },
};

let MODE: Mode = 'creator';
let PLAYER = 0;
let AVATAR: AvatarId | null = null;

export function getMode(): Mode {
  return MODE;
}
export function getPlayer(): number {
  return PLAYER;
}
export function getAvatar(): AvatarId | null {
  return AVATAR;
}
/** One variable and one branch (register 3.9): `creator` clears the avatar and the actor, `avatar` sets both (the actor's id, 0 if none yet). */
export function setMode(m: Mode, avatar?: AvatarId, actor = 0): void {
  MODE = m;
  AVATAR = m === 'avatar' ? (avatar ?? null) : null;
  PLAYER = m === 'avatar' ? actor : 0;
}

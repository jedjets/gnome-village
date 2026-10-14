// src/play/mode.ts
// A leaf with no imports: MODE and PLAYER (register 3.9). PLAYER is the possessed actor's id, 0 when none (03 P5).
// Ported from GV 5630 (PLAYER, MODE) and 11252-11269 (setMode). ADAPT: only the state; the body class and button text live in ui/hud.ts.
// TODO(S7): setMode is called only by applyCommand (avatar.enter, avatar.leave, park.new); PLAYER_HOLD per avatar.

export type Mode = 'creator' | 'avatar';
export type AvatarId = 'a_pigeon' | 'a_pomeranian' | 'a_florist' | 'a_mime' | 'a_busker' | 'a_matchmaker';

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
export function setMode(m: Mode, avatar?: AvatarId, actor = 0): void {
  MODE = m;
  AVATAR = m === 'avatar' ? (avatar ?? null) : null;
  PLAYER = m === 'avatar' ? actor : 0;
}

// tests/avatar-world.ts
// Shared by the avatar tests (tests/avatar.test.ts, avatar-pigeon, avatar-pomeranian, avatar-florist: split at the 600-line rule): the
// commands and taps of the three avatars of S7, the tiles a scene needs, and the beforeEach that builds a quiet park with every tier open.
import { AVATAR_SIDE, applyNow, type Hit } from '../src/core/commands.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { KIND, Kind, OCC } from '../src/world/grid.ts';
import { getAvatar, getPlayer, type AvatarId } from '../src/play/mode.ts';
import { avatarTap } from '../src/play/avatar.ts';
import { points } from '../src/play/progression.ts';
import { creatureById, type Creature } from '../src/entities/creatures.ts';
import { byId, type Visitor } from '../src/entities/visitor.ts';
import { unlockAll, world } from './abilities-world.ts';

export const enter = (id: AvatarId) => applyNow({ side: AVATAR_SIDE[id], kind: 'avatar.enter', payload: { avatar: id } });
export const leave = () => applyNow({ side: AVATAR_SIDE[getAvatar() ?? 'a_pigeon'], kind: 'avatar.leave', payload: {} });
export const tileHit = (x: number, y: number): Hit => ({ kind: 'tile', id: 0, tile: { x, y } });
/** A tap on a person: the tile under them and the hit the UI would have resolved. */
export const onPerson = (v: Visitor): [{ x: number; y: number }, Hit] => {
  const t = { x: Math.round(v.x), y: Math.round(v.y) };
  return [t, { kind: 'visitor', id: v.id, tile: t }];
};
export const tapPerson = (v: Visitor) => avatarTap(...onPerson(v));
export const tapTile = (x: number, y: number) => avatarTap({ x, y }, tileHit(x, y));
export const cmdTap = (x: number, y: number, hit?: Hit) =>
  applyNow({ side: AVATAR_SIDE[getAvatar() ?? 'a_pigeon'], kind: 'avatar.tap', payload: { tile: { x, y }, hit: hit ?? tileHit(x, y) } });
export const bedTile = (): { x: number; y: number } => {
  for (let i = 0; i < KIND.length; i++) if (KIND[i] === Kind.bed) return { x: i % 48, y: Math.floor(i / 48) };
  throw new Error('no bed in the starter park');
};
export const gravel = (): { x: number; y: number } => {
  for (let i = 0; i < KIND.length; i++) if (KIND[i] === Kind.gravel && OCC[i] === 0) return { x: i % 48, y: Math.floor(i / 48) };
  throw new Error('no gravel');
};
export const lawn = (): { x: number; y: number } => {
  for (let i = 24 * 48 + 30; i < KIND.length; i++) if (KIND[i] === Kind.lawn && OCC[i] === 0) return { x: i % 48, y: Math.floor(i / 48) };
  throw new Error('no lawn');
};
export const mp = (): number => points().mp;
export const pigeonActor = (): Creature => creatureById(getPlayer()) as Creature;
export const floristActor = (): Visitor => byId(getPlayer()) as Visitor;
export const rejected: string[] = [];
export const events: GameEvent[] = [];

/** The beforeEach of every avatar test file: a quiet park, every tier unlocked, the refusals and the avatar's events recorded. */
export function setupAvatarWorld(): void {
  clearListeners();
  world();
  unlockAll();
  rejected.length = 0;
  events.length = 0;
  on('rejected', (e) => rejected.push(String(e.params?.reason)));
  for (const k of ['avatarStatus', 'mode', 'bouquet', 'cast', 'embarrassed', 'snatch'] as const) on(k, (e) => events.push(e));
}

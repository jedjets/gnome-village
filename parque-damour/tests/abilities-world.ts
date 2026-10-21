// tests/abilities-world.ts
// Shared scenes of tests/abilities.test.ts and tests/abilities-timelines.test.ts (split at the 600-line rule): a quiet park with no arrivals,
// adults, children and pairs set down where a test wants them, and the commands' outcomes.
import { SIM_DT, newPark, setSpeed, simulate } from '../src/core/loop.ts';
import { T } from '../src/core/clock.ts';
import type { AbilityId, Target } from '../src/core/commands.ts';
import { clearListeners, on } from '../src/core/events.ts';
import { setMode } from '../src/play/mode.ts';
import { bindProgression, resetProgress, setProgress } from '../src/play/progression.ts';
import { setArrivalsState, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { tryForm, type Pair } from '../src/entities/romance.ts';

export const SEC = 60;

/* ---------- a quiet park: no arrivals, nobody but the staff ---------- */

export function world(): void {
  clearListeners();
  bindProgression();
  newPark(1);
  setSpeed(1);
  resetProgress();
  setMode('creator');
  setArrivalsState({ arrivalT: 1e9, pace: 'calm' });
}
export const unlockAll = (): void => setProgress({ cp: 70, mp: 70 });
export const run = (n: number): void => {
  for (let s = 0; s < n; s++) simulate(SIM_DT, 1);
};

export function adult(x: number, y: number, sex: 'f' | 'm' = 'f'): Visitor {
  const v = spawnVisitor('single', 'g_west', { sex, seeks: sex === 'f' ? 'm' : 'f' }) as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0, hunger: 0.3, energy: 0.8, comfort: 0.7, leaveAt: T.abs + 0.9 });
  v.items = { hat: false, purse: false, baguette: false, iceCream: false };
  return v;
}
export function child(x: number, y: number): Visitor {
  const v = spawnVisitor('child', 'g_west', {}) as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0, leaveAt: T.abs + 0.9 });
  return v;
}
export function pairAt(x: number, y: number, d = 1): { p: Pair; a: Visitor; b: Visitor } {
  const a = adult(x, y, 'f'), b = adult(x + d, y, 'm');
  const p = tryForm(a, b, true) as Pair;
  for (const v of [a, b]) Object.assign(v, { st: 'idle', t: 0, job: {}, path: null });
  return { p, a, b };
}
/** Both members watching for a long while: they stay where they are (a courting pair is in a stage, which holds them too). */
export function stay(...vs: Visitor[]): void {
  for (const v of vs) Object.assign(v, { st: 'watch', t: 600, path: null });
}
export const tileT = (x: number, y: number): Target => ({ kind: 'tile', x, y });
export const sideOf = (id: AbilityId): 'cupid' | 'mischief' => (id.startsWith('c_') ? 'cupid' : 'mischief');
export const reasonOf = (r: { ok: boolean } & { reason?: string }): string => (r.ok ? 'ok' : (r.reason as string));

/** The commands' outcomes, in order: 'ok' for applied, the reason for rejected. */
export function outcomes(): string[] {
  const out: string[] = [];
  on('applied', (e) => {
    if (e.params?.kind === 'ability') out.push('ok');
  });
  on('rejected', (e) => {
    if (e.params?.kind === 'ability') out.push(String(e.params.reason));
  });
  return out;
}

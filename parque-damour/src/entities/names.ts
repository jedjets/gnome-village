// src/entities/names.ts
// French first names (40 per sex), the eight regulars with seeks, name reservation, regular memory and return scheduling (02 4.5, 06 6).
// NEW. GV 1360-1365 (NAMES, freshName) as the idea only: a name nobody in the park holds while one is free, chosen with exactly one draw
// of the sim stream (GV 1365, "determinism"); GV fell back to a duplicate past 40 names (09 4 row 23): here a name is reserved while its
// holder is in the park and released when they leave, and an exhausted list (impossible under the 30 cap) reuses from the start (06 6.1).
// Regulars (02 4.5 items 2-4): all `single`, names and seeks exactly as 06 6.2; a regular who leaves comes back on day + rint(1, 2) at an
// f in [0.30, 0.65] (two draws: the day, then the f), replacing the next generated single, at most 3 a day; their memory
// { partnerId, affinity, stage, lastDay } loses 0.1 affinity a day while the two are apart. S5 writes the memory and recreates the Pair.
// The first visits are a fixed table (no draw, so a new park moves no stream): see FIRST_VISIT.
import { rint, rnd, rng } from '../core/rng.ts';
import type { VisitorId } from '../core/ids.ts';

export type Sex = 'f' | 'm';
export type Seeks = 'f' | 'm' | 'any';

/** 06 6.1, f: never translated, never a regular's or a fixed actor's name. */
export const NAMES_F: readonly string[] = [
  'Adèle', 'Agathe', 'Alice', 'Anaïs', 'Apolline', 'Aurélie', 'Béatrice', 'Camille', 'Capucine', 'Céline', 'Chloé', 'Clémence', 'Constance',
  'Delphine', 'Élise', 'Élodie', 'Émilie', 'Eugénie', 'Fleur', 'Gabrielle', 'Héloïse', 'Inès', 'Isabelle', 'Jeanne', 'Joséphine', 'Léa',
  'Louise', 'Madeleine', 'Manon', 'Mathilde', 'Noémie', 'Océane', 'Pauline', 'Rosalie', 'Salomé', 'Sophie', 'Suzanne', 'Valentine',
  'Victoire', 'Zoé',
];
/** 06 6.1, m. */
export const NAMES_M: readonly string[] = [
  'Adrien', 'Alexandre', 'Antoine', 'Arnaud', 'Arthur', 'Augustin', 'Benoît', 'Bertrand', 'Clément', 'Côme', 'Damien', 'Édouard', 'Émile',
  'Étienne', 'Fabien', 'Félix', 'Florian', 'Gaspard', 'Gaston', 'Grégoire', 'Guillaume', 'Hugo', 'Jean', 'Jules', 'Julien', 'Laurent',
  'Léo', 'Louis', 'Marcel', 'Mathieu', 'Maxime', 'Nicolas', 'Olivier', 'Pascal', 'Paul', 'Pierre', 'Raphaël', 'Sébastien', 'Thibault',
  'Victor',
];

/** The gardener's fixed name (06 6.3). */
export const GARDENER_NAME = 'Gustave';

export type RegularDef = { regularId: number; name: string; sex: Sex; seeks: Seeks; ageWord: 'young' | 'grown' };
/** The eight regulars, in regularId order (02 4.5 item 2, 06 6.2). */
export const REGULARS: readonly RegularDef[] = [
  { regularId: 1, name: 'Amélie', sex: 'f', seeks: 'm', ageWord: 'young' },
  { regularId: 2, name: 'Juliette', sex: 'f', seeks: 'm', ageWord: 'young' },
  { regularId: 3, name: 'Colette', sex: 'f', seeks: 'any', ageWord: 'grown' },
  { regularId: 4, name: 'Margot', sex: 'f', seeks: 'm', ageWord: 'young' },
  { regularId: 5, name: 'Théo', sex: 'm', seeks: 'f', ageWord: 'young' },
  { regularId: 6, name: 'Lucien', sex: 'm', seeks: 'f', ageWord: 'grown' },
  { regularId: 7, name: 'Baptiste', sex: 'm', seeks: 'any', ageWord: 'young' },
  { regularId: 8, name: 'Rémi', sex: 'm', seeks: 'f', ageWord: 'grown' },
];

export const CAP_REGULARS_DAY = 3; // 06 1.4
export const RETURN_DAYS_MIN = 1; // 06 1.8 REGULAR_RETURN_DAYS
export const RETURN_DAYS_MAX = 2;
export const ARRIVE_F_MIN = 0.3; // 06 1.8 REGULAR_ARRIVE_F
export const ARRIVE_F_MAX = 0.65;
export const AFF_DECAY_DAY = 0.1; // 06 1.7

/**
 * The first visit of each regular at a new park: the order interleaves the sexes (Amélie, Théo, Juliette, Lucien, Colette, Baptiste,
 * Margot, Rémi), three a day from day 1, at f 0.30, 0.45 and 0.60 inside the day's three slots. A value no document defines (02 4.5 says
 * only that the regulars "exist from the start"); a table, not a draw, so a new park leaves the sim stream where it was.
 */
export const FIRST_VISIT: readonly number[] = [1, 5, 2, 6, 3, 7, 4, 8];

export type RegularMemory = { partnerId: number; affinity: number; stage: number; lastDay: number }; // partnerId: the partner's regularId
export type RegularState = { regularId: number; visitorId: VisitorId; nextVisitDay: number; arriveF: number; memory: RegularMemory };

let held: string[] = []; // the generated names in use, one entry per holder
let regs: RegularState[] = [];
let arrivedDay = 0; // the day arrivedToday counts
let arrivedToday = 0;

function listOf(sex: Sex): readonly string[] {
  return sex === 'f' ? NAMES_F : NAMES_M;
}

/**
 * A name of `sex` nobody in the park holds, reserved until releaseName. Exactly one sim draw (GV freshName 1365). When every name is held
 * (more than 40 of one sex present: impossible under the cap of 30), the list is reused from the start: the least held name, the first
 * in list order on a tie (06 6.1).
 */
export function takeName(sex: Sex): string {
  const list = listOf(sex);
  const free = list.filter((n) => !held.includes(n));
  const r = rng();
  let name: string;
  if (free.length > 0) name = free[(r * free.length) | 0] as string;
  else {
    let best = list[0] as string, bn = Infinity;
    for (const n of list) {
      const c = held.filter((h) => h === n).length;
      if (c < bn) {
        bn = c;
        best = n;
      }
    }
    name = best;
  }
  held.push(name);
  return name;
}

/** The holder left the park: the name may be given again. A name not held (a regular's, the gardener's) is ignored. */
export function releaseName(name: string): void {
  const k = held.indexOf(name);
  if (k >= 0) held.splice(k, 1);
}

/** The generated names in use (a copy). */
export function namesHeld(): string[] {
  return held.slice();
}

/* ---------- regulars ---------- */

function freshRegulars(): RegularState[] {
  return REGULARS.map((d) => {
    const i = FIRST_VISIT.indexOf(d.regularId);
    return {
      regularId: d.regularId,
      visitorId: 0,
      nextVisitDay: 1 + Math.floor(i / CAP_REGULARS_DAY),
      arriveF: ARRIVE_F_MIN + 0.15 * (i % CAP_REGULARS_DAY),
      memory: { partnerId: 0, affinity: 0, stage: 0, lastDay: 0 },
    };
  });
}

export function regularDef(regularId: number): RegularDef | undefined {
  return REGULARS.find((d) => d.regularId === regularId);
}

/**
 * The regular who should take the place of the next generated single on `day` at `f` (02 4.5 item 3), or null: not in the park, their day
 * reached (a day missed carries over), their f reached on that day, and fewer than 3 regulars arrived today. The earliest due first
 * (nextVisitDay, then arriveF, then regularId). No draw.
 */
export function regularDue(day: number, f: number): RegularDef | null {
  if (arrivedDay === day && arrivedToday >= CAP_REGULARS_DAY) return null;
  let best: RegularState | null = null;
  for (const r of regs) {
    if (r.visitorId !== 0) continue;
    if (r.nextVisitDay > day || (r.nextVisitDay === day && f < r.arriveF)) continue;
    if (!best || r.nextVisitDay < best.nextVisitDay || (r.nextVisitDay === best.nextVisitDay && r.arriveF < best.arriveF)) best = r;
  }
  return best ? (regularDef(best.regularId) ?? null) : null;
}

/** A regular came in as visitor `visitorId` on `day` (counts toward the 3 a day). */
export function regularArrived(regularId: number, visitorId: VisitorId, day: number): void {
  const r = regs.find((o) => o.regularId === regularId);
  if (!r) return;
  r.visitorId = visitorId;
  if (arrivedDay !== day) {
    arrivedDay = day;
    arrivedToday = 0;
  }
  arrivedToday++;
}

/** A regular left the park on `day`: they come back on day + rint(1, 2) at an f in [0.30, 0.65] (02 4.5 item 3; two draws, day then f). */
export function regularLeft(regularId: number, day: number): void {
  const r = regs.find((o) => o.regularId === regularId);
  if (!r) return;
  r.visitorId = 0;
  r.nextVisitDay = day + rint(RETURN_DAYS_MIN, RETURN_DAYS_MAX);
  r.arriveF = rnd(ARRIVE_F_MIN, ARRIVE_F_MAX);
}

/** S5 records a regular's romance here when it ends a visit or a stage (02 4.5 item 4); `partnerId` is the partner's regularId. */
export function rememberPair(regularId: number, m: RegularMemory): void {
  const r = regs.find((o) => o.regularId === regularId);
  if (r) r.memory = { ...m };
}

/**
 * The day reset (03 4.2 phase 5): every remembered pair whose two members are not both in the park loses 0.1 affinity, floored at 0
 * (02 4.5 item 4, 6.3). No draw.
 */
export function stepRegularReturns(): void {
  for (const r of regs) {
    const m = r.memory;
    if (m.partnerId === 0) continue;
    const p = regs.find((o) => o.regularId === m.partnerId);
    const together = r.visitorId !== 0 && p !== undefined && p.visitorId !== 0;
    if (!together) m.affinity = Math.max(0, m.affinity - AFF_DECAY_DAY);
  }
}

export type NamesState = { held: string[]; regulars: RegularState[]; arrivedDay: number; arrivedToday: number };

export function regularsState(): RegularState[] {
  return JSON.parse(JSON.stringify(regs)) as RegularState[];
}
export function namesState(): NamesState {
  return { held: held.slice(), regulars: regularsState(), arrivedDay, arrivedToday };
}
export function setNamesState(s: NamesState): void {
  held = s.held.slice();
  regs = JSON.parse(JSON.stringify(s.regulars)) as RegularState[];
  arrivedDay = s.arrivedDay;
  arrivedToday = s.arrivedToday;
}

/** A new park: no name held, the regulars outside on their first-visit table, no arrival counted. No draw. */
export function resetNames(): void {
  held = [];
  regs = freshRegulars();
  arrivedDay = 0;
  arrivedToday = 0;
}

resetNames();

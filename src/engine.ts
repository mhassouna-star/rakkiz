/**
 * Rakkiz planning engine — pure functions only.
 * No I/O, no dates from the environment except what is passed in.
 * Every function is deterministic given its inputs, which makes the
 * whole planner unit-testable and guarantees the UI thread never
 * does more than a few thousand arithmetic ops per interaction.
 *
 * Spec traceability (AI_Study_Planner_Specification v1.1):
 *   Engine 1  Priority Allocation      -> subjectWeights()
 *   Engine 2  Schedule Generation      -> buildSchedule()
 *   Engine 3  Tip Recommendation       -> tipsFor()
 *   M1 / O7   Feasibility gauge        -> feasibility()
 *   M2 / A6   Spaced-repetition blocks -> injectReviews()
 *   M3 / A5   Adaptive redistribution  -> redistribute()
 */

export type Difficulty = 1 | 2 | 3; // Easy | Medium | Hard
export type StudyMethod =
  | 'pomodoro'
  | 'active-recall'
  | 'feynman'
  | 'spaced-repetition'
  | 'deep-focus';

export interface SubjectInput {
  id: string;
  name: string;
  difficulty: Difficulty;
  /** ISO date yyyy-mm-dd of the exam/deadline, or null */
  deadline: string | null;
  /** hours the student wants to give this subject per week; null = derive */
  weeklyHours: number | null;
  color: string;
}

export interface PlannedBlock {
  id: string;
  date: string; // yyyy-mm-dd
  subjectId: string;
  minutes: number;
  kind: 'study' | 'review';
  status: 'planned' | 'done' | 'skipped' | 'partial';
  doneMinutes: number;
  order: number;
}

/* ------------------------------------------------------------------ */
/* Constants (single source for all tuning numbers)                    */
/* ------------------------------------------------------------------ */

export const DIFF_FACTOR: Record<Difficulty, number> = { 1: 1, 2: 1.3, 3: 1.5 }; // Amna/Fatema rule
export const DEFAULT_WEEKLY_HOURS = 3; // derived target when the student leaves hours blank
const SESSION_MIN = 25;   // smallest study block (Pomodoro unit)
const SESSION_MAX = 50;   // largest single block before a forced break
const REVIEW_MIN = 20;    // spaced-repetition review block length
const REVIEW_OFFSETS = [1, 3]; // days after first study (the +7 falls in next week's plan)
export const HORIZON_DAYS = 7;

/* ------------------------------------------------------------------ */
/* Date helpers (pure — "today" is always an argument)                 */
/* ------------------------------------------------------------------ */

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toISO(dt);
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  const [y1, m1, d1] = fromISO.split('-').map(Number);
  const [y2, m2, d2] = toISOStr.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1).getTime();
  const b = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** 0=Sun … 6=Sat for an ISO date, matching the availability array. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/* ------------------------------------------------------------------ */
/* Engine 1 — priority allocation                                      */
/* ------------------------------------------------------------------ */

export function urgencyFactor(deadline: string | null, today: string): number {
  if (!deadline) return 1;
  const left = Math.max(1, daysBetween(today, deadline));
  // 14 days out => 1.0, tomorrow => 4.0 (clamped)
  return Math.min(4, Math.max(1, 14 / left));
}

export function targetMinutes(s: SubjectInput): number {
  const hours = s.weeklyHours ?? DEFAULT_WEEKLY_HOURS * DIFF_FACTOR[s.difficulty];
  return Math.round(hours * 60);
}

export function subjectWeights(subjects: SubjectInput[], today: string): Map<string, number> {
  const w = new Map<string, number>();
  for (const s of subjects) {
    w.set(s.id, targetMinutes(s) * DIFF_FACTOR[s.difficulty] * urgencyFactor(s.deadline, today));
  }
  return w;
}

/* ------------------------------------------------------------------ */
/* M1 — feasibility gauge                                              */
/* ------------------------------------------------------------------ */

export type CushionLevel = 'green' | 'amber' | 'red';

export interface Feasibility {
  neededMin: number;
  capacityMin: number;
  cushionMin: number;
  /** 0..1 share of capacity left free; negative when infeasible */
  cushionPct: number;
  level: CushionLevel;
}

export function feasibility(subjects: SubjectInput[], availability: number[]): Feasibility {
  const neededMin = subjects.reduce((acc, s) => acc + targetMinutes(s), 0);
  const capacityMin = Math.round(availability.reduce((a, b) => a + b, 0) * 60);
  const cushionMin = capacityMin - neededMin;
  const cushionPct = capacityMin > 0 ? cushionMin / capacityMin : -1;
  const level: CushionLevel = cushionPct >= 0.2 ? 'green' : cushionPct >= 0 ? 'amber' : 'red';
  return { neededMin, capacityMin, cushionMin, cushionPct, level };
}

/* ------------------------------------------------------------------ */
/* Engine 2 — schedule generation                                      */
/* ------------------------------------------------------------------ */

/**
 * Decide how many minutes each subject gets this week.
 * If everything fits, subjects get exactly their target.
 * If over capacity, minutes are scaled by priority weight so urgent
 * and hard subjects are protected while easy/far ones are trimmed.
 */
export function allocateMinutes(
  subjects: SubjectInput[],
  availability: number[],
  today: string,
): Map<string, number> {
  const alloc = new Map<string, number>();
  const capacity = Math.round(availability.reduce((a, b) => a + b, 0) * 60);
  const totalTarget = subjects.reduce((acc, s) => acc + targetMinutes(s), 0);

  if (totalTarget <= capacity) {
    for (const s of subjects) alloc.set(s.id, targetMinutes(s));
    return alloc;
  }
  const weights = subjectWeights(subjects, today);
  let sumW = 0;
  weights.forEach((v) => (sumW += v));
  for (const s of subjects) {
    const share = sumW > 0 ? (weights.get(s.id)! / sumW) : 1 / subjects.length;
    // round down to 5-minute grain so the total never exceeds capacity
    alloc.set(s.id, Math.floor((capacity * share) / 5) * 5);
  }
  return alloc;
}

let blockSeq = 0;
function newId(): string {
  // crypto.randomUUID exists in every 2020+ browser and Node 19+;
  // the counter suffix guards against same-ms collisions in tests.
  const base =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${base}-${(blockSeq++).toString(36)}`;
}

/**
 * Turn per-subject minute budgets into concrete daily blocks.
 * Round-robin over subjects ordered by priority so no day is a
 * monoculture, blocks are 25–50 min, and daily capacity is respected.
 */
export function buildSchedule(
  subjects: SubjectInput[],
  availability: number[],
  today: string,
  spacedRep: boolean,
): PlannedBlock[] {
  if (subjects.length === 0) return [];
  const alloc = allocateMinutes(subjects, availability, today);
  const weights = subjectWeights(subjects, today);
  const ordered = [...subjects].sort(
    (a, b) => (weights.get(b.id) ?? 0) - (weights.get(a.id) ?? 0),
  );

  const remaining = new Map<string, number>();
  ordered.forEach((s) => remaining.set(s.id, alloc.get(s.id) ?? 0));

  const blocks: PlannedBlock[] = [];
  const dayLoad = new Array(HORIZON_DAYS).fill(0);

  for (let d = 0; d < HORIZON_DAYS; d++) {
    const date = addDays(today, d);
    const capMin = Math.round((availability[weekdayOf(date)] ?? 0) * 60);
    let cursor = 0; // rotate the starting subject by day for variety
    let order = 0;
    let guard = 0;
    while (dayLoad[d] < capMin && guard++ < 200) {
      const s = ordered[(d + cursor) % ordered.length];
      cursor++;
      const left = remaining.get(s.id) ?? 0;
      if (left <= 0) {
        // stop when every subject is exhausted
        if ([...remaining.values()].every((v) => v <= 0)) break;
        continue;
      }
      const room = capMin - dayLoad[d];
      if (room < SESSION_MIN) break;
      const minutes = Math.min(SESSION_MAX, Math.max(SESSION_MIN, Math.min(left, room)));
      const clipped = Math.min(minutes, room, left < SESSION_MIN ? SESSION_MIN : left);
      blocks.push({
        id: newId(),
        date,
        subjectId: s.id,
        minutes: clipped,
        kind: 'study',
        status: 'planned',
        doneMinutes: 0,
        order: order++,
      });
      dayLoad[d] += clipped;
      remaining.set(s.id, left - clipped);
    }
  }

  return spacedRep ? injectReviews(blocks, availability, today) : blocks;
}

/* ------------------------------------------------------------------ */
/* M2 — spaced-repetition review blocks                                */
/* ------------------------------------------------------------------ */

export function injectReviews(
  blocks: PlannedBlock[],
  availability: number[],
  today: string,
): PlannedBlock[] {
  const firstDay = new Map<string, string>();
  for (const b of blocks) {
    if (b.kind !== 'study') continue;
    const cur = firstDay.get(b.subjectId);
    if (!cur || b.date < cur) firstDay.set(b.subjectId, b.date);
  }
  const load = new Map<string, number>();
  for (const b of blocks) load.set(b.date, (load.get(b.date) ?? 0) + b.minutes);

  const out = [...blocks];
  firstDay.forEach((first, subjectId) => {
    for (const off of REVIEW_OFFSETS) {
      const date = addDays(first, off);
      if (daysBetween(today, date) >= HORIZON_DAYS) continue;
      const capMin = Math.round((availability[weekdayOf(date)] ?? 0) * 60);
      const used = load.get(date) ?? 0;
      if (capMin - used < REVIEW_MIN) continue; // no room — skip quietly
      out.push({
        id: newId(),
        date,
        subjectId,
        minutes: REVIEW_MIN,
        kind: 'review',
        status: 'planned',
        doneMinutes: 0,
        order: 99 + off, // reviews sit after study blocks
      });
      load.set(date, used + REVIEW_MIN);
    }
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* M3 — adaptive redistribution                                        */
/* ------------------------------------------------------------------ */

export interface RedistributionResult {
  /** blocks to insert (new) or update (extended) */
  upserts: PlannedBlock[];
  /** minutes that could not be placed anywhere */
  unplacedMinutes: number;
}

/**
 * Move the unfinished minutes of a skipped/partial block into the
 * nearest future day with spare capacity. Prefers extending an
 * existing block of the same subject over creating a new one.
 */
export function redistribute(
  lostMinutes: number,
  subjectId: string,
  allBlocks: PlannedBlock[],
  availability: number[],
  today: string,
): RedistributionResult {
  const upserts: PlannedBlock[] = [];
  let toPlace = lostMinutes;

  const load = new Map<string, number>();
  for (const b of allBlocks) {
    if (b.status === 'skipped') continue;
    load.set(b.date, (load.get(b.date) ?? 0) + b.minutes);
  }

  for (let d = 1; d < HORIZON_DAYS && toPlace > 0; d++) {
    const date = addDays(today, d);
    const capMin = Math.round((availability[weekdayOf(date)] ?? 0) * 60);
    const spare = capMin - (load.get(date) ?? 0);
    if (spare <= 0) continue;
    const add = Math.min(spare, toPlace);

    const existing = allBlocks.find(
      (b) =>
        b.date === date &&
        b.subjectId === subjectId &&
        b.kind === 'study' &&
        b.status === 'planned' &&
        !upserts.some((u) => u.id === b.id),
    );
    if (existing) {
      upserts.push({ ...existing, minutes: existing.minutes + add });
    } else if (add >= REVIEW_MIN) {
      upserts.push({
        id: newId(),
        date,
        subjectId,
        minutes: add,
        kind: 'study',
        status: 'planned',
        doneMinutes: 0,
        order: 50,
      });
    } else {
      continue; // don't create sub-20-minute crumbs
    }
    toPlace -= add;
    load.set(date, (load.get(date) ?? 0) + add);
  }
  return { upserts, unplacedMinutes: toPlace };
}

/* ------------------------------------------------------------------ */
/* Engine 3 — tips + tier messages                                     */
/* ------------------------------------------------------------------ */

export const METHOD_LABEL: Record<StudyMethod, string> = {
  pomodoro: 'Pomodoro',
  'active-recall': 'Active recall',
  feynman: 'Feynman',
  'spaced-repetition': 'Spaced repetition',
  'deep-focus': 'Deep focus',
};

const TIPS: Record<StudyMethod, string[]> = {
  pomodoro: [
    'Work 25 minutes, break 5. After four rounds take 20 off.',
    'Put the phone in another room for each round.',
    'Batch small tasks into one Pomodoro instead of scattering them.',
  ],
  'active-recall': [
    'Close the notes and self-quiz before re-reading anything.',
    'Turn headings into questions, then answer from memory.',
    'End each session by writing three things you just learned.',
  ],
  feynman: [
    'Explain the topic out loud as if to a 10-year-old.',
    'Wherever you stall, that is the gap — go back to it.',
    'Swap jargon for plain words; simple language exposes weak spots.',
  ],
  'spaced-repetition': [
    'Review new material after 1, 3, and 7 days — the blocks are already in your plan.',
    'Spend reviews on your weakest topics first.',
    'Keep reviews short; 20 focused minutes beats an hour of re-reading.',
  ],
  'deep-focus': [
    'One subject, one sitting — no switching until the block ends.',
    'Start with the hardest task while energy is highest.',
    'Set a clear finish line for each block before you begin.',
  ],
};

export function tipsFor(method: StudyMethod): string[] {
  return TIPS[method] ?? TIPS.pomodoro;
}

/** Hour-tier feedback carried over from the student reports. */
export function tierMessage(plannedHoursToday: number): { text: string; tone: CushionLevel } {
  if (plannedHoursToday === 0) return { text: 'Rest day — nothing planned.', tone: 'green' };
  if (plannedHoursToday < 2)
    return { text: 'Light day. If an exam is close, consider adding a block.', tone: 'amber' };
  if (plannedHoursToday <= 5)
    return { text: 'Balanced day — steady and sustainable.', tone: 'green' };
  return { text: 'Heavy day. Protect your breaks and sleep.', tone: 'amber' };
}

/* ------------------------------------------------------------------ */
/* M5 — streak + progress                                              */
/* ------------------------------------------------------------------ */

/** Consecutive days (ending today or yesterday) with at least one done/partial block. */
export function computeStreak(doneDates: Set<string>, today: string): number {
  let streak = 0;
  let cursor = doneDates.has(today) ? today : addDays(today, -1);
  while (doneDates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

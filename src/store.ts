/**
 * All mutations live here. Each helper is one atomic Dexie transaction,
 * so two rapid taps can never interleave a stale read-modify-write —
 * the exact race that froze buttons on the Ibadah Index Today screen.
 */
import { db, DEFAULT_SETTINGS, SUBJECT_COLORS, type Subject, type Settings } from './db';
import {
  buildSchedule,
  redistribute,
  toISO,
  type Difficulty,
  type PlannedBlock,
  type StudyMethod,
} from './engine';

export const todayISO = () => toISO(new Date());

/* ---------------- settings ---------------- */

export async function getOrInitSettings(): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get('settings');
    if (s) return s;
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  });
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
    await db.settings.put({ ...s, ...patch, id: 'settings' });
  });
}

/* ---------------- subjects ---------------- */

export async function addSubject(input: {
  name: string;
  difficulty: Difficulty;
  deadline: string | null;
  weeklyHours: number | null;
}): Promise<void> {
  await db.transaction('rw', db.subjects, async () => {
    const count = await db.subjects.count();
    if (count >= 8) throw new Error('subject-cap'); // V5 (relaxed from 5 to 8)
    const subject: Subject = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      difficulty: input.difficulty,
      deadline: input.deadline,
      weeklyHours: input.weeklyHours,
      color: SUBJECT_COLORS[count % SUBJECT_COLORS.length],
      createdAt: Date.now(),
    };
    await db.subjects.put(subject);
  });
}

export async function updateSubject(id: string, patch: Partial<Subject>): Promise<void> {
  await db.transaction('rw', db.subjects, async () => {
    await db.subjects.update(id, patch);
  });
}

export async function removeSubject(id: string): Promise<void> {
  await db.transaction('rw', db.subjects, db.blocks, async () => {
    await db.subjects.delete(id);
    await db.blocks.where('subjectId').equals(id).delete();
  });
}

/* ---------------- plan generation ---------------- */

export async function generatePlan(): Promise<number> {
  return db.transaction('rw', db.subjects, db.settings, db.blocks, async () => {
    const subjects = await db.subjects.toArray();
    const settings = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
    const today = todayISO();

    const blocks = buildSchedule(subjects, settings.availability, today, settings.spacedRep);

    // Replace only current + future blocks; completed history stays intact.
    await db.blocks.where('date').aboveOrEqual(today).delete();
    await db.blocks.bulkPut(blocks);
    await db.settings.put({ ...settings, planGeneratedAt: today, id: 'settings' });
    return blocks.length;
  });
}

/* ---------------- block actions (M3) ---------------- */

export async function markDone(blockId: string): Promise<void> {
  await db.transaction('rw', db.blocks, async () => {
    const b = await db.blocks.get(blockId);
    if (!b || b.status === 'done') return; // idempotent — double-tap safe
    await db.blocks.put({ ...b, status: 'done', doneMinutes: b.minutes });
  });
}

/**
 * Skip or partially complete a block; unfinished minutes flow into
 * future spare capacity in the same transaction (A5).
 * Returns minutes that found no home so the UI can say so honestly.
 */
export async function markSkippedOrPartial(
  blockId: string,
  doneMinutes: number,
): Promise<number> {
  return db.transaction('rw', db.blocks, db.settings, async () => {
    const b = await db.blocks.get(blockId);
    if (!b || b.status === 'done' || b.status === 'skipped') return 0;

    const settings = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
    const clampedDone = Math.max(0, Math.min(doneMinutes, b.minutes));
    const lost = b.minutes - clampedDone;

    await db.blocks.put({
      ...b,
      status: clampedDone > 0 ? 'partial' : 'skipped',
      doneMinutes: clampedDone,
    });

    if (lost <= 0 || b.kind === 'review') return 0; // reviews don't cascade

    const all = await db.blocks.where('date').aboveOrEqual(todayISO()).toArray();
    const { upserts, unplacedMinutes } = redistribute(
      lost,
      b.subjectId,
      all,
      settings.availability,
      todayISO(),
    );
    if (upserts.length) await db.blocks.bulkPut(upserts as PlannedBlock[]);
    return unplacedMinutes;
  });
}

export async function undoBlock(blockId: string): Promise<void> {
  await db.transaction('rw', db.blocks, async () => {
    const b = await db.blocks.get(blockId);
    if (!b) return;
    await db.blocks.put({ ...b, status: 'planned', doneMinutes: 0 });
  });
}

/* ---------------- danger zone ---------------- */

export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.subjects, db.blocks, db.settings, async () => {
    await Promise.all([db.subjects.clear(), db.blocks.clear(), db.settings.clear()]);
    await db.settings.put(DEFAULT_SETTINGS);
  });
}

export type { StudyMethod };

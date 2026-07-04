/**
 * Database layer. IndexedDB via Dexie is the single source of truth.
 *
 * Architecture rule (learned the hard way on Ibadah Index):
 *   - Components NEVER hold app data in useState.
 *   - Reads go through useLiveQuery, writes through the store helpers
 *     in store.ts, each one an atomic transaction.
 *   - The schema is versioned from day one; any future shape change
 *     gets a .version(n+1).upgrade() migration, never a silent break.
 */
import Dexie, { type Table } from 'dexie';
import type { Difficulty, PlannedBlock, StudyMethod } from './engine';

export interface Subject {
  id: string;
  name: string;
  difficulty: Difficulty;
  deadline: string | null;
  weeklyHours: number | null;
  color: string;
  createdAt: number;
}

export interface Settings {
  id: 'settings'; // singleton row
  /** hours available per weekday, index 0=Sun … 6=Sat */
  availability: number[];
  method: StudyMethod;
  spacedRep: boolean;
  planGeneratedAt: string | null; // ISO date of last generation
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  availability: [3, 2, 2, 2, 2, 1, 3],
  method: 'pomodoro',
  spacedRep: true,
  planGeneratedAt: null,
};

class RakkizDB extends Dexie {
  subjects!: Table<Subject, string>;
  blocks!: Table<PlannedBlock, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('rakkiz');
    this.version(1).stores({
      subjects: 'id, name, deadline',
      blocks: 'id, date, subjectId, status, [date+order]',
      settings: 'id',
    });
    // v2+ migrations go here with .upgrade() — never change v1 in place.
  }
}

export const db = new RakkizDB();

/** Subject accent palette — assigned round-robin, dark-theme tuned. */
export const SUBJECT_COLORS = [
  '#F0A02E', // saffron
  '#5EA0FF', // sky
  '#35C48D', // mint
  '#C98BFF', // lilac
  '#FF8A7A', // coral
  '#63D8E0', // cyan
  '#F2C14E', // gold
  '#8FA8FF', // periwinkle
];

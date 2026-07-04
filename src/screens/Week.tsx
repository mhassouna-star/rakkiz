import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Subject } from '../db';
import { addDays, HORIZON_DAYS, type PlannedBlock } from '../engine';
import { todayISO } from '../store';

function dayTitle(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
}

export default function Week() {
  const today = todayISO();
  const end = addDays(today, HORIZON_DAYS - 1);

  const blocks = useLiveQuery(
    () => db.blocks.where('date').between(today, end, true, true).toArray(),
    [today, end],
    [] as PlannedBlock[],
  );
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], [] as Subject[]);

  const byId = useMemo(() => {
    const m = new Map<string, Subject>();
    subjects.forEach((s) => m.set(s.id, s));
    return m;
  }, [subjects]);

  const byDay = useMemo(() => {
    const m = new Map<string, PlannedBlock[]>();
    for (let i = 0; i < HORIZON_DAYS; i++) m.set(addDays(today, i), []);
    for (const b of blocks) m.get(b.date)?.push(b);
    m.forEach((list) => list.sort((a, b) => a.order - b.order));
    return m;
  }, [blocks, today]);

  const totalMin = blocks.filter((b) => b.status !== 'skipped').reduce((a, b) => a + b.minutes, 0);

  return (
    <>
      <h1 className="screen-title">This week</h1>
      <p className="screen-sub">
        {blocks.length === 0
          ? 'No plan yet — generate one from the Planner tab.'
          : `${blocks.length} sessions · ${Math.round((totalMin / 60) * 10) / 10} hours planned`}
      </p>

      {[...byDay.entries()].map(([date, list]) => {
        const dayMin = list.filter((b) => b.status !== 'skipped').reduce((a, b) => a + b.minutes, 0);
        return (
          <section className="week-day" key={date}>
            <div className="week-day-head">
              <span>{dayTitle(date, today)}</span>
              <span className="sub">
                {date.slice(5)} · {dayMin ? `${Math.round((dayMin / 60) * 10) / 10}h` : 'free'}
              </span>
            </div>
            {list.length === 0 ? (
              <div className="empty-day">No sessions</div>
            ) : (
              list.map((b) => {
                const s = byId.get(b.subjectId);
                return (
                  <div
                    className="mini-block"
                    key={b.id}
                    style={{ opacity: b.status === 'skipped' ? 0.4 : b.status === 'done' ? 0.55 : 1 }}
                  >
                    <span className="dot" style={{ background: s?.color ?? 'var(--muted)' }} />
                    <span>
                      {s?.name ?? 'Subject'}
                      {b.kind === 'review' && ' · review'}
                      {b.status === 'done' && ' ✓'}
                    </span>
                    <span className="min">{b.minutes}m</span>
                  </div>
                );
              })
            )}
          </section>
        );
      })}
    </>
  );
}

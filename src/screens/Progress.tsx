import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Subject } from '../db';
import { addDays, computeStreak, HORIZON_DAYS, type PlannedBlock } from '../engine';
import { resetAll, todayISO } from '../store';

export default function Progress() {
  const today = todayISO();
  const weekEnd = addDays(today, HORIZON_DAYS - 1);
  const [confirming, setConfirming] = useState(false);

  const weekBlocks = useLiveQuery(
    () => db.blocks.where('date').between(today, weekEnd, true, true).toArray(),
    [today, weekEnd],
    [] as PlannedBlock[],
  );
  // Streak looks back 60 days — bounded query, never a full-table scan.
  const historyBlocks = useLiveQuery(
    () => db.blocks.where('date').between(addDays(today, -60), today, true, true).toArray(),
    [today],
    [] as PlannedBlock[],
  );
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], [] as Subject[]);

  const streak = useMemo(() => {
    const doneDates = new Set(
      historyBlocks.filter((b) => b.doneMinutes > 0).map((b) => b.date),
    );
    return computeStreak(doneDates, today);
  }, [historyBlocks, today]);

  const { plannedMin, doneMin } = useMemo(() => {
    let p = 0, d = 0;
    for (const b of weekBlocks) {
      if (b.status !== 'skipped') p += b.minutes;
      d += b.doneMinutes;
    }
    return { plannedMin: p, doneMin: d };
  }, [weekBlocks]);

  const perSubject = useMemo(() => {
    return subjects
      .map((s) => {
        let p = 0, d = 0;
        for (const b of weekBlocks) {
          if (b.subjectId !== s.id) continue;
          if (b.status !== 'skipped') p += b.minutes;
          d += b.doneMinutes;
        }
        return { s, p, d, pct: p > 0 ? Math.min(1, d / p) : 0 };
      })
      .filter((r) => r.p > 0);
  }, [subjects, weekBlocks]);

  const weekPct = plannedMin > 0 ? Math.round((doneMin / plannedMin) * 100) : 0;

  return (
    <>
      <h1 className="screen-title">Progress</h1>
      <p className="screen-sub">The week at a glance.</p>

      <div className="stat-grid">
        <div className="stat">
          <div className="val flame">{streak}🔥</div>
          <div className="lbl">day streak</div>
        </div>
        <div className="stat">
          <div className="val">{weekPct}%</div>
          <div className="lbl">of planned hours done</div>
        </div>
      </div>

      <div className="card">
        <h3>Subjects this week</h3>
        {perSubject.length === 0 ? (
          <p className="screen-sub" style={{ margin: 0 }}>
            Nothing planned yet.
          </p>
        ) : (
          perSubject.map(({ s, p, d, pct }) => (
            <div className="pbar-row" key={s.id}>
              <div className="pbar-head">
                <span>{s.name}</span>
                <span className="pct">
                  {Math.round(d / 6) / 10}h / {Math.round(p / 6) / 10}h
                </span>
              </div>
              <div className="pbar">
                <div style={{ background: s.color, transform: `scaleX(${pct})` }} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3>Data</h3>
        <p className="screen-sub" style={{ marginBottom: 12 }}>
          Everything is stored on this device only. Nothing leaves your phone.
        </p>
        {confirming ? (
          <div className="row">
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => void resetAll().then(() => setConfirming(false))}>
              Yes, erase everything
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => setConfirming(true)}>
            Reset all data
          </button>
        )}
      </div>
    </>
  );
}

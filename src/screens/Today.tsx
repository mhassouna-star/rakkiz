import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type Subject } from '../db';
import { tierMessage, tipsFor } from '../engine';
import { markDone, markSkippedOrPartial, todayISO, undoBlock } from '../store';

export default function Today({
  toast,
  goPlan,
}: {
  toast: (m: string) => void;
  goPlan: () => void;
}) {
  const today = todayISO();

  const blocks = useLiveQuery(
    () => db.blocks.where('date').equals(today).sortBy('order'),
    [today],
    undefined, // undefined = still loading; [] = genuinely empty
  );
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const settings = useLiveQuery(() => db.settings.get('settings'), []) ?? DEFAULT_SETTINGS;

  const byId = useMemo(() => {
    const m = new Map<string, Subject>();
    (subjects ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [subjects]);

  const plannedMin = (blocks ?? []).reduce((a, b) => a + b.minutes, 0);
  const doneMin = (blocks ?? []).reduce((a, b) => a + b.doneMinutes, 0);
  const tier = tierMessage(plannedMin / 60);
  const tips = tipsFor(settings.method);

  async function onSkip(id: string) {
    const unplaced = await markSkippedOrPartial(id, 0);
    toast(
      unplaced > 0
        ? `Skipped — ${unplaced} min couldn't fit this week`
        : 'Skipped — time moved to later this week',
    );
  }

  async function onPartial(id: string, half: number) {
    const unplaced = await markSkippedOrPartial(id, half);
    toast(unplaced > 0 ? 'Logged — some minutes could not be replaced' : 'Half logged, rest rescheduled');
  }

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  if (blocks === undefined) return null; // one frame while IndexedDB opens

  return (
    <>
      <h1 className="screen-title">Today</h1>
      <p className="screen-sub">{dateLabel}</p>

      {blocks.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">🗓</div>
          <p>
            No sessions today.
            <br />
            Build this week&apos;s plan to get started.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={goPlan}>
            Open planner
          </button>
        </div>
      ) : (
        <>
          <div className="day-summary">
            <div className="big-num">
              {Math.round((doneMin / 60) * 10) / 10}
              <small> / {Math.round((plannedMin / 60) * 10) / 10} h</small>
            </div>
          </div>
          <div className={`notice ${tier.tone}`}>{tier.text}</div>

          {blocks.map((b) => {
            const s = byId.get(b.subjectId);
            const open = b.status === 'planned';
            return (
              <div
                key={b.id}
                className={`block-card ${b.status === 'done' ? 'done' : ''} ${b.status === 'skipped' ? 'skipped' : ''}`}
                style={{ borderLeftColor: s?.color ?? 'var(--line)' }}
              >
                <div className="block-body">
                  <div className="row spread">
                    <span className="block-name">{s?.name ?? 'Subject'}</span>
                    {b.kind === 'review' ? (
                      <span className="badge review">Review</span>
                    ) : (
                      <span className="badge">{b.minutes} min</span>
                    )}
                  </div>
                  <div className="block-meta">
                    {b.kind === 'review'
                      ? `${b.minutes} min · recall what you studied earlier`
                      : b.status === 'partial'
                        ? `${b.doneMinutes} of ${b.minutes} min done`
                        : `Focused session`}
                  </div>

                  {open ? (
                    <div className="block-actions">
                      <button className="chip ok" onClick={() => void markDone(b.id)}>
                        ✓ Done
                      </button>
                      {b.kind === 'study' && b.minutes >= 40 && (
                        <button
                          className="chip"
                          onClick={() => void onPartial(b.id, Math.round(b.minutes / 2 / 5) * 5)}
                        >
                          ½ Half
                        </button>
                      )}
                      <button className="chip warn" onClick={() => void onSkip(b.id)}>
                        Skip
                      </button>
                    </div>
                  ) : (
                    <div className="block-actions">
                      <button className="chip" onClick={() => void undoBlock(b.id)}>
                        Undo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="card" style={{ marginTop: 18 }}>
            <h3>Tips · {settings.method.replace('-', ' ')}</h3>
            <ul className="tips-list">
              {tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

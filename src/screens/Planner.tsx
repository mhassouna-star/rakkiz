import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from '../db';
import {
  feasibility,
  METHOD_LABEL,
  type Difficulty,
  type StudyMethod,
} from '../engine';
import {
  addSubject,
  generatePlan,
  removeSubject,
  updateSettings,
} from '../store';
import Gauge from '../components/Gauge';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DIFF_LABELS: Record<Difficulty, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

export default function Planner({
  toast,
  goToday,
}: {
  toast: (m: string) => void;
  goToday: () => void;
}) {
  const subjects = useLiveQuery(
    async () => (await db.subjects.toArray()).sort((a, b) => a.createdAt - b.createdAt),
    [],
    [],
  );
  const settings = useLiveQuery(() => db.settings.get('settings'), []) ?? DEFAULT_SETTINGS;

  // Form state is the ONLY local state — app data itself lives in Dexie.
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(2);
  const [deadline, setDeadline] = useState('');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);

  const feas = useMemo(
    () => feasibility(subjects ?? [], settings.availability),
    [subjects, settings.availability],
  );

  const canAdd = name.trim().length > 0;
  const canGenerate = (subjects?.length ?? 0) > 0 && feas.capacityMin > 0;

  async function onAdd() {
    if (!canAdd) return;
    const h = hours.trim() === '' ? null : Math.max(0.5, Math.min(60, Number(hours)));
    if (h !== null && Number.isNaN(h)) { toast('Hours must be a number'); return; }
    try {
      await addSubject({
        name,
        difficulty,
        deadline: deadline || null,
        weeklyHours: h,
      });
      setName(''); setDeadline(''); setHours(''); setDifficulty(2);
    } catch (e) {
      toast(e instanceof Error && e.message === 'subject-cap'
        ? 'Keep it realistic — 8 subjects max.'
        : 'Could not add subject.');
    }
  }

  async function onGenerate() {
    if (!canGenerate || busy) return;
    setBusy(true);
    try {
      const n = await generatePlan();
      toast(`Plan ready — ${n} sessions scheduled`);
      goToday();
    } finally {
      setBusy(false);
    }
  }

  function setAvail(idx: number, val: string) {
    const v = Math.max(0, Math.min(12, Number(val) || 0));
    const next = [...settings.availability];
    next[idx] = v;
    void updateSettings({ availability: next });
  }

  return (
    <>
      <div className="hero-brand">
        <div className="mark">R</div>
        <div className="word">Rakkiz</div>
      </div>
      <h1 className="screen-title">Plan the week</h1>
      <p className="screen-sub">Subjects in, honest schedule out.</p>

      {/* ---- Signature element: the cushion gauge (M1) ---- */}
      <div className="card">
        <h3>Can you actually do all this?</h3>
        <Gauge feas={feas} />
      </div>

      {/* ---- Subjects ---- */}
      <div className="card">
        <h3>Subjects · {subjects?.length ?? 0}</h3>
        <div className="stack">
          {(subjects ?? []).map((s) => (
            <div className="subject-row" key={s.id}>
              <span className="dot" style={{ background: s.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{s.name}</div>
                <div className="meta">
                  {DIFF_LABELS[s.difficulty]}
                  {s.weeklyHours != null && ` · ${s.weeklyHours}h/wk`}
                  {s.deadline && ` · exam ${s.deadline.slice(5)}`}
                </div>
              </div>
              <button
                className="icon-btn"
                aria-label={`Remove ${s.name}`}
                onClick={() => void removeSubject(s.id)}
              >
                ✕
              </button>
            </div>
          ))}

          <div className="field">
            <label htmlFor="sname">Subject name</label>
            <input
              id="sname"
              value={name}
              placeholder="e.g. Data Analysis"
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void onAdd()}
            />
          </div>
          <div className="field">
            <label>Difficulty</label>
            <div className="seg" role="group" aria-label="Difficulty">
              {([1, 2, 3] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={difficulty === d ? 'on' : ''}
                  onClick={() => setDifficulty(d)}
                >
                  {DIFF_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="sdead">Exam date</label>
              <input id="sdead" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div className="field" style={{ width: 110 }}>
              <label htmlFor="shrs">Hrs / week</label>
              <input
                id="shrs"
                inputMode="decimal"
                placeholder="auto"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => void onAdd()} disabled={!canAdd}>
            + Add subject
          </button>
        </div>
      </div>

      {/* ---- Availability (M4, simplified weekly grid) ---- */}
      <div className="card">
        <h3>Free hours per day</h3>
        <div className="avail-grid">
          {settings.availability.map((h, i) => (
            <div className="avail-cell" key={i}>
              <span>{DAY_LABELS[i]}</span>
              <input
                type="number"
                min={0}
                max={12}
                step={0.5}
                value={h}
                aria-label={`${DAY_LABELS[i]} free hours`}
                onChange={(e) => setAvail(i, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ---- Method + spaced repetition ---- */}
      <div className="card">
        <h3>How you study</h3>
        <div className="stack">
          <div className="field">
            <label htmlFor="method">Method</label>
            <select
              id="method"
              value={settings.method}
              onChange={(e) => void updateSettings({ method: e.target.value as StudyMethod })}
            >
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="row spread">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Review blocks</div>
              <div className="meta" style={{ fontSize: 12, color: 'var(--muted)' }}>
                Auto-schedule reviews 1 &amp; 3 days after first study
              </div>
            </div>
            <div className="seg" style={{ width: 120 }}>
              <button
                className={settings.spacedRep ? 'on' : ''}
                onClick={() => void updateSettings({ spacedRep: true })}
              >
                On
              </button>
              <button
                className={!settings.spacedRep ? 'on' : ''}
                onClick={() => void updateSettings({ spacedRep: false })}
              >
                Off
              </button>
            </div>
          </div>
        </div>
      </div>

      <button className="btn btn-primary" disabled={!canGenerate || busy} onClick={() => void onGenerate()}>
        {busy ? 'Building…' : settings.planGeneratedAt ? 'Regenerate plan' : 'Generate plan'}
      </button>
      {feas.level === 'red' && canGenerate && (
        <p className="screen-sub" style={{ marginTop: 10 }}>
          Over capacity: the plan will protect urgent and hard subjects and trim the rest.
        </p>
      )}
    </>
  );
}

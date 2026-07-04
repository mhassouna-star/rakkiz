import type { Feasibility } from '../engine';

const fmt = (min: number) => {
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const VERDICT: Record<Feasibility['level'], string> = {
  green: 'Comfortable — this fits with room to breathe.',
  amber: 'Tight — it fits, but nothing can slip.',
  red: 'Over capacity — trim subjects or add hours.',
};

/**
 * The Cushion Gauge (spec M1 / O7). Fill = share of weekly capacity
 * the plan consumes; scaleX animation only, so it never causes layout.
 */
export default function Gauge({ feas }: { feas: Feasibility }) {
  const load = feas.capacityMin > 0 ? Math.min(1, feas.neededMin / feas.capacityMin) : 1;
  return (
    <div className="gauge">
      <div
        className="gauge-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={feas.capacityMin}
        aria-valuenow={Math.min(feas.neededMin, feas.capacityMin)}
        aria-label="Weekly study load versus available time"
      >
        <div className={`gauge-fill ${feas.level}`} style={{ transform: `scaleX(${load})` }} />
      </div>
      <div className="gauge-verdict">
        <span className={`tone-${feas.level}`}>
          <strong>{VERDICT[feas.level]}</strong>
        </span>
      </div>
      <div className="gauge-verdict">
        <span>Need {fmt(feas.neededMin)} · have {fmt(feas.capacityMin)}</span>
        <span className={`tone-${feas.level}`}>
          {feas.cushionMin >= 0 ? `+${fmt(feas.cushionMin)} spare` : `${fmt(feas.cushionMin)} short`}
        </span>
      </div>
    </div>
  );
}

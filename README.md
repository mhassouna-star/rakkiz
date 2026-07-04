# Rakkiz · Study Planner PWA

A mobile-first study planner that answers one question before anything else:
**"Can you actually do all this?"** — then builds a week that fits.

Implements the *AI Study Planner Specification v1.1* Must scope:

| Spec ID | Feature | Where |
|---|---|---|
| Engine 1–3 | Priority allocation · schedule generation · method tips | `src/engine.ts` |
| M1 / O7 / V7 | Cushion feasibility gauge (green/amber/red), shown live before generating | Planner screen |
| M2 / A6 | Auto-inserted spaced-repetition review blocks (+1, +3 days) | engine `injectReviews` |
| M3 / A5 | Done / Half / Skip with automatic redistribution of lost minutes | Today screen + `redistribute` |
| M5 | Day streak, weekly %, per-subject progress bars | Progress screen |
| V1–V5 | Input validation (required name, hour bounds, subject cap) | Planner + store |
| N4 | Plan input in under 60 seconds | 4 fields, 3 optional |

## Stack

React 18 · TypeScript · Vite · Dexie (IndexedDB) · hand-rolled CSS (no framework).
~93 KB gzip total, screens lazy-loaded (1–2.5 KB each). 100% offline, 100% on-device data.

## Architecture rules (why it can't freeze)

1. **IndexedDB is the single source of truth.** Components never keep app
   data in `useState`; reads are reactive `useLiveQuery`, writes are the
   helpers in `store.ts`. There is no read-modify-write in the UI, so the
   stale-closure race class is structurally impossible.
2. **Every mutation is one atomic Dexie transaction** and idempotent
   (double-tapping Done is a no-op).
3. **Versioned schema from day one** (`db.ts`). Any future shape change is a
   `.version(2).upgrade()` migration — never an in-place edit of v1.
4. **`overscroll-behavior: none`** — browser pull-to-refresh cannot fire, so
   the "refresh ate my data" scare cannot happen.
5. **Pure engine** (`engine.ts`): deterministic, O(subjects × days),
   microsecond-scale; tested standalone with Node.
6. **Compositor-only animations** (`transform`/`opacity` with
   `will-change`), `touch-action: manipulation`, 44 px targets, safe-area
   insets, `prefers-reduced-motion` respected.
7. **Service worker is network-first for app code** (no stale deploys),
   cache-first for fonts, offline fallback to cache.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
```

## Deploy to Netlify (same flow as Ibadah Index)

1. Push this folder to a GitHub repo.
2. Netlify → Add new site → Import from GitHub.
3. **Build command:** `npm run build`  (mind the space)
4. **Publish directory:** `dist`
5. **Base directory:** set it to the folder name **only if** the project sits
   one level deep in the repo (e.g. `rakkiz`); leave blank if it's at the root.
6. Deploy. Open on the phone → browser menu → **Add to Home Screen** to
   install as an app.

## Roadmap hooks already in place

- `db.ts` v2 migration slot → cloud sync / multi-device later.
- `engine.ts` `REVIEW_OFFSETS` → add the +7 review when the horizon extends.
- Availability array → swap for a full blocked-hours grid (spec F12) without
  touching the engine API.
- Wraps cleanly in Capacitor for Play Store distribution, same as planned
  for Ibadah Index.

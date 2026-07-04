import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { getOrInitSettings } from './store';
import ErrorBoundary from './components/ErrorBoundary';

/* Each screen is its own chunk: first paint ships only the shell +
   the active tab. Same code-splitting pattern that cut Ibadah Index
   from 697 KB to 293 KB gzip. */
const Planner = lazy(() => import('./screens/Planner'));
const Today = lazy(() => import('./screens/Today'));
const Week = lazy(() => import('./screens/Week'));
const Progress = lazy(() => import('./screens/Progress'));

type Tab = 'today' | 'plan' | 'week' | 'progress';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'today', label: 'Today', glyph: '☀' },
  { id: 'plan', label: 'Planner', glyph: '✎' },
  { id: 'week', label: 'Week', glyph: '▦' },
  { id: 'progress', label: 'Progress', glyph: '↗' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  useEffect(() => {
    void getOrInitSettings(); // seed defaults on first run
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  return (
    <>
      <main className="app-main">
        <ErrorBoundary key={tab}>
        <Suspense fallback={<div className="empty-state"><div className="glyph">◐</div></div>}>
          {tab === 'today' && <Today toast={showToast} goPlan={() => setTab('plan')} />}
          {tab === 'plan' && <Planner toast={showToast} goToday={() => setTab('today')} />}
          {tab === 'week' && <Week />}
          {tab === 'progress' && <Progress />}
        </Suspense>
        </ErrorBoundary>
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="glyph" aria-hidden>{t.glyph}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

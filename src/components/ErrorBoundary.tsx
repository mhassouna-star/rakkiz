import { Component, type ReactNode } from 'react';

/**
 * Safety net: if any screen throws (bad query, failed lazy chunk after
 * a redeploy, corrupted record), show a recoverable message instead of
 * unmounting to a blank page.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-state">
          <div className="glyph">⚠</div>
          <p>
            Something went wrong on this screen.
            <br />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{this.state.error}</span>
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            onClick={() => location.reload()}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

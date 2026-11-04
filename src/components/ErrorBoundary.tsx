import React from 'react';

/** Keeps one failing panel from blanking the whole terminal. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; label?: string; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  componentDidCatch(error: Error) { console.error('[ui]', this.props.label, error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page"><div className="card"><div className="bd">
        <h2>Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}</h2>
        <p className="small muted">{this.state.error.message}</p>
        <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div></div></div>
    );
  }
}

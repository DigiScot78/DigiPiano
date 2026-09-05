import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep diagnostics local until an error-reporting vendor and retention policy are approved.
    console.error("DigiPiano encountered an unexpected error.", error, info);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <section>
          <p className="eyebrow">Something went wrong</p>
          <h1>The app needs a fresh start</h1>
          <p>Your score stays on this computer. Reload the page to reopen the app, then select the score again if needed.</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>Reload DigiPiano</button>
        </section>
      </main>
    );
  }
}

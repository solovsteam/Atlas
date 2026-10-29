import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { error: Error | null };

/**
 * Without this, an error in one page unmounts the whole app and leaves a
 * blank screen. With it, the header and navigation stay, and the page shows
 * the message, which also makes the error easy to report.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <section className="rounded-xl border border-red-900 p-4" role="alert">
        <h1 className="text-lg font-semibold text-red-200">This page stopped because of an error.</h1>
        <p className="mt-2 break-words font-mono text-sm text-red-300">{this.state.error.message}</p>
        <button
          className="mt-4 rounded-full border border-neutral-600 px-4 py-2 text-sm text-neutral-200 hover:border-white"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </section>
    );
  }
}

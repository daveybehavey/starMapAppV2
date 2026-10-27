"use client";

/**
 * SQ-58 / issue #429 — React error boundary for the editor surface.
 *
 * Catches render crashes inside the editor tree, reports them through the
 * scrubbed browser pipeline with the fixed `browser_react_boundary` code,
 * and offers a retry that remounts the subtree. Scoped to the editor on
 * purpose: static marketing pages keep Next's default error handling.
 */
import { Component, Fragment, type ReactNode } from "react";
import { reportBrowserError } from "@/lib/sentryBrowser";

type SentryBoundaryProps = {
  children: ReactNode;
};

type SentryBoundaryState = {
  hasError: boolean;
  resetKey: number;
};

export default class SentryBoundary extends Component<SentryBoundaryProps, SentryBoundaryState> {
  state: SentryBoundaryState = { hasError: false, resetKey: 0 };

  static getDerivedStateFromError(): Partial<SentryBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    reportBrowserError(error, "browser_react_boundary");
  }

  private handleReset = (): void => {
    this.setState((state) => ({ hasError: false, resetKey: state.resetKey + 1 }));
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
    }
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-white">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-6 shadow-lg shadow-black/30 backdrop-blur">
          <p className="text-xs font-semibold tracking-[0.2em] text-amber-200 uppercase">
            Something went wrong
          </p>
          <h2 className="mt-2 text-2xl font-semibold">The editor hit a snag</h2>
          <p className="mt-3 text-sm text-neutral-200">
            Your design is saved as you work, so retrying will not lose it.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="text-midnight rounded-full border border-amber-300 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}

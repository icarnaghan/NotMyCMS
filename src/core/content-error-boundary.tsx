import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches rendering errors in an article so a broken Markdown file does not crash the
 * whole app. The theme supplies what to show instead.
 */
export class ContentErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_: Error, info: ErrorInfo) {
    console.error("Content render error:", info);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

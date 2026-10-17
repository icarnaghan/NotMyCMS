/**
 * Vitest setup for React component tests.
 *
 * Loaded only for tests matching the `component` project in `vite.config.ts`. The pure
 * TypeScript suites keep running in the default Node environment, because starting a
 * jsdom instance for a function that formats a date is wasted time — and the pure tests
 * are the large majority.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// RTL only auto-cleans when a global `afterEach` exists, which depends on
// `globals: true`. This project does not set that, so unmount explicitly — otherwise
// every test accumulates the previous test's DOM and `getByText` starts finding two
// matches for no obvious reason.
afterEach(() => {
  cleanup();
});

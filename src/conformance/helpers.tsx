/**
 * Helpers for conformance tests. They query by role and text only, so the same test can
 * run against any theme. Where themes legitimately differ (a control that is a button in
 * one theme and a link in another), the helper accepts either.
 */
import { Suspense, type ReactNode } from "react";
import { expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import activeTheme from "@theme";
import type { Block } from "../lib/page-schema";

/**
 * Renders a block through the active theme's registry, inside a router with observable
 * destinations. Theme blocks load lazily, so this waits for the Suspense fallback to go.
 */
export async function mountBlock(block: Block) {
  const View = activeTheme.blocks[block.type];
  const result = render(
    <MemoryRouter initialEntries={["/start"]}>
      <Suspense fallback={<p>loading block</p>}>
        <Routes>
          <Route path="/start" element={<View block={block} />} />
          <Route path="/posts" element={<p>posts page</p>} />
          <Route path="/somewhere" element={<p>somewhere page</p>} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.queryByText("loading block")).not.toBeInTheDocument());
  return result;
}

/** An element a visitor clicks to go somewhere or act: a link or a button, by name. */
export function clickable(name: string | RegExp, scope: HTMLElement = document.body) {
  const q = within(scope);
  const found = [...q.queryAllByRole("link", { name }), ...q.queryAllByRole("button", { name })];
  if (found.length === 0) {
    throw new Error(`No link or button named ${String(name)}`);
  }
  return found[0];
}

export function renderAt(ui: ReactNode, url = "/") {
  return render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);
}

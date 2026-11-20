/**
 * Tailwind-theme tests: behavior specific to this theme's own controls, which the shared
 * conformance suite cannot see because other themes build them differently. Runs only in
 * the `component-tailwind` project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { STORAGE_KEYS } from "../../lib/settings-preferences";
import { siteConfig } from "../../lib/site-config";
import { stubBrowser } from "../../test/site-fixtures";
import { applySettings } from "./apply-settings";
import html from "./head.html?raw";

function stubStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
  return store;
}

beforeEach(() => {
  stubBrowser();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
});

async function visit(url: string) {
  window.history.pushState({}, "", url);
  render(<App />);
  await screen.findByRole("banner");
}

describe("settings menu", () => {
  it("offers color mode, text size and privacy, and no density", async () => {
    stubStorage();
    await visit("/");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    const modes = screen.getByRole("group", { name: "Color mode" });
    for (const label of ["Light", "Dark", "System"]) {
      expect(within(modes).getByRole("radio", { name: label })).toBeInTheDocument();
    }
    const sizes = screen.getByRole("group", { name: "Text size" });
    for (const label of ["Default", "Large", "Larger"]) {
      expect(within(sizes).getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: "Don't track my visits" })).toBeInTheDocument();
    expect(screen.queryByText("Density")).not.toBeInTheDocument();
  });

  it("applies and remembers a color mode", async () => {
    const store = stubStorage();
    await visit("/");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(store[STORAGE_KEYS.theme]).toBe("dark");

    await userEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("applies and remembers a text size", async () => {
    const store = stubStorage();
    await visit("/");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    await userEvent.click(screen.getByRole("radio", { name: "Larger" }));

    expect(document.documentElement.style.fontSize).toBe("125%");
    expect(store[STORAGE_KEYS.textSize]).toBe("larger");
  });

  it("closes on Escape and returns focus to the button that opened it", async () => {
    stubStorage();
    await visit("/");
    const button = screen.getByRole("button", { name: "Settings" });
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("closes when focus moves out of it", async () => {
    stubStorage();
    await visit("/");
    const button = screen.getByRole("button", { name: "Settings" });
    await userEvent.click(button);

    screen.getByRole("button", { name: "Search" }).focus();

    await waitFor(() => expect(button).toHaveAttribute("aria-expanded", "false"));
  });
});

describe("dialogs", () => {
  it("opens search with focus in the search field", async () => {
    stubStorage();
    await visit("/");

    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    const dialog = await screen.findByRole("dialog", { name: "Search" });
    expect(within(dialog).getByRole("searchbox")).toHaveFocus();
  });

  it("opens and closes the cookie notice", async () => {
    stubStorage();
    await visit("/");

    await userEvent.click(screen.getByRole("button", { name: "Cookies Policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Cookies Policy" });
    expect(dialog).toHaveTextContent("This site uses cookies");

    await userEvent.click(within(dialog).getAllByRole("button", { name: "Close" })[0]);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Cookies Policy" })).not.toBeInTheDocument()
    );
  });
});

describe("navigation", () => {
  it("has a skip link to the main content", async () => {
    stubStorage();
    await visit("/");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });

  it("marks the current page in the navigation", async () => {
    stubStorage();
    await visit("/posts");
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0];
    expect(within(nav).getByRole("link", { name: "Blog Posts" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(nav).getByRole("link", { name: "Knowledge Base" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("opens and closes the small-screen menu, and closes it after navigating", async () => {
    stubStorage();
    await visit("/");
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(1);

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const navs = screen.getAllByRole("navigation", { name: "Main" });
    expect(navs).toHaveLength(2);

    await userEvent.click(within(navs[1]).getByRole("link", { name: "Blog Posts" }));
    await screen.findByRole("heading", { level: 1, name: /Posts/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it.each(["/", "/posts", "/categories", "/post-07", "/about", "/missing-slug"])(
    "has exactly one main landmark on %s",
    async (url) => {
      stubStorage();
      await visit(url);
      await screen.findByRole("heading", { level: 1 });
      expect(screen.getAllByRole("main")).toHaveLength(1);
    }
  );
});

describe("applySettings", () => {
  const base = { colorMode: "system", resolvedMode: "light", density: "comfortable" } as const;

  it("toggles the dark class and color scheme", () => {
    applySettings({ ...base, resolvedMode: "dark", textSize: "default" });
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applySettings({ ...base, textSize: "default" });
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("scales the root font size, and clears it for the default", () => {
    applySettings({ ...base, textSize: "large" });
    expect(document.documentElement.style.fontSize).toBe("112.5%");
    applySettings({ ...base, textSize: "default" });
    expect(document.documentElement.style.fontSize).toBe("");
  });
});

describe("pre-paint script (head.html)", () => {
  const script = html
    .replace(/^[\s\S]*?<script>/, "")
    .replace(/<\/script>[\s\S]*$/, "")
    .replaceAll("{{STORAGE_PREFIX}}", siteConfig.storagePrefix);
  const run = (storage: Record<string, string>, prefersDark = false) => {
    stubStorage(storage);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: prefersDark }));
    new Function(script)();
  };

  it("applies a stored dark mode", () => {
    run({ [STORAGE_KEYS.theme]: "dark" });
    expect(document.documentElement).toHaveClass("dark");
  });

  it("applies a stored light mode even when the system prefers dark", () => {
    run({ [STORAGE_KEYS.theme]: "light" }, true);
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("follows the system preference for system mode and for no stored mode", () => {
    run({ [STORAGE_KEYS.theme]: "system" }, true);
    expect(document.documentElement).toHaveClass("dark");
    document.documentElement.className = "";
    run({}, true);
    expect(document.documentElement).toHaveClass("dark");
    document.documentElement.className = "";
    run({}, false);
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("honors the legacy dark-mode flag, as the app does", () => {
    run({ "blog-dark-mode": "true" });
    expect(document.documentElement).toHaveClass("dark");
  });

  it("applies a stored text size", () => {
    run({ [STORAGE_KEYS.textSize]: "large" });
    expect(document.documentElement.style.fontSize).toBe("112.5%");
    run({ [STORAGE_KEYS.textSize]: "larger" });
    expect(document.documentElement.style.fontSize).toBe("125%");
  });

  it("does not throw when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => new Function(script)()).not.toThrow();
  });

  it("uses the same storage keys as the app", () => {
    expect(script).toContain(STORAGE_KEYS.theme);
    expect(script).toContain(STORAGE_KEYS.textSize);
  });
});

/**
 * The Tailwind shell: a skip link, a header with the site title, navigation (collapsed
 * into a menu on small screens), and buttons for search, the cookie notice and settings.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { TEXT_SIZES, textSizeLabel } from "../../lib/text-size";
import type { ColorMode, ShellView } from "../types";
import { AppLink, Dialog, buttonClass, cx } from "./ui";
import { SearchDialog } from "./search-dialog";

const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const iconButton =
  "inline-flex size-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white";

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  search: "M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z",
  cookie: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
};

/**
 * Closes a popover on Escape, a click outside it, or focus moving out of it. Escape also
 * returns focus to the button that opened it, so keyboard users are not dropped on <body>.
 */
function useDismiss(
  open: boolean,
  close: () => void,
  ref: React.RefObject<HTMLElement | null>,
  trigger: React.RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open, close, ref, trigger]);
}

function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="mb-4">
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-md px-2.5 py-1 text-sm ring-1 ring-inset ring-zinc-300 has-checked:bg-indigo-600 has-checked:text-white has-checked:ring-indigo-600 has-focus-visible:outline-2 has-focus-visible:outline-indigo-600 dark:ring-zinc-700 dark:has-checked:bg-indigo-500"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SettingsMenu({ settings, capabilities }: Pick<ShellView, "settings" | "capabilities">) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const name = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref, button);
  return (
    <div className="relative" ref={ref}>
      <button
        ref={button}
        type="button"
        className={iconButton}
        aria-label="Settings"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon d={ICONS.settings} />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-30 mt-2 w-72 rounded-lg bg-white p-4 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700"
        >
          <RadioGroup
            legend="Color mode"
            name={`${name}-mode`}
            options={capabilities.colorModes.map((m) => ({
              value: m,
              label: COLOR_MODE_LABELS[m],
            }))}
            value={settings.colorMode}
            onChange={settings.onColorModeChange}
          />
          {capabilities.textSize && (
            <RadioGroup
              legend="Text size"
              name={`${name}-size`}
              options={TEXT_SIZES.map((s) => ({ value: s, label: textSizeLabel(s) }))}
              value={settings.textSize}
              onChange={settings.onTextSizeChange}
            />
          )}
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Privacy
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.analyticsOptOut}
                onChange={(e) => settings.onAnalyticsOptOutChange(e.target.checked)}
                className="size-4 accent-indigo-600"
              />
              Don't track my visits
            </label>
          </fieldset>
        </div>
      )}
    </div>
  );
}

const COOKIES_TEXT =
  "This site uses cookies - small text files that are placed on your machine to help the site provide a better user experience. In general, cookies are used to retain user preferences, store information for things like shopping carts, and provide anonymised tracking data to third party applications like Google Analytics. As a rule, cookies will make your browsing experience better. However, you may prefer to disable cookies on this site and on others. The most effective way to do this is to disable cookies in your browser. We suggest consulting the Help section of your browser or taking a look at the About Cookies website which offers guidance for all modern browsers";

export function Shell({ siteTitle, nav, settings, capabilities, search, children }: ShellView) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cookiesOpen, setCookiesOpen] = useState(false);
  const { pathname } = useLocation();
  const menuId = useId();
  // Close the mobile menu after navigating. Adjusted during render rather than in an
  // effect so the old menu state is never painted on the new page.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMenuOpen(false);
  }

  const navLink = (to: string) =>
    cx(
      "rounded-md px-3 py-2 text-sm font-medium",
      pathname === to
        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
    );

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow dark:focus:bg-zinc-900"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <AppLink to="/" className="mr-auto text-base font-bold tracking-tight">
            {siteTitle}
          </AppLink>
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {nav.map((item) => (
                <li key={item.to}>
                  <AppLink
                    to={item.to}
                    className={navLink(item.to)}
                    aria-current={pathname === item.to ? "page" : undefined}
                  >
                    {item.label}
                  </AppLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={iconButton}
              aria-label="Search"
              onClick={search.onOpen}
            >
              <Icon d={ICONS.search} />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label="Cookies Policy"
              onClick={() => setCookiesOpen(true)}
            >
              <Icon d={ICONS.cookie} />
            </button>
            <SettingsMenu settings={settings} capabilities={capabilities} />
            <button
              type="button"
              className={cx(iconButton, "md:hidden")}
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon d={menuOpen ? ICONS.close : ICONS.menu} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id={menuId}
            aria-label="Main"
            className="border-t border-zinc-200 px-4 py-2 md:hidden dark:border-zinc-800"
          >
            <ul className="flex flex-col">
              {nav.map((item) => (
                <li key={item.to}>
                  <AppLink
                    to={item.to}
                    className={cx(navLink(item.to), "block")}
                    aria-current={pathname === item.to ? "page" : undefined}
                  >
                    {item.label}
                  </AppLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <Dialog open={cookiesOpen} onClose={() => setCookiesOpen(false)} title="Cookies Policy">
        <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">{COOKIES_TEXT}</p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className={buttonClass.primary}
            onClick={() => setCookiesOpen(false)}
          >
            Close
          </button>
        </div>
      </Dialog>
      <SearchDialog search={search} />
      {children}
    </>
  );
}

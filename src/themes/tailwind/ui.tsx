/* eslint-disable react-refresh/only-export-components -- a module of small shared view pieces */
/**
 * Small building blocks shared by the Tailwind theme's views. These are the parts
 * Cloudscape provided for free (pagination, the filter input, dialogs, loading state),
 * written with native elements so keyboard and screen-reader behavior comes from the
 * browser rather than from re-implemented ARIA.
 */
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

/** Class strings, joined. Falsy entries are skipped. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const linkClass = "text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300";

/** An internal link. Real `<a href>`, so open-in-new-tab and copy-link work. */
export function AppLink({
  to,
  className,
  children,
  ...rest
}: {
  to: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page";
}) {
  return (
    <Link to={to} className={className ?? linkClass} {...rest}>
      {children}
    </Link>
  );
}

/** An external link. Opens in a new tab and says so to screen readers. */
export function ExternalLink({
  href,
  className,
  children,
  label,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  /** Accessible name when `children` is an icon. */
  label?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? linkClass}
      aria-label={label ? `${label} (opens in a new tab)` : undefined}
    >
      {children}
      {!label && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
}

export type ChipTone = "indigo" | "green" | "zinc";
const CHIP: Record<ChipTone, string> = {
  indigo:
    "bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800",
  green:
    "bg-green-50 text-green-800 ring-green-200 dark:bg-green-950 dark:text-green-200 dark:ring-green-800",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700",
};
const chipBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

export function Chip({ tone = "indigo", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={cx(chipBase, CHIP[tone])}>{children}</span>;
}

/** True for a click the browser should handle itself: new tab, new window, download. */
export function isModifiedClick(e: React.MouseEvent) {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

/**
 * A tag that goes to the posts list filtered by it. On the posts list itself, `onSelect`
 * filters in place instead, because that page reads the URL only when it loads.
 */
export function TagLink({
  to,
  onSelect,
  children,
}: {
  to: string;
  onSelect?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={(e) => {
        if (!onSelect || isModifiedClick(e)) return;
        e.preventDefault();
        onSelect();
      }}
      className={cx(chipBase, CHIP.indigo, "hover:ring-indigo-400")}
    >
      {children}
    </Link>
  );
}

export function TagList({
  tags,
  onSelect,
}: {
  tags: { slug: string; label: string; href: string }[];
  onSelect?: (slug: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag.slug}>
          <TagLink to={tag.href} onSelect={onSelect && (() => onSelect(tag.slug))}>
            {tag.label}
          </TagLink>
        </li>
      ))}
    </ul>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors";
export const buttonClass = {
  primary: cx(
    buttonBase,
    "bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
  ),
  secondary: cx(
    buttonBase,
    "bg-white text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800"
  ),
  ghost: cx(
    buttonBase,
    "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
  ),
};

export function Spinner() {
  return (
    <div role="status" className="flex justify-center py-16">
      <span
        aria-hidden="true"
        className="size-8 rounded-full motion-safe:animate-spin border-4 border-zinc-200 border-t-indigo-600 dark:border-zinc-700 dark:border-t-indigo-400"
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="py-16 text-center text-red-700 dark:text-red-400">
      {children}
    </p>
  );
}

export function PageHeader({
  title,
  count,
  description,
  children,
}: {
  title: string;
  count?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {title}
          {count && (
            <span className="ml-2 text-lg font-normal text-zinc-500 dark:text-zinc-400">
              {count}
            </span>
          )}
        </h1>
        {description && <p className="mt-2 text-zinc-600 dark:text-zinc-400">{description}</p>}
      </div>
      {children}
    </header>
  );
}

/** A labelled search box. The label is visually hidden; the placeholder is not a label. */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Inside a Dialog: focus this field when the dialog opens. */
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        data-autofocus={autoFocus ? "" : undefined}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border-0 bg-white px-3 py-2 text-zinc-900 ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-500 focus:ring-2 focus:ring-indigo-600 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:placeholder:text-zinc-400"
      />
    </div>
  );
}

/** Page numbers to show: always the first and last, the current one and its neighbours. */
export function pageList(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const item = "min-w-9 rounded-md px-2.5 py-1.5 text-sm font-medium";
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
      <button
        type="button"
        className={cx(item, "disabled:opacity-40", buttonClass.ghost)}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <span aria-hidden="true">←</span> Previous
      </button>
      {pageList(page, pageCount).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-zinc-500" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? "page" : undefined}
            aria-label={`Page ${p}`}
            className={cx(
              item,
              p === page
                ? "bg-indigo-600 text-white dark:bg-indigo-500"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            )}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        className={cx(item, "disabled:opacity-40", buttonClass.ghost)}
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        Next <span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}

/**
 * A modal dialog on the native `<dialog>` element: the browser provides the focus trap,
 * Escape to close, the inert background and focus return. Clicking the backdrop closes it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // jsdom does not implement showModal; fall back to the open attribute there.
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      // showModal focuses the first focusable element (the Close button). A dialog whose
      // main control is a field marks it with data-autofocus to land there instead.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-xl bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/50 dark:bg-zinc-900 dark:text-zinc-100",
        wide ? "max-w-2xl" : "max-w-lg"
      )}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className={buttonClass.ghost}
              aria-label="Close"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

const FrameContext = createContext(false);

/**
 * The page's main landmark. Some routes nest one framed page inside another (the
 * catch-all resolver wraps an article), so an inner frame renders only its children and
 * the page keeps exactly one `<main>`.
 */
export function PageFrame({ children }: { children: ReactNode }) {
  const nested = useContext(FrameContext);
  if (nested) return <>{children}</>;
  return (
    <FrameContext.Provider value={true}>
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        {children}
      </main>
    </FrameContext.Provider>
  );
}

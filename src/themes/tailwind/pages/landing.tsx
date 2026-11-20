import type { LandingView } from "../../types";
import { AppLink, cx } from "../ui";

export function LandingPageLayout({ title, description, divider, crumbs, blocks }: LandingView) {
  return (
    <div>
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-6 text-sm">
          <ol className="flex flex-wrap items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            {crumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">/</span>}
                {c.href ? (
                  <AppLink
                    to={c.href}
                    className="hover:text-zinc-900 hover:underline dark:hover:text-white"
                  >
                    {c.label}
                  </AppLink>
                ) : (
                  <span aria-current="page" className="text-zinc-700 dark:text-zinc-300">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <header
        className={cx("mb-10", divider && "border-b border-zinc-200 pb-6 dark:border-zinc-800")}
      >
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{description}</p>
        )}
      </header>
      <div className="space-y-12">{blocks.map((block) => block.element)}</div>
    </div>
  );
}

import type { TaxonomyView } from "../../types";
import { AppLink, PageHeader, SearchField, Spinner } from "../ui";

/** Categories and tags. Each entry is a real link, so both pages work from the keyboard. */
export function TaxonomyPage({
  kind,
  title,
  status,
  entries,
  filterText,
  onFilterChange,
}: TaxonomyView) {
  if (status === "loading") return <Spinner />;
  const isCategories = kind === "categories";
  return (
    <div>
      <PageHeader title={title} count={`(${entries.length})`} />
      <div className="mb-8 max-w-md">
        <SearchField
          label={isCategories ? "Search categories" : "Search tags"}
          value={filterText}
          onChange={onFilterChange}
        />
      </div>
      <ul
        className={
          isCategories
            ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        }
      >
        {entries.map((entry) => (
          <li key={entry.slug}>
            <AppLink
              to={entry.href}
              className="block h-full rounded-lg p-4 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-indigo-300 dark:ring-zinc-800 dark:hover:bg-zinc-900 dark:hover:ring-indigo-700"
            >
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{entry.label}</span>
              {isCategories && entry.description && (
                <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">
                  {entry.description}
                </span>
              )}
              <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
                {entry.count} {entry.count === 1 ? "post" : "posts"}
              </span>
            </AppLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

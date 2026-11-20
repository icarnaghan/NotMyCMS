/**
 * Posts and knowledge-base lists. A simple list (title, date, summary, tags) suits a blog
 * better than a table, so this theme does not offer column choices or sorting; the core's
 * filter, category, tag and paging behavior is unchanged.
 */
import { useId } from "react";
import type { ContentListView } from "../../types";
import { PostCard } from "../post-card";
import { ErrorMessage, PageHeader, Pagination, SearchField, Spinner } from "../ui";

function countLabel(filtered: number, total: number) {
  return `(${filtered}${filtered !== total ? `/${total}` : ""})`;
}

export function ContentListPage({
  kind,
  title,
  status,
  items,
  filteredCount,
  totalCount,
  filter,
  pagination,
}: ContentListView) {
  const selectId = useId();
  if (status === "loading") return <Spinner />;
  if (status === "error") {
    return (
      <ErrorMessage>
        Failed to load {kind === "posts" ? "posts" : "articles"}. Please try again later.
      </ErrorMessage>
    );
  }
  const category = filter.category;
  return (
    <div>
      <PageHeader title={title} count={countLabel(filteredCount, totalCount)} />
      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <SearchField
            label={kind === "posts" ? "Search posts" : "Search knowledge base"}
            placeholder={
              kind === "posts"
                ? "Search by title, category, or description"
                : "Search knowledge base"
            }
            value={filter.text}
            onChange={filter.onTextChange}
          />
        </div>
        {category && category.options.length > 0 && (
          <div>
            <label htmlFor={selectId} className="sr-only">
              Category
            </label>
            <select
              id={selectId}
              value={category.selected ?? ""}
              onChange={(e) => category.onChange(e.target.value || null)}
              className="w-full rounded-md border-0 bg-white py-2 pl-3 pr-8 text-zinc-900 ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-indigo-600 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
            >
              <option value="">All categories</option>
              {category.options.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-zinc-500 dark:text-zinc-400">
          {filter.text ? "No matches found" : "No items found"}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {items.map((item) => (
            <li key={item.slug} className="py-6 first:pt-0">
              <PostCard item={item} onTagSelect={filter.onTagSelect} />
            </li>
          ))}
        </ul>
      )}
      <Pagination {...pagination} />
    </div>
  );
}

import { Link } from "react-router-dom";
import type { SearchView } from "../types";
import { Dialog, SearchField, isModifiedClick } from "./ui";

export function SearchDialog({ search }: { search: SearchView }) {
  const { open, onClose, query, onQueryChange, results, announcement, choose } = search;
  return (
    <Dialog open={open} onClose={onClose} title="Search" wide>
      {/* Focus lands here, not on Close, when the dialog opens (see Dialog). */}
      <SearchField
        label="Search posts and knowledge base"
        placeholder="Search posts and knowledge base..."
        value={query}
        onChange={onQueryChange}
        autoFocus
      />
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {announcement &&
        (results.length === 0 ? (
          <p className="mt-6 text-center text-zinc-500 dark:text-zinc-400">No results found</p>
        ) : (
          <ul className="mt-4 max-h-[60vh] divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
            {results.map((item) => (
              <li key={`${item.kind}-${item.slug}`}>
                <Link
                  to={item.href}
                  onClick={(e) => {
                    if (isModifiedClick(e)) return;
                    e.preventDefault();
                    choose(item);
                  }}
                  className="block rounded-md px-2 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <span className="block font-semibold text-indigo-700 dark:text-indigo-300">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
                    {item.excerpt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </Dialog>
  );
}

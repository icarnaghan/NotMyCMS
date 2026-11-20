import type { NotFoundView } from "../../types";
import { AppLink, buttonClass } from "../ui";

export function NotFoundPage({ suggestions }: NotFoundView) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="text-3xl font-bold tracking-tight">404 — Page Not Found</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        The page you're looking for doesn't exist.
      </p>
      {suggestions.length > 0 && (
        <section className="mt-8" aria-labelledby="did-you-mean">
          <h2 id="did-you-mean" className="text-lg font-semibold">
            Did you mean?
          </h2>
          <ul className="mt-3 space-y-2">
            {suggestions.map((post) => (
              <li key={post.slug}>
                <AppLink to={post.href}>{post.title}</AppLink>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AppLink to="/" className={`${buttonClass.primary} mt-8`}>
        Go Home
      </AppLink>
    </div>
  );
}

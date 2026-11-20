import type { HomeView } from "../../types";
import { PostCard } from "../post-card";
import { AppLink, ExternalLink, buttonClass } from "../ui";

export function HomePage({ name, avatar, intro, social, recentPosts }: HomeView) {
  return (
    <div>
      <section className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-6 text-center">
        {avatar && <img src={avatar} alt={name} className="size-28 rounded-full object-cover" />}
        <h1 className="text-4xl font-bold tracking-tight">{name}</h1>
        {intro && (
          <p className="text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">{intro}</p>
        )}
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Elsewhere">
          {social
            .filter((link) => link.path)
            .map((link) => (
              <li key={link.id}>
                <ExternalLink
                  href={link.href}
                  label={link.label}
                  className="inline-flex size-10 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill={link.fill ? "currentColor" : "none"}
                    stroke={link.fill ? "none" : "currentColor"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={link.path} />
                  </svg>
                </ExternalLink>
              </li>
            ))}
        </ul>
        <div className="flex flex-wrap justify-center gap-3">
          <AppLink to="/posts" className={buttonClass.primary}>
            Blog Posts
          </AppLink>
          <AppLink to="/knowledge-base" className={buttonClass.secondary}>
            Knowledge Base
          </AppLink>
        </div>
      </section>

      {recentPosts.length > 0 && (
        <section className="mt-16" aria-labelledby="recent-posts">
          <h2 id="recent-posts" className="mb-6 text-2xl font-bold tracking-tight">
            Recent Posts
          </h2>
          <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {recentPosts.map((item) => (
              <li key={item.slug}>
                <PostCard item={item} headingLevel={3} />
              </li>
            ))}
          </ul>
          <div className="mt-10 text-center">
            <AppLink
              to="/posts"
              className="font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
            >
              View all posts <span aria-hidden="true">→</span>
            </AppLink>
          </div>
        </section>
      )}
    </div>
  );
}

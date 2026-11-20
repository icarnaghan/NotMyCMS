/**
 * The article layout. Readability is the design goal: 18px body text (`prose-lg`), a line
 * length capped near 70 characters, and generous line spacing. The table of contents sits
 * in a sticky sidebar on wide screens and in a collapsed disclosure above the article on
 * narrow ones, so it never pushes the text off a phone screen.
 */
import { ContentErrorBoundary } from "../../../core/content-error-boundary";
import type { ArticleView } from "../../types";
import { PostCard } from "../post-card";
import { AppLink, PageFrame, Spinner, TagList } from "../ui";

function Breadcrumbs({ crumbs }: Pick<ArticleView, "crumbs">) {
  return (
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
              <span aria-current="page" className="line-clamp-1 text-zinc-700 dark:text-zinc-300">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TocLinks({ toc }: Pick<ArticleView, "toc">) {
  return (
    <ul className="space-y-2 text-sm">
      {toc.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            className="text-zinc-600 hover:text-indigo-700 dark:text-zinc-400 dark:hover:text-indigo-300"
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ArticlePage({
  status,
  title,
  description,
  meta,
  tags,
  crumbs,
  toc,
  body,
  related,
}: ArticleView) {
  if (status === "loading") {
    return (
      <PageFrame>
        <Spinner />
      </PageFrame>
    );
  }
  const hasToc = toc.length > 0;
  return (
    <PageFrame>
      <Breadcrumbs crumbs={crumbs} />
      <div className={hasToc ? "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12" : undefined}>
        <ContentErrorBoundary
          fallback={
            <p role="alert" className="py-16 text-center text-lg font-semibold">
              Something went wrong rendering this page.
            </p>
          }
        >
          <article className="min-w-0">
            <header className="mb-8 max-w-[70ch] border-b border-zinc-200 pb-6 dark:border-zinc-800">
              <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                {title}
              </h1>
              {description && (
                <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{description}</p>
              )}
              {meta && <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{meta}</p>}
              {tags.length > 0 && (
                <div className="mt-4">
                  <TagList tags={tags} />
                </div>
              )}
            </header>
            {hasToc && (
              <details className="mb-8 rounded-lg p-4 ring-1 ring-zinc-200 lg:hidden dark:ring-zinc-800">
                <summary className="cursor-pointer font-semibold">On this page</summary>
                <div className="mt-3">
                  <TocLinks toc={toc} />
                </div>
              </details>
            )}
            <div className="prose prose-lg prose-zinc max-w-[70ch] dark:prose-invert prose-a:text-indigo-700 prose-headings:scroll-mt-20 dark:prose-a:text-indigo-300">
              {body}
            </div>
          </article>
        </ContentErrorBoundary>
        {hasToc && (
          <aside className="hidden lg:block" aria-labelledby="toc-heading">
            <div className="sticky top-20">
              <h2
                id="toc-heading"
                className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              >
                On this page
              </h2>
              <TocLinks toc={toc} />
            </div>
          </aside>
        )}
      </div>
      {related.length > 0 && (
        <section
          className="mt-16 border-t border-zinc-200 pt-10 dark:border-zinc-800"
          aria-labelledby="related"
        >
          <h2 id="related" className="mb-6 text-2xl font-bold tracking-tight">
            Related Posts
          </h2>
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <li key={item.slug}>
                <PostCard item={item} headingLevel={3} summary={false} maxTags={3} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageFrame>
  );
}

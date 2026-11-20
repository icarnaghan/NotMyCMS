/**
 * An article: a post, knowledge-base entry or standalone page.
 *
 * The core fetches and parses it, builds the table of contents, related items and
 * breadcrumbs, and renders the Markdown with the active theme's element components. The
 * theme decides the layout around all of that.
 */
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import activeTheme from "@theme";
import { headingId, resolveImageSrc, useArticle, type ContentBasePath } from "../article";
import { toContentItem } from "../content-item";
import { useRelatedPosts } from "../related-posts";
import { toDisplayLabel } from "../../lib/content";
import { NotFoundRoute } from "./not-found-route";

interface ContentPageProps {
  basePath: ContentBasePath;
  /**
   * Explicit slug, overriding the URL param. Needed when ContentPage is mounted under a
   * catch-all `/*` route, where the matched path lives in `params["*"]` rather than
   * `params.slug` (the landing/content resolver passes it through). Omitted on the
   * conventional `:slug` routes, which read it from the params directly.
   */
  slug?: string;
}

export function ContentPage({ basePath, slug: slugProp }: ContentPageProps) {
  const params = useParams();
  const navigate = useNavigate();
  const article = useArticle(basePath, slugProp ?? params.slug);
  const { slug, content, title, tags, categories, reading, formattedDate, author } = article;
  const relatedMeta = useRelatedPosts(basePath, { slug, tags, categories });
  const { markdown: md, PageFrame } = activeTheme;
  const Pre = md.pre;
  const View = activeTheme.pages.Article;

  if (article.loading) {
    return (
      <View
        status="loading"
        title=""
        meta=""
        tags={[]}
        crumbs={[]}
        toc={[]}
        body={null}
        related={[]}
        goTo={navigate}
      />
    );
  }
  if (!content) {
    return (
      <PageFrame>
        <NotFoundRoute slug={slug} />
      </PageFrame>
    );
  }

  const body = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        h2: ({ children }) => <md.h2 id={headingId(children)}>{children}</md.h2>,
        h3: ({ children }) => <md.h3 id={headingId(children)}>{children}</md.h3>,
        img: ({ src, alt }) => (
          <md.img src={resolveImageSrc(src, basePath, slug)} alt={alt || ""} />
        ),
        table: ({ children }) => <md.table>{children}</md.table>,
        th: ({ children }) => <md.th>{children}</md.th>,
        td: ({ children }) => <md.td>{children}</md.td>,
        ...(Pre ? { pre: ({ children }) => <Pre>{children}</Pre> } : {}),
        // Fenced blocks carry a `language-*` class; inline code does not.
        code: ({ className, children }) => {
          const language = className?.replace("language-", "");
          if (language) {
            return <md.code language={language} code={String(children).replace(/\n$/, "")} />;
          }
          return <code className={className}>{children}</code>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  return (
    <View
      status="ready"
      title={title}
      description={article.description}
      meta={
        formattedDate || author
          ? [formattedDate, `${reading.minutes} min`, `${reading.words} words`, author]
              .filter(Boolean)
              .join(" \u00b7 ")
          : ""
      }
      tags={tags.map((tag) => ({
        slug: tag,
        label: toDisplayLabel(tag),
        href: `/posts?tag=${encodeURIComponent(tag)}`,
      }))}
      crumbs={[
        { label: "Home", href: "/" },
        { label: article.section.label, href: article.section.href },
        { label: title },
      ]}
      // The contents panel lists h2 headings only.
      toc={article.headings.filter((h) => h.level === 2).map((h) => ({ id: h.id, text: h.text }))}
      body={body}
      related={relatedMeta.map((p) => toContentItem(p, basePath))}
      goTo={navigate}
    />
  );
}

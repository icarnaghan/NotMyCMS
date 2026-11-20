/**
 * Article loading and the logic around it. Headless.
 *
 * A theme renders an article; it does not decide how one is fetched, what its table of
 * contents contains, how long it takes to read, or which id a heading gets. The heading
 * rule matters most: the table of contents links to `#id`, and the Markdown renderer must
 * produce the same id, so both go through `headingId` and `extractHeadings` below.
 */
import { isValidElement, useEffect, useState, type ReactNode } from "react";
import { parseFrontmatter, type FrontmatterData } from "../lib/frontmatter";
import { formatDate } from "../lib/content";
import { siteConfig } from "../lib/site-config";
import { slugify } from "../lib/slugify";
import { useDocumentTitle } from "../lib/use-document-title";

export type ContentBasePath = "posts" | "knowledge-base" | "pages";

export interface TocItem {
  text: string;
  id: string;
  level: number;
}

/**
 * Flattens React children (as produced by react-markdown for a heading: strings
 * interleaved with <code>/<strong>/<a> elements) to their plain text. Without this,
 * `String(children)` on a node array yields "[object Object]" and the heading id no
 * longer matches the table of contents link.
 */
export function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

/** The anchor id for a rendered heading. Themes must use this on their h2 and h3. */
export function headingId(children: ReactNode): string {
  return slugify(nodeToText(children));
}

/**
 * Extracts h2 and h3 headings from raw Markdown for the table of contents. Reduces inline
 * Markdown to the plain text react-markdown will render, so the id matches `headingId`.
 */
export function extractHeadings(markdown: string): TocItem[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const items: TocItem[] = [];
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    // Unwrap [text](url) to text, then strip the formatting characters.
    const text = match[2]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim();
    items.push({ text, id: slugify(text), level: match[1].length });
  }
  return items;
}

/** Word count and reading time at 200 words per minute, never less than one minute. */
export function readingStats(content: string): { words: number; minutes: number } {
  const words = content ? content.trim().split(/\s+/).length : 0;
  return { words, minutes: Math.max(1, Math.ceil(words / 200)) };
}

/** The "Posts" or "Knowledge Base" link between Home and the article title. */
export function sectionCrumb(basePath: ContentBasePath): { label: string; href: string } {
  if (basePath === "posts") return { label: "Posts", href: "/posts" };
  if (basePath === "knowledge-base") return { label: "Knowledge Base", href: "/knowledge-base" };
  return {
    label: siteConfig.guideSection?.label ?? "Guides",
    href: `/${siteConfig.guideSection?.path ?? ""}`,
  };
}

/**
 * Where an image in an article points. Absolute (http, https, data) and root-relative
 * URLs are left alone; anything else is relative to the article's own content directory.
 */
export function resolveImageSrc(src: unknown, basePath: ContentBasePath, slug: string): string {
  const raw = typeof src === "string" ? src : "";
  return /^(?:https?:|data:|\/)/i.test(raw) ? raw : `/content/${basePath}/${slug}/${raw}`;
}

export interface ArticleData {
  /** The slug with trailing slashes removed. */
  slug: string;
  loading: boolean;
  /** Raw Markdown body, or null when the article does not exist. */
  content: string | null;
  meta: FrontmatterData;
  headings: TocItem[];
  title: string;
  description?: string;
  author?: string;
  /** Long-form publication date, or null when the frontmatter has none. */
  formattedDate: string | null;
  tags: string[];
  categories: string;
  reading: { words: number; minutes: number };
  section: { label: string; href: string };
}

/**
 * Fetches and parses one article, sets the document title, and scrolls to the top when
 * the slug changes. A missing file, a non-OK response, or an HTML response (the SPA
 * fallback page) all count as "not found" and leave `content` null.
 */
export function useArticle(basePath: ContentBasePath, rawSlug: string | undefined): ArticleData {
  const slug = rawSlug?.replace(/\/+$/, "") || "";
  const [meta, setMeta] = useState<FrontmatterData>({});
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [headings, setHeadings] = useState<TocItem[]>([]);

  // Scroll to top when navigating to a new article.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/content/${basePath}/${slug}/index.md`);
        if (!res.ok) return setContent(null);
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/html")) return setContent(null);
        const { meta: m, content: c } = parseFrontmatter(await res.text());
        setMeta(m);
        setContent(c);
        setHeadings(extractHeadings(c));
      } catch {
        setContent(null);
      }
    };
    load().finally(() => setLoading(false));
  }, [basePath, slug]);

  const title = String(meta.title || slug);
  useDocumentTitle(content ? title : undefined);

  return {
    slug,
    loading,
    content,
    meta,
    headings,
    title,
    description: meta.description ? String(meta.description) : undefined,
    author: meta.author ? String(meta.author) : undefined,
    formattedDate: meta.date ? formatDate(String(meta.date)) : null,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    categories: String(meta.categories || ""),
    reading: readingStats(content ?? ""),
    section: sectionCrumb(basePath),
  };
}

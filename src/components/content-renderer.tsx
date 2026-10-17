import { useParams, useNavigate } from "react-router-dom";
import { Component, isValidElement, type ReactNode, type ErrorInfo } from "react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import AppLayout from "@cloudscape-design/components/app-layout";
import Header from "@cloudscape-design/components/header";
import ContentLayout from "@cloudscape-design/components/content-layout";
import SpaceBetween from "@cloudscape-design/components/space-between";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Badge from "@cloudscape-design/components/badge";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import AnchorNavigation from "@cloudscape-design/components/anchor-navigation";
import HelpPanel from "@cloudscape-design/components/help-panel";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import { CodeView } from "@cloudscape-design/code-view";
import { parseFrontmatter, type FrontmatterData } from "../lib/frontmatter";
import { formatDate, toDisplayLabel } from "../lib/content";
import { slugify } from "../lib/slugify";
import { useDocumentTitle } from "../lib/use-document-title";
import { PageLayout } from "./page-layout";
import { NotFoundPage } from "../pages/not-found/not-found-page";
import { RelatedPosts } from "./related-posts";

// --- Syntax Highlighting ---
// Static imports for supported languages. Each highlighter is a small module
// from @cloudscape-design/code-view that provides ace-based tokenization.
// Unsupported languages render without highlighting.
import highlightJavascript from "@cloudscape-design/code-view/highlight/javascript";
import highlightTypescript from "@cloudscape-design/code-view/highlight/typescript";
import highlightPython from "@cloudscape-design/code-view/highlight/python";
import highlightJson from "@cloudscape-design/code-view/highlight/json";
import highlightSh from "@cloudscape-design/code-view/highlight/sh";
import highlightJava from "@cloudscape-design/code-view/highlight/java";
import highlightHtml from "@cloudscape-design/code-view/highlight/html";
import highlightCss from "@cloudscape-design/code-view/highlight/css";
import highlightYaml from "@cloudscape-design/code-view/highlight/yaml";
import highlightXml from "@cloudscape-design/code-view/highlight/xml";
import highlightPhp from "@cloudscape-design/code-view/highlight/php";

const highlighters: Record<string, (code: string) => ReactNode> = {
  javascript: highlightJavascript,
  js: highlightJavascript,
  jsx: highlightJavascript,
  typescript: highlightTypescript,
  ts: highlightTypescript,
  tsx: highlightTypescript,
  python: highlightPython,
  py: highlightPython,
  json: highlightJson,
  sh: highlightSh,
  bash: highlightSh,
  shell: highlightSh,
  java: highlightJava,
  html: highlightHtml,
  css: highlightCss,
  yaml: highlightYaml,
  yml: highlightYaml,
  xml: highlightXml,
  php: highlightPhp,
};

// --- Types ---

interface ContentPageProps {
  basePath: "posts" | "knowledge-base" | "pages";
  /**
   * Explicit slug, overriding the URL param. Needed when ContentPage is mounted under a
   * catch-all `/*` route, where the matched path lives in `params["*"]` rather than
   * `params.slug` (the landing/content resolver passes it through). Omitted on the
   * conventional `:slug` routes, which read it from the params directly.
   */
  slug?: string;
}

interface TocItem {
  text: string;
  id: string;
  level: number;
}

// --- Utilities ---

/**
 * Converts heading text to a URL-friendly slug for in-page TOC anchors. Strips
 * apostrophes (straight and curly) before replacing non-alphanumeric characters
 * with hyphens. Used only for heading anchor ids within a rendered page — the
 * post/article routing slug comes from the build-time manifest, not this
 * function, so the two need not match exactly.
 */
// Implementation lives in src/lib/slugify.ts so it can be unit tested.

/**
 * Flattens React children (as produced by react-markdown for a heading \u2014
 * strings interleaved with <code>/<strong>/<a> elements) to their plain text,
 * so a heading's anchor id can be derived the same way the TOC derives it.
 * Without this, `String(children)` on a node array yields "[object Object]"
 * and the heading id no longer matches the TOC link.
 */
function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

// --- Error Boundary ---
// Catches rendering errors in the content area so a broken markdown file
// doesn't crash the entire app. Shows a fallback message instead.

class ContentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_: Error, info: ErrorInfo) {
    console.error("Content render error:", info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Box variant="h2" textAlign="center" padding="xxl">
          Something went wrong rendering this page.
        </Box>
      );
    }
    return this.props.children;
  }
}

/**
 * Extracts h2 and h3 headings from raw markdown for the table of contents.
 * Strips inline formatting characters (backticks, bold, italic, strikethrough)
 * and generates anchor IDs via slugify.
 */
function extractHeadings(markdown: string): TocItem[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const items: TocItem[] = [];
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    // Reduce inline markdown to the plain text react-markdown will render, so
    // the TOC id matches the heading id: unwrap [text](url) → text, then strip
    // the formatting characters (backticks, bold/italic/strike markers).
    const text = match[2]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim();
    const id = slugify(text);
    items.push({ text, id, level: match[1].length });
  }
  return items;
}

// Human-readable names for the supported languages, used for screen-reader
// labels on code blocks. Falls back to the raw language token.
const languageLabels: Record<string, string> = {
  javascript: "JavaScript",
  js: "JavaScript",
  jsx: "JavaScript (JSX)",
  typescript: "TypeScript",
  ts: "TypeScript",
  tsx: "TypeScript (TSX)",
  python: "Python",
  py: "Python",
  json: "JSON",
  sh: "Shell",
  bash: "Bash",
  shell: "Shell",
  java: "Java",
  html: "HTML",
  css: "CSS",
  yaml: "YAML",
  yml: "YAML",
  xml: "XML",
  php: "PHP",
};

function languageLabel(lang: string): string {
  return languageLabels[lang] || lang.toUpperCase();
}

/**
 * Renders a fenced code block with Cloudscape CodeView.
 * Looks up the highlighter from the static map. Includes line numbers
 * and a copy-to-clipboard button. Wrapped in a labelled group so screen
 * readers announce the code language.
 */
function HighlightedCodeView({ lang, code }: { lang: string; code: string }) {
  return (
    <div role="group" aria-label={`${languageLabel(lang)} code block`}>
      <CodeView
        content={code}
        highlight={highlighters[lang]}
        lineNumbers
        actions={
          <CopyToClipboard
            variant="icon"
            textToCopy={code}
            copySuccessText="Code copied"
            copyErrorText="Copy failed"
          />
        }
      />
    </div>
  );
}

/**
 * Renders an individual blog post or knowledge base article.
 *
 * Flow:
 * 1. Reads the slug from the URL params
 * 2. Fetches the raw markdown file from /content/{basePath}/{slug}/index.md
 * 3. Parses YAML frontmatter (title, date, tags, etc.) via gray-matter
 * 4. Extracts h2/h3 headings for the table of contents sidebar
 * 5. Renders the markdown with ReactMarkdown using custom component overrides:
 *    - h2/h3: adds anchor IDs for TOC linking
 *    - img: resolves relative paths to the content directory
 *    - code: fenced blocks render via HighlightedCodeView, inline code as <code>
 *
 * Layout uses Cloudscape AppLayout with:
 * - Breadcrumb navigation (Home → Posts/KB → Article)
 * - Tools panel (table of contents via AnchorNavigation, hidden on mobile by default)
 * - Content wrapped in ContentErrorBoundary for graceful error handling
 */
export function ContentPage({ basePath, slug: slugProp }: ContentPageProps) {
  const params = useParams();
  const slug = slugProp ?? params.slug;
  const navigate = useNavigate();
  const cleanSlug = slug?.replace(/\/+$/, "") || "";
  const [meta, setMeta] = useState<FrontmatterData>({});
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [headings, setHeadings] = useState<TocItem[]>([]);

  // Default TOC panel to closed on mobile screens, responsive to resize
  const [toolsOpen, setToolsOpen] = useState(() => window.innerWidth > 768);
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) setToolsOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Scroll to top when navigating to a new post
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [cleanSlug]);

  // Fetch and parse the markdown file when the slug changes
  useEffect(() => {
    const fetchContent = async () => {
      // One candidate URL. This was previously a list with a fallback to `pages/`; the
      // loop is vestigial and kept only to avoid an unrelated refactor.
      const urls = [`/content/${basePath}/${cleanSlug}/index.md`];

      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("text/html")) continue;
          const raw = await res.text();
          const { meta: m, content: c } = parseFrontmatter(raw);
          setMeta(m);
          setContent(c);
          const h = extractHeadings(c);
          setHeadings(h);
          setToolsOpen(h.length > 0 && window.innerWidth > 768);
          return;
        } catch {
          continue;
        }
      }
      setContent(null);
    };
    fetchContent().finally(() => setLoading(false));
  }, [basePath, cleanSlug]);

  // Extract metadata from frontmatter
  const title = String(meta.title || cleanSlug);
  useDocumentTitle(content ? title : undefined);
  const description = meta.description ? String(meta.description) : undefined;
  const author = meta.author ? String(meta.author) : undefined;
  const formattedDate = meta.date ? formatDate(String(meta.date)) : null;
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  const breadcrumbLabel =
    basePath === "posts"
      ? "Posts"
      : basePath === "knowledge-base"
        ? "Knowledge Base"
        : "CMST 388 Project Tips";
  const breadcrumbHref =
    basePath === "posts"
      ? "/posts"
      : basePath === "knowledge-base"
        ? "/knowledge-base"
        : "/teaching/cmst388-tips";

  // Build table of contents from h2 headings only
  const anchorItems = headings
    .filter((h) => h.level === 2)
    .map((h) => ({
      text: h.text,
      href: `#${h.id}`,
      level: 1 as const,
    }));

  const hasTools = anchorItems.length > 0;

  // --- Render states ---
  if (loading) {
    return (
      <AppLayout navigationHide toolsHide toolsOpen={false} content={<Spinner size="large" />} />
    );
  }

  if (!content) {
    return (
      <PageLayout>
        <NotFoundPage slug={cleanSlug} />
      </PageLayout>
    );
  }

  const mainContent = (
    <ContentLayout
      headerVariant="divider"
      header={
        <SpaceBetween size="s">
          <Header variant="h1" description={description}>
            {title}
          </Header>
          {(formattedDate || author || tags.length > 0) && (
            <SpaceBetween size="xs">
              {(formattedDate || author) && (
                <Box color="text-body-secondary" fontSize="body-s">
                  {(() => {
                    const words = content ? content.trim().split(/\s+/).length : 0;
                    const mins = Math.max(1, Math.ceil(words / 200));
                    return [formattedDate, `${mins} min`, `${words} words`, author]
                      .filter(Boolean)
                      .join(" · ");
                  })()}
                </Box>
              )}
              {/* Tags link to the posts page with a pre-filled filter */}
              {tags.length > 0 && (
                <SpaceBetween size="xs" direction="horizontal">
                  {tags.map((tag) => (
                    <span className="clickable-tag" key={tag}>
                      <Link
                        variant="secondary"
                        onFollow={(e) => {
                          e.preventDefault();
                          navigate(`/posts?tag=${encodeURIComponent(tag)}`);
                        }}
                      >
                        <Badge color="blue">{toDisplayLabel(tag)}</Badge>
                      </Link>
                    </span>
                  ))}
                </SpaceBetween>
              )}
            </SpaceBetween>
          )}
        </SpaceBetween>
      }
    >
      <Box>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            // Add anchor IDs to headings for TOC linking
            h2: ({ children }) => <h2 id={slugify(nodeToText(children))}>{children}</h2>,
            h3: ({ children }) => <h3 id={slugify(nodeToText(children))}>{children}</h3>,
            // Resolve relative image paths to the content directory, but leave
            // absolute (http/https/data) and root-relative URLs untouched.
            img: ({ src, alt }) => {
              const rawSrc = typeof src === "string" ? src : "";
              const resolvedSrc = /^(?:https?:|data:|\/)/i.test(rawSrc)
                ? rawSrc
                : `/content/${basePath}/${cleanSlug}/${rawSrc}`;
              return (
                <img
                  src={resolvedSrc}
                  alt={alt || ""}
                  loading="lazy"
                  decoding="async"
                  style={{ maxWidth: "100%" }}
                />
              );
            },
            // Markdown tables styled to match Cloudscape's visual language
            table: ({ children }) => (
              <div style={{ overflowX: "auto", marginBlock: "1em" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  borderBottom: "2px solid var(--color-border-divider-default, #414d5c)",
                  fontWeight: 700,
                }}
              >
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--color-border-divider-default, #414d5c)",
                }}
              >
                {children}
              </td>
            ),
            // Fenced code blocks → HighlightedCodeView, inline code → <code>
            code: ({ className, children }) => {
              const lang = className?.replace("language-", "");
              const code = String(children).replace(/\n$/, "");
              if (lang) {
                return <HighlightedCodeView lang={lang} code={code} />;
              }
              return <code className={className}>{children}</code>;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </Box>
      <RelatedPosts
        currentSlug={cleanSlug}
        tags={tags}
        categories={String(meta.categories || "")}
        basePath={basePath}
      />
    </ContentLayout>
  );

  return (
    <AppLayout
      navigationHide
      toolsHide={!hasTools}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      tools={
        hasTools ? (
          <HelpPanel header={<h2>On this page</h2>}>
            <AnchorNavigation anchors={anchorItems} />
          </HelpPanel>
        ) : undefined
      }
      toolsWidth={300}
      breadcrumbs={
        <BreadcrumbGroup
          items={[
            { text: "Home", href: "/" },
            { text: breadcrumbLabel, href: breadcrumbHref },
            { text: title, href: "#" },
          ]}
          onFollow={(e) => {
            e.preventDefault();
            navigate(e.detail.href);
          }}
        />
      }
      content={<ContentErrorBoundary>{mainContent}</ContentErrorBoundary>}
    />
  );
}

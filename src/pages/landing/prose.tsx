/**
 * Markdown renderer for landing-page prose.
 *
 * Deliberately **not** the one in `content-renderer.tsx`, for two reasons.
 *
 * The first is security. That renderer passes `rehypePlugins={[rehypeRaw]}`, so raw HTML
 * inside markdown is honoured. For post markdown that is defensible — it only arrives
 * through a git commit someone reviewed. Block prose becomes admin-editable, which makes
 * it untrusted input, so raw HTML here is rendered as text rather than parsed. An
 * earlier draft of the design document claimed the existing pipeline already did this;
 * it does not, and the document now records the correction.
 *
 * The second is coupling. `ContentPage` reads `useParams`, fetches markdown by slug, and
 * owns its own `AppLayout`, table of contents and breadcrumbs. None of that applies to a
 * paragraph inside a block.
 *
 * Fenced code blocks render unhighlighted. The existing renderer imports eleven ace
 * highlighters, which is a real cost to pull into every landing page for prose that is
 * page copy rather than tutorials. Unknown languages already render unhighlighted there
 * too, so this is a smaller version of existing behaviour rather than a new rule.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "@cloudscape-design/components/link";
import { useNavigate } from "react-router-dom";

export interface ProseProps {
  markdown: string;
}

/** True for a link that stays on this site and should route client-side. */
function isInternal(href: string): boolean {
  // Mirrors the validator's rule for `to`. A protocol-relative `//host` leaves the site
  // despite starting with a slash, so it is explicitly not internal.
  return href.startsWith("/") && !href.startsWith("//");
}

/**
 * Hook for the spacing rule in `src/styles.css`.
 *
 * Markdown emits unclassed `<p>` elements that keep the browser's default
 * `margin-block`, which stacks on top of the gap `SpaceBetween` already provides. The
 * rule collapses only the outer edges, so spacing between paragraphs inside a block is
 * preserved while the block's own spacing is left to the layout.
 */
const PROSE_CLASS = "landing-prose";

export function Prose({ markdown }: ProseProps) {
  const navigate = useNavigate();

  return (
    <div className={PROSE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // No rehypePlugins: omitting rehypeRaw is the point of this component.
        components={{
          a: ({ href, children }) => {
            const target = typeof href === "string" ? href : "";

            if (isInternal(target)) {
              return (
                <Link
                  href={target}
                  onFollow={(e) => {
                    e.preventDefault();
                    navigate(target);
                  }}
                >
                  {children}
                </Link>
              );
            }

            // External, or something react-markdown's own URL sanitising reduced to an
            // empty string. `external` adds the icon and the target/rel pair.
            return (
              <Link href={target} external>
                {children}
              </Link>
            );
          },
          // Match the table styling the content renderer uses, so prose in a block and
          // prose in an article do not look like different sites.
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
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

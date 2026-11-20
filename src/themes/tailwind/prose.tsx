/**
 * Markdown inside a landing block. Like the Cloudscape theme's version, this deliberately
 * omits `rehype-raw`: block prose is authored in the admin, and raw HTML in it renders as
 * text. Internal links route in the app; external links open in a new tab.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppLink, ExternalLink, cx } from "./ui";

/** Mirrors the validator's rule for `to`: `//host` leaves the site despite the slash. */
function isInternal(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export function Prose({ markdown, muted }: { markdown: string; muted?: boolean }) {
  return (
    <div
      className={cx(
        "prose prose-zinc max-w-none dark:prose-invert prose-a:text-indigo-700 dark:prose-a:text-indigo-300",
        muted && "text-zinc-600 dark:text-zinc-400"
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const target = typeof href === "string" ? href : "";
            return isInternal(target) ? (
              <AppLink to={target}>{children}</AppLink>
            ) : (
              <ExternalLink href={target}>{children}</ExternalLink>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

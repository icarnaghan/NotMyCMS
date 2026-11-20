/* eslint-disable react-refresh/only-export-components -- exports a bag of element components */
/**
 * Markdown elements for the Tailwind theme. Most styling comes from the typography plugin's
 * `prose` classes on the article body, so these stay thin. Fenced code renders through a
 * lazily loaded block, so the highlighter is fetched only by pages that show code.
 */
import { lazy } from "react";
import type { MarkdownComponents } from "../types";

const CodeBlock = lazy(() => import("./code-block").then((m) => ({ default: m.CodeBlock })));

export const markdown: MarkdownComponents = {
  h2: ({ id, children }) => <h2 id={id}>{children}</h2>,
  h3: ({ id, children }) => <h3 id={id}>{children}</h3>,
  img: ({ src, alt }) => <img src={src} alt={alt} loading="lazy" decoding="async" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
  // The code block draws its own <pre>; drop react-markdown's wrapper around it.
  pre: ({ children }) => <>{children}</>,
  code: CodeBlock,
};

/* eslint-disable react-refresh/only-export-components -- exports a bag of element components, not a component, so fast refresh does not apply */
/**
 * Markdown element renderers for the Cloudscape theme: tables styled to match its visual
 * language, and fenced code through Cloudscape's CodeView with syntax highlighting.
 *
 * The core decides what each element is (heading ids, image paths); this decides how it
 * looks. Static imports for the supported languages: each highlighter is a small module
 * from @cloudscape-design/code-view that provides ace-based tokenization. Unsupported
 * languages render without highlighting.
 */
import type { ReactNode } from "react";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import { CodeView } from "@cloudscape-design/code-view";
import type { MarkdownComponents } from "../types";
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

export const markdown: MarkdownComponents = {
  h2: ({ id, children }) => <h2 id={id}>{children}</h2>,
  h3: ({ id, children }) => <h3 id={id}>{children}</h3>,
  img: ({ src, alt }) => (
    <img src={src} alt={alt} loading="lazy" decoding="async" style={{ maxWidth: "100%" }} />
  ),
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
  code: ({ language, code }) => <HighlightedCodeView lang={language} code={code} />,
};

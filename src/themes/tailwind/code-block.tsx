/**
 * A fenced code block: syntax highlighting through lowlight (highlight.js grammars) for the
 * same languages the Cloudscape theme supports, a language label, and a copy button.
 *
 * Only the eleven grammars below are bundled, not highlight.js's full set. An unknown
 * language renders as plain text.
 */
import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const lowlight = createLowlight({
  bash,
  css,
  java,
  javascript,
  json,
  php,
  python,
  typescript,
  xml,
  yaml,
});
lowlight.registerAlias({
  javascript: ["js", "jsx"],
  typescript: ["ts", "tsx"],
  python: ["py"],
  bash: ["sh", "shell"],
  xml: ["html"],
  yaml: ["yml"],
});

/** Screen-reader names for the supported languages. Falls back to the raw token. */
const LABELS: Record<string, string> = {
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

function highlighted(code: string, language: string) {
  if (!lowlight.registered(language)) return code;
  return toJsxRuntime(lowlight.highlight(language, code), { Fragment, jsx, jsxs });
}

function CopyButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="rounded px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white"
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Code copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </>
  );
}

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const label = LABELS[language] || language.toUpperCase();
  return (
    <figure
      role="group"
      aria-label={`${label} code block`}
      className="not-prose my-6 overflow-hidden rounded-lg bg-zinc-50 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
    >
      <figcaption className="flex items-center justify-between border-b border-zinc-200 px-4 py-1.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <span>{label}</span>
        <CopyButton code={code} />
      </figcaption>
      <pre className="hl overflow-x-auto p-4 text-sm leading-relaxed">
        <code>{highlighted(code, language)}</code>
      </pre>
    </figure>
  );
}

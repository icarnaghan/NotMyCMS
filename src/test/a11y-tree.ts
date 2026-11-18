/**
 * Serializes the parts of a rendered DOM that a user (or assistive technology) can
 * observe: landmarks, headings, links, controls, and their accessible names.
 *
 * The theme-system baseline snapshots use this instead of raw HTML so that they stay
 * meaningful across themes. Two themes will never share class names or wrapper
 * elements, but they must expose the same structure and names. `aria-hidden` subtrees
 * are skipped, which also drops the hidden measurement copies Cloudscape renders.
 */
import { getRoles } from "@testing-library/dom";
import { computeAccessibleName } from "dom-accessibility-api";

/** Roles worth recording. Everything else (generic, listitem, cell, ...) is noise. */
const RECORDED = new Set([
  "banner",
  "navigation",
  "main",
  "contentinfo",
  "complementary",
  "region",
  "search",
  "form",
  "heading",
  "link",
  "button",
  "textbox",
  "searchbox",
  "combobox",
  "listbox",
  "option",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "table",
  "columnheader",
  "img",
  "dialog",
  "status",
  "alert",
]);

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function isHidden(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.getAttribute("aria-hidden") === "true") return true;
    if (n.hasAttribute("hidden")) return true;
    if ((n as HTMLElement).style?.display === "none") return true;
  }
  return false;
}

function describe(el: Element, role: string): string {
  const name = clean(computeAccessibleName(el));
  let line = role;
  if (role === "heading")
    line += ` level=${el.tagName.match(/^H(\d)$/)?.[1] ?? el.getAttribute("aria-level") ?? "?"}`;
  if (name) line += ` "${name}"`;
  if (role === "link") line += ` -> ${el.getAttribute("href") ?? "(no href)"}`;
  if (el.getAttribute("aria-current")) line += ` current=${el.getAttribute("aria-current")}`;
  if (el.getAttribute("aria-expanded")) line += ` expanded=${el.getAttribute("aria-expanded")}`;
  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true")
    line += " disabled";
  return line;
}

/** One line per recorded element, in document order. */
export function a11yTree(root: Element = document.body): string {
  const roleOf = new Map<Element, string>();
  for (const [role, els] of Object.entries(getRoles(root as HTMLElement))) {
    if (!RECORDED.has(role)) continue;
    for (const el of els) roleOf.set(el, role);
  }
  const lines: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let n = walker.currentNode as Element | null; n; n = walker.nextNode() as Element | null) {
    const role = roleOf.get(n);
    if (role && !isHidden(n)) lines.push(describe(n, role));
  }
  return lines.join("\n") + "\n";
}

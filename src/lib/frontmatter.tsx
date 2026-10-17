// Frontmatter metadata from a markdown file (title, date, tags, etc.)
export interface FrontmatterData {
  [key: string]: string | string[];
}

/**
 * Parses a raw markdown string with YAML frontmatter (the --- block at the top).
 * This is a lightweight browser-side parser that handles common frontmatter patterns:
 * - Simple key: value pairs
 * - Quoted strings (single and double)
 * - Inline arrays: [item1, item2]
 * - YAML list format (- item on separate lines)
 *
 * For full YAML support (build-time scripts), use gray-matter instead.
 */
export function parseFrontmatter(raw: string): { meta: FrontmatterData; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };
  const meta: FrontmatterData = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Inline array: [item1, item2]
    if (value.startsWith("[")) {
      const arrayMatch = value.match(/\[([^\]]*)\]/);
      if (arrayMatch) {
        meta[key] = arrayMatch[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
        continue;
      }
    }
    // YAML list format (- item on next lines)
    if (!value) {
      const items: string[] = [];
      while (i + 1 < lines.length && lines[i + 1].match(/^\s+-\s/)) {
        i++;
        items.push(lines[i].replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, ""));
      }
      if (items.length > 0) {
        meta[key] = items;
        continue;
      }
    }
    meta[key] = value;
  }
  return { meta, content: match[2] };
}

import { readdirSync, readFileSync, renameSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

/**
 * Must stay identical to the slugify in scripts/generate-manifest.js — this
 * script renames directories to match the slug that generator advertises.
 * Apostrophes are removed, so "Don't" becomes "dont" and not "don-t".
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['\u2018\u2019\u201B]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function renameDirs(contentDir) {
  const entries = readdirSync(contentDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  let renamed = 0;

  for (const entry of entries) {
    const mdPath = join(contentDir, entry.name, "index.md");
    try {
      const raw = readFileSync(mdPath, "utf-8");
      const { data } = matter(raw);
      if (!data.title) continue;

      const expectedSlug = slugify(data.title);
      if (expectedSlug === entry.name) continue;

      const oldPath = join(contentDir, entry.name);
      const newPath = join(contentDir, expectedSlug);
      renameSync(oldPath, newPath);
      console.log(`Renamed: ${entry.name} → ${expectedSlug}`);
      renamed++;
    } catch {
      // skip folders without index.md
    }
  }

  console.log(`Done. ${renamed} directories renamed in ${contentDir}`);
}

renameDirs("public/content/posts");
renameDirs("public/content/knowledge-base");

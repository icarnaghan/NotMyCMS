import type { FrontmatterValue } from "../../components/frontmatter-form";

/**
 * Validation errors for the content form.
 */
export interface ValidationErrors {
  title?: string;
}

/**
 * Validates frontmatter form values before saving.
 * Returns an object with field-level error messages.
 * An empty object means no validation errors.
 *
 * Rules:
 * - Title is required (cannot be empty or whitespace-only)
 */
export function validateFrontmatter(value: FrontmatterValue): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!value.title.trim()) {
    errors.title = "Title is required";
  }

  return errors;
}

/**
 * Returns true if the form is valid for saving (no validation errors).
 */
export function isFormValid(value: FrontmatterValue): boolean {
  return Object.keys(validateFrontmatter(value)).length === 0;
}

/**
 * A non-blocking authoring-quality / SEO suggestion.
 */
export interface ContentWarning {
  level: "warning" | "info";
  message: string;
}

/**
 * Build the non-blocking "Quality checks" list for a post. These don't prevent
 * saving — they're surfaced in the editor to help produce better content.
 *
 * `availableImages` is the list of image paths that actually exist for this post
 * (as returned by `listMedia`, e.g. `["images/diagram.png"]`). Pass `undefined`
 * when the list isn't known yet — the missing-image check is skipped rather than
 * reporting false positives while it loads.
 */
export function getContentWarnings(
  value: FrontmatterValue,
  body: string,
  availableImages?: string[]
): ContentWarning[] {
  const warnings: ContentWarning[] = [];

  // Draft state first: it's the one setting that makes everything else moot, and
  // new posts default to draft, so the consequence needs stating outright.
  //
  // The wording matters. This used to say a draft "will NOT appear on the live site",
  // which is only half true and misleading in the direction that matters. `draft: true`
  // keeps an item out of every manifest — so out of the listings, search, sitemap, RSS
  // and tag pages — but the public content route fetches
  // `/content/{type}/{slug}/index.md` directly and never consults a manifest or checks
  // the flag. The markdown sits in the public bucket from the moment it is saved, so a
  // draft is readable by anyone who has or guesses its URL. Unlisted, not private.
  if (value.draft) {
    warnings.push({
      level: "warning",
      message:
        "This is a draft — it won't be listed anywhere on the site (no listings, search, " +
        "sitemap or feed), but it is still readable by anyone who has the URL. Treat it as " +
        "unlisted, not private. Set Status to Published when you're ready.",
    });
  }

  const description = value.description.trim();
  if (!description) {
    warnings.push({
      level: "warning",
      message: "No description — add one for SEO and link previews (aim for 50–160 characters).",
    });
  } else if (description.length < 50) {
    warnings.push({
      level: "info",
      message: `Description is short (${description.length} chars); 50–160 is ideal for SEO.`,
    });
  } else if (description.length > 160) {
    warnings.push({
      level: "warning",
      message: `Description is ${description.length} chars; search engines truncate around 160.`,
    });
  }

  const titleLength = value.title.trim().length;
  if (titleLength > 60) {
    warnings.push({
      level: "info",
      message: `Title is ${titleLength} chars; it may be truncated in search results (~60).`,
    });
  }

  if (!value.date) {
    warnings.push({ level: "warning", message: "No date set." });
  } else {
    const t = new Date(value.date).getTime();
    if (!Number.isNaN(t) && t > Date.now()) {
      // Only promise scheduled publishing when the post isn't also a draft —
      // otherwise the date passing changes nothing and the note would mislead.
      warnings.push(
        value.draft
          ? {
              level: "info",
              message: `Dated ${value.date} (in the future). Once Status is Published it will go live automatically at that date; while it stays a draft the date has no effect.`,
            }
          : {
              level: "info",
              message: `Scheduled — this won't appear on the live site until ${value.date}. Publishing runs hourly once the date passes.`,
            }
      );
    }
  }

  if (value.categories.length === 0) {
    warnings.push({
      level: "info",
      message: "No categories — add some so it appears in category listings.",
    });
  }
  if (value.tags.length === 0) {
    warnings.push({ level: "info", message: "No tags." });
  }

  // Relative image references should live under images/ (where uploads go).
  const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  const badImages: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(body)) !== null) {
    const src = match[1].trim();
    if (!/^https?:\/\//i.test(src) && !src.startsWith("images/") && !src.startsWith("/")) {
      badImages.push(src);
    }
  }
  if (badImages.length > 0) {
    const shown = badImages.slice(0, 3).join(", ");
    warnings.push({
      level: "warning",
      message: `Image path${badImages.length > 1 ? "s" : ""} may be wrong (expected "images/…"): ${shown}${
        badImages.length > 3 ? "…" : ""
      }`,
    });
  }

  // Referenced images that don't exist for this post. Only checked when the
  // uploaded-image list is known; a missing file is otherwise invisible until
  // someone views the published page.
  if (availableImages) {
    const existing = new Set(availableImages.map((p) => p.replace(/^\.\//, "")));
    const missing: string[] = [];
    const seen = new Set<string>();
    const refRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    let ref: RegExpExecArray | null;
    while ((ref = refRegex.exec(body)) !== null) {
      const src = ref[1].trim().replace(/^\.\//, "");
      // Only local images/… references can be verified against the media list.
      if (!src.startsWith("images/")) continue;
      // Ignore any title part, e.g. images/a.png "Caption".
      const path = src.split(/\s+/)[0];
      if (existing.has(path) || seen.has(path)) continue;
      seen.add(path);
      missing.push(path);
    }

    if (missing.length > 0) {
      const shown = missing.slice(0, 3).join(", ");
      warnings.push({
        level: "warning",
        message: `Referenced image${missing.length > 1 ? "s" : ""} not found for this post: ${shown}${
          missing.length > 3 ? "…" : ""
        } — upload the file or fix the path.`,
      });
    }
  }

  // Broken / placeholder links and images. Scans markdown links and images in
  // one pass; the leading "!" distinguishes an image from a link.
  const linkOrImage = /(!?)\[([^\]]*)\]\(([^)]*)\)/g;
  let missingAlt = 0;
  let emptyTarget = 0;
  const placeholders: string[] = [];
  let li: RegExpExecArray | null;
  while ((li = linkOrImage.exec(body)) !== null) {
    const isImage = li[1] === "!";
    const label = li[2].trim();
    const target = li[3].trim();

    if (target === "") {
      emptyTarget++;
      continue;
    }
    if (isImage) {
      if (label === "") missingAlt++;
    } else {
      // A link target that clearly isn't a real destination.
      const isPlaceholder =
        target === "#" ||
        /^https?:\/\/(localhost|example\.(com|org|net))/i.test(target) ||
        /^(todo|tbd|xxx)$/i.test(target);
      if (isPlaceholder) placeholders.push(target);
    }
  }

  if (missingAlt > 0) {
    warnings.push({
      level: "warning",
      message: `${missingAlt} image${missingAlt > 1 ? "s are" : " is"} missing alt text — add descriptions for accessibility and SEO.`,
    });
  }
  if (emptyTarget > 0) {
    warnings.push({
      level: "warning",
      message: `${emptyTarget} link${emptyTarget > 1 ? "s/images have" : "/image has"} an empty target.`,
    });
  }
  if (placeholders.length > 0) {
    const shown = placeholders.slice(0, 3).join(", ");
    warnings.push({
      level: "warning",
      message: `Placeholder link${placeholders.length > 1 ? "s" : ""} left in content: ${shown}${
        placeholders.length > 3 ? "…" : ""
      }`,
    });
  }

  return warnings;
}

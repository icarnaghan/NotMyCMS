/**
 * Validates a landing page stored as data. See `src/lib/page-schema.d.ts` for the shape.
 *
 * Returns a list of problem strings — empty means valid. Returns rather than throws so a
 * caller can report every problem in one run, matching `validate-site-config.js`.
 *
 * **Strict on purpose.** An unknown block type or an unknown field is a failure, not a
 * warning, so this repository's own pages cannot be quietly wrong. The runtime renderer
 * does the opposite and skips what it does not recognise, so a page written by a newer
 * admin still renders its remaining blocks on an older deployment and one malformed
 * block cannot blank a page. The design document records why that asymmetry is wanted,
 * so it does not get "fixed" later.
 *
 * Rejecting a bad link here rather than sanitising it at render time means it is a build
 * failure now and an API 400 once pages are admin-edited — never a link that silently
 * disappears.
 *
 * JavaScript rather than TypeScript so the build scripts can import it directly: they
 * run under plain `node`, and `tsx` is not a dependency. `validate-site-config.js` set
 * the same precedent.
 */

const ID = /^[a-z0-9][a-z0-9-]*$/;
const SLUG_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const ALLOWED_TONES = ["active", "neutral", "muted"];
const ALLOWED_COLUMNS = [1, 2, 3];
const ALLOWED_HREF_SCHEMES = ["http:", "https:", "mailto:"];

/** Fields each block type accepts, beyond the universal `id`, `type` and `version`. */
const BLOCK_FIELDS = {
  prose: ["title", "markdown", "muted"],
  "card-grid": ["title", "tone", "columns", "emptyText", "items"],
  columns: ["columns"],
  "badge-list": ["title", "tone", "items"],
  panel: ["title", "lead", "markdown"],
  "social-links": ["title"],
};

const BLOCK_TYPES = Object.keys(BLOCK_FIELDS);
const UNIVERSAL_BLOCK_FIELDS = ["id", "type", "version"];

const PAGE_FIELDS = ["schemaVersion", "slug", "nav", "seo", "header", "breadcrumbs", "blocks"];

const CARD_ITEM_FIELDS = [
  "id",
  "badge",
  "title",
  "titleLink",
  "meta",
  "description",
  "tags",
  "actions",
];

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Collects problems with a path prefix so every message names where it came from.
 *
 * A message like `teaching › blocks[1].items[0].actions[1].to` is the difference between
 * fixing a page in seconds and hunting through JSON.
 */
function makeReporter(problems, prefix) {
  return {
    at(path) {
      return makeReporter(problems, `${prefix}${path}`);
    },
    push(path, message) {
      problems.push(`${prefix}${path} ${message}`);
    },
    /** Rejects fields outside an allow-list, naming the permitted ones. */
    unknownFields(value, allowed, label) {
      for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) {
          problems.push(
            `${prefix}.${key} is not a recognised ${label} field ` +
              `(allowed: ${allowed.join(", ")})`
          );
        }
      }
    },
  };
}

/**
 * Validates a link, which must carry exactly one of `to` or `href`.
 *
 * Both present is rejected rather than preferring one: it means the author was unsure
 * whether the destination is internal, and guessing would route an external URL through
 * the client-side router or open an internal path in a new tab.
 */
function validateLink(report, link) {
  if (!isObject(link)) {
    report.push("", "must be an object with either `to` or `href`");
    return;
  }

  const hasTo = link.to !== undefined;
  const hasHref = link.href !== undefined;

  if (hasTo && hasHref) {
    report.push("", "must have either `to` or `href`, not both");
    return;
  }
  if (!hasTo && !hasHref) {
    report.push("", "must have either `to` (internal) or `href` (external)");
    return;
  }

  if (hasTo) {
    if (!isNonEmptyString(link.to)) {
      report.push(".to", "must be a non-empty string");
      return;
    }
    if (!link.to.startsWith("/")) {
      report.push(".to", `must start with "/" (got ${JSON.stringify(link.to)})`);
    }
    // `//evil.com` is protocol-relative and leaves the site; a colon admits
    // `javascript:` and other schemes. Both are rejected rather than normalised.
    if (link.to.includes("//")) {
      report.push(".to", `must not contain "//" (got ${JSON.stringify(link.to)})`);
    }
    if (link.to.includes(":")) {
      report.push(".to", `must not contain ":" (got ${JSON.stringify(link.to)})`);
    }
    return;
  }

  if (!isNonEmptyString(link.href)) {
    report.push(".href", "must be a non-empty string");
    return;
  }
  let parsed;
  try {
    parsed = new URL(link.href);
  } catch {
    report.push(".href", `must be an absolute URL (got ${JSON.stringify(link.href)})`);
    return;
  }
  if (!ALLOWED_HREF_SCHEMES.includes(parsed.protocol)) {
    report.push(
      ".href",
      `scheme must be one of ${ALLOWED_HREF_SCHEMES.join(", ")} (got ${parsed.protocol})`
    );
  }
}

function validateAction(report, action) {
  if (!isObject(action)) {
    report.push("", "must be an object");
    return;
  }
  report.unknownFields(action, ["label", "primary", "to", "href"], "action");

  if (!isNonEmptyString(action.label)) {
    report.push(".label", "is required and must be a non-empty string");
  }
  if (action.primary !== undefined && typeof action.primary !== "boolean") {
    report.push(".primary", "must be a boolean");
  }
  validateLink(report, action);
}

function validateCardItem(report, item) {
  if (!isObject(item)) {
    report.push("", "must be an object");
    return;
  }
  report.unknownFields(item, CARD_ITEM_FIELDS, "card item");

  if (!isNonEmptyString(item.id)) {
    report.push(".id", "is required and must be a non-empty string");
  } else if (!ID.test(item.id)) {
    report.push(".id", "must be lowercase alphanumerics and hyphens");
  }

  if (!isNonEmptyString(item.title)) {
    report.push(".title", "is required and must be a non-empty string");
  }

  for (const field of ["meta", "description"]) {
    if (item[field] !== undefined && typeof item[field] !== "string") {
      report.push(`.${field}`, "must be a string");
    }
  }

  if (item.badge !== undefined) {
    if (!isObject(item.badge)) {
      report.push(".badge", "must be an object");
    } else {
      report.at(".badge").unknownFields(item.badge, ["text", "tagFilter"], "badge");
      if (!isNonEmptyString(item.badge.text)) {
        report.push(".badge.text", "is required and must be a non-empty string");
      }
      if (item.badge.tagFilter !== undefined && !isNonEmptyString(item.badge.tagFilter)) {
        report.push(".badge.tagFilter", "must be a non-empty string");
      }
    }
  }

  if (item.titleLink !== undefined) {
    validateLink(report.at(".titleLink"), item.titleLink);
  }

  if (item.tags !== undefined) {
    if (!Array.isArray(item.tags)) {
      report.push(".tags", "must be an array");
    } else {
      item.tags.forEach((tag, i) => {
        if (!isNonEmptyString(tag)) {
          report.push(`.tags[${i}]`, "must be a non-empty string");
        }
      });
    }
  }

  if (item.actions !== undefined) {
    if (!Array.isArray(item.actions)) {
      report.push(".actions", "must be an array");
      return;
    }
    item.actions.forEach((action, i) => {
      validateAction(report.at(`.actions[${i}]`), action);
    });
    // Cloudscape renders a primary button with a filled background; two of them in one
    // card means neither reads as the main action.
    const primaries = item.actions.filter((a) => isObject(a) && a.primary === true);
    if (primaries.length > 1) {
      report.push(".actions", `has ${primaries.length} primary actions, at most one is allowed`);
    }
  }
}

function validateTone(report, tone) {
  if (tone !== undefined && !ALLOWED_TONES.includes(tone)) {
    report.push(
      ".tone",
      `must be one of ${ALLOWED_TONES.join(", ")} (got ${JSON.stringify(tone)})`
    );
  }
}

function validateBlock(problems, pagePrefix, block, index, seenIds) {
  const path = `blocks[${index}]`;
  const report = makeReporter(problems, `${pagePrefix}${path}`);

  if (!isObject(block)) {
    report.push("", "must be an object");
    return;
  }

  if (!isNonEmptyString(block.type)) {
    report.push(".type", "is required and must be a non-empty string");
    return;
  }
  if (!BLOCK_TYPES.includes(block.type)) {
    report.push(
      ".type",
      `is not a recognised block type (got ${JSON.stringify(block.type)}, ` +
        `allowed: ${BLOCK_TYPES.join(", ")})`
    );
    return;
  }

  if (!isNonEmptyString(block.id)) {
    report.push(".id", "is required and must be a non-empty string");
  } else if (!ID.test(block.id)) {
    report.push(".id", "must be lowercase alphanumerics and hyphens");
  } else if (seenIds.has(block.id)) {
    // Duplicate ids would collide as React keys and make validation messages ambiguous.
    report.push(".id", `is already used by another block (${JSON.stringify(block.id)})`);
  } else {
    seenIds.add(block.id);
  }

  if (block.version !== 1) {
    report.push(".version", `must be 1 (got ${JSON.stringify(block.version)})`);
  }

  report.unknownFields(
    block,
    [...UNIVERSAL_BLOCK_FIELDS, ...BLOCK_FIELDS[block.type]],
    `${block.type} block`
  );

  switch (block.type) {
    case "prose":
    case "panel": {
      if (!isNonEmptyString(block.markdown)) {
        report.push(".markdown", "is required and must be a non-empty string");
      }
      for (const field of ["title", "lead"]) {
        if (block[field] !== undefined && !isNonEmptyString(block[field])) {
          report.push(`.${field}`, "must be a non-empty string");
        }
      }
      if (block.muted !== undefined && typeof block.muted !== "boolean") {
        report.push(".muted", "must be a boolean");
      }
      break;
    }

    case "card-grid": {
      validateTone(report, block.tone);
      if (block.title !== undefined && !isNonEmptyString(block.title)) {
        report.push(".title", "must be a non-empty string");
      }
      if (block.emptyText !== undefined && !isNonEmptyString(block.emptyText)) {
        report.push(".emptyText", "must be a non-empty string");
      }
      if (block.columns !== undefined && !ALLOWED_COLUMNS.includes(block.columns)) {
        report.push(
          ".columns",
          `must be one of ${ALLOWED_COLUMNS.join(", ")} (got ${JSON.stringify(block.columns)})`
        );
      }
      if (!Array.isArray(block.items)) {
        report.push(".items", "is required and must be an array");
        break;
      }
      const seenItemIds = new Set();
      block.items.forEach((item, i) => {
        validateCardItem(report.at(`.items[${i}]`), item);
        if (isObject(item) && isNonEmptyString(item.id)) {
          if (seenItemIds.has(item.id)) {
            report.push(`.items[${i}].id`, `is already used in this grid`);
          }
          seenItemIds.add(item.id);
        }
      });
      break;
    }

    case "columns": {
      if (!Array.isArray(block.columns)) {
        report.push(".columns", "is required and must be an array");
        break;
      }
      if (block.columns.length < 2) {
        report.push(".columns", "must have at least 2 columns");
      }
      block.columns.forEach((column, i) => {
        const columnReport = report.at(`.columns[${i}]`);
        if (!isObject(column)) {
          columnReport.push("", "must be an object");
          return;
        }
        columnReport.unknownFields(column, ["title", "markdown"], "column");
        if (!isNonEmptyString(column.title)) {
          columnReport.push(".title", "is required and must be a non-empty string");
        }
        if (!isNonEmptyString(column.markdown)) {
          columnReport.push(".markdown", "is required and must be a non-empty string");
        }
      });
      break;
    }

    case "badge-list": {
      validateTone(report, block.tone);
      if (block.title !== undefined && !isNonEmptyString(block.title)) {
        report.push(".title", "must be a non-empty string");
      }
      if (!Array.isArray(block.items)) {
        report.push(".items", "is required and must be an array");
        break;
      }
      block.items.forEach((item, i) => {
        if (!isNonEmptyString(item)) {
          report.push(`.items[${i}]`, "must be a non-empty string");
        }
      });
      break;
    }

    case "social-links": {
      if (block.title !== undefined && !isNonEmptyString(block.title)) {
        report.push(".title", "must be a non-empty string");
      }
      break;
    }
  }
}

/**
 * Validates one page.
 *
 * @param page the parsed JSON
 * @returns problem strings, empty when the page is valid
 */
export function validatePage(page) {
  const problems = [];

  if (!isObject(page)) {
    return ["page must be a JSON object"];
  }

  // Prefix every message with the slug so a failure names the file without the caller
  // having to add it.
  const slugLabel = isNonEmptyString(page.slug) ? page.slug : "<unknown slug>";
  const prefix = `${slugLabel} › `;
  const report = makeReporter(problems, prefix.trimEnd());

  report.unknownFields(page, PAGE_FIELDS, "page");

  if (page.schemaVersion !== 1) {
    problems.push(`${prefix}schemaVersion must be 1 (got ${JSON.stringify(page.schemaVersion)})`);
  }

  if (!isNonEmptyString(page.slug)) {
    problems.push(`${prefix}slug is required and must be a non-empty string`);
  } else if (page.slug.startsWith("/") || page.slug.endsWith("/")) {
    problems.push(
      `${prefix}slug must not start or end with "/" (got ${JSON.stringify(page.slug)})`
    );
  } else if (!page.slug.split("/").every((segment) => SLUG_SEGMENT.test(segment))) {
    problems.push(
      `${prefix}slug segments must be lowercase alphanumerics and hyphens ` +
        `(got ${JSON.stringify(page.slug)})`
    );
  }

  if (page.nav !== undefined) {
    if (!isObject(page.nav)) {
      problems.push(`${prefix}nav must be an object`);
    } else {
      makeReporter(problems, `${prefix}nav`).unknownFields(page.nav, ["label", "order"], "nav");
      if (!isNonEmptyString(page.nav.label)) {
        problems.push(`${prefix}nav.label is required and must be a non-empty string`);
      }
      if (!Number.isInteger(page.nav.order)) {
        problems.push(`${prefix}nav.order is required and must be an integer`);
      }
    }
  }

  if (!isObject(page.seo)) {
    problems.push(`${prefix}seo is required and must be an object`);
  } else {
    makeReporter(problems, `${prefix}seo`).unknownFields(page.seo, ["title", "description"], "seo");
    for (const field of ["title", "description"]) {
      if (!isNonEmptyString(page.seo[field])) {
        problems.push(`${prefix}seo.${field} is required and must be a non-empty string`);
      }
    }
  }

  if (!isObject(page.header)) {
    problems.push(`${prefix}header is required and must be an object`);
  } else {
    makeReporter(problems, `${prefix}header`).unknownFields(
      page.header,
      ["title", "description", "divider"],
      "header"
    );
    if (!isNonEmptyString(page.header.title)) {
      problems.push(`${prefix}header.title is required and must be a non-empty string`);
    }
    if (page.header.description !== undefined && !isNonEmptyString(page.header.description)) {
      problems.push(`${prefix}header.description must be a non-empty string`);
    }
    if (page.header.divider !== undefined && typeof page.header.divider !== "boolean") {
      problems.push(`${prefix}header.divider must be a boolean`);
    }
  }

  if (page.breadcrumbs !== undefined) {
    if (!Array.isArray(page.breadcrumbs)) {
      problems.push(`${prefix}breadcrumbs must be an array`);
    } else {
      page.breadcrumbs.forEach((crumb, i) => {
        const crumbReport = makeReporter(problems, `${prefix}breadcrumbs[${i}]`);
        if (!isObject(crumb)) {
          crumbReport.push("", "must be an object");
          return;
        }
        crumbReport.unknownFields(crumb, ["text", "to"], "breadcrumb");
        if (!isNonEmptyString(crumb.text)) {
          crumbReport.push(".text", "is required and must be a non-empty string");
        }
        // `to` is optional: the final crumb is the current page and links nowhere.
        if (crumb.to !== undefined) {
          validateLink(crumbReport, { to: crumb.to });
        }
      });
    }
  }

  if (!Array.isArray(page.blocks)) {
    problems.push(`${prefix}blocks is required and must be an array`);
    return problems;
  }
  if (page.blocks.length === 0) {
    problems.push(`${prefix}blocks must not be empty`);
  }

  const seenIds = new Set();
  page.blocks.forEach((block, i) => {
    validateBlock(problems, prefix, block, i, seenIds);
  });

  return problems;
}

/** Block types the validator accepts. Exported so the renderer's registry can be checked against it. */
export const KNOWN_BLOCK_TYPES = BLOCK_TYPES;

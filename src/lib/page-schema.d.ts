/**
 * Shape of a landing page stored as data.
 *
 * Five bespoke React components (`/apps`, `/bitesize-javascript`, `/teaching`,
 * `/teaching/cmst388-tips`, `/about`) are replaced by JSON files in `site/pages/` and one
 * generic renderer. The honest trade-off, recorded in the design: this does not remove
 * schemas, it decomposes them. Six block types replace two page shapes. The gain is
 * composition — a new page arrangement needs no new code — not fewer definitions.
 *
 * Validated by `scripts/validate-page.js`, which is strict: an unknown block type or an
 * unknown field fails the build. The runtime renderer is deliberately lenient and skips
 * what it does not recognise. See the design document for why the asymmetry is wanted.
 */

/**
 * Semantic emphasis, deliberately not a colour.
 *
 * The pages being replaced stored `color: "green" | "blue"` and `cardsPerRow`, both of
 * which are Cloudscape's vocabulary — `cardsPerRow` is literally the name of a
 * Cloudscape `Cards` prop. Once this data is admin-edited and published, migrating it is
 * expensive, so the stored value describes intent and the renderer owns the mapping.
 * For Cloudscape: `active` → green, `neutral` → blue, `muted` → grey.
 */
export type Tone = "active" | "neutral" | "muted";

/**
 * An internal destination. Routed client-side through `navigate`.
 *
 * Separate from {@link ExternalLink} because the distinction drives behaviour, not just
 * formatting: internal links must not reload the page, and external links need
 * `target="_blank"` with `rel="noopener noreferrer"`. Two fields make that unambiguous
 * and make validation simple.
 */
export interface InternalLink {
  /** Root-relative path. Must start with `/`, and contain neither `//` nor `:`. */
  to: string;
  href?: never;
}

/** An external destination. Opened in a new tab. */
export interface ExternalLink {
  /** Absolute URL. Scheme must be `http`, `https` or `mailto`. */
  href: string;
  to?: never;
}

export type Link = InternalLink | ExternalLink;

/** A labelled link rendered as a button. */
export type Action = Link & {
  label: string;
  /** At most one action per card may be primary. */
  primary?: boolean;
};

/** One crumb in the page-level breadcrumb trail. */
export interface Breadcrumb {
  text: string;
  /**
   * Omitted on the final crumb, which represents the current page.
   *
   * The page being replaced used `href: "#"` for that crumb and still routed it through
   * `navigate`, which made the current page a link to itself. Omitting the destination
   * says what was meant.
   */
  to?: string;
}

/** Fields every block carries. */
interface BlockBase {
  /**
   * Stable identifier, unique within the page.
   *
   * Used in validation messages and as the React key. Stable rather than positional so
   * that reordering blocks in a future admin editor does not change identity.
   */
  id: string;
  /**
   * Version of this block type's own field set, independent of the page envelope's
   * `schemaVersion`. Needed before external consumers exist: changing a block's fields
   * without a version silently breaks their saved pages.
   */
  version: 1;
}

/** Markdown prose. Rendered without raw-HTML support — see the design document. */
export type ProseBlock = BlockBase & {
  type: "prose";
  /**
   * Rendered as an `h2` above the prose, matching `card-grid` and `badge-list`.
   *
   * Not the same as a {@link PanelBlock} with a title: that draws a bordered container,
   * which `/teaching/cmst388-tips`'s "Additional Resources" heading does not have.
   */
  title?: string;
  markdown: string;
  /**
   * Renders in the secondary text colour.
   *
   * A boolean rather than reusing {@link Tone} because text emphasis is a different axis
   * from badge colour, and `tone: "active"` on a paragraph would be a value with no
   * meaning — a field that silently does nothing is worse than a narrower one.
   *
   * It exists because the pages being replaced disagree: `/apps` and `/teaching` render
   * their intro in the default colour, while `/bitesize-javascript` and
   * `/teaching/cmst388-tips` use the secondary one. Without this the four could not all
   * be reproduced.
   */
  muted?: boolean;
};

/** One card in a {@link CardGridBlock}. */
export interface CardItem {
  id: string;
  /**
   * Short label shown before the title.
   *
   * `tagFilter` stores the tag to filter by, not the finished URL, so the renderer stays
   * in charge of the link format — changing the posts filter URL stays a one-line
   * change. When present the badge becomes its own link; when absent and `titleLink` is
   * set, the badge sits inside the title link, which is how these pages render today.
   */
  badge?: { text: string; tagFilter?: string };
  title: string;
  /** When set, the title itself is the link. */
  titleLink?: Link;
  /** Secondary line above the description, e.g. `"3 Credits"`. */
  meta?: string;
  description?: string;
  /** Rendered as muted badges, e.g. a technology list. */
  tags?: string[];
  actions?: Action[];
}

export type CardGridBlock = BlockBase & {
  type: "card-grid";
  /** Rendered as an `h2` above the grid. Omitted for a page's only grid. */
  title?: string;
  /** Applied to every item badge in the grid. */
  tone?: Tone;
  /** Cards per row at desktop width. One card per row on narrow screens regardless. */
  columns?: 1 | 2 | 3;
  /** Shown instead of the grid when `items` is empty. */
  emptyText?: string;
  items: CardItem[];
};

/** Side-by-side prose. Collapses to one column on narrow screens. */
export type ColumnsBlock = BlockBase & {
  type: "columns";
  columns: { title: string; markdown: string }[];
};

/** A row of short labels, e.g. a skills list. */
export type BadgeListBlock = BlockBase & {
  type: "badge-list";
  title?: string;
  tone?: Tone;
  items: string[];
};

/** A bordered container holding a bolded lead line and prose. */
export type PanelBlock = BlockBase & {
  type: "panel";
  title?: string;
  /** Emphasised first line, e.g. a paper title. */
  lead?: string;
  markdown: string;
};

/**
 * Links to the site's social profiles.
 *
 * Carries no data of its own: the list comes from `site.config.json`, because the nav
 * and footer render the same links and duplicating them here would fork the config.
 */
export type SocialLinksBlock = BlockBase & {
  type: "social-links";
  title?: string;
};

export type Block =
  ProseBlock | CardGridBlock | ColumnsBlock | BadgeListBlock | PanelBlock | SocialLinksBlock;

export type BlockType = Block["type"];

export interface LandingPage {
  /** Version of the envelope below — `slug`, `nav`, `seo`, `header`, `blocks`. */
  schemaVersion: 1;
  /**
   * Route path without a leading slash. May contain slashes, e.g.
   * `teaching/cmst388-tips`.
   */
  slug: string;
  /**
   * Position in the top navigation. Omitted for pages that are reachable but not
   * listed — `teaching/cmst388-tips` has no nav entry today.
   */
  nav?: { label: string; order: number };
  /**
   * Document title and meta description.
   *
   * `seo.title` is distinct from `header.title` because they genuinely differ: the
   * teaching page shows "Classes I Teach" but titles the document "Teaching".
   */
  seo: { title: string; description: string };
  header: {
    title: string;
    /** Omitted where the page shows a bare title, as `/bitesize-javascript` does. */
    description?: string;
    /** Draws a rule between header and content. Only `/about` does this today. */
    divider?: boolean;
  };
  breadcrumbs?: Breadcrumb[];
  blocks: Block[];
}

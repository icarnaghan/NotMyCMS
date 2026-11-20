/**
 * The contract between the headless core and a visual theme.
 *
 * STATUS: draft, type-only (theme-system spec, stage 0). Nothing imports this yet. It
 * was written against the real components, and each view model below is the data and
 * the callbacks the current Cloudscape view actually consumes. It will be tightened as
 * stage 1 extracts the core hooks that produce these shapes.
 *
 * Rule of thumb: a view model is plain data plus callbacks. If a theme needs to decide
 * something that changes what the site does (what matches a search, which post is
 * related, which heading id an anchor gets), that logic belongs in the core, not here.
 */
import type { ComponentType, ReactNode } from "react";
import type { BlockRegistry } from "../core/define-blocks";
import type { DensityPreference, ThemePreference } from "../lib/settings-preferences";
import type { TextSizePreference } from "../lib/text-size";

/** Light, dark or follow the operating system. Called "theme" in storage; see spec decision 4. */
export type ColorMode = ThemePreference;
export type Density = DensityPreference;

export interface AppearanceSettings {
  colorMode: ColorMode;
  /** The mode after resolving "system". Themes apply this, not `colorMode`. */
  resolvedMode: "light" | "dark";
  density: Density;
  textSize: TextSizePreference;
}

export interface ThemeCapabilities {
  colorModes: readonly ColorMode[];
  /** False hides the density control and ignores any stored value without erasing it. */
  density: boolean;
  /** False hides the text size control and ignores any stored value without erasing it. */
  textSize: boolean;
}

/**
 * One post, article or page as a list or card shows it. Dates and labels are already
 * formatted, so a theme never repeats the core's formatting rules.
 */
export interface ContentItem {
  slug: string;
  title: string;
  /** ISO date as in the manifest, for sorting and `<time>` elements. Empty when undated. */
  date: string;
  /** "January 15, 2024". Empty when undated. */
  dateLong: string;
  /** "Jan 15, 2024". Empty when undated. */
  dateShort: string;
  description?: string;
  excerpt?: string;
  /** The category as display text, or an empty string. */
  categoryLabel: string;
  tags: { slug: string; label: string; href: string }[];
  /** Where the item lives. */
  href: string;
}

export interface CategoryOption {
  slug: string;
  label: string;
}

/** Column ids for the posts table, in display order. */
export type PostsColumnId = "title" | "date" | "categories" | "tags" | "excerpt";

/**
 * The posts list and the knowledge-base list. They are separate in the core because they
 * behave differently (posts filter on more fields and can be sorted and re-paged; the
 * knowledge base filters on title only), so the optional parts below are absent for the
 * knowledge base and a theme should render only what is present.
 */
export interface ContentListView {
  kind: "posts" | "knowledge-base";
  title: string;
  status: "loading" | "ready" | "error";
  /** Items on the current page, already filtered, sorted and sliced. */
  items: ContentItem[];
  /** Count after filtering, before pagination. */
  filteredCount: number;
  /** Count before any filtering. */
  totalCount: number;
  filter: {
    text: string;
    onTextChange(text: string): void;
    /** Posts only. */
    category?: {
      /** Category slug, or null for all. */
      selected: string | null;
      options: CategoryOption[];
      onChange(slug: string | null): void;
    };
    /** Posts only. Sets the text filter to the tag and updates the URL. */
    onTagSelect?(slug: string): void;
  };
  /** Posts only. */
  sort?: {
    field: string;
    descending: boolean;
    onChange(field: string, descending: boolean): void;
  };
  pagination: {
    /** The page being shown, after clamping to what exists. */
    page: number;
    pageCount: number;
    onPageChange(page: number): void;
  };
  /** Posts only. Changing either resets to page 1. */
  preferences?: {
    pageSize: number;
    visibleColumns: PostsColumnId[];
    onChange(next: { pageSize: number; visibleColumns: PostsColumnId[] }): void;
  };
  /** Goes to an item. */
  open(item: ContentItem): void;
}

export interface TaxonomyEntry {
  slug: string;
  label: string;
  count: number;
  /** Categories only. Supplied by the site, not the framework. */
  description?: string;
  href: string;
}
export interface TaxonomyView {
  kind: "categories" | "tags";
  title: string;
  status: "loading" | "ready";
  /** Entries after the filter text has been applied. */
  entries: TaxonomyEntry[];
  filterText: string;
  onFilterChange(text: string): void;
  /** Goes to the posts list filtered by this entry. */
  open(entry: TaxonomyEntry): void;
}

export interface HomeView {
  /** The author's name, shown as the page heading. */
  name: string;
  avatar?: string;
  /** A short paragraph from `homeIntro` in config. Absent when not configured. */
  intro?: string;
  social: { id: string; label: string; href: string; path?: string; fill?: boolean }[];
  recentPosts: ContentItem[];
  goTo(path: string): void;
}

export interface Crumb {
  label: string;
  /** Absent on the current page. */
  href?: string;
}

/**
 * How each Markdown element looks. The core decides what an element is (heading ids,
 * image paths, which code is fenced) and calls these to draw it.
 */
export interface MarkdownComponents {
  /** `id` is the anchor the table of contents links to. It must end up on the heading. */
  h2: ComponentType<{ id: string; children: ReactNode }>;
  h3: ComponentType<{ id: string; children: ReactNode }>;
  /** `src` is already resolved to a URL the browser can load. */
  img: ComponentType<{ src: string; alt: string }>;
  table: ComponentType<{ children: ReactNode }>;
  th: ComponentType<{ children: ReactNode }>;
  td: ComponentType<{ children: ReactNode }>;
  /**
   * Optional wrapper react-markdown puts around a fenced code block. Omit it to keep the
   * default `<pre>`. A theme whose `code` draws a complete block can return its children.
   */
  pre?: ComponentType<{ children: ReactNode }>;
  /** A fenced code block. `language` is the info string, `code` the source without its trailing newline. */
  code: ComponentType<{ language: string; code: string }>;
}

export interface ArticleView {
  /** "loading" while the file is fetched; every other field is then empty. */
  status: "loading" | "ready";
  title: string;
  description?: string;
  /** "January 15, 2024 · 3 min · 560 words · Author". Empty when there is no date or author. */
  meta: string;
  tags: { slug: string; label: string; href: string }[];
  /** Home, the section, then the article. The last crumb has no `href`. */
  crumbs: Crumb[];
  /** Level 2 headings, for the table of contents. Each `id` matches a heading in `body`. */
  toc: { id: string; text: string }[];
  /** The rendered Markdown, built with the theme's `markdown` components. */
  body: ReactNode;
  related: ContentItem[];
  goTo(path: string): void;
}

export interface LandingView {
  title: string;
  description?: string;
  /** Draw a divider under the header. */
  divider: boolean;
  /** Empty for a page with no breadcrumbs. The last crumb has no `href`. */
  crumbs: Crumb[];
  /**
   * The blocks, already filtered for unknown types and wrapped in error boundaries. Each
   * element carries its own key.
   */
  blocks: { id: string; element: ReactNode }[];
  goTo(path: string): void;
}

export interface SearchResult {
  slug: string;
  title: string;
  excerpt: string;
  href: string;
  kind: "posts" | "knowledge-base";
}
export interface SearchView {
  open: boolean;
  onOpen(): void;
  onClose(): void;
  query: string;
  onQueryChange(query: string): void;
  results: SearchResult[];
  /** Text for a polite live region, e.g. "3 results found". Empty until a query is long enough. */
  announcement: string;
  /** Navigates to the result and closes the search. */
  choose(result: SearchResult): void;
}

export interface NotFoundView {
  suggestions: { slug: string; title: string; href: string }[];
  goTo(path: string): void;
}

export interface NavItem {
  label: string;
  /** Site-relative path. */
  to: string;
}

export interface ShellView {
  siteTitle: string;
  /** Top-level navigation, in display order. */
  nav: NavItem[];
  settings: {
    colorMode: ColorMode;
    onColorModeChange(mode: ColorMode): void;
    density: Density;
    onDensityChange(density: Density): void;
    textSize: TextSizePreference;
    onTextSizeChange(size: TextSizePreference): void;
    analyticsOptOut: boolean;
    onAnalyticsOptOutChange(optOut: boolean): void;
  };
  /** The settings menu should offer only what the theme supports. */
  capabilities: ThemeCapabilities;
  search: SearchView;
  goTo(path: string): void;
  /** The routed page. */
  children: ReactNode;
}

/** Per-page chrome that wraps a routed view (the Cloudscape `AppLayout`). */
export interface PageFrameProps {
  children: ReactNode;
}

export interface ThemeContract {
  /** Matches the directory under `src/themes/` and the `theme` config value. */
  name: string;
  capabilities: ThemeCapabilities;

  /** Navigation, footer, and the search, cookie and settings UI. Wraps every route. */
  Shell: ComponentType<ShellView>;
  /**
   * Shown while a route or its data loads. `centered` asks for a padded, centered
   * indicator; without it the indicator sits where it is placed.
   */
  Loading: ComponentType<{ centered?: boolean }>;
  /** Wraps routed content. A theme with no per-page chrome returns its children. */
  PageFrame: ComponentType<PageFrameProps>;

  pages: {
    Home: ComponentType<HomeView>;
    Posts: ComponentType<ContentListView>;
    KnowledgeBase: ComponentType<ContentListView>;
    Categories: ComponentType<TaxonomyView>;
    Tags: ComponentType<TaxonomyView>;
    Article: ComponentType<ArticleView>;
    Landing: ComponentType<LandingView>;
    NotFound: ComponentType<NotFoundView>;
  };

  /** One renderer per landing block type. Build it with `defineBlocks`; a missing type is an error. */
  blocks: BlockRegistry;

  markdown: MarkdownComponents;

  /**
   * Applies color mode, density and text size to the document. The core calls it whenever
   * any of them changes, with values already filtered through `capabilities`, so an
   * implementation never sees a setting it declared unsupported.
   */
  applySettings(settings: AppearanceSettings): void;
}

/** What a theme must provide. */
export type Theme = ThemeContract;

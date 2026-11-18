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
import type { Block, BlockType, LandingPage } from "../lib/page-schema";
import type { DensityPreference, ThemePreference } from "../lib/settings-preferences";

/** Light, dark or follow the operating system. Called "theme" in storage; see spec decision 4. */
export type ColorMode = ThemePreference;
export type Density = DensityPreference;

export interface AppearanceSettings {
  colorMode: ColorMode;
  /** The mode after resolving "system". Themes apply this, not `colorMode`. */
  resolvedMode: "light" | "dark";
  density: Density;
}

export interface ThemeCapabilities {
  colorModes: readonly ColorMode[];
  /** False hides the density control and ignores any stored value without erasing it. */
  density: boolean;
}

/** A row in a post or knowledge-base list. Mirrors `PostMeta` plus its resolved link. */
export interface ContentItem {
  slug: string;
  title: string;
  date: string;
  description?: string;
  excerpt?: string;
  /** Raw category slug, as in the manifest. Use `categoryLabel`. */
  category?: string;
  categoryLabel?: string;
  tags: { slug: string; label: string }[];
  href: string;
}

export interface CategoryOption {
  slug: string;
  label: string;
}

/** Posts and knowledge base. The two differ only in what the core enables. */
export interface ContentListView {
  kind: "posts" | "knowledge-base";
  title: string;
  status: "loading" | "ready" | "error";
  /** Items on the current page, already filtered, sorted and sliced. */
  items: ContentItem[];
  /** Count after filtering, before pagination. */
  totalCount: number;
  filter: {
    text: string;
    onTextChange(text: string): void;
    /** Present for posts only. Knowledge base filters on title alone. */
    category?: {
      selected: string | null;
      options: CategoryOption[];
      onChange(slug: string | null): void;
    };
    activeTag: string | null;
    onTagChange(slug: string | null): void;
  };
  pagination: {
    page: number;
    pageCount: number;
    pageSize: number;
    onPageChange(page: number): void;
  };
  /** Posts only: which columns show, remembered by the core. */
  columns?: { visible: string[]; onChange(visible: string[]): void };
  /** Navigates to an item, honoring modifier keys where the theme exposes real links. */
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
  status: "loading" | "ready" | "error";
  entries: TaxonomyEntry[];
}

export interface HomeView {
  siteName: string;
  tagline: string;
  avatar?: string;
  social: { id: string; label: string; href: string }[];
  recentPosts: ContentItem[];
  status: "loading" | "ready" | "error";
  open(item: ContentItem): void;
  goTo(path: string): void;
}

export interface Crumb {
  label: string;
  /** Absent on the current page. */
  href?: string;
}

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * Element overrides handed to the Markdown renderer. The heading overrides must use the
 * core's `headingId` so anchors match the table of contents.
 */
export interface MarkdownComponents {
  h2: ComponentType<{ id: string; children: ReactNode }>;
  h3: ComponentType<{ id: string; children: ReactNode }>;
  a: ComponentType<{ href?: string; children: ReactNode }>;
  img: ComponentType<{ src: string; alt: string }>;
  table: ComponentType<{ children: ReactNode }>;
  /** Fenced code. `language` is the info string, `code` the raw source. */
  code: ComponentType<{ language: string | null; code: string }>;
}

export interface ArticleView {
  status: "loading" | "ready" | "missing";
  title: string;
  /** ISO date, or undefined when the frontmatter has none. */
  date?: string;
  readingMinutes: number;
  crumbs: Crumb[];
  toc: TocEntry[];
  /** The rendered Markdown body, built with the theme's `markdown` components. */
  body: ReactNode;
  related: ContentItem[];
  /** Shown instead of the article when status is "missing". */
  notFound?: NotFoundView;
  goTo(path: string): void;
}

export interface LandingView {
  page: LandingPage;
  crumbs: Crumb[];
  /** The block list, already filtered for unknown types and wrapped in error boundaries. */
  blocks: { id: string; element: ReactNode }[];
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
  query: string;
  onQueryChange(query: string): void;
  onClose(): void;
  status: "idle" | "loading" | "ready" | "error";
  results: SearchResult[];
  /** The text for a polite live region, e.g. "3 results". */
  announcement: string;
  /** Navigates and closes. */
  choose(result: SearchResult): void;
}

export interface NotFoundView {
  suggestions: { slug: string; title: string; href: string }[];
  goTo(path: string): void;
}

export interface NavItem {
  label: string;
  href: string;
  current: boolean;
}

export interface ShellView {
  siteTitle: string;
  nav: NavItem[];
  settings: {
    colorMode: ColorMode;
    onColorModeChange(mode: ColorMode): void;
    density: Density;
    onDensityChange(density: Density): void;
    analyticsOptOut: boolean;
    onAnalyticsOptOutChange(optOut: boolean): void;
  };
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

export interface Theme {
  /** Matches the directory under `src/themes/` and the `theme` config value. */
  name: string;
  capabilities: ThemeCapabilities;

  /** Navigation, footer, and the search, cookie and settings UI. Wraps every route. */
  Shell: ComponentType<ShellView>;
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

  /** One renderer per landing block type. A missing entry is a type error. */
  blocks: { [T in BlockType]: ComponentType<{ block: Extract<Block, { type: T }> }> };

  markdown: MarkdownComponents;

  /** Applies color mode and density to the document. The core calls it on every change. */
  applySettings(settings: AppearanceSettings): void;
}

/**
 * Startup fetch of the landing-pages manifest, shared across routing and navigation.
 *
 * The compiled registry (`site/pages/index.js`) used to supply the page set synchronously
 * at build time; this makes that set a runtime value fetched once from S3. Everything that
 * needs "which landing pages exist" — the top navigation and the catch-all route resolver
 * in `App.tsx` — reads it from here.
 *
 * The "never blank the site" guarantee (requirement 1.6): a manifest fetch failure
 * resolves to an empty page set with `status: "error"`, not a thrown render. Framework
 * routes (posts, KB, categories, tags) do not depend on this and keep working; landing
 * URLs simply fall through to the post path or the 404 page.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchPagesManifest, type PageManifestEntry } from "./pages-manifest";

type PagesStatus = "loading" | "ready" | "error";

interface PagesContextValue {
  /** Every landing page, in nav order then unlisted. Empty until loaded or on failure. */
  pages: PageManifestEntry[];
  /** Pages with a `nav`, sorted by `nav.order` — the top-navigation entries. */
  navEntries: PageManifestEntry[];
  /** Look up a page by its (possibly slash-containing) slug. */
  pageBySlug: (slug: string) => PageManifestEntry | undefined;
  status: PagesStatus;
}

const PagesContext = createContext<PagesContextValue>({
  pages: [],
  navEntries: [],
  pageBySlug: () => undefined,
  status: "loading",
});

export function PagesProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<PageManifestEntry[]>([]);
  const [status, setStatus] = useState<PagesStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    fetchPagesManifest().then((entries) => {
      if (cancelled) return;
      setPages(entries);
      // fetchPagesManifest never throws — it returns [] on failure. An empty manifest is
      // indistinguishable from a failed fetch here, which is intentional: both mean "no
      // landing pages resolvable", and the fallbacks (post path / 404) are identical.
      setStatus(entries.length > 0 ? "ready" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<PagesContextValue>(() => {
    const navEntries = pages
      .filter((p): p is PageManifestEntry & { nav: NonNullable<PageManifestEntry["nav"]> } =>
        Boolean(p.nav)
      )
      .sort((a, b) => a.nav.order - b.nav.order);
    const bySlug = new Map(pages.map((p) => [p.slug, p]));
    return {
      pages,
      navEntries,
      pageBySlug: (slug: string) => bySlug.get(slug),
      status,
    };
  }, [pages, status]);

  return <PagesContext.Provider value={value}>{children}</PagesContext.Provider>;
}

/** Access the landing-pages manifest state. */
// eslint-disable-next-line react-refresh/only-export-components
export function usePages(): PagesContextValue {
  return useContext(PagesContext);
}

/**
 * Renders a landing page by slug, fetching its JSON from S3 at runtime.
 *
 * Was a synchronous lookup in the compiled registry (`pageBySlug`). Now it fetches
 * `/content/pages/<slug>/page.json` — the same runtime-fetch pattern `ContentPage` uses
 * for posts/KB markdown — so landing-page content is editable without a rebuild
 * (landing-page-editor stage 1).
 *
 * States:
 *   - loading: a spinner while the fetch is in flight.
 *   - resolved: hand the parsed page to the unchanged `LandingPageView`.
 *   - missing / malformed / fetch error: the not-found page, never a blank screen or a
 *     throw (requirement 1.6). A single page failing must not take down the app.
 */
import { useEffect, useState } from "react";
import Spinner from "@cloudscape-design/components/spinner";
import Box from "@cloudscape-design/components/box";
import type { LandingPage } from "../../lib/page-schema";
import { NotFoundPage } from "../not-found/not-found-page";
import { LandingPageView } from "./landing-page";

type FetchState =
  | { status: "loading"; slug: string }
  | { status: "ready"; slug: string; page: LandingPage }
  | { status: "missing"; slug: string };

/** Fetch a landing page's JSON. Returns null on any non-ok / parse / network failure. */
async function fetchPage(slug: string): Promise<LandingPage | null> {
  try {
    const res = await fetch(`/content/pages/${slug}/page.json`);
    if (!res.ok) return null;
    // The SPA fallback serves index.html for unknown paths; reject that so a missing
    // page.json becomes "not found" rather than an HTML parse error (same guard as
    // ContentPage uses for markdown).
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) return null;
    const page = (await res.json()) as LandingPage;
    if (!page || typeof page !== "object" || !Array.isArray(page.blocks)) return null;
    return page;
  } catch {
    return null;
  }
}

export function RegistryPage({ slug }: { slug: string }) {
  const [state, setState] = useState<FetchState>({ status: "loading", slug });

  useEffect(() => {
    let cancelled = false;
    fetchPage(slug).then((page) => {
      if (cancelled) return;
      setState(page ? { status: "ready", slug, page } : { status: "missing", slug });
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // When the slug changes, the state from the previous slug is stale until the effect
  // above resolves. Render loading for the new slug rather than the old slug's result —
  // this derives the reset from props instead of a synchronous setState in the effect.
  const current: FetchState = state.slug === slug ? state : { status: "loading", slug };

  if (current.status === "loading") {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
      </Box>
    );
  }

  if (current.status === "missing") {
    return <NotFoundPage slug={slug} />;
  }

  return <LandingPageView page={current.page} />;
}

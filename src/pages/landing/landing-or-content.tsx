/**
 * The catch-all resolver for a single-segment-or-nested path that is neither the home
 * page nor an explicit framework route.
 *
 * Replaces the build-time split where landing pages had explicit per-slug routes and
 * everything else fell to `/:slug → ContentPage basePath="posts"`. With landing pages now
 * a runtime manifest, "is this slug a landing page?" is a manifest lookup:
 *
 *   1. slug in the pages manifest  → render the landing page (fetches its page.json)
 *   2. otherwise                   → treat it as a post (ContentPage basePath="posts"),
 *                                     which 404s itself if no such post exists
 *
 * Landing-first ordering makes the decision deterministic. Requirement 4.1 forbids
 * creating a landing slug that collides with a post slug, so in practice the two sets are
 * disjoint; the ordering only matters for a hypothetical collision.
 *
 * While the manifest is still loading, a post is NOT rendered prematurely: doing so would
 * flash a 404 for a slug that is about to resolve as a landing page. We wait for the
 * manifest to settle (ready or error) before falling through to the post path.
 */
import { useParams } from "react-router-dom";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { usePages } from "./pages-context";
import { RegistryPage } from "./registry-route";
import { ContentPage } from "../../components/content-renderer";

export function LandingOrContent() {
  const params = useParams();
  const { pageBySlug, status } = usePages();

  // The catch-all route path is `/*`, so the matched remainder is params["*"]. Strip any
  // trailing slash so `/about/` resolves like `/about`.
  const slug = (params["*"] ?? "").replace(/\/+$/, "");

  // Manifest still loading: hold rather than render a post that might turn out to be a
  // landing page once the manifest arrives.
  if (status === "loading") {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
      </Box>
    );
  }

  if (pageBySlug(slug)) {
    return <RegistryPage slug={slug} />;
  }

  // Not a landing page — it's a post (or a 404, which ContentPage handles). ContentPage
  // reads the slug from useParams(), but under a `/*` route the value lives in params["*"]
  // rather than params.slug, so pass it explicitly.
  return <ContentPage basePath="posts" slug={slug} />;
}

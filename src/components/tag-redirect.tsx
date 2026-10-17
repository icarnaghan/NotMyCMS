import { useParams, Navigate } from "react-router-dom";

/**
 * Redirects legacy /categories/:name and /tags/:name URLs
 * to the posts page with the appropriate tag filter.
 * Preserves old indexed URLs from Google/Hugo.
 */
export function TagRedirect() {
  const { name } = useParams();
  return <Navigate to={`/posts?tag=${encodeURIComponent(name || "")}`} replace />;
}

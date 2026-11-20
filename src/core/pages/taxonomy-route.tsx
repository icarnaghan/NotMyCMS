/**
 * Categories and tags pages. Builds the view model and hands it to the active theme.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import activeTheme from "@theme";
import { toDisplayLabel } from "../../lib/content";
import { siteConfig } from "../../lib/site-config";
import { useDocumentTitle } from "../../lib/use-document-title";
import { countCategories, countTags, filterTaxonomy } from "../taxonomy";
import { useManifest } from "../use-manifest";
import type { TaxonomyEntry } from "../../themes/types";

function TaxonomyRoute({ kind }: { kind: "categories" | "tags" }) {
  const title = kind === "categories" ? "Categories" : "Tags";
  useDocumentTitle(title);
  const navigate = useNavigate();
  const { items: posts, loading } = useManifest("posts");
  const [filterText, setFilterText] = useState("");
  const counted = useMemo(
    () => (kind === "categories" ? countCategories(posts) : countTags(posts)),
    [kind, posts]
  );
  const entries = useMemo<TaxonomyEntry[]>(
    () =>
      filterTaxonomy(counted, filterText).map((c) => ({
        slug: c.name,
        label: toDisplayLabel(c.name),
        count: c.count,
        // Descriptions are the site's own words, supplied through config.
        description:
          kind === "categories" ? (siteConfig.categoryDescriptions ?? {})[c.name] : undefined,
        href: `/posts?tag=${encodeURIComponent(c.name)}`,
      })),
    [counted, filterText, kind]
  );
  const View = kind === "categories" ? activeTheme.pages.Categories : activeTheme.pages.Tags;
  return (
    <View
      kind={kind}
      title={title}
      status={loading ? "loading" : "ready"}
      entries={entries}
      filterText={filterText}
      onFilterChange={setFilterText}
      open={(entry) => navigate(entry.href)}
    />
  );
}

export const CategoriesRoute = () => <TaxonomyRoute kind="categories" />;
export const TagsRoute = () => <TaxonomyRoute kind="tags" />;

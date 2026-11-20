/** The 404 page. Builds the view model and hands it to the active theme. */
import { useNavigate } from "react-router-dom";
import activeTheme from "@theme";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useNotFoundSuggestions } from "../not-found-suggestions";

export function NotFoundRoute({ slug }: { slug?: string }) {
  useDocumentTitle("Page Not Found");
  const navigate = useNavigate();
  const suggestions = useNotFoundSuggestions(slug);
  const View = activeTheme.pages.NotFound;
  return (
    <View
      suggestions={suggestions.map((p) => ({ slug: p.slug, title: p.title, href: `/${p.slug}` }))}
      goTo={navigate}
    />
  );
}

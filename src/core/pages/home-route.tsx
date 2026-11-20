/** The home page. Builds the view model and hands it to the active theme. */
import { useNavigate } from "react-router-dom";
import activeTheme from "@theme";
import { SOCIAL_LINKS } from "../../lib/social-links";
import { siteConfig } from "../../lib/site-config";
import { useDocumentTitle } from "../../lib/use-document-title";
import { toContentItem } from "../content-item";
import { useRecentPosts } from "../recent-posts";

export function HomeRoute() {
  useDocumentTitle();
  const navigate = useNavigate();
  const recent = useRecentPosts(6);
  const View = activeTheme.pages.Home;
  return (
    <View
      name={siteConfig.author.name}
      avatar={siteConfig.author.avatar}
      intro={siteConfig.homeIntro}
      social={SOCIAL_LINKS}
      recentPosts={recent.map((p) => toContentItem(p))}
      goTo={navigate}
    />
  );
}

/**
 * Social links for display: the profiles from `site.config.json` joined with their icon
 * artwork from `social-icons.tsx`.
 *
 * The exported shape is unchanged from when this file held the data inline, so the two
 * consuming pages need no edits. Profiles now come from configuration; only the artwork
 * lives here.
 */
import { siteConfig } from "./site-config";
import { SOCIAL_ICONS } from "./social-icons";

export interface SocialLinkView {
  id: string;
  label: string;
  href: string;
  /** Absent when there is no icon for this id — render as a text link instead. */
  path?: string;
  fill?: boolean;
}

export const SOCIAL_LINKS: SocialLinkView[] = siteConfig.social.map((link) => {
  const art = SOCIAL_ICONS[link.id];
  return {
    id: link.id,
    label: link.label,
    href: link.href,
    path: art?.path,
    fill: art?.fill,
  };
});

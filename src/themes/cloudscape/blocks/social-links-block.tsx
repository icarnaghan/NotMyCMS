import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { SocialLinksBlock } from "../../../lib/page-schema";
import { SOCIAL_LINKS } from "../../../lib/social-links";

/**
 * The site's social profiles.
 *
 * The one block that carries no data of its own: the list comes from
 * `site.config.json`. The footer renders the same links, and duplicating them into page
 * data would mean two places to edit and a way for them to disagree.
 *
 * A consequence worth stating: adding a profile to the config makes it appear here
 * without touching the page. That is the intent, not a surprise.
 */
export function SocialLinksBlockView({ block }: { block: SocialLinksBlock }) {
  const links = (
    <SpaceBetween size="m" direction="horizontal">
      {SOCIAL_LINKS.map((link) => (
        <Link key={link.id} href={link.href} external>
          {link.label}
        </Link>
      ))}
    </SpaceBetween>
  );

  if (!block.title) return links;

  return <Container header={<Header variant="h2">{block.title}</Header>}>{links}</Container>;
}

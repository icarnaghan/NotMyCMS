import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Link from "@cloudscape-design/components/link";

import { DOCS, docUrl } from "../../lib/docs";

/**
 * Help: a thin index that links out to the project documentation rather than duplicating
 * it. The docs live in the repository (`docs/`), are the single source of truth, and are
 * rendered by the git host — copying them into the admin would just create a drift
 * problem. A short "editing configuration" note is inline because it's the most common
 * question (the config hints around the app point here).
 */
export default function HelpPage() {
  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Guides for running the site. These link to the project documentation."
      >
        Help
      </Header>

      <Container header={<Header variant="h2">Documentation</Header>}>
        <SpaceBetween size="l">
          {Object.values(DOCS).map((doc) => {
            const url = docUrl(doc);
            return (
              <div key={doc.path}>
                {url ? (
                  <Link href={url} external fontSize="heading-s">
                    {doc.label}
                  </Link>
                ) : (
                  <Box fontSize="heading-s" fontWeight="bold">
                    {doc.label}
                  </Box>
                )}
                <Box color="text-body-secondary">{doc.description}</Box>
              </div>
            );
          })}
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2">Editing site configuration</Header>}>
        <SpaceBetween size="s">
          <Box variant="p">
            Identity and presentation settings — social links, the author bio, the site description,
            the analytics id — live in <Box variant="code">site.config.json</Box> in the site
            repository. They are edited there and go live on the next deploy, not through this
            admin.
          </Box>
          <Box variant="p" color="text-body-secondary">
            This is deliberate: configuration is infrequent and some of it (domains, resource names)
            is infrastructure that must be reviewed before it ships. Content — posts, articles, and
            landing pages — is what you edit here.
          </Box>
          {docUrl(DOCS.developerGuide) && (
            <Link href={docUrl(DOCS.developerGuide)!} external>
              Developer Guide docs
            </Link>
          )}
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}

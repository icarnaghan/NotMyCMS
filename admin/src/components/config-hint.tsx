import Popover from "@cloudscape-design/components/popover";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Icon from "@cloudscape-design/components/icon";

import { docUrl, DOCS, type DocLink } from "../lib/docs";

/**
 * A small "(?)" help affordance for things the admin surfaces but does not edit —
 * primarily values that live in `site.config.json` and change via a repo edit + deploy,
 * not through the admin.
 *
 * It states which config field the value comes from and links to the relevant doc, right
 * where the question arises (e.g. the social-links block editor). Deliberately tiny: a
 * popover with a sentence and a link, no fetched content, no markdown pipeline — the Help
 * page and the project docs are the long form. Keeps the "light CMS" light.
 *
 * The text is written generically ("edit `social` in site.config.json"), not
 * site-specifically, so it carries into the framework unchanged.
 */
export function ConfigHint({
  /** The config path this value comes from, e.g. "social" or "author.name". */
  field,
  /** One or two sentences on how to change it. */
  children,
  /** Which doc to link to for the full picture. Defaults to the developer guide. */
  doc = DOCS.developerGuide,
}: {
  field: string;
  children: React.ReactNode;
  doc?: DocLink;
}) {
  return (
    <Popover
      header="Edit in site configuration"
      position="top"
      size="medium"
      triggerType="custom"
      content={
        <SpaceBetween size="xs">
          <Box variant="p">{children}</Box>
          <Box variant="p" color="text-body-secondary">
            This value lives in <Box variant="code">site.config.json</Box> under{" "}
            <Box variant="code">{field}</Box>. It changes via a repository edit and a deploy, not
            through the admin.
          </Box>
          {docUrl(doc) && (
            <Link href={docUrl(doc)!} external>
              {doc.label} docs
            </Link>
          )}
        </SpaceBetween>
      }
    >
      <Link variant="info">
        <Icon name="status-info" /> How do I change this?
      </Link>
    </Popover>
  );
}

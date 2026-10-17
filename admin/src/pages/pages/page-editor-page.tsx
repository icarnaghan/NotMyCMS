import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Checkbox from "@cloudscape-design/components/checkbox";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import Flashbar, { FlashbarProps } from "@cloudscape-design/components/flashbar";

import { useAuth } from "../../auth/use-auth";
import { createApiClient } from "../../api/client";
import {
  getPage,
  savePage,
  BLOCK_TYPES,
  type Block,
  type BlockType,
  type LandingPage,
} from "../../api/pages";
import { BlockEditor } from "./block-editor";
import { newBlock } from "./new-block";

/**
 * Create / edit a landing page.
 *
 * Envelope fields (slug, nav, seo, header) are structured inputs; the block list supports
 * add (typed), remove, and up/down reorder — not drag-and-drop, which Cloudscape only
 * ships under internal/ and which is less keyboard-accessible (decision on record). The
 * server runs the authoritative validator on save and returns field-level messages, which
 * are shown verbatim.
 */

const BLANK_PAGE: LandingPage = {
  schemaVersion: 1,
  slug: "",
  seo: { title: "", description: "" },
  header: { title: "" },
  blocks: [],
};

/** Monotonic id for new blocks within this editing session. */
let blockCounter = 0;
function nextBlockId(type: string): string {
  blockCounter += 1;
  return `${type}-${blockCounter}`;
}

export default function PageEditorPage() {
  const navigate = useNavigate();
  const params = useParams();
  const { getAccessToken } = useAuth();
  const client = useMemo(() => createApiClient(getAccessToken), [getAccessToken]);

  // The slug route param is greedy ("*") so it can hold teaching/cmst388-tips.
  const slug = params["*"] ? params["*"].replace(/\/+$/, "") : undefined;
  const isNew = slug === undefined;

  const [page, setPage] = useState<LandingPage>(BLANK_PAGE);
  const [lastModified, setLastModified] = useState<string | undefined>();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    getPage(client, slug!)
      .then((doc) => {
        const { lastModified: lm, ...rest } = doc;
        setPage(rest);
        setLastModified(lm);
      })
      .catch((err) =>
        setFlash([errorFlash(`Failed to load page: ${err.message}`, () => setFlash([]))])
      )
      .finally(() => setLoading(false));
  }, [client, slug, isNew]);

  function update(fields: Partial<LandingPage>) {
    setPage((p) => ({ ...p, ...fields }));
  }

  // --- Block list operations ---

  function addBlock(type: BlockType) {
    update({ blocks: [...page.blocks, newBlock(type, nextBlockId(type))] });
  }
  function updateBlock(index: number, next: Block) {
    update({ blocks: page.blocks.map((b, i) => (i === index ? next : b)) });
  }
  function removeBlock(index: number) {
    update({ blocks: page.blocks.filter((_, i) => i !== index) });
  }
  function moveBlock(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= page.blocks.length) return;
    const blocks = [...page.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    update({ blocks });
  }

  async function handleSave() {
    setSaving(true);
    setFlash([]);
    try {
      const saved = await savePage(client, isNew ? undefined : slug, {
        ...page,
        ...(lastModified ? { lastModified } : {}),
      });
      setLastModified(saved.lastModified);
      setFlash([
        {
          type: "success",
          content: `Saved "${saved.slug}". Live after the next cache refresh.`,
          dismissible: true,
          onDismiss: () => setFlash([]),
          id: "saved",
        },
      ]);
      if (isNew) navigate(`/pages/${saved.slug}`);
    } catch (err) {
      // The server returns field-level validation messages (newline-separated) — show
      // them verbatim rather than a generic failure.
      setFlash([errorFlash((err as Error).message, () => setFlash([]))]);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
      </Box>
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => navigate("/pages")} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} loading={saving}>
                Save
              </Button>
            </SpaceBetween>
          }
        >
          {isNew ? "New landing page" : `Edit: ${slug}`}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {flash.length > 0 && <Flashbar items={flash} />}

        <Form>
          <SpaceBetween size="l">
            {/* --- Envelope --- */}
            <Container header={<Header variant="h2">Page</Header>}>
              <SpaceBetween size="s">
                <FormField
                  label="Slug"
                  description="URL path, no leading slash. May contain slashes (e.g. teaching/cmst388-tips)."
                >
                  <Input
                    value={page.slug}
                    disabled={!isNew}
                    onChange={(e) => update({ slug: e.detail.value })}
                  />
                </FormField>
                <FormField label="SEO title" description="The document title and nav/head title.">
                  <Input
                    value={page.seo.title}
                    onChange={(e) => update({ seo: { ...page.seo, title: e.detail.value } })}
                  />
                </FormField>
                <FormField label="SEO description">
                  <Input
                    value={page.seo.description}
                    onChange={(e) => update({ seo: { ...page.seo, description: e.detail.value } })}
                  />
                </FormField>
                <FormField
                  label="Header title"
                  description="The on-page H1 (may differ from the SEO title)."
                >
                  <Input
                    value={page.header.title}
                    onChange={(e) => update({ header: { ...page.header, title: e.detail.value } })}
                  />
                </FormField>
                <FormField label="Header description">
                  <Input
                    value={page.header.description ?? ""}
                    onChange={(e) =>
                      update({
                        header: { ...page.header, description: e.detail.value || undefined },
                      })
                    }
                  />
                </FormField>
                <Checkbox
                  checked={page.header.divider ?? false}
                  onChange={(e) =>
                    update({ header: { ...page.header, divider: e.detail.checked } })
                  }
                >
                  Rule between header and content
                </Checkbox>
              </SpaceBetween>
            </Container>

            {/* --- Navigation --- */}
            <Container
              header={
                <Header variant="h2" description="Leave the label empty to keep the page unlisted.">
                  Navigation
                </Header>
              }
            >
              <SpaceBetween size="s">
                <FormField label="Nav label">
                  <Input
                    value={page.nav?.label ?? ""}
                    onChange={(e) => {
                      const label = e.detail.value;
                      update({
                        nav: label ? { label, order: page.nav?.order ?? 99 } : undefined,
                      });
                    }}
                  />
                </FormField>
                {page.nav && (
                  <FormField label="Nav order" description="Lower numbers appear first.">
                    <Input
                      type="number"
                      value={String(page.nav.order)}
                      onChange={(e) =>
                        update({ nav: { label: page.nav!.label, order: Number(e.detail.value) } })
                      }
                    />
                  </FormField>
                )}
              </SpaceBetween>
            </Container>

            {/* --- Blocks --- */}
            <Container
              header={
                <Header
                  variant="h2"
                  counter={`(${page.blocks.length})`}
                  actions={
                    <ButtonDropdown
                      items={BLOCK_TYPES.map((t) => ({ id: t, text: t }))}
                      onItemClick={({ detail }) => addBlock(detail.id as BlockType)}
                    >
                      Add block
                    </ButtonDropdown>
                  }
                >
                  Content blocks
                </Header>
              }
            >
              {page.blocks.length === 0 ? (
                <Box color="text-body-secondary">No blocks yet. Add one to build the page.</Box>
              ) : (
                <SpaceBetween size="l">
                  {page.blocks.map((block, i) => (
                    <Container
                      key={block.id}
                      header={
                        <Header
                          variant="h3"
                          actions={
                            <SpaceBetween direction="horizontal" size="xs">
                              <Button
                                iconName="angle-up"
                                variant="icon"
                                ariaLabel="Move block up"
                                disabled={i === 0}
                                onClick={() => moveBlock(i, -1)}
                              />
                              <Button
                                iconName="angle-down"
                                variant="icon"
                                ariaLabel="Move block down"
                                disabled={i === page.blocks.length - 1}
                                onClick={() => moveBlock(i, 1)}
                              />
                              <Button
                                iconName="remove"
                                variant="icon"
                                ariaLabel="Remove block"
                                onClick={() => removeBlock(i)}
                              />
                            </SpaceBetween>
                          }
                        >
                          {block.type}{" "}
                          <Box variant="span" color="text-body-secondary">
                            #{block.id}
                          </Box>
                        </Header>
                      }
                    >
                      <BlockEditor block={block} onChange={(next) => updateBlock(i, next)} />
                    </Container>
                  ))}
                </SpaceBetween>
              )}
            </Container>
          </SpaceBetween>
        </Form>
      </SpaceBetween>
    </ContentLayout>
  );
}

function errorFlash(content: string, onDismiss: () => void): FlashbarProps.MessageDefinition {
  return {
    type: "error",
    header: "Save failed",
    content: (
      <Box>
        {content.split("\n").map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </Box>
    ),
    dismissible: true,
    onDismiss,
    id: "save-error",
  };
}

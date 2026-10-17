import { useState } from "react";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Textarea from "@cloudscape-design/components/textarea";
import Select from "@cloudscape-design/components/select";
import Checkbox from "@cloudscape-design/components/checkbox";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";

import type { Block, Tone } from "../../api/pages";
import { ConfigHint } from "../../components/config-hint";

/**
 * Per-block field editor. Simple block types (prose, panel, badge-list, columns,
 * social-links) get fully structured forms. The one genuinely nested type, card-grid,
 * edits its `items` as JSON here — a full nested card-item builder is deferred (non-goal
 * for v1); the server validates it either way and reports field-level errors. This keeps
 * the common case (prose/panel/badges) fully no-code while not blocking on the hardest UI.
 */

const TONE_OPTIONS: { label: string; value: Tone }[] = [
  { label: "Active (green)", value: "active" },
  { label: "Neutral (blue)", value: "neutral" },
  { label: "Muted (grey)", value: "muted" },
];

export function BlockEditor({
  block,
  onChange,
}: {
  block: Block;
  onChange: (next: Block) => void;
}) {
  // Narrowing helper: patch and emit.
  const patch = (fields: Partial<Block>) => onChange({ ...block, ...fields } as Block);

  switch (block.type) {
    case "prose":
      return (
        <SpaceBetween size="s">
          <FormField label="Title" description="Optional heading above the prose.">
            <Input value={block.title ?? ""} onChange={(e) => patch({ title: e.detail.value })} />
          </FormField>
          <FormField label="Markdown">
            <Textarea
              value={block.markdown}
              onChange={(e) => patch({ markdown: e.detail.value })}
              rows={6}
            />
          </FormField>
          <Checkbox
            checked={block.muted ?? false}
            onChange={(e) => patch({ muted: e.detail.checked })}
          >
            Muted (secondary text colour)
          </Checkbox>
        </SpaceBetween>
      );

    case "panel":
      return (
        <SpaceBetween size="s">
          <FormField label="Title">
            <Input value={block.title ?? ""} onChange={(e) => patch({ title: e.detail.value })} />
          </FormField>
          <FormField label="Lead" description="Emphasised first line (optional).">
            <Input value={block.lead ?? ""} onChange={(e) => patch({ lead: e.detail.value })} />
          </FormField>
          <FormField label="Markdown">
            <Textarea
              value={block.markdown}
              onChange={(e) => patch({ markdown: e.detail.value })}
              rows={5}
            />
          </FormField>
        </SpaceBetween>
      );

    case "badge-list":
      return (
        <SpaceBetween size="s">
          <FormField label="Title">
            <Input value={block.title ?? ""} onChange={(e) => patch({ title: e.detail.value })} />
          </FormField>
          <FormField label="Tone">
            <Select
              selectedOption={
                block.tone ? (TONE_OPTIONS.find((o) => o.value === block.tone) ?? null) : null
              }
              onChange={(e) =>
                patch({ tone: (e.detail.selectedOption?.value as Tone) || undefined })
              }
              options={TONE_OPTIONS}
              placeholder="Default"
            />
          </FormField>
          <FormField label="Badges" description="One per line.">
            <Textarea
              value={(block.items ?? []).join("\n")}
              onChange={(e) =>
                patch({
                  items: e.detail.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              rows={4}
            />
          </FormField>
        </SpaceBetween>
      );

    case "columns":
      return (
        <SpaceBetween size="s">
          {block.columns.map((col, i) => (
            <Box key={i}>
              <FormField label={`Column ${i + 1} title`}>
                <Input
                  value={col.title}
                  onChange={(e) => {
                    const columns = block.columns.map((c, j) =>
                      j === i ? { ...c, title: e.detail.value } : c
                    );
                    patch({ columns });
                  }}
                />
              </FormField>
              <FormField label={`Column ${i + 1} markdown`}>
                <Textarea
                  value={col.markdown}
                  onChange={(e) => {
                    const columns = block.columns.map((c, j) =>
                      j === i ? { ...c, markdown: e.detail.value } : c
                    );
                    patch({ columns });
                  }}
                  rows={4}
                />
              </FormField>
            </Box>
          ))}
        </SpaceBetween>
      );

    case "social-links":
      return (
        <SpaceBetween size="s">
          <FormField label="Title">
            <Input value={block.title ?? ""} onChange={(e) => patch({ title: e.detail.value })} />
          </FormField>
          <SpaceBetween size="xs">
            <Box color="text-body-secondary">
              The links themselves come from the site configuration, not this block.
            </Box>
            <ConfigHint field="social">
              Add, remove, or reorder social links by editing the <Box variant="code">social</Box>{" "}
              array. A new platform also needs its icon added in code (
              <Box variant="code">src/lib/social-icons.tsx</Box>); without one it renders as a text
              link.
            </ConfigHint>
          </SpaceBetween>
        </SpaceBetween>
      );

    case "card-grid":
      return <CardGridEditor block={block} onChange={onChange} />;
  }
}

/**
 * Card-grid: structured for the grid-level fields, JSON for the `items` array (the
 * deferred nested builder). The JSON is parsed on change; a parse error is surfaced
 * inline and the last-good items are kept until it is valid again.
 */
function CardGridEditor({
  block,
  onChange,
}: {
  block: Extract<Block, { type: "card-grid" }>;
  onChange: (next: Block) => void;
}) {
  const patch = (fields: Partial<typeof block>) => onChange({ ...block, ...fields });
  const itemsText = JSON.stringify(block.items ?? [], null, 2);

  return (
    <SpaceBetween size="s">
      <FormField label="Title">
        <Input value={block.title ?? ""} onChange={(e) => patch({ title: e.detail.value })} />
      </FormField>
      <FormField label="Tone">
        <Select
          selectedOption={
            block.tone ? (TONE_OPTIONS.find((o) => o.value === block.tone) ?? null) : null
          }
          onChange={(e) => patch({ tone: (e.detail.selectedOption?.value as Tone) || undefined })}
          options={TONE_OPTIONS}
          placeholder="Default"
        />
      </FormField>
      <FormField label="Columns">
        <Select
          selectedOption={{ label: String(block.columns ?? 2), value: String(block.columns ?? 2) }}
          onChange={(e) => patch({ columns: Number(e.detail.selectedOption.value) as 1 | 2 | 3 })}
          options={[
            { label: "1", value: "1" },
            { label: "2", value: "2" },
            { label: "3", value: "3" },
          ]}
        />
      </FormField>
      <FormField
        label="Cards (JSON)"
        description="Each card: { id, title, badge?, titleLink?, meta?, description?, tags?, actions? }. A full card builder is coming; the save is validated and reports any field errors."
      >
        <CardItemsJson
          text={itemsText}
          // The JSON is untrusted shape until the server validator runs on save, which is
          // authoritative and returns field-level errors. Cast here rather than re-type
          // the whole card schema client-side.
          onValid={(items) => patch({ items: items as (typeof block)["items"] })}
        />
      </FormField>
    </SpaceBetween>
  );
}

/**
 * JSON textarea with inline parse feedback. Holds its own draft so the user can type
 * freely (including temporarily invalid JSON); it only lifts the value up when the draft
 * parses to an array, and shows an error otherwise. Resets its draft when the upstream
 * text changes (e.g. a different block is selected).
 */
function CardItemsJson({ text, onValid }: { text: string; onValid: (items: unknown[]) => void }) {
  // Seeded once per mount. The parent keys each block's editor by block.id, so switching
  // to a different card-grid remounts this with the right initial text — no re-seed effect
  // needed (which would also trip the set-state-in-effect rule).
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);

  return (
    <SpaceBetween size="xxs">
      <Textarea
        value={draft}
        invalid={error !== null}
        onChange={(e) => {
          const value = e.detail.value;
          setDraft(value);
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) {
              setError("Must be a JSON array of cards.");
              return;
            }
            setError(null);
            onValid(parsed);
          } catch (err) {
            setError(`Invalid JSON: ${(err as Error).message}`);
          }
        }}
        rows={10}
      />
      {error && <Box color="text-status-error">{error}</Box>}
    </SpaceBetween>
  );
}

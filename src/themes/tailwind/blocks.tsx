/**
 * The six landing-page blocks. Page data stores semantic values (`tone`, `columns`,
 * `muted`); this file maps them to the Tailwind theme's styling.
 */
import type { ReactNode } from "react";
import type {
  Action,
  BadgeListBlock,
  CardGridBlock,
  CardItem,
  ColumnsBlock,
  PanelBlock,
  ProseBlock,
  SocialLinksBlock,
  Tone,
} from "../../lib/page-schema";
import { SOCIAL_LINKS } from "../../lib/social-links";
import { Prose } from "./prose";
import { AppLink, Chip, ExternalLink, buttonClass, cx, type ChipTone } from "./ui";

const TONE: Record<Tone, ChipTone> = { active: "green", neutral: "indigo", muted: "zinc" };
const toneOf = (tone: Tone | undefined): ChipTone => TONE[tone ?? "neutral"];

const tagFilterUrl = (tag: string) => `/posts?tag=${encodeURIComponent(tag)}`;

function BlockTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 text-2xl font-bold tracking-tight">{children}</h2>;
}

/** A bordered section, used where the Cloudscape theme uses a Container. */
function Panel({ title, children }: { title?: string; children: ReactNode }) {
  if (!title) return <>{children}</>;
  return (
    <section className="rounded-xl p-6 ring-1 ring-zinc-200 dark:ring-zinc-800">
      <BlockTitle>{title}</BlockTitle>
      {children}
    </section>
  );
}

export function ProseBlockView({ block }: { block: ProseBlock }) {
  return (
    <section>
      {block.title && <BlockTitle>{block.title}</BlockTitle>}
      <Prose markdown={block.markdown} muted={block.muted} />
    </section>
  );
}

function CardTitle({ item, tone }: { item: CardItem; tone: Tone | undefined }) {
  const badge = item.badge ? <Chip tone={toneOf(tone)}>{item.badge.text}</Chip> : null;
  const heading = "text-lg font-semibold leading-snug";
  // A filterable badge links somewhere different from the title, so the two are separate.
  if (item.badge?.tagFilter) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <AppLink to={tagFilterUrl(item.badge.tagFilter)} className="rounded-full hover:opacity-80">
          {badge}
        </AppLink>
        <h3 className={heading}>{item.title}</h3>
      </div>
    );
  }
  if (item.titleLink) {
    const { to, href } = item.titleLink;
    const linkClass =
      "text-zinc-900 hover:text-indigo-700 dark:text-zinc-100 dark:hover:text-indigo-300";
    return (
      <h3 className={cx(heading, "flex flex-wrap items-center gap-2")}>
        {badge}
        {to !== undefined ? (
          <AppLink to={to} className={linkClass}>
            {item.title}
          </AppLink>
        ) : (
          <ExternalLink href={href!} className={linkClass}>
            {item.title}
          </ExternalLink>
        )}
      </h3>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {badge}
      <h3 className={heading}>{item.title}</h3>
    </div>
  );
}

function CardActions({ actions }: { actions: Action[] }) {
  return (
    <div className="mt-auto flex flex-wrap gap-2 pt-2">
      {actions.map((action) => {
        const cls = action.primary ? buttonClass.primary : buttonClass.secondary;
        return action.to !== undefined ? (
          <AppLink key={action.label} to={action.to} className={cls}>
            {action.label}
          </AppLink>
        ) : (
          <ExternalLink key={action.label} href={action.href!} className={cls}>
            {action.label} <span aria-hidden="true">↗</span>
          </ExternalLink>
        );
      })}
    </div>
  );
}

const GRID: Record<1 | 2 | 3, string> = {
  1: "grid gap-6",
  2: "grid gap-6 sm:grid-cols-2",
  3: "grid gap-6 sm:grid-cols-2 lg:grid-cols-3",
};

export function CardGridBlockView({ block }: { block: CardGridBlock }) {
  return (
    <section>
      {block.title && <BlockTitle>{block.title}</BlockTitle>}
      {block.items.length === 0 ? (
        block.emptyText ? (
          <p className="py-6 text-center text-zinc-500 dark:text-zinc-400">{block.emptyText}</p>
        ) : null
      ) : (
        <ul className={GRID[block.columns ?? 2]}>
          {block.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-xl p-5 ring-1 ring-zinc-200 dark:ring-zinc-800"
            >
              <CardTitle item={item} tone={block.tone} />
              {item.meta && <p className="text-sm text-zinc-500 dark:text-zinc-400">{item.meta}</p>}
              {item.description && (
                <p className="text-zinc-600 dark:text-zinc-400">{item.description}</p>
              )}
              {item.tags?.length ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                  {item.tags.map((tag) => (
                    <li key={tag}>
                      <Chip tone="zinc">{tag}</Chip>
                    </li>
                  ))}
                </ul>
              ) : null}
              {item.actions?.length ? <CardActions actions={item.actions} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const COLUMNS: Record<number, string> = {
  1: "grid gap-8",
  2: "grid gap-8 md:grid-cols-2",
  3: "grid gap-8 md:grid-cols-3",
  4: "grid gap-8 md:grid-cols-2 lg:grid-cols-4",
};

export function ColumnsBlockView({ block }: { block: ColumnsBlock }) {
  // The validator requires at least 2; clamping means a wider block degrades rather than breaks.
  const n = Math.min(block.columns.length, 4);
  return (
    <div className={COLUMNS[n]}>
      {block.columns.map((column) => (
        <section key={column.title}>
          <BlockTitle>{column.title}</BlockTitle>
          <Prose markdown={column.markdown} />
        </section>
      ))}
    </div>
  );
}

export function BadgeListBlockView({ block }: { block: BadgeListBlock }) {
  return (
    <Panel title={block.title}>
      <ul className="flex flex-wrap gap-2">
        {block.items.map((item) => (
          <li key={item}>
            <Chip tone={toneOf(block.tone)}>{item}</Chip>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function PanelBlockView({ block }: { block: PanelBlock }) {
  return (
    <Panel title={block.title}>
      {block.lead && <p className="mb-3 font-semibold">{block.lead}</p>}
      <Prose markdown={block.markdown} muted />
    </Panel>
  );
}

export function SocialLinksBlockView({ block }: { block: SocialLinksBlock }) {
  return (
    <Panel title={block.title}>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {SOCIAL_LINKS.map((link) => (
          <li key={link.id}>
            <ExternalLink href={link.href}>{link.label}</ExternalLink>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

import type { ContentItem } from "../types";
import { AppLink, TagList } from "./ui";

/** One post in a list: title, date, summary and tags. Used by home, posts and related. */
export function PostCard({
  item,
  headingLevel = 2,
  summary = true,
  maxTags,
  onTagSelect,
}: {
  item: ContentItem;
  headingLevel?: 2 | 3;
  summary?: boolean;
  maxTags?: number;
  onTagSelect?: (slug: string) => void;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const text = item.description || item.excerpt;
  const tags = maxTags ? item.tags.slice(0, maxTags) : item.tags;
  return (
    <article className="flex flex-col gap-2">
      {item.date && (
        <time dateTime={item.date} className="text-sm text-zinc-500 dark:text-zinc-400">
          {item.dateLong}
        </time>
      )}
      <Heading className="text-lg font-semibold leading-snug">
        <AppLink
          to={item.href}
          className="text-zinc-900 hover:text-indigo-700 dark:text-zinc-100 dark:hover:text-indigo-300"
        >
          {item.title}
        </AppLink>
      </Heading>
      {summary && text && <p className="line-clamp-3 text-zinc-600 dark:text-zinc-400">{text}</p>}
      <TagList tags={tags} onSelect={onTagSelect} />
    </article>
  );
}

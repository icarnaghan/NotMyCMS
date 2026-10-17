import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@cloudscape-design/components/modal";
import TextFilter, { type TextFilterProps } from "@cloudscape-design/components/text-filter";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Link from "@cloudscape-design/components/link";
import Fuse from "fuse.js";

interface SearchItem {
  slug: string;
  basePath: string;
  title: string;
  excerpt: string;
  categories: string;
  tags: string[];
}

interface SearchProps {
  visible: boolean;
  onDismiss: () => void;
}

export function SearchModal({ visible, onDismiss }: SearchProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<SearchItem[]>([]);
  const [query, setQuery] = useState("");
  const filterRef = useRef<TextFilterProps.Ref>(null);

  useEffect(() => {
    if (visible && items.length === 0) {
      fetch("/search-index.json")
        .then((r) => r.json())
        .then(setItems)
        .catch(() => {});
    }
  }, [visible, items.length]);

  // Move focus into the search field when the modal opens so keyboard and
  // screen-reader users land on the primary control. (Cloudscape's Modal
  // already restores focus to the trigger on close.)
  useEffect(() => {
    if (visible) {
      // Defer until the modal's content has mounted.
      const id = requestAnimationFrame(() => filterRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [visible]);

  const fuse = useMemo(
    () => new Fuse(items, { keys: ["title", "excerpt", "categories", "tags"], threshold: 0.4 }),
    [items]
  );

  const results = useMemo(
    () => (query.length >= 2 ? fuse.search(query, { limit: 20 }).map((r) => r.item) : []),
    [fuse, query]
  );

  const handleSelect = useCallback(
    (item: SearchItem) => {
      const url = item.basePath === "posts" ? `/${item.slug}` : `/knowledge-base/${item.slug}`;
      navigate(url);
      setQuery("");
      onDismiss();
    },
    [navigate, onDismiss]
  );

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Search"
      size="large"
      closeAriaLabel="Close"
    >
      <SpaceBetween size="m">
        <TextFilter
          ref={filterRef}
          filteringText={query}
          filteringAriaLabel="Search posts and knowledge base"
          filteringPlaceholder="Search posts and knowledge base..."
          onChange={({ detail }) => setQuery(detail.filteringText)}
        />
        {query.length >= 2 && (
          <Box>
            <div
              aria-live="polite"
              aria-atomic="true"
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                overflow: "hidden",
                clip: "rect(0,0,0,0)",
              }}
            >
              {results.length === 0
                ? "No results found"
                : `${results.length} result${results.length === 1 ? "" : "s"} found`}
            </div>
            {results.length === 0 ? (
              <Box color="text-body-secondary" textAlign="center">
                No results found
              </Box>
            ) : (
              <SpaceBetween size="xs">
                {results.map((item) => (
                  <Box key={`${item.basePath}-${item.slug}`} padding={{ vertical: "xs" }}>
                    <Link
                      fontSize="heading-s"
                      onFollow={(e) => {
                        e.preventDefault();
                        handleSelect(item);
                      }}
                    >
                      {item.title}
                    </Link>
                    <Box color="text-body-secondary" fontSize="body-s">
                      {item.excerpt}
                    </Box>
                  </Box>
                ))}
              </SpaceBetween>
            )}
          </Box>
        )}
      </SpaceBetween>
    </Modal>
  );
}

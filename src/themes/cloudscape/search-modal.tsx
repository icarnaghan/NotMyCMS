import { useEffect, useRef } from "react";
import Modal from "@cloudscape-design/components/modal";
import TextFilter, { type TextFilterProps } from "@cloudscape-design/components/text-filter";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Link from "@cloudscape-design/components/link";
import type { SearchView } from "../types";

export function SearchModal({ search }: { search: SearchView }) {
  const { open, onClose, query, onQueryChange, results, announcement, choose } = search;
  const filterRef = useRef<TextFilterProps.Ref>(null);

  // Move focus into the search field when the modal opens so keyboard and screen-reader
  // users land on the primary control. (Cloudscape's Modal already restores focus to the
  // trigger on close.)
  useEffect(() => {
    if (open) {
      // Defer until the modal's content has mounted.
      const id = requestAnimationFrame(() => filterRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  return (
    <Modal visible={open} onDismiss={onClose} header="Search" size="large" closeAriaLabel="Close">
      <SpaceBetween size="m">
        <TextFilter
          ref={filterRef}
          filteringText={query}
          filteringAriaLabel="Search posts and knowledge base"
          filteringPlaceholder="Search posts and knowledge base..."
          onChange={({ detail }) => onQueryChange(detail.filteringText)}
        />
        {announcement && (
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
              {announcement}
            </div>
            {results.length === 0 ? (
              <Box color="text-body-secondary" textAlign="center">
                No results found
              </Box>
            ) : (
              <SpaceBetween size="xs">
                {results.map((item) => (
                  <Box key={`${item.kind}-${item.slug}`} padding={{ vertical: "xs" }}>
                    <Link
                      fontSize="heading-s"
                      onFollow={(e) => {
                        e.preventDefault();
                        choose(item);
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

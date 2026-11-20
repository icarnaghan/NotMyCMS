import { useState } from "react";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Pagination from "@cloudscape-design/components/pagination";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import TextFilter from "@cloudscape-design/components/text-filter";
import Link from "@cloudscape-design/components/link";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import Badge from "@cloudscape-design/components/badge";
import Select from "@cloudscape-design/components/select";
import type { ContentItem, ContentListView, PostsColumnId } from "../../types";

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: "10 items" },
  { value: 20, label: "20 items" },
  { value: 50, label: "50 items" },
  { value: 100, label: "100 items" },
];

const COLUMN_DEFINITIONS = [
  { id: "title", label: "Title", alwaysVisible: true },
  { id: "date", label: "Date" },
  { id: "categories", label: "Category" },
  { id: "tags", label: "Tags" },
  { id: "excerpt", label: "Excerpt" },
];

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_VISIBLE: PostsColumnId[] = ["title", "date", "categories", "tags"];

export function PostsPage({
  title,
  status,
  items,
  filteredCount,
  totalCount,
  filter,
  sort,
  pagination,
  preferences,
  open,
}: ContentListView) {
  // Line wrapping is a table presentation choice, so it stays here rather than in the core.
  const [wrapLines, setWrapLines] = useState(false);

  if (status === "loading") {
    return (
      <ContentLayout>
        <Spinner size="large" />
      </ContentLayout>
    );
  }
  if (status === "error") {
    return (
      <Box textAlign="center" padding="xxl" color="text-status-error">
        Failed to load posts. Please try again later.
      </Box>
    );
  }

  const visibleColumns = preferences?.visibleColumns ?? DEFAULT_VISIBLE;
  const pageSize = preferences?.pageSize ?? DEFAULT_PAGE_SIZE;

  const columns: TableProps.ColumnDefinition<ContentItem>[] = [
    {
      id: "title",
      header: "Title",
      cell: (item) => (
        <Link
          onFollow={(e) => {
            e.preventDefault();
            open(item);
          }}
        >
          {item.title}
        </Link>
      ),
      sortingField: "title",
    },
    {
      id: "date",
      header: "Date",
      cell: (item) => item.dateShort,
      sortingField: "date",
    },
    {
      id: "categories",
      header: "Category",
      cell: (item) => item.categoryLabel,
      sortingField: "categories",
    },
    {
      id: "tags",
      header: "Tags",
      cell: (item) => {
        if (item.tags.length === 0) return "";
        return (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {item.tags.map((tag) => (
              <span className="clickable-tag" key={tag.slug}>
                <Link
                  variant="secondary"
                  onFollow={(e) => {
                    e.preventDefault();
                    filter.onTagSelect?.(tag.slug);
                  }}
                >
                  <Badge color="blue">{tag.label}</Badge>
                </Link>
              </span>
            ))}
          </span>
        );
      },
      sortingField: "tags",
    },
    {
      id: "excerpt",
      header: "Excerpt",
      cell: (item) => item.description || item.excerpt || "",
    },
  ];

  const category = filter.category;
  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          counter={`(${filteredCount}${filteredCount !== totalCount ? `/${totalCount}` : ""})`}
          actions={
            category && category.options.length > 0 ? (
              <Select
                selectedOption={
                  category.selected
                    ? {
                        label:
                          category.options.find((o) => o.slug === category.selected)?.label ??
                          category.selected,
                        value: category.selected,
                      }
                    : { label: "All categories", value: "" }
                }
                onChange={({ detail }) => category.onChange(detail.selectedOption.value || null)}
                options={[
                  { label: "All categories", value: "" },
                  ...category.options.map((o) => ({ label: o.label, value: o.slug })),
                ]}
              />
            ) : undefined
          }
        >
          {title}
        </Header>
      }
    >
      <Table
        columnDefinitions={columns.filter((c) => visibleColumns.includes(c.id as PostsColumnId))}
        items={items}
        loadingText={`Loading ${title.toLowerCase()}`}
        loading={false}
        wrapLines={wrapLines}
        resizableColumns
        sortingColumn={{ sortingField: sort?.field ?? "date" }}
        sortingDescending={sort?.descending ?? true}
        onSortingChange={({ detail }) =>
          sort?.onChange(detail.sortingColumn.sortingField || "date", detail.isDescending ?? false)
        }
        empty={<Box textAlign="center">{filter.text ? "No matches found" : "No items found"}</Box>}
        variant="full-page"
        filter={
          <TextFilter
            filteringText={filter.text}
            filteringPlaceholder="Search by title, category, or description"
            onChange={({ detail }) => filter.onTextChange(detail.filteringText)}
          />
        }
        pagination={
          <Pagination
            currentPageIndex={pagination.page}
            pagesCount={pagination.pageCount}
            onChange={({ detail }) => pagination.onPageChange(detail.currentPageIndex)}
          />
        }
        preferences={
          <CollectionPreferences
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            preferences={{
              pageSize,
              visibleContent: visibleColumns,
              wrapLines,
            }}
            pageSizePreference={{
              title: "Page size",
              options: PAGE_SIZE_OPTIONS,
            }}
            visibleContentPreference={{
              title: "Visible columns",
              options: [
                {
                  label: "Properties",
                  options: COLUMN_DEFINITIONS.map((c) => ({
                    id: c.id,
                    label: c.label,
                    editable: !c.alwaysVisible,
                  })),
                },
              ],
            }}
            wrapLinesPreference={{
              label: "Wrap lines",
              description: "Wrap long text to multiple lines",
            }}
            onConfirm={({ detail }) => {
              setWrapLines(detail.wrapLines ?? false);
              preferences?.onChange({
                pageSize: detail.pageSize ?? DEFAULT_PAGE_SIZE,
                visibleColumns: [...(detail.visibleContent ?? DEFAULT_VISIBLE)] as PostsColumnId[],
              });
            }}
          />
        }
      />
    </ContentLayout>
  );
}

import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { formatDate, toDisplayLabel, type PostMeta } from "../lib/content";

interface ContentListProps {
  title: string;
  items: PostMeta[];
  loading: boolean;
  baseUrl: string;
}

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

const DEFAULT_VISIBLE = ["title", "date", "categories", "tags"];

function getField(item: PostMeta, field: string): string {
  switch (field) {
    case "title":
      return item.title;
    case "date":
      return item.date;
    case "categories":
      return item.categories || "";
    case "tags":
      return (item.tags || []).join(", ");
    default:
      return "";
  }
}

function comparator(field: string, desc: boolean) {
  return (a: PostMeta, b: PostMeta) => {
    const cmp = getField(a, field).localeCompare(getField(b, field));
    return desc ? -cmp : cmp;
  };
}

export function ContentList({ title, items, loading, baseUrl }: ContentListProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [pageSize, setPageSize] = useState(20);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE);
  const [wrapLines, setWrapLines] = useState(false);
  const [sortingColumn, setSortingColumn] = useState<TableProps.SortingColumn<PostMeta>>({
    sortingField: "date",
  });
  const [sortingDescending, setSortingDescending] = useState(true);
  const [filterText, setFilterText] = useState(searchParams.get("tag") || "");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, val] of Object.entries(updates)) {
      if (val && val !== "1") params.set(key, val);
      else params.delete(key);
    }
    setSearchParams(params, { replace: true });
  };

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      if (item.categories) {
        item.categories.split(", ").forEach((c) => {
          counts[c] = (counts[c] || 0) + 1;
        });
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (categoryFilter) {
      result = result.filter((item) =>
        (item.categories || "").toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }
    if (!filterText) return result;
    const lower = filterText.toLowerCase();
    return result.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        String(item.categories || "")
          .toLowerCase()
          .includes(lower) ||
        String(item.description || "")
          .toLowerCase()
          .includes(lower) ||
        (item.tags || []).some((t) => String(t).toLowerCase().includes(lower))
    );
  }, [items, filterText, categoryFilter]);

  const sortedItems = useMemo(() => {
    const field = sortingColumn.sortingField || "date";
    return [...filteredItems].sort(comparator(field, sortingDescending));
  }, [filteredItems, sortingColumn, sortingDescending]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  // Clamp against the available pages so an out-of-range ?page= or a filter
  // that shrinks the result set can't leave us slicing past the end (which
  // would show an empty table while Pagination highlights a nonexistent page).
  const effectivePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedItems = sortedItems.slice(
    (effectivePage - 1) * pageSize,
    effectivePage * pageSize
  );

  if (loading) {
    return (
      <ContentLayout>
        <Spinner size="large" />
      </ContentLayout>
    );
  }

  const columns: TableProps.ColumnDefinition<PostMeta>[] = [
    {
      id: "title",
      header: "Title",
      cell: (item) => (
        <Link
          onFollow={(e) => {
            e.preventDefault();
            navigate(`${baseUrl}${item.slug}`);
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
      cell: (item) => (item.date ? formatDate(item.date, "short") : ""),
      sortingField: "date",
    },
    {
      id: "categories",
      header: "Category",
      cell: (item) => toDisplayLabel(item.categories || ""),
      sortingField: "categories",
    },
    {
      id: "tags",
      header: "Tags",
      cell: (item) => {
        const tags = item.tags || [];
        if (tags.length === 0) return "";
        return (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tags.map((tag) => (
              <span className="clickable-tag" key={tag}>
                <Link
                  variant="secondary"
                  onFollow={(e) => {
                    e.preventDefault();
                    setFilterText(tag);
                    updateParams({ tag, page: null });
                    setCurrentPage(1);
                  }}
                >
                  <Badge color="blue">{toDisplayLabel(tag)}</Badge>
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

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          counter={`(${filteredItems.length}${filteredItems.length !== items.length ? `/${items.length}` : ""})`}
          actions={
            categories.length > 0 ? (
              <Select
                selectedOption={
                  categoryFilter
                    ? { label: toDisplayLabel(categoryFilter), value: categoryFilter }
                    : { label: "All categories", value: "" }
                }
                onChange={({ detail }) => {
                  setCategoryFilter(detail.selectedOption.value || null);
                  setCurrentPage(1);
                }}
                options={[
                  { label: "All categories", value: "" },
                  ...categories.map((cat) => ({ label: toDisplayLabel(cat), value: cat })),
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
        columnDefinitions={columns.filter((c) => visibleColumns.includes(c.id!))}
        items={paginatedItems}
        loadingText={`Loading ${title.toLowerCase()}`}
        loading={loading}
        wrapLines={wrapLines}
        resizableColumns
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={({ detail }) => {
          setSortingColumn(detail.sortingColumn);
          setSortingDescending(detail.isDescending ?? false);
          setCurrentPage(1);
        }}
        empty={<Box textAlign="center">{filterText ? "No matches found" : "No items found"}</Box>}
        variant="full-page"
        filter={
          <TextFilter
            filteringText={filterText}
            filteringPlaceholder="Search by title, category, or description"
            onChange={({ detail }) => {
              setFilterText(detail.filteringText);
              setCurrentPage(1);
            }}
          />
        }
        pagination={
          <Pagination
            currentPageIndex={effectivePage}
            pagesCount={totalPages}
            onChange={({ detail }) => {
              setCurrentPage(detail.currentPageIndex);
              updateParams({ page: String(detail.currentPageIndex) });
            }}
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
              setPageSize(detail.pageSize ?? 20);
              setVisibleColumns([...(detail.visibleContent ?? DEFAULT_VISIBLE)]);
              setWrapLines(detail.wrapLines ?? false);
              setCurrentPage(1);
            }}
          />
        }
      />
    </ContentLayout>
  );
}

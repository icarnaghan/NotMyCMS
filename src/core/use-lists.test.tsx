import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useKnowledgeBaseList, usePostsList } from "./content-list";

const posts = Array.from({ length: 45 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    slug: `p${n}`,
    title: `Post ${n}`,
    date: `2024-01-${n.padStart(2, "0")}`,
    categories: i % 2 ? "coding" : "hosting",
    tags: [i % 3 === 0 ? "react" : "aws"],
  };
});

const wrapper = (url: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  };

/** Renders a list hook and also reports the router's current search string. */
function setup<T>(hook: () => T, url = "/posts") {
  return renderHook(
    () => {
      const value = hook();
      return { value, search: useLocation().search };
    },
    { wrapper: wrapper(url) }
  );
}

describe("usePostsList", () => {
  it("starts on page 1, newest first, 20 per page", () => {
    const { result } = setup(() => usePostsList(posts));
    const list = result.current.value;
    expect(list.page).toBe(1);
    expect(list.pageItems).toHaveLength(20);
    expect(list.pageItems[0].slug).toBe("p45");
    expect(list.pageCount).toBe(3);
  });

  it("seeds the page and the tag filter from the URL", () => {
    const { result } = setup(() => usePostsList(posts), "/posts?page=2&tag=react");
    expect(result.current.value.filterText).toBe("react");
    expect(result.current.value.page).toBe(1); // 15 matches fit on one page, so page is clamped
    expect(result.current.value.filteredCount).toBe(15);
  });

  it("writes the page to the URL, and removes it at page 1", () => {
    const { result } = setup(() => usePostsList(posts));
    act(() => result.current.value.setPage(2));
    expect(result.current.search).toBe("?page=2");
    expect(result.current.value.page).toBe(2);
    act(() => result.current.value.setPage(1));
    expect(result.current.search).toBe("");
  });

  it("selecting a tag filters, sets ?tag, clears ?page and returns to page 1", () => {
    const { result } = setup(() => usePostsList(posts), "/posts?page=2");
    act(() => result.current.value.selectTag("aws"));
    expect(result.current.value.filterText).toBe("aws");
    expect(result.current.value.page).toBe(1);
    expect(result.current.search).toBe("?tag=aws");
  });

  it("returns to page 1 when the filter, category, sort or preferences change", () => {
    const { result } = setup(() => usePostsList(posts));
    act(() => result.current.value.setPage(3));
    act(() => result.current.value.setFilterText("post"));
    expect(result.current.value.page).toBe(1);

    act(() => result.current.value.setPage(2));
    act(() => result.current.value.setCategory("coding"));
    expect(result.current.value.page).toBe(1);

    act(() => result.current.value.setPage(2));
    act(() => result.current.value.setSort("title", false));
    expect(result.current.value.page).toBe(1);
    expect(result.current.value.pageItems[0].title).toBe("Post 02");

    act(() => result.current.value.setPage(2));
    act(() =>
      result.current.value.setPreferences({ pageSize: 10, visibleColumns: ["title", "date"] })
    );
    expect(result.current.value.page).toBe(1);
    expect(result.current.value.pageItems).toHaveLength(10);
    expect(result.current.value.visibleColumns).toEqual(["title", "date"]);
  });

  it("offers the most used categories", () => {
    const { result } = setup(() => usePostsList(posts));
    expect(result.current.value.categories).toEqual(["hosting", "coding"]);
  });
});

describe("useKnowledgeBaseList", () => {
  const articles = posts.slice(0, 30);
  it("pages at 24 and filters on title only", () => {
    const { result } = setup(() => useKnowledgeBaseList(articles), "/knowledge-base");
    expect(result.current.value.pageItems).toHaveLength(24);
    expect(result.current.value.pageCount).toBe(2);
    act(() => result.current.value.setFilterText("coding"));
    expect(result.current.value.filteredCount).toBe(0);
  });
  it("mirrors the page to the URL and returns to page 1 on a new filter", () => {
    const { result } = setup(() => useKnowledgeBaseList(articles), "/knowledge-base");
    act(() => result.current.value.setPage(2));
    expect(result.current.search).toBe("?page=2");
    act(() => result.current.value.setFilterText("Post 1"));
    expect(result.current.value.page).toBe(1);
  });
});

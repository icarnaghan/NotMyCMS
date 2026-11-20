import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useListUrlState } from "./content-list";

const probe: { state: ReturnType<typeof useListUrlState>; search: string } = {
  state: undefined as never,
  search: "",
};
function Probe() {
  const state = useListUrlState();
  const { search } = useLocation();
  useEffect(() => {
    probe.state = state;
    probe.search = search;
  });
  return null;
}
const mount = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>
  );

describe("useListUrlState", () => {
  it("reads the initial page and tag", () => {
    mount("/posts?page=3&tag=react");
    expect(probe.state.initialPage).toBe(3);
    expect(probe.state.initialTag).toBe("react");
  });
  it("defaults to page 1 and no tag, including for a non-numeric page", () => {
    mount("/posts?page=abc");
    expect(probe.state.initialPage).toBe(1);
    expect(probe.state.initialTag).toBe("");
  });
  it("writes a page and drops it again at page 1, keeping other params", () => {
    mount("/posts?tag=react");
    act(() => probe.state.update({ page: "2" }));
    expect(probe.search).toBe("?tag=react&page=2");
    act(() => probe.state.update({ page: "1" }));
    expect(probe.search).toBe("?tag=react");
  });
  it("clears a parameter set to null", () => {
    mount("/posts?tag=react&page=2");
    act(() => probe.state.update({ tag: "aws", page: null }));
    expect(probe.search).toBe("?tag=aws");
  });
});

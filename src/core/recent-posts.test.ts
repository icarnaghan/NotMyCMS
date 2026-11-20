import { describe, it, expect } from "vitest";
import { takeRecent } from "./recent-posts";

const posts = Array.from({ length: 10 }, (_, i) => ({
  slug: `p${i}`,
  title: `P${i}`,
  date: "2024-01-01",
}));

describe("takeRecent", () => {
  it("takes the first N in manifest order", () => {
    expect(takeRecent(posts, 6).map((p) => p.slug)).toEqual(["p0", "p1", "p2", "p3", "p4", "p5"]);
  });
  it("returns everything when there are fewer than N", () => {
    expect(takeRecent(posts.slice(0, 2), 6)).toHaveLength(2);
  });
});

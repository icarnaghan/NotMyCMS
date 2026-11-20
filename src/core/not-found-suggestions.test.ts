import { describe, it, expect } from "vitest";
import { suggestPosts } from "./not-found-suggestions";

const post = (slug: string, title: string) => ({ slug, title, date: "2024-01-01" });
const POSTS = [
  post("setting-up-nginx", "Setting up Nginx"),
  post("docker-basics", "Docker basics"),
  ...Array.from({ length: 10 }, (_, i) => post(`setting-up-thing-${i}`, `Setting up thing ${i}`)),
];

describe("suggestPosts", () => {
  it("matches a near-miss slug", () => {
    expect(suggestPosts(POSTS, "setting-up-ngnix")[0].slug).toBe("setting-up-nginx");
  });
  it("returns nothing for an unrelated slug", () => {
    expect(suggestPosts(POSTS, "zzzzzzzzzz")).toEqual([]);
  });
  it("returns at most five", () => {
    expect(suggestPosts(POSTS, "setting-up").length).toBeLessThanOrEqual(5);
  });
});

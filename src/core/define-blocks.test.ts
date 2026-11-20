import { describe, it, expect } from "vitest";
import { defineBlocks } from "./define-blocks";

describe("defineBlocks", () => {
  it("requires a renderer for every block type", () => {
    // The assertion is the compiler's: leaving out a block type fails `tsc`, so the
    // directive below would itself error if the signature stopped enforcing it.
    // @ts-expect-error missing block types are a type error
    const registry = defineBlocks({ prose: () => null });
    expect(Object.keys(registry)).toEqual(["prose"]);
  });
});

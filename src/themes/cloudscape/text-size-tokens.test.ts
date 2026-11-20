import { describe, it, expect } from "vitest";
import { isTextSize } from "../../lib/text-size";
import { textSizeTokens } from "./text-size-tokens";

describe("textSizeTokens", () => {
  it("applies nothing for the default, so stock styling is untouched", () => {
    expect(textSizeTokens("default")).toBeUndefined();
  });
  it("scales body text and line height together", () => {
    const t = textSizeTokens("larger")!;
    expect(t.fontSizeBodyM).toBe("18px"); // 14 * 1.25 = 17.5
    expect(t.lineHeightBodyM).toBe("25px");
  });
  it("covers every body and heading token, so proportions hold", () => {
    const keys = Object.keys(textSizeTokens("large")!);
    expect(keys).toHaveLength(16);
    expect(keys).toContain("fontSizeDisplayL");
    expect(keys).toContain("lineHeightHeadingXs");
  });
  it("makes larger strictly bigger than large for every font size", () => {
    const large = textSizeTokens("large")!;
    const larger = textSizeTokens("larger")!;
    for (const k of Object.keys(large).filter((k) => k.startsWith("fontSize"))) {
      expect(parseInt(larger[k])).toBeGreaterThan(parseInt(large[k]));
    }
  });
});

describe("isTextSize", () => {
  it("accepts only the known sizes", () => {
    expect(isTextSize("large")).toBe(true);
    expect(isTextSize("huge")).toBe(false);
    expect(isTextSize(undefined)).toBe(false);
  });
});

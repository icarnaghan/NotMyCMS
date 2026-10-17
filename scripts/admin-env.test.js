import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { ENV_PATH, REQUIRED_VARS, parseEnv, renderEnv, validateEnv } from "./admin-env.js";

describe("parseEnv", () => {
  it("reads key/value pairs", () => {
    expect(parseEnv("A=1\nB=two")).toEqual({ A: "1", B: "two" });
  });

  it("ignores comments and blank lines", () => {
    expect(parseEnv("# a comment\n\nA=1\n   \n#B=2")).toEqual({ A: "1" });
  });

  it("keeps values containing an equals sign intact", () => {
    // A Cognito domain never contains one, but a future value might, and silently
    // truncating it would be worse than not supporting it.
    expect(parseEnv("URL=https://x.test/?a=1&b=2")).toEqual({
      URL: "https://x.test/?a=1&b=2",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseEnv("  A = 1  ")).toEqual({ A: "1" });
  });
});

describe("validateEnv", () => {
  const valid = Object.fromEntries(REQUIRED_VARS.map(({ name }) => [name, "value"]));

  it("accepts a complete environment", () => {
    expect(validateEnv(valid)).toEqual([]);
  });

  it("reports a missing variable", () => {
    const { VITE_COGNITO_CLIENT_ID: _omitted, ...partial } = valid;

    expect(validateEnv(partial)).toEqual([
      expect.stringContaining("VITE_COGNITO_CLIENT_ID is missing"),
    ]);
  });

  it("treats an empty value as missing", () => {
    // This is the real failure mode: the key is present, the build succeeds, and the
    // deployed admin throws on load.
    expect(validateEnv({ ...valid, VITE_COGNITO_CLIENT_ID: "" })).toEqual([
      expect.stringContaining("VITE_COGNITO_CLIENT_ID is empty"),
    ]);
  });

  it("names a key that looks like a misspelling of a required one", () => {
    // How this broke before: ITE_COGNITO_DOMAIN instead of VITE_COGNITO_DOMAIN.
    const problems = validateEnv({ ...valid, ITE_COGNITO_CLIENT_ID: "x" });

    expect(problems).toEqual([
      expect.stringContaining("ITE_COGNITO_CLIENT_ID looks like a misspelling"),
    ]);
  });

  it("does not flag an unrelated extra variable", () => {
    expect(validateEnv({ ...valid, VITE_FEATURE_FLAG: "on" })).toEqual([]);
  });
});

describe("renderEnv", () => {
  const rendered = renderEnv(
    Object.fromEntries(REQUIRED_VARS.map(({ name }) => [name, `${name}-value`]))
  );

  it("round-trips through parseEnv", () => {
    const parsed = parseEnv(rendered);

    expect(validateEnv(parsed)).toEqual([]);
    for (const { name } of REQUIRED_VARS) {
      expect(parsed[name]).toBe(`${name}-value`);
    }
  });

  it("says not to edit it by hand", () => {
    expect(rendered).toContain("Do not edit by hand");
  });
});

describe("the committed admin/.env.production", () => {
  it("is valid", () => {
    // Guards the file itself, not just the helpers. Needs no AWS credentials, so it
    // runs in CI; `make check-admin-env` is the version that checks the live values.
    expect(validateEnv(parseEnv(readFileSync(ENV_PATH, "utf-8")))).toEqual([]);
  });
});

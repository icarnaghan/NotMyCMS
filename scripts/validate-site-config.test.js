import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { validateSiteConfig } from "./validate-site-config.js";

/** A minimal config that passes, used as the base for negative cases. */
function valid(overrides = {}) {
  return {
    resourcePrefix: "example",
    storagePrefix: "example",
    region: "us-east-1",
    apexDomain: "example.com",
    domain: "www.example.com",
    hostedZone: "example.com",
    hostedZoneId: "Z0123456789ABCDEFGHIJ",
    siteUrl: "https://www.example.com",
    siteName: "Example",
    siteTitle: "example.com",
    tagline: "A site",
    siteDescription: "A site about things",
    locale: "en",
    author: { name: "A Person", email: "a@example.com" },
    git: {
      provider: "gitlab",
      apiUrl: "https://gitlab.com/api/v4",
      contentProjectId: "1",
      branch: "main",
    },
    social: [],
    ...overrides,
  };
}

describe("validateSiteConfig", () => {
  it("accepts a minimal valid config", () => {
    expect(validateSiteConfig(valid())).toEqual([]);
  });

  it("accepts the real site.config.json", () => {
    const real = JSON.parse(readFileSync("site.config.json", "utf-8"));
    expect(validateSiteConfig(real)).toEqual([]);
  });

  it("requires a hostedZoneId", () => {
    const { hostedZoneId: _omitted, ...without } = valid();

    expect(validateSiteConfig(without)).toEqual([
      expect.stringContaining("hostedZoneId is required"),
    ]);
  });

  it("rejects a hostedZoneId that is not a Route53 zone id", () => {
    // A wrong id deploys DNS records into the wrong zone rather than failing loudly,
    // so the shape is worth checking. The zone *name* is a separate field.
    for (const bad of ["carnaghan.com", "z0123456789abc", "ABC123", ""]) {
      expect(validateSiteConfig({ ...valid(), hostedZoneId: bad }).length).toBeGreaterThan(0);
    }
  });

  it("accepts a well-formed hostedZoneId", () => {
    expect(validateSiteConfig({ ...valid(), hostedZoneId: "Z0ABCDEF1234567890XYZ" })).toEqual([]);
  });

  it("rejects a non-object", () => {
    expect(validateSiteConfig(null)).toHaveLength(1);
    expect(validateSiteConfig([])).toHaveLength(1);
    expect(validateSiteConfig("nope")).toHaveLength(1);
  });

  it("reports every problem at once rather than the first", () => {
    const problems = validateSiteConfig({});
    expect(problems.length).toBeGreaterThan(5);
  });

  describe("prefixes", () => {
    it("rejects uppercase or spaces, which would break resource names", () => {
      expect(validateSiteConfig(valid({ resourcePrefix: "My Site" })).join()).toMatch(
        /resourcePrefix must be lowercase/
      );
      expect(validateSiteConfig(valid({ storagePrefix: "My_Site" })).join()).toMatch(
        /storagePrefix must be lowercase/
      );
    });

    it("accepts hyphens", () => {
      expect(validateSiteConfig(valid({ resourcePrefix: "my-site" }))).toEqual([]);
    });
  });

  describe("siteUrl", () => {
    it("requires https", () => {
      expect(validateSiteConfig(valid({ siteUrl: "http://www.example.com" })).join()).toMatch(
        /must start with https/
      );
    });

    it("rejects a trailing slash, which would produce double slashes in canonicals", () => {
      expect(validateSiteConfig(valid({ siteUrl: "https://www.example.com/" })).join()).toMatch(
        /trailing slash/
      );
    });

    it("rejects a siteUrl that disagrees with domain", () => {
      expect(validateSiteConfig(valid({ siteUrl: "https://other.test" })).join()).toMatch(
        /does not contain domain/
      );
    });
  });

  describe("analytics", () => {
    it("is optional — omitting it builds without a snippet", () => {
      const c = valid();
      delete c.analytics;
      expect(validateSiteConfig(c)).toEqual([]);
    });

    it("accepts a well-formed measurement id", () => {
      expect(
        validateSiteConfig(valid({ analytics: { provider: "ga4", measurementId: "G-ABC1234567" } }))
      ).toEqual([]);
    });

    it("rejects a malformed measurement id", () => {
      expect(
        validateSiteConfig(
          valid({ analytics: { provider: "ga4", measurementId: "UA-12345" } })
        ).join()
      ).toMatch(/measurementId must look like/);
    });

    it("rejects an unknown provider", () => {
      expect(
        validateSiteConfig(
          valid({ analytics: { provider: "plausible", measurementId: "G-ABC1234567" } })
        ).join()
      ).toMatch(/provider must be/);
    });
  });

  describe("author", () => {
    it("requires an email containing @", () => {
      expect(
        validateSiteConfig(valid({ author: { name: "A", email: "not-an-email" } })).join()
      ).toMatch(/must contain @/);
    });
  });

  describe("git", () => {
    it("rejects an unknown provider", () => {
      expect(
        validateSiteConfig(valid({ git: { ...valid().git, provider: "bitbucket" } })).join()
      ).toMatch(/git.provider must be/);
    });

    it("requires contentProjectId", () => {
      const git = { ...valid().git };
      delete git.contentProjectId;
      expect(validateSiteConfig(valid({ git })).join()).toMatch(/git.contentProjectId is required/);
    });

    // The rename matters more than most: `projectId` meant the source repository, and
    // `contentProjectId` means the Content_Repo. Silently accepting the old key would
    // point the admin Lambdas at the repository that is about to stop holding content.
    it("rejects the old projectId key rather than ignoring it", () => {
      const git = { ...valid().git, projectId: "80629335" };
      expect(validateSiteConfig(valid({ git })).join()).toMatch(/renamed to git.contentProjectId/);
    });

    it("rejects having both keys", () => {
      const git = { ...valid().git, projectId: "80629335" };
      const problems = validateSiteConfig(valid({ git }));
      expect(problems.join()).toMatch(/renamed to git.contentProjectId/);
      expect(problems).toHaveLength(1);
    });
  });

  describe("social", () => {
    it("rejects a non-array", () => {
      expect(validateSiteConfig(valid({ social: {} })).join()).toMatch(/must be an array/);
    });

    it("rejects duplicate ids, since the icon lookup is keyed on them", () => {
      const social = [
        { id: "github", label: "A", href: "https://a.test" },
        { id: "github", label: "B", href: "https://b.test" },
      ];
      expect(validateSiteConfig(valid({ social })).join()).toMatch(/duplicates an earlier entry/);
    });

    it("rejects a javascript: href", () => {
      const social = [{ id: "x", label: "X", href: "javascript:alert(1)" }];
      expect(validateSiteConfig(valid({ social })).join()).toMatch(/must be http\(s\) or mailto/);
    });

    it("accepts mailto", () => {
      const social = [{ id: "email", label: "Email", href: "mailto:a@example.com" }];
      expect(validateSiteConfig(valid({ social }))).toEqual([]);
    });
  });
});

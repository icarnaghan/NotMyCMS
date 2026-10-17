import { describe, it, expect } from "vitest";
import { adminRedirectUri, cognitoDomain, siteConfig, storageKey } from "./site-config";

describe("cognitoDomain", () => {
  it("builds the hosted-UI domain Cognito actually serves", () => {
    // Asserted as a literal on purpose. `VITE_COGNITO_DOMAIN` used to supply this and
    // has been removed from admin/.env.production, so this derivation is now the only
    // source of the login URL — getting it wrong sends every sign-in to a hostname
    // that does not resolve, and nothing else in the build would notice.
    //
    // `make check-admin-env` verifies the same prefix against the deployed stack's
    // AdminUserPoolDomain export, which is the half this test cannot cover.
    expect(cognitoDomain()).toBe("https://carnaghan-admin.auth.us-east-1.amazoncognito.com");
  });

  it("follows resourcePrefix and region", () => {
    expect(cognitoDomain()).toBe(
      `https://${siteConfig.resourcePrefix}-admin.auth.${siteConfig.region}.amazoncognito.com`
    );
  });
});

describe("adminRedirectUri", () => {
  it("points at the admin path on the site origin", () => {
    // Must match a callback URL registered on the Cognito app client, so the trailing
    // slash is significant.
    expect(adminRedirectUri()).toBe("https://www.carnaghan.com/admin/");
  });
});

describe("storageKey", () => {
  it("prefixes with storagePrefix", () => {
    expect(storageKey("theme")).toBe("carnaghan-theme");
  });
});

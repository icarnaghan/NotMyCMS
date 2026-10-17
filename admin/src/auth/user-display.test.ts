import { describe, it, expect } from "vitest";
import {
  decodeJwtPayload,
  looksLikeUuid,
  readUserFromIdToken,
  resolveDisplayName,
  type IdTokenClaims,
} from "./user-display";

/** Build an unsigned JWT with the given payload, base64url encoded. */
function makeToken(claims: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

const UUID = "9f8b7c6d-1234-4a5b-8c9d-0e1f2a3b4c5d";

describe("decodeJwtPayload", () => {
  it("decodes a payload", () => {
    const token = makeToken({ email: "ian@example.com", sub: UUID });
    expect(decodeJwtPayload(token)).toMatchObject({ email: "ian@example.com", sub: UUID });
  });

  it("handles base64url payloads that plain atob would reject", () => {
    // Chosen so the encoded payload contains '-' or '_' and needs padding.
    const claims = { email: "ian+tag@example.com", name: "Ian ~ Carnaghan <test>" };
    const decoded = decodeJwtPayload(makeToken(claims));
    expect(decoded).toMatchObject(claims);
  });

  it("returns null for null/empty input", () => {
    expect(decodeJwtPayload(null)).toBeNull();
    expect(decodeJwtPayload(undefined)).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
  });

  it("returns null for a malformed token", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("header.!!!notbase64!!!.sig")).toBeNull();
  });

  it("returns null when the payload is not an object", () => {
    const encode = (s: string) => btoa(s).replace(/=+$/, "");
    expect(decodeJwtPayload(`h.${encode('"just a string"')}.s`)).toBeNull();
  });
});

describe("looksLikeUuid", () => {
  it("detects a UUID", () => {
    expect(looksLikeUuid(UUID)).toBe(true);
  });

  it("does not flag an email or a name", () => {
    expect(looksLikeUuid("ian@example.com")).toBe(false);
    expect(looksLikeUuid("icarnaghan")).toBe(false);
  });

  it("handles undefined", () => {
    expect(looksLikeUuid(undefined)).toBe(false);
  });
});

describe("resolveDisplayName", () => {
  it("prefers the email claim", () => {
    const claims: IdTokenClaims = {
      email: "ian@example.com",
      preferred_username: "icarnaghan",
      "cognito:username": UUID,
    };
    expect(resolveDisplayName(claims)).toBe("ian@example.com");
  });

  it("falls back to preferred_username when there is no email", () => {
    expect(resolveDisplayName({ preferred_username: "icarnaghan", sub: UUID })).toBe("icarnaghan");
  });

  it("falls back to name", () => {
    expect(resolveDisplayName({ name: "Ian Carnaghan", sub: UUID })).toBe("Ian Carnaghan");
  });

  it("skips a UUID username in favour of anything readable", () => {
    expect(resolveDisplayName({ "cognito:username": UUID, name: "Ian" })).toBe("Ian");
  });

  it("never returns a bare UUID — this is the bug being fixed", () => {
    // Only UUID identifiers available: show the fallback rather than the UUID.
    expect(resolveDisplayName({ "cognito:username": UUID, sub: UUID })).toBe("Admin");
  });

  it("uses a non-UUID cognito:username when that is all there is", () => {
    expect(resolveDisplayName({ "cognito:username": "icarnaghan" })).toBe("icarnaghan");
  });

  it("ignores blank claims", () => {
    expect(resolveDisplayName({ email: "   ", name: "Ian" })).toBe("Ian");
  });

  it("returns Admin for null or empty claims", () => {
    expect(resolveDisplayName(null)).toBe("Admin");
    expect(resolveDisplayName({})).toBe("Admin");
  });
});

describe("readUserFromIdToken", () => {
  it("keeps the internal username for refresh but exposes a readable displayName", () => {
    const token = makeToken({
      "cognito:username": UUID,
      email: "ian@example.com",
      sub: UUID,
    });
    expect(readUserFromIdToken(token)).toEqual({
      username: UUID,
      email: "ian@example.com",
      displayName: "ian@example.com",
    });
  });

  it("falls back to sub as the username", () => {
    const token = makeToken({ sub: UUID, email: "ian@example.com" });
    expect(readUserFromIdToken(token)?.username).toBe(UUID);
  });

  it("returns null when the token is undecodable", () => {
    expect(readUserFromIdToken("garbage")).toBeNull();
    expect(readUserFromIdToken(null)).toBeNull();
  });

  it("returns null when there is no username or sub", () => {
    expect(readUserFromIdToken(makeToken({ email: "ian@example.com" }))).toBeNull();
  });
});

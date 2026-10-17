/**
 * Helpers for turning a Cognito ID token into a user we can display.
 *
 * The pool uses email as the sign-in alias, so `cognito:username` is a
 * Cognito-generated UUID rather than anything meaningful to a human. The `email`
 * claim (requested via the `email` scope) is what the user actually signs in
 * with, so that's what we show.
 */

export interface IdTokenClaims {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  "cognito:username"?: string;
  [key: string]: unknown;
}

export interface DisplayUser {
  /** Cognito's internal username — used for token refresh, not for display. */
  username: string;
  email?: string;
  /** What to show in the UI. */
  displayName: string;
}

/**
 * Decode a JWT's payload without verifying it.
 *
 * Safe for display purposes only — the token is verified server-side by the API
 * Gateway authorizer. Returns null on anything malformed.
 *
 * JWT payloads are base64**url** encoded (`-` and `_` instead of `+` and `/`,
 * and padding stripped), which `atob` does not accept, so normalize first.
 */
export function decodeJwtPayload(token: string | null | undefined): IdTokenClaims | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as IdTokenClaims;
  } catch {
    return null;
  }
}

/** True when a value looks like a bare UUID (Cognito's generated username). */
export function looksLikeUuid(value: string | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/**
 * Pick the friendliest available label for the signed-in user.
 *
 * Order: email → preferred_username → name → cognito:username → sub. A
 * UUID-looking username is skipped so we never show a raw identifier when
 * something readable exists. Falls back to "Admin".
 */
export function resolveDisplayName(claims: IdTokenClaims | null | undefined): string {
  if (!claims) return "Admin";

  const candidates = [
    claims.email,
    claims.preferred_username,
    claims.name,
    claims["cognito:username"],
    claims.sub,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed || looksLikeUuid(trimmed)) continue;
    return trimmed;
  }

  return "Admin";
}

/**
 * Build the user record from an ID token. Returns null if the token can't be
 * decoded. `username` keeps Cognito's internal value because the refresh flow
 * needs it, even when it's a UUID.
 */
export function readUserFromIdToken(idToken: string | null | undefined): DisplayUser | null {
  const claims = decodeJwtPayload(idToken);
  if (!claims) return null;

  const username = claims["cognito:username"] || claims.sub;
  if (!username) return null;

  return {
    username,
    email: claims.email,
    displayName: resolveDisplayName(claims),
  };
}

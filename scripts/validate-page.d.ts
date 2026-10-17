/**
 * Type surface for the shared landing-page validator (`validate-page.js`).
 *
 * The implementation is JavaScript so the build scripts can import it under plain `node`
 * (no `tsx`). This declaration lets the admin pages Lambda, which is typechecked, import
 * the same module — the one validator shared across the build and the API (landing-page-
 * editor stage 5.1).
 */

/**
 * Validates one landing page (the parsed JSON). Returns a list of human-readable problem
 * strings; an empty array means the page is valid. Returns rather than throws so a caller
 * can report every problem at once.
 */
export function validatePage(page: unknown): string[];

/** Block types the validator accepts. */
export const KNOWN_BLOCK_TYPES: string[];

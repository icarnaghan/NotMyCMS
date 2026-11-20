/**
 * What `scripts/verify-build.js` checks in this theme's built CSS.
 *
 * Plain JavaScript on purpose: the build script runs under Node without the app's
 * TypeScript or Vite aliases, so it cannot import a `.ts` module.
 *
 * `needle` is compared with whitespace removed, because minification strips the space
 * around selector combinators. Asserting against the built output is the stronger claim:
 * it checks what actually ships, and jsdom does not apply stylesheets, so a test cannot.
 */
export const cssAssertions = [
  {
    // Reproduces the padding and margin Cloudscape's Box variant="p" and SpaceBetween gave
    // the markup these blocks replaced. Measured against the original components: without
    // the padding every page sits 8px high, and without the margin stacked paragraphs
    // drift 2px apart each.
    label: "prose spacing for the paragraph box",
    needle: ".landing-prose p{margin-block:0;padding-block:4px}",
    consequence: "without it every landing-page prose block regains the default paragraph margin",
  },
  {
    label: "prose spacing for the stacked paragraph gap",
    needle: ".landing-prose p+p{margin-block-start:",
    consequence: "without it every landing-page prose block regains the default paragraph margin",
  },
];

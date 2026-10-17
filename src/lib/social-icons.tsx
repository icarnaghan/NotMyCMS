/**
 * SVG artwork for social links, keyed by the `id` in `site.config.json`.
 *
 * Separated from the links themselves on purpose: a profile URL identifies *this*
 * deployment and belongs in configuration, while icon geometry is presentation and
 * belongs in code. The same split as `tone` versus `badgeColor` in the page schema.
 *
 * An id with no entry here renders as a text link rather than an icon, which is how
 * Google Scholar has always behaved — it has no icon and the home page skips it.
 */

export interface SocialIconArt {
  /** SVG path geometry, drawn on a 24x24 viewBox. */
  path: string;
  /** True for solid marks, false for stroked outlines. */
  fill?: boolean;
}

export const SOCIAL_ICONS: Record<string, SocialIconArt> = {
  x: {
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
    fill: true,
  },
  stackoverflow: {
    path: "M2.913 16.041v6.848h17.599v-6.848M7.16 18.696h8.925M7.65 13.937l8.675 1.8M9.214 9.124l8.058 3.758M12.086 4.65l6.849 5.66M15.774 1.111l5.313 7.162",
  },
  github: {
    path: "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37.0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44.0 0020 4.77 5.07 5.07.0 0019.91 1S18.73.65 16 2.48a13.38 13.38.0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07.0 005 4.77 5.44 5.44.0 003.5 8.55c0 5.42 3.3 6.61 6.44 7A3.37 3.37.0 009 18.13V22",
  },
  gitlab: {
    path: "M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 00-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 00-.867 0L1.387 9.452.045 13.587a.924.924 0 00.331 1.023L12 23.054l11.624-8.443a.92.92 0 00.331-1.024",
    fill: true,
  },
  linkedin: {
    path: "M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 4a2 2 0 100 4 2 2 0 000-4z",
  },
  youtube: {
    path: "M22.54 6.42a2.78 2.78.0 00-1.94-2C18.88 4 12 4 12 4s-6.88.0-8.6.46a2.78 2.78.0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78.0 003.4 19c1.72.46 8.6.46 8.6.46s6.88.0 8.6-.46a2.78 2.78.0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.33zM9.75 15.02l5.75-3.27-5.75-3.27v6.54z",
  },
};

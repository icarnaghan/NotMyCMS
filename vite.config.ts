// defineConfig is imported from vitest/config (rather than vite) so the `test`
// block below is type-checked.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { siteHtmlPlugin, readSiteConfig } from "./scripts/inject-site-html.ts";
import { resolveTheme } from "./scripts/resolve-theme.js";
import { themeHeadPlugin, themeVitePlugins } from "./scripts/theme-build.ts";

// The theme is chosen at build time. `@theme` points at exactly one theme directory, so
// the other themes are never imported and never bundled.
const siteConfig = readSiteConfig();
const theme = resolveTheme(siteConfig);
const themeDir = fileURLToPath(new URL(`./src/themes/${theme}`, import.meta.url));

function isCloudscapeTheming(id: string): boolean {
  return (
    id.includes("theming-runtime") ||
    id.includes("components/theming") ||
    id.includes("generated/theming")
  );
}

/** A jsdom test project that renders against one specific theme. */
function componentProject(
  name: string,
  themeName: string,
  files: { include: string[]; exclude?: string[] }
) {
  return {
    extends: true as const,
    resolve: {
      alias: { "@theme": fileURLToPath(new URL(`./src/themes/${themeName}`, import.meta.url)) },
    },
    test: {
      name,
      environment: "jsdom" as const,
      setupFiles: ["./src/test/setup.ts"],
      // Routes load their views lazily, so the first render in a file transforms a cold
      // module graph. Under a parallel run that can exceed the 5s default.
      testTimeout: 20000,
      ...files,
    },
  };
}

export default defineConfig({
  // siteHtmlPlugin feeds index.html from site.config.json. It reads the file itself
  // rather than importing src/lib/site-config, deliberately: anything imported here
  // joins Vite's config graph, and pulling the app's module graph into it trips the
  // constraints of Vite's native config loader.
  // The theme's own build tooling (Tailwind, for the Tailwind theme) and its pre-paint head
  // snippet are added only when that theme is selected.
  plugins: [
    react(),
    siteHtmlPlugin(),
    themeHeadPlugin(themeDir, siteConfig.storagePrefix),
    ...(await themeVitePlugins(themeDir)),
  ],
  resolve: {
    alias: {
      "@theme": themeDir,
    },
  },
  test: {
    // Two projects, split by what they need rather than by where they live.
    //
    // Component tests need a DOM, which means a jsdom instance per test file. The pure
    // suites are the large majority and do not, so paying for jsdom across all of them
    // would slow the common case to serve the rarer one.
    //
    // The admin (admin/) and infra Lambdas (infra/lambda/) have their own suites, run
    // from their own directories.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            // The site-config validator, page validator and index.html injector all
            // gate the build, so all three are tested.
            "scripts/**/*.test.js",
            "scripts/**/*.test.ts",
          ],
        },
      },
      // One component project per theme. The `@theme` alias is pinned in each, regardless of
      // the THEME environment variable, so a test never runs against a theme it was not
      // written for. Tests under `src/conformance/` run in every project; a theme's own
      // tests (and the Cloudscape snapshot baseline) run only in that theme's project.
      componentProject("component", "cloudscape", {
        include: ["src/**/*.test.tsx"],
        exclude: ["src/themes/tailwind/**"],
      }),
      componentProject("component-tailwind", "tailwind", {
        include: ["src/conformance/**/*.test.tsx", "src/themes/tailwind/**/*.test.tsx"],
      }),
    ],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // Named chunks, with explicit priorities; higher claims first. Rolldown pulls a
        // grouped module's dependencies into the same group, which decides where React
        // lands. In a Cloudscape build the Cloudscape group claims it, exactly as the
        // earlier manualChunks setup did, so that build is unchanged. In a Tailwind build
        // there is no Cloudscape group, and `vendor` must claim React before the Markdown
        // group does, or the Markdown chunk would load on every page.
        codeSplitting: {
          groups: [
            {
              // The theme's global.css only re-exports Cloudscape's global styles. Keeping
              // it here keeps them ahead of the component styles, as they always were.
              name: "cloudscape",
              test: (id) =>
                (id.includes("@cloudscape-design") ||
                  id.includes("themes/cloudscape/global.css")) &&
                !isCloudscapeTheming(id),
              priority: 40,
            },
            {
              // The theming runtime is large and only needed for the optional text-size
              // setting, so it gets its own lazily loaded chunk.
              name: "cloudscape-theming",
              test: isCloudscapeTheming,
              priority: 30,
            },
            {
              name: "vendor",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]|react-router/,
              priority: 20,
            },
            {
              name: "markdown",
              test: /react-markdown|remark|rehype|unified|mdast|hast|micromark/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});

// defineConfig is imported from vitest/config (rather than vite) so the `test`
// block below is type-checked.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { siteHtmlPlugin } from "./scripts/inject-site-html.ts";

export default defineConfig({
  // siteHtmlPlugin feeds index.html from site.config.json. It reads the file itself
  // rather than importing src/lib/site-config, deliberately: anything imported here
  // joins Vite's config graph, and pulling the app's module graph into it trips the
  // constraints of Vite's native config loader.
  plugins: [react(), siteHtmlPlugin()],
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
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@cloudscape-design")) return "cloudscape";
          if (
            id.includes("react-markdown") ||
            id.includes("remark") ||
            id.includes("rehype") ||
            id.includes("unified") ||
            id.includes("mdast") ||
            id.includes("hast") ||
            id.includes("micromark")
          )
            return "markdown";
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("react-router")
          )
            return "vendor";
        },
      },
    },
  },
});

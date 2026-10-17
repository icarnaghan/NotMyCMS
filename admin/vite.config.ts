import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { siteHtmlPlugin } from "../scripts/inject-site-html.ts";

export default defineConfig({
  // Same index.html injector the public site uses, so the admin title follows
  // site.config.json too. It needs the repository root explicitly: this build runs
  // from admin/, and the config file lives one level up.
  plugins: [react(), siteHtmlPlugin({ root: path.resolve(import.meta.dirname, "..") })],
  base: "/admin/",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  define: {
    global: "globalThis",
    "process.env": {},
  },
  build: {
    outDir: "dist",
  },
});

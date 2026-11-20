# Themes

A theme is the site's visual design: the layout, navigation, every page, and how Markdown and
landing-page blocks look. Two ship with the framework:

| Theme        | Look                                        | Notes                                                                                           |
| ------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `cloudscape` | The AWS Cloudscape component library.       | The default. Sortable posts table, density setting.                                             |
| `tailwind`   | A light, blog-style design on Tailwind CSS. | Readable article typography. A first page loads about a fifth of the bytes. No density setting. |

This guide covers choosing a theme, how the code is divided, and how to write a new one.

**Terminology.** "Theme" always means the visual design. The Light, Dark and System choice is
the **color mode**. Its storage key still ends in `-theme` because the admin shares it and
renaming it would reset every visitor's saved choice.

## Choosing a theme

Themes are chosen when the site is built, not by visitors and not at runtime. Set the
`theme` field in `site.config.json`:

```json
{ "theme": "tailwind" }
```

Leave it out for `cloudscape`. The `THEME` environment variable overrides the file, which is
how you preview a theme without editing config:

```bash
make dev THEME=tailwind            # preview
make build THEME=tailwind          # production build
make verify-build THEME=tailwind   # check the output
```

Only the chosen theme is bundled. A Tailwind build contains no Cloudscape code, and the
reverse. An unknown name stops the build and lists the valid ones. Valid names are the
directories under `src/themes/`.

There is deliberately no admin switch. The theme lives in `site.config.json`, in the source
repository, while the admin only writes content to the Content_Repo. Changing theme means a
rebuild and a deploy.

## How the code is divided

```
src/core/            Headless logic. Shared by every theme. No UI library imports.
src/themes/types.ts  The contract a theme implements.
src/themes/<name>/   One directory per theme: views, styles, settings application.
src/App.tsx          Providers and the route table.
```

The rule for deciding where something belongs: **if it changes what the site does, it is
core; if it changes how the site looks, it is the theme.** Filtering a list, choosing which
posts are related, fetching an article, building the table of contents, the heading ids that
anchors link to, which blocks render and what happens when one fails: all core. Markup,
class names, spacing, how a menu opens: the theme.

A test (`src/core/headless.test.ts`) fails if a file in `src/core` imports a UI library.

### What the core provides

| Area            | Module                                             | What it owns                                                                                                                                           |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Articles        | `core/article.ts`                                  | Fetching and parsing, frontmatter, the table of contents, reading time, image paths, and `headingId`, the one rule that gives a heading its anchor id. |
| Lists           | `core/content-list.ts`                             | Text, category and tag filtering, sorting, paging, and the page and tag held in the URL so Back restores them.                                         |
| Taxonomy        | `core/taxonomy.ts`                                 | Category and tag counts.                                                                                                                               |
| Search          | `core/search.ts`                                   | Loading the index, matching, result links, the result-count message.                                                                                   |
| Related posts   | `core/related-posts.ts`                            | Scoring by shared tags and categories.                                                                                                                 |
| Navigation      | `core/navigation.ts`                               | Navigation order, the guide route, page-view tracking.                                                                                                 |
| Landing pages   | `core/landing-blocks.tsx`, `core/define-blocks.ts` | Skipping unknown block types, containing a block that throws.                                                                                          |
| Settings        | `core/settings-context.tsx`                        | Color mode, density, text size and analytics opt-out: state, storage, and calling the theme.                                                           |
| Page containers | `core/pages/*`                                     | Build each page's view model and render it through the active theme.                                                                                   |

### What a theme provides

The contract is `ThemeContract` in `src/themes/types.ts`. Leaving a part out is a type error,
not a blank page.

| Part                                 | Receives             | Renders                                                                                                                          |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Shell`                              | `ShellView`          | Navigation, search, cookie notice, settings. Wraps every route and renders the page as `children`.                               |
| `PageFrame`                          | `children`           | Per-page chrome, such as the page's `<main>`.                                                                                    |
| `Loading`                            | `{ centered? }`      | The loading indicator.                                                                                                           |
| `pages.Home`                         | `HomeView`           | The home page.                                                                                                                   |
| `pages.Posts`, `pages.KnowledgeBase` | `ContentListView`    | The lists. Posts have sorting, a category filter and preferences; the knowledge base does not, so those fields are absent there. |
| `pages.Categories`, `pages.Tags`     | `TaxonomyView`       | The taxonomy pages.                                                                                                              |
| `pages.Article`                      | `ArticleView`        | An article's layout, with the rendered body, table of contents and related posts.                                                |
| `pages.Landing`                      | `LandingView`        | The frame around a landing page's blocks.                                                                                        |
| `pages.NotFound`                     | `NotFoundView`       | The 404 page.                                                                                                                    |
| `blocks`                             | `{ block }`          | One renderer per landing block type, built with `defineBlocks`.                                                                  |
| `markdown`                           | Element props        | How each Markdown element looks: `h2`, `h3`, `img`, `table`, `th`, `td`, fenced `code`, and optionally `pre`.                    |
| `capabilities`                       | n/a                  | Which color modes, whether density and text size apply.                                                                          |
| `applySettings`                      | `AppearanceSettings` | Applies color mode, density and text size to the document.                                                                       |

A view model is plain data and callbacks. Dates and labels arrive formatted (`dateLong`,
`categoryLabel`), tags arrive with their link, and navigation is a `goTo` function. A theme
never repeats the core's rules.

Where the contract names a link, make it a real link. Tags, categories, posts and
breadcrumbs should be `<a href>` so open-in-new-tab, copy-link and keyboard navigation work.

### Settings and capabilities

`capabilities` declares what the theme supports:

```ts
capabilities: { colorModes: ["light", "dark", "system"], density: false, textSize: true }
```

The core filters stored preferences through it before calling `applySettings`. A visitor's
saved density is **ignored, not erased** under a theme that has none, so it applies again if
the site switches back, and the admin still sees it. Build the settings menu from
`capabilities` and show only what is supported.

## Writing a theme

1. **Create `src/themes/<name>/index.ts`** exporting a `Theme`:

   ```ts
   import type { Theme } from "../types";

   export const theme: Theme = {
     name: "mytheme",
     capabilities: { colorModes: ["light", "dark", "system"], density: false, textSize: true },
     applySettings,
     blocks,
     markdown,
     Shell,
     PageFrame,
     Loading,
     pages: { Home, Posts, KnowledgeBase, Categories, Tags, Article, Landing, NotFound },
   };
   export default theme;
   ```

   The directory name is the theme's name, and no list needs updating. The type checker
   reports every missing part.

2. **Load pages lazily** with `React.lazy`, keeping only the shell, page frame, settings and
   Markdown element components eager. Both shipped themes do this, so each route keeps its own
   chunk and the Markdown parser stays off the startup path. The router's Suspense boundary
   covers loading.

3. **Provide the styles.** `src/main.tsx` imports `@theme/global.css` before the app and
   `@theme/styles.css` after it, so a theme needs both files (either may be nearly empty).

4. **Implement `applySettings`** for the settings you declared. It receives values already
   filtered by `capabilities`.

5. **Render the Markdown body with the heading ids you are given.** `markdown.h2` and
   `markdown.h3` receive an `id`; it must end up on the element, or the table of contents
   stops linking to anything.

6. **Add tests** (see below), then run the checks.

Start from the Tailwind theme if you want a small, dependency-light example, and from
Cloudscape if you want to see a component library adapted to the contract.

### Optional build hooks

A theme may add these files. None is required.

| File                  | Purpose                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `head.html`           | Injected at the end of `<head>`. For work that must happen before first paint, such as setting a dark-mode class. `{{STORAGE_PREFIX}}` becomes the config's `storagePrefix`, so the snippet reads the same storage keys the app does.      |
| `vite-plugins.js`     | Default export returning extra Vite plugins (the Tailwind theme adds Tailwind's). Loaded only when the theme is selected. Plain JavaScript, because it is imported outside Vite's TypeScript handling.                                     |
| `build-assertions.js` | Exports `cssAssertions`, a list of `{ label, needle, consequence }`. `verify-build` checks each `needle` appears in the built CSS, and fails with `consequence` if not. For styles a test cannot see because jsdom applies no stylesheets. |

### Things that go wrong

- **Importing a UI library from shared code.** Anything outside `src/themes/<name>/` that
  imports a theme's library drags it into every theme's build. The shell's loading
  indicator is a theme part for exactly this reason.
- **Nested `<main>`.** Some routes wrap one framed page in another. A frame that always
  renders `<main>` produces two landmarks. The Tailwind `PageFrame` renders its children
  when already inside one.
- **Chunk grouping.** `vite.config.ts` assigns modules to named chunks with explicit
  priorities. A grouped module's dependencies join its group, so a new group can capture React
  and put a large chunk on every page. After adding a group, build and check what
  `dist/index.html` preloads.
- **Class scanning.** Tailwind's `source(none)` plus `@source "./"` limits scanning to the
  theme directory, so class-like strings elsewhere generate no CSS.

## Tests

| Location             | Runs against | Covers                                                                                                                                          |
| -------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/conformance/`   | Every theme  | Behavior a visitor relies on, by role and text only: routing, lists, paging, filters, tags, articles, code, search, and all six landing blocks. |
| `src/themes/<name>/` | That theme   | Its own controls and styling details.                                                                                                           |
| `src/core/`          | No theme     | The core's logic.                                                                                                                               |

`vite.config.ts` defines one component test project per theme. Each pins the `@theme` alias,
so a test never runs against a theme it was not written for, whatever `THEME` is set to.

```bash
npm test                                          # everything
npx vitest --run src/conformance                  # the shared suite, in every theme
npx vitest --run --project component-tailwind     # one theme
```

To add a theme's project, add a `componentProject(...)` line for it, with
`src/conformance/**` and `src/themes/<name>/**` as its files, and add
`src/themes/<name>/**` to the default project's `exclude`.

Conformance tests assert behavior, not markup, so they must accept legitimate differences:
an action that is a button in one theme and a link in another, a current-page breadcrumb that
is plain text, a link name with extra screen-reader text. Use the helpers in
`src/conformance/helpers.tsx`, and match names by prefix where a theme may add text.

## Checklist for a new theme

- [ ] `npx tsc -b` passes, so every part of the contract is implemented.
- [ ] `npx vitest --run src/conformance` passes against it.
- [ ] `THEME=<name> make build` and `THEME=<name> make verify-build` pass.
- [ ] A `<name>` build contains no code from another theme's library.
- [ ] `make fingerprint-check` still matches for the default theme, if you changed shared code.
- [ ] The first page loads only what it needs. Check what `dist/index.html` preloads.
- [ ] Lighthouse accessibility passes on the home page, a list, an article and a landing page,
      served as `/path/`, not `/path/index.html`.
- [ ] Text and focus indicators meet contrast in every color mode you support.
- [ ] The settings menu offers only what `capabilities` declares.
- [ ] An advisory CI job builds and audits it, modeled on `build-tailwind` in `.gitlab-ci.yml`.

## Adding a landing-page block type

Block types are shared by every theme, so adding one touches both the schema and each theme.

1. Add the type to the page schema (`src/lib/page-schema.d.ts`) and the validator
   (`scripts/validate-page.js`), with tests.
2. TypeScript now reports every theme that lacks a renderer, because `defineBlocks` requires
   one per type.
3. Write the renderer in each theme. Map the block's semantic values (`tone`, `columns`,
   `muted`) to the theme's own styling; stored pages never contain a theme's vocabulary.
4. Add conformance tests to `src/conformance/blocks.test.tsx`.
5. Add the block to the admin's page editor if authors should be able to create it.

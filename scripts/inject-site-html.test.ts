import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  injectSiteHtml,
  readSiteConfig,
  siteHtmlValues,
  type SiteHtmlValues,
} from "./inject-site-html.ts";

const values: SiteHtmlValues = {
  siteTitle: "example.test",
  siteUrl: "https://www.example.test",
  siteName: "Example Site",
  locale: "en-us",
  analyticsId: "G-TEST123",
  analyticsOptOutKey: "example-analytics-opt-out",
};

/** A template with every placeholder and the analytics region, as index.html has. */
const template = `<!doctype html>
<html lang="{{SITE_LOCALE}}">
  <head>
    <title>{{SITE_TITLE}}</title>
    <!-- analytics:start -->
    <script>
      localStorage.getItem("{{ANALYTICS_OPT_OUT_KEY}}");
      window["ga-disable-{{ANALYTICS_ID}}"] = true;
    </script>
    <!-- analytics:end -->
    <link rel="canonical" href="{{SITE_URL}}" />
    <link rel="alternate" title="{{SITE_NAME}}" href="{{SITE_URL}}/rss.xml" />
  </head>
</html>`;

describe("injectSiteHtml", () => {
  it("drops the build markers from the output", () => {
    // True whether or not analytics is configured: they are instructions to the
    // build, not something a visitor should receive.
    expect(injectSiteHtml(template, values)).not.toContain("analytics:");
    expect(injectSiteHtml(template, { ...values, analyticsId: undefined })).not.toContain(
      "analytics:"
    );
  });

  it("replaces every placeholder", () => {
    const html = injectSiteHtml(template, values);

    expect(html).toContain('<html lang="en-us">');
    expect(html).toContain("<title>example.test</title>");
    expect(html).toContain('href="https://www.example.test"');
    expect(html).toContain('href="https://www.example.test/rss.xml"');
    expect(html).toContain('title="Example Site"');
    expect(html).toContain('localStorage.getItem("example-analytics-opt-out")');
    expect(html).toContain('window["ga-disable-G-TEST123"]');
  });

  it("leaves no placeholder behind", () => {
    expect(injectSiteHtml(template, values)).not.toMatch(/\{\{|\}\}/);
  });

  it("rejects a placeholder it has no value for", () => {
    // A typo would otherwise ship literal `{{SITE_TTILE}}` into the document head,
    // where nothing downstream would notice.
    expect(() => injectSiteHtml("<title>{{SITE_TTILE}}</title>", values)).toThrow(
      /unknown placeholder \{\{SITE_TTILE\}\}/
    );
  });

  describe("when no analytics is configured", () => {
    const withoutAnalytics = { ...values, analyticsId: undefined };

    it("removes the analytics region entirely", () => {
      const html = injectSiteHtml(template, withoutAnalytics);

      expect(html).not.toContain("ga-disable");
      expect(html).not.toContain("localStorage");
      expect(html).not.toContain("analytics:start");
      expect(html).not.toContain("analytics:end");
    });

    it("still injects the rest of the head", () => {
      const html = injectSiteHtml(template, withoutAnalytics);

      expect(html).toContain("<title>example.test</title>");
      expect(html).toContain('href="https://www.example.test"');
      expect(html).not.toMatch(/\{\{|\}\}/);
    });

    it("does not treat a now-unused ANALYTICS_ID placeholder as valid", () => {
      // If the region markers were ever removed from index.html but the token left
      // behind, failing is better than emitting `ga-disable-undefined`.
      expect(() => injectSiteHtml("<p>{{ANALYTICS_ID}}</p>", withoutAnalytics)).toThrow(
        /unknown placeholder/
      );
    });
  });

  describe("escaping", () => {
    it("escapes HTML-significant characters in injected values", () => {
      const html = injectSiteHtml('<title>{{SITE_TITLE}}</title><link title="{{SITE_NAME}}" />', {
        ...values,
        siteTitle: "A & B",
        siteName: 'He said "hi" <b>',
      });

      expect(html).toContain("<title>A &amp; B</title>");
      expect(html).toContain('title="He said &quot;hi&quot; &lt;b&gt;"');
    });

    it("refuses a measurement ID that could break out of the inline script", () => {
      expect(() =>
        injectSiteHtml(template, { ...values, analyticsId: 'G-1"];alert(1);//' })
      ).toThrow(/analyticsId is injected into an inline script/);
    });

    it("refuses an opt-out key that could break out of the inline script", () => {
      expect(() =>
        injectSiteHtml(template, { ...values, analyticsOptOutKey: 'x");alert(1);//' })
      ).toThrow(/analyticsOptOutKey is injected into an inline script/);
    });
  });
});

describe("the real index.html", () => {
  const real = readFileSync("index.html", "utf-8");

  it("has every placeholder the injector knows about", () => {
    // Catches the reverse drift from the "unknown placeholder" test: a value added
    // here but never referenced in the template is dead configuration.
    const used = new Set([...real.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]));

    expect([...used].sort()).toEqual([
      "ANALYTICS_ID",
      "ANALYTICS_OPT_OUT_KEY",
      "SITE_LOCALE",
      "SITE_NAME",
      "SITE_TITLE",
      "SITE_URL",
    ]);
  });

  it("renders fully with the real config", () => {
    const html = injectSiteHtml(real, siteHtmlValues(readSiteConfig()));

    expect(html).not.toMatch(/\{\{|\}\}/);
    expect(html).toContain("<title>carnaghan.com</title>");
    expect(html).toContain('<link rel="canonical" href="https://www.carnaghan.com" />');
  });

  it("renders fully with analytics removed", () => {
    // The no-analytics path is the one no build here exercises, so assert it against
    // the real template rather than only the fixture.
    const html = injectSiteHtml(real, {
      ...siteHtmlValues(readSiteConfig()),
      analyticsId: undefined,
    });

    expect(html).not.toMatch(/\{\{|\}\}/);
    expect(html).not.toContain("gtag");
    expect(html).not.toContain("googletagmanager");
    expect(html).not.toContain("localStorage");
    // The head must stay intact around the hole left by the removed region.
    expect(html).toContain("<title>carnaghan.com</title>");
    expect(html).toContain('<link rel="canonical" href="https://www.carnaghan.com" />');
    expect(html).not.toMatch(/\n[ \t]*\n[ \t]*\n/);
  });
});

describe("siteHtmlValues", () => {
  it("derives the opt-out key from storagePrefix", () => {
    const derived = siteHtmlValues({
      ...readSiteConfig(),
      storagePrefix: "demo",
    });

    expect(derived.analyticsOptOutKey).toBe("demo-analytics-opt-out");
  });

  it("produces script-safe values from the real config", () => {
    // Guards against a config change that would make the build throw rather than
    // being caught only when someone runs a build.
    expect(() => injectSiteHtml(template, siteHtmlValues(readSiteConfig()))).not.toThrow();
  });
});

/**
 * Validates `site.config.json`.
 *
 * Exported as a pure function so the build, the tests, and (later) the framework's
 * scaffolding can all share one implementation. A `.d.ts` describes the file but cannot
 * check it, so this is the actual guarantee.
 *
 * Returns a list of problem strings — empty means valid. Deliberately returns rather
 * than throws, so a caller can report every problem at once instead of one per run.
 */

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

export function validateSiteConfig(config) {
  const problems = [];
  const require = (path, value, extra) => {
    if (!isNonEmptyString(value)) {
      problems.push(`${path} is required and must be a non-empty string`);
      return;
    }
    if (extra) extra(value);
  };

  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return ["site.config.json must be a JSON object"];
  }

  // Prefixes end up in AWS resource names and browser storage keys, so constrain them
  // rather than discovering the hard way that a space or capital broke a bucket name.
  require("resourcePrefix", config.resourcePrefix, (v) => {
    if (!SLUG.test(v)) {
      problems.push("resourcePrefix must be lowercase alphanumerics and hyphens");
    }
  });
  require("storagePrefix", config.storagePrefix, (v) => {
    if (!SLUG.test(v)) {
      problems.push("storagePrefix must be lowercase alphanumerics and hyphens");
    }
  });

  require("region", config.region);
  require("apexDomain", config.apexDomain);
  require("domain", config.domain);
  require("hostedZone", config.hostedZone);
  // Route53 zone ids are uppercase alphanumerics. Checked because a wrong one deploys
  // DNS records into the wrong zone — or no zone — rather than failing loudly.
  require("hostedZoneId", config.hostedZoneId, (v) => {
    if (!/^Z[A-Z0-9]+$/.test(v)) {
      problems.push("hostedZoneId must look like a Route53 zone id, e.g. Z0123456789ABC");
    }
  });

  require("siteUrl", config.siteUrl, (v) => {
    if (!/^https:\/\//.test(v)) {
      problems.push("siteUrl must start with https://");
    }
    if (v.endsWith("/")) {
      // Canonical URLs and sitemap entries concatenate paths onto this, so a trailing
      // slash produces `https://host//posts`.
      problems.push("siteUrl must not end with a trailing slash");
    }
    if (isNonEmptyString(config.domain) && !v.includes(config.domain)) {
      problems.push(`siteUrl (${v}) does not contain domain (${config.domain})`);
    }
  });

  require("siteName", config.siteName);
  require("siteTitle", config.siteTitle);
  // Optional: defaults to the framework name (NotMyCMS) in the admin when unset.
  if (config.adminTitle !== undefined && !isNonEmptyString(config.adminTitle)) {
    problems.push("adminTitle must be a non-empty string when present");
  }
  require("tagline", config.tagline);
  require("siteDescription", config.siteDescription);
  require("locale", config.locale);

  if (!config.author || typeof config.author !== "object") {
    problems.push("author is required");
  } else {
    require("author.name", config.author.name);
    require("author.email", config.author.email, (v) => {
      if (!v.includes("@")) problems.push("author.email must contain @");
    });
    // Optional, but if present it must be a site-relative path — an absolute URL would
    // hotlink a portrait from elsewhere, and `javascript:` has no business here.
    if (config.author.avatar !== undefined) {
      if (!isNonEmptyString(config.author.avatar) || !config.author.avatar.startsWith("/")) {
        problems.push("author.avatar must be a site-relative path starting with /");
      }
    }
  }

  // Optional: omitting it builds the site with no analytics snippet at all, which is a
  // supported configuration rather than an error.
  if (config.analytics !== undefined) {
    if (typeof config.analytics !== "object" || config.analytics === null) {
      problems.push("analytics must be an object when present, or omitted entirely");
    } else {
      if (config.analytics.provider !== "ga4") {
        problems.push('analytics.provider must be "ga4"');
      }
      require("analytics.measurementId", config.analytics.measurementId, (v) => {
        if (!/^G-[A-Z0-9]+$/.test(v)) {
          problems.push("analytics.measurementId must look like G-XXXXXXXXXX");
        }
      });
    }
  }

  // Optional. Base URL for the admin's Help links (the repository's rendered docs). The
  // admin appends `/<path>` to it, so no trailing slash. Omitting it hides nothing
  // critical — the Help page simply has no outbound links.
  if (config.docsBaseUrl !== undefined) {
    if (!isNonEmptyString(config.docsBaseUrl) || !/^https:\/\//.test(config.docsBaseUrl)) {
      problems.push("docsBaseUrl must be an https URL when present");
    } else if (config.docsBaseUrl.endsWith("/")) {
      problems.push("docsBaseUrl must not end with a trailing slash");
    }
  }

  if (!config.git || typeof config.git !== "object") {
    problems.push("git is required");
  } else {
    if (config.git.provider !== "gitlab" && config.git.provider !== "github") {
      problems.push('git.provider must be "gitlab" or "github"');
    }
    require("git.apiUrl", config.git.apiUrl);
    // Named for the Content_Repo specifically, not the repository this file lives in.
    // The admin Lambdas commit content and nothing else, so pointing them at the source
    // repository is the one mistake here that would write content to the wrong place.
    require("git.contentProjectId", config.git.contentProjectId);
    require("git.branch", config.git.branch);
    if (config.git.projectId !== undefined) {
      problems.push(
        "git.projectId was renamed to git.contentProjectId — see the Content_Repo migration"
      );
    }
  }

  if (!Array.isArray(config.social)) {
    problems.push("social must be an array (use [] for none)");
  } else {
    const seen = new Set();
    config.social.forEach((link, i) => {
      const at = `social[${i}]`;
      if (!link || typeof link !== "object") {
        problems.push(`${at} must be an object`);
        return;
      }
      require(`${at}.id`, link.id, (v) => {
        if (seen.has(v)) problems.push(`${at}.id duplicates an earlier entry: ${v}`);
        seen.add(v);
      });
      require(`${at}.label`, link.label);
      require(`${at}.href`, link.href, (v) => {
        if (!/^https?:\/\//.test(v) && !v.startsWith("mailto:")) {
          problems.push(`${at}.href must be http(s) or mailto`);
        }
      });
    });
  }

  return problems;
}
